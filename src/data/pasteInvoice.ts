/**
 * Facture collée (22/11/2026, demande de Fallou : « il m'envoie chaque commande, puis après 15 jours tout ensemble
 * ce qu'il faut payer : je copie son message et le système vérifie les calculs, les prix qui montent ou baissent,
 * et entre les nouvelles commandes tout seul »).
 *
 * Le patron colle le message du fournisseur (un message, plusieurs messages copiés, ou le texte seul). Jokko :
 * 1. relit chaque ligne (« 6 LCD a12 4500=27.000 ») : quantité × prix = sous-total ? total = somme des lignes ?
 * 2. compare chaque prix au dernier prix de ce fournisseur (factures déjà lues), sinon au prix d'achat du stock ;
 * 3. sépare ce qui est déjà entré au stock (`Supplier.received`, 45 jours, une facture de 15 jours reprend les
 *    commandes déjà reçues) de ce qui est nouveau, et propose d'entrer le nouveau au stock (cases cochées) ;
 * 4. prépare le message des erreurs à envoyer au fournisseur.
 * Rien n'est envoyé ailleurs : tout se fait dans le téléphone, sans IA.
 */
import type { CashSource, Shop, Supplier } from "../model.ts";
import { partForSale } from "./partSearch.ts";
import { kindOf } from "./pricing.ts";
import {
  addInvoices, addStockLines, type Built, type ChatAnomaly, type ChatInvoice, keepAnomalies, messages, partOf, readSupplierChat, type StockLine, trimItems,
} from "./supplierChat.ts";

const DAY = 86_400_000;
const fmt = (n: number) => n.toLocaleString("fr-FR").replace(/[   ]/g, " ");
const iso = (d: Date) => d.toISOString().slice(0, 10);

export type PasteLine = {
  key: string;
  label: string;
  /** Écrit par le fournisseur. */
  raw: string;
  qty: number;
  unit: number;
  sub: number;
  /** Dernier prix connu avant cette facture (fournisseur, sinon stock). */
  before?: { unit: number; date?: string; from: "fournisseur" | "stock" };
  change: "hausse" | "baisse" | "pareil" | "nouvelle";
  /** Déjà entrées au stock (commande reçue plus tôt), et ce qui reste à entrer. */
  doneQty: number;
  newQty: number;
  productId?: string;
  productName?: string;
  oldCost?: number;
  choices?: number;
};

/** Empreinte d'une facture : ses lignes et son total, sans la date (renvoyée le lendemain = même facture). */
export function invoiceSig(inv: ChatInvoice): string {
  return `${inv.total}#${inv.lines.map((l) => `${l.qty}|${partOf(l.name).key}|${l.unit}`).sort().join(";")}`;
}

export type PasteResult = {
  /** Déjà enregistrée : quand, et payée avec quoi. */
  already?: { at: string; paid?: CashSource };
  sig: string;
  date: string;
  total: number;
  /** Le total était écrit dans le message (sinon calculé par Jokko). */
  written: boolean;
  sum: number;
  lines: PasteLine[];
  anomalies: ChatAnomaly[];
  /** Ce que coûtent en plus (ou en moins) les prix qui ont changé, sur cette facture. */
  priceEffect: number;
  newAmount: number;
  invoice: ChatInvoice;
};

/** Le dernier prix connu d'une pièce avant une date. */
function lastPrice(sup: Supplier | undefined, key: string, date: string): { unit: number; date: string } | undefined {
  const it = sup?.items?.find((i) => i.key === key);
  const prices = (it?.prices ?? []).filter(([d]) => d < date);
  const p = prices[prices.length - 1];
  return p ? { unit: p[1], date: p[0] } : undefined;
}

