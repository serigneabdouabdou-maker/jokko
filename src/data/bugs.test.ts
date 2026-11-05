import { describe, expect, it } from "vitest";
import { cleanError, isNoise } from "./bugs";

describe("bugs signalés", () => {
  it("masque les numéros et raccourcit", () => {
    expect(cleanError("Client 221775674725 introuvable")).toBe("Client # introuvable");
    expect(cleanError("x".repeat(300)).length).toBe(200);
  });
  it("ignore le bruit des navigateurs et des réseaux", () => {
    expect(isNoise("ResizeObserver loop limit exceeded", "")).toBe(true);
    expect(isNoise("Failed to fetch", "")).toBe(true);
    expect(isNoise("boom", "chrome-extension://abc/x.js")).toBe(true);
    expect(isNoise("Cannot read properties of undefined", "/assets/index.js:1")).toBe(false);
  });
});
