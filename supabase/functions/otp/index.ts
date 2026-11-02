// Jokko — codes de vérification par SMS (API SMS d'Orange Sénégal).
//  { action: "status" }                         → { sms: true/false } : l'envoi de SMS est-il branché ?
//  { action: "send", phone, purpose }           → envoie un code à 6 chiffres (inscription | oubli), 1/min et 3/jour par numéro.
//  { action: "reset", phone, otp, code }        → code oublié : vérifie le code SMS et met le nouveau code secret.
// Les clés Orange (ORANGE_CLIENT_ID, ORANGE_CLIENT_SECRET) sont des secrets Supabase posés par le patron lui-même.
// Tant qu'elles manquent, rien n'est envoyé et l'inscription marche comme avant (sans vérification).
import { createClient } from "npm:@supabase/supabase-js@2";

const DEFAULT_ORIGINS = ["https://jokkoapp.com", "https://www.jokkoapp.com", "https://jokko.serigneabdouabdou.workers.dev", "https://serigneabdouabdou-maker.github.io", "http://localhost:5173", "http://localhost:4173"];
const ALLOWED = ([...new Set([...DEFAULT_ORIGINS, ...(Deno.env.get("JOKKO_ORIGINS") ?? "").split(",")])].filter(Boolean).join(",")).split(",").map((o) => o.trim());
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const ORANGE = "https://api.orange.com";
const SENDER = "tel:+2210000"; // numéro d'envoi d'Orange pour le Sénégal
const ipHits = new Map<string, number[]>();
let pepper: string | null = null;
let token: { value: string; until: number } | null = null;

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

const smsReady = () => Boolean(Deno.env.get("ORANGE_CLIENT_ID")?.trim() && Deno.env.get("ORANGE_CLIENT_SECRET")?.trim());

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
const otpHash = (phone: string, purpose: string, otp: string) => hmac(`otp:${phone}:${purpose}:${otp}`);
const passwordOf = async (phone: string, code: string) => `jk1-${await hmac(`${phone}:${code}`)}`;

async function orangeToken(): Promise<string> {
  if (token && token.until > Date.now()) return token.value;
  const basic = btoa(`${Deno.env.get("ORANGE_CLIENT_ID")!.trim()}:${Deno.env.get("ORANGE_CLIENT_SECRET")!.trim()}`);
  const res = await fetch(`${ORANGE}/oauth/v3/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(10_000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.access_token) throw new Error(`jeton Orange refusé (${res.status})`);
  token = { value: json.access_token, until: Date.now() + (Number(json.expires_in ?? 3600) - 120) * 1000 };
  return token.value;
}

async function sendSms(phone: string, text: string): Promise<boolean> {
  const bearer = await orangeToken();
  const senderName = Deno.env.get("ORANGE_SENDER_NAME")?.trim();
  const res = await fetch(`${ORANGE}/smsmessaging/v1/outbound/${encodeURIComponent(SENDER)}/requests`, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      outboundSMSMessageRequest: {
        address: `tel:+${phone}`,
        senderAddress: SENDER,
        ...(senderName ? { senderName } : {}),
        outboundSMSTextMessage: { message: text },
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    if (res.status === 401) token = null;
    console.warn("[jokko] otp: SMS refusé par Orange", res.status, (await res.text().catch(() => "")).slice(0, 200));
  }
  return res.ok;
}

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
      const otp = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
      const { data: stored } = await admin.rpc("otp_store", { p_phone: phone, p_purpose: purpose, p_hash: await otpHash(phone, purpose, otp) });
      if (!stored?.ok) return send(req, 429, { error: stored?.reason === "daily" ? "daily" : "wait", seconds: stored?.seconds ?? 60 });
      const ok = await sendSms(phone, `Jokko : ton code de verification est ${otp}. Valable 10 minutes. Ne le donne a personne.`).catch((e) => {
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
      const result = await admin.rpc("otp_consume", { p_phone: phone, p_purpose: "oubli", p_hash: await otpHash(phone, "oubli", otp) });
      if (result.data !== "ok") return send(req, 400, { error: `otp_${result.data ?? "faux"}` });
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
