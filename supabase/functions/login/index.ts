// Jokko — connexion : numéro + code secret à 6 chiffres, avec BLOCAGE après plusieurs codes faux.
//  5 codes faux → bloqué 15 min ; 10 → 1 h ; 15 et plus → 24 h (compteur par numéro, remis à zéro à la bonne connexion).
// Le vrai mot de passe du compte est dérivé du code avec un secret serveur : impossible de contourner cette fonction
// (et donc le blocage) en appelant directement Supabase. Les anciens comptes passent au nouveau mot de passe à leur connexion.
import { createClient } from "npm:@supabase/supabase-js@2";

const DEFAULT_ORIGINS = ["https://jokkoapp.com", "https://www.jokkoapp.com", "https://jokko.serigneabdouabdou.workers.dev", "https://serigneabdouabdou-maker.github.io", "http://localhost:5173", "http://localhost:4173"];
const ALLOWED = ([...new Set([...DEFAULT_ORIGINS, ...(Deno.env.get("JOKKO_ORIGINS") ?? "").split(",")])].filter(Boolean).join(",")).split(",").map((o) => o.trim());
const URL_ = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = () => createClient(URL_, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
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

/** Au plus 30 essais par 10 minutes depuis une même adresse IP (en plus du blocage par numéro). */
function ipLimited(req: Request): boolean {
  const ip = (req.headers.get("x-forwarded-for") ?? "inconnue").split(",")[0].trim();
  const now = Date.now();
  const recent = (ipHits.get(ip) ?? []).filter((t) => now - t < 600_000);
  recent.push(now);
  ipHits.set(ip, recent);
  return recent.length > 30;
}

async function passwordOf(phone: string, code: string): Promise<string> {
  if (!pepper) {
    const { data, error } = await admin.rpc("login_pepper");
    if (error || typeof data !== "string" || !data) throw new Error("secret de connexion manquant");
    pepper = data;
  }
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${phone}:${code}`));
  return `jk1-${[...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

const minutesUntil = (iso: string) => Math.max(1, Math.ceil((Date.parse(iso) - Date.now()) / 60_000));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return send(req, 405, { error: "method_not_allowed" });
  const body = await req.json().catch(() => null);
  const phone = String(body?.phone ?? "");
  const code = String(body?.code ?? "");
  if (!/^221[37]\d{8}$/.test(phone) || !/^\d{6}$/.test(code)) return send(req, 400, { error: "invalid_request" });
  if (ipLimited(req)) return send(req, 429, { error: "too_many_requests" });

  try {
    const { data: state } = await admin.rpc("login_guard_state", { p_phone: phone });
    if (state?.locked_until) return send(req, 423, { error: "locked", minutes: minutesUntil(state.locked_until) });

    const email = `${phone}@tel.jokko.app`;
    const password = await passwordOf(phone, code);
    // Le code est vérifié dans la base : un code faux ne sollicite jamais le service de connexion.
    const { data: match } = await admin.rpc("login_check", { p_email: email, p_password: password, p_legacy: `jokko-${code}` });

    if (match === "nouveau" || match === "ancien") {
      if (match === "ancien") {
        // Ancien compte (créé avant le blocage) : il passe au nouveau mot de passe.
        const { data: user } = await admin.from("profiles").select("user_id").eq("phone", phone).maybeSingle();
        const id = user?.user_id ?? (await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })).data.users.find((u) => u.email === email)?.id;
        const { error } = id ? await admin.auth.admin.updateUserById(id, { password }) : { error: new Error("compte introuvable") };
        if (error) console.warn("[jokko] login: migration du mot de passe", error.message);
      }
      const first = await anon().auth.signInWithPassword({ email, password });
      const session = first.data.session ?? (match === "ancien" ? (await anon().auth.signInWithPassword({ email, password: `jokko-${code}` })).data.session : null);
      if (!session) return send(req, 503, { error: "unavailable" });
      await admin.rpc("login_guard_ok", { p_phone: phone });
      return send(req, 200, { access_token: session.access_token, refresh_token: session.refresh_token });
    }

    const { data: fail } = await admin.rpc("login_guard_fail", { p_phone: phone });
    if (fail?.locked_until) return send(req, 423, { error: "locked", minutes: minutesUntil(fail.locked_until) });
    // Essais restants avant le prochain blocage (5, puis 10, puis chaque essai à partir de 15).
    const failures = Number(fail?.failures ?? 0);
    const next = failures < 5 ? 5 : failures < 10 ? 10 : 15;
    return send(req, 401, { error: "wrong_code", left: Math.max(1, next - failures) });
  } catch (error) {
    console.warn("[jokko] login:", error instanceof Error ? error.message : "erreur");
    return send(req, 500, { error: "internal_error" });
  }
});
