/**
 * Examen de wolof de Jokko : la partie que le code de Jokko vérifie lui-même (montants, articles),
 * sur des phrases réelles du comptoir. Le score est affiché à chaque passage de la CI.
 * Le test échoue si le score passe sous le seuil (wolofExamen.json) : une modification ne peut pas faire reculer le wolof.
 */
import { describe, expect, it } from "vitest";
import examen from "./wolofExamen.json";
import { extractSpokenAmount, francsToWolof, moneyAmountsSaid, spokenAmountToFrancs, wrongAmounts } from "./wolofNumbers";
import { nameClash, pickByName } from "./wolofNames";
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

function clients(): Echec[] {
  const items = examen.clients.cahier.map((name, i) => ({ id: String(i), name }));
  const ko: Echec[] = [];
  for (const q of examen.clients.phrases) {
    const r = pickByName(items, q.dit);
    const got = r.item?.name ?? (r.ambiguous.length ? `? ${r.ambiguous.map((x) => x.name).join(" / ")}` : null);
    if (got !== q.client) ko.push({ dit: q.dit, attendu: q.client, obtenu: got });
  }
  return ko;
}

function dire(): Echec[] {
  const ko: Echec[] = [];
  for (const q of examen.dire.montants) {
    const w = francsToWolof(q.francs);
    if (w !== q.wolof) ko.push({ dit: `${q.francs} F`, attendu: q.wolof, obtenu: w });
    const back = spokenAmountToFrancs(q.wolof)?.francs;
    if (back !== q.francs) ko.push({ dit: q.wolof, attendu: q.francs, obtenu: back ?? null });
  }
  for (const q of examen.dire.garde_fou) {
    const bloque = wrongAmounts(q.jokko, moneyAmountsSaid(q.question)).length > 0;
    if (bloque !== q.bloque) ko.push({ dit: `${q.question} → ${q.jokko}`, attendu: q.bloque ? "bloqué" : "accepté", obtenu: bloque ? "bloqué" : "accepté" });
  }
  return ko;
}

/** Balayage : chaque montant de 5 F à 1 milliard, dit en wolof par le code, redonne le même montant. */
function balayage(): [Echec[], number] {
  const ko: Echec[] = [];
  let n = 0;
  for (let f = 5; f <= 1_000_000_000; f += f < 100_000 ? 5 : f < 1_000_000 ? 2_500 : f < 100_000_000 ? 250_000 : 50_000_000) {
    n++;
    const back = spokenAmountToFrancs(francsToWolof(f))?.francs;
    if (back !== f && ko.length < 5) ko.push({ dit: `${f} F → ${francsToWolof(f)}`, attendu: f, obtenu: back ?? null });
  }
  return [ko, n];
}

function nouveauxClients(): Echec[] {
  const items = examen.nouveaux_clients.cahier.map((name, i) => ({ id: String(i), name }));
  const ko: Echec[] = [];
  for (const q of examen.nouveaux_clients.phrases) {
    const r = pickByName(items, q.dit);
    const item = r.item && !nameClash(r.item.name, q.dit) ? r.item : undefined;
    const nouveau = !item && !r.ambiguous.length;
    if (nouveau !== q.nouveau || (!q.nouveau && item?.name !== q.client)) ko.push({ dit: q.dit, attendu: q.nouveau ? "nouveau client" : q.client, obtenu: nouveau ? "nouveau client" : item?.name ?? "?" });
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
    const parts = { argent: [argent(), examen.argent.length], "pas d'argent": [pasArgent(), examen.pas_argent.length], articles: [articles(), examen.articles.phrases.length], clients: [clients(), examen.clients.phrases.length], "nouveaux clients": [nouveauxClients(), examen.nouveaux_clients.phrases.length], "Jokko dit le montant": [dire(), examen.dire.montants.length * 2 + examen.dire.garde_fou.length], écritures: [ecritures(), examen.ecritures.pareils.length + examen.ecritures.differents.length] } as const;
    let total = 0, ok = 0;
    const lignes: string[] = [];
    for (const [nom, [ko, n]] of Object.entries(parts)) {
      total += n; ok += n - ko.length;
      lignes.push(`${nom} : ${n - ko.length}/${n}`);
      for (const e of ko) lignes.push(`  ✗ « ${e.dit} » attendu ${JSON.stringify(e.attendu)}, obtenu ${JSON.stringify(e.obtenu)}`);
    }
    const [sweep, swept] = balayage();
    lignes.push(`balayage 5 F → 1 milliard : ${swept - sweep.length}/${swept}`);
    for (const e of sweep) lignes.push(`  ✗ ${e.dit} relu ${JSON.stringify(e.obtenu)}`);
    expect(sweep).toEqual([]);
    const score = ok / total;
    console.log(`Examen de wolof : ${(score * 100).toFixed(1)} % (${ok}/${total})\n${lignes.join("\n")}`);
    expect(score).toBeGreaterThanOrEqual(examen.seuil);
  });
});
