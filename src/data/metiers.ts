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
  },
  {
    id: "quincaillerie",
    label: "Quincaillerie, matériaux",
    keywords: /quincaill|materiau|matériau|ciment|fer|peinture|plomberie|electricit|électricit/i,
    units: ["sac", "pièce", "barre", "mètre", "kilo", "litre", "pot", "carton", "rouleau"],
    atelier: false,
    peremption: false,
    consigne: "Quincaillerie : ciment, fer, peinture, plomberie, électricité ; ventes en gros et au détail (mètre, barre, kilo).",
  },
  {
    id: "vetements",
    label: "Vêtements, tissus, chaussures",
    keywords: /vetement|vêtement|tissu|habit|chaussure|mode|bazin|wax|couture|friperie|feug jaay/i,
    units: ["pièce", "mètre", "paire", "lot", "balle"],
    atelier: false,
    peremption: false,
    consigne: "Vêtements et tissus : pièces, mètres de tissu, paires ; ventes souvent à crédit.",
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
  },
  {
    id: "autre",
    label: "Autre activité",
    keywords: /$^/,
    units: ["pièce", "unité", "carton", "paquet", "kilo", "litre"],
    atelier: false,
    peremption: false,
    consigne: "",
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
