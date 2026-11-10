import { describe, expect, it } from "vitest";
import type { Shop } from "../model.ts";
import { deliver, deliveriesToday, returnItems, setTournee, tourneeClients } from "./tournee";

const bakery = (): Shop => ({
  id: "b", name: "Boulangerie", activity: "boulangerie",
  products: [{ id: "bag", name: "Baguette", unit: "baguette", stock: 400, min: 0, price: 150, cost: 90 }],
  clients: [{ id: "modou", name: "Boutique Modou", phone: "", debt: 0 }],
  sales: [], expenses: [], invoices: [], reminders: [], shortcuts: [],
} as unknown as Shop);

describe("tournée de la boulangerie", () => {
  it("livre la quantité habituelle à crédit", () => {
    let s = setTournee(bakery(), "modou", [{ productId: "bag", qty: 100 }]);
    expect(tourneeClients(s).map((c) => c.id)).toEqual(["modou"]);
    const r = deliver(s, "modou");
    expect(r?.amount).toBe(15000);
    s = r!.shop;
    expect(s.clients[0].debt).toBe(15000);
    expect(s.products[0].stock).toBe(300);
    expect(deliveriesToday(s, "modou")).toHaveLength(1);
  });
  it("le pain rendu baisse la livraison, la dette et revient au stock", () => {
    let s = deliver(setTournee(bakery(), "modou", [{ productId: "bag", qty: 100 }]), "modou")!.shop;
    const r = returnItems(s, "modou", "bag", 12);
    s = r.shop;
    expect(r.returned).toBe(12);
    expect(s.clients[0].debt).toBe(88 * 150);
    expect(s.products[0].stock).toBe(312);
    expect(deliveriesToday(s, "modou")[0].qty).toBe(88);
  });
  it("tout rendre supprime la livraison", () => {
    const s = deliver(setTournee(bakery(), "modou", [{ productId: "bag", qty: 50 }]), "modou")!.shop;
    const r = returnItems(s, "modou", "bag", 50);
    expect(deliveriesToday(r.shop, "modou")).toHaveLength(0);
    expect(r.shop.clients[0].debt).toBe(0);
  });
});
