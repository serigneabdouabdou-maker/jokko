import { type Client, type Invoice, type InvoiceLine, type Product, type Sale, type Shop, money, todayStamp, uid } from "../model";
import type { DraftAction } from "./client";

/** amount : montant en francs de l'écriture (pour le redire en wolof). */
export type Applied = { shop: Shop; summary: string; amount?: number };

const DAY = 86_400_000;
export const DEFAULT_DUE_DAYS = 30;

/** Total d'une facture : somme des lignes, arrondie au franc. */
export function invoiceTotal(lines: InvoiceLine[]): number {
  return Math.round(lines.reduce((a, l) => a + l.qty * l.unitPrice, 0));
}

/** Numéro suivant pour l'année : JK-2026-0001, JK-2026-0002… */
export function nextInvoiceNumber(shop: Shop, now = new Date()): string {
  const year = now.getFullYear();
  const prefix = `JK-${year}-`;
  const max = shop.invoices.reduce((m, i) => {
    const n = i.number.startsWith(prefix) ? Number(i.number.slice(prefix.length)) : 0;
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

/**
 * Quantité × prix de l'unité, au franc près. Les nombres de JavaScript sont exacts jusqu'à
 * 9 millions de milliards : les milliards se calculent sans erreur.
 */
export function times(qty: number, unitPrice: number): number {
  return Math.round(qty * unitPrice);
}

const qtyLabel = (n: number) => (Number.isInteger(n) ? String(n) : String(roundQty(n)).replace(".", ","));

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
  const given = action.amount !== null && Number.isFinite(action.amount) && action.amount > 0 ? Math.round(action.amount) : null;
  const unitPrice = action.unitPrice !== null && action.unitPrice !== undefined && Number.isFinite(action.unitPrice) && action.unitPrice > 0 ? action.unitPrice : null;
  // Prix de l'unité dit : le total, c'est le code qui le calcule (2 sacs × 20 000 = 40 000), jamais le modèle.
  const each = unitPrice !== null ? { qty: quantity !== null && Math.abs(quantity) > 0 ? roundQty(Math.abs(quantity)) : 1, price: unitPrice } : null;
  const amount = each ? times(each.qty, each.price) : given;
  const known = action.clientId ? shop.clients.find((c) => c.id === action.clientId) : undefined;
  const heardClient = action.clientName?.trim() || null;

  if (action.type === "sale") {
    if (product && unitKind(action.unit, product) === "inconnue") return null;
    const retail = product?.retail && unitKind(action.unit, product) === "detail" ? product.retail : undefined;
    const listPrice = product ? (retail ? retail.price : product.price) : 0;
    // Montant dit sans quantité (« meew 1 800 F ») : la quantité se déduit du prix (2 sachets), pas « 1 sac ».
    const qty = each
      ? each.qty
      : product
        ? quantity !== null && Math.abs(quantity) > 0
          ? roundQty(Math.abs(quantity))
          : amount && listPrice > 0
            ? roundQty(amount / listPrice)
            : 1
        : quantity !== null && Math.abs(quantity) > 0
          ? roundQty(Math.abs(quantity))
          : undefined;
    const total = amount ?? (product && qty ? times(qty, listPrice) : null);
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
      summary: `Vente · ${qty && product ? `${qtyLabel(qty)} ${unit} ${product.name} · ` : label !== "Vente" ? `${label} · ` : ""}${each && each.qty !== 1 ? `${qtyLabel(each.qty)} × ${money(each.price)} = ` : ""}${money(total)}${cost !== undefined ? ` · bénéfice ${money(total - cost)}` : ""}${known ? ` · ${known.name}` : ""}`,
    };
  }

  if (action.type === "expense") {
    if (!amount) return null;
    const label = action.label?.trim() || "Dépense";
    return {
      shop: { ...shop, expenses: [{ id: uid("e"), at: todayStamp(), label, amount }, ...shop.expenses] },
      amount,
      summary: `Dépense · ${label} · ${each && each.qty !== 1 ? `${qtyLabel(each.qty)} × ${money(each.price)} = ` : ""}${money(amount)}`,
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
    if (!known && !heardClient) return null;
    // Lignes : l'article et sa quantité (« facture Moussa ñaari bidon diw »), sinon le montant seul.
    let lines: InvoiceLine[] = [];
    if (product) {
      if (unitKind(action.unit, product) === "inconnue") return null;
      const retail = product.retail && unitKind(action.unit, product) === "detail" ? product.retail : undefined;
      const listPrice = retail ? retail.price : product.price;
      const qty = each ? each.qty : quantity !== null && Math.abs(quantity) > 0 ? roundQty(Math.abs(quantity)) : amount && listPrice ? roundQty(amount / listPrice) : 1;
      const linePrice = each ? each.price : amount ? amount / qty : listPrice;
      lines = [{ label: product.name, qty, unit: retail ? retail.unit : product.unit, unitPrice: linePrice, productId: product.id }];
    } else if (each) {
      lines = [{ label: action.label?.trim() || action.productName?.trim() || "Marchandises", qty: each.qty, unit: action.unit?.trim() || "", unitPrice: each.price }];
    } else if (amount) {
      lines = [{ label: action.label?.trim() || action.productName?.trim() || "Marchandises", qty: 1, unit: "", unitPrice: amount }];
    }
    const total = invoiceTotal(lines);
    if (!total) return null;
    const { clients, client } = withClient(shop, known, heardClient);
    const invoice: Invoice = {
      id: uid("inv"),
      number: nextInvoiceNumber(shop),
      at: todayStamp(),
      clientId: client.id,
      amount: total,
      status: "brouillon",
      lines,
    };
    if (action.dueDays && action.dueDays > 0) invoice.dueAt = new Date(Date.now() + action.dueDays * DAY).toISOString();
    return {
      shop: { ...shop, clients, invoices: [invoice, ...shop.invoices] },
      amount: total,
      summary: `Facture ${invoice.number} · ${client.name} · ${money(total)}`,
    };
  }

  if (action.type === "purchase") return applyPurchase(shop, action, product, quantity, unitPrice, given);

  return null;
}

/**
 * Achat de marchandise : « j'ai acheté 2 sacs de sucre à 20 000 chacun ».
 * Stock + 2 sacs ; caisse − 40 000 F (écriture « achat ») ; prix d'achat du sac = 20 000 F.
 * L'achat ne baisse pas le bénéfice : le coût est compté quand le sucre est vendu.
 * Article inconnu : il est créé (le prix de vente se règle ensuite dans Stock).
 */
function applyPurchase(shop: Shop, action: DraftAction, found: Product | undefined, quantity: number | null, unitPrice: number | null, total: number | null): Applied | null {
  const name = found?.name ?? action.productName?.trim() ?? action.label?.trim() ?? "";
  if (!name) return null;
  const heardUnit = action.unit?.trim() || "";
  if (found && unitKind(heardUnit, found) === "inconnue") return null;
  const retail = found?.retail && unitKind(heardUnit, found) === "detail" ? found.retail : undefined;
  // Prix de l'unité achetée : dit, sinon total ÷ quantité, sinon le dernier prix d'achat connu.
  const knownCost = found?.cost !== undefined ? (retail ? found.cost / retail.perUnit : found.cost) : undefined;
  const qty =
    quantity !== null && Math.abs(quantity) > 0
      ? roundQty(Math.abs(quantity))
      : total && (unitPrice ?? knownCost)
        ? roundQty(total / (unitPrice ?? knownCost)!)
        : null;
  if (!qty) return null;
  const price = unitPrice ?? (total ? total / qty : knownCost);
  if (!price) return null;
  const paid = unitPrice ? times(qty, unitPrice) : total ?? times(qty, price);
  const baseQty = retail ? qty / retail.perUnit : qty;
  const unit = retail ? retail.unit : found?.unit ?? (heardUnit ? heardUnit.replace(/s$/, "") : "pièce");
  const costPerBase = Math.round(retail ? price * retail.perUnit : price);
  const product: Product = found
    ? { ...found, stock: roundQty(found.stock + baseQty), cost: costPerBase }
    : { id: uid("p"), name: name.charAt(0).toUpperCase() + name.slice(1), unit, stock: qty, min: 0, price: 0, cost: costPerBase };
  const products = found ? shop.products.map((p) => (p.id === found.id ? product : p)) : [...shop.products, product];
  const label = `Achat ${qtyLabel(qty)} ${unit} ${product.name}`;
  return {
    shop: { ...shop, products, expenses: [{ id: uid("e"), at: todayStamp(), label, amount: paid, kind: "achat" }, ...shop.expenses] },
    amount: paid,
    summary: `Achat · ${qtyLabel(qty)} ${unit} ${product.name} · ${qty !== 1 ? `${qtyLabel(qty)} × ${money(Math.round(price))} = ` : ""}${money(paid)} · stock ${qtyLabel(product.stock)} ${product.unit}${found ? "" : " · nouvel article : mets son prix de vente dans Stock"}`,
  };
}

/** Client connu, ou nouveau client créé à partir du nom entendu (« Fatou bor na… »). */
function withClient(shop: Shop, known: Client | undefined, heard: string | null): { clients: Client[]; client: Client } {
  if (known) return { clients: shop.clients, client: known };
  const name = (heard ?? "Client").replace(/\s+/g, " ").trim();
  const client: Client = { id: uid("c"), name: name.charAt(0).toUpperCase() + name.slice(1), phone: "", debt: 0 };
  return { clients: [...shop.clients, client], client };
}
