import { describe, expect, it } from "vitest";
import type { Shop } from "../model.ts";
import type { DraftAction } from "../assistant/client";
import { applyDraft } from "../assistant/apply";
import { removeExpense, stockDelta } from "./sales";
import { childRows, rowsToShop } from "./sync";

const blank: DraftAction = { type: "purchase", productId: null, productName: null, quantity: null, amount: null, clientId: null, clientName: null, label: null };
const base = (): Shop => ({
  id: "s", name: "Boutique Modou", activity: "alimentation", address: "", phone: "", openingCash: 0,
  products: [{ id: "riz", name: "Riz", unit: "sac", stock: 4, min: 0, price: 22000, cost: 20000, retail: { unit: "kg", perUnit: 50, price: 500 } }],
  clients: [], sales: [], expenses: [], invoices: [], reminders: [], shortcuts: [],
} as unknown as Shop);

describe("supprimer un achat de marchandise remet le stock juste", () => {
  it("achat de 5 sacs puis suppression : le stock revient à 4", () => {
    const bought = applyDraft(base(), { ...blank, productId: "riz", quantity: 5, amount: 100000 })!.shop;
    expect(bought.products[0].stock).toBe(9);
    expect(bought.expenses[0]).toMatchObject({ kind: "achat", productId: "riz", qty: 5 });
    const undone = removeExpense(bought, bought.expenses[0].id);
    expect(undone.products[0].stock).toBe(4);
    expect(undone.expenses).toHaveLength(0);
  });
  it("achat au détail (25 kg = un demi-sac) : on retire un demi-sac", () => {
    const bought = applyDraft(base(), { ...blank, productId: "riz", quantity: 25, unit: "kg", amount: 10000 } as DraftAction)!.shop;
    expect(bought.products[0].stock).toBe(4.5);
    expect(removeExpense(bought, bought.expenses[0].id).products[0].stock).toBe(4);
  });
  it("articles déjà vendus : le stock ne descend jamais sous 0", () => {
    let s = applyDraft(base(), { ...blank, productId: "riz", quantity: 5, amount: 100000 })!.shop;
    s = { ...s, products: s.products.map((p) => ({ ...p, stock: 2 })) };
    expect(removeExpense(s, s.expenses[0].id).products[0].stock).toBe(0);
  });
  it("perte supprimée (erreur) : les articles reviennent", () => {
    const lost = applyDraft(base(), { ...blank, type: "stock_adjust", productId: "riz", quantity: -1, label: "Sac mouillé" })!.shop;
    expect(lost.products[0].stock).toBe(3);
    expect(stockDelta(lost.expenses[0])).toBe(1);
    expect(removeExpense(lost, lost.expenses[0].id).products[0].stock).toBe(4);
  });
  it("ancienne ligne sans article noté, ou dépense normale : le stock ne bouge pas", () => {
    const s = { ...base(), expenses: [{ id: "e1", at: new Date().toISOString(), label: "Achat riz", amount: 1000, kind: "achat" as const }, { id: "e2", at: new Date().toISOString(), label: "Électricité", amount: 5000 }] };
    expect(removeExpense(s, "e1").products[0].stock).toBe(4);
    expect(removeExpense(s, "e2").products[0].stock).toBe(4);
  });
  it("synchro : l'article et la quantité font l'aller-retour", () => {
    const bought = applyDraft(base(), { ...blank, productId: "riz", quantity: 5, amount: 100000 })!.shop;
    const rows = childRows(bought, "expenses");
    expect(rows[0]).toMatchObject({ product_id: "riz", qty: 5 });
    const back = rowsToShop({ shop: { id: "s", name: "x" }, products: [], clients: [], sales: [], expenses: rows.map((r) => ({ ...r, qty: String(r.qty) })), invoices: [], reminders: [], shortcuts: [] });
    expect(back.expenses[0]).toMatchObject({ productId: "riz", qty: 5, kind: "achat" });
  });
});
