import { supabase } from "./supabase";

/** Taille des demandes envoyées à Gemini par boutique (console admin, 7 derniers jours). */
export type PayloadShop = {
  shop_id: string;
  nom: string;
  articles: number;
  clients: number;
  max_jour: number;
  max_7j: number;
  moyenne_7j: number;
  articles_envoyes: number | null;
  appels_7j: number;
  refus_7j: number;
  jours: { jour: string; max: number }[];
};
export type PayloadStats = { limite: number; limite_serveur: number; boutiques: PayloadShop[] };

export async function payloadStats(): Promise<PayloadStats | null> {
  const { data, error } = await supabase.rpc("payload_stats");
  return error ? null : (data as PayloadStats);
}

/** Niveau d'une taille par rapport à la limite visée : vert < 60 %, orange < 85 %, rouge au-delà. */
export function payloadTone(bytes: number, limit: number): "good" | "warn" | "bad" {
  const s = limit > 0 ? bytes / limit : 0;
  return s >= 0.85 ? "bad" : s >= 0.6 ? "warn" : "good";
}

/** Tendance : le plus gros jour récent comparé aux jours d'avant (en %), null sans comparaison. */
export function payloadTrend(days: { max: number }[]): number | null {
  const seen = days.filter((d) => d.max > 0);
  if (seen.length < 2) return null;
  const last = seen[seen.length - 1]!.max;
  const before = seen.slice(0, -1).reduce((a, d) => a + d.max, 0) / (seen.length - 1);
  return before > 0 ? Math.round(((last - before) / before) * 100) : null;
}

export const ko = (bytes: number) => `${(bytes / 1024).toFixed(bytes < 10_240 ? 1 : 0).replace(".", ",")} Ko`;
