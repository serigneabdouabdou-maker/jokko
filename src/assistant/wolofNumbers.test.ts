import { describe, expect, it } from "vitest";
import { francsToWolof, readWolofNumber, spokenAmountToFrancs } from "./wolofNumbers";

describe("lire les chiffres wolof", () => {
  it("nombres simples et composés", () => {
    expect(readWolofNumber("benn")).toBe(1);
    expect(readWolofNumber("juróom-benn")).toBe(6);
    expect(readWolofNumber("juroom naar")).toBe(7);
    expect(readWolofNumber("fukk ak juróom")).toBe(15);
    expect(readWolofNumber("ñaar-fukk")).toBe(20);
    expect(readWolofNumber("fanweer")).toBe(30);
    expect(readWolofNumber("juróom-fukk ak juróom")).toBe(55);
    expect(readWolofNumber("téeméer")).toBe(100);
    expect(readWolofNumber("ñaari téeméer ak juróom-fukk")).toBe(250);
    expect(readWolofNumber("junni")).toBe(1000);
    expect(readWolofNumber("ñaari junni")).toBe(2000);
    expect(readWolofNumber("fukk ak juróomi junni")).toBe(15000);
    expect(readWolofNumber("téeméeri junni")).toBe(100000);
    expect(readWolofNumber("transport")).toBeNull();
  });
});

describe("argent : dërëm par défaut en wolof", () => {
  it("ñaari junni = 10 000 F (pas 2 000)", () => {
    expect(spokenAmountToFrancs("ñaari junni")).toMatchObject({ francs: 10000, derem: 2000 });
    expect(spokenAmountToFrancs("nyaari juni")).toMatchObject({ francs: 10000 });
  });
  it("benn junni = 5 000 F, fukki junni = 50 000 F", () => {
    expect(spokenAmountToFrancs("benn junni")!.francs).toBe(5000);
    expect(spokenAmountToFrancs("fukki junni")!.francs).toBe(50000);
    expect(spokenAmountToFrancs("ñetti junni")!.francs).toBe(15000);
  });
  it("téeméer = 500 F, juróomi téeméer = 2 500 F", () => {
    expect(spokenAmountToFrancs("téeméer")!.francs).toBe(500);
    expect(spokenAmountToFrancs("juróomi téeméer")!.francs).toBe(2500);
    expect(spokenAmountToFrancs("benn junni ak juróomi téeméer")!.francs).toBe(7500);
  });
  it("chiffres et français restent en francs", () => {
    expect(spokenAmountToFrancs("10 000")!.francs).toBe(10000);
    expect(spokenAmountToFrancs("15 000 F")!.francs).toBe(15000);
    expect(spokenAmountToFrancs("ñaari mil")!.francs).toBe(2000);
    expect(spokenAmountToFrancs("fukki mil")!.francs).toBe(10000);
    expect(spokenAmountToFrancs("15k")!.francs).toBe(15000);
  });
  it("dërëm dit explicitement", () => {
    expect(spokenAmountToFrancs("téeméeri dërëm")!.francs).toBe(500);
    expect(spokenAmountToFrancs("100 dërëm")!.francs).toBe(500);
  });
});

describe("dire un montant en wolof", () => {
  it("10 000 F → ñaari junni", () => {
    expect(francsToWolof(10000)).toBe("ñaari junni");
    expect(francsToWolof(5000)).toBe("benn junni");
    expect(francsToWolof(15000)).toBe("ñetti junni");
    expect(francsToWolof(20000)).toBe("ñeenti junni");
    expect(francsToWolof(50000)).toBe("fukki junni");
    expect(francsToWolof(75000)).toBe("fukk ak juróomi junni");
    expect(francsToWolof(7500)).toBe("benn junni ak juróomi téeméer");
    expect(francsToWolof(500)).toBe("téeméer");
    expect(francsToWolof(250)).toBe("juróom-fukk");
    expect(francsToWolof(1000)).toBe("ñaari téeméer");
  });
  it("aller-retour : ce que Jokko dit, il le relit pareil", () => {
    for (const f of [500, 1000, 2500, 5000, 7500, 10000, 15000, 18000, 20000, 37500, 50000, 100000]) {
      expect(spokenAmountToFrancs(francsToWolof(f))!.francs).toBe(f);
    }
  });
});
