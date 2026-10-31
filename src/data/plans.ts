import type { PlanName, Shop } from "../model.ts";
import { supabase } from "./supabase.ts";

/**
 * Offres Jokko : Gratuit, Médium, Avancé. L'offre active est calculée comme sur le serveur :
 * offre payée non expirée, sinon essai (Avancé, 14 jours), sinon Gratuit. Le serveur vérifie aussi les règles importantes.
 */

export const PLAN_LABELS: Record<PlanName, string> = { gratuit: "Gratuit", medium: "Médium", avance: "Avancé" };
const RANK: Record<PlanName, number> = { gratuit: 1, medium: 2, avance: 3 };

export type Feature = "vendeurs" | "scanner" | "distance" | "journal" | "etiquettes" | "import" | "chat" | "conseiller" | "resume" | "boutiques";

/** Offre minimale de chaque fonction. */
export const FEATURE_PLAN: Record<Feature, PlanName> = {
  vendeurs: "medium",
  scanner: "medium",
  distance: "medium",
  journal: "medium",
  etiquettes: "medium",
  import: "medium",
  chat: "avance",
  conseiller: "avance",
  resume: "avance",
  boutiques: "avance",
};

export const PLAN_FEATURES: Record<PlanName, string[]> = {
  gratuit: ["1 boutique, 1 utilisateur", "La voix en wolof et en français", "Ventes, stock, caisse et bilan", "Dettes et factures"],
  medium: ["Tout le Gratuit", "Vendeurs, rôles et journal", "Scanner et étiquettes", "À distance et alertes de sécurité", "Relances WhatsApp, import Excel, export"],
  avance: ["Tout le Médium", "Chat intelligent (liste en vrac)", "Conseiller IA", "Résumé du soir en notification", "Plusieurs boutiques"],
};

export function effectivePlan(shop: Pick<Shop, "plan">, now = new Date()): { plan: PlanName; trial: boolean; until: string | null } {
  const p = shop.plan;
  if (!p) return { plan: "avance", trial: false, until: null }; // copie hors ligne sans info : on ne bloque pas
  if (p.plan !== "gratuit" && (!p.until || Date.parse(p.until) > now.getTime())) return { plan: p.plan, trial: false, until: p.until };
  if (p.trialUntil && Date.parse(p.trialUntil) > now.getTime()) return { plan: "avance", trial: true, until: p.trialUntil };
  return { plan: "gratuit", trial: false, until: null };
}

export function can(shop: Pick<Shop, "plan">, feature: Feature, now = new Date()): boolean {
  return RANK[effectivePlan(shop, now).plan] >= RANK[FEATURE_PLAN[feature]];
}

export function daysLeft(iso: string | null, now = new Date()): number | null {
  return iso ? Math.max(0, Math.ceil((Date.parse(iso) - now.getTime()) / 86_400_000)) : null;
}

export type SubscriptionInfo = { price_medium: number; price_avance: number; wave_link: string | null; is_admin: boolean };

export async function subscriptionInfo(): Promise<SubscriptionInfo | null> {
  const { data, error } = await supabase.rpc("subscription_info");
  return error || !data ? null : (data as SubscriptionInfo);
}

export type SubscriptionRequest = { id: string; plan: "medium" | "avance"; months: number; amount: number; reference: string; status: "en_attente" | "active" | "refusee"; created_at: string };

export async function requestSubscription(shopId: string, plan: "medium" | "avance", months: number, payer: string): Promise<{ ok: true; reference: string; amount: number } | { ok: false; message: string }> {
  const { data, error } = await supabase.rpc("request_subscription", { p_shop: shopId, p_plan: plan, p_months: months, p_payer: payer });
  if (error || !data) return { ok: false, message: /patron/.test(error?.message ?? "") ? "Seul le patron peut choisir l'offre." : "Demande impossible pour le moment. Vérifie la connexion." };
  return { ok: true, reference: data.reference, amount: data.amount };
}

export async function myRequests(shopId: string): Promise<SubscriptionRequest[]> {
  const { data } = await supabase.from("subscription_requests").select("id, plan, months, amount, reference, status, created_at").eq("shop_id", shopId).order("created_at", { ascending: false }).limit(20);
  return (data ?? []) as SubscriptionRequest[];
}

/** Recharge l'offre de la boutique depuis le serveur (après une activation). */
export async function freshPlan(shopId: string): Promise<Shop["plan"] | null> {
  const { data } = await supabase.from("shops").select("plan, plan_until, trial_until").eq("id", shopId).maybeSingle();
  if (!data) return null;
  return { plan: data.plan as PlanName, until: data.plan_until ?? null, trialUntil: data.trial_until ?? null };
}

// ---------- Administration (CFC) ----------

export type AdminRequest = SubscriptionRequest & { shop_id: string; shop_name: string; payer_phone: string; patron_phone: string };
export type AdminShop = { id: string; name: string; city: string; plan: PlanName; plan_until: string | null; trial_until: string | null; effective: PlanName; created_at: string; patron_phone: string; sales_30: number };
export type AdminOverview = { requests: AdminRequest[]; shops: AdminShop[]; wave_link: string | null; price_medium: number; price_avance: number };

export async function adminOverview(): Promise<AdminOverview | null> {
  const { data, error } = await supabase.rpc("admin_overview");
  return error || !data ? null : (data as AdminOverview);
}

export async function adminDecide(requestId: string, activate: boolean): Promise<boolean> {
  const { error } = await supabase.rpc("admin_decide", { p_request: requestId, p_activate: activate });
  return !error;
}

export async function adminSetPlan(shopId: string, plan: PlanName, until: string | null): Promise<boolean> {
  const { error } = await supabase.rpc("admin_set_plan", { p_shop: shopId, p_plan: plan, p_until: until });
  return !error;
}

export async function adminSettings(waveLink: string, priceMedium: number, priceAvance: number): Promise<boolean> {
  const { error } = await supabase.rpc("admin_settings", { p_wave_link: waveLink.trim(), p_price_medium: priceMedium, p_price_avance: priceAvance });
  return !error;
}
