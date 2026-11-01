import { describe, expect, it } from "vitest";
import type { Shop } from "../model.ts";
import { can, daysLeft, effectivePlan, waveLinkFor } from "./plans";

const NOW = new Date("2026-11-01T10:00:00Z");
const day = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString();

describe("offres", () => {
  it("essai de 14 jours = Avancé, puis Gratuit", () => {
    expect(effectivePlan({ plan: { plan: "gratuit", until: null, trialUntil: day(10) } }, NOW)).toEqual({ plan: "avance", trial: true, until: day(10) });
    expect(effectivePlan({ plan: { plan: "gratuit", until: null, trialUntil: day(-1) } }, NOW).plan).toBe("gratuit");
    expect(daysLeft(day(10), NOW)).toBe(10);
  });

  it("offre payée prioritaire tant qu'elle n'est pas expirée", () => {
    expect(effectivePlan({ plan: { plan: "medium", until: day(20), trialUntil: null } }, NOW).plan).toBe("medium");
    expect(effectivePlan({ plan: { plan: "medium", until: day(-2), trialUntil: null } }, NOW).plan).toBe("gratuit");
  });

  it("fonctions par offre", () => {
    const gratuit = { plan: { plan: "gratuit" as const, until: null, trialUntil: null } };
    const medium = { plan: { plan: "medium" as const, until: day(5), trialUntil: null } };
    const avance = { plan: { plan: "avance" as const, until: day(5), trialUntil: null } };
    expect([can(gratuit, "vendeurs", NOW), can(gratuit, "scanner", NOW), can(gratuit, "chat", NOW)]).toEqual([false, false, false]);
    expect([can(medium, "vendeurs", NOW), can(medium, "distance", NOW), can(medium, "conseiller", NOW)]).toEqual([true, true, false]);
    expect([can(avance, "conseiller", NOW), can(avance, "boutiques", NOW), can(avance, "chat", NOW)]).toEqual([true, true, true]);
  });
});

describe("lien Wave de CFC", () => {
  const base = "https://pay.wave.com/m/M_sn_OPJCGonC6tjx/c/sn/";
  it("met le montant de la demande", () => {
    expect(waveLinkFor(base, 3000)).toBe(base + "?amount=3000");
    expect(waveLinkFor(base + "?amount=7500", 22500)).toBe(base + "?amount=22500");
  });
});

describe("conversation en direct", () => {
  it("réservée à Avancé (et à l'essai) ; Gratuit et Médium passent en messages vocaux", () => {
    const now = new Date("2026-11-01T10:00:00Z");
    const shop = (plan: Shop["plan"]) => ({ plan });
    expect(can(shop({ plan: "avance", until: "2026-12-01T00:00:00Z", trialUntil: null }), "direct", now)).toBe(true);
    expect(can(shop({ plan: "gratuit", until: null, trialUntil: "2026-11-10T00:00:00Z" }), "direct", now)).toBe(true);
    expect(can(shop({ plan: "medium", until: "2026-12-01T00:00:00Z", trialUntil: null }), "direct", now)).toBe(false);
    expect(can(shop({ plan: "gratuit", until: null, trialUntil: null }), "direct", now)).toBe(false);
  });
});
