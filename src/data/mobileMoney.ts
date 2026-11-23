/**
 * Transfert d'argent : la caisse d'un point Wave / Orange Money / Free Money (23/11/2026, demande de Fallou :
 * « une gestion visible et tellement simple pour celui qui fait du transfert »).
 *
 * Un point de transfert a plusieurs « caisses » : les espèces du transfert, et un solde électronique (UV) par opérateur.
 * - Dépôt (le client donne des espèces, l'agent lui envoie) : espèces +, solde de l'opérateur −.
 * - Retrait (l'agent donne des espèces, le client lui envoie) : espèces −, solde +.
 * - Paiement (facture Senelec / Woyofal / SDE, crédit, forfait) : espèces +, solde −.
 * - Recharge (l'agent achète des UV au distributeur) : solde + ; espèces − si payé en espèces.
 * - Versement (l'agent revend des UV au distributeur contre des espèces) : solde −, espèces +.
 * - Commission reçue (versée par l'opérateur) : solde +. Apport / sortie : le patron met ou prend de l'argent.
 * - Comptage : ce que l'agent a vraiment (espèces comptées, solde lu sur le téléphone) ; c'est le nouveau point de départ.
 * La commission de chaque opération est estimée avec les taux réglés par l'agent (son contrat), ou tapée à la main.
 * Les frais pris au client (en espèces) sont aussi un gain. Rien ne touche la caisse ni les ventes de la boutique.
 */
import type { Shop } from "../model.ts";

const DAY = 86_400_000;

export const OPERATORS: Array<{ id: string; label: string }> = [
  { id: "wave", label: "Wave" },
  { id: "om", label: "Orange Money" },
  { id: "free", label: "Free Money" },
  { id: "wizall", label: "Wizall" },
  { id: "emoney", label: "E-Money" },
];
export const CASH = "especes";

export type MmKind = "depot" | "retrait" | "paiement" | "recharge" | "versement" | "commission" | "apport" | "sortie" | "comptage";
export const MM_KINDS: Record<MmKind, string> = {
  depot: "Dépôt",
  retrait: "Retrait",
  paiement: "Paiement (facture, crédit)",
  recharge: "Recharge de mon solde",
  versement: "Versement au distributeur",
  commission: "Commission reçue",
  apport: "Apport (je mets de l'argent)",
  sortie: "Sortie (je prends de l'argent)",
  comptage: "Comptage",
};

export type MmOp = {
  id: string;
  at: string;
  /** Opérateur (wave, om…) ; « especes » pour un comptage, un apport ou une sortie d'espèces. */
  operator: string;
  kind: MmKind;
  amount: number;
  /** Commission gagnée sur cette opération (estimée ou tapée). */
  commission?: number;
  /** Frais pris au client, en espèces. */
  fee?: number;
  /** Recharge : payée en espèces du transfert, ou autrement (banque, poche). */
  source?: "especes" | "autre";
  client?: string;
  phone?: string;
  note?: string;
};

export type MmRates = { depot: number; retrait: number; paiement: number };
export type MmConf = {
  /** Opérateurs utilisés dans ce point, dans l'ordre d'affichage. */
  operators: string[];
  /** Commission en % par opérateur et par opération (contrat de l'agent ; 0 = pas encore réglée). */
  rates: Record<string, MmRates>;
  /** Alerte quand un solde passe sous ce montant. */
  low: Record<string, number>;
};

export const defaultMmConf = (): MmConf => ({ operators: ["wave", "om"], rates: {}, low: {} });
export const mmConf = (shop: Pick<Shop, "mmConf">): MmConf => ({ ...defaultMmConf(), ...(shop.mmConf ?? {}) });
export const operatorLabel = (id: string) => (id === CASH ? "Espèces" : OPERATORS.find((o) => o.id === id)?.label ?? id);

const round5 = (n: number) => Math.round(n / 5) * 5;

