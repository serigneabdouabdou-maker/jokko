import { describe, expect, it } from "vitest";
import { addCommonServices, addLicence, licenceCharge, licenceStats, saveService, sellService, servicesMonth, servicesOf } from "./services.ts";
import { buildReport, expenseBreakdown, monthlyReport, periodOf } from "./report.ts";
import type { Shop } from "../model.ts";

const empty = (): Shop =>
  ({ id: "s", name: "Sall GSM", city: "Dakar", activity: "Réparation de téléphones et pièces détachées", openingCash: 0, products: [], clients: [], sales: [], expenses: [], invoices: [], reminders: [], shortcuts: [] }) as Shop;
const now = new Date("2026-11-13T12:00:00");

describe("services sans pièce et licences (réparateurs)", () => {
  it("décodage 5 000, imprimante 8 000 : tout est main-d'œuvre dans les bénéfices", () => {
    let s = addCommonServices(empty());
    expect(servicesOf(s).map((x) => x.name)).toContain("Décodage");
    s = sellService(s, { name: "Décodage", amount: 5000, at: now.toISOString() })!.shop;
    s = sellService(s, { name: "Réparation imprimante", amount: 8000, payment: "wave", at: now.toISOString() })!.shop;
    const r = buildReport(s, periodOf("mois", now));
    expect(r.revenue).toBe(13000);
    expect(r.unknownRevenue).toBe(0);
    expect(r.grossProfit).toBe(13000);
    expect(servicesMonth(s, now)).toEqual({ count: 2, earned: 13000 });
    expect(s.sales[0]).toMatchObject({ label: "Service · Réparation imprimante", payment: "wave" });
  });

  it("licence 90 000 F pour 1 an, achetée le 1er novembre : 7 500 F par mois dans les bénéfices, 90 000 sortis de la caisse", () => {
    const start = addLicence(empty(), { name: "Chimera", cost: 90000, months: 12, startAt: "2026-11-01", fromCash: true }, now)!;
    let s = saveService(start.shop, { name: "Décodage Samsung", price: 5000, licenceId: start.licence.id });
    for (let i = 0; i < 4; i++) s = sellService(s, { name: "Décodage Samsung", amount: 5000, licenceId: start.licence.id, at: now.toISOString() })!.shop;
    expect(s.expenses[0]).toMatchObject({ amount: 90000, kind: "achat" });
    const r = buildReport(s, periodOf("mois", now));
    expect(r.licences).toBe(7500);
    expect(r.expenses).toBe(0);
    expect(r.purchases).toBe(90000);
    expect(r.netProfit).toBe(20000 - 7500);
    expect(expenseBreakdown(s, periodOf("mois", now))[0]).toMatchObject({ label: "Licences (part de la période)", amount: 7500 });
    // Sur toute la durée, la licence compte exactement son prix.
    expect(licenceCharge(s, new Date("2026-01-01"), new Date("2028-01-01"))).toBe(90000);
    expect(monthlyReport(s, 2026, now).total.licences).toBe(7500);
    const st = licenceStats(s, start.licence, now);
    expect(st).toMatchObject({ uses: 4, earned: 20000, perMonth: 7500, expired: false, soon: false });
    expect(st.endsAt.getFullYear()).toBe(2027);
    expect(Math.round(st.paidBack * 100)).toBe(22);
  });

  it("licence de 40 000 F qui finit dans moins de 30 jours : signalée", () => {
    const l = addLicence(empty(), { name: "UnlockTool", cost: 40000, months: 12, startAt: "2025-12-01" }, now)!;
    expect(l.shop.expenses).toHaveLength(0);
    expect(licenceStats(l.shop, l.licence, now)).toMatchObject({ soon: true, expired: false, perMonth: 3333 });
  });
});
