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

/** Appel d'une route Gemini de Jokko (fonction Supabase « assistant »), avec la session du commerçant. */
export async function api(route: "status" | "interpret" | "listen" | "live" | "order" | "advice" | "speak", init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers = new Headers(init.headers);
  headers.set("apikey", SUPABASE_KEY);
  headers.set("Accept", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${SUPABASE_URL}/functions/v1/assistant/${route}`, { ...init, headers });
}

// ---------- Connexion : numéro de téléphone + code secret à 6 chiffres ----------

export type AuthOutcome =
  | { ok: true; session: Session; created: boolean }
  | { ok: false; reason: "wrong_code" | "invalid" | "network" | "exists"; message: string };

/** 77 123 45 67 → 221771234567 */
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 9) digits = `221${digits}`;
  return /^221[37]\d{8}$/.test(digits) ? digits : null;
}

const emailOf = (phone: string) => `${phone}@tel.jokko.app`;
const passwordOf = (code: string) => `jokko-${code}`;

function checkInput(rawPhone: string, code: string): { phone: string } | AuthOutcome {
  const phone = normalizePhone(rawPhone);
  if (!phone) return { ok: false, reason: "invalid", message: "Numéro sénégalais invalide (ex. 77 123 45 67)." };
  if (!/^\d{6}$/.test(code)) return { ok: false, reason: "invalid", message: "Le code secret fait 6 chiffres." };
  return { phone };
}

/** Me connecter : numéro + code secret d'un compte qui existe déjà. */
export async function signIn(rawPhone: string, code: string): Promise<AuthOutcome> {
  const input = checkInput(rawPhone, code);
  if (!("phone" in input)) return input;
  try {
    const { data } = await supabase.auth.signInWithPassword({ email: emailOf(input.phone), password: passwordOf(code) });
    if (data.session) return { ok: true, session: data.session, created: false };
    return { ok: false, reason: "wrong_code", message: "Numéro ou code secret incorrect. Pas encore de compte ? Touche « Créer mon compte »." };
  } catch {
    return { ok: false, reason: "network", message: "Pas de connexion internet. Réessaie." };
  }
}

/** Créer mon compte : numéro + code secret, avec les conditions acceptées (version datée). */
export async function signUp(rawPhone: string, code: string, termsVersion: string): Promise<AuthOutcome> {
  const input = checkInput(rawPhone, code);
  if (!("phone" in input)) return input;
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      body: JSON.stringify({ phone: input.phone, code, terms: termsVersion }),
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (response.status === 409 || body?.error === "exists") {
      return { ok: false, reason: "exists", message: "Ce numéro a déjà un compte. Touche « Me connecter » et mets ton code secret." };
    }
    if (body?.error === "weak_code") return { ok: false, reason: "invalid", message: "Code trop facile à deviner. Choisis 6 chiffres différents." };
    if (body?.error === "terms_required") return { ok: false, reason: "invalid", message: "Coche la case des conditions pour créer ton compte." };
    if (response.status === 429) return { ok: false, reason: "network", message: "Trop d’essais. Réessaie dans une heure." };
    if (!response.ok) return { ok: false, reason: "network", message: "Inscription impossible pour le moment. Réessaie." };
    const { data } = await supabase.auth.signInWithPassword({ email: emailOf(input.phone), password: passwordOf(code) });
    if (data.session) return { ok: true, session: data.session, created: true };
    return { ok: false, reason: "network", message: "Compte créé. Touche « Me connecter » pour entrer." };
  } catch {
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
