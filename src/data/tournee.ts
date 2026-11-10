import { type Sale, type Shop, isToday } from "../model.ts";
import { checkout } from "./checkout.ts";
import { editSale, removeSale } from "./sales.ts";

/**
 * Boulangerie : la tournée du matin. Chaque boutique cliente a sa quantité habituelle (« Boutique Modou : 100 baguettes »).
 * « Livré » = une vente à crédit en un toucher (la dette de la boutique monte, le stock baisse).
 * « Retour » = le pain rendu le soir : la livraison du jour baisse, la dette aussi, le pain revient au stock (puis en perte
 * avec la fin de service s'il ne se garde pas).
 */

export type TourneeLine = { productId: string; qty: number };

export function setTournee(shop: Shop, clientId: string, lines: TourneeLine[]): Shop {
  const clean = lines.filter((l) => l.qty > 0).map((l) => ({ productId: l.productId, qty: Math.round(l.qty) }));
  return { ...shop, clients: shop.clients.map((c) => (c.id === clientId ? { ...c, tournee: clean } : c)) };
}

/** Les boutiques clientes de la tournée (celles qui ont une quantité habituelle). */
export const tourneeClients = (shop: Pick<Shop, "clients">) => shop.clients.filter((c) => (c.tournee?.length ?? 0) > 0);

/** Livraisons d'aujourd'hui pour une boutique cliente (ventes à crédit liées à ses articles). */
export function deliveriesToday(shop: Pick<Shop, "sales">, clientId: string): Sale[] {
  return shop.sales.filter((s) => s.clientId === clientId && s.payment === "credit" && s.productId && isToday(s.at));
}

/** Livre la tournée habituelle (ou des quantités changées pour aujourd'hui) à crédit. */
export function deliver(shop: Shop, clientId: string, lines?: TourneeLine[]): { shop: Shop; amount: number } | null {
  const client = shop.clients.find((c) => c.id === clientId);
  const todo = (lines ?? client?.tournee ?? []).filter((l) => l.qty > 0 && shop.products.some((p) => p.id === l.productId));
  if (!client || !todo.length) return null;
  const done = checkout(shop, todo.map((l) => ({ productId: l.productId, retail: false, qty: l.qty })), "credit", clientId);
  return done ? { shop: done.shop, amount: done.amount ?? 0 } : null;
}

/** Pain rendu : baisse la livraison du jour de ce produit (la plus récente d'abord), la dette et remet le pain au stock. */
export function returnItems(shop: Shop, clientId: string, productId: string, qty: number): { shop: Shop; returned: number } {
  let left = Math.max(0, Math.round(qty));
  let next = shop;
  const list = deliveriesToday(shop, clientId).filter((s) => s.productId === productId).sort((a, b) => b.at.localeCompare(a.at));
  for (const s of list) {
    if (!left) break;
    const sold = s.qty ?? 0;
    if (sold <= left) {
      next = removeSale(next, s.id);
      left -= sold;
    } else {
      const unit = s.amount / sold;
      next = editSale(next, s.id, { qty: sold - left, amount: Math.round(unit * (sold - left)) });
      left = 0;
    }
  }
  return { shop: next, returned: Math.max(0, Math.round(qty)) - left };
}
