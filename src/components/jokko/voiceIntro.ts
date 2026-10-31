// Présentation audio de Jokko sur la page d'accueil : un fichier fabriqué une seule fois (aucun appel à l'IA
// quand un visiteur écoute). Chaque phrase a son moment dans l'audio, pour afficher le sous-titre en même temps.

export const VOICE_URL = "https://solocpbqtqlxdfpjiewm.supabase.co/storage/v1/object/public/media/voix/jokko-accueil-v2.mp3";

export type VoiceLine = { lang: "wo" | "fr"; text: string; fr?: string; start: number; end: number };

/** start / end en secondes, mesurés à la fabrication de l'audio (voix/jokko-accueil-v2.json). */
export const VOICE_LINES: VoiceLine[] = [
  { lang: "fr", text: "Bonjour ! Je suis Jokko, l'assistant qui tient votre boutique à la voix.", start: 0, end: 4.81 },
  { lang: "wo", text: "Asalaa maalekum ! Maa ngi tudd Jokko. Maay sa ndimbal ci sa bitig.", fr: "Bonjour ! Je m'appelle Jokko. Je suis ton aide dans ta boutique.", start: 5.41, end: 11.28 },
  { lang: "wo", text: "Waxal rekk, ni nga koy waxe : « Jaay naa ñaari bidon diw ». Ma bind ko, wàññi ko ci stock bi, te yokk ko ci sa kees.", fr: "Parle simplement, comme tu parles : « J'ai vendu deux bidons d'huile ». Je le note, je l'enlève du stock et je l'ajoute à ta caisse.", start: 11.73, end: 21.98 },
  { lang: "wo", text: "Dinaa la wax ku la ameel bor, fàttali la ko, te ngoon gu nekk, ma wax la li nga liggéey ci bés bi.", fr: "Je te dis qui te doit de l'argent, je te le rappelle, et chaque soir je te dis ce que tu as gagné dans la journée.", start: 22.43, end: 28.6 },
  { lang: "fr", text: "Concrètement : vous parlez, je note. Les ventes, le stock, les dettes, les factures et la caisse du soir. En wolof, en français, ou les deux mélangés.", start: 29.3, end: 42.51 },
  { lang: "fr", text: "Choisissez votre offre juste en dessous, et ouvrez votre boutique en deux minutes. Les quatorze premiers jours sont offerts.", start: 42.96, end: 50.05 },
  { lang: "wo", text: "Kaay, ñu tàmbali !", fr: "Viens, on commence !", start: 50.55, end: 51.79 },
];

/** La phrase en cours à l'instant t (la dernière commencée). */
export function lineAt(t: number, lines: VoiceLine[] = VOICE_LINES): number {
  let current = -1;
  for (let i = 0; i < lines.length; i++) if (t >= lines[i].start - 0.05) current = i;
  return current;
}

/** Offre choisie sur la page d'accueil, retenue jusqu'à la création du compte. */
const WANTED = "jokko-offre-voulue";
export type WantedPlan = "gratuit" | "medium" | "avance";

export function rememberPlan(plan: WantedPlan) {
  try {
    localStorage.setItem(WANTED, plan);
  } catch {
    /* navigateur privé : tant pis, l'essai Avancé s'ouvre quand même */
  }
}

export function peekWantedPlan(): WantedPlan | null {
  try {
    const v = localStorage.getItem(WANTED);
    return v === "gratuit" || v === "medium" || v === "avance" ? v : null;
  } catch {
    return null;
  }
}

export function clearWantedPlan() {
  try {
    localStorage.removeItem(WANTED);
  } catch {
    /* rien à faire */
  }
}
