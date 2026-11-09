// Jokko — routes Gemini sur Supabase (la clé Gemini reste ici, jamais dans le navigateur).
// POST /assistant/interpret | /assistant/listen | /assistant/live | /assistant/speak, GET /assistant/status
// Exige un utilisateur connecté (verify_jwt) : personne ne peut utiliser la clé sans compte.
// Le code Gemini partagé vient du dépôt GitHub, figé sur une version précise (le numéro après /jokko/).
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import { AssistantOutputError, AssistantUpstreamError, GeminiNotConfiguredError, interpret, listen, understandOrder, advise } from "https://raw.githubusercontent.com/serigneabdouabdou-maker/jokko/0d1d7d7853e712403d49a4e54c573a09c08c928f/server/assistant/interpret.ts";
import { createLiveSession, LiveUnavailableError } from "https://raw.githubusercontent.com/serigneabdouabdou-maker/jokko/0d1d7d7853e712403d49a4e54c573a09c08c928f/server/assistant/live.ts";
import { adviceRequestSchema, interpretRequestSchema, listenRequestSchema, liveRequestSchema, speakRequestSchema } from "https://raw.githubusercontent.com/serigneabdouabdou-maker/jokko/0d1d7d7853e712403d49a4e54c573a09c08c928f/server/assistant/schema.ts";

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

// Adresses autorisées à appeler la fonction : jokkoapp.com (Cloudflare), l'ancienne adresse GitHub, et le poste de dev.
const DEFAULT_ORIGINS = ["https://jokkoapp.com", "https://www.jokkoapp.com", "https://jokko.serigneabdouabdou.workers.dev", "https://serigneabdouabdou-maker.github.io", "http://localhost:5173", "http://localhost:4173"];
const ALLOWED = ([...new Set([...DEFAULT_ORIGINS, ...(Deno.env.get("JOKKO_ORIGINS") ?? "").split(",")])].filter(Boolean).join(","))
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

/** Journal des appels réels à Google Gemini (tableau de bord CFC). Ne bloque jamais la réponse. */
const logger = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});
function logCall(req: Request, kind: string, lang: unknown, ok: boolean, status?: number) {
  const shop = req.headers.get("x-jokko-shop");
  void logger
    .from("gemini_calls")
    .insert({ shop_id: shop, kind, lang: typeof lang === "string" ? lang : null, ok, status: status ?? (ok ? 200 : null) })
    .then(() => undefined, () => undefined);
}
const LOG_KIND: Record<string, string> = { live: "direct", listen: "vocal", couture: "vocal", essayage: "image", interpret: "texte", order: "texte", advice: "conseil", speak: "voix", stock: "stock" };

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
    // 402 = crédit Gemini de CFC épuisé (Fallou est alerté sur la console) ; 429 = trop de demandes chez Google.
    const message = error.status === 402
      ? "Jokko se repose quelques minutes. Les boutons de l'appli marchent toujours : réessaie un peu plus tard."
      : error.status === 429
      ? "Jokko est très demandé en ce moment. Réessaie dans une minute."
      : "Gemini ne répond pas pour le moment. Réessaie dans un instant.";
    return send(req, 502, { error: error.code, message });
  }
  console.warn("[jokko] erreur inattendue", error instanceof Error ? error.name : "");
  return send(req, 500, { error: "internal_error" });
}


// ---------- Voix claire : une phrase de Jokko lue avec la voix de la page d'accueil ----------
// 3.1 d'abord : il reçoit la consigne de ton (wolof de Dakar, doux, chiffres lents) sans la lire à voix haute.
// Google l'arrête le 17/11/2026 : ensuite, les modèles 3.8 prennent le relais tout seuls.
const TTS_MODELS = ["gemini-3.1-flash-tts-preview", "gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"];
const READS_DIRECTIONS_ALOUD = /^gemini-3\.8/;
const DIRECTION: Record<string, string> = {
  wo: "Dis en wolof de Dakar, d'une voix douce, calme et chaleureuse, à un rythme posé, comme un ami commerçant qui t'aide au comptoir. Prononce les nombres wolof lentement et distinctement, avec une petite pause avant le montant :",
  fr: "Dis en français, avec un léger accent sénégalais, d'une voix douce, calme et chaleureuse, à un rythme posé. Prononce les nombres lentement et distinctement :",
};
const spoken = new Map<string, { pcm: Uint8Array; rate: number }>();

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Dernier code d'erreur de la voix (402 = crédit épuisé), pour le journal gemini_calls. */
let lastVoiceStatus = 0;

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
    if (!res?.ok) {
      lastVoiceStatus = res?.status ?? 0;
      console.warn(`[jokko] voix ${model} : échec ${res ? res.status : "réseau"}`);
      continue;
    }
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

