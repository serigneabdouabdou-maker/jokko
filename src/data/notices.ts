/**
 * Ce qui attend le commerçant, écran par écran (15/11/2026, demande de Fallou : « sur chaque partie, des
 * notifications affichées en haut : tu vois 1, 2… sans toucher »).
 * Calculé seulement avec les données de la boutique (rien n'est envoyé ailleurs). Chaque avis dit quoi faire.
 * `n` = le nombre affiché sur la pastille (clients en retard, appareils prêts…) ; un avis « en bloc » vaut 1.
 */
import { lowStock, money, type Shop } from "../model.ts";
import { overdueDebts } from "./debts.ts";
import { buildInsights } from "./insights.ts";
import { expiringSoon } from "./metiers.ts";
import { orderPlan } from "./reorder.ts";
import { inventoryDue, isServicePayment } from "./report.ts";
import { zReport } from "./tickets.ts";
import { weeklyNudge } from "./clientFiles.ts";
import { metierOf } from "./metiers.ts";
import { workshopWatch } from "./watch.ts";

export type NoticeScreen = "parler" | "atelier" | "couture" | "stock" | "caisse" | "bilan" | "conseiller" | "dettes" | "clients" | "ventes";
/** `drill` : la page à ouvrir directement dans l'écran (ex. « surveillance » dans Bénéfices). */
export type Notice = { id: string; screen: NoticeScreen; tone: "grave" | "attention"; text: string; n: number; drill?: string };

