/**
 * Commandes au fournisseur (demande de Fallou, 13/11/2026) : Jokko prépare ce qu'il faut acheter.
 * - notées par le patron, ou cherchées sans résultat (« un client demande l'écran X, je ne l'ai pas ») : gardées (`shop.toOrder`) ;
 * - conseils calculés : stock sous le seuil, pièces qui partent (ventes + réparations des 30 derniers jours)
 *   et qui vont manquer, pièces des appareils au dépôt qui ne sont pas en stock.
 * Le message de commande est prêt pour WhatsApp ; « Reçu » ajoute au stock.
 */
import { type Expense, isLow, type OrderLine, type Product, type Shop, uid } from "../model.ts";
import { productNamedIn, squash } from "./partSearch.ts";

const DAY = 86_400_000;
const PREPARED = /^(plat|portion|part|verre|baguette)s?$/i;

/** Combien d'unités de chaque article sont parties en 30 jours (ventes + pièces posées sur les réparations). */
export function usageMap(shop: Shop, now = new Date(), days = 30): Map<string, number> {
  const since = now.getTime() - days * DAY;
  const used = new Map<string, number>();
  const bump = (id: string, n: number) => used.set(id, (used.get(id) ?? 0) + n);
  for (const s of shop.sales) if (s.productId && !s.retail && Date.parse(s.at) >= since) bump(s.productId, s.qty ?? 1);
  for (const r of shop.repairs ?? []) {
    if (r.status === "annule" || Date.parse(r.repairedAt ?? r.at) < since) continue;
    for (const p of r.parts) if (p.productId) bump(p.productId, p.qty || 1);
  }
  return used;
}

export const usage = (shop: Shop, productId: string, now = new Date(), days = 30): number => usageMap(shop, now, days).get(productId) ?? 0;

export type Advice = { key: string; productId?: string; name: string; qty: number; cost?: number; reason: string; line?: OrderLine };

/**
 * La commande prête : les lignes gardées (notées, cherchées, conseils modifiés) + les conseils de Jokko,
 * qui y entrent tout seuls (commande automatique) sauf ceux écartés depuis moins de 7 jours.
 */
export function orderPlan(shop: Shop, now = new Date()): { order: Advice[]; advice: Advice[]; ready: Advice[]; total: number } {
  const byId = new Map(shop.products.map((p) => [p.id, p]));
  const lines = shop.toOrder ?? [];
  const ignored = new Set(lines.filter((l) => l.qty <= 0 && l.productId && now.getTime() - Date.parse(l.at) < 7 * DAY).map((l) => l.productId!));
  const order: Advice[] = lines.filter((l) => l.qty > 0).map((l) => {
    const p = l.productId ? byId.get(l.productId) : undefined;
    const reason = l.why === "recherche" ? "un client l'a demandée" : l.why === "conseil" ? "conseil de Jokko" : "notée par toi";
    return { key: l.id, ...(p ? { productId: p.id, cost: p.cost } : {}), name: p?.name ?? l.name, qty: l.qty, reason, line: l };
  });
  const taken = new Set([...order.flatMap((o) => (o.productId ? [o.productId] : [])), ...ignored]);
  const advice: Advice[] = [];
  const add = (p: Product, qty: number, reason: string) => {
    if (taken.has(p.id)) return;
    taken.add(p.id);
    advice.push({ key: `conseil-${p.id}`, productId: p.id, name: p.name, qty: Math.max(1, Math.round(qty)), ...(p.cost !== undefined ? { cost: p.cost } : {}), reason });
  };
  // 1) Appareils au dépôt qui attendent une pièce qu'on n'a pas.
  const waiting = new Map<string, string[]>();
  for (const r of shop.repairs ?? []) {
    if (r.status !== "depot") continue;
    const p = productNamedIn(shop.products, r.problem);
    if (p && p.stock <= 0) waiting.set(p.id, [...(waiting.get(p.id) ?? []), r.number]);
  }
  for (const [id, numbers] of waiting) add(byId.get(id)!, numbers.length, `pour ${numbers.join(", ")} au dépôt`);
  // 2) Stock sous le seuil, ou pièces qui partent et ne tiendront pas une semaine.
  const usedMap = usageMap(shop, now);
  for (const p of shop.products) {
    // Plats et portions préparés (restaurant, boulangerie) : on les cuisine, on ne les commande pas.
    if (PREPARED.test(p.unit.trim())) continue;
    const used = usedMap.get(p.id) ?? 0;
    const twoWeeks = Math.ceil((used * 14) / 30);
    if (isLow(p)) add(p, Math.max(p.min * 2 - p.stock, twoWeeks - p.stock, 1), `il en reste ${fmt(p.stock)} (seuil ${fmt(p.min)})`);
    else if (used > 0 && p.stock < Math.max(1, Math.ceil((used * 7) / 30)))
      add(p, Math.max(twoWeeks - p.stock, 1), p.stock <= 0 ? `fini ; ${used} partie${used > 1 ? "s" : ""} en 30 jours` : `il en reste ${fmt(p.stock)} ; ${used} parties en 30 jours`);
  }
  const ready = [...order, ...advice];
  const total = ready.reduce((a, o) => a + (o.cost ?? 0) * o.qty, 0);
  return { order, advice, ready, total };
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toLocaleString("fr-FR", { maximumFractionDigits: 2 }));

