import { describe, expect, it } from "vitest";
import { type Shop, newShop } from "@/model";
import { addRepair, deliverRepair, markRepaired } from "./repairs";
import { correctRepairParts, setArticleCost, setTotalCost } from "./corrections";
import { buildReport, periodOf, profitDetails } from "./report";

const now = () => new Date().toISOString();

describe("corriger un bénéfice depuis les Bénéfices", () => {
  it("réparation rendue sans pièce : on ajoute l'écran → stock −1, main-d'œuvre juste", () => {
    let s: Shop = { ...newShop("Atelier", "reparation"), products: [{ id: "p-hw", name: "Écran Huawei P smart 2021", unit: "pièce", stock: 3, min: 0, price: 10000, cost: 5000 }] };
    const { shop, repair } = addRepair(s, { clientName: "X", device: "Huawei P smart 2021", problem: "écran", price: 10000, advance: 10000 });
    s = deliverRepair(markRepaired(shop, repair.id, [])!, repair.id, 0, false)!;
    expect(profitDetails(s, periodOf("jour")).find((r) => r.kind === "travail")).toMatchObject({ labor: 10000 });
    s = correctRepairParts(s, repair.id, [{ productId: "p-hw", label: "Écran Huawei P smart 2021", qty: 1, cost: 5000 }])!;
    expect(s.products[0].stock).toBe(2);
    expect(profitDetails(s, periodOf("jour")).find((r) => r.kind === "travail")).toMatchObject({ partsCost: 5000, labor: 5000 });
    expect(buildReport(s, periodOf("jour")).grossProfit).toBe(5000);
    // On l'enlève : le stock revient, tout redevient main-d'œuvre.
    s = correctRepairParts(s, repair.id, [])!;
    expect(s.products[0].stock).toBe(3);
    expect(buildReport(s, periodOf("jour")).grossProfit).toBe(10000);
  });

  it("article : prix d'achat corrigé sur ses ventes et gardé dans la fiche", () => {
    const s: Shop = { ...newShop("B", "reparation"),
      products: [{ id: "p1", name: "Chargeur", unit: "pièce", stock: 5, min: 0, price: 3000, cost: 0 }],
      sales: [
        { id: "a", at: now(), label: "Chargeur", amount: 6000, qty: 2, productId: "p1", cost: 0, payment: "especes" } as never,
        { id: "b", at: now(), label: "Chargeur", amount: 3000, qty: 1, productId: "p1", payment: "especes" } as never,
      ] };
    const t = setArticleCost(s, ["a", "b"], 1500, "p1", true);
    expect(t.sales.map((x) => x.cost)).toEqual([3000, 1500]);
    expect(t.products[0].cost).toBe(1500);
    expect(buildReport(t, periodOf("jour")).grossProfit).toBe(9000 - 4500);
  });

  it("vente au comptoir : coût total réparti, total juste", () => {
    const s: Shop = { ...newShop("B", "reparation"), sales: [
      { id: "a", at: now(), label: "Dos XR", amount: 4000, payment: "especes" } as never,
      { id: "b", at: now(), label: "Dos XR", amount: 6000, payment: "especes" } as never,
    ] };
    const t = setTotalCost(s, ["a", "b"], 3001);
    expect(t.sales.reduce((a, x) => a + (x.cost ?? 0), 0)).toBe(3001);
  });
});
