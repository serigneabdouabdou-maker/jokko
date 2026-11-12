import { describe, expect, it } from "vitest";
import type { Shop } from "../model";
import { firstSteps, stepsLeft } from "./firstSteps";

const shop = (activity: string, extra: Partial<Shop> = {}) => ({ activity, sales: [], products: [], clients: [], ...extra }) as unknown as Shop;

describe("premiers pas", () => {
  it("une boutique neuve a tout à faire, avec un exemple de son métier", () => {
    const steps = firstSteps(shop("Alimentation générale, boutique de quartier"), false);
    expect(steps.map((s) => s.id)).toEqual(["vente", "articles", "client", "rappel"]);
    expect(stepsLeft(steps)).toBe(4);
    expect(steps[0].hint).toContain("riz");
  });
  it("« Autre activité » commence par choisir son métier", () => {
    expect(firstSteps(shop("Autre activité"), false)[0].id).toBe("metier");
  });
  it("chaque geste se coche tout seul", () => {
    const s = shop("Pharmacie, dépôt de médicaments", {
      sales: [{ id: "v", at: "", label: "x", amount: 1 }],
      products: [{}, {}, {}] as Shop["products"],
      clients: [{ id: "c", name: "Awa", phone: "", debt: 0 }],
    });
    const steps = firstSteps(s, true);
    expect(stepsLeft(steps)).toBe(0);
  });
  it("le tailleur parle de commande, pas de vente, et une commande compte", () => {
    const s = shop("Couture, tailleur", { couture: [{}] as Shop["couture"] });
    const vente = firstSteps(s, false).find((x) => x.id === "vente")!;
    expect(vente.title).toContain("commande");
    expect(vente.done).toBe(true);
  });
});
