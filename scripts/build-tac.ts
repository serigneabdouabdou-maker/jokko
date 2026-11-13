/**
 * Prépare la base des IMEI (8 premiers chiffres = modèle) pour la recherche de pièces.
 * Source : MoazEb/tac-database (licence MIT), base publique non officielle.
 * Usage : node --experimental-strip-types scripts/build-tac.ts <tac_full.csv> <dossier de sortie>
 * Sortie : <dossier>/tac/<4 premiers chiffres>.json  et  <dossier>/modeles-v1.json (mêmes téléphones, autres noms).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { modelKeys } from "../src/data/modelKeys.ts";

const [csvPath, outDir] = process.argv.slice(2);
if (!csvPath || !outDir) throw new Error("usage: build-tac.ts <csv> <out>");

const KEEP = new Set(["TECNO", "INFINIX", "ITEL", "SAMSUNG", "APPLE", "XIAOMI", "REDMI", "POCO", "OPPO", "REALME", "HUAWEI", "HONOR", "NOKIA", "VIVO", "MOTOROLA", "GOOGLE", "ONEPLUS"]);
const CODES = new Set(["TECNO", "ITEL", "INFINIX"]);

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.length > 1) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const title = (s: string) => s.toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (_, a, b) => a + b.toUpperCase()).replace(/\bIphone\b/g, "iPhone").replace(/\b(\d+)([a-z])\b/g, (m) => m.toUpperCase());

function describe(brand: string, specs: string): { label: string; code: string } | null {
  const parts = specs.split(",").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  const b = brand.toUpperCase();
  let name = parts[0]!.toUpperCase() === b && parts[1] ? parts[1]! : parts[0]!;
  if (!name.toUpperCase().startsWith(b)) name = `${b} ${name}`;
  let code = "";
  if (CODES.has(b) && parts[0]!.toUpperCase() !== b && parts[1]) {
    const last = parts[1]!.split(/\s+/).pop() ?? "";
    const raw = last.replace(/20[12]\d$/, "");
    if (/[a-z]/i.test(raw) && /\d/.test(raw) && raw.length <= 8) code = raw.toUpperCase();
  }
  // « Pop 8-Spark Go 2024 » : deux noms pour le même téléphone.
  const label = title(name.replace(/-(?=[A-Z])/g, " / "));
  return { label: code ? `${label} (${code})` : label, code };
}

const rows = parseCsv(readFileSync(csvPath, "utf8")).slice(1);
const shards = new Map<string, { m: string[]; idx: Map<string, number>; t: Record<string, number> }>();
const groups = new Map<string, Set<string>>();
const names = new Map<string, string>();
let kept = 0;
for (const [brand = "", tacRaw = "", specs = ""] of rows) {
  if (!KEEP.has(brand.toUpperCase())) continue;
  const tac = tacRaw.trim().padStart(8, "0");
  if (!/^\d{8}$/.test(tac)) continue;
  const d = describe(brand, specs);
  if (!d) continue;
  const shardKey = tac.slice(0, 4);
  let shard = shards.get(shardKey);
  if (!shard) shards.set(shardKey, (shard = { m: [], idx: new Map(), t: {} }));
  let i = shard.idx.get(d.label);
  if (i === undefined) { i = shard.m.length; shard.m.push(d.label); shard.idx.set(d.label, i); }
  shard.t[tac.slice(4)] = i;
  kept++;
  if (d.code) {
    const keys = new Set([...modelKeys(d.label), d.code.toLowerCase()]);
    const g = groups.get(d.code.toLowerCase()) ?? new Set<string>();
    keys.forEach((k) => g.add(k));
    groups.set(d.code.toLowerCase(), g);
    if (!names.has(d.code.toLowerCase())) names.set(d.code.toLowerCase(), d.label.replace(/\s*\([^)]*\)$/, "").replace(/^(Tecno|Itel|Infinix)\s+/i, ""));
  }
}
mkdirSync(join(outDir, "tac"), { recursive: true });
for (const [k, s] of shards) writeFileSync(join(outDir, "tac", `${k}.json`), JSON.stringify({ m: s.m, t: s.t }));
// Mêmes téléphones : code ↔ noms commerciaux (« bf6 » ↔ « pop7 »). Les noms partagés par plusieurs codes sont gardés :
// la recherche les montre tous (Pop 7 Pro = BF7, Pop 7 = BF6).
// Chaque groupe : [code, nom lisible, autres clés…] (« bf6 », « Pop 7 », « pop7 »).
const list = [...groups.entries()]
  .map(([code, keys]) => [code, names.get(code) ?? code.toUpperCase(), ...[...keys].filter((k) => k !== code).sort()])
  .filter((g) => g.length > 2)
  .sort((a, b) => a[0]!.localeCompare(b[0]!));
writeFileSync(join(outDir, "modeles-v1.json"), JSON.stringify(list));
console.log(`${kept} codes IMEI, ${shards.size} fichiers, ${list.length} groupes de noms`);
