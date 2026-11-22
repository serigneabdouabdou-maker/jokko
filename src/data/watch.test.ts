import { describe, expect, it } from "vitest";
import { type Shop, newShop } from "@/model";
import { hasModel, priceMove, skillServices, trends, workshopWatch } from "./watch";

const now = new Date("2026-11-22T12:00:00");
const shop = (): Shop => ({
  ...newShop("Atelier", "reparation"),
  products: [
    { id: "bg6m", name: "Écran Tecno BG6M", unit: "pièce", stock: 0, min: 0, price: 9000, cost: 3800 },
    { id: "a05", name: "Écran Samsung A05", unit: "pièce", stock: 2, min: 0, price: 10000, cost: 4000 },
  ],
  suppliers: [{
    id: "f", name: "Bathie", phone: "", historyTo: "2026-11-21",
    purchases: [{ month: "2026-11", total: 100000, invoices: 2 }],
    anomalies: [{ date: "2025-07-30", text: "30/07/2025 : « LCD A12 » 6 × 4 500 = 27 000 F, mais la facture compte 39 000 F (12 000 F de trop).", serious: true }],
    items: [
      { key: "Écran:bg6m", name: "Écran BG6M", kind: "Écran", qty: 60, total: 230000, first: "2025-01-01", last: "2026-11-21", prices: [["2025-01-01", 4200], ["2026-09-01", 3800]], recent: 30, older: 9 },
      { key: "Écran:a05", name: "Écran A05", kind: "Écran", qty: 30, total: 120000, first: "2025-01-01", last: "2026-11-10", prices: [["2025-01-01", 4000]], recent: 12, older: 10 },
      { key: "Écran:kf6", name: "Écran KF6", kind: "Écran", qty: 55, total: 250000, first: "2024-07-01", last: "2026-05-01", prices: [["2024-07-01", 4600], ["2026-08-01", 5200]], recent: 2, older: 20 },
      { key: "Écran:bf6", name: "Écran BF6", kind: "Écran", qty: 80, total: 300000, first: "2025-01-01", last: "2026-11-11", prices: [["2026-09-14", 4700], ["2026-09-14", 3700], ["2026-09-15", 4700]], recent: 40, older: 30 },
      { key: "Plaquette:", name: "Plaquette", kind: "Plaquette", qty: 80, total: 40000, first: "2025-01-01", last: "2026-11-01", prices: [["2025-01-01", 650], ["2026-09-15", 500]], recent: 20, older: 0 },
    ],
  }],
  repairs: [
    { id: "r1", at: "2026-11-13T10:00:00", number: "R-002", clientName: "A", phone: "", device: "zte a35e", problem: "écran cassé", price: 9000, paid: 9000, status: "rendu", parts: [] },
    { id: "r2", at: "2026-11-13T10:00:00", number: "R-004", clientName: "B", phone: "", device: "imprimante", problem: "panne pilote", price: 10000, paid: 10000, status: "rendu", parts: [] },
    { id: "r3", at: "2026-11-21T10:00:00", number: "R-019", clientName: "C", phone: "", device: "A51", problem: "Écran cassé · Écran Samsung A51", price: 12000, paid: 12000, status: "rendu", repairedAt: "2026-11-21T11:00:00", parts: [{ label: "Écran Samsung A51 (incell)", qty: 1, cost: 8000 }] },
  ] as never,
  sales: [
    { id: "s1", at: "2026-11-17T12:00:00", label: "Service · Configuration", amount: 5000 },
    { id: "s2", at: "2026-11-18T12:00:00", label: "Service · Configuration", amount: 4000 },
    { id: "s3", at: "2026-10-19T12:00:00", label: "Service · Décodage", amount: 6000 },
    { id: "s4", at: "2026-11-19T12:00:00", label: "Service · Bâche (2 × 1 m = 2 m²)", amount: 8000, cost: 3000 },
  ] as never,
});

describe("surveillance de l'atelier", () => {
  it("prix : une vraie hausse / baisse, jamais deux qualités du même jour", () => {
    const items = shop().suppliers![0]!.items!;
    expect(priceMove(items[0]!)).toMatchObject({ from: 4200, to: 3800, pct: -10 });
    expect(priceMove(items[2]!)).toMatchObject({ pct: 13 });
    expect(priceMove(items[3]!)).toBeNull(); // 4 700 / 3 700 qui alternent : copie et original
    expect(hasModel(items[4]!)).toBe(false); // « Plaquette » sans modèle : jamais signalée
  });

  it("ce qui monte et ce qui baisse", () => {
    const t = trends(shop());
    expect(t.up.map((x) => x.item.name)).toEqual(["Écran BG6M"]);
    expect(t.down.map((x) => x.item.name)).toEqual(["Écran KF6"]);
  });

  it("services sans matériel : services sans matière + réparations sans pièce qui n'en demandent pas", () => {
    const sk = skillServices(shop(), now);
    expect(sk.month).toEqual({ count: 3, earned: 19000 });
    expect(sk.prev).toEqual({ count: 1, earned: 6000 });
    expect(sk.best).toMatchObject({ name: "Panne pilote", earned: 10000 });
  });

  it("signaux : facture comptée trop cher, réparation sans pièce, star à 0, gain bas, hausse de prix", () => {
    const w = workshopWatch(shop(), now);
    const titles = w.map((s) => s.title.replace(/[\u202f\u00a0]/g, " "));
    expect(titles).toContain("1 erreur dans les factures : 12 000 F comptés en trop");
    expect(titles).toContain("1 réparation rendue sans pièce notée");
    expect(w.find((s) => s.id === "stars-vides")!.text).toContain("Écran BG6M");
    expect(w.find((s) => s.id === "stars-vides")!.text).not.toContain("A05"); // 2 en stock
    expect(titles).toContain("1 écran posé avec moins de 5 000 F de gain");
    expect(titles).toContain("Prix en hausse : Écran KF6");
    expect(w[0]!.level === "grave" || w[0]!.level === "attention").toBe(true);
  });
});
