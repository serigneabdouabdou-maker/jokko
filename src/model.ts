export type Lang = "fr" | "wo" | "en" | "ff";

/** Vente au détail d'un article : 1 sac = 50 sachets à 150 F. */
/** Vente au détail : unité (sachet, kilo…), combien dans une unité de gros, prix, et son code-barres. */
export type Retail = { unit: string; perUnit: number; price: number; barcode?: string };

export type Product = {
  id: string;
  name: string;
  /** Unité de gros (sac, bidon, carton…). Le stock est compté dans cette unité (50 sachets vendus = 1 sac). */
  unit: string;
  stock: number;
  min: number;
  /** Prix de vente d'une unité de gros. */
  price: number;
  /** Prix d'achat d'une unité de gros (pour le bénéfice). */
  cost?: number;
  retail?: Retail;
  /** Code-barres de l'unité de gros (code du fabricant, ou code Jokko imprimé sur une étiquette). */
  barcode?: string;
  /** Autres noms (wolof, surnoms) : « diwu oto » pour l'huile moteur. Aident Jokko à reconnaître l'article. */
  aliases?: string[];
  /** Date de péremption (AAAA-MM-JJ) : médicaments, lait, conserves… Jokko prévient avant.
   *  Avec des lots, c'est la date du lot qui périme le plus tôt. */
  expiresAt?: string;
  /** Lots reçus avec leur date (pharmacie) : vendus du plus proche au plus lointain. */
  lots?: Lot[];
  /** Photo de l'article (stockage « vitrine »), montrée sur la vitrine publique. */
  photoPath?: string;
  /** Montré sur la vitrine publique de l'entreprise. */
  vitrine?: boolean;
};

/** Un lot : combien d'unités, leur date de péremption, et le numéro de lot lu sur la boîte. */
export type Lot = { expiresAt: string; qty: number; lot?: string };

/** Réparation au comptoir (téléphones, ordinateurs…) : le client laisse l'appareil, revient le chercher, parfois des mois après. */
export type RepairStatus = "depot" | "repare" | "rendu" | "annule";
/** Pièce posée : prise dans le stock (productId) ou achetée exprès ; cost = prix d'achat total de la pièce. */
export type RepairPart = { productId?: string; label: string; qty: number; cost: number };
export type Repair = {
  id: string;
  /** Jour du dépôt. */
  at: string;
  /** Numéro court du ticket (R-001), à écrire sur l'appareil. */
  number: string;
  clientId?: string;
  clientName: string;
  phone: string;
  /** Appareil : « iPhone 11 », « Tecno Spark 10 ». */
  device: string;
  /** Panne : « écran cassé, connecteur de charge ». */
  problem: string;
  /** Prix de la réparation (0 = pas encore fixé). */
  price: number;
  /** Déjà payé (avance + paiements). */
  paid: number;
  parts: RepairPart[];
  status: RepairStatus;
  repairedAt?: string;
  returnedAt?: string;
  /** Garantie en jours, si le réparateur en donne une. */
  warrantyDays?: number;
};

export type Client = {
  id: string;
  name: string;
  phone: string;
  debt: number;
  /** Date à laquelle la dette doit être payée. */
  dueAt?: string;
  /** Mesures du client en cm (tailleurs) : reprises à chaque nouvelle commande. */
  measures?: Record<string, number>;
  /** Boulangerie : ce que cette boutique cliente prend chaque matin (livré à crédit en un toucher). */
  tournee?: { productId: string; qty: number }[];
};

export type Sale = {
  id: string;
  at: string;
  label: string;
  amount: number;
  qty?: number;
  productId?: string;
  clientId?: string;
  /** Coût d'achat de la marchandise vendue (bénéfice = amount - cost). Absent si inconnu. */
  cost?: number;
  /** Vente au détail (qty en unités de détail, ex. sachets). */
  retail?: boolean;
  unit?: string;
  /** Moyen de paiement. Absent = espèces. Seules les espèces entrent dans le tiroir. */
  payment?: Payment;
  /** Paiement Wave sans API : vérifié par le patron dans son appli Wave (lu sur le serveur) */
  checked?: boolean;
};

export type Payment = "especes" | "wave" | "om" | "credit";

export type PlanName = "gratuit" | "medium" | "avance";
export type ShopPlan = { plan: PlanName; until: string | null; trialUntil: string | null };
export const PAYMENT_LABELS: Record<Payment, string> = { especes: "Espèces", wave: "Wave", om: "Orange Money", credit: "Crédit" };

/**
 * kind « perte » : marchandise perdue ou manquante à l'inventaire (au prix d'achat).
 * kind « achat » : marchandise achetée pour le stock. L'argent sort de la caisse, mais ce n'est pas
 * une dépense du bénéfice : le coût compte quand l'article est vendu.
 */
export type Expense = { id: string; at: string; label: string; amount: number; kind?: "depense" | "perte" | "achat" };

export type InvoiceLine = { label: string; qty: number; unit: string; unitPrice: number; productId?: string };

