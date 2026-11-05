/**
 * Métiers : à l'inscription, le commerçant dit son activité ; Jokko se règle tout seul
 * (écrans utiles, unités, vocabulaire donné à Gemini, règles du métier).
 * Pas d'import avec « @/ » : ce fichier est aussi lu par le serveur (consignes de Gemini).
 */

export type MetierId = "alimentation" | "reparation" | "pharmacie" | "quincaillerie" | "vetements" | "multiservice" | "autre";

export type Metier = {
  id: MetierId;
  /** Ce que le commerçant choisit. */
  label: string;
  /** Mots qui reconnaissent ce métier dans une activité écrite à la main. */
  keywords: RegExp;
  /** Unités proposées dans le stock. */
  units: string[];
  /** Carnet de réparations (dépôt, réparé, rendu). */
  atelier: boolean;
  /** Dates de péremption suivies et alertes. */
  peremption: boolean;
  /** Ce que Gemini doit savoir de ce métier. */
  consigne: string;
  /** Vocabulaire wolof de l'alimentation (riz, huile, sucre…) donné à Gemini : seulement pour ce métier. */
  vivres: boolean;
  /** Exemples montrés dans l'application (jamais ceux d'un autre métier). */
  ex: { stock: string; search: string; invoice: string; prompts: string[]; units: string };
};

