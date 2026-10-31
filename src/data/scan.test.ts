import { describe, expect, it } from "vitest";
import { type Shop, expectedCash } from "../model";
import { ean13Check, ean13Modules, ean13Svg, findByCode, isValidEan13, newInternalCode, normalizeCode, withCodes } from "./barcode";
import { addToCart, cartTotal, checkout, setQty, shortages } from "./checkout";

function shop(): Shop {
  return {
    id: "shop-1", name: "Boutique Awa", city: "", activity: "", openingCash: 10000,
    products: [
      { id: "p-lait", name: "Lait Vitalait 400 g", unit: "boîte", stock: 20, min: 2, price: 1500, cost: 1200, barcode: "6111245590307" },
      { id: "p-riz", name: "Riz", unit: "sac", stock: 2, min: 1, price: 18000, cost: 16000, retail: { unit: "kilo", perUnit: 50, price: 400 } },
      { id: "p-coca", name: "Coca 33 cl", unit: "canette", stock: 5, min: 1, price: 400, barcode: "049000028911" },
    ],
    clients: [{ id: "c-moussa", name: "Moussa", phone: "", debt: 0 }],
    sales: [], expenses: [], invoices: [], reminders: [], shortcuts: [],
  };
}

describe("codes-barres", () => {
  it("chiffre de contrôle EAN-13 (codes réels)", () => {
    expect(ean13Check("400638133393")).toBe(1);
    expect(isValidEan13("4006381333931")).toBe(true);
    expect(isValidEan13("5901234123457")).toBe(true);
    expect(isValidEan13("5901234123458")).toBe(false);
  });

  it("dessin EAN-13 : 95 modules, gardes au bon endroit", () => {
    const m = ean13Modules("5901234123457");
    expect(m).toHaveLength(95);
    expect(m.slice(0, 3)).toBe("101");
    expect(m.slice(45, 50)).toBe("01010");
    expect(m.slice(92)).toBe("101");
    expect(ean13Svg("5901234123457")).toContain("<svg");
  });

  it("UPC à 12 chiffres = EAN-13 avec un 0 devant ; trouve gros et détail", () => {
    const s = shop();
    expect(normalizeCode(" 049000028911 ")).toBe("0049000028911");
    expect(findByCode(s, "0049000028911")?.product.id).toBe("p-coca");
    expect(findByCode(s, "6111245590307")).toMatchObject({ retail: false });
    expect(findByCode(s, "123")).toBeNull();
  });

  it("codes Jokko : préfixe 20, valides, uniques ; le détail a son propre code", () => {
    const s = withCodes(shop(), ["p-riz", "p-lait"]);
    const riz = s.products.find((p) => p.id === "p-riz")!;
    expect(riz.barcode).toMatch(/^20\d{11}$/);
    expect(isValidEan13(riz.barcode!)).toBe(true);
    expect(riz.retail!.barcode).not.toBe(riz.barcode);
    expect(findByCode(s, riz.retail!.barcode!)).toMatchObject({ retail: true });
    // le code du fabricant n'est pas remplacé
    expect(s.products.find((p) => p.id === "p-lait")!.barcode).toBe("6111245590307");
    // même tirage au hasard : jamais deux fois le même code
    let i = 0;
    const fixed = () => [0.1, 0.2, 0.3][i++ % 3];
    const a = newInternalCode(s, fixed);
    const withA = { ...s, products: [...s.products, { id: "x", name: "x", unit: "u", stock: 0, min: 0, price: 1, barcode: a }] };
    i = 0;
    expect(newInternalCode(withA, () => (i++ < 10 ? 0.1 : 0.9))).not.toBe(a);
  });
});

describe("caisse par scan", () => {
  it("scanner 3 fois le lait = 3 boîtes ; détail et gros séparés", () => {
    let lines = addToCart([], "p-lait", false);
    lines = addToCart(lines, "p-lait", false);
    lines = addToCart(lines, "p-lait", false);
    lines = addToCart(lines, "p-riz", true, 5);
    expect(lines).toEqual([{ productId: "p-riz", retail: true, qty: 5 }, { productId: "p-lait", retail: false, qty: 3 }]);
    expect(cartTotal(shop(), lines)).toBe(3 * 1500 + 5 * 400);
    expect(setQty(lines, 0, 0)).toHaveLength(1);
  });

  it("encaisser en espèces : ventes, stock, bénéfice, caisse", () => {
    const s = shop();
    const done = checkout(s, [{ productId: "p-lait", retail: false, qty: 3 }, { productId: "p-riz", retail: true, qty: 5 }], "especes")!;
    expect(done.amount).toBe(6500);
    expect(done.shop.sales).toHaveLength(2);
    expect(done.shop.products.find((p) => p.id === "p-lait")!.stock).toBe(17);
    expect(done.shop.products.find((p) => p.id === "p-riz")!.stock).toBe(1.9);
    expect(expectedCash(done.shop)).toBe(10000 + 6500);
  });

  it("Wave : vendu, mais pas dans le tiroir", () => {
    const done = checkout(shop(), [{ productId: "p-lait", retail: false, qty: 2 }], "wave")!;
    expect(done.shop.sales[0]).toMatchObject({ amount: 3000, payment: "wave" });
    expect(expectedCash(done.shop)).toBe(10000);
    expect(done.summary).toMatch(/Wave/);
  });

  it("crédit : il faut un client ; sa dette monte avec une échéance", () => {
    expect(checkout(shop(), [{ productId: "p-lait", retail: false, qty: 1 }], "credit")).toBeNull();
    const done = checkout(shop(), [{ productId: "p-lait", retail: false, qty: 2 }], "credit", "c-moussa")!;
    const moussa = done.shop.clients[0];
    expect(moussa.debt).toBe(3000);
    expect(moussa.dueAt).toBeTruthy();
    expect(done.shop.sales[0]).toMatchObject({ payment: "credit", clientId: "c-moussa" });
    expect(expectedCash(done.shop)).toBe(10000);
  });

  it("stock insuffisant signalé", () => {
    expect(shortages(shop(), [{ productId: "p-coca", retail: false, qty: 6 }])).toEqual(["Coca 33 cl"]);
  });
});
