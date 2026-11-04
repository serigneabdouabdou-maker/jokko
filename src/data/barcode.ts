import { gtinToEan, parseGs1 } from "./gs1";
import type { Product, Shop } from "../model";

/**
 * Codes-barres de la boutique.
 * - Les produits emballés ont déjà un code du fabricant (EAN-13, EAN-8, UPC) : on l'associe une fois à l'article.
 * - Pour les produits sans code (riz au kilo, oignons…), Jokko crée un code EAN-13 « interne » (préfixe 20,
 *   réservé par GS1 à l'usage en magasin) à imprimer sur une étiquette. Toute douchette et toute caméra le lisent.
 * Le code identifie l'article ; le prix reste dans Jokko (un prix qui change ne demande pas de réimprimer).
 */

/** Chiffre de contrôle EAN-13 pour 12 chiffres. */
export function ean13Check(twelve: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(twelve[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13Check(code.slice(0, 12)) === Number(code[12]);
}

/** Code lu (caméra, douchette, clavier) → forme comparable. UPC-A (12 chiffres) = EAN-13 commençant par 0. */
export function normalizeCode(raw: string): string {
  // Code carré d'une boîte de médicament (GS1 Datamatrix) : on garde le code du produit (GTIN → EAN-13).
  const gs1 = parseGs1(raw);
  if (gs1) return gtinToEan(gs1.gtin);
  const c = raw.trim().replace(/\s+/g, "");
  return /^\d{12}$/.test(c) ? `0${c}` : c;
}

/** Article (et gros ou détail) qui porte ce code dans la boutique. */
export function findByCode(shop: Shop, raw: string): { product: Product; retail: boolean } | null {
  const code = normalizeCode(raw);
  if (!code) return null;
  for (const product of shop.products) {
    if (product.barcode && normalizeCode(product.barcode) === code) return { product, retail: false };
    if (product.retail?.barcode && normalizeCode(product.retail.barcode) === code) return { product, retail: true };
  }
  return null;
}

export function codesInUse(shop: Shop): Set<string> {
  const set = new Set<string>();
  for (const p of shop.products) {
    if (p.barcode) set.add(normalizeCode(p.barcode));
    if (p.retail?.barcode) set.add(normalizeCode(p.retail.barcode));
  }
  return set;
}

/** Nouveau code interne unique dans la boutique : 20 + 10 chiffres + contrôle. */
export function newInternalCode(shop: Shop, random: () => number = Math.random): string {
  const used = codesInUse(shop);
  for (;;) {
    let body = "20";
    for (let i = 0; i < 10; i++) body += Math.floor(random() * 10);
    const code = `${body}${ean13Check(body)}`;
    if (!used.has(code)) return code;
  }
}

/** Donne un code interne aux articles (et à leur détail) qui n'en ont pas. */
export function withCodes(shop: Shop, productIds: string[], random: () => number = Math.random): Shop {
  let next = shop;
  for (const id of productIds) {
    const p = next.products.find((x) => x.id === id);
    if (!p) continue;
    let updated = p;
    if (!updated.barcode) updated = { ...updated, barcode: newInternalCode(next, random) };
    next = { ...next, products: next.products.map((x) => (x.id === id ? updated : x)) };
    if (updated.retail && !updated.retail.barcode) {
      updated = { ...updated, retail: { ...updated.retail, barcode: newInternalCode(next, random) } };
      next = { ...next, products: next.products.map((x) => (x.id === id ? updated : x)) };
    }
  }
  return next;
}

const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

/** Les 95 modules d'un EAN-13 (1 = barre noire). */
export function ean13Modules(code: string): string {
  const d = code.split("").map(Number);
  const parity = PARITY[d[0]];
  let bits = "101";
  for (let i = 1; i <= 6; i++) bits += (parity[i - 1] === "L" ? L : G)[d[i]];
  bits += "01010";
  for (let i = 7; i <= 12; i++) bits += R[d[i]];
  return `${bits}101`;
}

/** Code-barres EAN-13 en SVG (net à l'impression), avec les chiffres dessous. */
export function ean13Svg(code: string, moduleWidth = 2, height = 60): string {
  if (!isValidEan13(code)) return "";
  const bits = ean13Modules(code);
  const quietLeft = 11;
  const width = (quietLeft + 95 + 7) * moduleWidth;
  const guard = new Set([0, 1, 2, 45, 46, 47, 48, 49, 92, 93, 94]);
  let rects = "";
  for (let i = 0; i < 95; i++) {
    if (bits[i] !== "1") continue;
    const h = guard.has(i) ? height + 8 : height;
    rects += `<rect x="${(quietLeft + i) * moduleWidth}" y="0" width="${moduleWidth}" height="${h}"/>`;
  }
  const font = 11 * (moduleWidth / 2) + 2;
  const y = height + font + 2;
  const text = (s: string, x: number, anchor = "middle") => `<text x="${x}" y="${y}" font-size="${font}" text-anchor="${anchor}" font-family="monospace">${s}</text>`;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${y + 3}" width="${width}" height="${y + 3}" role="img" aria-label="Code-barres ${code}">`,
    `<rect width="100%" height="100%" fill="#fff"/><g fill="#000">${rects}</g>`,
    text(code[0], (quietLeft - 4) * moduleWidth, "end"),
    text(code.slice(1, 7), (quietLeft + 3 + 21) * moduleWidth),
    text(code.slice(7), (quietLeft + 50 + 21) * moduleWidth),
    "</svg>",
  ];
  return svg.join("");
}
