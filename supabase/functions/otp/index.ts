// Jokko — codes de vérification par SMS, via Twilio Verify.
//  { action: "status" }                         → { sms: true/false } : l'envoi de SMS est-il branché ?
//  { action: "send", phone, purpose }           → envoie un code à 6 chiffres (inscription | oubli), 1/min et 3/jour par numéro.
//  { action: "reset", phone, otp, code }        → code oublié : vérifie le code SMS (chez Twilio) et met le nouveau code secret.
// Twilio génère, envoie et vérifie le code ; Jokko garde seulement le garde-fou par numéro (coût) et par adresse.
// Secrets Supabase posés par le patron lui-même : TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE (le SID du service « Jokko », commence par VA).
// Tant qu'ils manquent, rien n'est envoyé et l'inscription marche comme avant (sans vérification).
import { createClient } from "npm:@supabase/supabase-js@2";

const DEFAULT_ORIGINS = ["https://jokkoapp.com", "https://www.jokkoapp.com", "https://jokko.serigneabdouabdou.workers.dev", "https://serigneabdouabdou-maker.github.io", "http://localhost:5173", "http://localhost:4173"];
const ALLOWED = ([...new Set([...DEFAULT_ORIGINS, ...(Deno.env.get("JOKKO_ORIGINS") ?? "").split(",")])].filter(Boolean).join(",")).split(",").map((o) => o.trim());
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const ipHits = new Map<string, number[]>();
let pepper: string | null = null;

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED.includes(origin) ? origin : ALLOWED[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}
const send = (req: Request, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors(req) } });

function ipLimited(req: Request, max: number): boolean {
  const ip = (req.headers.get("x-forwarded-for") ?? "inconnue").split(",")[0].trim();
  const now = Date.now();
  const recent = (ipHits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  recent.push(now);
  ipHits.set(ip, recent);
  return recent.length > max;
}

// ---------- Twilio Verify ----------
function twilio() {
  return {
    sid: Deno.env.get("TWILIO_ACCOUNT_SID")?.trim() ?? "",
    token: Deno.env.get("TWILIO_AUTH_TOKEN")?.trim() ?? "",
    service: Deno.env.get("TWILIO_VERIFY_SERVICE")?.trim() ?? "",
  };
}
const smsReady = () => {
  const t = twilio();
  return Boolean(t.sid && t.token && t.service);
};

/** Demande à Twilio d'envoyer un code au numéro (canal SMS). true si c'est parti. */
async function verifyStart(phone: string): Promise<boolean> {
  const t = twilio();
  const res = await fetch(`https://verify.twilio.com/v2/Services/${encodeURIComponent(t.service)}/Verifications`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${t.sid}:${t.token}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: `+${phone}`, Channel: "sms", Locale: "fr" }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) console.warn("[jokko] otp: Twilio verify refusé", res.status, (await res.text().catch(() => "")).slice(0, 200));
  return res.ok;
}

/** Demande à Twilio si le code tapé est le bon. true seulement si « approved ». */
async function verifyCheck(phone: string, otp: string): Promise<boolean> {
  const t = twilio();
  const res = await fetch(`https://verify.twilio.com/v2/Services/${encodeURIComponent(t.service)}/VerificationCheck`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${t.sid}:${t.token}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: `+${phone}`, Code: otp }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) return false; // 404 = aucun code en cours pour ce numéro
  const json = await res.json().catch(() => null);
  return json?.status === "approved";
}

async function hmac(message: string): Promise<string> {
  if (!pepper) {
    const { data, error } = await admin.rpc("login_pepper");
    if (error || typeof data !== "string" || !data) throw new Error("secret de connexion manquant");
    pepper = data;
  }
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const passwordOf = async (phone: string, code: string) => `jk1-${await hmac(`${phone}:${code}`)}`;

async function userIdOf(phone: string): Promise<string | null> {
  const { data } = await admin.from("profiles").select("user_id").eq("phone", phone).maybeSingle();
  if (data?.user_id) return data.user_id as string;
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return list?.users.find((u) => u.email === `${phone}@tel.jokko.app`)?.id ?? null;
}

const weak = (code: string) => /^(\d)\1{5}$/.test(code) || code === "123456" || code === "654321";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return send(req, 405, { error: "method_not_allowed" });
  const body = await req.json().catch(() => null);
  const action = String(body?.action ?? "");
  if (action === "status") return send(req, 200, { sms: smsReady() });

  const phone = String(body?.phone ?? "");
  if (!/^221[37]\d{8}$/.test(phone)) return send(req, 400, { error: "invalid_request" });

  try {
    if (action === "send") {
      const purpose = String(body?.purpose ?? "");
      if (purpose !== "inscription" && purpose !== "oubli") return send(req, 400, { error: "invalid_request" });
      if (!smsReady()) return send(req, 503, { error: "sms_off" });
      if (ipLimited(req, 20)) return send(req, 429, { error: "too_many_requests" });
      const exists = Boolean(await userIdOf(phone));
      if (purpose === "inscription" && exists) return send(req, 409, { error: "exists" });
      // Code oublié pour un numéro inconnu : on répond comme si c'était parti (on ne dit pas qui a un compte).
      if (purpose === "oubli" && !exists) return send(req, 200, { ok: true });
      // Garde-fou par numéro (protège le crédit Twilio) : 1 code par minute, 3 par jour. Twilio garde le code lui-même.
      const { data: stored } = await admin.rpc("otp_store", { p_phone: phone, p_purpose: purpose, p_hash: "twilio-verify" });
      if (!stored?.ok) return send(req, 429, { error: stored?.reason === "daily" ? "daily" : "wait", seconds: stored?.seconds ?? 60 });
      const ok = await verifyStart(phone).catch((e) => {
        console.warn("[jokko] otp:", e instanceof Error ? e.message : "erreur");
        return false;
      });
      if (!ok) {
        await admin.rpc("otp_unsend", { p_phone: phone, p_purpose: purpose });
        return send(req, 502, { error: "sms_failed" });
      }
      return send(req, 200, { ok: true });
    }

    if (action === "reset") {
      const otp = String(body?.otp ?? "");
      const code = String(body?.code ?? "");
      if (!/^\d{6}$/.test(otp) || !/^\d{6}$/.test(code)) return send(req, 400, { error: "invalid_request" });
      if (weak(code)) return send(req, 400, { error: "weak_code" });
      if (!(await verifyCheck(phone, otp))) return send(req, 400, { error: "otp_faux" });
      const id = await userIdOf(phone);
      if (!id) return send(req, 400, { error: "otp_faux" });
      const { error } = await admin.auth.admin.updateUserById(id, { password: await passwordOf(phone, code) });
      if (error) return send(req, 500, { error: "internal_error" });
      await admin.rpc("login_guard_ok", { p_phone: phone }); // le blocage saute : il a prouvé que c'est son numéro
      return send(req, 200, { ok: true });
    }

    return send(req, 404, { error: "not_found" });
  } catch (error) {
    console.warn("[jokko] otp:", error instanceof Error ? error.message : "erreur");
    return send(req, 500, { error: "internal_error" });
  }
});
