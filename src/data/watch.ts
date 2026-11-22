/**
 * Surveillance de l'atelier (22/11/2026, demande de Fallou : « superviser tout ce qui se passe : les écrans qui
 * marchent le mieux, les prix qui baissent ou montent, tout devrait être signalé ; les services sans matériel »).
 *
 * Tout est calculé avec les données de la boutique (rien n'est envoyé) :
 * - prix du fournisseur (historique lu dans la discussion WhatsApp) : hausse / baisse ;
 * - pièces qui montent / qui baissent (6 derniers mois contre les 6 d'avant) ;
 * - pièces qui partent beaucoup mais à 0 dans le stock de Jokko ;
 * - contrôle acheté ↔ sorti, erreurs des factures (comptées trop cher) ;
 * - réparations rendues sans pièce notée (bénéfice faux), écrans vendus avec trop peu de gain ;
 * - services sans matériel (configuration, décodage, logiciel…) : nombre, argent, le meilleur.
 */
import { type Shop, type SupplierItem, money } from "../model.ts";
import { partForSale } from "./partSearch.ts";
import { kindOf } from "./pricing.ts";
import { isToolService } from "./services.ts";
import { purchaseControl } from "./workshopStats.ts";

export type SignalLevel = "grave" | "attention" | "info" | "bon";
export type SignalGroup = "prix" | "tendance" | "stock" | "controle" | "argent" | "services";
export type Signal = { id: string; level: SignalLevel; group: SignalGroup; title: string; text: string };

const DAY = 86_400_000;
const pct = (a: number, b: number) => Math.round(((a - b) / b) * 100);
const frDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const PART_WORDS = /[ée]cran|lcd|batterie|connecteur|charge|dos|vitre|cover|bouton|plaquette|nappe|cam[ée]ra|haut[- ]parleur|cass[ée]/i;

/** Le dernier changement de prix d'une pièce, s'il est net (pas deux qualités vendues le même jour). */
export function priceMove(i: SupplierItem): { from: number; to: number; at: string; pct: number } | null {
  const p = i.prices ?? [];
  if (p.length < 2) return null;
  const [prevAt, prev] = p[p.length - 2]!;
  const [at, last] = p[p.length - 1]!;
  // Deux prix qui alternent à quelques jours = deux qualités (copie / original), pas une hausse.
  if ((Date.parse(at) - Date.parse(prevAt)) / DAY < 14) return null;
  if (p.length >= 3 && p[p.length - 3]![1] === last) return null;
  const change = pct(last, prev);
  return Math.abs(change) >= 5 ? { from: prev, to: last, at, pct: change } : null;
}

/** Une pièce avec un vrai modèle (pas « Plaquette » ou « Connecteur mélange » tout court). */
export function hasModel(i: SupplierItem): boolean {
  if (i.kind === "Autre") return false;
  const model = i.name.replace(new RegExp(`^${i.kind}\\s*`, "i"), "").trim();
  return !!model && !/^(m ?[ée]?lange|melange|mix|simple|divers|mixte)$/i.test(model);
}

export type Trend = { item: SupplierItem; recent: number; older: number; perMonth: number };

/** Pièces qui montent (≥ 6 en 6 mois et × 1,5) et qui baissent (≥ 6 avant et divisé par 2). */
export function trends(shop: Shop): { up: Trend[]; down: Trend[] } {
  const items = (shop.suppliers ?? []).flatMap((s) => s.items ?? []).filter(hasModel);
  const t = (i: SupplierItem): Trend => ({ item: i, recent: i.recent ?? 0, older: i.older ?? 0, perMonth: Math.round(((i.recent ?? 0) / 6) * 10) / 10 });
  const up = items.filter((i) => (i.recent ?? 0) >= 6 && (i.recent ?? 0) >= 1.5 * (i.older ?? 0)).map(t).sort((a, b) => b.recent - b.older - (a.recent - a.older));
  const down = items.filter((i) => (i.older ?? 0) >= 6 && (i.recent ?? 0) <= 0.5 * (i.older ?? 0)).map(t).sort((a, b) => b.older - b.recent - (a.older - a.recent));
  return { up, down };
}

export type ServiceLine = { name: string; count: number; earned: number; tool: boolean; avg: number };
export type SkillReport = { month: { count: number; earned: number }; prev: { count: number; earned: number }; total: { count: number; earned: number }; lines: ServiceLine[]; best?: ServiceLine };

const monthStart = (d: Date, back = 0) => new Date(d.getFullYear(), d.getMonth() - back, 1).getTime();

/**
 * Services sans matériel : ventes « Service · … » sans matière, et réparations rendues sans pièce dont la panne
 * ne demande pas de pièce (plantage, configuration, logiciel…). Tout est main-d'œuvre : ta compétence.
 */
