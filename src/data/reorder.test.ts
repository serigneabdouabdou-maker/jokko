import { describe, expect, it } from "vitest";
import type { Product, Repair, Sale, Shop } from "../model.ts";
import { addToOrder, orderMessage, orderPlan, receiveOrder, removeFromOrder, setOrderQty, usage } from "./reorder.ts";

const now = new Date("2026-11-13T12:00:00Z");
const day = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();
const part = (id: string, name: string, stock: number, cost: number, min = 0): Product => ({ id, name, unit: "pièce", stock, min, price: 0, cost });
const repair = (number: string, problem: string, status: Repair["status"], parts: Repair["parts"] = [], at = day(1)): Repair => ({
  id: number, at, number, clientName: "Awa", phone: "", device: "Tecno", problem, price: 15000, paid: 0, parts, status, ...(status !== "depot" ? { repairedAt: at } : {}),
});

function shop(extra: Partial<Shop> = {}): Shop {
  return {
    id: "s", name: "Boutique Mbéne", city: "Touba", activity: "Réparation de téléphones", openingCash: 0,
    products: [part("bf6", "Écran Tecno BF6", 0, 3700), part("bat", "Batterie iPhone XR", 1, 4500), part("kf6", "Écran Tecno KF6", 5, 4000, 2), part("i11", "Écran iPhone 11", 4, 6000)],
    clients: [], sales: [], expenses: [], invoices: [], reminders: [], shortcuts: [],
    ...extra,
  };
}

describe("commandes au fournisseur", () => {
  it("compte les pièces parties : ventes + pièces posées sur les réparations (30 jours)", () => {
    const sales: Sale[] = [{ id: "v1", at: day(3), label: "Batterie iPhone XR", amount: 10000, productId: "bat", qty: 1 }];
    const repairs = [repair("R-001", "batterie", "rendu", [{ productId: "bat", label: "Batterie iPhone XR", qty: 1, cost: 4500 }]), repair("R-000", "batterie", "rendu", [{ productId: "bat", label: "x", qty: 1, cost: 1 }], day(40))];
    expect(usage(shop({ sales, repairs }), "bat", now)).toBe(2);
  });

  it("conseille : pièce d'un appareil au dépôt pas en stock, stock sous le seuil, pièce qui part vite", () => {
    const repairs = [repair("R-002", "écran cassé · Écran Tecno BF6", "depot"), repair("R-003", "Écran Tecno BF6", "depot")];
    const sales: Sale[] = Array.from({ length: 8 }, (_, i) => ({ id: `v${i}`, at: day(i + 1), label: "Batterie iPhone XR", amount: 10000, productId: "bat", qty: 1 }));
    const s = shop({ repairs, sales, products: [...shop().products.map((p) => (p.id === "kf6" ? { ...p, stock: 2 } : p))] });
    const { advice } = orderPlan(s, now);
    expect(advice.find((a) => a.productId === "bf6")).toMatchObject({ qty: 2, reason: "pour R-002, R-003 au dépôt" });
    expect(advice.find((a) => a.productId === "kf6")?.reason).toBe("il en reste 2 (seuil 2)");
    // 8 batteries en 30 jours, il en reste 1 : pour 2 semaines il en faut 4 → commander 3.
    expect(advice.find((a) => a.productId === "bat")).toMatchObject({ qty: 3 });
    // L'écran iPhone 11 (4 en stock, rien de vendu) n'est pas conseillé.
    expect(advice.some((a) => a.productId === "i11")).toBe(false);
  });

  it("une pièce cherchée sans résultat entre dans la commande ; la même s'ajoute à la quantité ; le conseil disparaît une fois commandé", () => {
    let s = addToOrder(shop(), { name: "écran Infinix Hot 40", why: "recherche" }, now);
    s = addToOrder(s, { name: "Écran infinix hot 40", why: "recherche" }, now);
    expect(s.toOrder).toHaveLength(1);
    expect(s.toOrder?.[0]?.qty).toBe(2);
    s = { ...s, repairs: [repair("R-004", "Écran Tecno BF6", "depot")] };
    expect(orderPlan(s, now).advice.some((a) => a.productId === "bf6")).toBe(true);
    s = addToOrder(s, { name: "Écran Tecno BF6", productId: "bf6", qty: 3, why: "conseil" }, now);
    const plan = orderPlan(s, now);
    expect(plan.advice.some((a) => a.productId === "bf6")).toBe(false);
    expect(plan.total).toBe(3 * 3700);
    expect(orderMessage(s, plan.order)).toBe("Salaam, commande de Boutique Mbéne :\n2 écran Infinix Hot 40\n3 Écran Tecno BF6\nMerci !");
    const id = s.toOrder![1]!.id;
    expect(setOrderQty(s, id, 5).toOrder?.[1]?.qty).toBe(5);
    expect(setOrderQty(s, id, 0).toOrder).toHaveLength(1);
    expect(removeFromOrder(s, id).toOrder).toHaveLength(1);
  });

  it("commande reçue : le stock monte, la pièce nouvelle devient un article, la caisse baisse seulement si payée avec la caisse", () => {
    let s = addToOrder(shop(), { name: "Écran Tecno BF6", productId: "bf6", qty: 4, why: "main" }, now);
    s = addToOrder(s, { name: "écran Infinix Hot 40", why: "recherche" }, now);
    const free = receiveOrder(s, { fromCash: false }, now);
    expect(free.count).toBe(2);
    expect(free.shop.products.find((p) => p.id === "bf6")?.stock).toBe(4);
    expect(free.shop.products.find((p) => p.name === "Écran Infinix Hot 40")?.stock).toBe(1);
    expect(free.shop.toOrder).toEqual([]);
    expect(free.shop.expenses).toEqual([]);
    const cash = receiveOrder(s, { fromCash: true }, now);
    expect(cash.shop.expenses).toHaveLength(1);
    expect(cash.shop.expenses[0]).toMatchObject({ amount: 4 * 3700, kind: "achat", productId: "bf6", qty: 4 });
  });
});
