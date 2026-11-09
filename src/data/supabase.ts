import { createClient, type Session } from "@supabase/supabase-js";

/**
 * Connexion à Supabase. L'adresse et la clé publishable sont publiques par nature :
 * la sécurité vient des règles RLS de la base et de la connexion du commerçant.
 */
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://solocpbqtqlxdfpjiewm.supabase.co";
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_F4muHE1khamqagY3Qa1GuQ_lK91p252";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "jokko.auth" },
});

/** Boutique ouverte : le serveur compte les appels à Gemini pour elle (limites de l'offre). */
let assistantShop = "";
export function setAssistantShop(id: string) {
  assistantShop = id;
}

/** Appel d'une route Gemini de Jokko (fonction Supabase « assistant »), avec la session du commerçant. */
export async function api(route: "status" | "interpret" | "listen" | "live" | "order" | "advice" | "speak" | "stock", init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers = new Headers(init.headers);
  headers.set("apikey", SUPABASE_KEY);
  headers.set("Accept", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (assistantShop) headers.set("x-jokko-shop", assistantShop);
  const response = await fetch(`${SUPABASE_URL}/functions/v1/assistant/${route}`, { ...init, headers });
  if (response.status === 402) {
    void response.clone().json().then((b: { reason?: string; tier?: string; kind?: string } | null) => announceQuota({ reason: b?.reason, tier: b?.tier, kind: b?.kind, route }), () => undefined);
  }
  return response;
}

/** Le serveur a refusé un appel à Jokko (forfait) : l'appli le dit à voix haute et propose les offres. */
export const QUOTA_EVENT = "jokko:forfait";
export type QuotaDetail = { reason?: string; tier?: string; kind?: string; route?: string };
function announceQuota(detail: QuotaDetail) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<QuotaDetail>(QUOTA_EVENT, { detail }));
}

/** Ce qu'il reste de l'essai gratuit, par type (null hors essai). */
export type TrialLeft = Record<"echange" | "vocal" | "texte" | "conseil", { total: number; reste: number }>;
export async function trialLeft(shopId: string): Promise<TrialLeft | null> {
  const { data, error } = await supabase.rpc("trial_left", { p_shop: shopId });
  return error || !data ? null : (data as TrialLeft);
}

/** Cahier des erreurs : une action, une annulation ou un « Jokko s'est trompé ». Hors ligne : on laisse tomber. */
export function noteAssistant(shopId: string, lang: "wo" | "fr", kind: "action" | "annule" | "signale", said = "", understood = "") {
  if (!shopId || shopId.startsWith("demo")) return;
  void supabase
    .rpc("note_assistant", { p_shop: shopId, p_lang: lang, p_kind: kind, p_said: said.slice(0, 240), p_understood: understood.slice(0, 240) })
    .then(() => undefined, () => undefined);
}

// ---------- Connexion : numéro de téléphone + code secret à 6 chiffres ----------

export type AuthOutcome =
  | { ok: true; session: Session; created: boolean }
  | { ok: false; reason: "wrong_code" | "locked" | "invalid" | "network" | "exists"; message: string };

/** 77 123 45 67 → 221771234567 */
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 9) digits = `221${digits}`;
  return /^221[37]\d{8}$/.test(digits) ? digits : null;
}

/** Numéro WhatsApp de l'assistance Jokko (code oublié, compte bloqué). */
export const SUPPORT_PHONE = "77 567 47 25";

// ---------- Parcours des vrais commerçants (console CFC, onglet Santé) ----------
// Chaque tentative de connexion, d'inscription, d'envoi de SMS ou de code oublié est notée : l'étape, le résultat
// et le code de réponse. Jamais le numéro ni le code. Sans internet, la note attend sur le téléphone et part plus tard.
export type AuthStep = "connexion" | "inscription" | "sms" | "code_oublie";
export type AuthResult = "ok" | "code_faux" | "bloque" | "existe" | "saisie" | "trop_essais" | "panne_serveur" | "sms_echec" | "reseau";
const AUTH_QUEUE = "jokko.parcours";

export function noteAuth(step: AuthStep, result: AuthResult, status?: number): void {
  let queue: [AuthStep, AuthResult, number | null][] = [];
  try {
    queue = JSON.parse(localStorage.getItem(AUTH_QUEUE) ?? "[]");
  } catch {
    queue = [];
  }
  queue = [...queue, [step, result, status ?? null] as [AuthStep, AuthResult, number | null]].slice(-20);
  const save = (q: typeof queue) => {
    try {
      if (q.length) localStorage.setItem(AUTH_QUEUE, JSON.stringify(q));
      else localStorage.removeItem(AUTH_QUEUE);
    } catch {
      /* rien */
    }
  };
  save(queue);
  void (async () => {
    const left = [...queue];
    while (left.length) {
      const [s, r, st] = left[0];
      const { error } = await supabase.rpc("note_auth", { p_step: s, p_result: r, p_status: st });
      if (error) break;
      left.shift();
    }
    save(left);
  })().catch(() => undefined);
}

