import { describe, expect, it } from "vitest";
import { lexiconInstruction, WOLOF_LEXICON } from "./wolofLexicon.ts";

describe("vocabulaire wolof de la boutique", () => {
  it("contient les 135 entrées validées", () => {
    expect(WOLOF_LEXICON.reduce((n, t) => n + t.entries.length, 0)).toBe(135);
  });

  it("va dans les consignes de Jokko, sans rien qui ressemble à un numéro de téléphone", () => {
    const text = lexiconInstruction();
    expect(text).toContain("ceeb = riz");
    expect(text).toContain("fey / fay = payer");
    expect(text).toContain("marse = marché");
    expect(text).toContain("waxaale = marchander");
    expect(text).toContain("jaay ci bor = vendre à crédit");
    expect(text).toContain("Ku ma ameel bor ? = Qui me doit de l'argent ?");
    expect(text).not.toMatch(/phone|221\d{9}/);
  });
});
