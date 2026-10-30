export type Lang = "fr" | "wo" | "en" | "ff";

export type Product = {
  id: string;
  name: string;
  unit: string;
  stock: number;
  min: number;
  price: number;
};

export type Client = {
  id: string;
  name: string;
  phone: string;
  debt: number;
};

export type Sale = {
  id: string;
  at: string;
  label: string;
  amount: number;
  qty?: number;
  productId?: string;
  clientId?: string;
};

export type Expense = { id: string; at: string; label: string; amount: number };

export type Invoice = {
  id: string;
  number: string;
  at: string;
  clientId: string;
  amount: number;
  status: "brouillon" | "envoyee" | "payee";
};

export type Reminder = {
  id: string;
  at: string;
  clientId: string;
  note: string;
};

export type Shortcut = { id: string; phrase: string; does: string };

export type Shop = {
  id: string;
  name: string;
  city: string;
  activity: string;
  openingCash: number;
  products: Product[];
  clients: Client[];
  sales: Sale[];
  expenses: Expense[];
  invoices: Invoice[];
  reminders: Reminder[];
  shortcuts: Shortcut[];
};

export type Profile = {
  phone: string;
  owner: string;
  lang: Lang;
  role: "patron" | "caissier";
  geminiKey: string;
  speak: boolean;
  shopId: string;
  shops: Shop[];
};

export type ChatMessage = { id: string; role: "user" | "jokko"; text: string; at: string };

const KEY = "jokko.v1";

export function uid(prefix = "id"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
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
    return JSON.parse(raw) as Profile;
  } catch {
    return null;
  }
}

export function saveProfile(profile: Profile) {
  localStorage.setItem(KEY, JSON.stringify(profile));
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

export function dayExpenses(shop: Shop): number {
  return shop.expenses.filter((s) => isToday(s.at)).reduce((a, s) => a + s.amount, 0);
}

export function expectedCash(shop: Shop): number {
  return shop.openingCash + daySales(shop) - dayExpenses(shop);
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
