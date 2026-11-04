/**
 * Retrouver un article ou un client d'après ce que le commerçant a dit (wolof, français, écritures variées).
 * Sorti de liveDesk.ts pour être testé seul (banc d'essai wolof : wolofExamen.test.ts).
 */
import { sameSound } from "./wolofSpelling";

export const UNITS = new Set(["sac", "sacs", "bidon", "bidons", "paquet", "paquets", "kilo", "kilos", "kg", "pot", "pots", "boite", "boites", "piece", "pieces", "litre", "litres", "carton", "cartons", "bouteille"]);

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
  // Ajouts du 04/11/2026 : produits du lexique validé par le patron (wolofLexicon.ts), + écritures courantes.
  arachide: ["gerte", "guerte"],
  mil: ["dugub", "dougoub", "sanqal", "sankhal", "araw"],
  maïs: ["mbóq", "mboq", "mbokh"],
  niébé: ["ñebbe", "niebe", "gnebe"],
  farine: ["farin"],
  pâtes: ["makaroni", "macaroni"],
  biscuit: ["biskit"],
  bissap: ["bisaab"],
  "pain de singe": ["buy", "bouye"],
  ail: ["laay"],
  tomate: ["tamaate"],
  poivre: ["poobar"],
  bouillon: ["maggi", "jumbo"],
  poulet: ["ganaar", "ganar"],
  oeuf: ["nen", "nenn"],
  lessive: ["omo"],
  allumettes: ["almet"],
  piles: ["pil"],
  charbon: ["kerën", "keren"],
  gaz: ["gaas"],
  bougie: ["bugi"],
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
    if (words.some((w) => hw.some((x) => sameSound(w, x)))) return true;
  }
  return false;
}

/**
 * Retrouve un client ou un article d'après le nom entendu, en prenant le MEILLEUR nom, pas le premier.
 * Si deux noms se valent (« Awa » pour Awa Diop et Awa Fall), renvoie les deux pour que Jokko demande lequel.
 */
/** Mots wolof qui précisent un article (« diwu oto » = huile moteur, « diwu togg » = huile de cuisine). */
const MODIFIERS: Record<string, string[]> = {
  oto: ["moteur", "voiture", "auto"],
  moto: ["moteur", "moto"],
  togg: ["cuisine"],
  lekk: ["cuisine"],
};

/**
 * Ce qu'a dit le commerçant, enrichi des mots français équivalents : « diwu oto » → « diwu oto huile moteur ».
 * (wolof → nom du stock grâce aux synonymes ; « diwu », « ceebu » : on retire le « u » de liaison.)
 */
export function expandHeard(heard: string): string {
  const h = plain(heard);
  const words = h.split(" ").filter(Boolean);
  const extra: string[] = [];
  for (const w of words) {
    const bases = [w, w.length > 3 && w.endsWith("u") ? w.slice(0, -1) : w];
    for (const [fr, wo] of Object.entries(SYNONYMS)) if (bases.some((b) => wo.some((x) => sameSound(x, b)))) extra.push(plain(fr));
    for (const b of bases) if (MODIFIERS[b]) extra.push(...MODIFIERS[b]);
  }
  return extra.length ? `${h} ${extra.join(" ")}` : h;
}

/**
 * Prénoms et noms sénégalais : écriture française (celle du cahier) ↔ écriture wolof (celle que Gemini peut entendre).
 * `wolofKey` unit déjà Fatou = Faatu, Ndiaye = Njaay, Diop = Jóob, Diouf = Juuf, Thiam = Caam, Gueye = Géy, Ousmane = Usmaan.
 * Ici, seulement les paires qu'aucune règle ne peut rapprocher. Noms fréquents relevés dans MasakhaNER (wolof), 04/11/2026.
 */
