import { describe, expect, it } from "vitest";
import { visitSource } from "./visits";

describe("source d'une visite", () => {
  it("reconnaît les réseaux", () => {
    expect(visitSource("?fbclid=abc", "")).toBe("facebook");
    expect(visitSource("", "https://l.facebook.com/")).toBe("facebook");
    expect(visitSource("?utm_source=tiktok", "")).toBe("tiktok");
    expect(visitSource("", "https://www.google.com/")).toBe("google");
    expect(visitSource("", "")).toBe("direct");
    expect(visitSource("", "https://jokkoapp.com/")).toBe("direct");
    expect(visitSource("", "https://exemple.sn/")).toBe("autre site");
  });
});