const DAY = 86_400_000;
const plural = (n: number, one: string, many = `${one}s`) => (n > 1 ? many : one);
const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function shopNotices(shop: Shop, opts: { patron: boolean; screens: (id: NoticeScreen) => boolean; advisor?: boolean }, now = new Date()): Notice[] {
  const out: Notice[] = [];
  const add = (screen: NoticeScreen, id: string, tone: Notice["tone"], text: string, n = 1, drill?: string) => {
    if (opts.screens(screen)) out.push({ id: `${screen}:${id}`, screen, tone, text, n, ...(drill ? { drill } : {}) });
  };

  // Dettes en retard
  const late = overdueDebts(shop, now);
  if (late.length) {
    const sum = late.reduce((a, d) => a + d.client.debt, 0);
    add("dettes", "retard", "grave", `${late.length} ${plural(late.length, "client")} en retard de paiement (${money(sum)}) : relancer`, late.length);
  }

  // Stock : sous le seuil, péremptions, inventaire du mois
  const low = lowStock(shop);
  if (low.length) add("stock", "bas", "attention", low.length === 1 ? `${low[0]!.name} : stock bas (${low[0]!.stock} ${low[0]!.unit})` : `${low.length} articles sous le seuil`, low.length);
  const expiring = expiringSoon(shop.products, 7);
  if (expiring.length) {
    const gone = expiring.filter((p) => p.daysLeft < 0).length;
    add("stock", "peremption", gone ? "grave" : "attention", gone ? `${gone} ${plural(gone, "produit périmé", "produits périmés")} à retirer` : `${expiring.length} ${plural(expiring.length, "produit")} ${plural(expiring.length, "périme", "périment")} dans 7 jours`, expiring.length);
  }
  if (opts.patron && inventoryDue(shop, now)) add("stock", "inventaire", "attention", "Nouveau mois : fais l'inventaire du stock");

  // Atelier : appareils prêts, dépôts qui traînent, commande prête
  const repairs = shop.repairs ?? [];
  const ready = repairs.filter((r) => r.status === "repare");
  if (ready.length) add("atelier", "prets", "attention", `${ready.length} ${plural(ready.length, "appareil réparé attend", "appareils réparés attendent")} leur client`, ready.length);
  const old = repairs.filter((r) => r.status === "depot" && now.getTime() - Date.parse(r.at) > 7 * DAY);
  if (old.length) add("atelier", "vieux", "grave", `${old.length} ${plural(old.length, "appareil")} au dépôt depuis plus de 7 jours`, old.length);
  if (opts.patron && opts.screens("atelier") && repairs.length) {
    const plan = orderPlan(shop, now);
    if (plan.ready.length) add("atelier", "commande", "attention", `Commande prête : ${plan.ready.length} ${plural(plan.ready.length, "pièce")} à commander (${money(plan.total)})`, 1, "commande");
  }

  // Couture : habits prêts pas récupérés, commandes en retard
  const today = localDay(now);
  const couture = shop.couture ?? [];
  const pret = couture.filter((o) => o.status === "pret");
  if (pret.length) add("couture", "prets", "attention", `${pret.length} ${plural(pret.length, "habit prêt", "habits prêts")} pas encore ${plural(pret.length, "récupéré", "récupérés")}`, pret.length);
  const lateOrders = couture.filter((o) => o.status !== "pret" && o.status !== "livre" && o.status !== "annule" && o.dueAt && o.dueAt < today);
  if (lateOrders.length) add("couture", "retard", "grave", `${lateOrders.length} ${plural(lateOrders.length, "commande")} en retard`, lateOrders.length);

  // Caisse (patron) : tickets effacés, articles retirés du panier
  if (opts.patron) {
    const z = zReport(shop, now);
    if (z.missing.length) add("caisse", "trous", "grave", `${z.missing.length} ${plural(z.missing.length, "ticket effacé", "tickets effacés")} aujourd'hui (n° ${z.missing.slice(0, 5).join(", ")})`, z.missing.length);
    if (z.voids.count >= 5) add("caisse", "retraits", "attention", `${z.voids.count} articles retirés du panier aujourd'hui (${money(z.voids.amount)})`);
  }

  // Bénéfices (patron) : ventes du mois sans prix d'achat → bénéfice incomplet
  if (opts.patron) {
    const month = today.slice(0, 7);
    const blind = shop.sales.filter((s) => s.at.slice(0, 7) === month && s.cost === undefined && !isServicePayment(s));
    if (blind.length) add("bilan", "sans-prix", "attention", `${blind.length} ${plural(blind.length, "vente")} de ce mois sans prix d'achat : bénéfice incomplet`);
  }

  // Bénéfices (patron, réparateur) : surveillance de l'atelier (pièces à retrouver, factures fausses, réparations sans pièce…)
  if (opts.patron && metierOf(shop.activity).id === "reparation") {
    const look = workshopWatch(shop, now).filter((x) => x.level === "grave" || x.level === "attention");
    // Chaque problème sur sa propre ligne (22/11/2026, demande de Fallou), le plus grave d'abord ; un toucher ouvre la Surveillance.
    const sorted = [...look].sort((a, b) => Number(b.level === "grave") - Number(a.level === "grave"));
    for (const x of sorted.slice(0, 8)) add("bilan", `surveillance-${x.id}`, x.level === "grave" ? "grave" : "attention", x.title, 1, "surveillance");
    if (sorted.length > 8) add("bilan", "surveillance-plus", "attention", `${sorted.length - 8} autre${sorted.length - 8 > 1 ? "s" : ""} chose${sorted.length - 8 > 1 ? "s" : ""} dans la Surveillance de l'atelier`, 1, "surveillance");
  }

  // Conseiller (patron, offre qui l'ouvre) : conseils urgents
  if (opts.patron && opts.advisor && opts.screens("conseiller")) {
    const urgent = buildInsights(shop, now).findings.filter((f) => f.level === "urgent");
    if (urgent.length) add("conseiller", "urgent", "grave", urgent.length === 1 ? urgent[0]!.title : `${urgent.length} conseils urgents`, urgent.length);
  }

  // Clients (patron) : fidèles à relancer cette semaine
  if (opts.patron) {
    const nudge = weeklyNudge(shop, now);
    if (nudge?.relancer.length) add("clients", "relancer", "attention", `${nudge.relancer.length} ${plural(nudge.relancer.length, "client fidèle")} à relancer (plus venus depuis 2 mois)`, nudge.relancer.length);
  }

  return out;
}

/** Nombre à afficher sur la pastille de chaque écran. */
export function noticeCounts(list: Notice[]): Partial<Record<NoticeScreen, number>> {
  const out: Partial<Record<NoticeScreen, number>> = {};
  for (const n of list) out[n.screen] = (out[n.screen] ?? 0) + n.n;
  return out;
}

/** L'écran a-t-il un avis grave (pastille rouge) ? */
export function graveScreens(list: Notice[]): Set<NoticeScreen> {
  return new Set(list.filter((n) => n.tone === "grave").map((n) => n.screen));
}
