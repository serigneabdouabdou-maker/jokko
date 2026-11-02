import { describe, expect, it } from "vitest";
import { extractSpokenAmount, francsToWolof, readWolofNumber, spokenAmountToFrancs, wolofNumber } from "./wolofNumbers";

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

describe("garde-fou : trouver le montant dans la phrase entière", () => {
  it("1 500 F se dit ñetti téeméer", () => {
    expect(francsToWolof(1500)).toBe("ñetti téeméer");
    expect(spokenAmountToFrancs("ñetti téeméer")!.francs).toBe(1500);
  });
  it("montant wolof dans une phrase", () => {
    expect(extractSpokenAmount("jaay naa ñaari junni")!.francs).toBe(10000);
    expect(extractSpokenAmount("dama fey transport juróomi téeméer")!.francs).toBe(2500);
    expect(extractSpokenAmount("Moussa fey na benn junni ak juróomi téeméer")!.francs).toBe(7500);
    expect(extractSpokenAmount("vente bi ñaari mil")!.francs).toBe(2000);
  });
  it("chiffres dans une phrase", () => {
    expect(extractSpokenAmount("ajoute une vente de 15 000")!.francs).toBe(15000);
    expect(extractSpokenAmount("transport 2500 F")!.francs).toBe(2500);
  });
  it("une quantité n'est pas de l'argent", () => {
    expect(extractSpokenAmount("jaay naa ñaari bidon diw")).toBeNull();
    expect(extractSpokenAmount("jaay naa 2 sac ceeb")).toBeNull();
    expect(extractSpokenAmount("ceeb bi ñaata la des")).toBeNull();
  });
  it("quantité et montant ensemble : le montant gagne", () => {
    expect(extractSpokenAmount("jaay naa ñaari bidon diw ñetti junni")!.francs).toBe(15000);
  });
});

describe("quantités en wolof", () => {
  it("3 = ñett (jamais « ñaar ak benn »), 12 = fukk ak ñaar", () => {
    expect(wolofNumber(3)).toBe("ñett");
    expect(wolofNumber(12)).toBe("fukk ak ñaar");
    expect(wolofNumber(7)).toBe("juróom-ñaar");
    expect(wolofNumber(40)).toBe("ñeent-fukk");
  });
});

describe("livre de phrases verrouillé", () => {
  it("seules les phrases validées par un locuteur natif vont dans les consignes de Jokko", async () => {
    const { WOLOF_PHRASES, phrasebookInstruction } = await import("./wolofPhrases");
    const consignes = phrasebookInstruction();
    for (const p of WOLOF_PHRASES) expect(consignes.includes(`« ${p.wo} »`)).toBe(p.statut === "valide");
    expect(WOLOF_PHRASES.find((p) => p.situation === "faire répéter")!.wo).toBe("Baal ma, waxaat ko.");
  });
});

describe("tous les montants, aller-retour", () => {
  it("chaque montant de 5 F à 999 995 F se dit en wolof et se relit au franc près", async () => {
    const { francsToWolof, spokenAmountToFrancs } = await import("./wolofNumbers");
    const faux: string[] = [];
    for (let f = 5; f < 1_000_000; f += 5) {
      const w = francsToWolof(f);
      if (spokenAmountToFrancs(w)?.francs !== f && faux.length < 5) faux.push(`${f} → ${w}`);
    }
    expect(faux).toEqual([]);
  }, 60_000);

  it("45 250 F = juróom-ñeenti junni ak juróom-fukk (9 050 dërëm)", async () => {
    const { francsToWolof } = await import("./wolofNumbers");
    expect(francsToWolof(45250)).toBe("juróom-ñeenti junni ak juróom-fukk");
  });
});

describe("millions en francs", () => {
  it("benn milyoŋ = 1 000 000 F, et l'aller-retour marche pour les grands montants", async () => {
    const { francsToWolof, spokenAmountToFrancs } = await import("./wolofNumbers");
    for (const f of [1_000_000, 1_000_005, 1_500_000, 2_045_250, 10_000_000, 12_345_675, 999_999_995, 1_000_000_000, 2_750_000_000]) {
      expect(spokenAmountToFrancs(francsToWolof(f))?.francs).toBe(f);
    }
  });
});

describe("garde-fou des chiffres", () => {
  it("trouve tous les montants d'une phrase, en wolof ou en francs, mais pas les quantités", async () => {
    const { moneyAmountsSaid } = await import("./wolofNumbers");
    expect(moneyAmountsSaid("Moussa Diop dafa la bor ñeenti junni.")).toEqual([20000]);
    expect(moneyAmountsSaid("Moussa dafa la bor ñeenti junni, Fatou juróom-benn junni ak juróom-ñeenti téeméer.")).toEqual([20000, 34500]);
    expect(moneyAmountsSaid("Bind naa ko : ñaari bidon diw, ñetti junni.")).toEqual([15000]);
    expect(moneyAmountsSaid("C'est noté : 2 bidons d'huile, 15 000 F.")).toEqual([15000]);
    expect(moneyAmountsSaid("Ceeb bi, fukk ak ñaar la des.")).toEqual([]);
    expect(moneyAmountsSaid("benn milyoŋ")).toEqual([1_000_000]);
  });

  it("bloque un montant inventé (« juróom-ñeenti junni » au lieu de « ñeenti junni »)", async () => {
    const { AmountLedger } = await import("./wolofNumbers");
    const ledger = new AmountLedger();
    ledger.addFrom({ clients: [{ name: "Moussa Diop", debt: 20000 }], figures: { daySales: 46500 } });
    expect(ledger.unknownIn("Moussa Diop dafa la bor ñeenti junni.")).toEqual([]);
    expect(ledger.unknownIn("Moussa Diop dafa la bor juróom-ñeenti junni.")).toEqual([45000]);
    expect(ledger.unknownIn("Tey, jaay nga juróom-ñeenti junni ak ñetti téeméer.")).toEqual([]);
    ledger.addFrom({ resultat_francs: 28500, en_wolof: "juróomi junni ak juróom-ñaari téeméer" });
    expect(ledger.unknownIn("Ñoom ñaar, juróomi junni ak juróom-ñaari téeméer la.")).toEqual([]);
  });
});
