import type { Client, Lang, Shop } from "../model";
import { francsToWolof } from "../assistant/wolofNumbers";

/** Dettes : échéances, retards et messages de relance WhatsApp. */

const DAY = 86_400_000;

export type DebtStatus = { client: Client; dueAt: Date | null; daysLeft: number | null; overdue: boolean };

export function debtStatus(client: Client, now = new Date()): DebtStatus {
  const dueAt = client.dueAt ? new Date(client.dueAt) : null;
  const daysLeft = dueAt ? Math.ceil((dueAt.getTime() - now.getTime()) / DAY) : null;
  return { client, dueAt, daysLeft, overdue: client.debt > 0 && daysLeft !== null && daysLeft < 0 };
}

/** Clients qui doivent de l'argent, les retards d'abord, puis par échéance la plus proche. */
export function debtList(shop: Shop, now = new Date()): DebtStatus[] {
  return shop.clients
    .filter((c) => c.debt > 0)
    .map((c) => debtStatus(c, now))
    .sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));
}

export function overdueDebts(shop: Shop, now = new Date()): DebtStatus[] {
  return debtList(shop, now).filter((d) => d.overdue);
}

const formatF = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} F`;
const dateFr = (d: Date) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

/**
 * Message de relance poli, dans la langue de la boutique.
 * Message wolof validé par le patron de Jokko le 31/10/2026 : ne pas le reformuler sans nouvelle validation.
 */
export function reminderMessage(client: Client, shop: Shop, lang: Lang, now = new Date()): string {
  const first = client.name.split(" ")[0];
  const status = debtStatus(client, now);
  if (lang === "wo") {
    // Uniquement le texte validé (pas de phrase en plus sur la date, non validée).
    const amount = `${francsToWolof(client.debt)} (${formatF(client.debt)})`;
    return `Salaam aleekum ${first}. ${shop.name} la. Sa bor bi, ${amount} la. Su la neexee, nga fey ko. Jërëjëf.`;
  }
  const due = status.overdue && status.dueAt ? ` La date prévue était le ${dateFr(status.dueAt)}.` : status.dueAt ? ` À régler avant le ${dateFr(status.dueAt)}.` : "";
  return `Bonjour ${first}, c'est ${shop.name}. Il reste ${formatF(client.debt)} à payer.${due} Merci beaucoup.`;
}

/** Lien qui ouvre WhatsApp sur la conversation du client, avec le message déjà écrit. */
export function whatsappLink(phone: string, text: string): string | null {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 9) digits = `221${digits}`;
  if (digits.length < 9) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** Change l'échéance d'une dette (dans `days` jours). */
export function setDueIn(shop: Shop, clientId: string, days: number, now = new Date()): Shop {
  const dueAt = new Date(now.getTime() + days * DAY).toISOString();
  return { ...shop, clients: shop.clients.map((c) => (c.id === clientId ? { ...c, dueAt } : c)) };
}
