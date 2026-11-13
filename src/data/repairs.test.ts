import { describe, expect, it } from "vitest";
import { type Shop, newShop } from "@/model";
import { addRepair, deliverRepair, findRepair, markRepaired, nextRepairNumber, payRepair, remaining, repairBreakdown, repairProfit, repairsOf, workshopMonth } from "./repairs";
import { buildReport, periodOf } from "./report";

function atelier(): Shop {
  return {
    ...newShop("Atelier Fallou", "Réparation de téléphones"),
    products: [
      { id: "ecran", name: "Écran iPhone 11", unit: "pièce", stock: 3, min: 1, price: 30000, cost: 15000 },
      { id: "conn", name: "Connecteur de charge", unit: "pièce", stock: 10, min: 2, price: 3000, cost: 1000 },
    ],
  };
}

describe("carnet de réparations", () => {
  it("dépôt avec avance : ticket R-001, avance en caisse, client créé avec son numéro", () => {
    const { shop, repair } = addRepair(atelier(), { clientName: "Awa Diop", phone: "77 123 45 67", device: "iPhone 11", problem: "écran cassé et connecteur", price: 25000, advance: 5000 });
    expect(repair.number).toBe("R-001");
    expect(repair.status).toBe("depot");
    expect(remaining(repair)).toBe(20000);
    expect(shop.sales[0]).toMatchObject({ amount: 5000, label: "Réparation R-001 · iPhone 11 (avance)" });
    expect(shop.clients.find((c) => c.name === "Awa Diop")?.phone).toBe("771234567");
    expect(nextRepairNumber(shop)).toBe("R-002");
  });

  it("réparé : l'écran et le connecteur sortent du stock ; bénéfice = 25 000 − 16 000 = 9 000", () => {
    const start = addRepair(atelier(), { clientName: "Awa Diop", device: "iPhone 11", problem: "écran + connecteur", price: 25000, advance: 5000 });
    const fixed = markRepaired(start.shop, start.repair.id, [{ productId: "ecran" }, { productId: "conn" }])!;
    const r = repairsOf(fixed)[0];
    expect(r.status).toBe("repare");
    expect(fixed.products.find((p) => p.id === "ecran")?.stock).toBe(2);
    expect(fixed.products.find((p) => p.id === "conn")?.stock).toBe(9);
    expect(repairProfit(r)).toBe(9000);
  });

  it("rendu : le client paie le reste ; la vente porte le prix d'achat des pièces", () => {
    const start = addRepair(atelier(), { clientName: "Awa Diop", device: "iPhone 11", problem: "écran", price: 25000, advance: 5000 });
    const fixed = markRepaired(start.shop, start.repair.id, [{ productId: "ecran" }])!;
    const done = deliverRepair(fixed, start.repair.id, 20000, false)!;
    const r = repairsOf(done)[0];
    expect(r.status).toBe("rendu");
    expect(remaining(r)).toBe(0);
    expect(done.sales[0]).toMatchObject({ amount: 20000, cost: 15000 });
    const total = done.sales.filter((s) => s.label.startsWith("Réparation R-001")).reduce((a, s) => a + s.amount - (s.cost ?? 0), 0);
    expect(total).toBe(10000);
  });

  it("rendu sans tout payer : le reste va en dette du client", () => {
    const start = addRepair(atelier(), { clientName: "Moussa", device: "Tecno Spark 10", problem: "batterie", price: 12000 });
    const done = deliverRepair(start.shop, start.repair.id, 2000, true)!;
    expect(done.clients.find((c) => c.name === "Moussa")?.debt).toBe(10000);
  });

  it("acompte pendant que l'appareil attend au dépôt", () => {
    const start = addRepair(atelier(), { clientName: "Fatou", device: "Samsung A12", problem: "écran", price: 18000 });
    const paid = payRepair(start.shop, start.repair.id, 8000)!;
    expect(remaining(repairsOf(paid)[0])).toBe(10000);
  });

  it("retrouve une réparation par son numéro ou le nom du client", () => {
    let shop = atelier();
    shop = addRepair(shop, { clientName: "Awa Diop", device: "iPhone 11", problem: "écran" }).shop;
    shop = addRepair(shop, { clientName: "Moussa Fall", device: "Tecno", problem: "batterie" }).shop;
    expect(findRepair(shop, "R-002")?.clientName).toBe("Moussa Fall");
    expect(findRepair(shop, "Awa")?.device).toBe("iPhone 11");
  });

  it("écran acheté exprès 5 000, réparation 15 000 : la caisse baisse de 5 000, il gagne 10 000 de main-d'œuvre", () => {
    const start = addRepair(atelier(), { clientName: "Modou", device: "Tecno Spark 10", problem: "écran cassé", price: 15000, advance: 5000 });
    const fixed = markRepaired(start.shop, start.repair.id, [{ label: "Écran Tecno Spark 10", cost: 5000, fromCash: true }])!;
    const r = repairsOf(fixed)[0];
    expect(repairBreakdown(r)).toEqual({ price: 15000, parts: 5000, labor: 10000 });
    // L'achat de la pièce sort de la caisse, mais n'est pas une dépense du bénéfice.
    expect(fixed.expenses[0]).toMatchObject({ amount: 5000, kind: "achat", label: "Pièce pour R-001 (Tecno Spark 10) : Écran Tecno Spark 10" });
    const done = deliverRepair(fixed, start.repair.id, 10000, false)!;
    const month = workshopMonth(done);
    expect(month).toMatchObject({ done: 1, revenue: 15000, parts: 5000, labor: 10000, open: 0 });
    // Bénéfices du mois : 15 000 encaissés − 5 000 de pièce = 10 000 gagnés.
    const report = buildReport(done, periodOf("mois"));
    expect(report.revenue).toBe(15000);
    expect(report.grossProfit).toBe(10000);
    expect(report.netProfit).toBe(10000);
    expect(report.purchases).toBe(5000);
  });

  it("pièce achetée avec son propre argent : rien ne sort de la caisse", () => {
    const start = addRepair(atelier(), { clientName: "Modou", device: "Itel A70", problem: "batterie", price: 8000 });
    const fixed = markRepaired(start.shop, start.repair.id, [{ label: "Batterie Itel", cost: 3000 }])!;
    expect(fixed.expenses).toHaveLength(0);
    expect(repairBreakdown(repairsOf(fixed)[0]).labor).toBe(5000);
  });
});