const NAME_VARIANTS: string[][] = [
  ["cheikh", "cheikhou", "cheick", "seex", "sheikh"], ["abdoulaye", "ablaye", "ablaay", "abdulaay", "laye"],
  ["moustapha", "mustafa", "mustafaa", "tapha"], ["ibrahima", "ibraayima", "ibra"], ["idrissa", "idiriisa"],
  ["khady", "xadi", "khadija"], ["coumba", "kumba"], ["cisse", "siise", "sise"], ["seck", "sekk"], ["diagne", "jaan", "jaañ"],
  ["niang", "nan", "ñaŋ"], ["aliou", "aliw"], ["daouda", "dawuda", "daawuda"], ["thioune", "cuun"], ["diatta", "jaata"],
  ["pape", "paap", "paab"], ["baye", "baay"], ["mamour", "maamur"], ["ndoye", "ndooy", "ndóoy"], ["khalifa", "xalifa"],
  ["cheikhouna", "seexuna"], ["mariama", "mareem", "mariame"], ["astou", "astu"], ["rokhaya", "roxaya", "roki"],
];

/** Deux mots du nom sont-ils le même nom ? (même son, ou même famille d'écritures ci-dessus) */
function alike(a: string, b: string): boolean {
  if (a.length < 3 || b.length < 3) return a === b;
  if (sameSound(a, b)) return true;
  return NAME_VARIANTS.some((g) => g.some((x) => sameSound(x, a)) && g.some((x) => sameSound(x, b)));
}

export type Named = { id: string; name: string; aliases?: string[] };
const namesOf = (item: Named) => [item.name, ...(item.aliases ?? [])].filter((n) => n && n.trim());

export function pickByName<T extends Named>(items: T[], heard: string): { item?: T; ambiguous: T[] } {
  const h = expandHeard(heard);
  if (!h) return { ambiguous: [] };
  const raw = plain(heard);
  const hw = h.split(" ").filter((w) => w.length >= 3 && !UNITS.has(w));
  const scoreOne = (name: string) => {
    const k = plain(name);
    const kw = k.split(" ");
    if (k === raw || k === h) return 100;
    if (hw.length && kw.filter((w) => w.length >= 3 && !UNITS.has(w)).every((w) => hw.includes(w))) return 90 + Math.min(kw.length, 5);
    if (hw.length && hw.every((w) => kw.includes(w))) return 80 + Math.min(hw.length, 5);
    if (hw.some((w) => kw.includes(w))) return 60 + hw.filter((w) => kw.includes(w)).length;
    // Même nom écrit autrement (Faatu Njaay = Fatou Ndiaye, Seex = Cheikh)
    const kl = kw.filter((w) => w.length >= 3 && !UNITS.has(w));
    const hits = kl.filter((w) => hw.some((x) => alike(w, x))).length;
    if (kl.length && hits === kl.length) return 75 + Math.min(kl.length, 5);
    if (hits) return 50 + hits;
    return sameName(name, heard) ? 40 : 0;
  };
  const score = (item: T) => Math.max(...namesOf(item).map(scoreOne));
  const ranked = items.map((item) => ({ item, s: score(item) })).filter((r) => r.s > 0).sort((x, y) => y.s - x.s);
  if (!ranked.length) return { ambiguous: [] };
  const top = ranked.filter((r) => r.s === ranked[0].s);
  if (top.length > 1) return { ambiguous: top.map((r) => r.item) };
  return { item: ranked[0].item, ambiguous: [] };
}

/** Le commerçant a-t-il dit un mot qui distingue cet article des autres candidats ? */
export function distinguishes<T extends Named>(item: T, others: T[], heard: string): boolean {
  const hw = new Set(expandHeard(heard).split(" ").filter((w) => w.length >= 3 && !UNITS.has(w)));
  const own = new Set(namesOf(item).flatMap((n) => plain(n).split(" ")).filter((w) => w.length >= 3 && !UNITS.has(w)));
  const theirs = new Set(others.filter((o) => o.id !== item.id).flatMap((o) => namesOf(o).flatMap((n) => plain(n).split(" "))));
  return [...own].some((w) => hw.has(w) && !theirs.has(w));
}

