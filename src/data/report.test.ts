import { describe, expect, it } from "vitest";
import { applyDraft } from "../assistant/apply";
import type { DraftAction } from "../assistant/client";
import type { Shop } from "../model";
import { debtList, overdueDebts, reminderMessage, whatsappLink } from "./debts";
import { buildReport, inventoryDue, margins, periodOf, recordInventory } from "./report";

const blank: DraftAction = { type: "sale", productId: null, productName: null, quantity: null, amount: null, clientId: null, clientName: null, label: null };

function shop(): Shop {
  return {
    id: "shop-1",
    name: "Boutique Awa",
    city: "Pikine",
    activity: "Alimentation",
    openingCash: 0,
    products: [
      { id: "p-huile", name: "Huile", unit: "bidon", stock: 20, min: 5, price: 7500, cost: 6500 },
      { id: "p-lait", name: "Lait en poudre", unit: "sac", stock: 2, min: 1, price: 40000, cost: 30000, retail: { unit: "sachet", perUnit: 50, price: 900 } },
      { id: "p-sel", name: "Sel", unit: "paquet", stock: 10, min: 2, price: 200 },
    ],
    clients: [
      { id: "c-moussa", name: "Moussa Ndiaye", phone: "221770000111", debt: 0 },
      { id: "c-fatou", name: "Fatou Sall", phone: "775556677", debt: 0 },
    ],
    sales: [],
    expenses: [],
    invoices: [],
    reminders: [],
    shortcuts: [],
  };
}

describe("prix de gros, détail et bénéfice", () => {
  it("2 bidons d'huile : stock −2, bénéfice 2 × (7 500 − 6 500) = 2 000 F", () => {
    const s = applyDraft(shop(), { ...blank, productId: "p-huile", quantity: 2 })!.shop;
    expect(s.products[0].stock).toBe(18);
    expect(s.sales[0]).toMatchObject({ amount: 15000, cost: 13000, qty: 2, unit: "bidon" });
  });

  it("vente au détail : 10 sachets de lait = 9 000 F, stock −0,2 sac, coût 6 000 F", () => {
    const s = applyDraft(shop(), { ...blank, productId: "p-lait", quantity: 10, unit: "sachets" })!.shop;
    expect(s.sales[0]).toMatchObject({ amount: 9000, cost: 6000, retail: true, unit: "sachet", qty: 10 });
    expect(s.products[1].stock).toBe(1.8);
  });

  it("le mot « détail » suffit aussi", () => {
    const s = applyDraft(shop(), { ...blank, productId: "p-lait", quantity: 5, unit: "au détail" })!.shop;
    expect(s.sales[0]).toMatchObject({ amount: 4500, retail: true });
  });

  it("article sans prix d'achat : vente notée, bénéfice inconnu", () => {
    const s = applyDraft(shop(), { ...blank, productId: "p-sel", quantity: 3 })!.shop;
    expect(s.sales[0].cost).toBeUndefined();
  });

  it("retrait de stock (gâté) = perte au prix d'achat, sans toucher la caisse", () => {
    const applied = applyDraft(shop(), { ...blank, type: "stock_adjust", productId: "p-huile", quantity: -1, label: "bidon percé" })!;
    expect(applied.shop.expenses[0]).toMatchObject({ amount: 6500, kind: "perte", label: "bidon percé" });
  });

  it("marges par article", () => {
    expect(margins(shop().products[1])).toEqual({ bulk: 10000, retail: 15000 });
    expect(margins(shop().products[2])).toEqual({ bulk: null, retail: null });
  });
});

describe("bilan", () => {
  it("vendu, chiffre d'affaires, bénéfice, dépenses, pertes, net", () => {
    let s = shop();
    s = applyDraft(s, { ...blank, productId: "p-huile", quantity: 14 })!.shop;
    s = applyDraft(s, { ...blank, productId: "p-lait", quantity: 20, unit: "sachet" })!.shop;
    s = applyDraft(s, { ...blank, productId: "p-sel", quantity: 5 })!.shop;
    s = applyDraft(s, { ...blank, type: "expense", amount: 2000, label: "Transport" })!.shop;
    s = applyDraft(s, { ...blank, type: "stock_adjust", productId: "p-huile", quantity: -1 })!.shop;
    const r = buildReport(s, periodOf("jour"));
    expect(r.revenue).toBe(14 * 7500 + 20 * 900 + 5 * 200);
    expect(r.grossProfit).toBe(14 * 1000 + (18000 - 12000));
    expect(r.unknownRevenue).toBe(1000);
    expect(r.expenses).toBe(2000);
    expect(r.losses).toBe(6500);
    expect(r.netProfit).toBe(r.grossProfit - 2000 - 6500);
    const huile = r.byProduct.find((l) => l.name === "Huile")!;
    expect(huile).toMatchObject({ bulkQty: 14, profit: 14000 });
    const lait = r.byProduct.find((l) => l.name === "Lait en poudre")!;
    expect(lait).toMatchObject({ retailQty: 20, retailUnit: "sachet", bulkQty: 0 });
    expect(r.byProduct.find((l) => l.name === "Sel")!.profit).toBeNull();
  });

  it("inventaire : ce qui manque devient une perte, le stock devient le compté", () => {
    const s = shop();
    expect(inventoryDue(s)).toBe(true);
    let n = 0;
    const result = recordInventory(s, { "p-huile": 18, "p-sel": 12 }, () => `e-${++n}`);
    expect(result.losses).toBe(13000);
    expect(result.shop.products.find((p) => p.id === "p-huile")!.stock).toBe(18);
    expect(result.shop.products.find((p) => p.id === "p-sel")!.stock).toBe(12);
    expect(inventoryDue(result.shop)).toBe(false);
  });
});

