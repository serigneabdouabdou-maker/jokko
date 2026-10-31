import { money, type Product } from "../model.ts";
import type { JournalRow } from "./journal.ts";

/**
 * Alertes de sécurité pour le patron, calculées à partir du journal (que personne ne peut effacer).
 * grave = à vérifier tout de suite ; attention = à regarder.
 */

export type AlertLevel = "grave" | "attention";
export type Alert = { id: string; at: string; level: AlertLevel; userId: string | null; text: string };

const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const qty = (x: number) => (Number.isInteger(x) ? String(x) : String(Math.round(x * 1000) / 1000).replace(".", ","));
const time = (iso: string) => Date.parse(iso);

/** Fenêtre pour relier une baisse de stock à une vente, une perte ou un inventaire du même moment. */
const LINK_MS = 3 * 60_000;

export function detectAlerts(rows: JournalRow[], products: Product[], patronIds: Set<string>): Alert[] {
  const alerts: Alert[] = [];
  const add = (row: JournalRow, level: AlertLevel, text: string) => alerts.push({ id: `${row.id}`, at: row.at, level, userId: row.user_id, text });
  const byStaff = (row: JournalRow) => !row.user_id || !patronIds.has(row.user_id);

  // Ventes, pertes et inventaires qui expliquent une baisse de stock
  const explained = rows.filter(
    (r) => (r.tbl === "sales" && r.action === "ajout") || (r.tbl === "expenses" && r.action === "ajout" && r.after?.kind === "perte") || (r.tbl === "expenses" && r.action === "suppression" && r.before?.kind === "achat") || (r.tbl === "shops" && r.action === "modification" && s(r.before?.last_inventory_at) !== s(r.after?.last_inventory_at)),
  );

  for (const row of rows) {
    const b = row.before ?? {};
    const a = row.after ?? {};

    // 1. Vente annulée par le personnel
    if (row.tbl === "sales" && row.action === "suppression" && byStaff(row)) {
      add(row, "grave", `Vente annulée : ${s(b.label)} · ${money(n(b.amount))}`);
      continue;
    }

    // 2. Vente sous le prix du stock (remise non prévue, ou argent gardé)
    if (row.tbl === "sales" && row.action === "ajout" && a.product_id && n(a.qty) > 0) {
      const p = products.find((x) => x.id === a.product_id);
      if (p) {
        const unit = a.retail === true && p.retail ? p.retail.price : p.price;
        const expected = Math.round(n(a.qty) * unit);
        if (expected > 0 && n(a.amount) < expected * 0.98) {
          add(row, byStaff(row) ? "grave" : "attention", `Vendu sous le prix : ${qty(n(a.qty))} ${s(a.unit) || p.unit} ${p.name} à ${money(n(a.amount))} au lieu de ${money(expected)}`);
        }
      }
      continue;
    }

    // 3. Stock qui baisse sans vente, sans perte déclarée et sans inventaire
    if (row.tbl === "products" && row.action === "modification" && n(a.stock) < n(b.stock) - 1e-9) {
      const t = time(row.at);
      const linked = explained.some(
        (r) => Math.abs(time(r.at) - t) <= LINK_MS && (r.tbl === "shops" || (r.tbl === "sales" ? r.after?.product_id === a.id : true)) && r.user_id === row.user_id,
      );
      if (!linked) add(row, byStaff(row) ? "grave" : "attention", `Stock de ${s(a.name)} baissé de ${qty(n(b.stock))} à ${qty(n(a.stock))} sans vente`);
      continue;
    }

    // 4. Article supprimé, client ou facture supprimés
    if (row.action === "suppression" && (row.tbl === "products" || row.tbl === "clients" || row.tbl === "invoices")) {
      const what = row.tbl === "products" ? `Article supprimé : ${s(b.name)}` : row.tbl === "clients" ? `Client supprimé : ${s(b.name)}${n(b.debt) ? ` (devait ${money(n(b.debt))})` : ""}` : `Facture supprimée : ${s(b.number)}`;
      add(row, byStaff(row) ? "grave" : "attention", what);
      continue;
    }

    // 5. Dette effacée ou baissée sans paiement visible (le paiement passe par « debt_payment » : la dette baisse aussi)
    if (row.tbl === "clients" && row.action === "modification" && n(a.debt) < n(b.debt) && byStaff(row)) {
      add(row, "attention", `Dette de ${s(a.name)} baissée de ${money(n(b.debt))} à ${money(n(a.debt))} (paiement à vérifier)`);
      continue;
    }

    // 6. Dépense notée par le personnel
    if (row.tbl === "expenses" && row.action === "ajout" && byStaff(row) && a.kind !== "achat") {
      add(row, "attention", `${a.kind === "perte" ? "Perte déclarée" : "Dépense"} : ${s(a.label)} · ${money(n(a.amount))}`);
      continue;
    }

    // 7. Écart à la clôture de caisse
    if (row.tbl === "cash_counts" && row.action === "ajout") {
      const gap = n(a.counted) - n(a.expected);
      if (gap !== 0) add(row, Math.abs(gap) >= 1000 ? "grave" : "attention", `Écart de caisse : ${gap > 0 ? "+" : "−"}${money(Math.abs(gap))} (attendu ${money(n(a.expected))}, compté ${money(n(a.counted))})`);
      continue;
    }

    // 8. Changement d'équipe
    if (row.tbl === "shop_members" && row.action === "ajout" && s(a.role) === "vendeur") add(row, "attention", "Un vendeur a rejoint la boutique");
  }
  return alerts.sort((x, y) => time(y.at) - time(x.at));
}

/** La boutique a-t-elle commencé la journée (une vente aujourd'hui) ? Renvoie l'heure de la 1re vente, ou null. */
export function openedAt(rows: JournalRow[], now = new Date()): string | null {
  const today = now.toDateString();
  const first = rows
    .filter((r) => r.tbl === "sales" && r.action === "ajout" && new Date(r.at).toDateString() === today)
    .sort((a, b) => time(a.at) - time(b.at))[0];
  return first ? first.at : null;
}
