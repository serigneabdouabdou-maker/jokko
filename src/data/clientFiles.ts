/**
 * Fiches clients (demande de Fallou, 13/11/2026) : chaque client garde son historique — appareils déposés,
 * pannes, dates, prix, services (décodage…), achats, dettes — pour que le réparateur le reconnaisse quand il revient.
 * Et un classement : clients fidèles, bons clients, nouveaux, à relancer, mauvais payeurs, pour faire des campagnes.
 * Tout vient des données déjà enregistrées (réparations, ventes, dettes) : rien de plus à saisir.
 */
import type { Client, Repair, Shop } from "../model.ts";

const DAY = 86_400_000;

export type FileEntry = {
  at: string;
  kind: "reparation" | "service" | "achat";
  title: string;
  detail: string;
  amount: number;
  /** Réparation encore au dépôt, ou garantie encore valable. */
  status?: string;
};

export type Segment = "fidele" | "bon" | "nouveau" | "relancer" | "payeur" | "aucun";

export const SEGMENTS: Record<Segment, { label: string; hint: string }> = {
  fidele: { label: "Fidèles", hint: "Reviennent souvent et paient bien : remercie-les, garde-les." },
  bon: { label: "Bons clients", hint: "Déjà revenus : une petite offre les fera revenir plus souvent." },
  nouveau: { label: "Nouveaux", hint: "Venus une fois : un message de suivi pour qu'ils reviennent." },
  relancer: { label: "À relancer", hint: "Venaient souvent, plus vus depuis 2 mois : rappelle-leur que tu es là." },
  payeur: { label: "Mauvais payeurs", hint: "Dette en retard ou reste non payé : à suivre avant de leur faire crédit." },
  aucun: { label: "Sans visite", hint: "Notés dans le cahier, sans réparation ni achat." },
};

export type ClientFile = {
  client: Client;
  entries: FileEntry[];
  visits: number;
  spent: number;
  firstAt?: string;
  lastAt?: string;
  devices: string[];
  /** Reste à payer sur les réparations en cours. */
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
  for (const s of shop.sales) {
    if (s.clientId !== client.id) continue;
    // Les paiements d'une réparation sont déjà dans la réparation.
    const repairNo = s.label.match(/^Réparation (R-\d+)/)?.[1];
    if (repairNo && repairNumbers.has(repairNo)) continue;
    const service = s.label.startsWith("Service · ");
    entries.push({ at: s.at, kind: service ? "service" : "achat", title: service ? s.label.slice("Service · ".length) : s.label, detail: s.qty ? `${s.qty} ${s.unit ?? ""}`.trim() : "", amount: s.amount });
  }
  entries.sort((a, b) => b.at.localeCompare(a.at));

  // Une visite = un jour où le client est venu : dépôt, récupération, achat ou service (le même jour = une visite).
  const days: string[] = [];
  const moments = [...entries.map((e) => e.at), ...repairs.flatMap((r) => (r.returnedAt ? [r.returnedAt] : []))].sort();
  for (const at of moments) if (!days.some((d) => sameDay(d, at))) days.push(at);
  const visits = days.length;
  const spent = entries.reduce((a, e) => a + e.amount, 0);
  const owedRepairs = repairs.filter((r) => r.status !== "rendu").reduce((a, r) => a + Math.max(0, r.price - r.paid), 0);
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

/** Message de campagne prêt pour WhatsApp, selon le groupe du client. */
export function campaignMessage(file: ClientFile, shopName: string, offer = ""): string {
  const first = file.client.name.split(" ")[0];
  const extra = offer.trim() ? ` ${offer.trim()}` : "";
  switch (file.segment) {
    case "fidele":
      return `Salaam ${first}, merci d'être un client fidèle de ${shopName}.${extra || " Pour toi, un petit geste sur ta prochaine réparation."} À bientôt !`;
    case "bon":
      return `Salaam ${first}, ${shopName} te remercie pour ta confiance.${extra} Écran, batterie, décodage, configuration : on est là pour toi.`;
    case "nouveau":
      return `Salaam ${first}, merci d'être passé chez ${shopName}. Tout marche bien avec ton téléphone ?${extra} On est là si besoin.`;
    case "relancer":
      return `Salaam ${first}, ça fait longtemps ! ${shopName} est toujours là pour tes réparations, décodages et configurations.${extra}`;
    case "payeur":
      return `Salaam ${first}, petit rappel de ${shopName} : il reste ${file.debt + file.owedRepairs} F à régler. Merci de passer quand tu peux.`;
    default:
      return `Salaam ${first}, ${shopName} est à ton service pour tes réparations.${extra}`;
  }
}
