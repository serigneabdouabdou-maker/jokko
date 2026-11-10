import { type Payment, PAYMENT_LABELS, type Sale, type Shop } from "../model.ts";

/**
 * Tickets de caisse (10/11/2026) : chaque encaissement reçoit un numéro qui se suit dans la journée (1, 2, 3…).
 * Le ticket papier donné au client et ce que montre Jokko doivent dire la même chose : le soir, le ticket Z
 * compte les tickets, les totaux par paiement, et signale les numéros manquants (un ticket effacé laisse un trou).
 * Impression : imprimante thermique Bluetooth 58 mm (32 caractères par ligne), par l'impression du téléphone
 * ou par l'appli RawBT (commandes ESC/POS).
 */

const localDay = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
export const dayOfSale = (s: Pick<Sale, "at">) => localDay(new Date(s.at));

/** Numéro du prochain ticket de la journée. */
export function nextTicket(shop: Pick<Shop, "sales">, now = new Date()): number {
  const today = localDay(now);
  let max = 0;
  for (const s of shop.sales) if (s.ticket && dayOfSale(s) === today && s.ticket > max) max = s.ticket;
  return max + 1;
}

/** Les lignes d'un ticket (même numéro, même jour). */
export function ticketSales(shop: Pick<Shop, "sales">, ticket: number, day: string): Sale[] {
  return shop.sales.filter((s) => s.ticket === ticket && dayOfSale(s) === day).sort((a, b) => a.at.localeCompare(b.at));
}

