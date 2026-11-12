// Écoute en boutique bruyante.
// 1) NoiseGate : n'envoie à Jokko que les sons forts et proches du téléphone (la voix du commerçant),
//    pas le bruit de fond ni les gens qui parlent plus loin. Le seuil s'adapte au bruit de la boutique.
// 2) CallGate : Jokko n'agit que si on l'appelle « Jokko » (ou bouton maintenu), puis 20 s sans le répéter.

/** Les façons dont « Jokko » est souvent transcrit. */
const CALL = /(^|[^\p{L}])(dj|j|y|g|tch|ch)?o+c?k+o+([^\p{L}]|$)/iu;

export function isCalled(text: string): boolean {
  return CALL.test(text.normalize("NFC"));
}

export type GateDecision = "send" | "silence" | "skip";

/**
 * Porte de bruit. Une trame = 40 ms de micro (rms entre 0 et 1).
 * - Le « plancher » suit le bruit de fond (descend vite, monte lentement).
 * - La porte s'ouvre quand le son dépasse nettement le plancher (voix proche), reste ouverte 600 ms après,
 *   puis envoie 1,3 s de silence pour que Jokko sache que la phrase est finie, puis n'envoie plus rien.
 */
export class NoiseGate {
  private floor = 0.008;
  private openUntil = 0;
  private silenceUntil = 0;
  private open = false;
  private frames = 0;

  constructor(
    private ratio = 3.2,
    private minLevel = 0.025,
    private holdMs = 600,
    private tailMs = 1300,
  ) {}

  /** Bruit de fond mesuré (rms). */
  get level(): number {
    return this.floor;
  }

  get threshold(): number {
    return Math.max(this.minLevel, this.floor * this.ratio);
  }

  frame(rms: number, now: number, forceOpen = false): GateDecision {
    // Les 400 premières ms : on écoute seulement le bruit de la boutique pour régler le seuil.
    if (this.frames < 10) {
      this.frames += 1;
      this.floor = this.frames === 1 ? rms : Math.max(this.floor, rms) * 0.5 + this.floor * 0.5;
      if (!forceOpen) return "skip";
    }
    // Plancher de bruit : descend vite, monte lentement (une voix proche ne le fait presque pas bouger).
    const rate = rms < this.floor ? 0.1 : rms < this.threshold ? 0.03 : 0.002;
    this.floor += (rms - this.floor) * rate;
    this.floor = Math.min(Math.max(this.floor, 0.002), 0.08);

    if (forceOpen || rms >= this.threshold) {
      this.open = true;
      this.openUntil = now + this.holdMs;
      this.silenceUntil = this.openUntil + this.tailMs;
      return "send";
    }
    if (this.open && now < this.openUntil) return "send";
    if (this.open) {
      this.open = false;
    }
    if (now < this.silenceUntil) return "silence";
    return "skip";
  }
}

/**
 * Couper la parole à Jokko (12/11/2026, demande de Fallou : « même si on l'interrompt, il doit écouter »).
 * Pendant que Jokko parle, le micro reste fermé à Gemini (sinon le haut-parleur revient dans le micro).
 * Seule une voix forte et proche, qui dure environ 0,3 s, rouvre le micro : Jokko se tait et écoute.
 * Le bruit de fond, une voix plus loin, un « hum » court ou l'écho du haut-parleur ne le coupent pas.
 */
export class BargeIn {
  private run = 0;

  constructor(
    private ratio = 5,
    private minLevel = 0.05,
    private frames = 7,
  ) {}

  reset() {
    this.run = 0;
  }

  /** Une trame de 40 ms ; `floor` = bruit de fond de la boutique. Renvoie true quand le commerçant coupe la parole. */
  frame(rms: number, floor: number): boolean {
    const threshold = Math.max(this.minLevel, floor * this.ratio);
    // Une petite baisse entre deux syllabes ne remet pas tout à zéro.
    this.run = rms >= threshold ? this.run + 1 : Math.max(0, this.run - 2);
    if (this.run < this.frames) return false;
    this.run = 0;
    return true;
  }
}

/**
 * Qui parle à Jokko ? Une « phrase » du micro = morceaux de transcription espacés de moins de 2,5 s.
 * Elle compte si elle contient « Jokko », si le bouton est maintenu, ou si Jokko vient de répondre (20 s).
 */
export class CallGate {
  private text = "";
  private lastChunk = 0;
  private followUntil = 0;
  private forced = false;
  private held = false;

  constructor(
    private enabled = true,
    private followMs = 20_000,
    private gapMs = 2_500,
  ) {}

  /** Bouton maintenu : tout ce qui est dit compte. */
  hold(on: boolean) {
    this.held = on;
    if (on) this.forced = true;
  }

  /** Message tapé ou bouton de l'écran : la prochaine réponse compte. */
  force() {
    this.forced = true;
  }

  heard(chunk: string, now: number) {
    if (now - this.lastChunk > this.gapMs) {
      this.text = "";
      if (!this.held) this.forced = false;
      // Une nouvelle phrase pendant la conversation suivie compte aussi.
      if (now < this.followUntil) this.forced = true;
    }
    this.lastChunk = now;
    this.text += chunk;
  }

  addressed(now: number): boolean {
    if (!this.enabled) return true;
    return this.held || this.forced || now < this.followUntil || isCalled(this.text);
  }

  /** Jokko a répondu à une phrase qui lui était adressée : on peut lui parler 20 s sans redire son nom. */
  answered(now: number) {
    this.followUntil = now + this.followMs;
  }

  /** Fin du tour : la phrase suivante repart de zéro (sauf bouton maintenu). */
  endTurn() {
    this.text = "";
    if (!this.held) this.forced = false;
  }
}

// ---------- Réglages d'écoute (gardés sur ce téléphone) ----------
const WAKE = "jokko-mot-appel";
const NOISE = "jokko-filtre-bruit";

/** Répondre seulement quand on dit « Jokko » ? Oui par défaut. */
export function wakePreferred(): boolean {
  try {
    return localStorage.getItem(WAKE) !== "non";
  } catch {
    return true;
  }
}

export function setWakePreferred(on: boolean) {
  try {
    localStorage.setItem(WAKE, on ? "oui" : "non");
  } catch {
    /* rien */
  }
}

export function noisePreferred(): "normal" | "fort" {
  try {
    return localStorage.getItem(NOISE) === "fort" ? "fort" : "normal";
  } catch {
    return "normal";
  }
}

export function setNoisePreferred(level: "normal" | "fort") {
  try {
    localStorage.setItem(NOISE, level);
  } catch {
    /* rien */
  }
}
