import { type Client, type Invoice, type InvoiceLine, type Payment, type Product, type Shop, money, todayStamp, uid } from "../model";
import { type Applied, applyDraft, invoiceTotal, nextInvoiceNumber, roundQty, unitKey } from "./apply";
import { type CartLine, cartTotal, checkout, unitName, unitPrice } from "../data/checkout";
import { pickByName } from "./liveDesk";
import { readFrenchNumber, readWolofNumber, spokenAmountToFrancs } from "./wolofNumbers";

/**
 * Le chat « liste en vrac » : « 2 sacs de riz, une caisse de boisson, big bleu, big bleu, big bleu ».
 * 1. Reconnaissance locale (sans IA, gratuite, même hors ligne) des articles du stock.
 * 2. Pour ce qui reste flou (wolof, fautes, mots inconnus), Gemini propose les articles — jamais les calculs.
 * 3. Le code regroupe les articles identiques, prend les prix du stock, multiplie et additionne.
 */

export type OrderIntent = "vente" | "achat" | "facture";
export type OrderUnknown = { text: string; qty: number; candidates: string[] };
export type Order = {
  intent: OrderIntent;
  payment: Payment | null;
  clientId: string | null;
  /** Nom entendu d'un client qui n'existe pas encore (facture, crédit) */
  clientName: string | null;
  lines: CartLine[];
  unknown: OrderUnknown[];
};

export const plain = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ñ/g, "n")
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const UNIT_WORDS = new Set([
  "sac", "sacs", "sak", "caisse", "caisses", "bidon", "bidons", "kilo", "kilos", "kg", "carton", "cartons", "paquet", "paquets",
  "boite", "boites", "sachet", "sachets", "piece", "pieces", "bouteille", "bouteilles", "canette", "canettes", "pot", "pots",
  "litre", "litres", "tas", "botte", "bottes", "douzaine", "douzaines", "pain", "unite", "unites", "plaquette", "plaquettes",
]);
export const FILLERS = new Set(["de", "d", "du", "des", "la", "le", "les", "l", "et", "ak", "avec", "plus", "encore", "aussi", "ci", "bi", "yi"]);
/** Mots de commande, de paiement ou de politesse : ce ne sont pas des articles. */
const COMMAND = new Set([
  "vente", "ventes", "vends", "vend", "vendu", "vendre", "jaay", "jaayna", "naa", "na", "j", "ai", "achete", "achetes", "achat", "achats", "jend",
  "facture", "facturer", "devis", "yonnee", "pour", "client", "cliente", "kiliyaan", "paye", "payee", "payes", "cash", "especes", "espece",
  "wave", "om", "orange", "money", "credit", "dette", "bor", "a", "au", "total", "en", "tout", "il", "elle", "pris", "donne", "panier",
  "encaisse", "encaisser", "svp", "merci", "fais", "faire", "moi", "nous", "on", "lepp", "yepp", "fournisseur", "chez", "c", "est", "mets", "ajoute",
]);

/** Ce que veut le commerçant : vendre (par défaut), acheter pour le stock, ou faire une facture. */
export function orderIntent(text: string): OrderIntent {
  const t = ` ${plain(text)} `;
  if (/ (facture|facturer|devis|yonnee) /.test(t)) return "facture";
  if (/ (j ai achete|jai achete|achat|achats|jend naa|jend na|jendnaa|fournisseur|reappro|reapprovisionne|j ai recu|livraison) /.test(t)) return "achat";
  return "vente";
}

/** Le moyen de paiement dit (« payé cash », « par Wave », « à crédit »), sinon null : Jokko le demandera. */
export function orderPayment(text: string): Payment | null {
  const t = ` ${plain(text)} `;
  if (/ (wave) /.test(t)) return "wave";
  if (/ (orange money|om) /.test(t)) return "om";
  if (/ (a credit|credit|dette|bor na|bor|plus tard|doit) /.test(t)) return "credit";
  if (/ (especes|espece|cash|liquide|paye|payee|fey na|feyna) /.test(t)) return "especes";
  return null;
}