/** Commission estimée d'une opération avec les taux réglés (arrondie à 5 F). */
export function commissionFor(conf: MmConf, operator: string, kind: MmKind, amount: number): number {
  if (kind !== "depot" && kind !== "retrait" && kind !== "paiement") return 0;
  const rate = conf.rates[operator]?.[kind] ?? 0;
  return rate > 0 ? round5((amount * rate) / 100) : 0;
}

/** Effet d'une opération sur les espèces et sur le solde de l'opérateur. */
export function effect(op: MmOp): { cash: number; float: number } {
  const a = op.amount;
  const fee = op.fee ?? 0;
  switch (op.kind) {
    case "depot":
    case "paiement":
      return { cash: a + fee, float: -a };
    case "retrait":
      return { cash: -a + fee, float: a };
    case "recharge":
      return { cash: op.source === "autre" ? 0 : -a, float: a };
    case "versement":
      return { cash: a, float: -a };
    case "commission":
      return op.operator === CASH ? { cash: a, float: 0 } : { cash: 0, float: a };
    case "apport":
      return op.operator === CASH ? { cash: a, float: 0 } : { cash: 0, float: a };
    case "sortie":
      return op.operator === CASH ? { cash: -a, float: 0 } : { cash: 0, float: -a };
    default:
      return { cash: 0, float: 0 };
  }
}

/** Du plus ancien au plus récent ; même heure : l'ordre d'enregistrement (la liste est rangée du plus récent au plus ancien). */
const chrono = (ops: MmOp[] | undefined) => [...(ops ?? [])].reverse().sort((a, b) => a.at.localeCompare(b.at));

export type MmBalance = { account: string; label: string; expected: number; base: number | null; baseAt: string | null; low: boolean };

/** Ce qu'il devrait y avoir dans chaque caisse : dernier comptage + toutes les opérations depuis. */
export function mmBalances(shop: Pick<Shop, "mm" | "mmConf">): MmBalance[] {
  const conf = mmConf(shop);
  const ops = chrono(shop.mm);
  const accounts = [CASH, ...conf.operators];
  return accounts.map((account) => {
    let base: number | null = null;
    let baseAt: string | null = null;
    let expected = 0;
    for (const op of ops) {
      if (op.kind === "comptage") {
        if (op.operator === account) {
          base = op.amount;
          baseAt = op.at;
          expected = op.amount;
        }
        continue;
      }
      const e = effect(op);
      if (account === CASH) expected += e.cash;
      else if (op.operator === account) expected += e.float;
    }
    const lowAt = conf.low[account] ?? 0;
    return { account, label: operatorLabel(account), expected, base, baseAt, low: base !== null && lowAt > 0 && expected < lowAt };
  });
}

/** Un point qui n'a jamais compté ses caisses : les soldes affichés ne veulent rien dire. */
export const needsFirstCount = (shop: Pick<Shop, "mm" | "mmConf">) => mmBalances(shop).some((b) => b.base === null);

export type MmDay = {
  count: number;
  depots: number;
  retraits: number;
  paiements: number;
  commissions: number;
  fees: number;
  gain: number;
  byOperator: Array<{ operator: string; label: string; count: number; depots: number; retraits: number; paiements: number; commissions: number }>;
};

/** Résumé d'une période (par défaut aujourd'hui). */
export function mmSummary(shop: Pick<Shop, "mm" | "mmConf">, from: Date, to: Date): MmDay {
  const ops = (shop.mm ?? []).filter((o) => {
    const t = Date.parse(o.at);
    return t >= from.getTime() && t < to.getTime() && o.kind !== "comptage";
  });
  const conf = mmConf(shop);
  const by = new Map<string, MmDay["byOperator"][number]>();
  for (const id of conf.operators) by.set(id, { operator: id, label: operatorLabel(id), count: 0, depots: 0, retraits: 0, paiements: 0, commissions: 0 });
  let depots = 0, retraits = 0, paiements = 0, commissions = 0, fees = 0, count = 0;
  for (const o of ops) {
    if (o.kind === "depot" || o.kind === "retrait" || o.kind === "paiement") {
      count += 1;
      const line = by.get(o.operator) ?? { operator: o.operator, label: operatorLabel(o.operator), count: 0, depots: 0, retraits: 0, paiements: 0, commissions: 0 };
      line.count += 1;
      if (o.kind === "depot") (line.depots += o.amount), (depots += o.amount);
      if (o.kind === "retrait") (line.retraits += o.amount), (retraits += o.amount);
      if (o.kind === "paiement") (line.paiements += o.amount), (paiements += o.amount);
      line.commissions += o.commission ?? 0;
      by.set(o.operator, line);
    }
    commissions += o.kind === "commission" ? 0 : o.commission ?? 0;
    fees += o.fee ?? 0;
  }
  return { count, depots, retraits, paiements, commissions, fees, gain: commissions + fees, byOperator: [...by.values()] };
}

