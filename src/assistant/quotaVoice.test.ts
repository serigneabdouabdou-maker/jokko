import { describe, expect, it } from "vitest";
import { QUOTA_MESSAGES, quotaClipUrl, quotaVariant } from "./quotaVoice";

describe("forfait épuisé : quel message dire", () => {
  it("essai fini → proposer les offres", () => {
    expect(quotaVariant({ reason: "essai", tier: "essai" }, true)).toBe("essai");
    expect(QUOTA_MESSAGES.essai.offers).toBe(true);
  });
  it("limite du jour : offre supérieure, sauf en Avancé (déjà au maximum)", () => {
    expect(quotaVariant({ reason: "quota", tier: "gratuit" }, true)).toBe("jour");
    expect(quotaVariant({ reason: "echanges", tier: "medium" }, true)).toBe("jour");
    expect(quotaVariant({ reason: "echanges", tier: "avance" }, true)).toBe("jour-max");
    expect(QUOTA_MESSAGES["jour-max"].offers).toBe(false);
  });
  it("un vendeur est renvoyé vers le patron", () => {
    expect(quotaVariant({ reason: "essai" }, false)).toBe("vendeur");
  });
  it("une fonction hors de l'offre n'est pas un forfait épuisé", () => {
    expect(quotaVariant({ reason: "offre", tier: "medium" }, true)).toBeNull();
    expect(quotaVariant({}, true)).toBeNull();
  });
  it("fichiers enregistrés : wolof et français", () => {
    expect(quotaClipUrl("jour", "wo")).toMatch(/forfait-jour-fini-v1\.mp3$/);
    expect(quotaClipUrl("jour", "fr")).toMatch(/forfait-jour-fini-fr-v1\.mp3$/);
  });
  it("gratuit : forfait du mois fini → voix + offres Médium / Avancé", () => {
    expect(quotaVariant({ reason: "mois", tier: "gratuit" }, true)).toBe("mois");
    expect(QUOTA_MESSAGES.mois.offers).toBe(true);
    expect(quotaClipUrl("mois", "wo")).toMatch(/forfait-mois-fini-v1\.mp3$/);
    expect(quotaVariant({ reason: "mois", tier: "gratuit" }, false)).toBe("vendeur");
  });
  it("pause des comptes gratuits : message du jour, avec les offres", () => {
    expect(quotaVariant({ reason: "pause", tier: "gratuit" }, true)).toBe("jour");
  });
  it("voix claire épuisée : pas d'annonce (Jokko garde sa voix normale)", () => {
    expect(quotaVariant({ reason: "voix", tier: "gratuit" }, true)).toBeNull();
  });
});