/** Client cité dans la phrase : un client connu (meilleur nom), sinon le nom entendu après « pour », « client »… */
export function orderClient(text: string, clients: Client[]): { clientId: string | null; clientName: string | null; words: Set<string> } {
  const t = ` ${plain(text)} `;
  const words = new Set<string>();
  const hits = clients.filter((c) => {
    const first = plain(c.name).split(" ")[0];
    return first.length >= 3 && t.includes(` ${first} `);
  });
  if (hits.length) {
    const full = hits.filter((c) => t.includes(` ${plain(c.name)} `));
    const pick = full.length === 1 ? full[0] : hits.length === 1 ? hits[0] : null;
    for (const c of hits) for (const w of plain(c.name).split(" ")) words.add(w);
    if (pick) return { clientId: pick.id, clientName: pick.name, words };
  }
  const named = text.match(/(?:pour|client|cliente|à|chez)\s+([A-ZÀ-Ý][\p{L}-]+(?:\s+[A-ZÀ-Ý][\p{L}-]+)?)/u);
  if (named) {
    for (const w of plain(named[1]).split(" ")) words.add(w);
    return { clientId: null, clientName: named[1], words };
  }
  return { clientId: null, clientName: null, words };
}

/** Prix dit dans un morceau de phrase : « à 18 000 » = prix d'un article ; « pour 40 000 » = total de la ligne. */
function priceIn(segment: string): { each?: number; total?: number; rest: string } {
  const m = segment.match(/(?:^|\s)(à|a|pour|prix)\s+(\d[\d\s.  ]*\d|\d+)\s*(?:f\b|fcfa|francs?)?(?:\s*(chacun|chacune|l['’]unité|la pièce|pièce))?/i);
  if (!m) return { rest: segment };
  const value = spokenAmountToFrancs(m[2])?.francs;
  const rest = segment.replace(m[0], " ");
  if (!value) return { rest };
  return m[1].toLowerCase() === "pour" && !m[3] ? { total: value, rest } : { each: value, rest };
}

export const isNumberWord = (w: string) => /^\d+(\.\d+)?$/.test(w) || readFrenchNumber(w) !== null || readWolofNumber(w) !== null;

/** Lit la quantité d'un morceau (« 2 sacs », « une caisse », « ñaari sac », « riz 3 kilos »). */
export function quantityIn(words: string[]): { qty: number | null; unit: string | null; rest: string[] } {
  for (let i = 0; i < words.length; i++) {
    if (!isNumberWord(words[i])) continue;
    let j = i;
    while (j < words.length && isNumberWord(words[j])) j++;
    const said = words.slice(i, j).join(" ");
    const qty = /^\d/.test(said) ? Number(said.split(" ")[0]) : (readFrenchNumber(said) ?? readWolofNumber(said));
    if (qty === null || !(qty > 0)) continue;
    let unit: string | null = null;
    let k = j;
    if (k < words.length && UNIT_WORDS.has(words[k])) {
      unit = words[k];
      k++;
    }
    return { qty, unit, rest: [...words.slice(0, i), ...words.slice(k)] };
  }
  const unitAt = words.findIndex((w) => UNIT_WORDS.has(w));
  if (unitAt >= 0) return { qty: null, unit: words[unitAt], rest: words.filter((_, i) => i !== unitAt) };
  return { qty: null, unit: null, rest: words };
}

/** « big bleu big bleu big bleu » → (« big bleu », 3) */
export function repeated(words: string[]): { words: string[]; times: number } {
  for (let size = 1; size <= words.length / 2; size++) {
    if (words.length % size) continue;
    const unit = words.slice(0, size).join(" ");
    let ok = true;
    for (let i = size; i < words.length; i += size) if (words.slice(i, i + size).join(" ") !== unit) ok = false;
    if (ok) return { words: words.slice(0, size), times: words.length / size };
  }
  return { words, times: 1 };
}

function isRetail(product: Product, unit: string | null): boolean {
  return Boolean(unit && product.retail && unitKey(unit) === unitKey(product.retail.unit));
}

/** Regroupe les lignes identiques (même article, même gros/détail, même prix). */
export function groupLines(lines: CartLine[]): CartLine[] {
  const out: CartLine[] = [];
  for (const l of lines) {
    const same = out.find((o) => o.productId === l.productId && o.retail === l.retail && o.price === l.price);
    if (same) same.qty = roundQty(same.qty + l.qty);
    else out.push({ ...l });
  }
  return out;
}

/** Lecture locale (sans IA) d'une liste en vrac. */
export function parseOrder(text: string, shop: Shop): Order {
  const client = orderClient(text, shop.clients);
  const lines: CartLine[] = [];
  const unknown: OrderUnknown[] = [];
  // « ak » (wolof : « et ») ne coupe que devant une nouvelle quantité, pour ne pas casser « fukk ak ñaar ».
  const segments = text
    .split(/[,;:\n]+|\s\+\s|\s(?:et|puis)\s|\sak\s(?=(?:benn|[nñ]aari|[nñ]etti|[nñ]eenti|jur[oó]+mi|fukki|\d))/i)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const raw of segments) {
    const price = priceIn(raw);
    const words = plain(price.rest).split(" ").filter(Boolean);
    const { qty, unit, rest } = quantityIn(words);
    const nameWords = rest.filter((w) => !FILLERS.has(w) && !COMMAND.has(w) && !client.words.has(w));
    if (!nameWords.length) continue;
    const rep = qty === null ? repeated(nameWords) : { words: nameWords, times: 1 };
    const quantity = qty ?? rep.times;
    const name = rep.words.join(" ");
    const found = pickByName(shop.products, name);
    if (!found.item) {
      unknown.push({ text: rep.words.join(" "), qty: quantity, candidates: found.ambiguous.map((p) => p.name) });
      continue;
    }
    const each = price.each ?? (price.total ? price.total / quantity : undefined);
    lines.push({ productId: found.item.id, retail: isRetail(found.item, unit), qty: quantity, ...(each ? { price: Math.round(each * 100) / 100 } : {}) });
  }
  return {
    intent: orderIntent(text),
    payment: orderPayment(text),
    clientId: client.clientId,
    clientName: client.clientName,
    lines: groupLines(lines),
    unknown,
  };
}

/** La phrase ressemble-t-elle à une liste d'articles (pour savoir si on demande à Gemini) ? */
export function looksLikeOrder(text: string): boolean {
  const t = plain(text);
  // Une question (« il reste combien de riz ? ») n'est pas une commande.
  if (/\?/.test(text) || / (combien|nata|reste|des na|il y a) /.test(` ${t} `)) return false;
  // Stock sans argent, dépenses, dettes : déjà compris par le chemin habituel.
  if (/ (stock|dugal|yokk|depense|transport|loyer|paye sa dette|a paye|rembourse) /.test(` ${t} `)) return false;
  return /\d/.test(t) || /,|\n/.test(text) || / (sac|sacs|caisse|bidon|kilo|carton|paquet|boite|sachet|facture|achete|vendu|jaay|jend) /.test(` ${t} `);
}

/** Réponse de Gemini pour une liste (ids vérifiés ici ; quantités et prix relus par le code). */
export type OrderGuess = {
  intent: "vente" | "achat" | "facture" | "autre";
  payment: Payment | "inconnu";
  clientName: string | null;
  items: Array<{ productId: string | null; heard: string; quantity: number; unit: string | null; unitPriceSaid: string | null }>;
};

export function orderFromGuess(guess: OrderGuess, text: string, shop: Shop): Order | null {
  if (guess.intent === "autre" || !guess.items.length) return null;
  const local = parseOrder(text, shop);
  const lines: CartLine[] = [];
  const unknown: OrderUnknown[] = [];
  for (const item of guess.items) {
    const qty = item.quantity > 0 ? item.quantity : 1;
    const product = item.productId ? shop.products.find((p) => p.id === item.productId) : undefined;
    if (!product) {
      unknown.push({ text: item.heard, qty, candidates: pickByName(shop.products, item.heard).ambiguous.map((p) => p.name) });
      continue;
    }
    const each = item.unitPriceSaid ? spokenAmountToFrancs(item.unitPriceSaid)?.francs : undefined;
    lines.push({ productId: product.id, retail: isRetail(product, item.unit), qty, ...(each ? { price: each } : {}) });
  }
  const clientByName = guess.clientName ? pickByName(shop.clients, guess.clientName).item : undefined;
  return {
    intent: local.intent !== "vente" ? local.intent : guess.intent,
    payment: local.payment ?? (guess.payment === "inconnu" ? null : guess.payment),
    clientId: local.clientId ?? clientByName?.id ?? null,
    clientName: local.clientName ?? clientByName?.name ?? guess.clientName,
    lines: groupLines(lines),
    unknown,
  };
}

export function orderTotal(shop: Shop, order: Order): number {
  return cartTotal(shop, order.lines);
}

/** Prix d'achat d'une ligne : celui dit, sinon le dernier prix d'achat connu (au détail : ramené au détail). */
export function purchasePrice(product: Product, line: CartLine): number | null {
  if (line.price) return line.price;
  if (product.cost === undefined) return null;
  return line.retail && product.retail ? product.cost / product.retail.perUnit : product.cost;
}

export function purchaseTotal(shop: Shop, order: Order): number | null {
  let total = 0;
  for (const l of order.lines) {
    const p = shop.products.find((x) => x.id === l.productId);
    const price = p ? purchasePrice(p, l) : null;
    if (price === null) return null;
    total += Math.round(l.qty * price);
  }
  return total;
}

/** Ce qui manque avant d'enregistrer, en une phrase (null = tout est prêt). */
export function orderMissing(shop: Shop, order: Order, payment: Payment | null): string | null {
  if (order.unknown.length) return `Je ne connais pas : ${order.unknown.map((u) => `« ${u.text} »`).join(", ")}. Choisis l'article.`;
  if (!order.lines.length) return "Je n'ai trouvé aucun article.";
  if (order.intent === "facture" && !order.clientId && !order.clientName) return "Pour quel client ?";
  if (order.intent === "achat") {
    const noPrice = order.lines.filter((l) => {
      const p = shop.products.find((x) => x.id === l.productId);
      return !p || purchasePrice(p, l) === null;
    });
    if (noPrice.length) return `Prix d'achat inconnu pour ${noPrice.map((l) => shop.products.find((x) => x.id === l.productId)?.name ?? "?").join(", ")}. Dis-le (« à 16 000 »).`;
    return null;
  }
  if (order.intent === "vente") {
    if (!payment) return "C'est payé comment ?";
    if (payment === "credit" && !order.clientId) return "À crédit pour quel client ?";
  }
  return null;
}

/** Enregistre la commande : vente (caisse), achat (stock) ou facture. */
export function applyOrder(shop: Shop, order: Order, payment: Payment | null): Applied | null {
  if (orderMissing(shop, order, payment)) return null;
  if (order.intent === "vente") return checkout(shop, order.lines, payment!, order.clientId);
  if (order.intent === "achat") {
    let current = shop;
    let total = 0;
    for (const l of order.lines) {
      const p = current.products.find((x) => x.id === l.productId)!;
      const applied = applyDraft(current, {
        type: "purchase", productId: p.id, productName: p.name, quantity: l.qty, amount: null,
        clientId: null, clientName: null, label: null, unit: unitName(p, l.retail), unitPrice: purchasePrice(p, l),
      });
      if (!applied) return null;
      current = applied.shop;
      total += applied.amount ?? 0;
    }
    return { shop: current, amount: total, summary: `Achat · ${order.lines.length} article${order.lines.length > 1 ? "s" : ""} · ${money(total)} · stock mis à jour` };
  }
  // Facture : une ligne par article, au prix du stock (ou au prix dit)
  const lines: InvoiceLine[] = order.lines.map((l) => {
    const p = shop.products.find((x) => x.id === l.productId)!;
    return { label: p.name, qty: l.qty, unit: unitName(p, l.retail), unitPrice: l.price ?? unitPrice(p, l.retail), productId: p.id };
  });
  let clients = shop.clients;
  let client = order.clientId ? shop.clients.find((c) => c.id === order.clientId) : undefined;
  if (!client) {
    const name = (order.clientName ?? "Client").trim();
    client = { id: uid("c"), name: name.charAt(0).toUpperCase() + name.slice(1), phone: "", debt: 0 };
    clients = [...clients, client];
  }
  const invoice: Invoice = { id: uid("inv"), number: nextInvoiceNumber(shop), at: todayStamp(), clientId: client.id, amount: invoiceTotal(lines), status: "brouillon", lines };
  return {
    shop: { ...shop, clients, invoices: [invoice, ...shop.invoices] },
    amount: invoice.amount,
    summary: `Facture ${invoice.number} · ${client.name} · ${money(invoice.amount)}`,
  };
}
