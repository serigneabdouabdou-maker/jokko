/**
 * Clients perdus (22/11/2026, demande de Fallou : « noter les clients perdus »).
 * Chaque prix donné dans « Prix pour un client » est noté : pris (le dépôt est fait) ou perdu (raison, prix que le
 * client voulait). Au bout de quelques semaines, Jokko sait à quel prix on perd des clients, sur quels modèles, et
 * combien auraient pu être gardés sans descendre sous le minimum. Les chiffres vont au Conseiller.
 */
import type { LostReason, QuoteRecord, Shop } from "../model.ts";

const DAY = 86_400_000;

export const LOST_REASONS: Record<LostReason, string> = {
  cher: "Trop cher pour lui",
  compare: "Il compare chez un autre",
  plus_tard: "Il revient plus tard",
  pas_stock: "Pièce pas en stock",
  autre: "Autre raison",
};

export function recordQuote(shop: Shop, q: Omit<QuoteRecord, "id" | "at">, makeId: (p: string) => string, now = new Date()): Shop {
  const rec: QuoteRecord = { id: makeId("q"), at: now.toISOString(), ...q, model: q.model.trim().slice(0, 40), items: q.items.slice(0, 8) };
  return { ...shop, quotes: [...(shop.quotes ?? []), rec].slice(-300) };
}

export type QuoteStats = {
  days: number;
  given: number;
  won: number;
  lost: number;
  /** Part des prix donnés qui deviennent un dépôt (en %), null si moins de 3 prix notés. */
  wonPct: number | null;
  reasons: Array<{ reason: LostReason; label: string; n: number }>;
  /** Perdus avec le prix voulu noté : écart moyen entre ton prix et le sien. */
  gapAvg: number | null;
  wantedNoted: number;
  /** Perdus alors que le client voulait payer au moins ton minimum : ils pouvaient être gardés. */
  savable: number;
  savableAmount: number;
  /** Perdus alors que le client voulait moins que ton minimum : bien de les laisser partir. */
  belowFloor: number;
  /** Modèles les plus perdus. */
  models: Array<{ model: string; lost: number; given: number }>;
};

/** Les chiffres des prix donnés sur les `days` derniers jours. */
export function quoteStats(shop: Shop, now = new Date(), days = 30): QuoteStats {
  const from = now.getTime() - days * DAY;
  const list = (shop.quotes ?? []).filter((q) => Date.parse(q.at) >= from);
  const won = list.filter((q) => q.outcome === "pris");
  const lost = list.filter((q) => q.outcome === "perdu");
  const counts = new Map<LostReason, number>();
  for (const q of lost) counts.set(q.reason ?? "autre", (counts.get(q.reason ?? "autre") ?? 0) + 1);
  const withWanted = lost.filter((q) => q.wanted !== undefined && q.wanted > 0 && q.offered > 0);
  const savableList = withWanted.filter((q) => q.floor !== undefined && q.wanted! >= q.floor && q.wanted! < q.offered);
  const byModel = new Map<string, { model: string; lost: number; given: number }>();
  for (const q of list) {
    const k = q.model.toUpperCase();
    const m = byModel.get(k) ?? { model: k, lost: 0, given: 0 };
    m.given += 1;
    if (q.outcome === "perdu") m.lost += 1;
    byModel.set(k, m);
  }
  return {
    days,
    given: list.length,
    won: won.length,
    lost: lost.length,
    wonPct: list.length >= 3 ? Math.round((won.length / list.length) * 100) : null,
    reasons: [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([reason, n]) => ({ reason, label: LOST_REASONS[reason], n })),
    gapAvg: withWanted.length ? Math.round(withWanted.reduce((a, q) => a + (q.offered - q.wanted!), 0) / withWanted.length / 100) * 100 : null,
    wantedNoted: withWanted.length,
    savable: savableList.length,
    savableAmount: savableList.reduce((a, q) => a + q.wanted!, 0),
    belowFloor: withWanted.filter((q) => q.floor !== undefined && q.wanted! < q.floor).length,
    models: [...byModel.values()].filter((m) => m.lost > 0).sort((a, b) => b.lost - a.lost || b.given - a.given).slice(0, 5),
  };
}

/** Une phrase pour l'écran : « Ce mois : 12 prix donnés, 8 pris (67 %), 4 perdus (3 trop cher) ». */
export function quoteLine(st: QuoteStats): string {
  if (!st.given) return "";
  const top = st.reasons[0];
  return `${st.days} derniers jours : ${st.given} prix donné${st.given > 1 ? "s" : ""}, ${st.won} pris${st.wonPct !== null ? ` (${st.wonPct} %)` : ""}, ${st.lost} perdu${st.lost > 1 ? "s" : ""}${top ? ` (surtout : ${top.label.toLowerCase()})` : ""}.`;
}
