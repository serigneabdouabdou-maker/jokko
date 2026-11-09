/**
 * Studio d'essayage des tailleurs : galerie commune de modèles signés Jokko, et essayage IA sur la photo du client.
 * La galerie est gratuite à regarder ; l'essayage est réservé aux offres Médium et Avancé (compté par le serveur).
 * La photo du client part seulement vers Gemini (par le serveur de Jokko) et n'est jamais gardée.
 */
import { api, SUPABASE_URL, supabase } from "./supabase";

export type CoutureModel = { id: string; title: string; category: "homme" | "femme" | "enfant"; garment: string; fabric: string; image_path: string; thumb_path: string | null; occasion?: string; age?: string; created_at?: string; views?: string[] };

/** Rubriques du Studio (occasions de l'année au Sénégal). « nouveautes » = les modèles arrivés ces 14 derniers jours. */
export const OCCASIONS: { id: string; label: string }[] = [
  { id: "nouveautes", label: "Nouveautés" },
  { id: "tabaski", label: "Tabaski" },
  { id: "korite", label: "Korité" },
  { id: "magal", label: "Magal" },
  { id: "mariage", label: "Mariage" },
  { id: "bapteme", label: "Baptême" },
  { id: "ceremonie", label: "Cérémonie" },
  { id: "quotidien", label: "Tous les jours" },
];

/** Tranches d'âge (enfants et adultes). */
export const AGES: { id: string; label: string; for: "enfant" | "adulte" }[] = [
  { id: "bebe", label: "1-2 ans", for: "enfant" },
  { id: "petit", label: "3-5 ans", for: "enfant" },
  { id: "enfant", label: "6-9 ans", for: "enfant" },
  { id: "preado", label: "10-13 ans", for: "enfant" },
  { id: "ado", label: "14-17 ans", for: "enfant" },
  { id: "jeune", label: "20-30 ans", for: "adulte" },
  { id: "adulte", label: "30-50 ans", for: "adulte" },
  { id: "senior", label: "50 ans et +", for: "adulte" },
];

const NEW_DAYS = 14;
export const isNew = (m: CoutureModel, now = Date.now()) => Boolean(m.created_at) && now - new Date(m.created_at as string).getTime() < NEW_DAYS * 86_400_000;

/** Filtre de la galerie : genre, rubrique (ou « toutes »), tranche d'âge (ou « tous »). */
export function filterModels(models: CoutureModel[], category: string, occasion: string, age: string, now = Date.now()): CoutureModel[] {
  return models.filter(
    (m) =>
      m.category === category &&
      (occasion === "tout" || (occasion === "nouveautes" ? isNew(m, now) || m.occasion === "nouveautes" : (m.occasion ?? "quotidien") === occasion)) &&
      (age === "tout" || m.age === age),
  );
}
export const CATEGORIES: { id: CoutureModel["category"]; label: string }[] = [
  { id: "femme", label: "Femme" },
  { id: "homme", label: "Homme" },
  { id: "enfant", label: "Enfant" },
];

export const galleryUrl = (path: string) => `${SUPABASE_URL}/storage/v1/object/public/galerie/${path}`;

export async function loadModels(): Promise<CoutureModel[]> {
  const { data } = await supabase.from("couture_models").select("id, title, category, garment, fabric, image_path, thumb_path, occasion, age, created_at, views").order("created_at", { ascending: false }).limit(1000);
  return (data ?? []) as CoutureModel[];
}

/** Photo du client réduite (1024 px, JPEG) : rapide à envoyer même avec une petite connexion. */
export async function shrinkPhoto(file: File): Promise<{ data: string; mimeType: string }> {
  let blob: Blob = file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.85));
  } catch {
    // ancien téléphone : la photo telle quelle
  }
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return { data, mimeType: blob.type === "image/png" || blob.type === "image/webp" ? blob.type : "image/jpeg" };
}

export type TryOnResult = { ok: true; src: string } | { ok: false; message: string };

export async function tryOn(model: CoutureModel, photo: File): Promise<TryOnResult> {
  const small = await shrinkPhoto(photo);
  if (small.data.length > 2_800_000) return { ok: false, message: "La photo est trop lourde. Reprends-la sans zoom." };
  let response: Response;
  try {
    response = await api("essayage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modelId: model.id, mimeType: small.mimeType, photo: small.data }) });
  } catch {
    return { ok: false, message: "Jokko ne joint pas le serveur. Vérifie la connexion." };
  }
  const body = (await response.json().catch(() => null)) as { data?: string; mimeType?: string; message?: string } | null;
  if (response.ok && body?.data) return { ok: true, src: `data:${body.mimeType ?? "image/jpeg"};base64,${body.data}` };
  return { ok: false, message: body?.message ?? "L'essayage ne marche pas pour le moment. Réessaie dans un instant." };
}

/** Partage de l'image d'essayage (WhatsApp…) ; sinon téléchargement. */
export async function shareImage(src: string, title: string): Promise<void> {
  const blob = await (await fetch(src)).blob();
  const file = new File([blob], `jokko-essayage.${blob.type === "image/png" ? "png" : "jpg"}`, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], title, text: `${title} · essayage Jokko` }).catch(() => undefined);
    return;
  }
  const a = document.createElement("a");
  a.href = src;
  a.download = file.name;
  a.click();
}

