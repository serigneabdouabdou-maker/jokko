import { type Lang, type Role, type Shop, lowStock, uid } from "../model";
import { overdueDebts } from "../data/debts";
import { buildReport, periodOf } from "../data/report";
import { applyDraft, roundQty, unitKind } from "./apply";
import { extractSpokenAmount, francsToWolof, settleAmounts, spokenAmountToFrancs, wolofNumber } from "./wolofNumbers";
import { buildShopContext, type DraftAction, type DraftActionType } from "./client";
import type { LiveToolCall } from "./live";
import { Basket } from "./basket";
import { distinguishes, expandHeard, nameClash, type Named, pickByName, plain, sameName } from "./wolofNames";

export { expandHeard, pickByName, plain, sameName };

const TYPES: DraftActionType[] = ["sale", "expense", "invoice", "stock_adjust", "debt_add", "debt_payment", "purchase"];
const HISTORY = 20;
/** Une annulation par la voix ne touche qu'une écriture récente. */
const UNDO_WINDOW_MS = 2 * 60_000;
/** Même écriture répétée par le modèle (coupure, relance) : on ne l'enregistre pas deux fois. */
const DUPLICATE_MS = 10_000;

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
  /** reason « coupure » : Gemini a retiré son propre appel (parole coupée), ce n'est pas une erreur du commerçant. */
  onUndone: (entry: Entry, reason?: "commercant" | "coupure") => void;
  onHeard?: (heard: string) => void;
  /** Rôle dans la boutique ouverte (patron par défaut). */
  role?: () => Role;
};

/** Écritures réservées au patron : elles changent le stock sans vente ou le prix d'achat. */
const PATRON_ONLY: DraftActionType[] = ["purchase", "stock_adjust"];
export const PATRON_ONLY_MESSAGE = "réservé au patron : les achats et les corrections de stock se font avec le compte du patron";

/**
 * Le comptoir de Jokko : chaque phrase complète est enregistrée tout de suite,
 * et la dernière écriture peut être annulée (« déedéet », « annule », bouton Annuler).
 */
export class LiveDesk {
  history: Entry[] = [];
  /** Panier de plusieurs articles, récapitulé avant d'être enregistré. */
  basket = new Basket();
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
    if (this.deps.role?.() === "vendeur" && PATRON_ONLY.includes(action.type)) return { ok: false, besoin: PATRON_ONLY_MESSAGE };
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

