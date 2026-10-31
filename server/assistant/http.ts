import type { IncomingMessage, ServerResponse } from "node:http";
import type { z } from "zod";
import {
  AssistantOutputError,
  AssistantUpstreamError,
  type Generate,
  GeminiNotConfiguredError,
  interpret,
  listen,
  understandOrder,
} from "./interpret.ts";
import { type CreateToken, createLiveSession, LiveUnavailableError } from "./live.ts";
import { interpretRequestSchema, listenRequestSchema, liveRequestSchema, speakRequestSchema } from "./schema.ts";
import { SpeechUnavailableError, speakStream, type Synthesize } from "./speech.ts";

export type AssistantEnv = {
  apiKey?: string;
  model?: string;
  generate?: Generate;
  ttsModel?: string;
  voice?: string;
  synthesize?: Synthesize;
  liveModel?: string;
  createToken?: CreateToken;
};

const MAX_TEXT_BODY = 32 * 1024;
const MAX_AUDIO_BODY = 3 * 1024 * 1024;
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 40;
const hits = new Map<string, number[]>();

export async function handleAssistant(req: IncomingMessage, res: ServerResponse, env: AssistantEnv): Promise<boolean> {
  const path = new URL(req.url ?? "/", "http://jokko.local").pathname;

  if (path === "/api/assistant/status") {
    if (req.method !== "GET") return send(res, 405, { error: "method_not_allowed" }, { Allow: "GET" });
    return send(res, 200, { configured: Boolean(env.apiKey?.trim()) });
  }

  if (path === "/api/assistant/interpret") {
    return post(req, res, MAX_TEXT_BODY, interpretRequestSchema, async (body) => send(res, 200, await interpret(body, env)));
  }

  if (path === "/api/assistant/order") {
    return post(req, res, MAX_TEXT_BODY, interpretRequestSchema, async (body) => send(res, 200, await understandOrder(body, env)));
  }

  if (path === "/api/assistant/listen") {
    return post(req, res, MAX_AUDIO_BODY, listenRequestSchema, async (body) => send(res, 200, await listen(body, env)));
  }

  if (path === "/api/assistant/live") {
    return post(req, res, MAX_TEXT_BODY, liveRequestSchema, async (body) => {
      try {
        const session = await createLiveSession(body.shopContext, {
          apiKey: env.apiKey,
          model: env.liveModel,
          voice: env.voice,
          createToken: env.createToken,
        });
        return send(res, 200, session);
      } catch (error) {
        if (error instanceof LiveUnavailableError) {
          console.warn(`[jokko] conversation Gemini indisponible${error.status ? ` (${error.status})` : ""}`);
          return send(res, 502, { error: error.code, message: "La conversation en direct ne démarre pas pour le moment." });
        }
        throw error;
      }
    });
  }

  if (path === "/api/assistant/speak") {
    return post(req, res, MAX_TEXT_BODY, speakRequestSchema, async (body) => {
      let started = false;
      try {
        for await (const { pcm, rate } of speakStream(body, { apiKey: env.apiKey, model: env.ttsModel, voice: env.voice, synthesize: env.synthesize })) {
          if (!started) {
            res.statusCode = 200;
            res.setHeader("Content-Type", `audio/L16; rate=${rate}; channels=1`);
            res.setHeader("Cache-Control", "no-store");
            res.setHeader("X-Content-Type-Options", "nosniff");
            started = true;
          }
          res.write(pcm);
        }
        res.end();
        return true;
      } catch (error) {
        if (started) {
          res.end();
          return true;
        }
        if (error instanceof SpeechUnavailableError) {
          console.warn(`[jokko] voix Gemini indisponible${error.status ? ` (${error.status})` : ""}`);
          res.statusCode = 204;
          res.setHeader("X-Jokko-Voice", error.status === 429 ? "quota" : "unavailable");
          res.end();
          return true;
        }
        throw error;
      }
    });
  }

  return false;
}

async function post<T extends z.ZodType>(
  req: IncomingMessage,
  res: ServerResponse,
  maxBody: number,
  schema: T,
  handle: (body: z.infer<T>) => Promise<true>,
): Promise<true> {
  if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" }, { Allow: "POST" });
  if (!sameOrigin(req)) return send(res, 403, { error: "forbidden_origin" });
  if (!String(req.headers["content-type"] ?? "").includes("application/json")) {
    return send(res, 415, { error: "unsupported_media_type" });
  }
  if (limited(req)) return send(res, 429, { error: "too_many_requests" }, { "Retry-After": "60" });

  let raw: unknown;
  try {
    raw = JSON.parse(await readBody(req, maxBody));
  } catch (error) {
    if (error instanceof BodyTooLarge) return send(res, 413, { error: "payload_too_large" });
    return send(res, 400, { error: "invalid_json" });
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return send(res, 400, {
      error: "invalid_request",
      fields: [...new Set(parsed.error.issues.map((issue) => issue.path.join(".") || "(racine)"))].slice(0, 10),
    });
  }

  try {
    return await handle(parsed.data);
  } catch (error) {
    if (error instanceof GeminiNotConfiguredError) {
      return send(res, 503, { error: error.code, message: error.message });
    }
    if (error instanceof AssistantOutputError) {
      console.warn(`[jokko] assistant: ${error.message}`);
      return send(res, 502, { error: error.code, message: "Je n'ai pas bien compris. Peux-tu redire la phrase ?" });
    }
    if (error instanceof AssistantUpstreamError) {
      console.warn(`[jokko] assistant: Gemini indisponible${error.status ? ` (${error.status})` : ""}`);
      const message = error.status === 429
        ? "Le quota Gemini du jour est atteint. Réessaie plus tard ou active la facturation."
        : "Gemini ne répond pas pour le moment. Réessaie dans un instant.";
      return send(res, 502, { error: error.code, message });
    }
    console.warn("[jokko] assistant: erreur inattendue");
    return send(res, 500, { error: "internal_error" });
  }
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): true {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.end(JSON.stringify(body));
  return true;
}

class BodyTooLarge extends Error {}

function readBody(req: IncomingMessage, maxBody: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBody) {
        reject(new BodyTooLarge());
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function limited(req: IncomingMessage): boolean {
  const key = req.socket.remoteAddress ?? "local";
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > MAX_PER_WINDOW;
}
