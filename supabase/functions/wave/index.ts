// Jokko — paiements Wave Business (Checkout API).
//  POST /wave/checkout   (commerçant connecté, membre de la boutique) : crée un lien de paiement pour un montant.
//  POST /wave/check      (commerçant connecté) : redemande à Wave l'état d'un paiement (si le webhook tarde).
//  POST /wave/webhook/<boutique> (Wave) : confirmation signée du paiement → le paiement passe à « succeeded ».
//  POST /wave/abonnement        (patron connecté) : paiement Wave de son abonnement Jokko, sur le compte Wave Business de CFC.
//  POST /wave/abonnement-check  (patron connecté) : redemande l'état à Wave (si la confirmation tarde) ; active si payé.
//  POST /wave/webhook/cfc       (Wave) : confirmation signée → l'offre s'active toute seule, sans intervention de CFC.
// Les clés Wave de la boutique restent sur le serveur ; le téléphone ne peut jamais marquer un paiement « payé ».
import { createClient } from "npm:@supabase/supabase-js@2";

const WAVE = "https://api.wave.com";
// Adresse de l'appli où Wave renvoie le client après paiement.
const APP_URL = "https://jokkoapp.com/";
// Adresses autorisées à appeler la fonction : jokkoapp.com (Cloudflare), l'ancienne adresse GitHub, et le poste de dev.
const DEFAULT_ORIGINS = ["https://jokkoapp.com", "https://www.jokkoapp.com", "https://jokko.serigneabdouabdou.workers.dev", "https://serigneabdouabdou-maker.github.io", "http://localhost:5173", "http://localhost:4173"];
const ALLOWED = ([...new Set([...DEFAULT_ORIGINS, ...(Deno.env.get("JOKKO_ORIGINS") ?? "").split(",")])].filter(Boolean).join(",")).split(",").map((o) => o.trim());

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

// ---------- Abonnements Jokko payés à CFC (activation automatique) ----------

async function cfcKeys(): Promise<{ api_key: string; webhook_secret: string } | null> {
  const { data } = await admin.rpc("cfc_wave_keys");
  return data && typeof data.api_key === "string" ? data : null;
}

async function isPatron(shopId: string, userId: string): Promise<boolean> {
  const { data } = await admin.from("shop_members").select("role").eq("shop_id", shopId).eq("user_id", userId).maybeSingle();
  return data?.role === "patron";
}

/** Prévient l'équipe CFC (notification) qu'un abonnement vient d'être payé et activé. */
async function tellCfc(result: { shop?: string; plan?: string; months?: number; amount?: number }) {
  try {
    const { data: cfg } = await admin.rpc("notify_config");
    const { data: shop } = await admin.from("shops").select("name").eq("id", result.shop ?? "").maybeSingle();
    if (!cfg?.notify_secret) return;
    const label = result.plan === "avance" ? "Avancé" : "Médium";
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-jokko-notify": cfg.notify_secret },
      body: JSON.stringify({ kind: "cfc", title: "Paiement Wave reçu ✓", body: `${shop?.name ?? "Une boutique"} : ${label} ${result.months} mois, ${result.amount} F. Offre activée.` }),
    });
  } catch {
    // la notification n'est qu'un confort : l'offre est déjà activée
  }
}

async function activate(sessionId: string, amount: number, transaction: string) {
  const { data } = await admin.rpc("activate_paid_subscription", { p_session: sessionId, p_amount: amount, p_transaction: transaction });
  if (data?.ok && !data.already) await tellCfc(data);
  return data as { ok: boolean; reason?: string } | null;
}

