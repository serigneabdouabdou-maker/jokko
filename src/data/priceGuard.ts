/**
 * Barrière des prix (22/11/2026, demande de Fallou : « une barrière de sécurité énorme : jamais une seule somme sur
 * la réparation d'un écran ; me proposer pour chaque écran 2 ou 3 prix, dont un minimum qu'il ne faut jamais
 * dépasser, qui me protège sur le bénéfice, les charges, les dépenses ; les prix d'achat suivent le fournisseur »).
 *
 * - `needsPart` : une panne qui demande une pièce (écran, batterie, connecteur…) ne s'enregistre pas « sans pièce »,
 *   sauf raison dite (pièce apportée par le client, réparé sans changer de pièce).
 * - `priceLadder` : 3 prix calculés pour chaque pièce : normal (ton gain habituel), négocié (70 % du gain),
 *   minimum (prix d'achat + part des charges par travail + risque casse/garantie + un petit gain) : en dessous, tu perds.
 * - `supplierPriceUpdates` : les prix d'achat du stock qui ne suivent plus les derniers prix du fournisseur.
 */
import type { Product, Shop } from "../model.ts";
import { partForSale } from "./partSearch.ts";
import { kindOf, laborStats } from "./pricing.ts";
import { licenceCharge } from "./services.ts";
import { screenGains } from "./workshopStats.ts";

const DAY = 86_400_000;
const up500 = (n: number) => Math.ceil(n / 500) * 500;
const near500 = (n: number) => Math.round(n / 500) * 500;

/** Pannes qui demandent une pièce : jamais enregistrées sans pièce sans raison. */
export const NEEDS_PART = /[ée]cran|lcd|tactile|afficheur|batterie|connecteur|ne charge|charge pas|vitre|\bdos\b|cover|bouton|nappe|cam[ée]ra|haut[- ]parleur|cass[ée]/i;
export const needsPart = (problem: string) => NEEDS_PART.test(problem);

/** Une vente qui parle d'une pièce (écran, batterie…). */
export const PART_SALE = /[ée]cran|lcd|tactile|batterie|connecteur|vitre|\bdos\b|cover|nappe|cam[ée]ra|plaquette/i;
const SKILL_WORDS = /d[ée]cod|d[ée]bloc|\bfrp\b|flash|configur|r[ée]glage|logiciel|formatage|mise [àa] jour|compte/i;

