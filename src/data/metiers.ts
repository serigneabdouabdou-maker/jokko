/**
 * Métiers : à l'inscription, le commerçant dit son activité ; Jokko se règle tout seul
 * (écrans utiles, unités, vocabulaire donné à Gemini, règles du métier).
 * Pas d'import avec « @/ » : ce fichier est aussi lu par le serveur (consignes de Gemini).
 */

export type MetierId = "alimentation" | "reparation" | "pharmacie" | "quincaillerie" | "couture" | "vetements" | "multiservice" | "autre";

/**
 * Modules : morceaux de l'appli propres à un métier. Le métier choisi donne ses modules ; le patron peut en ajouter
 * d'un autre métier dans les réglages (ex. boutique + transfert d'argent). Un module absent n'apparaît nulle part :
 * ni écran, ni outil de Jokko, ni consigne de Gemini.
 */
export type ModuleId = "atelier" | "couture" | "peremption" | "vivres" | "services";

/** Écrans qui dépendent du métier (les autres sont communs à toutes les boutiques). */
export const OPTIONAL_SCREENS = ["stock", "scanner", "distance", "boutiques", "conseiller", "atelier", "couture"] as const;
export type OptionalScreen = (typeof OPTIONAL_SCREENS)[number];
/** Écran apporté par un module ajouté dans les réglages. */
const MODULE_SCREEN: Partial<Record<ModuleId, OptionalScreen>> = { atelier: "atelier", couture: "couture" };
export const MODULES: { id: ModuleId; label: string; desc: string }[] = [
  { id: "atelier", label: "Atelier de réparation", desc: "Dépôts d'appareils, pannes, pièces posées, « c'est prêt » sur WhatsApp" },
  { id: "couture", label: "Atelier couture", desc: "Mesures des clients, commandes, essayages, « ton habit est prêt »" },
  { id: "peremption", label: "Dates de péremption", desc: "Lots, dates, alertes avant que ça périme" },
  { id: "vivres", label: "Vivres en wolof", desc: "Jokko comprend ceeb, diw, suukar… (riz, huile, sucre)" },
  { id: "services", label: "Services et transfert", desc: "Photocopies, impression, transfert d'argent vendus comme services" },
];

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
  /**
   * Écrans propres à ce métier (en plus des écrans communs : parler, ventes, clients, dettes, caisse, dépenses,
   * factures, bilan, équipe, journal, offre, réglages). Un écran absent d'ici n'apparaît pas dans le menu.
   */
  screens: OptionalScreen[];
  /** Ce que le Conseiller IA doit regarder en priorité pour ce métier (conseils de gestion, jamais de santé). */
  conseiller?: string;
  /** Autres modules donnés par ce métier (en plus de atelier / peremption / vivres ci-dessus). */
  modules?: ModuleId[];
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
    screens: ["stock", "scanner", "distance", "boutiques", "conseiller"],
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
    screens: ["stock", "atelier", "distance", "boutiques", "conseiller"],
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
    screens: ["stock", "scanner", "distance", "boutiques", "conseiller"],
    conseiller:
      "PHARMACIE : conseils de GESTION uniquement, jamais de conseil médical, de posologie ni de remplacement d'un médicament par un autre. " +
      "Regarde en priorité : (1) les produits à rotation RAPIDE (peu de jours de stock) : ne jamais tomber en rupture, commander à temps chez le grossiste répartiteur ; " +
      "(2) les produits LENTS ou DORMANTS (beaucoup de jours sans vente) : moins en commander, ne plus racheter avant d'avoir écoulé ; " +
      "(3) la PÉREMPTION : les lots qui périment bientôt (liste peremption) à écouler en premier (premier périmé, premier sorti) ou à négocier en retour avec le grossiste avant la date ; " +
      "(4) l'argent immobilisé dans le stock lent ; (5) les marges par produit et les dettes des clients.",
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
    screens: ["stock", "scanner", "distance", "boutiques", "conseiller"],
    atelier: false,
    peremption: false,
    consigne: "Quincaillerie : ciment, fer, peinture, plomberie, électricité ; ventes en gros et au détail (mètre, barre, kilo).",
    vivres: false,
    ex: { stock: "« 50 sacs de ciment à 4 500, achetés à 4 000 ; 20 barres de fer de 10 ; 10 pots de peinture »", search: "ciment, fer, peinture…", invoice: "« Facture Moussa, 10 sacs de ciment »", prompts: ["Il me reste combien de ciment ?", "Ajoute une vente de 45 000", "Qui me doit de l'argent ?", "Caisse du jour", "Relance Moussa", "Bénéfice de la semaine"], units: "sac, barre, mètre…" },
  },
  {
    id: "couture",
    label: "Couture, tailleur",
    keywords: /tailleur|couture|couturi|atelier de couture|brodeur|broderie|styliste/i,
    units: ["pièce", "mètre", "yard", "ensemble"],
    screens: ["couture", "stock"],
    conseiller:
      "TAILLEUR : regarde les commandes en retard (le client risque de partir), les avances trop faibles (demander au moins la moitié), " +
      "le reste à encaisser, les tissus et fournitures qui manquent avant la Tabaski et la Korité, et les meilleurs modèles (ceux qui rapportent le plus).",
    atelier: false,
    peremption: false,
    modules: ["couture"],
    consigne:
      "Tailleur (atelier de couture) : il coud sur mesure (grand boubou, taille basse, kaftan, ensemble, costume, robe). " +
      "Une commande = un client, ses mesures, le modèle, le tissu (apporté par le client ou vendu par l'atelier), le prix, l'avance, la date promise. " +
      "Étapes : reçu → coupe → couture → finition → prêt → livré. Le reste à payer = prix − avance (calculé par l'outil). " +
      "Mesures en centimètres (poitrine, taille, hanches, épaule, manche, longueur, cou, tour de bras). " +
      "Il vend aussi du tissu au mètre et des fournitures (fil, boutons). Les pics de travail : Tabaski, Korité, mariages. " +
      "BEAUCOUP DE TAILLEURS NE SAVENT PAS ÉCRIRE : tout passe par la voix, avec l'outil couture. " +
      "Une commande dite (« Awa Diop, grand boubou bazin, poitrine ñeent-fukk ak juróom, prix juróomi junni, avance ñaari junni, gaawu ») : appelle couture « commander » TOUT DE SUITE avec les mots exacts dans chaque case, sans demander de confirmation. " +
      "Il manque seulement le client ou l'habit : demande-le, une seule question. Le prix, l'avance, les mesures et la date peuvent manquer. " +
      "MESURES = CENTIMÈTRES, JAMAIS DËRËM : « ñeent-fukk ak juróom » pour une mesure = 45 cm. Seuls le prix, l'avance et les paiements sont de l'argent (en dërëm). " +
      "Mots wolof : dagg = couper (étape coupe), ñaw = coudre (étape couture), pare na = c'est prêt, jël = le client récupère (livrer), natt = mesurer, gudd = long ; « avance », « mesure », « manche » se disent souvent en français. " +
      "Après l'enregistrement, dis le numéro C-… (à écrire sur le tissu) et le reste à payer avec les mots de l'outil.",
    vivres: false,
    ex: { stock: "« 30 mètres de bazin à 3 500 ; 20 bobines de fil ; 100 boutons »", search: "bazin, wax, fil…", invoice: "« Facture Awa, grand boubou, 25 000 »", prompts: ["Commande d'Awa : grand boubou, 25 000, avance 10 000", "Quels habits sont prêts ?", "Mesures de Moussa", "Qui me doit de l'argent ?", "Caisse du jour", "Bénéfice de la semaine"], units: "mètre, pièce, ensemble…" },
  },
  {
    id: "vetements",
    label: "Vêtements, tissus, chaussures",
    keywords: /vetement|vêtement|tissu|habit|chaussure|mode|bazin|wax|friperie|feug jaay/i,
    units: ["pièce", "mètre", "paire", "lot", "balle"],
    screens: ["stock", "scanner", "distance", "boutiques", "conseiller"],
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
    screens: ["stock", "atelier", "distance", "conseiller"],
    atelier: true,
    peremption: false,
    modules: ["services"],
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
    screens: ["stock", "scanner", "distance", "boutiques", "conseiller"],
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

/** Modules de la boutique : ceux de son métier + ceux ajoutés par le patron dans les réglages. */
export function modulesOf(activity: string | undefined | null, extra: readonly string[] = []): Set<ModuleId> {
  const m = metierOf(activity);
  const set = new Set<ModuleId>(m.modules ?? []);
  if (m.atelier) set.add("atelier");
  if (m.peremption) set.add("peremption");
  if (m.vivres) set.add("vivres");
  for (const id of extra) if (MODULES.some((x) => x.id === id)) set.add(id as ModuleId);
  return set;
}

/** Écrans propres à la boutique : ceux de son métier + ceux des modules ajoutés. */
export function screensOf(activity: string | undefined | null, extra: readonly string[] = []): Set<OptionalScreen> {
  const set = new Set<OptionalScreen>(metierOf(activity).screens);
  for (const id of modulesOf(activity, extra)) {
    const screen = MODULE_SCREEN[id];
    if (screen) set.add(screen);
  }
  return set;
}

/** Nom d'un écran adapté au métier (ex. le stock d'un tailleur = ses tissus et fournitures). */
export function screenLabel(activity: string | undefined | null, screen: string, fallback: string): string {
  const id = metierOf(activity).id;
  if (id === "couture" && screen === "stock") return "Tissus et fournitures";
  if (id === "reparation" && screen === "stock") return "Pièces";
  if (id === "pharmacie" && screen === "stock") return "Médicaments";
  return fallback;
}

/** Ce que Gemini doit savoir d'un module ajouté à une boutique d'un autre métier. */
const MODULE_CONSIGNE: Record<ModuleId, string> = {
  atelier: "MODULE ATELIER DE RÉPARATION : la boutique répare aussi des appareils (outil reparation : dépôt, pièces, acompte, rendu).",
  couture: "MODULE COUTURE : la boutique coud aussi sur mesure (outil couture : commande dite à la voix, mesures en centimètres jamais en dërëm, avance, étape, livraison).",
  peremption: "MODULE PÉREMPTION : certains articles ont des dates de péremption suivies par lot.",
  vivres: "",
  services: "MODULE SERVICES : photocopies, impression et transfert d'argent sont vendus comme des services (une vente sans stock).",
};

/** Bloc des consignes de Gemini pour le métier de la boutique (règle de santé pour tous). */
export function metierInstruction(activity: string | undefined | null, extra: readonly string[] = []): string {
  const m = metierOf(activity);
  const own = modulesOf(activity);
  const added = [...modulesOf(activity, extra)].filter((id) => !own.has(id));
  const lines = [
    `MÉTIER DE LA BOUTIQUE : ${activity?.trim() || m.label}.`,
    m.consigne,
    ...added.map((id) => MODULE_CONSIGNE[id]),
    `MÉTIER PRINCIPAL : cette boutique fait « ${m.label} »${added.length ? ` (avec ${added.map((id) => MODULES.find((x) => x.id === id)?.label).join(", ")})` : ""}. ` +
      "Ne propose jamais d'article ni de service d'un autre métier et n'en invente pas. " +
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

/** Consigne du Conseiller IA pour le métier de la boutique (vide si rien de particulier). */
export function conseillerInstruction(activity: string | undefined | null): string {
  const m = metierOf(activity);
  return m.conseiller ? `\n\nMÉTIER DE CETTE BOUTIQUE\n- ${m.conseiller}\n- SANTÉ : jamais de conseil médical, de dose ou d'avis de santé, pour aucune boutique.` : "\n\n- SANTÉ : jamais de conseil médical, de dose ou d'avis de santé.";
}
