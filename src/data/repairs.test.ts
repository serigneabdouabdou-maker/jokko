import { describe, expect, it } from "vitest";
import { type Shop, newShop } from "@/model";
import { addRepair, deliverRepair, findRepair, markRepaired, nextRepairNumber, payRepair, remaining, repairBreakdown, repairProfit, repairsOf, workshopMonth } from "./repairs";
import { buildReport, periodOf } from "./report";

function atelier(): Shop {
  return {
    ...newShop("Atelier Fallou", "Réparation de téléphones"),
    products: [
      { id: "ecran", name: "Écran iPhone 11", unit: "pièce", stock: 3, min: 1, price: 30000, cost: 15000 },
      { id: "conn", name: "Connecteur de charge", unit: "pièce", stock: 10, min: 2, price: 3000, cost: 1000 },
    ],
  };
}

describe("carnet de réparations", () => {
  it("dépôt avec avance : ticket R-001, avance en caisse, client créé avec son numéro", () => {
    const { shop, repair } = addRepair(atelier(), { clientName: "Awa Diop", phone: "77 123 45 67", device: "iPhone 11", problem: "écran cassé et connecteur", price: 25000, advance: 5000 });
    expect(repair.number).toBe("R-001");
    expect(repair.status).toBe("depot");
    expect(remaining(repair)).toBe(20000);
    expect(shop.sales[0]).toMatchObject({ amount: 5000, label: "Réparation R-001 · iPhone 11 (avance)" });
    expect(shop.clients.find((c) => c.name === "Awa Diop")?.phone).toBe("771234567");
    expect(nextRepairNumber(shop)).toBe("R-002");
  });

  it("réparé : l'écran et le connecteur sortent du stock ; bénéfice = 25 000 − 16 000 = 9 000", () => {
    const start = addRepair(atelier(), { clientName: "Awa Diop", device: "iPhone 11", problem: "écran + connecteur", price: 25000, advance: 5000 });
    const fixed = markRepaired(start.shop, start.repair.id, [{ productId: "ecran" }, { productId: "conn" }])!;
    const r = repairsOf(fixed)[0];
    expect(r.status).toBe("repare");
    expect(fixed.products.find((p) => p.id === "ecran")?.stock).toBe(2);
    expect(fixed.products.find((p) => p.id === "conn")?.stock).toBe(9);
    expect(repairProfit(r)).toBe(9000);
  });

  it("rendu : le client paie le reste ; la vente porte le prix d'achat des pièces", () => {
    const start = addRepair(atelier(), { clientName: "Awa Diop", device: "iPhone 11", problem: "écran", price: 25000, advance: 5000 });
    const fixed = markRepaired(start.shop, start.repair.id, [{ productId: "ecran" }])!;
    const done = deliverRepair(fixed, start.repair.id, 20000, false)!;
    const r = repairsOf(done)[0];
    expect(r.status).toBe("rendu");
    expect(remaining(r)).toBe(0);
    expect(done.sales[0]).toMatchObject({ amount: 20000, cost: 15000 });
    const total = done.sales.filter((s) => s.label.startsWith("Réparation R-001")).reduce((a, s) => a + s.amount - (s.cost ?? 0), 0);
    expect(total).toBe(10000);
  });

  it("rendu sans tout payer : le reste va en dette du client", () => {
    const start = addRepair(atelier(), { clientName: "Moussa", device: "Tecno Spark 10", problem: "batterie", price: 12000 });
    const done = deliverRepair(start.shop, start.repair.id, 2000, true)!;
    expect(done.clients.find((c) => c.name === "Moussa")?.debt).toBe(10000);
  });

  it("acompte pendant que l'appareil attend au dépôt", () => {
    const start = addRepair(atelier(), { clientName: "Fatou", device: "Samsung A12", problem: "écran", price: 18000 });
    const paid = payRepair(start.shop, start.repair.id, 8000)!;
    expect(remaining(repairsOf(paid)[0])).toBe(10000);
  });

  it("retrouve une réparation par son numéro ou le nom du client", () => {
    let shop = atelier();
    shop = addRepair(shop, { clientName: "Awa Diop", device: "iPhone 11", problem: "écran" }).shop;
    shop = addRepair(shop, { clientName: "Moussa Fall", device: "Tecno", problem: "batterie" }).shop;
    expect(findRepair(shop, "R-002")?.clientName).toBe("Moussa Fall");
    expect(findRepair(shop, "Awa")?.device).toBe("iPhone 11");
  });

  it("écran acheté exprès 5 000, réparation 15 000 : la caisse baisse de 5 000, il gagne 10 000 de main-d'œuvre", () => {
    const start = addRepair(atelier(), { clientName: "Modou", device: "Tecno Spark 10", problem: "écran cassé", price: 15000, advance: 5000 });
    const fixed = markRepaired(start.shop, start.repair.id, [{ label: "Écran Tecno Spark 10", cost: 5000, fromCash: true }])!;
    const r = repairsOf(fixed)[0];
    expect(repairBreakdown(r)).toEqual({ price: 15000, parts: 5000, labor: 10000 });
    // L'achat de la pièce sort de la caisse, mais n'est pas une dépense du bénéfice.
    expect(fixed.expenses[0]).toMatchObject({ amount: 5000, kind: "achat", label: "Pièce pour R-001 (Tecno Spark 10) : Écran Tecno Spark 10" });
    const done = deliverRepair(fixed, start.repair.id, 10000, false)!;
    const month = workshopMonth(done);
    expect(month).toMatchObject({ done: 1, revenue: 15000, parts: 5000, labor: 10000, open: 0 });
    // Bénéfices du mois : 15 000 encaissés − 5 000 de pièce = 10 000 gagnés.
    const report = buildReport(done, periodOf("mois"));
    expect(report.revenue).toBe(15000);
    expect(report.grossProfit).toBe(10000);
    expect(report.netProfit).toBe(10000);
    expect(report.purchases).toBe(5000);
  });

  it("pièce achetée avec son propre argent : rien ne sort de la caisse", () => {
    const start = addRepair(atelier(), { clientName: "Modou", device: "Itel A70", problem: "batterie", price: 8000 });
    const fixed = markRepaired(start.shop, start.repair.id, [{ label: "Batterie Itel", cost: 3000 }])!;
    expect(fixed.expenses).toHaveLength(0);
    expect(repairBreakdown(repairsOf(fixed)[0]).labor).toBe(5000);
  });
});

