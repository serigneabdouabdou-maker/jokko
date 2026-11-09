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

/** Essais à appeler (console « À appeler ») : fin d'essai, essai épuisé, ou fin dans moins de 2 jours. */
export type Relance = {
  shop_id: string;
  nom: string;
  ville: string | null;
  metier: string | null;
  raison: "epuise" | "bientot" | "fini";
  created_at: string;
  appele_at: string | null;
  issue: "paye" | "rappeler" | "non" | null;
  tel: string | null;
  offre: string;
  ventes: number;
  usages: number;
};

export async function relancesList(): Promise<Relance[] | null> {
  const { data, error } = await supabase.rpc("relances_list");
  return error ? null : ((data as Relance[]) ?? []);
}

export async function relanceMark(shopId: string, issue: "paye" | "rappeler" | "non"): Promise<boolean> {
  const { error } = await supabase.rpc("relance_mark", { p_shop: shopId, p_issue: issue });
  return !error;
}

/** Numéro international (221…) pour l'appel et WhatsApp ; 9 chiffres = Sénégal. */
export function intlPhone(tel: string | null): string | null {
  const d = (tel ?? "").replace(/\D/g, "");
  if (d.length === 9) return `221${d}`;
  return d.length >= 11 ? d : null;
}

/** Message WhatsApp prêt à envoyer par Fallou au commerçant. */
export function relanceMessage(r: Pick<Relance, "nom" | "raison" | "ventes">): string {
  const debut = r.raison === "fini" ? "ton essai gratuit de Jokko est terminé" : r.raison === "epuise" ? "tu as utilisé tout ton essai de la voix Jokko" : "ton essai gratuit de Jokko se termine bientôt";
  const ventes = r.ventes > 0 ? ` Tu as déjà noté ${r.ventes} vente${r.ventes > 1 ? "s" : ""} avec Jokko.` : "";
  return `Salam ${r.nom}, c'est Fallou de Jokko (CFC). ${debut[0].toUpperCase()}${debut.slice(1)}.${ventes} Pour continuer à parler à Jokko, l'offre Médium coûte 4 000 F par mois (135 F par jour). Je peux t'aider à l'activer maintenant ?`;
}
