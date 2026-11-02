/**
 * Chiffres wolof de l'argent, comme au comptoir à Dakar.
 *
 * Règle : quand on compte l'argent avec des nombres wolof, on compte en dërëm (1 dërëm = 5 F),
 * même sans dire « dërëm ». « benn junni » = 1 000 dërëm = 5 000 F ; « ñaari junni » = 10 000 F.
 * SAUF les millions et milliards, qui se disent en FRANCS (validé par le patron le 02/11/2026) :
 * « benn milyoŋ » = 1 000 000 F ; « ñaari milyoŋ ak téeméeri junni » = 2 000 000 F + 500 000 F.
 * Avec des nombres français ou des chiffres (« 10 000 », « deux mille », « ñaari mil »), ce sont des francs.
 */

const UNITS: Record<string, number> = {
  benn: 1,
  naar: 2,
  nett: 3,
  neent: 4,
  juroom: 5,
  fukk: 10,
  fanweer: 30,
};

const MULTIPLIERS: Record<string, number> = {
  teemeer: 100,
  junni: 1000,
  milyon: 1_000_000,
  miliyaar: 1_000_000_000,
};

/** Écritures courantes → forme de base (sans accents ni ñ). */
const SPELLINGS: Array<[RegExp, string]> = [
  [/^(?:nyaar|niaar|naar|ñaar)i?$/, "naar"],
  [/^(?:nyett|niett|nett|ñett|nyet|net)t?i?$/, "nett"],
  [/^(?:nyeent|nieent|neent|ñeent|nyent|neen)t?i?$/, "neent"],
  [/^(?:juroom|jurom|diouroum|djouroum|juróom|juroum)i?$/, "juroom"],
  [/^(?:benn|ben)i?$/, "benn"],
  [/^(?:fukk|fuk|fouk|foukk)i?$/, "fukk"],
  [/^(?:fanweer|fanwer|fanweeri)i?$/, "fanweer"],
  [/^(?:teemeer|temeer|teemer|temer|téeméer|teeméer)i?$/, "teemeer"],
  [/^(?:junni|juni|djouni|jounni|douni)i?$/, "junni"],
  [/^(?:milyon|milyoŋ|miliyon|milyong)i?$/, "milyon"],
  [/^(?:miliyaar|milyaar|miliyar|milyar|miliaar)i?$/, "miliyaar"],
  [/^(?:derem|dërëm|dorom|deurem|dereum)$/, "derem"],
];

/** Signes d'un montant dit en français (donc en francs) : chiffres, « mille », « million », « deux », « francs »… */
const FRENCH_MONEY =
  /\b(mil|mille|cent|cents|millions?|milliards?|francs?|fcfa|cfa|f|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingts?|trente|quarante|cinquante|soixante)\b|\d/;

const FR_UNITS: Record<string, number> = {
  zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9,
  dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16,
  vingt: 20, vingts: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60,
};
const FR_SCALES: Record<string, number> = {
  cent: 100, cents: 100, mil: 1000, mille: 1000, k: 1000,
  million: 1_000_000, millions: 1_000_000, milliard: 1_000_000_000, milliards: 1_000_000_000,
};

/**
 * Découpe une phrase en mots et nombres, comme on l'écrit au Sénégal :
 * « 20 000 » et « 20.000 » = 20000 ; « 1,5 » = 1.5 ; « 20k » = 20 k. La ponctuation coupe les nombres.
 */
function frTokens(text: string): string[] {
  let t = text
    .toLowerCase()
    .replace(/ñ/g, "n")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-–]/g, " ");
  // Groupes de milliers : « 2 500 000 », « 20.000 », « 20 000 »
  let prev = "";
  while (prev !== t) {
    prev = t;
    t = t.replace(/(\d)[\s\u00a0\u202f.](?=\d{3}(?!\d))/g, "$1");
  }
  t = t
    .replace(/(\d),(\d)/g, "$1.$2") // virgule décimale
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/\.(?!\d)|(?<!\d)\./g, " | ")
    .replace(/[^a-z0-9.ŋ\s]/g, " | ");
  return t.split(/\s+/).filter(Boolean);
}

