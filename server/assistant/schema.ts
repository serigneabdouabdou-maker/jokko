import { z } from "zod";

export const LANGUAGES = ["wo", "fr", "en", "fuc"] as const;
export const INTENTS = ["sale", "stock_query", "debt_query", "expense", "cash_query", "invoice", "unknown"] as const;
export const ACTION_TYPES = ["sale", "expense", "invoice", "stock_adjust", "debt_add", "debt_payment", "cash_count", "purchase"] as const;

export type Language = (typeof LANGUAGES)[number];
export type Intent = (typeof INTENTS)[number];

export const WRITE_INTENTS: ReadonlySet<Intent> = new Set<Intent>(["sale", "expense", "invoice"]);

export const draftActionSchema = z.strictObject({
  type: z.enum(ACTION_TYPES),
  productId: z.string().max(64).nullable(),
  productName: z.string().max(80).nullable(),
  quantity: z.number().min(0).max(1_000_000).nullable(),
  amount: z.number().min(0).max(1_000_000_000_000).nullable(),
  /** Prix d'UN article, quand le commerçant l'a dit (« 20 000 chacun ») : le total est calculé par le code. */
  unitPrice: z.number().min(0).max(1_000_000_000_000).nullable().optional(),
  clientId: z.string().max(64).nullable(),
  clientName: z.string().max(80).nullable(),
  label: z.string().max(120).nullable(),
  /** Dette : « ajout » (il prend encore) ou « total » (ce qu'il doit en tout) ; null si pas clair. */
  debtMode: z.enum(["ajout", "total"]).nullable().optional(),
});

export const interpretationSchema = z.strictObject({
  language: z.enum(LANGUAGES),
  spokenReply: z.string().trim().min(1).max(400),
  intent: z.enum(INTENTS),
  draftAction: draftActionSchema.nullable(),
  requiresConfirmation: z.boolean(),
  confidence: z.number().min(0).max(1),
});

const id = z.string().trim().min(1).max(64);
const name = z.string().trim().min(1).max(80);
const money = z.number().finite().min(0).max(1_000_000_000_000);

export const shopContextSchema = z.strictObject({
  language: z.enum(LANGUAGES),
  products: z
    .array(
      z.strictObject({
        id,
        name,
        unit: z.string().trim().max(24),
        stock: z.number().finite(),
        min: z.number().finite().min(0),
        price: money,
      }),
    )
    .max(300),
  clients: z.array(z.strictObject({ id, name, debt: money })).max(300),
  figures: z.strictObject({
    openingCash: money,
    daySales: money,
    dayExpenses: money,
    expectedCash: z.number().finite(),
  }),
  /** Métier de la boutique (réparation de téléphones, pharmacie…). */
  activity: z.string().trim().max(80).optional(),
  /** Réparations en cours (carnet des réparateurs). */
  repairs: z
    .array(
      z.strictObject({
        number: z.string().max(12),
        client: z.string().max(80),
        device: z.string().max(80),
        problem: z.string().max(160),
        status: z.enum(["depot", "repare"]),
        price: money,
        paid: money,
        days: z.number().int().min(0).max(10_000),
      }),
    )
    .max(60)
    .optional(),
  /** Articles qui périment dans les 30 jours (pharmacies, alimentation). */
  expiring: z.array(z.strictObject({ name, expiresAt: z.string().max(10), daysLeft: z.number().int().min(-10_000).max(10_000) })).max(60).optional(),
});

export const interpretRequestSchema = z.strictObject({
  message: z.string().trim().min(1).max(500),
  shopContext: shopContextSchema,
});

export const AUDIO_TYPES = ["audio/webm", "audio/ogg", "audio/wav", "audio/mp4", "audio/mpeg", "audio/aac", "audio/flac"] as const;
export const MAX_AUDIO_BASE64 = 2_800_000;

export const audioSchema = z.strictObject({
  mimeType: z.preprocess(
    (value) => (typeof value === "string" ? value.split(";")[0].trim().toLowerCase() : value),
    z.enum(AUDIO_TYPES),
  ),
  data: z
    .string()
    .min(400)
    .max(MAX_AUDIO_BASE64)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/),
});

export const listenRequestSchema = z.strictObject({
  audio: audioSchema,
  shopContext: shopContextSchema,
});

export const heardSchema = z.strictObject({
  transcript: z.string().trim().min(1).max(500),
  ...interpretationSchema.shape,
});

/** Liste en vrac (« 2 sacs de riz, big bleu, big bleu ») : Gemini dit QUELS articles, le code compte et calcule. */
export const orderGuessSchema = z.strictObject({
  intent: z.enum(["vente", "achat", "facture", "autre"]),
  payment: z.enum(["especes", "wave", "om", "credit", "inconnu"]),
  clientName: z.string().max(80).nullable(),
  items: z
    .array(
      z.strictObject({
        productId: z.string().max(64).nullable(),
        heard: z.string().max(80),
        quantity: z.number().min(0).max(100_000),
        unit: z.string().max(24).nullable(),
        unitPriceSaid: z.string().max(40).nullable(),
      }),
    )
    .max(60),
});

export type OrderGuess = z.infer<typeof orderGuessSchema>;

export function orderGuessJsonSchema(): Record<string, unknown> {
  return jsonSchema(orderGuessSchema);
}

/** Conseiller : le diagnostic (calculé par l'appli) et une question facultative du patron. */
export const adviceRequestSchema = z.strictObject({
  question: z.string().trim().max(400).nullable().optional(),
  diagnostic: z.record(z.string(), z.unknown()),
});

export const adviceSchema = z.strictObject({
  resume: z.string().trim().min(1).max(700),
  actions: z
    .array(
      z.strictObject({
        titre: z.string().trim().min(1).max(120),
        pourquoi: z.string().trim().max(400),
        comment: z.string().trim().max(400),
        impact: z.string().trim().max(200),
      }),
    )
    .max(5),
  reponse: z.string().trim().max(1200).nullable(),
});

export type AdviceRequest = z.infer<typeof adviceRequestSchema>;
export type Advice = z.infer<typeof adviceSchema>;

export function adviceJsonSchema(): Record<string, unknown> {
  return jsonSchema(adviceSchema);
}

export const liveRequestSchema = z.strictObject({
  shopContext: shopContextSchema,
  /** Vitesse de parole choisie dans Réglages. */
  speed: z.enum(["lent", "normal", "rapide"]).optional(),
});

export const speakRequestSchema = z.strictObject({
  text: z.string().trim().min(1).max(400),
  language: z.enum(LANGUAGES),
});

export type DraftAction = z.infer<typeof draftActionSchema>;
export type ListenRequest = z.infer<typeof listenRequestSchema>;
export type SpeakRequest = z.infer<typeof speakRequestSchema>;
export type Heard = { transcript: string; interpretation: Interpretation };
export type Interpretation = z.infer<typeof interpretationSchema>;
export type ShopContext = z.infer<typeof shopContextSchema>;
export type InterpretRequest = z.infer<typeof interpretRequestSchema>;

export function interpretationJsonSchema(): Record<string, unknown> {
  return jsonSchema(interpretationSchema);
}

export function heardJsonSchema(): Record<string, unknown> {
  return jsonSchema(heardSchema);
}

function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  const out = z.toJSONSchema(schema) as Record<string, unknown>;
  delete out.$schema;
  return out;
}
