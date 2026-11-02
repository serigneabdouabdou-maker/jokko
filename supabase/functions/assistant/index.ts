// Jokko — routes Gemini sur Supabase (la clé Gemini reste ici, jamais dans le navigateur).
// POST /assistant/interpret | /assistant/listen | /assistant/live | /assistant/speak, GET /assistant/status
// Exige un utilisateur connecté (verify_jwt) : personne ne peut utiliser la clé sans compte.
// Le code Gemini partagé vient du dépôt GitHub, figé sur une version précise (le numéro après /jokko/).
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AssistantOutputError, AssistantUpstreamError, GeminiNotConfiguredError, interpret, listen, understandOrder, advise } from "https://raw.githubusercontent.com/serigneabdouabdou-maker/jokko/e29022a3eea39e6e15d3ce8ebbc2ea2e91363a9d/server/assistant/interpret.ts";
import { createLiveSession, LiveUnavailableError } from "https://raw.githubusercontent.com/serigneabdouabdou-maker/jokko/e29022a3eea39e6e15d3ce8ebbc2ea2e91363a9d/server/assistant/live.ts";
import { adviceRequestSchema, interpretRequestSchema, listenRequestSchema, liveRequestSchema, speakRequestSchema } from "https://raw.githubusercontent.com/serigneabdouabdou-maker/jokko/e29022a3eea39e6e15d3ce8ebbc2ea2e91363a9d/server/assistant/schema.ts";

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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-jokko-shop",
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

function limited(user: string, max = MAX_PER_WINDOW): boolean {
  const now = Date.now();
  const recent = (hits.get(user) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(user, recent);
  return recent.length > max;
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


// ---------- Voix claire : une phrase de Jokko lue avec la voix de la page d'accueil ----------
const TTS_MODELS = ["gemini-3.1-flash-tts-preview", "gemini-3.8-flash-lite-tts"];
const READS_DIRECTIONS_ALOUD = /^gemini-3\.8/;
const DIRECTION: Record<string, string> = {
  wo: "Dis en wolof de Dakar, clairement, à un rythme naturel et vif, d'une voix chaleureuse, souriante et rassurante, comme un ami commerçant qui t'aide au comptoir :",
  fr: "Dis en français, avec un léger accent sénégalais, clairement, à un rythme naturel et vif, d'une voix chaleureuse, souriante et rassurante :",
};
const spoken = new Map<string, { pcm: Uint8Array; rate: number }>();

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function speakSentence(text: string, language: string): Promise<{ pcm: Uint8Array; rate: number } | null> {
  const e = env();
  const apiKey = e.apiKey?.trim();
  if (!apiKey) throw new GeminiNotConfiguredError();
  const voice = e.voice?.trim() || "Sulafat";
  const lang = language === "fr" ? "fr" : "wo";
  const key = `${voice}|${lang}|${text}`;
  const hit = spoken.get(key);
  if (hit) return hit;
  for (const model of TTS_MODELS) {
    const prompt = READS_DIRECTIONS_ALOUD.test(model) ? text : `${DIRECTION[lang]} ${text}`;
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
      }),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (!res?.ok) continue;
    const json = await res.json().catch(() => null);
    const chunks: Uint8Array[] = [];
    let rate = 24000;
    for (const p of json?.candidates?.[0]?.content?.parts ?? []) {
      if (!p?.inlineData?.data) continue;
      rate = Number(/rate=(\d+)/i.exec(p.inlineData.mimeType ?? "")?.[1] ?? 24000);
      chunks.push(fromBase64(p.inlineData.data));
    }
    const size = chunks.reduce((n, c) => n + c.length, 0);
    if (!size) continue;
    const pcm = new Uint8Array(size);
    let o = 0;
    for (const c of chunks) {
      pcm.set(c, o);
      o += c.length;
    }
    const clip = { pcm, rate };
    spoken.set(key, clip);
    if (spoken.size > 200) spoken.delete(spoken.keys().next().value as string);
    return clip;
  }
  return null;
}

// ---------- Offres : chaque appel à Gemini est compté et limité par le serveur (table assistant_usage) ----------
const KIND: Record<string, string> = { live: "direct", listen: "vocal", interpret: "texte", order: "texte", advice: "conseil" };
type Quota = { ok: boolean; tier: string; limit: number; used: number; reason?: string };

