// Jokko — remplit la galerie commune des tailleurs (Studio d'essayage) avec des modèles signés Jokko.
// Appelée seulement par le serveur (jeton interne galerie_token de private.app_config, jamais affiché).
// POST { token, title, category: homme|femme|enfant, garment, fabric, prompt } → une image ajoutée à la galerie.
// POST { token, action: "suivant" } → prend le prochain modèle de la file (console admin) et le fabrique.
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

// ---------- Fabrique : chaque modèle est tiré au hasard dans le style de la rubrique (variété sans doublons visibles) ----------
const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];
const GARMENTS: Record<string, string[]> = {
  femme: ["grand boubou ample", "taille basse (haut ajusté et jupe longue)", "ndokette à volants", "long kaftan fluide", "robe sirène", "robe droite mi-longue", "ensemble tunique longue et pantalon", "tenue trois pièces camisole, pagne et foulard", "robe longue évasée", "deux-pièces haut court et jupe crayon", "robe portefeuille longue"],
  homme: ["grand boubou trois pièces", "caftan long col officier", "tunique mi-longue et pantalon droit", "costume africain veste col mao", "agbada très ample", "djellaba à capuche", "chemise manches courtes et pantalon", "ensemble chemise longue et pantalon", "boubou court et pantalon"],
  enfant: ["petit boubou de fête", "robe évasée", "taille basse", "petit caftan", "ensemble chemise et pantalon", "robe à volants", "tunique et pantalon"],
};
const FABRICS = ["bazin riche", "wax", "lin", "soie sauvage", "coton brodé", "bazin getzner", "dentelle et bazin", "basin damassé"];
const COLORS = ["bleu roi", "blanc", "crème", "vert émeraude", "jaune safran", "bordeaux", "rose fuchsia", "violet", "orange brûlé", "gris anthracite", "bleu ciel", "noir", "doré", "marron chocolat", "vert olive", "corail", "turquoise"];
const DETAILS = ["broderie dorée au col et sur la poitrine", "broderie argentée fine", "broderie ton sur ton", "broderie blanche épaisse", "motifs wax géométriques", "petits boutons dorés", "manches évasées", "col rond brodé", "plastron brodé", "liseré contrasté"];
const OCCASIONS: Record<string, { label: string; style: string }> = {
  quotidien: { label: "", style: "tenue de tous les jours, simple et élégante, facile à porter au travail" },
  nouveautes: { label: "Tendance", style: "tendance mode africaine 2026, coupe moderne et originale" },
  tabaski: { label: "Tabaski", style: "tenue de fête de Tabaski, riche et brillante, très soignée" },
  korite: { label: "Korité", style: "tenue de fête de Korité, élégante, couleurs lumineuses" },
  magal: { label: "Magal", style: "tenue sobre et pudique pour le Magal de Touba, longue et couvrante" },
  mariage: { label: "Mariage", style: "tenue de mariage très riche et raffinée, broderies abondantes" },
  bapteme: { label: "Baptême", style: "tenue élégante pour un baptême (ngénte)" },
  ceremonie: { label: "Cérémonie", style: "tenue de cérémonie ou de soirée, chic" },
};
const AGES: Record<string, string> = {
  bebe: "bébé de 1 à 2 ans", petit: "enfant de 3 à 5 ans", enfant: "enfant de 6 à 9 ans", preado: "préadolescent de 10 à 13 ans", ado: "adolescent de 14 à 17 ans",
  jeune: "jeune adulte de 20 à 30 ans", adulte: "adulte de 30 à 50 ans", senior: "personne de plus de 50 ans",
};
function invent(category: string, occasion: string, age: string) {
  const occ = OCCASIONS[occasion] ?? OCCASIONS.quotidien;
  const garment = pick(GARMENTS[category] ?? GARMENTS.femme);
  const fabric = occasion === "magal" && Math.random() < 0.6 ? "bazin" : pick(FABRICS);
  const color = occasion === "magal" && Math.random() < 0.6 ? pick(["blanc", "crème", "bleu ciel", "beige"]) : pick(COLORS);
  const detail = pick(DETAILS);
  const who = category === "enfant"
    ? `${Math.random() < 0.5 ? "petite fille" : "petit garçon"}, ${AGES[age] ?? AGES.enfant}`
    : `${category === "homme" ? "homme" : "femme"}, ${AGES[age] ?? AGES.adulte}`;
  const head = category === "femme" ? pick(["foulard assorti noué sur la tête", "tête nue, cheveux tressés", "foulard élégant"]) : category === "homme" ? pick(["bonnet assorti", "tête nue", "kufi blanc"]) : "";
  const short = garment.split(/[(,]/)[0].replace(/ (ample|long|longue|très)$/,"").trim();
  const title = [short.charAt(0).toUpperCase() + short.slice(1), occ.label, `${fabric.split(" ")[0]} ${color}`].filter(Boolean).join(" · ");
  return {
    title,
    garment: short,
    fabric: `${fabric} ${color}`,
    prompt: `${who}, en ${garment} en ${fabric} ${color}, ${detail}${head ? `, ${head}` : ""}. Style : ${occ.style}.`,
  };
}

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
  // File de la console admin : un modèle à la fois.
  let job: { id: string; category: string; occasion: string; age: string } | null = null;
  if (body.action === "suivant") {
    const { data } = await admin.rpc("studio_next");
    job = Array.isArray(data) && data[0] ? data[0] : null;
    if (!job) return json(200, { rien: true });
    Object.assign(body, invent(job.category, job.occasion, job.age), { category: job.category });
  }
  const finish = async (model: string | null, error: string | null) => {
    if (job) await admin.rpc("studio_done", { p_id: job.id, p_model: model, p_error: error });
  };
  const category = ["homme", "femme", "enfant"].includes(body.category) ? body.category : null;
  if (!category || !body.title || !body.prompt) {
    await finish(null, "demande incomplète");
    return json(400, { error: "invalid_request" });
  }
  const apiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
  if (!apiKey) {
    await finish(null, "clé Gemini absente");
    return json(503, { error: "gemini_not_configured" });
  }

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
  if (!png) {
    await finish(null, `Gemini ${last || "réseau"}`);
    return json(502, { error: "image_indisponible", status: last });
  }

  const id = crypto.randomUUID();
  const [full, thumb] = [await jpeg(png, 1024), await jpeg(png, 360)];
  const ext = (t: string) => (t === "image/jpeg" ? "jpg" : "png");
  const imagePath = `modeles/${id}.${ext(full.type)}`;
  const thumbPath = `vignettes/${id}.${ext(thumb.type)}`;
  const up1 = await admin.storage.from("galerie").upload(imagePath, full.data, { contentType: full.type, upsert: true });
  const up2 = await admin.storage.from("galerie").upload(thumbPath, thumb.data, { contentType: thumb.type, upsert: true });
  if (up1.error || up2.error) {
    await finish(null, "stockage");
    return json(500, { error: "stockage", detail: (up1.error ?? up2.error)?.message });
  }
  const { error } = await admin.from("couture_models").insert({
    id, title: body.title, category, garment: body.garment ?? "", fabric: body.fabric ?? "", image_path: imagePath, thumb_path: thumbPath,
    occasion: job?.occasion ?? body.occasion ?? "quotidien", age: job?.age || body.age || (category === "enfant" ? "enfant" : "adulte"),
  });
  if (error) {
    await finish(null, "base");
    return json(500, { error: "base", detail: error.message });
  }
  await finish(id, null);
  return json(200, { id, image_path: imagePath, size: full.data.length, thumb: thumb.data.length });
});
