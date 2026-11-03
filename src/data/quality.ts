import type { Lang } from "../model.ts";

/**
 * Cahier des erreurs de Jokko : chaque action comptée, chaque annulation et chaque « Jokko s'est trompé » noté,
 * séparés entre wolof et français. Ici : deviner la langue de la phrase dite (fonction pure, testée).
 */

export type QualityKind = "action" | "annule" | "signale";

/** Mots très fréquents en wolof de boutique, qu'on ne trouve pas en français. */
const WOLOF = new Set([
  "naa", "nga", "na", "nanu", "ngeen", "nañu", "dafa", "dama", "danga", "dañu", "jaay", "jaayal", "jënd", "jend", "ak", "bi", "yi", "ba", "gi", "gu",
  "ci", "ñaar", "naar", "ñett", "nett", "ñent", "nent", "juroom", "fukk", "temeer", "junni", "dërëm", "derem", "benn", "ken", "dara", "am", "amul",
  "fey", "fay", "bor", "boroom", "xaalis", "kilo", "diw", "diwu", "ceeb", "suukar", "soow", "mburu", "oto", "togg", "lekk", "dem", "dafay", "def",
  "waaw", "deedeet", "déedéet", "lan", "lu", "nan", "yépp", "yepp", "rekk", "tey", "démb", "demb", "ëllëg", "elleg", "sama", "sa", "seen", "mu", "ñu",
  "jox", "jël", "jel", "wacc", "yokk", "mbuus", "pakk", "paket", "bidon", "liitar", "nit", "doom", "jigéen", "goor", "moom", "wax", "xam",
]);

const FRENCH = new Set([
  "j'ai", "jai", "vendu", "vends", "acheté", "achete", "le", "la", "les", "des", "du", "un", "une", "de", "et", "pour", "il", "elle", "doit", "payé",
  "paye", "sac", "sacs", "litre", "litres", "francs", "mille", "cent", "deux", "trois", "quatre", "cinq", "dix", "client", "dette", "dépense", "huile", "riz", "sucre",
]);

const words = (text: string) =>
  text.toLowerCase().normalize("NFC").replace(/[^\p{L}\p{N}'’ ]+/gu, " ").replace(/’/g, "'").split(/\s+/).filter(Boolean);

/** La langue de la phrase : wolof si les mots wolof dominent, français sinon ; à défaut, la langue de l'appli. */
export function guessLang(text: string, fallback: Lang): "wo" | "fr" {
  let wo = 0;
  let fr = 0;
  for (const w of words(text)) {
    if (WOLOF.has(w)) wo += 1;
    else if (FRENCH.has(w)) fr += 1;
  }
  if (wo === 0 && fr === 0) return fallback === "wo" ? "wo" : "fr";
  return wo >= fr ? "wo" : "fr";
}

export type LangStat = { lang: "wo" | "fr"; actions: number; annule: number; signale: number };

/** Taux d'erreur (en %) : (annulations + signalements) / actions, arrondi à 0,1. */
export function errorRate(s: Pick<LangStat, "actions" | "annule" | "signale">): number | null {
  if (s.actions <= 0) return null;
  return Math.round(((s.annule + s.signale) / s.actions) * 1000) / 10;
}
