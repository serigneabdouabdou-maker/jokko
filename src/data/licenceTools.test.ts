import { describe, expect, it } from "vitest";
import { type Shop, newShop } from "@/model";
import { assignLicence, guessLicence, licenceStats, sellService, unsortedToolSales } from "./services";

const two = (): Shop => ({
  ...newShop("Atelier", "reparation"),
  licences: [
    { id: "chi", name: "Chimera", cost: 90000, months: 12, startAt: "2026-11-16" },
    { id: "unl", name: "Unlock tool", cost: 45000, months: 12, startAt: "2026-11-16" },
  ],
});

describe("décodage rangé dans la bonne licence (18/11/2026)", () => {
  it("l'outil nommé dans la phrase gagne ; sans nom avec deux licences = à ranger", () => {
    const s = two();
    expect(guessLicence(s, "Décodage", "décodage chimera 6000", "2026-11-18")).toBe("chi");
    expect(guessLicence(s, "Déblocage compte (FRP)", "frp avec unlock tool", "2026-11-18")).toBe("unl");
    expect(guessLicence(s, "Décodage", "décodage 5000", "2026-11-18")).toBeUndefined();
    expect(guessLicence(s, "Configuration", "configuration chimera", "2026-11-18")).toBeUndefined();
  });

  it("une seule licence : chaque décodage y va tout seul", () => {
    const s: Shop = { ...two(), licences: [two().licences![0]] };
    const done = sellService(s, { name: "Décodage", amount: 6000, at: "2026-11-18T10:00:00Z" })!;
    expect(done.sale.licenceId).toBe("chi");
    expect(sellService(s, { name: "Décodage", amount: 6000, licenceId: null })!.sale.licenceId).toBeUndefined();
  });

  it("anciens décodages à ranger, puis le mois de la licence", () => {
    let s = two();
    s = { ...s, sales: [
      { id: "a", at: "2026-11-11T12:00:00Z", label: "Décodage", amount: 6000 } as never,
      { id: "b", at: "2026-11-17T12:00:00Z", label: "Service · Décodage", amount: 6000 } as never,
      { id: "c", at: "2026-11-17T19:00:00Z", label: "Service · Configuration", amount: 1000 } as never,
      { id: "d", at: "2026-11-17T19:00:00Z", label: "Réparation R-001 · déblocage (avance)", amount: 3000 } as never,
    ] };
    expect(unsortedToolSales(s).map((x) => x.id)).toEqual(["a", "b"]);
    s = assignLicence(s, ["a", "b"], "chi");
    expect(unsortedToolSales(s)).toEqual([]);
    const st = licenceStats(s, s.licences![0], new Date("2026-11-18T12:00:00Z"));
    expect(st).toMatchObject({ monthUses: 2, monthEarned: 12000 });
    expect(st.monthCharge).toBeGreaterThan(0);
  });
});
