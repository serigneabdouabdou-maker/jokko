import { type Lang, type Shop, lowStock, uid } from "../model";
import { applyDraft } from "./apply";
import { extractSpokenAmount, francsToWolof, spokenAmountToFrancs } from "./wolofNumbers";
import { buildShopContext, type DraftAction, type DraftActionType } from "./client";
import type { LiveToolCall } from "./live";

const TYPES: DraftActionType[] = ["sale", "expense", "invoice", "stock_adjust", "debt_add", "debt_payment"];
const HISTORY = 20;
/** Une annulation par la voix ne touche qu'une écriture récente. */
const UNDO_WINDOW_MS = 2 * 60_000;
/** Même écriture répétée par le modèle (coupure, relance) : on ne l'enregistre pas deux fois. */
const DUPLICATE_MS = 10_000;
const UNITS = new Set(["sac", "sacs", "bidon", "bidons", "paquet", "paquets", "kilo", "kilos", "kg", "pot", "pots", "boite", "boites", "piece", "pieces", "litre", "litres", "carton", "cartons", "bouteille"]);

/** Montant pas clair : Jokko n'enregistre rien et fait répéter. */
const NOT_UNDERSTOOD = {
  statut: "pas_compris",
  consigne: "Le montant n'est pas clair. N'enregistre rien et ne devine pas. Demande de répéter : « Baal ma, ñaata la ? » (en français : « Pardon, c'est combien ? »).",
};

/** Une écriture enregistrée, que le commerçant peut encore annuler. */
export type Entry = { id: string; summary: string; heard: string; before: Shop; after: Shop; at: number; callId?: string; key?: string; amount?: number };

export type Recorded = { ok: true; entry: Entry } | { ok: false; besoin: string };

export type DeskDeps = {
  getShop: () => Shop;
  lang: () => Lang;
  write: (next: Shop) => void;
  onSaved: (entry: Entry) => void;
  onUndone: (entry: Entry) => void;
  onHeard?: (heard: string) => void;
};

/**
 * Le comptoir de Jokko : chaque phrase complète est enregistrée tout de suite,
 * et la dernière écriture peut être annulée (« déedéet », « annule », bouton Annuler).
 */
export class LiveDesk {
  history: Entry[] = [];
  private deps: DeskDeps;

  constructor(deps: DeskDeps) {
    this.deps = deps;
  }

  get last(): Entry | null {
    return this.history[0] ?? null;
  }

  /** Enregistre une écriture comprise par Jokko. */
  record(action: DraftAction, heard = "", callId?: string): Recorded {
    const key = JSON.stringify([action, heard.trim().toLowerCase()]);
    const last = this.history[0];
    if (last?.key === key && Date.now() - last.at < DUPLICATE_MS && last.after.id === this.deps.getShop().id) {
      return { ok: true, entry: last };
    }
    const before = this.deps.getShop();
    const applied = applyDraft(before, action);
    if (!applied) return { ok: false, besoin: missing(action) };
    return { ok: true, entry: this.commit(before, applied.shop, applied.summary, heard, { callId, key, amount: applied.amount }) };
  }

  /** Enregistre un changement déjà calculé (mode local sans Gemini, écrans). */
  commit(before: Shop, after: Shop, summary: string, heard = "", extra: { callId?: string; key?: string; amount?: number } = {}): Entry {
    this.deps.write(after);
    const entry: Entry = { id: uid("act"), summary, heard, before, after, at: Date.now(), ...extra };
    this.history = [entry, ...this.history].slice(0, HISTORY);
    this.deps.onSaved(entry);
    return entry;
  }

  /**
   * Annule la dernière écriture. Si la boutique a changé depuis (autre écriture faite à la main),
   * seule la dernière écriture de Jokko est défaite, en gardant le reste.
   */
  undo(): Entry | null {
    return this.undoAt(0);
  }

  /** Oublie l'historique (changement de boutique) : on n'annule jamais dans une autre boutique. */
  reset() {
    this.history = [];
  }

  /**
   * Gemini a annulé des appels d'outil (le commerçant a coupé la parole) :
   * les écritures faites par ces appels sont défaites, sinon elles seraient comptées deux fois.
   */
  cancelCalls(ids: string[]) {
    for (const id of ids) {
      const index = this.history.findIndex((e) => e.callId === id);
      if (index >= 0) this.undoAt(index);
    }
  }

  private undoAt(index: number): Entry | null {
    const entry = this.history[index];
    if (!entry) return null;
    const current = this.deps.getShop();
    if (current.id !== entry.after.id) return null;
    const restored = index === 0 && current === entry.after ? entry.before : revert(current, entry);
    this.history = this.history.filter((_, i) => i !== index);
    this.deps.write(restored);
    this.deps.onUndone(entry);
    return entry;
  }

