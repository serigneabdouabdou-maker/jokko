import { describe, expect, it } from "vitest";
import { type Shop, cashSourceSaid, expectedCash, seedShop } from "../model";
import type { DraftAction } from "./client";
import { type Entry, LiveDesk } from "./liveDesk";
import { needsSource, settleItems } from "./batch";
import { zReport } from "../data/tickets";

const blank: DraftAction = { type: "expense", productId: null, productName: null, quantity: null, amount: null, clientId: null, clientName: null, label: null };

function setup() {
  let shop: Shop = { ...seedShop(), expenses: [], sales: [], openingCash: 50000 };
  const saved: Entry[] = [];
  const desk = new LiveDesk({ getShop: () => shop, lang: () => "fr", write: (n) => { shop = n; }, onSaved: (e) => saved.push(e), onUndone: () => {} });
  return { desk, shop: () => shop };
}

describe("sorties d'argent : d'où vient l'argent (16/11/2026)", () => {
  it("lit « payé par Wave », « avec le tiroir », « par OM »", () => {
    expect(cashSourceSaid("loyer 50 000 payé par Wave")).toBe("wave");
    expect(cashSourceSaid("transport 25 000 avec l'argent du tiroir")).toBe("tiroir");
    expect(cashSourceSaid("électricité 30 000 par OM")).toBe("om");
    expect(cashSourceSaid("fournisseur payé par un agent")).toBe("autre");
    expect(cashSourceSaid("loyer 50 000")).toBeUndefined();
  });

  it("petite dépense : sort du tiroir sans question", () => {
    const { desk, shop } = setup();
    const r = desk.record({ ...blank, amount: 5000, label: "transport" }, "dépense 5 000 transport");
    expect(r.ok).toBe(true);
    expect(expectedCash(shop())).toBe(45000);
  });

  it("grosse dépense sans dire d'où vient l'argent : Jokko demande, rien n'est enregistré", () => {
    const { desk, shop } = setup();
    const r = desk.record({ ...blank, amount: 50000, label: "loyer" }, "dépense 50 000 loyer");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.question?.sorte).toBe("paye_avec");
    expect(shop().expenses).toHaveLength(0);
  });

  it("grosse dépense payée par Wave : notée comme justificatif, la caisse ne bouge pas", () => {
    const { desk, shop } = setup();
    const r = desk.record({ ...blank, amount: 50000, label: "loyer" }, "dépense 50 000 loyer payé par Wave");
    expect(r.ok).toBe(true);
    expect(shop().expenses[0]).toMatchObject({ amount: 50000, paidWith: "wave" });
    expect(expectedCash(shop())).toBe(50000);
    expect(zReport(shop()).expenses).toBe(0);
  });

  it("grosse dépense avec le tiroir (réponse à la question) : la caisse baisse", () => {
    const { desk, shop } = setup();
    expect(desk.record({ ...blank, amount: 30000, label: "loyer", paidWith: "tiroir" }, "loyer 30 000").ok).toBe(true);
    expect(expectedCash(shop())).toBe(20000);
  });

  it("ticket Z : une perte ne sort pas d'espèces", () => {
    const shop: Shop = { ...seedShop(), sales: [], expenses: [{ id: "e1", at: new Date().toISOString(), label: "Perte riz", amount: 8000, kind: "perte" }] };
    expect(zReport(shop).expenses).toBe(0);
  });

  it("carte de plusieurs opérations : une grosse dépense sans source bloque l'enregistrement", () => {
    const items = settleItems([
      { line: "Loyer 60 000", action: { ...blank, amount: 60000, label: "Loyer" } },
      { line: "Électricité 25 000 payé par Wave", action: { ...blank, amount: 25000, label: "Électricité" } },
    ]).map((i) => ({ ...i, keep: true }));
    expect(needsSource(items[0]!)).toBe(true);
    expect(items[1]!.action.paidWith).toBe("wave");
    expect(needsSource(items[1]!)).toBe(false);
  });
});
