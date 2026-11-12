/**
 * Largeur du papier de l'imprimante de tickets, propre à chaque appareil (téléphone ou caisse tactile).
 * 58 mm : petites imprimantes Bluetooth (32 caractères par ligne).
 * 80 mm : imprimantes des kits de caisse (48 caractères par ligne).
 */
export type Paper = 58 | 80;

const KEY = "jokko.papier";

export function getPaper(): Paper {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "80" ? 80 : 58;
  } catch {
    return 58;
  }
}

export function setPaper(p: Paper): void {
  try {
    localStorage.setItem(KEY, String(p));
  } catch {
    /* navigation privée : on garde le choix pour cette fois seulement */
  }
}

/** Caractères par ligne. */
export const paperCols = (p: Paper) => (p === 80 ? 48 : 32);

/** Page d'impression : largeur du papier, zone imprimable, et une police qui fait tenir une ligne pile. */
export function paperPage(p: Paper): string {
  const page = p === 80 ? 80 : 58;
  const body = p === 80 ? 72 : 48;
  // Police à chasse fixe : un caractère ≈ 0,6 em, donc la ligne entière tient dans la zone imprimable.
  const font = (body / paperCols(p) / 0.6).toFixed(2);
  return `@page{size:${page}mm auto;margin:0 ${(page - body) / 2}mm}body{margin:0;width:${body}mm;font:${font}mm/1.35 ui-monospace,Menlo,Consolas,"Courier New",monospace;white-space:pre}`;
}
