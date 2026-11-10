import { describe, expect, it } from "vitest";
import { dayRepaid, expectedCash, type Shop } from "../model.ts";
import { payDebt, setDebt } from "./debts";
import { applyDraft } from "../assistant/apply";
import { zReport, zText } from "./tickets";
import { childRows, rowsToShop } from "./sync";

const base = (): Shop => ({
  id: "s", name: "Boutique Modou", activity: "alimentation", address: "", phone: "", openingCash: 5000,
  products: [], clients: [{ id: "c1", name: "Fatou", phone: "", debt: 10000 }],
  sales: [], expenses: [], invoices: [], reminders: [], shortcuts: [],
} as unknown as Shop);

describe("dette remboursée = argent dans la caisse du jour", () => {
  it("« Il a payé » 4 000 F en espèces : la dette baisse et la caisse attendue monte", () => {
    const s = payDebt(base(), "c1", 4000);
    expect(s.clients[0].debt).toBe(6000);
    expect(dayRepaid(s)).toBe(4000);
    expect(expectedCash(s)).toBe(9000);
  });
  it("payé par Wave : la dette baisse, mais rien dans le tiroir", () => {
    const s = payDebt(base(), "c1", 4000, "wave");
    expect(s.clients[0].debt).toBe(6000);
    expect(expectedCash(s)).toBe(5000);
    expect(dayRepaid(s, "all")).toBe(4000);
  });
  it("il donne plus que sa dette : on n'encaisse que la dette", () => {
    const s = payDebt(base(), "c1", 15000);
    expect(s.clients[0].debt).toBe(0);
    expect(dayRepaid(s)).toBe(10000);
  });
  it("corriger ou effacer une dette n'est pas un paiement", () => {
    expect(dayRepaid(setDebt(base(), "c1", 0))).toBe(0);
  });
  it("à la voix (« Fatou a payé 3 000 ») : aussi dans la caisse", () => {
    const done = applyDraft(base(), { type: "debt_payment", productId: null, productName: null, quantity: null, amount: 3000, clientId: "c1", clientName: null, label: null });
    expect(done?.shop.clients[0].debt).toBe(7000);
    expect(dayRepaid(done!.shop)).toBe(3000);
  });
  it("ticket Z : ligne « Dettes remboursees » et écart juste", () => {
    let s = payDebt(base(), "c1", 4000);
    s = payDebt(s, "c1", 1000, "om");
    const z = zReport(s);
    expect(z.repaid).toEqual({ especes: 4000, wave: 0, om: 1000 });
    const text = zText(s, z, 4000);
    expect(text).toContain("Dettes remboursees");
    expect(text).toMatch(/Ecart\s+0 F/);
  });
  it("synchro : aller-retour vers debt_payments", () => {
    const s = payDebt(base(), "c1", 2500, "wave");
    const rows = childRows(s, "debt_payments");
    expect(rows[0]).toMatchObject({ client_id: "c1", client_name: "Fatou", amount: 2500, payment: "wave" });
    const back = rowsToShop({ shop: { id: "s", name: "x" }, products: [], clients: [], sales: [], expenses: [], invoices: [], reminders: [], shortcuts: [], debt_payments: rows.map((r) => ({ ...r, amount: String(r.amount) })) });
    expect(back.repayments?.[0]).toMatchObject({ amount: 2500, payment: "wave", clientName: "Fatou" });
  });
});
