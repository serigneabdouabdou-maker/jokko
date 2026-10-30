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

export const liveRequestSchema = z.strictObject({
  shopContext: shopContextSchema,
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
