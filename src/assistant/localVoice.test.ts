import { describe, expect, it } from "vitest";
import { type Shop, newShop } from "../model";
import { type Entry, LiveDesk } from "./liveDesk";
import { planLocal, replyFor, answerPending, type LocalPlan } from "./localVoice";
import { addRepair } from "../data/repairs";

function base(): Shop {
  const s: Shop = {
    ...newShop("Atelier Mbacké", "reparation"),
    products: [
      { id: "bf6", name: "Écran Tecno BF6", unit: "pièce", stock: 2, min: 0, price: 10000, cost: 3700 },
      { id: "bat", name: "Batterie BF6", unit: "pièce", stock: 3, min: 0, price: 3000, cost: 1500 },
      { id: "ki5k", name: "Écran Tecno KI5K", unit: "pièce", stock: 0, min: 0, price: 10000, cost: 3800 },
      { id: "chg", name: "Chargeur", unit: "pièce", stock: 5, min: 0, price: 3000, cost: 1500 },
    ],
    clients: [{ id: "c1", name: "Awa Ndiaye", phone: "", debt: 5000 }],
    services: [{ id: "s1", name: "Décodage", price: 5000 }],
  };
  return addRepair(s, { clientName: "Moussa", phone: "", device: "Tecno BF6", problem: "Écran cassé · Écran Tecno BF6", price: 10000, advance: 0 }).shop;
}

function setup(start = base()) {
  let shop = start;
  const saved: Entry[] = [];
  const desk = new LiveDesk({ getShop: () => shop, lang: () => "fr", write: (next) => { shop = next; }, onSaved: (e) => saved.push(e), onUndone: () => undefined });
  const run = (text: string) => {
    const plan = planLocal(text, shop);
    if (!plan || plan.kind !== "call") return { plan, reply: null };
    const res = desk.handle({ id: `c${saved.length}`, ...plan.call });
    return { plan, res, reply: replyFor(res, plan) };
  };
  return { desk, saved, shop: () => shop, run };
}

const kind = (p: LocalPlan | null) => (p ? (p.kind === "call" ? `${p.kind}:${p.call.name}:${String(p.call.args?.type ?? p.call.args?.action ?? "")}` : p.kind) : "ia");