  /** Annule une écriture précise (bouton Annuler d'une carte du chat). */
  undoEntry(id: string): Entry | null {
    const index = this.history.findIndex((e) => e.id === id);
    return index >= 0 ? this.undoAt(index) : null;
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
      if (index >= 0) this.undoAt(index, "coupure");
    }
  }

  private undoAt(index: number, reason: "commercant" | "coupure" = "commercant"): Entry | null {
    const entry = this.history[index];
    if (!entry) return null;
    const current = this.deps.getShop();
    if (current.id !== entry.after.id) return null;
    const restored = index === 0 && current === entry.after ? entry.before : revert(current, entry);
    this.history = this.history.filter((_, i) => i !== index);
    this.deps.write(restored);
    this.deps.onUndone(entry, reason);
    return entry;
  }

  handle(call: LiveToolCall): Record<string, unknown> {
    const args = call.args ?? {};
    if (call.name === "lire_boutique") {
      const shop = this.deps.getShop();
      const context = buildShopContext(shop, this.deps.lang());
      // Montants déjà traduits en wolof de comptoir (dërëm), pour que Jokko les dise juste.
      const day = buildReport(shop, periodOf("jour"));
      const month = buildReport(shop, periodOf("mois"));
      const summary = (r: typeof day) => ({
        ventes: r.revenue,
        benefice: r.grossProfit,
        depenses: r.expenses,
        pertes: r.losses,
        benefice_net: r.netProfit,
        ventes_sans_prix_achat: r.unknownRevenue,
        note: r.unknownRevenue > 0 ? "Une partie des ventes n'a pas de prix d'achat : le bénéfice réel est plus élevé que benefice_net." : undefined,
        vendu: r.byProduct.slice(0, 10).map((l) => ({ article: l.name, gros: l.bulkQty ? `${l.bulkQty} ${l.bulkUnit}` : null, detail: l.retailQty ? `${l.retailQty} ${l.retailUnit}` : null, benefice: l.profit })),
        en_wolof: {
          ventes: francsToWolof(r.revenue),
          benefice: r.grossProfit > 0 ? francsToWolof(r.grossProfit) : "dara",
          benefice_net: r.netProfit > 0 ? francsToWolof(r.netProfit) : r.netProfit < 0 ? `perte de ${francsToWolof(-r.netProfit)}` : "dara",
        },
      });
      const vendeur = this.deps.role?.() === "vendeur";
      return {
        ...context,
        ...(vendeur ? { note_role: "Tu parles à un vendeur : ne donne jamais le bénéfice ni les prix d'achat." } : {}),
        detail: shop.products.filter((p) => p.retail).map((p) => ({ article: p.name, unite_detail: p.retail!.unit, par_unite_gros: p.retail!.perUnit, prix_detail: p.retail!.price })),
        bilan_aujourdhui: vendeur ? { ventes: day.revenue, en_wolof: { ventes: francsToWolof(day.revenue) } } : summary(day),
        bilan_du_mois: vendeur ? undefined : summary(month),
        dettes_en_retard: overdueDebts(shop).map((d) => ({ client: d.client.name, montant: d.client.debt, en_wolof: francsToWolof(d.client.debt), jours_de_retard: -(d.daysLeft ?? 0) })),
        // Le TOTAL est calculé ici, au franc près : Jokko ne fait jamais l'addition lui-même.
        dettes: debtTotals(shop.clients, overdueDebts(shop).map((d) => d.client)),
        montants_en_wolof: {
          ventes_du_jour: francsToWolof(context.figures.daySales),
          depenses_du_jour: francsToWolof(context.figures.dayExpenses),
          caisse_attendue: francsToWolof(context.figures.expectedCash),
          dettes: Object.fromEntries(context.clients.filter((c) => c.debt > 0).map((c) => [c.name, francsToWolof(c.debt)])),
          prix: Object.fromEntries(context.products.map((p) => [p.name, francsToWolof(p.price)])),
          stock: Object.fromEntries(context.products.map((p) => [p.name, p.stock > 0 ? `${wolofNumber(p.stock)} ${p.unit}` : "amul (stock fini)"])),
        },
      };
    }

    if (call.name === "enregistrer") {
      const resolved = resolveAction(args, this.deps.getShop());
      if (!resolved) return { statut: "incomplet", besoin: "le type d'écriture (vente, dépense, stock, dette, paiement ou facture)" };
      if (resolved.ambigu) {
        return { statut: "incomplet", besoin: resolved.ambigu, consigne: "Deux noms se ressemblent. N'enregistre rien : demande lequel, en disant les deux noms." };
      }
      const action = resolved.action;
      // Garde-fou des chiffres : le montant est recalculé ici, jamais laissé au calcul du modèle.
      const heardText = typeof args.heard === "string" ? args.heard : "";
      if (action.type !== "stock_adjust" && !fixAmounts(action, args, heardText)) return NOT_UNDERSTOOD;
      const heard = typeof args.heard === "string" ? args.heard.trim() : "";
      if (heard) this.deps.onHeard?.(heard);
      const product = action.productId ? this.deps.getShop().products.find((p) => p.id === action.productId) : undefined;
      if (product && (action.type === "sale" || action.type === "stock_adjust" || action.type === "purchase") && unitKind(action.unit, product) === "inconnue") {
        const units = [product.unit, product.retail?.unit].filter(Boolean).join(" ou ");
        return { statut: "incomplet", besoin: `l'unité : ${product.name} se compte en ${units}`, consigne: "N'enregistre rien. Demande l'unité en disant les unités possibles." };
      }
      const result = this.record(action, heard, call.id);
      if (!result.ok && result.besoin === PATRON_ONLY_MESSAGE) {
        return { statut: "refuse", raison: PATRON_ONLY_MESSAGE, consigne: "N'enregistre rien. Dis en une phrase que seul le patron peut faire ça." };
      }
      if (!result.ok) return { statut: "incomplet", besoin: result.besoin, consigne: "Rien n'est enregistré. Pose une seule question courte pour avoir cette information." };
      const low = lowStock(result.entry.after)
        .filter((p) => p.id === action.productId)
        .map((p) => `${p.name} : ${p.stock} ${p.unit}`);
      const amount = result.entry.amount;
      const known = new Set(result.entry.before.clients.map((c) => c.id));
      const created = result.entry.after.clients.find((c) => !known.has(c.id));
      return {
        statut: "enregistre",
        resume: result.entry.summary,
        montant_francs: amount ?? null,
        montant_en_wolof: amount ? francsToWolof(amount) : null,
        stock_bas: low,
        ...(created
          ? {
              nouveau_client: created.name,
              consigne_client: `Nouveau client créé : ${created.name}. Dis d'abord « Yokk naa ${created.name} ci sa kiliyaan yi. » (en français : « J'ai ajouté ${created.name} à tes clients. »), puis le montant, puis demande son numéro pour les rappels WhatsApp : « Numéro telefoonam ? » (en français : « Son numéro de téléphone ? »). S'il donne le numéro, appelle numero_client. S'il ne le connaît pas, n'insiste pas.`,
            }
          : {}),
      };
    }

    if (call.name === "panier") {
      const before = this.deps.getShop();
      const heard = typeof args.heard === "string" ? args.heard.trim() : "";
      return this.basket.handle(before, args, (applied) => {
        this.commit(before, applied.shop, applied.summary, heard, { callId: call.id, amount: applied.amount ?? undefined });
      }, this.deps.role?.() !== "vendeur");
    }

    if (call.name === "calculer") {
      return calculate(args);
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

    if (call.name === "numero_client") {
      const shop = this.deps.getShop();
      const name = typeof args.clientName === "string" ? args.clientName.trim() : "";
      const heard = typeof args.heard === "string" ? args.heard.trim() : "";
      const phone = senegalPhone(typeof args.numero === "string" ? args.numero : String(args.numero ?? ""));
      if (!phone) {
        return { statut: "incomplet", besoin: "un numéro sénégalais de 9 chiffres (77, 78, 76, 75, 70 ou 33…)", consigne: "N'enregistre rien. Redemande le numéro, chiffre par chiffre si besoin." };
      }
      const found = pickByName(shop.clients, name);
      const client = found.item && !nameClash(found.item.name, name) ? found.item : undefined;
      if (found.ambiguous.length) return { statut: "incomplet", besoin: `quel client : ${found.ambiguous.map((c) => c.name).join(" ou ")} ?` };
      if (!client) return { statut: "incomplet", besoin: "le client : il doit déjà être dans le cahier (enregistre d'abord sa dette ou sa facture)" };
      const after = { ...shop, clients: shop.clients.map((c) => (c.id === client.id ? { ...c, phone: phone.digits } : c)) };
      this.commit(shop, after, `Numéro de ${client.name} : ${phone.shown}`, heard, { callId: call.id });
      return {
        statut: "enregistre",
        client: client.name,
        numero_affiche: phone.shown,
        consigne: `Dis « Bind naa ko. » puis le numéro en chiffres, exactement « ${phone.shown} », pour que le commerçant vérifie. Les rappels WhatsApp de ${client.name} marchent maintenant.`,
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

/**
 * Numéro de téléphone sénégalais dicté (« 77 567 47 25 », « +221 77… », « 00221… ») → 9 chiffres.
 * Mobiles : 70, 75, 76, 77, 78 ; fixes : 33. Sinon null (Jokko redemande).
 */
export function senegalPhone(said: string): { digits: string; shown: string } | null {
  let d = said.replace(/\D/g, "");
  if (d.startsWith("00221")) d = d.slice(5);
  else if (d.startsWith("221") && d.length === 12) d = d.slice(3);
  if (!/^(7[05678]|33)\d{7}$/.test(d)) return null;
  return { digits: d, shown: `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7)}` };
}

/** Défait une écriture sans perdre les changements faits après elle. */
function revert(current: Shop, entry: Entry): Shop {
  const { before, after } = entry;
  const added = <T extends { id: string }>(b: T[], a: T[]) => new Set(a.filter((x) => !b.some((y) => y.id === x.id)).map((x) => x.id));
  const newSales = added(before.sales, after.sales);
  const newExpenses = added(before.expenses, after.expenses);
  const newInvoices = added(before.invoices, after.invoices);
  const newClients = added(before.clients, after.clients);
  const newProducts = added(before.products, after.products);
  return {
    ...current,
    sales: current.sales.filter((s) => !newSales.has(s.id)),
    expenses: current.expenses.filter((e) => !newExpenses.has(e.id)),
    invoices: current.invoices.filter((i) => !newInvoices.has(i.id)),
    products: current.products
      // Article créé par un achat : retiré, sauf s'il a servi depuis.
      .filter((p) => !newProducts.has(p.id) || p.stock !== after.products.find((x) => x.id === p.id)?.stock)
      .map((p) => {
        const b = before.products.find((x) => x.id === p.id);
        const a = after.products.find((x) => x.id === p.id);
        if (!b || !a) return p;
        // Le prix d'achat revient aussi à l'ancien (achat annulé).
        const cost = a.cost !== b.cost && p.cost === a.cost ? b.cost : p.cost;
        return { ...p, stock: Math.max(0, roundQty(p.stock + (b.stock - a.stock))), cost };
      }),
    clients: current.clients
      .filter((c) => !newClients.has(c.id) || c.debt !== (after.clients.find((x) => x.id === c.id)?.debt ?? 0))
      .map((c) => {
        const b = before.clients.find((x) => x.id === c.id);
        const a = after.clients.find((x) => x.id === c.id);
        if (a && !b) return { ...c, debt: Math.max(0, c.debt - a.debt) };
        if (!b || !a) return c;
        // L'échéance revient aussi à ce qu'elle était (paiement annulé, délai annulé).
        const dueAt = a.dueAt !== b.dueAt && c.dueAt === a.dueAt ? b.dueAt : c.dueAt;
        return { ...c, debt: Math.max(0, c.debt + (b.debt - a.debt)), dueAt };
      }),
  };
}

/**
 * Le nom entendu l'emporte sur un id qui ne lui correspond pas (le modèle se trompe parfois d'id).
 * Deux articles qui se ressemblent (huile moteur / huile de cuisine) : on ne laisse PAS le modèle deviner ;
 * sans mot qui les distingue, Jokko demande lequel.
 */
function resolveOne<T extends Named>(items: T[], id: unknown, heard: string | null): { item?: T; ambiguous: T[] } {
  const byId = items.find((x) => x.id === id);
  if (!heard) return { item: byId, ambiguous: [] };
  const byName = pickByName(items, heard);
  if (byName.item) return byName;
  if (byName.ambiguous.length) {
    return byId && byName.ambiguous.includes(byId) && distinguishes(byId, byName.ambiguous, heard) ? { item: byId, ambiguous: [] } : byName;
  }
  return { item: byId, ambiguous: [] };
}

export type Resolved = { action: DraftAction; ambigu: string | null };

export function resolveAction(args: Record<string, unknown>, shop: Shop): Resolved | null {
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
  const product = resolveOne(shop.products, args.productId, productName);
  const found = resolveOne(shop.clients, args.clientId, clientName);
  // « Fatou Ndiaye » n'est pas « Fatou Sow » : un autre nom de famille = un nouveau client.
  const client = found.item && clientName && nameClash(found.item.name, clientName) ? { item: undefined, ambiguous: [] } : found;
  const ambigu = client.ambiguous.length
    ? `quel client : ${client.ambiguous.map((c) => c.name).join(" ou ")} ?`
    : product.ambiguous.length
      ? `quel article : ${product.ambiguous.map((p) => p.name).join(" ou ")} ?`
      : null;
  return {
    action: {
      type,
      productId: product.item?.id ?? null,
      productName: product.item?.name ?? productName,
      quantity: number(args.quantity),
      amount: number(args.amount),
      clientId: client.item?.id ?? null,
      clientName: client.item?.name ?? clientName,
      label: text(args.label),
      unit: text(args.unite),
      dueDays: number(args.delaiJours),
      unitPrice: number(args.prixUnitaire),
    },
    ambigu,
  };
}

export function normalizeAction(args: Record<string, unknown>, shop: Shop): DraftAction | null {
  return resolveAction(args, shop)?.action ?? null;
}

/** Garde-fou des chiffres (voir settleAmounts) : renvoie false si un montant dit n'a pas pu être lu. */
export function fixAmounts(action: DraftAction, args: Record<string, unknown>, heard: string): boolean {
  const said = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return settleAmounts(action, { total: said(args.montantDit), each: said(args.prixUnitaireDit) }, heard);
}

function missing(action: DraftAction): string {
  if (action.type === "sale") return "le montant, ou l'article avec sa quantité";
  if (action.type === "stock_adjust") return "l'article (il doit être dans le stock) et la quantité";
  if (action.type === "expense") return "le montant";
  if (action.type === "debt_payment") return "le client (il doit déjà avoir une dette) et le montant";
  if (action.type === "purchase") return "l'article acheté, la quantité et le prix";
  if (action.type === "cash_count") return "le comptage de caisse, qui se fait dans l'écran Caisse";
  return "le nom du client et le montant";
}

type Debtor = { name: string; debt: number };
const fr = (n: number) => `${Math.round(n).toLocaleString("fr-FR").replace(/[\u202f\u00a0]/g, " ")} F`;

/** Total des dettes (et des dettes en retard), en francs et en wolof, calculé par le code. */
export function debtTotals(clients: Debtor[], late: Debtor[] = []) {
  const owing = clients.filter((c) => c.debt > 0).sort((a, b) => b.debt - a.debt);
  const total = owing.reduce((a, c) => a + c.debt, 0);
  const lateTotal = late.reduce((a, c) => a + (c.debt > 0 ? c.debt : 0), 0);
  return {
    nombre_clients: owing.length,
    total_francs: total,
    total_en_francs: fr(total),
    total_en_wolof: total > 0 ? francsToWolof(total) : "dara",
    total_en_retard_francs: lateTotal,
    total_en_retard_en_wolof: lateTotal > 0 ? francsToWolof(lateTotal) : "dara",
    liste: owing.map((c) => ({ client: c.name, francs: c.debt, en_francs: fr(c.debt), en_wolof: francsToWolof(c.debt) })),
    consigne: "Pour le total, dis total_en_wolof (ou total_en_francs) mot pour mot. N'additionne jamais toi-même.",
  };
}

/** Somme ou différence de montants, faite par le code (jamais de tête par le modèle). */
export function calculate(args: Record<string, unknown>): Record<string, unknown> {
  const raw = Array.isArray(args.montants) ? args.montants : [];
  const values = raw.map((v) => (typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[\s\u202f\u00a0F]/gi, "")) : NaN));
  if (!values.length || values.some((v) => !Number.isFinite(v))) return NOT_UNDERSTOOD;
  const op = args.operation === "difference" ? "difference" : "somme";
  const result = op === "difference" ? values.slice(1).reduce((a, v) => a - v, values[0]) : values.reduce((a, v) => a + v, 0);
  const abs = Math.abs(Math.round(result));
  return {
    operation: op,
    resultat_francs: Math.round(result),
    en_francs: `${result < 0 ? "moins " : ""}${fr(abs)}`,
    en_wolof: abs === 0 ? "dara" : `${result < 0 ? "moins " : ""}${francsToWolof(abs)}`,
    consigne: "Répète en_wolof (ou en_francs) mot pour mot. Ne change aucun chiffre.",
  };
}