/** Lit le message collé. `null` si aucune ligne de pièce n'est lisible. */
export function readPastedInvoice(text: string, shop: Shop, sup?: Supplier, now = new Date()): PasteResult | null {
  const clean = text.replace(/\r/g, "").trim();
  if (!clean) return null;
  const today = iso(now);
  const d = `${today.slice(8, 10)}/${today.slice(5, 7)}/${today.slice(0, 4)}`;
  const who = sup?.name || "Fournisseur";
  // Avec les en-têtes WhatsApp : tel quel ; sinon un seul message daté d'aujourd'hui.
  const chat = messages(clean).length ? clean : `${d}, 12:00 - ${who}: ${clean}`;
  let imp = readSupplierChat(chat);
  let written = true;
  if (!imp.invoices.length) {
    // Pas de « Total … » écrit : Jokko additionne les lignes lui-même.
    const probe = readSupplierChat(`${chat}\nTotal 999999999`);
    const sum = probe.invoices[probe.invoices.length - 1]?.lines.reduce((a, l) => a + l.sub, 0) ?? 0;
    if (!sum) return null;
    imp = readSupplierChat(`${chat}\nTotal ${sum}`);
    written = false;
  }
  const inv = imp.invoices[imp.invoices.length - 1];
  if (!inv?.lines.length) return null;
  const anomalies = imp.anomalies.filter((a) => a.kind !== "doublon" && a.date === inv.date && (written || a.kind !== "total"));

  // Pièces déjà entrées au stock dans les 45 jours avant la facture : chaque entrée ne sert qu'une fois.
  const pool = (sup?.received ?? [])
    .filter(([date]) => Date.parse(inv.date) - Date.parse(date) <= 45 * DAY && date <= inv.date)
    .map(([date, key, qty, unit]) => ({ date, key, qty, unit }));
  const lines: PasteLine[] = inv.lines.map((l) => {
    const p = partOf(l.name);
    let doneQty = 0;
    for (const r of pool) {
      if (r.key !== p.key || r.unit !== l.unit || !r.qty || doneQty >= l.qty) continue;
      const take = Math.min(r.qty, l.qty - doneQty);
      r.qty -= take;
      doneQty += take;
    }
    const hit = partForSale(shop.products, p.label, kindOf);
    const fromSup = lastPrice(sup, p.key, inv.date);
    const before = fromSup ? { ...fromSup, from: "fournisseur" as const } : hit.product?.cost ? { unit: hit.product.cost, from: "stock" as const } : undefined;
    const change = !before ? "nouvelle" : l.unit > before.unit ? "hausse" : l.unit < before.unit ? "baisse" : "pareil";
    return {
      key: p.key, label: p.label, raw: l.name, qty: l.qty, unit: l.unit, sub: l.sub,
      ...(before ? { before } : {}), change, doneQty, newQty: l.qty - doneQty,
      ...(hit.product ? { productId: hit.product.id, productName: hit.product.name, ...(hit.product.cost !== undefined ? { oldCost: hit.product.cost } : {}) } : hit.choices ? { choices: hit.choices.length } : {}),
    };
  });
  const sum = lines.reduce((a, l) => a + l.sub, 0);
  const priceEffect = lines.reduce((a, l) => a + (l.before && l.change !== "pareil" ? (l.unit - l.before.unit) * l.qty : 0), 0);
  const newAmount = lines.reduce((a, l) => a + l.newQty * l.unit, 0);
  const sig = invoiceSig(inv);
  const seen = sup?.pasted?.filter((x) => x.sig === sig).pop();
  return { ...(seen ? { already: { at: seen.at, ...(seen.paid ? { paid: seen.paid } : {}) } } : {}), sig, date: inv.date, total: inv.total, written, sum, lines, anomalies, priceEffect, newAmount, invoice: inv };
}

/**
 * Enregistre : les pièces nouvelles cochées entrent au stock (prix d'achat mis à jour si voulu), elles sont notées
 * « reçues » pour ne jamais être remises, et les achats nouveaux entrent dans l'historique du fournisseur.
 */
