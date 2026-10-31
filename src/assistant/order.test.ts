import { describe, expect, it } from "vitest";
import { type Shop, expectedCash } from "../model";
import { applyOrder, groupLines, looksLikeOrder, orderFromGuess, orderMissing, orderTotal, parseOrder, purchaseTotal } from "./order";

function shop(): Shop {
  return {
    id: "s", name: "Boutique", city: "", activity: "", openingCash: 0,
    products: [
      { id: "riz", name: "Riz brisé", unit: "sac", stock: 10, min: 1, price: 18000, cost: 16000, retail: { unit: "kilo", perUnit: 50, price: 400 } },
      { id: "boisson", name: "Boisson", unit: "caisse", stock: 5, min: 1, price: 7200, cost: 6000 },
      { id: "bigbleu", name: "Big bleu", unit: "pièce", stock: 50, min: 5, price: 250, cost: 200 },
      { id: "savon", name: "Savon", unit: "pièce", stock: 30, min: 5, price: 300 },
      { id: "huile", name: "Huile", unit: "bidon", stock: 8, min: 2, price: 7500, cost: 6500 },
    ],
    clients: [{ id: "moussa", name: "Moussa Ndiaye", phone: "", debt: 0 }],
    sales: [], expenses: [], invoices: [], reminders: [], shortcuts: [],
  };
}

describe("chat : liste en vrac", () => {
  it("regroupe les articles répétés et calcule le total (l'exemple du patron)", () => {
    const o = parseOrder("2 sacs de riz, une caisse de boisson, big bleu, big bleu, big bleu, savon, savon", shop());
    expect(o.lines).toEqual([
      { productId: "riz", retail: false, qty: 2 },
      { productId: "boisson", retail: false, qty: 1 },
      { productId: "bigbleu", retail: false, qty: 3 },
      { productId: "savon", retail: false, qty: 2 },
    ]);
    expect(orderTotal(shop(), o)).toBe(2 * 18000 + 7200 + 3 * 250 + 2 * 300);
    expect(o.payment).toBeNull();
    expect(orderMissing(shop(), o, null)).toBe("C'est payé comment ?");
  });

  it("« big bleu big bleu big bleu » sans virgules = 3", () => {
    expect(parseOrder("big bleu big bleu big bleu", shop()).lines).toEqual([{ productId: "bigbleu", retail: false, qty: 3 }]);
  });

  it("wolof : ñaari sac ceeb ak benn bidon diw", () => {
    expect(parseOrder("ñaari sac ceeb ak benn bidon diw", shop()).lines).toEqual([
      { productId: "riz", retail: false, qty: 2 },
      { productId: "huile", retail: false, qty: 1 },
    ]);
  });

  it("vente payée cash, client et détail : encaissée tout de suite, caisse juste", () => {
    const o = parseOrder("vends à Moussa 2 bidons d'huile et 5 kilos de riz payé cash", shop());
    expect(o).toMatchObject({ intent: "vente", payment: "especes", clientId: "moussa" });
    expect(o.lines[1]).toEqual({ productId: "riz", retail: true, qty: 5 });
    const done = applyOrder(shop(), o, o.payment)!;
    expect(done.amount).toBe(2 * 7500 + 5 * 400);
    expect(expectedCash(done.shop)).toBe(17000);
    expect(done.shop.products.find((p) => p.id === "riz")!.stock).toBe(9.9);
  });

  it("achat : prix dit (« à 15 500 ») ou dernier prix d'achat ; stock monte", () => {
    const o = parseOrder("j'ai acheté 3 sacs de riz à 15 500 et 2 caisses de boisson", shop());
    expect(o.intent).toBe("achat");
    expect(purchaseTotal(shop(), o)).toBe(3 * 15500 + 2 * 6000);
    const done = applyOrder(shop(), o, null)!;
    expect(done.shop.products.find((p) => p.id === "riz")).toMatchObject({ stock: 13, cost: 15500 });
    expect(done.shop.expenses.every((e) => e.kind === "achat")).toBe(true);
  });

  it("achat sans prix connu : Jokko le demande", () => {
    const o = parseOrder("j'ai acheté 10 savons", shop());
    expect(orderMissing(shop(), o, null)).toMatch(/Prix d'achat inconnu pour Savon/);
  });

  it("facture pour un nouveau client, plusieurs lignes", () => {
    const o = parseOrder("facture pour Awa Diop : 2 sacs de riz, 1 caisse de boisson", shop());
    const done = applyOrder(shop(), o, null)!;
    expect(done.shop.invoices[0]).toMatchObject({ amount: 43200, lines: [{ label: "Riz brisé", qty: 2 }, { label: "Boisson", qty: 1 }] });
    expect(done.shop.clients.at(-1)!.name).toBe("Awa Diop");
  });

  it("mot inconnu : montré, jamais deviné", () => {
    const o = parseOrder("3 bissap, 2 savons, wave", shop());
    expect(o.unknown).toEqual([{ text: "bissap", qty: 3, candidates: [] }]);
    expect(orderMissing(shop(), o, "wave")).toMatch(/bissap/);
    expect(applyOrder(shop(), o, "wave")).toBeNull();
  });

  it("Gemini propose les articles, le code regroupe", () => {
    const o = orderFromGuess(
      {
        intent: "vente", payment: "inconnu", clientName: null,
        items: [
          { productId: "bigbleu", heard: "bik blé", quantity: 1, unit: null, unitPriceSaid: null },
          { productId: "bigbleu", heard: "bik blé", quantity: 1, unit: null, unitPriceSaid: null },
          { productId: null, heard: "bissap", quantity: 2, unit: null, unitPriceSaid: null },
        ],
      },
      "bik blé, bik blé, 2 bissap",
      shop(),
    )!;
    expect(o.lines).toEqual([{ productId: "bigbleu", retail: false, qty: 2 }]);
    expect(o.unknown[0].text).toBe("bissap");
  });

  it("questions et phrases sans liste ne passent pas par le panier", () => {
    expect(looksLikeOrder("il reste combien de riz ?")).toBe(false);
    expect(parseOrder("vente 15 000", shop()).lines).toEqual([]);
    expect(groupLines([{ productId: "a", retail: false, qty: 1 }, { productId: "a", retail: false, qty: 2 }])).toEqual([{ productId: "a", retail: false, qty: 3 }]);
  });
});
