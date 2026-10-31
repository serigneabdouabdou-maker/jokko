import { describe, expect, it, vi } from "vitest";
import { advise, type Generate } from "./interpret.ts";
import { adviceRequestSchema } from "./schema.ts";

describe("conseiller", () => {
  it("consignes du conseiller, diagnostic transmis, réponse vérifiée", async () => {
    const generate = vi.fn<Generate>(async () =>
      JSON.stringify({
        resume: "La boutique va bien, mais le sucre est vendu à perte.",
        actions: [{ titre: "Monter le prix du sucre", pourquoi: "Prix 20 000 F, achat 21 000 F.", comment: "Change le prix dans Stock.", impact: "Plus de perte sur le sucre." }],
        reponse: null,
      }),
    );
    const request = adviceRequestSchema.parse({ diagnostic: { boutique: "Awa", constats: [{ titre: "Sucre vendu à perte" }] } });
    const advice = await advise(request, { apiKey: "test", generate });
    const call = generate.mock.calls[0][0];
    expect(call.systemInstruction).toMatch(/N'invente AUCUN chiffre/);
    expect(call.prompt).toContain("Sucre vendu à perte");
    expect(advice.actions[0].titre).toBe("Monter le prix du sucre");
  });
});
