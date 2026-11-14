/**
 * Plusieurs opérations écrites ou collées d'un coup (14/11/2026, demande de Fallou : « si j'écris pour enregistrer, ça ne va pas »).
 * Gemini sépare les opérations ; le patron voit la liste, décoche ce qui est déjà enregistré, puis « Tout enregistrer ».
 * Les totaux, récapitulatifs et consignes ne deviennent jamais des opérations.
 */
import { type Shop, money, todayStamp } from "../model.ts";
import type { DraftAction } from "./client.ts";
import { moneyAmountsSaid } from "./wolofNumbers.ts";

export type BatchItem = { line: string; action: DraftAction; keep: boolean; duplicate?: string; cost?: number; service?: boolean };
export type BatchCardData = { items: BatchItem[]; ignored: string[]; status: "attente" | "enregistre" | "annule"; done?: number; failed?: string[] };

/** Un texte long, ou plusieurs lignes avec chacune un montant : ce sont plusieurs opérations. */
export function looksLikeBatch(text: string): boolean {
  const t = text.trim();
  if (t.length > 450) return true;
  const lines = t.split(/\n|;|•|(?:^|\s)-\s/).map((l) => l.trim()).filter(Boolean);
  return lines.filter((l) => moneyAmountsSaid(l).length > 0).length >= 2;
}

const TYPE: Record<string, string> = {
  sale: "Vente",
  expense: "Dépense",
  purchase: "Achat",
  debt_add: "Dette",
  debt_payment: "Remboursement",
  stock_adjust: "Stock",
  invoice: "Facture",
  cash_count: "Caisse",
};

/**
 * Montants écrits avec leur nom dans la ligne (14/11/2026, Fallou : « vente 1 500 F, achat 300 F, bénéfice 1 200 F ») :
 * « vente » = montant de la vente, « achat » = prix d'achat (le bénéfice se calcule tout seul).
 * Le « bénéfice » et les totaux écrits ne sont jamais pris comme montant.
 */