type Run = { value: number; start: number; end: number; next: string };

/**
 * Nombres dits en français ou en chiffres, avec leurs grandeurs :
 * « 2 millions 500 mille » = 2 500 000 ; « 1,5 milliard » = 1 500 000 000 ; « deux mille cinq cents » = 2 500 ;
 * « quatre-vingt-dix » = 90. Chaque nombre de la phrase est rendu à part (« 2 sacs à 20 000 » → 2 et 20 000).
 */
function frenchRuns(tokens: string[]): Run[] {
  const runs: Run[] = [];
  const isDigit = (w: string) => /^\d+(\.\d+)?$/.test(w);
  let i = 0;
  while (i < tokens.length) {
    if (!isDigit(tokens[i]) && !(tokens[i] in FR_UNITS)) {
      i++;
      continue;
    }
    let total = 0;
    let current = 0;
    let last: "digit" | "word" | "scale" | null = null;
    let j = i;
    for (; j < tokens.length; j++) {
      const w = tokens[j];
      if (w === "et" && last === "word" && tokens[j + 1] in FR_UNITS) continue;
      if (isDigit(w)) {
        if (last === "digit" || last === "word") break;
        current += Number(w);
        last = "digit";
      } else if (w in FR_UNITS) {
        if (last === "digit") break;
        const v = FR_UNITS[w];
        // « quatre-vingt » = 80
        if (v === 20 && current % 100 === 4) current += 76;
        else current += v;
        last = "word";
      } else if (w in FR_SCALES) {
        const f = FR_SCALES[w];
        if (f === 100) current = (current || 1) * 100;
        else {
          total += (current || 1) * f;
          current = 0;
        }
        last = "scale";
      } else break;
    }
    runs.push({ value: Math.round((total + current) * 100) / 100, start: i, end: j, next: tokens[j] ?? "" });
    i = j;
  }
  return runs;
}

/** Le plus grand nombre français (ou en chiffres) de la phrase, ou null. */
export function readFrenchNumber(text: string): number | null {
  const runs = frenchRuns(frTokens(text));
  return runs.length ? Math.max(...runs.map((r) => r.value)) : null;
}

/**
 * Le prix dit est-il celui d'UN article ? « chacun », « chaque sac », « l'unité », « le sac à »,
 * « par bidon », « bu nekk », ou « 2 sacs à 20 000 » (« à » après une quantité = prix de l'unité ;
 * « pour 40 000 » ou « en tout » = total).
 */
export function saysUnitPrice(text: string): boolean {
  const t = text.toLowerCase().replace(/ñ/g, "n").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’']/g, " ");
  const unit = "(?:sac|bidon|kilo|kg|paquet|carton|piece|litre|unite|sachet|boite|bouteille|pot|pain|caisse|tonne|balle)";
  if (new RegExp(`\\b(?:chacun|chacune|chaque|l unite|la piece|par ${unit}s?|le ${unit}|la ${unit}|bu nekk|bu ne|ku nekk|benn bi)\\b`).test(t)) return true;
  if (/\b(?:en tout|au total|total|tout compris|lepp|yepp|pour)\b/.test(t)) return false;
  return new RegExp(`\\b${unit}s\\b[^,;|]*?\\ba\\s+(?:\\d|un|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|vingt|trente|quarante|cinquante|soixante|cent|mille)`).test(t);
}