describe("rendu : jamais deux fois le même argent (16/11/2026, R-005)", () => {
  it("réparation déjà payée en avance : le rendu n'encaisse rien de plus", () => {
    const { shop, repair } = addRepair(atelier(), { clientName: "Oumy Tall", device: "Ki5k", problem: "écran cassé", price: 10000, advance: 10000 });
    const after = deliverRepair(shop, repair.id, 10000, true)!;
    const r = repairsOf(after).find((x) => x.id === repair.id)!;
    expect(r.paid).toBe(10000);
    expect(r.price).toBe(10000);
    expect(after.sales.reduce((a, s) => a + s.amount, 0)).toBe(10000);
  });

  it("le prix ne monte que si le patron le demande", () => {
    const { shop, repair } = addRepair(atelier(), { clientName: "Awa", device: "Itel", problem: "écran", price: 10000, advance: 5000 });
    const capped = repairsOf(deliverRepair(shop, repair.id, 8000, true)!).find((x) => x.id === repair.id)!;
    expect(capped.paid).toBe(10000);
    const raised = repairsOf(deliverRepair(shop, repair.id, 8000, true, true)!).find((x) => x.id === repair.id)!;
    expect([raised.paid, raised.price]).toEqual([13000, 13000]);
  });
});

describe("pièce prévue au dépôt (16/11/2026, R-005 / R-006)", () => {
  it("« R-005 réparé » à la voix sans dire la pièce : la pièce écrite au dépôt est posée, son prix d'achat compte", async () => {
    const { LiveDesk } = await import("@/assistant/liveDesk");
    let s: Shop = { ...atelier(), products: [{ id: "p-ki5k", name: "Écran Tecno KI5K", unit: "pièce", stock: 0, min: 0, price: 0, cost: 3700 }] };
    const { shop, repair } = addRepair(s, { clientName: "Oumy", device: "Ki5k", problem: "Écran cassé · Écran Tecno KI5K", price: 10000, advance: 10000 });
    s = shop;
    const d = new LiveDesk({ getShop: () => s, lang: () => "fr", write: (n) => { s = n; }, onSaved: () => {}, onUndone: () => {} });
    d.handle({ name: "reparation", args: { action: "reparee", ticket: repair.number, heard: "R-001 réparé" } });
    const r = repairsOf(s).find((x) => x.id === repair.id)!;
    expect(r.parts.map((p) => [p.label, p.cost])).toEqual([["Écran Tecno KI5K", 3700]]);
    expect(repairProfit(r)).toBe(6300);
  });
});

