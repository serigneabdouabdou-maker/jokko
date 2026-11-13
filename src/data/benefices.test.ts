import { describe, expect, it } from "vitest";
import { buildReport, expenseBreakdown, monthlyReport, periodOf, reportText } from "./report.ts";
import { money, type Shop } from "../model.ts";

const shop = (sales: Shop["sales"], expenses: Shop["expenses"] = []): Shop =>
  ({ id: "s", name: "Boutique Awa", products: [{ id: "riz", name: "Riz", unit: "sac", stock: 5, min: 1, price: 22000, cost: 20500 }], clients: [], sales, expenses, invoices: [], reminders: [] }) as unknown as Shop;

const now = new Date("2026-11-13T12:00:00");
const at = (m: number, d = 10) => new Date(2026, m, d, 10).toISOString();

describe("bénéfices : ventes − prix d'achat − dépenses − pertes", () => {
  const s = shop(
    [
      { id: "a", at: at(9), label: "Riz", amount: 44000, qty: 2, productId: "riz", cost: 41000 },
      { id: "b", at: at(10), label: "Riz", amount: 22000, qty: 1, productId: "riz", cost: 20500 },
      { id: "c", at: at(10, 12), label: "Couture C-001 · Grand boubou (avance)", amount: 15000 },
      { id: "d", at: at(10, 13), label: "Vente au comptoir", amount: 3000 },
    ],
    [
      { id: "e1", at: at(10), label: "Électricité (Woyofal)", amount: 5000, kind: "depense" },
      { id: "e2", at: at(10, 2), label: "Transport marchandise", amount: 2000, kind: "depense" },
      { id: "e3", at: at(10, 3), label: "Taxi pour le marché", amount: 1000, kind: "depense" },
      { id: "e4", at: at(10, 4), label: "Achat : 5 sacs de riz", amount: 102500, kind: "achat" },
      { id: "e5", at: at(10, 5), label: "Riz mouillé", amount: 4100, kind: "perte" },
      { id: "e6", at: at(9), label: "Loyer", amount: 30000, kind: "depense" },
    ],
  );

  it("le mois : la main-d'œuvre de couture compte en entier, l'achat de marchandise n'est pas une dépense", () => {
    const r = buildReport(s, periodOf("mois", now));
    expect(r.revenue).toBe(22000 + 15000 + 3000);
    expect(r.unknownRevenue).toBe(3000);
    expect(r.grossProfit).toBe(1500 + 15000);
    expect(r.expenses).toBe(8000);
    expect(r.losses).toBe(4100);
    expect(r.purchases).toBe(102500);
    expect(r.netProfit).toBe(16500 - 8000 - 4100);
  });

  it("mois par mois et total de l'année", () => {
    const y = monthlyReport(s, 2026, now);
    expect(y.rows).toHaveLength(11);
    expect(y.rows[9]).toMatchObject({ label: "octobre", revenue: 44000, grossProfit: 3000, expenses: 30000, netProfit: -27000 });
    expect(y.rows[10].netProfit).toBe(4400);
    expect(y.total.netProfit).toBe(-27000 + 4400);
    expect(y.total.revenue).toBe(44000 + 40000);
    expect(buildReport(s, periodOf("annee", now)).netProfit).toBe(y.total.netProfit);
    expect(monthlyReport(s, 2025, now).rows).toHaveLength(12);
  });

  it("où part l'argent : par catégorie, sans les achats ni les pertes", () => {
    const g = expenseBreakdown(s, periodOf("mois", now));
    expect(g).toEqual([
      { label: "Électricité", amount: 5000, count: 1 },
      { label: "Transport et livraison", amount: 3000, count: 2 },
    ]);
  });

  it("texte à envoyer sur WhatsApp", () => {
    const t = reportText("Boutique Awa", buildReport(s, periodOf("mois", now)), money);
    expect(t).toContain("Bénéfices novembre 2026");
    expect(t).toContain("Gagné");
    expect(reportText("B", buildReport(s, periodOf("mois_dernier", now)), money)).toContain("Perdu");
  });
});