  handle(call: LiveToolCall): Record<string, unknown> {
    const args = call.args ?? {};
    if (call.name === "lire_boutique") {
      const shop = this.deps.getShop();
      const context = buildShopContext(shop, this.deps.lang());
      // Montants déjà traduits en wolof de comptoir (dërëm), pour que Jokko les dise juste.
      return {
        ...context,
        montants_en_wolof: {
          ventes_du_jour: francsToWolof(context.figures.daySales),
          depenses_du_jour: francsToWolof(context.figures.dayExpenses),
          caisse_attendue: francsToWolof(context.figures.expectedCash),
          dettes: Object.fromEntries(context.clients.filter((c) => c.debt > 0).map((c) => [c.name, francsToWolof(c.debt)])),
          prix: Object.fromEntries(context.products.map((p) => [p.name, francsToWolof(p.price)])),
        },
      };
    }

    if (call.name === "enregistrer") {
      const action = normalizeAction(args, this.deps.getShop());
      if (!action) return { statut: "incomplet", besoin: "le type d'écriture (vente, dépense, stock, dette, paiement ou facture)" };
      // Garde-fou des chiffres : le montant est recalculé ici, jamais laissé au calcul du modèle.
      const heardText = typeof args.heard === "string" ? args.heard : "";
      const saidText = typeof args.montantDit === "string" ? args.montantDit.trim() : "";
      if (action.type !== "stock_adjust") {
        if (saidText) {
          const said = spokenAmountToFrancs(saidText) ?? extractSpokenAmount(saidText);
          if (!said || said.francs <= 0) return NOT_UNDERSTOOD;
          action.amount = said.francs;
        } else {
          const inPhrase = extractSpokenAmount(heardText);
          if (inPhrase && inPhrase.francs > 0) action.amount = inPhrase.francs;
        }
      }
      const heard = typeof args.heard === "string" ? args.heard.trim() : "";
      if (heard) this.deps.onHeard?.(heard);
      const result = this.record(action, heard, call.id);
      if (!result.ok) return { statut: "incomplet", besoin: result.besoin, consigne: "Rien n'est enregistré. Pose une seule question courte pour avoir cette information." };
      const low = lowStock(result.entry.after)
        .filter((p) => p.id === action.productId)
        .map((p) => `${p.name} : ${p.stock} ${p.unit}`);
      const amount = result.entry.amount;
      return {
        statut: "enregistre",
        resume: result.entry.summary,
        montant_francs: amount ?? null,
        montant_en_wolof: amount ? francsToWolof(amount) : null,
        stock_bas: low,
      };
    }

    if (call.name === "convertir_montant") {
      const words = typeof args.mots === "string" ? args.mots.trim() : "";
      const francsArg = typeof args.francs === "number" ? args.francs : typeof args.francs === "string" ? Number(args.francs.replace(/[\s\u202f\u00a0]/g, "")) : NaN;
      const francs = words ? (spokenAmountToFrancs(words) ?? extractSpokenAmount(words))?.francs ?? NaN : francsArg;
      if (!Number.isFinite(francs) || francs <= 0) return NOT_UNDERSTOOD;
      return {
        francs: Math.round(francs),
        en_francs: `${Math.round(francs).toLocaleString("fr-FR")} F`,
        en_wolof: francsToWolof(francs),
        en_derem: francs % 5 === 0 ? francs / 5 : null,
        consigne: "Répète en_wolof mot pour mot. Ne change aucun chiffre.",
      };
    }

    if (call.name === "annuler_derniere") {
      const last = this.last;
      if (!last || Date.now() - last.at > UNDO_WINDOW_MS) {
        return { statut: "rien_a_annuler", consigne: "Aucune écriture récente à annuler. Pour une écriture plus ancienne, le commerçant peut la corriger dans l'écran concerné." };
      }
      const entry = this.undo();
      if (!entry) return { statut: "rien_a_annuler" };
      return { statut: "annule", resume: entry.summary };
    }

    return { statut: "outil_inconnu" };
  }
}

