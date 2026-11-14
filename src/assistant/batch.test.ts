import { describe, expect, it } from "vitest";
import { seedShop, type Shop } from "../model";
import { applyDraft } from "./apply";
import { batchTotals, describeAction, lineAmounts, looksLikeBatch, markDuplicates, settleItems, withLineFacts } from "./batch";
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

describe("liste de Fallou du 14/11 : vente, achat, bénéfice sur chaque ligne", () => {
  const text = `1. Configuration réseau Realme : 1 000 F
2. Plaquette KD7 : vente 1 500 F, achat 300 F, bénéfice 1 200 F.
3. Plaquette Pop 8 : vente 3 000 F, achat 600 F, bénéfice 2 400 F.
4. Écran iPhone 11 Pro Max : vente 20 000 F, achat 8 000 F, bénéfice 12 000 F.
5. Chargeur : vente 3 000 F, achat 1 500 F, bénéfice 1 500 F.
6. Décodage : 5 000 F.
7. Réglage : 1 500 F.
8. LCD BG6 : vente 10 000 F, achat 4 000 F, bénéfice 6 000 F.
9. Configuration iPhone : 4 000 F.
10. LCD Camon 17 CG6 : vente 10 000 F, achat 4 000 F, bénéfice 6 000 F.
11. LCD Spark 7 : vente 10 000 F, achat 4 000 F, bénéfice 6 000 F.`;
  const blank = { productId: null, productName: null, quantity: null, unitPrice: null, clientId: null, clientName: null, debtMode: null };
  // Gemini se trompe exprès sur deux montants (bénéfice pris au lieu de la vente) : le code relit la ligne.
  const ops = text.split("\n").map((line, i) => {
    const amounts = [...line.matchAll(/(\d{1,3}(?: \d{3})+|\d+) F/g)].map((m) => Number(m[1]!.replace(/ /g, "")));
    const label = line.replace(/^\d+\.\s*/, "").split(" :")[0]!;
    return { line, action: { ...blank, type: "sale" as const, label, productName: label, amount: i === 1 || i === 7 ? amounts[2] ?? amounts[0]! : amounts[0]! } };
  });

  it("montant = vente, prix d'achat gardé, services = main-d'œuvre ; totaux 69 000 / 22 400 / 46 600", () => {
    const items = settleItems(ops).map((i) => ({ ...i, keep: true }));
    expect(items[1]!.action.amount).toBe(1500);
    expect(items[1]!.cost).toBe(300);
    expect(items[7]!.action.amount).toBe(10000);
    expect(items.filter((i) => i.service).map((i) => i.action.label)).toEqual(["Configuration réseau Realme", "Décodage", "Réglage", "Configuration iPhone"]);
    expect(items[4]!.service).toBeUndefined();
    expect(batchTotals(items)).toEqual({ sales: 69000, cost: 22400, profit: 46600, known: 11, unknown: 0 });
  });

  it("enregistré : la vente garde le prix d'achat écrit ; le service est compté comme main-d'œuvre", () => {
    const items = settleItems(ops);
    const sale = withLineFacts(items[1]!.action, items[1]!);
    expect(sale).toMatchObject({ cost: 300, amount: 1500 });
    const service = withLineFacts(items[5]!.action, items[5]!);
    expect(service).toMatchObject({ label: "Service · Décodage", cost: 0, productName: null });
    const shop = seedShop();
    const applied = applyDraft(shop, sale)!;
    expect(applied.shop.sales[0]).toMatchObject({ amount: 1500, cost: 300 });
  });

  it("« vendu 2 riz à 17 500 » : le 2 n'est jamais un montant", () => {
    expect(lineAmounts("Vendu 2 riz 25 kg à 17 500")).toEqual({ sale: undefined, cost: undefined });
    expect(lineAmounts("Chargeur : vente 3 000 F, achat 1 500 F, bénéfice 1 500 F.")).toEqual({ sale: 3000, cost: 1500 });
    expect(lineAmounts("Écran X : prix de vente 15.000, prix d'achat 5.000")).toEqual({ sale: 15000, cost: 5000 });
  });
});

