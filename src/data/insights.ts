import { money, type Product, type Sale, type Shop } from "../model.ts";

/**
 * Diagnostic de la boutique, calculé par le code (jamais par l'IA) :
 * tendances, articles qui rapportent, marges, ruptures à venir, stock qui dort, dettes, pertes.
 * Le conseiller IA lit ce diagnostic pour expliquer et proposer des actions ; il ne refait aucun calcul.
 */

const DAY = 86_400_000;
const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

export type ProductInsight = {
  id: string;
  name: string;
  unit: string;
  /** Vendu sur 30 jours, en unités de gros */
  sold30: number;
  revenue30: number;
  /** null si le prix d'achat n'est pas connu */
  profit30: number | null;
  /** Marge en % du prix de vente (gros), null si le prix d'achat n'est pas connu */
  marginPct: number | null;
  stock: number;
  /** Jours de stock au rythme des ventes (null : pas de ventes récentes) */
  daysLeft: number | null;
  /** Quantité à commander pour tenir 14 jours */
  reorder: number;
  /** Jours depuis la dernière vente (null : jamais vendu) */
  idleDays: number | null;
  stockValueAtCost: number | null;
};

export type Finding = {
  id: string;
  level: "urgent" | "important" | "info";
  title: string;
  detail: string;
  action: string;
};

export type Insights = {
  generatedAt: string;
  days: number;
  revenue: number;
  previousRevenue: number;
  /** Évolution des ventes en % (30 derniers jours contre les 30 d'avant), null si pas d'historique */
  trendPct: number | null;
  grossProfit: number;
  expenses: number;
  losses: number;
  netProfit: number;
  salesCount: number;
  averageSale: number;
  bestWeekday: string | null;
  bestHour: number | null;
  payments: { especes: number; wave: number; om: number; credit: number };
  debtTotal: number;
  overdueTotal: number;
  overdueClients: number;
  products: ProductInsight[];
  findings: Finding[];
};

const inRange = (iso: string, from: number, to: number) => {
  const t = Date.parse(iso);
  return t >= from && t < to;
};

