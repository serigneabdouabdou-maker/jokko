// Jokko — routes Gemini sur Supabase (la clé Gemini reste ici, jamais dans le navigateur).
// POST /assistant/interpret | /assistant/listen | /assistant/live, GET /assistant/status
// Exige un utilisateur connecté (verify_jwt) : personne ne peut utiliser la clé sans compte.
// Le code Gemini partagé vient du dépôt GitHub, figé sur une version précise (le numéro après /jokko/).
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AssistantOutputError, AssistantUpstreamError, GeminiNotConfiguredError, interpret, listen } from "https://raw.githubusercontent.com/serigneabdouabdou-maker/jokko/7a47d7b7b0c8c267e53899923ba9b91ebb0cca62/server/assistant/interpret.ts";
import { createLiveSession, LiveUnavailableError } from "https://raw.githubusercontent.com/serigneabdouabdou-maker/jokko/7a47d7b7b0c8c267e53899923ba9b91ebb0cca62/server/assistant/live.ts";
import { interpretRequestSchema, listenRequestSchema, liveRequestSchema } from "https://raw.githubusercontent.com/serigneabdouabdou-maker/jokko/7a47d7b7b0c8c267e53899923ba9b91ebb0cca62/server/assistant/schema.ts";

const MAX_TEXT_BODY = 32 * 1024;
const MAX_AUDIO_BODY = 3 * 1024 * 1024;
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const hits = new Map<string, number[]>();

const env = () => ({
  apiKey: Deno.env.get("GEMINI_API_KEY"),
  model: Deno.env.get("GEMINI_MODEL"),
  liveModel: Deno.env.get("GEMINI_LIVE_MODEL"),
  voice: Deno.env.get("GEMINI_TTS_VOICE"),
});

const ALLOWED = (Deno.env.get("JOKKO_ORIGINS") ?? "https://serigneabdouabdou-maker.github.io,http://localhost:5173,http://localhost:4173")
  .split(",")
  .map((o) => o.trim());

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED.includes(origin) ? origin : ALLOWED[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
}

function send(req: Request, status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...cors(req), ...headers },
  });
}

/** Vérifie les jetons localement (clé publique de Supabase gardée en mémoire) : pas d'aller-retour réseau. */
const authClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Commerçant connecté, ou null. Une simple clé publique (sans connexion) ne suffit pas pour utiliser Gemini. */
async function userOf(req: Request): Promise<string | null> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token || token.startsWith("sb_")) return null;
  try {
    const { data, error } = await authClient.auth.getClaims(token);
    const claims = data?.claims;
    if (error || !claims || claims.role !== "authenticated" || typeof claims.sub !== "string") return null;
    return claims.sub;
  } catch {
    return null;
  }
}

function limited(user: string): boolean {
  const now = Date.now();
  const recent = (hits.get(user) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(user, recent);
  return recent.length > MAX_PER_WINDOW;
}

async function body<T extends z.ZodType>(req: Request, max: number, schema: T): Promise<{ ok: true; data: z.infer<T> } | { ok: false; res: Response }> {
  if (!String(req.headers.get("content-type") ?? "").includes("application/json")) {
    return { ok: false, res: send(req, 415, { error: "unsupported_media_type" }) };
  }
  const text = await req.text();
  if (text.length > max) return { ok: false, res: send(req, 413, { error: "payload_too_large" }) };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, res: send(req, 400, { error: "invalid_json" }) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((i) => i.path.join(".") || "(racine)"))].slice(0, 10);
    return { ok: false, res: send(req, 400, { error: "invalid_request", fields }) };
  }
  return { ok: true, data: parsed.data };
}

function failure(req: Request, error: unknown): Response {
  if (error instanceof GeminiNotConfiguredError) return send(req, 503, { error: error.code, message: error.message });
  if (error instanceof AssistantOutputError) {
    console.warn(`[jokko] ${error.message}`);
    return send(req, 502, { error: error.code, message: "Je n'ai pas bien compris. Peux-tu redire la phrase ?" });
  }
  if (error instanceof AssistantUpstreamError || error instanceof LiveUnavailableError) {
    console.warn(`[jokko] Gemini indisponible${error.status ? ` (${error.status})` : ""}`);
    const message = error.status === 429
      ? "Le quota Gemini est atteint. Réessaie plus tard."
      : "Gemini ne répond pas pour le moment. Réessaie dans un instant.";
    return send(req, 502, { error: error.code, message });
  }
  console.warn("[jokko] erreur inattendue", error instanceof Error ? error.name : "");
  return send(req, 500, { error: "internal_error" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  const route = new URL(req.url).pathname.split("/").filter(Boolean).pop();

  const user = await userOf(req);
  if (!user) return send(req, 401, { error: "not_signed_in", message: "Connecte-toi pour parler à Jokko." });
  if (route === "status") return send(req, 200, { configured: Boolean(env().apiKey?.trim()) });
  if (req.method !== "POST") return send(req, 405, { error: "method_not_allowed" }, { Allow: "POST" });
  if (limited(user)) return send(req, 429, { error: "too_many_requests", message: "Doucement : trop de demandes. Réessaie dans une minute." }, { "Retry-After": "60" });

  try {
    if (route === "interpret") {
      const b = await body(req, MAX_TEXT_BODY, interpretRequestSchema);
      return b.ok ? send(req, 200, await interpret(b.data, env())) : b.res;
    }
    if (route === "listen") {
      const b = await body(req, MAX_AUDIO_BODY, listenRequestSchema);
      return b.ok ? send(req, 200, await listen(b.data, env())) : b.res;
    }
    if (route === "live") {
      const b = await body(req, MAX_TEXT_BODY, liveRequestSchema);
      if (!b.ok) return b.res;
      const e = env();
      return send(req, 200, await createLiveSession(b.data.shopContext, { apiKey: e.apiKey, model: e.liveModel, voice: e.voice }));
    }
    return send(req, 404, { error: "not_found" });
  } catch (error) {
    return failure(req, error);
  }
});