export function skillServices(shop: Shop, now = new Date()): SkillReport {
  type Ev = { at: number; name: string; amount: number; tool: boolean };
  const ev: Ev[] = [];
  for (const s of shop.sales) {
    if (s.productId || !s.label.startsWith("Service · ") || /Commande R-\d/.test(s.label) || (s.cost ?? 0) > 0) continue;
    const name = s.label.replace(/^Service · /, "").replace(/\s*[(×].*$/, "").trim() || "Service";
    ev.push({ at: Date.parse(s.at), name, amount: s.amount, tool: isToolService(s.label) });
  }
  for (const r of shop.repairs ?? []) {
    if (r.status === "annule" || r.parts.length || !r.paid || PART_WORDS.test(r.problem)) continue;
    const name = r.problem.split("·")[0]!.trim() || "Réparation sans pièce";
    ev.push({ at: Date.parse(r.returnedAt ?? r.repairedAt ?? r.at), name: name.charAt(0).toUpperCase() + name.slice(1), amount: r.paid, tool: isToolService(name) });
  }
  const sum = (xs: Ev[]) => ({ count: xs.length, earned: xs.reduce((a, x) => a + x.amount, 0) });
  const m0 = monthStart(now);
  const m1 = monthStart(now, 1);
  const by = new Map<string, ServiceLine>();
  for (const e of ev) {
    const key = e.name.toLowerCase();
    const l = by.get(key) ?? { name: e.name, count: 0, earned: 0, tool: e.tool, avg: 0 };
    l.count++; l.earned += e.amount; by.set(key, l);
  }
  const lines = [...by.values()].map((l) => ({ ...l, avg: Math.round(l.earned / l.count) })).sort((a, b) => b.earned - a.earned);
  return { month: sum(ev.filter((e) => e.at >= m0)), prev: sum(ev.filter((e) => e.at >= m1 && e.at < m0)), total: sum(ev), lines, ...(lines[0] ? { best: lines[0] } : {}) };
}

/** Tous les signaux, les plus graves d'abord. */
export function workshopWatch(shop: Shop, now = new Date()): Signal[] {
  const out: Signal[] = [];
  const sup = (shop.suppliers ?? []).find((s) => s.items?.length || s.purchases?.length);
  const items = sup?.items ?? [];
  const recentFrom = sup?.historyTo ? Date.parse(sup.historyTo) - 120 * DAY : 0;

  // 1. Erreurs des factures (comptées trop cher), gardées à la dernière lecture.
  const bad = (sup?.anomalies ?? []).filter((x) => x.serious);
  if (bad.length) {
    const over = bad.reduce((a, x) => a + (Number(/(\d[\d\s\u00a0\u202f]*) F de trop/.exec(x.text)?.[1]?.replace(/[\s\u00a0\u202f]/g, "")) || 0), 0);
    out.push({ id: `factures-${bad.length}`, level: "attention", group: "controle", title: `${bad.length} erreur${bad.length > 1 ? "s" : ""} dans les factures${over ? ` : ${money(over)} comptés en trop` : ""}`, text: `${bad.slice(0, 3).map((a) => a.text).join(" ")}${bad.length > 3 ? " … (liste complète dans « Mon argent chez le fournisseur »)" : ""}` });
  }

  // 2. Contrôle : acheté ↔ sorti.
  const c = purchaseControl(shop);
  if (c) {
    const missing = c.gap - c.stockValue;
    if (missing > 0) out.push({ id: "controle", level: missing > c.bought * 0.3 ? "grave" : "attention", group: "controle", title: `${money(missing)} de pièces à retrouver`, text: `Depuis ton 1er jour dans Jokko : acheté ${money(c.bought)}, sorti (posé ou vendu) ${money(c.used)}, en stock ${money(c.stockValue)}. Compte ton stock et note chaque réparation.` });
  }

  // 3. Réparations rendues sans pièce alors que la panne en demande une : bénéfice faux.
  const noPart = (shop.repairs ?? []).filter((r) => r.status === "rendu" && !r.parts.length && PART_WORDS.test(r.problem) && r.price > 3000);
  if (noPart.length) out.push({ id: "sans-piece", level: "attention", group: "argent", title: `${noPart.length} réparation${noPart.length > 1 ? "s" : ""} rendue${noPart.length > 1 ? "s" : ""} sans pièce notée`, text: `${noPart.slice(0, 5).map((r) => `${r.number} (${r.device}, ${r.problem.split("·")[0]!.trim()})`).join(", ")} : le prix de la pièce manque, le bénéfice affiché est trop haut. Bénéfices → Le détail → Corriger.` });

  // 4. Écrans posés avec trop peu de gain (30 derniers jours).
  const low = (shop.repairs ?? []).filter((r) => r.parts.length && Date.parse(r.repairedAt ?? r.at) >= now.getTime() - 30 * DAY && kindOf(r.parts[0]!.label) === "Écran" && r.price - r.parts.reduce((a, p) => a + p.cost * (p.qty || 1), 0) < 5000);
  if (low.length) out.push({ id: "gain-bas", level: "info", group: "argent", title: `${low.length} écran${low.length > 1 ? "s" : ""} posé${low.length > 1 ? "s" : ""} avec moins de 5 000 F de gain`, text: `${low.slice(0, 4).map((r) => `${r.device} : ${money(r.price - r.parts.reduce((a, p) => a + p.cost * (p.qty || 1), 0))}`).join(" · ")}. Les écrans chers doivent rapporter au moins autant que les autres.` });

  // 5. Prix du fournisseur qui bougent (derniers 4 mois de factures).
  const moves = items.filter(hasModel).map((i) => ({ i, m: priceMove(i) })).filter((x): x is { i: SupplierItem; m: NonNullable<ReturnType<typeof priceMove>> } => !!x.m && Date.parse(x.m.at) >= recentFrom).sort((a, b) => b.i.qty - a.i.qty);
  for (const { i, m } of moves.filter((x) => x.m.pct > 0).slice(0, 5)) {
    out.push({ id: `prix+${i.key}`, level: "attention", group: "prix", title: `Prix en hausse : ${i.name}`, text: `${money(m.from)} → ${money(m.to)} (+${m.pct} %) depuis le ${frDate(m.at)}. Demande pourquoi, ou compare avec un autre fournisseur.` });
  }
  for (const { i, m } of moves.filter((x) => x.m.pct < 0).slice(0, 5)) {
    out.push({ id: `prix-${i.key}`, level: "bon", group: "prix", title: `Prix en baisse : ${i.name}`, text: `${money(m.from)} → ${money(m.to)} (${m.pct} %) depuis le ${frDate(m.at)}. Bon moment pour en prendre un peu plus.` });
  }

  // 6. Ce qui monte / baisse, et les pièces qui partent beaucoup mais à 0 dans Jokko.
  const { up, down } = trends(shop);
  for (const t of up.slice(0, 5)) {
    out.push({ id: `monte-${t.item.key}`, level: "bon", group: "tendance", title: `${t.item.name} monte`, text: `${t.recent} achetés ces 6 derniers mois contre ${t.older} les 6 mois d'avant (≈ ${t.perMonth} par mois).` });
  }
  for (const t of down.slice(0, 5)) {
    out.push({ id: `baisse-${t.item.key}`, level: "info", group: "tendance", title: `${t.item.name} baisse`, text: `${t.recent} achetés ces 6 derniers mois contre ${t.older} avant. N'en garde qu'un ou deux en stock.` });
  }
  const stars = items.filter((i) => (i.recent ?? 0) >= 6 && i.kind !== "Autre").sort((a, b) => (b.recent ?? 0) - (a.recent ?? 0)).slice(0, 12);
  const empty: string[] = [];
  for (const i of stars) {
    const hit = partForSale(shop.products, i.name, kindOf).product;
    if (!hit || hit.stock <= 0) empty.push(`${i.name} (≈ ${Math.round(((i.recent ?? 0) / 6) * 10) / 10}/mois)`);
  }
  if (empty.length) out.push({ id: "stars-vides", level: "attention", group: "stock", title: `${empty.length} pièce${empty.length > 1 ? "s" : ""} qui partent beaucoup sont à 0 dans Jokko`, text: `${empty.slice(0, 6).join(", ")}${empty.length > 6 ? "…" : ""}. Compte ton stock (Stock → Compter mon stock) pour que Jokko sache ce que tu as vraiment.` });

  // 7. Ventes d'article sans prix d'achat ce mois.
  const m0 = monthStart(now);
  const blind = shop.sales.filter((s) => s.productId && s.cost === undefined && Date.parse(s.at) >= m0);
  if (blind.length) out.push({ id: "sans-achat", level: "attention", group: "argent", title: `${blind.length} vente${blind.length > 1 ? "s" : ""} sans prix d'achat ce mois`, text: "Le bénéfice de ces ventes n'est pas connu. Caisse → Historique → Modifier, ou mets le prix d'achat dans la fiche de l'article." });

  // 8. Services sans matériel : le meilleur du mois.
  const sk = skillServices(shop, now);
  if (sk.month.count) out.push({ id: "services", level: "bon", group: "services", title: `Services sans matériel ce mois : ${money(sk.month.earned)}`, text: `${sk.month.count} service${sk.month.count > 1 ? "s" : ""}${sk.prev.count ? ` (le mois dernier : ${sk.prev.count}, ${money(sk.prev.earned)})` : ""}. Tout est gain : c'est ta compétence.` });

  const rank: Record<SignalLevel, number> = { grave: 0, attention: 1, info: 2, bon: 3 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

/** Nombre de signaux à regarder (grave + attention), pour la pastille. */
export const watchCount = (shop: Shop, now = new Date()) => workshopWatch(shop, now).filter((s) => s.level === "grave" || s.level === "attention").length;
