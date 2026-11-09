import { type Client, type CoutureOrder, type CoutureStatus, type Shop, todayStamp, uid } from "../model";
import { nameClash, pickByName } from "../assistant/wolofNames";
import { whatsappLink } from "./debts";

/**
 * Atelier couture (tailleurs) : commandes sur mesure.
 * Reçu → coupe → couture → finition → prêt → livré. Le client suit sa commande sur un lien (sans compte),
 * le tailleur le prévient sur WhatsApp. Les paiements (avance, acomptes, solde) entrent dans la caisse comme des ventes.
 */

const DAY = 86_400_000;
const DEFAULT_DUE_DAYS = 30;

/** Mesures habituelles d'un tailleur d'Afrique de l'Ouest (en cm). Le tailleur peut en ajouter d'autres. */
export const MEASURES: { key: string; label: string }[] = [
  { key: "cou", label: "Cou" },
  { key: "epaule", label: "Épaule" },
  { key: "poitrine", label: "Poitrine" },
  { key: "taille", label: "Taille" },
  { key: "hanches", label: "Hanches" },
  { key: "manche", label: "Longueur de manche" },
  { key: "bras", label: "Tour de bras" },
  { key: "poignet", label: "Poignet" },
  { key: "haut", label: "Longueur du haut" },
  { key: "boubou", label: "Longueur du boubou / de la robe" },
  { key: "pantalon", label: "Longueur du pantalon / de la jupe" },
  { key: "cuisse", label: "Tour de cuisse" },
  { key: "bas", label: "Bas du pantalon" },
];

/** Les étapes, dans l'ordre (sans « annulé »). */
export const STEPS: CoutureStatus[] = ["recu", "coupe", "couture", "finition", "pret", "livre"];
export const STEP_LABEL: Record<CoutureStatus, string> = {
  recu: "Reçu",
  coupe: "Coupe",
  couture: "Couture",
  finition: "Finition",
  pret: "Prêt",
  livre: "Livré",
  annule: "Annulé",
};

export const ordersOf = (shop: Shop): CoutureOrder[] => shop.couture ?? [];
export const remaining = (o: CoutureOrder) => Math.max(0, o.price - o.paid);
export const isOpen = (o: CoutureOrder) => o.status !== "livre" && o.status !== "annule";

export function nextCoutureNumber(shop: Shop): string {
  const max = ordersOf(shop).reduce((m, o) => Math.max(m, Number(o.number.replace(/\D/g, "")) || 0), 0);
  return `C-${String(max + 1).padStart(3, "0")}`;
}

/** Code du lien de suivi : 16 caractères au hasard, impossible à deviner. */
export function newToken(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("").slice(0, 16);
}

/** Lien que le client ouvre pour suivre sa commande (aucun compte nécessaire). */
export const trackUrl = (o: CoutureOrder, origin = "https://jokkoapp.com") => `${origin}/?suivi=${o.token}`;

/** Mesures propres : nombres en cm, arrondis au demi-centimètre, entre 1 et 300. */
export function cleanMeasures(input: Record<string, number | string | undefined>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(input)) {
    const text = String(v ?? "");
    const n = typeof v === "number" ? v : text.includes("-") ? NaN : Number(text.replace(",", ".").replace(/[^\d.]/g, ""));
    if (Number.isFinite(n) && n > 0 && n <= 300) out[k] = Math.round(n * 2) / 2;
  }
  return out;
}

function clientFor(shop: Shop, name: string, phone: string, measures: Record<string, number>): { clients: Client[]; client: Client } {
  const found = pickByName(shop.clients, name);
  const known = found.item && !nameClash(found.item.name, name) ? found.item : undefined;
  const keep = (c: Client): Client => ({
    ...c,
    ...(phone && !c.phone ? { phone } : {}),
    ...(Object.keys(measures).length ? { measures: { ...(c.measures ?? {}), ...measures } } : {}),
  });
  if (known) {
    const client = keep(known);
    return { clients: shop.clients.map((c) => (c.id === client.id ? client : c)), client };
  }
  const clean = name.replace(/\s+/g, " ").trim() || "Client";
  const client = keep({ id: uid("c"), name: clean.charAt(0).toUpperCase() + clean.slice(1), phone, debt: 0 });
  return { clients: [...shop.clients, client], client };
}