/** Ajoute à la commande (même article ou même nom : la quantité s'ajoute). */
export function addToOrder(shop: Shop, input: { name: string; productId?: string; qty?: number; why: OrderLine["why"] }, now = new Date()): Shop {
  const name = input.name.replace(/\s+/g, " ").trim();
  if (!name) return shop;
  const qty = Math.max(1, Math.round(input.qty ?? 1));
  const list = shop.toOrder ?? [];
  const same = list.find((l) => (input.productId ? l.productId === input.productId : !l.productId && squash(l.name) === squash(name)));
  const toOrder = same
    ? list.map((l) => (l === same ? { ...l, qty: (l.qty > 0 ? l.qty : 0) + qty } : l))
    : [...list, { id: uid("cmd"), at: now.toISOString(), ...(input.productId ? { productId: input.productId } : {}), name, qty, why: input.why }];
  return { ...shop, toOrder };
}

export function setOrderQty(shop: Shop, id: string, qty: number): Shop {
  const q = Math.round(qty);
  return { ...shop, toOrder: (shop.toOrder ?? []).flatMap((l) => (l.id !== id ? [l] : q > 0 ? [{ ...l, qty: q }] : [])) };
}

export function removeFromOrder(shop: Shop, id: string): Shop {
  return { ...shop, toOrder: (shop.toOrder ?? []).filter((l) => l.id !== id) };
}

/**
 * Changer une ligne de la commande prête : un conseil devient une ligne gardée avec la nouvelle quantité ;
 * 0 sur un conseil = « pas cette fois » (écarté 7 jours).
 */
export function changeLine(shop: Shop, line: Advice, qty: number, now = new Date()): Shop {
  const q = Math.max(0, Math.round(qty));
  if (line.line) return q > 0 ? setOrderQty(shop, line.line.id, q) : removeFromOrder(shop, line.line.id);
  const rest = (shop.toOrder ?? []).filter((l) => !(line.productId && l.productId === line.productId));
  return { ...shop, toOrder: [...rest, { id: uid("cmd"), at: now.toISOString(), ...(line.productId ? { productId: line.productId } : {}), name: line.name, qty: q, why: "conseil" }] };
}

/** Message prêt pour le fournisseur : « 4 Écran Tecno BF6 » par ligne, comme ses factures. */
export function orderMessage(shop: Shop, order: Advice[]): string {
  const lines = order.map((o) => `${o.qty} ${o.name}`);
  return [`Salaam, commande de ${shop.name} :`, ...lines, "Merci !"].join("\n");
}

/** WhatsApp sans numéro : le patron choisit son fournisseur dans ses contacts (quand aucun numéro n'est noté). */
export const shareOnWhatsapp = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

/**
 * Commande reçue : chaque pièce entre dans le stock (une pièce cherchée qui n'existait pas devient un article).
 * Payée avec l'argent de la caisse : une sortie « achat » par ligne (la caisse reste juste ; ce n'est pas une dépense du bénéfice).
 */
export function receiveOrder(shop: Shop, lines: Array<Pick<Advice, "productId" | "name" | "qty">>, opts: { fromCash: boolean } = { fromCash: false }, now = new Date()): { shop: Shop; count: number } {
  if (!lines.length) return { shop, count: 0 };
  let products = [...shop.products];
  const expenses: Expense[] = [];
  for (const l of lines) {
    let p = l.productId ? products.find((x) => x.id === l.productId) : undefined;
    if (p) {
      const next = { ...p, stock: p.stock + l.qty };
      products = products.map((x) => (x.id === next.id ? next : x));
      p = next;
    } else {
      p = { id: uid("p"), name: l.name.charAt(0).toUpperCase() + l.name.slice(1), unit: "pièce", stock: l.qty, min: 0, price: 0 };
      products = [...products, p];
    }
    if (opts.fromCash && p.cost) expenses.push({ id: uid("e"), at: now.toISOString(), label: `Achat ${l.qty} ${p.name}`, amount: p.cost * l.qty, kind: "achat", productId: p.id, qty: l.qty });
  }
  // Les lignes reçues quittent la commande ; les conseils écartés restent écartés.
  const toOrder = (shop.toOrder ?? []).filter((l) => l.qty <= 0);
  return { shop: { ...shop, products, expenses: [...expenses, ...shop.expenses], toOrder }, count: lines.length };
}
