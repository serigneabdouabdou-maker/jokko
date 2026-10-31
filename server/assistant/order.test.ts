import { describe, expect, it, vi } from "vitest";
import { shopContext } from "./fixtures.ts";
import { FALLBACK_MODEL, type Generate, understandOrder } from "./interpret.ts";

describe("liste en vrac (Gemini léger)", () => {
  it("modèle léger, consignes de liste, ids inventés effacés", async () => {
    const id = shopContext.products[0].id;
    const generate = vi.fn<Generate>(async () =>
      JSON.stringify({
        intent: "vente",
        payment: "inconnu",
        clientName: null,
        items: [
          { productId: id, heard: "ceeb", quantity: 2, unit: "sac", unitPriceSaid: null },
          { productId: "id-invente", heard: "bissap", quantity: 3, unit: null, unitPriceSaid: null },
        ],
      }),
    );
    const guess = await understandOrder({ message: "ñaari sac ceeb, 3 bissap", shopContext }, { apiKey: "test", generate });
    expect(generate.mock.calls[0][0].model).toBe(FALLBACK_MODEL);
    expect(generate.mock.calls[0][0].systemInstruction).toMatch(/Tu ne calcules JAMAIS/);
    expect(guess.items[0].productId).toBe(id);
    expect(guess.items[1].productId).toBeNull();
  });
});
