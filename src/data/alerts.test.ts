import { describe, expect, it } from "vitest";
import type { Product } from "../model";
import { detectAlerts, openedAt } from "./alerts";
import type { JournalRow } from "./journal";

const products: Product[] = [
  { id: "huile", name: "Huile", unit: "bidon", stock: 10, min: 2, price: 7500, cost: 6500 },
  { id: "riz", name: "Riz", unit: "sac", stock: 5, min: 1, price: 18000, retail: { unit: "kilo", perUnit: 50, price: 400 } },
];
const PATRON = "patron";
const VENDEUR = "vendeur";
let id = 0;
const row = (over: Partial<JournalRow>): JournalRow => ({ id: ++id, shop_id: "s", at: "2026-10-31T10:00:00Z", user_id: VENDEUR, tbl: "sales", row_id: "x", action: "ajout", before: null, after: null, ...over });
const alerts = (rows: JournalRow[]) => detectAlerts(rows, products, new Set([PATRON]));

describe("alertes de sécurité", () => {
  it("vente normale et sa baisse de stock : aucune alerte", () => {
    expect(alerts([
      row({ after: { product_id: "huile", qty: 2, amount: 15000, label: "Huile" } }),
      row({ tbl: "products", action: "modification", at: "2026-10-31T10:00:01Z", before: { id: "huile", name: "Huile", stock: 10 }, after: { id: "huile", name: "Huile", stock: 8 } }),
    ])).toEqual([]);
  });

  it("stock qui baisse sans vente : grave (vendeur)", () => {
    const a = alerts([row({ tbl: "products", action: "modification", before: { id: "huile", name: "Huile", stock: 10 }, after: { id: "huile", name: "Huile", stock: 7 } })]);
    expect(a).toMatchObject([{ level: "grave", text: "Stock de Huile baissé de 10 à 7 sans vente" }]);
  });

  it("vente annulée par le vendeur : grave ; par le patron : rien", () => {
    expect(alerts([row({ action: "suppression", before: { label: "Huile", amount: 15000 } })])[0]).toMatchObject({ level: "grave" });
    expect(alerts([row({ user_id: PATRON, action: "suppression", before: { label: "Huile", amount: 15000 } })])).toEqual([]);
  });

  it("vendu sous le prix (gros et détail)", () => {
    expect(alerts([row({ after: { product_id: "huile", qty: 2, amount: 13000, unit: "bidon" } })])[0].text).toMatch(/Vendu sous le prix : 2 bidon Huile à 13\s000 F au lieu de 15\s000 F/);
    expect(alerts([row({ after: { product_id: "riz", qty: 5, amount: 2000, retail: true, unit: "kilo" } })])).toEqual([]);
  });

  it("écart de caisse : grave à partir de 1 000 F", () => {
    expect(alerts([row({ tbl: "cash_counts", after: { expected: 50000, counted: 45000 } })])[0]).toMatchObject({ level: "grave", text: expect.stringContaining("−5 000") });
    expect(alerts([row({ tbl: "cash_counts", after: { expected: 50000, counted: 49500 } })])[0].level).toBe("attention");
    expect(alerts([row({ tbl: "cash_counts", after: { expected: 50000, counted: 50000 } })])).toEqual([]);
  });

  it("dépense et perte déclarées par le vendeur ; la perte explique la baisse de stock", () => {
    const a = alerts([
      row({ tbl: "expenses", after: { kind: "perte", label: "bidon percé", amount: 6500 } }),
      row({ tbl: "products", action: "modification", before: { id: "huile", name: "Huile", stock: 10 }, after: { id: "huile", name: "Huile", stock: 9 } }),
    ]);
    expect(a).toHaveLength(1);
    expect(a[0].text).toMatch(/Perte déclarée/);
  });

  it("heure d'ouverture = première vente du jour", () => {
    const now = new Date("2026-10-31T18:00:00Z");
    expect(openedAt([row({ at: "2026-10-31T09:30:00Z" }), row({ at: "2026-10-31T08:12:00Z" })], now)).toBe("2026-10-31T08:12:00Z");
  });
});
