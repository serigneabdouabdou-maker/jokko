/**
 * Fiches clients (demande de Fallou, 13/11/2026), pour tous les métiers : chaque client garde son historique —
 * achats, commandes de couture, réparations (appareil, panne, garantie), services, factures, dettes —
 * pour que le commerçant le reconnaisse quand il revient.
 * Et un classement : clients fidèles, bons clients, nouveaux, à relancer, mauvais payeurs, pour faire des campagnes.
 * Tout vient des données déjà enregistrées (réparations, ventes, dettes) : rien de plus à saisir.
 */
import type { Client, Repair, Shop } from "../model.ts";
import { metierOf, type MetierId } from "./metiers.ts";

const DAY = 86_400_000;

export type FileEntry = {
  at: string;
  kind: "reparation" | "service" | "achat" | "commande" | "facture";
  title: string;
  detail: string;
  amount: number;
  /** Réparation encore au dépôt, ou garantie encore valable. */
  status?: string;
};

export type Segment = "fidele" | "bon" | "nouveau" | "relancer" | "payeur" | "aucun";

export const SEGMENTS: Record<Segment, { label: string; one: string; hint: string }> = {
  fidele: { label: "Fidèles", one: "Fidèle", hint: "Reviennent souvent et paient bien : remercie-les, garde-les." },
  bon: { label: "Bons clients", one: "Bon client", hint: "Déjà revenus : une petite offre les fera revenir plus souvent." },
  nouveau: { label: "Nouveaux", one: "Nouveau", hint: "Venus une fois : un message de suivi pour qu'ils reviennent." },
  relancer: { label: "À relancer", one: "À relancer", hint: "Venaient souvent, plus vus depuis 2 mois : rappelle-leur que tu es là." },
  payeur: { label: "Mauvais payeurs", one: "Mauvais payeur", hint: "Dette en retard ou reste non payé : à suivre avant de leur faire crédit." },
  aucun: { label: "Sans visite", one: "Sans visite", hint: "Notés dans le cahier, sans achat ni commande." },
};

export type ClientFile = {
  client: Client;
  entries: FileEntry[];
  visits: number;
  spent: number;
  firstAt?: string;
  lastAt?: string;
  devices: string[];
  /** Ce qu'il achète le plus souvent (alimentation, pharmacie…). */
  favorites: string[];
  /** Reste à payer sur les réparations et commandes en cours. */
  owedRepairs: number;
  /** Dette (cahier des dettes). */
  debt: number;
  late: boolean;
  underWarranty: Repair[];
  segment: Segment;
  /** Note de 0 à 100 : fréquence, argent dépensé, fraîcheur, paiement. */
  score: number;
};

const sameDay = (a: string, b: string) => a.slice(0, 10) === b.slice(0, 10);

