import { describe, expect, it } from "vitest";
import { lineAt, VOICE_LINES } from "./voiceIntro.ts";

describe("voix de la page d'accueil", () => {
  it("les phrases se suivent sans se chevaucher", () => {
    for (let i = 1; i < VOICE_LINES.length; i++) expect(VOICE_LINES[i].start >= VOICE_LINES[i - 1].end).toBe(true);
  });
  it("le sous-titre suit l'audio", () => {
    expect(lineAt(0)).toBe(0);
    expect(lineAt(6)).toBe(1);
    expect(lineAt(30)).toBe(4);
    expect(lineAt(60)).toBe(VOICE_LINES.length - 1);
  });
  it("chaque phrase en wolof a sa traduction", () => {
    expect(VOICE_LINES.filter((l) => l.lang === "wo").every((l) => Boolean(l.fr))).toBe(true);
  });
});
