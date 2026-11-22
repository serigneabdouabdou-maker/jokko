import { describe, expect, it } from "vitest";
import { type Shop, newShop } from "@/model";
import { quickQuote, quoteMessage } from "./quickQuote";

const now = new Date("2026-11-22T12:00:00");
const shop = (): Shop => ({
  ...newShop("Atelier Mbacké", "reparation"),
  products: [
    { id: "bf6", name: "Écran Tecno BF6", unit: "pièce", stock: 2, min: 0, price: 0, cost: 3700 },
    { id: "uni", name: "Écran Itel A70", unit: "pièce", stock: 0, min: 0, price: 0, cost: 3500, aliases: ["BF6", "KI5K"] },
    { id: "chg", name: "Chargeur", unit: "pièce", stock: 3, min: 0, price: 3000, cost: 1500 },
  ],
  services: [{ id: "s1", name: "Décodage", price: 5000 }],
  suppliers: [{ id: "f", name: "Bathie", phone: "", items: [
    { key: "Batterie:bf6", name: "Batterie BF6", kind: "Batterie", qty: 5, total: 7500, first: "", last: "2026-07-12", prices: [["2026-07-12", 1500]] },
    { key: "Écran:bf6", name: "Écran BF6", kind: "Écran", qty: 69, total: 0, first: "", last: "2026-11-11", prices: [["2026-08-20", 3700]] },
  ] }],
});

describe("prix rapide pour un client", () => {
  it("« BF6 » : l'écran du stock (en stock), l'universel qui va dessus, la batterie vue chez le fournisseur", () => {
    const r = quickQuote(shop(), "BF6", now);
    expect(r.lines.map((l) => [l.name, l.source, l.stock])).toEqual([
      ["Écran Tecno BF6", "stock", 2],
      ["Écran Itel A70", "stock", 0],
      ["Batterie BF6", "fournisseur", 0],
    ]);
    expect(r.lines[0]!.ladder).toMatchObject({ cost: 3700 });
    expect(r.lines[1]!.via).toBe("BF6");
    // « Écran BF6 » du fournisseur n'est pas répété : c'est la même pièce que l'écran du stock.
    expect(r.lines.filter((l) => l.kind === "Écran")).toHaveLength(2);
  });

  it("services qui correspondent, rien pour un mot trop court, message WhatsApp prêt", () => {
    expect(quickQuote(shop(), "décodage", now).services.map((s) => s.name)).toEqual(["Décodage"]);
    expect(quickQuote(shop(), "b", now).lines).toEqual([]);
    const r = quickQuote(shop(), "BF6", now);
    const msg = quoteMessage("Atelier Mbacké", "BF6", r.lines);
    expect(msg).toContain("Écran Tecno BF6");
    expect(msg).toContain("(réparé aujourd'hui)");
    expect(msg).toContain("Atelier Mbacké");
  });
});