export function clientFile(shop: Shop, client: Client, now = new Date()): ClientFile {
  const repairs = (shop.repairs ?? []).filter((r) => r.clientId === client.id && r.status !== "annule");
  const repairNumbers = new Set(repairs.map((r) => r.number));
  const orders = (shop.couture ?? []).filter((o) => o.clientId === client.id && o.status !== "annule");
  const orderNumbers = new Set(orders.map((o) => o.number));
  const entries: FileEntry[] = repairs.map((r) => {
    const warrantyEnd = r.returnedAt && r.warrantyDays ? Date.parse(r.returnedAt) + r.warrantyDays * DAY : 0;
    const status =
      r.status === "depot" ? "au dépôt" : r.status === "repare" ? "réparé, pas encore récupéré" : warrantyEnd > now.getTime() ? `sous garantie jusqu'au ${new Date(warrantyEnd).toLocaleDateString("fr-FR")}` : undefined;
    return {
      at: r.at,
      kind: "reparation",
      title: `${r.number} · ${r.device}`,
      detail: [r.problem, r.parts.length ? `pièces : ${r.parts.map((p) => p.label).join(", ")}` : ""].filter(Boolean).join(" · "),
      amount: r.price,
      ...(status ? { status } : {}),
    };
  });
  for (const o of orders) {
    const status = o.status === "livre" ? undefined : o.status === "pret" ? "prêt, pas encore récupéré" : "en cours";
    entries.push({ at: o.at, kind: "commande", title: `${o.number} · ${o.garment}`, detail: o.fabric, amount: o.price, ...(status ? { status } : {}) });
  }
  for (const i of shop.invoices) {
    if (i.clientId !== client.id) continue;
    entries.push({ at: i.at, kind: "facture", title: `Facture ${i.number}`, detail: i.status === "payee" ? "payée" : "à payer", amount: i.amount });
  }
  const bought = new Map<string, number>();
  for (const s of shop.sales) {
    if (s.clientId !== client.id) continue;
    // Les paiements d'une réparation ou d'une commande sont déjà dans la réparation ou la commande.
    const repairNo = s.label.match(/^Réparation (R-\d+)/)?.[1];
    if (repairNo && repairNumbers.has(repairNo)) continue;
    const orderNo = s.label.match(/^Couture (C-\d+)/)?.[1];
    if (orderNo && orderNumbers.has(orderNo)) continue;
    if (s.productId) bought.set(s.label, (bought.get(s.label) ?? 0) + 1);
    const service = s.label.startsWith("Service · ");
    entries.push({ at: s.at, kind: service ? "service" : "achat", title: service ? s.label.slice("Service · ".length) : s.label, detail: s.qty ? `${s.qty} ${s.unit ?? ""}`.trim() : "", amount: s.amount });
  }
  entries.sort((a, b) => b.at.localeCompare(a.at));

  // Une visite = un jour où le client est venu : dépôt, récupération, achat ou service (le même jour = une visite).
  const days: string[] = [];
  const moments = [
    ...entries.map((e) => e.at),
    ...repairs.flatMap((r) => (r.returnedAt ? [r.returnedAt] : [])),
    ...orders.flatMap((o) => (o.deliveredAt ? [o.deliveredAt] : [])),
  ].sort();
  for (const at of moments) if (!days.some((d) => sameDay(d, at))) days.push(at);
  const visits = days.length;
  const spent = entries.reduce((a, e) => a + e.amount, 0);
  const owedRepairs =
    repairs.filter((r) => r.status !== "rendu").reduce((a, r) => a + Math.max(0, r.price - r.paid), 0) +
    orders.filter((o) => o.status !== "livre").reduce((a, o) => a + Math.max(0, o.price - o.paid), 0);
  const late = client.debt > 0 && !!client.dueAt && Date.parse(client.dueAt) < now.getTime();
  const lastAt = entries[0]?.at;
  const sinceLast = lastAt ? (now.getTime() - Date.parse(lastAt)) / DAY : Infinity;
  const underWarranty = repairs.filter((r) => r.status === "rendu" && r.returnedAt && r.warrantyDays && Date.parse(r.returnedAt) + r.warrantyDays * DAY > now.getTime());

  const segment: Segment = late
    ? "payeur"
    : visits === 0
      ? "aucun"
      : visits >= 3 && sinceLast > 60
        ? "relancer"
        : visits >= 3
          ? "fidele"
          : visits === 2
            ? "bon"
            : "nouveau";

  // Note : fréquence (40), argent (30), fraîcheur (20), paiement (10, perdu si dette en retard).
  const score = Math.round(
    Math.min(40, visits * 10) + Math.min(30, spent / 2000) + (sinceLast <= 30 ? 20 : sinceLast <= 90 ? 10 : 0) + (late ? -20 : client.debt > 0 ? 5 : 10),
  );

  return {
    client,
    entries,
    visits,
    spent,
    ...(days.length ? { firstAt: days[0], lastAt } : {}),
    devices: [...new Set(repairs.map((r) => r.device))],
    favorites: [...bought.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name]) => name),
    owedRepairs,
    debt: client.debt,
    late,
    underWarranty,
    segment,
    score: Math.max(0, Math.min(100, score)),
  };
}

