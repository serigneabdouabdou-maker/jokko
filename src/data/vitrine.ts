/**
 * Vitrine : la page publique de l'entreprise (jokkoapp.com/?v=<code>), à mettre en statut WhatsApp,
 * sur Facebook ou dans la bio TikTok. Le client regarde sans compte et commande sur WhatsApp.
 */
import type { Product, Shop } from "../model";
import { SUPABASE_URL, supabase } from "./supabase";

export type VitrineSettings = { slug: string; open: boolean; bio: string; models: string[] };

export const vitrinePhotoUrl = (path: string) => `${SUPABASE_URL}/storage/v1/object/public/vitrine/${path}`;
export const vitrineLink = (slug: string, origin = typeof window !== "undefined" ? window.location.origin : "https://jokkoapp.com") => `${origin}/?v=${slug}`;

/** Réglages de la vitrine (null si elle n'a jamais été ouverte). */
export async function loadVitrine(shopId: string): Promise<VitrineSettings | null> {
  const { data } = await supabase.from("vitrines").select("slug, open, bio, models").eq("shop_id", shopId).maybeSingle();
  return data ? (data as VitrineSettings) : null;
}

/** Ouvre ou règle la vitrine (patron). Le code court est créé la première fois. */
export async function saveVitrine(shopId: string, change: { open?: boolean; bio?: string; models?: string[] }): Promise<VitrineSettings | null> {
  const { data, error } = await supabase.rpc("vitrine_save", { p_shop: shopId, p_open: change.open ?? null, p_bio: change.bio ?? null, p_models: change.models ?? null });
  return error ? null : (data as VitrineSettings);
}

/** Photo d'article réduite (900 px, JPEG ≈ 100 Ko) puis déposée dans le dossier de l'entreprise. Renvoie le chemin. */
export async function uploadProductPhoto(shopId: string, productId: string, file: File): Promise<string | null> {
  let blob: Blob = file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.82));
  } catch {
    // ancien téléphone : la photo telle quelle
  }
  // Nouveau nom à chaque photo : les téléphones des clients ne gardent pas l'ancienne en mémoire.
  const path = `${shopId}/${productId}-${Date.now().toString(36)}.jpg`;
  const { error } = await supabase.storage.from("vitrine").upload(path, blob, { contentType: "image/jpeg", upsert: true });
  return error ? null : path;
}

/** Montre ou cache un article sur la vitrine. */
export const setInVitrine = (shop: Shop, productId: string, on: boolean): Shop => ({
  ...shop,
  products: shop.products.map((p) => (p.id === productId ? { ...p, vitrine: on } : p)),
});

export const setProductPhoto = (shop: Shop, productId: string, path: string): Shop => ({
  ...shop,
  products: shop.products.map((p): Product => (p.id === productId ? { ...p, photoPath: path, vitrine: true } : p)),
});

/** Message prêt à envoyer avec le lien (statut WhatsApp, Facebook, bio TikTok). */
export const vitrineMessage = (shop: Pick<Shop, "name" | "city">, link: string) =>
  `🛍️ ${shop.name}${shop.city ? ` (${shop.city})` : ""} : découvre nos articles et nos prix, et commande directement sur WhatsApp 👉 ${link}`;

export async function shareVitrine(shop: Pick<Shop, "name" | "city">, link: string, to: "whatsapp" | "facebook" | "partager"): Promise<void> {
  const text = vitrineMessage(shop, link);
  if (to === "whatsapp") return void window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  if (to === "facebook") return void window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`, "_blank", "noopener");
  if (navigator.share) await navigator.share({ title: shop.name, text, url: link }).catch(() => undefined);
  else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
}

// ---------- Vitrine publique ----------

export type PublicArticle = { id: string; nom: string; prix: number; unite: string; photo: string | null; dispo: boolean };
export type PublicModele = { id: string; titre: string; habit: string; tissu: string; image: string; vignette: string | null; vues: string[] | null };
export type PublicVitrine = { nom: string; metier: string; ville: string; telephone: string; bio: string; shop: string; articles: PublicArticle[]; modeles: PublicModele[] };

export async function loadPublicVitrine(slug: string): Promise<PublicVitrine | null> {
  const { data, error } = await supabase.rpc("vitrine_public", { p_slug: slug });
  return error || !data ? null : (data as PublicVitrine);
}

/** Lien WhatsApp vers l'entreprise, avec le message de commande déjà écrit. */
export function orderLink(phone: string, shopName: string, what: string, link: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 9) return null;
  const to = digits.length === 9 ? `221${digits}` : digits;
  return `https://wa.me/${to}?text=${encodeURIComponent(`Bonjour ${shopName}, je veux commander : ${what}. (vu sur votre vitrine ${link})`)}`;
}
