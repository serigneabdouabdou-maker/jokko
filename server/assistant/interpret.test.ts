import { describe, expect, it, vi } from "vitest";
import { shopContext } from "./fixtures.ts";
import {
  AssistantOutputError,
  DEFAULT_MODEL,
  FALLBACK_MODEL,
  type Generate,
  type GenerateRequest,
  GeminiNotConfiguredError,
  interpret,
} from "./interpret.ts";
import { interpretationSchema } from "./schema.ts";

const KEY = "test-key-not-real";

function modelReturns(payload: unknown) {
  return vi.fn<Generate>(async () => JSON.stringify(payload));
}

const draft = {
  type: "sale" as const,
  productId: null,
  productName: null,
  quantity: null,
  amount: null,
  clientId: null,
  clientName: null,
  label: null,
};

describe("interpret", () => {
  it("« Jaay naa 2 huile » : vente en wolof, toujours à confirmer", async () => {
    const generate = modelReturns({
      language: "wo",
      spokenReply: "Ñaari huile, 15 000 F. Ndax nga dëggal ?",
      intent: "sale",
      draftAction: { ...draft, productId: "p-huile", productName: "Huile", quantity: 2, amount: 15000 },
      requiresConfirmation: false,
      confidence: 0.93,
    });

    const result = await interpret({ message: "Jaay naa 2 huile", shopContext }, { apiKey: KEY, generate });

    expect(result).toEqual({
      language: "wo",
      spokenReply: "Ñaari huile, 15 000 F. Ndax nga dëggal ?",
      intent: "sale",
      draftAction: { ...draft, productId: "p-huile", productName: "Huile", quantity: 2, amount: 15000 },
      requiresConfirmation: true,
      confidence: 0.93,
    });
    expect(Object.keys(result)).toEqual(["language", "spokenReply", "intent", "draftAction", "requiresConfirmation", "confidence"]);

    const request = generate.mock.calls[0][0] as GenerateRequest;
    expect(request.prompt).toContain("Jaay naa 2 huile");
    expect(request.prompt).toContain("p-huile");
    expect(request.prompt).not.toMatch(/phone|221\d{9}|geminiKey|test-key/);
    expect(request.jsonSchema).toMatchObject({ type: "object", required: expect.arrayContaining(["requiresConfirmation"]) });
  });

  it("« Ajoute une vente de 15 000 francs » : montant extrait, à confirmer", async () => {
    const generate = modelReturns({
      language: "fr",
      spokenReply: "Je note une vente de 15 000 F. Je confirme ?",
      intent: "sale",
      draftAction: { ...draft, amount: 15000 },
      requiresConfirmation: true,
      confidence: 0.88,
    });

    const result = await interpret({ message: "Ajoute une vente de 15 000 francs", shopContext }, { apiKey: KEY, generate });

    expect(result.intent).toBe("sale");
    expect(result.language).toBe("fr");
    expect(result.draftAction?.amount).toBe(15000);
    expect(result.requiresConfirmation).toBe(true);
  });

  it("question de stock en français : réponse directe, sans confirmation", async () => {
    const generate = modelReturns({
      language: "fr",
      spokenReply: "Il te reste 12 sacs de riz brisé.",
      intent: "stock_query",
      draftAction: null,
      requiresConfirmation: false,
      confidence: 0.97,
    });

    const result = await interpret({ message: "Il me reste combien de riz ?", shopContext }, { apiKey: KEY, generate });

    expect(result).toMatchObject({ language: "fr", intent: "stock_query", draftAction: null, requiresConfirmation: false });
  });

  it("question de stock en anglais : réponse en anglais, sans confirmation", async () => {
    const generate = modelReturns({
      language: "en",
      spokenReply: "You have 12 bags of broken rice left.",
      intent: "stock_query",
      draftAction: null,
      requiresConfirmation: false,
      confidence: 0.95,
    });

    const result = await interpret({ message: "How many bags of rice are left?", shopContext }, { apiKey: KEY, generate });

    expect(result).toMatchObject({ language: "en", intent: "stock_query", requiresConfirmation: false });
    expect(result.spokenReply).toMatch(/12/);
  });

  it("commande ambiguë : demande une précision, rien à confirmer", async () => {
    const generate = modelReturns({
      language: "fr",
      spokenReply: "Deux de quel article ?",
      intent: "sale",
      draftAction: null,
      requiresConfirmation: true,
      confidence: 0.31,
    });

    const result = await interpret({ message: "Mets-en deux", shopContext }, { apiKey: KEY, generate });

    expect(result).toMatchObject({ intent: "unknown", draftAction: null, requiresConfirmation: false, language: "fr" });
    expect(result.spokenReply).toContain("?");
  });

  it("sans clé Gemini : erreur dédiée et aucun appel au modèle", async () => {
    const generate = modelReturns({});

    await expect(interpret({ message: "Jaay naa 2 huile", shopContext }, { apiKey: "", generate })).rejects.toBeInstanceOf(GeminiNotConfiguredError);
    await expect(interpret({ message: "Jaay naa 2 huile", shopContext }, { apiKey: "   ", generate })).rejects.toBeInstanceOf(GeminiNotConfiguredError);
    expect(generate).not.toHaveBeenCalled();
  });

  it("refuse une sortie du modèle non conforme au schéma", async () => {
    const generate = modelReturns({ say: "ok", lang: "fr", actions: [] });
    await expect(interpret({ message: "caisse", shopContext }, { apiKey: KEY, generate })).rejects.toBeInstanceOf(AssistantOutputError);
  });

  it("efface un identifiant inventé par le modèle", async () => {
    const generate = modelReturns({
      language: "fr",
      spokenReply: "Je note 3 savons. Je confirme ?",
      intent: "sale",
      draftAction: { ...draft, productId: "p-savon", productName: "Savon", quantity: 3, clientId: "c-inconnu" },
      requiresConfirmation: true,
      confidence: 0.7,
    });

    const result = await interpret({ message: "Vends 3 savons", shopContext }, { apiKey: KEY, generate });

    expect(result.draftAction).toMatchObject({ productId: null, productName: "Savon", clientId: null });
    expect(interpretationSchema.parse(result)).toEqual(result);
  });

  it("réessaie une fois sur le modèle de secours si Gemini est surchargé", async () => {
    const answer = JSON.stringify({
      language: "fr",
      spokenReply: "La caisse attend 35 500 F.",
      intent: "cash_query",
      draftAction: null,
      requiresConfirmation: false,
      confidence: 0.9,
    });
    const generate = vi
      .fn<Generate>()
      .mockRejectedValueOnce(Object.assign(new Error("high demand"), { status: 503 }))
      .mockResolvedValueOnce(answer);

    const result = await interpret({ message: "Caisse du jour", shopContext }, { apiKey: KEY, generate });

    expect(result.intent).toBe("cash_query");
    expect(generate.mock.calls.map(([request]) => request.model)).toEqual([DEFAULT_MODEL, FALLBACK_MODEL]);
  });

  it("réessaie une fois sur le modèle de secours si Gemini est surchargé", async () => {
    const answer = JSON.stringify({
      language: "fr",
      spokenReply: "La caisse attend 35 500 F.",
      intent: "cash_query",
      draftAction: null,
      requiresConfirmation: false,
      confidence: 0.9,
    });
    const generate = vi
      .fn<Generate>()
      .mockRejectedValueOnce(Object.assign(new Error("high demand"), { status: 503 }))
      .mockResolvedValueOnce(answer);

    const result = await interpret({ message: "Caisse du jour", shopContext }, { apiKey: KEY, generate });

    expect(result.intent).toBe("cash_query");
    expect(generate.mock.calls.map(([request]) => request.model)).toEqual([DEFAULT_MODEL, FALLBACK_MODEL]);
  });

  it("une correction de stock reste une écriture à confirmer", async () => {
    const generate = modelReturns({
      language: "fr",
      spokenReply: "J'ajoute 10 sacs de riz au stock. Je confirme ?",
      intent: "unknown",
      draftAction: { ...draft, type: "stock_adjust", productId: "p-riz", productName: "Riz brisé", quantity: 10 },
      requiresConfirmation: false,
      confidence: 0.85,
    });

    const result = await interpret({ message: "Ajoute 10 sacs de riz au stock", shopContext }, { apiKey: KEY, generate });

    expect(result.requiresConfirmation).toBe(true);
    expect(result.draftAction?.type).toBe("stock_adjust");
  });
});
