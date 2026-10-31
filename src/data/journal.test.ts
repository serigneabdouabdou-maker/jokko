import { describe as group, expect, it } from "vitest";
import { describe, type JournalRow } from "./journal";

const row = (over: Partial<JournalRow>): JournalRow => ({ id: 1, shop_id: "s", at: "2026-10-31T10:00:00Z", user_id: "u", tbl: "sales", row_id: "x", action: "ajout", before: null, after: null, ...over });

group("journal en mots simples", () => {
  it("vente ajoutée, puis annulée (à vérifier)", () => {
    const sale = { label: "Huile", qty: 2, unit: "bidon", amount: 15000 };
    expect(describe(row({ after: sale }))).toMatchObject({ text: expect.stringContaining("Vente · Huile · 2 bidon"), alert: false });
    expect(describe(row({ action: "suppression", before: sale }))).toMatchObject({ text: expect.stringContaining("Vente annulée"), alert: true });
  });

  it("stock qui bouge : avant → après ; prix changé = à vérifier", () => {
    const before = { name: "Huile", stock: 10, price: 7500, cost: 6500, unit: "bidon", min: 2 };
    const stock = describe(row({ tbl: "products", action: "modification", before, after: { ...before, stock: 8 } }));
    expect(stock).toMatchObject({ text: "Huile · stock 10 → 8", alert: false });
    const price = describe(row({ tbl: "products", action: "modification", before, after: { ...before, price: 7000 } }));
    expect(price.alert).toBe(true);
    expect(price.text).toMatch(/prix de vente 7\s500 F → 7\s000 F/);
  });

  it("achat, dette, équipe", () => {
    expect(describe(row({ tbl: "expenses", after: { kind: "achat", label: "Achat 2 sac Sucre", amount: 40000 } })).text).toMatch(/^Achat · Achat 2 sac Sucre · 40\s000 F$/);
    expect(describe(row({ tbl: "clients", action: "modification", before: { name: "Moussa", debt: 0 }, after: { name: "Moussa", debt: 5000 } })).text).toMatch(/Moussa · dette 0 F → 5\s000 F/);
    expect(describe(row({ tbl: "shop_invites", after: { name: "Awa", phone: "221771234567" } })).text).toBe("Invitation envoyée · Awa (771234567)");
  });
});
