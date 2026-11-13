/**
 * Recherche d'un article par son nom ou ses autres noms (demande de Fallou, 13/11/2026) :
 * le réparateur tape « BF6 » et trouve l'écran qui va sur le BF6, même si c'est un écran universel
 * rangé sous un autre nom (« Écran Tecno KI5K », qui va aussi sur BF6, BF7, A60…).
 * Les téléphones compatibles sont les « autres noms » de l'article (`aliases`).
 */
import type { Product } from "../model.ts";

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
    if (name.includes(whole) || words.every((w) => name.includes(w))) {
      score = 30 + words.filter((w) => nameWords.has(w)).length * 3;
    } else {
      // Un mot peut venir du nom (« écran »), l'autre d'un téléphone compatible (« bf6 »).
      const exact = aliases.find((a) => a.key === whole);
      const byAlias = exact ?? aliases.find((a) => a.key.includes(whole) || words.some((w) => w.length >= 2 && /\d/.test(w) && a.key === w));
      const all = words.every((w) => name.includes(w) || aliases.some((a) => a.key.includes(w)));
      if (byAlias && (all || exact || words.length === 1)) {
        score = exact || aliases.some((a) => words.includes(a.key)) ? 24 : 18;
        via = byAlias.raw;
      } else if (all && aliases.length) {
        score = 12;
        via = aliases.find((a) => words.some((w) => a.key.includes(w)))?.raw;
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
