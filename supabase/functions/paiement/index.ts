// Jokko — paiement en ligne des abonnements par un agrégateur (PayDunya : Wave, Orange Money, Free Money, carte).
//  POST /paiement/paydunya/creer     (patron connecté) : facture PayDunya pour sa demande d'abonnement → lien de paiement.
//  POST /paiement/paydunya/verifier  (patron connecté) : redemande l'état à PayDunya (si la confirmation tarde) ; active si payé.
//  POST /paiement/paydunya/ipn       (PayDunya) : notification de paiement.
// Règle de sécurité : une offre ne s'active QUE si le serveur a lui-même redemandé à PayDunya (avec les clés de CFC)
// que la facture est « completed » ET que le montant est le bon. Une notification seule ne suffit jamais.
import { createClient } from "npm:@supabase/supabase-js@2";

const APP_URL = "https://jokkoapp.com/";
const FN_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/paiement`;
const DEFAULT_ORIGINS = ["https://jokkoapp.com", "https://www.jokkoapp.com", "https://jokko.serigneabdouabdou.workers.dev", "http://localhost:5173", "http://localhost:4173"];
const ALLOWED = [...new Set([...DEFAULT_ORIGINS, ...(Deno.env.get("JOKKO_ORIGINS") ?? "").split(",")])].map((o) => o.trim()).filter(Boolean);
const PLAN_LABEL: Record<string, string> = { medium: "Médium", avance: "Avancé" };

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

async function isPatron(shopId: string, userId: string): Promise<boolean> {
  const { data } = await admin.from("shop_members").select("role").eq("shop_id", shopId).eq("user_id", userId).maybeSingle();
  return data?.role === "patron";
}

type Keys = { master: string; private: string; token: string; mode: "test" | "live" };
async function paydunyaKeys(): Promise<Keys | null> {
  const { data } = await admin.rpc("paydunya_keys");
  return data && typeof data.master === "string" ? data : null;
}
const base = (k: Keys) => (k.mode === "live" ? "https://app.paydunya.com/api/v1" : "https://app.paydunya.com/sandbox-api/v1");
const headers = (k: Keys) => ({ "Content-Type": "application/json", "PAYDUNYA-MASTER-KEY": k.master, "PAYDUNYA-PRIVATE-KEY": k.private, "PAYDUNYA-TOKEN": k.token });

async function sha512(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-512", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Prévient l'équipe CFC qu'un abonnement vient d'être payé et activé. */
async function tellCfc(result: { shop?: string; plan?: string; months?: number; amount?: number }, via: string) {
  try {
    const { data: cfg } = await admin.rpc("notify_config");
    const { data: shop } = await admin.from("shops").select("name").eq("id", result.shop ?? "").maybeSingle();
    if (!cfg?.notify_secret) return;
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-jokko-notify": cfg.notify_secret },
      body: JSON.stringify({ kind: "cfc", title: `Paiement reçu ✓ (${via})`, body: `${shop?.name ?? "Une boutique"} : ${PLAN_LABEL[result.plan ?? ""] ?? ""} ${result.months} mois, ${result.amount} F. Offre activée.` }),
    });
  } catch {
    // confort seulement : l'offre est déjà activée
  }
}

/** Demande à PayDunya l'état réel de la facture ; active l'offre si payée au bon montant. */
async function confirmAndActivate(k: Keys, token: string): Promise<{ status: "active" | "en_attente" | "refusee"; reason?: string }> {
  const res = await fetch(`${base(k)}/checkout-invoice/confirm/${encodeURIComponent(token)}`, { headers: headers(k) });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) return { status: "en_attente" };
  if (data.status === "cancelled" || data.status === "failed") return { status: "en_attente", reason: data.status };
  if (data.status !== "completed") return { status: "en_attente" };
  const paid = Math.round(Number(data.invoice?.total_amount ?? data.total_amount ?? NaN));
  const { data: done } = await admin.rpc("activate_online_subscription", { p_provider: "paydunya", p_token: token, p_amount: paid, p_receipt: String(data.receipt_url ?? "") });
  if (done?.ok && !done.already) await tellCfc(done, k.mode === "live" ? "PayDunya" : "PayDunya TEST");
  return done?.ok ? { status: "active" } : { status: "en_attente", reason: done?.reason };
}

async function create(req: Request) {
  const user = await userOf(req);
  if (!user) return send(req, 401, { error: "not_signed_in" });
  const body = await req.json().catch(() => null);
  const { data: r } = await admin.from("subscription_requests").select("*").eq("id", String(body?.requestId ?? "")).maybeSingle();
  if (!r || !(await isPatron(r.shop_id, user))) return send(req, 404, { error: "not_found" });
  if (r.status !== "en_attente") return send(req, 409, { error: "already", status: r.status });
  const k = await paydunyaKeys();
  if (!k) return send(req, 409, { error: "not_configured" });
  const { data: shop } = await admin.from("shops").select("name").eq("id", r.shop_id).maybeSingle();
  const description = `Jokko ${PLAN_LABEL[r.plan] ?? r.plan} · ${r.months} mois · ${shop?.name ?? "boutique"} · ${r.reference}`;
  const res = await fetch(`${base(k)}/checkout-invoice/create`, {
    method: "POST",
    headers: headers(k),
    body: JSON.stringify({
      invoice: { total_amount: Number(r.amount), description: description.slice(0, 250) },
      store: { name: "CFC – Cissé Family Company", tagline: "Jokko, la boutique qui écoute", phone: "775674725", website_url: "https://jokkoapp.com", logo_url: "https://jokkoapp.com/icon-512.png" },
      actions: {
        callback_url: `${FN_URL}/paydunya/ipn`,
        return_url: `${APP_URL}?ecran=offre&paiement=ok`,
        cancel_url: `${APP_URL}?ecran=offre&paiement=annule`,
      },
      custom_data: { request_id: r.id, reference: r.reference },
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.response_code !== "00" || !data?.token || typeof data?.response_text !== "string") {
    console.warn("[jokko] paydunya creer", res.status, data?.response_code ?? "");
    const message = res.status === 401 || /key|cl[ée]/i.test(String(data?.response_text ?? "")) ? "Le paiement en ligne n'est pas encore prêt (clés PayDunya). Contacte CFC." : "Le paiement en ligne ne répond pas pour le moment. Réessaie dans un instant.";
    return send(req, 502, { error: "provider_error", message });
  }
  await admin.from("subscription_requests").update({ provider: "paydunya", provider_token: data.token }).eq("id", r.id);
  return send(req, 200, { url: data.response_text, test: k.mode !== "live" });
}

async function verify(req: Request) {
  const user = await userOf(req);
  if (!user) return send(req, 401, { error: "not_signed_in" });
  const body = await req.json().catch(() => null);
  const { data: r } = await admin.from("subscription_requests").select("*").eq("id", String(body?.requestId ?? "")).maybeSingle();
  if (!r || !(await isPatron(r.shop_id, user))) return send(req, 404, { error: "not_found" });
  if (r.status !== "en_attente" || r.provider !== "paydunya" || !r.provider_token) return send(req, 200, { status: r.status });
  const k = await paydunyaKeys();
  if (!k) return send(req, 200, { status: r.status });
  return send(req, 200, await confirmAndActivate(k, r.provider_token));
}

async function ipn(req: Request) {
  const k = await paydunyaKeys();
  if (!k) return new Response("not configured", { status: 404 });
  const form = new URLSearchParams(await req.text());
  const hash = form.get("data[hash]") ?? "";
  const token = form.get("data[invoice][token]") ?? "";
  // 1er contrôle : l'empreinte de la clé maîtresse de CFC. 2e contrôle (décisif) : on redemande à PayDunya.
  if (!token || hash !== (await sha512(k.master))) return new Response("refused", { status: 401 });
  await confirmAndActivate(k, token);
  return new Response("ok");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const i = parts.indexOf("paiement");
  const [provider, action] = [parts[i + 1], parts[i + 2]];
  try {
    if (provider === "paydunya" && action === "creer") return await create(req);
    if (provider === "paydunya" && action === "verifier") return await verify(req);
    if (provider === "paydunya" && action === "ipn") return await ipn(req);
    return send(req, 404, { error: "not_found" });
  } catch (error) {
    console.warn("[jokko] paiement:", error instanceof Error ? error.message : "erreur");
    return send(req, 500, { error: "internal_error" });
  }
});
