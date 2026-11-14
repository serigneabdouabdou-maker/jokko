/**
 * Plusieurs opérations écrites ou collées d'un coup (14/11/2026, demande de Fallou : « si j'écris pour enregistrer, ça ne va pas »).
 * Gemini sépare les opérations ; le patron voit la liste, décoche ce qui est déjà enregistré, puis « Tout enregistrer ».
 * Les totaux, récapitulatifs et consignes ne deviennent jamais des opérations.
 */
import { type Shop, money, todayStamp } from "../model.ts";
import type { DraftAction } from "./client.ts";
import { moneyAmountsSaid } from "./wolofNumbers.ts";

export type BatchItem = { line: string; action: DraftAction; keep: boolean; duplicate?: string };
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