// ---------- Installation du stock : dictée ou photo de facture/cahier → liste lisible par Jokko ----------
// Gemini ne fait que transcrire / recopier ; c'est le code de l'appli qui comprend les quantités et les prix,
// et le patron vérifie tout avant d'enregistrer.
const MAX_STOCK_BODY = 6 * 1024 * 1024;
const STOCK_PROMPT: Record<string, string> = {
  audio:
    "Tu transcris la dictée d'un commerçant sénégalais qui fait l'inventaire de sa boutique (wolof, français ou les deux mélangés). " +
    "Écris exactement ce qui est dit, mot pour mot, sans traduire. Ne convertis JAMAIS un montant dit en wolof (garde « ñaari junni » tel quel). " +
    "Les nombres dits en français peuvent être écrits en chiffres. Sépare les articles par des virgules. Réponds seulement avec la transcription. Si c'est inaudible, réponds (inaudible).",
  photo:
    "Cette photo est une facture de fournisseur, un bon de livraison ou une page de cahier de stock d'une boutique au Sénégal. " +
    "Recopie chaque article sur sa propre ligne, au format exact : QUANTITÉ UNITÉ NOM, acheté PRIX\n" +
    "- QUANTITÉ en chiffres ; UNITÉ en un mot (sac, bidon, carton, paquet, boîte, kg, litre, pièce…) ; NOM court, en français, tel qu'écrit.\n" +
    "- PRIX = prix d'achat pour UNE unité, en francs CFA, en chiffres sans espace. Si seul le total de la ligne est écrit, divise par la quantité.\n" +
    "- Si un prix de vente est écrit, ajoute « , vendu PRIX ».\n" +
    "- N'invente rien : une valeur illisible est laissée de côté. Ignore l'en-tête, les totaux, la TVA, les remises et les signatures.\n" +
    "Réponds seulement avec les lignes. Si ce n'est pas un document de stock, réponds (aucun article).",
};

async function readStock(mode: string, mimeType: string, data: string): Promise<string> {
  const e = env();
  const apiKey = e.apiKey?.trim();
  if (!apiKey) throw new GeminiNotConfiguredError();
  const models = [e.model?.trim() || "gemini-3.5-flash", "gemini-flash-lite-latest"];
  let last = 0;
  for (const model of models) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: STOCK_PROMPT[mode] }, { inlineData: { mimeType, data } }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 4096 },
      }),
      signal: AbortSignal.timeout(30_000),
    }).catch(() => null);
    if (!res) continue;
    if (!res.ok) {
      last = res.status;
      continue;
    }
    const json = await res.json().catch(() => null);
    const text = (json?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p?.text ?? "").join("").trim();
    if (text) return text;
  }
  throw new AssistantUpstreamError("lecture du stock impossible", last || 502);
}

// ---------- Commande de couture dictée (tailleurs qui ne savent pas écrire) ----------
// Gemini recopie les mots du tailleur dans des cases ; l'appli lit les montants (dërëm), les mesures (cm) et la date,
// puis le tailleur vérifie avant d'enregistrer.
const MEASURE_KEYS = ["cou", "epaule", "poitrine", "taille", "hanches", "manche", "bras", "poignet", "haut", "boubou", "pantalon", "cuisse", "bas"];
const COUTURE_PROMPT =
  "Un tailleur sénégalais dicte une commande de couture (wolof, français ou les deux mélangés). Remplis les cases avec SES MOTS EXACTS, sans traduire et sans convertir aucun nombre " +
  "(garde « ñeent-fukk ak juróom », « juróomi junni » tels quels ; les nombres dits en français peuvent être écrits en chiffres). " +
  "clientName = nom du client ; telephone = numéro en chiffres s'il est dit ; habit = le modèle (grand boubou, taille basse, kaftan…) ; tissu = le tissu ; " +
  "mesures = chaque mesure dite, dans la bonne case (cou, epaule, poitrine, taille, hanches, manche = longueur de manche, bras = tour de bras, poignet, haut = longueur du haut, " +
  "boubou = longueur du boubou ou de la robe, pantalon = longueur du pantalon ou de la jupe, cuisse, bas = bas du pantalon) ; prixDit = prix de l'habit ; avanceDit = avance payée ; " +
  "jour = jour promis tel que dit (gaawu, samedi, ëllëg…) ; remarque = détails (broderie, col…) ; transcription = toute la phrase mot pour mot. " +
  "Laisse vide ce qui n'est pas dit. N'invente rien. Si c'est inaudible, mets seulement transcription = (inaudible).";