describe("rendu payé par Wave (16/11/2026)", () => {
  it("le paiement du rendu garde Wave : la caisse (tiroir) ne bouge pas", async () => {
    const { expectedCash } = await import("@/model");
    const { shop, repair } = addRepair({ ...atelier(), openingCash: 0, sales: [] }, { clientName: "Awa", device: "Itel", problem: "écran", price: 10000, advance: 4000, advancePayment: "especes" });
    const after = deliverRepair(shop, repair.id, 6000, true, false, "wave")!;
    expect(after.sales.map((s) => [s.amount, s.payment])).toEqual([[6000, "wave"], [4000, "especes"]]);
    expect(expectedCash(after)).toBe(4000);
  });
});

describe("ticket de réparation (17/11/2026)", () => {
  it("bon de dépôt puis ticket final : pièces, paiements numérotés avec leur moyen, reste, garantie ; jamais le prix d'achat", async () => {
    const { repairReceiptText } = await import("./tickets");
    const { setWarranty } = await import("./repairs");
    const base: Shop = { ...atelier(), name: "Boutique Mbene", products: [{ id: "p1", name: "Écran Tecno KI5K", unit: "pièce", stock: 0, min: 0, price: 0, cost: 3700 }] };
    const { shop, repair } = addRepair(base, { clientName: "Oumy Tall", phone: "771234567", device: "Ki5k", problem: "Écran cassé", price: 10000, advance: 4000, advancePayment: "especes" });
    const bon = repairReceiptText(shop, repairsOf(shop)[0]!, 58);
    expect(bon).toContain("BON DE DEPOT");
    expect(bon).toContain(repair.number);
    expect(bon).toMatch(/Reste a payer\s+6 000 F/);
    let s = markRepaired(shop, repair.id, [{ productId: "p1" }])!;
    s = setWarranty(deliverRepair(s, repair.id, 6000, true, false, "wave")!, repair.id, 30);
    const r = repairsOf(s).find((x) => x.id === repair.id)!;
    const t = repairReceiptText(s, r, 58);
    expect(t).toContain("TICKET DE REPARATION");
    expect(t).toContain("Ecran Tecno KI5K");
    expect(t).toMatch(/rendu\s+6 000 F/);
    expect(t).toContain("Wave - ticket 0002");
    expect(t).toMatch(/Garantie\s+30 jours/);
    expect(t).not.toContain("3 700");
    expect(s.sales.filter((x) => x.amount > 0).map((x) => x.ticket)).toEqual([2, 1]);
    for (const l of t.split("\n")) expect(l.length).toBeLessThanOrEqual(32);
  });
});

