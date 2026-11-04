/**
 * Lots d'un article : le même médicament arrive en plusieurs livraisons, avec des dates différentes
 * (10 boîtes qui périment en mars, 20 en août). Jokko vend d'abord ce qui périme le plus tôt.
 *
 * Règle simple et sûre : le stock de l'article reste le chiffre qui compte. Quand il baisse (vente, scan,
 * voix, correction), les lots les plus proches de la péremption baissent d'autant. Des unités sans lot
 * (stock ajouté sans date) restent possibles.
 */
import { type Expense, type Lot, type Product, type Shop, todayStamp, uid } from "@/model";

const byDate = (a: Lot, b: Lot) => a.expiresAt.localeCompare(b.expiresAt);
const total = (lots: Lot[]) => lots.reduce((a, l) => a + l.qty, 0);

/** Date affichée de l'article : la plus proche des lots qui restent. */
function earliest(lots: Lot[]): string | undefined {
  return [...lots].sort(byDate)[0]?.expiresAt;
}

/** Remet les lots d'accord avec le stock : s'il y a plus d'unités dans les lots que dans le stock, on enlève d'abord les plus proches. */
export function fitLots(p: Product): Product {
  if (!p.lots?.length) return p;
  let extra = total(p.lots) - Math.max(0, p.stock);
  const lots = [...p.lots].sort(byDate).map((l) => ({ ...l }));
  for (const l of lots) {
    if (extra <= 0) break;
    const take = Math.min(l.qty, extra);
    l.qty = Math.round((l.qty - take) * 1000) / 1000;
    extra -= take;
  }
  const kept = lots.filter((l) => l.qty > 0);
  const next: Product = { ...p, lots: kept };
  const date = earliest(kept);
  if (date) next.expiresAt = date;
  else {
    delete next.expiresAt;
    if (!kept.length) delete next.lots;
  }
  return next;
}

/** Applique fitLots à tous les articles qui ont des lots (après chaque écriture). */
export function fitShopLots(shop: Shop): Shop {
  if (!shop.products.some((p) => p.lots?.length)) return shop;
  let changed = false;
  const products = shop.products.map((p) => {
    if (!p.lots?.length) return p;
    const next = fitLots(p);
    if (JSON.stringify(next) === JSON.stringify(p)) return p;
    changed = true;
    return next;
  });
  return changed ? { ...shop, products } : shop;
}

/** Réception d'une livraison : +qty au stock, avec sa date (et son numéro de lot s'il est lu sur la boîte). */
export function receiveLot(shop: Shop, productId: string, qty: number, expiresAt: string, lot?: string): Shop {
  const q = Math.max(0, qty);
  if (!q || !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) return shop;
  return {
    ...shop,
    products: shop.products.map((p) => {
      if (p.id !== productId) return p;
      const lots = [...(p.lots ?? [])];
      const same = lots.find((l) => l.expiresAt === expiresAt && (l.lot ?? "") === (lot ?? ""));
      if (same) same.qty += q;
      else lots.push({ expiresAt, qty: q, ...(lot ? { lot } : {}) });
      return fitLots({ ...p, stock: p.stock + q, lots });
    }),
  };
}

/**
 * Retire du stock un lot périmé (ou abîmé) : le stock baisse, et la perte est notée en dépense
 * (au prix d'achat), pour que le bénéfice reste juste.
 */
export function removeLot(shop: Shop, productId: string, expiresAt: string, lot?: string): Shop {
  const p = shop.products.find((x) => x.id === productId);
  const target = p?.lots?.find((l) => l.expiresAt === expiresAt && (l.lot ?? "") === (lot ?? ""));
  if (!p || !target) return shop;
  const lots = p.lots!.filter((l) => l !== target);
  const product = fitLots({ ...p, stock: Math.max(0, p.stock - target.qty), lots });
  const loss = Math.round((p.cost ?? 0) * target.qty);
  const expense: Expense = { id: uid("e"), at: todayStamp(), label: `${p.name} périmé (${target.qty} ${p.unit}, ${expiresAt})`, amount: loss, kind: "perte" };
  return {
    ...shop,
    products: shop.products.map((x) => (x.id === productId ? product : x)),
    expenses: loss > 0 ? [expense, ...shop.expenses] : shop.expenses,
  };
}
