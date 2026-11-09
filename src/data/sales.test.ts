import { describe, expect, it } from "vitest";
import { type Shop, daySales, seedShop } from "../model";
import { applyDraft } from "../assistant/apply";
import { clearTodaySales, editSale, removeSale } from "./sales";

const blank = { type: "sale" as const, productId: null, productName: null, quantity: null, amount: null, clientId: null, clientName: null, label: null };

function sold(): { shop: Shop; id: string; huile: string; stock: number } {
  const base = seedShop();
  const huile = base.products.find((p) => p.name === "Huile")!;
  const shop = applyDraft(base, { ...blank, productId: huile.id, quantity: 2 })!.shop;
  return { shop, id: shop.sales[0].id, huile: huile.id, stock: huile.stock };
}

describe("corriger une vente", () => {
  it("supprimer : la vente part, l'article revient en stock, la caisse baisse", () => {
    const { shop, id, huile, stock } = sold();
    const before = daySales(shop);
    const next = removeSale(shop, id);
    expect(next.sales.find((s) => s.id === id)).toBeUndefined();
    expect(next.products.find((p) => p.id === huile)!.stock).toBe(stock);
    expect(daySales(next)).toBe(before - 15000);
  });

  it("changer le prix : seule la caisse change", () => {
    const { shop, id, huile, stock } = sold();
    const next = editSale(shop, id, { amount: 14000 });
    expect(next.sales[0].amount).toBe(14000);
    expect(next.products.find((p) => p.id === huile)!.stock).toBe(stock - 2);
  });

  it("changer la quantité : le stock suit l'écart", () => {
    const { shop, id, huile, stock } = sold();
    const next = editSale(shop, id, { qty: 1, amount: 7500 });
    expect(next.sales[0]).toMatchObject({ qty: 1, amount: 7500 });
    expect(next.products.find((p) => p.id === huile)!.stock).toBe(stock - 1);
  });

  it("vente à crédit supprimée : la dette du client baisse", () => {
    const base = seedShop();
    const client = { id: "c-test", name: "Awa", debt: 5000 };
    const shop: Shop = { ...base, clients: [client], sales: [{ id: "s1", at: new Date().toISOString(), label: "Riz", amount: 5000, payment: "credit", clientId: "c-test" }, ...base.sales] };
    expect(removeSale(shop, "s1").clients[0].debt).toBe(0);
  });

  it("vider la caisse : plus aucune vente aujourd'hui", () => {
    const { shop } = sold();
    expect(daySales(clearTodaySales(shop))).toBe(0);
  });
});
