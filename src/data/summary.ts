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


/** Version courte pour une notification du soir (une ou deux lignes). */
export function shortSummary(shop: Shop, graveAlerts: number, now = new Date()): { title: string; body: string } {
  const r = buildReport(shop, periodOf("jour", now));
  return {
    title: `Résumé du jour · ${shop.name}`,
    body: `Ventes ${amount(r.revenue)} (${r.salesCount}) · Bénéfice ${amount(r.netProfit)} · ${graveAlerts ? `${graveAlerts} alerte${graveAlerts > 1 ? "s" : ""} grave${graveAlerts > 1 ? "s" : ""}` : "aucune alerte grave"}`,
  };
}
