import { GoogleGenAI } from "@google/genai";
import { GeminiNotConfiguredError, redact } from "./interpret.ts";
import type { Language, SpeakRequest } from "./schema.ts";

export const DEFAULT_TTS_MODEL = "gemini-3.1-flash-tts-preview";
export const FALLBACK_TTS_MODEL = "gemini-3.8-flash-lite-tts";
export const DEFAULT_VOICE = "Sulafat";
const RETRY_STATUSES = new Set([429, 500, 503, 504]);
const READS_DIRECTIONS_ALOUD = /^gemini-3\.8/;
const TIMEOUT_MS = 20_000;
const CACHE_LIMIT = 40;

const DIRECTION: Record<Language, string> = {
  wo: "Dis en wolof de Dakar, d'une voix chaleureuse et calme, comme une commerçante au comptoir :",
  fr: "Dis en français, avec un léger accent sénégalais, d'une voix chaleureuse et calme, comme une commerçante de Dakar :",
  en: "Say in English with a light Senegalese accent, in a warm and calm voice, like a shopkeeper in Dakar:",
  fuc: "Dis en pulaar, d'une voix chaleureuse et calme, comme une commerçante au comptoir :",
};

export type AudioChunk = { data: string; mimeType: string };
export type Synthesize = (request: { model: string; voice: string; prompt: string; signal: AbortSignal }) => AsyncIterable<AudioChunk>;
export type Pcm = { pcm: Buffer; rate: number };

export type SpeechOptions = {
  apiKey?: string;
  model?: string;
  voice?: string;
  synthesize?: Synthesize;
};

export class SpeechUnavailableError extends Error {
  code = "voice_unavailable";
  status: number | undefined;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

const cache = new Map<string, Pcm>();

export function geminiSynthesize(apiKey: string): Synthesize {
  const ai = new GoogleGenAI({ apiKey });
  return async function* ({ model, voice, prompt, signal }) {
    const stream = await ai.models.generateContentStream({
      model,
      contents: prompt,
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        abortSignal: signal,
      },
    });
    for await (const chunk of stream) {
      for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
        if (part.inlineData?.data) yield { data: part.inlineData.data, mimeType: part.inlineData.mimeType ?? "audio/l16;rate=24000" };
      }
    }
  };
}

export async function* speakStream(request: SpeakRequest, options: SpeechOptions): AsyncGenerator<Pcm> {
  const apiKey = options.apiKey?.trim();
  if (!apiKey) throw new GeminiNotConfiguredError();
  const model = options.model?.trim() || DEFAULT_TTS_MODEL;
  const voice = options.voice?.trim() || DEFAULT_VOICE;
  const key = `${model}|${voice}|${request.language}|${request.text}`;
  const hit = cache.get(key);
  if (hit) {
    yield hit;
    return;
  }

  const synthesize = options.synthesize ?? geminiSynthesize(apiKey);
  const models = model === FALLBACK_TTS_MODEL ? [model] : [model, FALLBACK_TTS_MODEL];
  const parts: Buffer[] = [];
  let rate = 24_000;
  for (const [index, current] of models.entries()) {
    const prompt = READS_DIRECTIONS_ALOUD.test(current) ? request.text : `${DIRECTION[request.language]} ${request.text}`;
    try {
      for await (const chunk of synthesize({ model: current, voice, prompt, signal: AbortSignal.timeout(TIMEOUT_MS) })) {
        const decoded = pcmFrom(Buffer.from(chunk.data, "base64"), chunk.mimeType);
        if (!decoded.pcm.length) continue;
        rate = decoded.rate;
        parts.push(decoded.pcm);
        yield decoded;
      }
      break;
    } catch (error) {
      const status = typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : undefined;
      if (!parts.length && index < models.length - 1 && status !== undefined && RETRY_STATUSES.has(status)) continue;
      throw new SpeechUnavailableError(redact(error instanceof Error ? error.message : "TTS error", apiKey), status);
    }
  }
  if (!parts.length) throw new SpeechUnavailableError("Gemini n'a pas renvoyé d'audio.");

  cache.set(key, { pcm: Buffer.concat(parts), rate });
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
}

export function pcmFrom(bytes: Buffer, mimeType: string): Pcm {
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WAVE") {
    const rate = bytes.readUInt32LE(24);
    const data = bytes.indexOf("data", 12);
    return { pcm: data > 0 ? bytes.subarray(data + 8) : Buffer.alloc(0), rate };
  }
  return { pcm: bytes, rate: Number(/rate=(\d+)/i.exec(mimeType)?.[1] ?? 24_000) };
}

export function clearSpeechCache() {
  cache.clear();
}
