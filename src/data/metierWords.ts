/**
 * Un métier = ses propres mots (règle de Fallou, 12/11/2026 : « la couture ne se mélange pas avec l'alimentation »).
 * 1) Les consignes de Gemini sont écrites avec des exemples de boutique d'alimentation (riz, huile, sucre).
 *    `localizeInstruction` remplace ces exemples par ceux du métier de la boutique : un tailleur n'entend jamais parler de riz.
 * 2) `foreignArticle` reconnaît un article d'un autre métier qui n'est pas dans le stock (du riz chez un tailleur) :
 *    Jokko demande au lieu de l'enregistrer.
 * Pas d'import avec « @/ » : ce fichier est aussi lu par le serveur (consignes de Gemini).
 */
import { metierOf, modulesOf, type MetierId } from "./metiers.ts";

/** Un article d'exemple : « 2 sacs de riz » (many), « jënd naa ñetti sac ceeb » (wo). */
type Art = { name: string; the: string; one: string; many: string; unit: string; theUnit: string; units: string; wo: string; woName: string };
type Examples = {
  a: Art;
  b: Art;
  c: Art;
  /** Phrase sur les noms des articles (remplace la liste ceeb = riz, diw = huile…). */
  vocab: string;
  /** Plusieurs articles dans une même vente. */
  multi: string;
  /** Une facture de plusieurs articles. */
  invoiceN: string;
  /** Corrections du panier. */
  fix: string;
  /** Unités de gros et de détail. */
  gros: string;
  detail: string;
  detailEx: string;
  units: string;
};

const art = (name: string, the: string, one: string, many: string, unit: string, theUnit: string, units: string, wo: string, woName = name): Art => ({ name, the, one, many, unit, theUnit, units, wo, woName });

