// Console CFC : tableau de bord général de la plateforme Jokko.
// Toutes ces fonctions sont refusées par le serveur si le compte n'est pas administrateur.
import { supabase } from "./supabase";
import type { PlanName } from "../model";

export type Dashboard = {
  shops_total: number;
  shops_new_7d: number;
  shops_new_30d: number;
  users_total: number;
  sellers_total: number;
  active_7d: number;
  plans: Record<PlanName, number>;
  paying_medium: number;
  paying_avance: number;
  trials_active: number;
  trials_ending_3d: number;
  pending: number;
  pending_amount: number;
  revenue_month: number;
  revenue_prev_month: number;
  revenue_total: number;
  mrr: number;
  sales_30_count: number;
  sales_30_amount: number;
  signups_weeks: { week: string; n: number }[];
  revenue_months: { month: string; amount: number }[];
  cities: { city: string; n: number }[];
  activities: { activity: string; n: number }[];
};

export type ConsoleShop = {
  id: string;
  name: string;
  city: string;
  activity: string;
  plan: PlanName;
  plan_until: string | null;
  trial_until: string | null;
  effective: PlanName;
  created_at: string;
  patron_phone: string;
  patron_name: string | null;
  members: number;
  sales_30: number;
  amount_30: number;
  last_sale_at: string | null;
  products: number;
  lat?: number | null;
  lng?: number | null;
  located_at?: string | null;
};

export type AdminMember = { user_id: string; phone: string; name: string | null; me: boolean };

/** Le serveur dit « réservé à l'administration » : ce compte n'a pas accès à la console. */
export const notAdmin = (message = "") => /réservé à l'administration|administration/.test(message);

export async function loadDashboard(): Promise<{ data: Dashboard | null; denied: boolean }> {
  const { data, error } = await supabase.rpc("admin_dashboard");
  return { data: error ? null : (data as Dashboard), denied: Boolean(error && notAdmin(error.message)) };
}

export async function loadShops(): Promise<ConsoleShop[]> {
  const { data, error } = await supabase.rpc("admin_shops");
  return error || !data ? [] : (data as ConsoleShop[]);
}

export async function extendTrial(shopId: string, days: number): Promise<boolean> {
  const { error } = await supabase.rpc("admin_extend_trial", { p_shop: shopId, p_days: days });
  return !error;
}

export async function loadAdminTeam(): Promise<AdminMember[]> {
  const { data, error } = await supabase.rpc("admin_team");
  return error || !data ? [] : (data as AdminMember[]);
}

export async function addAdmin(phone: string): Promise<string | null> {
  const { error } = await supabase.rpc("admin_add", { p_phone: phone });
  if (!error) return null;
  return /aucun compte/.test(error.message) ? "Aucun compte Jokko avec ce numéro. La personne doit d'abord créer son compte." : "Ajout impossible pour le moment.";
}

export async function removeAdmin(userId: string): Promise<boolean> {
  const { error } = await supabase.rpc("admin_remove", { p_user: userId });
  return !error;
}

/** Statut simple d'une boutique, pour la liste de la console. */
export function shopStatus(s: Pick<ConsoleShop, "last_sale_at" | "created_at">, now = Date.now()): "active" | "calme" | "endormie" | "nouvelle" {
  const day = 86_400_000;
  if (!s.last_sale_at) return now - Date.parse(s.created_at) < 7 * day ? "nouvelle" : "endormie";
  const since = now - Date.parse(s.last_sale_at);
  if (since < 3 * day) return "active";
  if (since < 14 * day) return "calme";
  return "endormie";
}

/** Évolution en % entre deux montants (null si on ne peut pas comparer). */
export function growth(now: number, before: number): number | null {
  if (!before) return null;
  return Math.round(((now - before) / before) * 100);
}

export type UsageShop = { shop_id: string; name: string; tier: string; echange: number | null; vocal: number | null; texte: number | null; cost_30: number };
export type Usage = { today: Record<string, number>; cost_today: number; cost_month: number; cost_30: number; shops: UsageShop[] };

/** Usage de Gemini et coût estimé (F CFA), pour surveiller la rentabilité. */
export async function loadUsage(): Promise<Usage | null> {
  const { data, error } = await supabase.rpc("admin_usage");
  return error || !data ? null : (data as Usage);
}


// ---------- Gemini : quota de Google et usage des clients (console CFC) ----------

export type GeminiKind = "direct" | "vocal" | "texte" | "conseil" | "voix" | "stock";
export type GeminiShop = { id: string; name: string; city: string; plan: string; total: number; echanges: number; vocaux: number; ecrits: number; wolof: number; francais: number; dernier: string | null };
export type GeminiBoard = {
  google_day_start: string;
  google_day_end: string;
  today: Partial<Record<GeminiKind, { ok: number; refus: number }>>;
  echanges_today: number;
  limits: Partial<Record<GeminiKind, number>>;
  days: { day: string; appels: number; refus: number; echanges: number }[];
  langs: Record<string, number>;
  kinds: Record<string, number>;
  shops: GeminiShop[];
};

export async function loadGemini(): Promise<GeminiBoard | null> {
  const { data, error } = await supabase.rpc("admin_gemini");
  return error || !data ? null : (data as GeminiBoard);
}

export async function setGeminiLimit(kind: GeminiKind, limit: number | null): Promise<boolean> {
  const { error } = await supabase.rpc("admin_set_gemini_limit", { p_kind: kind, p_limit: limit ?? 0 });
  return !error;
}

// ---------- Cahier des erreurs de Jokko ----------

export type QualityBoard = {
  days: number;
  langs: { lang: "wo" | "fr"; actions: number; annule: number; signale: number }[];
  byDay: { day: string; actions: number; annule: number; signale: number }[];
  errors: { id: number; at: string; lang: "wo" | "fr"; kind: "annule" | "signale"; said: string; understood: string; fixed: boolean; shop: string }[];
};

export async function loadQuality(days: number): Promise<QualityBoard | null> {
  const { data, error } = await supabase.rpc("admin_quality", { p_days: days });
  return error || !data ? null : (data as QualityBoard);
}

export async function setErrorFixed(id: number, fixed: boolean): Promise<boolean> {
  const { error } = await supabase.rpc("admin_error_fixed", { p_id: id, p_fixed: fixed });
  return !error;
}
