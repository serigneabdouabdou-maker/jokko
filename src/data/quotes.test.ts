import { describe, expect, it } from "vitest";
import { type Shop, newShop } from "@/model";
import { quoteStats, recordQuote } from "./quotes";
import { commerceForAdvisor } from "./advisorContext";
import { buildAdvicePrompt, ADVICE_INSTRUCTION } from "../../server/assistant/prompt";
import { adviceSchema } from "../../server/assistant/schema";
import { shopRow } from "./sync";

const now = new Date("2026-11-22T12:00:00");
let n = 0;
const id = (p: string) => `${p}-${++n}`;
const base = (): Shop => ({
  ...newShop("Atelier Mbacké", "reparation"),
  products: [{ id: "bf6", name: "Écran Tecno BF6", unit: "pièce", stock: 2, min: 0, price: 10000, cost: 3700 }],
});

function withQuotes(): Shop {
  let s = base();
  const add = (q: Parameters<typeof recordQuote>[1], daysAgo = 1) => { s = recordQuote(s, q, id, new Date(now.getTime() - daysAgo * 86_400_000)); };
  add({ model: "bf6", items: ["Écran Tecno BF6"], offered: 10000, floor: 6500, outcome: "pris" });
  add({ model: "BF6", items: ["Écran Tecno BF6"], offered: 10000, floor: 6500, outcome: "perdu", reason: "cher", wanted: 8000, client: "771234567" });
  add({ model: "BF6", items: ["Écran Tecno BF6"], offered: 10000, floor: 6500, outcome: "perdu", reason: "cher", wanted: 5000 });
  add({ model: "A12", items: ["Écran A12"], offered: 12000, floor: 8000, outcome: "perdu", reason: "plus_tard" });
  add({ model: "A12", items: ["Écran A12"], offered: 12000, outcome: "pris" }, 45); // trop vieux : hors des 30 jours
  return s;
}

describe("clients perdus", () => {
  it("taux pris, raisons, écart, clients qui pouvaient être gardés au-dessus du minimum", () => {
    const st = quoteStats(withQuotes(), now);
    expect([st.given, st.won, st.lost, st.wonPct]).toEqual([4, 1, 3, 25]);
    expect(st.reasons[0]).toMatchObject({ reason: "cher", n: 2 });
    expect(st.gapAvg).toBe(3500); // (2 000 + 5 000) / 2
    expect([st.savable, st.savableAmount, st.belowFloor]).toEqual([1, 8000, 1]);
    expect(st.models[0]).toMatchObject({ model: "BF6", lost: 2, given: 3 });
  });

  it("gardé par la synchro, 300 au plus", () => {
    let s = base();
    for (let k = 0; k < 305; k++) s = recordQuote(s, { model: "BF6", items: [], offered: 10000, outcome: "pris" }, id, now);
    expect(s.quotes).toHaveLength(300);
    expect((shopRow(s).quotes as unknown[]).length).toBe(300);
  });

  it("le Conseiller reçoit tout le commerce, jamais le numéro du client", () => {
    const ctx = commerceForAdvisor(withQuotes(), "2 réparateurs à côté, écran BF6 à 7 000", now);
    const json = JSON.stringify(ctx);
    expect(json).not.toContain("771234567");
    expect(ctx.commerce.prix_donnes_30_jours).toMatchObject({ perdus_qui_pouvaient_etre_gardes_au_dessus_du_minimum: 1, argent_de_ces_clients: 8000 });
    expect(ctx.commerce.ce_que_dit_le_patron).toContain("7 000");
    expect(buildAdvicePrompt(ctx, "Que dire à un client qui trouve trop cher ?")).toContain("perdus_qui_voulaient_moins_que_le_minimum");
    expect(ADVICE_INSTRUCTION).toMatch(/JAMAIS un prix sous « prix_minimum »/);
    // Sans prix noté : le conseiller sait qu'il faut commencer à les noter.
    expect(commerceForAdvisor(base(), "", now).commerce.prix_donnes_30_jours).toMatch(/pas encore noté/);
  });

  it("réponse avec textes prêts acceptée, 3 au plus", () => {
    const ok = adviceSchema.safeParse({ resume: "R", actions: [], reponse: null, messages: [{ pour: "Statut WhatsApp", texte: "Écran changé en 1 h, garantie 30 jours." }] });
    expect(ok.success).toBe(true);
    expect(adviceSchema.safeParse({ resume: "R", actions: [], reponse: null }).success).toBe(true);
  });
});
