import { describe, expect, it } from "vitest";
import { type Shop, newShop } from "@/model";
import { compatFor, linkModel, mergeCompat, unlinkModel } from "./supplierCompat";
import { readSupplierChat } from "./supplierChat";
import { quickQuote } from "./quickQuote";
import { holds, productsNamedIn, searchProducts } from "./partSearch";
import { plannedPartCost } from "./repairs";

const CHAT = [
  "27/07/2026, 10:07 - Fallou: Infinix smart 7",
  "27/07/2026, 10:07 - Fallou: Liste",
  "27/07/2026, 10:13 - Bathie: Bf6 ",
  "Bf7",
  "Ki5k",
  "A60",
  "A05s",
  "X6516",
  "10/08/2026, 09:00 - Bathie: Kd7 | Cc6 | Cd7", // sans demande « List » : jamais pris
  "24/10/2026, 14:14 - Fallou: List spark go 2025",
  "24/10/2026, 14:14 - Fallou: <Médias omis>",
  "24/10/2026, 14:56 - Bathie: Pop9 KL4",
  "Spark30c KL5",
  "Pop10",
  "24/10/2026, 16:12 - Fallou: List ke5",
  "24/10/2026, 16:14 - Bathie: Ke5",
  "X657",
  "S16",
  "P36",
  "16/11/2026, 10:09 - Fallou: Ki5k",
  "16/11/2026, 10:09 - Fallou: List",
  "16/11/2026, 10:12 - Fallou: <Médias omis>",
  "16/11/2026, 10:38 - Bathie: Bf6 ",
  "Bf7",
  "Ki5k",
  "X6516",
  "A60",
  "A70",
  "Smart 7",
  "21/11/2026, 09:40 - Bathie: 3 LCD A35e 5000=15,000",
  "Total 🟰 15,000fr",
  "21/11/2026, 09:41 - Fallou: 4 lcd bf6",
  "2 lcd ki5k",
].join("\n");

