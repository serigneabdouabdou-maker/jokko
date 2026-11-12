import { describe, expect, it } from "vitest";
import { BargeIn, CallGate, isCalled, NoiseGate } from "./listenFilter.ts";

describe("mot d'appel Jokko", () => {
  it("reconnaît les façons d'écrire Jokko", () => {
    for (const t of ["Jokko, jaay naa 2 huile", "joko jaay naa", "Djoko ñaata la", "yoko caisse bi", "JOKKO !", "Ok Jokko"]) expect(isCalled(t)).toBe(true);
  });
  it("ignore les phrases sans Jokko", () => {
    for (const t of ["jaay naa 2 huile", "ok c'est bon", "donne-moi le coco", "Moussa dafa ñów", "ko ko"]) expect(isCalled(t)).toBe(false);
  });
  it("une phrase sans Jokko est ignorée, avec Jokko elle compte, puis 20 s de suite", () => {
    const g = new CallGate(true);
    g.heard("Moussa, indil ceeb bi", 1000);
    expect(g.addressed(1500)).toBe(false);
    g.endTurn();
    g.heard("Jokko, jaay naa ñaari", 10_000);
    g.heard(" bidon diw", 10_400);
    expect(g.addressed(10_500)).toBe(true);
    g.answered(12_000);
    g.endTurn();
    g.heard("ak benn suukar", 20_000);
    expect(g.addressed(20_100)).toBe(true);
    g.endTurn();
    g.heard("lan nga def", 40_000);
    expect(g.addressed(40_100)).toBe(false);
  });
  it("bouton maintenu : tout compte", () => {
    const g = new CallGate(true);
    g.hold(true);
    g.heard("jaay naa 2 huile", 1000);
    expect(g.addressed(1100)).toBe(true);
  });
  it("sans mot d'appel (réglage coupé), tout compte", () => {
    const g = new CallGate(false);
    g.heard("jaay naa 2 huile", 1000);
    expect(g.addressed(1100)).toBe(true);
  });
});

describe("filtre anti-bruit", () => {
  it("laisse passer la voix proche, pas le bruit de fond", () => {
    const gate = new NoiseGate();
    let t = 0;
    // 3 s de boutique bruyante (fond 0.02 avec variations)
    for (let i = 0; i < 75; i++) expect(gate.frame(0.02 + (i % 5) * 0.003, (t += 40))).not.toBe("send");
    // le commerçant parle près du téléphone
    expect(gate.frame(0.2, (t += 40))).toBe("send");
    expect(gate.frame(0.18, (t += 40))).toBe("send");
    // une voix plus loin, à peine au-dessus du fond
    const far = new NoiseGate();
    let u = 0;
    for (let i = 0; i < 75; i++) far.frame(0.02, (u += 40));
    expect(far.frame(0.035, (u += 40))).not.toBe("send");
  });
  it("après la phrase : un peu de silence, puis plus rien", () => {
    const gate = new NoiseGate();
    let t = 0;
    for (let i = 0; i < 25; i++) gate.frame(0.005, (t += 40));
    expect(gate.frame(0.3, (t += 40))).toBe("send");
    const after: string[] = [];
    for (let i = 0; i < 50; i++) after.push(gate.frame(0.005, (t += 40)));
    expect(after.slice(0, 10).every((d) => d === "send")).toBe(true);
    expect(after.includes("silence")).toBe(true);
    expect(after[after.length - 1]).toBe("skip");
  });
});

describe("couper la parole à Jokko", () => {
  it("une voix forte et proche qui dure coupe Jokko ; le bruit, l'écho et un « hum » court non", () => {
    const b = new BargeIn();
    const floor = 0.01;
    // Bruit de fond et écho du haut-parleur (faibles) : jamais.
    for (let i = 0; i < 50; i++) expect(b.frame(0.03, floor)).toBe(false);
    // Un « hum » de 3 trames (120 ms) : non.
    expect([0.2, 0.2, 0.2].map((x) => b.frame(x, floor)).some(Boolean)).toBe(false);
    b.reset();
    // Le commerçant parle (≈ 0,3 s de voix forte, avec un petit creux entre deux syllabes) : oui.
    const said = [0.2, 0.25, 0.18, 0.04, 0.22, 0.2, 0.21, 0.19, 0.2, 0.2].map((x) => b.frame(x, floor));
    expect(said.some(Boolean)).toBe(true);
  });

  it("boutique très bruyante : il faut parler plus fort", () => {
    const loud = new BargeIn(7, 0.08, 8);
    const floor = 0.02;
    expect(Array.from({ length: 20 }, () => loud.frame(0.12, floor)).some(Boolean)).toBe(false);
    expect(Array.from({ length: 20 }, () => loud.frame(0.25, floor)).some(Boolean)).toBe(true);
  });
});
