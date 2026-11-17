/**
 * Corriger un calcul de bénéfice après coup (17/11/2026, demande de Fallou : « si le calcul n'est pas normal,
 * où est-ce que je le modifie ? »). Tout se corrige depuis la ligne des Bénéfices :
 * - un article : le prix d'achat d'une unité (repris sur ses ventes, et gardé pour les prochaines si voulu) ;
 * - une vente au comptoir ou un service : ce qu'il t'a coûté (achat, matière) ;
 * - une réparation : les pièces posées (stock remis juste, prix d'achat porté sur le dernier paiement).
 */
import type { RepairPart, Shop } from "../model.ts";
import { isServicePayment } from "./report.ts";

const REF = /\b([RC]-\d+)\b/;

/** Prix d'achat d'UNE unité, repris sur chaque vente (quantité × prix) ; `keep` = aussi dans la fiche de l'article. */
export function setArticleCost(shop: Shop, saleIds: string[], unitCost: number, productId?: string, keep = true): Shop {
  const c = Math.max(0, Math.round(unitCost));
  const ids = new Set(saleIds);
  return {
    ...shop,
    sales: shop.sales.map((s) => (ids.has(s.id) ? { ...s, cost: Math.round(c * (s.qty ?? 1)) } : s)),
    products: keep && productId ? shop.products.map((p) => (p.id === productId ? { ...p, cost: c } : p)) : shop.products,
  };
}

/** Coût total de plusieurs ventes (comptoir, service) : réparti selon le montant de chaque vente. */
export function setTotalCost(shop: Shop, saleIds: string[], total: number): Shop {
  const ids = new Set(saleIds);
  const list = shop.sales.filter((s) => ids.has(s.id));
  if (!list.length) return shop;
  const t = Math.max(0, Math.round(total));
  const revenue = list.reduce((a, s) => a + s.amount, 0);
  const share = new Map<string, number>();
  let left = t;
  list.forEach((s, i) => {
    const v = i === list.length - 1 ? left : Math.round(revenue ? (t * s.amount) / revenue : t / list.length);
    share.set(s.id, v);
    left -= v;
  });
  return { ...shop, sales: shop.sales.map((s) => (share.has(s.id) ? { ...s, cost: share.get(s.id) } : s)) };
}

/** Paiements d'une réparation ou d'une commande (avance, acompte, rendu…), du plus ancien au plus récent. */
export function jobSales(shop: Shop, number: string) {
  return shop.sales.filter((s) => isServicePayment(s) && REF.exec(s.label)?.[1] === number).sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * Remplace les pièces d'une réparation. Le stock suit (pièce ajoutée = sort du stock, jamais sous 0 ;
 * pièce enlevée = revient) ; si l'appareil est déjà rendu, le prix d'achat total est porté sur le dernier paiement
 * (les autres paiements n'en portent plus), sinon il sera compté au rendu.
 */
export function correctRepairParts(shop: Shop, repairId: string, parts: RepairPart[]): Shop | null {
  const repair = (shop.repairs ?? []).find((r) => r.id === repairId);
  if (!repair) return null;
  const clean = parts
    .filter((p) => p.label.trim())
    .map((p) => ({ ...p, label: p.label.trim(), qty: Math.max(1, Math.round(p.qty || 1)), cost: Math.max(0, Math.round(p.cost || 0)) }));
  const count = (list: RepairPart[]) => {
    const m = new Map<string, number>();
    for (const p of list) if (p.productId) m.set(p.productId, (m.get(p.productId) ?? 0) + p.qty);
    return m;
  };
  const before = count(repair.parts);
  const after = count(clean);
  const posed = repair.status === "repare" || repair.status === "rendu";
  const products = posed
    ? shop.products.map((p) => {
        const delta = (after.get(p.id) ?? 0) - (before.get(p.id) ?? 0);
        return delta ? { ...p, stock: Math.max(0, p.stock - delta) } : p;
      })
    : shop.products;
  let sales = shop.sales;
  if (repair.status === "rendu") {
    const paid = jobSales(shop, repair.number);
    const last = paid[paid.length - 1];
    if (last) {
      const total = clean.reduce((a, p) => a + p.cost, 0);
      const ids = new Set(paid.map((s) => s.id));
      sales = sales.map((s) => (s.id === last.id ? { ...s, cost: total } : ids.has(s.id) && s.cost ? { ...s, cost: 0 } : s));
    }
  }
  return {
    ...shop,
    products,
    sales,
    repairs: (shop.repairs ?? []).map((r) => (r.id === repairId ? { ...r, parts: clean } : r)),
  };
}
