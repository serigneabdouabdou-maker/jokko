import { describe, expect, it } from "vitest";
import { dayKey, GREETINGS, greetingFor, SPEED_NOTE, SPEED_RATE } from "./greeting.ts";

describe("salutation automatique", () => {
  const morning = new Date(2026, 10, 2, 8, 30);

  it("se présente la toute première fois", () => {
    expect(greetingFor(null, morning)).toBe("presentation");
  });

  it("salue brièvement au premier appui de la journée", () => {
    expect(greetingFor("2026-11-01", morning)).toBe("court");
  });

  it("ne salue plus le reste de la journée", () => {
    expect(greetingFor(dayKey(morning), new Date(2026, 10, 2, 18, 0))).toBe(null);
  });

  it("dit la salutation wolof validée", () => {
    expect(GREETINGS.presentation.wo.text).toBe("Asalaa maalekum ! Maa ngi tudd Jokko. Maay sa ndimbal ci sa bitig.");
    expect(GREETINGS.court.wo.text).toBe("Asalaa maalekum ! Maa ngi lay déglu.");
  });
});

describe("vitesse de la voix", () => {
  it("va du plus lent au plus rapide", () => {
    expect(SPEED_RATE.lent < SPEED_RATE.normal && SPEED_RATE.normal < SPEED_RATE.rapide).toBe(true);
  });

  it("donne une consigne à Jokko pour chaque vitesse", () => {
    for (const note of Object.values(SPEED_NOTE)) expect(note.startsWith("(Réglage du commerçant")).toBe(true);
  });
});
