/**
 * Mon activité (22/11/2026, demande de Fallou : « le nombre d'écrans, de plaquettes, de connecteurs, de services que je
 * fais dans la semaine, le mois, l'année… quel service est le mieux payé, quoi accélérer, et est-ce que je peux un jour
 * aller acheter moi-même en Chine »).
 *
 * Tout est calculé à partir de ce qui est déjà enregistré :
 * - pièces posées sur les réparations (à « Réparé »), ou la pièce prévue au dépôt si l'appareil est payé mais pas encore réparé ;
 * - pièces vendues seules (article du stock, ou ligne écrite « LCD Tecno BF6 ») ;
 * - services (décodage, FRP, configuration…) ;
 * - accessoires et autres articles.
 * Aucun chiffre ne vient de l'IA.
 */
import type { Shop } from "../model.ts";
import { kindOf, laborStats, type PartKind } from "./pricing.ts";
import { productNamedIn } from "./partSearch.ts";
import { isServicePayment } from "./report.ts";

export type Range = "semaine" | "mois" | "annee" | "tout";
export const RANGE_LABELS: Record<Range, string> = { semaine: "Cette semaine", mois: "Ce mois", annee: "Cette année", tout: "Depuis le début" };
const DAY = 86_400_000;

export function rangeOf(range: Range, now = new Date()): { from: Date; to: Date; prevFrom: Date; prevTo: Date; label: string } {
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  let from: Date;
  let prevFrom: Date;
  if (range === "semaine") {
    const monday = (now.getDay() + 6) % 7; // lundi = 0
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - monday);
    prevFrom = new Date(from.getFullYear(), from.getMonth(), from.getDate() - 7);
  } else if (range === "mois") {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    prevFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  } else if (range === "annee") {
    from = new Date(now.getFullYear(), 0, 1);
    prevFrom = new Date(now.getFullYear() - 1, 0, 1);
  } else {
    from = new Date(2000, 0, 1);
    prevFrom = new Date(1999, 0, 1);
  }
  // Période d'avant : même nombre de jours écoulés (lundi → aujourd'hui contre lundi d'avant → même jour).
  const elapsed = to.getTime() - from.getTime();
  const prevTo = new Date(Math.min(from.getTime(), prevFrom.getTime() + elapsed));
  return { from, to, prevFrom, prevTo, label: RANGE_LABELS[range] };
}

/** Pièces : les types que le réparateur compte (« Autre » = pièce sans type connu). */
export const PART_ORDER: PartKind[] = ["Écran", "Plaquette", "Batterie", "Connecteur", "Bouton", "Nappe", "Dos", "Autre"];
export const PART_PLURAL: Record<PartKind, string> = { Écran: "Écrans", Plaquette: "Plaquettes", Batterie: "Batteries", Connecteur: "Connecteurs", Bouton: "Boutons", Nappe: "Nappes", Dos: "Dos / vitres", Autre: "Autres pièces" };

const SERVICE_WORDS = /d[ée]cod|d[ée]bloc|\bfrp\b|flash|configur|r[ée]glage|activation|maintenance|formatage|mise [àa] jour|cr[ée]ation de compte|installation|logiciel|unlock|icloud|bypass|imei|r[ée]paration imprimante/i;
const jobLabel = /^(R[ée]paration|Couture) [RC]-\d|^Service · Commande R-\d/;

type PartEvent = { at: number; kind: PartKind; name: string; qty: number; cost: number; gain: number | null; planned?: boolean; direct: boolean };
type ServiceEvent = { at: number; name: string; amount: number; cost: number };
type ItemEvent = { at: number; name: string; qty: number; amount: number; cost: number | null };

