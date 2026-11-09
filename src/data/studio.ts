/**
 * Studio d'essayage des tailleurs : galerie commune de modèles signés Jokko, et essayage IA sur la photo du client.
 * La galerie est gratuite à regarder ; l'essayage est réservé aux offres Médium et Avancé (compté par le serveur).
 * La photo du client part seulement vers Gemini (par le serveur de Jokko) et n'est jamais gardée.
 */
import { api, SUPABASE_URL, supabase } from "./supabase";

export type CoutureModel = { id: string; title: string; category: "homme" | "femme" | "enfant"; garment: string; fabric: string; image_path: string; thumb_path: string | null };
export const CATEGORIES: { id: CoutureModel["category"]; label: string }[] = [
  { id: "femme", label: "Femme" },
  { id: "homme", label: "Homme" },
  { id: "enfant", label: "Enfant" },
];

export const galleryUrl = (path: string) => `${SUPABASE_URL}/storage/v1/object/public/galerie/${path}`;

export async function loadModels(): Promise<CoutureModel[]> {
  const { data } = await supabase.from("couture_models").select("id, title, category, garment, fabric, image_path, thumb_path").order("created_at", { ascending: false }).limit(300);
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
