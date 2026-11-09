// Jokko — images de la page d'accueil (diaporama des métiers), fabriquées une fois par Gemini.
// Appelée seulement par le serveur (jeton interne galerie_token, jamais affiché).
// POST { token, id, prompt } → galerie/accueil/<id>-v1.jpg (900 px de large, JPEG ≈ 120 Ko).
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

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const body = (await req.json().catch(() => null)) as Record<string, string> | null;
  if (!body?.token) return json(401, { error: "jeton" });
  const { data: ok } = await admin.rpc("galerie_token_ok", { p_token: body.token });
  if (ok !== true) return json(401, { error: "jeton" });
  if (!/^[a-z-]{3,30}$/.test(body.id ?? "") || !body.prompt) return json(400, { error: "invalid_request" });
  const apiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
  if (!apiKey) return json(503, { error: "gemini_not_configured" });

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