const S = { type: "STRING" };
const COUTURE_SCHEMA = {
  type: "OBJECT",
  properties: {
    transcription: S, clientName: S, telephone: S, habit: S, tissu: S, prixDit: S, avanceDit: S, jour: S, remarque: S,
    mesures: { type: "OBJECT", properties: Object.fromEntries(MEASURE_KEYS.map((k) => [k, S])) },
  },
  required: ["transcription"],
};

async function readCouture(mimeType: string, data: string): Promise<Record<string, unknown>> {
  const e = env();
  const apiKey = e.apiKey?.trim();
  if (!apiKey) throw new GeminiNotConfiguredError();
  const models = [e.model?.trim() || "gemini-3.5-flash", "gemini-flash-lite-latest"];
  let last = 0;
  for (const model of models) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: COUTURE_PROMPT }, { inlineData: { mimeType, data } }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 2048, responseMimeType: "application/json", responseSchema: COUTURE_SCHEMA },
      }),
      signal: AbortSignal.timeout(30_000),
    }).catch(() => null);
    if (!res) continue;
    if (!res.ok) {
      last = res.status;
      continue;
    }
    const json = await res.json().catch(() => null);
    const raw = (json?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p?.text ?? "").join("").trim();
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      // réponse illisible : on essaie le modèle suivant
    }
  }
  throw new AssistantUpstreamError("lecture de la commande impossible", last || 502);
}

// ---------- Studio d'essayage : le client (selfie) habillé avec un modèle de la galerie ----------
// Réservé aux tailleurs payants (type « image » compté par use_assistant). Le selfie n'est jamais stocké.
const IMAGE_MODELS = ["gemini-nano-banana-2.1", "gemini-3.1-flash-lite-image"];
// Consigne en anglais : le modèle d'image la suit mieux (essayage virtuel = virtual try-on).
const TRYON_PROMPT =
  "Virtual try-on. The FIRST image is the customer (a real person). The SECOND image is a fashion catalog photo of an outfit worn by a model. " +
  "Generate ONE new photorealistic full-body photo of the CUSTOMER from the first image wearing EXACTLY the outfit from the second image " +
  "(same cut, colors, fabric, embroidery and accessories such as the head scarf or cap). " +
  "Keep the customer's real face, identity, skin tone, hair and body shape exactly as in the first image: it must clearly be the same person, not the catalog model. " +
  "If the first image is only a selfie (face or upper body), use exactly that face and create a natural matching full body for the same person. " +
  "Natural standing pose, plain light beige studio background, soft light. Add only a small discreet 'Jokko' signature in the bottom right corner. No other text.";

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function tryOn(photo: string, photoType: string, modelId: string): Promise<{ data: string; mimeType: string }> {
  const e = env();
  const apiKey = e.apiKey?.trim();
  if (!apiKey) throw new GeminiNotConfiguredError();
  const { data: row } = await logger.from("couture_models").select("image_path, published").eq("id", modelId).maybeSingle();
  if (!row?.published) throw new AssistantOutputError("modèle introuvable");
  const file = await logger.storage.from("galerie").download(row.image_path);
  if (file.error || !file.data) throw new AssistantUpstreamError("modèle illisible", 502);
  const garment = toBase64(new Uint8Array(await file.data.arrayBuffer()));
  let last = 0;
  for (const model of IMAGE_MODELS) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: TRYON_PROMPT }, { inlineData: { mimeType: photoType, data: photo } }, { inlineData: { mimeType: file.data.type || "image/jpeg", data: garment } }] }],
        generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "3:4", imageSize: "1K" } },
      }),
      signal: AbortSignal.timeout(90_000),
    }).catch(() => null);
    if (!res?.ok) {
      last = res?.status ?? 0;
      continue;
    }
    const out = await res.json().catch(() => null);
    const parts = out?.candidates?.[0]?.content?.parts ?? [];
    const part = parts.find((p: { inlineData?: { data?: string } }) => p?.inlineData?.data);
    if (!part) {
      // Pas d'image : on note la raison (refus, filtre) sans aucune donnée du client.
      console.warn(`[jokko] essayage ${model} : pas d'image (${out?.candidates?.[0]?.finishReason ?? "?"}) ${parts.map((p: { text?: string }) => p?.text ?? "").join(" ").slice(0, 160)}`);
      last = 422;
      continue;
    }
    console.log(`[jokko] essayage ${model} : image ${part.inlineData.mimeType ?? "?"} ${Math.round(part.inlineData.data.length / 1024)} Ko`);
    // JPEG plus léger pour les téléphones (≈ 150 Ko au lieu de 1,5 Mo) ; l'image d'origine si la conversion échoue.
    try {
      const img = await Image.decode(Uint8Array.from(atob(part.inlineData.data), (c) => c.charCodeAt(0)));
      if (img.width > 1024) img.resize(1024, Image.RESIZE_AUTO);
      return { data: toBase64(await img.encodeJPEG(82)), mimeType: "image/jpeg" };
    } catch {
      return { data: part.inlineData.data, mimeType: part.inlineData.mimeType || "image/png" };
    }
  }
  throw new AssistantUpstreamError("essayage impossible", last || 502);
}

