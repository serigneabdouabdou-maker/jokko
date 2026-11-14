import { describe, expect, it } from "vitest";
import { ko, payloadTone, payloadTrend } from "./payload";

describe("taille des demandes (console)", () => {
  it("niveaux", () => {
    expect(payloadTone(10_000, 32_768)).toBe("good");
    expect(payloadTone(27_000, 32_768)).toBe("warn");
    expect(payloadTone(31_500, 32_768)).toBe("bad");
  });
  it("tendance du dernier jour mesuré", () => {
    expect(payloadTrend([{ max: 10_000 }, { max: 0 }, { max: 15_000 }])).toBe(50);
    expect(payloadTrend([{ max: 0 }, { max: 12_000 }])).toBeNull();
  });
  it("Ko lisibles", () => {
    expect(ko(24_123)).toBe("24 Ko");
    expect(ko(2_560)).toBe("2,5 Ko");
  });
});
