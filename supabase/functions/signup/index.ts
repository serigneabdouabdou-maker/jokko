// Jokko — création de compte : numéro sénégalais + code secret à 6 chiffres.
// Le compte est créé confirmé (pas d'e-mail réel) ; l'appli se connecte ensuite elle-même.
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED = (Deno.env.get("JOKKO_ORIGINS") ?? "https://serigneabdouabdou-maker.github.io,http://localhost:5173,http://localhost:4173")
  .split(",")
  .map((o) => o.trim());
const hits = new Map<string, number[]>();

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

/** 5 créations de compte par heure et par adresse IP. */
function limited(req: Request): boolean {
  const ip = (req.headers.get("x-forwarded-for") ?? "inconnue").split(",")[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 5;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return send(req, 405, { error: "method_not_allowed" });

  let phone = "";
  let code = "";
  try {
    const body = await req.json();
    phone = String(body?.phone ?? "");
    code = String(body?.code ?? "");
  } catch {
    return send(req, 400, { error: "invalid_json" });
  }
  if (!/^221[37]\d{8}$/.test(phone) || !/^\d{6}$/.test(code)) return send(req, 400, { error: "invalid_request" });
  if (/^(\d)\1{5}$/.test(code) || code === "123456" || code === "654321") return send(req, 400, { error: "weak_code" });
  if (limited(req)) return send(req, 429, { error: "too_many_requests" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.auth.admin.createUser({
    email: `${phone}@tel.jokko.app`,
    password: `jokko-${code}`,
    email_confirm: true,
    user_metadata: { phone },
  });
  if (error || !data.user) {
    const exists = /already|registered|exists/i.test(error?.message ?? "");
    if (!exists) console.warn("[jokko] signup:", error?.message);
    return send(req, exists ? 409 : 500, { error: exists ? "exists" : "signup_failed" });
  }

  const { error: profileError } = await admin.from("profiles").insert({ user_id: data.user.id, phone });
  if (profileError) console.warn("[jokko] profil:", profileError.message);
  return send(req, 201, { ok: true });
});