describe("détail du bénéfice (17/11/2026)", () => {
  it("article : acheté en gros, vendu en moyenne, bénéfice ; réparation : pièce et main-d'œuvre", async () => {
    const { profitDetails, periodOf, buildReport } = await import("./report");
    const now = new Date().toISOString();
    let s: Shop = { ...atelier(), sales: [
      { id: "s1", at: now, label: "Écran BF6", amount: 10000, productId: "p-bf6", qty: 1, cost: 3700, payment: "especes" } as never,
      { id: "s2", at: now, label: "Écran BF6", amount: 12000, productId: "p-bf6", qty: 1, cost: 3700, payment: "especes" } as never,
      { id: "s3", at: now, label: "Service · Décodage", amount: 5000, payment: "especes" } as never,
    ], products: [{ id: "p-bf6", name: "Écran Tecno BF6", unit: "pièce", stock: 0, min: 0, price: 10000, cost: 3700 }] };
    const { shop, repair } = addRepair(s, { clientName: "Oumy", device: "Ki5k", problem: "écran", price: 10000, advance: 10000 });
    s = deliverRepair(markRepaired(shop, repair.id, [{ label: "Écran KI5K", cost: 3700 }])!, repair.id, 0, true)!;
    const rows = profitDetails(s, periodOf("jour"));
    const art = rows.find((r) => r.kind === "article")!;
    expect(art).toMatchObject({ qty: 2, avgPrice: 11000, unitCost: 3700, profit: 14600 });
    const job = rows.find((r) => r.kind === "travail")!;
    expect(job).toMatchObject({ ref: repair.number, revenue: 10000, partsCost: 3700, labor: 6300 });
    expect(rows.find((r) => r.kind === "service")).toMatchObject({ profit: 5000 });
    const total = rows.reduce((a, r) => a + ((r.kind === "travail" ? r.labor : r.profit) ?? 0), 0);
    expect(total).toBe(buildReport(s, periodOf("jour")).grossProfit);
  });

  it("Moto G54 de Fallou : payé 15 000 en avance, écran 6 000 posé au rendu → main-d'œuvre 9 000", async () => {
    const { profitDetails, periodOf } = await import("./report");
    const now = new Date().toISOString();
    const s: Shop = { ...atelier(), sales: [
      { id: "a", at: now, label: "Réparation R-008 · Moto g54 (avance)", amount: 15000, payment: "especes" } as never,
      { id: "b", at: now, label: "Réparation R-008 · Moto g54 (rendu)", amount: 0, cost: 6000, payment: "especes" } as never,
      { id: "c", at: now, label: "Réparation R-007 · Huawei p smart 2021 (avance)", amount: 10000, payment: "especes" } as never,
    ] };
    const rows = profitDetails(s, periodOf("jour"));
    expect(rows.find((r) => r.kind === "travail" && r.ref === "R-008")).toMatchObject({ revenue: 15000, partsCost: 6000, labor: 9000 });
    expect(rows.find((r) => r.kind === "travail" && r.ref === "R-007")).toMatchObject({ revenue: 10000, partsCost: 0, labor: 10000 });
  });

  it("pièce prévue au dépôt et tout payé d'avance : le prix de l'écran compte tout de suite, puis suit la vraie pièce (R-011, 19/11)", async () => {
    const { profitDetails, periodOf, buildReport } = await import("./report");
    let s: Shop = { ...atelier(), products: [
      { id: "kg5k", name: "Écran Tecno KG5K", unit: "pièce", stock: 1, min: 0, price: 0, cost: 3500 },
      { id: "kg5k-b", name: "Écran Tecno KG5K bis", unit: "pièce", stock: 1, min: 0, price: 0, cost: 4000 },
    ] };
    const { shop, repair } = addRepair(s, { clientName: "Awa", device: "Kg5k", problem: "Écran cassé · Écran Tecno KG5K", price: 9000, advance: 9000 });
    s = shop;
    expect(buildReport(s, periodOf("jour")).grossProfit).toBe(5500);
    const row = profitDetails(s, periodOf("jour")).find((r) => r.kind === "travail")!;
    expect(row).toMatchObject({ partsCost: 3500, labor: 5500 });
    expect(row.kind === "travail" && row.parts[0].label).toContain("prévue au dépôt");
    // Réparé avec une autre pièce (4 000) : le bénéfice suit tout de suite
    s = markRepaired(s, repair.id, [{ productId: "kg5k-b" }])!;
    expect(buildReport(s, periodOf("jour")).grossProfit).toBe(5000);
    // Rendu (déjà tout payé) : pas de double comptage
    s = deliverRepair(s, repair.id, 0, false)!;
    expect(buildReport(s, periodOf("jour")).grossProfit).toBe(5000);
  });
});
