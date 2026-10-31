import type { Product, Shop } from "../model";
import { roundQty, unitKey } from "./apply";
import { pickByName } from "./liveDesk";
import { FILLERS, plain, quantityIn, repeated } from "./order";
import { spokenAmountToFrancs } from "./wolofNumbers";

/**
 * Entrer le stock en parlant ou en écrivant, pour ceux qui n'aiment pas les formulaires :
 * « 10 sacs de riz à 18 000, acheté à 16 000 ; 5 bidons d'huile à 7 500 ; 20 savons à 300 ».
 * Les articles connus montent en stock (et changent de prix si un prix est dit) ; les autres sont créés.
 * Tout est montré au patron avant d'être enregistré.
 */

export type StockDraft = {
  /** Article existant, ou null pour un nouvel article */
  productId: string | null;
  name: string;
  qty: number;
  /** Unité dite (sac, bidon…) ; pour un article existant au détail, la quantité est convertie en gros. */
  unit: string;
  retail: boolean;
  price: number | null;
  cost: number | null;
};

const STOCK_WORDS = new Set([
  "au", "aux", "en", "dans", "ajoute", "ajouter", "ajoutes", "mets", "mettre", "stock", "dugal", "yokk", "j", "ai", "recu", "il", "y", "a", "nouveau", "nouvel",
  "article", "articles", "prix", "vente", "achat", "achete", "chacun", "chacune", "le", "la", "piece", "unite", "naa", "na", "f", "francs", "fcfa",
]);

const NUM = "(\\d[\\d\\s.\\u202f\\u00a0]*\\d|\\d+)(\\s*(?:mille|millions?|k))?";

function amountAt(match: RegExpMatchArray | null): number | null {
  if (!match) return null;
  return spokenAmountToFrancs(`${match[1]}${match[2] ?? ""}`)?.francs ?? null;
}

/** Prix d'achat et prix de vente dits dans un morceau de phrase. */
function pricesIn(segment: string): { price: number | null; cost: number | null; rest: string } {
  let rest = segment;
  const costMatch = rest.match(new RegExp(`(?:prix\\s+d['’ ]?achat|achet[ée]e?s?|achat|co[uû]t(?:ant)?|revient)\\s*(?:à|a|de|:)?\\s*${NUM}`, "i"));
  const cost = amountAt(costMatch);
  if (costMatch) rest = rest.replace(costMatch[0], " ");
  const priceMatch = rest.match(new RegExp(`(?:prix\\s+de\\s+vente|vendu|vente|prix|(?:^|\\s)à|(?:^|\\s)a)\\s*(?:à|a|de|:)?\\s*${NUM}`, "i"));
  const price = amountAt(priceMatch);
  if (priceMatch) rest = rest.replace(priceMatch[0], " ");
  return { price, cost, rest };
}

const singular = (unit: string) => (unit.length > 3 && unit.endsWith("s") ? unit.slice(0, -1) : unit);
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Lit une liste de stock en vrac. Les articles cités plusieurs fois sont regroupés. */
export function parseStockList(text: string, shop: Shop): StockDraft[] {
  const drafts: StockDraft[] = [];
  const segments = text
    .split(/[,;\n]+|\s\+\s|\s(?:et|puis)\s|\sak\s(?=(?:benn|[nñ]aari|[nñ]etti|[nñ]eenti|jur[oó]+mi|fukki|\d))/i)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const raw of segments) {
    const { price, cost, rest } = pricesIn(raw);
    const words = plain(rest).split(" ").filter(Boolean);
    const { qty, unit, rest: nameWords } = quantityIn(words);
    const kept = nameWords.filter((w) => !FILLERS.has(w) && !STOCK_WORDS.has(w));
    // « …, acheté à 16 000 » : un morceau sans article complète l'article d'avant.
    if (!kept.length) {
      const last = drafts.at(-1);
      if (last) {
        last.price = price ?? last.price;
        last.cost = cost ?? last.cost;
      }
      continue;
    }
    const rep = qty === null ? repeated(kept) : { words: kept, times: 1 };
    const name = rep.words.join(" ");
    const found = pickByName(shop.products, name).item;
    const retail = Boolean(found?.retail && unit && unitKey(unit) === unitKey(found.retail.unit));
    const draft: StockDraft = {
      productId: found?.id ?? null,
      name: found?.name ?? capital(name),
      qty: qty ?? rep.times,
      unit: found ? (retail ? found.retail!.unit : found.unit) : singular(unit ?? "pièce"),
      retail,
      price,
      cost,
    };
    const same = drafts.find((d) => (d.productId ? d.productId === draft.productId : !draft.productId && plain(d.name) === plain(draft.name)) && d.retail === draft.retail);
    if (same) {
      same.qty = roundQty(same.qty + draft.qty);
      same.price = draft.price ?? same.price;
      same.cost = draft.cost ?? same.cost;
    } else drafts.push(draft);
  }
  return drafts;
}

/**
 * Enregistre les lignes validées par le patron : stock + (au détail, converti en gros),
 * prix changés seulement s'ils sont dits, nouveaux articles créés.
 */
export function applyStockDrafts(shop: Shop, drafts: StockDraft[], makeId: () => string): { shop: Shop; summary: string } {
  let products = shop.products;
  let added = 0;
  let created = 0;
  for (const d of drafts) {
    if (!(d.qty >= 0) || !d.name.trim()) continue;
    const existing = d.productId ? products.find((p) => p.id === d.productId) : undefined;
    if (existing) {
      const delta = d.retail && existing.retail ? d.qty / existing.retail.perUnit : d.qty;
      const next: Product = { ...existing, stock: roundQty(existing.stock + delta) };
      if (d.price !== null && d.price >= 0) {
        if (d.retail && next.retail) next.retail = { ...next.retail, price: Math.round(d.price) };
        else next.price = Math.round(d.price);
      }
      if (d.cost !== null && d.cost >= 0) next.cost = Math.round(d.retail && existing.retail ? d.cost * existing.retail.perUnit : d.cost);
      products = products.map((p) => (p.id === existing.id ? next : p));
      added++;
    } else {
      const fresh: Product = { id: makeId(), name: d.name.trim(), unit: d.unit.trim() || "pièce", stock: roundQty(d.qty), min: 1, price: Math.round(d.price ?? 0) };
      if (d.cost !== null && d.cost >= 0) fresh.cost = Math.round(d.cost);
      products = [...products, fresh];
      created++;
    }
  }
  const parts = [added ? `${added} article${added > 1 ? "s" : ""} mis à jour` : "", created ? (created > 1 ? `${created} nouveaux articles` : "1 nouvel article") : ""].filter(Boolean);
  return { shop: { ...shop, products }, summary: `Stock · ${parts.join(" · ") || "rien à changer"}` };
}

/** Changer les prix en lot : + ou − un pourcentage ou un montant, arrondi aux 5 F (la plus petite pièce). */
export function adjustPrices(shop: Shop, ids: string[] | "tous", change: { kind: "pourcent" | "francs"; value: number }, withRetail = true): Shop {
  const round5 = (n: number) => Math.max(0, Math.round(n / 5) * 5);
  const apply = (price: number) => round5(change.kind === "pourcent" ? price * (1 + change.value / 100) : price + change.value);
  return {
    ...shop,
    products: shop.products.map((p) => {
      if (ids !== "tous" && !ids.includes(p.id)) return p;
      const next: Product = { ...p, price: apply(p.price) };
      if (withRetail && p.retail) next.retail = { ...p.retail, price: change.kind === "pourcent" ? apply(p.retail.price) : p.retail.price };
      return next;
    }),
  };
}
