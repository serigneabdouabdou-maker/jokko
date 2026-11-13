/**
 * Réparateurs (demande de Fallou, 13/11/2026) : services sans pièce et licences des outils.
 *
 * - Service : décodage, déblocage, configuration, création de compte, maintenance, réparation d'imprimante…
 *   Le client paie tout de suite ; il n'y a pas de pièce : tout le prix est de la main-d'œuvre (bénéfice entier).
 *   Vente « Service · Décodage », marquée avec la licence utilisée s'il y en a une.
 * - Licence : un outil de décodage payé d'un coup (90 000 F pour 1 an) et utilisé des mois.
 *   L'argent sort de la caisse le jour de l'achat (sortie « achat »), mais dans les bénéfices son coût est
 *   réparti sur sa durée : 90 000 F sur 12 mois = 7 500 F par mois. Jokko montre aussi ce qu'elle a rapporté.
 */
import type { Licence, Payment, Sale, ServiceItem, ServiceUnit, Shop } from "../model.ts";
import { metierOf } from "./metiers.ts";

const DAY = 86_400_000;
let seq = 0;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Libellé d'une vente de service : reconnu par les Bénéfices (main-d'œuvre, pas de prix d'achat). */
export const SERVICE_PREFIX = "Service · ";
export const isServiceSale = (s: Pick<Sale, "label" | "productId">) => !s.productId && s.label.startsWith(SERVICE_PREFIX);

/** Services courants proposés au réparateur la première fois (prix modifiables). */
export const COMMON_SERVICES: Array<Pick<ServiceItem, "name" | "price" | "unit">> = [
  { name: "Décodage", price: 5000 },
  { name: "Déblocage compte (FRP)", price: 5000 },
  { name: "Flash / mise à jour", price: 5000 },
  { name: "Configuration", price: 5000 },
  { name: "Création de compte", price: 5000 },
  { name: "Maintenance ordinateur", price: 10000 },
  { name: "Réparation imprimante", price: 8000 },
];

/**
 * Multiservice (demande de Fallou, 13/11/2026) : photocopie, impression, grand format au m², flocage, conception.
 * Prix de départ (hypothèses, modifiables par le patron).
 */
export const MULTISERVICE_SERVICES: Array<Pick<ServiceItem, "name" | "price" | "unit">> = [
  { name: "Photocopie noir A4", price: 25, unit: "page" },
  { name: "Photocopie couleur A4", price: 100, unit: "page" },
  { name: "Impression noir A4", price: 50, unit: "page" },
  { name: "Impression couleur A4", price: 150, unit: "page" },
  { name: "Impression couleur A3", price: 300, unit: "page" },
  { name: "Scan", price: 100, unit: "page" },
  { name: "Saisie", price: 500, unit: "page" },
  { name: "Plastification A4", price: 300, unit: "piece" },
  { name: "Reliure", price: 1000, unit: "piece" },
  { name: "Photos d'identité (4)", price: 1000, unit: "piece" },
  { name: "Cartes de visite (100)", price: 10000, unit: "piece" },
  { name: "Bâche grand format", price: 5000, unit: "m2" },
  { name: "Autocollant vinyle", price: 7000, unit: "m2" },
  { name: "Flocage t-shirt / maillot", price: 2500, unit: "piece" },
  { name: "Flocage nom + numéro", price: 1500, unit: "piece" },
  { name: "Conception de logo", price: 15000 },
  { name: "Conception affiche / flyer", price: 10000 },
];

/** Les services courants du métier de la boutique. */
export function commonServicesFor(activity: string | undefined | null) {
  return metierOf(activity).id === "multiservice" ? MULTISERVICE_SERVICES : COMMON_SERVICES;
}

/** Comment chaque unité se dit : « 50 pages », « 3 m² », « 12 pièces ». */
export const UNIT_WORDS: Record<ServiceUnit, { one: string; many: string; short: string }> = {
  fois: { one: "fois", many: "fois", short: "" },
  page: { one: "page", many: "pages", short: "la page" },
  piece: { one: "pièce", many: "pièces", short: "la pièce" },
  m2: { one: "m²", many: "m²", short: "le m²" },
  metre: { one: "mètre", many: "mètres", short: "le mètre" },
};