/** Tous les clients, du meilleur au moins bon (note), avec leur groupe. */
export function rankClients(shop: Shop, now = new Date()): ClientFile[] {
  return shop.clients.map((c) => clientFile(shop, c, now)).sort((a, b) => b.score - a.score || b.spent - a.spent);
}

/** Retrouve un client connu pendant la saisie (même numéro d'abord, puis même nom). */
export function knownClient(shop: Shop, name: string, phone: string): Client | undefined {
  const tail = (p: string) => p.replace(/\D/g, "").slice(-9);
  if (tail(phone).length === 9) {
    const byPhone = shop.clients.find((c) => tail(c.phone) === tail(phone));
    if (byPhone) return byPhone;
  }
  const n = name.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (n.length < 3) return undefined;
  return shop.clients.find((c) => c.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") === n);
}

/** Ce que le commerçant propose, selon son métier (pour les messages de campagne). */
const OFFER: Record<MetierId, string> = {
  alimentation: "Riz, huile, sucre, tout est là",
  reparation: "Écran, batterie, décodage, configuration : on est là pour toi",
  pharmacie: "Tes médicaments et soins sont disponibles",
  quincaillerie: "Ciment, fer, plomberie, électricité : tout pour ton chantier",
  couture: "Pense à ton prochain habit : nouveaux modèles à l'atelier",
  vetements: "Nouveaux arrivages : habits, chaussures et tissus",
  mercerie: "Fil, boutons, fermetures et galons : toutes les couleurs sont là",
  restauration: "Le plat du jour t'attend",
  boulangerie: "Pain frais et viennoiseries tous les matins",
  multiservice: "Impressions, bâches, flocage de maillots, logos : on est là",
  autre: "On a ce qu'il te faut",
};

/** Message de campagne prêt pour WhatsApp, selon le groupe du client et le métier de la boutique. */
export function campaignMessage(file: ClientFile, shopName: string, offer = "", activity?: string): string {
  const first = file.client.name.split(" ")[0];
  const extra = offer.trim() ? ` ${offer.trim()}` : "";
  const metier = metierOf(activity).id;
  const what = file.favorites[0] && ["alimentation", "pharmacie", "quincaillerie", "vetements", "boulangerie", "autre"].includes(metier) ? `Ton ${file.favorites[0].toLowerCase()} est disponible. ` : "";
  const line = OFFER[metier];
  switch (file.segment) {
    case "fidele":
      return `Salaam ${first}, merci d'être un client fidèle de ${shopName}.${extra || " Pour toi, un petit geste à ton prochain passage."} À bientôt !`;
    case "bon":
      return `Salaam ${first}, ${shopName} te remercie pour ta confiance.${extra} ${line}.`;
    case "nouveau":
      return `Salaam ${first}, merci d'être passé chez ${shopName}. ${what}${line}.${extra}`;
    case "relancer":
      return `Salaam ${first}, ça fait longtemps ! ${shopName} est toujours là. ${what}${line}.${extra}`;
    case "payeur":
      return `Salaam ${first}, petit rappel de ${shopName} : il reste ${file.debt + file.owedRepairs} F à régler. Merci de passer quand tu peux.`;
    default:
      return `Salaam ${first}, ${shopName} est à ton service. ${line}.${extra}`;
  }
}

/** Lundi de la semaine (AAAA-MM-JJ) : le rappel revient une fois par semaine. */
export function weekKey(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Rappel de la semaine (écran Parler, à partir du lundi) : les clients qui venaient souvent et ne viennent plus,
 * et les dettes en retard. null s'il n'y a rien à faire.
 */
export function weeklyNudge(shop: Shop, now = new Date()): { relancer: ClientFile[]; payeurs: ClientFile[]; owed: number; week: string } | null {
  const files = rankClients(shop, now);
  const relancer = files.filter((f) => f.segment === "relancer");
  const payeurs = files.filter((f) => f.segment === "payeur");
  if (!relancer.length && !payeurs.length) return null;
  return { relancer, payeurs, owed: payeurs.reduce((a, f) => a + f.debt, 0), week: weekKey(now) };
}
