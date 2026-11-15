import { describe, expect, it } from "vitest";
import { newShop } from "../model.ts";
import { noticeCounts, shopNotices } from "./notices.ts";

const all = () => true;

describe("pastilles de notifications", () => {
  it("une boutique vide n'a aucune pastille", () => {
    expect(shopNotices(newShop("Test", "Alimentation générale", "Dakar"), { patron: true, screens: all })).toEqual([]);
  });

  it("compte les appareils réparés qui attendent et les dettes en retard", () => {
    const now = new Date("2026-11-15T10:00:00");
    const shop = newShop("Atelier", "Réparation de téléphones", "Dakar");
    const old = new Date(now.getTime() - 40 * 86_400_000).toISOString();
    shop.clients = [{ id: "c1", name: "Awa", phone: "", debt: 5000, since: old, dueAt: old } as never];
    shop.repairs = [
      { id: "r1", code: "R-001", client: "Awa", device: "Tecno", problem: "écran", price: 10000, paid: 0, status: "repare", at: old, repairedAt: old, parts: [] } as never,
      { id: "r2", code: "R-002", client: "Ali", device: "Itel", problem: "batterie", price: 8000, paid: 0, status: "repare", at: old, repairedAt: old, parts: [] } as never,
    ];
    const list = shopNotices(shop, { patron: true, screens: all }, now);
    const counts = noticeCounts(list);
    expect(counts.atelier).toBeGreaterThanOrEqual(2);
    expect(list.find((n) => n.screen === "dettes")?.tone).toBe("grave");
  });

  it("n'affiche rien pour un écran que la boutique n'a pas", () => {
    const now = new Date("2026-11-15T10:00:00");
    const shop = newShop("Atelier", "Réparation de téléphones", "Dakar");
    const old = new Date(now.getTime() - 40 * 86_400_000).toISOString();
    shop.repairs = [{ id: "r1", code: "R-001", client: "Awa", device: "Tecno", problem: "écran", price: 10000, paid: 0, status: "repare", at: old, repairedAt: old, parts: [] } as never];
    expect(shopNotices(shop, { patron: true, screens: (s) => s !== "atelier" }, now).some((n) => n.screen === "atelier")).toBe(false);
  });
});
