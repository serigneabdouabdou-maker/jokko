import type { Shop } from "../model";

/**
 * Bilan de la boutique sur une période : ce qui s'est vendu, ce que ça a rapporté,
 * ce que ça a coûté, le bénéfice. Tout est calculé à partir des ventes enregistrées.
 */

export type PeriodKind = "jour" | "mois" | "mois_dernier";
export type Period = { kind: PeriodKind; from: Date; to: Date; label: string };

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export function periodOf(kind: PeriodKind, now = new Date()): Period {
  if (kind === "jour") {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { kind, from, to: new Date(from.getTime() + 86_400_000), label: "Aujourd'hui" };
  }
  const offset = kind === "mois_dernier" ? -1 : 0;
  const from = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  return { kind, from, to, label: `${MONTHS[from.getMonth()]} ${from.getFullYear()}` };
}

export type ProductLine = {
  productId: string;
  name: string;
  /** Quantité vendue en gros (sacs, bidons…) */
  bulkQty: number;
  bulkUnit: string;
  /** Quantité vendue au détail (sachets…) */
  retailQty: number;
  retailUnit?: string;
  revenue: number;
  /** null si le prix d'achat n'est pas connu pour une partie des ventes */
  profit: number | null;
};

export type Report = {
  period: Period;
  salesCount: number;
  /** Chiffre d'affaires : total des ventes */
  revenue: number;
  /** Coût d'achat de la marchandise vendue (ventes dont le prix d'achat est connu) */
  cost: number;
  /** Bénéfice sur les ventes dont le prix d'achat est connu */
  grossProfit: number;
  /** Ventes sans prix d'achat connu (vente au comptoir sans article, article sans prix d'achat) */
  unknownRevenue: number;
  expenses: number;
  /** Marchandise achetée pour le stock : sortie de caisse, pas une dépense du bénéfice */
  purchases: number;
  losses: number;
  /** Bénéfice net = bénéfice − dépenses − pertes */
  netProfit: number;
  byProduct: ProductLine[];
};

const within = (iso: string, p: Period) => {
  const t = Date.parse(iso);
  return t >= p.from.getTime() && t < p.to.getTime();
};

export function buildReport(shop: Shop, period: Period): Report {
  const sales = shop.sales.filter((s) => within(s.at, period));
  const lines = new Map<string, ProductLine & { unknown: boolean }>();
  let revenue = 0;
  let cost = 0;
  let unknownRevenue = 0;

  for (const sale of sales) {
    revenue += sale.amount;
    if (sale.cost !== undefined) cost += sale.cost;
    else unknownRevenue += sale.amount;

    if (!sale.productId) continue;
    const product = shop.products.find((p) => p.id === sale.productId);
    const line = lines.get(sale.productId) ?? {
      productId: sale.productId,
      name: product?.name ?? sale.label,
      bulkQty: 0,
      bulkUnit: product?.unit ?? sale.unit ?? "",
      retailQty: 0,
      retailUnit: product?.retail?.unit,
      revenue: 0,
      profit: 0,
      unknown: false,
    };
    if (sale.retail) {
      line.retailQty += sale.qty ?? 1;
      line.retailUnit = sale.unit ?? line.retailUnit;
    } else {
      line.bulkQty += sale.qty ?? 1;
    }
    line.revenue += sale.amount;
    if (sale.cost === undefined) line.unknown = true;
    else line.profit = (line.profit ?? 0) + sale.amount - sale.cost;
    lines.set(sale.productId, line);
  }

  const inPeriod = shop.expenses.filter((e) => within(e.at, period));
  const expenses = inPeriod.filter((e) => e.kind !== "perte" && e.kind !== "achat").reduce((a, e) => a + e.amount, 0);
  const purchases = inPeriod.filter((e) => e.kind === "achat").reduce((a, e) => a + e.amount, 0);
  const losses = inPeriod.filter((e) => e.kind === "perte").reduce((a, e) => a + e.amount, 0);
  const grossProfit = revenue - unknownRevenue - cost;

  const byProduct = [...lines.values()]
    .map(({ unknown, ...line }) => ({ ...line, profit: unknown ? null : line.profit }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    period,
    salesCount: sales.length,
    revenue,
    cost,
    grossProfit,
    unknownRevenue,
    expenses,
    purchases,
    losses,
    netProfit: grossProfit - expenses - losses,
    byProduct,
  };
}

/** Valeur du stock : au prix d'achat (ce qu'il a coûté) et au prix de vente (ce qu'il peut rapporter). */
export function stockValue(shop: Shop): { atCost: number; atPrice: number; missingCost: number } {
  let atCost = 0;
  let atPrice = 0;
  let missingCost = 0;
  for (const p of shop.products) {
    atPrice += p.stock * p.price;
    if (p.cost !== undefined) atCost += p.stock * p.cost;
    else if (p.stock > 0) missingCost += 1;
  }
  return { atCost: Math.round(atCost), atPrice: Math.round(atPrice), missingCost };
}

/** Marge d'un article : par unité de gros et, s'il se vend au détail, par unité de gros vendue au détail. */
export function margins(p: Shop["products"][number]): { bulk: number | null; retail: number | null } {
  if (p.cost === undefined) return { bulk: null, retail: null };
  return {
    bulk: p.price - p.cost,
    retail: p.retail ? Math.round(p.retail.price * p.retail.perUnit - p.cost) : null,
  };
}

/** Faut-il rappeler l'inventaire ? Oui si aucun inventaire ce mois-ci. */
export function inventoryDue(shop: Shop, now = new Date()): boolean {
  if (!shop.products.length) return false;
  if (!shop.lastInventoryAt) return true;
  const last = new Date(shop.lastInventoryAt);
  return last.getFullYear() !== now.getFullYear() || last.getMonth() !== now.getMonth();
}

export type CountResult = { shop: Shop; losses: number; lines: Array<{ name: string; expected: number; counted: number; loss: number }> };

/**
 * Enregistre un inventaire : le stock devient ce qui a été compté.
 * Ce qui manque est enregistré comme perte (au prix d'achat) ; un surplus corrige simplement le stock.
 */
export function recordInventory(shop: Shop, counts: Record<string, number>, makeId: () => string, now = new Date()): CountResult {
  const lines: CountResult["lines"] = [];
  const lossExpenses: Shop["expenses"] = [];
  const products = shop.products.map((p) => {
    const counted = counts[p.id];
    if (counted === undefined || !Number.isFinite(counted) || counted < 0) return p;
    const missing = Math.round((p.stock - counted) * 1000) / 1000;
    const loss = missing > 0 && p.cost !== undefined ? Math.round(missing * p.cost) : 0;
    lines.push({ name: p.name, expected: p.stock, counted, loss });
    if (loss) lossExpenses.push({ id: makeId(), at: now.toISOString(), label: `Inventaire : ${missing} ${p.unit} ${p.name} manquant(s)`, amount: loss, kind: "perte" });
    return { ...p, stock: counted };
  });
  return {
    shop: { ...shop, products, expenses: [...lossExpenses, ...shop.expenses], lastInventoryAt: now.toISOString() },
    losses: lossExpenses.reduce((a, e) => a + e.amount, 0),
    lines,
  };
}
