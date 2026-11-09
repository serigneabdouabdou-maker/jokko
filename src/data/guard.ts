import { supabase } from "./supabase";

/** Garde-fou du budget Gemini (console admin) : dépenses, prévision, clients anormaux, téléphones suspects. */
export type GuardStats = {
  depense_jour: number;
  prevision_jour: number;
  depense_mois: number;
  fabrique_jour: number;
  fabrique_mois: number;
  gratuits_jour: number;
  plafonds: Record<GuardKey, string | null>;
  clients: { nom: string; offre: string; cout: number; anormal: boolean }[];
  appareils: { appareil: string; comptes: number; vu: string }[];
  nouveaux_comptes_24h: number;
};

export type GuardKey = "global_jour" | "gratuit_jour" | "images_jour" | "images_mois" | "comptes_par_appareil";

/** Nom du réglage dans private.app_config pour chaque plafond affiché. */
export const GUARD_CONFIG: Record<GuardKey, string> = {
  global_jour: "plafond_global_jour",
  gratuit_jour: "plafond_gratuit_jour",
  images_jour: "plafond_images_jour",
  images_mois: "plafond_images_mois",
  comptes_par_appareil: "comptes_par_appareil",
};

export async function guardStats(): Promise<GuardStats | null> {
  const { data, error } = await supabase.rpc("guard_stats");
  return error ? null : (data as GuardStats);
}

export async function guardSet(key: GuardKey, value: number): Promise<boolean> {
  const { error } = await supabase.rpc("guard_set", { p_key: GUARD_CONFIG[key], p_value: Math.max(0, Math.round(value)) });
  return !error;
}

/** Part du plafond déjà utilisée (0 à 1+), 0 si pas de plafond. */
export function share(spent: number, cap: string | null | undefined): number {
  const c = Number(cap);
  return c > 0 ? spent / c : 0;
}