export type Invoice = {
  id: string;
  number: string;
  at: string;
  clientId: string;
  /** Total de la facture (somme des lignes, ou montant seul si pas de lignes). */
  amount: number;
  status: "brouillon" | "envoyee" | "payee";
  lines?: InvoiceLine[];
  dueAt?: string;
  /** Chemin du PDF en ligne (stockage Supabase), une fois envoyé. */
  pdfPath?: string;
};

export type Reminder = {
  id: string;
  at: string;
  clientId: string;
  note: string;
};

/** Couture sur mesure (tailleurs) : une commande suit des étapes que le client voit sur son lien de suivi. */
export type CoutureStatus = "recu" | "coupe" | "couture" | "finition" | "pret" | "livre" | "annule";
export type CoutureOrder = {
  id: string;
  /** Jour de la commande. */
  at: string;
  /** Numéro court (C-001), à écrire sur le tissu. */
  number: string;
  clientId?: string;
  clientName: string;
  phone: string;
  /** Modèle : « grand boubou brodé », « taille basse ». */
  garment: string;
  /** Tissu : « bazin bleu apporté par le client », « 6 m de wax de l'atelier ». */
  fabric: string;
  /** Mesures en cm, au moment de la commande (cou, épaule, poitrine…). */
  measures: Record<string, number>;
  price: number;
  /** Déjà payé (avance + acomptes). */
  paid: number;
  /** Date promise au client (AAAA-MM-JJ). */
  dueAt?: string;
  status: CoutureStatus;
  /** Code secret du lien de suivi donné au client (jokkoapp.com/?suivi=…). */
  token: string;
  note?: string;
  readyAt?: string;
  deliveredAt?: string;
  /** Modèle choisi dans le Studio d'essayage (image de la galerie Jokko, montrée au client sur son lien de suivi). */
  modelPath?: string;
};

export type Shortcut = { id: string; phrase: string; does: string };

export type Shop = {
  id: string;
  name: string;
  city: string;
  activity: string;
  openingCash: number;
  /** Date du dernier inventaire (comptage du stock). */
  lastInventoryAt?: string;
  /** Infos imprimées sur les factures */
  address?: string;
  phone?: string;
  ninea?: string;
  /** Comment payer (ex. « Wave ou Orange Money au 77 123 45 67 ») */
  paymentInfo?: string;
  invoiceNote?: string;
  /** Lien Wave Business de la boutique (paiement sans API, montré en QR code) */
  waveLink?: string;
  /** Position de la boutique (donnée par le patron, arrondie à environ 1 km) pour la carte de CFC. */
  location?: { lat: number; lng: number; at: string };
  /** Modules ajoutés par le patron en plus de ceux de son métier (ex. « services » pour une boutique qui fait du transfert). */
  modules?: string[];
  /** Offre de la boutique, lue sur le serveur (jamais envoyée par le téléphone) */
  plan?: ShopPlan;
  products: Product[];
  clients: Client[];
  sales: Sale[];
  expenses: Expense[];
  invoices: Invoice[];
  reminders: Reminder[];
  shortcuts: Shortcut[];
  /** Carnet de réparations (réparateurs) ; absent pour une boutique qui n'en fait pas. */
  repairs?: Repair[];
  /** Commandes de couture (tailleurs) ; absent pour une boutique qui n'en fait pas. */
  couture?: CoutureOrder[];
};

export type Profile = {
  /** Compte Supabase propriétaire de ce profil (sur ce téléphone). */
  userId?: string;
  phone: string;
  owner: string;
  lang: Lang;
  /** Ancien réglage, gardé pour les copies du téléphone. Le vrai rôle vient de roles (fixé par le serveur). */
  role: "patron" | "caissier";
  /** Rôle dans chaque boutique (id → rôle), lu sur le serveur. Absent = boutique à soi (patron). */
  roles?: Record<string, Role>;
  geminiKey: string;
  speak: boolean;
  shopId: string;
  shops: Shop[];
  /**
   * Version des conditions acceptée (ex. « 2026-10-31 »). null = vérifié sur le serveur : pas encore acceptée.
   * Absent = inconnu (copie du téléphone, hors ligne) : on ne bloque pas.
   */
  termsVersion?: string | null;
};

/** patron : voit et règle tout. vendeur : vend, encaisse, note les dettes ; ne touche ni aux prix ni au bilan. */
export type Role = "patron" | "vendeur";

export function roleIn(profile: Pick<Profile, "roles" | "shopId">, shopId = profile.shopId): Role {
  return profile.roles?.[shopId] === "vendeur" ? "vendeur" : "patron";
}

export type ChatMessage = { id: string; role: "user" | "jokko"; text: string; at: string };

const KEY = "jokko.v1";

/** Identifiant unique, même entre plusieurs téléphones (sauvegardé tel quel dans Supabase). */
export function uid(prefix = "id"): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

export function money(n: number): string {
  return `${Math.round(n).toLocaleString("fr-FR")} F`;
}

export function todayStamp(): string {
  return new Date().toISOString();
}

