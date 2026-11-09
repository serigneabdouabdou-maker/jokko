import { type Sale, type Shop, isToday } from "../model";
import { roundQty } from "../assistant/apply";

/**
 * Corriger une vente déjà enregistrée (le patron seulement) : changer le prix ou la quantité, ou la supprimer.
 * Tout reste juste : le stock revient (ou repart), la dette du client à crédit suit, la caisse du jour aussi.
 */

/** Quantité de la vente en unités de gros (stock), 0 si la vente n'est pas liée à un article. */
function stockQty(shop: Shop, s: Sale): number {
  if (!s.productId || !s.qty) return 0;
  const p = shop.products.find((x) => x.id === s.productId);
  if (!p) return 0;
  return s.retail && p.retail ? s.qty / p.retail.perUnit : s.qty;
}

function moveStock(shop: Shop, productId: string | undefined, delta: number): Shop {
  if (!productId || !delta) return shop;
  return { ...shop, products: shop.products.map((p) => (p.id === productId ? { ...p, stock: Math.max(0, roundQty(p.stock + delta)) } : p)) };
}

function moveDebt(shop: Shop, s: Sale, delta: number): Shop {
  if (s.payment !== "credit" || !s.clientId || !delta) return shop;
  return { ...shop, clients: shop.clients.map((c) => (c.id === s.clientId ? { ...c, debt: Math.max(0, Math.round(c.debt + delta)) } : c)) };
}

/** Supprime une vente : l'article revient en stock, la dette du client à crédit baisse. */
export function removeSale(shop: Shop, id: string): Shop {
  const s = shop.sales.find((x) => x.id === id);
  if (!s) return shop;
  let next = moveStock(shop, s.productId, stockQty(shop, s));
  next = moveDebt(next, s, -s.amount);
  return { ...next, sales: next.sales.filter((x) => x.id !== id) };
}

export type SaleChange = { amount?: number; qty?: number; label?: string };

/** Corrige le prix, la quantité ou le nom d'une vente. Le stock et la dette suivent l'écart. */
export function editSale(shop: Shop, id: string, change: SaleChange): Shop {
  const s = shop.sales.find((x) => x.id === id);
  if (!s) return shop;
  const amount = change.amount !== undefined && Number.isFinite(change.amount) && change.amount > 0 ? Math.round(change.amount) : s.amount;
  const qty = change.qty !== undefined && Number.isFinite(change.qty) && change.qty > 0 && s.qty !== undefined ? roundQty(change.qty) : s.qty;
  const label = change.label?.trim() || s.label;
  const before = stockQty(shop, s);
  const updated: Sale = { ...s, amount, qty, label };
  // Prix d'achat proportionnel à la nouvelle quantité (pour garder le bénéfice juste).
  if (s.cost !== undefined && s.qty && qty && qty !== s.qty) updated.cost = Math.round((s.cost / s.qty) * qty);
  const after = stockQty(shop, updated);
  let next = moveStock(shop, s.productId, before - after);
  next = moveDebt(next, s, amount - s.amount);
  return { ...next, sales: next.sales.map((x) => (x.id === id ? updated : x)) };
}

/** Ventes du jour (pour « vider la caisse »). */
export const todaySales = (shop: Shop): Sale[] => shop.sales.filter((s) => isToday(s.at));

/** Vide la caisse du jour : supprime toutes les ventes d'aujourd'hui (stock et dettes remis comme avant). */
export function clearTodaySales(shop: Shop): Shop {
  return todaySales(shop).reduce((acc, s) => removeSale(acc, s.id), shop);
}

// ---------- Dépenses ----------

/** Supprime une dépense : l'argent revient dans la caisse du jour. (Un achat ou une perte ne change pas le stock.) */
export function removeExpense(shop: Shop, id: string): Shop {
  return { ...shop, expenses: shop.expenses.filter((e) => e.id !== id) };
}

/** Corrige le montant ou le nom d'une dépense. */
export function editExpense(shop: Shop, id: string, change: { amount?: number; label?: string }): Shop {
  return {
    ...shop,
    expenses: shop.expenses.map((e) =>
      e.id === id
        ? { ...e, amount: change.amount !== undefined && Number.isFinite(change.amount) && change.amount > 0 ? Math.round(change.amount) : e.amount, label: change.label?.trim() || e.label }
        : e,
    ),
  };
}
