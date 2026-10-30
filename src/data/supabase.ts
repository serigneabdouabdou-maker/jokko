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
export async function api(route: "status" | "interpret" | "listen" | "live", init: RequestInit = {}): Promise<Response> {
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
  | { ok: false; reason: "wrong_code" | "invalid" | "network"; message: string };

/** 77 123 45 67 → 221771234567 */
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 9) digits = `221${digits}`;
  return /^221[37]\d{8}$/.test(digits) ? digits : null;
}

const emailOf = (phone: string) => `${phone}@tel.jokko.app`;
const passwordOf = (code: string) => `jokko-${code}`;

/** Connexion ; si le numéro est nouveau, crée le compte puis connecte. */
export async function signInOrUp(rawPhone: string, code: string): Promise<AuthOutcome> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return { ok: false, reason: "invalid", message: "Numéro sénégalais invalide (ex. 77 123 45 67)." };
  if (!/^\d{6}$/.test(code)) return { ok: false, reason: "invalid", message: "Le code secret fait 6 chiffres." };

  const login = () => supabase.auth.signInWithPassword({ email: emailOf(phone), password: passwordOf(code) });
  try {
    const first = await login();
    if (first.data.session) return { ok: true, session: first.data.session, created: false };

    const response = await fetch(`${SUPABASE_URL}/functions/v1/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      body: JSON.stringify({ phone, code }),
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (response.status === 409 || body?.error === "exists") {
      return { ok: false, reason: "wrong_code", message: "Ce numéro a déjà un compte, et le code n’est pas le bon." };
    }
    if (body?.error === "weak_code") {
      return { ok: false, reason: "invalid", message: "Code trop facile à deviner. Choisis 6 chiffres différents." };
    }
    if (response.status === 429) return { ok: false, reason: "network", message: "Trop d’essais. Réessaie dans une heure." };
    if (!response.ok) return { ok: false, reason: "network", message: "Inscription impossible pour le moment. Réessaie." };

    const second = await login();
    if (second.data.session) return { ok: true, session: second.data.session, created: true };
    return { ok: false, reason: "network", message: "Connexion impossible pour le moment. Réessaie." };
  } catch {
    return { ok: false, reason: "network", message: "Pas de connexion internet. Réessaie." };
  }
}

export function phoneOf(session: Session | null): string {
  return session?.user.email?.split("@")[0] ?? "";
}
