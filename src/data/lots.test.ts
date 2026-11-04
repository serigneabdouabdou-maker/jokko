import { describe, expect, it } from "vitest";
import { type Shop, newShop } from "@/model";
import { normalizeCode } from "./barcode";
import { gtinToEan, parseGs1 } from "./gs1";
import { fitShopLots, receiveLot, removeLot } from "./lots";
import { expiringSoon } from "./metiers";

const GS = "\u001d";

describe("code carré des boîtes de médicaments (GS1 Datamatrix)", () => {
  it("lit le produit, la date et le lot", () => {
    expect(parseGs1(`010340093000000017271231` + `10AB123${GS}21XYZ9`)).toEqual({ gtin: "03400930000000", expiresAt: "2027-12-31", lot: "AB123", serial: "XYZ9" });
  });
  it("forme lisible avec parenthèses, et jour 00 = fin du mois", () => {
    expect(parseGs1("(01)06291107512345(17)280200(10)L42")).toEqual({ gtin: "06291107512345", expiresAt: "2028-02-29", lot: "L42" });
  });
  it("un code-barres normal n'est pas un code GS1", () => {
    expect(parseGs1("6291107512345")).toBeNull();
  });
  it("le scan du code carré retrouve la boîte enregistrée avec son code-barres", () => {
    expect(gtinToEan("06291107512345")).toBe("6291107512345");
    expect(normalizeCode("(01)06291107512345(17)280200(10)L42")).toBe("6291107512345");
  });
});

function pharmacie(): Shop {
  return { ...newShop("Pharmacie Test", "Pharmacie"), products: [{ id: "doli", name: "Doliprane 1000", unit: "boîte", stock: 0, min: 5, price: 1500, cost: 1000 }] };
}

describe("lots avec dates de péremption", () => {
  it("réception de deux livraisons : le stock monte, la date affichée est la plus proche", () => {
    let shop = receiveLot(pharmacie(), "doli", 20, "2027-08-31", "B2");
    shop = receiveLot(shop, "doli", 10, "2027-03-31", "A1");
    const p = shop.products[0];
    expect(p.stock).toBe(30);
    expect(p.expiresAt).toBe("2027-03-31");
    expect(p.lots).toHaveLength(2);
  });
  it("une vente de 12 boîtes vide d'abord le lot de mars, puis prend 2 boîtes d'août", () => {
    let shop = receiveLot(pharmacie(), "doli", 20, "2027-08-31", "B2");
    shop = receiveLot(shop, "doli", 10, "2027-03-31", "A1");
    shop = fitShopLots({ ...shop, products: shop.products.map((p) => ({ ...p, stock: p.stock - 12 })) });
    const p = shop.products[0];
    expect(p.stock).toBe(18);
    expect(p.lots).toEqual([{ expiresAt: "2027-08-31", qty: 18, lot: "B2" }]);
    expect(p.expiresAt).toBe("2027-08-31");
  });
  it("alertes : une ligne par lot, le plus urgent d'abord", () => {
    let shop = receiveLot(pharmacie(), "doli", 20, "2026-12-31");
    shop = receiveLot(shop, "doli", 5, "2026-11-01", "VIEUX");
    const list = expiringSoon(shop.products, 60, new Date("2026-11-05T10:00:00").getTime());
    expect(list.map((x) => [x.lotQty, x.expiresAt])).toEqual([[5, "2026-11-01"], [20, "2026-12-31"]]);
    expect(list[0].daysLeft).toBeLessThan(0);
  });
  it("retirer un lot périmé : le stock baisse et la perte est notée au prix d'achat", () => {
    let shop = receiveLot(pharmacie(), "doli", 20, "2027-08-31");
    shop = receiveLot(shop, "doli", 5, "2026-11-01", "VIEUX");
    shop = removeLot(shop, "doli", "2026-11-01", "VIEUX");
    expect(shop.products[0].stock).toBe(20);
    expect(shop.products[0].lots).toHaveLength(1);
    expect(shop.expenses[0]).toMatchObject({ amount: 5000, kind: "perte" });
  });
});
