import { describe, expect, it } from "vitest";
import { type Shop, newShop } from "@/model";
import { activityReport, CHINA_DEFAULTS, chinaPlan, purchaseControl, supplierProfitEstimate } from "./workshopStats";

const now = new Date("2026-11-22T12:00:00");
const shop = (): Shop => ({
  ...newShop("Atelier", "reparation"),
  products: [
    { id: "bf6", name: "Écran Tecno BF6", unit: "pièce", stock: 0, min: 0, price: 0, cost: 3700 },
    { id: "kg5k", name: "Écran Tecno KG5K", unit: "pièce", stock: 0, min: 0, price: 0, cost: 3700 },
    { id: "chg", name: "Chargeur", unit: "pièce", stock: 3, min: 0, price: 3000, cost: 1500 },
  ],
  repairs: [
    { id: "r1", at: "2026-11-18T10:00:00", number: "R-010", clientName: "A", phone: "", device: "BF6", problem: "Écran cassé · Écran Tecno BF6", price: 8000, paid: 8000, status: "rendu", repairedAt: "2026-11-18T11:00:00", parts: [{ productId: "bf6", label: "Écran Tecno BF6", qty: 1, cost: 3700 }] },
    { id: "r2", at: "2026-11-19T10:00:00", number: "R-011", clientName: "B", phone: "", device: "KG5K", problem: "Écran cassé · Écran Tecno KG5K", price: 9000, paid: 9000, status: "depot", parts: [] },
    { id: "r3", at: "2026-11-12T10:00:00", number: "R-004", clientName: "C", phone: "", device: "BF6", problem: "Écran cassé", price: 8000, paid: 8000, status: "rendu", repairedAt: "2026-11-12T11:00:00", parts: [{ label: "Écran Tecno BF6", qty: 1, cost: 3700 }] },
  ] as never,
  sales: [
    { id: "s1", at: "2026-11-17T12:00:00", label: "Service · Décodage", amount: 6000 },
    { id: "s2", at: "2026-11-19T12:00:00", label: "Service · Déblocage compte (FRP)", amount: 2000 },
    { id: "s3", at: "2026-11-19T12:30:00", label: "Plaquette BG6", amount: 2500, cost: 600 },
    { id: "s4", at: "2026-11-20T12:30:00", label: "Chargeur", amount: 3000, cost: 1500, productId: "chg", qty: 1 },
    { id: "s5", at: "2026-11-18T10:00:00", label: "Réparation R-010 · BF6 (avance)", amount: 8000 },
  ] as never,
});

describe("mon activité (atelier)", () => {
  it("compte les écrans posés et prévus, les plaquettes, les services, par semaine avec la semaine d'avant", () => {
    const r = activityReport(shop(), "semaine", now);
    const screens = r.parts.find((k) => k.kind === "Écran")!;
    expect(screens).toMatchObject({ count: 2, prev: 1, cost: 7400 });
    expect(screens.models[0]).toMatchObject({ count: 1 });
    expect(r.parts.find((k) => k.kind === "Plaquette")).toMatchObject({ count: 1, gain: 1900 });
    expect(r.services.map((s) => s.name)).toEqual(["Décodage", "Déblocage compte"]);
    expect(r.items.map((i) => i.name)).toEqual(["Chargeur"]);
    expect(r.repairs.count).toBe(2);
    expect(r.notes.join(" ")).toContain("écrans changés");
    expect(r.notes.join(" ")).toContain("mieux payé : Décodage");
  });

  it("objectif Chine : pièces par mois, budget, seuil de rentabilité", () => {
    const p = chinaPlan(shop(), CHINA_DEFAULTS, now);
    expect(p.partsPerMonth).toBeGreaterThan(0);
    expect(p.tripFixed).toBe(1_100_000);
    expect(p.budget).toBe(p.order + p.freight + p.tripFixed);
    expect(p.breakEvenPerMonth).toBeGreaterThan(p.partsPerMonth);
    expect(p.verdict).toBe("pas-encore");
    expect(p.confidence).toBe("faible");
    expect(p.topModels[0].name).toContain("Écran Tecno");
  });

  it("objectif Chine avec l'historique du fournisseur : la base devient ses vrais achats, et la commande en ligne est calculée", () => {
    const s = { ...shop(), suppliers: [{ id: "f", name: "Bathie", phone: "", purchases: Array.from({ length: 12 }, (_, k) => ({ month: `2025-${String(k + 1).padStart(2, "0")}`, total: 560_000, invoices: 5 })) }] };
    const p = chinaPlan(s, { ...CHINA_DEFAULTS, months: 12 }, now);
    expect(p).toMatchObject({ base: "fournisseur", supplierPerMonth: 560_000, onlineBreakEvenPct: 23, tripBreakEvenPct: 30 });
    expect(p.onlineSaving).toBeGreaterThan(0);
    expect(p.confidence).toBe("bonne");
  });
});

describe("fournisseur : bénéfice probable et contrôle", () => {
  const withSupplier = (): Shop => ({
    ...shop(),
    suppliers: [{ id: "f", name: "Bathie", phone: "", purchases: [{ month: "2026-10", total: 20000, invoices: 1 }, { month: "2026-11", total: 30000, invoices: 2 }], kinds: [{ label: "Écrans", qty: 10, total: 40000 }, { label: "Autres pièces", qty: 10, total: 10000 }] }],
  } as Shop);

  it("minimum assuré et plus probable : écrans par gamme avec tes gains réels, iPhone à part, argent revenu", () => {
    const sh = withSupplier();
    sh.suppliers![0]!.tiers = [{ label: "Écrans à moins de 5 000 F", qty: 8, total: 32000, max: 5000 }, { label: "Écrans d'iPhone", qty: 2, total: 8000, iphone: true }];
    const e = supplierProfitEstimate(sh)!;
    expect(e.months).toBe(2);
    // 2 écrans BF6 posés dans Jokko : 8 000 − 3 700 = 4 300 F chacun (moins de 3 exemples → minimum = 75 %).
    expect(e.lines.find((l) => l.label.startsWith("Écrans à moins"))).toMatchObject({ qty: 8, likely: 30960, sure: 21930, perPiece: [3225, 4300] });
    // Pas encore d'iPhone dans Jokko : gain de départ 12 000 F (minimum 9 000 F).
    expect(e.lines.find((l) => l.label === "Écrans d'iPhone")).toMatchObject({ likely: 21600, sure: 15300 });
    expect(e.lines.find((l) => l.label === "Autres pièces")).toMatchObject({ likely: 9000, sure: 4250 });
    expect(e).toMatchObject({ profit: 61560, sure: 41480, recovered: 45000, waiting: 5000 });
  });

  it("contrôle : acheté depuis le 1er jour dans Jokko − pièces sorties − stock = à retrouver", () => {
    const c = purchaseControl(withSupplier())!;
    expect(c.months).toEqual([{ month: "2026-11", bought: 30000, used: 11700, gap: 18300 }]);
    expect(c.stockValue).toBe(0);
  });

  it("rien sans historique du fournisseur", () => {
    expect(supplierProfitEstimate(shop())).toBeNull();
    expect(purchaseControl(shop())).toBeNull();
  });
});
