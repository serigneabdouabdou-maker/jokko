import { extractSpokenAmount, francsToWolof, readFrenchNumber, readWolofNumber, spokenAmountToFrancs, wolofNumber } from "../assistant/wolofNumbers";
import { MEASURES, type NewCouture } from "./couture";

/**
 * Commande de couture dite à la voix (wolof ou français) → commande prête à enregistrer.
 * Gemini ne fait que recopier les mots du tailleur dans des cases ; c'est ce code qui lit
 * les montants (en dërëm, comme au comptoir), les mesures (en centimètres, jamais en dërëm) et la date.
 */
export type SpokenCouture = {
  clientName?: string;
  telephone?: string;
  habit?: string;
  tissu?: string;
  /** Mesures dites, par case (« poitrine » → « ñeent-fukk ak juróom » ou « 45 »). */
  mesures?: Record<string, unknown>;
  prixDit?: string;
  avanceDit?: string;
  /** Jour promis tel que dit (« gaawu », « samedi », « Tabaski »…). */
  jour?: string;
  delaiJours?: number;
  remarque?: string;
};

export type ReadCouture = {
  input: NewCouture;
  /** Ce que le code n'a pas pu lire : le tailleur le complète (ou Jokko le redemande). */
  unclear: string[];
};

const KEYS = new Set(MEASURES.map((m) => m.key));
const text = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : typeof v === "number" ? String(v) : "");

/** Un montant dit (« ñaari junni » = 10 000 F ; « 25 000 », « vingt-cinq mille »). */
export function spokenMoney(said: string): number | null {
  const t = said.trim();
  if (!t) return null;
  const hit = spokenAmountToFrancs(t) ?? extractSpokenAmount(t);
  return hit && hit.francs > 0 ? hit.francs : null;
}

/** Une mesure en centimètres : « 45 », « 45,5 », « quarante-cinq », « ñeent-fukk ak juróom » (45). Jamais en dërëm. */
export function spokenCm(said: unknown): number | null {
  if (typeof said === "number") return said > 0 && said <= 300 ? Math.round(said * 2) / 2 : null;
  const t = text(said).toLowerCase();
  if (!t) return null;
  const digits = t.match(/\d+(?:[.,]\d+)?/);
  let n: number | null = digits ? Number(digits[0].replace(",", ".")) : readWolofNumber(t) ?? readFrenchNumber(t);
  // « ak genn-wàll » / « et demi » = ,5
  if (n !== null && /\b(?:genn[\s-]?w[aà]ll|et demi|demi)\b/.test(t) && Number.isInteger(n)) n += 0.5;
  return n !== null && n > 0 && n <= 300 ? Math.round(n * 2) / 2 : null;
}

const WEEKDAYS: Array<[RegExp, number]> = [
  [/\b(?:dibeer|dimanche)\b/, 0],
  [/\b(?:altine|lundi)\b/, 1],
  [/\b(?:talaata|mardi)\b/, 2],
  [/\b(?:allarba|mercredi)\b/, 3],
  [/\b(?:alxames|alkhames|jeudi)\b/, 4],
  [/\b(?:ajjuma|ajuma|vendredi)\b/, 5],
  [/\b(?:gaawu|gaaw|samedi)\b/, 6],
];

/** Date promise : un jour de la semaine (le prochain), « demain », « ëllëg », ou un nombre de jours. AAAA-MM-JJ, ou undefined. */
export function spokenDue(jour: string, delaiJours?: number, now = new Date()): string | undefined {
  const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  // Sans accents : « ëllëg » → « elleg », « àjjuma » → « ajjuma » (les \b ne voient pas les lettres accentuées).
  const t = jour.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/\b(?:demain|elleg)\b/.test(t)) return day(new Date(base.getTime() + 86_400_000));
  const week = /\b(?:semaine prochaine|ayu[- ]?bes bi ci topp)\b/.test(t) ? 7 : 0;
  for (const [pattern, wd] of WEEKDAYS) {
    if (!pattern.test(t)) continue;
    // Le prochain jour de ce nom (aujourd'hui samedi + « gaawu » = samedi prochain).
    const ahead = (wd - base.getDay() + 7) % 7 || 7;
    return day(new Date(base.getTime() + ahead * 86_400_000));
  }
  if (typeof delaiJours === "number" && delaiJours > 0 && delaiJours <= 365) return day(new Date(base.getTime() + Math.round(delaiJours) * 86_400_000));
  if (week) return day(new Date(base.getTime() + 7 * 86_400_000));
  return undefined;
}

