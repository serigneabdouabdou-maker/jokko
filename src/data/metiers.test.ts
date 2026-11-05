import { describe, expect, it } from "vitest";
import { expiringSoon, METIERS, metierInstruction, metierOf } from "./metiers";

describe("métiers", () => {
  it("reconnaît le métier, même écrit à la main", () => {
    expect(metierOf("Réparation de téléphones et pièces détachées").id).toBe("reparation");
    expect(metierOf("réparateur portable").id).toBe("reparation");
    expect(metierOf("Pharmacie du marché").id).toBe("pharmacie");
    expect(metierOf("Alimentation").id).toBe("alimentation");
    expect(metierOf("photocopie et impression").id).toBe("multiservice");
    expect(metierOf("salon de coiffure").id).toBe("autre");
    expect(metierOf("").id).toBe("alimentation");
  });

  it("le réparateur a l'Atelier, la pharmacie les dates de péremption", () => {
    expect(metierOf("Réparation de téléphones et pièces détachées").atelier).toBe(true);
    expect(metierOf("Pharmacie").peremption).toBe(true);
    expect(metierOf("Pharmacie").atelier).toBe(false);
  });

  it("pharmacie : Gemini a l'interdiction de tout conseil de santé", () => {
    const text = metierInstruction("Pharmacie");
    expect(text).toMatch(/INTERDIT : tout conseil médical, posologie/);
    expect(metierInstruction("Alimentation")).toMatch(/ne donne jamais de conseil médical/);
  });

  it("articles qui périment dans les 30 jours, le plus urgent d'abord", () => {
    const now = new Date("2026-11-05T10:00:00").getTime();
    const list = expiringSoon(
      [
        { name: "Doliprane", stock: 4, expiresAt: "2026-11-20" },
        { name: "Amoxicilline", stock: 2, expiresAt: "2026-11-01" },
        { name: "Sirop", stock: 3, expiresAt: "2027-06-01" },
        { name: "Vide", stock: 0, expiresAt: "2026-11-10" },
      ],
      30,
      now,
    );
    expect(list.map((p) => p.name)).toEqual(["Amoxicilline", "Doliprane"]);
    expect(list[0].daysLeft).toBeLessThan(0);
  });
});

describe("mode strict : une boutique = un métier", () => {
  it("seule l'alimentation reçoit le vocabulaire des vivres", () => {
    expect(METIERS.filter((m) => m.vivres).map((m) => m.id)).toEqual(["alimentation"]);
  });

  it("les exemples d'une pharmacie ne parlent ni de riz ni d'huile", () => {
    const ex = JSON.stringify(metierOf("Pharmacie, dépôt de médicaments").ex);
    expect(ex).not.toMatch(/riz|huile|ceeb|diw|bidon|sac/i);
    expect(metierOf("pharmacie").units).not.toContain("sac");
  });

  it("chaque métier a ses exemples, et Gemini reçoit la règle du métier unique", () => {
    for (const m of METIERS) {
      expect(m.ex.prompts.length).toBeGreaterThanOrEqual(4);
      expect(m.ex.stock && m.ex.search && m.ex.invoice && m.ex.units).toBeTruthy();
    }
    expect(metierInstruction("pharmacie")).toContain("UN SEUL MÉTIER");
    expect(metierInstruction("pharmacie")).toContain("Pharmacie, dépôt de médicaments");
  });
});
