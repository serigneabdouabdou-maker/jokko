import { describe, expect, it } from "vitest";
import { readCount, readSize, saysEach, serviceFromVoice } from "./serviceVoice";
import type { Shop } from "../model.ts";

describe("mesures dites", () => {
  it.each([
    ["bâche 2 sur 1,5", { w: 2, h: 1.5 }],
    ["2x1.5", { w: 2, h: 1.5 }],
    ["2 × 1,5 m", { w: 2, h: 1.5 }],
    ["une bâche de 3 mètres sur 2 mètres", { w: 3, h: 2 }],
    ["1m50 sur 80 cm", { w: 1.5, h: 0.8 }],
    ["deux mètres sur un mètre cinquante", { w: 2, h: 1.5 }],
    ["4 sur 2 et demi pour la mairie", { w: 4, h: 2.5 }],
    ["un virgule cinq sur trois", { w: 1.5, h: 3 }],
  ])("%s", (text, size) => expect(readSize(text)).toEqual(size));
  it("pas de mesures", () => {
    expect(readSize("bâche pour Moussa")).toBeNull();
    expect(readSize("5000 par m2")).toBeNull();
  });
  it("quantités", () => {
    expect(readCount("50 pages en couleur", "page")).toBe(50);
    expect(readCount("50 photocopies", "page")).toBe(50);
    expect(readCount("flocage 20 maillots", "piece")).toBe(20);
    expect(readCount("vinyle 3 m2", "m2")).toBe(3);
    expect(readCount("vinyle 3 mètres carrés", "m2")).toBe(3);
    expect(readCount("3 mètres carrés", "metre")).toBeNull();
  });
  it("prix de l'unité", () => {
    expect(saysEach("à 4 000 le mètre carré")).toBe(true);
    expect(saysEach("2 500 le maillot")).toBe(true);
    expect(saysEach("pour 20 000")).toBe(false);
  });
});

describe("serviceFromVoice", () => {
  const shop = { id: "s", name: "K", activity: "Multiservice", products: [{ id: "riz", name: "Bâche publicitaire", unit: "pièce", stock: 2, min: 0, price: 9000 }], clients: [], sales: [], expenses: [], invoices: [],
    services: [{ id: "b", name: "Bâche grand format", price: 5000, unit: "m2" }, { id: "f", name: "Flocage maillot", price: 2500, unit: "piece" }] } as unknown as Shop;
  it("prix du m² dit : 3 sur 2 à 4 000 le mètre carré = 24 000", () => {
    const r = serviceFromVoice(shop, { said: "bâche", text: "bâche 3 sur 2 à 4 000 le mètre carré" });
    expect(r).toMatchObject({ kind: "sale", amount: 24000 });
  });
  it("prix total dit : 3 sur 2 pour 25 000 = 25 000", () => {
    expect(serviceFromVoice(shop, { said: "bâche", text: "bâche 3 sur 2 pour 25 000" })).toMatchObject({ kind: "sale", amount: 25000 });
  });
  it("flocage 20 maillots = 50 000", () => {
    expect(serviceFromVoice(shop, { said: "flocage", text: "flocage 20 maillots pour l'ASC" })).toMatchObject({ kind: "sale", amount: 50000, qty: 20 });
  });
  it("un vrai article du stock passe avant le service", () => {
    expect(serviceFromVoice(shop, { said: "bâche", text: "bâche", productId: "riz" })).toEqual({ kind: "none" });
  });
});
