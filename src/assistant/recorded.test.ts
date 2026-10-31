import { describe, expect, it } from "vitest";
import { matchRecorded, RECORDED, recordedUrl } from "./recorded.ts";

describe("phrases enregistrées", () => {
  it("reconnaît la phrase même avec une autre ponctuation ou des majuscules", () => {
    expect(matchRecorded("Bind naa ko.")).toBe("Bind naa ko.");
    expect(matchRecorded(" bind naa ko ")).toBe("Bind naa ko.");
    expect(matchRecorded("Baal ma waxaat ko !")).toBe("Baal ma, waxaat ko.");
  });
  it("ne prend pas une phrase qui a autre chose dedans", () => {
    expect(matchRecorded("Bind naa ko : ñaari bidon diw, ñetti junni.")).toBeNull();
    expect(matchRecorded("C'est noté.")).toBeNull();
  });
  it("chaque phrase a son fichier", () => {
    expect(new Set(RECORDED.map((r) => r.slug)).size).toBe(RECORDED.length);
    expect(recordedUrl("note")).toMatch(/voix\/phrases\/note-v\d+\.mp3$/);
  });
});
