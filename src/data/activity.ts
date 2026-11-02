import { money } from "../model.ts";
import type { JournalRow } from "./journal.ts";

/**
 * Notifications d'activité pour le patron : « votre boutique a vendu… », même appli fermée.
 * Sans dépendance au navigateur : utilisé par la fonction serveur « notify ».
 * Un panier de plusieurs articles donne UNE seule notification (les ventes du même vendeur à quelques secondes d'écart).
 */

export type ActivityPref = "aucune" | "employes" | "toutes";
export type Notice = { title: string; body: string; tag: string };

/** Ventes du même vendeur espacées de moins de ce délai = un même panier. */
export const BASKET_GAP_MS = 20_000;

const PAYMENT: Record<string, string> = { especes: "espèces", wave: "Wave", om: "Orange Money", credit: "à crédit" };
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const amount = (n: number) => money(n).replace(/[  ]/g, " ");
const ms = (iso: string) => Date.parse(iso);

const isSale = (r: JournalRow) => r.tbl === "sales" && r.action === "ajout";

/** Qui reçoit : les patrons, selon leur choix ; jamais l'auteur s'il a choisi « employés ». */
export function activityTargets(patrons: Array<{ user_id: string; pref: ActivityPref | null }>, actor: string | null): string[] {
  return patrons
    .filter((p) => {
      const pref = p.pref ?? "employes";
      if (pref === "aucune") return false;
      if (pref === "employes") return p.user_id !== actor;
      return true;
    })
    .map((p) => p.user_id);
}

/**
 * Les ventes du panier qui finit par `row` (même boutique, même vendeur, écarts < BASKET_GAP_MS),
 * ou null si une vente du même panier est arrivée APRÈS : c'est elle qui enverra la notification.
 */
export function basketOf(row: JournalRow, around: JournalRow[]): JournalRow[] | null {
  const mine = around
    .filter((r) => isSale(r) && r.shop_id === row.shop_id && r.user_id === row.user_id)
    .sort((a, b) => ms(a.at) - ms(b.at) || a.id - b.id);
  const i = mine.findIndex((r) => r.id === row.id);
  if (i < 0) return [row];
  const next = mine[i + 1];
  if (next && ms(next.at) - ms(row.at) < BASKET_GAP_MS) return null;
  let start = i;
  while (start > 0 && ms(mine[start].at) - ms(mine[start - 1].at) < BASKET_GAP_MS) start--;
  return mine.slice(start, i + 1);
}

function saleLabel(r: JournalRow): string {
  const a = r.after ?? {};
  return str(a.label) || "Vente";
}

/** Texte de la notification pour cette ligne du journal (null = rien à notifier). */
export function activityNotice(row: JournalRow, shopName: string, around: JournalRow[] = [], who = ""): Notice | null {
  const by = who ? ` · ${who}` : "";
  const a = row.after ?? {};
  const b = row.before ?? {};

  if (isSale(row)) {
    const basket = basketOf(row, around);
    if (!basket) return null;
    const total = basket.reduce((t, r) => t + num(r.after?.amount), 0);
    const pays = [...new Set(basket.map((r) => str(r.after?.payment) || "especes"))].map((p) => PAYMENT[p] ?? p).join(" + ");
    if (basket.length === 1) {
      return { title: `Vente · ${shopName}`, body: `${saleLabel(row)} · ${amount(total)} · ${pays}${by}`, tag: `vente-${row.id}` };
    }
    const names = basket.map(saleLabel);
    const list = names.length > 4 ? `${names.slice(0, 4).join(", ")}…` : names.join(", ");
    return { title: `Vente de ${basket.length} articles · ${shopName}`, body: `Total ${amount(total)} · ${pays}${by}\n${list}`, tag: `vente-${row.id}` };
  }

  if (row.tbl === "expenses" && row.action === "ajout") {
    const kind = str(a.kind);
    const what = kind === "perte" ? "Perte" : kind === "achat" ? "Achat de stock" : "Dépense";
    return { title: `${what} · ${shopName}`, body: `${str(a.label) || what} · ${amount(num(a.amount))}${by}`, tag: `depense-${row.id}` };
  }

  if (row.tbl === "invoices" && row.action === "ajout") {
    const number = str(a.number);
    return { title: `Facture · ${shopName}`, body: `Facture${number ? ` n° ${number}` : ""} · ${amount(num(a.amount))}${by}`, tag: `facture-${row.id}` };
  }

  if (row.tbl === "clients" && row.action === "modification") {
    const paid = num(b.debt) - num(a.debt);
    if (paid <= 0) return null;
    const name = str(a.name) || "Un client";
    const rest = num(a.debt);
    return { title: `Dette payée · ${shopName}`, body: `${name} a payé ${amount(paid)} · ${rest > 0 ? `reste ${amount(rest)}` : "plus rien à payer"}${by}`, tag: `dette-${row.id}` };
  }

  return null;
}