// ---------- Offres : chaque appel à Gemini est compté et limité par le serveur (table assistant_usage) ----------
const KIND: Record<string, string> = { live: "direct", listen: "vocal", couture: "vocal", essayage: "image", interpret: "texte", order: "texte", advice: "conseil", stock: "stock", speak: "voix" };
type Quota = { ok: boolean; tier: string; limit: number; used: number; reason?: string };

function quotaMessage(q: Quota, kind: string): string {
  // Essai gratuit : l'enveloppe totale de voix et d'IA est épuisée.
  if (q.reason === "essai" && kind === "image") return "Tu as utilisé ton essayage gratuit. Avec l'offre Avancé, tu essaies 5 modèles par jour sur tes clients. La galerie reste ouverte.";
  if (q.reason === "essai") {
    return "Ton essai gratuit de la voix et de l'IA est terminé. Pour continuer à parler à Jokko, choisis l'offre Médium ou Avancé dans « Mon offre ». Les boutons de l'appli marchent toujours.";
  }
  // Offre gratuite : plafond du mois atteint.
  if (q.reason === "mois") {
    return "Ton forfait gratuit du mois est terminé. Pour continuer à parler à Jokko, choisis l'offre Médium ou Avancé dans « Mon offre ». Les boutons de l'appli marchent toujours.";
  }
  // Plafond de sécurité des comptes gratuits et essais : pause jusqu'à demain.
  if (q.reason === "pause") {
    return "Jokko gratuit est en pause jusqu'à demain. Avec l'offre Médium ou Avancé, Jokko te répond toute la journée. Les boutons de l'appli marchent toujours.";
  }
  // Offre payante : budget Gemini du mois de la boutique atteint. L'écrit continue jusqu'au mois prochain.
  if (q.reason === "budget") {
    return kind === "texte"
      ? "Jokko a beaucoup travaillé pour ta boutique ce mois-ci. Il reprend le mois prochain. Les boutons de l'appli marchent toujours."
      : "Ton forfait voix du mois est terminé. Jusqu'au mois prochain, écris ta demande à Jokko ou utilise les boutons de l'appli.";
  }
  // Garde-fou : plafond global de la journée atteint (tous les clients), ou téléphone qui a servi à trop de comptes.
  if (q.reason === "repos") return "Jokko se repose jusqu'à demain matin. Les boutons de l'appli marchent toujours.";
  if (q.reason === "appareil") return "Ce téléphone a déjà servi à plusieurs comptes d'essai. Pour continuer à parler à Jokko, choisis l'offre Médium ou Avancé dans « Mon offre ». Les boutons de l'appli marchent toujours.";
  if (kind === "voix") return "La voix claire est finie pour aujourd'hui. Jokko continue avec sa voix normale.";
  if (kind === "image") {
    if (q.reason === "essai") return "Tu as utilisé ton essayage gratuit. Avec l'offre Avancé, tu essaies 5 modèles par jour sur tes clients. La galerie reste ouverte.";
    return q.reason === "offre"
      ? "L'essayage fait partie de l'offre Avancé (5 par jour). Choisis-la dans « Mon offre » : la galerie reste ouverte."
      : `Tu as fait tes ${q.limit} essayages d'aujourd'hui. Ça repart demain.`;
  }
  if (kind === "stock") {
    return q.reason === "patron"
      ? "Seul le patron peut remplir le stock."
      : `Tu as déjà fait ${q.limit} lectures de stock aujourd'hui. Continue en écrivant la liste, ou reprends demain.`;
  }
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
      if (!b.ok) return b.res;
      const result = await interpret(b.data, env());
      logCall(req, "texte", result.language ?? b.data.shopContext.language, true);
      return send(req, 200, result);
    }
    if (route === "advice") {
      const b = await body(req, MAX_TEXT_BODY, adviceRequestSchema);
      if (!b.ok) return b.res;
      const result = await advise(b.data, env());
      logCall(req, "conseil", (b.data as { shopContext?: { language?: string } }).shopContext?.language, true);
      return send(req, 200, result);
    }
    if (route === "order") {
      const b = await body(req, MAX_TEXT_BODY, interpretRequestSchema);
      if (!b.ok) return b.res;
      const result = await understandOrder(b.data, env());
      logCall(req, "texte", b.data.shopContext.language, true);
      return send(req, 200, result);
    }
    if (route === "listen") {
      const b = await body(req, MAX_AUDIO_BODY, listenRequestSchema);
      if (!b.ok) return b.res;
      const result = await listen(b.data, env());
      logCall(req, "vocal", result.interpretation?.language ?? b.data.shopContext.language, true);
      return send(req, 200, result);
    }
    if (route === "speak") {
      const b = await body(req, MAX_TEXT_BODY, speakRequestSchema);
      if (!b.ok) return b.res;
      const clip = await speakSentence(b.data.text, b.data.language);
      logCall(req, "voix", b.data.language, Boolean(clip), clip ? 200 : lastVoiceStatus || 502);
      if (!clip) return send(req, 502, { error: "voice_unavailable", message: "La voix ne répond pas pour le moment." });
      return new Response(clip.pcm, { status: 200, headers: { "Content-Type": `audio/l16;rate=${clip.rate}`, "Cache-Control": "no-store", ...cors(req) } });
    }
    if (route === "stock") {
      const b = await body(req, MAX_STOCK_BODY, z.object({
        mode: z.enum(["audio", "photo"]),
        mimeType: z.string().regex(/^(audio|image)\/[a-z0-9.+-]+$/i).max(60),
        data: z.string().min(16).max(MAX_STOCK_BODY),
        lang: z.string().max(4).optional(),
      }));
      if (!b.ok) return b.res;
      if ((b.data.mode === "audio") !== b.data.mimeType.startsWith("audio/")) return send(req, 400, { error: "invalid_request" });
      const text = await readStock(b.data.mode, b.data.mimeType, b.data.data);
      logCall(req, "stock", b.data.lang ?? null, true);
      return send(req, 200, { text });
    }
    if (route === "couture") {
      const b = await body(req, MAX_AUDIO_BODY, z.object({
        mimeType: z.string().regex(/^audio\/[a-z0-9.+-]+$/i).max(60),
        data: z.string().min(16).max(MAX_AUDIO_BODY),
        lang: z.string().max(4).optional(),
      }));
      if (!b.ok) return b.res;
      const fields = await readCouture(b.data.mimeType, b.data.data);
      logCall(req, "vocal", b.data.lang ?? null, true);
      return send(req, 200, fields);
    }
    if (route === "essayage") {
      const b = await body(req, MAX_AUDIO_BODY, z.object({
        modelId: z.string().uuid(),
        mimeType: z.string().regex(/^image\/(jpeg|png|webp)$/i),
        photo: z.string().min(1000).max(MAX_AUDIO_BODY),
      }));
      if (!b.ok) return b.res;
      const image = await tryOn(b.data.photo, b.data.mimeType, b.data.modelId);
      logCall(req, "image", null, true);
      return send(req, 200, image);
    }
    if (route === "live") {
      const b = await body(req, MAX_TEXT_BODY, liveRequestSchema);
      if (!b.ok) return b.res;
      const e = env();
      const session = await createLiveSession(b.data.shopContext, { apiKey: e.apiKey, model: e.liveModel, voice: e.voice, speed: b.data.speed });
      logCall(req, "direct", b.data.shopContext.language, true);
      return send(req, 200, session);
    }
    return send(req, 404, { error: "not_found" });
  } catch (error) {
    console.warn("[jokko] failure:", error instanceof Error ? error.message : "");
    const status = error instanceof AssistantUpstreamError || error instanceof LiveUnavailableError ? error.status : undefined;
    if (route && LOG_KIND[route]) logCall(req, LOG_KIND[route], null, false, status ?? 500);
    return failure(req, error);
  }
});
