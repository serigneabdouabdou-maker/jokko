// Salutation automatique de Jokko et vitesse de sa voix.
// - Toute première fois sur ce téléphone : Jokko salue et se présente (« Asalaa maalekum ! Maa ngi tudd Jokko… »).
// - Ensuite, au premier appui sur le micro de la journée : une salutation courte (« Asalaa maalekum ! Maa ngi lay déglu. »).
// - Le reste de la journée : rien, Jokko écoute tout de suite.
// Les salutations sont des enregistrements (voix de l'accueil) : instantanées, sans appel à Gemini.

import { recordedUrl } from "./recorded";

export type GreetingKind = "presentation" | "court";
export type SpeechSpeed = "lent" | "normal" | "rapide";
type Lang = "wo" | "fr";

const BASE = `${(import.meta.env?.BASE_URL as string | undefined) ?? "/"}voix/`;

export const GREETINGS: Record<GreetingKind, Record<Lang, { text: string; url: string }>> = {
  presentation: {
    wo: { text: "Asalaa maalekum ! Maa ngi tudd Jokko. Maay sa ndimbal ci sa bitig.", url: `${BASE}salut-presentation-wo.mp3` },
    fr: { text: "Bonjour ! Je suis Jokko, ton aide dans ta boutique. Je t'écoute.", url: `${BASE}salut-presentation-fr.mp3` },
  },
  court: {
    wo: { text: "Asalaa maalekum ! Maa ngi lay déglu.", url: recordedUrl("salut-ecoute") },
    fr: { text: "Bonjour ! Je t'écoute.", url: `${BASE}salut-ecoute-fr.mp3` },
  },
};

/** Vitesse de lecture des phrases enregistrées (le ton de la voix ne change pas). */
export const SPEED_RATE: Record<SpeechSpeed, number> = { lent: 0.9, normal: 1.05, rapide: 1.2 };

/** Consigne donnée à Jokko en conversation directe selon la vitesse choisie. */
export const SPEED_NOTE: Record<SpeechSpeed, string> = {
  lent: "(Réglage du commerçant, ne réponds pas : parle lentement et posément, en articulant bien chaque mot, avec une petite pause entre deux phrases.)",
  normal: "(Réglage du commerçant, ne réponds pas : parle à un rythme naturel et vif, comme au comptoir, sans traîner ni faire de longues pauses.)",
  rapide: "(Réglage du commerçant, ne réponds pas : parle vite, avec des réponses très courtes et sans aucune pause inutile, tout en restant clair.)",
};

const GREET = "jokko-salutation";
const SPEED = "jokko-vitesse-voix";
const SEEN = "jokko-salut-vu";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* navigateur privé : tant pis */
  }
}

/** Jour local (YYYY-MM-DD) : la salutation courte revient chaque matin. */
export function dayKey(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/**
 * Quelle salutation dire maintenant ? lastSeen = jour de la dernière salutation (null : jamais).
 * Jamais salué → présentation ; pas encore aujourd'hui → courte ; déjà salué aujourd'hui → rien.
 */
export function greetingFor(lastSeen: string | null, now: Date): GreetingKind | null {
  if (!lastSeen) return "presentation";
  return lastSeen === dayKey(now) ? null : "court";
}

export function greetingDue(now = new Date()): GreetingKind | null {
  if (!greetPreferred()) return null;
  return greetingFor(read(SEEN), now);
}

export function markGreeted(now = new Date()) {
  write(SEEN, dayKey(now));
}

/** Saluer automatiquement ? Oui par défaut. */
export function greetPreferred(): boolean {
  return read(GREET) !== "non";
}
export function setGreetPreferred(on: boolean) {
  write(GREET, on ? "oui" : "non");
}

export function speedPreferred(): SpeechSpeed {
  const v = read(SPEED);
  return v === "lent" || v === "rapide" ? v : "normal";
}
export function setSpeedPreferred(speed: SpeechSpeed) {
  write(SPEED, speed);
}

let playing: HTMLAudioElement | null = null;

/**
 * Joue la salutation (sans changer le ton de la voix, même en accéléré).
 * Se termine quand elle est finie, ou tout de suite si elle ne peut pas être jouée (pas de réseau…).
 */
export function playGreeting(kind: GreetingKind, lang: Lang, speed: SpeechSpeed = speedPreferred()): Promise<boolean> {
  stopGreeting();
  const audio = new Audio(GREETINGS[kind][lang].url);
  audio.preload = "auto";
  audio.playbackRate = SPEED_RATE[speed];
  (audio as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
  playing = audio;
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      window.clearTimeout(guard);
      if (playing === audio) playing = null;
      resolve(ok);
    };
    // Jamais plus de 10 s d'attente, même si le réseau traîne.
    const guard = window.setTimeout(() => {
      audio.pause();
      finish(false);
    }, 10_000);
    audio.onended = () => finish(true);
    audio.onerror = () => finish(false);
    audio.onpause = () => finish(audio.ended);
    audio.play().catch(() => finish(false));
  });
}

/** Coupe la salutation (le commerçant a retouché le micro : il veut parler tout de suite). */
export function stopGreeting(): boolean {
  if (!playing) return false;
  const audio = playing;
  playing = null;
  audio.pause();
  return true;
}

export const greetingPlaying = () => playing !== null;
