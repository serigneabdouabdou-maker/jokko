import { describe, expect, it } from "vitest";
import type { Shop } from "../model";
import { buildReport, periodOf } from "../data/report";
import { applyDraft, times } from "./apply";
import type { DraftAction } from "./client";
import { type Entry, LiveDesk } from "./liveDesk";
import { extractSpokenAmount, francsToWolof, saysUnitPrice, settleAmounts, spokenAmountToFrancs, wolofNumber } from "./wolofNumbers";

const blank: DraftAction = { type: "sale", productId: null, productName: null, quantity: null, amount: null, clientId: null, clientName: null, label: null };

function shop(): Shop {
  return {
    id: "shop-1",
    name: "Boutique Awa",
    city: "Pikine",
    activity: "Alimentation",
    openingCash: 0,
    products: [
      { id: "p-sucre", name: "Sucre", unit: "sac", stock: 3, min: 1, price: 23000, cost: 19000, retail: { unit: "kilo", perUnit: 50, price: 500 } },
      { id: "p-huile", name: "Huile", unit: "bidon", stock: 10, min: 2, price: 7500, cost: 6500 },
    ],
    clients: [{ id: "c-moussa", name: "Moussa Ndiaye", phone: "221770000111", debt: 0 }],
    sales: [],
    expenses: [],
    invoices: [],
    reminders: [],
    shortcuts: [],
  };
}

function desk(start = shop()) {
  let current = start;
  const saved: Entry[] = [];
  const d = new LiveDesk({ getShop: () => current, lang: () => "fr", write: (n) => (current = n), onSaved: (e) => saved.push(e), onUndone: () => undefined });
  return { d, saved, shop: () => current };
}

describe("grands montants", () => {
  it("millions et milliards, en chiffres ou en mots", () => {
    expect(spokenAmountToFrancs("2 millions")?.francs).toBe(2_000_000);
    expect(spokenAmountToFrancs("1,5 milliard")?.francs).toBe(1_500_000_000);
    expect(spokenAmountToFrancs("2 millions 500 mille")?.francs).toBe(2_500_000);
    expect(spokenAmountToFrancs("2 500 000 F")?.francs).toBe(2_500_000);
    expect(spokenAmountToFrancs("deux mille cinq cents")?.francs).toBe(2_500);
    expect(spokenAmountToFrancs("quatre-vingt-dix mille francs")?.francs).toBe(90_000);
    expect(spokenAmountToFrancs("trois cent mille")?.francs).toBe(300_000);
    expect(spokenAmountToFrancs("20.000")?.francs).toBe(20_000);
    expect(spokenAmountToFrancs("20k")?.francs).toBe(20_000);
  });

  it("wolof : milyoŋ et miliyaar en FRANCS (le reste en dërëm)", () => {
    expect(spokenAmountToFrancs("benn milyoŋ")?.francs).toBe(1_000_000);
    expect(spokenAmountToFrancs("ñaari milyoŋ ak téeméeri junni")?.francs).toBe(2_500_000);
    expect(spokenAmountToFrancs("benn miliyaar")?.francs).toBe(1_000_000_000);
    expect(francsToWolof(1_000_000)).toBe("benn milyoŋ");
    expect(francsToWolof(2_500_000)).toBe("ñaari milyoŋ ak téeméeri junni");
    expect(francsToWolof(12_045_250)).toBe("fukk ak ñaari milyoŋ ak juróom-ñeenti junni ak juróom-fukk");
    expect(spokenAmountToFrancs("ñaari million")?.francs).toBe(2_000_000);
    expect(spokenAmountToFrancs("ñaari mil")?.francs).toBe(2_000);
    expect(wolofNumber(2_500_000)).toBe("ñaari milyoŋ ak juróomi téeméeri junni");
    expect(wolofNumber(1_000_000_000)).toBe("benn miliyaar");
  });

  it("le montant dans une phrase, même très grand", () => {
    expect(extractSpokenAmount("j'ai vendu le terrain 25 millions")?.francs).toBe(25_000_000);
    expect(extractSpokenAmount("2 sacs de sucre à 20 000")?.francs).toBe(20_000);
  });

  it("multiplier sans erreur jusqu'aux milliards", () => {
    expect(times(2, 20_000)).toBe(40_000);
    expect(times(1500, 1_750_000)).toBe(2_625_000_000);
    expect(times(0.2, 23_000)).toBe(4_600);
  });
});

