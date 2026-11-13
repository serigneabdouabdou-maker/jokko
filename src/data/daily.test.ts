import { describe, expect, it } from "vitest";
import type { Shop } from "../model.ts";
import { dailyReport, periodOf } from "./report.ts";

describe("bénéfices jour par jour", () => {
  it("un jour = ses ventes, le bénéfice (vente − pièce) et les dépenses ; jours vides cachés ; le plus récent d'abord", () => {
    const now = new Date(2026, 10, 13, 20);
    const at = (d: number, h = 12) => new Date(2026, 10, d, h).toISOString();
    const shop: Shop = {
      id: "s", name: "B", city: "Touba", activity: "Réparation", openingCash: 0, products: [], clients: [], invoices: [], reminders: [], shortcuts: [],
      sales: [
        { id: "a", at: at(4), label: "Samsung A03 Core", amount: 11000, cost: 3700 },
        { id: "b", at: at(4, 15), label: "Dos XR", amount: 4000, cost: 0 },
        { id: "c", at: at(12), label: "LCD Tecno BF6", amount: 12000, cost: 7000 },
      ],
      expenses: [{ id: "e", at: at(12, 9), label: "Transport", amount: 1000 }],
    };
    const rows = dailyReport(shop, periodOf("mois", now), now);
    expect(rows.map((r) => r.day)).toEqual(["2026-11-12", "2026-11-04"]);
    expect(rows[0]).toMatchObject({ revenue: 12000, grossProfit: 5000, spent: 1000, netProfit: 4000, salesCount: 1 });
    expect(rows[1]).toMatchObject({ revenue: 15000, grossProfit: 11300, netProfit: 11300, salesCount: 2 });
  });
});