export const METIERS: Metier[] = [
  {
    id: "alimentation",
    label: "Alimentation générale, boutique de quartier",
    keywords: /aliment|boutique|epicer|superette|commerce general|grossiste|demi.?gros|riz|ceeb/i,
    units: ["sac", "bidon", "carton", "paquet", "kilo", "litre", "pièce", "boîte", "sachet"],
    atelier: false,
    peremption: true,
    consigne: "Alimentation générale : ventes au détail et en gros (sac, bidon, sachet), crédit des clients du quartier.",
    vivres: true,
    ex: { stock: "« 10 sacs de riz à 18 000, acheté à 16 000 ; 5 bidons d'huile ; 20 savons à 300 »", search: "riz, huile, sucre…", invoice: "« Facture Moussa ñaari bidon diw » ou « Fais une facture de 15 000 pour Awa »", prompts: ["Ajoute une vente de 15 000", "Il me reste combien de riz ?", "Qui me doit de l'argent ?", "Jaay naa 2 huile", "Caisse du jour", "Relance Moussa"], units: "sac, bidon, carton…" },
  },
  {
    id: "reparation",
    label: "Réparation de téléphones et pièces détachées",
    keywords: /repar|répar|telephon|téléphon|portable|smartphone|piece.?detach|pièce|gsm|ecran|écran|informatique|ordinateur/i,
    units: ["pièce", "unité", "carton", "lot"],
    atelier: true,
    peremption: false,
    consigne:
      "Réparateur de téléphones : il vend des pièces détachées (écrans, connecteurs, batteries, nappes, vitres, coques, chargeurs) " +
      "aux clients et à d'autres réparateurs, et il fait des réparations. Une réparation passe par le carnet (outil reparation) : " +
      "le client dépose l'appareil (nom, téléphone, appareil, panne, prix, avance), le réparateur pose les pièces (elles sortent du stock), " +
      "puis le client revient le chercher, parfois des mois après, et paie le reste (ou le reste va en dette). " +
      "Bénéfice d'une réparation = prix de la réparation − prix d'achat des pièces : c'est l'outil qui le calcule. " +
      "Mots : ekraan / écran, konektëer / connecteur de charge, batri / batterie, nappe, vitre, coque, chargeur, « dafa dee » = l'appareil ne s'allume plus.",
    vivres: false,
    ex: { stock: "« 10 écrans iPhone 11 à 25 000, achetés à 15 000 ; 20 connecteurs à 2 000 ; 5 batteries Tecno »", search: "écran, batterie, connecteur…", invoice: "« Facture Awa, écran iPhone 11, 25 000 »", prompts: ["Awa dépose un iPhone 11, écran cassé", "Quels téléphones sont au dépôt ?", "Il me reste combien d'écrans ?", "Qui me doit de l'argent ?", "Caisse du jour", "Bénéfice de la semaine"], units: "pièce, lot, carton…" },
  },
  {
    id: "pharmacie",
    label: "Pharmacie, dépôt de médicaments",
    keywords: /pharma|medicament|médicament|officine|depot pharm/i,
    units: ["boîte", "plaquette", "flacon", "tube", "pièce", "carton"],
    atelier: false,
    peremption: true,
    consigne:
      "Pharmacie : Jokko gère SEULEMENT la boutique (stock, ventes, caisse, dettes, dates de péremption, codes-barres). " +
      "INTERDIT : tout conseil médical, posologie, dose, indication, contre-indication, diagnostic ou avis de santé, même si on insiste, même pour un proche. " +
      "Réponse dans ce cas : « Duma joxe ndigal ci wér-gi-yaram. » (en français : « Je ne donne pas de conseil de santé : c'est le pharmacien qui conseille. »). " +
      "Signale les produits proches de leur date de péremption quand on te demande le stock.",
    vivres: false,
    ex: { stock: "« 20 boîtes de paracétamol à 1 000, achetées à 700 ; 10 flacons de sirop ; 5 tubes de pommade »", search: "nom du médicament ou code…", invoice: "« Facture de 12 500 pour Awa »", prompts: ["Il me reste combien de paracétamol ?", "Quels produits périment bientôt ?", "Ajoute une vente de 3 500", "Qui me doit de l'argent ?", "Caisse du jour", "Bénéfice du mois"], units: "boîte, plaquette, flacon…" },
  },
  {
    id: "quincaillerie",
    label: "Quincaillerie, matériaux",
    keywords: /quincaill|materiau|matériau|ciment|fer|peinture|plomberie|electricit|électricit/i,
    units: ["sac", "pièce", "barre", "mètre", "kilo", "litre", "pot", "carton", "rouleau"],
    atelier: false,
    peremption: false,
    consigne: "Quincaillerie : ciment, fer, peinture, plomberie, électricité ; ventes en gros et au détail (mètre, barre, kilo).",
    vivres: false,
    ex: { stock: "« 50 sacs de ciment à 4 500, achetés à 4 000 ; 20 barres de fer de 10 ; 10 pots de peinture »", search: "ciment, fer, peinture…", invoice: "« Facture Moussa, 10 sacs de ciment »", prompts: ["Il me reste combien de ciment ?", "Ajoute une vente de 45 000", "Qui me doit de l'argent ?", "Caisse du jour", "Relance Moussa", "Bénéfice de la semaine"], units: "sac, barre, mètre…" },
  },
  {
    id: "vetements",
    label: "Vêtements, tissus, chaussures",
    keywords: /vetement|vêtement|tissu|habit|chaussure|mode|bazin|wax|couture|friperie|feug jaay/i,
    units: ["pièce", "mètre", "paire", "lot", "balle"],
    atelier: false,
    peremption: false,
    consigne: "Vêtements et tissus : pièces, mètres de tissu, paires ; ventes souvent à crédit.",
    vivres: false,
    ex: { stock: "« 20 pantalons à 7 500, achetés à 5 000 ; 30 mètres de bazin ; 10 paires de chaussures »", search: "pantalon, bazin, chaussures…", invoice: "« Facture Awa, 5 mètres de bazin »", prompts: ["Il me reste combien de pantalons ?", "Ajoute une vente de 15 000", "Qui me doit de l'argent ?", "Caisse du jour", "Relance Awa", "Bénéfice de la semaine"], units: "pièce, mètre, paire…" },
  },
  {
    id: "multiservice",
    label: "Multiservice (impression, photocopie, transfert d'argent)",
    keywords: /multi.?service|photocop|impression|imprim|cyber|transfert|secretariat|secrétariat/i,
    units: ["page", "copie", "pièce", "unité", "rame"],
    atelier: true,
    peremption: false,
    consigne:
      "Multiservice : impression, photocopie, saisie, transfert d'argent, petites réparations. Un service sans marchandise est une vente " +
      "(« 50 photocopies à 25 F » = 50 × 25 F, calculé par l'outil) ; tout est bénéfice sauf le papier et l'encre achetés.",
    vivres: false,
    ex: { stock: "« 10 rames de papier à 3 500 ; 2 cartouches d'encre »", search: "papier, encre…", invoice: "« Facture de 5 000 pour Moussa, 200 photocopies »", prompts: ["50 photocopies à 25", "Ajoute une vente de 2 000", "Qui me doit de l'argent ?", "Caisse du jour", "Il me reste combien de papier ?", "Bénéfice de la semaine"], units: "rame, pièce, unité…" },
  },
  {
    id: "autre",
    label: "Autre activité",
    keywords: /$^/,
    units: ["pièce", "unité", "carton", "paquet", "kilo", "litre"],
    atelier: false,
    peremption: false,
    consigne: "",
    vivres: false,
    ex: { stock: "« 10 articles à 2 000, achetés à 1 500 »", search: "nom de l'article…", invoice: "« Fais une facture de 15 000 pour Awa »", prompts: ["Ajoute une vente de 15 000", "Qu'est-ce qui manque dans le stock ?", "Qui me doit de l'argent ?", "Caisse du jour", "Bénéfice de la semaine", "Relance Moussa"], units: "pièce, carton, paquet…" },
  },
];

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Le métier d'une boutique, d'après son activité (choisie dans la liste ou écrite à la main). */
export function metierOf(activity: string | undefined | null): Metier {
  const a = (activity ?? "").trim();
  if (!a) return METIERS[0];
  const exact = METIERS.find((m) => m.label === a || m.id === a);
  if (exact) return exact;
  const p = plain(a);
  return METIERS.find((m) => m.id !== "autre" && (m.keywords.test(a) || m.keywords.test(p))) ?? METIERS[METIERS.length - 1];
}

