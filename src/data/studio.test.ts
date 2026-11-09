import { describe, expect, it } from "vitest";
import { type CoutureModel, filterModels } from "./studio";
import { screenLabel, screensOf } from "./metiers";

const m = (id: string, category: CoutureModel["category"], occasion: string, age: string, daysAgo = 30): CoutureModel => ({
  id, title: id, category, garment: "", fabric: "", image_path: "", thumb_path: null, occasion, age,
  created_at: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
});

describe("Studio", () => {
  const all = [m("a", "femme", "tabaski", "adulte"), m("b", "femme", "magal", "jeune", 2), m("c", "enfant", "tabaski", "petit"), m("d", "homme", "korite", "adulte")];
  it("rubriques, âges et nouveautés", () => {
    expect(filterModels(all, "femme", "tabaski", "tout").map((x) => x.id)).toEqual(["a"]);
    expect(filterModels(all, "femme", "nouveautes", "tout").map((x) => x.id)).toEqual(["b"]);
    expect(filterModels(all, "enfant", "tout", "petit").map((x) => x.id)).toEqual(["c"]);
    expect(filterModels(all, "homme", "tout", "tout")).toHaveLength(1);
  });
  it("le tailleur a son Studio et ses Paiements (pas de « Ventes »)", () => {
    expect(screensOf("Couture, tailleur").has("studio")).toBe(true);
    expect(screensOf("Alimentation générale").has("studio")).toBe(false);
    expect(screenLabel("Couture, tailleur", "ventes", "Ventes")).toBe("Paiements");
    expect(screenLabel("Alimentation générale", "ventes", "Ventes")).toBe("Ventes");
  });
});