/** Tous les gestes de la boutique (pièces, services, articles, réparations), datés. */
export function activityEvents(shop: Shop) {
  const parts: PartEvent[] = [];
  const services: ServiceEvent[] = [];
  const items: ItemEvent[] = [];
  const repairs: Array<{ at: number; price: number; parts: number; done: boolean }> = [];

  for (const r of shop.repairs ?? []) {
    if (r.status === "annule") continue;
    const posedCost = r.parts.reduce((a, p) => a + p.cost, 0);
    const planned = !r.parts.length && r.paid > 0 ? productNamedIn(shop.products, r.problem) : undefined;
    const plannedCost = planned?.cost ?? 0;
    const partsCost = r.parts.length ? posedCost : plannedCost;
    repairs.push({ at: Date.parse(r.at), price: r.price, parts: partsCost, done: r.status === "rendu" });
    const when = Date.parse(r.repairedAt ?? r.returnedAt ?? r.at);
    // Main-d'œuvre de la réparation attribuée à sa pièce principale (la plus chère).
    const main = [...r.parts].sort((a, b) => b.cost - a.cost)[0];
    for (const p of r.parts) {
      parts.push({ at: when, kind: kindOf(p.label), name: p.label, qty: p.qty || 1, cost: p.cost, gain: p === main ? r.price - posedCost : null, direct: false });
    }
    if (planned) parts.push({ at: Date.parse(r.at), kind: kindOf(planned.name), name: planned.name, qty: 1, cost: plannedCost, gain: r.price - plannedCost, planned: true, direct: false });
  }

  for (const s of shop.sales) {
    const at = Date.parse(s.at);
    if (jobLabel.test(s.label)) continue; // paiements des réparations : comptés avec la réparation
    const product = s.productId ? shop.products.find((p) => p.id === s.productId) : undefined;
    const name = product?.name ?? s.label;
    const kind = kindOf(name);
    if (kind !== "Autre" && !s.label.startsWith("Service · ")) {
      parts.push({ at, kind, name, qty: s.qty ?? 1, cost: s.cost ?? 0, gain: s.cost !== undefined ? s.amount - s.cost : null, direct: true });
      continue;
    }
    if (s.label.startsWith("Service · ") || (!s.productId && (isServicePayment(s) || SERVICE_WORDS.test(s.label)))) {
      const clean = s.label.replace(/^Service · /, "").replace(/\s*[(×].*$/, "").trim() || "Service";
      services.push({ at, name: clean, amount: s.amount, cost: s.cost ?? 0 });
      continue;
    }
    items.push({ at, name, qty: s.qty ?? 1, amount: s.amount, cost: s.cost ?? null });
  }
  return { parts, services, items, repairs };
}

export type KindRow = { kind: PartKind; label: string; count: number; prev: number; cost: number; gain: number; gainKnown: number; models: Array<{ name: string; count: number }> };
export type ServiceRow = { name: string; count: number; prev: number; revenue: number; avg: number; gain: number };
export type ItemRow = { name: string; qty: number; revenue: number; gain: number | null };

export type ActivityReport = {
  label: string;
  days: number;
  parts: KindRow[];
  partsCount: number;
  partsPrev: number;
  partsCost: number;
  services: ServiceRow[];
  servicesCount: number;
  servicesRevenue: number;
  items: ItemRow[];
  repairs: { count: number; done: number; revenue: number; labor: number; avgLabor: number };
  /** Constats calculés (pas d'IA) : ce qui monte, le mieux payé, quoi accélérer. */
  notes: string[];
};

const fmt = (n: number) => `${Math.round(n).toLocaleString("fr-FR").replace(/[  ]/g, " ")} F`;

export function activityReport(shop: Shop, range: Range, now = new Date()): ActivityReport {
  const r = rangeOf(range, now);
  const ev = activityEvents(shop);
  const inP = (t: number) => t >= r.from.getTime() && t < r.to.getTime();
  const inPrev = (t: number) => range !== "tout" && t >= r.prevFrom.getTime() && t < r.prevTo.getTime();

  const kinds = new Map<PartKind, KindRow>();
  const row = (k: PartKind) => kinds.get(k) ?? (kinds.set(k, { kind: k, label: PART_PLURAL[k], count: 0, prev: 0, cost: 0, gain: 0, gainKnown: 0, models: [] }), kinds.get(k)!);
  const modelCount = new Map<PartKind, Map<string, number>>();
  for (const p of ev.parts) {
    if (inP(p.at)) {
      const k = row(p.kind);
      k.count += p.qty;
      k.cost += p.cost;
      if (p.gain !== null) { k.gain += p.gain; k.gainKnown += 1; }
      const m = modelCount.get(p.kind) ?? new Map<string, number>();
      m.set(p.name, (m.get(p.name) ?? 0) + p.qty);
      modelCount.set(p.kind, m);
    } else if (inPrev(p.at)) row(p.kind).prev += p.qty;
  }
  for (const [k, m] of modelCount) row(k as PartKind).models = [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5);
  const parts = PART_ORDER.map((k) => kinds.get(k)).filter((k): k is KindRow => Boolean(k && (k.count || k.prev)));

  const svc = new Map<string, ServiceRow>();
  for (const s of ev.services) {
    const key = s.name.toLocaleLowerCase("fr");
    const x = svc.get(key) ?? { name: s.name, count: 0, prev: 0, revenue: 0, avg: 0, gain: 0 };
    if (inP(s.at)) { x.count += 1; x.revenue += s.amount; x.gain += s.amount - s.cost; }
    else if (inPrev(s.at)) x.prev += 1;
    svc.set(key, x);
  }
  const services = [...svc.values()].filter((x) => x.count || x.prev).map((x) => ({ ...x, avg: x.count ? Math.round(x.revenue / x.count) : 0 })).sort((a, b) => b.revenue - a.revenue);

  const it = new Map<string, ItemRow>();
  for (const i of ev.items) {
    if (!inP(i.at)) continue;
    const x = it.get(i.name) ?? { name: i.name, qty: 0, revenue: 0, gain: 0 };
    x.qty += i.qty;
    x.revenue += i.amount;
    x.gain = x.gain === null || i.cost === null ? null : x.gain + (i.amount - i.cost);
    it.set(i.name, x);
  }
  const items = [...it.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 12);

  const reps = ev.repairs.filter((x) => inP(x.at));
  const repRevenue = reps.reduce((a, x) => a + x.price, 0);
  const labor = reps.reduce((a, x) => a + x.price - x.parts, 0);

  const firstAt = Math.min(...[...ev.parts, ...ev.services, ...ev.items].map((x) => x.at), now.getTime());
  const days = Math.max(1, Math.round((Math.min(r.to.getTime(), now.getTime()) - Math.max(r.from.getTime(), firstAt)) / DAY) + (range === "tout" ? 0 : 0));

  const partsCount = parts.reduce((a, k) => a + k.count, 0);
  const partsPrev = parts.reduce((a, k) => a + k.prev, 0);
  const notes: string[] = [];
  const prevWord = range === "semaine" ? "la semaine d'avant" : range === "mois" ? "le mois d'avant (mêmes jours)" : "l'an dernier (mêmes jours)";
  const screens = kinds.get("Écran");
  if (screens?.count) notes.push(`${screens.count} écran${screens.count > 1 ? "s" : ""} changé${screens.count > 1 ? "s" : ""}${range !== "tout" && screens.prev ? ` (${screens.prev} ${prevWord})` : ""}${screens.models[0] && screens.models[0].count >= 2 ? ` · le plus demandé : ${screens.models[0].name} (${screens.models[0].count})` : ""}.`);
  const rising = parts.filter((k) => range !== "tout" && k.count > k.prev && k.count >= 2).sort((a, b) => (b.count - b.prev) - (a.count - a.prev))[0];
  if (rising && rising.kind !== "Écran") notes.push(`${rising.label} en hausse : ${rising.count} contre ${rising.prev} ${prevWord}.`);
  const bestPaid = services.filter((s) => s.count).sort((a, b) => b.avg - a.avg)[0];
  if (bestPaid) notes.push(`Service le mieux payé : ${bestPaid.name}, ${fmt(bestPaid.avg)} en moyenne (${bestPaid.count} fois).`);
  const mostDone = services.filter((s) => s.count).sort((a, b) => b.count - a.count)[0];
  if (mostDone && mostDone !== bestPaid) notes.push(`Service le plus fait : ${mostDone.name} (${mostDone.count} fois, ${fmt(mostDone.revenue)}).`);
  const perJob = parts.filter((k) => k.gainKnown && k.count).map((k) => ({ k, avg: k.gain / k.gainKnown })).sort((a, b) => b.avg - a.avg);
  if (perJob[0]) notes.push(`Ce qui rapporte le plus par travail : ${perJob[0].k.label.toLowerCase()} (${fmt(perJob[0].avg)} de main-d'œuvre en moyenne).`);
  // À accélérer : bien payé mais encore rare.
  const fewButGood = [...perJob.map((x) => ({ name: x.k.label.toLowerCase(), avg: x.avg, count: x.k.count })), ...services.filter((s) => s.count).map((s) => ({ name: s.name, avg: s.gain / s.count, count: s.count }))]
    .filter((x) => x.count <= 2 && x.avg >= 4000)
    .sort((a, b) => b.avg - a.avg)[0];
  if (fewButGood) notes.push(`À pousser : ${fewButGood.name} rapporte ${fmt(fewButGood.avg)} par travail mais tu n'en as fait que ${fewButGood.count}. Parle-en à tes clients, mets-le sur ton statut WhatsApp.`);

  return {
    label: r.label,
    days,
    parts,
    partsCount,
    partsPrev,
    partsCost: parts.reduce((a, k) => a + k.cost, 0),
    services,
    servicesCount: services.reduce((a, s) => a + s.count, 0),
    servicesRevenue: services.reduce((a, s) => a + s.revenue, 0),
    items,
    repairs: { count: reps.length, done: reps.filter((x) => x.done).length, revenue: repRevenue, labor, avgLabor: reps.length ? Math.round(labor / reps.length) : 0 },
    notes,
  };
}

// ---------- Objectif Chine : acheter moi-même ----------

export type ChinaInput = {
  /** Combien moins cher en Chine qu'au fournisseur (%), hypothèse à vérifier. */
  discountPct: number;
  /** Combien de mois de pièces acheter en un voyage. */
  months: number;
  ticket: number;
  visa: number;
  stay: number;
  /** Transport des colis et douane (% de la marchandise). */
  freightPct: number;
  /** Part du bénéfice mise de côté chaque mois pour le voyage (%). */
  savePct: number;
  /** Commande en ligne depuis la Chine, sans voyager : avion + douane + agent (% de la marchandise). */
  airPct: number;
};

/** Hypothèses de départ (modifiables) : billet Dakar–Guangzhou, visa, 10 jours sur place, fret + douane. */
export const CHINA_DEFAULTS: ChinaInput = { discountPct: 30, months: 3, ticket: 650_000, visa: 100_000, stay: 350_000, freightPct: 20, savePct: 50, airPct: 30 };

export type ChinaPlan = {
  days: number;
  /** Achats réels chez le fournisseur (factures), par mois sur les 12 derniers mois connus ; 0 si pas d'historique. */
  supplierPerMonth: number;
  supplierName?: string;
  /** Base du calcul : achats réels chez le fournisseur, ou pièces utilisées dans Jokko. */
  base: "fournisseur" | "jokko";
  /** Commande en ligne sans voyager : économie par commande et remise minimale pour gagner. */
  onlineSaving: number;
  onlineBreakEvenPct: number;
  /** Remise minimale en Chine pour que le voyage gagne quelque chose. */
  tripBreakEvenPct: number | null;
  /** Pièces utilisées par mois, au prix du fournisseur. */
  partsPerMonth: number;
  /** Bénéfice moyen par mois (ventes − prix d'achat − dépenses). */
  profitPerMonth: number;
  perMonthByKind: Array<{ label: string; qty: number; cost: number }>;
  topModels: Array<{ name: string; qty: number; cost: number }>;
  order: number;
  freight: number;
  tripFixed: number;
  budget: number;
  savingPerTrip: number;
  /** Achats de pièces par mois au-dessus desquels le voyage devient rentable. */
  breakEvenPerMonth: number;
  monthsToSave: number | null;
  verdict: "pas-encore" | "bientot" | "oui";
  confidence: "faible" | "moyenne" | "bonne";
};

export function chinaPlan(shop: Shop, input: ChinaInput, now = new Date()): ChinaPlan {
  const ev = activityEvents(shop);
  const from = now.getTime() - 180 * DAY; // 6 derniers mois au plus
  const used = ev.parts.filter((p) => p.at >= from && p.at <= now.getTime());
  const all = [...ev.parts, ...ev.services, ...ev.items].map((x) => x.at).filter((t) => t >= from);
  const first = all.length ? Math.min(...all) : now.getTime();
  const days = Math.max(1, Math.round((now.getTime() - first) / DAY) + 1);
  const scale = 30 / days;
  const partsPerMonth = Math.round(used.reduce((a, p) => a + p.cost, 0) * scale);

  const byKind = new Map<string, { label: string; qty: number; cost: number }>();
  const byModel = new Map<string, { name: string; qty: number; cost: number }>();
  for (const p of used) {
    const k = byKind.get(p.kind) ?? { label: PART_PLURAL[p.kind], qty: 0, cost: 0 };
    k.qty += p.qty; k.cost += p.cost; byKind.set(p.kind, k);
    const m = byModel.get(p.name) ?? { name: p.name, qty: 0, cost: 0 };
    m.qty += p.qty; m.cost += p.cost; byModel.set(p.name, m);
  }
  const perMonth = (x: { qty: number; cost: number }) => ({ qty: Math.round(x.qty * scale * 10) / 10, cost: Math.round(x.cost * scale) });
  const perMonthByKind = [...byKind.values()].map((k) => ({ label: k.label, ...perMonth(k) })).sort((a, b) => b.cost - a.cost);
  const topModels = [...byModel.values()].map((m) => ({ name: m.name, ...perMonth(m) })).sort((a, b) => b.cost - a.cost).slice(0, 10);

  // Bénéfice moyen par mois : ventes − prix d'achat − dépenses (sur la même fenêtre).
  const sales = shop.sales.filter((s) => Date.parse(s.at) >= first);
  const spent = shop.expenses.filter((e) => Date.parse(e.at) >= first && e.kind !== "achat").reduce((a, e) => a + e.amount, 0);
  const profitPerMonth = Math.round((sales.reduce((a, s) => a + s.amount - (s.cost ?? 0), 0) - spent) * scale);

  // Achats réels chez le fournisseur (historique des factures) : moyenne des 12 derniers mois connus.
  const suppliers = (shop.suppliers ?? []).filter((x) => x.purchases?.length);
  const months = suppliers.flatMap((x) => x.purchases ?? []);
  const byMonth = new Map<string, number>();
  for (const x of months) byMonth.set(x.month, (byMonth.get(x.month) ?? 0) + x.total);
  const last12 = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);
  const supplierPerMonth = last12.length ? Math.round(last12.reduce((a, [, v]) => a + v, 0) / last12.length) : 0;
  const base: ChinaPlan["base"] = supplierPerMonth > partsPerMonth ? "fournisseur" : "jokko";
  const buy = base === "fournisseur" ? supplierPerMonth : partsPerMonth;

  const d = Math.min(0.9, Math.max(0, input.discountPct / 100));
  const f = Math.max(0, input.freightPct / 100);
  const air = Math.max(0, input.airPct / 100);
  const m = Math.max(1, input.months);
  const order = Math.round(buy * m * (1 - d));
  const freight = Math.round(order * f);
  const tripFixed = Math.round(input.ticket + input.visa + input.stay);
  const budget = order + freight + tripFixed;
  const savingPerTrip = Math.round(buy * m - order - freight - tripFixed);
  const onlineSaving = Math.round(buy * m - order * (1 + air));
  const onlineBreakEvenPct = Math.round((1 - 1 / (1 + air)) * 100);
  // Remise r telle que buy·m = buy·m·(1−r)·(1+f) + T.
  const value = buy * m;
  const tripBreakEvenPct = value > tripFixed ? Math.round((1 - (value - tripFixed) / (value * (1 + f))) * 100) : null;
  const margin = m * (d - (1 - d) * f);
  const breakEvenPerMonth = margin > 0 ? Math.round(tripFixed / margin) : Infinity;
  const putAside = profitPerMonth * Math.max(0, input.savePct) / 100;
  const monthsToSave = putAside > 0 ? Math.ceil(budget / putAside) : null;
  const verdict: ChinaPlan["verdict"] = savingPerTrip > 0 && monthsToSave !== null && monthsToSave <= 6 ? "oui" : savingPerTrip > 0 || (Number.isFinite(breakEvenPerMonth) && buy >= breakEvenPerMonth * 0.6) ? "bientot" : "pas-encore";
  const confidence: ChinaPlan["confidence"] = base === "fournisseur" && last12.length >= 6 ? "bonne" : days >= 120 ? "bonne" : days >= 45 ? "moyenne" : "faible";
  return { days, supplierPerMonth, ...(suppliers[0] ? { supplierName: suppliers[0].name } : {}), base, onlineSaving, onlineBreakEvenPct, tripBreakEvenPct, partsPerMonth, profitPerMonth, perMonthByKind, topModels, order, freight, tripFixed, budget, savingPerTrip, breakEvenPerMonth: Number.isFinite(breakEvenPerMonth) ? breakEvenPerMonth : 0, monthsToSave, verdict, confidence };
}