/** Quantité arrondie au centième (m², mètres). */
const q2 = (n: number) => Math.round(n * 100) / 100;
const fr = (n: number) => String(q2(n)).replace(".", ",");

export const servicesOf = (shop: Shop): ServiceItem[] => shop.services ?? [];
export const licencesOf = (shop: Shop): Licence[] => shop.licences ?? [];

export function saveService(shop: Shop, item: Omit<ServiceItem, "id"> & { id?: string }): Shop {
  const clean: ServiceItem = {
    id: item.id ?? newId("srv"),
    name: item.name.trim(),
    price: Math.max(0, Math.round(item.price)),
    ...(item.licenceId ? { licenceId: item.licenceId } : {}),
    ...(item.unit && item.unit !== "fois" ? { unit: item.unit } : {}),
    ...(item.matter && item.matter.productId && item.matter.per > 0 ? { matter: { productId: item.matter.productId, per: q2(item.matter.per) } } : {}),
  };
  if (!clean.name) return shop;
  const list = servicesOf(shop);
  const exists = list.some((s) => s.id === clean.id);
  return { ...shop, services: exists ? list.map((s) => (s.id === clean.id ? clean : s)) : [...list, clean] };
}

export function removeService(shop: Shop, id: string): Shop {
  return { ...shop, services: servicesOf(shop).filter((s) => s.id !== id) };
}

export function addCommonServices(shop: Shop): Shop {
  const have = new Set(servicesOf(shop).map((s) => s.name.toLowerCase()));
  return commonServicesFor(shop.activity).filter((c) => !have.has(c.name.toLowerCase())).reduce((s, c) => saveService(s, c), shop);
}

/**
 * Encaisse un service. Sans quantité : une fois, au prix dit (main-d'œuvre, bénéfice entier).
 * Avec quantité (pages, pièces, m², mètres) : prix × quantité, sauf montant dit. La matière liée (flex, bâche…)
 * sort du stock (quantité × consommation par unité) et son prix d'achat devient le coût de la vente.
 */
export function sellService(
  shop: Shop,
  input: { name: string; amount?: number; qty?: number; size?: { w: number; h: number }; service?: ServiceItem; licenceId?: string; payment?: Payment; clientId?: string; at?: string },
): { shop: Shop; sale: Sale } | null {
  const item = input.service;
  const unit: ServiceUnit = item?.unit ?? "fois";
  const qty = input.size ? q2(input.size.w * input.size.h) : input.qty && input.qty > 0 ? q2(input.qty) : 1;
  const amount = Math.round(input.amount ?? (item ? item.price * qty : 0));
  const name = (input.name || item?.name || "").trim();
  if (!name || amount <= 0 || !(qty > 0)) return null;
  const detail = input.size
    ? ` (${fr(input.size.w)} × ${fr(input.size.h)} m = ${fr(qty)} m²)`
    : unit !== "fois" && qty !== 1
      ? ` × ${fr(qty)} ${UNIT_WORDS[unit].many}`
      : "";
  // Matière prise dans le stock.
  let products = shop.products;
  let cost: number | undefined;
  const m = item?.matter;
  if (m && m.per > 0) {
    const p = shop.products.find((x) => x.id === m.productId);
    if (p) {
      const used = q2(m.per * qty);
      products = shop.products.map((x) => (x.id === p.id ? { ...x, stock: Math.max(0, q2(x.stock - used)) } : x));
      if (p.cost !== undefined) cost = Math.round(p.cost * used);
    }
  }
  const sale: Sale = {
    id: newId("s"),
    at: input.at ?? new Date().toISOString(),
    label: `${SERVICE_PREFIX}${name}${detail}`,
    amount,
    ...(unit !== "fois" ? { qty } : {}),
    ...(cost !== undefined ? { cost } : {}),
    ...(input.payment && input.payment !== "especes" ? { payment: input.payment } : {}),
    ...(input.clientId ? { clientId: input.clientId } : {}),
    ...((input.licenceId ?? item?.licenceId) ? { licenceId: input.licenceId ?? item?.licenceId } : {}),
  };
  return { shop: { ...shop, products, sales: [sale, ...shop.sales] }, sale };
}

