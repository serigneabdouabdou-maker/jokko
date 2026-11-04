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
