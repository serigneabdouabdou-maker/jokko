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
