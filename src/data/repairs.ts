/**
 * Carnet de réparations : le client laisse son téléphone (dépôt), le réparateur pose les pièces (réparé),
 * puis le client revient le chercher et paie le reste (rendu) — parfois des mois après.
 *
 * L'argent suit la caisse de Jokko :
 * - chaque paiement (avance, acompte, solde) devient une vente « Réparation R-001 … » ;
 * - les pièces prises dans le stock sortent du stock ; leur prix d'achat est porté sur la vente du rendu,
 *   donc le bénéfice de la réparation = prix − prix d'achat des pièces ;
 * - le reste non payé au rendu peut aller en dette du client.
 */
import { type Client, type Repair, type RepairPart, type Shop, todayStamp, uid } from "@/model";
import { nameClash, pickByName } from "@/assistant/wolofNames";
import { metierOf } from "@/data/metiers";

const DAY = 86_400_000;
const DEFAULT_DUE_DAYS = 30;

export const repairsOf = (shop: Shop): Repair[] => shop.repairs ?? [];

/** Numéro de ticket suivant : R-001, R-002… (à écrire sur l'appareil). */
export function nextRepairNumber(shop: Shop): string {
  const max = repairsOf(shop).reduce((m, r) => Math.max(m, Number(r.number.replace(/\D/g, "")) || 0), 0);
  return `R-${String(max + 1).padStart(3, "0")}`;
}

export const partsCost = (r: Repair) => r.parts.reduce((a, p) => a + Math.max(0, Math.round(p.cost)), 0);
/**
 * Le prix d'une réparation, décomposé pour le réparateur (demande de Fallou, 13/11/2026) :
 * le client paie 15 000 = la pièce 5 000 (achetée) + la main-d'œuvre 10 000 (ce que gagne le réparateur).
 */
export function repairBreakdown(r: Repair): { price: number; parts: number; labor: number } {
  const parts = partsCost(r);
  return { price: r.price, parts, labor: r.price - parts };
}
export const remaining = (r: Repair) => Math.max(0, r.price - r.paid);
/** Bénéfice de la réparation : prix − prix d'achat des pièces. */
export const repairProfit = (r: Repair) => r.price - partsCost(r);

/**
 * Client du cahier ou nouveau client : d'abord le même numéro de téléphone (le plus sûr), puis le même nom
 * (écrit autrement compris). Ainsi un client qui revient retrouve sa fiche et son historique.
 */
export function clientFor(shop: Shop, name: string, phone: string): { clients: Client[]; client: Client } {
  const tail = (p: string) => p.replace(/\D/g, "").slice(-9);
  const byPhone = tail(phone).length === 9 ? shop.clients.find((c) => tail(c.phone) === tail(phone)) : undefined;
  if (byPhone) return { clients: shop.clients, client: byPhone };
  const found = pickByName(shop.clients, name);
  const known = found.item && !nameClash(found.item.name, name) ? found.item : undefined;
  if (known) {
    const client = phone && !known.phone ? { ...known, phone } : known;
    return { clients: shop.clients.map((c) => (c.id === client.id ? client : c)), client };
  }
  const clean = name.replace(/\s+/g, " ").trim() || "Client";
  const client: Client = { id: uid("c"), name: clean.charAt(0).toUpperCase() + clean.slice(1), phone, debt: 0 };
  return { clients: [...shop.clients, client], client };
}

/**
 * Libellé des paiements : « Réparation R-001 … » chez un réparateur ; chez un multiservice, les commandes
 * (maillots floqués, bâches…) passent par le même carnet → « Service · Commande R-001 … » (compté comme service).
 */
const payWord = (shop: Pick<Shop, "activity">) => (metierOf(shop.activity).id === "multiservice" ? "Service · Commande" : "Réparation");

function paymentSale(r: Repair, amount: number, what: string, cost?: number, word = "Réparation") {
  return { id: uid("s"), at: todayStamp(), label: `${word} ${r.number} · ${r.device} (${what})`, amount, clientId: r.clientId, ...(cost !== undefined ? { cost } : {}), payment: "especes" as const };
}

export type NewRepair = { clientName: string; phone?: string; device: string; problem: string; price?: number; advance?: number; warrantyDays?: number; imei?: string };

