// Jokko — remplit la galerie commune des tailleurs (Studio d'essayage) avec des modèles signés Jokko.
// Appelée seulement par le serveur (jeton interne galerie_token de private.app_config, jamais affiché).
// POST { token, title, category: homme|femme|enfant, garment, fabric, prompt } → une image ajoutée à la galerie.
import { createClient } from "npm:@supabase/supabase-js@2";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});
// Le moins cher et le meilleur pour la mode : Nano Banana 2.1 (≈ 20 F l'image 1K), puis la version légère.
const IMAGE_MODELS = ["gemini-nano-banana-2.1", "gemini-3.1-flash-lite-image"];

const STYLE =
  "Photo de mode réaliste, qualité catalogue, en pied (de la tête aux pieds), mannequin d'Afrique de l'Ouest (Sénégal), pose naturelle et élégante, " +
  "fond uni beige clair de studio, lumière douce. Le vêtement est bien visible : coupe, broderie, tissu. " +
  "Aucun texte sur l'image sauf une petite signature discrète « Jokko » en bas à droite. Aucun logo de marque.";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Image légère pour les téléphones : JPEG (≈ 150 Ko en grand, ≈ 25 Ko en vignette). PNG d'origine si la conversion échoue. */
async function jpeg(bytes: Uint8Array, width: number): Promise<{ data: Uint8Array; type: string }> {
  try {
    const img = await Image.decode(bytes);
    if (img.width > width) img.resize(width, Image.RESIZE_AUTO);
    return { data: await img.encodeJPEG(width > 500 ? 82 : 70), type: "image/jpeg" };
  } catch {
    return { data: bytes, type: "image/png" };
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const body = (await req.json().catch(() => null)) as Record<string, string> | null;
  if (!body?.token) return json(401, { error: "jeton" });
  const { data: ok } = await admin.rpc("galerie_token_ok", { p_token: body.token });
  if (ok !== true) return json(401, { error: "jeton" });
  const category = ["homme", "femme", "enfant"].includes(body.category) ? body.category : null;
  if (!category || !body.title || !body.prompt) return json(400, { error: "invalid_request" });
  const apiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
  if (!apiKey) return json(503, { error: "gemini_not_configured" });

  let png: Uint8Array | null = null;
  let last = 0;
  for (const model of IMAGE_MODELS) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `${STYLE}\n\nTenue : ${body.prompt}` }] }],
        generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "3:4", imageSize: "1K" } },
      }),
      signal: AbortSignal.timeout(90_000),
    }).catch(() => null);
    if (!res?.ok) {
      last = res?.status ?? 0;
      console.warn(`[galerie] ${model} : échec ${last || "réseau"} ${res ? (await res.text()).slice(0, 200) : ""}`);
      continue;
    }
    const out = await res.json().catch(() => null);
    const part = (out?.candidates?.[0]?.content?.parts ?? []).find((p: { inlineData?: { data?: string } }) => p?.inlineData?.data);
    if (part) {
      png = fromBase64(part.inlineData.data);
      break;
    }
  }
  if (!png) return json(502, { error: "image_indisponible", status: last });

  const id = crypto.randomUUID();
  const [full, thumb] = [await jpeg(png, 1024), await jpeg(png, 360)];
  const ext = (t: string) => (t === "image/jpeg" ? "jpg" : "png");
  const imagePath = `modeles/${id}.${ext(full.type)}`;
  const thumbPath = `vignettes/${id}.${ext(thumb.type)}`;
  const up1 = await admin.storage.from("galerie").upload(imagePath, full.data, { contentType: full.type, upsert: true });
  const up2 = await admin.storage.from("galerie").upload(thumbPath, thumb.data, { contentType: thumb.type, upsert: true });
  if (up1.error || up2.error) return json(500, { error: "stockage", detail: (up1.error ?? up2.error)?.message });
  const { error } = await admin.from("couture_models").insert({
    id, title: body.title, category, garment: body.garment ?? "", fabric: body.fabric ?? "", image_path: imagePath, thumb_path: thumbPath,
  });
  if (error) return json(500, { error: "base", detail: error.message });
  return json(200, { id, image_path: imagePath, size: full.data.length, thumb: thumb.data.length });
});
