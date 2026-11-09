import { describe, expect, it } from "vitest";
import { type Shop, seedShop } from "../model";
import { type Entry, LiveDesk } from "../assistant/liveDesk";
import { coutureSummary, readSpokenCouture, spokenCm, spokenDue, spokenMoney } from "./coutureVoice";
import { ordersOf } from "./couture";

// Lundi 9 novembre 2026, midi.
const NOW = new Date(2026, 10, 9, 12);

describe("commande de couture dite à la voix", () => {
  it("mesures en centimètres (jamais en dërëm), en chiffres, en français ou en wolof", () => {
    expect(spokenCm("45")).toBe(45);
    expect(spokenCm("45,5")).toBe(45.5);
    expect(spokenCm("ñeent-fukk ak juróom")).toBe(45);
    expect(spokenCm("juróom-fukk ak ñaar")).toBe(52);
    expect(spokenCm("téeméer ak fukk")).toBe(110);
    expect(spokenCm("quarante-cinq")).toBe(45);
    expect(spokenCm("ñeent-fukk ak genn-wàll")).toBe(40.5);
    expect(spokenCm("bari")).toBeNull();
    expect(spokenCm("900")).toBeNull();
  });

  it("argent en dërëm comme au comptoir", () => {
    expect(spokenMoney("juróomi junni")).toBe(25000);
    expect(spokenMoney("ñaari junni")).toBe(10000);
    expect(spokenMoney("25 000")).toBe(25000);
    expect(spokenMoney("vingt-cinq mille")).toBe(25000);
  });

  it("jour promis : jour de la semaine en wolof ou en français, demain, nombre de jours", () => {
    expect(spokenDue("gaawu", undefined, NOW)).toBe("2026-11-14");
    expect(spokenDue("samedi", undefined, NOW)).toBe("2026-11-14");
    expect(spokenDue("altine", undefined, NOW)).toBe("2026-11-16"); // aujourd'hui lundi → lundi prochain
    expect(spokenDue("ëllëg", undefined, NOW)).toBe("2026-11-10");
    expect(spokenDue("", 10, NOW)).toBe("2026-11-19");
    expect(spokenDue("avant la Tabaski", undefined, NOW)).toBeUndefined();
  });

  it("lit toute la commande ; un jour flou part dans la remarque", () => {
    const { input, unclear } = readSpokenCouture(
      { clientName: "Awa Diop", habit: "grand boubou", tissu: "bazin bleu", mesures: { poitrine: "ñeent-fukk ak juróom", epaule: "46", taille: "bari" }, prixDit: "juróomi junni", avanceDit: "ñaari junni", jour: "avant la Tabaski", telephone: "77 567 47 25" },
      NOW,
    );
    expect(input).toMatchObject({ clientName: "Awa Diop", garment: "grand boubou", fabric: "bazin bleu", price: 25000, advance: 10000, phone: "775674725", note: "avant la Tabaski" });
    expect(input.measures).toEqual({ poitrine: 45, epaule: 46 });
    expect(unclear).toEqual(["Taille"]);
  });

  it("une avance plus grande que le prix n'est pas acceptée", () => {
    const { input, unclear } = readSpokenCouture({ clientName: "Awa", habit: "robe", prixDit: "10 000", avanceDit: "20 000" }, NOW);
    expect(input.advance).toBe(0);
    expect(unclear[0]).toMatch(/avance/);
  });
});

