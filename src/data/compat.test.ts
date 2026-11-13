import { describe, expect, it } from "vitest";
import type { Product, Repair, Shop } from "../model.ts";
import { modelKeys, tacOf } from "./modelKeys";
import { evidenceText, fingerprint, learnedBetween, poseFamilies, sameParts, shopFamilies, stockFor, supplierFamilies } from "./compat";
import { buildNames, expandKeys, nameOf } from "./phoneBook";

describe("clés des modèles", () => {
  it.each([
    ["Écran Tecno BF6", ["bf6"]],
    ["LCD bf6", ["bf6"]],
    ["Tecno Spark Go 2023", ["sparkgo2023"]],
    ["iPhone 11 Pro Max", ["iphone11promax"]],
    ["Infinix Hot 40i", ["hot40i"]],
    ["Infinix Smart 7 X6515", ["smart7", "x6515"]],
    ["Samsung Galaxy A12", ["a12"]],
    ["Redmi Note 8", ["redminote8"]],
    ["Écran universel KI5K 6.6 pouces", ["ki5k"]],
    ["Batterie 5000mAh Tecno KG5", ["kg5"]],
  ])("%s", (text, keys) => expect(modelKeys(text)).toEqual(keys));
  it("IMEI", () => {
    expect(tacOf("35 969671 123456 7")).toBe("35969671");
    expect(tacOf("bf6")).toBeNull();
    expect(tacOf("1234")).toBeNull();
  });
});

const product = (id: string, name: string, aliases: string[] = [], stock = 0): Product => ({ id, name, unit: "pièce", stock, min: 0, price: 0, aliases } as Product);
const shop = (products: Product[], repairs: Repair[] = []): Shop => ({ id: "s1", name: "Atelier", activity: "Réparation de téléphones", products, repairs, clients: [], sales: [], expenses: [], invoices: [] } as unknown as Shop);
const repair = (id: string, device: string, parts: Repair["parts"], status: Repair["status"] = "repare"): Repair => ({ id, at: "2026-11-13", number: "R-001", clientName: "Moussa", phone: "", device, problem: "écran cassé", price: 15000, paid: 0, parts, status });

describe("ce que la boutique apprend au réseau", () => {
  const universel = product("u", "Écran Tecno KI5K", ["BF6", "BF7", "Spark 10C"], 2);
  it("liste du fournisseur : l'écran universel relie ses modèles", () => {
    expect(supplierFamilies([universel, product("b", "Batterie Tecno BL-49")])).toEqual([{ kind: "Écran", source: "fournisseur", models: ["ki5k", "bf6", "bf7", "spark10c"] }]);
  });
  it("réparation faite : l'appareil prend la pièce posée", () => {
    const s = shop([universel]);
    expect(poseFamilies(s, repair("r", "Tecno Pop 7 BF6", [{ productId: "u", label: "Écran Tecno KI5K", qty: 1, cost: 5000 }]))).toEqual([
      { kind: "Écran", source: "pose", models: ["pop7", "bf6", "ki5k", "bf7", "spark10c"] },
    ]);
    // Appareil sans modèle reconnaissable : rien n'est appris.
    expect(poseFamilies(s, repair("r", "téléphone de Fatou", [{ productId: "u", label: "x", qty: 1, cost: 0 }]))).toEqual([]);
  });
  it("seulement ce qui vient de changer", () => {
    const before = shop([universel], [repair("r", "Tecno BG6", [], "depot")]);
    const after = shop([universel], [repair("r", "Tecno BG6", [{ productId: "u", label: "Écran Tecno KI5K", qty: 1, cost: 5000 }])]);
    expect(learnedBetween(before, after)).toEqual([{ kind: "Écran", source: "pose", models: ["bg6", "ki5k", "bf6", "bf7", "spark10c"] }]);
    expect(learnedBetween(after, after)).toEqual([]);
    expect(shopFamilies(after)).toHaveLength(2);
    expect(fingerprint(shopFamilies(after))).toBe(fingerprint([...shopFamilies(after)].reverse()));
  });
});

describe("ce que le réseau répond", () => {
  const links = [
    { model: "bf6", other: "x6515", kind: "Écran", poses: 3, fournisseurs: 1, ateliers: 0 },
    { model: "bf6", other: "bg6", kind: "Écran", poses: 0, fournisseurs: 0, ateliers: 1 },
    { model: "bf6", other: "kg5", kind: "Batterie", poses: 0, fournisseurs: 2, ateliers: 0 },
  ];
  it("une pièce du stock rangée sous un autre modèle est trouvée, avec sa preuve", () => {
    const stock = [product("x", "Écran Infinix X6515", [], 3), product("k", "Batterie Tecno KG5", [], 1), product("z", "Écran Tecno CK7")];
    const found = stockFor(stock, ["bf6"], links);
    expect(found.map((f) => f.product.id)).toEqual(["x", "k"]);
    expect(found[0]).toMatchObject({ through: "x6515", evidence: { poses: 3 } });
  });
  it("un écran ne remplace jamais une batterie", () => {
    expect(stockFor([product("k", "Écran Tecno KG5", [], 1)], ["bf6"], links)).toEqual([]);
  });
  it("preuves lisibles et ordre", () => {
    expect(evidenceText({ poses: 2, fournisseurs: 1, ateliers: 0 }).text).toBe("posé dans 2 ateliers");
    expect(evidenceText({ poses: 0, fournisseurs: 0, ateliers: 1 }).level).toBe("atelier");
    const g = sameParts(links);
    expect(g.map((x) => x.kind)).toEqual(["Écran", "Batterie"]);
    expect(g[0]!.models.map((m) => m.model)).toEqual(["x6515", "bg6"]);
  });
});

describe("annuaire des téléphones", () => {
  const names = buildNames([["bf6", "Pop 7", "pop7"], ["bf7", "Spark Go 2023 / Pop 7 Pro", "pop7pro", "sparkgo2023"]]);
  it("autres noms du même téléphone", () => {
    expect(expandKeys(["pop7"], names).sort()).toEqual(["bf6", "pop7"]);
    expect(expandKeys(["sparkgo2023"], names).sort()).toEqual(["bf7", "pop7pro", "sparkgo2023"]);
    expect(nameOf("pop7", names)).toBe("BF6 · Pop 7");
    expect(nameOf("ck7", names)).toBe("CK7");
  });
});

describe("suffixes des codes", () => {
  it("P33+ et A58 Lite sont d'autres téléphones", () => {
    expect(modelKeys("Écran Tecno P33+")).toEqual(["p33plus"]);
    expect(modelKeys("Samsung A58 Lite")).toEqual(["a58lite"]);
    expect(modelKeys("Écran Tecno POP9 (OLED)")).toEqual(["pop9"]);
    expect(modelKeys("Pop 9")).toEqual(["pop9"]);
    expect(modelKeys("Redmi 9A")).toEqual(["redmi9a"]);
  });
});
