import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { shopContext } from "./fixtures.ts";
import { type AssistantEnv, handleAssistant } from "./http.ts";
import type { Generate } from "./interpret.ts";

const servers: Server[] = [];

async function start(env: AssistantEnv): Promise<string> {
  const server = createServer((req, res) => {
    void handleAssistant(req, res, env).then((handled) => {
      if (!handled) {
        res.statusCode = 404;
        res.end();
      }
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

const json = async (response: Response) => (await response.json()) as Record<string, unknown>;

const post = (base: string, body: unknown) =>
  fetch(`${base}/api/assistant/interpret`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/assistant/interpret", () => {
  it("sans clé Gemini : 503 gemini_not_configured, et le statut dit non configuré", async () => {
    const generate = vi.fn<Generate>();
    const base = await start({ apiKey: "", generate });

    const response = await post(base, { message: "Jaay naa 2 huile", shopContext });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "gemini_not_configured", message: "Gemini n'est pas configuré sur le serveur." });

    const status = await fetch(`${base}/api/assistant/status`);
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual({ configured: false });
    expect(generate).not.toHaveBeenCalled();
  });

  it("renvoie exactement les six champs validés", async () => {
    const generate = vi.fn<Generate>(async () =>
      JSON.stringify({
        language: "fr",
        spokenReply: "Il te reste 12 sacs de riz brisé.",
        intent: "stock_query",
        draftAction: null,
        requiresConfirmation: false,
        confidence: 0.96,
      }),
    );
    const base = await start({ apiKey: "test-key-not-real", generate });

    const response = await post(base, { message: "Il me reste combien de riz ?", shopContext });
    const body = await json(response);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(Object.keys(body).sort()).toEqual(["confidence", "draftAction", "intent", "language", "requiresConfirmation", "spokenReply"]);
    expect(JSON.stringify(body)).not.toContain("test-key-not-real");
  });

  it("refuse un contexte qui contient des données en trop", async () => {
    const generate = vi.fn<Generate>();
    const base = await start({ apiKey: "test-key-not-real", generate });

    const response = await post(base, {
      message: "caisse",
      shopContext: { ...shopContext, geminiKey: "AIza-secret", clients: [{ id: "c1", name: "Awa", debt: 0, phone: "221771112233" }] },
    });

    expect(response.status).toBe(400);
    expect((await json(response)).error).toBe("invalid_request");
    expect(generate).not.toHaveBeenCalled();
  });

  it("refuse les autres méthodes et les autres origines", async () => {
    const base = await start({ apiKey: "test-key-not-real", generate: vi.fn<Generate>() });

    expect((await fetch(`${base}/api/assistant/interpret`)).status).toBe(405);
    const foreign = await fetch(`${base}/api/assistant/interpret`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://exemple-malveillant.test" },
      body: JSON.stringify({ message: "caisse", shopContext }),
    });
    expect(foreign.status).toBe(403);
  });

  it("micro sans clé : 503, et la voix répond 204 pour basculer sur la voix du navigateur", async () => {
    const base = await start({ apiKey: "" });
    const listen = await fetch(`${base}/api/assistant/listen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio: { mimeType: "audio/webm", data: "A".repeat(800) }, shopContext }),
    });
    expect(listen.status).toBe(503);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const quota = await start({
      apiKey: "test-key-not-real",
      synthesize: async function* () {
        yield* [];
        throw Object.assign(new Error("quota"), { status: 429 });
      },
    });
    const voice = await fetch(`${quota}/api/assistant/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Bonjour", language: "fr" }),
    });
    expect(voice.status).toBe(204);
    expect(voice.headers.get("x-jokko-voice")).toBe("quota");
    warn.mockRestore();
  });

  it("la voix arrive en flux PCM 24 kHz", async () => {
    const base = await start({
      apiKey: "test-key-not-real",
      synthesize: async function* () {
        yield { data: Buffer.alloc(960, 2).toString("base64"), mimeType: "audio/l16;rate=24000" };
        yield { data: Buffer.alloc(960, 3).toString("base64"), mimeType: "audio/l16;rate=24000" };
      },
    });
    const response = await fetch(`${base}/api/assistant/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Il te reste 12 sacs de riz.", language: "fr" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/L16; rate=24000; channels=1");
    expect((await response.arrayBuffer()).byteLength).toBe(1920);
  });

  it("transforme une sortie Gemini invalide en 502 lisible", async () => {
    const base = await start({ apiKey: "test-key-not-real", generate: vi.fn<Generate>(async () => "pas du json") });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const response = await post(base, { message: "caisse", shopContext });

    expect(response.status).toBe(502);
    expect((await json(response)).error).toBe("invalid_model_output");
    warn.mockRestore();
  });
});
