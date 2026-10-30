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

export class PcmPlayer {
  private sources = new Set<AudioBufferSourceNode>();
  private at = 0;
  private carry: Uint8Array | null = null;
  onIdle: (() => void) | null = null;

  constructor(private context: AudioContext) {}

  get playing(): boolean {
    return this.sources.size > 0;
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
    const buffer = this.context.createBuffer(1, samples.length, rate);
    buffer.copyToChannel(samples, 0);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    source.onended = () => {
      this.sources.delete(source);
      if (!this.sources.size) this.onIdle?.();
    };
    const lead = this.sources.size ? 0.02 : 0.08;
    this.at = Math.max(this.at, this.context.currentTime + lead);
    source.start(this.at);
    this.at += buffer.duration;
    this.sources.add(source);
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
    this.at = 0;
    this.carry = null;
  }
}
