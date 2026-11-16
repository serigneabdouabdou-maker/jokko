import { describe, expect, it } from "vitest";
import type { Product } from "../model.ts";
import { productNamedIn, searchProducts } from "./partSearch.ts";

const part = (id: string, name: string, cost: number, aliases: string[] = [], stock = 0): Product => ({ id, name, unit: "pièce", stock, min: 0, price: 0, cost, ...(aliases.length ? { aliases } : {}) });

const parts: Product[] = [
  part("ki5k", "Écran Tecno KI5K", 3700, ["A05S", "A60", "BF6", "BF7", "Smart 7"]),
  part("bf6", "Écran Tecno BF6", 3700, ["KI5K", "BF7", "Pop 7"]),
  part("bat", "Batterie Tecno BF6", 1500, [], 2),
  part("kf6", "Écran Tecno KF6", 4000, ["KG6", "Spark 7"]),
  part("i11", "Écran iPhone 11", 6000),
  part("i11pm", "Écran iPhone 11 Pro Max", 8000),
];
const ids = (q: string) => searchProducts(parts, q).map((h) => h.product.id);

describe("recherche d'une pièce", () => {
  it("« bf6 » : la pièce à ce nom d'abord (en stock devant), puis l'écran universel qui va dessus", () => {
    expect(ids("bf6")).toEqual(["bat", "bf6", "ki5k"]);
    expect(searchProducts(parts, "bf6").find((h) => h.product.id === "ki5k")?.via).toBe("BF6");
  });

  it("« écran bf6 » : seulement les écrans (le nom ou un téléphone compatible), pas la batterie", () => {
    expect(ids("écran bf6")).toEqual(["bf6", "ki5k"]);
  });

  it("le nom commercial trouve le code (« spark 7 » → écran KF6)", () => {
    expect(ids("spark 7")).toEqual(["kf6"]);
    expect(ids("Spark7")).toEqual(["kf6"]);
  });

  it("« iphone 11 » : le plus court d'abord ; une seule lettre ne cherche rien", () => {
    expect(ids("iphone 11")).toEqual(["i11", "i11pm"]);
    expect(ids("a")).toEqual([]);
  });

  it("retrouve la pièce notée au dépôt dans le texte de la panne", () => {
    expect(productNamedIn(parts, "écran cassé · Écran Tecno KF6")?.id).toBe("kf6");
    expect(productNamedIn(parts, "batterie gonflée")).toBeUndefined();
  });
});

describe("stock bas", () => {
  it("seuil 0 = pas d'alerte (pièce du catalogue à stock 0) ; un seuil > 0 alerte à ce seuil", async () => {
    const { isLow } = await import("../model.ts");
    expect(isLow({ stock: 0, min: 0 })).toBe(false);
    expect(isLow({ stock: -1, min: 0 })).toBe(true);
    expect(isLow({ stock: 2, min: 2 })).toBe(true);
    expect(isLow({ stock: 3, min: 2 })).toBe(false);
  });
});

describe("Même pièce que… (16/11/2026)", () => {
  it("relie l'écran A70 au groupe BF6 / BF7 / KI5K dans les deux sens, sans qu'une pièce se liste elle-même", async () => {
    const { linkSamePart } = await import("./partSearch");
    const { kindOf } = await import("./pricing");
    const P = (id: string, name: string, aliases?: string[]) => ({ id, name, unit: "pièce", stock: 0, min: 0, price: 0, aliases });
    const products = [
      P("a70", "Écran Itel A70", ["BF6", "BF7", "KI5K", "Smart 7"]),
      P("bf6", "Écran Tecno BF6", ["BF7", "KI5K"]),
      P("bf7", "Écran Tecno BF7"),
      P("ki5k", "Écran Tecno KI5K", ["A60"]),
      P("bat", "Batterie Tecno BF6"),
      P("x", "Écran Samsung A12"),
    ];
    const out = linkSamePart(products, "a70", kindOf);
    const by = (id: string) => out.find((p) => p.id === id)!.aliases ?? [];
    expect(by("bf6")).toEqual(expect.arrayContaining(["A70", "BF7", "KI5K", "Smart 7"]));
    expect(by("bf6")).not.toContain("BF6");
    expect(by("bf7")).toEqual(expect.arrayContaining(["A70", "BF6", "KI5K"]));
    expect(by("ki5k")).toEqual(expect.arrayContaining(["A60", "A70", "BF6"]));
    expect(out.find((p) => p.id === "bat")!.aliases).toBeUndefined();
    expect(out.find((p) => p.id === "x")!.aliases).toBeUndefined();
  });
});
