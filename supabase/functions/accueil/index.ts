// Jokko — images de la page d'accueil (diaporama des métiers), fabriquées une fois par Gemini.
// Appelée seulement par le serveur (jeton interne galerie_token, jamais affiché).
// POST { token, id, prompt } → galerie/accueil/<id>-v1.jpg (900 px de large, JPEG ≈ 120 Ko).
// POST { token, action: "voix", id, text, lang } → galerie/accueil/voix/<id>.wav (voix Sulafat, wolof ou français, pour les vidéos).
import { createClient } from "npm:@supabase/supabase-js@2";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});
const IMAGE_MODELS = ["gemini-nano-banana-2.1", "gemini-3.1-flash-lite-image"];
const STYLE =
  "Photorealistic professional advertising photograph, shot on a full-frame camera, 35mm lens, shallow depth of field, warm natural golden light. " +
  "Set in Dakar, Senegal. Real, modern, clean and well-organized business, aspirational but authentic. " +
  "The Senegalese owner smiles and speaks into a smartphone held near the mouth, like sending a voice message. " +
  "Vertical composition with calm space at the top and bottom for text overlay. Absolutely no text, no letters, no logos, no watermark in the image.";

// Voix des vidéos : 3.1 suit la consigne de ton sans la lire ; les 3.8 prennent le relais après le 17/11/2026.
const TTS = ["gemini-3.1-flash-tts-preview", "gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"];
const DIRECTION: Record<string, string> = {
  wo: "Dis en wolof de Dakar, d'une voix chaleureuse, souriante et énergique, comme un commerçant fier qui présente un service à la radio, à un rythme vif mais clair. Prononce bien les mots français mélangés :",
  fr: "Dis en français, avec un léger accent sénégalais, d'une voix chaleureuse, souriante et énergique, à un rythme vif mais clair :",
};
function wav(pcm: Uint8Array, rate: number): Uint8Array {
  const out = new Uint8Array(44 + pcm.length); const v = new DataView(out.buffer);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i); };
  w(0, "RIFF"); v.setUint32(4, 36 + pcm.length, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, pcm.length, true);
  out.set(pcm, 44); return out;
}
async function voix(body: Record<string, string>, apiKey: string): Promise<Response> {
  const lang = body.lang === "fr" ? "fr" : "wo";
  if (!/^[a-z0-9-]{3,40}$/.test(body.id ?? "") || !body.text || body.text.length > 600) return json(400, { error: "invalid_request" });
  let last = 0;
  for (const model of TTS) {
    const text = model.startsWith("gemini-3.8") ? body.text : `${DIRECTION[lang]} ${body.text}`;
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: body.voice || "Sulafat" } } } } }),
      signal: AbortSignal.timeout(60_000),
    }).catch(() => null);
    last = res?.status ?? 0;
    await admin.from("gemini_calls").insert({ shop_id: null, kind: "voix", lang, ok: Boolean(res?.ok), status: last || 502 });
    if (!res?.ok) continue;
    const out = await res.json().catch(() => null);
    const chunks: Uint8Array[] = []; let rate = 24000;
    for (const p of out?.candidates?.[0]?.content?.parts ?? []) {
      if (!p?.inlineData?.data) continue;
      rate = Number(/rate=(\d+)/i.exec(p.inlineData.mimeType ?? "")?.[1] ?? 24000);
      chunks.push(Uint8Array.from(atob(p.inlineData.data), (c) => c.charCodeAt(0)));
    }
    const size = chunks.reduce((n, c) => n + c.length, 0);
    if (!size) continue;
    const pcm = new Uint8Array(size); let o = 0; for (const c of chunks) { pcm.set(c, o); o += c.length; }
    const path = `accueil/voix/${body.id}.wav`;
    const up = await admin.storage.from("galerie").upload(path, wav(pcm, rate), { contentType: "audio/wav", upsert: true });
    if (up.error) return json(500, { error: "stockage" });
    return json(200, { path, secondes: Math.round((size / 2 / rate) * 100) / 100, model });
  }
  return json(502, { error: "gemini", status: last });
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const body = (await req.json().catch(() => null)) as Record<string, string> | null;
  if (!body?.token) return json(401, { error: "jeton" });
  const { data: ok } = await admin.rpc("galerie_token_ok", { p_token: body.token });
  if (ok !== true) return json(401, { error: "jeton" });
  const apiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
  if (!apiKey) return json(503, { error: "gemini_not_configured" });
  if (body.action === "voix") return voix(body, apiKey);
  if (!/^[a-z-]{3,30}$/.test(body.id ?? "") || !body.prompt) return json(400, { error: "invalid_request" });

  let last = 0;
  for (const model of IMAGE_MODELS) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `${body.prompt} ${STYLE}` }] }],
        generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "4:5", imageSize: "1K" } },
      }),
      signal: AbortSignal.timeout(100_000),
    }).catch(() => null);
    last = res?.status ?? 0;
    await admin.from("gemini_calls").insert({ shop_id: null, kind: "image", ok: Boolean(res?.ok), status: last || 502 });
    if (!res?.ok) continue;
    const out = await res.json().catch(() => null);
    const part = (out?.candidates?.[0]?.content?.parts ?? []).find((p: { inlineData?: { data?: string } }) => p?.inlineData?.data);
    if (!part) continue;
    const img = await Image.decode(Uint8Array.from(atob(part.inlineData.data), (c) => c.charCodeAt(0)));
    if (img.width > 900) img.resize(900, Image.RESIZE_AUTO);
    const jpeg = await img.encodeJPEG(80);
    const path = `accueil/${body.id}-v1.jpg`;
    const up = await admin.storage.from("galerie").upload(path, jpeg, { contentType: "image/jpeg", upsert: true, cacheControl: "31536000" });
    if (up.error) return json(500, { error: "stockage" });
    return json(200, { path, ko: Math.round(jpeg.length / 1024), model });
  }
  return json(502, { error: "gemini", status: last });
});