export function applyPastedInvoice(shop: Shop, supId: string | undefined, res: PasteResult, keys: Set<string>, opts: { updateCost: boolean; paid?: CashSource; now?: Date }, makeId: (p: string) => string): { shop: Shop; added: number; amount: number; paidNow: boolean } {
  const chosen = res.lines.filter((l) => l.newQty > 0 && keys.has(l.key));
  const stock: StockLine[] = chosen.map((l) => ({ key: l.key, label: l.label, qty: l.newQty, unit: l.unit, ...(l.productId ? { productId: l.productId } : {}) }));
  let next = stock.length ? addStockLines(shop, stock, opts, () => makeId("p")) : shop;
  const suppliers = [...(next.suppliers ?? [])];
  let at = supId ? suppliers.findIndex((s) => s.id === supId) : -1;
  if (at < 0) { suppliers.push({ id: makeId("f"), name: res.invoice.who === "Fournisseur" ? "Fournisseur" : res.invoice.who, phone: "" }); at = suppliers.length - 1; }
  const sup = suppliers[at]!;
  const amount = chosen.reduce((a, l) => a + l.newQty * l.unit, 0);
  // Historique : seulement ce qui est nouveau (le reste a déjà été compté à la réception).
  const fresh: ChatInvoice = { ...res.invoice, total: amount, lines: chosen.map((l) => ({ qty: l.newQty, name: l.raw, unit: l.unit, sub: l.newQty * l.unit })) };
  const base: Built = { purchases: sup.purchases ?? [], kinds: sup.kinds ?? [], tiers: sup.tiers ?? [], items: sup.items ?? [], top: sup.top ?? [] };
  const built = amount ? addInvoices(base, [fresh]) : base;
  const cut = iso(new Date(Date.parse(res.date) - 90 * DAY));
  const received = [...(sup.received ?? []).filter(([d]) => d >= cut), ...chosen.map((l) => [res.date, l.key, l.newQty, l.unit] as [string, string, number, number])].slice(-400);
  const historyTo = [sup.historyTo ?? "", res.date].sort().pop()!;
  suppliers[at] = {
    ...sup,
    ...built,
    items: trimItems(built.items, historyTo),
    received,
    ...(sup.purchases?.length || amount ? { historyFrom: sup.historyFrom ?? res.date, historyTo } : {}),
    lastKeys: [...new Set([...(historyTo === sup.historyTo ? sup.lastKeys ?? [] : []), `${res.date}|${res.total}`])],
    anomalies: keepAnomalies(sup.anomalies ?? [], res.anomalies),
  };
  // Empreinte gardée : la même facture recollée est reconnue ; jamais payée deux fois.
  const stamp = (opts.now ?? new Date()).toISOString();
  const before = (sup.pasted ?? []).filter((x) => x.sig === res.sig).pop();
  const paidNow = Boolean(opts.paid && !before?.paid);
  const paid = before?.paid ?? (paidNow ? opts.paid : undefined);
  suppliers[at] = { ...suppliers[at]!, pasted: [...(sup.pasted ?? []).filter((x) => x.sig !== res.sig), { sig: res.sig, at: before?.at ?? stamp, date: res.date, total: res.total, ...(paid ? { paid } : {}) }].slice(-60) };
  next = { ...next, suppliers };
  if (paidNow) next = { ...next, expenses: [...next.expenses, { id: makeId("e"), at: stamp, label: `Facture ${sup.name} du ${res.date.slice(8, 10)}/${res.date.slice(5, 7)}`, amount: res.total, kind: "achat", paidWith: opts.paid! }] };
  return { shop: next, added: chosen.reduce((a, l) => a + l.newQty, 0), amount, paidNow };
}

/** Le message à envoyer au fournisseur : seulement les erreurs de calcul (poli, chiffres exacts). */
export function errorsMessage(res: PasteResult): string {
  const rows = res.anomalies.filter((a) => a.kind === "calcul" || a.kind === "total").map((a) => `- ${a.text.replace(/^\d\d\/\d\d\/\d{4} : /, "")}`);
  if (!rows.length) return "";
  return [`Salam, j'ai vérifié la facture du ${res.date.slice(8, 10)}/${res.date.slice(5, 7)} :`, ...rows, "Tu peux vérifier stp ? Merci."].join("\n");
}

/** Résumé en une phrase (pour l'écran). */
export function pasteSummary(res: PasteResult): string {
  const up = res.lines.filter((l) => l.change === "hausse").length;
  const down = res.lines.filter((l) => l.change === "baisse").length;
  const parts = [`${res.lines.length} ligne${res.lines.length > 1 ? "s" : ""}, ${res.lines.reduce((a, l) => a + l.qty, 0)} pièces`];
  if (up) parts.push(`${up} prix en hausse`);
  if (down) parts.push(`${down} en baisse`);
  if (res.priceEffect) parts.push(`${res.priceEffect > 0 ? "+" : "−"}${fmt(Math.abs(res.priceEffect))} F à cause des prix`);
  return parts.join(" · ");
}
