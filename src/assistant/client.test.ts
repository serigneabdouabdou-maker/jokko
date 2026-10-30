import { afterEach, describe, expect, it, vi } from "vitest";
import { blankProfile, currentShop } from "../model";
import { assistantStatus, buildShopContext, interpretMessage, listenAudio } from "./client";
import { playVoice } from "./voice";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildShopContext", () => {
  it("n’envoie que les articles, clients, langue et chiffres utiles", () => {
    const profile = { ...blankProfile(), geminiKey: "AIza-secret-local" };
    const context = buildShopContext(currentShop(profile), "ff");
    const json = JSON.stringify(context);

    expect(context.language).toBe("fuc");
    expect(Object.keys(context).sort()).toEqual(["clients", "figures", "language", "products"]);
    expect(Object.keys(context.clients[0]).sort()).toEqual(["debt", "id", "name"]);
    expect(json).not.toContain("AIza");
    expect(json).not.toMatch(/phone|221\d{9}|Pikine/);
  });
});

describe("mode sans clé Gemini", () => {
  it("le statut indique non configuré sans lever d’erreur", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ configured: false }), { status: 200 })));
    await expect(assistantStatus()).resolves.toBe("off");
  });

  it("une panne réseau donne aussi le mode local, sans exception", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("network");
    }));
    await expect(assistantStatus()).resolves.toBe("off");
    const outcome = await interpretMessage("caisse", buildShopContext(currentShop(blankProfile()), "fr"));
    expect(outcome).toMatchObject({ ok: false, reason: "unavailable" });
  });

  it("la voix Gemini indisponible (204) laisse la voix du navigateur prendre le relais", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    await expect(playVoice("Bonjour", "fr")).resolves.toBe(false);
  });

  it("le micro sans Gemini devient not_configured, sans exception", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "gemini_not_configured" }), { status: 503 })));
    const outcome = await listenAudio({ mimeType: "audio/webm;codecs=opus", data: "AAAA" }, buildShopContext(currentShop(blankProfile()), "wo"));
    expect(outcome).toMatchObject({ ok: false, reason: "not_configured" });
  });

  it("une réponse 503 gemini_not_configured devient not_configured", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "gemini_not_configured" }), { status: 503 })));
    const outcome = await interpretMessage("Jaay naa 2 huile", buildShopContext(currentShop(blankProfile()), "wo"));
    expect(outcome).toEqual({ ok: false, reason: "not_configured", message: "Gemini n’est pas configuré sur le serveur." });
  });
});
