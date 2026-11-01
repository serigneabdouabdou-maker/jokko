// Boutique de démonstration : une boutique de quartier à Dakar, remplie avec des produits, des prix
// indicatifs du Sénégal (fin 2026), des clients, des dettes et une semaine de ventes.
// Elle vit seulement sur le téléphone : rien n'est envoyé au serveur, et « Quitter la démo » efface tout.
import type { Client, Expense, Invoice, Product, Profile, Reminder, Sale, Shop } from "../model.ts";

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

type Item = { key: string; name: string; unit: string; stock: number; min: number; price: number; cost: number; retail?: { unit: string; perUnit: number; price: number }; weight: number };

/** Prix indicatifs d'une boutique de quartier à Dakar (à adapter à chaque boutique). */
const ITEMS: Item[] = [
  { key: "riz", name: "Riz brisé", unit: "sac 50 kg", stock: 9, min: 3, price: 22000, cost: 20500, retail: { unit: "kg", perUnit: 50, price: 475 }, weight: 9 },
  { key: "huile", name: "Huile", unit: "bidon 20 L", stock: 1.6, min: 2, price: 23500, cost: 22000, retail: { unit: "litre", perUnit: 20, price: 1250 }, weight: 8 },
  { key: "sucre", name: "Sucre", unit: "sac 50 kg", stock: 4, min: 2, price: 31000, cost: 29500, retail: { unit: "kg", perUnit: 50, price: 650 }, weight: 8 },
  { key: "lait", name: "Lait en poudre 400 g", unit: "sachet", stock: 36, min: 10, price: 2000, cost: 1750, weight: 4 },
  { key: "cafe", name: "Café Touba 250 g", unit: "paquet", stock: 22, min: 8, price: 1000, cost: 800, weight: 4 },
  { key: "the", name: "Thé vert", unit: "paquet", stock: 60, min: 20, price: 300, cost: 230, weight: 6 },
  { key: "pates", name: "Pâtes 500 g", unit: "paquet", stock: 40, min: 12, price: 500, cost: 410, weight: 4 },
  { key: "tomate", name: "Concentré de tomate", unit: "carton (50)", stock: 0.8, min: 1, price: 6750, cost: 5600, retail: { unit: "sachet", perUnit: 50, price: 150 }, weight: 7 },
  { key: "bouillon", name: "Bouillon cube", unit: "boîte (100)", stock: 3, min: 1, price: 2250, cost: 1900, retail: { unit: "cube", perUnit: 100, price: 25 }, weight: 6 },
  { key: "savon", name: "Savon", unit: "morceau", stock: 48, min: 12, price: 350, cost: 280, weight: 3 },
  { key: "javel", name: "Eau de Javel 1 L", unit: "bouteille", stock: 18, min: 6, price: 500, cost: 400, weight: 2 },
  { key: "eau", name: "Eau minérale 1,5 L", unit: "bouteille", stock: 30, min: 12, price: 400, cost: 320, weight: 4 },
  { key: "pain", name: "Pain", unit: "baguette", stock: 25, min: 10, price: 175, cost: 150, weight: 8 },
  { key: "oignon", name: "Oignon", unit: "sac 25 kg", stock: 2, min: 1, price: 15000, cost: 13500, retail: { unit: "kg", perUnit: 25, price: 650 }, weight: 6 },
  { key: "pdt", name: "Pomme de terre", unit: "sac 25 kg", stock: 1.5, min: 1, price: 13750, cost: 12500, retail: { unit: "kg", perUnit: 25, price: 600 }, weight: 4 },
  { key: "sardine", name: "Sardines", unit: "boîte", stock: 24, min: 8, price: 500, cost: 400, weight: 2 },
  { key: "laitconc", name: "Lait concentré sucré", unit: "boîte", stock: 20, min: 6, price: 650, cost: 540, weight: 2 },
  { key: "allumettes", name: "Allumettes", unit: "paquet (10)", stock: 6, min: 2, price: 250, cost: 200, retail: { unit: "boîte", perUnit: 10, price: 25 }, weight: 2 },
];

/** Clients d'exemple : sans numéro, pour ne jamais écrire à une vraie personne. */
const CLIENTS: Array<{ key: string; name: string; debt: number; dueDays?: number }> = [
  { key: "awa", name: "Awa Ndiaye", debt: 12500, dueDays: 3 },
  { key: "moussa", name: "Moussa Diop", debt: 20000, dueDays: -4 },
  { key: "fatou", name: "Fatou Sarr", debt: 8500, dueDays: 6 },
  { key: "mariama", name: "Mariama Ba", debt: 4250 },
  { key: "ousmane", name: "Ousmane Fall", debt: 0 },
  { key: "ibrahima", name: "Ibrahima Sy", debt: 0 },
];

const day = 86_400_000;

