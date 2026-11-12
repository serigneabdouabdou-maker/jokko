import { describe, expect, it } from "vitest";
import { buildDemoShop, DEMO_METIERS, demoInfo, demoProfile, isDemoShop } from "./demo.ts";
import { METIERS, metierOf, type MetierId } from "./metiers.ts";
import { isDish } from "./cuisine.ts";
import { dayCashSales, expectedCash, type Profile, type Shop } from "../model.ts";

const now = new Date("2026-11-01T15:00:00");
const words = (shop: Shop) => [...shop.products.map((p) => p.name), ...shop.sales.map((s) => s.label)].join(" | ");

describe("une démo par métier", () => {
  it("chaque métier a sa démo, reconnue comme ce métier", () => {
    expect(DEMO_METIERS).toHaveLength(METIERS.length);
    for (const m of METIERS) {
      const shop = buildDemoShop(now, m.id);
      expect(metierOf(shop.activity).id).toBe(m.id);
      expect(isDemoShop(shop)).toBe(true);
    }
  });

  it.each(METIERS.map((m) => m.id))("%s : remplie, juste et sans vrai numéro", (id: MetierId) => {
    const shop = buildDemoShop(now, id);
    expect(shop.products.length >= 8).toBe(true);
    expect(shop.clients.length >= 4).toBe(true);
    expect(shop.sales.length > 20).toBe(true);
    const today = shop.sales.filter((s) => new Date(s.at).toDateString() === now.toDateString());
    expect(today.length > 0).toBe(true);
    expect(shop.sales.every((s) => Date.parse(s.at) <= now.getTime() && s.amount > 0)).toBe(true);
    expect(dayCashSales(shop) >= 0 && expectedCash(shop) > 0).toBe(true);
    const ids = new Set(shop.products.map((p) => p.id));
    expect(shop.sales.filter((s) => s.productId).every((s) => ids.has(s.productId!) && (s.cost ?? 0) < s.amount)).toBe(true);
    expect(shop.clients.every((c) => c.phone === "")).toBe(true);
    expect(shop.clients.some((c) => c.debt > 0)).toBe(true);
    expect(shop.products.some((p) => p.stock <= p.min)).toBe(true);
    expect(JSON.stringify(buildDemoShop(now, id))).toBe(JSON.stringify(shop));
  });

  it("le riz et l'huile restent dans l'alimentation (et la cuisine d'un restaurant)", () => {
    expect(words(buildDemoShop(now, "alimentation"))).toMatch(/Riz/);
    for (const id of ["couture", "pharmacie", "quincaillerie", "vetements", "reparation", "multiservice", "autre"] as MetierId[]) {
      expect(words(buildDemoShop(now, id))).not.toMatch(/\briz\b|\bhuile\b(?! de coco)|\bsucre/i);
      expect(demoInfo(id).text).not.toMatch(/riz|huile|sucre/i);
    }
  });

  it("couture : commandes, mesures, avances et habits prêts", () => {
    const shop = buildDemoShop(now, "couture");
    expect((shop.couture ?? []).length >= 6).toBe(true);
    expect(shop.couture!.some((o) => o.status === "pret")).toBe(true);
    expect(shop.couture!.every((o) => o.paid <= o.price && Object.keys(o.measures).length > 0)).toBe(true);
    expect(shop.sales.some((s) => s.label.startsWith("Couture C-"))).toBe(true);
    expect(demoInfo("Couture, tailleur").title).toMatch(/atelier de couture/);
  });

  it("réparation : téléphones au dépôt et pièces posées", () => {
    const shop = buildDemoShop(now, "reparation");
    expect(shop.repairs!.some((r) => r.status === "depot")).toBe(true);
    expect(shop.repairs!.some((r) => r.parts.length > 0)).toBe(true);
  });

  it("pharmacie : des médicaments qui périment bientôt", () => {
    const shop = buildDemoShop(now, "pharmacie");
    const soon = new Date(now.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);
    expect(shop.products.some((p) => p.expiresAt && p.expiresAt <= soon)).toBe(true);
  });

  it("restaurant : des plats ; boulangerie : la tournée du matin", () => {
    expect(buildDemoShop(now, "restauration").products.filter(isDish).length >= 5).toBe(true);
    const bakery = buildDemoShop(now, "boulangerie");
    expect(bakery.clients.filter((c) => c.tournee?.length).length >= 2).toBe(true);
    expect(bakery.sales.some((s) => s.payment === "credit" && s.clientId)).toBe(true);
  });

  it("la démo suit le métier de la vraie boutique, ou celui choisi", () => {
    const real = { phone: "221770000000", owner: "Test", lang: "wo", role: "patron", geminiKey: "", speak: true, shopId: "shop-x", shops: [{ id: "shop-x", activity: "Pharmacie, dépôt de médicaments" }] } as unknown as Profile;
    const p = demoProfile(real, now);
    expect(p.shops).toHaveLength(1);
    expect(metierOf(p.shops[0].activity).id).toBe("pharmacie");
    expect(metierOf(demoProfile(real, now, "couture").shops[0].activity).id).toBe("couture");
  });
});
