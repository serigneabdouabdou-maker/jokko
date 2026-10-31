import { describe, expect, it } from "vitest";
import { guessLanguage, splitSentences } from "./clearVoice.ts";

describe("voix claire", () => {
  it("coupe la réponse en phrases finies, garde le reste", () => {
    expect(splitSentences("Bind naa ko. Huile bi dafa néew")).toEqual({ done: ["Bind naa ko."], rest: "Huile bi dafa néew" });
    expect(splitSentences("C'est noté : 2 bidons d'huile, 15 000 F. ")).toEqual({ done: ["C'est noté : 2 bidons d'huile, 15 000 F."], rest: "" });
    expect(splitSentences("Waaw ! Ñaata ? ")).toEqual({ done: ["Waaw !", "Ñaata ?"], rest: "" });
    expect(splitSentences("15 000 F")).toEqual({ done: [], rest: "15 000 F" });
  });
  it("reconnaît le wolof et le français", () => {
    expect(guessLanguage("Bind naa ko : ñaari bidon diw, ñetti junni.", "fr")).toBe("wo");
    expect(guessLanguage("Asalaa maalekum ! Maa ngi lay déglu.", "fr")).toBe("wo");
    expect(guessLanguage("C'est noté : 2 bidons d'huile, 15 000 F.", "wo")).toBe("fr");
    expect(guessLanguage("La facture est prête : touche Envoyer sur WhatsApp.", "wo")).toBe("fr");
    expect(guessLanguage("15 000 F.", "wo")).toBe("wo");
  });
});
