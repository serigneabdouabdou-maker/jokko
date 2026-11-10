import { describe, expect, it } from "vitest";
import type { Shop } from "../model.ts";
import { addDish, dishCost, dishStats, endService, leftovers, prepare, setDishCost, soldToday } from "./cuisine";

const NOW = new Date("2026-11-10T13:00:00");
const shop = (): Shop => ({
  id: "s", name: "Chez Awa", activity: "restauration", products: [
    { id: "yassa", name: "Yassa poulet", unit: "plat", stock: 12, min: 0, price: 1500, cost: 650 },
    { id: "bissap", name: "Bissap", unit: "bouteille", stock: 20, min: 0, price: 500 },
    { id: "riz", name: "Riz", unit: "sac", stock: 2, min: 1, price: 0, cost: 18000 },
  ],
  clients: [], sales: [
    { id: "1", at: "2026-11-10T12:00:00", label: "Yassa poulet", amount: 3000, qty: 2, productId: "yassa", cost: 1300 },
    { id: "2", at: "2026-11-10T12:30:00", label: "Bissap", amount: 1500, qty: 3, productId: "bissap" },
    { id: "3", at: "2026-11-09T12:30:00", label: "Yassa poulet", amount: 1500, qty: 1, productId: "yassa" },
  ],
  expenses: [], invoices: [], reminders: [], shortcuts: [],
} as unknown as Shop);

describe("cuisine", () => {
  it("calcule le coût d'une portion", () => {
    expect(dishCost([{ price: 9000 }, { price: 4000 }, { price: 2000 }], 20)).toBe(750);
    expect(dishCost([{ price: 1000 }], 0)).toBe(0);
  });
  it("compte les ventes du jour par plat", () => {
    const sold = soldToday(shop(), NOW);
    expect(sold.get("yassa")).toBe(2);
    expect(sold.get("bissap")).toBe(3);
  });
  it("classe les plats par bénéfice et ignore les ingrédients", () => {
    const stats = dishStats(shop(), 7, NOW);
    expect(stats.map((s) => s.id)).toEqual(["yassa", "bissap"]);
    expect(stats[0]).toMatchObject({ qty: 3, revenue: 4500, profit: 4500 - 1300 - 650 });
    expect(stats[1].profit).toBeNull();
  });
  it("prépare, fixe le coût, ajoute un plat", () => {
    let s = prepare(shop(), "yassa", 10);
    expect(s.products[0].stock).toBe(22);
    s = setDishCost(s, "bissap", 180);
    expect(s.products[1].cost).toBe(180);
    s = addDish(s, { name: " Dibi ", price: 2000, unit: "portion", portions: 15 }, "dibi");
    expect(s.products.at(-1)).toMatchObject({ id: "dibi", name: "Dibi", stock: 15 });
  });
  it("passe les restes frais en perte à la fin du service", () => {
    expect(leftovers(shop()).map((p) => p.id)).toEqual(["yassa"]);
    const { shop: s, lost, count } = endService(shop(), ["yassa"], "e1", NOW);
    expect(count).toBe(12);
    expect(lost).toBe(12 * 650);
    expect(s.products[0].stock).toBe(0);
    expect(s.expenses[0]).toMatchObject({ kind: "perte", amount: 7800 });
  });
});

describe("vente rapide", () => {
  it("vend une portion au prix du menu, avec son coût, et baisse le reste", async () => {
    const { sellDish } = await import("./cuisine");
    const s = sellDish(shop(), "yassa", 2, "v1", NOW);
    expect(s.sales.at(-1)).toMatchObject({ amount: 3000, qty: 2, cost: 1300, productId: "yassa" });
    expect(s.products[0].stock).toBe(10);
  });
});
