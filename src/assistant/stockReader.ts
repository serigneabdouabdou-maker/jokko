/**
 * Installation du stock : lire une dictée ou une photo (facture, bon de livraison, cahier) en texte.
 * - Français dicté : reconnaissance vocale gratuite du téléphone (Chrome), sans Gemini quand elle est disponible.
 * - Wolof dicté, ou photo : Gemini, une seule lecture, comptée HORS forfait du client.
 * Le texte obtenu est ensuite compris par le code de Jokko (parseStockList) et vérifié par le patron.
 */
import { api } from "@/data/supabase";

export type ReadOutcome = { ok: true; text: string } | { ok: false; message: string };

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function send(mode: "audio" | "photo", blob: Blob, lang: string): Promise<ReadOutcome> {
  let response: Response;
  try {
    response = await api("stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, mimeType: (blob.type || (mode === "audio" ? "audio/webm" : "image/jpeg")).split(";")[0], data: await toBase64(blob), lang }),
    });
  } catch {
    return { ok: false, message: "Jokko ne joint pas le serveur. Vérifie la connexion." };
  }
  const body = (await response.json().catch(() => null)) as { text?: string; message?: string } | null;
  if (response.ok && typeof body?.text === "string") {
    const text = body.text.trim();
    if (!text || /^\((inaudible|aucun article)\)$/i.test(text)) {
      return { ok: false, message: mode === "photo" ? "Je n'ai trouvé aucun article sur la photo. Prends-la de plus près, bien éclairée et droite." : "Je n'ai pas bien entendu. Recommence, plus près du téléphone." };
    }
    return { ok: true, text };
  }
  return { ok: false, message: typeof body?.message === "string" ? body.message : "La lecture ne marche pas pour le moment. Réessaie, ou écris la liste." };
}

export const readStockAudio = (blob: Blob, lang: string) => send("audio", blob, lang);

/** Photo réduite à 1600 px et en JPEG (≈ 200 Ko) : rapide à envoyer, même avec une petite connexion. */
export async function readStockPhoto(file: File, lang: string): Promise<ReadOutcome> {
  let blob: Blob = file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.82));
  } catch {
    // ancien téléphone : on envoie la photo telle quelle
  }
  if (blob.size > 4_000_000) return { ok: false, message: "La photo est trop lourde. Reprends-la sans zoom." };
  return send("photo", blob, lang);
}

// ---------- Reconnaissance vocale gratuite du téléphone (français) ----------

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

/** La reconnaissance gratuite du téléphone est disponible (Chrome Android, Edge…). */
export function freeSpeechAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

/**
 * Dictée française gratuite. Renvoie une fonction « stop » ; onText reçoit tout le texte à la fin,
 * onFail si la reconnaissance ne marche pas (on repasse alors par Gemini).
 */
export function startFreeDictation(onText: (text: string) => void, onFail: () => void): () => void {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) {
    onFail();
    return () => undefined;
  }
  const rec = new Ctor();
  rec.lang = "fr-FR";
  rec.continuous = true;
  rec.interimResults = false;
  const done: string[] = [];
  let current: string[] = [];
  let failed = false;
  let stopped = false;
  rec.onresult = (e) => {
    current = [];
    for (let i = 0; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) current.push(r[0].transcript.trim());
    }
  };
  rec.onerror = (e) => {
    if (e.error === "no-speech" || e.error === "aborted") return;
    failed = true;
  };
  rec.onend = () => {
    done.push(...current.filter(Boolean));
    current = [];
    // Chrome coupe tout seul après un silence : on relance tant que le patron n'a pas fini.
    if (!stopped && !failed) {
      try {
        rec.start();
        return;
      } catch {
        // on termine
      }
    }
    if (failed && !done.length) onFail();
    else onText(done.join(", "));
  };
  try {
    rec.start();
  } catch {
    onFail();
  }
  return () => {
    stopped = true;
    rec.stop();
  };
}