/** Ce que le Conseiller (IA) reçoit : seulement des chiffres calculés ici. */
export function activityForAdvisor(shop: Shop, now = new Date()) {
  const week = activityReport(shop, "semaine", now);
  const month = activityReport(shop, "mois", now);
  const china = chinaPlan(shop, CHINA_DEFAULTS, now);
  const kinds = (r: ActivityReport) => r.parts.map((k) => ({ type: k.label, nombre: k.count, periode_avant: k.prev, prix_achat_total: k.cost, modeles: k.models.slice(0, 3) }));
  const svc = (r: ActivityReport) => r.services.slice(0, 12).map((s) => ({ service: s.name, fois: s.count, periode_avant: s.prev, encaisse: s.revenue, prix_moyen: s.avg }));
  return {
    atelier_semaine: { pieces: kinds(week), services: svc(week), reparations: week.repairs, constats: week.notes },
    atelier_mois: { pieces: kinds(month), services: svc(month), reparations: month.repairs, constats: month.notes },
    objectif_chine: {
      hypotheses: { moins_cher_en_chine_pct: CHINA_DEFAULTS.discountPct, mois_de_stock_par_voyage: CHINA_DEFAULTS.months, billet: CHINA_DEFAULTS.ticket, visa: CHINA_DEFAULTS.visa, sejour: CHINA_DEFAULTS.stay, fret_douane_pct: CHINA_DEFAULTS.freightPct },
      jours_de_donnees: china.days,
      pieces_par_mois_prix_fournisseur: china.partsPerMonth,
      achats_reels_par_mois_chez_le_fournisseur: china.supplierPerMonth,
      base_du_calcul: china.base,
      commande_en_ligne_economie: china.onlineSaving,
      commande_en_ligne_remise_minimale_pct: china.onlineBreakEvenPct,
      voyage_remise_minimale_pct: china.tripBreakEvenPct,
      benefice_par_mois: china.profitPerMonth,
      budget_voyage_et_stock: china.budget,
      economie_par_voyage: china.savingPerTrip,
      achats_par_mois_pour_etre_rentable: china.breakEvenPerMonth,
      mois_pour_reunir_le_budget: china.monthsToSave,
      verdict: china.verdict,
      fiabilite: china.confidence,
      modeles_les_plus_utilises: china.topModels.slice(0, 6),
    },
  };
}