/** « … pièce 3 700 », « achat 3700 », « acheté à 3 700 », « prix d'achat 3 700 » : le prix de la pièce dit dans la phrase. */
export function partCostSaid(text: string): number | undefined {
  const m = /(?:pi[eè]ce|achat|achet[ée]e?|prix d'achat|en gros|ndiay)\s*(?:à|a|de|:|=)?\s*(\d[\d .]*\d|\d)/i.exec(text);
  const n = m ? Number(m[1]!.replace(/[ .]/g, "")) : NaN;
  return Number.isFinite(n) && n >= 100 ? n : undefined;
}

/**
 * Vente d'une réparation de pièce dite avec une seule somme (« réparation écran BF6 10 000 ») : il manque le prix
 * de la pièce. Renvoie ce qu'il faut demander (null = rien à demander).
 */
export function missingPartCost(text: string, product?: Pick<Product, "cost">, cost?: number): string | null {
  if (cost !== undefined || (product && product.cost !== undefined) || !PART_SALE.test(text) || SKILL_WORDS.test(text)) return null;
  return "le prix d'achat de la pièce (redis par exemple « écran BF6 10 000, pièce 3 700 ») : sans lui, le bénéfice serait faux";
}

/** Les seules raisons acceptées pour une panne de pièce sans pièce notée (écrites dans la panne). */
export const NO_PART_REASONS = ["pièce apportée par le client", "réparé sans changer de pièce"] as const;
export const hasNoPartReason = (problem: string) => NO_PART_REASONS.some((r) => problem.toLowerCase().includes(r));

/**
 * Part des charges par travail (30 derniers jours) : dépenses (loyer, électricité, transport…) + part des licences,
 * divisées par les travaux faits (réparations reçues + services). Moins de 8 travaux : 1 000 F (hypothèse de départ).
 */
export function overheadPerJob(shop: Shop, now = new Date()): { amount: number; learned: boolean } {
  const from = now.getTime() - 30 * DAY;
  const spent = shop.expenses.filter((e) => Date.parse(e.at) >= from && (e.kind ?? "depense") === "depense").reduce((a, e) => a + e.amount, 0)
    + licenceCharge(shop, new Date(from), now);
  const jobs = (shop.repairs ?? []).filter((r) => r.status !== "annule" && Date.parse(r.at) >= from).length
    + shop.sales.filter((s) => s.label.startsWith("Service · ") && Date.parse(s.at) >= from).length;
  if (jobs < 8) return { amount: 1000, learned: false };
  return { amount: Math.min(5000, Math.max(300, Math.round(spent / jobs))), learned: true };
}

export type Ladder = {
  cost: number;
  /** Prix à annoncer : ton gain habituel sur ce genre de pièce. */
  normal: number;
  /** Prix pour négocier : 70 % de ton gain habituel. */
  nego: number;
  /** Jamais en dessous : prix d'achat + charges + risque + petit gain. */
  floor: number;
  labor: number;
  overhead: number;
  risk: number;
  examples: number;
};

/** Ton gain habituel pour cette pièce : écrans par gamme (iPhone, < 5 000, 5 000–8 000, ≥ 8 000), sinon par type. */
export type LadderContext = { gains: ReturnType<typeof screenGains>; stats: ReturnType<typeof laborStats>; overhead: number };

/** Ce qui sert à tous les prix d'une boutique, calculé une seule fois (stock de 600 pièces). */
export function ladderContext(shop: Shop, now = new Date()): LadderContext {
  return { gains: screenGains(shop), stats: laborStats(shop), overhead: overheadPerJob(shop, now).amount };
}

export function typicalGain(shop: Shop, name: string, cost: number, ctx?: LadderContext): { labor: number; examples: number } {
  const kind = kindOf(name);
  if (kind === "Écran") {
    const iphone = /iphone/i.test(name);
    const band = (c: number) => (c < 5000 ? 0 : c < 8000 ? 1 : 2);
    const same = (ctx?.gains ?? screenGains(shop)).filter((g) => (iphone ? /iphone/i.test(g.name) : !/iphone/i.test(g.name) && band(g.cost) === band(cost))).map((g) => g.gain);
    if (same.length >= 2) return { labor: Math.round(same.reduce((a, x) => a + x, 0) / same.length), examples: same.length };
    if (iphone) return { labor: Math.max(8000, Math.round(cost * 1.2)), examples: same.length };
  }
  const s = (ctx?.stats ?? laborStats(shop))[kind];
  return { labor: Math.max(s.labor, Math.round(cost * 0.35)), examples: s.examples };
}

/** Les 3 prix d'une pièce (null si le prix d'achat n'est pas connu). */
export function priceLadder(shop: Shop, p: Pick<Product, "name" | "cost">, now = new Date(), ctx?: LadderContext): Ladder | null {
  if (p.cost === undefined || p.cost <= 0) return null;
  const cost = p.cost;
  const { labor, examples } = typicalGain(shop, p.name, cost, ctx);
  // Petite pièce (batterie, connecteur… < 3 000 F) : travail court, 40 % de la part des charges et 1 000 F de gain minimum.
  const small = cost < 3000;
  const overhead = Math.round((ctx?.overhead ?? overheadPerJob(shop, now).amount) * (small ? 0.4 : 1));
  const risk = Math.round(cost * 0.1); // casse à la pose, reprise sous garantie (≈ 10 % des pièces)
  const minGain = cost < 1000 ? 500 : small ? 1000 : Math.max(1500, Math.round(cost * 0.25));
  const floor = Math.max(up500(cost + 500), near500(cost + overhead + risk + minGain));
  // Le prix normal laisse toujours de quoi négocier au-dessus du minimum.
  const normal = Math.max(up500(cost + labor), floor + (small ? 500 : 1500));
  const nego = Math.max(floor, Math.min(normal - 500, up500(cost + labor * 0.7)));
  return { cost, normal, nego, floor, labor, overhead, risk, examples };
}

export type PriceCheck = "ok" | "negocie" | "sous_minimum" | "perte";

/** Où tombe un prix : normal, négocié, sous le minimum (charges pas couvertes), ou à perte (sous le prix d'achat). */
export function checkPrice(l: Ladder, price: number): PriceCheck {
  if (price < l.cost) return "perte";
  if (price < l.floor) return "sous_minimum";
  if (price < l.normal) return "negocie";
  return "ok";
}

export type PriceUpdate = { productId: string; name: string; from: number | undefined; to: number; at: string };

/** Prix d'achat du stock qui ne suivent plus le dernier prix du fournisseur (pièce reconnue par type + modèle). */
export function supplierPriceUpdates(shop: Shop): PriceUpdate[] {
  const out = new Map<string, PriceUpdate>();
  for (const i of (shop.suppliers ?? []).flatMap((s) => s.items ?? [])) {
    const last = i.prices?.[i.prices.length - 1];
    if (!last || i.kind === "Autre") continue;
    // Deux prix le même jour = deux qualités (copie / original) : on ne choisit pas à sa place.
    if ((i.prices ?? []).filter((x) => x[0] === last[0]).length > 1) continue;
    const p = partForSale(shop.products, i.name, kindOf).product;
    if (!p || p.cost === last[1]) continue;
    // « (complet) », « (copie) » : la facture ne dit pas la qualité → on ne touche pas. Écart > 40 % : à vérifier à la main.
    if (/\(/.test(p.name) || (p.cost && Math.abs(last[1] - p.cost) / p.cost > 0.4)) continue;
    const prev = out.get(p.id);
    if (!prev || prev.at < last[0]) out.set(p.id, { productId: p.id, name: p.name, from: p.cost, to: last[1], at: last[0] });
  }
  return [...out.values()].sort((a, b) => b.at.localeCompare(a.at));
}

/** Met les derniers prix du fournisseur dans le stock. */
export function applyPriceUpdates(shop: Shop, updates: PriceUpdate[]): Shop {
  const by = new Map(updates.map((u) => [u.productId, u.to]));
  return { ...shop, products: shop.products.map((p) => (by.has(p.id) ? { ...p, cost: by.get(p.id)! } : p)) };
}