/** Mesures déjà connues d'un client (pour préremplir la nouvelle commande). */
export function knownMeasures(shop: Shop, name: string): Record<string, number> {
  const found = pickByName(shop.clients, name);
  return found.item && !nameClash(found.item.name, name) ? (found.item.measures ?? {}) : {};
}

function paymentSale(o: CoutureOrder, amount: number, what: string) {
  return { id: uid("s"), at: todayStamp(), label: `Couture ${o.number} · ${o.garment} (${what})`, amount, clientId: o.clientId, payment: "especes" as const };
}

export type NewCouture = { clientName: string; phone?: string; garment: string; fabric?: string; measures?: Record<string, number | string>; price?: number; advance?: number; dueAt?: string; note?: string };

/** Nouvelle commande : le client, ses mesures (gardées pour la prochaine fois), le modèle, le prix et l'avance (elle entre en caisse). */
export function addCouture(shop: Shop, input: NewCouture): { shop: Shop; order: CoutureOrder } {
  const phone = (input.phone ?? "").replace(/\D/g, "");
  const measures = cleanMeasures(input.measures ?? {});
  const { clients, client } = clientFor(shop, input.clientName, phone, measures);
  const price = Math.max(0, Math.round(input.price ?? 0));
  const advance = Math.min(Math.max(0, Math.round(input.advance ?? 0)), price || Infinity);
  const due = input.dueAt && /^\d{4}-\d{2}-\d{2}$/.test(input.dueAt) ? input.dueAt : new Date(Date.now() + 7 * DAY).toISOString().slice(0, 10);
  const order: CoutureOrder = {
    id: uid("cou"),
    at: todayStamp(),
    number: nextCoutureNumber(shop),
    clientId: client.id,
    clientName: client.name,
    phone: phone || client.phone,
    garment: input.garment.trim() || "Habit",
    fabric: (input.fabric ?? "").trim(),
    measures: { ...(client.measures ?? {}), ...measures },
    price,
    paid: advance,
    dueAt: due,
    status: "recu",
    token: newToken(),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
  };
  const sales = advance > 0 ? [paymentSale(order, advance, "avance"), ...shop.sales] : shop.sales;
  return { shop: { ...shop, clients, sales, couture: [order, ...ordersOf(shop)] }, order };
}

const update = (shop: Shop, id: string, change: (o: CoutureOrder) => CoutureOrder): Shop => ({ ...shop, couture: ordersOf(shop).map((o) => (o.id === id ? change(o) : o)) });

/** Passe la commande à une étape (coupe, couture, finition, prêt). « Livré » passe par deliverCouture (paiement). */
export function setStep(shop: Shop, id: string, status: Exclude<CoutureStatus, "livre">): Shop | null {
  const o = ordersOf(shop).find((x) => x.id === id);
  if (!o || !isOpen(o)) return null;
  return update(shop, id, (x) => ({ ...x, status, ...(status === "pret" && !x.readyAt ? { readyAt: todayStamp() } : {}) }));
}

export function setCouturePrice(shop: Shop, id: string, price: number): Shop {
  return update(shop, id, (o) => ({ ...o, price: Math.max(0, Math.round(price)) }));
}

export function setDueDate(shop: Shop, id: string, dueAt: string): Shop {
  return /^\d{4}-\d{2}-\d{2}$/.test(dueAt) ? update(shop, id, (o) => ({ ...o, dueAt })) : shop;
}

