import { type CartVoid, type Shop, uid } from "../model.ts";
import type { CartLine } from "./checkout.ts";

/**
 * Articles retirés du panier avant encaissement : la fraude de caisse la plus courante
 * (on scanne devant le client, on retire, on garde l'argent). On garde, par article,
 * la plus grande quantité vue dans le panier ; à l'encaissement (ou « Vider », ou si on
 * quitte l'écran) tout ce qui manque par rapport à ce maximum est noté.
 */
export type Peak = Record<string, number>;

const keyOf = (l: Pick<CartLine, "productId" | "retail">) => `${l.productId}|${l.retail ? 1 : 0}`;

/** Met à jour le maximum vu pour chaque article du panier. */
export function bumpPeak(peak: Peak, lines: CartLine[]): Peak {
  let next = peak;
  for (const l of lines) {
    const k = keyOf(l);
    if ((next[k] ?? 0) < l.qty) {
      if (next === peak) next = { ...peak };
      next[k] = l.qty;
    }
  }
  return next;
}

/** Ce qui a été retiré : maximum vu − quantité finale (encaissée). */
export function voidsFrom(shop: Pick<Shop, "products">, peak: Peak, final: CartLine[], by: string, where: CartVoid["where"], at = new Date()): CartVoid[] {
  const kept = new Map<string, number>();
  for (const l of final) kept.set(keyOf(l), (kept.get(keyOf(l)) ?? 0) + l.qty);
  const out: CartVoid[] = [];
  for (const [k, max] of Object.entries(peak)) {
    const qty = Math.round((max - (kept.get(k) ?? 0)) * 1000) / 1000;
    if (qty <= 0) continue;
    const [productId, retail] = k.split("|");
    const p = shop.products.find((x) => x.id === productId);
    const detail = retail === "1" && p?.retail;
    const label = p ? (detail ? `${p.name} (${detail.unit})` : p.name) : "Article";
    const price = p ? (detail ? detail.price : p.price) : 0;
    out.push({ id: uid("v"), at: at.toISOString(), productId, label, qty, amount: Math.round(price * qty), by: by.trim() || "?", where });
  }
  return out;
}

/** Ajoute les retraits en tête (jamais effacés : personne ne peut les supprimer, même le patron). */
export function addVoids<S extends Pick<Shop, "voids">>(shop: S, voids: CartVoid[]): S {
  return voids.length ? { ...shop, voids: [...voids, ...(shop.voids ?? [])] } : shop;
}

const localDay = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
/** Un kilo de riz retiré compte pour 1 article, 3 sachets pour 3. */
const pieces = (q: number) => (Number.isInteger(q) ? q : 1);

export type VoidDay = { count: number; amount: number; byPerson: { name: string; count: number; amount: number }[] };

/** Les retraits du jour, au total et par vendeur (le plus de retraits d'abord). */
export function voidsOfDay(shop: Pick<Shop, "voids">, now = new Date()): VoidDay {
  const day = localDay(now);
  const list = (shop.voids ?? []).filter((v) => localDay(new Date(v.at)) === day);
  const people = new Map<string, { name: string; count: number; amount: number }>();
  for (const v of list) {
    const p = people.get(v.by) ?? { name: v.by, count: 0, amount: 0 };
    p.count += pieces(v.qty);
    p.amount += v.amount;
    people.set(v.by, p);
  }
  return {
    count: list.reduce((a, v) => a + pieces(v.qty), 0),
    amount: list.reduce((a, v) => a + v.amount, 0),
    byPerson: [...people.values()].sort((a, b) => b.count - a.count),
  };
}

export type VoidEvent = { at: string; by: string; where: CartVoid["where"]; items: { label: string; qty: number }[]; amount: number };

/** Les retraits du jour, un par geste (un encaissement, un « Vider »), le plus récent d'abord. */
export function voidEvents(shop: Pick<Shop, "voids">, now = new Date()): VoidEvent[] {
  const day = localDay(now);
  const events = new Map<string, VoidEvent>();
  for (const v of shop.voids ?? []) {
    if (localDay(new Date(v.at)) !== day) continue;
    const key = `${v.at}|${v.by}`;
    const e = events.get(key) ?? { at: v.at, by: v.by, where: v.where, items: [], amount: 0 };
    e.items.push({ label: v.label, qty: v.qty });
    e.amount += v.amount;
    events.set(key, e);
  }
  return [...events.values()].sort((a, b) => b.at.localeCompare(a.at));
}