/** Bloc des consignes de Gemini pour le métier de la boutique (règle de santé pour tous). */
export function metierInstruction(activity: string | undefined | null): string {
  const m = metierOf(activity);
  const lines = [
    `MÉTIER DE LA BOUTIQUE : ${activity?.trim() || m.label}.`,
    m.consigne,
    `UN SEUL MÉTIER : cette boutique fait seulement « ${m.label} ». Ne propose jamais d'article d'un autre métier et n'en invente pas. ` +
      "Si le commerçant cite un article qui n'est pas dans son stock, demande avant de le créer.",
    "SANTÉ, POUR TOUTES LES BOUTIQUES : ne donne jamais de conseil médical, de dose ou d'avis de santé ; dis que ce n'est pas ton rôle.",
  ].filter(Boolean);
  return lines.join("\n");
}

const DAY = 86_400_000;

/**
 * Articles (ou lots) qui périment bientôt (dans `days` jours) ou déjà périmés, du plus urgent au moins urgent.
 * Un article avec des lots donne une ligne par lot ; sinon une ligne avec sa date.
 */
export function expiringSoon<T extends { expiresAt?: string; stock: number; lots?: Array<{ expiresAt: string; qty: number; lot?: string }> }>(
  products: T[],
  days = 30,
  now = Date.now(),
): Array<T & { daysLeft: number; lotQty: number; lotRef?: string }> {
  const left = (d: string) => Math.ceil((new Date(`${d}T23:59:59`).getTime() - now) / DAY);
  return products
    .flatMap((p) =>
      p.lots?.length
        ? p.lots.filter((l) => l.qty > 0).map((l) => ({ ...p, expiresAt: l.expiresAt, daysLeft: left(l.expiresAt), lotQty: l.qty, ...(l.lot ? { lotRef: l.lot } : {}) }))
        : p.expiresAt && p.stock > 0
          ? [{ ...p, daysLeft: left(p.expiresAt), lotQty: p.stock }]
          : [],
    )
    .filter((p) => p.daysLeft <= days)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}