describe("écrans qui vont ensemble : seulement les réponses à « List »", () => {
  it("lit chaque réponse du fournisseur à une demande « List », avec le modèle demandé", () => {
    const imp = readSupplierChat(CHAT);
    expect(imp.compat.map((g) => [g.asked, g.models])).toEqual([
      ["Infinix smart 7", ["Bf6", "Bf7", "Ki5k", "A60", "A05s", "X6516", "Infinix smart 7"]],
      ["spark go 2025", ["Pop9", "KL4", "Spark30c", "KL5", "Pop10", "spark go 2025"]],
      ["ke5", ["Ke5", "X657", "S16", "P36"]],
      ["Ki5k", ["Bf6", "Bf7", "Ki5k", "X6516", "A60", "A70", "Smart 7"]],
    ]);
  });

  it("la liste la plus récente remplace l'ancienne : l'A05s n'est plus avec le BF6", () => {
    const groups = mergeCompat([], readSupplierChat(CHAT).compat, true);
    const bf6 = compatFor(groups, "BF6").map((c) => c.key);
    expect(bf6).toEqual(expect.arrayContaining(["a60", "a70", "bf7", "ki5k", "smart7", "x6516"]));
    expect(bf6).not.toContain("a05s");
    expect(compatFor(groups, "A05s")).toEqual([]);
    expect(compatFor(groups, "Pop 9").map((c) => c.key)).toContain("kl5");
    // Les anciens groupes (lus avant la règle « List ») ne comptent plus.
    expect(compatFor([{ models: ["Bf6", "A05s"], n: 3, last: "2025-12-06" }], "BF6")).toEqual([]);
  });

  it("« ✕ ne va pas » : enlevé des autres noms de toute la famille et plus jamais proposé", () => {
    const shop: Shop = {
      ...newShop("Atelier", "reparation"),
      products: [
        { id: "bf6", name: "Écran Tecno BF6", unit: "pièce", stock: 0, min: 0, price: 0, cost: 3700, aliases: ["A60", "A05S", "BF7"] },
        { id: "ki5k", name: "Écran Tecno KI5K", unit: "pièce", stock: 0, min: 0, price: 0, cost: 3700, aliases: ["BF6", "A05S"] },
        { id: "a05s", name: "Écran Samsung A05S", unit: "pièce", stock: 1, min: 0, price: 0, cost: 5500, aliases: ["BF6"] },
      ],
      suppliers: [{ id: "f", name: "Bathie", phone: "", compat: [{ models: ["Bf6", "Ki5k", "A05s"], n: 1, last: "2026-07-27", from: "liste" }] }],
    };
    const next = unlinkModel(shop, "BF6", "A05s");
    expect(next.products.map((p) => p.aliases)).toEqual([["A60", "BF7"], ["BF6"], []]);
    expect(compatFor(next.suppliers![0]!.compat!, "BF6", next.suppliers![0]!.compatNo).map((c) => c.key)).toEqual(["ki5k"]);
    expect(quickQuote(next, "BF6").lines.map((l) => l.name)).not.toContain("Écran Samsung A05S");
    expect(quickQuote(next, "A05s").lines.map((l) => l.name)).toEqual(["Écran Samsung A05S"]);
  });

  it("le patron ajoute lui-même un modèle : gardé même quand la discussion est relue", () => {
    const shop: Shop = {
      ...newShop("Atelier", "reparation"),
      products: [
        { id: "kg5k", name: "Écran Tecno KG5K", unit: "pièce", stock: 1, min: 0, price: 0, cost: 3800, aliases: ["BE8", "KH6"] },
        { id: "be8", name: "Écran Tecno BE8", unit: "pièce", stock: 0, min: 0, price: 0, cost: 3800, aliases: ["KG5K"] },
      ],
      suppliers: [{ id: "f", name: "Bathie", phone: "", compat: [{ models: ["Kg5k", "Be8", "Kh6"], n: 1, last: "2026-10-23", from: "liste" }], compatNo: ["kg5k|spark8c"] }],
    };
    const next = linkModel(shop, "KG5K", "Spark 8c", "2026-11-22");
    expect(next.products.map((p) => p.aliases)).toEqual([["BE8", "KH6", "SPARK 8C"], ["KG5K", "SPARK 8C"]]);
    expect(next.suppliers![0]!.compatNo).toEqual([]);
    expect(compatFor(next.suppliers![0]!.compat!, "KG5K")[0]).toMatchObject({ model: "SPARK 8C", mine: true });
    expect(searchProducts(next.products, "Spark 8C").map((h) => h.product.id)).toEqual(["kg5k", "be8"]);
    // Relire toute la discussion ne l'efface pas.
    const reread = mergeCompat(next.suppliers![0]!.compat!, [], true);
    expect(compatFor(reread, "KG5K").map((c) => c.key)).toEqual(["spark8c"]);
  });

  it("« A05 » ne trouve pas l'A05S, mais « iPhone 11 » trouve l'iPhone 11 Pro Max", () => {
    const products = [
      { id: "1", name: "Écran Tecno BF6", unit: "pièce", stock: 0, min: 0, price: 0, cost: 3700, aliases: ["A05S"] },
      { id: "2", name: "Écran Samsung A05S", unit: "pièce", stock: 0, min: 0, price: 0, cost: 5500 },
      { id: "3", name: "Écran Samsung A05", unit: "pièce", stock: 2, min: 0, price: 0, cost: 4000 },
      { id: "4", name: "Écran iPhone 11 Pro Max", unit: "pièce", stock: 0, min: 0, price: 0, cost: 7500 },
    ];
    expect(searchProducts(products, "A05").map((h) => h.product.id)).toEqual(["3"]);
    expect(searchProducts(products, "iPhone 11").map((h) => h.product.id)).toEqual(["4"]);
    expect(holds("ecransamsunga05s", "a05")).toBe(false);
  });

  it("prix pour un client : l'écran universel du stock qui va sur BF6 selon le fournisseur", () => {
    const shop: Shop = {
      ...newShop("Atelier", "reparation"),
      products: [{ id: "a70", name: "Écran Itel A60", unit: "pièce", stock: 1, min: 0, price: 0, cost: 3500 }],
      suppliers: [{ id: "f", name: "Bathie", phone: "", compat: [{ models: ["Bf6", "Bf7", "A60"], n: 3, last: "2026-11-16", from: "liste" }] }],
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
