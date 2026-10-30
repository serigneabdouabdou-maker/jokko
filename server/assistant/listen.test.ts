import { describe, expect, it, vi } from "vitest";
import { shopContext } from "./fixtures.ts";
import { type Generate, GeminiNotConfiguredError, listen } from "./interpret.ts";
import { listenRequestSchema } from "./schema.ts";

const KEY = "test-key-not-real";
const audio = { mimeType: "audio/webm" as const, data: "A".repeat(800) };

describe("listen", () => {
  it("envoie l’audio à Gemini et renvoie la transcription avec une vente à confirmer", async () => {
    const generate = vi.fn<Generate>(async () =>
      JSON.stringify({
        transcript: "Jaay naa ñaari bidon huile",
        language: "wo",
        spokenReply: "Ñaari bidon huile, 15 000 F. Ma bind ko ?",
        intent: "sale",
        draftAction: {
          type: "sale",
          productId: "p-huile",
          productName: "Huile",
          quantity: 2,
          amount: 15000,
          clientId: null,
          clientName: null,
          label: null,
        },
        requiresConfirmation: false,
        confidence: 0.9,
      }),
    );

    const heard = await listen({ audio, shopContext }, { apiKey: KEY, generate });

    expect(heard.transcript).toBe("Jaay naa ñaari bidon huile");
    expect(heard.interpretation).toMatchObject({ language: "wo", intent: "sale", requiresConfirmation: true });
    expect(Object.keys(heard.interpretation)).toEqual(["language", "spokenReply", "intent", "draftAction", "requiresConfirmation", "confidence"]);
    const request = generate.mock.calls[0][0];
    expect(request.audio).toEqual(audio);
    expect(request.prompt).toContain("audio joint");
    expect(request.jsonSchema).toMatchObject({ required: expect.arrayContaining(["transcript", "intent"]) });
  });

  it("sans clé Gemini : aucun envoi de l’audio", async () => {
    const generate = vi.fn<Generate>();
    await expect(listen({ audio, shopContext }, { apiKey: "", generate })).rejects.toBeInstanceOf(GeminiNotConfiguredError);
    expect(generate).not.toHaveBeenCalled();
  });

  it("normalise le type audio du navigateur et refuse les formats inconnus", () => {
    const parsed = listenRequestSchema.parse({ audio: { mimeType: "audio/webm;codecs=opus", data: audio.data }, shopContext });
    expect(parsed.audio.mimeType).toBe("audio/webm");
    expect(listenRequestSchema.safeParse({ audio: { mimeType: "video/mp4", data: audio.data }, shopContext }).success).toBe(false);
    expect(listenRequestSchema.safeParse({ audio: { mimeType: "audio/webm", data: "pas du base64 !" }, shopContext }).success).toBe(false);
  });
});