function checkInput(rawPhone: string, code: string): { phone: string } | AuthOutcome {
  const phone = normalizePhone(rawPhone);
  if (!phone) return { ok: false, reason: "invalid", message: "Numéro sénégalais invalide (ex. 77 123 45 67)." };
  if (!/^\d{6}$/.test(code)) return { ok: false, reason: "invalid", message: "Le code secret fait 6 chiffres." };
  return { phone };
}

/**
 * Me connecter : numéro + code secret. Passe par la fonction serveur « login », qui bloque le numéro
 * après 5 codes faux (15 min), 10 (1 h), 15 (24 h).
 */
export async function signIn(rawPhone: string, code: string): Promise<AuthOutcome> {
  const input = checkInput(rawPhone, code);
  if (!("phone" in input)) return input;
  return login(input.phone, code, false);
}

async function login(phone: string, code: string, created: boolean): Promise<AuthOutcome> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      body: JSON.stringify({ phone, code }),
    });
    const body = (await response.json().catch(() => null)) as { access_token?: string; refresh_token?: string; error?: string; left?: number; minutes?: number } | null;
    if (response.ok && body?.access_token && body.refresh_token) {
      const { data, error } = await supabase.auth.setSession({ access_token: body.access_token, refresh_token: body.refresh_token });
      if (data.session && !error) {
        noteAuth("connexion", "ok", response.status);
        return { ok: true, session: data.session, created };
      }
      noteAuth("connexion", "panne_serveur", response.status);
      return { ok: false, reason: "network", message: "Connexion impossible pour le moment. Réessaie." };
    }
    if (response.status === 423 || body?.error === "locked") {
      noteAuth("connexion", "bloque", response.status);
      return { ok: false, reason: "locked", message: lockedMessage(body?.minutes ?? 15) };
    }
    if (response.status === 401) {
      noteAuth("connexion", "code_faux", 401);
      const left = body?.left ?? 0;
      const warn = left > 0 && left <= 3 ? ` Attention : encore ${left} essai${left > 1 ? "s" : ""}, puis le compte est bloqué un moment.` : "";
      return { ok: false, reason: "wrong_code", message: `Numéro ou code secret incorrect.${warn} Pas encore de compte ? Touche « Créer mon compte ».` };
    }
    if (response.status === 429) {
      noteAuth("connexion", "trop_essais", 429);
      return { ok: false, reason: "network", message: "Trop d’essais depuis ce réseau. Réessaie dans 10 minutes." };
    }
    noteAuth("connexion", "panne_serveur", response.status);
    return { ok: false, reason: "network", message: "Connexion impossible pour le moment. Réessaie." };
  } catch {
    noteAuth("connexion", "reseau");
    return { ok: false, reason: "network", message: "Pas de connexion internet. Réessaie." };
  }
}

/** Compte bloqué après trop de codes faux. */
export function lockedMessage(minutes: number): string {
  const wait = minutes >= 120 ? `${Math.round(minutes / 60)} heures` : minutes >= 60 ? "1 heure" : `${minutes} minutes`;
  return `Trop de codes faux : par sécurité, ce compte est bloqué pendant ${wait}. Code oublié ? Écris sur WhatsApp au ${SUPPORT_PHONE}.`;
}

/** Créer mon compte : numéro + code secret, avec les conditions acceptées (version datée). */
export async function signUp(rawPhone: string, code: string, termsVersion: string, otp = ""): Promise<AuthOutcome> {
  const input = checkInput(rawPhone, code);
  if (!("phone" in input)) return input;
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      body: JSON.stringify({ phone: input.phone, code, terms: termsVersion, ...(otp ? { otp } : {}) }),
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    const user = response.status === 409 || body?.error === "exists" ? "existe" : body?.error === "weak_code" || body?.error === "terms_required" || body?.error?.startsWith("otp_") ? "saisie" : null;
    noteAuth("inscription", response.ok ? "ok" : user ?? (response.status === 429 ? "trop_essais" : "panne_serveur"), response.status);
    if (response.status === 409 || body?.error === "exists") {
      return { ok: false, reason: "exists", message: "Ce numéro a déjà un compte. Touche « Me connecter » et mets ton code secret." };
    }
    if (body?.error === "weak_code") return { ok: false, reason: "invalid", message: "Code trop facile à deviner. Choisis 6 chiffres différents." };
    if (body?.error?.startsWith("otp_")) return { ok: false, reason: "invalid", message: otpMessage(body.error) };
    if (body?.error === "terms_required") return { ok: false, reason: "invalid", message: "Coche la case des conditions pour créer ton compte." };
    if (response.status === 429) return { ok: false, reason: "network", message: "Trop d’essais. Réessaie dans une heure." };
    if (!response.ok) return { ok: false, reason: "network", message: "Inscription impossible pour le moment. Réessaie." };
    const entered = await login(input.phone, code, true);
    return entered.ok ? entered : { ok: false, reason: "network", message: "Compte créé. Touche « Me connecter » pour entrer." };
  } catch {
    noteAuth("inscription", "reseau");
    return { ok: false, reason: "network", message: "Pas de connexion internet. Réessaie." };
  }
}

// ---------- Codes reçus par SMS : vérifier le numéro à l'inscription, code oublié ----------

