import { type Product, type Shop, uid } from "../model.ts";

/**
 * Tailles et couleurs (demande de Fallou, 13/11/2026 : mercerie, multiservice, vêtements) : un même article en
 * plusieurs couleurs (fil noir, fil blanc) ou tailles (maillot M, L, XL). Chaque variante est un article du stock
 * « Nom · variante », avec son propre stock : on sait exactement quelle couleur ou quelle taille manque.
 */
export const VARIANT_SEP = " · ";

/** « S, M, L, XL » ou « noir / blanc / or » → liste propre, sans doublons. */
export function parseVariants(text: string): string[] {
  const seen = new Set<string>();
  return text
    .split(/[,;/\n]+/)
    .map((v) => v.replace(/\s+/g, " ").trim())
    .filter((v) => v && !seen.has(v.toLowerCase()) && seen.add(v.toLowerCase()));
}

export type VariantInput = { name: string; unit: string; price: number; cost?: number; min?: number; variants: { label: string; stock: number }[] };

/** Crée un article par variante ; une variante qui existe déjà voit seulement son stock augmenter. */
export function addVariants(shop: Shop, input: VariantInput): { shop: Shop; created: number; updated: number } {
  const base = input.name.replace(/\s+/g, " ").trim();
  if (!base || !input.variants.length) return { shop, created: 0, updated: 0 };
  let products = shop.products;
  let created = 0;
  let updated = 0;
  for (const v of input.variants) {
    const name = `${base}${VARIANT_SEP}${v.label}`;
    const stock = Math.max(0, v.stock || 0);
    const found = products.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (found) {
      products = products.map((p) => (p.id === found.id ? { ...p, stock: p.stock + stock } : p));
      updated++;
    } else {
      const p: Product = {
        id: uid("p"),
        name,
        unit: input.unit.trim() || "pièce",
        stock,
        min: Math.max(0, input.min ?? 0),
        price: Math.max(0, Math.round(input.price)),
        ...(input.cost !== undefined && input.cost > 0 ? { cost: Math.round(input.cost) } : {}),
        aliases: [`${base} ${v.label}`.toLowerCase()],
      };
      products = [...products, p];
      created++;
    }
  }
  return { shop: { ...shop, products }, created, updated };
}

/** Les familles d'articles à variantes : « Fil à coudre » → [noir, blanc, bleu], avec le stock de chacune. */
export function variantFamilies(products: Product[]): { base: string; items: Product[] }[] {
  const map = new Map<string, Product[]>();
  for (const p of products) {
    const i = p.name.lastIndexOf(VARIANT_SEP);
    if (i <= 0) continue;
    const base = p.name.slice(0, i);
    map.set(base, [...(map.get(base) ?? []), p]);
  }
  return [...map.entries()].filter(([, items]) => items.length > 1).map(([base, items]) => ({ base, items }));
}

/** Métiers qui vendent souvent en tailles ou couleurs. */
export const VARIANT_METIERS = new Set(["mercerie", "multiservice", "vetements", "couture", "quincaillerie", "autre"]);
