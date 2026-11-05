import { describe, expect, it } from "vitest";
import { type Shop, seedShop } from "../model";
import { type Entry, LiveDesk } from "./liveDesk";

function setup(clients: string[]) {
  let shop: Shop = { ...seedShop(), clients: clients.map((name, i) => ({ id: `c${i}`, name, phone: "", debt: 0 })) };
  const saved: Entry[] = [];
  const desk = new LiveDesk({ getShop: () => shop, lang: () => "wo", write: (next) => (shop = next), onSaved: (e) => saved.push(e), onUndone: () => {} });
  return { desk, shop: () => shop };
}

describe("dette dictée pour un nouveau client", () => {
  it("crée « Fatou Ndiaye » au lieu d'écrire la dette sur Fatou Sow", () => {
    const { desk, shop } = setup(["Fatou Sow"]);
    const r = desk.handle({ name: "enregistrer", args: { type: "debt_add", clientName: "Fatou Ndiaye", montantDit: "ñeenti junni", heard: "Fatou Ndiaye dafa jël bor ñeenti junni" } }) as Record<string, unknown>;
    expect(r.statut).toBe("enregistre");
    expect(r.nouveau_client).toBe("Fatou Ndiaye");
    expect(r.montant_francs).toBe(20000);
    expect(shop().clients.find((c) => c.name === "Fatou Ndiaye")?.debt).toBe(20000);
    expect(shop().clients.find((c) => c.name === "Fatou Sow")?.debt).toBe(0);
  });

  it("un client déjà dans le cahier n'est pas recréé", () => {
    const { desk, shop } = setup(["Fatou Ndiaye"]);
    const r = desk.handle({ name: "enregistrer", args: { type: "debt_add", clientName: "Faatu Njaay", montantDit: "ñetti junni", heard: "Faatu Njaay bor na ñetti junni" } }) as Record<string, unknown>;
    expect(r.nouveau_client).toBeUndefined();
    expect(shop().clients).toHaveLength(1);
    expect(shop().clients[0].debt).toBe(15000);
  });
});

describe("famille au même nom (Cissé) : trier sans se tromper", () => {
  it("« Anta Cissé » est une nouvelle personne, pas « lequel des deux ? »", () => {
    const { desk, shop } = setup(["Fallou Cissé", "Diop Cissé"]);
    const r = desk.handle({ name: "enregistrer", args: { type: "debt_add", clientName: "Anta Cissé", montantDit: "ñetti junni", heard: "Anta Cissé bor na ñetti junni" } }) as Record<string, unknown>;
    expect(r.statut).toBe("enregistre");
    expect(r.nouveau_client).toBe("Anta Cissé");
    expect(shop().clients).toHaveLength(3);
    expect(shop().clients.find((c) => c.name === "Anta Cissé")?.debt).toBe(15000);
    expect(shop().clients.find((c) => c.name === "Fallou Cissé")?.debt).toBe(0);
    expect(shop().clients.find((c) => c.name === "Diop Cissé")?.debt).toBe(0);
  });

  it("« Cissé » tout seul reste ambigu : Jokko demande lequel", () => {
    const { desk, shop } = setup(["Fallou Cissé", "Diop Cissé"]);
    const r = desk.handle({ name: "enregistrer", args: { type: "debt_add", clientName: "Cissé", montantDit: "ñetti junni", heard: "Cissé bor na ñetti junni" } }) as Record<string, unknown>;
    expect(r.statut).toBe("incomplet");
    expect(String(r.besoin)).toContain("Fallou Cissé");
    expect(String(r.besoin)).toContain("Diop Cissé");
    expect(shop().clients).toHaveLength(2);
  });

  it("« Diop Cissé » retrouve bien le Diop existant, sans doublon", () => {
    const { desk, shop } = setup(["Fallou Cissé", "Diop Cissé"]);
    const r = desk.handle({ name: "enregistrer", args: { type: "debt_add", clientName: "Diop Cissé", montantDit: "ñetti junni", heard: "Diop Cissé bor na ñetti junni" } }) as Record<string, unknown>;
    expect(r.statut).toBe("enregistre");
    expect(r.nouveau_client).toBeUndefined();
    expect(shop().clients).toHaveLength(2);
    expect(shop().clients.find((c) => c.name === "Diop Cissé")?.debt).toBe(15000);
    expect(shop().clients.find((c) => c.name === "Fallou Cissé")?.debt).toBe(0);
  });
});

