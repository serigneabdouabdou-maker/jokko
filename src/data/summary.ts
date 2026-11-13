import { type Shop, money } from "../model.ts";
import type { Alert } from "./alerts.ts";
import type { JournalRow } from "./journal.ts";
import { buildReport, periodOf } from "./report.ts";

/** Résumés du jour pour le patron (écran À distance, WhatsApp, notification du soir). Sans dépendance au navigateur. */

const amount = (n: number) => money(n).replace(/\u202f/g, "\u00a0");
const sameDay = (iso: string, now: Date) => new Date(iso).toDateString() === now.toDateString();

/** Résumé du jour, prêt à envoyer sur WhatsApp. */
export function daySummary(shop: Shop, alerts: Alert[], counted: JournalRow | undefined, now = new Date()): string {
  const r = buildReport(shop, periodOf("jour", now));
  const today = shop.sales.filter((s) => sameDay(s.at, now));
  const by = (m: string) => today.filter((s) => (s.payment ?? "especes") === m).reduce((a, s) => a + s.amount, 0);
  const grave = alerts.filter((a) => a.level === "grave" && sameDay(a.at, now)).length;
  const lines = [
    `Résumé de ${shop.name} · ${now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}`,
    `Ventes : ${amount(r.revenue)} (${r.salesCount} vente${r.salesCount > 1 ? "s" : ""})`,
    `  Espèces ${amount(by("especes"))} · Wave ${amount(by("wave"))} · Orange Money ${amount(by("om"))} · Crédit ${amount(by("credit"))}`,
    `Dépenses : ${amount(r.expenses)}${r.losses ? ` · Pertes : ${amount(r.losses)}` : ""}${r.purchases ? ` · Achats de stock : ${amount(r.purchases)}` : ""}`,
    `Bénéfice du jour : ${amount(r.netProfit)}`,
    counted ? `Caisse : comptée ${amount(Number(counted.after?.counted ?? 0))} pour ${amount(Number(counted.after?.expected ?? 0))} attendus` : "Caisse : pas encore clôturée",
    grave ? `ATTENTION : ${grave} alerte${grave > 1 ? "s" : ""} grave${grave > 1 ? "s" : ""} à vérifier dans Jokko` : "Aucune alerte grave",
  ];
  return lines.join("\n");
}


/**
 * Notification du soir (200 caractères au plus) : ce que la journée a rapporté.
 * Ventes, bénéfice du jour, réparations rendues et main-d'œuvre gagnée, services, total gagné du mois, alertes graves.
 * Le mois demande les ventes depuis le 1er (la fonction notify les charge).
 */
export function shortSummary(shop: Shop, graveAlerts: number, now = new Date()): { title: string; body: string } {
  const r = buildReport(shop, periodOf("jour", now));
  const month = buildReport(shop, periodOf("mois", now));
  const parts: string[] = [];
  if (r.salesCount) parts.push(`Ventes ${amount(r.revenue)} (${r.salesCount}) · ${r.netProfit < 0 ? "Perte" : "Gagné"} aujourd'hui ${amount(Math.abs(r.netProfit))}.`);
  else parts.push(r.expenses ? `Aucune vente aujourd'hui · dépenses ${amount(r.expenses)}.` : "Aucune vente aujourd'hui.");
  // Réparateurs : appareils rendus aujourd'hui et main-d'œuvre gagnée (prix − pièces).
  const back = (shop.repairs ?? []).filter((x) => x.status === "rendu" && x.returnedAt && sameDay(x.returnedAt, now));
  if (back.length) {
    const labor = back.reduce((a, x) => a + x.price - x.parts.reduce((b, p) => b + p.cost * (p.qty || 1), 0), 0);
    parts.push(`${back.length} réparation${back.length > 1 ? "s" : ""} rendue${back.length > 1 ? "s" : ""}, main-d'œuvre ${amount(labor)}.`);
  }
  const services = shop.sales.filter((x) => sameDay(x.at, now) && x.label.startsWith("Service · ")).length;
  if (services) parts.push(`${services} service${services > 1 ? "s" : ""}.`);
  parts.push(`Ce mois : ${amount(month.netProfit)}.`);
  if (graveAlerts) parts.push(`${graveAlerts} alerte${graveAlerts > 1 ? "s" : ""} grave${graveAlerts > 1 ? "s" : ""} à voir.`);
  return { title: `Ta journée · ${shop.name}`, body: parts.join(" ") };
}