describe("Jokko comprend sans IA", () => {
  it("vente d'une pièce : stock, prix d'achat, bénéfice", () => {
    const t = setup();
    const { reply } = t.run("J'ai vendu un écran BF6 à 10 000 francs");
    expect(reply?.ok).toBe(true);
    const sale = t.shop().sales[0]!;
    expect(sale).toMatchObject({ productId: "bf6", amount: 10000, cost: 3700 });
    expect(t.shop().products.find((p) => p.id === "bf6")!.stock).toBe(1);
  });

  it("le client ne paie pas : vente à crédit, nouveau client, dette", () => {
    const t = setup();
    const { reply } = t.run("Ibrahima Fall a pris un chargeur à 3000, il n'a pas payé");
    expect(reply?.ok).toBe(true);
    expect(t.shop().sales[0]).toMatchObject({ payment: "credit", amount: 3000 });
    expect(t.shop().clients.find((c) => c.name === "Ibrahima Fall")!.debt).toBe(3000);
    expect(reply!.text).toMatch(/Nouveau client : Ibrahima Fall/);
  });

  it("dette remboursée, dette ajoutée (Jokko demande ajout ou total)", () => {
    const t = setup();
    expect(t.run("Awa a payé 2000").reply?.ok).toBe(true);
    expect(t.shop().clients[0]!.debt).toBe(3000);
    const r = t.run("Awa me doit 4000");
    expect(r.reply?.pending).toBe("ajout_ou_total");
    const again = answerPending("ajoute", { call: (r.plan as Extract<LocalPlan, { kind: "call" }>).call, sorte: "ajout_ou_total", at: Date.now() })!;
    t.desk.handle({ id: "x", ...again });
    expect(t.shop().clients[0]!.debt).toBe(7000);
  });

  it("dépense, grosse dépense : d'où vient l'argent", () => {
    const t = setup();
    expect(t.run("Transport 2000").reply?.ok).toBe(true);
    expect(t.shop().expenses[0]).toMatchObject({ label: "Transport", amount: 2000 });
    const big = t.run("J'ai payé le loyer 50 000");
    expect(big.reply?.pending).toBe("paye_avec");
    const again = answerPending("par Wave", { call: (big.plan as Extract<LocalPlan, { kind: "call" }>).call, sorte: "paye_avec", at: Date.now() })!;
    t.desk.handle({ id: "y", ...again });
    expect(t.shop().expenses[0]).toMatchObject({ label: "Loyer", amount: 50000, paidWith: "wave" });
  });

  it("service du catalogue, achat de pièces", () => {
    const t = setup();
    expect(t.run("Décodage 5000").reply?.ok).toBe(true);
    expect(t.shop().sales[0]!.label).toMatch(/Décodage/);
    expect(t.run("J'ai acheté 4 écrans KI5K à 3800 chacun").reply?.ok).toBe(true);
    expect(t.shop().products.find((p) => p.id === "ki5k")!.stock).toBe(4);
  });

  it("réparation : réparé (pièce du dépôt), rendu payé par Wave", () => {
    const t = setup();
    expect(t.run("R-001 réparé").reply?.text).toMatch(/R-001 réparé avec Écran Tecno BF6/);
    const r = t.run("R1 rendu, il a payé 10 000 par Wave");
    expect(r.reply?.ok).toBe(true);
    expect(t.shop().repairs![0]!.status).toBe("rendu");
    expect(t.shop().sales[0]!.payment).toBe("wave");
  });

  it("comptage du stock à la voix, sans IA", () => {
    const t = setup();
    const p = planLocal("Comptage : BF6 quatre, KI5K deux", t.shop());
    expect(p).toMatchObject({ kind: "count", counts: { bf6: 4, ki5k: 2 } });
    expect(planLocal("BF6 4, KI5K 2", t.shop())).toMatchObject({ kind: "count" });
  });

  it("client perdu et prix négocié", () => {
    const t = setup();
    const lost = planLocal("Un client est parti, BF6, trop cher, il voulait 7000", t.shop());
    expect(lost).toMatchObject({ kind: "lost", quote: { model: "BF6", reason: "cher", wanted: 7000, outcome: "perdu" } });
    expect((lost as Extract<LocalPlan, { kind: "lost" }>).text).toMatch(/tu pouvais le garder/);
    const nego = planLocal("Le client a négocié l'écran BF6 de 10 000 à 8000", t.shop());
    expect(nego).toMatchObject({ kind: "call", what: "prix négocié", quote: { offered: 10000, paid: 8000, outcome: "pris" } });
    expect(nego && nego.kind === "call" && nego.call.args?.montantDit).toBe("8000");
  });

  it("questions : dettes, caisse, prix (3 prix), stock, dépôt", () => {
    const s = base();
    expect(planLocal("Qui me doit de l'argent ?", s)).toMatchObject({ kind: "answer", text: expect.stringMatching(/Awa Ndiaye 5 000 F/) });
    expect(planLocal("Combien dans la caisse ?", s)).toMatchObject({ kind: "answer" });
    expect(planLocal("C'est combien l'écran BF6 ?", s)).toMatchObject({ kind: "answer", text: expect.stringMatching(/négocié .* jamais sous/) });
    expect(planLocal("Il reste combien de chargeurs ?", s)).toMatchObject({ kind: "answer", text: expect.stringMatching(/il en reste 5/) });
    expect(planLocal("Quels appareils sont au dépôt ?", s)).toMatchObject({ kind: "answer", text: expect.stringMatching(/R-001 Moussa/) });
  });

  it("annuler, et ce qui n'est pas sûr part à l'IA", () => {
    const t = setup();
    t.run("Chargeur 3000");
    expect(t.run("Annule").reply?.text).toMatch(/Annulé/);
    expect(kind(planLocal("Dépôt d'un iPhone 11 pour Fatou, écran cassé, 20 000", t.shop()))).not.toMatch(/call:enregistrer/);
    expect(planLocal("Comment va le marché aujourd'hui", t.shop())).toBeNull();
    expect(planLocal("Jënd naa ñaari bidon", t.shop())).toBeNull();
  });
});

describe("phrases du comptoir (dictées par le téléphone)", () => {
  const s = base();
  const cases: Array<[string, string]> = [
    ["Vente écran BF6 10000", "call:enregistrer:sale"],
    ["J'ai vendu 2 chargeurs à 3000 chacun", "call:enregistrer:sale"],
    ["Awa Ndiaye m'a remboursé 5000 francs", "call:enregistrer:debt_payment"],
    ["Dépense transport 1500 francs", "call:enregistrer:expense"],
    ["J'ai payé l'électricité 12 000", "call:enregistrer:expense"],
    ["R-001 réparé avec écran BF6", "call:reparation:reparee"],
    ["Ticket 1 acompte 5000", "call:reparation:payer"],
    ["Inventaire BF6 trois", "count"],
    ["Le client est parti, il trouvait l'écran BF6 trop cher", "lost"],
    ["Une dame voulait l'écran KI5K, je n'avais pas la pièce, elle est partie", "lost"],
    ["Combien je gagne aujourd'hui ?", "answer"],
    ["Ma bénéfice ce mois", "ia"],
    ["Awa jël na ceeb ñaari junni te fayul", "ia"],
    ["Il va revenir chercher son téléphone demain", "ia"],
  ];
  for (const [said, want] of cases) it(`« ${said} » → ${want}`, () => expect(kind(planLocal(said, s))).toBe(want));

  it("vente par Wave : le paiement est noté, pas dans le tiroir", () => {
    const t = setup();
    t.run("Vendu un chargeur 3000 par Wave");
    expect(t.shop().sales[0]).toMatchObject({ payment: "wave", amount: 3000 });
  });
  it("un vendeur ne voit pas le bénéfice", () => {
    expect(planLocal("Quel est le bénéfice aujourd'hui ?", base(), false)).toMatchObject({ kind: "answer", text: "Seul le patron voit le bénéfice." });
  });
});
