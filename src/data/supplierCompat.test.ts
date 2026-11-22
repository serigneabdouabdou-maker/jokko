import { describe, expect, it } from "vitest";
import { type Shop, newShop } from "@/model";
import { compatFor, compatGroups, mergeCompat } from "./supplierCompat";
import { readSupplierChat } from "./supplierChat";
import { quickQuote } from "./quickQuote";
import { productsNamedIn } from "./partSearch";
import { plannedPartCost } from "./repairs";

const CHAT = [
  "16/11/2026, 10:00 - Fallou: List",
  "16/11/2026, 10:01 - Bathie: Bf6",
  "Bf7",
  "Ki5k",
  "X6516",
  "A60",
  "Smart 7",
  "27/07/2026, 10:13 - Bathie: Bf6 | Bf7 | Ki5k | A05s",
  "28/12/2024, 08:41 - Bathie: spark 7 : kf6 Kg6",
  "spark 4: kc8",
  "Kb8",
  "21/11/2026, 09:40 - Bathie: 3 LCD A35e 5000=15,000",
  "Total 🟰 15,000fr",
  "21/11/2026, 09:41 - Fallou: 4 lcd bf6", // commande de Fallou : jamais une liste du fournisseur
  "2 lcd ki5k",
].join("\n");

describe("écrans qui vont ensemble, d'après le fournisseur", () => {
  it("lit les listes du fournisseur (une par ligne, avec |, ou « spark 7 : … »), jamais les commandes", () => {
    const imp = readSupplierChat(CHAT);
    expect(imp.compat.map((g) => g.models)).toEqual([
      ["Bf6", "Bf7", "Ki5k", "X6516", "A60", "Smart 7"],
      ["Bf6", "Bf7", "Ki5k", "A05s"],
      ["spark 7", "kf6", "Kg6"],
      ["spark 4", "kc8", "Kb8"],
    ]);
  });

  it("compte combien de fois le fournisseur l'a dit, jamais de chaîne", () => {
    const groups = mergeCompat([], compatGroups([
      { date: "2026-11-16", who: "B", text: "Bf6\nBf7\nKi5k" },
      { date: "2026-07-27", who: "B", text: "Bf6 | Bf7 | A05s" },
      { date: "2026-07-27", who: "B", text: "A05s\nX999" },
    ], "B"), true);
    const bf6 = compatFor(groups, "BF6");
    expect(bf6.map((c) => [c.model, c.n])).toEqual([["Bf7", 2], ["A05s", 1], ["Ki5k", 1]]);
    expect(bf6.some((c) => c.key === "x999")).toBe(false); // A05s va avec X999, mais pas forcément BF6
  });

  it("prix pour un client : l'écran universel du stock qui va sur BF6 selon le fournisseur", () => {
    const shop: Shop = {
      ...newShop("Atelier", "reparation"),
      products: [{ id: "a70", name: "Écran Itel A60", unit: "pièce", stock: 1, min: 0, price: 0, cost: 3500 }],
      suppliers: [{ id: "f", name: "Bathie", phone: "", compat: [{ models: ["Bf6", "Bf7", "A60"], n: 3, last: "2026-11-16" }] }],
    };
    const r = quickQuote(shop, "BF6");
    expect(r.compat.map((c) => c.model)).toEqual(["A60", "Bf7"]);
    expect(r.lines[0]).toMatchObject({ name: "Écran Itel A60", supplierSays: { model: "A60", n: 3 } });
  });
});

describe("plusieurs pièces pour le même client", () => {
  it("la panne garde toutes les pièces prévues ; leur prix compte dès le dépôt", () => {
    const products = [
      { id: "e", name: "Écran Tecno BF6", unit: "pièce", stock: 0, min: 0, price: 0, cost: 3700 },
      { id: "c", name: "Connecteur de charge Tecno BF6", unit: "pièce", stock: 0, min: 0, price: 0, cost: 300 },
      { id: "b", name: "Batterie Tecno BF6", unit: "pièce", stock: 0, min: 0, price: 0, cost: 1500 },
    ];
    const problem = "Écran cassé, Ne charge pas · Écran Tecno BF6 · Connecteur de charge Tecno BF6";
    expect(productsNamedIn(products, problem).map((p) => p.id)).toEqual(["e", "c"]);
    expect(plannedPartCost({ products }, { problem })).toEqual({ label: "Écran Tecno BF6 + Connecteur de charge Tecno BF6", cost: 4000 });
    // Ancienne panne avec une seule pièce : rien ne change.
    expect(productsNamedIn(products, "Écran cassé · Écran Tecno BF6").map((p) => p.id)).toEqual(["e"]);
  });
});