export const dayBounds = (now = new Date()) => {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return { from, to: new Date(from.getTime() + DAY) };
};

/** Gain du transfert (commissions estimées + frais) sur une période : il entre dans les Bénéfices. */
export const mmGain = (shop: Pick<Shop, "mm" | "mmConf">, from: Date, to: Date) => mmSummary(shop, from, to).gain;

/** Ajoute une opération ; la commission est estimée si elle n'est pas tapée. */
export function addMmOp(shop: Shop, input: Omit<MmOp, "id" | "at"> & { at?: string }, makeId: () => string, now = new Date()): Shop {
  const conf = mmConf(shop);
  const amount = Math.max(0, Math.round(input.amount));
  const commission = input.commission !== undefined ? Math.max(0, Math.round(input.commission)) : commissionFor(conf, input.operator, input.kind, amount);
  const op: MmOp = {
    id: makeId(),
    at: input.at ?? now.toISOString(),
    operator: input.operator,
    kind: input.kind,
    amount,
    ...(commission ? { commission } : {}),
    ...(input.fee ? { fee: Math.round(input.fee) } : {}),
    ...(input.source ? { source: input.source } : {}),
    ...(input.client?.trim() ? { client: input.client.trim().slice(0, 60) } : {}),
    ...(input.phone?.replace(/\D/g, "") ? { phone: input.phone.replace(/\D/g, "").slice(-9) } : {}),
    ...(input.note?.trim() ? { note: input.note.trim().slice(0, 120) } : {}),
  };
  return { ...shop, mm: [op, ...(shop.mm ?? [])] };
}

/** Avertissement avant une opération : pas assez d'espèces pour un retrait, pas assez de solde pour un dépôt. */
export function mmWarning(shop: Pick<Shop, "mm" | "mmConf">, operator: string, kind: MmKind, amount: number): string | null {
  const bal = mmBalances(shop);
  const cash = bal.find((b) => b.account === CASH);
  const float = bal.find((b) => b.account === operator);
  const f = (n: number) => `${Math.round(n).toLocaleString("fr-FR").replace(/[  ]/g, " ")} F`;
  if (kind === "retrait" && cash && cash.base !== null && amount > cash.expected) {
    return `Il te reste environ ${f(cash.expected)} en espèces : pas assez pour ce retrait de ${f(amount)}.`;
  }
  if ((kind === "depot" || kind === "paiement" || kind === "versement") && float && float.base !== null && amount > float.expected) {
    return `Ton solde ${float.label} est d'environ ${f(float.expected)} : pas assez pour ${f(amount)}. Recharge d'abord.`;
  }
  return null;
}

/**
 * Clôture : ce que l'agent compte vraiment. Chaque caisse comptée devient un comptage (nouveau départ),
 * et l'écart (compté − attendu) est rendu : + = en trop, − = il manque.
 */
export function closeMm(shop: Shop, counted: Record<string, number>, makeId: () => string, now = new Date()): { shop: Shop; gaps: Array<{ account: string; label: string; expected: number; counted: number; gap: number; first: boolean }> } {
  const bal = mmBalances(shop);
  let next = shop;
  const gaps: Array<{ account: string; label: string; expected: number; counted: number; gap: number; first: boolean }> = [];
  for (const b of bal) {
    const c = counted[b.account];
    if (c === undefined || !Number.isFinite(c) || c < 0) continue;
    gaps.push({ account: b.account, label: b.label, expected: b.expected, counted: c, gap: b.base === null ? 0 : c - b.expected, first: b.base === null });
    next = addMmOp(next, { operator: b.account, kind: "comptage", amount: c }, makeId, now);
  }
  return { shop: next, gaps };
}

