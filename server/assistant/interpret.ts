import { GoogleGenAI } from "@google/genai";
import type { z } from "zod";
import { settleAmounts } from "../../src/assistant/wolofNumbers.ts";
import { conseillerInstruction } from "../../src/data/metiers.ts";
import { ADVICE_INSTRUCTION, buildAdvicePrompt, buildAudioPrompt, buildOrderPrompt, buildPrompt, ORDER_INSTRUCTION, SYSTEM_INSTRUCTION } from "./prompt.ts";
import {
  type Heard,
  type Interpretation,
  type InterpretRequest,
  type Advice,
  type AdviceRequest,
  adviceJsonSchema,
  adviceSchema,
  type ListenRequest,
  type OrderGuess,
  type ShopContext,
  orderGuessJsonSchema,
  orderGuessSchema,
  heardJsonSchema,
  heardSchema,
  interpretationJsonSchema,
  interpretationSchema,
  WRITE_INTENTS,
} from "./schema.ts";

export const DEFAULT_MODEL = "gemini-3.5-flash";
export const FALLBACK_MODEL = "gemini-flash-lite-latest";
const FALLBACK_MODELS = [FALLBACK_MODEL, "gemini-3.5-flash-lite"];
const TIMEOUT_MS = 20_000;
const RETRY_STATUSES = new Set([429, 500, 503, 504]);

export type GenerateRequest = {
  model: string;
  systemInstruction: string;
  prompt: string;
  jsonSchema: Record<string, unknown>;
  audio?: { mimeType: string; data: string };
  signal?: AbortSignal;
};

export type Generate = (request: GenerateRequest) => Promise<string>;

export class GeminiNotConfiguredError extends Error {
  code = "gemini_not_configured";
  constructor() {
    super("Gemini n'est pas configuré sur le serveur.");
  }
}

export class AssistantOutputError extends Error {
  code = "invalid_model_output";
}

