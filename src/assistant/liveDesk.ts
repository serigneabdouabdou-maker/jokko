import { type Lang, type Role, type Shop, lowStock, uid } from "../model";
import { overdueDebts } from "../data/debts";
import { buildReport, periodOf } from "../data/report";
import { applyDraft, roundQty, unitKind } from "./apply";
import { extractSpokenAmount, francsToWolof, settleAmounts, spokenAmountToFrancs, wolofNumber } from "./wolofNumbers";
import { buildShopContext, type DraftAction, type DraftActionType } from "./client";
import type { LiveToolCall } from "./live";
import { Basket } from "./basket";
import { debtWords } from "./debtMode";
import { addCouture, deliverCouture, findCouture, isOpen as coutureOpen, knownMeasures, MEASURES, ordersOf as coutureOrders, payCouture, remaining as coutureRest, setStep, STEP_LABEL } from "../data/couture";
import { missingForOrder, readSpokenCouture, spokenMoney } from "../data/coutureVoice";
import { addRepair, deliverRepair, findRepair, markRepaired, type PartInput, payRepair, remaining, repairProfit, repairsOf } from "../data/repairs";
import { distinguishes, expandHeard, nameClash, type Named, pickByName, plain, sameName, UNITS } from "./wolofNames";
import { foreignArticle } from "../data/metierWords";
import { serviceFromVoice } from "../data/serviceVoice";
import { searchProducts } from "../data/partSearch";
import { modelKeys } from "../data/modelKeys";
import { metierOf } from "../data/metiers";

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

