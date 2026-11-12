import { describe, expect, it } from "vitest";
import { shopContext } from "./fixtures.ts";
import { liveConfig } from "./live.ts";
import { instructionFor } from "./interpret.ts";
import { buildPrompt } from "./prompt.ts";
import { METIERS } from "../../src/data/metiers.ts";
import { foreignArticle } from "../../src/data/metierWords.ts";

/** Mots des vivres qui ne doivent jamais apparaître dans les consignes d'un autre métier (« bidon » reste : c'est une unité du lexique). */
const FOOD = /\b(riz|ceeb|diw|diwlin|huile|sucre|suukar|meew|saabu|savons?)\b/i;
const VIVRES = ["alimentation", "restauration"];

describe("un métier = ses mots dans les consignes de Gemini", () => {
  // Boutique sans articles : on regarde seulement les consignes et les outils, pas le stock du commerçant.
  const ctx = (activity: string) => ({ ...shopContext, products: [], activity });

  it.each(METIERS.filter((m) => !VIVRES.includes(m.id)).map((m) => m.label))("%s : ni riz, ni huile, ni sucre (direct, vocal, écrit)", (label: string) => {
    // La boulangerie achète du sucre (ingrédient) : seul ce mot lui est permis.
    const food = /Boulangerie/.test(label) ? new RegExp(FOOD.source.replace("|sucre", ""), "i") : FOOD;
    const config = liveConfig(ctx(label));
    const live = `${String(config.systemInstruction)}\n${JSON.stringify(config.tools)}`;
    expect(live).not.toMatch(food);
    expect(live).toContain("RESTE DANS LE MÉTIER");
    const written = `${instructionFor(ctx(label))}\n${buildPrompt("bonjour", ctx(label))}`;
    expect(written).not.toMatch(food);
    expect(written).toContain("RESTE DANS LE MÉTIER");
  });

  it("tailleur : les exemples parlent de bazin, de fil et de boutons", () => {
    const instruction = String(liveConfig(ctx("Couture, tailleur")).systemInstruction);
    expect(instruction).toContain("jaay naa ñaari bobine fil");
    expect(instruction).toContain("bazin : 12 mètres");
  });

  it("alimentation et restaurant gardent le vocabulaire des vivres", () => {
    for (const id of VIVRES) {
      const label = METIERS.find((m) => m.id === id)!.label;
      expect(String(liveConfig(ctx(label)).systemInstruction)).toMatch(/ceeb = riz/);
    }
  });

  it("couper la parole : Jokko s'arrête et reprend le fil", () => {
    const config = liveConfig(shopContext);
    expect(String(config.realtimeInputConfig?.activityHandling)).toMatch(/START_OF_ACTIVITY_INTERRUPTS/);
    expect(String(config.systemInstruction)).toContain("SI LE COMMERÇANT TE COUPE LA PAROLE");
  });

  it("article d'un autre métier, absent du stock", () => {
    expect(foreignArticle("2 sacs de riz", "Couture, tailleur")).toBe("alimentation");
    expect(foreignArticle("ciment", "Pharmacie, dépôt de médicaments")).toBe("quincaillerie");
    expect(foreignArticle("paracétamol", "Quincaillerie, matériaux")).toBe("pharmacie");
    expect(foreignArticle("riz", "Alimentation générale, boutique de quartier")).toBeNull();
    expect(foreignArticle("ceebu jën", "Restaurant, dibiterie, fast-food, jus")).toBeNull();
    expect(foreignArticle("farine", "Boulangerie, pâtisserie")).toBeNull();
    expect(foreignArticle("huile de coco", "Vêtements, tissus, chaussures")).toBeNull();
    expect(foreignArticle("fil", "Couture, tailleur")).toBeNull();
    expect(foreignArticle("riz", "Autre activité")).toBeNull();
    // Module « vivres » ajouté par le patron : le riz est chez lui.
    expect(foreignArticle("riz", "Multiservice (impression, photocopie, transfert d'argent)", ["vivres"])).toBeNull();
  });
});
