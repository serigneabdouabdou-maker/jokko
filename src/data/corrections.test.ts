import { describe, expect, it } from "vitest";
import { type Shop, newShop } from "@/model";
import { addRepair, deliverRepair, markRepaired } from "./repairs";
import { correctRepairParts, setArticleCost, setTotalCost } from "./corrections";
import { editSale } from "./sales";
import { buildReport, dayHistory, periodOf, profitDetails } from "./report";

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

  it("services groupés : chaque vente garde son client (Tapha diallo dans « Configuration »)", () => {
    const s: Shop = { ...newShop("B", "reparation"), clients: [{ id: "c1", name: "Tapha diallo", phone: "", debt: 0 } as never], sales: [
      { id: "a", at: now(), label: "Service · Configuration", amount: 1000, payment: "especes" } as never,
      { id: "b", at: now(), label: "Service · Configuration", amount: 5000, payment: "especes", clientId: "c1" } as never,
    ] };
    const row = profitDetails(s, periodOf("jour")).find((r) => r.kind === "service")!;
    expect(row).toMatchObject({ count: 2, revenue: 6000 });
    expect(row.kind === "service" && row.items.map((i) => i.client)).toEqual([undefined, "Tapha diallo"]);
  });

  it("modifier une vente : payé, prix en gros, moyen ; la réparation suit", () => {
    let s: Shop = { ...newShop("A", "reparation"), products: [{ id: "p1", name: "Chargeur", unit: "pièce", stock: 5, min: 0, price: 3000, cost: 0 }] };
    // Maintenance payée 5 000 et pas 10 000, sans achat
    s = { ...s, sales: [{ id: "m", at: now(), label: "Service · Maintenance ordinateur", amount: 10000, cost: 5000, payment: "especes" } as never, ...s.sales] };
    s = editSale(s, "m", { amount: 5000, cost: null });
    expect(s.sales.find((x) => x.id === "m")).toMatchObject({ amount: 5000 });
    expect(s.sales.find((x) => x.id === "m")!.cost).toBeUndefined();
    expect(buildReport(s, periodOf("jour")).grossProfit).toBe(5000);
    // Réparation : avance 3 000 → corrigée à 2 500, le « déjà payé » suit ; prix de la pièce sur la ligne
    const { shop, repair } = addRepair(s, { clientName: "X", device: "Bf6", problem: "batterie", price: 3000, advance: 3000 });
    const pay = shop.sales.find((x) => x.label.includes(repair.number))!;
    let t = editSale(shop, pay.id, { amount: 2500, cost: 1500, payment: "wave" });
    expect(t.repairs!.find((r) => r.id === repair.id)!.paid).toBe(2500);
    expect(t.sales.find((x) => x.id === pay.id)).toMatchObject({ amount: 2500, cost: 1500, payment: "wave" });
    // Article : prix d'achat gardé dans la fiche
    t = { ...t, sales: [{ id: "c", at: now(), label: "Chargeur", amount: 6000, qty: 2, productId: "p1", payment: "especes" } as never, ...t.sales] };
    t = editSale(t, "c", { cost: 3000, keepProductCost: true });
    expect(t.products[0].cost).toBe(1500);
  });

  it("chaque jour depuis le début : un jour par date, le plus récent d'abord, gagné juste", () => {
    const s: Shop = { ...newShop("B", "reparation"), sales: [
      { id: "a", at: "2026-11-03T12:00:00", label: "Écran", amount: 10000, cost: 4000 } as never,
      { id: "b", at: "2026-11-03T15:00:00", label: "Service · Décodage", amount: 5000 } as never,
      { id: "c", at: "2026-11-17T10:00:00", label: "Chargeur", amount: 3000, cost: 1500 } as never,
    ], expenses: [{ id: "e", at: "2026-11-17T11:00:00", label: "Transport", amount: 500 } as never] };
    const days = dayHistory(s);
    expect(days.map((d) => d.day)).toEqual(["2026-11-17", "2026-11-03"]);
    expect(days[1]).toMatchObject({ revenue: 15000, grossProfit: 11000, netProfit: 11000, salesCount: 2 });
    expect(days[0]).toMatchObject({ revenue: 3000, spent: 500, netProfit: 1000 });
  });
});