describe("prix d'un article ou total ?", () => {
  it("reconnaît le prix de l'unité", () => {
    expect(saysUnitPrice("j'ai acheté 2 sacs de sucre, chaque sac coûte 20 000 francs")).toBe(true);
    expect(saysUnitPrice("2 sacs de sucre à 20 000")).toBe(true);
    expect(saysUnitPrice("3 bidons à 7 500 chacun")).toBe(true);
    expect(saysUnitPrice("jënd naa ñetti sac ceeb, bu nekk ñeenti junni")).toBe(true);
    expect(saysUnitPrice("3 sacs pour 60 000")).toBe(false);
    expect(saysUnitPrice("2 bidons, 15 000 en tout")).toBe(false);
  });

  it("le modèle a pris 20 000 pour le total : le code corrige en 2 × 20 000", () => {
    const action = { amount: 20_000, quantity: 2, unitPrice: null as number | null };
    settleAmounts(action, { total: "20 000" }, "j'ai acheté 2 sacs de sucre, chaque sac coûte 20 000 francs");
    expect(action).toMatchObject({ amount: null, unitPrice: 20_000 });
  });

  it("un total dit reste un total, même si le modèle a divisé", () => {
    const action = { amount: null as number | null, quantity: 3, unitPrice: 20_000 as number | null };
    settleAmounts(action, {}, "j'ai acheté 3 sacs de riz pour 60 000");
    expect(action).toMatchObject({ amount: 60_000, unitPrice: null });
  });
});

describe("achat de marchandise", () => {
  it("2 sacs de sucre à 20 000 chacun : stock + 2, caisse − 40 000, prix d'achat 20 000", () => {
    const applied = applyDraft(shop(), { ...blank, type: "purchase", productId: "p-sucre", quantity: 2, unit: "sacs", unitPrice: 20_000 })!;
    expect(applied.amount).toBe(40_000);
    expect(applied.shop.products[0]).toMatchObject({ stock: 5, cost: 20_000 });
    expect(applied.shop.expenses[0]).toMatchObject({ amount: 40_000, kind: "achat" });
    expect(applied.summary).toMatch(/2 × 20\s000 F = 40\s000 F/);
  });

  it("un achat ne baisse pas le bénéfice, mais sort de la caisse", () => {
    let s = applyDraft(shop(), { ...blank, type: "purchase", productId: "p-sucre", quantity: 2, unitPrice: 20_000 })!.shop;
    s = applyDraft(s, { ...blank, productId: "p-sucre", quantity: 1 })!.shop;
    const r = buildReport(s, periodOf("jour"));
    expect(r.purchases).toBe(40_000);
    expect(r.expenses).toBe(0);
    expect(r.netProfit).toBe(23_000 - 20_000);
  });

  it("total dit : le prix d'un sac est déduit (3 sacs pour 60 000 = 20 000 le sac)", () => {
    const applied = applyDraft(shop(), { ...blank, type: "purchase", productId: "p-sucre", quantity: 3, amount: 60_000 })!;
    expect(applied.shop.products[0].cost).toBe(20_000);
    expect(applied.amount).toBe(60_000);
  });

  it("article inconnu : il est créé avec son prix d'achat", () => {
    const applied = applyDraft(shop(), { ...blank, type: "purchase", productName: "ciment", quantity: 10, unit: "sacs", unitPrice: 4_500 })!;
    expect(applied.shop.products.at(-1)).toMatchObject({ name: "Ciment", unit: "sac", stock: 10, cost: 4_500 });
    expect(applied.amount).toBe(45_000);
  });

  it("à la voix, avec annulation : tout revient comme avant", () => {
    const { d, shop: current } = desk();
    const result = d.handle({
      name: "enregistrer",
      args: { type: "purchase", productName: "sucre", quantity: 2, unite: "sac", montantDit: "20 000", heard: "j'ai acheté 2 sacs de sucre, chaque sac coûte 20 000 francs" },
    });
    expect(result).toMatchObject({ statut: "enregistre", montant_francs: 40_000 });
    expect(current().products[0]).toMatchObject({ stock: 5, cost: 20_000 });
    d.handle({ name: "annuler_derniere", args: {} });
    expect(current().products[0]).toMatchObject({ stock: 3, cost: 19_000 });
    expect(current().expenses).toHaveLength(0);
  });
});

describe("ventes, dépenses, dettes et factures au prix de l'unité", () => {
  it("vente : 3 bidons à 8 000 chacun = 24 000", () => {
    const { d, shop: current } = desk();
    d.handle({ name: "enregistrer", args: { type: "sale", productName: "huile", quantity: 3, prixUnitaireDit: "8 000", heard: "j'ai vendu 3 bidons d'huile à 8 000 chacun" } });
    expect(current().sales[0]).toMatchObject({ amount: 24_000, qty: 3, cost: 19_500 });
  });

  it("dépense : 4 sacs de ciment à 5 000 = 20 000", () => {
    expect(applyDraft(shop(), { ...blank, type: "expense", label: "ciment", quantity: 4, unitPrice: 5_000 })!.amount).toBe(20_000);
  });

  it("dette : 2 bidons à 7 500 à crédit = 15 000", () => {
    const s = applyDraft(shop(), { ...blank, type: "debt_add", clientId: "c-moussa", quantity: 2, unitPrice: 7_500 })!.shop;
    expect(s.clients[0].debt).toBe(15_000);
  });

  it("facture : 1 200 sacs à 19 500 = 23 400 000", () => {
    const s = applyDraft(shop(), { ...blank, type: "invoice", clientId: "c-moussa", productId: "p-sucre", quantity: 1200, unitPrice: 19_500 })!.shop;
    expect(s.invoices[0]).toMatchObject({ amount: 23_400_000, lines: [{ qty: 1200, unitPrice: 19_500 }] });
  });
});
