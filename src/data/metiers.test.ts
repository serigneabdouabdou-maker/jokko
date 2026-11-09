import { describe, expect, it } from "vitest";
import { expiringSoon, METIERS, metierInstruction, metierOf, modulesOf, screensOf, conseillerInstruction } from "./metiers";

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
    expect(metierInstruction("pharmacie")).toContain("MÉTIER PRINCIPAL");
    expect(metierInstruction("pharmacie")).toContain("Pharmacie, dépôt de médicaments");
  });
});

describe("appli hybride : modules par métier", () => {
  it("le tailleur a son métier, séparé des vendeurs de vêtements", () => {
    expect(metierOf("Tailleur").id).toBe("couture");
    expect(metierOf("atelier de couture").id).toBe("couture");
    expect(metierOf("vente de chaussures").id).toBe("vetements");
    expect([...modulesOf("Tailleur")]).toEqual(["couture"]);
  });
  it("chaque métier n'a que ses modules", () => {
    expect(modulesOf("Alimentation").has("couture")).toBe(false);
    expect(modulesOf("Alimentation").has("atelier")).toBe(false);
    expect(modulesOf("Alimentation").has("vivres")).toBe(true);
    expect(modulesOf("Pharmacie").has("peremption")).toBe(true);
    expect(modulesOf("Pharmacie").has("vivres")).toBe(false);
  });
  it("le patron ajoute un module d'un autre métier (boutique + transfert d'argent)", () => {
    const m = modulesOf("Alimentation", ["services", "inconnu"]);
    expect(m.has("services")).toBe(true);
    expect(m.has("inconnu" as never)).toBe(false);
    expect(metierInstruction("Alimentation", ["services"])).toContain("MODULE SERVICES");
    expect(metierInstruction("Alimentation")).not.toContain("MODULE SERVICES");
  });
});

describe("un métier = une appli : les écrans", () => {
  it("le tailleur n'a ni scanner, ni contrôle à distance, ni atelier de réparation", () => {
    const s = screensOf("Couture, tailleur");
    expect(s.has("couture")).toBe(true);
    expect(s.has("stock")).toBe(true);
    for (const x of ["scanner", "distance", "atelier", "boutiques", "conseiller"] as const) expect(s.has(x)).toBe(false);
  });
  it("l'alimentation n'a ni couture ni atelier", () => {
    const s = screensOf("Alimentation");
    expect(s.has("couture")).toBe(false);
    expect(s.has("atelier")).toBe(false);
    expect(s.has("scanner")).toBe(true);
  });
  it("un module ajouté apporte son écran", () => {
    expect(screensOf("Alimentation", ["couture"]).has("couture")).toBe(true);
  });
  it("chaque métier a sa liste d'écrans", () => {
    for (const m of METIERS) expect(Array.isArray(m.screens)).toBe(true);
  });
});

describe("Conseiller par métier", () => {
  it("pharmacie : rotation et péremption, jamais de conseil médical", () => {
    const c = conseillerInstruction("Pharmacie du marché");
    expect(c).toContain("rotation RAPIDE");
    expect(c).toContain("PÉREMPTION");
    expect(c).toContain("jamais de conseil médical");
    expect(screensOf("Pharmacie").has("conseiller")).toBe(true);
  });
});
