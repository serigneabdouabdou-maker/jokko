import { describe, expect, it } from "vitest";
import { seedShop } from "../model";
import { applyImport, parseRows, previewImport, textToRows } from "./stockImport";

describe("import du stock", () => {
  it("fichier avec titres de colonnes, dans n'importe quel ordre", () => {
    const { items, errors } = parseRows([
      ["Prix", "Désignation", "Qté", "Unité"],
      [18000, "Riz brisé", 12, "sac"],
      ["7 500", "Huile", "10", "bidon"],
    ]);
    expect(errors).toEqual([]);
    expect(items).toEqual([
      { name: "Riz brisé", unit: "sac", quantity: 12, price: 18000, min: null },
      { name: "Huile", unit: "bidon", quantity: 10, price: 7500, min: null },
    ]);
  });

  it("sans titres : Article, Quantité, Prix, Unité", () => {
    const { items } = parseRows([["Savon", 24, 250, "pièce"]]);
    expect(items[0]).toMatchObject({ name: "Savon", quantity: 24, price: 250 });
  });

  it("liste collée depuis WhatsApp ou un carnet", () => {
    const rows = textToRows("Riz 12 sac 18000\nHuile - 10 - 7500\nSucre;40;700;kg");
    const { items } = parseRows(rows);
    expect(items.map((i) => [i.name, i.quantity, i.price])).toEqual([["Riz", 12, 18000], ["Huile", 10, 7500], ["Sucre", 40, 700]]);
  });

  it("CSV Excel avec point-virgule", () => {
    const { items } = parseRows(textToRows("﻿Article;Unité;Quantité;Prix;Seuil\r\nLait;pièce;8;900;6"));
    expect(items[0]).toMatchObject({ name: "Lait", unit: "pièce", quantity: 8, price: 900, min: 6 });
  });

  it("ligne illisible signalée, doublons additionnés", () => {
    const { items, errors } = parseRows([["Article", "Quantité"], ["Riz", "douze"], ["Sel", 5], ["sel", 3]]);
    expect(errors[0]).toContain("Riz");
    expect(items).toEqual([{ name: "Sel", unit: "pièce", quantity: 8, price: null, min: null }]);
  });

  it("aperçu puis import : met à jour l'existant, crée le nouveau", () => {
    const shop = seedShop();
    const lines = previewImport(shop, parseRows([["Article", "Quantité", "Prix"], ["huile", 20, 8000], ["Savon", 24, 250]]).items);
    expect(lines.map((l) => l.status)).toEqual(["mis à jour", "nouveau"]);
    const replaced = applyImport(shop, lines, "remplacer");
    expect(replaced.products.find((p) => p.name === "Huile")).toMatchObject({ stock: 20, price: 8000 });
    expect(replaced.products.find((p) => p.name === "Savon")).toMatchObject({ stock: 24, price: 250 });
    const added = applyImport(shop, lines, "ajouter");
    expect(added.products.find((p) => p.name === "Huile")!.stock).toBe(23);
  });
});
