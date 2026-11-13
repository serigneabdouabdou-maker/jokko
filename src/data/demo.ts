// Démonstration : une entreprise exemple PAR MÉTIER (règle de Fallou, 12/11/2026 : « chaque activité a sa propre démo »).
// Une pharmacie voit une pharmacie, un tailleur un atelier de couture, une boutique de quartier du riz et de l'huile.
// Prix indicatifs du Sénégal (fin 2026), clients, dettes et une semaine d'activité.
// Elle vit seulement sur le téléphone : rien n'est envoyé au serveur, et « Quitter la démo » efface tout.
import type { Client, CoutureOrder, CoutureStatus, Expense, Invoice, InvoiceLine, Licence, Product, Profile, Reminder, Repair, RepairStatus, Sale, ServiceItem, Shop } from "../model.ts";
import { METIERS, metierOf, type MetierId } from "./metiers.ts";

export const DEMO_PREFIX = "demo-";
export const isDemoShop = (shop: Pick<Shop, "id">) => shop.id.startsWith(DEMO_PREFIX);

/** Petit générateur pseudo-aléatoire stable (la démo est la même à chaque fois). */
function random(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Item = {
  key: string;
  name: string;
  unit: string;
  stock: number;
  min: number;
  price: number;
  cost: number;
  retail?: { unit: string; perUnit: number; price: number };
  /** Poids dans les ventes (0 = jamais vendu : ingrédient d'un restaurant, farine d'une boulangerie). */
  weight: number;
  /** Quantité max d'une vente (unités de gros, ou de détail si `retail`). */
  max?: number;
  /** Pharmacie : périme dans N jours. */
  expiresIn?: number;
};

type DemoClient = { key: string; name: string; debt: number; dueDays?: number; measures?: Record<string, number>; tournee?: { item: string; qty: number }[] };
type DemoExpense = { key: string; daysAgo: number; hour: number; label: string; amount: number; kind: NonNullable<Expense["kind"]>; item?: string; qty?: number };

type Ctx = { id: (k: string) => string; at: (daysAgo: number, hour: number) => string; now: Date; products: Product[]; clients: Client[]; rnd: () => number };
type Extra = { couture?: CoutureOrder[]; repairs?: Repair[]; sales?: Sale[]; services?: ServiceItem[]; licences?: Licence[]; expenses?: Expense[] };

type Kit = {
  seed: number;
  name: string;
  /** Mot pour l'écran (« Boutique », « Pharmacie », « Atelier de couture »…). */
  noun: string;
  /** Invitation de l'écran Parler et des Réglages. */
  title: string;
  text: string;
  /** « ta vraie boutique » / « ton vrai atelier ». */
  yours: string;
  address: string;
  paymentInfo: string;
  openingCash: number;
  items: Item[];
  clients: DemoClient[];
  /** Ventes par jour (min, max) et aujourd'hui. */
  perDay: [number, number];
  today: number;
  /** Heures d'ouverture. */
  hours: [number, number];
  /** Part des ventes payées en espèces, Wave, Orange Money ; le reste à crédit. */
  pay: [number, number, number];
  /** Part des ventes au détail pour les articles qui en ont. */
  retailShare?: number;
  expenses: DemoExpense[];
  invoice: { client: string; daysAgo: number; status: Invoice["status"]; lines: Array<{ label: string; qty: number; unit: string; unitPrice: number; item?: string }> };
  reminder: { client: string; note: string };
  extra?: (c: Ctx) => Extra;
};

const day = 86_400_000;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ————————————————————————————————————————————————————————————————— Alimentation générale
const alimentation: Kit = {
  seed: 20261101,
  name: "Boutique Awa (démo)",
  noun: "Boutique",
  title: "Découvre Jokko avec une boutique exemple",
  text: "Riz, huile, sucre, clients, dettes et une semaine de ventes, avec des prix du Sénégal.",
  yours: "ta vraie boutique",
  address: "Rue 10, Médina, Dakar",
  paymentInfo: "Wave ou Orange Money",
  openingCash: 15000,
  perDay: [18, 29],
  today: 14,
  hours: [7.5, 21],
  pay: [0.62, 0.23, 0.1],
  retailShare: 0.8,
  items: [
    { key: "riz", name: "Riz brisé", unit: "sac 50 kg", stock: 9, min: 3, price: 22000, cost: 20500, retail: { unit: "kg", perUnit: 50, price: 475 }, weight: 9, max: 3 },
    { key: "huile", name: "Huile", unit: "bidon 20 L", stock: 1.6, min: 2, price: 23500, cost: 22000, retail: { unit: "litre", perUnit: 20, price: 1250 }, weight: 8, max: 3 },
    { key: "sucre", name: "Sucre", unit: "sac 50 kg", stock: 4, min: 2, price: 31000, cost: 29500, retail: { unit: "kg", perUnit: 50, price: 650 }, weight: 8, max: 3 },
    { key: "lait", name: "Lait en poudre 400 g", unit: "sachet", stock: 36, min: 10, price: 2000, cost: 1750, weight: 4 },
    { key: "cafe", name: "Café Touba 250 g", unit: "paquet", stock: 22, min: 8, price: 1000, cost: 800, weight: 4 },
    { key: "the", name: "Thé vert", unit: "paquet", stock: 60, min: 20, price: 300, cost: 230, weight: 6 },
    { key: "pates", name: "Pâtes 500 g", unit: "paquet", stock: 40, min: 12, price: 500, cost: 410, weight: 4 },
    { key: "tomate", name: "Concentré de tomate", unit: "carton (50)", stock: 0.8, min: 1, price: 6750, cost: 5600, retail: { unit: "sachet", perUnit: 50, price: 150 }, weight: 7, max: 6 },
    { key: "bouillon", name: "Bouillon cube", unit: "boîte (100)", stock: 3, min: 1, price: 2250, cost: 1900, retail: { unit: "cube", perUnit: 100, price: 25 }, weight: 6, max: 6 },
    { key: "savon", name: "Savon", unit: "morceau", stock: 48, min: 12, price: 350, cost: 280, weight: 3 },
    { key: "javel", name: "Eau de Javel 1 L", unit: "bouteille", stock: 18, min: 6, price: 500, cost: 400, weight: 2 },
    { key: "eau", name: "Eau minérale 1,5 L", unit: "bouteille", stock: 30, min: 12, price: 400, cost: 320, weight: 4 },
    { key: "pain", name: "Pain", unit: "baguette", stock: 25, min: 10, price: 175, cost: 150, weight: 8 },
    { key: "oignon", name: "Oignon", unit: "sac 25 kg", stock: 2, min: 1, price: 15000, cost: 13500, retail: { unit: "kg", perUnit: 25, price: 650 }, weight: 6, max: 3 },
    { key: "pdt", name: "Pomme de terre", unit: "sac 25 kg", stock: 1.5, min: 1, price: 13750, cost: 12500, retail: { unit: "kg", perUnit: 25, price: 600 }, weight: 4, max: 3 },
    { key: "sardine", name: "Sardines", unit: "boîte", stock: 24, min: 8, price: 500, cost: 400, weight: 2 },
    { key: "laitconc", name: "Lait concentré sucré", unit: "boîte", stock: 20, min: 6, price: 650, cost: 540, weight: 2 },
    { key: "allumettes", name: "Allumettes", unit: "paquet (10)", stock: 6, min: 2, price: 250, cost: 200, retail: { unit: "boîte", perUnit: 10, price: 25 }, weight: 2, max: 3 },
  ],
  clients: [
    { key: "awa", name: "Awa Ndiaye", debt: 12500, dueDays: 3 },
    { key: "moussa", name: "Moussa Diop", debt: 20000, dueDays: -4 },
    { key: "fatou", name: "Fatou Sarr", debt: 8500, dueDays: 6 },
    { key: "mariama", name: "Mariama Ba", debt: 4250 },
    { key: "ousmane", name: "Ousmane Fall", debt: 0 },
    { key: "ibrahima", name: "Ibrahima Sy", debt: 0 },
  ],
  expenses: [
    { key: "transport", daysAgo: 0, hour: 9, label: "Transport marchandise", amount: 2000, kind: "depense" },
    { key: "woyofal", daysAgo: 2, hour: 10, label: "Électricité (Woyofal)", amount: 5000, kind: "depense" },
    { key: "achat-riz", daysAgo: 3, hour: 8, label: "Achat : 5 sacs de riz", amount: 102500, kind: "achat", item: "riz", qty: 5 },
    { key: "perte", daysAgo: 4, hour: 18, label: "Pain invendu", amount: 875, kind: "perte", item: "pain", qty: 5 },
  ],
  invoice: {
    client: "moussa",
    daysAgo: 1,
    status: "envoyee",
    lines: [
      { label: "Riz brisé", qty: 2, unit: "sac 50 kg", unitPrice: 22000, item: "riz" },
      { label: "Huile", qty: 6, unit: "litre", unitPrice: 1250, item: "huile" },
    ],
  },
  reminder: { client: "moussa", note: "Relance envoyée sur WhatsApp" },
};

// ————————————————————————————————————————————————————————————————— Pharmacie
const pharmacie: Kit = {
  seed: 20261102,
  name: "Pharmacie du Marché (démo)",
  noun: "Pharmacie",
  title: "Découvre Jokko avec une pharmacie exemple",
  text: "Médicaments en boîtes et en plaquettes, dates de péremption, ventes de la semaine et clients à crédit.",
  yours: "ta vraie pharmacie",
  address: "Avenue Blaise Diagne, Dakar",
  paymentInfo: "Wave ou Orange Money",
  openingCash: 20000,
  perDay: [22, 34],
  today: 16,
  hours: [8, 22],
  pay: [0.6, 0.25, 0.1],
  retailShare: 0.7,
  items: [
    { key: "paracetamol", name: "Paracétamol 500 mg", unit: "boîte (10 plaquettes)", stock: 14, min: 5, price: 2500, cost: 1700, retail: { unit: "plaquette", perUnit: 10, price: 250 }, weight: 10, max: 2, expiresIn: 300 },
    { key: "ibuprofene", name: "Ibuprofène 400 mg", unit: "boîte", stock: 12, min: 4, price: 1000, cost: 650, weight: 6, max: 2, expiresIn: 21 },
    { key: "amoxicilline", name: "Amoxicilline 500 mg", unit: "boîte", stock: 9, min: 4, price: 2500, cost: 1800, weight: 5, max: 1, expiresIn: 240 },
    { key: "antipalu", name: "Antipaludique (artéméther-luméfantrine)", unit: "boîte", stock: 3, min: 5, price: 3000, cost: 2200, weight: 5, max: 1, expiresIn: 180 },
    { key: "sirop", name: "Sirop contre la toux", unit: "flacon", stock: 10, min: 4, price: 2000, cost: 1400, weight: 4, max: 1, expiresIn: 14 },
    { key: "vitc", name: "Vitamine C 500 mg", unit: "boîte", stock: 18, min: 6, price: 1500, cost: 1000, weight: 4, max: 2, expiresIn: 400 },
    { key: "sro", name: "Sels de réhydratation (SRO)", unit: "boîte (20)", stock: 4, min: 1, price: 3000, cost: 2000, retail: { unit: "sachet", perUnit: 20, price: 200 }, weight: 5, max: 4, expiresIn: 365 },
    { key: "pommade", name: "Pommade antiseptique", unit: "tube", stock: 11, min: 4, price: 1500, cost: 1000, weight: 3, max: 1, expiresIn: 500 },
    { key: "alcool", name: "Alcool à 70°", unit: "flacon", stock: 15, min: 5, price: 1000, cost: 650, weight: 3, max: 2 },
    { key: "compresses", name: "Compresses stériles", unit: "paquet", stock: 20, min: 6, price: 1000, cost: 600, weight: 3, max: 2 },
    { key: "seringue", name: "Seringue 5 ml", unit: "boîte (100)", stock: 2, min: 1, price: 8000, cost: 5500, retail: { unit: "seringue", perUnit: 100, price: 100 }, weight: 3, max: 3 },
    { key: "gants", name: "Gants d'examen", unit: "boîte (100)", stock: 5, min: 2, price: 4000, cost: 3000, weight: 1, max: 1 },
    { key: "thermometre", name: "Thermomètre", unit: "pièce", stock: 6, min: 2, price: 3500, cost: 2300, weight: 1, max: 1 },
    { key: "lait-bebe", name: "Lait infantile 1er âge", unit: "boîte", stock: 8, min: 3, price: 4500, cost: 3700, weight: 2, max: 1, expiresIn: 45 },
  ],
  clients: [
    { key: "khady", name: "Khady Diallo", debt: 6500, dueDays: 2 },
    { key: "pape", name: "Pape Ndoye", debt: 9000, dueDays: -3 },
    { key: "aminata", name: "Aminata Kane", debt: 3500 },
    { key: "cheikh", name: "Cheikh Mbaye", debt: 0 },
    { key: "dispensaire", name: "Case de santé de Grand-Yoff", debt: 42000, dueDays: 10 },
  ],
  expenses: [
    { key: "grossiste", daysAgo: 2, hour: 9, label: "Achat chez le grossiste répartiteur", amount: 85000, kind: "achat" },
    { key: "woyofal", daysAgo: 3, hour: 10, label: "Électricité (Woyofal)", amount: 10000, kind: "depense" },
    { key: "transport", daysAgo: 0, hour: 9, label: "Transport livraison", amount: 1500, kind: "depense" },
    { key: "perime", daysAgo: 5, hour: 17, label: "Sirop périmé retiré", amount: 2800, kind: "perte", item: "sirop", qty: 2 },
  ],
  invoice: {
    client: "dispensaire",
    daysAgo: 2,
    status: "envoyee",
    lines: [
      { label: "Paracétamol 500 mg", qty: 6, unit: "boîte (10 plaquettes)", unitPrice: 2500, item: "paracetamol" },
      { label: "Compresses stériles", qty: 12, unit: "paquet", unitPrice: 1000, item: "compresses" },
      { label: "Gants d'examen", qty: 3, unit: "boîte (100)", unitPrice: 4000, item: "gants" },
    ],
  },
  reminder: { client: "pape", note: "Relance envoyée sur WhatsApp" },
};

// ————————————————————————————————————————————————————————————————— Quincaillerie
const quincaillerie: Kit = {
  seed: 20261103,
  name: "Quincaillerie Fall et Frères (démo)",
  noun: "Quincaillerie",
  title: "Découvre Jokko avec une quincaillerie exemple",
  text: "Ciment, fer, peinture, plomberie, électricité, chantiers à crédit et une facture de chantier.",
  yours: "ta vraie quincaillerie",
  address: "Route de Rufisque, Thiaroye",
  paymentInfo: "Wave ou Orange Money",
  openingCash: 25000,
  perDay: [12, 20],
  today: 9,
  hours: [8, 19.5],
  pay: [0.55, 0.25, 0.08],
  retailShare: 0.6,
  items: [
    { key: "ciment", name: "Ciment 42.5", unit: "sac 50 kg", stock: 38, min: 15, price: 4700, cost: 4300, weight: 10, max: 10 },
    { key: "fer8", name: "Fer de 8", unit: "barre", stock: 60, min: 20, price: 2800, cost: 2400, weight: 5, max: 10 },
    { key: "fer10", name: "Fer de 10", unit: "barre", stock: 14, min: 20, price: 4200, cost: 3700, weight: 5, max: 10 },
    { key: "fer12", name: "Fer de 12", unit: "barre", stock: 30, min: 10, price: 6000, cost: 5300, weight: 3, max: 8 },
    { key: "filfer", name: "Fil de fer recuit", unit: "rouleau 25 kg", stock: 3, min: 1, price: 20000, cost: 17000, retail: { unit: "kg", perUnit: 25, price: 1000 }, weight: 4, max: 3 },
    { key: "pointes", name: "Pointes", unit: "carton 25 kg", stock: 2, min: 1, price: 22500, cost: 18000, retail: { unit: "kg", perUnit: 25, price: 1000 }, weight: 4, max: 3 },
    { key: "peinture", name: "Peinture à eau blanche", unit: "seau 20 kg", stock: 7, min: 3, price: 18000, cost: 14500, weight: 2, max: 2 },
    { key: "pvc", name: "Tuyau PVC 100", unit: "barre", stock: 16, min: 6, price: 6500, cost: 5200, weight: 2, max: 4 },
    { key: "robinet", name: "Robinet", unit: "pièce", stock: 12, min: 4, price: 3500, cost: 2200, weight: 2, max: 2 },
    { key: "cable", name: "Câble électrique 2,5 mm", unit: "rouleau 100 m", stock: 3, min: 1, price: 30000, cost: 25000, retail: { unit: "mètre", perUnit: 100, price: 350 }, weight: 4, max: 20 },
    { key: "ampoule", name: "Ampoule LED", unit: "pièce", stock: 40, min: 10, price: 1000, cost: 600, weight: 4, max: 4 },
    { key: "prise", name: "Prise électrique", unit: "pièce", stock: 25, min: 8, price: 750, cost: 450, weight: 3, max: 4 },
    { key: "brouette", name: "Brouette", unit: "pièce", stock: 4, min: 1, price: 25000, cost: 20000, weight: 1, max: 1 },
  ],
  clients: [
    { key: "ousmane", name: "Ousmane Gaye (maçon)", debt: 47000, dueDays: 5 },
    { key: "btp", name: "Entreprise Ba BTP", debt: 156000, dueDays: -6 },
    { key: "lamine", name: "Lamine Cissé (plombier)", debt: 13500, dueDays: 2 },
    { key: "seynabou", name: "Seynabou Diagne", debt: 0 },
    { key: "abdou", name: "Abdou Faye (électricien)", debt: 7000 },
  ],
  expenses: [
    { key: "camion", daysAgo: 1, hour: 8, label: "Camion : livraison du ciment", amount: 15000, kind: "depense" },
    { key: "achat-ciment", daysAgo: 1, hour: 8, label: "Achat : 100 sacs de ciment", amount: 430000, kind: "achat", item: "ciment", qty: 100 },
    { key: "charretier", daysAgo: 0, hour: 10, label: "Charretier (livraison chantier)", amount: 2000, kind: "depense" },
    { key: "woyofal", daysAgo: 4, hour: 11, label: "Électricité (Woyofal)", amount: 5000, kind: "depense" },
  ],
  invoice: {
    client: "btp",
    daysAgo: 2,
    status: "envoyee",
    lines: [
      { label: "Ciment 42.5", qty: 20, unit: "sac 50 kg", unitPrice: 4700, item: "ciment" },
      { label: "Fer de 10", qty: 15, unit: "barre", unitPrice: 4200, item: "fer10" },
    ],
  },
  reminder: { client: "btp", note: "Relance envoyée sur WhatsApp" },
};

// ————————————————————————————————————————————————————————————————— Couture
const couture: Kit = {
  seed: 20261104,
  name: "Atelier Ndiaye Couture (démo)",
  noun: "Atelier de couture",
  title: "Découvre Jokko avec un atelier de couture exemple",
  text: "Commandes de boubous et de tailles basses, mesures des clients, avances, restes à payer et tissus au mètre.",
  yours: "ton vrai atelier",
  address: "Marché HLM, Dakar",
  paymentInfo: "Wave ou Orange Money",
  openingCash: 10000,
  perDay: [2, 5],
  today: 2,
  hours: [9, 20],
  pay: [0.7, 0.2, 0.1],
  items: [
    { key: "bazin", name: "Bazin riche", unit: "mètre", stock: 42, min: 10, price: 3500, cost: 2500, weight: 6, max: 6 },
    { key: "getzner", name: "Bazin Getzner", unit: "mètre", stock: 8, min: 10, price: 7500, cost: 5500, weight: 2, max: 5 },
    { key: "wax", name: "Wax", unit: "mètre", stock: 36, min: 10, price: 1500, cost: 1000, weight: 6, max: 6 },
    { key: "doublure", name: "Doublure", unit: "mètre", stock: 25, min: 8, price: 1000, cost: 600, weight: 2, max: 3 },
    { key: "fil", name: "Fil à coudre", unit: "bobine", stock: 18, min: 10, price: 250, cost: 150, weight: 3, max: 4 },
    { key: "fil-broder", name: "Fil à broder", unit: "bobine", stock: 6, min: 8, price: 1000, cost: 650, weight: 2, max: 3 },
    { key: "boutons", name: "Boutons", unit: "sachet", stock: 14, min: 5, price: 500, cost: 300, weight: 2, max: 2 },
    { key: "fermeture", name: "Fermeture éclair", unit: "pièce", stock: 30, min: 10, price: 200, cost: 100, weight: 2, max: 3 },
  ],
  clients: [
    { key: "awa", name: "Awa Diop", debt: 0, measures: { cou: 36, epaule: 40, poitrine: 96, taille: 82, hanches: 108, manche: 58, boubou: 150 } },
    { key: "moussa", name: "Moussa Sarr", debt: 0, measures: { cou: 41, epaule: 47, poitrine: 104, manche: 63, haut: 78, pantalon: 104, cuisse: 60, bas: 22 } },
    { key: "fatou", name: "Fatou Ndiaye", debt: 0, measures: { epaule: 38, poitrine: 92, taille: 76, hanches: 102, manche: 56, haut: 60, pantalon: 110 } },
    { key: "ibou", name: "Ibrahima Fall", debt: 0, measures: { cou: 42, epaule: 48, poitrine: 108, manche: 64, boubou: 155, pantalon: 106 } },
    { key: "mame", name: "Mame Diarra Sy", debt: 8000, dueDays: 4, measures: { epaule: 39, poitrine: 94, taille: 80, hanches: 106, manche: 57, boubou: 148 } },
    { key: "khadim", name: "Khadim Mbaye (enfant, 8 ans)", debt: 0, measures: { cou: 30, epaule: 31, poitrine: 66, manche: 44, haut: 52, pantalon: 72 } },
  ],
  expenses: [
    { key: "achat-bazin", daysAgo: 3, hour: 9, label: "Achat : 20 m de bazin riche", amount: 50000, kind: "achat", item: "bazin", qty: 20 },
    { key: "brodeur", daysAgo: 2, hour: 15, label: "Brodeur : broderie de 2 grands boubous", amount: 12000, kind: "depense" },
    { key: "machine", daysAgo: 4, hour: 11, label: "Réparation de la machine à coudre", amount: 5000, kind: "depense" },
    { key: "woyofal", daysAgo: 1, hour: 10, label: "Électricité (Woyofal)", amount: 5000, kind: "depense" },
  ],
  invoice: {
    client: "ibou",
    daysAgo: 1,
    status: "envoyee",
    lines: [
      { label: "Grand boubou trois pièces, bazin Getzner brodé", qty: 1, unit: "ensemble", unitPrice: 45000 },
      { label: "Bazin Getzner", qty: 6, unit: "mètre", unitPrice: 7500, item: "getzner" },
    ],
  },
  reminder: { client: "mame", note: "Message envoyé : « ton habit est prêt »" },
  extra: ({ id, at, now, clients }) => {
    const client = (k: string) => clients.find((c) => c.id === id(`c-${k}`))!;
    const orders: Array<{ k: string; garment: string; fabric: string; price: number; advance: number; daysAgo: number; dueIn: number; status: CoutureStatus; note?: string }> = [
      { k: "awa", garment: "Grand boubou brodé", fabric: "Bazin riche bleu apporté par la cliente", price: 35000, advance: 15000, daysAgo: 6, dueIn: 1, status: "finition" },
      { k: "moussa", garment: "Ensemble pantalon (thioup)", fabric: "4 m de bazin riche blanc de l'atelier", price: 30000, advance: 10000, daysAgo: 5, dueIn: 4, status: "couture" },
      { k: "fatou", garment: "Taille basse", fabric: "6 m de wax apporté par la cliente", price: 15000, advance: 5000, daysAgo: 3, dueIn: 6, status: "coupe" },
      { k: "ibou", garment: "Grand boubou trois pièces", fabric: "Bazin Getzner vert, broderie dorée", price: 45000, advance: 25000, daysAgo: 2, dueIn: 10, status: "recu", note: "Pour la Tabaski" },
      { k: "mame", garment: "Robe de soirée", fabric: "Wax et doublure de l'atelier", price: 20000, advance: 12000, daysAgo: 7, dueIn: -1, status: "pret" },
      { k: "khadim", garment: "Ensemble enfant (8 ans)", fabric: "Bazin riche jaune", price: 10000, advance: 5000, daysAgo: 6, dueIn: -1, status: "pret" },
      { k: "awa", garment: "Kaftan", fabric: "Bazin riche violet", price: 25000, advance: 10000, daysAgo: 6, dueIn: -2, status: "livre" },
      { k: "moussa", garment: "Chemise manches courtes", fabric: "Wax de l'atelier", price: 8000, advance: 8000, daysAgo: 5, dueIn: -2, status: "livre" },
    ];
    const couture: CoutureOrder[] = [];
    const sales: Sale[] = [];
    orders.forEach((o, i) => {
      const c = client(o.k);
      const number = `C-${String(i + 1).padStart(3, "0")}`;
      const delivered = o.status === "livre";
      const ready = o.status === "pret" || delivered;
      const order: CoutureOrder = {
        id: id(`o-${i + 1}`),
        at: at(o.daysAgo, 10 + (i % 5)),
        number,
        clientId: c.id,
        clientName: c.name,
        phone: "",
        garment: o.garment,
        fabric: o.fabric,
        measures: { ...(c.measures ?? {}) },
        price: o.price,
        paid: delivered ? o.price : o.advance,
        dueAt: ymd(new Date(now.getTime() + o.dueIn * day)),
        status: o.status,
        token: `${DEMO_PREFIX}suivi-${i + 1}`,
        ...(o.note ? { note: o.note } : {}),
        ...(ready ? { readyAt: at(Math.max(0, -o.dueIn), 17) } : {}),
        ...(delivered ? { deliveredAt: at(Math.max(0, -o.dueIn - 1), 18) } : {}),
      };
      couture.push(order);
      sales.push({ id: id(`s-av-${i + 1}`), at: order.at, label: `Couture ${number} · ${o.garment} (avance)`, amount: o.advance, clientId: c.id, payment: i % 3 === 1 ? "wave" : "especes" });
      if (delivered && o.price > o.advance) {
        sales.push({ id: id(`s-solde-${i + 1}`), at: order.deliveredAt!, label: `Couture ${number} · ${o.garment} (solde)`, amount: o.price - o.advance, clientId: c.id, payment: "especes" });
      }
    });
    return { couture, sales };
  },
};

// ————————————————————————————————————————————————————————————————— Réparation de téléphones
const reparation: Kit = {
  seed: 20261105,
  name: "Sall GSM Réparation (démo)",
  noun: "Atelier de réparation",
  title: "Découvre Jokko avec un atelier de réparation exemple",
  text: "Téléphones au dépôt, pièces posées, écrans et batteries en stock, avances et clients qui doivent.",
  yours: "ton vrai atelier",
  address: "Marché Sandaga, Dakar",
  paymentInfo: "Wave ou Orange Money",
  openingCash: 10000,
  perDay: [6, 11],
  today: 5,
  hours: [9, 21],
  pay: [0.6, 0.25, 0.1],
  items: [
    { key: "ecran-ip11", name: "Écran iPhone 11", unit: "pièce", stock: 4, min: 2, price: 25000, cost: 15000, weight: 2, max: 1 },
    { key: "ecran-spark", name: "Écran Tecno Spark 10", unit: "pièce", stock: 6, min: 2, price: 12000, cost: 7000, weight: 2, max: 1 },
    { key: "ecran-a12", name: "Écran Samsung A12", unit: "pièce", stock: 1, min: 2, price: 15000, cost: 9000, weight: 1, max: 1 },
    { key: "connecteur", name: "Connecteur de charge", unit: "pièce", stock: 22, min: 8, price: 2000, cost: 700, weight: 3, max: 2 },
    { key: "batterie-tecno", name: "Batterie Tecno", unit: "pièce", stock: 8, min: 3, price: 6000, cost: 3500, weight: 2, max: 1 },
    { key: "batterie-ip8", name: "Batterie iPhone 8", unit: "pièce", stock: 3, min: 2, price: 10000, cost: 6000, weight: 1, max: 1 },
    { key: "vitre", name: "Vitre arrière", unit: "pièce", stock: 10, min: 3, price: 3000, cost: 1500, weight: 1, max: 1 },
    { key: "verre", name: "Verre trempé (protection d'écran)", unit: "pièce", stock: 45, min: 15, price: 1000, cost: 300, weight: 8, max: 2 },
    { key: "coque", name: "Coque", unit: "pièce", stock: 30, min: 10, price: 1500, cost: 700, weight: 6, max: 2 },
    { key: "chargeur", name: "Chargeur rapide", unit: "pièce", stock: 12, min: 5, price: 3500, cost: 2000, weight: 4, max: 1 },
    { key: "cable", name: "Câble USB-C", unit: "pièce", stock: 20, min: 8, price: 1500, cost: 600, weight: 5, max: 2 },
    { key: "ecouteurs", name: "Écouteurs", unit: "pièce", stock: 14, min: 5, price: 2000, cost: 1000, weight: 3, max: 1 },
  ],
  clients: [
    { key: "awa", name: "Awa Sow", debt: 0 },
    { key: "modou", name: "Modou Thiam", debt: 7000, dueDays: 3 },
    { key: "bineta", name: "Bineta Diouf", debt: 0 },
    { key: "saliou", name: "Saliou Ndiaye (réparateur)", debt: 24000, dueDays: -2 },
    { key: "astou", name: "Astou Faye", debt: 0 },
    { key: "pape", name: "Pape Diallo", debt: 0 },
  ],
  expenses: [
    { key: "achat-ecrans", daysAgo: 3, hour: 10, label: "Achat : 5 écrans Tecno Spark 10", amount: 35000, kind: "achat", item: "ecran-spark", qty: 5 },
    { key: "fer", daysAgo: 4, hour: 12, label: "Fer à souder et étain", amount: 6000, kind: "depense" },
    { key: "woyofal", daysAgo: 1, hour: 10, label: "Électricité (Woyofal)", amount: 5000, kind: "depense" },
    { key: "casse", daysAgo: 2, hour: 16, label: "Écran cassé à la pose", amount: 9000, kind: "perte", item: "ecran-a12", qty: 1 },
  ],
  invoice: {
    client: "saliou",
    daysAgo: 1,
    status: "envoyee",
    lines: [
      { label: "Connecteur de charge", qty: 10, unit: "pièce", unitPrice: 1800, item: "connecteur" },
      { label: "Batterie Tecno", qty: 1, unit: "pièce", unitPrice: 6000, item: "batterie-tecno" },
    ],
  },
  reminder: { client: "saliou", note: "Relance envoyée sur WhatsApp" },
  extra: ({ id, at, now, clients, products }) => {
    const client = (k: string) => clients.find((c) => c.id === id(`c-${k}`))!;
    const product = (k: string) => products.find((p) => p.id === id(`p-${k}`))!;
    const jobs: Array<{ k: string; device: string; problem: string; price: number; advance: number; daysAgo: number; status: RepairStatus; parts: string[]; warranty?: number }> = [
      { k: "awa", device: "iPhone 11", problem: "Écran cassé", price: 30000, advance: 10000, daysAgo: 0, status: "depot", parts: [] },
      { k: "bineta", device: "Tecno Spark 10", problem: "Ne charge plus", price: 4000, advance: 0, daysAgo: 1, status: "depot", parts: [] },
      { k: "astou", device: "Samsung A12", problem: "« Dafa dee » : ne s'allume plus", price: 0, advance: 0, daysAgo: 1, status: "depot", parts: [] },
      { k: "modou", device: "Tecno Camon 20", problem: "Batterie gonflée", price: 9000, advance: 2000, daysAgo: 3, status: "repare", parts: ["batterie-tecno"] },
      { k: "pape", device: "iPhone 8", problem: "Batterie faible", price: 15000, advance: 5000, daysAgo: 4, status: "repare", parts: ["batterie-ip8"] },
      { k: "awa", device: "Tecno Spark 10", problem: "Écran cassé et vitre arrière", price: 18000, advance: 8000, daysAgo: 5, status: "rendu", parts: ["ecran-spark", "vitre"], warranty: 30 },
      { k: "bineta", device: "Itel A70", problem: "Connecteur de charge", price: 4000, advance: 0, daysAgo: 6, status: "rendu", parts: ["connecteur"], warranty: 7 },
    ];
    const repairs: Repair[] = [];
    const sales: Sale[] = [];
    jobs.forEach((j, i) => {
      const c = client(j.k);
      const number = `R-${String(i + 1).padStart(3, "0")}`;
      const parts = j.parts.map((k) => ({ productId: product(k).id, label: product(k).name, qty: 1, cost: product(k).cost ?? 0 }));
      const returned = j.status === "rendu";
      const repaired = j.status === "repare" || returned;
      const r: Repair = {
        id: id(`r-${i + 1}`),
        at: at(j.daysAgo, 10 + (i % 6)),
        number,
        clientId: c.id,
        clientName: c.name,
        phone: "",
        device: j.device,
        problem: j.problem,
        price: j.price,
        paid: returned ? j.price : j.advance,
        parts,
        status: j.status,
        ...(repaired ? { repairedAt: at(Math.max(0, j.daysAgo - 1), 16) } : {}),
        ...(returned ? { returnedAt: at(Math.max(0, j.daysAgo - 2), 18) } : {}),
        ...(j.warranty ? { warrantyDays: j.warranty } : {}),
      };
      repairs.push(r);
      if (j.advance > 0) sales.push({ id: id(`s-rav-${i + 1}`), at: r.at, label: `Réparation ${number} · ${j.device} (avance)`, amount: j.advance, clientId: c.id, payment: "especes" });
      if (returned) {
        const cost = parts.reduce((a, p) => a + p.cost, 0);
        sales.push({ id: id(`s-rendu-${i + 1}`), at: r.returnedAt!, label: `Réparation ${number} · ${j.device} (rendu)`, amount: j.price - j.advance, clientId: c.id, cost, payment: "especes" });
      }
    });
    // Services sans pièce et licence de décodage (90 000 F pour 1 an, achetée il y a 2 mois).
    const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const licences: Licence[] = [{ id: id("lic-1"), name: "Outil de décodage", cost: 90000, startAt: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`, months: 12 }];
    const services: ServiceItem[] = [
      { id: id("srv-1"), name: "Décodage", price: 5000, licenceId: id("lic-1") },
      { id: id("srv-2"), name: "Déblocage compte (FRP)", price: 5000, licenceId: id("lic-1") },
      { id: id("srv-3"), name: "Flash / mise à jour", price: 5000 },
      { id: id("srv-4"), name: "Création de compte", price: 5000 },
      { id: id("srv-5"), name: "Réparation imprimante", price: 8000 },
    ];
    for (let d = 6; d >= 0; d--) {
      [0, 1].forEach((k) => {
        const srv = services[(d + k) % services.length];
        const who = clients[(d * 2 + k) % clients.length];
        sales.push({ id: id(`s-srv-${d}-${k}`), at: at(d, 11 + k * 4), label: `Service · ${srv.name}`, amount: srv.price, clientId: who.id, ...(srv.licenceId ? { licenceId: srv.licenceId } : {}) });
      });
    }
    return { repairs, sales, services, licences };
  },
};

// ————————————————————————————————————————————————————————————————— Vêtements, tissus, chaussures
const vetements: Kit = {
  seed: 20261106,
  name: "Boutique Mode Fatou (démo)",
  noun: "Boutique de vêtements",
  title: "Découvre Jokko avec une boutique de vêtements exemple",
  text: "Pantalons, robes, chaussures, bazin et wax au mètre, clientes à crédit et une semaine de ventes.",
  yours: "ta vraie boutique",
  address: "Centre commercial, Parcelles Assainies",
  paymentInfo: "Wave ou Orange Money",
  openingCash: 15000,
  perDay: [8, 15],
  today: 6,
  hours: [10, 21],
  pay: [0.55, 0.3, 0.1],
  items: [
    { key: "jean", name: "Pantalon jean", unit: "pièce", stock: 24, min: 8, price: 7500, cost: 5000, weight: 6, max: 2 },
    { key: "chemise", name: "Chemise homme", unit: "pièce", stock: 18, min: 6, price: 6000, cost: 3500, weight: 4, max: 2 },
    { key: "tshirt", name: "T-shirt", unit: "pièce", stock: 40, min: 10, price: 2500, cost: 1500, weight: 6, max: 3 },
    { key: "robe", name: "Robe wax", unit: "pièce", stock: 5, min: 6, price: 10000, cost: 6500, weight: 3, max: 1 },
    { key: "ensemble", name: "Ensemble enfant", unit: "pièce", stock: 15, min: 5, price: 5000, cost: 3000, weight: 3, max: 2 },
    { key: "bazin", name: "Bazin riche", unit: "mètre", stock: 60, min: 15, price: 3500, cost: 2500, weight: 4, max: 6 },
    { key: "wax", name: "Wax (pagne de 6 yards)", unit: "pièce", stock: 20, min: 6, price: 9000, cost: 6500, weight: 3, max: 1 },
    { key: "chaussures", name: "Chaussures homme", unit: "paire", stock: 12, min: 4, price: 15000, cost: 10000, weight: 2, max: 1 },
    { key: "sandales", name: "Sandales femme", unit: "paire", stock: 20, min: 6, price: 5000, cost: 3000, weight: 4, max: 1 },
    { key: "babouches", name: "Babouches", unit: "paire", stock: 3, min: 4, price: 6000, cost: 4000, weight: 2, max: 1 },
    { key: "sac", name: "Sac à main", unit: "pièce", stock: 9, min: 3, price: 8000, cost: 5000, weight: 2, max: 1 },
    { key: "foulard", name: "Foulard", unit: "pièce", stock: 35, min: 10, price: 1500, cost: 800, weight: 4, max: 3 },
  ],
  clients: [
    { key: "adama", name: "Adama Gueye", debt: 15000, dueDays: 5 },
    { key: "ndeye", name: "Ndèye Fatou Diop", debt: 22500, dueDays: -3 },
    { key: "rokhaya", name: "Rokhaya Seck", debt: 6000 },
    { key: "babacar", name: "Babacar Niang", debt: 0 },
    { key: "coumba", name: "Coumba Diouf", debt: 0 },
  ],
  expenses: [
    { key: "achat", daysAgo: 3, hour: 9, label: "Achat : 10 pantalons jean", amount: 50000, kind: "achat", item: "jean", qty: 10 },
    { key: "transport", daysAgo: 3, hour: 11, label: "Transport depuis le marché", amount: 3000, kind: "depense" },
    { key: "loyer", daysAgo: 5, hour: 10, label: "Part du loyer de la semaine", amount: 15000, kind: "depense" },
    { key: "pub", daysAgo: 1, hour: 20, label: "Publicité Facebook", amount: 2000, kind: "depense" },
  ],
  invoice: {
    client: "ndeye",
    daysAgo: 2,
    status: "envoyee",
    lines: [
      { label: "Bazin riche", qty: 5, unit: "mètre", unitPrice: 3500, item: "bazin" },
      { label: "Sandales femme", qty: 1, unit: "paire", unitPrice: 5000, item: "sandales" },
    ],
  },
  reminder: { client: "ndeye", note: "Relance envoyée sur WhatsApp" },
};

// ————————————————————————————————————————————————————————————————— Restaurant
const restauration: Kit = {
  seed: 20261107,
  name: "Chez Adja Restaurant (démo)",
  noun: "Restaurant",
  title: "Découvre Jokko avec un restaurant exemple",
  text: "Plats du jour, jus, coût de chaque plat, marché du matin et une semaine de ventes.",
  yours: "ton vrai restaurant",
  address: "Liberté 6, Dakar",
  paymentInfo: "Wave ou Orange Money",
  openingCash: 20000,
  perDay: [40, 60],
  today: 30,
  hours: [11.5, 22],
  pay: [0.65, 0.25, 0.07],
  items: [
    { key: "ceebu-jen", name: "Ceebu jën", unit: "plat", stock: 12, min: 5, price: 1500, cost: 900, weight: 9, max: 3 },
    { key: "yassa", name: "Yassa poulet", unit: "plat", stock: 8, min: 5, price: 1500, cost: 850, weight: 7, max: 2 },
    { key: "mafe", name: "Mafé", unit: "plat", stock: 4, min: 5, price: 1250, cost: 700, weight: 5, max: 2 },
    { key: "dibi", name: "Dibi mouton", unit: "portion", stock: 10, min: 4, price: 2000, cost: 1300, weight: 4, max: 2 },
    { key: "chawarma", name: "Sandwich chawarma", unit: "sandwich", stock: 15, min: 5, price: 1500, cost: 900, weight: 5, max: 2 },
    { key: "bissap", name: "Bissap", unit: "bouteille", stock: 20, min: 8, price: 500, cost: 200, weight: 7, max: 3 },
    { key: "bouye", name: "Bouye", unit: "bouteille", stock: 14, min: 8, price: 500, cost: 250, weight: 5, max: 3 },
    { key: "gingembre", name: "Gingembre", unit: "bouteille", stock: 6, min: 8, price: 500, cost: 200, weight: 4, max: 3 },
    { key: "eau", name: "Eau minérale 1,5 L", unit: "bouteille", stock: 24, min: 6, price: 500, cost: 320, weight: 3, max: 2 },
    // Ingrédients : achetés au marché, jamais vendus.
    { key: "riz", name: "Riz brisé", unit: "sac 50 kg", stock: 2, min: 1, price: 22000, cost: 20500, weight: 0 },
    { key: "huile", name: "Huile", unit: "bidon 20 L", stock: 1, min: 1, price: 23500, cost: 22000, weight: 0 },
    { key: "oignon", name: "Oignon", unit: "sac 25 kg", stock: 1, min: 1, price: 15000, cost: 13500, weight: 0 },
  ],
  clients: [
    { key: "bureau", name: "Bureau Sonatel (repas à crédit)", debt: 18000, dueDays: 6 },
    { key: "aliou", name: "Aliou Diagne", debt: 4500, dueDays: -2 },
    { key: "nogaye", name: "Nogaye Sene", debt: 3000 },
    { key: "omar", name: "Omar Kane", debt: 0 },
  ],
  expenses: [
    { key: "marche", daysAgo: 0, hour: 8, label: "Marché du jour (poisson, légumes, poulet)", amount: 18000, kind: "depense" },
    { key: "marche-1", daysAgo: 1, hour: 8, label: "Marché du jour (poisson, légumes, poulet)", amount: 25000, kind: "depense" },
    { key: "gaz", daysAgo: 2, hour: 9, label: "Gaz (bouteille 12 kg)", amount: 6500, kind: "depense" },
    { key: "riz", daysAgo: 3, hour: 8, label: "Achat : 2 sacs de riz", amount: 41000, kind: "achat", item: "riz", qty: 2 },
    { key: "restes", daysAgo: 1, hour: 22, label: "Restes de fin de service", amount: 2800, kind: "perte" },
  ],
  invoice: {
    client: "bureau",
    daysAgo: 1,
    status: "envoyee",
    lines: [
      { label: "Ceebu jën", qty: 8, unit: "plat", unitPrice: 1500, item: "ceebu-jen" },
      { label: "Bissap", qty: 8, unit: "bouteille", unitPrice: 500, item: "bissap" },
    ],
  },
  reminder: { client: "aliou", note: "Relance envoyée sur WhatsApp" },
};

// ————————————————————————————————————————————————————————————————— Boulangerie
const boulangerie: Kit = {
  seed: 20261108,
  name: "Boulangerie du Quartier (démo)",
  noun: "Boulangerie",
  title: "Découvre Jokko avec une boulangerie exemple",
  text: "Baguettes, croissants, fournées, tournée du matin chez les boutiques et pain rendu.",
  yours: "ta vraie boulangerie",
  address: "Pikine Rue 10",
  paymentInfo: "Wave ou Orange Money",
  openingCash: 15000,
  perDay: [35, 55],
  today: 25,
  hours: [6, 21],
  pay: [0.8, 0.12, 0.05],
  items: [
    { key: "baguette", name: "Baguette", unit: "baguette", stock: 140, min: 50, price: 150, cost: 95, weight: 12, max: 10 },
    { key: "pain-mie", name: "Pain de mie", unit: "pain", stock: 12, min: 5, price: 750, cost: 450, weight: 3, max: 2 },
    { key: "croissant", name: "Croissant", unit: "croissant", stock: 30, min: 10, price: 300, cost: 170, weight: 5, max: 4 },
    { key: "choco", name: "Pain au chocolat", unit: "pièce", stock: 20, min: 10, price: 350, cost: 200, weight: 4, max: 4 },
    { key: "gateau", name: "Part de gâteau", unit: "pièce", stock: 8, min: 4, price: 500, cost: 250, weight: 2, max: 2 },
    // Ingrédients.
    { key: "farine", name: "Farine", unit: "sac 50 kg", stock: 6, min: 4, price: 17500, cost: 16800, weight: 0 },
    { key: "levure", name: "Levure", unit: "paquet 500 g", stock: 3, min: 4, price: 2000, cost: 1500, weight: 0 },
    { key: "sucre", name: "Sucre", unit: "sac 50 kg", stock: 1, min: 1, price: 31000, cost: 29500, weight: 0 },
  ],
  clients: [
    { key: "modou", name: "Boutique Modou", debt: 30000, dueDays: 1, tournee: [{ item: "baguette", qty: 100 }] },
    { key: "awa", name: "Boutique Awa", debt: 18000, dueDays: 1, tournee: [{ item: "baguette", qty: 60 }, { item: "croissant", qty: 10 }] },
    { key: "kiosque", name: "Kiosque Ibou", debt: 6000, dueDays: -1, tournee: [{ item: "baguette", qty: 40 }] },
    { key: "fatou", name: "Fatou (dibiterie)", debt: 0 },
  ],
  expenses: [
    { key: "farine", daysAgo: 2, hour: 7, label: "Achat : 10 sacs de farine", amount: 168000, kind: "achat", item: "farine", qty: 10 },
    { key: "bois", daysAgo: 1, hour: 6, label: "Bois et gaz du four", amount: 12000, kind: "depense" },
    { key: "mitron", daysAgo: 0, hour: 7, label: "Paie du mitron (jour)", amount: 3000, kind: "depense" },
    { key: "invendu", daysAgo: 1, hour: 21, label: "Pain invendu", amount: 1900, kind: "perte", item: "baguette", qty: 20 },
  ],
  invoice: {
    client: "modou",
    daysAgo: 1,
    status: "envoyee",
    lines: [{ label: "Baguette", qty: 600, unit: "baguette", unitPrice: 125, item: "baguette" }],
  },
  reminder: { client: "kiosque", note: "Relance envoyée sur WhatsApp" },
  extra: ({ id, at, clients, products }) => {
    // Tournée du matin : chaque boutique cliente prend son pain à crédit.
    const sales: Sale[] = [];
    for (let d = 6; d >= 0; d--) {
      for (const c of clients) {
        for (const l of c.tournee ?? []) {
          const p = products.find((x) => x.id === l.productId)!;
          const unitPrice = p.id === id("p-baguette") ? 125 : p.price; // prix revendeur
          sales.push({ id: id(`s-t-${d}-${c.id}-${p.id}`), at: at(d, 6.5), label: p.name, amount: unitPrice * l.qty, qty: l.qty, productId: p.id, cost: Math.round((p.cost ?? 0) * l.qty), unit: p.unit, payment: "credit", clientId: c.id });
        }
      }
    }
    return { sales };
  },
};

// ————————————————————————————————————————————————————————————————— Multiservice
// ————————————————————————————————————————————————————————————————— Mercerie
const mercerie: Kit = {
  seed: 20261113,
  name: "Mercerie Ndèye Fatou (démo)",
  noun: "Mercerie",
  title: "Découvre Jokko avec une mercerie exemple",
  text: "Fil de toutes les couleurs, boutons, fermetures, galons au mètre, tailleurs à crédit et une semaine de ventes.",
  yours: "ta vraie mercerie",
  address: "Marché HLM, Dakar",
  paymentInfo: "Wave ou Orange Money",
  openingCash: 10000,
  perDay: [14, 24],
  today: 9,
  hours: [9, 20],
  pay: [0.6, 0.25, 0.1],
  items: [
    { key: "fil-noir", name: "Fil à coudre · noir", unit: "bobine", stock: 60, min: 20, price: 300, cost: 180, weight: 8, max: 6 },
    { key: "fil-blanc", name: "Fil à coudre · blanc", unit: "bobine", stock: 45, min: 20, price: 300, cost: 180, weight: 7, max: 6 },
    { key: "fil-bleu", name: "Fil à coudre · bleu roi", unit: "bobine", stock: 12, min: 15, price: 300, cost: 180, weight: 4, max: 4 },
    { key: "fil-or", name: "Fil à broder · or", unit: "cône", stock: 8, min: 4, price: 2500, cost: 1700, weight: 2, max: 1 },
    { key: "boutons-dores", name: "Boutons dorés", unit: "douzaine", stock: 30, min: 10, price: 600, cost: 350, weight: 4, max: 3 },
    { key: "boutons-chemise", name: "Boutons de chemise · blanc", unit: "douzaine", stock: 40, min: 10, price: 250, cost: 120, weight: 4, max: 4 },
    { key: "zip-20", name: "Fermeture éclair · 20 cm", unit: "pièce", stock: 80, min: 25, price: 150, cost: 80, weight: 6, max: 6 },
    { key: "zip-50", name: "Fermeture éclair · 50 cm", unit: "pièce", stock: 25, min: 10, price: 350, cost: 200, weight: 3, max: 3 },
    { key: "galon-dore", name: "Galon doré", unit: "mètre", stock: 100, min: 30, price: 200, cost: 110, weight: 4, max: 10 },
    { key: "elastique", name: "Élastique 2 cm", unit: "mètre", stock: 150, min: 40, price: 100, cost: 50, weight: 3, max: 10 },
    { key: "entoilage", name: "Entoilage", unit: "mètre", stock: 30, min: 10, price: 700, cost: 450, weight: 2, max: 3 },
    { key: "aiguilles", name: "Aiguilles machine (paquet)", unit: "paquet", stock: 6, min: 8, price: 1000, cost: 650, weight: 2, max: 2 },
  ],
  clients: [
    { key: "dabakh", name: "Atelier Dabakh Couture", debt: 18500, dueDays: 4 },
    { key: "ousmane", name: "Ousmane Tailleur", debt: 7200, dueDays: -2 },
    { key: "awa", name: "Awa Couture", debt: 0 },
    { key: "fallou", name: "Fallou Styliste", debt: 0 },
  ],
  expenses: [
    { key: "achat", daysAgo: 3, hour: 9, label: "Achat : 10 douzaines de boutons dorés", amount: 3500, kind: "achat", item: "boutons-dores", qty: 10 },
    { key: "transport", daysAgo: 3, hour: 11, label: "Transport depuis Sandaga", amount: 1500, kind: "depense" },
    { key: "loyer", daysAgo: 5, hour: 10, label: "Part du loyer de la semaine", amount: 7500, kind: "depense" },
  ],
  invoice: {
    client: "dabakh",
    daysAgo: 2,
    status: "envoyee",
    lines: [
      { label: "Fil à coudre · noir", qty: 20, unit: "bobine", unitPrice: 280, item: "fil-noir" },
      { label: "Galon doré", qty: 25, unit: "mètre", unitPrice: 200, item: "galon-dore" },
    ],
  },
  reminder: { client: "ousmane", note: "Relance envoyée sur WhatsApp" },
};

const multiservice: Kit = {
  seed: 20261109,
  name: "Keur Service Plus (démo)",
  noun: "Multiservice",
  title: "Découvre Jokko avec un multiservice exemple",
  text: "Photocopies, impressions, bâches au m², flocage de maillots, papier, encre et flex, commandes avec avance.",
  yours: "ton vrai multiservice",
  address: "Face université, Fann",
  paymentInfo: "Wave ou Orange Money",
  openingCash: 10000,
  perDay: [20, 32],
  today: 14,
  hours: [8, 21],
  pay: [0.7, 0.2, 0.07],
  items: [
    { key: "photocopie", name: "Photocopie", unit: "copie", stock: 1800, min: 300, price: 25, cost: 10, weight: 12, max: 60 },
    { key: "impression", name: "Impression noir et blanc", unit: "page", stock: 900, min: 200, price: 50, cost: 15, weight: 8, max: 40 },
    { key: "couleur", name: "Impression couleur", unit: "page", stock: 300, min: 100, price: 200, cost: 70, weight: 4, max: 10 },
    { key: "plastif", name: "Plastification", unit: "pièce", stock: 80, min: 20, price: 500, cost: 150, weight: 4, max: 3 },
    { key: "photo-id", name: "Photos d'identité (4)", unit: "lot", stock: 50, min: 10, price: 1000, cost: 300, weight: 4, max: 1 },
    { key: "saisie", name: "Saisie de document", unit: "page", stock: 500, min: 50, price: 500, cost: 50, weight: 2, max: 4 },
    { key: "reliure", name: "Reliure (mémoire)", unit: "pièce", stock: 25, min: 8, price: 1500, cost: 600, weight: 1, max: 2 },
    { key: "rame", name: "Rame de papier A4", unit: "rame", stock: 6, min: 4, price: 4000, cost: 3200, weight: 1, max: 1 },
    { key: "encre", name: "Cartouche d'encre", unit: "pièce", stock: 1, min: 2, price: 15000, cost: 11000, weight: 0 },
    { key: "cle", name: "Clé USB 16 Go", unit: "pièce", stock: 10, min: 3, price: 5000, cost: 3000, weight: 1, max: 1 },
    { key: "enveloppe", name: "Enveloppe kraft", unit: "pièce", stock: 60, min: 20, price: 100, cost: 50, weight: 2, max: 4 },
    { key: "flex-vert", name: "Flex vert", unit: "mètre", stock: 18, min: 5, price: 0, cost: 2500, weight: 0 },
    { key: "flex-jaune", name: "Flex jaune", unit: "mètre", stock: 12, min: 5, price: 0, cost: 2500, weight: 0 },
    { key: "flex-blanc", name: "Flex blanc", unit: "mètre", stock: 4, min: 5, price: 0, cost: 2500, weight: 0 },
    { key: "bache", name: "Bâche (rouleau)", unit: "m²", stock: 40, min: 10, price: 0, cost: 1800, weight: 0 },
    { key: "maillot-m", name: "Maillot blanc · M", unit: "pièce", stock: 15, min: 5, price: 3500, cost: 2000, weight: 1, max: 2 },
    { key: "maillot-l", name: "Maillot blanc · L", unit: "pièce", stock: 12, min: 5, price: 3500, cost: 2000, weight: 1, max: 2 },
    { key: "maillot-xl", name: "Maillot blanc · XL", unit: "pièce", stock: 3, min: 5, price: 3500, cost: 2000, weight: 1, max: 1 },
  ],
  clients: [
    { key: "ecole", name: "École Les Cours Sainte-Marie", debt: 35000, dueDays: 7 },
    { key: "mamadou", name: "Mamadou Ba (étudiant)", debt: 3500, dueDays: -2 },
    { key: "mairie", name: "Bureau de quartier", debt: 12000, dueDays: 4 },
    { key: "sokhna", name: "Sokhna Diop", debt: 0 },
  ],
  expenses: [
    { key: "papier", daysAgo: 2, hour: 9, label: "Achat : 5 rames de papier", amount: 16000, kind: "achat", item: "rame", qty: 5 },
    { key: "encre", daysAgo: 4, hour: 10, label: "Achat : cartouche d'encre", amount: 11000, kind: "achat", item: "encre", qty: 1 },
    { key: "woyofal", daysAgo: 1, hour: 10, label: "Électricité (Woyofal)", amount: 10000, kind: "depense" },
    { key: "bourrage", daysAgo: 3, hour: 15, label: "Feuilles gâchées (bourrage)", amount: 400, kind: "perte" },
  ],
  invoice: {
    client: "ecole",
    daysAgo: 2,
    status: "envoyee",
    lines: [
      { label: "Photocopie", qty: 1000, unit: "copie", unitPrice: 20, item: "photocopie" },
      { label: "Reliure (mémoire)", qty: 10, unit: "pièce", unitPrice: 1500, item: "reliure" },
    ],
  },
  reminder: { client: "mamadou", note: "Relance envoyée sur WhatsApp" },
  extra: ({ id, at, clients }) => {
    const c = (k: string) => clients.find((x) => x.id === id(`c-${k}`))!;
    const repairs: Repair[] = [
      { id: id("r-1"), at: at(1, 11), number: "R-001", clientId: c("mamadou").id, clientName: c("mamadou").name, phone: "", device: "Ordinateur HP", problem: "Formatage et Windows", price: 10000, paid: 5000, parts: [], status: "depot" },
      { id: id("r-2"), at: at(3, 15), number: "R-002", clientId: c("sokhna").id, clientName: c("sokhna").name, phone: "", device: "Imprimante Canon", problem: "Bourrage papier", price: 5000, paid: 0, parts: [], status: "repare", repairedAt: at(1, 17) },
    ];
    repairs.push({ id: id("r-3"), at: at(2, 10), number: "R-003", clientId: c("ecole").id, clientName: "ASC Mboss", phone: "", device: "20 maillots floqués", problem: "Noms + numéros 1 à 20, flex vert · pour samedi", price: 70000, paid: 30000, parts: [], status: "depot" });
    const sales: Sale[] = [
      { id: id("s-rav-1"), at: repairs[0].at, label: "Service · Commande R-001 · Ordinateur HP (avance)", amount: 5000, clientId: c("mamadou").id, payment: "especes" },
      { id: id("s-rav-3"), at: repairs[2].at, label: "Service · Commande R-003 · 20 maillots floqués (avance)", amount: 30000, payment: "especes" },
      { id: id("s-bache-1"), at: at(1, 16), label: "Service · Bâche grand format (2 × 1,5 m = 3 m²)", amount: 15000, qty: 3, cost: 5400, payment: "wave" },
      { id: id("s-floc-1"), at: at(0, 12), label: "Service · Flocage t-shirt / maillot × 4 pièces", amount: 10000, qty: 4, cost: 3000, payment: "especes" },
    ];
    const p = (k: string) => id(`p-${k}`);
    const services: ServiceItem[] = [
      { id: id("srv-pn"), name: "Photocopie noir A4", price: 25, unit: "page" },
      { id: id("srv-ic"), name: "Impression couleur A4", price: 150, unit: "page" },
      { id: id("srv-bache"), name: "Bâche grand format", price: 5000, unit: "m2", matter: { productId: p("bache"), per: 1 } },
      { id: id("srv-floc"), name: "Flocage t-shirt / maillot", price: 2500, unit: "piece", matter: { productId: p("flex-vert"), per: 0.3 } },
      { id: id("srv-logo"), name: "Conception de logo", price: 15000 },
      { id: id("srv-cartes"), name: "Cartes de visite (100)", price: 10000, unit: "piece" },
    ];
    return { repairs, sales, services };
  },
};

// ————————————————————————————————————————————————————————————————— Autre activité (cosmétiques)
const autre: Kit = {
  seed: 20261110,
  name: "Beauté Aminata (démo)",
  noun: "Boutique",
  title: "Découvre Jokko avec une boutique exemple",
  text: "Une boutique de cosmétiques et de parfums : articles, clientes, dettes et une semaine de ventes.",
  yours: "ta vraie boutique",
  address: "Marché Colobane, Dakar",
  paymentInfo: "Wave ou Orange Money",
  openingCash: 10000,
  perDay: [10, 18],
  today: 7,
  hours: [9.5, 20.5],
  pay: [0.55, 0.3, 0.1],
  items: [
    { key: "lait", name: "Lait de toilette", unit: "flacon", stock: 24, min: 8, price: 2500, cost: 1600, weight: 6, max: 2 },
    { key: "creme", name: "Crème pour le visage", unit: "pot", stock: 18, min: 6, price: 1500, cost: 900, weight: 5, max: 2 },
    { key: "parfum", name: "Parfum 100 ml", unit: "flacon", stock: 9, min: 3, price: 5000, cost: 3000, weight: 3, max: 1 },
    { key: "encens", name: "Encens (thiouraye)", unit: "sachet", stock: 30, min: 10, price: 1000, cost: 500, weight: 6, max: 3 },
    { key: "gongo", name: "Gongo", unit: "sachet", stock: 4, min: 6, price: 1500, cost: 800, weight: 3, max: 2 },
    { key: "meches", name: "Mèches", unit: "paquet", stock: 15, min: 5, price: 3000, cost: 2000, weight: 4, max: 2 },
    { key: "coco", name: "Huile de coco", unit: "flacon", stock: 20, min: 6, price: 1000, cost: 600, weight: 4, max: 2 },
    { key: "beurre", name: "Beurre de karité", unit: "pot", stock: 16, min: 5, price: 1500, cost: 900, weight: 4, max: 2 },
    { key: "vernis", name: "Vernis à ongles", unit: "pièce", stock: 40, min: 10, price: 500, cost: 250, weight: 4, max: 3 },
    { key: "henne", name: "Henné", unit: "sachet", stock: 25, min: 8, price: 500, cost: 250, weight: 3, max: 3 },
  ],
  clients: [
    { key: "dieynaba", name: "Dieynaba Sall", debt: 7500, dueDays: 3 },
    { key: "yacine", name: "Yacine Mbodj", debt: 12000, dueDays: -4 },
    { key: "oumou", name: "Oumou Ly", debt: 3000 },
    { key: "marieme", name: "Marième Faye", debt: 0 },
  ],
  expenses: [
    { key: "achat", daysAgo: 3, hour: 10, label: "Achat : 12 laits de toilette", amount: 19200, kind: "achat", item: "lait", qty: 12 },
    { key: "transport", daysAgo: 3, hour: 12, label: "Transport", amount: 1500, kind: "depense" },
    { key: "pub", daysAgo: 1, hour: 20, label: "Publicité Facebook", amount: 2000, kind: "depense" },
    { key: "casse", daysAgo: 5, hour: 16, label: "Parfum cassé", amount: 3000, kind: "perte", item: "parfum", qty: 1 },
  ],
  invoice: {
    client: "yacine",
    daysAgo: 2,
    status: "envoyee",
    lines: [
      { label: "Parfum 100 ml", qty: 2, unit: "flacon", unitPrice: 5000, item: "parfum" },
      { label: "Lait de toilette", qty: 1, unit: "flacon", unitPrice: 2500, item: "lait" },
    ],
  },
  reminder: { client: "yacine", note: "Relance envoyée sur WhatsApp" },
};

const KITS: Record<MetierId, Kit> = { alimentation, pharmacie, quincaillerie, couture, reparation, vetements, mercerie, restauration, boulangerie, multiservice, autre };

/** Les métiers qui ont une démo (tous). */
export const DEMO_METIERS: MetierId[] = METIERS.map((m) => m.id);

/** Textes de la démo d'un métier : invitation (écran Parler, Réglages) et bandeau du mode démo. */
export function demoInfo(activity: string | undefined | null) {
  const metier = metierOf(activity);
  const k = KITS[metier.id];
  return {
    metier: metier.id,
    title: k.title,
    text: `${k.text} Essaie tout sans risque : ${k.yours} ne change pas.`,
    bar: `${k.noun} exemple avec des prix du Sénégal : essaie tout, rien n’est enregistré.`,
  };
}

/** L'entreprise de démonstration d'un métier, datée par rapport à « maintenant ». */
export function buildDemoShop(now = new Date(), activity: string | MetierId = "alimentation"): Shop {
  const metier = metierOf(activity);
  const k = KITS[metier.id];
  const rnd = random(k.seed);
  const id = (key: string) => `${DEMO_PREFIX}${key}`;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const at = (daysAgo: number, hour: number) => new Date(startOfToday.getTime() - daysAgo * day + hour * 3600_000).toISOString();

  const products: Product[] = k.items.map((i) => ({
    id: id(`p-${i.key}`),
    name: i.name,
    unit: i.unit,
    stock: i.stock,
    min: i.min,
    price: i.price,
    cost: i.cost,
    ...(i.retail ? { retail: { ...i.retail } } : {}),
    ...(i.expiresIn !== undefined ? { expiresAt: ymd(new Date(now.getTime() + i.expiresIn * day)) } : {}),
  }));
  const clients: Client[] = k.clients.map((c) => ({
    id: id(`c-${c.key}`),
    name: c.name,
    phone: "",
    debt: c.debt,
    ...(c.dueDays !== undefined ? { dueAt: new Date(now.getTime() + c.dueDays * day).toISOString() } : {}),
    ...(c.measures ? { measures: { ...c.measures } } : {}),
    ...(c.tournee ? { tournee: c.tournee.map((l) => ({ productId: id(`p-${l.item}`), qty: l.qty })) } : {}),
  }));

  // Une semaine de ventes au comptoir.
  const sales: Sale[] = [];
  const sold = k.items.filter((i) => i.weight > 0);
  const totalWeight = sold.reduce((n, i) => n + i.weight, 0);
  const pick = () => {
    let r = rnd() * totalWeight;
    for (const i of sold) if ((r -= i.weight) <= 0) return i;
    return sold[0];
  };
  const [open, close] = k.hours;
  const creditClients = clients.filter((c) => !c.tournee).slice(0, 4);
  for (let d = 6; d >= 0; d--) {
    const base = startOfToday.getTime() - d * day;
    const isToday = d === 0;
    const count = isToday ? k.today : k.perDay[0] + Math.floor(rnd() * (k.perDay[1] - k.perDay[0] + 1));
    for (let n = 0; n < count; n++) {
      // Aujourd'hui, seulement jusqu'à maintenant.
      const end = isToday ? Math.max(base + (open + 0.5) * 3600_000, Math.min(now.getTime() - 60_000, base + close * 3600_000)) : base + close * 3600_000;
      const time = base + open * 3600_000 + rnd() * (end - base - open * 3600_000);
      const item = pick();
      const retail = Boolean(item.retail) && rnd() < (k.retailShare ?? 0.7);
      const qty = 1 + Math.floor(rnd() * (item.max ?? (item.price > 10000 ? 1 : 3)));
      const unitPrice = retail ? item.retail!.price : item.price;
      const unitCost = retail ? item.cost / item.retail!.perUnit : item.cost;
      const p = rnd();
      const [cash, wave, om] = k.pay;
      const payment = p < cash ? undefined : p < cash + wave ? "wave" : p < cash + wave + om ? "om" : "credit";
      const client = payment === "credit" && creditClients.length ? creditClients[Math.floor(rnd() * creditClients.length)] : undefined;
      sales.push({
        id: id(`s-${d}-${n}`),
        at: new Date(Math.min(time, now.getTime() - 60_000)).toISOString(),
        label: item.name,
        amount: Math.round(unitPrice * qty),
        qty,
        productId: id(`p-${item.key}`),
        cost: Math.round(unitCost * qty),
        ...(retail ? { retail: true, unit: item.retail!.unit } : { unit: item.unit }),
        ...(payment === "credit" && !client ? {} : payment ? { payment: payment as Sale["payment"] } : {}),
        ...(client ? { clientId: client.id } : {}),
      });
    }
  }

  const extra = k.extra?.({ id, at, now, products, clients, rnd }) ?? {};
  // Rien dans le futur (une avance « d'aujourd'hui » à 15 h quand il est 9 h).
  for (const s of extra.sales ?? []) if (Date.parse(s.at) < now.getTime()) sales.push(s);
  sales.sort((a, b) => a.at.localeCompare(b.at));

  const expenses: Expense[] = k.expenses.map((e) => ({
    id: id(`e-${e.key}`),
    at: new Date(Math.min(Date.parse(at(e.daysAgo, e.hour)), now.getTime() - 120_000)).toISOString(),
    label: e.label,
    amount: e.amount,
    kind: e.kind,
    ...(e.item ? { productId: id(`p-${e.item}`), qty: e.qty } : {}),
  }));
  const lines: InvoiceLine[] = k.invoice.lines.map((l) => ({ label: l.label, qty: l.qty, unit: l.unit, unitPrice: l.unitPrice, ...(l.item ? { productId: id(`p-${l.item}`) } : {}) }));
  const invoices: Invoice[] = [
    {
      id: id("f-1"),
      number: "F-2026-001",
      at: at(k.invoice.daysAgo, 11),
      clientId: id(`c-${k.invoice.client}`),
      amount: lines.reduce((a, l) => a + l.qty * l.unitPrice, 0),
      status: k.invoice.status,
      lines,
      dueAt: new Date(now.getTime() + 7 * day).toISOString(),
    },
  ];
  const reminders: Reminder[] = [{ id: id("r-1"), at: at(1, 17), clientId: id(`c-${k.reminder.client}`), note: k.reminder.note }];

  return {
    id: id("boutique"),
    name: k.name,
    city: "Dakar",
    activity: metier.label,
    openingCash: k.openingCash,
    lastInventoryAt: at(20, 9),
    address: k.address,
    paymentInfo: k.paymentInfo,
    // La démo montre tout : offre Avancé.
    plan: { plan: "avance", until: new Date(now.getTime() + 365 * day).toISOString(), trialUntil: null },
    products,
    clients,
    sales,
    expenses,
    invoices,
    reminders,
    shortcuts: [],
    ...(extra.repairs ? { repairs: extra.repairs } : {}),
    ...(extra.couture ? { couture: extra.couture } : {}),
    ...(extra.services ? { services: extra.services } : {}),
    ...(extra.licences ? { licences: extra.licences } : {}),
  };
}

/**
 * Profil de démonstration : le même commerçant, avec seulement l'entreprise exemple de son métier
 * (ou du métier choisi dans le bandeau de la démo, pour la montrer chez un autre commerçant).
 */
export function demoProfile(real: Profile, now = new Date(), activity?: string | MetierId): Profile {
  const own = real.shops.find((s) => s.id === real.shopId)?.activity;
  const shop = buildDemoShop(now, activity ?? own ?? "alimentation");
  return { ...real, shopId: shop.id, shops: [shop], roles: { [shop.id]: "patron" } };
}