function baseQty(sale: Sale, product: Product | undefined): number {
  const q = sale.qty ?? 1;
  return sale.retail && product?.retail ? q / product.retail.perUnit : q;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function buildInsights(shop: Shop, now = new Date()): Insights {
  const end = now.getTime();
  const start = end - 30 * DAY;
  const prevStart = start - 30 * DAY;
  const recent = shop.sales.filter((s) => inRange(s.at, start, end));
  const previous = shop.sales.filter((s) => inRange(s.at, prevStart, start));
  const hasHistory = shop.sales.some((s) => Date.parse(s.at) < start);

  const revenue = recent.reduce((a, s) => a + s.amount, 0);
  const previousRevenue = previous.reduce((a, s) => a + s.amount, 0);
  const grossProfit = recent.reduce((a, s) => a + (s.cost !== undefined ? s.amount - s.cost : 0), 0);
  const exp = shop.expenses.filter((e) => inRange(e.at, start, end));
  const expenses = exp.filter((e) => e.kind !== "perte" && e.kind !== "achat").reduce((a, e) => a + e.amount, 0);
  const losses = exp.filter((e) => e.kind === "perte").reduce((a, e) => a + e.amount, 0);

  // Meilleur jour et meilleure heure
  const byDay = new Array(7).fill(0);
  const byHour = new Array(24).fill(0);
  for (const s of recent) {
    const d = new Date(s.at);
    byDay[d.getDay()] += s.amount;
    byHour[d.getHours()] += s.amount;
  }
  const bestDay = recent.length ? byDay.indexOf(Math.max(...byDay)) : -1;
  const bestHour = recent.length ? byHour.indexOf(Math.max(...byHour)) : -1;

  const pay = { especes: 0, wave: 0, om: 0, credit: 0 };
  for (const s of recent) pay[s.payment ?? "especes"] += s.amount;

  // Articles
  const products: ProductInsight[] = shop.products.map((p) => {
    const mine = shop.sales.filter((s) => s.productId === p.id);
    const last30 = mine.filter((s) => inRange(s.at, start, end));
    const last14 = mine.filter((s) => inRange(s.at, end - 14 * DAY, end));
    const sold30 = last30.reduce((a, s) => a + baseQty(s, p), 0);
    const sold14 = last14.reduce((a, s) => a + baseQty(s, p), 0);
    const rate = sold14 > 0 ? sold14 / 14 : sold30 / 30;
    const lastSale = mine.reduce((m, s) => Math.max(m, Date.parse(s.at)), 0);
    const knownCost = last30.every((s) => s.cost !== undefined);
    return {
      id: p.id,
      name: p.name,
      unit: p.unit,
      sold30: round1(sold30),
      revenue30: last30.reduce((a, s) => a + s.amount, 0),
      profit30: last30.length && knownCost ? last30.reduce((a, s) => a + s.amount - (s.cost ?? 0), 0) : p.cost !== undefined && !last30.length ? 0 : null,
      marginPct: p.cost !== undefined && p.price > 0 ? Math.round(((p.price - p.cost) / p.price) * 100) : null,
      stock: p.stock,
      daysLeft: rate > 0 ? Math.floor(p.stock / rate) : null,
      reorder: rate > 0 ? Math.max(0, Math.ceil(rate * 14 - p.stock)) : 0,
      idleDays: lastSale ? Math.floor((end - lastSale) / DAY) : null,
      stockValueAtCost: p.cost !== undefined ? Math.round(p.stock * p.cost) : null,
    };
  });

  const clientsWithDebt = shop.clients.filter((c) => c.debt > 0);
  const overdue = clientsWithDebt.filter((c) => c.dueAt && Date.parse(c.dueAt) < end);

  const insights: Insights = {
    generatedAt: now.toISOString(),
    days: 30,
    revenue,
    previousRevenue,
    trendPct: hasHistory && previousRevenue > 0 ? Math.round(((revenue - previousRevenue) / previousRevenue) * 100) : null,
    grossProfit,
    expenses,
    losses,
    netProfit: grossProfit - expenses - losses,
    salesCount: recent.length,
    averageSale: recent.length ? Math.round(revenue / recent.length) : 0,
    bestWeekday: bestDay >= 0 ? WEEKDAYS[bestDay] : null,
    bestHour: bestHour >= 0 ? bestHour : null,
    payments: pay,
    debtTotal: clientsWithDebt.reduce((a, c) => a + c.debt, 0),
    overdueTotal: overdue.reduce((a, c) => a + c.debt, 0),
    overdueClients: overdue.length,
    products,
    findings: [],
  };
  insights.findings = findingsOf(insights, shop);
  return insights;
}

/** Les constats, du plus urgent au moins urgent, avec une action concrète pour chacun. */
export function findingsOf(i: Insights, shop: Shop): Finding[] {
  const out: Finding[] = [];
  const f = (x: Finding) => out.push(x);

  for (const p of shop.products) {
    if (p.cost !== undefined && p.price > 0 && p.price < p.cost) {
      f({ id: `perte-${p.id}`, level: "urgent", title: `${p.name} est vendu à perte`, detail: `Prix de vente ${money(p.price)}, prix d'achat ${money(p.cost)} : chaque ${p.unit} vendu fait perdre ${money(p.cost - p.price)}.`, action: "Monte le prix de vente dans Stock, ou vérifie le prix d'achat." });
    }
    if (p.retail && p.cost !== undefined && p.retail.price * p.retail.perUnit < p.cost) {
      f({ id: `detail-perte-${p.id}`, level: "urgent", title: `${p.name} au détail fait perdre de l'argent`, detail: `${p.retail.perUnit} ${p.retail.unit} × ${money(p.retail.price)} = ${money(p.retail.price * p.retail.perUnit)}, moins que le prix d'achat du ${p.unit} (${money(p.cost)}).`, action: `Monte le prix d'un ${p.retail.unit}.` });
    }
  }

  for (const p of i.products) {
    if (p.daysLeft !== null && p.daysLeft <= 7 && p.reorder > 0) {
      f({ id: `rupture-${p.id}`, level: p.daysLeft <= 2 ? "urgent" : "important", title: `${p.name} : rupture dans ${p.daysLeft <= 0 ? "moins d'un jour" : `${p.daysLeft} jour${p.daysLeft > 1 ? "s" : ""}`}`, detail: `Il reste ${p.stock} ${p.unit}, tu en vends environ ${round1(p.sold30 / 30)} par jour.`, action: `Commande environ ${p.reorder} ${p.unit} pour tenir 2 semaines.` });
    }
  }

  const dormant = i.products.filter((p) => p.stock > 0 && (p.idleDays === null || p.idleDays >= 30));
  const dormantValue = dormant.reduce((a, p) => a + (p.stockValueAtCost ?? 0), 0);
  if (dormant.length) {
    f({ id: "dormant", level: dormantValue >= 50_000 ? "important" : "info", title: `${dormant.length} article${dormant.length > 1 ? "s dorment" : " dort"} dans le stock`, detail: `${dormant.slice(0, 5).map((p) => p.name).join(", ")}${dormant.length > 5 ? "…" : ""} : aucune vente depuis 30 jours${dormantValue ? `, ${money(dormantValue)} d'argent bloqué` : ""}.`, action: "Fais une petite promotion, mets-les en avant au comptoir, ou n'en recommande plus." });
  }

  const ranked = i.products.filter((p) => (p.profit30 ?? 0) > 0).sort((a, b) => (b.profit30 ?? 0) - (a.profit30 ?? 0));
  const totalProfit = ranked.reduce((a, p) => a + (p.profit30 ?? 0), 0);
  if (ranked.length >= 3 && totalProfit > 0) {
    const top = ranked.slice(0, 3);
    const share = Math.round((top.reduce((a, p) => a + (p.profit30 ?? 0), 0) / totalProfit) * 100);
    f({ id: "champions", level: "info", title: `Tes 3 articles qui rapportent le plus : ${top.map((p) => p.name).join(", ")}`, detail: `Ils font ${share} % de ton bénéfice sur 30 jours.`, action: "Ne sois jamais en rupture sur ces articles : vérifie leur stock chaque semaine." });
  }

  const weak = i.products.filter((p) => p.marginPct !== null && p.marginPct >= 0 && p.marginPct < 8 && p.sold30 > 0);
  if (weak.length) {
    f({ id: "marges", level: "important", title: `Marge très faible sur ${weak.length} article${weak.length > 1 ? "s" : ""}`, detail: weak.slice(0, 5).map((p) => `${p.name} (${p.marginPct} %)`).join(", "), action: "Négocie le prix d'achat avec le fournisseur, ou monte un peu le prix de vente." });
  }

  const noCost = shop.products.filter((p) => p.cost === undefined);
  if (noCost.length) {
    f({ id: "sans-prix-achat", level: "info", title: `${noCost.length} article${noCost.length > 1 ? "s" : ""} sans prix d'achat`, detail: "Sans prix d'achat, Jokko ne peut pas calculer ton vrai bénéfice sur ces articles.", action: "Mets le prix d'achat dans Stock (ou dis « j'ai acheté … à … »)." });
  }

  if (i.overdueTotal > 0) {
    f({ id: "dettes", level: i.overdueTotal >= 50_000 ? "urgent" : "important", title: `${money(i.overdueTotal)} de dettes en retard`, detail: `${i.overdueClients} client${i.overdueClients > 1 ? "s" : ""} n'${i.overdueClients > 1 ? "ont" : "a"} pas payé à la date prévue (total des dettes : ${money(i.debtTotal)}).`, action: "Envoie les relances WhatsApp depuis l'écran Dettes, et limite le crédit à ces clients." });
  }

  if (i.trendPct !== null && Math.abs(i.trendPct) >= 10) {
    f({ id: "tendance", level: i.trendPct < 0 ? "important" : "info", title: `Ventes ${i.trendPct > 0 ? "en hausse" : "en baisse"} de ${Math.abs(i.trendPct)} %`, detail: `${money(i.revenue)} sur les 30 derniers jours, contre ${money(i.previousRevenue)} les 30 jours d'avant.`, action: i.trendPct < 0 ? "Regarde quels articles se vendent moins, et vérifie les ruptures et les prix des voisins." : "Garde le stock des articles qui marchent, c'est le moment." });
  }

  if (i.losses > 0 && i.revenue > 0 && i.losses / i.revenue >= 0.02) {
    f({ id: "pertes", level: "important", title: `Pertes de stock : ${money(i.losses)}`, detail: `${Math.round((i.losses / i.revenue) * 1000) / 10} % des ventes (produits gâtés, cassés ou manquants).`, action: "Fais un inventaire, regarde le Journal, et range mieux les produits fragiles." });
  }

  if (i.bestWeekday && i.salesCount >= 10) {
    f({ id: "rythme", level: "info", title: `Ton meilleur jour : le ${i.bestWeekday}${i.bestHour !== null ? `, vers ${i.bestHour} h` : ""}`, detail: `Vente moyenne : ${money(i.averageSale)}.`, action: "Sois bien approvisionné et présent ce jour-là ; c'est le bon moment pour une promotion." });
  }

  const order = { urgent: 0, important: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

/** Version compacte du diagnostic envoyée au conseiller IA (pas de numéros de téléphone). */
/** Vitesse de vente d'un article : rapide (bientôt épuisé), normale, lente (rarement vendu) ou dormante (jamais / plus vendu). */
export function rotationOf(p: ProductInsight): "rapide" | "normale" | "lente" | "dormante" {
  if (p.sold30 <= 0) return p.idleDays === null || p.idleDays >= 60 ? "dormante" : "lente";
  if (p.daysLeft !== null && p.daysLeft <= 10) return "rapide";
  if ((p.idleDays ?? 0) >= 21 || (p.daysLeft !== null && p.daysLeft >= 120)) return "lente";
  return "normale";
}

export type ExpiringLot = { nom: string; quantite: number; jours_restants: number; lot?: string };

export function insightsForAdvisor(i: Insights, shopName: string, activity: string, expiring: ExpiringLot[] = []) {
  return {
    boutique: shopName,
    activite: activity,
    periode_jours: i.days,
    ventes: i.revenue,
    ventes_periode_precedente: i.previousRevenue,
    evolution_pct: i.trendPct,
    benefice_brut: i.grossProfit,
    depenses: i.expenses,
    pertes: i.losses,
    benefice_net: i.netProfit,
    nombre_ventes: i.salesCount,
    vente_moyenne: i.averageSale,
    meilleur_jour: i.bestWeekday,
    meilleure_heure: i.bestHour,
    paiements: i.payments,
    dettes_total: i.debtTotal,
    dettes_en_retard: i.overdueTotal,
    articles: i.products
      .slice()
      .sort((a, b) => b.revenue30 - a.revenue30)
      .slice(0, 40)
      .map((p) => ({ nom: p.name, unite: p.unit, vendu_30j: p.sold30, ventes_30j: p.revenue30, benefice_30j: p.profit30, marge_pct: p.marginPct, stock: p.stock, jours_de_stock: p.daysLeft, a_commander: p.reorder, jours_sans_vente: p.idleDays, rotation: rotationOf(p), stock_au_prix_achat: p.stockValueAtCost })),
    // Articles qui ne se vendent plus (souvent hors des 40 meilleurs) : argent immobilisé.
    dormants: i.products.filter((p) => p.stock > 0 && rotationOf(p) === "dormante").slice(0, 20).map((p) => ({ nom: p.name, stock: p.stock, jours_sans_vente: p.idleDays, stock_au_prix_achat: p.stockValueAtCost })),
    ...(expiring.length ? { peremption: expiring.slice(0, 30) } : {}),
    constats: i.findings.map((x) => ({ niveau: x.level, titre: x.title, detail: x.detail, action: x.action })),
  };
}