export const ticketLabel = (ticket: number, day: string) => `N° ${String(ticket).padStart(4, "0")} du ${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;

const W = 32;
const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[«»]/g, '"').replace(/[’‘]/g, "'").replace(/[^\x20-\x7E]/g, "");
const f = (n: number) => `${Math.round(n).toLocaleString("fr-FR").replace(/\s/g, " ")} F`;
const center = (s: string) => { const t = s.slice(0, W); return " ".repeat(Math.max(0, Math.floor((W - t.length) / 2))) + t; };
const row = (left: string, right: string) => { const r = right.slice(0, W); const l = left.slice(0, W - r.length - 1); return l + " ".repeat(Math.max(1, W - l.length - r.length)) + r; };
const line = "-".repeat(W);

/** Texte du ticket client, 32 caractères par ligne (imprimante 58 mm), sans accents (lisible sur toutes les imprimantes). */
export function receiptText(shop: Pick<Shop, "name" | "address" | "phone" | "ninea" | "city" | "clients">, sales: Sale[]): string {
  if (!sales.length) return "";
  const first = sales[0];
  const day = dayOfSale(first);
  const time = new Date(first.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const total = sales.reduce((a, s) => a + s.amount, 0);
  const payment: Payment = first.payment ?? "especes";
  const client = first.clientId ? shop.clients.find((c) => c.id === first.clientId) : undefined;
  const out = [center(plain(shop.name).toUpperCase())];
  if (shop.address || shop.city) out.push(center(plain([shop.address, shop.city].filter(Boolean).join(", "))));
  if (shop.phone) out.push(center(`Tel ${plain(shop.phone)}`));
  if (shop.ninea) out.push(center(`NINEA ${plain(shop.ninea)}`));
  out.push(line, row(`Ticket n ${String(first.ticket ?? 0).padStart(4, "0")}`, `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)} ${time}`), line);
  for (const s of sales) {
    const qty = s.qty ?? 1;
    const name = plain(s.label);
    if (qty !== 1 && s.qty) {
      out.push(name.slice(0, W));
      out.push(row(`  ${qty} x ${f(s.amount / qty)}`, f(s.amount)));
    } else out.push(row(name, f(s.amount)));
  }
  out.push(line, row("TOTAL", f(total)), row("Paiement", plain(PAYMENT_LABELS[payment])));
  if (client) out.push(row("Client", plain(client.name)));
  out.push(line, center("Merci et a bientot !"), center("Jokko - jokkoapp.com"));
  return out.join("\n");
}

export type ZReport = {
  day: string;
  tickets: number;
  first: number | null;
  last: number | null;
  /** Numéros manquants entre le premier et le dernier : tickets effacés après coup. */
  missing: number[];
  total: number;
  byPayment: Record<Payment, number>;
  /** Ventes sans numéro (anciennes ventes, ou faites avant les tickets). */
  untracked: number;
  expenses: number;
};

/** Ticket Z : la clôture de la journée. */
export function zReport(shop: Pick<Shop, "sales" | "expenses">, now = new Date()): ZReport {
  const day = localDay(now);
  const sales = shop.sales.filter((s) => dayOfSale(s) === day);
  const nums = [...new Set(sales.filter((s) => s.ticket).map((s) => s.ticket as number))].sort((a, b) => a - b);
  const byPayment: Record<Payment, number> = { especes: 0, wave: 0, om: 0, credit: 0 };
  for (const s of sales) byPayment[s.payment ?? "especes"] += s.amount;
  const missing: number[] = [];
  if (nums.length) for (let n = 1; n <= nums[nums.length - 1]; n++) if (!nums.includes(n)) missing.push(n);
  return {
    day, tickets: nums.length, first: nums[0] ?? null, last: nums[nums.length - 1] ?? null, missing,
    total: sales.reduce((a, s) => a + s.amount, 0), byPayment,
    untracked: sales.filter((s) => !s.ticket).reduce((a, s) => a + s.amount, 0),
    expenses: shop.expenses.filter((e) => localDay(new Date(e.at)) === day).reduce((a, e) => a + e.amount, 0),
  };
}

/** Texte du ticket Z, pour l'imprimante. */
export function zText(shop: Pick<Shop, "name">, z: ZReport, counted?: number): string {
  const out = [center(plain(shop.name).toUpperCase()), center("TICKET Z - CLOTURE"), center(`${z.day.slice(8, 10)}/${z.day.slice(5, 7)}/${z.day.slice(0, 4)}`), line];
  out.push(row("Tickets", String(z.tickets)));
  if (z.first) out.push(row("Du numero", `${z.first} au ${z.last}`));
  out.push(row("Numeros manquants", z.missing.length ? z.missing.join(", ").slice(0, 14) : "aucun"));
  out.push(line);
  for (const p of ["especes", "wave", "om", "credit"] as Payment[]) if (z.byPayment[p]) out.push(row(plain(PAYMENT_LABELS[p]), f(z.byPayment[p])));
  if (z.untracked) out.push(row("Sans ticket", f(z.untracked)));
  out.push(row("TOTAL VENTES", f(z.total)), row("Depenses", f(z.expenses)));
  if (counted !== undefined) out.push(line, row("Especes comptees", f(counted)), row("Ecart", f(counted - (z.byPayment.especes - z.expenses))));
  out.push(line, center(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })));
  return out.join("\n");
}

/** Commandes ESC/POS (initialiser, texte, avancer le papier, couper) encodées en base64, pour RawBT. */
export function escposBase64(text: string): string {
  const bytes: number[] = [0x1b, 0x40];
  for (const part of text.split("\n")) {
    for (const ch of plain(part)) bytes.push(ch.charCodeAt(0));
    bytes.push(0x0a);
  }
  bytes.push(0x0a, 0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x01);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Lien qui envoie le ticket à l'appli RawBT (imprimante Bluetooth) sur Android. */
export const rawbtLink = (text: string) => `intent:base64,${escposBase64(text)}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`;

/** Ticket d'une vente : toutes les lignes du même encaissement (ou la vente seule si elle n'a pas de numéro). */
export function receiptFor(shop: Pick<Shop, "name" | "address" | "phone" | "ninea" | "city" | "clients" | "sales">, sale: Sale): { title: string; text: string } {
  const day = dayOfSale(sale);
  const lines = sale.ticket ? ticketSales(shop, sale.ticket, day) : [sale];
  return { title: sale.ticket ? `Ticket ${ticketLabel(sale.ticket, day)}` : "Ticket", text: receiptText(shop, lines.length ? lines : [sale]) };
}
