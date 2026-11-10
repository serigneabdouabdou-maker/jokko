import { applyDraft, roundQty, type Applied } from "../assistant/apply";
import { type Payment, PAYMENT_LABELS, type Product, type Shop, money } from "../model";

/** Caisse par scan : un panier d'articles, puis un seul encaissement. */

/** price : prix d'une unité dit par le commerçant (sinon le prix du stock). */
export type CartLine = { productId: string; retail: boolean; qty: number; price?: number };

const DAY = 86_400_000;

export function unitPrice(product: Product, retail: boolean): number {
  return retail && product.retail ? product.retail.price : product.price;
}

export function unitName(product: Product, retail: boolean): string {
  return retail && product.retail ? product.retail.unit : product.unit;
}

/** Un scan de plus : la ligne existante monte de 1, sinon une nouvelle ligne en haut du panier. */
export function addToCart(lines: CartLine[], productId: string, retail: boolean, qty = 1): CartLine[] {
  const i = lines.findIndex((l) => l.productId === productId && l.retail === retail);
  if (i >= 0) return lines.map((l, j) => (j === i ? { ...l, qty: roundQty(l.qty + qty) } : l));
  return [{ productId, retail, qty }, ...lines];
}

export function setQty(lines: CartLine[], index: number, qty: number): CartLine[] {
  return qty <= 0 ? lines.filter((_, j) => j !== index) : lines.map((l, j) => (j === index ? { ...l, qty: roundQty(qty) } : l));
}

export function cartTotal(shop: Shop, lines: CartLine[]): number {
  return lines.reduce((sum, l) => {
    const p = shop.products.find((x) => x.id === l.productId);
    return p ? sum + Math.round(l.qty * (l.price ?? unitPrice(p, l.retail))) : sum;
  }, 0);
}

/** Articles dont le stock ne suffit pas pour le panier (on peut quand même vendre : le stock était peut-être faux). */
export function shortages(shop: Shop, lines: CartLine[]): string[] {
  const out: string[] = [];
  for (const l of lines) {
    const p = shop.products.find((x) => x.id === l.productId);
    if (!p) continue;
    const need = l.retail && p.retail ? l.qty / p.retail.perUnit : l.qty;
    if (need > p.stock + 1e-9) out.push(p.name);
  }
  return out;
}

/**
 * Encaisser le panier : une vente par ligne (stock, coût, bénéfice comme à la voix), le moyen de paiement
 * sur chaque vente, et pour un crédit, la dette du client. Renvoie null si le panier est vide ou si un crédit n'a pas de client.
 */
export function checkout(shop: Shop, lines: CartLine[], payment: Payment, clientId: string | null = null): Applied | null {
  if (!lines.length) return null;
  const client = clientId ? shop.clients.find((c) => c.id === clientId) : undefined;
  if (payment === "credit" && !client) return null;
  let current = shop;
  const ids: string[] = [];
  for (const line of lines) {
    const product = current.products.find((p) => p.id === line.productId);
    if (!product || line.qty <= 0) continue;
    const applied = applyDraft(current, {
      type: "sale",
      productId: product.id,
      productName: product.name,
      quantity: line.qty,
      amount: null,
      clientId: client?.id ?? null,
      clientName: null,
      label: null,
      unit: unitName(product, line.retail),
      unitPrice: line.price ?? null,
    });
    if (!applied) continue;
    current = applied.shop;
    ids.push(current.sales[0].id);
  }
  if (!ids.length) return null;
  const mine = new Set(ids);
  // Un encaissement = un seul ticket : toutes les lignes prennent le numéro de la première.
  const ticket = current.sales.find((s) => s.id === ids[0])?.ticket;
  const total = current.sales.filter((s) => mine.has(s.id)).reduce((a, s) => a + s.amount, 0);
  current = {
    ...current,
    sales: current.sales.map((s) => (mine.has(s.id) ? { ...s, ...(ticket ? { ticket } : {}), ...(payment !== "especes" ? { payment } : {}), ...(client ? { clientId: client.id } : {}) } : s)),
  };
  if (payment === "credit" && client) {
    const dueAt = client.debt > 0 && client.dueAt ? client.dueAt : new Date(Date.now() + 30 * DAY).toISOString();
    current = { ...current, clients: current.clients.map((c) => (c.id === client.id ? { ...c, debt: c.debt + total, dueAt } : c)) };
  }
  const count = ids.length;
  return {
    shop: current,
    amount: total,
    summary: `Caisse · ${count} article${count > 1 ? "s" : ""} · ${money(total)} · ${PAYMENT_LABELS[payment]}${client ? ` · ${client.name}` : ""}`,
  };
}