/** IMEI gardé seulement s'il ressemble à un IMEI (8 à 17 chiffres, espaces enlevés). */
export const cleanImei = (s?: string): string | undefined => {
  const d = (s ?? "").replace(/[\s.-]/g, "");
  return /^\d{8,17}$/.test(d) ? d : undefined;
};

/** Dépôt d'un appareil, avec avance éventuelle (elle entre dans la caisse). */
export function addRepair(shop: Shop, input: NewRepair): { shop: Shop; repair: Repair } {
  const phone = (input.phone ?? "").replace(/\D/g, "");
  const { clients, client } = clientFor(shop, input.clientName, phone);
  const price = Math.max(0, Math.round(input.price ?? 0));
  const advance = Math.max(0, Math.round(input.advance ?? 0));
  const repair: Repair = {
    id: uid("rep"),
    at: todayStamp(),
    number: nextRepairNumber(shop),
    clientId: client.id,
    clientName: client.name,
    phone: phone || client.phone,
    device: input.device.trim() || "Téléphone",
    problem: input.problem.trim(),
    price,
    paid: advance,
    parts: [],
    status: "depot",
    ...(input.warrantyDays ? { warrantyDays: input.warrantyDays } : {}),
    ...(cleanImei(input.imei) ? { imei: cleanImei(input.imei) } : {}),
  };
  const sales = advance > 0 ? [paymentSale(repair, advance, "avance", undefined, payWord(shop)), ...shop.sales] : shop.sales;
  return { shop: { ...shop, clients, sales, repairs: [repair, ...repairsOf(shop)] }, repair };
}

const update = (shop: Shop, id: string, change: (r: Repair) => Repair): Shop => ({ ...shop, repairs: repairsOf(shop).map((r) => (r.id === id ? change(r) : r)) });

/** Prix fixé (ou changé) après le diagnostic. */
export function setRepairPrice(shop: Shop, id: string, price: number): Shop {
  return update(shop, id, (r) => ({ ...r, price: Math.max(0, Math.round(price)) }));
}

/** Pièce posée : prise dans le stock (productId), ou achetée exprès (label + cost) ; fromCash = payée avec l'argent de la caisse. */
export type PartInput = { productId?: string; label?: string; qty?: number; cost?: number; fromCash?: boolean };

/**
 * Réparé : les pièces posées sortent du stock (prix d'achat du stock), ou sont notées avec leur prix
 * d'achat si elles ont été achetées exprès. Renvoie null si une pièce du stock manque.
 */
export function markRepaired(shop: Shop, id: string, inputs: PartInput[]): Shop | null {
  const repair = repairsOf(shop).find((r) => r.id === id);
  if (!repair || repair.status === "rendu" || repair.status === "annule") return null;
  let products = shop.products;
  const parts: RepairPart[] = [];
  // Pièce achetée exprès avec l'argent de la caisse : sortie de caisse (achat), pas une dépense du bénéfice ;
  // son prix d'achat compte au rendu, sur le paiement de la réparation.
  const bought: Shop["expenses"] = [];
  for (const p of inputs) {
    const qty = Math.max(1, Math.round(p.qty ?? 1));
    if (p.productId) {
      const product = products.find((x) => x.id === p.productId);
      if (!product) return null;
      products = products.map((x) => (x.id === product.id ? { ...x, stock: Math.max(0, x.stock - qty) } : x));
      parts.push({ productId: product.id, label: product.name, qty, cost: Math.round((p.cost ?? product.cost ?? 0) * (p.cost !== undefined ? 1 : qty)) });
    } else if (p.label?.trim()) {
      const cost = Math.max(0, Math.round(p.cost ?? 0));
      parts.push({ label: p.label.trim(), qty, cost });
      if (cost > 0 && p.fromCash) bought.push({ id: uid("e"), at: todayStamp(), label: `Pièce pour ${repair.number} (${repair.device}) : ${p.label.trim()}`, amount: cost, kind: "achat" });
    }
  }
  return {
    ...update({ ...shop, products, expenses: bought.length ? [...bought, ...shop.expenses] : shop.expenses }, id, (r) => ({ ...r, parts: [...r.parts, ...parts], status: "repare", repairedAt: todayStamp() })),
  };
}