async function otpCall(payload: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> | null }> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    body: JSON.stringify(payload),
  });
  return { status: response.status, body: (await response.json().catch(() => null)) as Record<string, unknown> | null };
}

/** L'envoi de codes par SMS est-il branché ? (sinon : inscription sans vérification, code oublié par WhatsApp) */
export async function smsAvailable(): Promise<boolean> {
  try {
    return (await otpCall({ action: "status" })).body?.sms === true;
  } catch {
    return false;
  }
}

function otpMessage(error: unknown): string {
  switch (error) {
    case "otp_expire": return "Ce code SMS a expiré. Touche « Renvoyer le code ».";
    case "otp_trop": return "Trop d’erreurs sur le code SMS. Touche « Renvoyer le code ».";
    case "otp_absent": return "Demande d’abord un code par SMS.";
    case "otp_required": return "Mets le code reçu par SMS.";
    default: return "Code SMS incorrect. Vérifie le message reçu.";
  }
}

export type OtpPurpose = "inscription" | "oubli";

/** Envoie un code à 6 chiffres par SMS. Renvoie null si c'est parti, sinon le message à afficher. */
export async function sendOtp(rawPhone: string, purpose: OtpPurpose): Promise<string | null> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return "Numéro sénégalais invalide (ex. 77 123 45 67).";
  try {
    const { status, body } = await otpCall({ action: "send", phone, purpose });
    noteAuth("sms", status === 200 ? "ok" : status === 409 ? "existe" : status === 429 || body?.error === "daily" ? "trop_essais" : "sms_echec", status);
    if (status === 200) return null;
    if (status === 409) return "Ce numéro a déjà un compte. Touche « Me connecter ».";
    if (body?.error === "daily") return `Trop de codes envoyés aujourd’hui à ce numéro. Réessaie demain, ou écris sur WhatsApp au ${SUPPORT_PHONE}.`;
    if (status === 429) return `Attends ${Number(body?.seconds ?? 60)} secondes avant de redemander un code.`;
    return `Le SMS n’a pas pu partir. Réessaie dans un instant, ou écris sur WhatsApp au ${SUPPORT_PHONE}.`;
  } catch {
    noteAuth("sms", "reseau");
    return "Pas de connexion internet. Réessaie.";
  }
}

/** Code oublié : code reçu par SMS + nouveau code secret, puis connexion. */
export async function resetCode(rawPhone: string, otp: string, code: string): Promise<AuthOutcome> {
  const input = checkInput(rawPhone, code);
  if (!("phone" in input)) return input;
  try {
    const { status, body } = await otpCall({ action: "reset", phone: input.phone, otp, code });
    const userError = body?.error === "weak_code" || (typeof body?.error === "string" && body.error.startsWith("otp_"));
    noteAuth("code_oublie", status === 200 ? "ok" : userError ? "saisie" : "panne_serveur", status);
    if (status === 200) return login(input.phone, code, false);
    if (body?.error === "weak_code") return { ok: false, reason: "invalid", message: "Code trop facile à deviner. Choisis 6 chiffres différents." };
    if (typeof body?.error === "string" && body.error.startsWith("otp_")) return { ok: false, reason: "invalid", message: otpMessage(body.error) };
    return { ok: false, reason: "network", message: "Impossible pour le moment. Réessaie." };
  } catch {
    noteAuth("code_oublie", "reseau");
    return { ok: false, reason: "network", message: "Pas de connexion internet. Réessaie." };
  }
}

/** Accepter les conditions (comptes créés avant leur arrivée, ou nouvelle version). */
export async function acceptTerms(userId: string, phone: string, termsVersion: string): Promise<boolean> {
  const { error } = await supabase
    .from("profiles")
    .upsert({ user_id: userId, phone, terms_version: termsVersion, terms_accepted_at: new Date().toISOString() }, { onConflict: "user_id" });
  return !error;
}

export function phoneOf(session: Session | null): string {
  return session?.user.email?.split("@")[0] ?? "";
}

/** Conversation en direct coupée par Google (crédit épuisé, quota…) : signalée à la console, onglet Santé. */
export function noteLiveFailure(code: number, reason: string) {
  if (!assistantShop) return;
  void supabase.rpc("note_live_failure", { p_shop: assistantShop, p_code: code, p_reason: reason.slice(0, 300) }).then(() => undefined, () => undefined);
}

/** Un échange en direct avec Jokko : compté sur le serveur ; au-delà de la limite du jour, la conversation est coupée. */
export function countLiveExchange() {
  if (!assistantShop) return;
  void supabase.rpc("use_assistant", { p_shop: assistantShop, p_kind: "echange" }).then(
    ({ data }) => {
      const q = data as { ok?: boolean; reason?: string; tier?: string } | null;
      // Limite atteinte au milieu d'une conversation : l'appli la coupe et le dit (essai fini, échanges du jour, pause).
      if (q?.ok === false && (q.reason === "essai" || q.reason === "echanges" || q.reason === "pause" || q.reason === "budget")) announceQuota({ reason: q.reason, tier: q.tier, kind: "echange", route: "echange" });
    },
    () => undefined,
  );
}
