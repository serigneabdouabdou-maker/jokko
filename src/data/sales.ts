import { type CashSource, type Expense, type Payment, type Sale, type Shop, isToday } from "../model";
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

export type SaleChange = {
  amount?: number;
  qty?: number;
  label?: string;
  /** Prix d'achat total de cette vente (en gros) ; null = pas connu. */
  cost?: number | null;
  /** Espèces / Wave / Orange Money (le crédit ne se change pas ici : il touche la dette). */
  payment?: Payment;
  /** Garder ce prix d'achat dans la fiche de l'article pour les prochaines ventes. */
  keepProductCost?: boolean;
  /** Outil (licence) utilisé pour ce service ; null = sans licence. */
  licenceId?: string | null;
};

/** Paiement d'une réparation / commande / couture (« Réparation R-005 · … ») : son numéro et son carnet. */
function jobOf(label: string): { book: "repairs" | "couture"; number: string } | null {
  const r = /^(?:Réparation|Service · Commande) (R-\d+)/.exec(label);
  if (r) return { book: "repairs", number: r[1] };
  const c = /^Couture (C-\d+)/.exec(label);
  return c ? { book: "couture", number: c[1] } : null;
}

/** Corrige le prix, la quantité ou le nom d'une vente. Le stock et la dette suivent l'écart. */
export function editSale(shop: Shop, id: string, change: SaleChange): Shop {
  const s = shop.sales.find((x) => x.id === id);
  if (!s) return shop;
  const amount = change.amount !== undefined && Number.isFinite(change.amount) && (change.amount > 0 || (change.amount === 0 && s.amount === 0)) ? Math.round(change.amount) : s.amount;
  const qty = change.qty !== undefined && Number.isFinite(change.qty) && change.qty > 0 && s.qty !== undefined ? roundQty(change.qty) : s.qty;
  const label = change.label?.trim() || s.label;
  const before = stockQty(shop, s);
  const updated: Sale = { ...s, amount, qty, label };
  // Prix d'achat proportionnel à la nouvelle quantité (pour garder le bénéfice juste).
  if (s.cost !== undefined && s.qty && qty && qty !== s.qty) updated.cost = Math.round((s.cost / s.qty) * qty);
  if (change.cost !== undefined) {
    if (change.cost === null || !Number.isFinite(change.cost)) delete updated.cost;
    else updated.cost = Math.max(0, Math.round(change.cost));
  }
  if (change.licenceId !== undefined) {
    if (change.licenceId) updated.licenceId = change.licenceId;
    else delete updated.licenceId;
  }
  // Le moyen de paiement se corrige entre espèces, Wave et Orange Money (la caisse et le canal suivent).
  const cashLike = (p?: Payment) => !p || p === "especes" || p === "wave" || p === "om";
  if (change.payment && cashLike(change.payment) && cashLike(s.payment)) {
    if (change.payment === "especes") delete updated.payment;
    else updated.payment = change.payment;
  }
  const after = stockQty(shop, updated);
  let next = moveStock(shop, s.productId, before - after);
  next = moveDebt(next, s, amount - s.amount);
  // Paiement d'une réparation / couture : le « déjà payé » du carnet suit le nouveau montant.
  const job = jobOf(s.label);
  const delta = amount - s.amount;
  if (job && delta) {
    if (job.book === "repairs") next = { ...next, repairs: (next.repairs ?? []).map((r) => (r.number === job.number ? { ...r, paid: Math.max(0, r.paid + delta) } : r)) };
    else next = { ...next, couture: (next.couture ?? []).map((o) => (o.number === job.number ? { ...o, paid: Math.max(0, o.paid + delta) } : o)) };
  }
  if (change.keepProductCost && s.productId && !s.retail && updated.cost !== undefined && (updated.qty ?? 1) > 0) {
    const unit = Math.round(updated.cost / (updated.qty ?? 1));
    next = { ...next, products: next.products.map((p) => (p.id === s.productId ? { ...p, cost: unit } : p)) };
  }
  return { ...next, sales: next.sales.map((x) => (x.id === id ? updated : x)) };
}

/** Ventes du jour (pour « vider la caisse »). */
export const todaySales = (shop: Shop): Sale[] => shop.sales.filter((s) => isToday(s.at));

/** Vide la caisse du jour : supprime toutes les ventes d'aujourd'hui (stock et dettes remis comme avant). */
export function clearTodaySales(shop: Shop): Shop {
  return todaySales(shop).reduce((acc, s) => removeSale(acc, s.id), shop);
}

// ---------- Dépenses ----------

/**
 * Supprime une dépense : l'argent revient dans la caisse du jour.
 * Achat de marchandise supprimé : les articles sortent du stock (jamais sous 0).
 * Perte supprimée (erreur) : les articles reviennent dans le stock.
 * Anciennes lignes sans article noté : le stock ne bouge pas (à corriger dans Stock).
 */
export function removeExpense(shop: Shop, id: string): Shop {
  const e = shop.expenses.find((x) => x.id === id);
  const expenses = shop.expenses.filter((x) => x.id !== id);
  const delta = stockDelta(e);
  if (!e?.productId || !delta) return { ...shop, expenses };
  return {
    ...shop,
    expenses,
    products: shop.products.map((p) => (p.id === e.productId ? { ...p, stock: Math.max(0, Math.round((p.stock + delta) * 1000) / 1000) } : p)),
  };
}

/** Ce que la suppression change au stock : − pour un achat, + pour une perte, 0 sinon. */
export function stockDelta(e: Pick<Expense, "kind" | "productId" | "qty"> | undefined): number {
  if (!e?.productId || !e.qty || !(e.qty > 0)) return 0;
  return e.kind === "achat" ? -e.qty : e.kind === "perte" ? e.qty : 0;
}

/** Corrige le montant ou le nom d'une dépense. */
export function editExpense(shop: Shop, id: string, change: { amount?: number; label?: string; paidWith?: CashSource }): Shop {
  return {
    ...shop,
    expenses: shop.expenses.map((e) =>
      e.id === id
        ? {
            ...e,
            amount: change.amount !== undefined && Number.isFinite(change.amount) && change.amount > 0 ? Math.round(change.amount) : e.amount,
            label: change.label?.trim() || e.label,
            ...(change.paidWith && e.kind !== "perte" ? { paidWith: change.paidWith } : {}),
          }
        : e,
    ),
  };
}
