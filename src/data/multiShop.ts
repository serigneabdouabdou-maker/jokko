import { expectedCash, type Shop } from "../model.ts";
import { buildReport, periodOf } from "./report.ts";

/**
 * « Toutes mes boutiques » (patron, offre Avancé) : chaque boutique garde son stock, sa caisse et ses vendeurs ;
 * cet écran les met côte à côte et fait les totaux. Fonctions pures (testées).
 */

export type ShopDay = {
  id: string;
  name: string;
  revenue: number;
  salesCount: number;
  profit: number;
  expenses: number;
  cash: number;
  debts: number;
  lowStock: number;
};

/** Le résumé du jour de chaque boutique. */
export function shopDays(shops: Shop[], now = new Date()): ShopDay[] {
  return shops.map((shop) => {
    const r = buildReport(shop, periodOf("jour", now));
    return {
      id: shop.id,
      name: shop.name,
      revenue: r.revenue,
      salesCount: r.salesCount,
      profit: r.netProfit,
      expenses: r.expenses,
      cash: expectedCash(shop),
      debts: shop.clients.reduce((t, c) => t + Math.max(0, c.debt), 0),
      lowStock: shop.products.filter((p) => p.stock <= p.min).length,
    };
  });
}

export function totalDay(days: ShopDay[]): Omit<ShopDay, "id" | "name"> {
  const sum = (k: keyof Omit<ShopDay, "id" | "name">) => days.reduce((t, d) => t + d[k], 0);
  return { revenue: sum("revenue"), salesCount: sum("salesCount"), profit: sum("profit"), expenses: sum("expenses"), cash: sum("cash"), debts: sum("debts"), lowStock: sum("lowStock") };
}

/** Même article d'une boutique à l'autre : même nom (sans accents ni majuscules) et même unité. */
export const productKey = (name: string, unit: string) =>
  `${name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim()}|${unit.toLowerCase().trim()}`;

export type StockRow = {
  key: string;
  name: string;
  unit: string;
  /** Par boutique : l'article (id), son stock et son minimum ; absent = la boutique ne vend pas cet article. */
  perShop: Record<string, { productId: string; stock: number; min: number }>;
  total: number;
  /** Une boutique au moins est sous son minimum. */
  low: boolean;
};

/** L'inventaire général : chaque article, le stock de chaque boutique et le total. */
export function consolidatedStock(shops: Shop[]): StockRow[] {
  const rows = new Map<string, StockRow>();
  for (const shop of shops) {
    for (const p of shop.products) {
      const key = productKey(p.name, p.unit);
      const row = rows.get(key) ?? { key, name: p.name, unit: p.unit, perShop: {}, total: 0, low: false };
      const prev = row.perShop[shop.id];
      row.perShop[shop.id] = { productId: prev?.productId ?? p.id, stock: (prev?.stock ?? 0) + p.stock, min: Math.max(prev?.min ?? 0, p.min) };
      row.total += p.stock;
      if (p.stock <= p.min) row.low = true;
      rows.set(key, row);
    }
  }
  return [...rows.values()].sort((a, b) => Number(b.low) - Number(a.low) || a.name.localeCompare(b.name, "fr"));
}

export type DebtLine = { shopId: string; shopName: string; clientId: string; name: string; phone: string; debt: number; dueAt?: string; late: boolean };

/** Toutes les dettes de toutes les boutiques, les plus grosses (et en retard) d'abord. */
export function allDebts(shops: Shop[], now = new Date()): DebtLine[] {
  const lines: DebtLine[] = [];
  for (const shop of shops) {
    for (const c of shop.clients) {
      if (c.debt <= 0) continue;
      const late = Boolean(c.dueAt && Date.parse(c.dueAt) < now.getTime());
      lines.push({ shopId: shop.id, shopName: shop.name, clientId: c.id, name: c.name, phone: c.phone, debt: c.debt, dueAt: c.dueAt, late });
    }
  }
  return lines.sort((a, b) => Number(b.late) - Number(a.late) || b.debt - a.debt);
}

export type PriceChange = {
  productId: string;
  name: string;
  unit: string;
  oldPrice: number;
  newPrice: number;
  /** Les autres boutiques qui vendent ce même article à un autre prix. */
  shops: { id: string; name: string; price: number }[];
};

const samePrices = (a: Shop["products"][number], b: Shop["products"][number]) =>
  a.price === b.price && a.cost === b.cost && (a.retail?.price ?? null) === (b.retail?.price ?? null);

/**
 * Prix changés dans une boutique (avant → après) qui diffèrent dans les autres boutiques du patron :
 * Jokko propose alors d'appliquer le nouveau prix partout.
 */
export function priceChanges(before: Shop, after: Shop, others: Shop[]): PriceChange[] {
  if (before.id !== after.id) return [];
  const changes: PriceChange[] = [];
  for (const p of after.products) {
    const old = before.products.find((x) => x.id === p.id);
    if (!old || samePrices(old, p)) continue;
    const key = productKey(p.name, p.unit);
    const shops = others
      .filter((s) => s.id !== after.id)
      .map((s) => ({ shop: s, twin: s.products.find((x) => productKey(x.name, x.unit) === key) }))
      .filter((x): x is { shop: Shop; twin: Shop["products"][number] } => Boolean(x.twin) && !samePrices(x.twin!, p))
      .map(({ shop, twin }) => ({ id: shop.id, name: shop.name, price: twin.price }));
    if (shops.length) changes.push({ productId: p.id, name: p.name, unit: p.unit, oldPrice: old.price, newPrice: p.price, shops });
  }
  return changes;
}
