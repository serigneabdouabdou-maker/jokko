/**
 * Clés des modèles de téléphone (réseau Jokko des pièces, 13/11/2026).
 * « Écran Tecno BF6 », « Tecno Pop 7 (BF6) », « LCD bf6 » → « bf6 » ; « Spark Go 2023 » → « sparkgo2023 » ;
 * « iPhone 11 Pro Max » → « iphone11promax » ; « Hot 40i » → « hot40i ».
 * Sans dépendance : utilisé par l'appli, les tests et le script qui prépare la base des IMEI.
 */

/** Mots qui ne désignent jamais un modèle (pièce, qualité, couleur…). */
const STOP = new Set([
  "ecran", "lcd", "lca", "plaque", "contac", "contact", "cover", "arriere", "oled", "amoled", "incell", "tft", "ips", "afficheur", "affichage", "display", "screen", "touch", "tactile", "vitre", "verre",
  "batterie", "battery", "nappe", "flex", "connecteur", "charge", "charging", "port", "dos", "coque", "chassis", "cadre", "frame", "plaquette",
  "bouton", "button", "camera", "haut", "parleur", "micro", "original", "orig", "copie", "universel", "universelle", "compatible", "avec", "sans",
  "pour", "for", "et", "de", "du", "la", "le", "les", "va", "aussi", "sur", "noir", "blanc", "black", "white", "bleu", "blue", "gold", "or", "vert",
  "piece", "pieces", "telephone", "phone", "mobile", "smartphone", "modele", "model", "version", "neuf", "occasion", "assembly", "complet",
]);

/** Marques : elles ne font pas partie de la clé (« Tecno BF6 » = « BF6 »). */
const BRANDS = new Set([
  "tecno", "techno", "infinix", "itel", "samsung", "apple", "xiaomi", "huawei", "honor", "oppo", "realme", "vivo", "nokia", "motorola",
  "moto", "google", "oneplus", "lg", "alcatel", "zte", "lenovo", "sony", "hmd", "poco",
]);

/** Mots qui complètent un modèle : « Spark 10 Pro », « iPhone 11 Pro Max », « Pop 7 Pro ». */
const SUFFIX = new Set(["pro", "plus", "max", "mini", "lite", "go", "play", "power", "air", "prime", "neo", "ultra", "premier", "note", "fold", "flip"]);

const NOISE = /^\d+(g|gb|go|mah|mp|hz|w|mm|cm|f|fcfa|cfa|x)$/;

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\+/g, " plus ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

const hasLetterDigit = (t: string) => /[a-z]/.test(t) && /\d/.test(t);
const isNumber = (t: string) => /^\d{1,3}[a-z]{0,2}$/.test(t) || /^20[1-3]\d$/.test(t);

/** Toutes les clés de modèle écrites dans un texte. */
export function modelKeys(text: string): string[] {
  const t = tokens(text);
  const out = new Set<string>();
  for (let i = 0; i < t.length; i++) {
    const w = t[i]!;
    // Code de modèle : lettres et chiffres mêlés (bf6, ki5k, x6515, a12, sm a125f → a125f).
    // « P33+ », « A58 Lite » : le mot qui suit fait partie du modèle (un autre téléphone que le P33).
    if (hasLetterDigit(w) && w.length >= 2 && w.length <= 10 && !NOISE.test(w) && !/^\d/.test(w)) {
      let key = w;
      for (let k = i + 1; k < t.length && SUFFIX.has(t[k]!) && k <= i + 2; k++) key += t[k];
      out.add(key);
    }
    // Série + numéro : « spark go 2023 », « iphone 11 pro max », « hot 40i », « redmi note 8 ».
    if (isNumber(w) && !NOISE.test(w)) {
      const run: string[] = [];
      for (let j = i - 1; j >= 0 && run.length < 3; j--) {
        const p = t[j]!;
        if (STOP.has(p) || BRANDS.has(p) || /\d/.test(p)) break;
        run.unshift(p);
      }
      if (!run.length) continue;
      let key = run.join("") + w;
      for (let k = i + 1; k < t.length && SUFFIX.has(t[k]!) && k <= i + 2; k++) key += t[k];
      if (key.length >= 3 && key.length <= 24) out.add(key);
    }
  }
  return [...out];
}

/** Un IMEI de 15 chiffres a une clé de contrôle (Luhn) : faux = un chiffre mal recopié. */
export function imeiLooksWrong(text: string): boolean {
  const d = text.replace(/[\s.-]/g, "");
  if (!/^\d{15}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let n = Number(d[i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 !== 0;
}

/** La clé qui ressemble le plus à un code de modèle (« ki5q » plutôt que « spark10 »). */
export function mainModelKey(text: string): string | undefined {
  const keys = modelKeys(text);
  return keys.find((k) => /^[a-z]{1,3}\d/.test(k) && k.length <= 7) ?? keys[0];
}

/** Le texte tapé est-il un IMEI (ou son début de 8 chiffres) ? Renvoie le code du modèle (8 premiers chiffres). */
export function tacOf(text: string): string | null {
  const digits = text.replace(/[\s.-]/g, "");
  if (!/^\d{8,17}$/.test(digits)) return null;
  return digits.slice(0, 8);
}