function quotaMessage(q: Quota, kind: string): string {
  const upsell = q.tier === "gratuit" || q.tier === "medium" ? " Tu peux passer à une offre supérieure dans « Mon offre »." : "";
  if (kind === "direct") {
    if (q.reason === "offre") return "La conversation en direct fait partie de l'offre Avancé. On continue en messages vocaux : parle, puis appuie de nouveau pour envoyer.";
    return "Tu as beaucoup parlé avec Jokko aujourd'hui. Jusqu'à demain, on continue en messages vocaux : parle, puis appuie de nouveau pour envoyer.";
  }
  if (kind === "vocal") return `Tu as utilisé tes ${q.limit} messages vocaux d'aujourd'hui. Tu peux écrire ta phrase ; ça repart demain.${upsell}`;
  if (kind === "conseil") return q.reason === "offre" ? "Le conseiller fait partie de l'offre Avancé." : `Le conseiller a déjà répondu ${q.limit} fois aujourd'hui. Reviens demain.`;
  return `Tu as utilisé tes ${q.limit} demandes à Jokko d'aujourd'hui. Les boutons de l'appli marchent toujours ; ça repart demain.${upsell}`;
}

/** null = permis (et compté) ; sinon la réponse de refus à renvoyer. */
async function allowed(req: Request, route: string): Promise<Response | null> {
  const kind = KIND[route];
  if (!kind) return null;
  const shop = req.headers.get("x-jokko-shop");
  if (!shop) return send(req, 426, { error: "update_required", message: "Mets Jokko à jour : ferme complètement l'appli, puis rouvre-la." });
  const asUser = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: req.headers.get("authorization") ?? "" } },
  });
  const { data, error } = await asUser.rpc("use_assistant", { p_shop: shop, p_kind: kind });
  if (error || !data) return send(req, 403, { error: "shop_forbidden", message: "Cette boutique n'est pas sur ton compte." });
  const q = data as Quota;
  if (q.ok) return null;
  return send(req, 402, { error: "quota", reason: q.reason, tier: q.tier, kind, limit: q.limit, message: quotaMessage(q, kind) });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  const route = new URL(req.url).pathname.split("/").filter(Boolean).pop();

  const user = await userOf(req);
  if (!user) return send(req, 401, { error: "not_signed_in", message: "Connecte-toi pour parler à Jokko." });
  if (route === "status") return send(req, 200, { configured: Boolean(env().apiKey?.trim()) });
  if (req.method !== "POST") return send(req, 405, { error: "method_not_allowed" }, { Allow: "POST" });
  // La voix claire lit phrase par phrase : son propre compteur, plus large.
  if (route === "speak" ? limited(`${user}:voix`, 90) : limited(user)) return send(req, 429, { error: "too_many_requests", message: "Doucement : trop de demandes. Réessaie dans une minute." }, { "Retry-After": "60" });

  const refused = await allowed(req, route ?? "");
  if (refused) return refused;

  try {
    if (route === "interpret") {
      const b = await body(req, MAX_TEXT_BODY, interpretRequestSchema);
      return b.ok ? send(req, 200, await interpret(b.data, env())) : b.res;
    }
    if (route === "advice") {
      const b = await body(req, MAX_TEXT_BODY, adviceRequestSchema);
      return b.ok ? send(req, 200, await advise(b.data, env())) : b.res;
    }
    if (route === "order") {
      const b = await body(req, MAX_TEXT_BODY, interpretRequestSchema);
      return b.ok ? send(req, 200, await understandOrder(b.data, env())) : b.res;
    }
    if (route === "listen") {
      const b = await body(req, MAX_AUDIO_BODY, listenRequestSchema);
      return b.ok ? send(req, 200, await listen(b.data, env())) : b.res;
    }
    if (route === "speak") {
      const b = await body(req, MAX_TEXT_BODY, speakRequestSchema);
      if (!b.ok) return b.res;
      const clip = await speakSentence(b.data.text, b.data.language);
      if (!clip) return send(req, 502, { error: "voice_unavailable", message: "La voix ne répond pas pour le moment." });
      return new Response(clip.pcm, { status: 200, headers: { "Content-Type": `audio/l16;rate=${clip.rate}`, "Cache-Control": "no-store", ...cors(req) } });
    }
    if (route === "live") {
      const b = await body(req, MAX_TEXT_BODY, liveRequestSchema);
      if (!b.ok) return b.res;
      const e = env();
      return send(req, 200, await createLiveSession(b.data.shopContext, { apiKey: e.apiKey, model: e.liveModel, voice: e.voice, speed: b.data.speed }));
    }
    return send(req, 404, { error: "not_found" });
  } catch (error) {
    return failure(req, error);
  }
});
