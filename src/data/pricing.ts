/**
 * Prix de vente conseillé d'une pièce (demande de Fallou, 13/11/2026) : prix en gros + la main-d'œuvre que
 * CE réparateur prend d'habitude pour ce type de pièce, apprise de ses vraies ventes (« LCD BF6 12 000 − 7 000 »)
 * et de ses réparations rendues. Sans assez d'exemples : une main-d'œuvre de départ par type de pièce.
 * Une pièce chère prend au moins 35 % de son prix en main-d'œuvre (écran d'iPhone…). Arrondi aux 500 F au-dessus.
 */
import type { Product, Shop } from "../model.ts";

export type PartKind = "Écran" | "Batterie" | "Plaquette" | "Dos" | "Connecteur" | "Bouton" | "Nappe" | "Autre";

const KINDS: Array<[PartKind, RegExp]> = [
  ["Écran", /\b(ecran|lcd|lca|tactile|afficheur)\b/],
  ["Batterie", /\b(batterie|batteries|battery)\b/],
  ["Plaquette", /\b(plaquette|plaque|plaquettes)\b/],
  ["Dos", /\b(dos|cover|vitre arriere|chassis)\b/],
  ["Connecteur", /\b(connecteur|contact|contac|charge)\b/],
  ["Bouton", /\b(bouton|volume|power)\b/],
  ["Nappe", /\b(nappe|flex)\b/],
];

const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function kindOf(label: string): PartKind {
  const t = plain(label);
  return KINDS.find(([, rx]) => rx.test(t))?.[0] ?? "Autre";
}

/** Main-d'œuvre de départ (F), avant d'avoir assez de vraies réparations. */
export const DEFAULT_LABOR: Record<PartKind, number> = { Écran: 5000, Batterie: 3000, Plaquette: 1500, Dos: 2000, Connecteur: 1500, Bouton: 1000, Nappe: 2000, Autre: 2000 };

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
};

export type LaborStats = Record<PartKind, { labor: number; examples: number; learned: boolean }>;

/** Ce que le réparateur gagne d'habitude par type de pièce (main-d'œuvre = prix payé − prix de la pièce). */
export function laborStats(shop: Shop): LaborStats {
  const seen = new Map<PartKind, number[]>();
  const note = (kind: PartKind, labor: number) => {
    if (kind === "Autre" || labor <= 0) return;
    seen.set(kind, [...(seen.get(kind) ?? []), labor]);
  };
  for (const s of shop.sales) {
    // Ventes avec le prix de la pièce : « Écran Samsung 11 000 − 4 000 ».
    if (s.cost && s.cost > 0 && s.amount > s.cost) note(kindOf(s.label), s.amount - s.cost);
  }
  for (const r of shop.repairs ?? []) {
    if (r.status !== "rendu" || !r.parts.length || !r.price) continue;
    const cost = r.parts.reduce((a, p) => a + p.cost * (p.qty || 1), 0);
    note(kindOf(r.parts[0]!.label), r.price - cost);
  }
  const out = {} as LaborStats;
  for (const kind of Object.keys(DEFAULT_LABOR) as PartKind[]) {
    const xs = seen.get(kind) ?? [];
    out[kind] = xs.length >= 2 ? { labor: median(xs), examples: xs.length, learned: true } : { labor: DEFAULT_LABOR[kind], examples: xs.length, learned: false };
  }
  return out;
}

const up500 = (n: number) => Math.ceil(n / 500) * 500;

/** Prix conseillé et la main-d'œuvre qu'il contient ; null si on ne connaît pas le prix d'achat. */
export function suggestedPrice(p: Pick<Product, "name" | "cost">, stats: LaborStats): { price: number; labor: number; kind: PartKind } | null {
  if (p.cost === undefined || p.cost <= 0) return null;
  const kind = kindOf(p.name);
  const labor = Math.max(stats[kind].labor, Math.round(p.cost * 0.35));
  const price = up500(p.cost + labor);
  return { price, labor: price - p.cost, kind };
}

/** Met le prix conseillé sur les pièces qui n'ont pas encore de prix de vente (les autres ne bougent pas). */
export function applySuggestedPrices(shop: Shop): { shop: Shop; count: number } {
  const stats = laborStats(shop);
  let count = 0;
  const products = shop.products.map((p) => {
    if (p.price > 0) return p;
    const s = suggestedPrice(p, stats);
    if (!s) return p;
    count++;
    return { ...p, price: s.price };
  });
  return { shop: count ? { ...shop, products } : shop, count };
}
