/**
 * Recherche d'un article par son nom ou ses autres noms (demande de Fallou, 13/11/2026) :
 * le réparateur tape « BF6 » et trouve l'écran qui va sur le BF6, même si c'est un écran universel
 * rangé sous un autre nom (« Écran Tecno KI5K », qui va aussi sur BF6, BF7, A60…).
 * Les téléphones compatibles sont les « autres noms » de l'article (`aliases`).
 */
import type { Product } from "../model.ts";
import { modelKeys } from "./modelKeys.ts";

/** « Écran Tecno BF6 » → « ecrantecnobf6 » : sans accents, sans espaces ni ponctuation. */
export const squash = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9+]/g, "");

const tokensOf = (s: string): string[] =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9+]+/)
    .filter((t) => t.length >= 2 || /^\d$/.test(t));

const SUFFIX = /^(pro|max|plus|lite|mini|promax|ultra|neo|prime)/;
/**
 * « a05 » est dans « écran samsung a05s » ? Non (22/11/2026, constat de Fallou : l'A05 n'a rien à voir avec le BF6,
 * mais « A05 » trouvait l'alias « A05S »). Un modèle (mot avec un chiffre) doit finir là, ou être suivi d'un mot
 * comme pro / max / plus (« iPhone 11 » trouve « iPhone 11 Pro Max ») ; jamais d'une lettre ou d'un chiffre en plus.
 */
export function holds(text: string, w: string): boolean {
  if (!/\d/.test(w)) return text.includes(w);
  for (let i = text.indexOf(w); i >= 0; i = text.indexOf(w, i + 1)) {
    const before = text[i - 1];
    if (before && /\d/.test(before)) continue;
    const rest = text.slice(i + w.length);
    if (!rest || SUFFIX.test(rest)) return true;
  }
  return false;
}

export type ProductHit = {
  product: Product;
  /** Trouvé par un téléphone compatible (« va aussi sur BF6 ») plutôt que par son nom. */
  via?: string;
  score: number;
};

/**
 * Articles qui correspondent à ce qui est tapé, les plus sûrs d'abord :
 * nom qui contient tous les mots, puis téléphone compatible ; en stock avant « à commander ».
 */
export function searchProducts(products: Product[], query: string, limit = 8): ProductHit[] {
  const whole = squash(query);
  if (whole.length < 2) return [];
  const tokens = tokensOf(query);
  const words = tokens.length ? tokens : [whole];
  const hits: ProductHit[] = [];
  for (const product of products) {
    const name = squash(product.name);
    const nameWords = new Set(tokensOf(product.name));
    const aliases = (product.aliases ?? []).map((a) => ({ raw: a, key: squash(a) })).filter((a) => a.key);
    let score = 0;
    let via: string | undefined;
    if (holds(name, whole) || words.every((w) => holds(name, w))) {
      score = 30 + words.filter((w) => nameWords.has(w)).length * 3;
    } else {
      // Un mot peut venir du nom (« écran »), l'autre d'un téléphone compatible (« bf6 »).
      const exact = aliases.find((a) => a.key === whole);
      const byAlias = exact ?? aliases.find((a) => holds(a.key, whole) || words.some((w) => w.length >= 2 && /\d/.test(w) && a.key === w));
      const all = words.every((w) => holds(name, w) || aliases.some((a) => holds(a.key, w)));
      if (byAlias && (all || exact || words.length === 1)) {
        score = exact || aliases.some((a) => words.includes(a.key)) ? 24 : 18;
        via = byAlias.raw;
      } else if (all && aliases.length) {
        score = 12;
        via = aliases.find((a) => words.some((w) => holds(a.key, w)))?.raw;
      }
    }
    if (!score) continue;
    if (product.stock > 0) score += 5;
    hits.push({ product, score, ...(via ? { via } : {}) });
  }
  return hits.sort((a, b) => b.score - a.score || a.product.name.length - b.product.name.length || a.product.name.localeCompare(b.product.name)).slice(0, limit);
}

/** L'article dont le nom est écrit dans un texte (« écran cassé · Écran Tecno BF6 ») : le plus long gagne. */
export function productNamedIn(products: Product[], text: string): Product | undefined {
  const t = squash(text);
  if (!t) return undefined;
  return products
    .filter((p) => p.name.length >= 4 && t.includes(squash(p.name)))
    .sort((a, b) => b.name.length - a.name.length)[0];
}

/**
 * Toutes les pièces prévues au dépôt (22/11/2026, demande de Fallou : « un même client change le connecteur,
 * l'écran et la batterie ») : la panne s'écrit « Écran cassé, Ne charge pas · Écran Tecno BF6 · Connecteur … ».
 * Chaque morceau après « · » qui est le nom exact d'une pièce compte ; sinon l'ancienne règle (une pièce nommée).
 */
