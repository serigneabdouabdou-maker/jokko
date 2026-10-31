import { describe, expect, it } from "vitest";
import { type Role, type Shop, roleIn } from "../model";
import { type Entry, LiveDesk, PATRON_ONLY_MESSAGE } from "./liveDesk";

function shop(): Shop {
  return {
    id: "shop-1", name: "Boutique Awa", city: "", activity: "", openingCash: 0,
    products: [{ id: "p-huile", name: "Huile", unit: "bidon", stock: 10, min: 2, price: 7500, cost: 6500 }],
    clients: [], sales: [], expenses: [], invoices: [], reminders: [], shortcuts: [],
  };
}

function desk(role: Role) {
  let current = shop();
  const saved: Entry[] = [];
  const d = new LiveDesk({ getShop: () => current, lang: () => "fr", role: () => role, write: (n) => (current = n), onSaved: (e) => saved.push(e), onUndone: () => undefined });
  return { d, shop: () => current, saved };
}

describe("rôles patron / vendeur", () => {
  it("le rôle vient du serveur ; une boutique à soi = patron", () => {
    expect(roleIn({ shopId: "a", roles: { a: "vendeur" } })).toBe("vendeur");
    expect(roleIn({ shopId: "b", roles: { a: "vendeur" } })).toBe("patron");
    expect(roleIn({ shopId: "a" })).toBe("patron");
  });

  it("le vendeur vend normalement", () => {
    const { d, shop: s } = desk("vendeur");
    expect(d.handle({ name: "enregistrer", args: { type: "sale", productName: "huile", quantity: 2, heard: "2 bidons d'huile" } })).toMatchObject({ statut: "enregistre" });
    expect(s().products[0].stock).toBe(8);
  });

  it("le vendeur ne peut ni acheter ni corriger le stock : rien ne change", () => {
    const { d, shop: s, saved } = desk("vendeur");
    expect(d.handle({ name: "enregistrer", args: { type: "purchase", productName: "huile", quantity: 5, prixUnitaire: 1, heard: "j'ai acheté 5 bidons" } })).toMatchObject({ statut: "refuse" });
    expect(d.record({ type: "stock_adjust", productId: "p-huile", productName: null, quantity: -3, amount: null, clientId: null, clientName: null, label: null })).toEqual({ ok: false, besoin: PATRON_ONLY_MESSAGE });
    expect(s().products[0]).toMatchObject({ stock: 10, cost: 6500 });
    expect(saved).toHaveLength(0);
  });

  it("le vendeur n'entend pas le bénéfice", () => {
    const { d } = desk("vendeur");
    const ctx = d.handle({ name: "lire_boutique", args: {} }) as Record<string, unknown>;
    expect(JSON.stringify(ctx.bilan_aujourdhui)).not.toMatch(/benefice/);
    expect(ctx.bilan_du_mois).toBeUndefined();
  });

  it("le patron, lui, peut acheter", () => {
    const { d, shop: s } = desk("patron");
    expect(d.handle({ name: "enregistrer", args: { type: "purchase", productName: "huile", quantity: 5, prixUnitaireDit: "6 000", heard: "j'ai acheté 5 bidons d'huile à 6 000 chacun" } })).toMatchObject({ statut: "enregistre", montant_francs: 30000 });
    expect(s().products[0]).toMatchObject({ stock: 15, cost: 6000 });
  });
});
