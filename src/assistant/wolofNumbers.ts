/**
 * Chiffres wolof de l'argent, comme au comptoir à Dakar.
 *
 * Règle : quand on compte l'argent avec des nombres wolof, on compte en dërëm (1 dërëm = 5 F),
 * même sans dire « dërëm ». « benn junni » = 1 000 dërëm = 5 000 F ; « ñaari junni » = 10 000 F.
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
  [/^(?:milyon|milyoŋ|million|millioni)i?$/, "milyon"],
  [/^(?:derem|dërëm|dorom|deurem|dereum)$/, "derem"],
];

const FRENCH_MONEY = /\b(mil|mille|cent|cents|francs?|fcfa|cfa|f)\b|\d/;

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

/**
 * Montant dit par le commerçant → francs CFA.
 * Nombres wolof : dërëm (×5). Chiffres ou mots français : francs.
 */
export function spokenAmountToFrancs(text: string): SpokenAmount | null {
  const t = text.toLowerCase();
  const explicitDerem = /d[eë]r[eë]m|dorom/.test(t);
  const wolof = readWolofNumber(t);
  if (wolof !== null && (explicitDerem || !FRENCH_MONEY.test(t))) {
    return { francs: wolof * 5, derem: wolof, unit: "derem" };
  }
  const digits = t.replace(/[\s  .]/g, "").match(/\d+/);
  if (digits) {
    let n = Number(digits[0]);
    if (/\bk\b|\d\s*k\b/.test(t)) n *= 1000;
    return explicitDerem ? { francs: n * 5, derem: n, unit: "derem" } : { francs: n, derem: null, unit: "francs" };
  }
  // « ñaari mil », « fukki mil » : nombre wolof + « mil » français = francs
  const withMil = readWolofNumber(t.replace(/\bmil(?:le)?\b/g, "junni"));
  if (withMil !== null) return { francs: withMil, derem: null, unit: "francs" };
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
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (thousands) {
    parts.push(thousands === 1 ? "benn junni" : `${linked(under1000(thousands))} junni`);
  }
  if (rest) parts.push(under1000(rest));
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
  if (f % 5 !== 0) return `${f.toLocaleString("fr-FR")} F`;
  return wolofNumber(f / 5);
}

const QUANTITY_UNITS = new Set([
  "bidon", "bidons", "sac", "sacs", "kilo", "kilos", "kg", "paquet", "paquets", "pot", "pots", "boite", "boites",
  "piece", "pieces", "litre", "litres", "carton", "cartons", "bouteille", "bouteilles", "sachet", "sachets", "pain", "pains",
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
  // 1. Chiffres écrits : « 2 500 », « 15000 », « 15 000 F » (pas suivis d'une unité de quantité)
  const digitRun = text.match(/\d[\d\s.  ]*\d|\d/g);
  if (digitRun) {
    for (const raw of digitRun) {
      const n = Number(raw.replace(/[\s.  ]/g, ""));
      const after = text.slice(text.indexOf(raw) + raw.length).trim().split(/\s+/)[0]?.toLowerCase() ?? "";
      if (QUANTITY_UNITS.has(after) || !Number.isFinite(n) || n === 0) continue;
      if (/^d[eë]r[eë]m/.test(after)) return { francs: n * 5, derem: n, unit: "derem" };
      if (n >= 25) return { francs: n, derem: null, unit: "francs" };
    }
  }
  // 2. Suites de nombres wolof
  let best: SpokenAmount | null = null;
  for (let i = 0; i < words.length; i++) {
    if (!base(words[i]) || base(words[i]) === "derem") continue;
    let j = i;
    const run: string[] = [];
    while (j < words.length && (base(words[j]) && base(words[j]) !== "derem" || (words[j] === "ak" && j + 1 < words.length && base(words[j + 1])) || words[j] === "mil" || words[j] === "mille")) {
      run.push(words[j]);
      j++;
    }
    const next = words[j] ?? "";
    const phrase = run.join(" ");
    const hasMultiplier = run.some((w) => base(w) === "teemeer" || base(w) === "junni" || base(w) === "milyon");
    const french = run.includes("mil") || run.includes("mille");
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
