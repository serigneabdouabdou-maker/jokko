// Jokko — paiements Wave Business (Checkout API).
//  POST /wave/checkout   (commerçant connecté, membre de la boutique) : crée un lien de paiement pour un montant.
//  POST /wave/check      (commerçant connecté) : redemande à Wave l'état d'un paiement (si le webhook tarde).
//  POST /wave/webhook/<boutique> (Wave) : confirmation signée du paiement → le paiement passe à « succeeded ».
// Les clés Wave de la boutique restent sur le serveur ; le téléphone ne peut jamais marquer un paiement « payé ».
import { createClient } from "npm:@supabase/supabase-js@2";

const WAVE = "https://api.wave.com";
const APP_URL = Deno.env.get("JOKKO_APP_URL") ?? "https://serigneabdouabdou-maker.github.io/jokko/";
const ALLOWED = (Deno.env.get("JOKKO_ORIGINS") ?? "https://serigneabdouabdou-maker.github.io,http://localhost:5173,http://localhost:4173").split(",").map((o) => o.trim());

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });

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

async function userOf(req: Request): Promise<string | null> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token || token.startsWith("sb_")) return null;
  try {
    const { data, error } = await authClient.auth.getClaims(token);
    const sub = data?.claims?.sub;
    return !error && data?.claims?.role === "authenticated" && typeof sub === "string" ? sub : null;
  } catch {
    return null;
  }
}

async function isMember(shopId: string, userId: string): Promise<boolean> {
  const { data } = await admin.from("shop_members").select("user_id").eq("shop_id", shopId).eq("user_id", userId).maybeSingle();
  return Boolean(data);
}

async function keysOf(shopId: string): Promise<{ api_key: string; webhook_secret: string } | null> {
  const { data } = await admin.rpc("wave_keys", { p_shop: shopId });
  return data && typeof data.api_key === "string" ? data : null;
}

const STATUS: Record<string, string> = { succeeded: "succeeded", cancelled: "cancelled" };

/** État Wave d'une session → état Jokko. */
function statusOf(session: { checkout_status?: string; payment_status?: string }): string {
  if (session.payment_status && STATUS[session.payment_status]) return STATUS[session.payment_status];
  if (session.checkout_status === "expired") return "expired";
  return "open";
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Signature Wave : t=<horodatage>,v1=<hex> ; HMAC-SHA256(secret, t + corps brut) ; moins de 5 minutes. */
async function validSignature(header: string, raw: string, secret: string): Promise<boolean> {
  const parts = header.split(",").map((p) => p.trim());
  const t = parts.find((p) => p.startsWith("t="))?.slice(2) ?? "";
  const signatures = parts.filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!t || !signatures.length || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = await hmacHex(secret, `${t}${raw}`);
  return signatures.some((s) => s.length === expected.length && s === expected);
}

async function checkout(req: Request) {
  const user = await userOf(req);
  if (!user) return send(req, 401, { error: "not_signed_in" });
  const body = await req.json().catch(() => null);
  const shopId = String(body?.shopId ?? "");
  const amount = Math.round(Number(body?.amount));
  const reference = String(body?.reference ?? "").slice(0, 120);
  const mobile = typeof body?.payerMobile === "string" && /^\+221[37]\d{8}$/.test(body.payerMobile) ? body.payerMobile : undefined;
  if (!shopId || !(amount > 0) || amount > 50_000_000) return send(req, 400, { error: "invalid_request" });
  if (!(await isMember(shopId, user))) return send(req, 403, { error: "forbidden" });
  const keys = await keysOf(shopId);
  if (!keys) return send(req, 409, { error: "wave_not_configured", message: "Wave n'est pas encore branché pour cette boutique (Réglages)." });

  const response = await fetch(`${WAVE}/v1/checkout/sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${keys.api_key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: String(amount),
      currency: "XOF",
      success_url: `${APP_URL}?wave=ok`,
      error_url: `${APP_URL}?wave=erreur`,
      client_reference: `${shopId}:${reference}`.slice(0, 255),
      ...(mobile ? { restrict_payer_mobile: mobile } : {}),
    }),
  });
  const session = await response.json().catch(() => null);
  if (!response.ok || !session?.id || !session?.wave_launch_url) {
    console.warn("[jokko] wave checkout", response.status, session?.code ?? "");
    const message = response.status === 401 ? "La clé Wave est refusée : vérifie-la dans Réglages." : "Wave ne répond pas pour le moment. Réessaie.";
    return send(req, 502, { error: "wave_error", message });
  }
  await admin.from("wave_payments").insert({ id: session.id, shop_id: shopId, amount, reference, launch_url: session.wave_launch_url, created_by: user });
  return send(req, 200, { id: session.id, url: session.wave_launch_url, expiresAt: session.when_expires ?? null });
}

async function check(req: Request) {
  const user = await userOf(req);
  if (!user) return send(req, 401, { error: "not_signed_in" });
  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");
  const { data: payment } = await admin.from("wave_payments").select("*").eq("id", id).maybeSingle();
  if (!payment || !(await isMember(payment.shop_id, user))) return send(req, 404, { error: "not_found" });
  if (payment.status !== "open") return send(req, 200, { status: payment.status });
  const keys = await keysOf(payment.shop_id);
  if (!keys) return send(req, 200, { status: payment.status });
  const response = await fetch(`${WAVE}/v1/checkout/sessions/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${keys.api_key}` } });
  const session = await response.json().catch(() => null);
  if (!response.ok || !session) return send(req, 200, { status: payment.status });
  const status = statusOf(session);
  if (status !== payment.status) {
    await admin.from("wave_payments").update({ status, transaction_id: session.transaction_id ?? null, completed_at: status === "succeeded" ? new Date().toISOString() : null }).eq("id", id);
  }
  return send(req, 200, { status });
}

async function webhook(req: Request, shopId: string) {
  const raw = await req.text();
  const keys = await keysOf(shopId);
  if (!keys) return new Response("unknown shop", { status: 404 });
  if (!(await validSignature(req.headers.get("wave-signature") ?? "", raw, keys.webhook_secret))) return new Response("bad signature", { status: 401 });
  const event = JSON.parse(raw);
  const data = event?.data ?? {};
  if (event?.type === "checkout.session.completed" && data.id) {
    // Le montant doit être celui demandé : Wave confirme, Jokko vérifie.
    const { data: payment } = await admin.from("wave_payments").select("amount").eq("id", data.id).eq("shop_id", shopId).maybeSingle();
    const paid = Math.round(Number(data.amount));
    const ok = payment && paid === Number(payment.amount) && (data.payment_status ?? "succeeded") === "succeeded";
    await admin.from("wave_payments").update({ status: ok ? "succeeded" : "failed", transaction_id: data.transaction_id ?? null, completed_at: new Date().toISOString() }).eq("id", data.id).eq("shop_id", shopId);
  } else if (event?.type === "checkout.session.payment_failed" && data.id) {
    await admin.from("wave_payments").update({ status: "failed" }).eq("id", data.id).eq("shop_id", shopId).eq("status", "open");
  }
  return new Response("ok");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const i = parts.indexOf("wave");
  const route = parts[i + 1];
  try {
    if (route === "checkout") return await checkout(req);
    if (route === "check") return await check(req);
    if (route === "webhook" && parts[i + 2]) return await webhook(req, decodeURIComponent(parts[i + 2]));
    return send(req, 404, { error: "not_found" });
  } catch (error) {
    console.warn("[jokko] wave:", error instanceof Error ? error.message : "erreur");
    return send(req, 500, { error: "internal_error" });
  }
});
