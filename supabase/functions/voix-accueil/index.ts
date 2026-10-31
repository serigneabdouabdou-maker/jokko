// Jokko — fabrique une seule fois l'audio de présentation de la page d'accueil (wolof + français),
// puis le range dans le stockage public « media ». Les visiteurs écoutent ce fichier : aucun appel à Gemini.
// Protégé par un jeton (seule son empreinte est ici). La clé Gemini reste dans les secrets du serveur.
import { createClient } from "npm:@supabase/supabase-js@2";
import { Mp3Encoder } from "npm:@breezystack/lamejs@1.2.7";

const TOKEN_SHA256 = "3d62ab672ee789ec762874047c7022f06a9fde248998856fc002e31dd8da83c9";
const MODELS = ["gemini-3.1-flash-tts-preview", "gemini-3.8-flash-lite-tts", "gemini-2.5-flash-preview-tts"];
const READS_DIRECTIONS_ALOUD = /^gemini-3\.8/;
const DIRECTION: Record<string, string> = {
  wo: "Dis en wolof de Dakar, clairement et lentement, d'une voix chaleureuse, souriante et rassurante, comme un ami commerçant qui présente un service :",
  fr: "Dis en français, avec un léger accent sénégalais, clairement, d'une voix chaleureuse, souriante et rassurante :",
};

type Segment = { lang: "wo" | "fr"; text: string; pauseAfter?: number };

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function speak(segment: Segment, voice: string, apiKey: string): Promise<{ pcm: Int16Array; rate: number; model: string }> {
  let lastError = "";
  for (const model of MODELS) {
    const text = READS_DIRECTIONS_ALOUD.test(model) ? segment.text : `${DIRECTION[segment.lang]} ${segment.text}`;
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
      }),
    });
    if (!res.ok) {
      lastError = `${model}: ${res.status}`;
      continue;
    }
    const json = await res.json();
    const parts = json?.candidates?.[0]?.content?.parts ?? [];
    const chunks: Uint8Array[] = [];
    let rate = 24000;
    for (const p of parts) {
      if (!p?.inlineData?.data) continue;
      rate = Number(/rate=(\d+)/i.exec(p.inlineData.mimeType ?? "")?.[1] ?? 24000);
      chunks.push(decodeBase64(p.inlineData.data));
    }
    const size = chunks.reduce((n, c) => n + c.length, 0);
    if (!size) {
      lastError = `${model}: pas d'audio`;
      continue;
    }
    const bytes = new Uint8Array(size);
    let o = 0;
    for (const c of chunks) {
      bytes.set(c, o);
      o += c.length;
    }
    return { pcm: new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2)), rate, model };
  }
  throw new Error(lastError || "voix indisponible");
}

/** Retire le silence au début et à la fin d'un morceau (pour un enchaînement net). */
function trim(pcm: Int16Array, rate: number): Int16Array {
  const limit = 500;
  let a = 0;
  let b = pcm.length - 1;
  while (a < b && Math.abs(pcm[a]) < limit) a++;
  while (b > a && Math.abs(pcm[b]) < limit) b--;
  const pad = Math.round(rate * 0.06);
  return pcm.subarray(Math.max(0, a - pad), Math.min(pcm.length, b + pad));
}

function toMp3(pcm: Int16Array, rate: number): Uint8Array {
  const enc = new Mp3Encoder(1, rate, 64);
  const out: Uint8Array[] = [];
  for (let i = 0; i < pcm.length; i += 1152) {
    const buf = enc.encodeBuffer(pcm.subarray(i, i + 1152));
    if (buf.length) out.push(new Uint8Array(buf));
  }
  const end = enc.flush();
  if (end.length) out.push(new Uint8Array(end));
  const size = out.reduce((n, c) => n + c.length, 0);
  const mp3 = new Uint8Array(size);
  let o = 0;
  for (const c of out) {
    mp3.set(c, o);
    o += c.length;
  }
  return mp3;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });
  if ((await sha256(req.headers.get("x-jokko-voix") ?? "")) !== TOKEN_SHA256) return new Response("forbidden", { status: 403 });
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return new Response("not_configured", { status: 503 });
  const body = await req.json().catch(() => ({}));
  const segments: Segment[] = Array.isArray(body.segments) ? body.segments : [];
  const name = typeof body.name === "string" && /^[a-z0-9-]+$/.test(body.name) ? body.name : "jokko-accueil";
  const voice = typeof body.voice === "string" ? body.voice : Deno.env.get("GEMINI_TTS_VOICE") || "Sulafat";
  if (!segments.length || segments.length > 12) return new Response("bad_request", { status: 400 });

  try {
    const pieces: Int16Array[] = [];
    const timing: { lang: string; start: number; end: number; model: string }[] = [];
    let rate = 24000;
    let t = 0;
    for (const s of segments) {
      const spoken = await speak(s, voice, apiKey);
      rate = spoken.rate;
      const clean = trim(spoken.pcm, rate);
      const pause = new Int16Array(Math.round(rate * (s.pauseAfter ?? 0.45)));
      timing.push({ lang: s.lang, start: +t.toFixed(2), end: +(t + clean.length / rate).toFixed(2), model: spoken.model });
      t += (clean.length + pause.length) / rate;
      pieces.push(clean, pause);
    }
    const total = pieces.reduce((n, p) => n + p.length, 0);
    const pcm = new Int16Array(total);
    let o = 0;
    for (const p of pieces) {
      pcm.set(p, o);
      o += p.length;
    }
    const mp3 = toMp3(pcm, rate);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const path = `voix/${name}.mp3`;
    const { error } = await admin.storage.from("media").upload(path, mp3, { contentType: "audio/mpeg", upsert: true, cacheControl: "31536000" });
    if (error) throw new Error(`stockage: ${error.message}`);
    const report = { ok: true, path, bytes: mp3.length, seconds: +(total / rate).toFixed(2), voice, timing };
    // Le moment de chaque phrase, pour les sous-titres de la page d'accueil.
    await admin.storage.from("media").upload(`voix/${name}.json`, new Blob([JSON.stringify(report)], { type: "application/json" }), { contentType: "application/json", upsert: true });
    return Response.json(report);
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "erreur" }, { status: 500 });
  }
});
