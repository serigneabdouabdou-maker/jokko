import { describe, expect, it } from "vitest";
import { type CoutureModel, filterModels, framesOf, modelLink } from "./studio";
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

describe("partage et rotation", () => {
  it("face d'abord, puis profil et dos", () => {
    expect(framesOf({ image_path: "modeles/a.jpg", views: ["vues/a-profil.jpg", "vues/a-dos.jpg"] })).toEqual(["modeles/a.jpg", "vues/a-profil.jpg", "vues/a-dos.jpg"]);
    expect(framesOf({ image_path: "modeles/b.jpg" })).toEqual(["modeles/b.jpg"]);
  });
  it("le lien public garde l'atelier qui l'a envoyé", () => {
    expect(modelLink("m1", "shop-1", "https://jokkoapp.com")).toBe("https://jokkoapp.com/?modele=m1&t=shop-1");
    expect(modelLink("m1", undefined, "https://jokkoapp.com")).toBe("https://jokkoapp.com/?modele=m1");
  });
});