// ---------- Fabrique de modèles (console admin) ----------

export type StudioStats = {
  prix_image: number; prix_essayage: number; plafond_jour: number;
  fabriques_jour: number; fabriques_mois: number; erreurs_jour: number; en_attente: number;
  essayages_jour: number; essayages_mois: number; galerie_total: number;
  par_rubrique: { category: string; occasion: string; n: number }[];
  jours: { jour: string; faits: number; erreurs: number }[];
};

export async function studioStats(): Promise<StudioStats | null> {
  const { data, error } = await supabase.rpc("studio_stats");
  return error ? null : (data as StudioStats);
}

export async function studioEnqueue(category: string, occasion: string, age: string, count: number): Promise<{ ajoutes: number; cout_estime: number } | null> {
  const { data, error } = await supabase.rpc("studio_enqueue", { p_category: category, p_occasion: occasion, p_age: age, p_count: count });
  return error ? null : (data as { ajoutes: number; cout_estime: number });
}

export async function studioCancel(): Promise<number> {
  const { data } = await supabase.rpc("studio_cancel");
  return typeof data === "number" ? data : 0;
}

export async function studioHide(id: string): Promise<boolean> {
  const { error } = await supabase.rpc("studio_hide", { p_id: id });
  return !error;
}

/** Réglages de la fabrique (prix d'une image, plafond par jour) : dans les réglages de la console. */
export const FACTORY_KEYS = ["cout_image_galerie", "plafond_images_jour", "images_par_minute"] as const;

export async function studioSetCap(cap: number): Promise<boolean> {
  const { error } = await supabase.rpc("studio_set_cap", { p_cap: cap });
  return !error;
}

// ---------- Partage d'un modèle (WhatsApp) ----------

/** Les photos d'un modèle pour le faire tourner : face, puis profil et dos s'il les a. */
export const framesOf = (m: Pick<CoutureModel, "image_path" | "views">) => [m.image_path, ...(m.views ?? [])];

/** Lien public du modèle : le client l'ouvre sans compte et peut commander chez l'atelier qui l'a envoyé. */
export const modelLink = (id: string, shopId?: string, origin = typeof window !== "undefined" ? window.location.origin : "https://jokkoapp.com") =>
  `${origin}/?modele=${id}${shopId ? `&t=${encodeURIComponent(shopId)}` : ""}`;

/** Envoie le modèle sur WhatsApp : la photo + le lien (partage du téléphone), sinon le lien seul dans WhatsApp. */
export async function shareModel(m: CoutureModel, name: string, shopId?: string, shopName?: string): Promise<void> {
  const link = modelLink(m.id, shopId);
  const text = `${name}${shopName ? ` chez ${shopName}` : ""} : regarde ce modèle et commande-le ici 👉 ${link}`;
  const nav = navigator as Navigator & { canShare?: (d: { files?: File[] }) => boolean };
  try {
    const blob = await (await fetch(galleryUrl(m.image_path))).blob();
    const file = new File([blob], `jokko-${name.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}.jpg`, { type: blob.type || "image/jpeg" });
    if (nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], text, title: name });
      return;
    }
  } catch {
    // pas de partage de photo sur ce téléphone : on envoie le lien
  }
  if (nav.share) {
    await nav.share({ text, title: name, url: link }).catch(() => undefined);
    return;
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
}

/** Enregistre la photo du modèle dans le téléphone. */
export async function downloadModel(m: CoutureModel, name: string): Promise<void> {
  try {
    const blob = await (await fetch(galleryUrl(m.image_path))).blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jokko-${name.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch {
    window.open(galleryUrl(m.image_path), "_blank", "noopener");
  }
}

export type PublicModel = { id: string; titre: string; habit: string; tissu: string; image: string; vues: string[] | null; atelier: string | null; telephone: string | null };

export async function loadPublicModel(id: string, shopId: string | null): Promise<PublicModel | null> {
  const { data, error } = await supabase.rpc("modele_public", { p_id: id, p_shop: shopId });
  return error || !data ? null : (data as PublicModel);
}
