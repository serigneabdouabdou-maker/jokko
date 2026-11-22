import { describe, expect, it } from "vitest";
import { type Shop, newShop } from "@/model";
import { applyPastedInvoice, errorsMessage, readPastedInvoice } from "./pasteInvoice";

const NOW = new Date("2026-11-22T12:00:00Z");
const shop = (): Shop => ({
  ...newShop("Atelier", "reparation"),
  products: [
    { id: "bf6", name: "Écran Tecno BF6", unit: "pièce", stock: 1, min: 0, price: 10000, cost: 3700 },
    { id: "a12", name: "Écran Samsung A12", unit: "pièce", stock: 0, min: 0, price: 10000, cost: 4500 },
  ],
  suppliers: [{
    id: "f", name: "Bathie", phone: "771234567",
    items: [
      { key: "Écran:bf6", name: "Écran BF6", kind: "Écran", qty: 60, total: 222000, first: "2025-01-01", last: "2026-11-10", prices: [["2026-10-01", 3700]] },
      { key: "Écran:a12", name: "Écran A12", kind: "Écran", qty: 70, total: 315000, first: "2025-01-01", last: "2026-11-10", prices: [["2026-11-10", 4500]] },
    ],
    received: [["2026-11-12", "Écran:bf6", 4, 4000]],
  }],
});

const BILL = [
  "4 LCD bf6 4000=16.000",
  "4 LCD bf6 4000=17.000",
  "6 LCD a12 4300=25.800",
  "10 plaquette be8 600=6000",
  "Total 🟰 64,800fr",
].join("\n");

describe("facture collée", () => {
  it("vérifie les calculs, compare les prix, sépare ce qui est déjà reçu", () => {
    const r = readPastedInvoice(BILL, shop(), shop().suppliers![0], NOW)!;
    expect(r.date).toBe("2026-11-22");
    expect(r.total).toBe(64800);
    expect(r.sum).toBe(64800);
    // « 4 × 4 000 = 16 000 » mais compté 17 000 : 1 000 F de trop.
    expect(r.anomalies.some((a) => a.kind === "calcul" && a.serious && a.text.replace(/\s/g, " ").includes("1 000 F de trop"))).toBe(true);
    const bf6 = r.lines.filter((l) => l.key === "Écran:bf6");
    expect(bf6.map((l) => [l.change, l.doneQty, l.newQty])).toEqual([["hausse", 4, 0], ["hausse", 0, 4]]);
    expect(r.lines.find((l) => l.key === "Écran:a12")).toMatchObject({ change: "baisse", before: { unit: 4500, from: "fournisseur" }, newQty: 6, productId: "a12" });
    expect(r.lines.find((l) => l.label.includes("BE8"))).toMatchObject({ change: "nouvelle", newQty: 10 });
    // BF6 +300 × 8, A12 −200 × 6
    expect(r.priceEffect).toBe(300 * 8 - 200 * 6);
    expect(errorsMessage(r).replace(/\s/g, " ")).toContain("1 000 F de trop");
  });

  it("sans « Total » écrit, Jokko additionne ; un message copié avec l'heure est lu", () => {
    const r = readPastedInvoice("[09:40, 21/11/2026] Bathie: 3 LCD A35e 5000=15,000\n2 batterie a12 1500=3000", shop(), shop().suppliers![0], NOW)!;
    expect(r).toMatchObject({ date: "2026-11-21", total: 18000, written: false });
  });

  it("enregistre : seulement le nouveau au stock, noté reçu, jamais deux fois", () => {
    const s = shop();
    const r = readPastedInvoice(BILL, s, s.suppliers![0], NOW)!;
    let n = 0;
    const out = applyPastedInvoice(s, "f", r, new Set(r.lines.map((l) => l.key)), { updateCost: true }, (p) => `${p}${++n}`);
    expect(out.added).toBe(20);
    expect(out.amount).toBe(4 * 4000 + 6 * 4300 + 10 * 600);
    const bf6 = out.shop.products.find((p) => p.id === "bf6")!;
    expect([bf6.stock, bf6.cost]).toEqual([5, 4000]);
    expect(out.shop.products.find((p) => p.name.includes("BE8"))).toMatchObject({ stock: 10, cost: 600, price: 0 });
    expect(out.shop.suppliers![0]!.purchases).toEqual([{ month: "2026-11", total: out.amount, invoices: 1 }]);
    // La même facture collée une 2e fois : tout est « déjà reçu ».
    const again = readPastedInvoice(BILL, out.shop, out.shop.suppliers![0], NOW)!;
    expect(again.lines.every((l) => l.newQty === 0)).toBe(true);
    expect(again.newAmount).toBe(0);
  });

  it("barrière : la même facture recollée (même le lendemain) est reconnue, jamais payée deux fois", () => {
    const s = shop();
    const r = readPastedInvoice(BILL, s, s.suppliers![0], NOW)!;
    expect(r.already).toBeUndefined();
    let n = 0;
    const out = applyPastedInvoice(s, "f", r, new Set(r.lines.map((l) => l.key)), { updateCost: true, paid: "wave", now: NOW }, (p) => `${p}${++n}`);
    expect(out.paidNow).toBe(true);
    expect(out.shop.expenses.filter((e) => e.kind === "achat")).toHaveLength(1);
    // Renvoyée le lendemain avec l'en-tête WhatsApp : même lignes, même total → reconnue.
    const next = new Date("2026-11-23T09:00:00Z");
    const again = readPastedInvoice(`[09:00, 23/11/2026] Bathie: ${BILL}`, out.shop, out.shop.suppliers![0], next)!;
    expect(again.already).toEqual({ at: NOW.toISOString(), paid: "wave" });
    const twice = applyPastedInvoice(out.shop, "f", again, new Set(again.lines.map((l) => l.key)), { updateCost: true, paid: "tiroir", now: next }, (p) => `${p}${++n}`);
    expect(twice.paidNow).toBe(false);
    expect(twice.added).toBe(0);
    expect(twice.shop.expenses.filter((e) => e.kind === "achat")).toHaveLength(1);
    expect(twice.shop.products.find((p) => p.id === "bf6")!.stock).toBe(5);
  });
});
