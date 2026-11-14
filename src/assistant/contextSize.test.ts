import { describe, expect, it } from "vitest";
import { seedShop, type Shop } from "../model";
import { buildShopContext } from "./client";

describe("demande envoyée à Gemini : jamais plus de 32 Ko", () => {
  it("boutique de réparation avec 641 pièces, 400 clients et 60 dépôts", () => {
    const base = seedShop();
    const products = Array.from({ length: 641 }, (_, i) => ({
      id: `p-${crypto.randomUUID()}`, name: `Écran Tecno KG${i}K universel`, unit: "pièce", stock: i % 7 === 0 ? 2 : 0, min: 0, price: i % 5 === 0 ? 12000 : 0,
      aliases: ["BF6", "BF7", "KI5K", "Smart 7", "X6515", "X6516", "X6517", "A60"], cost: 5000,
    }));
    const clients = Array.from({ length: 400 }, (_, i) => ({ id: `c-${crypto.randomUUID()}`, name: `Client numéro ${i} de Mboss`, phone: "", debt: i % 3 ? 0 : 5000 }));
    const repairs = Array.from({ length: 60 }, (_, i) => ({
      id: `r${i}`, at: new Date().toISOString(), number: `R-${i}`, clientName: "Moussa Ndiaye Diop", phone: "", device: "Tecno Spark 10 (KI5Q)",
      problem: "écran cassé, ne charge plus, bouton power cassé · Écran Tecno KI5K universel", price: 15000, paid: 0, parts: [], status: "depot" as const,
    }));
    const shop = { ...base, activity: "Réparation de téléphones", products, clients, repairs } as unknown as Shop;
    const ctx = buildShopContext(shop, "fr");
    const body = JSON.stringify({ message: "x".repeat(500), shopContext: ctx });
    expect(body.length).toBeLessThan(32 * 1024);
    // Les articles en stock passent d'abord, et les clients qui doivent de l'argent aussi.
    expect(ctx.products.slice(0, 10).every((p) => p.stock > 0)).toBe(true);
    expect(ctx.clients[0]!.debt).toBeGreaterThan(0);
  });
});

describe("les articles nommés dans la phrase passent devant", () => {
  it("une pièce du catalogue (stock 0, sans prix) citée par le commerçant est envoyée à Gemini", () => {
    const base = seedShop();
    const products = Array.from({ length: 900 }, (_, i) => ({ id: `p${i}`, name: `Écran Tecno ZZ${i} universel`, unit: "pièce", stock: i < 400 ? 1 : 0, min: 0, price: 0 }));
    products.push({ id: "cible", name: "Écran Infinix X6525", unit: "pièce", stock: 0, min: 0, price: 0 });
    const shop = { ...base, products } as unknown as Shop;
    expect(buildShopContext(shop, "fr").products.some((p) => p.id === "cible")).toBe(false);
    expect(buildShopContext(shop, "fr", "combien pour l'écran X6525 ?").products[0]!.id).toBe("cible");
  });
});
