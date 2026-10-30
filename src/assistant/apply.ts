import { type Client, type Sale, type Shop, money, todayStamp, uid } from "../model";
import type { DraftAction } from "./client";

/** amount : montant en francs de l'écriture (pour le redire en wolof). */
export type Applied = { shop: Shop; summary: string; amount?: number };

const DAY = 86_400_000;
export const DEFAULT_DUE_DAYS = 30;

/** Quantités à 3 décimales au plus (1 sachet sur 50 = 0,02 sac). */
export function roundQty(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Unités qui veulent dire la même chose (« kg » = « kilo »). */
const UNIT_ALIASES: Record<string, string> = {
  kg: "kilo", kilogramme: "kilo", kilogram: "kilo", kilo: "kilo",
  l: "litre", lit: "litre", litre: "litre",
  pc: "piece", piece: "piece", unite: "piece",
  g: "gramme", gr: "gramme", gramme: "gramme",
  sac: "sac", sak: "sac", bidon: "bidon", sachet: "sachet", paquet: "paquet", carton: "carton", boite: "boite", pot: "pot", bouteille: "bouteille",
};

export function unitKey(s: string): string {
  const w = s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "").replace(/s$/, "");
  return UNIT_ALIASES[w] ?? w;
}

/**
 * Que veut dire l'unité entendue pour cet article ?
 * « gros » (sac, bidon…), « detail » (sachet, kilo… ou le mot « détail »), « aucune » (rien dit),
 * « inconnue » (une unité que l'article n'a pas : on ne devine pas, Jokko demande).
 */
export function unitKind(said: string | null | undefined, product: { unit: string; retail?: { unit: string } }): "gros" | "detail" | "aucune" | "inconnue" {
  if (!said || !said.trim()) return "aucune";
  const w = unitKey(said);
  if (/detail|detay|tuuti|xottu/.test(said.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""))) return product.retail ? "detail" : "inconnue";
  if (w === unitKey(product.unit)) return "gros";
  if (product.retail && w === unitKey(product.retail.unit)) return "detail";
  if (w === "piece" || w === "unite") return "aucune";
  return "inconnue";
}

/** Compatibilité : l'unité dite désigne-t-elle le détail ? */
export function isRetailUnit(said: string | null | undefined, retailUnit: string, bulkUnit: string): boolean {
  return unitKind(said, { unit: bulkUnit, retail: { unit: retailUnit } }) === "detail";
}


/**
 * Applique une écriture complète à la boutique. Renvoie null s'il manque une information
 * (montant, article, client…) : rien n'est alors modifié.
 */
