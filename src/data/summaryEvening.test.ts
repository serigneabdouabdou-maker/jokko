import { describe, expect, it } from "vitest";
import type { Shop } from "../model.ts";
import { shortSummary } from "./summary.ts";

describe("résumé du soir", () => {
  it("ventes, gagné du jour, réparations rendues avec main-d'œuvre, services, total du mois", () => {
    const now = new Date(2026, 10, 13, 20);
    const at = (d: number, h = 12) => new Date(2026, 10, d, h).toISOString();
    const shop: Shop = {
      id: "s", name: "Boutique Mbéne", city: "Touba", activity: "Réparation", openingCash: 0, products: [], clients: [], invoices: [], reminders: [], shortcuts: [], expenses: [],
      sales: [
        { id: "a", at: at(13, 10), label: "Réparation R-001 · Tecno (rendu)", amount: 12000, cost: 0 },
        { id: "b", at: at(13, 11), label: "Service · Décodage", amount: 5000 },
        { id: "c", at: at(4), label: "Samsung A03 Core", amount: 11000, cost: 3700 },
      ],
      repairs: [{ id: "r", at: at(12), number: "R-001", clientName: "Awa", phone: "", device: "Tecno", problem: "écran", price: 12000, paid: 12000, status: "rendu", returnedAt: at(13, 10), parts: [{ label: "Écran Tecno BF6", qty: 1, cost: 3700 }] }],
    };
    const { title, body } = shortSummary(shop, 0, now);
    expect(title).toBe("Ta journée · Boutique Mbéne");
    expect(body).toContain("Ventes 17");
    expect(body).toContain("(2)");
    expect(body).toContain("1 réparation rendue, main-d'œuvre 8");
    expect(body).toContain("1 service.");
    expect(body).toContain("Ce mois : 24");
    expect(body.length).toBeLessThanOrEqual(200);
  });
});
