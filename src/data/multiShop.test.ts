import { describe, expect, it } from "vitest";
import { newShop, type Shop } from "../model";
import { allDebts, consolidatedStock, productKey, shopDays, totalDay } from "./multiShop";

const now = new Date("2026-11-03T12:00:00Z");
function shop(name: string, extra: Partial<Shop>): Shop {
  return { ...newShop(name, "alimentation", "Dakar"), ...extra };
}

const medina = shop("Médina", {
  id: "s1",
  products: [
    { id: "p1", name: "Riz", unit: "sac", stock: 12, min: 3, price: 18000 },
    { id: "p2", name: "Huile", unit: "bidon", stock: 1, min: 2, price: 7500 },
  ],
  clients: [{ id: "c1", name: "Moussa Diop", phone: "771234567", debt: 20000, dueAt: "2026-11-01T00:00:00Z" }],
  sales: [{ id: "v1", at: "2026-11-03T09:00:00Z", label: "2 sac Riz", amount: 36000, qty: 2, productId: "p1" }],
});
const pikine = shop("Pikine", {
  id: "s2",
  products: [
    { id: "q1", name: "riz ", unit: "Sac", stock: 3, min: 2, price: 18000 },
    { id: "q2", name: "Sucre", unit: "kg", stock: 40, min: 10, price: 700 },
  ],
  clients: [{ id: "d1", name: "Awa Fall", phone: "", debt: 5000 }],
  sales: [{ id: "w1", at: "2026-11-03T10:00:00Z", label: "Sucre", amount: 1400 }],
});

describe("Toutes mes boutiques", () => {
  it("résumé du jour par boutique et total", () => {
    const days = shopDays([medina, pikine], now);
    expect(days.map((d) => d.revenue)).toEqual([36000, 1400]);
    const total = totalDay(days);
    expect(total.revenue).toBe(37400);
    expect(total.salesCount).toBe(2);
    expect(total.debts).toBe(25000);
    expect(total.lowStock).toBe(1); // l'huile de Médina
  });

  it("inventaire général : le même article d'une boutique à l'autre (nom, majuscules, unité)", () => {
    expect(productKey("Riz", "sac")).toBe(productKey(" riz", "Sac"));
    const rows = consolidatedStock([medina, pikine]);
    const riz = rows.find((r) => r.name === "Riz")!;
    expect(riz.total).toBe(15);
    expect(riz.perShop.s1.stock).toBe(12);
    expect(riz.perShop.s2.stock).toBe(3);
    // Les articles sous le minimum d'abord
    expect(rows[0].name).toBe("Huile");
    expect(rows.find((r) => r.name === "Sucre")!.perShop.s1).toBeUndefined();
  });

  it("toutes les dettes, les retards d'abord", () => {
    const debts = allDebts([medina, pikine], now);
    expect(debts.map((d) => [d.name, d.shopName, d.late])).toEqual([
      ["Moussa Diop", "Médina", true],
      ["Awa Fall", "Pikine", false],
    ]);
  });
});