export class AssistantUpstreamError extends Error {
  code = "gemini_unavailable";
  status: number | undefined;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

export function geminiGenerate(apiKey: string): Generate {
  const ai = new GoogleGenAI({ apiKey });
  return async ({ model, systemInstruction, prompt, jsonSchema, audio, signal }) => {
    const response = await ai.models.generateContent({
      model,
      contents: audio
        ? [{ role: "user", parts: [{ inlineData: { mimeType: audio.mimeType, data: audio.data } }, { text: prompt }] }]
        : prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseJsonSchema: jsonSchema,
        temperature: 0.2,
        abortSignal: signal,
        ...(model.startsWith("gemini-2.5") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      },
    });
    return response.text ?? "";
  };
}

export type InterpretOptions = {
  apiKey?: string;
  model?: string;
  generate?: Generate;
  signal?: AbortSignal;
};

export async function interpret(request: InterpretRequest, options: InterpretOptions): Promise<Interpretation> {
  const result = await run(options, interpretationSchema, interpretationJsonSchema(), buildPrompt(request.message, request.shopContext));
  return checkAmount(enforceRules(result, request.shopContext), request.message);
}

/**
 * Garde-fou des chiffres : si la phrase contient un montant clair, c'est la calculatrice qui décide,
 * pas le modèle (« ñaari junni » = 10 000 F, jamais 2 000).
 */
export function checkAmount(result: Interpretation, phrase: string): Interpretation {
  const action = result.draftAction;
  if (!action || action.type === "stock_adjust") return result;
  const next = { ...action };
  settleAmounts(next, {}, phrase);
  if (next.amount === action.amount && next.unitPrice === action.unitPrice) return result;
  return { ...result, draftAction: next };
}

export async function listen(request: ListenRequest, options: InterpretOptions): Promise<Heard> {
  const { transcript, ...result } = await run(options, heardSchema, heardJsonSchema(), buildAudioPrompt(request.shopContext), request.audio);
  return { transcript, interpretation: checkAmount(enforceRules(result, request.shopContext), transcript) };
}

/**
 * Liste en vrac → articles du stock. Modèle léger (le moins cher) : il ne fait que reconnaître les mots.
 * Les ids inventés sont effacés ici ; le regroupement et les calculs se font dans l'appli.
 */
export async function understandOrder(request: InterpretRequest, options: InterpretOptions): Promise<OrderGuess> {
  const guess = await run(
    { ...options, model: FALLBACK_MODEL },
    orderGuessSchema,
    orderGuessJsonSchema(),
    buildOrderPrompt(request.message, request.shopContext),
    undefined,
    ORDER_INSTRUCTION,
  );
  const ids = new Set(request.shopContext.products.map((p) => p.id));
  return { ...guess, items: guess.items.map((i) => (i.productId && !ids.has(i.productId) ? { ...i, productId: null } : i)) };
}

/** Conseiller : explique le diagnostic et propose des actions (modèle standard, plus réfléchi que le léger). */
export async function advise(request: AdviceRequest, options: InterpretOptions): Promise<Advice> {
  // Conseils propres au métier (pharmacie : rotation, péremption ; tailleur : retards, avances…).
  const activity = typeof request.diagnostic.activite === "string" ? request.diagnostic.activite : "";
  return run(options, adviceSchema, adviceJsonSchema(), buildAdvicePrompt(request.diagnostic, request.question), undefined, ADVICE_INSTRUCTION + conseillerInstruction(activity));
}

async function run<T extends z.ZodType>(
  options: InterpretOptions,
  schema: T,
  jsonSchema: Record<string, unknown>,
  prompt: string,
  audio?: { mimeType: string; data: string },
  systemInstruction: string = SYSTEM_INSTRUCTION,
): Promise<z.infer<T>> {
  const apiKey = options.apiKey?.trim();
  if (!apiKey) throw new GeminiNotConfiguredError();

  const generate = options.generate ?? geminiGenerate(apiKey);
  const primary = options.model?.trim() || DEFAULT_MODEL;
  const models = [primary, ...FALLBACK_MODELS.filter((m) => m !== primary)];
  let raw = "";
  for (const [index, model] of models.entries()) {
    const signals = [AbortSignal.timeout(TIMEOUT_MS), ...(options.signal ? [options.signal] : [])];
    try {
      raw = await generate({ model, systemInstruction, prompt, jsonSchema, audio, signal: AbortSignal.any(signals) });
      break;
    } catch (error) {
      const status = typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : undefined;
      const name = (error as { name?: unknown }).name;
      const timedOut = name === "TimeoutError" || name === "AbortError";
      const retry = index < models.length - 1 && !options.signal?.aborted && (timedOut || (status !== undefined && RETRY_STATUSES.has(status)));
      if (retry) continue;
      throw new AssistantUpstreamError(redact(error instanceof Error ? error.message : "Gemini error", apiKey), status);
    }
  }

  let json: unknown;
  try {
    json = JSON.parse(raw.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ""));
  } catch {
    throw new AssistantOutputError("Gemini n'a pas renvoyé de JSON.");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const where = parsed.error.issues.map((issue) => issue.path.join(".") || "(racine)").join(", ");
    throw new AssistantOutputError(`Réponse Gemini non conforme : ${where}`);
  }
  return parsed.data;
}

export function enforceRules(result: Interpretation, context: ShopContext): Interpretation {
  let draftAction = result.draftAction;
  if (draftAction) {
    const productId = draftAction.productId;
    const clientId = draftAction.clientId;
    draftAction = {
      ...draftAction,
      productId: productId && context.products.some((p) => p.id === productId) ? productId : null,
      clientId: clientId && context.clients.some((c) => c.id === clientId) ? clientId : null,
    };
  }
  const intent = WRITE_INTENTS.has(result.intent) && !draftAction ? "unknown" : result.intent;
  // Lancement : wolof et français seulement. Une autre langue retombe sur celle de la boutique (ou le wolof).
  const allowed = (l: string) => l === "wo" || l === "fr";
  return {
    language: allowed(result.language) ? result.language : allowed(context.language) ? context.language : "wo",
    spokenReply: result.spokenReply,
    intent,
    draftAction,
    requiresConfirmation: draftAction !== null,
    confidence: result.confidence,
  };
}

export function redact(message: string, secret: string): string {
  return message.split(secret).join("***").slice(0, 300);
}