export function isToday(iso: string): boolean {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

export function seedShop(): Shop {
  return {
    id: uid("shop"),
    name: "Boutique Awa",
    city: "Pikine",
    activity: "Alimentation",
    openingCash: 20000,
    products: [
      { id: uid("p"), name: "Riz brisé", unit: "sac", stock: 12, min: 4, price: 18000 },
      { id: uid("p"), name: "Huile", unit: "bidon", stock: 3, min: 5, price: 7500 },
      { id: uid("p"), name: "Sucre", unit: "kg", stock: 40, min: 10, price: 700 },
      { id: uid("p"), name: "Lait", unit: "pièce", stock: 8, min: 6, price: 900 },
    ],
    clients: [
      { id: uid("c"), name: "Awa Diop", phone: "221771112233", debt: 0 },
      { id: uid("c"), name: "Moussa Ndiaye", phone: "221770000111", debt: 20000 },
      { id: uid("c"), name: "Fatou Sall", phone: "221775556677", debt: 8500 },
    ],
    sales: [
      { id: uid("s"), at: todayStamp(), label: "Riz brisé", amount: 18000, qty: 1 },
    ],
    expenses: [{ id: uid("e"), at: todayStamp(), label: "Transport", amount: 2500 }],
    invoices: [],
    reminders: [],
    shortcuts: [
      { id: uid("k"), phrase: "ouverture", does: "Dis le fond de caisse du matin" },
      { id: uid("k"), phrase: "soir", does: "Fais la clôture de caisse" },
    ],
  };
}

/** Boutique neuve d'un vrai commerçant : vide, il ajoute ses articles en parlant ou dans Stock. */
export function newShop(name: string, activity: string, city = ""): Shop {
  return {
    id: uid("shop"),
    name,
    city,
    activity,
    openingCash: 0,
    // Boutique neuve : premier inventaire attendu le mois prochain.
    lastInventoryAt: new Date().toISOString(),
    products: [],
    clients: [],
    sales: [],
    expenses: [],
    invoices: [],
    reminders: [],
    shortcuts: [],
  };
}

export function blankProfile(): Profile {
  const shop = seedShop();
  return {
    phone: "",
    owner: "",
    lang: "fr",
    role: "patron",
    geminiKey: "",
    speak: true,
    shopId: shop.id,
    shops: [shop],
  };
}

export function loadProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const profile = JSON.parse(raw) as Profile;
    // Lancement : wolof et français seulement (anciens profils en anglais ou pulaar → wolof).
    if (profile.lang !== "wo" && profile.lang !== "fr") profile.lang = "wo";
    return profile;
  } catch {
    return null;
  }
}

export function saveProfile(profile: Profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    // stockage plein ou bloqué : Supabase garde la copie
  }
}

export function clearProfile() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // rien à effacer
  }
}

export function currentShop(profile: Profile): Shop {
  return profile.shops.find((s) => s.id === profile.shopId) ?? profile.shops[0];
}

export function replaceShop(profile: Profile, shop: Shop): Profile {
  return { ...profile, shops: profile.shops.map((s) => (s.id === shop.id ? shop : s)) };
}

export function daySales(shop: Shop): number {
  return shop.sales.filter((s) => isToday(s.at)).reduce((a, s) => a + s.amount, 0);
}

/** Dépenses payées aujourd'hui (les pertes de stock ne sortent pas de la caisse : elles sont exclues). */
export function dayExpenses(shop: Shop): number {
  return shop.expenses.filter((s) => isToday(s.at) && s.kind !== "perte").reduce((a, s) => a + s.amount, 0);
}

/** Ventes du jour payées en espèces (Wave, Orange Money et crédit n'entrent pas dans le tiroir). */
export function dayCashSales(shop: Shop): number {
  return shop.sales.filter((s) => isToday(s.at) && (s.payment ?? "especes") === "especes").reduce((a, s) => a + s.amount, 0);
}

export function expectedCash(shop: Shop): number {
  return shop.openingCash + dayCashSales(shop) - dayExpenses(shop);
}

export function lowStock(shop: Shop): Product[] {
  return shop.products.filter((p) => p.stock <= p.min);
}

export function debtors(shop: Shop): Client[] {
  return shop.clients.filter((c) => c.debt > 0).sort((a, b) => b.debt - a.debt);
}

export function findProduct(shop: Shop, text: string): Product | undefined {
  const q = text.toLowerCase();
  return shop.products.find((p) => q.includes(p.name.toLowerCase().split(" ")[0]));
}

export function findClient(shop: Shop, text: string): Client | undefined {
  const q = text.toLowerCase();
  return shop.clients.find((c) => q.includes(c.name.toLowerCase().split(" ")[0]));
}

export function toCsv(shop: Shop): string {
  const lines = ["type,date,libelle,montant"];
  for (const s of shop.sales) lines.push(`vente,${s.at},${s.label},${s.amount}`);
  for (const e of shop.expenses) lines.push(`depense,${e.at},${e.label},${e.amount}`);
  for (const c of shop.clients) lines.push(`dette,,${c.name},${c.debt}`);
  return lines.join("\n");
}
