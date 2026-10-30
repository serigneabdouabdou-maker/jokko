import { type Client, type Shop, money, todayStamp, uid } from "../model";
import type { DraftAction } from "./client";

export type Applied = { shop: Shop; summary: string };

const first = (name: string) => name.split(" ")[0];

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
    const qty = product ? Math.max(1, Math.round(Math.abs(quantity ?? 1))) : undefined;
    const total = amount ?? (product && qty ? product.price * qty : null);
    if (!total) return null;
    const label = product?.name ?? (action.label?.trim() || action.productName?.trim() || "Vente");
    return {
      shop: {
        ...shop,
        products: product
          ? shop.products.map((p) => (p.id === product.id ? { ...p, stock: Math.max(0, p.stock - (qty ?? 1)) } : p))
          : shop.products,
        sales: [{ id: uid("s"), at: todayStamp(), label, amount: total, qty, productId: product?.id, clientId: known?.id }, ...shop.sales],
      },
      summary: `Vente · ${qty && product ? `${qty} ${product.unit} ${product.name} · ` : label !== "Vente" ? `${label} · ` : ""}${money(total)}`,
    };
  }

  if (action.type === "expense") {
    if (!amount) return null;
    const label = action.label?.trim() || "Dépense";
    return {
      shop: { ...shop, expenses: [{ id: uid("e"), at: todayStamp(), label, amount }, ...shop.expenses] },
      summary: `Dépense · ${label} · ${money(amount)}`,
    };
  }

  if (action.type === "stock_adjust") {
    if (!product || quantity === null || quantity === 0) return null;
    const stock = Math.max(0, product.stock + Math.round(quantity));
    return {
      shop: { ...shop, products: shop.products.map((p) => (p.id === product.id ? { ...p, stock } : p)) },
      summary: `Stock ${product.name} · ${stock} ${product.unit}`,
    };
  }

  if (action.type === "debt_payment") {
    if (!known || !amount) return null;
    const debt = Math.max(0, known.debt - amount);
    return {
      shop: { ...shop, clients: shop.clients.map((c) => (c.id === known.id ? { ...c, debt } : c)) },
      summary: `${first(known.name)} a payé ${money(amount)} · reste ${money(debt)}`,
    };
  }

  if (action.type === "debt_add") {
    if (!amount || (!known && !heardClient)) return null;
    const { clients, client } = withClient(shop, known, heardClient);
    const debt = client.debt + amount;
    return {
      shop: { ...shop, clients: clients.map((c) => (c.id === client.id ? { ...c, debt } : c)) },
      summary: `${first(client.name)} doit ${money(debt)}`,
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
      summary: `Facture ${invoice.number} · ${first(client.name)} · ${money(amount)}`,
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
