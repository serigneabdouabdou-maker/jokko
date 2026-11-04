/**
 * Code carré des boîtes de médicaments (GS1 Datamatrix) : il contient le produit (GTIN), la date de péremption
 * et le numéro de lot. Un seul scan remplit tout.
 *
 * Champs GS1 lus : (01) GTIN 14 chiffres · (17) péremption AAMMJJ · (10) lot · (21) numéro de série.
 * Les champs de longueur variable (10, 21) se terminent par le caractère GS (code 29) ou par la fin du code.
 * Accepte aussi la forme lisible avec parenthèses : « (01)03400930000000(17)271231(10)AB123 ».
 */

export type Gs1 = { gtin: string; expiresAt?: string; lot?: string; serial?: string };

const GS = "\u001d";

/** AAMMJJ → AAAA-MM-JJ ; JJ = 00 veut dire « fin du mois ». */
function gs1Date(v: string): string | undefined {
  if (!/^\d{6}$/.test(v)) return undefined;
  const year = 2000 + Number(v.slice(0, 2));
  const month = Number(v.slice(2, 4));
  let day = Number(v.slice(4, 6));
  if (month < 1 || month > 12) return undefined;
  if (day === 0) day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Lit un code GS1 ; null si ce n'est pas un code GS1 avec un GTIN. */
export function parseGs1(raw: string): Gs1 | null {
  let s = raw.trim().replace(/^\]d2|^\]C1|^\]Q3/, ""); // préfixes de symbologie envoyés par certaines douchettes
  if (!s) return null;
  const fields: Record<string, string> = {};
  if (s.startsWith("(")) {
    for (const m of s.matchAll(/\((\d{2,4})\)([^(]*)/g)) fields[m[1]] = m[2].trim();
  } else {
    s = s.replace(/^\u001d+/, "");
    let i = 0;
    while (i < s.length) {
      const ai = s.slice(i, i + 2);
      i += 2;
      if (ai === "01") { fields["01"] = s.slice(i, i + 14); i += 14; }
      else if (ai === "17" || ai === "11" || ai === "15") { fields[ai] = s.slice(i, i + 6); i += 6; }
      else if (ai === "10" || ai === "21") {
        const end = s.indexOf(GS, i);
        fields[ai] = s.slice(i, end === -1 ? undefined : end);
        i = end === -1 ? s.length : end + 1;
      } else break; // champ inconnu : on garde ce qu'on a déjà lu
      if (s[i] === GS) i += 1;
    }
  }
  const gtin = fields["01"];
  if (!gtin || !/^\d{14}$/.test(gtin)) return null;
  const out: Gs1 = { gtin };
  const exp = fields["17"] ? gs1Date(fields["17"]) : undefined;
  if (exp) out.expiresAt = exp;
  if (fields["10"]) out.lot = fields["10"].slice(0, 20);
  if (fields["21"]) out.serial = fields["21"].slice(0, 20);
  return out;
}

/** GTIN-14 → le code de la boîte tel qu'on l'imprime (EAN-13 quand il commence par 0). */
export function gtinToEan(gtin: string): string {
  return /^0\d{13}$/.test(gtin) ? gtin.slice(1) : gtin;
}
