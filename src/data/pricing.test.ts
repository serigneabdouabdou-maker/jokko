import { describe, expect, it } from "vitest";
import type { Sale, Shop } from "../model.ts";
import { applySuggestedPrices, kindOf, laborStats, suggestedPrice } from "./pricing.ts";

const sale = (label: string, amount: number, cost: number): Sale => ({ id: label + amount, at: "2026-11-12T12:00:00Z", label, amount, cost });
function shop(sales: Sale[] = []): Shop {
  return {
    id: "s", name: "Boutique", city: "Touba", activity: "Réparation de téléphones", openingCash: 0,
    products: [
      { id: "bf6", name: "Écran Tecno BF6", unit: "pièce", stock: 0, min: 0, price: 0, cost: 3700 },
      { id: "i13", name: "Écran iPhone 13 Pro Max", unit: "pièce", stock: 0, min: 0, price: 0, cost: 21000 },
      { id: "bat", name: "Batterie iPhone XR", unit: "pièce", stock: 0, min: 0, price: 12000, cost: 4500 },
      { id: "x", name: "Pièce inconnue", unit: "pièce", stock: 0, min: 0, price: 0 },
    ],
    clients: [], sales, expenses: [], invoices: [], reminders: [], shortcuts: [],
  };
}

describe("prix de vente conseillé", () => {
  it("reconnaît le type de pièce", () => {
    expect(kindOf("LCD Tecno BF6")).toBe("Écran");
    expect(kindOf("Batterie XR")).toBe("Batterie");
    expect(kindOf("Plaquette Infinix")).toBe("Plaquette");
    expect(kindOf("Dos XR")).toBe("Dos");
    expect(kindOf("Samsung A03 Core")).toBe("Autre");
  });

  it("apprend la main-d'œuvre des vraies ventes (médiane), sinon garde celle de départ", () => {
    const st = laborStats(shop([sale("LCD Tecno BF6", 12000, 7000), sale("LCD Tecno KF6", 10000, 4000), sale("Écran Samsung", 11000, 4000), sale("Batterie XR", 10000, 4500)]));
    expect(st.Écran).toEqual({ labor: 6000, examples: 3, learned: true });
    expect(st.Batterie).toMatchObject({ labor: 3000, learned: false, examples: 1 });
  });

  it("prix = pièce + main-d'œuvre, au moins 35 % pour une pièce chère, arrondi aux 500 F", () => {
    const st = laborStats(shop([sale("LCD Tecno BF6", 12000, 7000), sale("LCD Tecno KF6", 10000, 4000)]));
    // main-d'œuvre apprise : 5 500 → 3 700 + 5 500 = 9 200 → 9 500
    expect(suggestedPrice({ name: "Écran Tecno BF6", cost: 3700 }, st)).toEqual({ price: 9500, labor: 5800, kind: "Écran" });
    // 21 000 × 35 % = 7 350 > 5 500 → 28 350 → 28 500
    expect(suggestedPrice({ name: "Écran iPhone 13 Pro Max", cost: 21000 }, st)?.price).toBe(28500);
    expect(suggestedPrice({ name: "Pièce inconnue" }, st)).toBeNull();
  });

  it("met les prix conseillés seulement là où il n'y a pas de prix de vente", () => {
    const { shop: s, count } = applySuggestedPrices(shop());
    expect(count).toBe(2);
    expect(s.products.find((p) => p.id === "bat")?.price).toBe(12000);
    expect(s.products.find((p) => p.id === "bf6")?.price).toBe(9000);
    expect(s.products.find((p) => p.id === "x")?.price).toBe(0);
  });
});
