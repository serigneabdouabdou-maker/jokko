/**
 * Services dictés (demande de Fallou, 13/11/2026) : « bâche 2 sur 1,5 pour Moussa », « 50 photocopies »,
 * « flocage 20 maillots », « bâche 3 sur 2 à 4 000 le mètre carré ».
 * Le code lit les mesures et les quantités, puis fait le calcul (2 × 1,5 = 3 m² × 5 000 F = 15 000 F) :
 * jamais Gemini. S'il manque les mesures d'un service au m², Jokko les demande au lieu de deviner.
 */
import type { Sale, ServiceItem, Shop } from "../model.ts";
import { pickByName } from "../assistant/wolofNames.ts";
import { moneyAmountsSaid } from "../assistant/wolofNumbers.ts";
import { sellService, servicesOf, UNIT_WORDS } from "./services.ts";

const WORDS: Record<string, number> = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10,
  onze: 11, douze: 12, quinze: 15, vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60, cent: 100,
};
const METRE = new Set(["m", "metre", "metres", "mettre", "mètre"]);
const SEP = new Set(["sur", "x", "fois", "par"]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/²/g, "2")
    .replace(/×|\*/g, " x ")
    .replace(/(\d)\s*x\s*(\d)/g, "$1 x $2")
    .replace(/(\d)\s*m\s*2\b/g, "$1 m2 ")
    .replace(/(\d)\s*cm\b/g, "$1 cm ")
    .replace(/(\d)\s*m(?!2\b)(?=\d|\b)/g, "$1 m ")
    .replace(/[’'"«»()]/g, " ")
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/[^a-z0-9.\s-]/g, " ")
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

const num = (t: string | undefined): number | null => {
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  return t in WORDS ? WORDS[t] : null;
};

/** Une longueur à partir du mot i : « 2 », « 1.5 », « 1 m 50 », « un metre cinquante », « 2 et demi », « 150 cm ». */
function readLength(t: string[], start: number): { value: number; end: number } | null {
  let i = start;
  let v = num(t[i]);
  if (v === null) return null;
  i++;
  if (t[i] === "virgule" && num(t[i + 1]) !== null) {
    const d = t[i + 1];
    v = Number(`${v}.${/^\d+$/.test(d) ? d : num(d)}`);
    i += 2;
  }
  if (t[i] && METRE.has(t[i])) {
    i++;
    // « 1 m 50 » = 1,50 m ; « 1m5 » = 1,5 m ; « un mètre cinquante » = 1,50 m.
    const n = num(t[i]);
    if (n !== null && Number.isInteger(n) && n < 100 && !METRE.has(t[i + 1] ?? "")) {
      v += /^\d$/.test(t[i]) ? n / 10 : n / 100;
      i++;
    }
  } else if (t[i] === "cm") {
    v /= 100;
    i++;
  }
  if (t[i] === "et" && (t[i + 1] === "demi" || t[i + 1] === "demie")) {
    v += 0.5;
    i += 2;
  }
  return { value: Math.round(v * 100) / 100, end: i };
}

/** Mesures dites « largeur sur hauteur » (en mètres), ou null. */
export function readSize(text: string): { w: number; h: number } | null {
  const t = tokens(text);
  for (let i = 0; i < t.length; i++) {
    const a = readLength(t, i);
    if (!a || !SEP.has(t[a.end] ?? "")) continue;
    const b = readLength(t, a.end + 1);
    if (!b) continue;
    if (a.value > 0 && b.value > 0 && a.value <= 100 && b.value <= 100) return { w: a.value, h: b.value };
  }
  return null;
}

/** Mots qui comptent une unité de service : « 50 pages », « 20 maillots », « 3 m2 ». */
const COUNT_WORDS: Record<string, RegExp> = {
  page: /^(pages?|feuilles?|copies?|photocopies?|exemplaires?|impressions?|recto)$/,
  piece: /^(pieces?|maillots?|t|tshirts?|tee|polos?|cartes?|exemplaires?|fois|lots?|unites?|habits?|tenues?|casquettes?)$/,
  metre: /^(m|metres?|mettres?)$/,
  m2: /^(m2|metres? ?carres?)$/,
  fois: /^fois$/,
};

/** Quantité dite juste avant le mot de l'unité (« 50 pages », « 3 m2 », « 3 mètres carrés »), ou null. */
export function readCount(text: string, unit: keyof typeof COUNT_WORDS): number | null {
  const t = tokens(text);
  for (let i = 0; i < t.length - 1; i++) {
    const n = num(t[i]);
    if (n === null || n <= 0) continue;
    const next = t[i + 1];
    if (unit === "m2") {
      if (next === "m2" || ((next === "m" || /^metres?$/.test(next)) && /^carres?$/.test(t[i + 2] ?? ""))) return n;
      continue;
    }
    if (COUNT_WORDS[unit].test(next) && !(unit === "metre" && /^carres?$/.test(t[i + 2] ?? ""))) return n;
  }
  // « 50 photocopies » sans autre mot : le mot du service compte (« photocopie », « impression »).
  if (unit === "page") {
    for (let i = 0; i < t.length - 1; i++) {
      const n = num(t[i]);
      if (n !== null && n > 0 && /^(photocopies?|impressions?|scans?|copies?)$/.test(t[i + 1])) return n;
    }
  }
  return null;
}

/** Le montant dit est-il celui d'UNE unité (« à 4 000 le mètre carré », « 2 500 le maillot », « chacun ») ? */
export function saysEach(text: string): boolean {
  const t = tokens(text).join(" ");
  return /\b(le|la|l|par|chaque)\s+(m2|m|metre|metres|page|copie|piece|maillot|t shirt|tshirt|polo|unite|feuille|carte)\b|\bchacun|\bchacune|\bbu nekk|\bmetre carre\b/.test(t);
}

export type ServiceVoice =
  | { kind: "none" }
  | { kind: "need"; besoin: string }
  | { kind: "sale"; shop: Shop; sale: Sale; service: ServiceItem; qty: number; summary: string; calcul: string; amount: number };

const money = (n: number) => `${Math.round(n).toLocaleString("fr-FR").replace(/[  ]/g, " ")} F`;
const dec = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

/**
 * Une vente dictée est-elle un service du catalogue ? Si oui, le code fait le calcul et l'encaisse.
 * - said : le nom dit (« bâche ») ; text : toute la phrase entendue (mesures, quantités, prix).
 * - Un article du stock reconnu passe avant, sauf s'il est la matière du service (bâche en rouleau, flex)
 *   ou un article à prix 0 (matière seulement).
 */
export function serviceFromVoice(
  shop: Shop,
  input: { said: string; text: string; productId?: string | null; quantity?: number | null; unit?: string | null; amount?: number | null; unitPrice?: number | null; clientId?: string | null },
): ServiceVoice {
  const list = servicesOf(shop);
  const said = input.said.trim();
  if (!list.length || !said) return { kind: "none" };
  const pick = pickByName(list, said);
  if (pick.ambiguous.length > 1) {
    return { kind: "need", besoin: `de savoir lequel : ${pick.ambiguous.slice(0, 3).map((s) => s.name).join(" ou ")}` };
  }
  const service = pick.item;
  if (!service) return { kind: "none" };
  if (input.productId) {
    const product = shop.products.find((p) => p.id === input.productId);
    const isMatter = service.matter?.productId === input.productId || (product !== undefined && !(product.price > 0));
    if (!isMatter) return { kind: "none" };
  }
  const text = `${input.text} ${said}`;
  const unit = service.unit ?? "fois";
  const given = input.quantity !== null && input.quantity !== undefined && Number.isFinite(input.quantity) && input.quantity > 0 ? input.quantity : null;
  let size: { w: number; h: number } | undefined;
  let qty = 1;
  if (unit === "m2") {
    size = readSize(text) ?? undefined;
    const area = size ? null : readCount(text, "m2") ?? (given && /m2|m²|carr/i.test(input.unit ?? "") ? given : null);
    if (!size && !area) {
      return { kind: "need", besoin: `les mesures (${service.name}) : largeur sur hauteur, en mètres, par exemple « 2 sur 1,5 »` };
    }
    qty = size ? Math.round(size.w * size.h * 100) / 100 : (area as number);
  } else if (unit !== "fois") {
    qty = readCount(text, unit) ?? given ?? 1;
  } else {
    qty = given ?? 1;
  }

  // Prix spécial dit : le montant entendu, relu dans la phrase (jamais le calcul du modèle).
  const said$ = moneyAmountsSaid(input.text);
  let amount: number | undefined;
  let each = service.price;
  if (said$.length) {
    const heard = input.amount && said$.includes(input.amount) ? input.amount : input.unitPrice && said$.includes(input.unitPrice) ? input.unitPrice : Math.max(...said$);
    if (unit !== "fois" && (saysEach(input.text) || (input.unitPrice && input.unitPrice === heard))) each = heard;
    else amount = heard;
  }
  const total = amount ?? Math.round(each * qty);
  if (!(total > 0)) return { kind: "need", besoin: `le prix de ${service.name} (il est à 0 dans tes services)` };
  const done = sellService(shop, { name: service.name, service, amount: total, ...(size ? { size } : { qty }), clientId: input.clientId ?? undefined });
  if (!done) return { kind: "none" };
  const words = UNIT_WORDS[unit];
  const calcul = amount !== undefined || unit === "fois"
    ? money(total)
    : `${size ? `${dec(size.w)} × ${dec(size.h)} = ` : ""}${dec(qty)} ${qty > 1 ? words.many : words.one} × ${money(each)} = ${money(total)}`;
  const cost = done.sale.cost;
  const summary = `${done.sale.label} · ${money(total)}${cost !== undefined ? ` · bénéfice ${money(total - cost)}` : ""}`;
  return { kind: "sale", shop: done.shop, sale: done.sale, service, qty, summary, calcul, amount: total };
}