function clean(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ñ/g, "n")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[-–]/g, " ")
    .replace(/[^a-z0-9ŋ ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function base(word: string): string | null {
  for (const [pattern, value] of SPELLINGS) if (pattern.test(word)) return value;
  return null;
}

/**
 * Lit un nombre wolof (« ñaari junni », « fukk ak juróomi junni », « juróom-fukk »).
 * Renvoie le nombre brut (sans conversion dërëm), ou null si ce n'est pas un nombre wolof.
 */
export function readWolofNumber(text: string): number | null {
  let total = 0;
  let group = 0; // nombre en cours, avant un multiplicateur
  let current = 0; // petit nombre en cours (ex. juróom-benn)
  let seen = false;
  for (const raw of clean(text)) {
    if (raw === "ak" || raw === "ag" || raw === "derem") continue;
    const word = base(raw);
    if (!word || word === "derem") continue;
    if (word in UNITS) {
      const value = UNITS[word];
      // « juróom benn » = 6, « ñaar fukk » = 20, « juróom fukk » = 50
      if (word === "fukk" && current > 0 && current < 10) current *= 10;
      else if (word !== "fukk" && word !== "fanweer" && current === 5) current += value;
      else current += value;
      seen = true;
      continue;
    }
    if (word in MULTIPLIERS) {
      const factor = MULTIPLIERS[word];
      const amount = (group + current || 1) * factor;
      if (factor >= 1000) {
        total += amount;
        group = 0;
      } else {
        group = amount;
      }
      current = 0;
      seen = true;
    }
  }
  if (!seen) return null;
  return total + group + current;
}

export type SpokenAmount = { francs: number; derem: number | null; unit: "derem" | "francs" };

/** Sépare la partie « milyoŋ / miliyaar » (en francs) du reste (en dërëm). null s'il n'y a pas de million. */
function splitBig(text: string): { big: number; rest: number } | null {
  const words = clean(text);
  let last = -1;
  words.forEach((w, i) => {
    const b = base(w);
    if (b === "milyon" || b === "miliyaar") last = i;
  });
  if (last < 0) return null;
  const big = readWolofNumber(words.slice(0, last + 1).join(" ")) ?? 0;
  const rest = readWolofNumber(words.slice(last + 1).join(" ")) ?? 0;
  return { big, rest };
}

/**
 * Montant dit par le commerçant → francs CFA.
 * Nombres wolof : dërëm (×5). Chiffres ou mots français : francs.
 */
export function spokenAmountToFrancs(text: string): SpokenAmount | null {
  const t = text.toLowerCase();
  const explicitDerem = /d[eë]r[eë]m|dorom/.test(t);
  const wolof = readWolofNumber(t);
  if (wolof !== null && (explicitDerem || !FRENCH_MONEY.test(t))) {
    // Millions et milliards en francs, le reste en dërëm : « ñaari milyoŋ ak téeméeri junni » = 2 500 000 F.
    const big = explicitDerem ? null : splitBig(t);
    if (big) {
      const francs = Math.round(big.big + big.rest * 5);
      return { francs, derem: null, unit: "francs" };
    }
    return { francs: Math.round(wolof * 5), derem: wolof, unit: "derem" };
  }
  const french = readFrenchNumber(t);
  if (french !== null && french > 0) {
    return explicitDerem ? { francs: Math.round(french * 5), derem: french, unit: "derem" } : { francs: Math.round(french), derem: null, unit: "francs" };
  }
  // « ñaari mil », « fukki million » : nombre wolof + grandeur française = francs
  const withFrench = readWolofNumber(
    t.replace(/\bmil(?:le)?\b/g, "junni").replace(/\bmillions?\b/g, "milyon").replace(/\bmilliards?\b/g, "miliyaar"),
  );
  if (withFrench !== null) return { francs: Math.round(withFrench), derem: null, unit: "francs" };
  return null;
}

const SMALL = ["", "benn", "ñaar", "ñett", "ñeent", "juróom", "juróom-benn", "juróom-ñaar", "juróom-ñett", "juróom-ñeent"];

/** 0–99 en wolof (forme simple, sans le -i de liaison). */
function under100(n: number): string {
  if (n < 10) return SMALL[n];
  const tens = Math.floor(n / 10);
  const rest = n % 10;
  const tensWord = tens === 1 ? "fukk" : tens === 3 ? "fanweer" : `${SMALL[tens]}-fukk`;
  return rest ? `${tensWord} ak ${SMALL[rest]}` : tensWord;
}

/** Ajoute le -i de liaison devant un multiplicateur (« ñaari junni », « fukki téeméer »). */
function linked(word: string): string {
  return word.endsWith("i") ? word : `${word}i`;
}

function under1000(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds) parts.push(hundreds === 1 ? "téeméer" : `${linked(SMALL[hundreds])} téeméer`);
  if (rest) parts.push(under100(rest));
  return parts.join(" ak ");
}

/** Nombre → mots wolof. */
export function wolofNumber(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "dara";
  n = Math.round(n);
  const parts: string[] = [];
  const scales: Array<[number, string]> = [[1_000_000_000, "miliyaar"], [1_000_000, "milyoŋ"], [1000, "junni"]];
  for (const [size, word] of scales) {
    const count = Math.floor(n / size);
    n %= size;
    if (!count) continue;
    parts.push(count === 1 ? `benn ${word}` : `${linked(count >= 1000 ? wolofNumber(count) : under1000(count))} ${word}`);
  }
  if (n) parts.push(under1000(n));
  return parts.join(" ak ");
}

/**
 * Francs → comment le dire en wolof, en dërëm comme au comptoir.
 * 10 000 F → « ñaari junni » ; 7 500 F → « benn junni ak juróomi téeméer ».
 * Si le montant n'est pas un multiple de 5, on le dit en francs.
 */
export function francsToWolof(francs: number): string {
  const f = Math.round(francs);
  if (f <= 0) return "dara";
  if (f < 1_000_000) return f % 5 !== 0 ? `${f.toLocaleString("fr-FR")} F` : wolofNumber(f / 5);
  // Millions et milliards : en francs. Le reste (moins d'un million) : en dërëm.
  const parts: string[] = [];
  const billions = Math.floor(f / 1_000_000_000);
  const millions = Math.floor((f % 1_000_000_000) / 1_000_000);
  const rest = f % 1_000_000;
  if (billions) parts.push(billions === 1 ? "benn miliyaar" : `${linked(wolofNumber(billions))} miliyaar`);
  if (millions) parts.push(millions === 1 ? "benn milyoŋ" : `${linked(wolofNumber(millions))} milyoŋ`);
  if (rest) parts.push(rest % 5 === 0 ? wolofNumber(rest / 5) : `${rest.toLocaleString("fr-FR")} F`);
  return parts.join(" ak ");
}

const QUANTITY_UNITS = new Set([
  "bidon", "bidons", "sac", "sacs", "kilo", "kilos", "kg", "paquet", "paquets", "pot", "pots", "boite", "boites",
  "piece", "pieces", "litre", "litres", "carton", "cartons", "bouteille", "bouteilles", "sachet", "sachets", "pain", "pains",
  "caisse", "caisses", "tonne", "tonnes", "balle", "balles", "unite", "unites",
]);
const MONEY_WORDS = new Set(["derem", "dorom", "deurem", "francs", "franc", "f", "cfa", "fcfa", "xaalis", "njeg", "njég"]);

/**
 * Cherche un montant d'argent dans une phrase entière (« jaay naa ñaari junni », « transport 2 500 »).
 * Garde-fou : un nombre wolof n'est pris comme argent que s'il contient téeméer/junni, ou s'il est suivi
 * de « dërëm » / « francs ». « ñaari bidon » est une quantité, pas de l'argent.
 * Renvoie null si aucun montant clair n'est trouvé.
 */
export function extractSpokenAmount(text: string): SpokenAmount | null {
  const words = clean(text);
  // 1. Chiffres et nombres français : « 2 500 », « 15 000 F », « 2 millions », « vingt mille »
  //    (un nombre suivi d'une unité de quantité — « 2 sacs » — n'est pas de l'argent)
  for (const run of frenchRuns(frTokens(text))) {
    if (QUANTITY_UNITS.has(run.next) || run.value <= 0) continue;
    if (/^d[e]r[e]m|^dorom|^deurem/.test(run.next)) return { francs: Math.round(run.value * 5), derem: run.value, unit: "derem" };
    if (run.value >= 25) return { francs: Math.round(run.value), derem: null, unit: "francs" };
  }
  // 2. Suites de nombres wolof
  let best: SpokenAmount | null = null;
  for (let i = 0; i < words.length; i++) {
    if (!base(words[i]) || base(words[i]) === "derem") continue;
    let j = i;
    const run: string[] = [];
    while (j < words.length && (base(words[j]) && base(words[j]) !== "derem" || (words[j] === "ak" && j + 1 < words.length && base(words[j + 1])) || /^(mil|mille|millions?|milliards?)$/.test(words[j]))) {
      run.push(words[j]);
      j++;
    }
    const next = words[j] ?? "";
    const phrase = run.join(" ");
    const hasMultiplier = run.some((w) => ["teemeer", "junni", "milyon", "miliyaar"].includes(base(w) ?? ""));
    const french = run.some((w) => /^(mil|mille|millions?|milliards?)$/.test(w));
    const money = MONEY_WORDS.has(next);
    if (QUANTITY_UNITS.has(next) && !hasMultiplier) {
      i = j;
      continue;
    }
    if (hasMultiplier || money || french) {
      const amount = spokenAmountToFrancs(money && next !== "derem" && next !== "dorom" && next !== "deurem" ? `${phrase} ${next}` : `${phrase}${next.startsWith("d") ? " derem" : ""}`);
      if (amount && (!best || amount.francs > best.francs)) best = amount;
    }
    i = j;
  }
  return best;
}

export type Priced = { amount: number | null; quantity: number | null; unitPrice?: number | null };

/**
 * Garde-fou des chiffres : les montants sont relus ici depuis les mots dits, jamais pris du calcul du modèle.
 * - words.total : le total dit ; words.each : le prix d'UN article (« 20 000 chacun »).
 * - Sans mots fournis, le montant est cherché dans la phrase entendue.
 * - « chacun », « chaque sac », « bu nekk », « 2 sacs à 20 000 » : ce montant est le prix de l'unité ;
 *   le total sera calculé par le code (quantité × prix), même si le modèle l'a pris pour le total.
 * Modifie l'écriture. Renvoie false si un montant dit n'a pas pu être lu (il faut faire répéter).
 */
export function settleAmounts(action: Priced, words: { total?: string; each?: string }, heard: string): boolean {
  const read = (s: string) => spokenAmountToFrancs(s) ?? extractSpokenAmount(s);
  const saidTotal = words.total?.trim() ?? "";
  const saidEach = words.each?.trim() ?? "";
  if (saidEach) {
    const each = read(saidEach);
    if (!each || each.francs <= 0) return false;
    action.unitPrice = each.francs;
  }
  if (saidTotal) {
    const total = read(saidTotal);
    if (!total || total.francs <= 0) return false;
    action.amount = total.francs;
  }
  const inPhrase = extractSpokenAmount(heard);
  const eachInPhrase = saysUnitPrice(heard);
  // Prix de l'unité calculé par le modèle alors que la phrase dit un total (« 3 sacs pour 60 000 ») : on l'oublie.
  if (!saidEach && action.unitPrice && inPhrase && inPhrase.francs !== action.unitPrice && !eachInPhrase) action.unitPrice = null;
  if (!saidTotal && !saidEach && inPhrase && inPhrase.francs > 0) {
    if (action.unitPrice && inPhrase.francs === action.unitPrice) action.amount = null;
    else action.amount = inPhrase.francs;
  }
  const qty = action.quantity !== null && Number.isFinite(action.quantity) ? Math.abs(action.quantity) : 0;
  // Le prix entendu est celui d'un article : on ne le prend pas pour le total.
  if (!action.unitPrice && action.amount && qty > 1 && inPhrase?.francs === action.amount && eachInPhrase) {
    action.unitPrice = action.amount;
    action.amount = null;
  }
  // Prix de l'unité et quantité connus : c'est le calcul du code qui compte.
  if (action.unitPrice && qty > 0) action.amount = null;
  return true;
}
