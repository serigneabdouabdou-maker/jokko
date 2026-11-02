import { describe, expect, it } from "vitest";
import { activityNotice, activityTargets, basketOf } from "./activity";
import type { JournalRow } from "./journal";

const T0 = Date.parse("2026-11-02T10:00:00Z");
let next = 1;
function row(over: Partial<JournalRow> & { sec?: number }): JournalRow {
  const { sec = 0, ...rest } = over;
  return { id: next++, shop_id: "b1", at: new Date(T0 + sec * 1000).toISOString(), user_id: "vendeur", tbl: "sales", row_id: "x", action: "ajout", before: null, after: null, ...rest };
}
const sale = (sec: number, label: string, amount: number, payment = "especes", user = "vendeur") => row({ sec, user_id: user, after: { label, amount, payment } });

describe("notifications d'activité", () => {
  it("une vente seule : article, montant exact, paiement", () => {
    const r = sale(0, "2 sac Riz", 25000, "wave");
    const n = activityNotice(r, "Boutique Fallou", [r], "Awa");
    expect(n?.title).toBe("Vente · Boutique Fallou");
    expect(n?.body).toBe("2 sac Riz · 25 000 F · Wave · Awa");
  });

  it("un panier de plusieurs articles = UNE notification, envoyée par la dernière vente", () => {
    const rows = [sale(0, "2 sac Riz", 25000), sale(2, "1 bidon Huile", 12500), sale(3, "3 paquet Sucre", 2250)];
    expect(activityNotice(rows[0], "B", rows)).toBeNull();
    expect(activityNotice(rows[1], "B", rows)).toBeNull();
    const n = activityNotice(rows[2], "B", rows);
    expect(n?.title).toBe("Vente de 3 articles · B");
    expect(n?.body).toBe("Total 39 750 F · espèces\n2 sac Riz, 1 bidon Huile, 3 paquet Sucre");
  });

  it("deux ventes éloignées ne sont pas mélangées ; un autre vendeur non plus", () => {
    const a = sale(0, "Pain", 150);
    const b = sale(120, "Lait", 500);
    const c = sale(121, "Savon", 300, "especes", "autre");
    expect(basketOf(a, [a, b, c])).toEqual([a]);
    expect(basketOf(b, [a, b, c])).toEqual([b]);
    expect(activityNotice(b, "B", [a, b, c])?.body).toBe("Lait · 500 F · espèces");
  });

  it("dépense, perte, facture, dette payée", () => {
    expect(activityNotice(row({ tbl: "expenses", after: { label: "Transport", amount: 2000, kind: "depense" } }), "B")?.body).toBe("Transport · 2 000 F");
    expect(activityNotice(row({ tbl: "expenses", after: { label: "Perte Riz", amount: 5000, kind: "perte" } }), "B")?.title).toBe("Perte · B");
    expect(activityNotice(row({ tbl: "invoices", after: { number: "F-012", amount: 45250 } }), "B")?.body).toBe("Facture n° F-012 · 45 250 F");
    const paid = row({ tbl: "clients", action: "modification", before: { name: "Moussa Diop", debt: 20000 }, after: { name: "Moussa Diop", debt: 15000 } });
    expect(activityNotice(paid, "B")?.body).toBe("Moussa Diop a payé 5 000 F · reste 15 000 F");
    const more = row({ tbl: "clients", action: "modification", before: { debt: 0 }, after: { debt: 5000 } });
    expect(activityNotice(more, "B")).toBeNull();
  });

  it("destinataires : selon le choix du patron", () => {
    const patrons = [
      { user_id: "patron", pref: null },
      { user_id: "associe", pref: "aucune" as const },
      { user_id: "gerant", pref: "toutes" as const },
    ];
    expect(activityTargets(patrons, "vendeur")).toEqual(["patron", "gerant"]);
    // Le patron qui vend lui-même n'est pas prévenu (sauf s'il a choisi « toutes ») .
    expect(activityTargets(patrons, "patron")).toEqual(["gerant"]);
    expect(activityTargets(patrons, "gerant")).toEqual(["patron", "gerant"]);
  });
});
