import { describe, expect, it } from "vitest";
import type { Shop } from "../model.ts";
import { addToCart, checkout, setQty } from "./checkout";
import { addVoids, bumpPeak, type Peak, voidEvents, voidsFrom, voidsOfDay } from "./voids";
import { zReport, zText } from "./tickets";
import { childRows, rowsToShop } from "./sync";

const base = (): Shop => ({
  id: "s", name: "Supérette Awa", activity: "alimentation", address: "", phone: "",
  products: [
    { id: "lait", name: "Lait Vitalait", unit: "boîte", stock: 50, min: 0, price: 1250 },
    { id: "riz", name: "Riz", unit: "sac", stock: 10, min: 0, price: 18000, retail: { unit: "kg", per: 50, price: 400 } },
  ],
  clients: [], sales: [], expenses: [], invoices: [], reminders: [], shortcuts: [],
} as unknown as Shop);

describe("articles retirés du panier", () => {
  it("scanné 3 fois, retiré 1 : un retrait de 1 lait au nom du vendeur", () => {
    let lines = addToCart([], "lait", false);
    let peak: Peak = bumpPeak({}, lines);
    lines = addToCart(lines, "lait", false); peak = bumpPeak(peak, lines);
    lines = addToCart(lines, "lait", false); peak = bumpPeak(peak, lines);
    lines = setQty(lines, 0, 2); peak = bumpPeak(peak, lines);
    const v = voidsFrom(base(), peak, lines, "Awa", "scanner");
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ productId: "lait", qty: 1, amount: 1250, by: "Awa", label: "Lait Vitalait" });
  });
  it("tout encaissé : rien de noté", () => {
    const lines = addToCart(addToCart([], "lait", false), "lait", false);
    expect(voidsFrom(base(), bumpPeak({}, lines), lines, "Awa", "scanner")).toEqual([]);
  });
  it("« Vider » : tout le panier est noté, détail au kilo avec son prix", () => {
    const lines = addToCart(addToCart([], "lait", false), "riz", true, 2.5);
    const v = voidsFrom(base(), bumpPeak({}, lines), [], "Moussa", "scanner");
    expect(v.map((x) => [x.label, x.qty, x.amount]).sort()).toEqual([["Lait Vitalait", 1, 1250], ["Riz (kg)", 2.5, 1000]]);
  });
  it("ticket Z : « 7 articles retirés », par vendeur", () => {
    let s = base();
    const lines = [{ productId: "lait", retail: false, qty: 5 }];
    s = checkout(s, lines, "especes")!.shop;
    s = addVoids(s, voidsFrom(s, { "lait|0": 6 }, [], "Awa", "scanner"));
    s = addVoids(s, voidsFrom(s, { "lait|0": 1 }, [], "Moussa", "scanner"));
    const day = voidsOfDay(s);
    expect(day.count).toBe(7);
    expect(day.amount).toBe(8750);
    expect(day.byPerson[0]).toMatchObject({ name: "Awa", count: 6 });
    const text = zText(s, zReport(s));
    expect(text).toContain("Articles retires");
    expect(text).toContain("Awa");
    for (const l of text.split("\n")) expect(l.length).toBeLessThanOrEqual(32);
  });
  it("hier ne compte pas aujourd'hui", () => {
    const s = addVoids(base(), voidsFrom(base(), { "lait|0": 2 }, [], "Awa", "scanner", new Date(Date.now() - 86_400_000 * 2)));
    expect(voidsOfDay(s).count).toBe(0);
    expect(zText(s, zReport(s))).toContain("aucun");
  });
  it("synchro : aller-retour vers la table cart_voids", () => {
    const s = addVoids(base(), voidsFrom(base(), { "riz|1": 1.5 }, [], "Awa", "cuisine"));
    const rows = childRows(s, "cart_voids");
    expect(rows[0]).toMatchObject({ shop_id: "s", by_name: "Awa", place: "cuisine", qty: 1.5, amount: 600 });
    const back = rowsToShop({
      shop: { id: "s", name: "x" }, products: [], clients: [], sales: [], expenses: [], invoices: [], reminders: [], shortcuts: [],
      cart_voids: rows.map((r) => ({ ...r, qty: String(r.qty) })),
    });
    expect(back.voids?.[0]).toMatchObject({ by: "Awa", qty: 1.5, where: "cuisine", label: "Riz (kg)" });
  });
});

describe("liste des retraits du jour", () => {
  it("un geste = une ligne, la plus récente en haut, hier exclu", () => {
    const t1 = new Date(); t1.setHours(10, 12, 0, 0);
    const t2 = new Date(); t2.setHours(18, 5, 0, 0);
    let s = base();
    s = addVoids(s, voidsFrom(s, { "lait|0": 2 }, [], "Awa", "scanner", t1));
    s = addVoids(s, voidsFrom(s, { "lait|0": 1, "riz|1": 2 }, [], "Moussa", "scanner", t2));
    s = addVoids(s, voidsFrom(s, { "lait|0": 9 }, [], "Awa", "scanner", new Date(Date.now() - 3 * 86_400_000)));
    const list = voidEvents(s);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ by: "Moussa", amount: 2050 });
    expect(list[0].items).toHaveLength(2);
    expect(list[1]).toMatchObject({ by: "Awa", amount: 2500, items: [{ label: "Lait Vitalait", qty: 2 }] });
  });
});
