import { describe, expect, it } from "vitest";
import { buildDemoShop, demoProfile, isDemoShop } from "./demo.ts";
import { dayCashSales, expectedCash, type Profile } from "../model.ts";

const now = new Date("2026-11-01T15:00:00");

describe("boutique de démonstration", () => {
  const shop = buildDemoShop(now);
  it("est remplie : produits, clients, ventes de la semaine et d'aujourd'hui", () => {
    expect(shop.products.length >= 15).toBe(true);
    expect(shop.clients.length).toBe(6);
    expect(shop.sales.length > 100).toBe(true);
    const today = shop.sales.filter((s) => new Date(s.at).toDateString() === now.toDateString());
    expect(today.length > 5).toBe(true);
    expect(today.every((s) => Date.parse(s.at) <= now.getTime())).toBe(true);
    expect(dayCashSales(shop) >= 0 && expectedCash(shop) > 0).toBe(true);
  });
  it("montre des alertes utiles : stock bas et dettes", () => {
    expect(shop.products.some((p) => p.stock <= p.min)).toBe(true);
    expect(shop.clients.some((c) => c.debt > 0)).toBe(true);
  });
  it("chaque vente pointe vers un vrai article, avec un bénéfice positif", () => {
    const ids = new Set(shop.products.map((p) => p.id));
    expect(shop.sales.every((s) => s.productId && ids.has(s.productId) && s.amount > 0 && (s.cost ?? 0) < s.amount)).toBe(true);
  });
  it("aucun numéro de téléphone (on n'écrit jamais à une vraie personne)", () => {
    expect(shop.clients.every((c) => c.phone === "")).toBe(true);
  });
  it("est reconnue comme démo, et toujours la même", () => {
    expect(isDemoShop(shop)).toBe(true);
    expect(JSON.stringify(buildDemoShop(now))).toBe(JSON.stringify(shop));
    const profile = demoProfile({ phone: "221770000000", owner: "Test", lang: "wo", role: "patron", geminiKey: "", speak: true, shopId: "shop-x", shops: [] } as Profile, now);
    expect(profile.shops).toHaveLength(1);
    expect(profile.shopId).toBe(shop.id);
  });
});
