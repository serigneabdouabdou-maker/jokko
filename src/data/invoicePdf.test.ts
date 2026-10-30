import { describe, expect, it } from "vitest";
import type { Shop } from "../model";
import { invoicePdf } from "./invoicePdf";

const shop = {
  id: "s", name: "Boutique Awa", city: "Pikine", activity: "Alimentation", openingCash: 0,
  address: "Rue 10", phone: "77 123 45 67", ninea: "0000000 2G3", paymentInfo: "Wave ou Orange Money au 77 123 45 67",
  products: [], clients: [{ id: "c", name: "Moussa Ndiaye", phone: "221770000111", debt: 0 }],
  sales: [], expenses: [], invoices: [], reminders: [], shortcuts: [],
} as Shop;

describe("facture PDF", () => {
  it("produit un vrai PDF avec beaucoup de lignes, accents et statut payée", async () => {
    const lines = Array.from({ length: 40 }, (_, i) => ({ label: `Article très long numéro ${i + 1} — sucre, thé, café`, qty: i + 1, unit: "sac", unitPrice: 1250 }));
    const blob = await invoicePdf({
      shop,
      client: shop.clients[0],
      invoice: { id: "i", number: "JK-2026-0001", at: new Date().toISOString(), clientId: "c", amount: 999999, status: "payee", lines, dueAt: new Date().toISOString() },
    });
    const head = new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()).slice(0, 5));
    expect(head).toBe("%PDF-");
    expect(blob.size).toBeGreaterThan(3000);
  });
});
