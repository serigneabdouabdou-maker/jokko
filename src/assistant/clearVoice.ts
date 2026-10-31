// Voix claire : Jokko réfléchit en direct (Gemini Live), mais chaque phrase de sa réponse est lue
// par la voix de la page d'accueil (lecture posée, chaleureuse, wolof bien articulé).
// La phrase part dès qu'elle est finie : on n'attend pas la fin de toute la réponse.
import { api } from "../data/supabase";
import type { PcmPlayer } from "./pcm";

export type SpeechLang = "wo" | "fr";

const PREF = "jokko-voix-claire";

/** Voix claire activée ? Oui par défaut. */
export function clearVoicePreferred(): boolean {
  try {
    return localStorage.getItem(PREF) !== "non";
  } catch {
    return true;
  }
}

export function setClearVoicePreferred(on: boolean) {
  try {
    localStorage.setItem(PREF, on ? "oui" : "non");
  } catch {
    /* navigateur privé : le réglage reste pour cette visite */
  }
}

/** Coupe le texte reçu en phrases finies ; le reste attend la suite. */
export function splitSentences(buffer: string): { done: string[]; rest: string } {
  const done: string[] = [];
  let rest = buffer;
  // Fin de phrase : . ! ? … suivis d'un espace (ou d'un guillemet fermant puis espace).
  const end = /[.!?…]+[»"”]?\s+/;
  for (;;) {
    const m = end.exec(rest);
    if (!m) break;
    const cut = m.index + m[0].length;
    const sentence = rest.slice(0, cut).trim();
    rest = rest.slice(cut);
    if (sentence) done.push(sentence);
  }
  return { done, rest };
}

const WOLOF = /\b(naa|nga|na|dafa|dafay|dinaa|dina|maa|mangi|ngi|bi|yi|ci|ak|ko|la|lay|rekk|waaw|déedéet|baal|ñaata|ñaar|ñett|ñeent|juróom|fukk|téeméer|junni|dërëm|bind|jaay|jënd|bor|des|néew|bari|kan|ban|nanga|def|jërëjëf|amul|dara|sa|ma|leen|kaay|tàmbali|déglu|waxaat|xam|lii|loolu)\b|[ñŋë]/gi;
const FRENCH = /\b(je|tu|il|elle|vous|nous|est|c'est|les|des|une|un|pour|avec|pas|et|dans|sur|qui|que|reste|vendu|noté|caisse du|bonjour|merci|combien|voilà|votre|ton|ta|tes|touche|facture|prête|il en reste|aujourd'hui|vente|ventes|au|aux|du|de)\b|[èêçùû]/gi;

/** Langue d'une phrase, pour donner la bonne consigne de lecture (wolof de Dakar ou français). */
export function guessLanguage(text: string, fallback: SpeechLang): SpeechLang {
  const wo = (text.match(WOLOF) ?? []).length;
  const fr = (text.match(FRENCH) ?? []).length;
  if (wo === fr) return fallback;
  return wo > fr ? "wo" : "fr";
}

type Clip = { bytes: Uint8Array; rate: number };
const cache = new Map<string, Promise<Clip | null>>();
const CACHE_LIMIT = 60;

/** Fabrique l'audio d'une phrase (gardé en mémoire : « Bind naa ko. » ne se refait pas deux fois). */
function clipFor(text: string, language: SpeechLang): Promise<Clip | null> {
  const key = `${language}|${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const next = (async (): Promise<Clip | null> => {
    try {
      const res = await api("speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: text.slice(0, 400), language }) });
      if (!res.ok) return null;
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (!bytes.length) return null;
      return { bytes, rate: Number(/rate=(\d+)/i.exec(res.headers.get("content-type") ?? "")?.[1] ?? 24000) };
    } catch {
      return null;
    }
  })();
  cache.set(key, next);
  void next.then((clip) => {
    if (!clip) cache.delete(key);
  });
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  return next;
}

/**
 * Lit les phrases dans l'ordre. Les audios sont demandés dès qu'une phrase est finie (en parallèle),
 * mais joués l'un après l'autre. reset() coupe tout (le commerçant reprend la parole).
 */
export class ClearSpeaker {
  private buffer = "";
  private chain: Promise<void> = Promise.resolve();
  private generation = 0;

  constructor(
    private player: PcmPlayer,
    private lang: () => SpeechLang,
    private onSpeak: () => void,
  ) {}

  add(chunk: string) {
    this.buffer += chunk;
    const { done, rest } = splitSentences(this.buffer);
    this.buffer = rest;
    for (const sentence of done) this.say(sentence);
  }

  flush() {
    const last = this.buffer.trim();
    this.buffer = "";
    if (last) this.say(last);
  }

  reset() {
    this.generation += 1;
    this.buffer = "";
    this.chain = Promise.resolve();
    this.player.stop();
  }

  private say(sentence: string) {
    if (!/[\p{L}\p{N}]/u.test(sentence)) return;
    const gen = this.generation;
    const clip = clipFor(sentence, guessLanguage(sentence, this.lang()));
    this.chain = this.chain.then(async () => {
      const c = await clip;
      if (!c || gen !== this.generation) return;
      this.onSpeak();
      this.player.push(c.bytes, c.rate);
    });
  }
}
