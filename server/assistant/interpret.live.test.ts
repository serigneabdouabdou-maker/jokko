import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { shopContext } from "./fixtures.ts";
import { interpret, listen } from "./interpret.ts";
import { speakStream } from "./speech.ts";

const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url)).toString("base64");

const apiKey = process.env.GEMINI_API_KEY ?? "";
const model = process.env.GEMINI_MODEL || undefined;
const ask = (message: string) => interpret({ message, shopContext }, { apiKey, model });

describe.skipIf(!apiKey)("Gemini réel", () => {
  it("« Jaay naa 2 huile »", async () => {
    const r = await ask("Jaay naa 2 huile");
    console.info("wo vente", JSON.stringify(r));
    expect(r.language).toBe("wo");
    expect(r.intent).toBe("sale");
    expect(r.requiresConfirmation).toBe(true);
    expect(r.draftAction).toMatchObject({ type: "sale", productId: "p-huile", quantity: 2 });
  });

  it("« Ajoute une vente de 15 000 francs »", async () => {
    const r = await ask("Ajoute une vente de 15 000 francs");
    console.info("fr vente", JSON.stringify(r));
    expect(r.language).toBe("fr");
    expect(r.intent).toBe("sale");
    expect(r.requiresConfirmation).toBe(true);
    expect(r.draftAction?.amount).toBe(15000);
  });

  it("question de stock en français", async () => {
    const r = await ask("Il me reste combien de riz ?");
    console.info("fr stock", JSON.stringify(r));
    expect(r).toMatchObject({ language: "fr", intent: "stock_query", draftAction: null, requiresConfirmation: false });
    expect(r.spokenReply).toMatch(/12/);
  });

  it("question de stock en anglais", async () => {
    const r = await ask("How much oil do I have left?");
    console.info("en stock", JSON.stringify(r));
    expect(r).toMatchObject({ language: "en", intent: "stock_query", draftAction: null, requiresConfirmation: false });
    expect(r.spokenReply).toMatch(/3/);
  });

  it("commande ambiguë", async () => {
    const r = await ask("Mets-en deux");
    console.info("ambigu", JSON.stringify(r));
    expect(r).toMatchObject({ intent: "unknown", draftAction: null, requiresConfirmation: false });
    expect(r.spokenReply).toContain("?");
  });

  it("micro : « Jaay naa ñaari bidon huile » dit à voix haute", async () => {
    const heard = await listen({ audio: { mimeType: "audio/wav", data: fixture("jaay-naa-naari-huile.wav") }, shopContext }, { apiKey, model });
    console.info("micro wo", JSON.stringify(heard));
    expect(heard.transcript.toLowerCase()).toMatch(/huile/);
    expect(heard.interpretation).toMatchObject({ intent: "sale", requiresConfirmation: true });
    expect(heard.interpretation.draftAction).toMatchObject({ productId: "p-huile", quantity: 2 });
  });

  it("micro : « Il me reste combien de riz ? » dit à voix haute", async () => {
    const heard = await listen({ audio: { mimeType: "audio/wav", data: fixture("combien-de-riz.wav") }, shopContext }, { apiKey, model });
    console.info("micro fr", JSON.stringify(heard));
    expect(heard.interpretation).toMatchObject({ language: "fr", intent: "stock_query", requiresConfirmation: false });
  });

  it("voix : une réponse wolof arrive en flux", async () => {
    const t0 = Date.now();
    let first = 0;
    let bytes = 0;
    for await (const { pcm } of speakStream({ text: "Riz bi, 12 sac la des. Ma bind ko ?", language: "wo" }, { apiKey })) {
      first ||= Date.now() - t0;
      bytes += pcm.length;
    }
    console.info("voix wo", `premier son ${first} ms, ${(bytes / 48000).toFixed(1)} s`);
    expect(bytes).toBeGreaterThan(24_000);
  });

  it("commande ambiguë en français dans une boutique qui préfère le wolof", async () => {
    const r = await interpret({ message: "Mets-en deux", shopContext: { ...shopContext, language: "wo" } }, { apiKey, model });
    console.info("ambigu wo", JSON.stringify(r));
    expect(r).toMatchObject({ language: "fr", intent: "unknown", draftAction: null, requiresConfirmation: false });
  });
});
