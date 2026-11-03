import { api } from "../data/supabase";
import type { OrderGuess } from "./order";
import { type Lang, type Shop, dayExpenses, daySales, expectedCash } from "../model";

export type AssistantLanguage = "wo" | "fr" | "en" | "fuc";
export type AssistantIntent = "sale" | "stock_query" | "debt_query" | "expense" | "cash_query" | "invoice" | "unknown";
export type DraftActionType = "sale" | "expense" | "invoice" | "stock_adjust" | "debt_add" | "debt_payment" | "cash_count" | "purchase";

export type DraftAction = {
  type: DraftActionType;
  productId: string | null;
  productName: string | null;
  quantity: number | null;
  amount: number | null;
  clientId: string | null;
  clientName: string | null;
  label: string | null;
  /** Unité dite par le commerçant (« sachet », « sac ») : sert à reconnaître une vente au détail. */
  unit?: string | null;
  /** Délai de paiement d'une dette, en jours (30 par défaut). */
  dueDays?: number | null;
  /** Prix d'UN article (« 20 000 chacun ») : le total est calculé par le code, quantité × prix. */
  unitPrice?: number | null;
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
      // Les autres noms (wolof, surnoms) aident Gemini à choisir le bon article.
      name: (p.aliases?.length ? `${p.name} (aussi : ${p.aliases.join(", ")})` : p.name).slice(0, 80),
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
    const response = await api("status", { signal });
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
    response = await api("interpret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    response = await api("listen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

/** Liste en vrac : demande à Gemini (modèle léger) quels articles du stock sont cités. null si indisponible. */
export async function guessOrder(message: string, shopContext: ShopContext): Promise<OrderGuess | null> {
  try {
    const response = await api("order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message.slice(0, 500), shopContext }),
    });
    if (!response.ok) return null;
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || !Array.isArray(body.items) || typeof body.intent !== "string") return null;
    return body as unknown as OrderGuess;
  } catch {
    return null;
  }
}

export type Advice = {
  resume: string;
  actions: Array<{ titre: string; pourquoi: string; comment: string; impact: string }>;
  reponse: string | null;
};

/** Conseiller IA : il lit le diagnostic calculé par l'appli (jamais les numéros des clients). */
export async function askAdvisor(diagnostic: Record<string, unknown>, question: string | null): Promise<{ ok: true; data: Advice } | { ok: false; message: string }> {
  try {
    const response = await api("advice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ diagnostic, question: question?.trim().slice(0, 400) || null }),
    });
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (response.ok && body && typeof body.resume === "string" && Array.isArray(body.actions)) return { ok: true, data: body as unknown as Advice };
    return { ok: false, message: typeof body?.message === "string" ? body.message : "Le conseiller ne répond pas pour le moment. Réessaie dans un instant." };
  } catch {
    return { ok: false, message: "Pas de connexion internet. Réessaie." };
  }
}
