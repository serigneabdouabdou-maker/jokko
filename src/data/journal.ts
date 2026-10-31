import { money } from "../model";

/** Une ligne du journal, telle que la base l'écrit (personne ne peut la modifier ni l'effacer). */
export type JournalRow = {
  id: number;
  shop_id: string;
  at: string;
  user_id: string | null;
  tbl: string;
  row_id: string;
  action: "ajout" | "modification" | "suppression";
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

export type JournalKind = "vente" | "stock" | "argent" | "client" | "facture" | "equipe" | "boutique";
export type JournalLine = { text: string; kind: JournalKind; alert: boolean };

const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const qty = (v: unknown) => {
  const x = n(v);
  return Number.isInteger(x) ? String(x) : String(Math.round(x * 1000) / 1000).replace(".", ",");
};

/** Les changements d'une modification, champ par champ, en mots simples. */
function changes(before: Record<string, unknown>, after: Record<string, unknown>, labels: Record<string, [string, "money" | "qty" | "text"]>): string[] {
  const out: string[] = [];
  for (const [key, [label, type]] of Object.entries(labels)) {
    if (JSON.stringify(before[key] ?? null) === JSON.stringify(after[key] ?? null)) continue;
    const fmt = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : type === "money" ? money(n(v)) : type === "qty" ? qty(v) : s(v));
    out.push(`${label} ${fmt(before[key])} → ${fmt(after[key])}`);
  }
  return out;
}

const PRODUCT_FIELDS: Record<string, [string, "money" | "qty" | "text"]> = {
  stock: ["stock", "qty"],
  price: ["prix de vente", "money"],
  cost: ["prix d'achat", "money"],
  retail_price: ["prix détail", "money"],
  name: ["nom", "text"],
  unit: ["unité", "text"],
  min: ["seuil", "qty"],
};

/** Phrase lisible pour une ligne du journal. alert = à regarder de près (annulation, suppression, prix changé). */
export function describe(row: JournalRow): JournalLine {
  const b = row.before ?? {};
  const a = row.after ?? {};
  const cur = row.action === "suppression" ? b : a;
  switch (row.tbl) {
    case "sales": {
      const what = `${s(cur.label)}${cur.qty ? ` · ${qty(cur.qty)}${cur.unit ? ` ${s(cur.unit)}` : ""}` : ""} · ${money(n(cur.amount))}`;
      if (row.action === "ajout") return { text: `Vente · ${what}`, kind: "vente", alert: false };
      if (row.action === "suppression") return { text: `Vente annulée · ${what}`, kind: "vente", alert: true };
      return { text: `Vente modifiée · ${changes(b, a, { amount: ["montant", "money"], qty: ["quantité", "qty"] }).join(" · ") || what}`, kind: "vente", alert: true };
    }
    case "expenses": {
      const name = cur.kind === "achat" ? "Achat" : cur.kind === "perte" ? "Perte" : "Dépense";
      const what = `${s(cur.label)} · ${money(n(cur.amount))}`;
      if (row.action === "ajout") return { text: `${name} · ${what}`, kind: "argent", alert: cur.kind === "perte" };
      if (row.action === "suppression") return { text: `${name} annulé(e) · ${what}`, kind: "argent", alert: true };
      return { text: `${name} modifié(e) · ${changes(b, a, { amount: ["montant", "money"], label: ["libellé", "text"] }).join(" · ")}`, kind: "argent", alert: true };
    }
    case "products": {
      const name = s(cur.name);
      if (row.action === "ajout") return { text: `Nouvel article · ${name} · ${qty(a.stock)} ${s(a.unit)} · ${money(n(a.price))}`, kind: "stock", alert: false };
      if (row.action === "suppression") return { text: `Article supprimé · ${name}`, kind: "stock", alert: true };
      const diff = changes(b, a, PRODUCT_FIELDS);
      const priceChanged = ["price", "cost", "retail_price"].some((k) => JSON.stringify(b[k] ?? null) !== JSON.stringify(a[k] ?? null));
      return { text: `${name} · ${diff.join(" · ")}`, kind: "stock", alert: priceChanged };
    }
    case "clients": {
      const name = s(cur.name);
      if (row.action === "ajout") return { text: `Nouveau client · ${name}${n(a.debt) ? ` · dette ${money(n(a.debt))}` : ""}`, kind: "client", alert: false };
      if (row.action === "suppression") return { text: `Client supprimé · ${name}${n(b.debt) ? ` (devait ${money(n(b.debt))})` : ""}`, kind: "client", alert: true };
      const diff = changes(b, a, { debt: ["dette", "money"], phone: ["numéro", "text"], name: ["nom", "text"] });
      return { text: `${name} · ${diff.join(" · ")}`, kind: "client", alert: false };
    }
    case "invoices": {
      const what = `${s(cur.number)} · ${money(n(cur.amount))}`;
      if (row.action === "ajout") return { text: `Facture ${what}`, kind: "facture", alert: false };
      if (row.action === "suppression") return { text: `Facture supprimée ${what}`, kind: "facture", alert: true };
      const status: Record<string, string> = { brouillon: "brouillon", envoyee: "envoyée", payee: "payée" };
      const diff = changes(b, a, { amount: ["montant", "money"] });
      if (b.status !== a.status) diff.unshift(`${status[s(a.status)] ?? s(a.status)}`);
      return { text: `Facture ${s(cur.number)} · ${diff.join(" · ") || "mise à jour"}`, kind: "facture", alert: false };
    }
    case "shop_invites": {
      const who = `${s(cur.name) || "Vendeur"} (${s(cur.phone).replace(/^221/, "")})`;
      if (row.action === "ajout") return { text: `Invitation envoyée · ${who}`, kind: "equipe", alert: false };
      if (row.action === "suppression") return { text: `Invitation retirée · ${who}`, kind: "equipe", alert: false };
      return { text: `Invitation acceptée · ${who}`, kind: "equipe", alert: false };
    }
    case "shop_members": {
      const role = s(cur.role) === "patron" ? "patron" : "vendeur";
      if (row.action === "ajout") return { text: `A rejoint la boutique · ${role}`, kind: "equipe", alert: false };
      if (row.action === "suppression") return { text: `Retiré(e) de la boutique · ${role}`, kind: "equipe", alert: true };
      return { text: `Rôle changé · ${role}`, kind: "equipe", alert: true };
    }
    case "shops": {
      if (row.action === "ajout") return { text: `Boutique créée · ${s(a.name)}`, kind: "boutique", alert: false };
      const diff = changes(b, a, { name: ["nom", "text"], opening_cash: ["fond de caisse", "money"], last_inventory_at: ["inventaire", "text"], phone: ["téléphone", "text"], address: ["adresse", "text"] });
      return { text: `Boutique · ${diff.join(" · ") || "fiche mise à jour"}`, kind: "boutique", alert: false };
    }
    default:
      return { text: `${row.tbl} · ${row.action}`, kind: "boutique", alert: false };
  }
}