export type Recorded = { ok: true; entry: Entry } | { ok: false; besoin: string; question?: Record<string, number | string> };

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
  /** Clients à qui Jokko vient de demander « ajout ou total ? » : leur réponse (choix du modèle) est respectée. */
  private askedDebt = new Set<string>();
  private deps: DeskDeps;

  constructor(deps: DeskDeps) {
    this.deps = deps;
  }

  get last(): Entry | null {
    return this.history[0] ?? null;
  }

  /** Enregistre une écriture comprise par Jokko. */
  /** Outil « reparation » : carnet des réparateurs (dépôt → réparé → rendu). */
  private repair(args: Record<string, unknown>, callId?: string): Record<string, unknown> {
    const shop = this.deps.getShop();
    const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const heard = text(args.heard);
    const said = (v: unknown) => {
      const t = text(v);
      return t ? (spokenAmountToFrancs(t) ?? extractSpokenAmount(t))?.francs ?? null : null;
    };
    const W = (n: number) => ({ francs: n, wolof: francsToWolof(n) });
    const action = text(args.action);
    if (action === "lister") {
      const open = repairsOf(shop).filter((r) => r.status === "depot" || r.status === "repare");
      return {
        statut: "liste",
        en_cours: open.slice(0, 20).map((r) => ({ ticket: r.number, client: r.clientName, appareil: r.device, panne: r.problem, etat: r.status === "depot" ? "au dépôt, pas encore réparé" : "réparé, attend le client", reste: W(remaining(r)) })),
        consigne: open.length ? "Dis combien d'appareils attendent, puis les plus anciens (ticket, client, appareil)." : "Dis qu'aucun appareil n'attend.",
      };
    }
    if (action === "deposer") {
      const clientName = text(args.clientName);
      if (!clientName) return { statut: "incomplet", besoin: "le nom du client" };
      const price = said(args.prixDit);
      const advance = said(args.avanceDit);
      if (text(args.prixDit) && price === null) return NOT_UNDERSTOOD;
      if (text(args.avanceDit) && advance === null) return NOT_UNDERSTOOD;
      const warranty = typeof args.garantieJours === "number" && args.garantieJours > 0 ? Math.round(args.garantieJours) : undefined;
      const { shop: after, repair } = addRepair(shop, { clientName, phone: text(args.telephone), device: text(args.appareil), problem: text(args.panne), price: price ?? 0, advance: advance ?? 0, warrantyDays: warranty });
      this.commit(shop, after, `Réparation ${repair.number} · ${repair.clientName} · ${repair.device}${repair.price ? ` · ${fr(repair.price)}` : ""}${repair.paid ? ` · avance ${fr(repair.paid)}` : ""}`, heard, { callId, amount: repair.paid || undefined });
      return {
        statut: "enregistre",
        ticket: repair.number,
        client: repair.clientName,
        prix: repair.price ? W(repair.price) : null,
        avance: repair.paid ? W(repair.paid) : null,
        reste: W(remaining(repair)),
        consigne: `Dis le numéro du ticket (${repair.number}) pour qu'il l'écrive sur l'appareil, puis le reste à payer en wolof (reste.wolof).${repair.price ? "" : " Le prix n'est pas encore fixé : il le dira au rendu."}`,
      };
    }
    const ref = text(args.ticket) || text(args.clientName);
    const found = ref ? findRepair(shop, ref) : undefined;
    if (!found) return { statut: "incomplet", besoin: "le numéro du ticket (R-…) ou le nom du client de la réparation" };
    if (action === "reparee") {
      const names = Array.isArray(args.pieces) ? args.pieces.map((x) => String(x ?? "").trim()).filter(Boolean) : [];
      // « écran iPhone 11 à 5 000 » : pièce achetée exprès, avec son prix d'achat (sortie de caisse).
      const priced = names.map((n) => {
        const m = n.match(/^(.*?)(?:\s+(?:à|a|ci|pour|=)\s+|\s*:\s*)(.+)$/i);
        const cost = m ? said(m[2]) : null;
        return cost && m![1].trim() ? { name: m![1].trim(), cost } : { name: n, cost: null };
      });
      const parts: PartInput[] = priced.map(({ name, cost }) => {
        const hit = pickByName(shop.products, name);
        if (hit.item) return { productId: hit.item.id };
        return cost ? { label: name, cost, fromCash: true } : { label: name, cost: 0 };
      });
      const missingPieces = priced.filter((p) => !p.cost && !pickByName(shop.products, p.name).item).map((p) => p.name);
      const after = markRepaired(shop, found.id, parts);
      if (!after) return { statut: "incomplet", besoin: "une réparation encore ouverte" };
      const r = repairsOf(after).find((x) => x.id === found.id)!;
      this.commit(shop, after, `Réparation ${r.number} réparée · pièces : ${r.parts.map((p) => p.label).join(", ") || "aucune"}`, heard, { callId });
      return {
        statut: "enregistre",
        ticket: r.number,
        pieces: r.parts.map((p) => p.label),
        benefice: r.price ? W(repairProfit(r)) : null,
        reste: W(remaining(r)),
        main_oeuvre: r.price ? W(repairProfit(r)) : null,
        ...(missingPieces.length
          ? { pieces_sans_prix: missingPieces, consigne_pieces: "Ces pièces ne sont pas dans le stock et leur prix d'achat n'est pas dit : demande combien il les a achetées. S'il le dit, rappelle reparee avec seulement ces pièces et leur prix (« écran à 5 000 »)." }
          : r.price ? { consigne_calcul: "Dis en une phrase : le client paie le prix, les pièces ont coûté tant, il gagne la main-d'œuvre (main_oeuvre.wolof)." } : {}),
      };
    }
    if (action === "payer") {
      const amount = said(args.montantDit);
      if (!amount) return NOT_UNDERSTOOD;
      const after = payRepair(shop, found.id, amount);
      if (!after) return NOT_UNDERSTOOD;
      const r = repairsOf(after).find((x) => x.id === found.id)!;
      this.commit(shop, after, `Réparation ${r.number} · acompte ${fr(amount)}`, heard, { callId, amount });
      return { statut: "enregistre", ticket: r.number, paye: W(amount), reste: W(remaining(r)) };
    }
    if (action === "rendre") {
      const amount = text(args.montantDit) ? said(args.montantDit) : 0;
      if (amount === null) return NOT_UNDERSTOOD;
      const after = deliverRepair(shop, found.id, amount, args.resteEnDette === true);
      if (!after) return { statut: "incomplet", besoin: "une réparation pas encore rendue" };
      const r = repairsOf(after).find((x) => x.id === found.id)!;
      const rest = Math.max(0, r.price - r.paid);
      this.commit(shop, after, `Réparation ${r.number} rendue · payé ${fr(amount)}${rest ? ` · reste ${fr(rest)} en dette` : ""}`, heard, { callId, amount: amount || undefined });
      return { statut: "enregistre", ticket: r.number, paye: W(amount), reste_en_dette: rest ? W(rest) : null, benefice: W(repairProfit(r)) };
    }
    return { statut: "outil_inconnu" };
  }

  /** Outil « couture » : commandes du tailleur dites à la voix (commande, étape, acompte, livraison, mesures). */
  private couture(args: Record<string, unknown>, callId?: string): Record<string, unknown> {
    const shop = this.deps.getShop();
    const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const heard = text(args.heard);
    const W = (n: number) => ({ francs: n, wolof: francsToWolof(n) });
    const action = text(args.action);
    if (action === "lister") {
      const open = coutureOrders(shop).filter(coutureOpen);
      const ready = open.filter((o) => o.status === "pret");
      return {
        statut: "liste",
        nombre_en_cours: open.length,
        nombre_prets: ready.length,
        commandes: open.slice(0, 20).map((o) => ({ numero: o.number, client: o.clientName, habit: o.garment, etape: STEP_LABEL[o.status], date_promise: o.dueAt ?? null, reste: W(coutureRest(o)) })),
        consigne: open.length ? "Dis combien de commandes sont en cours et combien sont prêtes, puis les plus urgentes (client, habit, étape)." : "Dis qu'aucune commande n'est en cours.",
      };
    }
    if (action === "mesures") {
      const name = text(args.clientName);
      const known = name ? knownMeasures(shop, name) : {};
      const list = MEASURES.filter((m) => known[m.key]).map((m) => ({ mesure: m.label, cm: known[m.key] }));
      return list.length
        ? { statut: "mesures", client: name, mesures: list, consigne: "Lis chaque mesure (nom et centimètres), une par une. Les mesures sont des centimètres : dis le nombre tel quel, jamais en dërëm." }
        : { statut: "incomplet", besoin: `aucune mesure enregistrée pour ${name || "ce client"}` };
    }
    if (action === "commander") {
      const read = readSpokenCouture({
        clientName: text(args.clientName), telephone: text(args.telephone), habit: text(args.habit), tissu: text(args.tissu),
        mesures: (args.mesures && typeof args.mesures === "object" ? args.mesures : {}) as Record<string, unknown>,
        prixDit: text(args.prixDit), avanceDit: text(args.avanceDit), jour: text(args.jour),
        delaiJours: typeof args.delaiJours === "number" ? args.delaiJours : undefined, remarque: text(args.remarque),
      });
      const missing = missingForOrder(read.input);
      if (missing) return { statut: "incomplet", besoin: missing };
      if (read.unclear.length) return { ...NOT_UNDERSTOOD, pas_clair: read.unclear, consigne: `N'enregistre rien. Redemande seulement : ${read.unclear.join(", ")}.` };
      const { shop: after, order } = addCouture(shop, read.input);
      this.commit(shop, after, `Couture ${order.number} · ${order.clientName} · ${order.garment}${order.price ? ` · ${fr(order.price)}` : ""}${order.paid ? ` · avance ${fr(order.paid)}` : ""}`, heard, { callId, amount: order.paid || undefined });
      return {
        statut: "enregistre",
        numero: order.number,
        client: order.clientName,
        habit: order.garment,
        mesures_notees: Object.keys(read.input.measures ?? {}).length,
        prix: order.price ? W(order.price) : null,
        avance: order.paid ? W(order.paid) : null,
        reste: W(coutureRest(order)),
        date_promise: order.dueAt ?? null,
        consigne: `Dis le numéro ${order.number} (à écrire sur le tissu), le client, puis le reste à payer (reste.wolof en wolof).${order.price ? "" : " Le prix n'est pas encore fixé."}${order.phone ? "" : " Demande le numéro du client pour son lien de suivi (outil numero_client)."}`,
      };
    }
    const ref = text(args.numero) || text(args.clientName);
    const found = ref ? findCouture(shop, ref) : undefined;
    if (!found) return { statut: "incomplet", besoin: "le numéro de la commande (C-…) ou le nom du client" };
    if (action === "etape") {
      const step = text(args.etape) as "coupe" | "couture" | "finition" | "pret";
      if (!["coupe", "couture", "finition", "pret"].includes(step)) return { statut: "incomplet", besoin: "l'étape : coupe, couture, finition ou prêt" };
      const after = setStep(shop, found.id, step);
      if (!after) return { statut: "incomplet", besoin: "une commande encore en cours" };
      this.commit(shop, after, `Couture ${found.number} · ${found.clientName} : ${STEP_LABEL[step]}`, heard, { callId });
      return {
        statut: "enregistre", numero: found.number, client: found.clientName, etape: STEP_LABEL[step], reste: W(coutureRest(found)),
        consigne: step === "pret" ? "Dis que l'habit est prêt, et que le bouton « Prévenir sur WhatsApp » de l'Atelier couture envoie le message au client." : "Dis l'étape en quelques mots.",
      };
    }
    if (action === "payer" || action === "livrer") {
      const saidAmount = text(args.montantDit);
      const amount = saidAmount ? spokenMoney(saidAmount) : action === "livrer" ? 0 : null;
      if (amount === null) return NOT_UNDERSTOOD;
      const after = action === "payer" ? payCouture(shop, found.id, amount) : deliverCouture(shop, found.id, amount);
      if (!after) return action === "payer" ? NOT_UNDERSTOOD : { statut: "incomplet", besoin: "une commande pas encore livrée" };
      const o = coutureOrders(after).find((x) => x.id === found.id)!;
      const debt = action === "livrer" ? Math.max(0, o.price - o.paid) : 0;
      this.commit(shop, after, `Couture ${o.number} · ${o.clientName} · ${action === "payer" ? "acompte" : "livré, payé"} ${fr(amount)}${debt ? ` · reste ${fr(debt)} en dette` : ""}`, heard, { callId, amount: amount || undefined });
      return action === "payer"
        ? { statut: "enregistre", numero: o.number, client: o.clientName, paye: W(amount), reste: W(coutureRest(o)) }
        : { statut: "enregistre", numero: o.number, client: o.clientName, paye: W(amount), reste_en_dette: debt ? W(debt) : null };
    }
    return { statut: "outil_inconnu" };
  }

  record(action: DraftAction, heard = "", callId?: string, learn?: Learned | null): Recorded {
    const key = JSON.stringify([action, heard.trim().toLowerCase()]);
    const last = this.history[0];
    if (last?.key === key && Date.now() - last.at < DUPLICATE_MS && last.after.id === this.deps.getShop().id) {
      return { ok: true, entry: last };
    }
    if (this.deps.role?.() === "vendeur" && PATRON_ONLY.includes(action.type)) return { ok: false, besoin: PATRON_ONLY_MESSAGE };
    const before = this.deps.getShop();
    // « Fatou me doit 15 000 » alors qu'elle doit déjà 20 000 : ajouter, ou est-ce le total ? Jokko ne devine pas.
    const prior = action.type === "debt_add" && !action.debtMode && action.clientId ? before.clients.find((c) => c.id === action.clientId) : undefined;
    if (prior && prior.debt > 0 && action.amount) {
      const add = action.amount;
      this.askedDebt.add(prior.id);
      return {
        ok: false,
        besoin: `de savoir : ${prior.name} doit déjà ${fr(prior.debt)} (${francsToWolof(prior.debt)}). J'ajoute ${fr(add)} (total ${fr(prior.debt + add)}), ou sa dette totale est ${fr(add)} ?`,
        question: {
          avant: prior.debt, avant_wolof: francsToWolof(prior.debt),
          ajout: add, ajout_wolof: francsToWolof(add),
          total_si_ajout: prior.debt + add, total_si_ajout_wolof: francsToWolof(prior.debt + add),
        },
      };
    }
    // Mode secours (vocal, écrit) : même calcul des services que la conversation en direct.
    if (action.type === "sale" && action.productName && !callId) {
      const sv = serviceFromVoice(before, { said: action.productName, text: `${heard} ${action.label ?? ""}`, productId: action.productId, quantity: action.quantity, unit: action.unit, amount: action.amount, unitPrice: action.unitPrice, clientId: action.clientId });
      if (sv.kind === "need") return { ok: false, besoin: sv.besoin };
      if (sv.kind === "sale") return { ok: true, entry: this.commit(before, sv.shop, sv.summary, heard, { key, amount: sv.amount }) };
    }
    const applied = applyDraft(before, action);
    if (!applied) return { ok: false, besoin: missing(action) };
    // Carnet de mots de la boutique : le mot appris fait partie de l'écriture, il est oublié si on l'annule.
    const after = learn ? withAlias(applied.shop, learn.productId, learn.word) : applied.shop;
    return { ok: true, entry: this.commit(before, after, applied.summary, heard, { callId, key, amount: applied.amount }) };
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
      const shopNow = this.deps.getShop();
      const said = typeof args.productName === "string" ? args.productName.trim() : "";
      // Un métier = ses articles : du riz chez un tailleur (absent du stock) n'est pas enregistré sans question.
      if (!action.productId && said && ["sale", "purchase", "stock_adjust", "invoice"].includes(action.type) && args.horsMetierConfirme !== true) {
        const owner = foreignArticle(said, shopNow.activity, shopNow.modules ?? []);
        if (owner) {
          return {
            statut: "hors_metier",
            article: said,
            metier_de_la_boutique: metierOf(shopNow.activity).label,
            consigne:
              "N'enregistre rien. Cet article n'est pas du métier de la boutique et n'est pas dans son stock. Demande en une phrase si c'est bien un article de sa boutique, ou une dépense (repas, maison). " +
              "S'il confirme que c'est pour la boutique, rappelle enregistrer avec horsMetierConfirme true. Si c'est une dépense, enregistre type expense.",
          };
        }
      }
      const learn = learnedWord(args, shopNow, action);
      // Garde-fou des chiffres : le montant est recalculé ici, jamais laissé au calcul du modèle.
      const heardText = typeof args.heard === "string" ? args.heard : "";
      if (action.type !== "stock_adjust" && !fixAmounts(action, args, heardText)) return NOT_UNDERSTOOD;
      const heard = typeof args.heard === "string" ? args.heard.trim() : "";
      if (heard) this.deps.onHeard?.(heard);
      // Service du catalogue (« décodage 5 000 », « bâche 2 sur 1,5 », « 50 photocopies ») : le code calcule et encaisse.
      if (action.type === "sale" && said) {
        const sv = serviceFromVoice(shopNow, { said, text: [heardText, typeof args.label === "string" ? args.label : ""].join(" "), productId: action.productId, quantity: action.quantity, unit: action.unit, amount: action.amount, unitPrice: action.unitPrice, clientId: action.clientId });
        if (sv.kind === "need") {
          return { statut: "incomplet", besoin: sv.besoin, consigne: "N'enregistre rien et ne calcule rien. Pose la question en une phrase courte, puis rappelle enregistrer avec la réponse dans heard." };
        }
        if (sv.kind === "sale") {
          this.commit(shopNow, sv.shop, sv.summary, heard, { callId: call.id, amount: sv.amount });
          return {
            statut: "enregistre",
            resume: `${sv.service.name} encaissé`,
            calcul: sv.calcul,
            montant: { francs: sv.amount, wolof: francsToWolof(sv.amount) },
            consigne: "Dis en une phrase le service et le montant (montant.wolof). Si calcul contient des mesures, redis-les (2 sur 1,5 = 3 m²). Ne refais jamais le calcul toi-même.",
          };
        }
      }
      // Dette : « ajout » ou « total » d'après les mots du commerçant, pas d'après le modèle.
      // Rien de clair avec un montant (« Fatou me doit 15 000 ») : on laisse le code poser la question.
      if (action.type === "debt_add" && heard) {
        const words = debtWords(heard);
        const answered = action.clientId ? this.askedDebt.has(action.clientId) : false;
        if (words === "ajout" || words === "total") action.debtMode = words;
        else if (words === null && !answered && extractSpokenAmount(heard)) action.debtMode = null;
        if (answered && action.debtMode && action.clientId) this.askedDebt.delete(action.clientId);
      }
      const product = action.productId ? this.deps.getShop().products.find((p) => p.id === action.productId) : undefined;
      if (product && (action.type === "sale" || action.type === "stock_adjust" || action.type === "purchase") && unitKind(action.unit, product) === "inconnue") {
        const units = [product.unit, product.retail?.unit].filter(Boolean).join(" ou ");
        return { statut: "incomplet", besoin: `l'unité : ${product.name} se compte en ${units}`, consigne: "N'enregistre rien. Demande l'unité en disant les unités possibles." };
      }
      const result = this.record(action, heard, call.id, learn);
      if (!result.ok && result.besoin === PATRON_ONLY_MESSAGE) {
        return { statut: "refuse", raison: PATRON_ONLY_MESSAGE, consigne: "N'enregistre rien. Dis en une phrase que seul le patron peut faire ça." };
      }
      if (!result.ok && result.question) {
        const q = result.question;
        return {
          statut: "ajout_ou_total",
          ...q,
          consigne: `Rien n'est enregistré. Demande en une phrase, avec ces montants exacts : en wolof « Amoon na ${q.avant_wolof}. Ma yokk ${q.ajout_wolof}, walla bor bi lépp ${q.ajout_wolof} la ? » ; en français « Elle devait déjà ${q.avant} F. J'ajoute ${q.ajout} F, ou sa dette totale est ${q.ajout} F ? ». Puis rappelle enregistrer avec modeDette « ajout » ou « total ».`,
        };
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
        ...(learn ? { mot_appris: `${learn.word} = ${learn.productName}` } : {}),
        montant_francs: amount ?? null,
        montant_en_wolof: amount ? francsToWolof(amount) : null,
        stock_bas: low,
        ...(action.type === "debt_add"
          ? (() => {
              const was = new Map(result.entry.before.clients.map((c) => [c.id, c.debt]));
              const changed = result.entry.after.clients.find((c) => was.get(c.id) !== c.debt);
              if (!changed) return {};
              const avant = was.get(changed.id) ?? 0;
              return {
                dette_avant: avant,
                dette_totale: changed.debt,
                dette_totale_en_wolof: francsToWolof(changed.debt),
                ...(avant > 0 ? { consigne_dette: `Dis le montant ajouté (montant_en_wolof) ET la dette totale : « Bor bi lépp : ${francsToWolof(changed.debt)}. » (en français : « Dette totale : ${changed.debt} F. »)` } : {}),
              };
            })()
          : {}),
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

    if (call.name === "reparation") {
      return this.repair(args, call.id);
    }

    if (call.name === "couture") {
      return this.couture(args, call.id);
    }

    if (call.name === "chercher_article") {
      const shop = this.deps.getShop();
      const said = typeof args.nom === "string" ? args.nom.trim() : "";
      if (said.length < 2) return { statut: "incomplet", besoin: "le nom de l'article" };
      const seen = new Set<string>();
      const hits = [said, ...modelKeys(said)]
        .flatMap((q) => searchProducts(shop.products, q, 8))
        .filter((h) => !seen.has(h.product.id) && seen.add(h.product.id))
        .slice(0, 8);
      if (!hits.length) return { statut: "introuvable", consigne: "Cet article n'est pas dans la boutique. Dis-le en une phrase ; s'il le vend quand même, propose de l'ajouter au stock." };
      return {
        statut: "trouve",
        articles: hits.map((h) => ({
          id: h.product.id,
          nom: h.product.name,
          stock: h.product.stock > 0 ? `${wolofNumber(h.product.stock)} ${h.product.unit}` : "amul (stock fini)",
          prix: h.product.price,
          ...(h.product.price > 0 ? { prix_en_wolof: francsToWolof(h.product.price) } : {}),
          ...(h.via ? { va_aussi_sur: h.via } : {}),
        })),
        consigne: "S'il y en a plusieurs, demande lequel en disant leurs noms. Pour une vente ou un stock, rappelle enregistrer avec l'id choisi.",
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
      const after = {
        ...shop,
        clients: shop.clients.map((c) => (c.id === client.id ? { ...c, phone: phone.digits } : c)),
        // Commandes de couture en cours du client : son lien de suivi peut maintenant partir sur WhatsApp.
        ...(shop.couture ? { couture: shop.couture.map((o) => (o.clientId === client.id && !o.phone ? { ...o, phone: phone.digits } : o)) } : {}),
      };
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
        // Mot appris avec cette écriture : oublié avec elle.
        const learned = (a.aliases ?? []).filter((w) => !(b.aliases ?? []).includes(w));
        const aliases = learned.length ? (p.aliases ?? []).filter((w) => !learned.includes(w)) : p.aliases;
        return { ...p, stock: Math.max(0, roundQty(p.stock + (b.stock - a.stock))), cost, ...(aliases !== p.aliases ? { aliases } : {}) };
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
/** Un mot du commerçant appris pour un article de SA boutique. */
export type Learned = { productId: string; productName: string; word: string };

/**
 * Carnet de mots de la boutique : Gemini a compris l'article (son id), mais le code ne l'aurait pas trouvé avec le mot dit
 * (« diwu oto », « bazin bu xonq », un surnom). Ce mot devient un « autre nom » de l'article, pour CETTE boutique seulement :
 * la fois suivante, Jokko le reconnaît aussi en message vocal, à l'écrit et dans le panier. Si l'écriture est annulée, le mot est oublié.
 */
export function learnedWord(args: Record<string, unknown>, shop: Shop, action: DraftAction): Learned | null {
  const said = typeof args.productName === "string" ? args.productName.trim() : "";
  const heard = typeof args.heard === "string" ? args.heard : "";
  const product = shop.products.find((p) => p.id === args.productId);
  if (!said || !product || action.productId !== product.id) return null;
  const word = plain(said);
  const words = word.split(" ").filter(Boolean);
  if (word.length < 3 || word.length > 30 || words.length > 3 || /\d/.test(word) || words.every((w) => UNITS.has(w))) return null;
  // Seulement un mot vraiment dit par le commerçant (pas une reformulation du modèle).
  if (!` ${plain(heard)} `.includes(` ${word} `)) return null;
  // Déjà connu : le nom, un autre nom, ou un mot que le code reconnaît déjà.
  if ([product.name, ...(product.aliases ?? [])].some((n) => plain(n) === word)) return null;
  const found = pickByName(shop.products, said);
  if (found.item || found.ambiguous.length) return null;
  if ((product.aliases?.length ?? 0) >= 12) return null;
  return { productId: product.id, productName: product.name, word };
}

function withAlias(shop: Shop, productId: string, word: string): Shop {
  return { ...shop, products: shop.products.map((p) => (p.id === productId ? { ...p, aliases: [...(p.aliases ?? []), word] } : p)) };
}

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
  // Vrai aussi quand plusieurs clients partagent un nom (la famille Cissé) mais qu'AUCUN ne correspond au nom
  // complet entendu : « Anta Cissé » à côté de « Fallou Cissé » et « Diop Cissé » = une nouvelle personne,
  // pas « lequel des deux ? ». (Un nom seul — « Cissé », « Fatou » — reste ambigu : Jokko demande.)
  const newPerson =
    clientName &&
    (found.item
      ? nameClash(found.item.name, clientName)
      : found.ambiguous.length > 0 && found.ambiguous.every((c) => nameClash(c.name, clientName)));
  const client = newPerson ? { item: undefined, ambiguous: [] as typeof found.ambiguous } : found;
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
      debtMode: args.modeDette === "total" || args.debtMode === "total" ? "total" : args.modeDette === "ajout" || args.debtMode === "ajout" ? "ajout" : null,
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