// ---------- Ce que les pièces du fournisseur ont probablement rapporté ----------

export type SupplierEstimate = {
  months: number;
  bought: number;
  /** Main-d'œuvre probable sur les pièces achetées (ce qui reste quand la pièce est payée). */
  profit: number;
  low: number;
  high: number;
  perMonth: number;
  lines: Array<{ label: string; qty: number; perPiece: number | null; profit: number; how: string }>;
};

const PIECE_KIND: Record<string, PartKind> = { Écrans: "Écran", Batteries: "Batterie", Plaquettes: "Plaquette" };

/**
 * Estimation (22/11/2026, demande de Fallou : « calcule les bénéfices probables depuis qu'on travaille avec lui ») :
 * écrans, batteries, plaquettes = pièces achetées × 90 % posées (le reste en stock, cassé ou rendu) × ta main-d'œuvre
 * habituelle (apprise de tes réparations dans Jokko) ; autres pièces = vendues au double de leur prix (prudent).
 * Fourchette : 85 % posées et main-d'œuvre −15 %, jusqu'à 95 % et +5 %.
 */
export function supplierProfitEstimate(shop: Shop): SupplierEstimate | null {
  const sup = (shop.suppliers ?? []).find((x) => x.purchases?.length && x.kinds?.length);
  if (!sup?.purchases || !sup.kinds) return null;
  const bought = sup.purchases.reduce((a, m) => a + m.total, 0);
  const itemsTotal = sup.kinds.reduce((a, k) => a + k.total, 0) || 1;
  const scale = bought / itemsTotal; // les lignes lues couvrent ≈ 95 % des factures
  const stats = laborStats(shop);
  const lines = sup.kinds.map((k) => {
    const kind = PIECE_KIND[k.label];
    if (kind) {
      const perPiece = stats[kind].labor;
      const qty = Math.round(k.qty * scale * 0.9);
      return { label: k.label, qty, perPiece, profit: qty * perPiece, how: `${qty} posées × ${perPiece.toLocaleString("fr-FR").replace(/[\u202f\u00a0]/g, " ")} F${stats[kind].learned ? "" : " (main-d'œuvre de départ)"}` };
    }
    const profit = Math.round(k.total * scale * 0.9);
    return { label: k.label, qty: Math.round(k.qty * scale * 0.9), perPiece: null, profit, how: "revendues au double du prix d'achat" };
  });
  const profit = lines.reduce((a, l) => a + l.profit, 0);
  const sorted = [...sup.purchases].sort((a, b) => a.month.localeCompare(b.month));
  const [y0, m0] = sorted[0].month.split("-").map(Number);
  const [y1, m1] = sorted[sorted.length - 1].month.split("-").map(Number);
  const months = (y1 - y0) * 12 + (m1 - m0) + 1;
  return { months, bought, profit, low: Math.round(profit * (0.85 / 0.9) * 0.85), high: Math.round(profit * (0.95 / 0.9) * 1.05), perMonth: Math.round(profit / months), lines };
}

