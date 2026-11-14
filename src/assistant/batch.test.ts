import { describe, expect, it } from "vitest";
import { seedShop, type Shop } from "../model";
import { applyDraft } from "./apply";
import { batchTotals, describeAction, lineAmounts, looksLikeBatch, markDuplicates, settleItems, withLineFacts } from "./batch";
import type { DraftAction } from "./client";

const action = (a: Partial<DraftAction>): DraftAction => ({ type: "sale", productId: null, productName: null, quantity: null, amount: null, clientId: null, clientName: null, label: null, ...a });

describe("plusieurs opérations dans un texte", () => {
  it("reconnaît une liste et pas une phrase simple", () => {
    expect(looksLikeBatch("2 sacs de riz à 20 000")).toBe(false);
    expect(looksLikeBatch("Réparation ZTE 9 000\nConfiguration imprimante 10 000\nTransport 1 500")).toBe(true);
    expect(looksLikeBatch("x".repeat(500))).toBe(true);
  });
  it("décrit une opération en clair", () => {
    expect(describeAction(action({ label: "Configuration imprimante", amount: 10000, clientName: "Moussa" }))).toBe("Vente · Configuration imprimante · 10 000 F · Moussa");
    expect(describeAction(action({ type: "expense", label: "Transport" }))).toBe("Dépense · Transport · montant ?");
  });
  it("déjà enregistré aujourd'hui (même montant, même mot) : décoché ; sans montant : décoché", () => {
    const today = "2026-11-14";
    const shop = {
      sales: [{ id: "s1", at: `${today}T10:00:00`, label: "Réparation R-002 · zte a35e (rendu)", amount: 9000 }],
      expenses: [],
    } as unknown as Shop;
    const items = markDuplicates(shop, [
      { line: "Réparation ZTE A35 : 9 000", action: action({ label: "Réparation ZTE A35", amount: 9000 }) },
      { line: "Configuration imprimante 10 000", action: action({ label: "Configuration imprimante", amount: 10000 }) },
      { line: "Coque", action: action({ label: "Coque" }) },
    ], today);
    expect(items.map((i) => i.keep)).toEqual([false, true, false]);
    expect(items[0]!.duplicate).toContain("R-002");
  });
});

describe("enregistrement d'une liste", async () => {
  const { forRecord } = await import("./batch");
  it("un service n'est jamais retrouvé comme article du stock par son nom", () => {
    const shop = { services: [] } as unknown as Shop;
    const r = forRecord(action({ productName: "Réparation écran ZTE A35", amount: 9000 }), shop, () => false);
    expect(r.productName).toBeNull();
    expect(r.label).toBe("Réparation écran ZTE A35");
  });
  it("un service du catalogue garde son nom (calcul des pages, m²…)", () => {
    const shop = { services: [{ id: "x", name: "Photocopie noir A4", price: 25 }] } as unknown as Shop;
    expect(forRecord(action({ productName: "photocopie noir", amount: 1250 }), shop, () => true).productName).toBe("photocopie noir");
  });
});

describe("liste de Fallou du 14/11 : vente, achat, bénéfice sur chaque ligne", () => {
  const text = `1. Configuration réseau Realme : 1 000 F
2. Plaquette KD7 : vente 1 500 F, achat 300 F, bénéfice 1 200 F.
3. Plaquette Pop 8 : vente 3 000 F, achat 600 F, bénéfice 2 400 F.
4. Écran iPhone 11 Pro Max : vente 20 000 F, achat 8 000 F, bénéfice 12 000 F.
5. Chargeur : vente 3 000 F, achat 1 500 F, bénéfice 1 500 F.
6. Décodage : 5 000 F.
7. Réglage : 1 500 F.
8. LCD BG6 : vente 10 000 F, achat 4 000 F, bénéfice 6 000 F.
9. Configuration iPhone : 4 000 F.
10. LCD Camon 17 CG6 : vente 10 000 F, achat 4 000 F, bénéfice 6 000 F.
11. LCD Spark 7 : vente 10 000 F, achat 4 000 F, bénéfice 6 000 F.`;
  const blank = { productId: null, productName: null, quantity: null, unitPrice: null, clientId: null, clientName: null, debtMode: null };
  // Gemini se trompe exprès sur deux montants (bénéfice pris au lieu de la vente) : le code relit la ligne.
  const ops = text.split("\n").map((line, i) => {
    const amounts = [...line.matchAll(/(\d{1,3}(?: \d{3})+|\d+) F/g)].map((m) => Number(m[1]!.replace(/ /g, "")));
    const label = line.replace(/^\d+\.\s*/, "").split(" :")[0]!;
    return { line, action: { ...blank, type: "sale" as const, label, productName: label, amount: i === 1 || i === 7 ? amounts[2] ?? amounts[0]! : amounts[0]! } };
  });

  it("montant = vente, prix d'achat gardé, services = main-d'œuvre ; totaux 69 000 / 22 400 / 46 600", () => {
    const items = settleItems(ops).map((i) => ({ ...i, keep: true }));
    expect(items[1]!.action.amount).toBe(1500);
    expect(items[1]!.cost).toBe(300);
    expect(items[7]!.action.amount).toBe(10000);
    expect(items.filter((i) => i.service).map((i) => i.action.label)).toEqual(["Configuration réseau Realme", "Décodage", "Réglage", "Configuration iPhone"]);
    expect(items[4]!.service).toBeUndefined();
    expect(batchTotals(items)).toEqual({ sales: 69000, cost: 22400, profit: 46600, known: 11, unknown: 0 });
  });

  it("enregistré : la vente garde le prix d'achat écrit ; le service est compté comme main-d'œuvre", () => {
    const items = settleItems(ops);
    const sale = withLineFacts(items[1]!.action, items[1]!);
    expect(sale).toMatchObject({ cost: 300, amount: 1500 });
    const service = withLineFacts(items[5]!.action, items[5]!);
    expect(service).toMatchObject({ label: "Service · Décodage", cost: 0, productName: null });
    const shop = seedShop();
    const applied = applyDraft(shop, sale)!;
    expect(applied.shop.sales[0]).toMatchObject({ amount: 1500, cost: 300 });
  });

  it("« vendu 2 riz à 17 500 » : le 2 n'est jamais un montant", () => {
    expect(lineAmounts("Vendu 2 riz 25 kg à 17 500")).toEqual({ sale: undefined, cost: undefined });
    expect(lineAmounts("Chargeur : vente 3 000 F, achat 1 500 F, bénéfice 1 500 F.")).toEqual({ sale: 3000, cost: 1500 });
    expect(lineAmounts("Écran X : prix de vente 15.000, prix d'achat 5.000")).toEqual({ sale: 15000, cost: 5000 });
  });
});
