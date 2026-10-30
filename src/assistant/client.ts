import { type Lang, type Shop, dayExpenses, daySales, expectedCash } from "../model";

export type AssistantLanguage = "wo" | "fr" | "en" | "fuc";
export type AssistantIntent = "sale" | "stock_query" | "debt_query" | "expense" | "cash_query" | "invoice" | "unknown";
export type DraftActionType = "sale" | "expense" | "invoice" | "stock_adjust" | "debt_add" | "debt_payment" | "cash_count";

export type DraftAction = {
  type: DraftActionType;
  productId: string | null;
  productName: string | null;
  quantity: number | null;
  amount: number | null;
  clientId: string | null;
  clientName: string | null;
  label: string | null;
};

export type Interpretation = {
  language: AssistantLanguage;
  spokenReply: string;
  intent: AssistantIntent;
  draftAction: DraftAction | null;
  requiresConfirmation: boolean;
  confidence: number;
};

export type ShopContext = {
  language: AssistantLanguage;
  products: Array<{ id: string; name: string; unit: string; stock: number; min: number; price: number }>;
  clients: Array<{ id: string; name: string; debt: number }>;
  figures: { openingCash: number; daySales: number; dayExpenses: number; expectedCash: number };
};

export type AssistantStatus = "checking" | "ready" | "off";

export type InterpretOutcome =
  | { ok: true; data: Interpretation }
  | { ok: false; reason: "not_configured" | "unavailable" | "invalid"; message: string };

export const toAssistantLanguage = (lang: Lang): AssistantLanguage => (lang === "ff" ? "fuc" : lang);
export const fromAssistantLanguage = (lang: AssistantLanguage): Lang => (lang === "fuc" ? "ff" : lang);

export function buildShopContext(shop: Shop, lang: Lang): ShopContext {
  return {
    language: toAssistantLanguage(lang),
    products: shop.products.slice(0, 300).map((p) => ({
      id: p.id,
      name: p.name,
      unit: p.unit,
      stock: p.stock,
      min: p.min,
      price: p.price,
    })),
    clients: shop.clients.slice(0, 300).map((c) => ({ id: c.id, name: c.name, debt: c.debt })),
    figures: {
      openingCash: shop.openingCash,
      daySales: daySales(shop),
      dayExpenses: dayExpenses(shop),
      expectedCash: expectedCash(shop),
    },
  };
}

export async function assistantStatus(signal?: AbortSignal): Promise<Exclude<AssistantStatus, "checking">> {
  try {
    const response = await fetch("/api/assistant/status", { signal, headers: { Accept: "application/json" } });
    if (!response.ok) return "off";
    const body = (await response.json()) as { configured?: unknown };
    return body.configured === true ? "ready" : "off";
  } catch {
    return "off";
  }
}

export async function interpretMessage(message: string, shopContext: ShopContext, signal?: AbortSignal): Promise<InterpretOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/assistant/interpret", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ message, shopContext }),
      signal,
    });
  } catch {
    return { ok: false, reason: "unavailable", message: "Jokko ne joint pas le serveur. Vérifie la connexion." };
  }
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (response.ok && isInterpretation(body)) return { ok: true, data: body };
  if (response.status === 503 && body?.error === "gemini_not_configured") {
    return { ok: false, reason: "not_configured", message: "Gemini n’est pas configuré sur le serveur." };
  }
  if (response.status === 400) {
    return { ok: false, reason: "invalid", message: "La phrase n’a pas pu être envoyée. Raccourcis-la et réessaie." };
  }
  const fallback = typeof body?.message === "string" ? body.message : "Gemini ne répond pas pour le moment. Réessaie dans un instant.";
  return { ok: false, reason: "unavailable", message: fallback };
}

export type Heard = { transcript: string; interpretation: Interpretation };

export type ListenOutcome =
  | { ok: true; data: Heard }
  | { ok: false; reason: "not_configured" | "unavailable" | "invalid"; message: string };

export async function listenAudio(audio: { mimeType: string; data: string }, shopContext: ShopContext, signal?: AbortSignal): Promise<ListenOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/assistant/listen", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ audio: { mimeType: audio.mimeType.split(";")[0], data: audio.data }, shopContext }),
      signal,
    });
  } catch {
    return { ok: false, reason: "unavailable", message: "Jokko ne joint pas le serveur. Vérifie la connexion." };
  }
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (response.ok && body && typeof body.transcript === "string" && isInterpretation(body.interpretation)) {
    return { ok: true, data: { transcript: body.transcript, interpretation: body.interpretation } };
  }
  if (response.status === 503 && body?.error === "gemini_not_configured") {
    return { ok: false, reason: "not_configured", message: "Gemini n’est pas configuré sur le serveur." };
  }
  if (response.status === 400 || response.status === 413) {
    return { ok: false, reason: "invalid", message: "Le message vocal n’a pas pu être envoyé. Parle moins de 30 secondes et réessaie." };
  }
  const fallback = typeof body?.message === "string" ? body.message : "Gemini ne répond pas pour le moment. Réessaie dans un instant.";
  return { ok: false, reason: "unavailable", message: fallback };
}

function isInterpretation(value: unknown): value is Interpretation {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.language === "string" &&
    typeof v.spokenReply === "string" &&
    typeof v.intent === "string" &&
    typeof v.requiresConfirmation === "boolean" &&
    typeof v.confidence === "number" &&
    (v.draftAction === null || typeof v.draftAction === "object")
  );
}