const NUMBER = String.raw`(\d{1,3}(?:[ \u00a0\u202f.,]\d{3})+|\d+)`;
const SALE_WORD = String.raw`(?:prix\s+de\s+vente|vente|pv)`;
const COST_WORD = String.raw`(?:prix\s+d['’]\s*achat|achat|co[uû]t|pa)`;
// Le nombre doit être un montant (suivi de F, FCFA, francs, d'une ponctuation ou de la fin) : « vendu 2 riz » n'est pas 2 F.
const MONEY_END = String.raw`(?=\s*(?:f\b|fcfa|cfa|francs?|[,;.)]|$))`;
function labeled(line: string, word: string): number | undefined {
  const m = new RegExp(String.raw`(?:^|[^a-zà-ÿ])${word}\s*(?::|=|à|a)?\s*${NUMBER}${MONEY_END}`, "im").exec(line);
  if (!m) return undefined;
  const n = Number(m[1]!.replace(/[ \u00a0\u202f.,]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
export function lineAmounts(line: string): { sale?: number; cost?: number } {
  return { sale: labeled(line, SALE_WORD), cost: labeled(line, COST_WORD) };
}

/** Travail sans pièce (configuration, décodage, réglage…) : tout est main-d'œuvre, le bénéfice = le prix. */
const SERVICE_WORDS = /configur|d[ée]codage|d[ée]blocage|d[ée]verrouill|r[ée]glage|flash|formatage|installation|mise [àa] jour|logiciel|cr[ée]ation (?:de |d['’])?compte|compte google|frp|reset|sauvegarde|transfert de|saisie|scan(?:ner)?\b|photocopi|impression/i;

/**
 * Chaque opération relue par le code : montant de la vente et prix d'achat écrits dans SA ligne,
 * et service pur (aucune pièce, aucun prix d'achat écrit) reconnu.
 */
export function settleItems(operations: { line: string; action: DraftAction }[]): { line: string; action: DraftAction; cost?: number; service?: boolean }[] {
  return operations.map(({ line, action }) => {
    if (action.type !== "sale") return { line, action };
    const { sale, cost } = lineAmounts(line);
    const next = sale ? { ...action, amount: sale, unitPrice: null } : action;
    const service = cost === undefined && !action.productId && SERVICE_WORDS.test(`${action.label ?? ""} ${action.productName ?? ""} ${line}`);
    return { line, action: next, ...(cost !== undefined && (!next.amount || cost <= next.amount * 10) ? { cost } : {}), ...(service ? { service: true } : {}) };
  });
}

/** « Vente · Configuration imprimante · 10 000 F · Moussa » */
export function describeAction(a: DraftAction): string {
  const what = a.label?.trim() || a.productName?.trim() || "";
  const qty = a.quantity && a.quantity !== 1 ? `${a.quantity} × ` : "";
  const f = (n: number) => money(n).replace(/[\u202f\u00a0]/g, " ");
  const amount = a.amount ? f(a.amount) : a.unitPrice ? `${f(a.unitPrice)} l'unité` : "montant ?";
  return [TYPE[a.type] ?? a.type, `${qty}${what}`.trim(), amount, a.clientName?.trim()].filter(Boolean).join(" · ");
}

const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Déjà enregistré aujourd'hui ? Même montant, même jour, et un mot du libellé en commun (ou pas de libellé) :
 * la ligne est décochée, avec ce qui existe déjà, pour ne jamais compter deux fois.
 */
export function markDuplicates(shop: Pick<Shop, "sales" | "expenses">, items: Omit<BatchItem, "keep" | "duplicate">[], today = todayStamp().slice(0, 10)): BatchItem[] {
  const used = new Set<string>();
  const existing = [
    ...shop.sales.filter((s) => s.at.slice(0, 10) === today).map((s) => ({ id: s.id, label: s.label, amount: s.amount, kind: "sale" })),
    ...shop.expenses.filter((e) => e.at.slice(0, 10) === today).map((e) => ({ id: e.id, label: e.label, amount: e.amount, kind: "expense" })),
  ];
  return items.map((item) => {
    const a = item.action;
    const isSale = a.type === "sale";
    const isExpense = a.type === "expense" || a.type === "purchase";
    const words = plain(`${a.label ?? ""} ${a.productName ?? ""} ${item.line}`).split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
    const twin = a.amount
      ? existing.find(
          (e) =>
            !used.has(e.id) &&
            e.amount === a.amount &&
            ((isSale && e.kind === "sale") || (isExpense && e.kind === "expense")) &&
            (!words.length || words.some((w) => plain(e.label).includes(w))),
        )
      : undefined;
    if (twin) used.add(twin.id);
    return { ...item, keep: !twin && Boolean(a.amount || a.unitPrice), ...(twin ? { duplicate: twin.label } : {}) };
  });
}

/**
 * Action prête à enregistrer. Gemini a dit « pas un article du stock » (productId null) : on ne laisse pas l'appli
 * retrouver un article par son nom (« Réparation écran ZTE A35 » ne doit pas sortir l'écran ZTE A35 du stock),
 * sauf si c'est un service du catalogue de la boutique (photocopie, bâche…), qui a ses propres calculs.
 */
export function forRecord(action: DraftAction, shop: Pick<Shop, "services">, isService: (name: string) => boolean): DraftAction {
  if (action.productId || !action.productName) return action;
  if ((shop.services ?? []).length && isService(action.productName)) return action;
  return { ...action, label: action.label?.trim() || action.productName, productName: null };
}

/** Action à enregistrer avec ce que la ligne dit en plus : prix d'achat écrit, ou service pur (main-d'œuvre). */
export function withLineFacts(action: DraftAction, item: Pick<BatchItem, "cost" | "service">): DraftAction & { cost?: number } {
  if (action.type !== "sale") return action;
  if (item.cost !== undefined) return { ...action, cost: item.cost };
  if (item.service && !action.productId) {
    const label = (action.label?.trim() || action.productName?.trim() || "Service").replace(/^Service · /, "");
    return { ...action, label: `Service · ${label}`, productName: null, cost: 0 };
  }
  return action;
}

/** Totaux des ventes cochées, à comparer aux totaux écrits par le patron (jamais enregistrés). */
export function batchTotals(items: BatchItem[]): { sales: number; cost: number; profit: number; known: number; unknown: number } {
  let sales = 0, cost = 0, profit = 0, known = 0, unknown = 0;
  for (const i of items) {
    if (!i.keep || i.action.type !== "sale" || !i.action.amount) continue;
    sales += i.action.amount;
    const c = i.cost ?? (i.service ? 0 : undefined);
    if (c === undefined) unknown++;
    else {
      known++;
      cost += c;
      profit += i.action.amount - c;
    }
  }
  return { sales, cost, profit, known, unknown };
}