/** Lit toute la commande dite. Rien n'est inventé : ce qui n'est pas clair va dans unclear. */
export function readSpokenCouture(raw: SpokenCouture, now = new Date()): ReadCouture {
  const unclear: string[] = [];
  const measures: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw.mesures ?? {})) {
    if (!KEYS.has(key) || !text(value)) continue;
    const cm = spokenCm(value);
    if (cm === null) unclear.push(MEASURES.find((m) => m.key === key)?.label ?? key);
    else measures[key] = cm;
  }
  const priceSaid = text(raw.prixDit);
  const advanceSaid = text(raw.avanceDit);
  const price = priceSaid ? spokenMoney(priceSaid) : null;
  const advance = advanceSaid ? spokenMoney(advanceSaid) : null;
  if (priceSaid && price === null) unclear.push("le prix");
  if (advanceSaid && advance === null) unclear.push("l'avance");
  if (price !== null && advance !== null && advance > price) unclear.push("l'avance (plus grande que le prix)");
  const jour = text(raw.jour);
  const dueAt = spokenDue(jour, raw.delaiJours, now);
  const phone = text(raw.telephone).replace(/\D/g, "").replace(/^(?:00)?221/, "");
  return {
    input: {
      clientName: text(raw.clientName),
      phone: phone.length === 9 ? phone : "",
      garment: text(raw.habit),
      fabric: text(raw.tissu),
      measures,
      price: price ?? 0,
      advance: advance !== null && (price === null || advance <= price) ? advance : 0,
      dueAt,
      note: [text(raw.remarque), jour && dueAt ? "" : jour].filter(Boolean).join(" · "),
    },
    unclear,
  };
}

/** Ce qui manque pour enregistrer : le client et le modèle. */
export function missingForOrder(input: NewCouture): string | null {
  if (!input.clientName.trim()) return "le nom du client";
  if (!input.garment.trim()) return "le modèle de l'habit (grand boubou, taille basse…)";
  return null;
}

const WOLOF_DAYS = ["dibéer", "altine", "talaata", "àllarba", "alxames", "àjjuma", "gaawu"];
const FRENCH_DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

/**
 * La commande lue à voix haute après l'enregistrement (une seule phrase = une seule voix claire),
 * pour le tailleur qui ne lit pas : il vérifie à l'oreille. Montants en dërëm en wolof, en francs en français.
 */
export function coutureSummary(o: { number: string; clientName: string; garment: string; price: number; paid: number; dueAt?: string }, lang: string, now = new Date()): string {
  const n = Number(o.number.replace(/\D/g, "")) || 0;
  const rest = Math.max(0, o.price - o.paid);
  const due = o.dueAt ? new Date(`${o.dueAt}T12:00:00`) : null;
  const soon = due ? Math.round((due.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12).getTime()) / 86_400_000) : null;
  const F = (x: number) => `${x.toLocaleString("fr-FR").replace(/[  ]/g, " ")} francs`;
  if (lang === "fr") {
    const day = due && soon !== null && soon >= 0 && soon < 7 ? FRENCH_DAYS[due.getDay()] : due ? due.toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) : "";
    return [
      `C'est noté, commande numéro ${n}, ${o.clientName}, ${o.garment}`,
      o.price ? `prix ${F(o.price)}` : "",
      o.paid ? `avance ${F(o.paid)}` : "",
      o.price ? `reste ${rest ? F(rest) : "rien"}` : "",
      day ? `prêt pour ${day}` : "",
    ].filter(Boolean).join(", ") + ".";
  }
  const day = due && soon !== null && soon >= 0 && soon < 7 ? WOLOF_DAYS[due.getDay()] : "";
  return [
    `Bind naa ko, nimero ${wolofNumber(n)}, ${o.clientName}, ${o.garment}`,
    o.price ? `njëg li ${francsToWolof(o.price)}` : "",
    o.paid ? `avance bi ${francsToWolof(o.paid)}` : "",
    o.price ? (rest ? `des na ${francsToWolof(rest)}` : "des na dara") : "",
    day ? `dina pare ${day}` : "",
  ].filter(Boolean).join(", ") + ".";
}