/** Date (AAAA-MM-JJ) au fuseau du téléphone. */
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const startOf = (l: Licence) => new Date(`${l.startAt}T00:00:00`);
export const licenceEnd = (l: Licence) => {
  const s = startOf(l);
  return new Date(s.getFullYear(), s.getMonth() + l.months, s.getDate());
};

/**
 * Nouvelle licence (ou renouvellement). fromCash : payée avec l'argent de la caisse → sortie « achat » le jour même
 * (la caisse est juste) ; dans les bénéfices, seul le coût réparti par mois compte (licenceCharge).
 */
export function addLicence(shop: Shop, input: { name: string; cost: number; months?: number; startAt?: string; fromCash?: boolean }, now = new Date()): { shop: Shop; licence: Licence } | null {
  const cost = Math.round(input.cost);
  if (!input.name.trim() || cost <= 0) return null;
  const licence: Licence = { id: newId("lic"), name: input.name.trim(), cost, startAt: input.startAt ?? ymd(now), months: Math.max(1, Math.round(input.months ?? 12)) };
  const expenses = input.fromCash
    ? [{ id: newId("e"), at: now.toISOString(), label: `Licence ${licence.name} (${licence.months} mois)`, amount: cost, kind: "achat" as const }, ...shop.expenses]
    : shop.expenses;
  return { shop: { ...shop, expenses, licences: [licence, ...licencesOf(shop)] }, licence };
}

export function removeLicence(shop: Shop, id: string): Shop {
  const services = servicesOf(shop).map((s) => (s.licenceId === id ? { id: s.id, name: s.name, price: s.price } : s));
  return { ...shop, licences: licencesOf(shop).filter((l) => l.id !== id), services };
}

/**
 * Part du coût des licences qui tombe dans la période : chaque mois de licence vaut prix ÷ durée
 * (90 000 F sur 12 mois = 7 500 F par mois), au prorata des jours pour un mois entamé.
 */
export function licenceCharge(shop: Pick<Shop, "licences">, from: Date, to: Date): number {
  let total = 0;
  for (const l of shop.licences ?? []) {
    const s = startOf(l);
    const perMonth = l.cost / l.months;
    for (let k = 0; k < l.months; k++) {
      const a = new Date(s.getFullYear(), s.getMonth() + k, s.getDate()).getTime();
      const b = new Date(s.getFullYear(), s.getMonth() + k + 1, s.getDate()).getTime();
      const overlap = Math.min(b, to.getTime()) - Math.max(a, from.getTime());
      if (overlap > 0) total += (perMonth * overlap) / (b - a);
    }
  }
  return Math.round(total);
}

export type LicenceStats = {
  licence: Licence;
  endsAt: Date;
  daysLeft: number;
  /** Part du temps déjà utilisée (0 à 1). */
  used: number;
  perMonth: number;
  uses: number;
  earned: number;
  /** Ce que la licence a rapporté par rapport à son prix (1 = remboursée). */
  paidBack: number;
  expired: boolean;
  /** Finit dans 30 jours ou moins. */
  soon: boolean;
};

export function licenceStats(shop: Shop, l: Licence, now = new Date()): LicenceStats {
  const s = startOf(l).getTime();
  const end = licenceEnd(l);
  const sales = shop.sales.filter((x) => x.licenceId === l.id);
  const earned = sales.reduce((a, x) => a + x.amount, 0);
  const daysLeft = Math.ceil((end.getTime() - now.getTime()) / DAY);
  return {
    licence: l,
    endsAt: end,
    daysLeft,
    used: Math.min(1, Math.max(0, (now.getTime() - s) / (end.getTime() - s))),
    perMonth: Math.round(l.cost / l.months),
    uses: sales.length,
    earned,
    paidBack: l.cost ? earned / l.cost : 0,
    expired: daysLeft <= 0,
    soon: daysLeft > 0 && daysLeft <= 30,
  };
}

/** Services du mois : combien, et ce qu'ils ont rapporté (tout est main-d'œuvre). */
export function servicesMonth(shop: Shop, now = new Date()): { count: number; earned: number } {
  const from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  const list = shop.sales.filter((s) => isServiceSale(s) && Date.parse(s.at) >= from && Date.parse(s.at) < to);
  // Gagné = prix − matière utilisée (flex, bâche…) quand elle est connue.
  return { count: list.length, earned: list.reduce((a, s) => a + s.amount - (s.cost ?? 0), 0) };
}