/** Écart du dernier comptage de chaque caisse (pour l'avis sur la pastille). */
export function lastGaps(shop: Pick<Shop, "mm" | "mmConf">): Array<{ account: string; label: string; gap: number; at: string }> {
  const ops = chrono(shop.mm);
  const out = new Map<string, { account: string; label: string; gap: number; at: string }>();
  const running = new Map<string, number | null>();
  for (const op of ops) {
    if (op.kind === "comptage") {
      const before = running.get(op.operator);
      if (before !== undefined && before !== null) out.set(op.operator, { account: op.operator, label: operatorLabel(op.operator), gap: op.amount - before, at: op.at });
      running.set(op.operator, op.amount);
      continue;
    }
    const e = effect(op);
    const c = running.get(CASH);
    if (c !== undefined && c !== null) running.set(CASH, c + e.cash);
    const f = running.get(op.operator);
    if (op.operator !== CASH && f !== undefined && f !== null) running.set(op.operator, f + e.float);
  }
  return [...out.values()];
}

/**
 * Opération dite ou écrite : « dépôt Wave 25 000 pour Moussa », « retrait OM 10 000 », « paiement Woyofal 5 000 »,
 * « recharge Wave 200 000 », « commission Orange Money 3 500 ». null = ce n'est pas une opération de transfert.
 */
export function mmFromText(text: string, amount: number | null): { kind: MmKind; operator: string | null; amount: number | null; client?: string; fee?: number } | null {
  const n = ` ${text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, " ")} `;
  const operator = /\bwave\b/.test(n) ? "wave" : /orange\s*money|\bom\b|\borange\b/.test(n) ? "om" : /free\s*money|\bfree\b/.test(n) ? "free" : /\bwizall\b/.test(n) ? "wizall" : /\be.?money\b|\bexpresso\b/.test(n) ? "emoney" : null;
  let kind: MmKind | null = null;
  if (/\b(depot|deposer|depose|cash in|envoi|envoye|envoyer|transfert)\b/.test(n)) kind = "depot";
  if (/\b(retrait|retire|retirer|cash out)\b/.test(n)) kind = "retrait";
  if (/\b(woyofal|senelec|sde|sen eau|facture|seddo|izi|forfait|canal|rapido|peage)\b/.test(n) || (/\bpaiement\b/.test(n) && !kind)) kind = "paiement";
  if (/\b(recharge|recharger|approvisionn|j ai achete des uv|achat uv|achat d uv)\b/.test(n) && !/\bcredit\b/.test(n)) kind = "recharge";
  if (/\b(versement|destock|rebalanc|vendu des uv|vente uv)\b/.test(n)) kind = "versement";
  if (/\bcommission\b/.test(n) && /\b(recu|reçu|versee|payee|tombee|est tombe)\b/.test(n)) kind = "commission";
  if (!kind) return null;
  // Un dépôt / retrait sans opérateur n'est pas une opération de transfert sûre (« dépôt d'un iPhone » = réparation).
  if (!operator && (kind === "depot" || kind === "retrait" || kind === "recharge" || kind === "versement" || kind === "commission")) return null;
  const fee = n.match(/\bfrais (?:de )?(\d[\d\s]*)/);
  const client = text.match(/\b(?:pour|à|a|de)\s+([A-ZÀ-Ý][\p{L}'-]{2,}(?:\s+[A-ZÀ-Ý][\p{L}'-]{2,})?)/u)?.[1];
  return { kind, operator, amount, ...(client && !/^(Wave|Orange|Free|Woyofal|Senelec)$/i.test(client) ? { client } : {}), ...(fee ? { fee: Number(fee[1]!.replace(/\D/g, "")) } : {}) };
}