describe("numéro du nouveau client, dicté à Jokko", () => {
  it("reconnaît les numéros sénégalais, refuse le reste", async () => {
    const { senegalPhone } = await import("./liveDesk");
    expect(senegalPhone("77 567 47 25")).toEqual({ digits: "775674725", shown: "77 567 47 25" });
    expect(senegalPhone("+221 78 123 45 67")?.digits).toBe("781234567");
    expect(senegalPhone("00221 33 821 00 00")?.digits).toBe("338210000");
    expect(senegalPhone("12 34")).toBeNull();
    expect(senegalPhone("99 123 45 67")).toBeNull();
  });

  it("dette puis numéro : la fiche de Fatou Ndiaye a son téléphone", () => {
    const { desk, shop } = setup(["Fatou Sow"]);
    const r1 = desk.handle({ name: "enregistrer", args: { type: "debt_add", clientName: "Fatou Ndiaye", montantDit: "ñeenti junni", heard: "Fatou Ndiaye bor na ñeenti junni" } }) as Record<string, unknown>;
    expect(String(r1.consigne_client)).toContain("Numéro telefoonam");
    const r2 = desk.handle({ name: "numero_client", args: { clientName: "Faatu Njaay", numero: "77 567 47 25", heard: "juróom-ñaar juróom-ñaar…" } }) as Record<string, unknown>;
    expect(r2.statut).toBe("enregistre");
    expect(r2.numero_affiche).toBe("77 567 47 25");
    expect(shop().clients.find((c) => c.name === "Fatou Ndiaye")?.phone).toBe("775674725");
    expect(shop().clients.find((c) => c.name === "Fatou Sow")?.phone).toBe("");
  });

  it("numéro faux : rien n'est enregistré", () => {
    const { desk, shop } = setup(["Awa Fall"]);
    const r = desk.handle({ name: "numero_client", args: { clientName: "Awa Fall", numero: "12 34" } }) as Record<string, unknown>;
    expect(r.statut).toBe("incomplet");
    expect(shop().clients[0].phone).toBe("");
  });

  it("le garde-fou de l'argent laisse passer le numéro répété par Jokko", async () => {
    const { AmountLedger, wrongAmounts } = await import("./wolofNumbers");
    const tool = new AmountLedger();
    tool.addFrom({ statut: "enregistre", numero_affiche: "77 567 47 25" });
    expect(wrongAmounts("Bind naa ko. 77 567 47 25.", tool.values())).toEqual([]);
  });
});

describe("dette d'un client qui doit déjà : ajouter ou total ?", () => {
  function withDebt() {
    const s = setup(["Fatou Ndiaye"]);
    s.desk.handle({ name: "enregistrer", args: { type: "debt_add", clientName: "Fatou Ndiaye", modeDette: "ajout", montantDit: "ñeenti junni", heard: "Fatou Ndiaye jël na bor ñeenti junni" } });
    expect(s.shop().clients[0].debt).toBe(20000);
    return s;
  }

  it("« Fatou Ndiaye me doit 15 000 » : Jokko demande, n'écrit rien", () => {
    const { desk, shop } = withDebt();
    const r = desk.handle({ name: "enregistrer", args: { type: "debt_add", clientName: "Fatou Ndiaye", montantDit: "15 000", heard: "Fatou Ndiaye me doit 15 000 francs" } }) as Record<string, unknown>;
    expect(r.statut).toBe("ajout_ou_total");
    expect(r.avant_wolof).toBe("ñeenti junni");
    expect(r.ajout_wolof).toBe("ñetti junni");
    expect(shop().clients[0].debt).toBe(20000);
  });

  it("« ajoute » : 20 000 + 15 000 = 35 000, et Jokko dit la dette totale", () => {
    const { desk, shop } = withDebt();
    const r = desk.handle({ name: "enregistrer", args: { type: "debt_add", clientName: "Fatou Ndiaye", modeDette: "ajout", montantDit: "ñetti junni", heard: "yokkal ñetti junni" } }) as Record<string, unknown>;
    expect(r.montant_francs).toBe(15000);
    expect(r.dette_totale).toBe(35000);
    expect(r.dette_totale_en_wolof).toBe("juróom-ñaari junni");
    expect(shop().clients[0].debt).toBe(35000);
  });

  it("« en tout » : la dette devient 15 000", () => {
    const { desk, shop } = withDebt();
    const r = desk.handle({ name: "enregistrer", args: { type: "debt_add", clientName: "Fatou Ndiaye", modeDette: "total", montantDit: "15 000", heard: "Fatou Ndiaye me doit 15 000 en tout" } }) as Record<string, unknown>;
    expect(r.dette_totale).toBe(15000);
    expect(shop().clients[0].debt).toBe(15000);
  });
});

describe("réparations à la voix (outil reparation)", () => {
  it("dépôt → réparé → rendu, bénéfice calculé par le code", () => {
    let shop: Shop = {
      ...seedShop(),
      clients: [],
      products: [{ id: "ecran", name: "Écran iPhone 11", unit: "pièce", stock: 2, min: 1, price: 30000, cost: 15000 }],
    };
    const desk = new LiveDesk({ getShop: () => shop, lang: () => "wo", write: (next) => (shop = next), onSaved: () => {}, onUndone: () => {} });
    const d = desk.handle({ name: "reparation", args: { action: "deposer", clientName: "Awa Diop", telephone: "77 123 45 67", appareil: "iPhone 11", panne: "écran cassé", prixDit: "juróomi junni", avanceDit: "benn junni" } }) as Record<string, unknown>;
    expect(d.ticket).toBe("R-001");
    expect(d.reste).toEqual({ francs: 20000, wolof: "ñeenti junni" });
    const r = desk.handle({ name: "reparation", args: { action: "reparee", ticket: "R-001", pieces: ["écran iPhone 11"] } }) as Record<string, unknown>;
    expect(r.benefice).toEqual({ francs: 10000, wolof: "ñaari junni" });
    expect(shop.products[0].stock).toBe(1);
    const g = desk.handle({ name: "reparation", args: { action: "rendre", ticket: "Awa", montantDit: "ñeenti junni" } }) as Record<string, unknown>;
    expect(g.statut).toBe("enregistre");
    expect(g.reste_en_dette).toBeNull();
    expect(shop.repairs?.[0].status).toBe("rendu");
  });
});