/** La boutique de démonstration, datée par rapport à « maintenant ». */
export function buildDemoShop(now = new Date()): Shop {
  const rnd = random(20261101);
  const id = (k: string) => `${DEMO_PREFIX}${k}`;
  const products: Product[] = ITEMS.map((i) => ({
    id: id(`p-${i.key}`),
    name: i.name,
    unit: i.unit,
    stock: i.stock,
    min: i.min,
    price: i.price,
    cost: i.cost,
    ...(i.retail ? { retail: { ...i.retail } } : {}),
  }));
  const clients: Client[] = CLIENTS.map((c) => ({
    id: id(`c-${c.key}`),
    name: c.name,
    phone: "",
    debt: c.debt,
    ...(c.dueDays !== undefined ? { dueAt: new Date(now.getTime() + c.dueDays * day).toISOString() } : {}),
  }));

  // Une semaine de ventes : beaucoup de petites ventes au détail, quelques sacs entiers.
  const sales: Sale[] = [];
  const totalWeight = ITEMS.reduce((n, i) => n + i.weight, 0);
  const pick = () => {
    let r = rnd() * totalWeight;
    for (const i of ITEMS) if ((r -= i.weight) <= 0) return i;
    return ITEMS[0];
  };
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  for (let d = 6; d >= 0; d--) {
    const base = startOfToday.getTime() - d * day;
    const isToday = d === 0;
    const count = isToday ? 14 : 18 + Math.floor(rnd() * 12);
    for (let n = 0; n < count; n++) {
      // Ouverture 7 h 30, fermeture 21 h ; aujourd'hui, seulement jusqu'à maintenant.
      const end = isToday ? Math.max(base + 8 * 3600_000, Math.min(now.getTime() - 60_000, base + 21 * 3600_000)) : base + 21 * 3600_000;
      const at = base + 7.5 * 3600_000 + rnd() * (end - base - 7.5 * 3600_000);
      const item = pick();
      const retail = Boolean(item.retail) && rnd() < 0.8;
      const qty = retail ? 1 + Math.floor(rnd() * (item.retail!.unit === "cube" || item.retail!.unit === "sachet" ? 6 : 3)) : 1 + Math.floor(rnd() * (item.price > 10000 ? 1 : 3));
      const unitPrice = retail ? item.retail!.price : item.price;
      const unitCost = retail ? item.cost / item.retail!.perUnit : item.cost;
      const p = rnd();
      const payment = p < 0.62 ? undefined : p < 0.85 ? "wave" : p < 0.95 ? "om" : "credit";
      const client = payment === "credit" ? clients[Math.floor(rnd() * 4)] : undefined;
      sales.push({
        id: id(`s-${d}-${n}`),
        at: new Date(at).toISOString(),
        label: item.name,
        amount: Math.round(unitPrice * qty),
        qty,
        productId: id(`p-${item.key}`),
        cost: Math.round(unitCost * qty),
        ...(retail ? { retail: true, unit: item.retail!.unit } : { unit: item.unit }),
        ...(payment ? { payment: payment as Sale["payment"] } : {}),
        ...(client ? { clientId: client.id } : {}),
      });
    }
  }
  sales.sort((a, b) => a.at.localeCompare(b.at));

  const at = (daysAgo: number, hour: number) => new Date(startOfToday.getTime() - daysAgo * day + hour * 3600_000).toISOString();
  const expenses: Expense[] = [
    { id: id("e-transport"), at: at(0, 9), label: "Transport marchandise", amount: 2000, kind: "depense" },
    { id: id("e-woyofal"), at: at(2, 10), label: "Électricité (Woyofal)", amount: 5000, kind: "depense" },
    { id: id("e-achat-riz"), at: at(3, 8), label: "Achat : 5 sacs de riz", amount: 102500, kind: "achat" },
    { id: id("e-perte"), at: at(4, 18), label: "Pain invendu", amount: 875, kind: "perte" },
  ];
  const invoices: Invoice[] = [
    {
      id: id("f-1"),
      number: "F-2026-001",
      at: at(1, 11),
      clientId: id("c-moussa"),
      amount: 51500,
      status: "envoyee",
      lines: [
        { label: "Riz brisé", qty: 2, unit: "sac 50 kg", unitPrice: 22000, productId: id("p-riz") },
        { label: "Huile", qty: 6, unit: "litre", unitPrice: 1250, productId: id("p-huile") },
      ],
      dueAt: new Date(now.getTime() + 7 * day).toISOString(),
    },
  ];
  const reminders: Reminder[] = [{ id: id("r-1"), at: at(1, 17), clientId: id("c-moussa"), note: "Relance envoyée sur WhatsApp" }];

  return {
    id: id("boutique"),
    name: "Boutique Awa (démo)",
    city: "Dakar",
    activity: "Alimentation générale",
    openingCash: 15000,
    lastInventoryAt: at(20, 9),
    address: "Rue 10, Médina, Dakar",
    paymentInfo: "Wave ou Orange Money",
    // La démo montre tout : offre Avancé.
    plan: { plan: "avance", until: new Date(now.getTime() + 365 * day).toISOString(), trialUntil: null },
    products,
    clients,
    sales,
    expenses,
    invoices,
    reminders,
    shortcuts: [],
  };
}

/** Profil de démonstration : le même commerçant, mais avec seulement la boutique exemple. */
export function demoProfile(real: Profile, now = new Date()): Profile {
  const shop = buildDemoShop(now);
  return { ...real, shopId: shop.id, shops: [shop], roles: { [shop.id]: "patron" } };
}
