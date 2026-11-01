let shared: AudioContext | null = null;

export function audioContext(): AudioContext {
  shared ??= new AudioContext();
  return shared;
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function rateOf(mimeType: string | null | undefined, fallback = 24000): number {
  return Number(/rate=(\d+)/i.exec(mimeType ?? "")?.[1] ?? fallback);
}

/**
 * Lecteur de la voix de Jokko, morceau par morceau, avec une petite réserve (« tampon anti-coupure ») :
 * on attend d'avoir un peu de voix d'avance avant de jouer, pour qu'un réseau qui hésite ne coupe pas la phrase.
 * Si la réserve se vide quand même au milieu d'une phrase, on en garde davantage pour la suite.
 */
export class PcmPlayer {
  private sources = new Set<AudioBufferSourceNode>();
  private at = 0;
  private carry: Uint8Array | null = null;
  private pending: Float32Array[] = [];
  private pendingRate = 24000;
  private pendingSeconds = 0;
  private wait = 0;
  /** Réserve avant de jouer (s) : 0,25 s au départ, jusqu'à 0,6 s si le réseau est lent. */
  private target = 0.25;
  private spoke = false;
  onIdle: (() => void) | null = null;

  constructor(private context: AudioContext) {}

  get playing(): boolean {
    return this.sources.size > 0 || this.pending.length > 0;
  }

  /** Jokko parle en ce moment (d'après l'horloge audio : jamais bloqué même si un « fin » se perd). */
  get speaking(): boolean {
    return this.pending.length > 0 || this.at > this.context.currentTime;
  }

  push(chunk: Uint8Array, rate: number) {
    let bytes = chunk;
    if (this.carry) {
      const merged = new Uint8Array(this.carry.length + bytes.length);
      merged.set(this.carry);
      merged.set(bytes, this.carry.length);
      bytes = merged;
      this.carry = null;
    }
    const even = bytes.length - (bytes.length % 2);
    if (even < bytes.length) this.carry = bytes.slice(even);
    if (!even) return;

    const view = new DataView(bytes.buffer, bytes.byteOffset, even);
    const samples = new Float32Array(even / 2);
    for (let i = 0; i < samples.length; i += 1) samples[i] = view.getInt16(i * 2, true) / 32768;

    const running = this.at > this.context.currentTime + 0.01;
    if (running && !this.pending.length) {
      this.schedule([samples], rate);
      return;
    }
    // Plus rien en cours alors que Jokko parlait : le réseau a pris du retard. On garde plus de réserve.
    if (!running && this.spoke && this.sources.size === 0 && !this.pending.length) this.target = Math.min(0.6, this.target + 0.15);
    if (this.pending.length && rate !== this.pendingRate) this.release();
    this.pending.push(samples);
    this.pendingRate = rate;
    this.pendingSeconds += samples.length / rate;
    if (this.pendingSeconds >= this.target) this.release();
    else if (!this.wait) this.wait = window.setTimeout(() => this.release(), Math.round(this.target * 1000));
  }

  /** Joue la réserve accumulée d'un seul bloc (pas de petits trous entre les morceaux). */
  private release() {
    window.clearTimeout(this.wait);
    this.wait = 0;
    if (!this.pending.length) return;
    const list = this.pending;
    this.pending = [];
    this.pendingSeconds = 0;
    this.schedule(list, this.pendingRate);
  }

  private schedule(list: Float32Array[], rate: number) {
    const length = list.reduce((n, a) => n + a.length, 0);
    const buffer = this.context.createBuffer(1, length, rate);
    let o = 0;
    for (const a of list) {
      buffer.copyToChannel(a, 0, o);
      o += a.length;
    }
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    source.onended = () => {
      this.sources.delete(source);
      if (!this.sources.size && !this.pending.length) this.onIdle?.();
    };
    this.at = Math.max(this.at, this.context.currentTime + 0.04);
    source.start(this.at);
    this.at += buffer.duration;
    this.sources.add(source);
    this.spoke = true;
  }

  stop() {
    const playing = [...this.sources];
    this.sources.clear();
    for (const source of playing) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // déjà terminé
      }
    }
    window.clearTimeout(this.wait);
    this.wait = 0;
    this.pending = [];
    this.pendingSeconds = 0;
    this.at = 0;
    this.carry = null;
    this.spoke = false;
    this.target = 0.25;
  }
}
