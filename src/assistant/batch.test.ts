import { describe, expect, it } from "vitest";
import type { Shop } from "../model";
import { describeAction, looksLikeBatch, markDuplicates } from "./batch";
import type { DraftAction } from "./client";

const action = (a: Partial<DraftAction>): DraftAction => ({ type: "sale", productId: null, productName: null, quantity: null, amount: null, clientId: null, clientName: null, label: null, ...a });

describe("plusieurs opérations dans un texte", () => {
  it("reconnaît une liste et pas une phrase simple", () => {
    expect(looksLikeBatch("2 sacs de riz à 20 000")).toBe(false);
    expect(looksLikeBatch("Réparation ZTE 9 000\nConfiguration imprimante 10 000\nTransport 1 500")).toBe(true);
    expect(looksLikeBatch("x".repeat(500))).toBe(true);
  });
  it("décrit une opération en clair", () => {
    expect(describeAction(action({ label: "Configuration imprimante", amount: 10000, clientName: "Moussa" }))).toBe("Vente · Configuration imprimante · 10 000 F · Moussa");
    expect(describeAction(action({ type: "expense", label: "Transport" }))).toBe("Dépense · Transport · montant ?");
  });
  it("déjà enregistré aujourd'hui (même montant, même mot) : décoché ; sans montant : décoché", () => {
    const today = "2026-11-14";
    const shop = {
      sales: [{ id: "s1", at: `${today}T10:00:00`, label: "Réparation R-002 · zte a35e (rendu)", amount: 9000 }],
      expenses: [],
    } as unknown as Shop;
    const items = markDuplicates(shop, [
      { line: "Réparation ZTE A35 : 9 000", action: action({ label: "Réparation ZTE A35", amount: 9000 }) },
      { line: "Configuration imprimante 10 000", action: action({ label: "Configuration imprimante", amount: 10000 }) },
      { line: "Coque", action: action({ label: "Coque" }) },
    ], today);
    expect(items.map((i) => i.keep)).toEqual([false, true, false]);
    expect(items[0]!.duplicate).toContain("R-002");
  });
});

describe("enregistrement d'une liste", async () => {
  const { forRecord } = await import("./batch");
  it("un service n'est jamais retrouvé comme article du stock par son nom", () => {
    const shop = { services: [] } as unknown as Shop;
    const r = forRecord(action({ productName: "Réparation écran ZTE A35", amount: 9000 }), shop, () => false);
    expect(r.productName).toBeNull();
    expect(r.label).toBe("Réparation écran ZTE A35");
  });
  it("un service du catalogue garde son nom (calcul des pages, m²…)", () => {
    const shop = { services: [{ id: "x", name: "Photocopie noir A4", price: 25 }] } as unknown as Shop;
    expect(forRecord(action({ productName: "photocopie noir", amount: 1250 }), shop, () => true).productName).toBe("photocopie noir");
  });
});
