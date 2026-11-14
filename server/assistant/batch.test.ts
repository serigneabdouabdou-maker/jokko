import { describe, expect, it, vi } from "vitest";
import { shopContext } from "./fixtures.ts";
import { type Generate, understandBatch } from "./interpret.ts";

const op = (line: string, action: Record<string, unknown>) => ({
  line,
  action: { type: "sale", productId: null, productName: null, quantity: null, amount: null, unitPrice: null, clientId: null, clientName: null, label: null, debtMode: null, ...action },
});

describe("plusieurs opérations collées d'un coup", () => {
  it("chaque opération à part, montant relu dans SA ligne, ids inventés effacés, totaux ignorés", async () => {
    const generate = vi.fn<Generate>(async () =>
      JSON.stringify({
        operations: [
          op("Réparation écran ZTE A35 : 9 000 F", { productName: "réparation écran ZTE A35", label: "Réparation ZTE A35", amount: 90000 }),
          op("Configuration imprimante 10 000", { productName: "configuration imprimante", amount: 10000, productId: "id-invente" }),
          op("Transport 1 500", { type: "expense", label: "Transport", amount: 1500 }),
        ],
        ignored: ["Chiffre d'affaires total : 45 000 FCFA", "Consigne : enregistre chaque opération"],
      }),
    );
    const batch = await understandBatch({ message: "texte collé", shopContext }, { apiKey: "test", generate });
    expect(generate.mock.calls[0][0].systemInstruction).toMatch(/Tu ne calcules JAMAIS/);
    expect(generate.mock.calls[0][0].systemInstruction).toMatch(/ignored/);
    // Gemini avait mis 90 000 ; la ligne dit 9 000 : c'est la ligne qui compte.
    expect(batch.operations[0]!.action.amount).toBe(9000);
    expect(batch.operations[1]!.action.productId).toBeNull();
    expect(batch.operations[2]!.action.type).toBe("expense");
    expect(batch.ignored).toHaveLength(2);
  });
});

describe("photo d'une page du cahier", async () => {
  const { understandBatchPhoto } = await import("./interpret.ts");
  it("la photo part avec la consigne du cahier ; montants relus dans chaque ligne recopiée", async () => {
    const generate = vi.fn<Generate>(async () =>
      JSON.stringify({
        operations: [op("Décodage Itel 5000", { productName: "décodage", amount: 50000 })],
        ignored: ["Total 45 000", "(illisible)"],
      }),
    );
    const image = { mimeType: "image/jpeg" as const, data: "A".repeat(2000) };
    const batch = await understandBatchPhoto({ image, shopContext }, { apiKey: "test", generate });
    const call = generate.mock.calls[0][0];
    expect(call.audio).toEqual(image);
    expect(call.systemInstruction).toMatch(/page du cahier/);
    expect(batch.operations[0]!.action.amount).toBe(5000);
  });
});

describe("forme de réponse acceptée par Gemini", () => {
  it("jamais de maxItems/minItems envoyé (Google répond 400) ; la liste est coupée à 40 par l'appli", async () => {
    const { adviceJsonSchema, batchJsonSchema, heardJsonSchema, interpretationJsonSchema, orderGuessJsonSchema } = await import("./schema.ts");
    for (const s of [batchJsonSchema(), orderGuessJsonSchema(), adviceJsonSchema(), interpretationJsonSchema(), heardJsonSchema()]) {
      expect(JSON.stringify(s)).not.toMatch(/maxItems|minItems/);
    }
    const generate = vi.fn<Generate>(async () =>
      JSON.stringify({ operations: Array.from({ length: 55 }, (_, i) => op(`Vente ${i} : 1 000 F`, { amount: 1000 })), ignored: Array.from({ length: 50 }, () => "total") }),
    );
    const batch = await understandBatch({ message: "texte collé", shopContext }, { apiKey: "test", generate });
    expect(batch.operations).toHaveLength(40);
    expect(batch.ignored).toHaveLength(40);
  });
});
