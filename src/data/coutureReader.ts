/**
 * Commande de couture dictée : le tailleur parle (wolof ou français), Gemini recopie ses mots dans des cases,
 * puis readSpokenCouture lit les montants, les mesures et la date. Comptée comme un message vocal.
 */
import { api } from "./supabase";
import type { SpokenCouture } from "./coutureVoice";

export type CoutureHeard = { ok: true; fields: SpokenCouture; transcript: string } | { ok: false; message: string };

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function readCoutureAudio(blob: Blob, lang: string): Promise<CoutureHeard> {
  let response: Response;
  try {
    response = await api("couture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mimeType: (blob.type || "audio/webm").split(";")[0], data: await toBase64(blob), lang }),
    });
  } catch {
    return { ok: false, message: "Jokko ne joint pas le serveur. Vérifie la connexion." };
  }
  const body = (await response.json().catch(() => null)) as (SpokenCouture & { transcription?: string; message?: string }) | null;
  if (!response.ok || !body) {
    return { ok: false, message: typeof body?.message === "string" ? body.message : "La dictée ne marche pas pour le moment. Réessaie, ou remplis la commande à la main." };
  }
  const transcript = typeof body.transcription === "string" ? body.transcription.trim() : "";
  if (!transcript || /^\(inaudible\)$/i.test(transcript)) return { ok: false, message: "Je n'ai pas bien entendu. Recommence, plus près du téléphone." };
  return { ok: true, fields: body, transcript };
}