describe("outil couture du direct", () => {
  function setup() {
    let shop: Shop = { ...seedShop(), activity: "Couture, tailleur" };
    const saved: Entry[] = [];
    const desk = new LiveDesk({ getShop: () => shop, lang: () => "wo", write: (n) => (shop = n), onSaved: (e) => saved.push(e), onUndone: () => undefined });
    return { desk, saved, shop: () => shop };
  }

  it("prend la commande, met l'avance en caisse, garde les mesures du client", () => {
    const { desk, shop } = setup();
    const r = desk.handle({ name: "couture", args: { action: "commander", clientName: "Awa Diop", habit: "grand boubou", mesures: { poitrine: "ñeent-fukk ak juróom" }, prixDit: "juróomi junni", avanceDit: "ñaari junni", heard: "Awa Diop, grand boubou…" } });
    expect(r).toMatchObject({ statut: "enregistre", numero: "C-001", client: "Awa Diop", reste: { francs: 15000, wolof: "ñetti junni" } });
    expect(shop().sales[0]).toMatchObject({ amount: 10000 });
    expect(shop().clients.find((c) => c.name === "Awa Diop")?.measures).toEqual({ poitrine: 45 });
    expect(desk.handle({ name: "couture", args: { action: "mesures", clientName: "Awa Diop" } })).toMatchObject({ statut: "mesures", mesures: [{ mesure: "Poitrine", cm: 45 }] });
  });

  it("sans habit : demande, n'enregistre rien ; montant flou : fait répéter", () => {
    const { desk, saved } = setup();
    expect(desk.handle({ name: "couture", args: { action: "commander", clientName: "Awa" } })).toMatchObject({ statut: "incomplet" });
    expect(desk.handle({ name: "couture", args: { action: "commander", clientName: "Awa", habit: "robe", prixDit: "bari" } })).toMatchObject({ statut: "pas_compris" });
    expect(saved).toHaveLength(0);
  });

  it("étape, acompte, livraison avec le reste en dette, et annulation", () => {
    const { desk, shop } = setup();
    desk.handle({ name: "couture", args: { action: "commander", clientName: "Moussa Sow", habit: "kaftan", prixDit: "20 000", avanceDit: "5 000" } });
    expect(desk.handle({ name: "couture", args: { action: "etape", clientName: "Moussa Sow", etape: "pret" } })).toMatchObject({ statut: "enregistre", etape: "Prêt" });
    expect(desk.handle({ name: "couture", args: { action: "payer", numero: "C-001", montantDit: "benn junni" } })).toMatchObject({ reste: { francs: 10000 } });
    expect(desk.handle({ name: "couture", args: { action: "livrer", numero: "C-001", montantDit: "5 000" } })).toMatchObject({ reste_en_dette: { francs: 5000 } });
    expect(ordersOf(shop())[0].status).toBe("livre");
    expect(shop().clients.find((c) => c.name === "Moussa Sow")?.debt).toBe(5000);
    expect(desk.handle({ name: "annuler_derniere", args: {} })).toMatchObject({ statut: "annule" });
    expect(ordersOf(shop())[0].status).toBe("pret");
  });

  it("le numéro dit après la commande part aussi sur la commande (lien de suivi)", () => {
    const { desk, shop } = setup();
    desk.handle({ name: "couture", args: { action: "commander", clientName: "Fatou Fall", habit: "taille basse" } });
    desk.handle({ name: "numero_client", args: { clientName: "Fatou Fall", numero: "78 123 45 67" } });
    expect(ordersOf(shop())[0].phone).toBe("781234567");
  });
});

describe("commande lue à voix haute", () => {
  const o = { number: "C-001", clientName: "Awa Diop", garment: "grand boubou", price: 25000, paid: 10000, dueAt: "2026-11-14" };
  it("en wolof : montants en dërëm, jour en wolof, une seule phrase", () => {
    expect(coutureSummary(o, "wo", NOW)).toBe("Bind naa ko, nimero benn, Awa Diop, grand boubou, njëg li juróomi junni, avance bi ñaari junni, des na ñetti junni, dina pare gaawu.");
  });
  it("en français : montants en francs", () => {
    expect(coutureSummary(o, "fr", NOW)).toBe("C'est noté, commande numéro 1, Awa Diop, grand boubou, prix 25 000 francs, avance 10 000 francs, reste 15 000 francs, prêt pour samedi.");
  });
  it("sans prix : pas de reste inventé", () => {
    expect(coutureSummary({ ...o, price: 0, paid: 0, dueAt: undefined }, "wo", NOW)).toBe("Bind naa ko, nimero benn, Awa Diop, grand boubou.");
  });
});
