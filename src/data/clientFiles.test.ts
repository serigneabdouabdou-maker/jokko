import { describe, expect, it } from "vitest";
import { newShop, type Shop } from "@/model";
import { addRepair, deliverRepair, markRepaired } from "./repairs";
import { sellService } from "./services";
import { campaignMessage, clientFile, knownClient, rankClients } from "./clientFiles";
import { buildDemoShop } from "./demo";

const DAY = 86_400_000;
const now = new Date("2026-11-13T12:00:00");
const ago = (d: number) => new Date(now.getTime() - d * DAY).toISOString();

function atelier(): Shop {
  let s: Shop = newShop("Sall GSM", "Réparation de téléphones et pièces détachées");
  // Awa : 3 visites (dépôt, rendu un autre jour, décodage) → fidèle.
  const r1 = addRepair(s, { clientName: "Awa Diop", phone: "77 123 45 67", device: "iPhone 11", problem: "écran cassé", price: 15000, advance: 5000, warrantyDays: 30 });
  s = r1.shop;
  s = markRepaired(s, r1.repair.id, [{ label: "Écran", cost: 5000 }])!;
  s = deliverRepair(s, r1.repair.id, 10000, false)!;
  const awa = s.clients.find((c) => c.name === "Awa Diop")!;
  s = { ...s, repairs: s.repairs!.map((r) => ({ ...r, at: ago(20), returnedAt: ago(18) })), sales: s.sales.map((x, i) => ({ ...x, at: ago(i ? 20 : 18) })) };
  s = sellService(s, { name: "Décodage", amount: 5000, clientId: awa.id, at: ago(2) })!.shop;
  // Moussa : 1 visite → nouveau ; Fatou : dette en retard → mauvais payeur.
  const r2 = addRepair(s, { clientName: "Moussa Sarr", phone: "78 000 00 01", device: "Tecno Spark", problem: "batterie", price: 8000 });
  s = r2.shop;
  s = { ...s, clients: [...s.clients, { id: "c-fatou", name: "Fatou Ba", phone: "770000002", debt: 6000, dueAt: ago(5) }] };
  s = sellService(s, { name: "Configuration", amount: 5000, clientId: "c-fatou", at: ago(40) })!.shop;
  return s;
}

describe("fiches clients du réparateur", () => {
  it("historique : réparation (panne, pièce, garantie) et service, une visite par jour", () => {
    const s = atelier();
    const f = clientFile(s, s.clients.find((c) => c.name === "Awa Diop")!, now);
    expect(f.visits).toBe(3);
    expect(f.spent).toBe(20000);
    expect(f.devices).toEqual(["iPhone 11"]);
    expect(f.entries[0]).toMatchObject({ kind: "service", title: "Décodage", amount: 5000 });
    expect(f.entries[1]).toMatchObject({ kind: "reparation", title: "R-001 · iPhone 11", detail: "écran cassé · pièces : Écran" });
    expect(f.underWarranty).toHaveLength(1);
    expect(f.segment).toBe("fidele");
  });

  it("classement : fidèle en tête, mauvais payeur signalé, nouveau client", () => {
    const ranked = rankClients(atelier(), now);
    expect(ranked[0].client.name).toBe("Awa Diop");
    expect(ranked.find((f) => f.client.name === "Fatou Ba")!.segment).toBe("payeur");
    expect(ranked.find((f) => f.client.name === "Moussa Sarr")!.segment).toBe("nouveau");
  });

  it("le client qui revient est reconnu par son numéro, même écrit autrement", () => {
    const s = atelier();
    expect(knownClient(s, "", "+221 77 123 45 67")?.name).toBe("Awa Diop");
    expect(knownClient(s, "moussa sarr", "")?.name).toBe("Moussa Sarr");
    // Nouveau dépôt avec le même numéro : même fiche, pas un nouveau client.
    const again = addRepair(s, { clientName: "Awa", phone: "771234567", device: "Samsung A12", problem: "connecteur" });
    expect(again.shop.clients.filter((c) => c.phone === "771234567")).toHaveLength(1);
    expect(clientFile(again.shop, again.shop.clients.find((c) => c.phone === "771234567")!, now).devices.sort()).toEqual(["Samsung A12", "iPhone 11"].sort());
  });

  it("messages de campagne selon le groupe", () => {
    const ranked = rankClients(atelier(), now);
    expect(campaignMessage(ranked[0], "Sall GSM")).toContain("client fidèle");
    expect(campaignMessage(ranked.find((f) => f.segment === "payeur")!, "Sall GSM")).toContain("6000 F");
  });

  it("tous les métiers : tailleur (commandes, mesures) et boutique (articles achetés souvent)", () => {
    const tailor = buildDemoShop(now, "couture");
    const awa = rankClients(tailor, now).find((f) => f.client.name === "Awa Diop")!;
    expect(awa.entries.filter((e) => e.kind === "commande").length).toBe(2);
    // Les paiements « Couture C-… » sont dans la commande, pas en double.
    expect(awa.entries.some((e) => e.kind === "achat" && e.title.startsWith("Couture"))).toBe(false);
    expect(campaignMessage(awa, tailor.name, "", tailor.activity)).toMatch(/Salaam Awa/);

    const shop = buildDemoShop(now, "alimentation");
    const files = rankClients(shop, now);
    const buyer = files.find((f) => f.favorites.length > 0)!;
    expect(buyer.visits).toBeGreaterThan(0);
    const fresh = { ...buyer, segment: "nouveau" as const };
    expect(campaignMessage(fresh, shop.name, "", shop.activity)).toContain(`Ton ${buyer.favorites[0].toLowerCase()} est disponible`);
  });
});
