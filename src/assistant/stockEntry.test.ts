import { describe, expect, it } from "vitest";
import type { Shop } from "../model";
import { adjustPrices, applyStockDrafts, parseStockList } from "./stockEntry";

function shop(): Shop {
  return {
    id: "s", name: "B", city: "", activity: "", openingCash: 0,
    products: [
      { id: "riz", name: "Riz brisé", unit: "sac", stock: 10, min: 1, price: 18000, cost: 16000, retail: { unit: "kilo", perUnit: 50, price: 400 } },
      { id: "huile", name: "Huile", unit: "bidon", stock: 8, min: 2, price: 7500, cost: 6500 },
    ],
    clients: [], sales: [], expenses: [], invoices: [], reminders: [], shortcuts: [],
  };
}

describe("stock en parlant ou en écrivant", () => {
  it("liste en vrac : connus montent, inconnus créés, prix et prix d'achat lus", () => {
    const d = parseStockList("10 sacs de riz à 18 500, acheté à 16 000 ; 5 bidons d'huile ; 20 savons à 300 prix d'achat 250, big bleu big bleu", shop());
    expect(d).toEqual([
      { productId: "riz", name: "Riz brisé", qty: 10, unit: "sac", retail: false, price: 18500, cost: 16000 },
      { productId: "huile", name: "Huile", qty: 5, unit: "bidon", retail: false, price: null, cost: null },
      { productId: null, name: "Savons", qty: 20, unit: "pièce", retail: false, price: 300, cost: 250 },
      { productId: null, name: "Big bleu", qty: 2, unit: "pièce", retail: false, price: null, cost: null },
    ]);
    let n = 0;
    const done = applyStockDrafts(shop(), d, () => `new-${++n}`);
    expect(done.shop.products.find((p) => p.id === "riz")).toMatchObject({ stock: 20, price: 18500, cost: 16000 });
    expect(done.shop.products.find((p) => p.id === "huile")).toMatchObject({ stock: 13, price: 7500 });
    expect(done.shop.products.find((p) => p.id === "new-1")).toMatchObject({ name: "Savons", stock: 20, price: 300, cost: 250 });
    expect(done.summary).toBe("Stock · 2 articles mis à jour · 2 nouveaux articles");
  });

  it("wolof et détail : ñaari sac ceeb ak juroomi kilo ceeb = 2 sacs + 0,1 sac", () => {
    const d = parseStockList("dugal ñaari sac ceeb ak juroomi kilo ceeb", shop());
    const done = applyStockDrafts(shop(), d, () => "x");
    expect(done.shop.products.find((p) => p.id === "riz")!.stock).toBe(12.1);
  });

  it("« ajoute au stock 3 cartons de lait Vitalait à 12 000 »", () => {
    expect(parseStockList("ajoute au stock 3 cartons de lait Vitalait à 12 000", shop())).toEqual([
      { productId: null, name: "Lait vitalait", qty: 3, unit: "carton", retail: false, price: 12000, cost: null },
    ]);
  });

  it("prix en lot : +5 % arrondi aux 5 F, détail compris ; +500 F sur un seul article", () => {
    const up = adjustPrices(shop(), "tous", { kind: "pourcent", value: 5 });
    expect(up.products.map((p) => [p.price, p.retail?.price])).toEqual([[18900, 420], [7875, undefined]]);
    const one = adjustPrices(shop(), ["huile"], { kind: "francs", value: 500 });
    expect(one.products.map((p) => p.price)).toEqual([18000, 8000]);
    expect(adjustPrices(shop(), "tous", { kind: "pourcent", value: -10 }).products[0].price).toBe(16200);
  });
});
