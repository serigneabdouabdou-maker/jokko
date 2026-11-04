/**
 * Examen de wolof de Jokko : la partie que le code de Jokko vérifie lui-même (montants, articles),
 * sur des phrases réelles du comptoir. Le score est affiché à chaque passage de la CI.
 * Le test échoue si le score passe sous le seuil (wolofExamen.json) : une modification ne peut pas faire reculer le wolof.
 */
import { describe, expect, it } from "vitest";
import examen from "./wolofExamen.json";
import { extractSpokenAmount, spokenAmountToFrancs } from "./wolofNumbers";
import { pickByName } from "./wolofNames";
import { sameSound } from "./wolofSpelling";

type Echec = { dit: string; attendu: unknown; obtenu: unknown };

function argent(): Echec[] {
  const ko: Echec[] = [];
  for (const q of examen.argent) {
    const got = extractSpokenAmount(q.dit) ?? spokenAmountToFrancs(q.dit);
    if (got?.francs !== q.francs) ko.push({ dit: q.dit, attendu: q.francs, obtenu: got?.francs ?? null });
  }
  return ko;
}

function pasArgent(): Echec[] {
  const ko: Echec[] = [];
  for (const q of examen.pas_argent) {
    const got = extractSpokenAmount(q.dit);
    if (got) ko.push({ dit: q.dit, attendu: "aucun montant", obtenu: got.francs });
  }
  return ko;
}

function articles(): Echec[] {
  const items = examen.articles.boutique.map((name, i) => ({ id: String(i), name }));
  const ko: Echec[] = [];
  for (const q of examen.articles.phrases) {
    const r = pickByName(items, q.dit);
    const got = r.item?.name ?? (r.ambiguous.length ? `? ${r.ambiguous.map((x) => x.name).join(" / ")}` : null);
    if (got !== q.article) ko.push({ dit: q.dit, attendu: q.article, obtenu: got });
  }
  return ko;
}

function ecritures(): Echec[] {
  const ko: Echec[] = [];
  for (const [a, b] of examen.ecritures.pareils) if (!sameSound(a, b)) ko.push({ dit: `${a} / ${b}`, attendu: "pareil", obtenu: "différent" });
  for (const [a, b] of examen.ecritures.differents) if (sameSound(a, b)) ko.push({ dit: `${a} / ${b}`, attendu: "différent", obtenu: "pareil" });
  return ko;
}

describe("examen de wolof", () => {
  it("score au-dessus du seuil", () => {
    const parts = { argent: [argent(), examen.argent.length], "pas d'argent": [pasArgent(), examen.pas_argent.length], articles: [articles(), examen.articles.phrases.length], écritures: [ecritures(), examen.ecritures.pareils.length + examen.ecritures.differents.length] } as const;
    let total = 0, ok = 0;
    const lignes: string[] = [];
    for (const [nom, [ko, n]] of Object.entries(parts)) {
      total += n; ok += n - ko.length;
      lignes.push(`${nom} : ${n - ko.length}/${n}`);
      for (const e of ko) lignes.push(`  ✗ « ${e.dit} » attendu ${JSON.stringify(e.attendu)}, obtenu ${JSON.stringify(e.obtenu)}`);
    }
    const score = ok / total;
    console.log(`Examen de wolof : ${(score * 100).toFixed(1)} % (${ok}/${total})\n${lignes.join("\n")}`);
    expect(score).toBeGreaterThanOrEqual(examen.seuil);
  });
});