// ---------- Contrôle : pièces achetées chez le fournisseur ↔ pièces sorties dans Jokko ----------

export type PurchaseCheck = { month: string; bought: number; used: number; gap: number };

/**
 * Contrôle strict (22/11/2026, demande de Fallou) : chaque mois depuis que Jokko est utilisé,
 * ce qui a été acheté chez le fournisseur (factures) face aux pièces sorties dans Jokko
 * (posées, prévues au dépôt, vendues seules) au prix d'achat. L'écart = pièces encore en stock,
 * cassées, rendues… ou posées sans être notées. Stock actuel au prix d'achat pour comparer.
 */
export function purchaseControl(shop: Shop): { months: PurchaseCheck[]; bought: number; used: number; gap: number; stockValue: number } | null {
  const sup = (shop.suppliers ?? []).filter((x) => x.purchases?.length);
  if (!sup.length) return null;
  const ev = activityEvents(shop);
  const firstUse = ev.parts.length ? Math.min(...ev.parts.map((p) => p.at)) : null;
  if (firstUse === null) return null;
  const startMonth = new Date(firstUse).toISOString().slice(0, 7);
  const used = new Map<string, number>();
  for (const p of ev.parts) {
    const m = new Date(p.at).toISOString().slice(0, 7);
    used.set(m, (used.get(m) ?? 0) + p.cost * (p.direct ? 1 : p.qty));
  }
  const bought = new Map<string, number>();
  for (const x of sup.flatMap((s) => s.purchases ?? [])) if (x.month >= startMonth) bought.set(x.month, (bought.get(x.month) ?? 0) + x.total);
  const keys = [...new Set([...bought.keys(), ...used.keys()])].filter((m) => m >= startMonth).sort();
  const months = keys.map((month) => { const b = bought.get(month) ?? 0; const u = Math.round(used.get(month) ?? 0); return { month, bought: b, used: u, gap: b - u }; });
  const sum = (f: (x: PurchaseCheck) => number) => months.reduce((a, x) => a + f(x), 0);
  const stockValue = Math.round(shop.products.filter((p) => kindOf(p.name) !== "Autre").reduce((a, p) => a + Math.max(0, p.stock) * (p.cost ?? 0), 0));
  return { months, bought: sum((x) => x.bought), used: sum((x) => x.used), gap: sum((x) => x.gap), stockValue };
}