export function applyDraft(shop: Shop, action: DraftAction): Applied | null {
  const product = action.productId ? shop.products.find((p) => p.id === action.productId) : undefined;
  const quantity = action.quantity !== null && Number.isFinite(action.quantity) ? action.quantity : null;
  const amount = action.amount !== null && Number.isFinite(action.amount) && action.amount > 0 ? Math.round(action.amount) : null;
  const known = action.clientId ? shop.clients.find((c) => c.id === action.clientId) : undefined;
  const heardClient = action.clientName?.trim() || null;

  if (action.type === "sale") {
    if (product && unitKind(action.unit, product) === "inconnue") return null;
    const retail = product?.retail && unitKind(action.unit, product) === "detail" ? product.retail : undefined;
    const unitPrice = product ? (retail ? retail.price : product.price) : 0;
    // Montant dit sans quantité (« meew 1 800 F ») : la quantité se déduit du prix (2 sachets), pas « 1 sac ».
    const qty = product
      ? quantity !== null && Math.abs(quantity) > 0
        ? roundQty(Math.abs(quantity))
        : amount && unitPrice > 0
          ? roundQty(amount / unitPrice)
          : 1
      : undefined;
    const total = amount ?? (product && qty ? Math.round(unitPrice * qty) : null);
    if (!total) return null;
    // Quantité retirée du stock, en unités de gros (50 sachets = 1 sac).
    const baseQty = product && qty ? (retail ? qty / retail.perUnit : qty) : 0;
    const cost = product?.cost !== undefined && baseQty ? Math.round(baseQty * product.cost) : undefined;
    const unit = product ? (retail ? retail.unit : product.unit) : undefined;
    const label = product?.name ?? (action.label?.trim() || action.productName?.trim() || "Vente");
    const sale: Sale = { id: uid("s"), at: todayStamp(), label, amount: total, qty, productId: product?.id, clientId: known?.id };
    if (cost !== undefined) sale.cost = cost;
    if (retail) sale.retail = true;
    if (unit) sale.unit = unit;
    return {
      shop: {
        ...shop,
        products: product
          ? shop.products.map((p) => (p.id === product.id ? { ...p, stock: Math.max(0, roundQty(p.stock - baseQty)) } : p))
          : shop.products,
        sales: [sale, ...shop.sales],
      },
      amount: total,
      summary: `Vente · ${qty && product ? `${qty} ${unit} ${product.name} · ` : label !== "Vente" ? `${label} · ` : ""}${money(total)}${cost !== undefined ? ` · bénéfice ${money(total - cost)}` : ""}${known ? ` · ${known.name}` : ""}`,
    };
  }

  if (action.type === "expense") {
    if (!amount) return null;
    const label = action.label?.trim() || "Dépense";
    return {
      shop: { ...shop, expenses: [{ id: uid("e"), at: todayStamp(), label, amount }, ...shop.expenses] },
      amount,
      summary: `Dépense · ${label} · ${money(amount)}`,
    };
  }

  if (action.type === "stock_adjust") {
    if (!product || quantity === null || quantity === 0) return null;
    if (unitKind(action.unit, product) === "inconnue") return null;
    const retail = product.retail && unitKind(action.unit, product) === "detail" ? product.retail : undefined;
    const delta = retail ? quantity / retail.perUnit : quantity;
    const stock = Math.max(0, roundQty(product.stock + delta));
    const removed = roundQty(product.stock - stock);
    // Un retrait qui n'est pas une vente (gâté, cassé, volé, manquant) est une perte, au prix d'achat.
    const loss = delta < 0 && product.cost !== undefined && removed > 0 ? Math.round(removed * product.cost) : 0;
    const expenses = loss
      ? [{ id: uid("e"), at: todayStamp(), label: action.label?.trim() || `Perte ${product.name}`, amount: loss, kind: "perte" as const }, ...shop.expenses]
      : shop.expenses;
    return {
      shop: { ...shop, products: shop.products.map((p) => (p.id === product.id ? { ...p, stock } : p)), expenses },
      amount: loss || undefined,
      summary: `Stock ${product.name} · ${stock} ${product.unit}${loss ? ` · perte ${money(loss)}` : ""}`,
    };
  }

  if (action.type === "debt_payment") {
    if (!known || !amount) return null;
    const debt = Math.max(0, known.debt - amount);
    return {
      shop: {
        ...shop,
        clients: shop.clients.map((c) => {
          if (c.id !== known.id) return c;
          // Dette soldée : plus d'échéance.
          return debt > 0 ? { ...c, debt } : { ...c, debt, dueAt: undefined };
        }),
      },
      amount,
      summary: `${known.name} a payé ${money(amount)} · reste ${money(debt)}`,
    };
  }

  if (action.type === "debt_add") {
    if (!amount || (!known && !heardClient)) return null;
    const { clients, client } = withClient(shop, known, heardClient);
    const debt = client.debt + amount;
    // Échéance : celle donnée par le commerçant, sinon 30 jours ; une dette déjà en cours garde la sienne.
    const days = action.dueDays && action.dueDays > 0 ? action.dueDays : null;
    const dueAt = days ? new Date(Date.now() + days * DAY).toISOString() : client.debt > 0 && client.dueAt ? client.dueAt : new Date(Date.now() + DEFAULT_DUE_DAYS * DAY).toISOString();
    return {
      shop: { ...shop, clients: clients.map((c) => (c.id === client.id ? { ...c, debt, dueAt } : c)) },
      amount,
      summary: `${client.name} doit ${money(debt)}`,
    };
  }

  if (action.type === "invoice") {
    if (!amount || (!known && !heardClient)) return null;
    const { clients, client } = withClient(shop, known, heardClient);
    const invoice = {
      id: uid("inv"),
      number: `JK-${shop.invoices.length + 1}`,
      at: todayStamp(),
      clientId: client.id,
      amount,
      status: "brouillon" as const,
    };
    return {
      shop: { ...shop, clients, invoices: [invoice, ...shop.invoices] },
      amount,
      summary: `Facture ${invoice.number} · ${client.name} · ${money(amount)}`,
    };
  }

  return null;
}

/** Client connu, ou nouveau client créé à partir du nom entendu (« Fatou bor na… »). */
function withClient(shop: Shop, known: Client | undefined, heard: string | null): { clients: Client[]; client: Client } {
  if (known) return { clients: shop.clients, client: known };
  const name = (heard ?? "Client").replace(/\s+/g, " ").trim();
  const client: Client = { id: uid("c"), name: name.charAt(0).toUpperCase() + name.slice(1), phone: "", debt: 0 };
  return { clients: [...shop.clients, client], client };
}