async function subscriptionCheckout(req: Request) {
  const user = await userOf(req);
  if (!user) return send(req, 401, { error: "not_signed_in" });
  const body = await req.json().catch(() => null);
  const { data: r } = await admin.from("subscription_requests").select("*").eq("id", String(body?.requestId ?? "")).maybeSingle();
  if (!r || !(await isPatron(r.shop_id, user))) return send(req, 404, { error: "not_found" });
  if (r.status !== "en_attente") return send(req, 409, { error: "already", status: r.status });
  const keys = await cfcKeys();
  if (!keys) return send(req, 409, { error: "wave_not_configured" });
  const phone = String(r.payer_phone ?? "").replace(/\D/g, "");
  const local = phone.startsWith("221") ? phone.slice(3) : phone;
  const mobile = /^[37]\d{8}$/.test(local) ? `+221${local}` : undefined;
  const response = await fetch(`${WAVE}/v1/checkout/sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${keys.api_key}`, "Content-Type": "application/json", "Idempotency-Key": `abo-${r.id}-${Math.floor(Date.now() / 600_000)}` },
    body: JSON.stringify({
      amount: String(r.amount),
      currency: "XOF",
      success_url: `${APP_URL}?ecran=offre&abonnement=ok`,
      error_url: `${APP_URL}?ecran=offre&abonnement=erreur`,
      client_reference: `abo:${r.id}`,
      ...(mobile ? { restrict_payer_mobile: mobile } : {}),
    }),
  });
  const session = await response.json().catch(() => null);
  if (!response.ok || !session?.id || !session?.wave_launch_url) {
    console.warn("[jokko] wave abonnement", response.status, session?.code ?? "");
    return send(req, 502, { error: "wave_error", message: "Wave ne répond pas pour le moment. Réessaie dans un instant." });
  }
  await admin.from("subscription_requests").update({ wave_session: session.id, wave_url: session.wave_launch_url }).eq("id", r.id);
  return send(req, 200, { url: session.wave_launch_url, id: session.id });
}

async function subscriptionCheck(req: Request) {
  const user = await userOf(req);
  if (!user) return send(req, 401, { error: "not_signed_in" });
  const body = await req.json().catch(() => null);
  const { data: r } = await admin.from("subscription_requests").select("*").eq("id", String(body?.requestId ?? "")).maybeSingle();
  if (!r || !(await isPatron(r.shop_id, user))) return send(req, 404, { error: "not_found" });
  if (r.status !== "en_attente" || !r.wave_session) return send(req, 200, { status: r.status });
  const keys = await cfcKeys();
  if (!keys) return send(req, 200, { status: r.status });
  const response = await fetch(`${WAVE}/v1/checkout/sessions/${encodeURIComponent(r.wave_session)}`, { headers: { Authorization: `Bearer ${keys.api_key}` } });
  const session = await response.json().catch(() => null);
  if (response.ok && session?.payment_status === "succeeded") {
    const done = await activate(session.id, Math.round(Number(session.amount)), String(session.transaction_id ?? ""));
    return send(req, 200, { status: done?.ok ? "active" : "en_attente", reason: done?.reason });
  }
  return send(req, 200, { status: "en_attente" });
}

async function cfcWebhook(req: Request) {
  const raw = await req.text();
  const keys = await cfcKeys();
  if (!keys) return new Response("not configured", { status: 404 });
  if (!(await validSignature(req.headers.get("wave-signature") ?? "", raw, keys.webhook_secret))) return new Response("bad signature", { status: 401 });
  const event = JSON.parse(raw);
  const data = event?.data ?? {};
  if (event?.type === "checkout.session.completed" && data.id && (data.payment_status ?? "succeeded") === "succeeded") {
    await activate(String(data.id), Math.round(Number(data.amount)), String(data.transaction_id ?? ""));
  }
  return new Response("ok");
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
    if (route === "abonnement") return await subscriptionCheckout(req);
    if (route === "abonnement-check") return await subscriptionCheck(req);
    if (route === "webhook" && parts[i + 2] === "cfc") return await cfcWebhook(req);
    if (route === "webhook" && parts[i + 2]) return await webhook(req, decodeURIComponent(parts[i + 2]));
    return send(req, 404, { error: "not_found" });
  } catch (error) {
    console.warn("[jokko] wave:", error instanceof Error ? error.message : "erreur");
    return send(req, 500, { error: "internal_error" });
  }
});