describe("pièce du stock sur une ligne écrite (stock pas encore compté)", () => {
  const P = (name: string, cost: number, aliases?: string[]) => ({ id: squashId(name), name, unit: "pièce", stock: 0, min: 0, price: 0, cost, ...(aliases ? { aliases } : {}) });
  const squashId = (n: string) => "p-" + n.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  // Extrait du vrai stock de « Boutique mbéne cissé » (14/11/2026).
  const products = [
    P("Écran Tecno BG6", 4500, ["BG6M", "KJ5", "Pop 8", "X6525", "X6528"]),
    P("Écran Tecno BG6M", 3800, ["BG6", "KJ5", "X6525", "X6528"]),
    P("Écran Tecno CG6", 4500, ["KF6", "KF8", "KG6"]),
    P("Écran Tecno KF6", 4000, ["BD3", "CG6", "KE5", "KG6", "Spark 7"]),
    P("Écran Tecno Spark 7", 4750, ["KF6", "KG6"]),
    P("Écran Tecno Spark 7P", 4750),
    P("Batterie Tecno Spark 7", 1600),
    P("Écran iPhone 11 Pro Max", 8000),
    P("Écran iPhone 11 Pro Max (copie)", 8000),
    P("Écran iPhone 11 Pro Max (original)", 18000),
    P("Écran Tecno KD7", 3700, ["CC6", "KC8"]),
    P("Écran Tecno KC8", 4500, ["KD7"]),
  ] as unknown as Shop["products"];
  const sale = (label: string, amount: number) => ({ line: `${label} : vente ${amount} F`, action: action({ label, productName: label, amount }) });

  it("même type et même modèle : la pièce est liée (elle sortira du stock), jamais sous 0", () => {
    const items = settleItems([sale("LCD BG6", 10000), sale("LCD Camon 17 CG6", 10000), sale("LCD Spark 7", 10000), sale("Écran iPhone 11 Pro Max", 20000)], products);
    expect(items.map((i) => i.part?.name)).toEqual(["Écran Tecno BG6", "Écran Tecno CG6", "Écran Tecno Spark 7", "Écran iPhone 11 Pro Max"]);
    expect(items[0]!.action.quantity).toBe(1);
    const shop = { ...seedShop(), products };
    const applied = applyDraft(shop, withLineFacts(items[2]!.action, { cost: 4000 }))!;
    expect(applied.shop.sales[0]).toMatchObject({ amount: 10000, cost: 4000, productId: products[4]!.id });
    expect(applied.shop.products.find((p) => p.id === products[4]!.id)!.stock).toBe(0);
  });

  it("autre type de pièce, pas de modèle, ou plusieurs possibles : rien ne sort du stock", () => {
    const items = settleItems([sale("Plaquette KD7", 1500), sale("Chargeur", 3000), sale("LCD KD7", 9000)], products);
    expect(items[0]!.part).toBeUndefined();
    expect(items[1]!.part).toBeUndefined();
    expect(items[2]!.part?.name).toBe("Écran Tecno KD7");
    const two = settleItems([sale("Écran iPhone 11 Pro", 15000)], [...products, P("Écran iPhone 11 Pro (A)", 8000), P("Écran iPhone 11 Pro (B)", 9000)] as unknown as Shop["products"]);
    expect(two[0]!.part).toBeUndefined();
    expect(two[0]!.choices).toHaveLength(2);
  });

  it("le bénéfice sans prix d'achat écrit prend le prix d'achat du stock", () => {
    const items = settleItems([sale("LCD Spark 7", 10000)], products).map((i) => ({ ...i, keep: true }));
    expect(batchTotals(items)).toMatchObject({ sales: 10000, cost: 4750, profit: 5250, unknown: 0 });
  });
});