describe("dettes", () => {
  it("une dette reçoit une échéance à 30 jours, ou celle dite", () => {
    let s = applyDraft(shop(), { ...blank, type: "debt_add", clientId: "c-moussa", amount: 10000 })!.shop;
    const due = Date.parse(s.clients[0].dueAt!);
    expect(Math.round((due - Date.now()) / 86_400_000)).toBe(30);
    s = applyDraft(s, { ...blank, type: "debt_add", clientId: "c-fatou", amount: 5000, dueDays: 7 })!.shop;
    expect(Math.round((Date.parse(s.clients[1].dueAt!) - Date.now()) / 86_400_000)).toBe(7);
    s = applyDraft(s, { ...blank, type: "debt_payment", clientId: "c-fatou", amount: 5000 })!.shop;
    expect(s.clients[1].dueAt).toBeUndefined();
  });

  it("retards signalés, message et lien WhatsApp", () => {
    const s = shop();
    s.clients[0] = { ...s.clients[0], debt: 20000, dueAt: new Date(Date.now() - 3 * 86_400_000).toISOString() };
    s.clients[1] = { ...s.clients[1], debt: 5000, dueAt: new Date(Date.now() + 5 * 86_400_000).toISOString() };
    expect(debtList(s).map((d) => d.client.name)).toEqual(["Moussa Ndiaye", "Fatou Sall"]);
    expect(overdueDebts(s).map((d) => d.client.name)).toEqual(["Moussa Ndiaye"]);
    const wo = reminderMessage(s.clients[0], s, "wo");
    expect(wo).toContain("ñeenti junni");
    expect(reminderMessage(s.clients[0], s, "fr")).toMatch(/20\s000 F/);
    expect(whatsappLink("775556677", "Bonjour")).toBe("https://wa.me/221775556677?text=Bonjour");
    expect(whatsappLink("", "x")).toBeNull();
  });
});

describe("corrections de la relecture", () => {
  it("montant dit sans quantité : la quantité se déduit du prix (1 800 F = 2 sachets, pas 1 sac)", () => {
    const s = applyDraft(shop(), { ...blank, productId: "p-lait", amount: 1800, unit: "sachet" })!.shop;
    expect(s.sales[0]).toMatchObject({ qty: 2, retail: true, cost: 1200 });
    expect(s.products[1].stock).toBe(1.96);
  });

  it("« kilo » = « kg » ; unité inconnue → rien n'est vendu au prix de gros", () => {
    const base = shop();
    base.products.push({ id: "p-riz", name: "Riz", unit: "sac", stock: 5, min: 1, price: 18000, cost: 16000, retail: { unit: "kg", perUnit: 50, price: 400 } });
    const s = applyDraft(base, { ...blank, productId: "p-riz", quantity: 2, unit: "kilos" })!.shop;
    expect(s.sales[0]).toMatchObject({ amount: 800, retail: true });
    expect(applyDraft(base, { ...blank, productId: "p-huile", quantity: 2, unit: "sachet" })).toBeNull();
  });
});

describe("factures", () => {
  it("facture à la voix avec article et quantité : lignes, total, numéro de l'année", () => {
    const s = applyDraft(shop(), { ...blank, type: "invoice", clientId: "c-moussa", productId: "p-huile", quantity: 2 })!.shop;
    const inv = s.invoices[0];
    expect(inv).toMatchObject({ amount: 15000, status: "brouillon", lines: [{ label: "Huile", qty: 2, unit: "bidon", unitPrice: 7500 }] });
    expect(inv.number).toBe(`JK-${new Date().getFullYear()}-0001`);
    const s2 = applyDraft(s, { ...blank, type: "invoice", clientId: "c-fatou", amount: 3000 })!.shop;
    expect(s2.invoices[0].number).toBe(`JK-${new Date().getFullYear()}-0002`);
    expect(s2.products[0].stock).toBe(20);
  });
});
