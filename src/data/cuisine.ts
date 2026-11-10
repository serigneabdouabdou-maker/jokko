import type { Product, Shop } from "../model.ts";

/**
 * Cuisine (restaurants, dibiteries, jus, boulangeries) : les plats du jour.
 * Un plat ou une boisson est un article du stock : son stock = les portions préparées qui restent.
 * Vendre baisse le stock ; « Préparer » l'augmente ; la fin de service passe les restes en perte.
 */

/** Unités d'un plat cuisiné : les restes ne se gardent pas d'un jour à l'autre. */
export const FRESH_UNITS = ["plat", "portion", "bol", "assiette", "sandwich", "baguette", "pain", "croissant", "fataya", "pièce"];
/** Unités proposées pour un plat ou une boisson. */
export const DISH_UNITS = ["plat", "portion", "sandwich", "verre", "bouteille", "sachet", "baguette", "pain", "pièce"];

export const isFresh = (p: Pick<Product, "unit">) => FRESH_UNITS.includes(p.unit.toLowerCase());
/** Les articles du menu : tout ce qui se vend en portions (pas les ingrédients achetés au sac ou au kilo). */
export const isDish = (p: Pick<Product, "unit">) => DISH_UNITS.includes(p.unit.toLowerCase());

/** Coût d'une portion : total des ingrédients ÷ nombre de portions, arrondi au franc supérieur. */
export function dishCost(ingredients: { price: number }[], portions: number): number {
  const total = ingredients.reduce((n, i) => n + (Number.isFinite(i.price) && i.price > 0 ? i.price : 0), 0);
  return portions > 0 ? Math.ceil(total / portions) : 0;
}

const localDay = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

/** Ce qui s'est vendu de chaque article aujourd'hui (quantité). */
export function soldToday(shop: Pick<Shop, "sales">, now = new Date()): Map<string, number> {
  const today = localDay(now);
  const out = new Map<string, number>();
  for (const s of shop.sales) {
    if (!s.productId || localDay(new Date(s.at)) !== today) continue;
    out.set(s.productId, (out.get(s.productId) ?? 0) + (s.qty ?? 1));
  }
  return out;
}

export type DishStat = { id: string; name: string; qty: number; revenue: number; profit: number | null };

/** Classement des plats sur N jours : quantité, argent encaissé, bénéfice (si le coût du plat est connu). */
export function dishStats(shop: Pick<Shop, "sales" | "products">, days = 7, now = new Date()): DishStat[] {
  const since = now.getTime() - days * 86_400_000;
  const byId = new Map(shop.products.map((p) => [p.id, p]));
  const acc = new Map<string, DishStat>();
  for (const s of shop.sales) {
    if (!s.productId || new Date(s.at).getTime() < since) continue;
    const p = byId.get(s.productId);
    if (!p || !isDish(p)) continue;
    const row = acc.get(p.id) ?? { id: p.id, name: p.name, qty: 0, revenue: 0, profit: 0 };
    const qty = s.qty ?? 1;
    row.qty += qty;
    row.revenue += s.amount;
    const cost = s.cost ?? (p.cost != null ? p.cost * qty : null);
    row.profit = row.profit == null || cost == null ? null : row.profit + (s.amount - cost);
    acc.set(p.id, row);
  }
  return [...acc.values()].sort((a, b) => (b.profit ?? b.revenue) - (a.profit ?? a.revenue));
}

/** « J'ai préparé 40 plats » : les portions s'ajoutent au reste du plat. */
export function prepare(shop: Shop, productId: string, portions: number): Shop {
  const n = Math.max(0, Math.round(portions));
  return { ...shop, products: shop.products.map((p) => (p.id === productId ? { ...p, stock: p.stock + n } : p)) };
}

/** Enregistre le coût d'une portion (le bénéfice de chaque vente devient juste). */
export function setDishCost(shop: Shop, productId: string, cost: number): Shop {
  return { ...shop, products: shop.products.map((p) => (p.id === productId ? { ...p, cost: Math.max(0, Math.round(cost)) } : p)) };
}

/** Nouveau plat ou boisson au menu. */
export function addDish(shop: Shop, input: { name: string; price: number; unit: string; portions: number; cost?: number }, id: string): Shop {
  const dish: Product = { id, name: input.name.trim(), unit: input.unit, stock: Math.max(0, Math.round(input.portions)), min: 0, price: Math.max(0, Math.round(input.price)) };
  if (input.cost && input.cost > 0) dish.cost = Math.round(input.cost);
  return { ...shop, products: [...shop.products, dish] };
}

/** Restes à la fin du service : seulement les plats frais qui ne se gardent pas. */
export function leftovers(shop: Pick<Shop, "products">): Product[] {
  return shop.products.filter((p) => isFresh(p) && p.stock > 0);
}

/**
 * Fin de service : les restes des plats choisis passent en perte (au coût du plat, s'il est connu)
 * et leur reste revient à 0. Une seule dépense « perte » pour la journée.
 */
export function endService(shop: Shop, ids: string[], expenseId: string, now = new Date()): { shop: Shop; lost: number; count: number } {
  const chosen = shop.products.filter((p) => ids.includes(p.id) && p.stock > 0);
  if (!chosen.length) return { shop, lost: 0, count: 0 };
  const lost = chosen.reduce((n, p) => n + (p.cost ?? 0) * p.stock, 0);
  const count = chosen.reduce((n, p) => n + p.stock, 0);
  const label = `Restes de fin de service : ${chosen.map((p) => `${p.stock} ${p.name}`).join(", ")}`;
  const products = shop.products.map((p) => (ids.includes(p.id) ? { ...p, stock: 0 } : p));
  const expenses = lost > 0 ? [...shop.expenses, { id: expenseId, at: now.toISOString(), label, amount: Math.round(lost), kind: "perte" as const }] : shop.expenses;
  return { shop: { ...shop, products, expenses }, lost: Math.round(lost), count };
}


/** Vente rapide depuis l'écran Cuisine : un toucher = une portion vendue (espèces), le reste du plat baisse. */
export function sellDish(shop: Shop, productId: string, qty: number, id: string, now = new Date()): Shop {
  const p = shop.products.find((x) => x.id === productId);
  if (!p || qty <= 0) return shop;
  const sale = { id, at: now.toISOString(), label: p.name, amount: p.price * qty, qty, productId, unit: p.unit, ...(p.cost != null ? { cost: p.cost * qty } : {}) };
  return { ...shop, sales: [...shop.sales, sale], products: shop.products.map((x) => (x.id === productId ? { ...x, stock: Math.max(0, x.stock - qty) } : x)) };
}
