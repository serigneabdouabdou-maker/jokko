import { describe, expect, it } from "vitest";
import type { Shop } from "../model.ts";
import { addFromCatalogue, CATALOGUE, catalogueFor, onMenu } from "./catalogue";

const shop = { id: "s", products: [], clients: [], sales: [], expenses: [], invoices: [], reminders: [], shortcuts: [] } as unknown as Shop;

describe("catalogue des plats", () => {
  it("le restaurant voit plats et jus, la boulangerie ses pains", () => {
    expect(catalogueFor("restauration").some((c) => c.id === "bissap")).toBe(true);
    expect(catalogueFor("restauration").some((c) => c.kind === "boulangerie")).toBe(false);
    expect(catalogueFor("boulangerie").every((c) => c.kind === "boulangerie")).toBe(true);
    expect(new Set(CATALOGUE.map((c) => c.id)).size).toBe(CATALOGUE.length);
  });
  it("met un plat au menu avec son prix, sa photo et ses noms wolof", () => {
    const item = CATALOGUE.find((c) => c.id === "ceebu-jen")!;
    const s = addFromCatalogue(shop, item, 1500, "p1");
    expect(s.products[0]).toMatchObject({ name: "Ceebu jën", price: 1500, unit: "plat", photoPath: "catalogue/ceebu-jen.jpg", vitrine: true });
    expect(s.products[0].aliases).toContain("thiéboudienne");
    expect(onMenu(s, item)).toBe(true);
  });
});
