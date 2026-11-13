import { describe, expect, it } from "vitest";
import type { Shop } from "../model.ts";
import { addCommonServices, saveService, sellService, servicesOf } from "./services";
import { addVariants, parseVariants, variantFamilies } from "./variants";
import { metierOf, screenLabel } from "./metiers";
import { addRepair, deliverRepair } from "./repairs";
import { buildDemoShop } from "./demo";
import { buildReport, periodOf } from "./report";

const shop = (activity = "multiservice"): Shop => ({
  id: "s", name: "Keur Service", activity, address: "", phone: "", openingCash: 0,
  products: [{ id: "flex", name: "Flex vert", unit: "mètre", stock: 10, min: 2, price: 0, cost: 2500 }, { id: "bache", name: "Bâche", unit: "m²", stock: 20, min: 5, price: 0, cost: 1800 }],
  clients: [], sales: [], expenses: [], invoices: [], reminders: [], shortcuts: [],
} as unknown as Shop);

describe("multiservice : services au m², à la page, avec matière", () => {
  it("les services courants du multiservice (pas ceux du réparateur)", () => {
    const names = servicesOf(addCommonServices(shop())).map((s) => s.name);
    expect(names).toContain("Bâche grand format");
    expect(names).toContain("Flocage t-shirt / maillot");
    expect(names).not.toContain("Décodage");
    expect(servicesOf(addCommonServices(shop("Réparation de téléphones"))).map((s) => s.name)).toContain("Décodage");
  });
  it("bâche 2 × 1,5 m à 5 000 le m² = 15 000, la bâche sort du stock, le bénéfice compte la matière", () => {
    let s = saveService(shop(), { name: "Bâche grand format", price: 5000, unit: "m2", matter: { productId: "bache", per: 1 } });
    const svc = servicesOf(s)[0];
    const done = sellService(s, { name: svc.name, service: svc, size: { w: 2, h: 1.5 } })!;
    expect(done.sale.amount).toBe(15000);
    expect(done.sale.label).toBe("Service · Bâche grand format (2 × 1,5 m = 3 m²)");
    expect(done.sale.cost).toBe(5400);
    expect(done.shop.products.find((p) => p.id === "bache")!.stock).toBe(17);
    s = done.shop;
    expect(buildReport(s, periodOf("jour")).grossProfit).toBe(9600);
  });
  it("flocage de 4 maillots : 0,3 m de flex par maillot", () => {
    const s = saveService(shop(), { name: "Flocage", price: 2500, unit: "piece", matter: { productId: "flex", per: 0.3 } });
    const done = sellService(s, { name: "Flocage", service: servicesOf(s)[0], qty: 4 })!;
    expect(done.sale.amount).toBe(10000);
    expect(done.sale.cost).toBe(3000);
    expect(done.shop.products.find((p) => p.id === "flex")!.stock).toBe(8.8);
  });
  it("50 photocopies à 25 F = 1 250 F ; un prix spécial gagne", () => {
    const s = saveService(shop(), { name: "Photocopie noir A4", price: 25, unit: "page" });
    const svc = servicesOf(s)[0];
    expect(sellService(s, { name: svc.name, service: svc, qty: 50 })!.sale).toMatchObject({ amount: 1250, label: "Service · Photocopie noir A4 × 50 pages" });
    expect(sellService(s, { name: svc.name, service: svc, qty: 50, amount: 1000 })!.sale.amount).toBe(1000);
  });
  it("commande de maillots avec avance : paiements comptés comme services, écran « Services et commandes »", () => {
    const s0 = shop();
    const { shop: s1, repair } = addRepair(s0, { clientName: "ASC Mboss", device: "20 maillots floqués", problem: "noms + numéros", price: 70000, advance: 30000 });
    expect(s1.sales[0].label).toBe("Service · Commande R-001 · 20 maillots floqués (avance)");
    const s2 = deliverRepair(s1, repair.id, 40000, true)!;
    expect(s2.sales[0].label).toContain("(livré)");
    expect(screenLabel("multiservice", "atelier", "Atelier")).toBe("Services et commandes");
    expect(addRepair({ ...s0, activity: "reparation" }, { clientName: "Awa", device: "iPhone", problem: "écran", advance: 5000 }).shop.sales[0].label).toMatch(/^Réparation R-001/);
  });
});

describe("tailles et couleurs", () => {
  it("un article par couleur, chacun son stock ; une variante existante est complétée", () => {
    expect(parseVariants("S, M, L ,xl, M")).toEqual(["S", "M", "L", "xl"]);
    let r = addVariants(shop("mercerie"), { name: "Fil à coudre", unit: "bobine", price: 300, cost: 180, variants: [{ label: "noir", stock: 20 }, { label: "blanc", stock: 10 }] });
    expect(r.created).toBe(2);
    expect(r.shop.products.map((p) => p.name)).toContain("Fil à coudre · noir");
    r = addVariants(r.shop, { name: "Fil à coudre", unit: "bobine", price: 300, variants: [{ label: "noir", stock: 5 }] });
    expect(r.updated).toBe(1);
    expect(r.shop.products.find((p) => p.name === "Fil à coudre · noir")!.stock).toBe(25);
    expect(variantFamilies(r.shop.products)).toEqual([expect.objectContaining({ base: "Fil à coudre" })]);
  });
});

describe("mercerie", () => {
  it("reconnue d'après l'activité écrite, avant la couture", () => {
    expect(metierOf("Mercerie Ndèye").id).toBe("mercerie");
    expect(metierOf("Fournitures de couture").id).toBe("mercerie");
    expect(metierOf("Atelier de couture").id).toBe("couture");
    expect(metierOf("Flocage et sérigraphie").id).toBe("multiservice");
  });
  it("démo mercerie : fil, boutons, galons ; jamais de riz", () => {
    const d = buildDemoShop(new Date(), "mercerie");
    expect(d.products.some((p) => p.name.startsWith("Fil à coudre"))).toBe(true);
    expect(d.products.some((p) => /riz|huile|sucre/i.test(p.name))).toBe(false);
  });
});
