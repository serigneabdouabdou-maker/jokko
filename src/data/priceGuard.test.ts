import { describe, expect, it } from "vitest";
import { type Shop, newShop } from "@/model";
import { applyPriceUpdates, checkPrice, hasNoPartReason, missingPartCost, needsPart, overheadPerJob, partCostSaid, priceLadder, supplierPriceUpdates } from "./priceGuard";
import { needsPartCost } from "@/assistant/batch";
import { LiveDesk } from "@/assistant/liveDesk";

const now = new Date("2026-11-22T12:00:00");
const repair = (n: number, cost: number, price: number, label = "Écran Tecno BF6") => ({
  id: `r${n}`, at: "2026-11-18T10:00:00", number: `R-${n}`, clientName: "A", phone: "", device: "BF6", problem: "Écran cassé", price, paid: price, status: "rendu",
  repairedAt: "2026-11-18T11:00:00", parts: [{ label, qty: 1, cost }],
});
const shop = (): Shop => ({
  ...newShop("Atelier", "reparation"),
  products: [
    { id: "bf6", name: "Écran Tecno BF6", unit: "pièce", stock: 0, min: 0, price: 0, cost: 3700 },
    { id: "ip11", name: "Écran iPhone 11", unit: "pièce", stock: 0, min: 0, price: 0, cost: 6000 },
    { id: "bat", name: "Batterie Tecno BF6", unit: "pièce", stock: 0, min: 0, price: 3000, cost: 1500 },
    { id: "a51", name: "Écran Samsung A51", unit: "pièce", stock: 0, min: 0, price: 9000, cost: 8000 },
  ],
  repairs: [repair(1, 3700, 10000), repair(2, 3800, 9000), repair(3, 4000, 10000), repair(4, 6000, 20000, "Écran iPhone 11"), repair(5, 6500, 19000, "Écran iPhone XR")] as never,
});

describe("barrière des prix", () => {
  it("panne de pièce : jamais sans pièce sans raison", () => {
    expect(needsPart("Écran cassé")).toBe(true);
    expect(needsPart("ne charge pas")).toBe(true);
    expect(needsPart("plantage, logiciel")).toBe(false);
    expect(hasNoPartReason("écran cassé · pièce apportée par le client")).toBe(true);
  });

  it("3 prix : normal = ton gain habituel, négocié = 70 %, minimum = pièce + charges + risque + petit gain", () => {
    const s = shop();
    expect(overheadPerJob(s, now)).toEqual({ amount: 1000, learned: false }); // moins de 8 travaux : hypothèse
    const bf6 = priceLadder(s, s.products[0]!, now)!;
    // Gain moyen des écrans < 5 000 F dans Jokko : (6 300 + 5 200 + 6 000) / 3 = 5 833.
    expect(bf6).toMatchObject({ cost: 3700, normal: 10000, nego: 8000, floor: 6500 });
    expect(checkPrice(bf6, 10000)).toBe("ok");
    expect(checkPrice(bf6, 8000)).toBe("negocie");
    expect(checkPrice(bf6, 6000)).toBe("sous_minimum");
    expect(checkPrice(bf6, 3500)).toBe("perte");
    const ip = priceLadder(s, s.products[1]!, now)!;
    expect(ip.normal).toBe(19500); // gain moyen iPhone : (14 000 + 12 500) / 2 = 13 250
    expect(ip.floor).toBeLessThan(ip.nego);
    // Petite pièce : minimum raisonnable (le prix du marché de 3 000 F reste au-dessus).
    expect(priceLadder(s, s.products[2]!, now)!.floor).toBe(3000);
  });

  it("prix d'achat qui suivent le fournisseur (jamais une qualité entre parenthèses, jamais un écart > 40 %)", () => {
    const s: Shop = {
      ...shop(),
      products: [...shop().products, { id: "dos", name: "Dos Tecno Spark 6 Go (complet)", unit: "pièce", stock: 0, min: 0, price: 0, cost: 2000 }],
      suppliers: [{ id: "f", name: "Bathie", phone: "", items: [
        { key: "Écran:bf6", name: "Écran BF6", kind: "Écran", qty: 9, total: 0, first: "", last: "2026-11-11", prices: [["2026-02-16", 4000], ["2026-08-20", 3500]] },
        { key: "Écran:iphone11", name: "Écran iPhone 11", kind: "Écran", qty: 9, total: 0, first: "", last: "2026-11-11", prices: [["2026-11-11", 6000]] },
        { key: "Dos:spark6go", name: "Dos Spark 6 Go", kind: "Dos", qty: 9, total: 0, first: "", last: "2026-03-16", prices: [["2026-03-16", 900]] },
      ] }],
    };
    const u = supplierPriceUpdates(s);
    expect(u).toEqual([{ productId: "bf6", name: "Écran Tecno BF6", from: 3700, to: 3500, at: "2026-08-20" }]);
    expect(applyPriceUpdates(s, u).products.find((p) => p.id === "bf6")!.cost).toBe(3500);
  });

  it("une seule somme sur une réparation d'écran : bloquée tant que le prix de la pièce manque", () => {
    expect(partCostSaid("écran BF6 10 000, pièce 3 700")).toBe(3700);
    expect(partCostSaid("écran BF6 10000 achat 3700")).toBe(3700);
    expect(missingPartCost("réparation écran BF6 10 000")).toContain("prix d'achat de la pièce");
    expect(missingPartCost("décodage 5 000")).toBeNull();
    expect(missingPartCost("écran BF6", { cost: 3700 })).toBeNull();
    // Carte de plusieurs opérations : la vente d'écran sans prix d'achat bloque « Tout enregistrer ».
    const sale = { line: "écran zte a35 9000", keep: true, action: { type: "sale", amount: 9000, label: "Écran ZTE A35" } } as never;
    expect(needsPartCost(sale)).toBe(true);
    expect(needsPartCost({ ...(sale as object), cost: 5000 } as never)).toBe(false);
  });

  it("à la voix : « écran BF6 10 000 » demande le prix de la pièce ; avec « pièce 3 700 », bénéfice juste", () => {
    let s: Shop = { ...shop(), products: [] };
    const desk = new LiveDesk({ getShop: () => s, lang: () => "fr", write: (next) => { s = next; }, onSaved: () => {}, onUndone: () => {} });
    const blank = { productId: null, productName: null, quantity: null, clientId: null, clientName: null, unit: null, dueDays: null, unitPrice: null, debtMode: null, paidWith: null };
    const ask = desk.record({ ...blank, type: "sale", amount: 10000, label: "Réparation écran BF6" } as never, "réparation écran BF6 10 000");
    expect(ask.ok).toBe(false);
    expect(s.sales).toHaveLength(0);
    const ok = desk.record({ ...blank, type: "sale", amount: 10000, label: "Réparation écran BF6" } as never, "réparation écran BF6 10 000, pièce 3 700");
    expect(ok.ok).toBe(true);
    expect(s.sales[0]).toMatchObject({ amount: 10000, cost: 3700 });
  });
});
