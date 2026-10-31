import { describe, expect, it } from "vitest";
import type { Sale, Shop } from "../model";
import { buildInsights, insightsForAdvisor } from "./insights";

const NOW = new Date("2026-10-31T18:00:00Z");
const daysAgo = (d: number, h = 10) => new Date(NOW.getTime() - d * 86_400_000 + (h - 18) * 3_600_000).toISOString();

function shop(): Shop {
  const sales: Sale[] = [];
  // Riz : 1 sac par jour depuis 20 jours, bénéfice 2 000 par sac
  for (let d = 1; d <= 20; d++) sales.push({ id: `r${d}`, at: daysAgo(d), label: "Riz", amount: 18000, qty: 1, productId: "riz", cost: 16000 });
  // Huile : 2 ventes il y a 40 jours (mois d'avant)
  sales.push({ id: "h1", at: daysAgo(40), label: "Huile", amount: 15000, qty: 2, productId: "huile", cost: 13000 });
  sales.push({ id: "h2", at: daysAgo(45), label: "Huile", amount: 7500, qty: 1, productId: "huile", cost: 6500 });
  return {
    id: "s", name: "Boutique Awa", city: "", activity: "Alimentation", openingCash: 0,
    products: [
      { id: "riz", name: "Riz", unit: "sac", stock: 3, min: 2, price: 18000, cost: 16000 },
      { id: "huile", name: "Huile", unit: "bidon", stock: 10, min: 2, price: 7500, cost: 6500 },
      { id: "sucre", name: "Sucre", unit: "sac", stock: 4, min: 1, price: 20000, cost: 21000 },
      { id: "savon", name: "Savon", unit: "pièce", stock: 30, min: 5, price: 300 },
    ],
    clients: [
      { id: "m", name: "Moussa", phone: "770000000", debt: 60000, dueAt: daysAgo(3) },
      { id: "f", name: "Fatou", phone: "", debt: 5000, dueAt: daysAgo(-10) },
    ],
    sales, expenses: [{ id: "e", at: daysAgo(2), label: "Transport", amount: 5000 }], invoices: [], reminders: [], shortcuts: [],
  };
}

describe("diagnostic du conseiller", () => {
  const i = buildInsights(shop(), NOW);
  const ids = i.findings.map((f) => f.id);

  it("chiffres sur 30 jours, tendance contre le mois d'avant", () => {
    expect(i.revenue).toBe(20 * 18000);
    expect(i.previousRevenue).toBe(22500);
    expect(i.trendPct).toBe(1500);
    expect(i.grossProfit).toBe(40000);
    expect(i.netProfit).toBe(35000);
  });

  it("rupture à venir : riz, 3 jours, commander pour 2 semaines", () => {
    const riz = i.products.find((p) => p.id === "riz")!;
    expect(riz).toMatchObject({ daysLeft: 3, reorder: 10 });
    expect(i.findings.find((f) => f.id === "rupture-riz")).toMatchObject({ level: "important" });
  });

  it("vendu à perte (sucre) en urgent, en tête de liste", () => {
    expect(i.findings[0]).toMatchObject({ id: "perte-sucre", level: "urgent" });
  });

  it("stock qui dort, dettes en retard, prix d'achat manquants", () => {
    expect(ids).toContain("dormant");
    expect(i.findings.find((f) => f.id === "dormant")!.detail).toMatch(/Huile/);
    expect(i.overdueTotal).toBe(60000);
    expect(i.findings.find((f) => f.id === "dettes")).toMatchObject({ level: "urgent" });
    expect(ids).toContain("sans-prix-achat");
  });

  it("ce qui part au conseiller IA : chiffres et constats, jamais les numéros de téléphone", () => {
    const sent = JSON.stringify(insightsForAdvisor(i, "Boutique Awa", "Alimentation"));
    expect(sent).toContain("constats");
    expect(sent).not.toContain("770000000");
  });
});