const EXAMPLES: Partial<Record<MetierId, Examples>> = {
  pharmacie: {
    a: art("paracétamol", "le paracétamol", "boîte de paracétamol", "boîtes de paracétamol", "boîte", "la boîte", "boîtes", "boîte paracétamol"),
    b: art("sirop", "le sirop", "flacon de sirop", "flacons de sirop", "flacon", "le flacon", "flacons", "flacon sirop"),
    c: art("pommade", "la pommade", "tube de pommade", "tubes de pommade", "tube", "le tube", "tubes", "tube pommade"),
    vocab: "Les médicaments ont un nom français ou un nom de marque : le commerçant le dit tel quel, parfois déformé. Choisis l'article du contexte qui correspond ; si deux médicaments se ressemblent, demande lequel.",
    multi: "« deux boîtes de paracétamol, un flacon de sirop et trois tubes de pommade »",
    invoiceN: "deux boîtes de paracétamol, un flacon de sirop, trois tubes de pommade, des compresses…",
    fix: "« déedéet, benn boîte rekk », « ajoute le sirop », « enlève la pommade »",
    gros: "boîte, carton",
    detail: "plaquette, comprimé",
    detailEx: "« ñaari plaquette paracétamol » → unite plaquette",
    units: "boîte, plaquette, flacon, tube",
  },
  quincaillerie: {
    a: art("ciment", "le ciment", "sac de ciment", "sacs de ciment", "sac", "le sac", "sacs", "sac ciment"),
    b: art("fer de 10", "le fer", "barre de fer", "barres de fer", "barre", "la barre", "barres", "barre fer", "fer"),
    c: art("peinture", "la peinture", "pot de peinture", "pots de peinture", "pot", "le pot", "pots", "pot peinture"),
    vocab: "Les articles ont souvent un nom français (ciment, fer, tuyau, robinet, câble) : le commerçant le dit tel quel ou à la wolof. Choisis l'article du contexte qui correspond.",
    multi: "« dix sacs de ciment, cinq barres de fer, deux pots de peinture et un robinet »",
    invoiceN: "dix sacs de ciment, cinq barres de fer, deux pots de peinture, des pointes…",
    fix: "« déedéet, benn sac rekk », « ajoute le robinet », « enlève la peinture »",
    gros: "sac, rouleau, carton",
    detail: "kilo, mètre",
    detailEx: "« ñaari mètre câble » → unite mètre",
    units: "sac, barre, pot, mètre, kilo",
  },
  couture: {
    a: art("bazin", "le bazin", "mètre de bazin", "mètres de bazin", "mètre", "le mètre", "mètres", "mètre bazin"),
    b: art("fil", "le fil", "bobine de fil", "bobines de fil", "bobine", "la bobine", "bobines", "bobine fil"),
    c: art("boutons", "les boutons", "sachet de boutons", "sachets de boutons", "sachet", "le sachet", "sachets", "sachet bouton", "bouton"),
    vocab: "Les tissus et fournitures ont un nom français (bazin, wax, getzner, fil, boutons, doublure) : le commerçant les dit tels quels. Choisis l'article du contexte qui correspond.",
    multi: "« trois mètres de bazin, deux bobines de fil, un sachet de boutons et une fermeture »",
    invoiceN: "un grand boubou, trois mètres de bazin, deux bobines de fil, des boutons…",
    fix: "« déedéet, benn mètre rekk », « ajoute le fil », « enlève les boutons »",
    gros: "rouleau, pièce",
    detail: "mètre",
    detailEx: "« ñaari mètre bazin » → unite mètre",
    units: "mètre, bobine, pièce, sachet",
  },
  vetements: {
    a: art("pantalon", "le pantalon", "pantalon", "pantalons", "pièce", "la pièce", "pièces", "pantalon"),
    b: art("chaussures", "les chaussures", "paire de chaussures", "paires de chaussures", "paire", "la paire", "paires", "paire chaussures", "chaussures"),
    c: art("bazin", "le bazin", "mètre de bazin", "mètres de bazin", "mètre", "le mètre", "mètres", "mètre bazin"),
    vocab: "Les vêtements et tissus ont un nom français (pantalon, chemise, robe, bazin, wax, chaussures) : le commerçant les dit tels quels. Choisis l'article du contexte qui correspond.",
    multi: "« deux pantalons, une chemise, une paire de chaussures et trois mètres de bazin »",
    invoiceN: "deux pantalons, une chemise, une paire de sandales, trois mètres de bazin…",
    fix: "« déedéet, benn pantalon rekk », « ajoute la chemise », « enlève les chaussures »",
    gros: "balle, lot",
    detail: "pièce, mètre",
    detailEx: "« ñaari mètre bazin » → unite mètre",
    units: "pièce, paire, mètre",
  },
  boulangerie: {
    a: art("baguette", "la baguette", "baguette", "baguettes", "baguette", "la baguette", "baguettes", "mburu"),
    b: art("croissant", "le croissant", "croissant", "croissants", "pièce", "la pièce", "pièces", "croissant"),
    c: art("farine", "la farine", "sac de farine", "sacs de farine", "sac", "le sac", "sacs", "sac farine"),
    vocab: "mburu = pain. Les autres articles ont un nom français (baguette, croissant, pain de mie, farine, levure) : le commerçant les dit tels quels. Choisis l'article du contexte qui correspond.",
    multi: "« vingt baguettes, cinq croissants, deux pains de mie et trois pains au chocolat »",
    invoiceN: "cent baguettes, vingt croissants, dix pains de mie…",
    fix: "« déedéet, fukki baguette rekk », « ajoute les croissants », « enlève le pain de mie »",
    gros: "sac, carton",
    detail: "pièce, kilo",
    detailEx: "« ñaari kilo farine » → unite kilo",
    units: "baguette, pièce, sac, kilo",
  },
  reparation: {
    a: art("écran", "l'écran", "écran", "écrans", "pièce", "la pièce", "pièces", "ekraan"),
    b: art("batterie", "la batterie", "batterie", "batteries", "pièce", "la pièce", "pièces", "batri"),
    c: art("connecteur", "le connecteur", "connecteur", "connecteurs", "pièce", "la pièce", "pièces", "konektëer"),
    vocab: "ekraan = écran, batri = batterie, konektëer = connecteur de charge. Les autres pièces ont un nom français ou de marque (iPhone, Tecno, Samsung) : choisis l'article du contexte qui correspond.",
    multi: "« deux écrans iPhone 11, trois connecteurs, une batterie Tecno et deux coques »",
    invoiceN: "deux écrans iPhone 11, trois connecteurs, une batterie Tecno, des coques…",
    fix: "« déedéet, benn ekraan rekk », « ajoute la coque », « enlève la batterie »",
    gros: "carton, lot",
    detail: "pièce",
    detailEx: "« ñaari pièce connecteur » → unite pièce",
    units: "pièce, lot, carton",
  },
  multiservice: {
    a: art("photocopie", "la photocopie", "photocopie", "photocopies", "page", "la page", "pages", "photocopie"),
    b: art("papier", "le papier", "rame de papier", "rames de papier", "rame", "la rame", "rames", "rame papier"),
    c: art("plastification", "la plastification", "plastification", "plastifications", "pièce", "la pièce", "pièces", "plastification"),
    vocab: "Les services et fournitures ont un nom français (photocopie, impression, plastification, rame, encre) : le commerçant les dit tels quels. Choisis l'article du contexte qui correspond.",
    multi: "« cinquante photocopies, dix impressions couleur, deux plastifications et une reliure »",
    invoiceN: "deux cents photocopies, dix reliures, une rame de papier…",
    fix: "« déedéet, fukk rekk », « ajoute la reliure », « enlève les impressions »",
    gros: "rame, carton",
    detail: "page, pièce",
    detailEx: "« fukki page impression » → unite page",
    units: "page, copie, rame, pièce",
  },
  autre: {
    a: art("article", "l'article", "carton d'articles", "cartons d'articles", "carton", "le carton", "cartons", "carton article"),
    b: art("produit", "le produit", "paquet de produits", "paquets de produits", "paquet", "le paquet", "paquets", "paquet produit"),
    c: art("pièce", "la pièce", "pièce", "pièces", "pièce", "la pièce", "pièces", "pièce"),
    vocab: "Les articles du stock ont un nom français ou un nom donné par le commerçant (voir « aussi : » dans le contexte). Choisis l'article du contexte qui correspond.",
    multi: "« deux cartons, trois paquets et cinq pièces »",
    invoiceN: "deux cartons, trois paquets, cinq pièces…",
    fix: "« déedéet, benn carton rekk », « ajoute le paquet », « enlève les pièces »",
    gros: "carton, paquet",
    detail: "pièce",
    detailEx: "« ñaari pièce » → unite pièce",
    units: "pièce, carton, paquet",
  },
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Les exemples d'alimentation des consignes, et ce qui les remplace pour un autre métier (remplacés partout). */
function replacements(e: Examples): Array<[string, string]> {
  const { a, b, c } = e;
  return [
    // Listes de vocabulaire des vivres (consignes du direct et du vocal).
    [
      "Les articles du stock ont souvent un nom français ; le commerçant peut dire le nom wolof. ceeb = riz, diw ou diwlin = huile, suukar = sucre, meew = lait, mburu = pain, saabu = savon, soble = oignon, pombiteer = pomme de terre, ataaya = thé, kaani = piment, xorom = sel, ndox = eau. Choisis l'article du contexte qui correspond.",
      e.vocab,
    ],
    ["Articles en wolof : ceeb = riz, diw ou diwlin = huile, suukar = sucre, meew = lait, mburu = pain, saabu = savon, soble = oignon, ataaya = thé, xorom = sel.", e.vocab],
    ["(synonymes wolof : ceeb = riz, diw = huile, suukar = sucre, meew = lait, mburu = pain, saabu = savon, soble = oignon, ataaya = thé, xorom = sel, kaani = piment)", "(nom du stock, ses autres noms « aussi : » et les mots du métier)"],
    // Phrases d'exemple.
    ["« deux savons, deux sacs de riz, deux bidons d'huile et de l'eau »", e.multi],
    ["deux savons, trois sacs de riz, un bidon d'huile, du sucre…", e.invoiceN],
    ["« déedéet, benn saku rekk », « ajoute le savon », « enlève l'eau »", e.fix],
    ["« riz : 12 sacs ; huile : 3 bidons ; sucre : 40 kilos… »", `« ${a.name} : 12 ${a.units} ; ${b.name} : 3 ${b.units} ; ${c.name} : 40 ${c.units}… »`],
    ["« j'ai acheté 2 sacs de sucre à 20 000 »", `« j'ai acheté 2 ${c.many} à 20 000 »`],
    ["jënd naa ñetti sac ceeb", `jënd naa ñetti ${a.wo}`],
    ["« Ceeb bi, fukk ak ñaar la des. »", `« ${cap(a.woName)} bi, fukk ak ñaar la des. »`],
    ["ñaari bidon diw", `ñaari ${b.wo}`],
    ["2 bidons d'huile", `2 ${b.many}`],
    ["« ñaari sachet meew » → unite sachet", e.detailEx],
    ["(sac, bidon, carton) et au détail (sachet, kilo…)", `(${e.gros}) et au détail (${e.detail}…)`],
    ["« 2 sacs, puis 3 sacs, puis 7 sacs »", `« 2 ${a.units}, puis 3 ${a.units}, puis 7 ${a.units} »`],
    ["(2 + 3 + 7 = 12 sacs)", `(2 + 3 + 7 = 12 ${a.units})`],
    ["« 2 sacs à 20 000 »", `« 2 ${a.units} à 20 000 »`],
    ["« chaque sac »", `« chaque ${a.unit} »`],
    ["« le sac à »", `« ${a.theUnit} à »`],
    ["« par bidon »", `« par ${b.unit} »`],
    ["« ñaari bidon » = 2 bidons", `« ñaari ${b.unit} » = 2 ${b.units}`],
    ["(sacs, bidons, kilos)", `(${a.units}, ${b.units}, ${c.units})`],
    ["« trois sacs »", `« trois ${a.units} »`],
    ["« et le sucre ? »", `« et ${c.the} ? »`],
    // Descriptions des outils.
    ["(« riz », « p-huile »)", `(« ${a.name} »)`],
    ["(sac, bidon, sachet, kilo…)", `(${e.units}…)`],
    ["(sac, kg, bidon, pièce…)", `(${e.units}…)`],
    ["(sac, caisse, kilo, sachet, bidon…)", `(${e.units}…)`],
  ];
}

/** Le métier parle-t-il de vivres (riz, huile, sucre) ? Alimentation, restaurant, ou module « vivres » ajouté. */
export const speaksVivres = (activity: string | undefined | null, extra: readonly string[] = []) => modulesOf(activity, extra).has("vivres");

/**
 * Consignes de Gemini avec les exemples du métier de la boutique.
 * Alimentation et restaurant (vivres) : consignes inchangées.
 */
export function localizeInstruction(text: string, activity: string | undefined | null, extra: readonly string[] = []): string {
  if (speaksVivres(activity, extra)) return text;
  const e = EXAMPLES[metierOf(activity).id] ?? EXAMPLES.autre!;
  let out = text;
  for (const [from, to] of replacements(e)) out = out.split(from).join(to);
  return out;
}

/** Règle « hors métier » ajoutée aux consignes de chaque boutique. */
export function offTopicRule(activity: string | undefined | null): string {
  const m = metierOf(activity);
  return (
    `RESTE DANS LE MÉTIER (${m.label}) : tu parles seulement de cette entreprise, de ses articles, de ses clients, de son argent et de son travail. ` +
    "Un article d'un autre métier qui n'est pas dans le stock (de la nourriture chez un tailleur, du ciment dans une pharmacie, des médicaments dans une quincaillerie) n'est JAMAIS enregistré comme vente, achat ou stock sans question : " +
    "demande en une phrase si c'est bien pour la boutique, ou si c'est une dépense (repas, achat pour la maison). Une dépense de la boutique ou du patron reste toujours possible. " +
    "Pour une question sans rapport avec la boutique (politique, football, santé, devoirs…), réponds en une phrase que tu es là pour la boutique, puis reviens à ce que faisait le commerçant." +
    " Tes exemples et tes questions parlent toujours des articles de CE métier, jamais de ceux d'un autre."
  );
}

/**
 * Articles typiques de chaque famille de métiers. Un mot de ces familles, absent du stock, dans une boutique
 * qui ne fait pas ce métier = article hors métier (Jokko demande avant d'enregistrer).
 */
const FAMILIES: Array<{ owners: MetierId[]; module?: string; words: RegExp }> = [
  {
    owners: ["alimentation", "restauration", "boulangerie"],
    module: "vivres",
    words: /\b(riz|ceeb|ceebu|huile(?!\s+(de\s+)?(coco|karite|moteur|d'argan|essentielle|de massage|pour cheveux))|diw|diwlin|sucre|suukar|lait en poudre|meew|oignons?|soble|pommes? de terre|pombiteer|sardines?|concentre de tomate|bouillon|pates alimentaires|spaghetti|macaroni|mil|farine|niebe|arachides?|gerte)\b/i,
  },
  {
    owners: ["pharmacie"],
    words: /\b(paracetamol|doliprane|efferalgan|amoxicilline|antibiotiques?|ibuprofene|comprimes?|gelules?|seringues?|antipaludique|coartem|vaccins?|medicaments?)\b/i,
  },
  {
    owners: ["quincaillerie"],
    words: /\b(ciment|fer de \d+|fer a beton|barres? de fer|parpaings?|tole|toles|gravier|carrelage|pointes|fil de fer|tuyau pvc|robinet)\b/i,
  },
];

const plainText = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ñ/g, "n");

/**
 * Le nom dit est-il un article d'un AUTRE métier ? (seulement s'il n'est pas déjà dans le stock de la boutique :
 * un commerçant qui vend aussi du riz l'a dans son stock, et Jokko ne lui pose pas de question).
 * Renvoie le métier propriétaire (« alimentation »), sinon null.
 */
export function foreignArticle(name: string | null | undefined, activity: string | undefined | null, extra: readonly string[] = []): MetierId | null {
  if (!name?.trim()) return null;
  const id = metierOf(activity).id;
  // « Autre activité » : on ne sait pas ce que vend la boutique, Jokko ne bloque rien.
  if (id === "autre") return null;
  const modules = modulesOf(activity, extra);
  const p = plainText(name);
  for (const f of FAMILIES) {
    if (f.owners.includes(id) || (f.module && modules.has(f.module as never))) continue;
    // Un tailleur vend du fil ; « fil de fer » reste de la quincaillerie.
    if (f.words.test(p)) return f.owners[0];
  }
  return null;
}
