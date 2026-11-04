import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { shopContext } from "./fixtures.ts";
import { handleAssistant } from "./http.ts";
import { GeminiNotConfiguredError } from "./interpret.ts";
import { type CreateToken, createLiveSession, DEFAULT_LIVE_MODEL, liveConfig } from "./live.ts";

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

describe("conversation en direct", () => {
  it("crée un jeton à usage unique verrouillé sur le modèle et les consignes Jokko", async () => {
    const createToken = vi.fn<CreateToken>(async () => "auth_tokens/temporaire");

    const session = await createLiveSession(shopContext, { apiKey: "test-key-not-real", createToken });

    expect(session).toMatchObject({ token: "auth_tokens/temporaire", model: DEFAULT_LIVE_MODEL });
    const request = createToken.mock.calls[0][0];
    expect(request.model).toBe(DEFAULT_LIVE_MODEL);
    expect(Date.parse(request.newSessionExpireTime) - Date.now()).toBeLessThan(2 * 60_000);
    expect(JSON.stringify(request.config)).toContain("enregistrer");
    expect(JSON.stringify(session)).not.toContain("test-key-not-real");
  });

  it("les consignes enregistrent sans confirmation, en wolof, avec une seule voix", () => {
    const config = liveConfig(shopContext);
    const instruction = String(config.systemInstruction);
    expect(instruction).toMatch(/Ne demande PAS de confirmation/);
    expect(instruction).toMatch(/ceeb = riz/);
    expect(instruction).toMatch(/une seule voix/);
    expect(instruction).toContain("Baal ma, waxaat ko.");
    expect(instruction).not.toContain("waxaatal");
    expect(instruction).toContain("Livre de phrases wolof");
    expect(instruction).toContain("WOLOF ET FRANÇAIS, RIEN D'AUTRE");
    expect(instruction).toContain("p-huile");
    const names = (config.tools as Array<{ functionDeclarations: Array<{ name: string }> }>)[0].functionDeclarations.map((f) => f.name);
    expect(names).toEqual(["lire_boutique", "enregistrer", "convertir_montant", "panier", "calculer", "reparation", "numero_client", "annuler_derniere"]);
    expect(config.contextWindowCompression).toEqual({ slidingWindow: {} });
    expect(config.realtimeInputConfig?.automaticActivityDetection?.silenceDurationMs).toBe(800);
    expect(config.inputAudioTranscription).toEqual({});
  });

  it("chaque dette est déjà traduite en wolof par le code, avec sa valeur en francs", () => {
    const ctx = { ...shopContext, clients: [{ ...shopContext.clients[0], name: "Moussa Diop", debt: 20000 }] };
    const instruction = String(liveConfig(ctx).systemInstruction);
    expect(instruction).toContain("dette de Moussa Diop = ñeenti junni (20 000 F)");
    expect(instruction).toContain("MONTANTS DÉJÀ TRADUITS EN WOLOF PAR LE CODE");
  });

  it("sans clé Gemini : pas de jeton", async () => {
    const createToken = vi.fn<CreateToken>();
    await expect(createLiveSession(shopContext, { apiKey: "", createToken })).rejects.toBeInstanceOf(GeminiNotConfiguredError);
    expect(createToken).not.toHaveBeenCalled();
  });

  it("route /api/assistant/live : 200 avec jeton, 503 sans clé, 400 si contexte invalide", async () => {
    const start = async (apiKey: string) => {
      const server = createServer((req, res) => void handleAssistant(req, res, { apiKey, createToken: async () => "auth_tokens/x" }));
      servers.push(server);
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
      return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/assistant/live`;
    };
    const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

    const ok = await post(await start("test-key-not-real"), { shopContext });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { token: string }).token).toBe("auth_tokens/x");

    expect((await post(await start(""), { shopContext })).status).toBe(503);
    expect((await post(await start("test-key-not-real"), { shopContext: { ...shopContext, secret: 1 } })).status).toBe(400);
  });
});
