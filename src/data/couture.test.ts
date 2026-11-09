import { describe, expect, it } from "vitest";
import { type Shop, seedShop } from "../model";
import { addCouture, byUrgency, clientMessage, cleanMeasures, deliverCouture, findCouture, knownMeasures, nextCoutureNumber, ordersOf, payCouture, remaining, setStep, trackUrl } from "./couture";

const shop = (): Shop => ({ ...seedShop(), clients: [], sales: [], couture: [], phone: "77 111 22 33" });

describe("atelier couture", () => {
  it("nouvelle commande : numéro, avance en caisse, mesures gardées pour le client", () => {
    const { shop: s, order } = addCouture(shop(), { clientName: "awa diop", phone: "77 123 45 67", garment: "Grand boubou brodé", fabric: "bazin bleu apporté", price: 25000, advance: 10000, dueAt: "2026-12-01", measures: { poitrine: "92", taille: "74,5", cou: "" } });
    expect(order.number).toBe("C-001");
    expect(order.status).toBe("recu");
    expect(order.token.length).toBeGreaterThanOrEqual(12);
    expect(order.measures).toEqual({ poitrine: 92, taille: 74.5 });
    expect(remaining(order)).toBe(15000);
    expect(s.sales[0]).toMatchObject({ amount: 10000 });
    expect(s.clients[0]).toMatchObject({ name: "Awa diop", phone: "771234567", measures: { poitrine: 92, taille: 74.5 } });
    expect(nextCoutureNumber(s)).toBe("C-002");
    // Deuxième commande : les mesures sont reprises
    expect(knownMeasures(s, "Awa Diop")).toEqual({ poitrine: 92, taille: 74.5 });
    const { order: second } = addCouture(s, { clientName: "Awa Diop", garment: "Taille basse", price: 15000 });
    expect(second.measures).toEqual({ poitrine: 92, taille: 74.5 });
    expect(second.clientId).toBe(order.clientId);
  });

  it("étapes, acompte, livraison : le reste va en dette", () => {
    let { shop: s, order } = addCouture(shop(), { clientName: "Moussa", phone: "771234567", garment: "Ensemble", price: 20000, advance: 5000 });
    s = setStep(s, order.id, "coupe")!;
    s = setStep(s, order.id, "pret")!;
    expect(ordersOf(s)[0].readyAt).toBeTruthy();
    s = payCouture(s, order.id, 5000)!;
    s = deliverCouture(s, order.id, 4000)!;
    const done = ordersOf(s)[0];
    expect(done.status).toBe("livre");
    expect(done.paid).toBe(14000);
    expect(s.clients[0].debt).toBe(6000);
    expect(setStep(s, order.id, "coupe")).toBeNull();
    expect(s.sales.reduce((a, x) => a + x.amount, 0)).toBe(14000);
  });

  it("lien de suivi et messages WhatsApp", () => {
    const { shop: s, order } = addCouture(shop(), { clientName: "Fatou", phone: "771234567", garment: "Robe", price: 18000, advance: 8000, dueAt: "2026-12-24" });
    expect(trackUrl(order)).toBe(`https://jokkoapp.com/?suivi=${order.token}`);
    expect(decodeURIComponent(clientMessage(s, order, "suivi")!)).toContain(order.token);
    expect(decodeURIComponent(clientMessage(s, order, "pret")!)).toContain("Reste à payer : 10");
  });

  it("classement par urgence et recherche", () => {
    let s = shop();
    s = addCouture(s, { clientName: "A", garment: "x", dueAt: "2027-01-10" }).shop;
    s = addCouture(s, { clientName: "B", garment: "y", dueAt: "2026-12-01" }).shop;
    expect(byUrgency(ordersOf(s)).map((o) => o.clientName)).toEqual(["B", "A"]);
    expect(findCouture(s, "C-001")?.clientName).toBe("A");
    expect(cleanMeasures({ a: "500", b: "-3", c: "40" })).toEqual({ c: 40 });
  });
});
