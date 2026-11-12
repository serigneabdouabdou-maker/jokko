import { describe, expect, it } from "vitest";
import { growth, shopStatus } from "./admin";

const now = Date.parse("2026-10-31T12:00:00Z");
const ago = (d: number) => new Date(now - d * 86_400_000).toISOString();

describe("console CFC", () => {
  it("statut d'une boutique selon sa dernière vente", () => {
    expect(shopStatus({ last_sale_at: ago(1), created_at: ago(40) }, now)).toBe("active");
    expect(shopStatus({ last_sale_at: ago(7), created_at: ago(40) }, now)).toBe("calme");
    expect(shopStatus({ last_sale_at: ago(30), created_at: ago(40) }, now)).toBe("endormie");
    expect(shopStatus({ last_sale_at: null, created_at: ago(2) }, now)).toBe("nouvelle");
    expect(shopStatus({ last_sale_at: null, created_at: ago(20) }, now)).toBe("endormie");
  });
  it("évolution du chiffre", () => {
    expect(growth(15000, 10000)).toBe(50);
    expect(growth(5000, 10000)).toBe(-50);
    expect(growth(5000, 0)).toBeNull();
  });
});

describe("relances d'essai", () => {
  it("met le numéro au format international", async () => {
    const { intlPhone } = await import("./guard");
    expect(intlPhone("77 567 47 25")).toBe("221775674725");
    expect(intlPhone("221775674725")).toBe("221775674725");
    expect(intlPhone("123")).toBeNull();
  });
  it("prépare un message WhatsApp avec ses vraies ventes", async () => {
    const { relanceMessage } = await import("./guard");
    const m = relanceMessage({ nom: "Boutique Awa", raison: "fini", ventes: 12 });
    expect(m).toContain("Ton essai gratuit de Jokko est terminé");
    expect(m).toContain("12 ventes");
  });
  it("un inscrit sans vente reçoit une proposition d'aide, pas une offre payante", async () => {
    const { relanceMessage } = await import("./guard");
    const m = relanceMessage({ nom: "Boutique Awa", raison: "demarrage", ventes: 0 });
    expect(m).toContain("Bienvenue");
    expect(m).not.toContain("4 000 F");
  });
});