/** Défait une écriture sans perdre les changements faits après elle. */
function revert(current: Shop, entry: Entry): Shop {
  const { before, after } = entry;
  const added = <T extends { id: string }>(b: T[], a: T[]) => new Set(a.filter((x) => !b.some((y) => y.id === x.id)).map((x) => x.id));
  const newSales = added(before.sales, after.sales);
  const newExpenses = added(before.expenses, after.expenses);
  const newInvoices = added(before.invoices, after.invoices);
  const newClients = added(before.clients, after.clients);
  return {
    ...current,
    sales: current.sales.filter((s) => !newSales.has(s.id)),
    expenses: current.expenses.filter((e) => !newExpenses.has(e.id)),
    invoices: current.invoices.filter((i) => !newInvoices.has(i.id)),
    products: current.products.map((p) => {
      const b = before.products.find((x) => x.id === p.id);
      const a = after.products.find((x) => x.id === p.id);
      return b && a ? { ...p, stock: Math.max(0, p.stock + (b.stock - a.stock)) } : p;
    }),
    clients: current.clients
      .filter((c) => !newClients.has(c.id) || c.debt !== (after.clients.find((x) => x.id === c.id)?.debt ?? 0))
      .map((c) => {
        const b = before.clients.find((x) => x.id === c.id);
        const a = after.clients.find((x) => x.id === c.id);
        if (a && !b) return { ...c, debt: Math.max(0, c.debt - a.debt) };
        return b && a ? { ...c, debt: Math.max(0, c.debt + (b.debt - a.debt)) } : c;
      }),
  };
}

/** Noms wolof courants des articles (ce que dit le commerçant → nom dans le stock). */
const SYNONYMS: Record<string, string[]> = {
  riz: ["ceeb", "ceb", "chebb", "thieb", "thiep"],
  huile: ["diw", "diwlin", "diwtiir", "dioul"],
  sucre: ["suukar", "sukar", "soukar"],
  lait: ["meew", "mew", "meuw"],
  pain: ["mburu", "mbourou"],
  savon: ["saabu", "sabou"],
  oignon: ["soble", "soblé"],
  "pomme de terre": ["pombiteer", "pomme"],
  café: ["kafe", "kafé"],
  thé: ["ataaya", "attaya", "warga"],
  piment: ["kaani", "kani"],
  sel: ["xorom", "khorom"],
  eau: ["ndox", "ndokh"],
  poisson: ["jën", "dien"],
  viande: ["yàpp", "yapp"],
};

export function plain(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ñ/g, "n")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sameName(known: string, heard: string): boolean {
  const k = plain(known);
  const h = plain(heard);
  if (!k || !h) return false;
  const kw = k.split(" ").filter((w) => !UNITS.has(w));
  const hw = h.split(" ").filter((w) => w.length >= 3 && !UNITS.has(w));
  const close = (x: string, w: string) => x === w || (x.length >= 4 && w.startsWith(x)) || (w.length >= 4 && x.startsWith(w));
  if (hw.some((w) => kw.some((x) => x.length >= 3 && close(x, w)))) return true;
  for (const [base, words] of Object.entries(SYNONYMS)) {
    if (!` ${k} `.includes(` ${plain(base)} `)) continue;
    if (words.some((w) => hw.includes(plain(w)))) return true;
  }
  return false;
}

export function normalizeAction(args: Record<string, unknown>, shop: Shop): DraftAction | null {
  const type = TYPES.find((t) => t === args.type);
  if (!type) return null;
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
  const number = (value: unknown) => {
    let n = NaN;
    if (typeof value === "number") n = value;
    else if (typeof value === "string") {
      const raw = value.replace(/[\s\u202f\u00a0F]/g, "");
      n = Number(/^\d{1,3}([.,]\d{3})+$/.test(raw) ? raw.replace(/[.,]/g, "") : raw.replace(",", "."));
    }
    return Number.isFinite(n) ? n : null;
  };
  const productName = text(args.productName);
  const clientName = text(args.clientName);
  const product =
    shop.products.find((p) => p.id === args.productId) ??
    (productName ? shop.products.find((p) => plain(p.name) === plain(productName)) ?? shop.products.find((p) => sameName(p.name, productName)) : undefined);
  const client =
    shop.clients.find((c) => c.id === args.clientId) ??
    (clientName ? shop.clients.find((c) => sameName(c.name, clientName)) : undefined);
  return {
    type,
    productId: product?.id ?? null,
    productName: product?.name ?? productName,
    quantity: number(args.quantity),
    amount: number(args.amount),
    clientId: client?.id ?? null,
    clientName: client?.name ?? clientName,
    label: text(args.label),
  };
}

function missing(action: DraftAction): string {
  if (action.type === "sale") return "le montant, ou l'article avec sa quantité";
  if (action.type === "stock_adjust") return "l'article (il doit être dans le stock) et la quantité";
  if (action.type === "expense") return "le montant";
  if (action.type === "debt_payment") return "le client (il doit déjà avoir une dette) et le montant";
  if (action.type === "cash_count") return "le comptage de caisse, qui se fait dans l'écran Caisse";
  return "le nom du client et le montant";
}
