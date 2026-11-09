/**
 * Dette d'un client qui doit déjà : le commerçant ajoute-t-il une somme, ou donne-t-il la dette totale ?
 * Lu dans les mots entendus, pas laissé au modèle (cahier des erreurs du 04/11/2026 : « c'est 10 000 tout court »
 * avait été ajouté à l'ancienne dette au lieu de la remplacer).
 *  - « ajout » : encore, ajoute, en plus, jël / dieul (prendre), lébbal (prêter), yóorel, yokk…
 *  - « total » : c'est …, tout court, rekk, lépp, en tout, au total, sa dette est…, ou une correction (« dindil »)
 *  - « mixte » : les deux à la fois (on garde le choix du modèle)
 *  - null : rien de clair
 */
export type DebtWords = "ajout" | "total" | "mixte" | null;

const ADD = /\b(?:encore|ajout\w*|en plus|de plus|yokk\w*|j[eë]l|jeul|dieul|djeul|j[eë]lati|prend\w*|pris|l[eé]bbal|lebal|y[oó]orel|y[oó]bbu)\b/;
const TOTAL = /(?:\bc'?est\s+(?:de\s+|\w+\s+)?(?:\d|benn|ñaa?ri?|ñett?i?|ñatti?|ñee?nti?|jur[oó]om|fukk|t[eé]em[eé]er|junni|dix|vingt|trente|quarante|cinquante|cent|mille|deux|trois|quatre|cinq|six|sept|huit|neuf)|tout court|\brekk?\b|\bl[eé]pp\b|en tout|au total|\btotal\w*\b|sa dette est|dette est de|\bbor bi\b|\bdindi\w*|\benl[eè]ve\w*|\bdanga bind\b)/;

export function debtWords(heard: string): DebtWords {
  const t = heard.toLowerCase().replace(/[’`]/g, "'");
  const add = ADD.test(t);
  const total = TOTAL.test(t);
  if (add && total) return "mixte";
  if (add) return "ajout";
  if (total) return "total";
  return null;
}
