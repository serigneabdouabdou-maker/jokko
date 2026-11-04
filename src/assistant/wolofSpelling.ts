/**
 * Écritures du wolof : la même parole s'écrit de plusieurs façons.
 * Gemini (et les commerçants) écrivent parfois « à la française » (thieb, soukar, niébé, khorom, dougoub),
 * parfois en orthographe officielle (ceeb, suukar, ñebbe, xorom, dugub).
 * `wolofKey` ramène toutes ces écritures à une même clé, pour comparer des mots entendus.
 *
 * Variantes relevées dans les corpus publics (ALFFA, Kallaama, WolBanking77, Common Voice wolof),
 * novembre 2026 : ñatti / ñatt (3, parler de Dakar), ñenti / ñeen (4), fan-weer (30), téeméeru, junniy.
 */

/** Clé d'écriture : minuscules, sans accents, écriture française ramenée à l'orthographe officielle, sans lettres doublées. */
export function wolofKey(word: string): string {
  let w = word
    .toLowerCase()
    .replace(/ñ/g, "ny")
    .replace(/ŋ/g, "ng")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");
  w = w
    .replace(/tch|thi(?=[aeiou])|th|ch/g, "c") // thieb, tchep, cheb → ceb
    .replace(/kh|q/g, "x") // khorom, sankhal, sanqal → xorom, sanxal
    .replace(/dj|di(?=[aeiou])/g, "j") // djeuguen, dieuredieuf, dioul → j…
    .replace(/gn|ny|ni(?=[aeiou])/g, "n") // gnaari, nyaari, niébé, ñebbe → n…
    .replace(/gu(?=[eiy])/g, "g") // guerte → gerte
    .replace(/ou/g, "u") // soukar, mbourou, dougoub → sukar, mburu, dugub
    .replace(/eu/g, "e") // meuw, deurem → mew, derem
    .replace(/ie/g, "e") // thieb → ceb
    .replace(/(.)\1+/g, "$1") // ceeb → ceb, suukar → sukar
    // Fins de mots à la française (règles relevées avec wolof-nlp, MIT, 04/11/2026) :
    .replace(/h$/, "") // yallah → yalla
    .replace(/p$/, "b") // thiep, tchep → ceb (b final se prononce p)
    .replace(/(?<=[^aeiou])e$/, (e, i: number) => (i >= 3 ? "" : e)); // begue, serigne, ndeysane : e muet final
  return w;
}

/** Deux mots se disent-ils pareil ? (même clé, ou l'un prolonge l'autre du « u » de liaison : diwu, ceebu) */
export function sameSound(a: string, b: string): boolean {
  const ka = wolofKey(a), kb = wolofKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  const strip = (k: string) => (k.length > 3 && k.endsWith("u") ? k.slice(0, -1) : k);
  return strip(ka) === strip(kb);
}
