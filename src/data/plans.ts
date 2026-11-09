import type { PlanName, Shop } from "../model.ts";
import { supabase, SUPABASE_KEY, SUPABASE_URL } from "./supabase.ts";

/**
 * Offres Jokko : Gratuit, Médium, Avancé. L'offre active est calculée comme sur le serveur :
 * offre payée non expirée, sinon essai (Avancé, 14 jours), sinon Gratuit. Le serveur vérifie aussi les règles importantes.
 */

export const PLAN_LABELS: Record<PlanName, string> = { gratuit: "Gratuit", medium: "Médium", avance: "Avancé" };
const RANK: Record<PlanName, number> = { gratuit: 1, medium: 2, avance: 3 };

export type Feature = "vendeurs" | "scanner" | "distance" | "journal" | "etiquettes" | "import" | "chat" | "conseiller" | "resume" | "boutiques" | "direct";

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
  direct: "avance",
};

export const PLAN_FEATURES: Record<PlanName, string[]> = {
  gratuit: ["1 boutique, 1 utilisateur", "10 messages vocaux par mois (wolof et français)", "Ventes, stock, caisse et bilan", "Dettes et factures"],
  medium: ["Tout le Gratuit", "40 messages vocaux par jour", "Vendeurs, rôles et journal", "Scanner et étiquettes", "À distance et alertes de sécurité", "Relances WhatsApp, import Excel, export"],
  avance: ["Tout le Médium", "Conversation en direct avec Jokko (25 échanges par jour)", "Chat intelligent (liste en vrac)", "Conseiller IA", "Résumé du soir en notification", "Plusieurs entreprises", "Tailleurs : tout le Studio, nouveaux modèles et essayage (5 par jour)"],
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

/** Lien Wave de CFC avec le montant à payer déjà rempli (Wave lit « ?amount= »). */
export function waveLinkFor(link: string, amount: number): string {
  try {
    const url = new URL(link.trim());
    url.searchParams.set("amount", String(Math.round(amount)));
    return url.toString();
  } catch {
    return link;
  }
}

export type SubscriptionInfo = { price_medium: number; price_avance: number; wave_link: string | null; wave_auto?: boolean; paydunya?: boolean; paydunya_mode?: "test" | "live" | null; is_admin: boolean };

export async function subscriptionInfo(): Promise<SubscriptionInfo | null> {
  const { data, error } = await supabase.rpc("subscription_info");
  return error || !data ? null : (data as SubscriptionInfo);
}

export type SubscriptionRequest = { id: string; plan: "medium" | "avance"; months: number; amount: number; reference: string; status: "en_attente" | "active" | "refusee"; created_at: string; declared_at?: string | null; paid_at?: string | null; paid_via?: string | null; transaction_id?: string | null; receipt_url?: string | null };

/** Une seule demande en attente par boutique : le serveur renvoie celle qui existe déjà (même référence). */
export async function requestSubscription(shopId: string, plan: "medium" | "avance", months: number, payer: string): Promise<{ ok: true; id: string; reference: string; amount: number; plan?: "medium" | "avance"; declared: boolean } | { ok: false; message: string }> {
  const { data, error } = await supabase.rpc("request_subscription", { p_shop: shopId, p_plan: plan, p_months: months, p_payer: payer });
  if (error || !data) return { ok: false, message: /patron/.test(error?.message ?? "") ? "Seul le patron peut choisir l'offre." : "Demande impossible pour le moment. Vérifie la connexion." };
  return { ok: true, id: data.id, reference: data.reference, amount: data.amount, plan: data.plan, declared: data.declare === true };
}

async function waveCall(route: "abonnement" | "abonnement-check", body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> | null }> {
  const { data } = await supabase.auth.getSession();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/wave/${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify(body),
  });
  return { ok: response.ok, data: (await response.json().catch(() => null)) as Record<string, unknown> | null };
}