/** Paiement en cours de route (acompte). */
export function payRepair(shop: Shop, id: string, amount: number): Shop | null {
  const repair = repairsOf(shop).find((r) => r.id === id);
  const pay = Math.round(amount);
  if (!repair || pay <= 0) return null;
  return { ...update(shop, id, (r) => ({ ...r, paid: r.paid + pay })), sales: [paymentSale(repair, pay, "acompte", undefined, payWord(shop)), ...shop.sales] };
}

/**
 * Rendu : le client récupère l'appareil. Il paie paidNow ; le reste, s'il y en a, va en dette (restToDebt)
 * ou est abandonné (geste commercial). Le prix d'achat des pièces est porté ici, pour le bénéfice.
 */
export function deliverRepair(shop: Shop, id: string, paidNow: number, restToDebt: boolean): Shop | null {
  const repair = repairsOf(shop).find((r) => r.id === id);
  if (!repair || repair.status === "rendu" || repair.status === "annule") return null;
  const pay = Math.max(0, Math.round(paidNow));
  const rest = Math.max(0, repair.price - repair.paid - pay);
  const cost = partsCost(repair);
  const sales = pay > 0 || cost > 0 ? [paymentSale(repair, pay, metierOf(shop.activity).id === "multiservice" ? "livré" : "rendu", cost, payWord(shop)), ...shop.sales] : shop.sales;
  let clients = shop.clients;
  if (rest > 0 && restToDebt && repair.clientId) {
    clients = clients.map((c) =>
      c.id === repair.clientId
        ? { ...c, debt: c.debt + rest, dueAt: c.debt > 0 && c.dueAt ? c.dueAt : new Date(Date.now() + DEFAULT_DUE_DAYS * DAY).toISOString() }
        : c,
    );
  }
  const price = restToDebt ? repair.price : repair.paid + pay;
  return { ...update({ ...shop, sales, clients }, id, (r) => ({ ...r, paid: r.paid + pay, price, status: "rendu", returnedAt: todayStamp() })) };
}

export function cancelRepair(shop: Shop, id: string): Shop {
  return update(shop, id, (r) => ({ ...r, status: "annule" }));
}

/** Depuis combien de jours l'appareil attend au dépôt (depuis le dépôt, ou depuis la réparation). */
export function waitingDays(r: Repair, now = Date.now()): number {
  return Math.floor((now - new Date(r.repairedAt ?? r.at).getTime()) / DAY);
}

/** Garantie encore valable ? (après le rendu) */
export function underWarranty(r: Repair, now = Date.now()): boolean {
  if (!r.warrantyDays || !r.returnedAt) return false;
  return now - new Date(r.returnedAt).getTime() <= r.warrantyDays * DAY;
}

/** Retrouve une réparation par son numéro (« R-007 », « 7 ») ou par le nom du client (la plus récente non rendue). */
export function findRepair(shop: Shop, ref: string): Repair | undefined {
  const list = repairsOf(shop);
  const n = ref.match(/\d+/)?.[0];
  if (n) {
    const byNumber = list.find((r) => Number(r.number.replace(/\D/g, "")) === Number(n));
    if (byNumber) return byNumber;
  }
  const open = list.filter((r) => r.status === "depot" || r.status === "repare");
  const found = pickByName(open.map((r) => ({ ...r, name: `${r.clientName} ${r.device}` })), ref);
  return found.item ? open.find((r) => r.id === found.item?.id) : undefined;
}

/** L'atelier sur un mois : réparations rendues, argent encaissé, pièces, main-d'œuvre gagnée ; et ce qui reste au dépôt. */
export function workshopMonth(shop: Shop, now = new Date()): { done: number; revenue: number; parts: number; labor: number; open: number; owed: number } {
  const from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  const list = repairsOf(shop);
  const done = list.filter((r) => r.status === "rendu" && r.returnedAt && Date.parse(r.returnedAt) >= from && Date.parse(r.returnedAt) < to);
  const open = list.filter((r) => r.status === "depot" || r.status === "repare");
  const revenue = done.reduce((a, r) => a + r.price, 0);
  const parts = done.reduce((a, r) => a + partsCost(r), 0);
  return { done: done.length, revenue, parts, labor: revenue - parts, open: open.length, owed: open.reduce((a, r) => a + remaining(r), 0) };
}