export function productsNamedIn(products: Product[], text: string): Product[] {
  const parts = text.split(" · ").slice(1).map((x) => squash(x)).filter(Boolean);
  const exact = parts.map((x) => products.find((p) => squash(p.name) === x)).filter((p): p is Product => Boolean(p));
  if (exact.length) return [...new Map(exact.map((p) => [p.id, p])).values()];
  const one = productNamedIn(products, text);
  return one ? [one] : [];
}

/**
 * La pièce du stock vendue sur une ligne écrite (« LCD Spark 7 : vente 10 000 F ») — 14/11/2026, demande de Fallou :
 * même type de pièce (écran = LCD, plaquette, batterie…) ET même modèle. Le nom de l'article d'abord ;
 * un téléphone compatible (« va aussi sur ») seulement si aucun article ne porte ce modèle dans son nom.
 * Plusieurs pièces possibles (« Écran iPhone 11 Pro Max » copie / original) : on garde celle sans précision
 * entre parenthèses si elle est seule, sinon on ne devine pas (rien ne sort du stock).
 */
export function partForSale(products: Product[], label: string, kindOf: (s: string) => string): { product?: Product; choices?: Product[] } {
  const keys = new Set(modelKeys(label));
  const kind = kindOf(label);
  if (!keys.size) {
    // Sans modèle (« Chargeur ») : seulement un article qui porte exactement ce nom.
    const same = products.filter((p) => squash(p.name) === squash(label));
    return same.length === 1 ? { product: same[0]! } : {};
  }
  if (kind === "Autre") return {};
  const sameKind = products.filter((p) => kindOf(p.name) === kind);
  const direct = sameKind.filter((p) => modelKeys(p.name).some((k) => keys.has(k)));
  const pool = direct.length ? direct : sameKind.filter((p) => (p.aliases ?? []).some((a) => modelKeys(a).some((k) => keys.has(k))));
  if (pool.length === 1) return { product: pool[0]! };
  if (!pool.length) return {};
  const plainOnes = pool.filter((p) => !/\(/.test(p.name));
  if (plainOnes.length === 1 && pool.every((p) => p === plainOnes[0] || squash(p.name.replace(/\(.*?\)/g, "")) === squash(plainOnes[0]!.name))) return { product: plainOnes[0]! };
  return { choices: pool.slice(0, 4) };
}

/** « Écran Tecno BF6 » → « BF6 » : le modèle seul, pour l'écrire dans les téléphones compatibles d'une autre pièce. */
export function partModelLabel(name: string): string {
  return name
    .replace(/^(écran|ecran|lcd|vitre|batterie|connecteur( de charge)?|nappe|plaquette|dos|châssis|chassis|bouton|caméra|camera|empreinte|haut-parleur|micro)\s+/i, "")
    .replace(/^(tecno|itel|infinix|samsung|apple|iphone|xiaomi|redmi|oppo|vivo|huawei|nokia|realme|motorola|zte|alcatel|lava|wiko|tcl|honor)\s+/i, (m) => (/^iphone/i.test(m) ? m : ""))
    .trim() || name;
}

/**
 * « Même pièce que… » (16/11/2026, demande de Fallou) : les modèles compatibles d'une pièce sont reportés sur toutes
 * les pièces du même type de la boutique qui portent un de ces modèles, dans les deux sens (l'écran A70 va sur BF6
 * ⇒ l'écran BF6 va aussi sur A70). Une pièce ne se liste jamais elle-même.
 */
export function linkSamePart(products: Product[], id: string, kindOf: (label: string) => string): Product[] {
  const base = products.find((p) => p.id === id);
  if (!base) return products;
  const kind = kindOf(base.name);
  const labels = [partModelLabel(base.name), ...(base.aliases ?? [])].map((x) => x.trim()).filter(Boolean);
  const keyOf = (label: string) => modelKeys(label).join("|") || label.toLowerCase().replace(/\s+/g, "");
  const groupKeys = new Set(labels.flatMap((l) => modelKeys(l)));
  if (!groupKeys.size) return products;
  return products.map((q) => {
    if (kindOf(q.name) !== kind) return q;
    const own = modelKeys(q.name);
    if (!own.some((k) => groupKeys.has(k))) return q;
    const ownKey = own.join("|");
    const seen = new Set<string>();
    const merged = [...(q.aliases ?? []), ...labels].filter((l) => {
      const k = keyOf(l);
      if (!l.trim() || k === ownKey || own.includes(k) || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return merged.length === (q.aliases ?? []).length && merged.every((x, i) => x === q.aliases?.[i]) ? q : { ...q, aliases: merged };
  });
}