/** Paiement Wave de l'abonnement (compte Wave Business de CFC) : renvoie le lien qui ouvre Wave. */
export async function paySubscriptionWave(requestId: string): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  try {
    const { ok, data } = await waveCall("abonnement", { requestId });
    if (ok && typeof data?.url === "string") return { ok: true, url: data.url };
    return { ok: false, message: typeof data?.message === "string" ? data.message : "Wave ne répond pas pour le moment. Réessaie." };
  } catch {
    return { ok: false, message: "Pas de connexion internet. Réessaie." };
  }
}

async function onlineCall(action: "creer" | "verifier", body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> | null }> {
  const { data } = await supabase.auth.getSession();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/paiement/paydunya/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify(body),
  });
  return { ok: response.ok, data: (await response.json().catch(() => null)) as Record<string, unknown> | null };
}

/** Paiement en ligne (PayDunya : Wave, Orange Money, Free Money, carte) : renvoie la page de paiement. */
export async function payOnline(requestId: string): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  try {
    const { ok, data } = await onlineCall("creer", { requestId });
    if (ok && typeof data?.url === "string") return { ok: true, url: data.url };
    return { ok: false, message: typeof data?.message === "string" ? data.message : "Le paiement en ligne ne répond pas pour le moment. Réessaie." };
  } catch {
    return { ok: false, message: "Pas de connexion internet. Réessaie." };
  }
}

export async function checkOnline(requestId: string): Promise<"active" | "en_attente" | "refusee"> {
  try {
    const { data } = await onlineCall("verifier", { requestId });
    return data?.status === "active" ? "active" : data?.status === "refusee" ? "refusee" : "en_attente";
  } catch {
    return "en_attente";
  }
}

/** Après le paiement : demande à Wave si c'est payé (l'offre s'active alors toute seule). */
export async function checkSubscriptionWave(requestId: string): Promise<"active" | "en_attente" | "refusee"> {
  try {
    const { data } = await waveCall("abonnement-check", { requestId });
    return data?.status === "active" ? "active" : data?.status === "refusee" ? "refusee" : "en_attente";
  } catch {
    return "en_attente";
  }
}

/** Paiement Wave manuel : « J'ai payé » → CFC reçoit une notification pour vérifier et activer. */
export async function declarePaid(requestId: string, transaction: string): Promise<boolean> {
  const { error } = await supabase.rpc("declare_subscription_paid", { p_request: requestId, p_transaction: transaction });
  return !error;
}

export async function myRequests(shopId: string): Promise<SubscriptionRequest[]> {
  const { data } = await supabase.from("subscription_requests").select("id, plan, months, amount, reference, status, created_at, declared_at, paid_at, paid_via, transaction_id, receipt_url").eq("shop_id", shopId).order("created_at", { ascending: false }).limit(20);
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

/** Prix d'une offre ramené à la journée (30 jours), arrondi à 5 F : « 4 000 F par mois = 135 F par jour ». */
export function perDay(monthly: number): number {
  return Math.ceil(monthly / 30 / 5) * 5;
}

export type ValueRecap = { ventes: number; montant: number; clients: number; dettes: number; jours: number };

/**
 * Ce que Jokko a déjà fait pour la boutique (30 derniers jours), calculé sur le téléphone :
 * montré au moment de choisir une offre, pour que le patron voie ce qu'il perdrait.
 */
export function valueRecap(shop: Pick<Shop, "sales" | "clients">, now = new Date()): ValueRecap {
  const since = now.getTime() - 30 * 86_400_000;
  const recent = shop.sales.filter((s) => new Date(s.at).getTime() >= since);
  const days = new Set(recent.map((s) => s.at.slice(0, 10)));
  return {
    ventes: recent.length,
    montant: recent.reduce((n, s) => n + (s.amount || 0), 0),
    clients: shop.clients.length,
    dettes: shop.clients.reduce((n, c) => n + Math.max(0, c.debt || 0), 0),
    jours: days.size,
  };
}
