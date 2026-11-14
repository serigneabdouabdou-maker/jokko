import { api } from "../data/supabase";
import type { OrderGuess } from "./order";
import { type Lang, type Shop, dayExpenses, daySales, expectedCash } from "../model";
import { expiringSoon } from "../data/metiers";
import { searchProducts } from "../data/partSearch";
import { modelKeys } from "../data/modelKeys";

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
  /** Dette : « ajout » = elle prend encore (on additionne) ; « total » = ce qu'elle doit en tout (on remplace). */
  debtMode?: "ajout" | "total" | null;
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
  activity?: string;
  /** Modules ajoutés par le patron (en plus de ceux du métier). */
  modules?: string[];
  repairs?: Array<{ number: string; client: string; device: string; problem: string; status: "depot" | "repare"; price: number; paid: number; days: number }>;
  expiring?: Array<{ name: string; expiresAt: string; daysLeft: number }>;
};

export type AssistantStatus = "checking" | "ready" | "off";

export type InterpretOutcome =
  | { ok: true; data: Interpretation }
  | { ok: false; reason: "not_configured" | "unavailable" | "invalid"; message: string };

export const toAssistantLanguage = (lang: Lang): AssistantLanguage => (lang === "ff" ? "fuc" : lang);
export const fromAssistantLanguage = (lang: AssistantLanguage): Lang => (lang === "fuc" ? "ff" : lang);

/** Ordre des articles pour Gemini : en stock, puis épuisés, puis pièces du catalogue jamais vendues (stock 0, sans prix de vente). */
const contextRank = (p: Shop["products"][number]) => (p.stock > 0 ? 0 : p.price > 0 ? 1 : 2);

/**
 * Poids maximum de chaque liste envoyée à Gemini : le serveur refuse une demande de plus de 32 Ko (erreur 413,
 * affichée « Gemini ne répond pas »). Une boutique avec 641 pièces du fournisseur dépassait (13/11/2026).
 */
export const CONTEXT_BYTES = { products: 16_000, clients: 5_000, repairs: 4_000, expiring: 2_000 } as const;

const byteSize = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length + 1;

/** Les premiers éléments de la liste, tant que le poids permis n'est pas dépassé (et `max` au plus). */
export function fitByBytes<T>(items: T[], budget: number, max: number): T[] {
  const out: T[] = [];
  let bytes = 2;
  for (const item of items) {
    if (out.length >= max) break;
    const size = byteSize(item);
    if (bytes + size > budget) break;
    bytes += size;
    out.push(item);
  }
  return out;
}

/**
 * Articles pour Gemini : en stock d'abord, puis ceux qui ont un prix, puis le catalogue du fournisseur.
 * Ceux laissés de côté restent reconnus par l'appli elle-même (recherche par nom après la réponse de Gemini).
 */
export function fitProducts(products: Shop["products"], focus = ""): ShopContext["products"] {
  // Les articles nommés dans la phrase passent devant tout le reste : Gemini voit toujours la bonne pièce,
  // même dans une boutique de 10 000 articles.
  const named = new Map<string, number>();
  if (focus.trim()) {
    // Un modèle (« x6525 ») compte beaucoup plus qu'un mot courant (« écran ») qui va sur des centaines d'articles.
    const keys = new Set(modelKeys(focus));
    const words = [...new Set([...keys, ...focus.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9+]+/).filter((w) => w.length >= 3)])];
    for (const w of words.slice(0, 12)) {
      const hits = searchProducts(products, w, 15);
      const weight = keys.has(w) ? 10 : hits.length >= 15 ? 0.1 : 1;
      for (const h of hits) named.set(h.product.id, (named.get(h.product.id) ?? 0) + weight);
    }
  }
  const rank = (p: Shop["products"][number]) => (named.has(p.id) ? -1 : contextRank(p));
  const items = [...products]
    .sort((a, b) => rank(a) - rank(b) || (named.get(b.id) ?? 0) - (named.get(a.id) ?? 0))
    .slice(0, 400)
    .map((p) => ({
      id: p.id,
      // Les autres noms (wolof, surnoms) aident Gemini à choisir le bon article.
      name: (p.aliases?.length ? `${p.name} (aussi : ${p.aliases.join(", ")})` : p.name).slice(0, 80),
      unit: p.unit,
      stock: p.stock,
      min: p.min,
      price: p.price,
    }));
  return fitByBytes(items, CONTEXT_BYTES.products, 300);
}

/** focus : la phrase du commerçant (écrit), pour mettre devant les articles dont il parle. */
export function buildShopContext(shop: Shop, lang: Lang, focus = ""): ShopContext {
  return {
    language: toAssistantLanguage(lang),
    // Articles en stock d'abord, puis ceux qui ont un prix, puis le catalogue du fournisseur ; jamais plus lourd que
    // CONTEXT_PRODUCTS_BYTES (sinon le serveur refuse la demande : erreur 413, « Gemini ne répond pas »).
    products: fitProducts(shop.products, focus),
    // Clients qui doivent de l'argent d'abord (questions de dettes), puis les autres.
    clients: fitByBytes(
      [...shop.clients].sort((a, b) => Number(b.debt > 0) - Number(a.debt > 0)).map((c) => ({ id: c.id, name: c.name, debt: c.debt })),
      CONTEXT_BYTES.clients,
      300,
    ),
    figures: {
      openingCash: shop.openingCash,
      daySales: daySales(shop),
      dayExpenses: dayExpenses(shop),
      expectedCash: expectedCash(shop),
    },
    ...(shop.activity?.trim() ? { activity: shop.activity.trim().slice(0, 80) } : {}),
    ...(shop.modules?.length ? { modules: shop.modules.slice(0, 10) } : {}),
    ...(() => {
      const open = (shop.repairs ?? []).filter((r) => r.status === "depot" || r.status === "repare").slice(0, 60);
      const repairs = fitByBytes(
        open.map((r) => ({
          number: r.number.slice(0, 12), client: r.clientName.slice(0, 80), device: r.device.slice(0, 80), problem: r.problem.slice(0, 160),
          status: r.status as "depot" | "repare", price: r.price, paid: r.paid,
          days: Math.max(0, Math.floor((Date.now() - new Date(r.repairedAt ?? r.at).getTime()) / 86_400_000)),
        })),
        CONTEXT_BYTES.repairs,
        60,
      );
      return repairs.length ? { repairs } : {};
    })(),
    ...(() => {
      const soon = fitByBytes(expiringSoon(shop.products, 30).map((p) => ({ name: p.name.slice(0, 80), expiresAt: p.expiresAt ?? "", daysLeft: p.daysLeft })), CONTEXT_BYTES.expiring, 60);
      return soon.length ? { expiring: soon } : {};
    })(),
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
  if (response.status === 413) {
    return { ok: false, reason: "unavailable", message: TOO_BIG };
  }
  const fallback = typeof body?.message === "string" ? body.message : "Gemini ne répond pas pour le moment. Réessaie dans un instant.";
  return { ok: false, reason: "unavailable", message: fallback };
}

/** Demande refusée parce que trop lourde : la vraie raison, jamais « Gemini ne répond pas ». CFC est prévenu par la console. */
export const TOO_BIG = "Ta boutique est très grande et cette demande était trop lourde pour Jokko. CFC est prévenu. Ferme complètement l’appli, rouvre-la, puis réessaie.";

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
