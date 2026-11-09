import { beforeEach, describe, expect, it, vi } from "vitest";
import { GeminiNotConfiguredError } from "./interpret.ts";
import {
  type AudioChunk,
  clearSpeechCache,
  DEFAULT_TTS_MODEL,
  DEFAULT_VOICE,
  FALLBACK_TTS_MODEL,
  pcmFrom,
  speakStream,
  SpeechUnavailableError,
  type Synthesize,
} from "./speech.ts";

const KEY = "test-key-not-real";
const pcm = Buffer.alloc(4800, 1);

beforeEach(() => clearSpeechCache());

function chunks(...items: AudioChunk[]): Synthesize {
  return vi.fn(async function* () {
    for (const item of items) yield item;
  });
}

async function collect(stream: AsyncIterable<{ pcm: Buffer; rate: number }>) {
  const out: Array<{ pcm: Buffer; rate: number }> = [];
  for await (const part of stream) out.push(part);
  return out;
}

describe("speakStream", () => {
  it("diffuse le PCM de Gemini morceau par morceau (voix 3.8 : la phrase seule, sans consigne lue à voix haute)", async () => {
    const half = pcm.subarray(0, 2400).toString("base64");
    const synthesize = chunks({ data: half, mimeType: "audio/l16; rate=24000; channels=1" }, { data: half, mimeType: "audio/l16; rate=24000; channels=1" });

    const parts = await collect(speakStream({ text: "Ñaari bidon huile, 15 000 F. Ma bind ko ?", language: "wo" }, { apiKey: KEY, synthesize }));

    expect(parts).toHaveLength(2);
    expect(parts.every((p) => p.rate === 24000)).toBe(true);
    const request = vi.mocked(synthesize).mock.calls[0][0];
    expect(request).toMatchObject({ model: DEFAULT_TTS_MODEL, voice: DEFAULT_VOICE });
    expect(request.prompt).toBe("Ñaari bidon huile, 15 000 F. Ma bind ko ?");
  });

  it("garde en mémoire une phrase déjà dite", async () => {
    const synthesize = chunks({ data: pcm.toString("base64"), mimeType: "audio/l16;rate=24000" });
    await collect(speakStream({ text: "Il te reste 12 sacs.", language: "fr" }, { apiKey: KEY, synthesize }));
    const again = await collect(speakStream({ text: "Il te reste 12 sacs.", language: "fr" }, { apiKey: KEY, synthesize }));
    expect(synthesize).toHaveBeenCalledTimes(1);
    expect(again[0].pcm.length).toBe(pcm.length);
  });

  it("passe sur la voix de secours si le quota est atteint, avec la phrase seule", async () => {
    const synthesize = vi.fn<Synthesize>(async function* ({ model }) {
      if (model === DEFAULT_TTS_MODEL) throw Object.assign(new Error("quota"), { status: 429 });
      yield { data: pcm.toString("base64"), mimeType: "audio/l16;rate=24000" };
    });

    const parts = await collect(speakStream({ text: "Riz bi, 12 sac la des.", language: "wo" }, { apiKey: KEY, synthesize }));

    expect(parts).toHaveLength(1);
    expect(synthesize.mock.calls.map(([r]) => [r.model, r.prompt])).toEqual([
      [DEFAULT_TTS_MODEL, "Riz bi, 12 sac la des."],
      [FALLBACK_TTS_MODEL, "Riz bi, 12 sac la des."],
    ]);
  });

  it("retire l’en-tête quand Gemini renvoie déjà un WAV", () => {
    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.write("WAVE", 8);
    header.writeUInt32LE(16000, 24);
    header.write("data", 36);
    expect(pcmFrom(Buffer.concat([header, pcm]), "audio/wav")).toEqual({ pcm, rate: 16000 });
    expect(pcmFrom(pcm, "audio/l16;rate=22050").rate).toBe(22050);
  });

  it("sans clé ou quota épuisé : erreurs dédiées, sans fuite de la clé", async () => {
    await expect(collect(speakStream({ text: "Bonjour", language: "fr" }, { apiKey: "" }))).rejects.toBeInstanceOf(GeminiNotConfiguredError);
    const synthesize: Synthesize = async function* () {
      yield* [];
      throw Object.assign(new Error(`quota ${KEY}`), { status: 400 });
    };
    const error = await collect(speakStream({ text: "Bonjour", language: "fr" }, { apiKey: KEY, synthesize })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SpeechUnavailableError);
    expect((error as SpeechUnavailableError).status).toBe(400);
    expect((error as Error).message).not.toContain(KEY);
  });
});
