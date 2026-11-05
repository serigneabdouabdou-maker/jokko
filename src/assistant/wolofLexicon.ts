/**
 * Vocabulaire wolof de la boutique : ce que DIT le commerçant, pour que Jokko le COMPRENNE.
 * (Le livre de phrases, lui, contient ce que Jokko a le droit de DIRE.)
 * Les 120 entrées ont été validées par le patron de Jokko le 02/11/2026 (« tout est correct ») ;
 * fay, marse, soxla, indi, yóbbu, tuuti et bari (relevés dans les corpus publics) l'ont été le 04/11/2026 (« OK mots »).
 * jafe, jar, waxaale, wanteer, déggoo, jappandi, kiliyaan, mbaar et fayyul (pistes d'un dictionnaire wolof–anglais) ont été validés le 04/11/2026 (« OK mots »).
 * Orthographe officielle du wolof quand elle existe ; sinon la forme courante à Dakar.
 */
export type LexiconEntry = { wo: string; fr: string };
export type LexiconTheme = { theme: string; entries: LexiconEntry[] };

const e = (wo: string, fr: string): LexiconEntry => ({ wo, fr });

export const WOLOF_LEXICON: LexiconTheme[] = [
  {
    theme: "Produits",
    entries: [
      e("ceeb", "riz"), e("suukar", "sucre"), e("diw / diwlin", "huile"), e("diwu gerte", "huile d'arachide"),
      e("diw tiir", "huile de palme"), e("gerte", "arachide"), e("dugub", "mil"), e("mbóq", "maïs"),
      e("sanqal", "mil concassé"), e("araw", "granulé de mil"), e("ñebbe", "niébé (haricot)"), e("farin", "farine"),
      e("makaroni", "pâtes"), e("mburu", "pain"), e("biskit", "biscuit"), e("meew", "lait"), e("soow", "lait caillé"),
      e("kafe", "café"), e("ataaya", "thé"), e("bisaab", "bissap"), e("buy", "pain de singe"), e("kinkeliba", "kinkéliba"),
      e("soble", "oignon"), e("laay", "ail"), e("pombiteer", "pomme de terre"), e("tamaate", "tomate"), e("kaani", "piment"),
      e("poobar", "poivre"), e("xorom", "sel"), e("maggi / jumbo", "bouillon cube"), e("ndox", "eau"), e("jën", "poisson"),
      e("jën wu wow", "poisson séché"), e("gejj", "poisson fermenté séché"), e("yeet", "mollusque fermenté (yeet)"),
      e("yapp", "viande"), e("ganaar", "poulet"), e("nen", "œuf"), e("saabu", "savon"), e("omo", "lessive en poudre"),
    ],
  },
  {
    theme: "Maison",
    entries: [e("almet", "allumettes"), e("pil", "piles"), e("kerën", "charbon"), e("gaas", "gaz (bouteille)"), e("bugi", "bougie")],
  },
  {
    theme: "Quantités et unités",
    entries: [
      e("saku", "sac"), e("bidoŋ", "bidon"), e("kilo", "kilo"), e("liitar", "litre"), e("paket", "paquet"), e("kartoŋ", "carton"),
      e("pot", "pot"), e("tas", "tas (de tomates, d'oignons…)"), e("xaaj", "morceau, part"), e("genn-wàll", "moitié"), e("ñeenteel", "quart"), e("tuuti", "un peu"), e("bari", "beaucoup"),
    ],
  },
  {
    theme: "Verbes du commerce",
    entries: [
      e("jaay", "vendre"), e("jaaykat", "vendeur"), e("jënd", "acheter"), e("jëndkat", "acheteur"), e("fey / fay", "payer"), e("bor", "dette"),
      e("ameel bor", "devoir de l'argent"), e("abal", "prêter (un objet)"), e("leb", "emprunter"), e("lebal", "prêter (de l'argent)"),
      e("delloo", "rendre, rembourser"), e("weccit", "monnaie, faire la monnaie"), e("wàññi", "baisser, réduire"), e("yokk", "augmenter, ajouter"),
      e("dugal", "faire entrer, ajouter au stock"), e("dindi", "enlever"), e("denc", "garder, stocker, épargner"), e("natt", "peser, mesurer"),
      e("lim", "compter"), e("jox", "donner"), e("jël", "prendre"), e("yónnee", "envoyer"), e("ñàkk", "manquer"), e("jeex", "être fini, épuisé"),
      e("des", "rester"), e("lor", "perte, perdre"), e("soxla", "avoir besoin"), e("indi", "apporter"), e("yóbbu", "emporter"),
    ],
  },
  {
    theme: "Argent et prix",
    entries: [
      e("xaalis", "argent"), e("dërëm", "5 francs"), e("kopar", "sou, petite somme"), e("njëg", "prix"), e("seer", "cher"), e("yomb", "pas cher"),
      e("tono", "bénéfice"), e("depaans", "dépense"), e("jaay ci bor", "vendre à crédit"), e("jënd ci bor", "acheter à crédit"),
      e("fey ci kanam", "payer d'avance"), e("fey genn-wàll", "payer la moitié"), e("fey lépp", "tout payer"), e("marse", "marché"),
      e("jafe", "cher, difficile"), e("jar", "coûter, valoir ; se vendre bien"), e("waxaale", "marchander"), e("wanteer", "solder, baisser le prix"),
      e("déggoo", "se mettre d'accord sur un prix"), e("jappandi", "attendre le reste (de l'argent dû)"), e("kiliyaan", "client habituel"), e("mbaar", "étal, stand au marché"),
      e("fayyul", "récupérer une dette"),
    ],
  },
  {
    theme: "Temps",
    entries: [
      e("tey", "aujourd'hui"), e("démb", "hier"), e("ëllëg", "demain"), e("suba", "matin"), e("ngoon", "fin d'après-midi, soir"), e("guddi", "nuit"),
      e("ayu-bés", "semaine"), e("weer", "mois"), e("altine", "lundi"), e("talaata", "mardi"), e("àllarba", "mercredi"), e("alxames", "jeudi"),
      e("àjjuma", "vendredi"), e("gaawu", "samedi"), e("dibéer", "dimanche"),
    ],
  },
  {
    theme: "Questions et phrases du commerçant",
    entries: [
      e("Ñaata la ?", "C'est combien ?"), e("Ñaata la des ?", "Il en reste combien ?"), e("Ku ma ameel bor ?", "Qui me doit de l'argent ?"),
      e("Kañ la fey ?", "Quand est-ce qu'il paie ?"), e("Bindal ko.", "Note-le."), e("Dindil ko.", "Enlève-le."), e("Jaay naa…", "J'ai vendu…"),
      e("Jënd naa…", "J'ai acheté…"), e("Fey na.", "Il / elle a payé."), e("Lu tax ?", "Pourquoi ?"),
    ],
  },
];

/** Thèmes de l'alimentation : donnés à Gemini seulement pour une boutique d'alimentation (jamais de riz dans une pharmacie). */
export const VIVRES_THEMES = ["Produits", "Maison"];

/** Bloc à mettre dans les consignes de Jokko (compréhension). `vivres` = false : sans les produits de l'alimentation. */
export function lexiconInstruction(vivres = true): string {
  const blocks = WOLOF_LEXICON.filter((t) => vivres || !VIVRES_THEMES.includes(t.theme)).map((t) => `${t.theme} : ${t.entries.map((x) => `${x.wo} = ${x.fr}`).join(" ; ")}`).join("\n");
  return `Vocabulaire wolof de la boutique (ce que le commerçant peut dire, validé par le patron) :
${blocks}
- Le commerçant peut aussi déformer ces mots ou mélanger avec le français : choisis le sens le plus proche dans cette liste et dans les articles du contexte (les articles du contexte passent avant). Si tu hésites entre deux sens, demande (« Ban produit ? »).`;
}
