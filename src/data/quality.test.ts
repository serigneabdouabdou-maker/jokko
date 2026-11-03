import { describe, expect, it } from "vitest";
import { errorRate, guessLang } from "./quality.ts";

describe("cahier des erreurs", () => {
  it("reconnaît le wolof", () => {
    expect(guessLang("Jaay naa ñaari bidon diwu oto", "fr")).toBe("wo");
    expect(guessLang("Moussa dafa am bor 2000", "fr")).toBe("wo");
  });
  it("reconnaît le français", () => {
    expect(guessLang("J'ai vendu deux sacs de riz", "wo")).toBe("fr");
  });
  it("sans indice : la langue de l'appli", () => {
    expect(guessLang("2000", "wo")).toBe("wo");
    expect(guessLang("2000", "en")).toBe("fr");
  });
  it("calcule le taux", () => {
    expect(errorRate({ actions: 1000, annule: 50, signale: 35 })).toBe(8.5);
    expect(errorRate({ actions: 0, annule: 0, signale: 0 })).toBeNull();
  });
});
