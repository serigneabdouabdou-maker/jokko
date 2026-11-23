import { describe, expect, it } from "vitest";
import { type Shop, newShop } from "@/model";
import { addMmOp, closeMm, commissionFor, dayBounds, lastGaps, mmBalances, mmConf, mmFromText, mmSummary, mmWarning, needsFirstCount } from "./mobileMoney";
import { buildReport, periodOf } from "./report";
import { childRows, rowsToShop, shopRow } from "./sync";
import { planLocal } from "@/assistant/localVoice";

let k = 0;
const id = () => `mm-${++k}`;
const base = (): Shop => ({ ...newShop("Kiosque Awa", "multiservice"), mmConf: { operators: ["wave", "om"], rates: { wave: { depot: 0.5, retrait: 0.5, paiement: 0.3 }, om: { depot: 0.6, retrait: 0.6, paiement: 0 } }, low: { wave: 50000 } } });
const started = () => closeMm(base(), { especes: 200000, wave: 300000, om: 150000 }, id).shop;
const bal = (s: Shop) => Object.fromEntries(mmBalances(s).map((b) => [b.account, b.expected]));

describe("transfert d'argent : soldes", () => {
  it("premier comptage obligatoire, puis dépôt / retrait / paiement / recharge / versement", () => {
    expect(needsFirstCount(base())).toBe(true);
    let s = started();
    expect(needsFirstCount(s)).toBe(false);
    s = addMmOp(s, { operator: "wave", kind: "depot", amount: 25000 }, id);
    s = addMmOp(s, { operator: "om", kind: "retrait", amount: 10000, fee: 200 }, id);
    s = addMmOp(s, { operator: "wave", kind: "paiement", amount: 5000 }, id);
    s = addMmOp(s, { operator: "wave", kind: "recharge", amount: 100000 }, id);
    s = addMmOp(s, { operator: "om", kind: "recharge", amount: 50000, source: "autre" }, id);
    s = addMmOp(s, { operator: "om", kind: "versement", amount: 20000 }, id);
    s = addMmOp(s, { operator: "especes", kind: "sortie", amount: 15000 }, id);
    // espèces : 200 000 + 25 000 − 10 000 + 200 + 5 000 − 100 000 + 20 000 − 15 000
    expect(bal(s)).toEqual({ especes: 125200, wave: 370000, om: 190000 });
  });

  it("commission estimée avec les taux du contrat (arrondie à 5 F), tapée = gardée", () => {
    const conf = mmConf(base());
    expect(commissionFor(conf, "wave", "depot", 25000)).toBe(125);
    expect(commissionFor(conf, "om", "paiement", 5000)).toBe(0);
    let s = started();
    s = addMmOp(s, { operator: "wave", kind: "depot", amount: 25000 }, id);
    s = addMmOp(s, { operator: "om", kind: "retrait", amount: 10000, commission: 90, fee: 100 }, id);
    const b = dayBounds();
    const d = mmSummary(s, b.from, b.to);
    expect([d.count, d.depots, d.retraits, d.commissions, d.fees, d.gain]).toEqual([2, 25000, 10000, 215, 100, 315]);
    // Le gain du transfert entre dans les Bénéfices ; les montants transférés ne sont jamais des ventes.
    const r = buildReport(s, periodOf("jour"));
    expect([r.revenue, r.transfer, r.netProfit]).toEqual([0, 315, 315]);
  });

  it("clôture : écart compté − attendu, puis nouveau départ", () => {
    let s = addMmOp(started(), { operator: "wave", kind: "depot", amount: 25000 }, id);
    const r = closeMm(s, { especes: 220000, wave: 275000 }, id);
    expect(r.gaps.map((g) => [g.account, g.gap])).toEqual([["especes", -5000], ["wave", 0]]);
    s = r.shop;
    expect(bal(s).especes).toBe(220000);
    expect(lastGaps(s).find((g) => g.account === "especes")?.gap).toBe(-5000);
  });

  it("avertissements : pas assez d'espèces pour un retrait, pas assez de solde pour un dépôt", () => {
    const s = started();
    expect(mmWarning(s, "om", "retrait", 250000)).toMatch(/pas assez pour ce retrait/);
    expect(mmWarning(s, "om", "depot", 200000)).toMatch(/Recharge d'abord/);
    expect(mmWarning(s, "wave", "depot", 1000)).toBeNull();
  });

  it("gardé par la synchro (table mm_ops + réglages)", () => {
    const s = addMmOp(started(), { operator: "wave", kind: "depot", amount: 25000, client: "Moussa", phone: "77 123 45 67" }, id);
    const rows = childRows(s, "mm_ops");
    const back = rowsToShop({ shop: shopRow(s), products: [], clients: [], sales: [], expenses: [], invoices: [], reminders: [], shortcuts: [], mm_ops: rows });
    expect(back.mm?.find((o) => o.kind === "depot")).toMatchObject({ amount: 25000, client: "Moussa", phone: "771234567", commission: 125 });
    expect(back.mmConf?.rates?.wave?.depot).toBe(0.5);
  });
});

describe("transfert d'argent : à la voix, sans IA", () => {
  it("lit l'opération", () => {
    expect(mmFromText("Dépôt Wave 25 000 pour Moussa", 25000)).toMatchObject({ kind: "depot", operator: "wave", client: "Moussa" });
    expect(mmFromText("retrait Orange Money 10000", 10000)).toMatchObject({ kind: "retrait", operator: "om" });
    expect(mmFromText("paiement Woyofal 5000 par Wave", 5000)).toMatchObject({ kind: "paiement", operator: "wave" });
    expect(mmFromText("Dépôt d'un iPhone 11 pour Fatou", null)).toBeNull();
  });

  it("dans un multiservice : l'opération est préparée, le solde est donné, une vente reste une vente", () => {
    const s = started();
    expect(planLocal("Dépôt Wave 25 000 pour Moussa", s)).toMatchObject({ kind: "mm", op: { kind: "depot", operator: "wave", amount: 25000, client: "Moussa" } });
    expect(planLocal("Retrait OM 10 000", s)).toMatchObject({ kind: "mm", op: { kind: "retrait", operator: "om" } });
    expect(planLocal("Solde Wave ?", s)).toMatchObject({ kind: "answer", text: "Wave : 300 000 F." });
    expect(planLocal("Paiement Senelec 12 000", s)).toMatchObject({ kind: "ask" });
    const sale = planLocal("Vendu un chargeur 3000 par Wave", { ...s, products: [{ id: "c", name: "Chargeur", unit: "pièce", stock: 3, min: 0, price: 3000, cost: 1500 }] });
    expect(sale && sale.kind === "call" ? sale.call.args?.type : sale?.kind).toBe("sale");
    expect(planLocal("J'ai payé ma facture Senelec 12 000", s)).toMatchObject({ kind: "call", call: { args: { type: "expense" } } });
  });

  it("une boutique sans transfert n'est jamais touchée", () => {
    const shop = { ...newShop("Atelier", "reparation") };
    expect(planLocal("Dépôt Wave 25 000", shop)?.kind).not.toBe("mm");
  });
});