/** Acompte en cours de route. */
export function payCouture(shop: Shop, id: string, amount: number): Shop | null {
  const o = ordersOf(shop).find((x) => x.id === id);
  const pay = Math.round(amount);
  if (!o || pay <= 0 || !isOpen(o)) return null;
  return { ...update(shop, id, (x) => ({ ...x, paid: x.paid + pay })), sales: [paymentSale(o, pay, "acompte"), ...shop.sales] };
}

/** Livré : le client récupère l'habit, paie paidNow ; le reste va en dette s'il en reste. */
export function deliverCouture(shop: Shop, id: string, paidNow: number): Shop | null {
  const o = ordersOf(shop).find((x) => x.id === id);
  if (!o || !isOpen(o)) return null;
  const pay = Math.max(0, Math.round(paidNow));
  const rest = Math.max(0, o.price - o.paid - pay);
  const sales = pay > 0 ? [paymentSale(o, pay, "solde"), ...shop.sales] : shop.sales;
  const clients =
    rest > 0 && o.clientId
      ? shop.clients.map((c) =>
          c.id === o.clientId ? { ...c, debt: c.debt + rest, dueAt: c.debt > 0 && c.dueAt ? c.dueAt : new Date(Date.now() + DEFAULT_DUE_DAYS * DAY).toISOString() } : c,
        )
      : shop.clients;
  return update({ ...shop, sales, clients }, id, (x) => ({ ...x, paid: x.paid + pay, status: "livre", deliveredAt: todayStamp() }));
}

export function cancelCouture(shop: Shop, id: string): Shop {
  return update(shop, id, (o) => ({ ...o, status: "annule" }));
}

/** Jours avant la date promise (négatif = en retard). */
export function daysLeft(o: CoutureOrder, now = Date.now()): number | null {
  if (!o.dueAt) return null;
  return Math.ceil((new Date(`${o.dueAt}T23:59:59`).getTime() - now) / DAY);
}

/** Commandes en cours, de la plus urgente à la moins urgente (pour les périodes de rush). */
export function byUrgency(orders: CoutureOrder[], now = Date.now()): CoutureOrder[] {
  return [...orders].sort((a, b) => (daysLeft(a, now) ?? 9999) - (daysLeft(b, now) ?? 9999));
}

/** Messages WhatsApp au client : commande enregistrée (avec le lien de suivi) ou habit prêt. */
export function clientMessage(shop: Shop, o: CoutureOrder, kind: "suivi" | "pret", origin?: string): string | null {
  if (!o.phone) return null;
  const rest = remaining(o);
  const text =
    kind === "pret"
      ? `Salaam ${o.clientName}, sa ${o.garment} paré na ! Ton habit est prêt (commande ${o.number}).${rest ? ` Reste à payer : ${rest.toLocaleString("fr-FR")} F.` : ""} ${shop.name}${shop.phone ? ` · ${shop.phone}` : ""}`
      : `Salaam ${o.clientName}, ta commande ${o.number} (${o.garment}) est bien notée chez ${shop.name}.${o.dueAt ? ` Date prévue : ${new Date(`${o.dueAt}T12:00:00`).toLocaleDateString("fr-FR")}.` : ""} Suis ton habit ici : ${trackUrl(o, origin)}`;
  return whatsappLink(o.phone, text.trim());
}

/** Retrouve une commande par son numéro (« C-007 », « 7 ») ou par le nom du client (la plus récente en cours). */
export function findCouture(shop: Shop, ref: string): CoutureOrder | undefined {
  const list = ordersOf(shop);
  const n = ref.match(/\d+/)?.[0];
  if (n) {
    const byNumber = list.find((o) => Number(o.number.replace(/\D/g, "")) === Number(n));
    if (byNumber) return byNumber;
  }
  const open = list.filter(isOpen);
  const found = pickByName(open.map((o) => ({ ...o, name: `${o.clientName} ${o.garment}` })), ref);
  return found.item ? open.find((o) => o.id === found.item?.id) : undefined;
}
