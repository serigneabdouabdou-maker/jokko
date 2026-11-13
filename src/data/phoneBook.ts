/**
 * Annuaire des téléphones, gratuit et sans compte : fichiers publics de l'appli (préparés par scripts/build-tac.ts).
 * - IMEI : les 8 premiers chiffres donnent le modèle (« Tecno Pop 7 (BF6) »), base publique non officielle.
 * - Mêmes téléphones, autres noms : « bf6 » = « Pop 7 », « bf7 » = « Spark Go 2023 » = « Pop 7 Pro ».
 * Rien ne quitte le téléphone : on télécharge un petit fichier, la recherche se fait sur place.
 */
import { modelKeys } from "./modelKeys.ts";

const base = () => (typeof import.meta !== "undefined" && import.meta.env?.BASE_URL) || "/";

export type Names = { same: Map<string, string[]>; label: Map<string, string> };
let groups: Promise<Names> | null = null;
const empty = (): Names => ({ same: new Map(), label: new Map() });

/** Groupes « même téléphone » : chaque clé → toutes les clés du même téléphone, et le nom lisible. */
export function sameNames(): Promise<Names> {
  groups ??= fetch(`${base()}data/modeles-v1.json`)
    .then((r) => (r.ok ? r.json() : []))
    .then((list: string[][]) => buildNames(list))
    .catch(() => {
      groups = null;
      return empty();
    });
  return groups;
}

/** list : [code, nom lisible, autres clés…]. */
export function buildNames(list: string[][]): Names {
  const n = empty();
  for (const [code, name, ...rest] of list) {
    if (!code || !name) continue;
    const g = [code, ...rest];
    for (const k of g) {
      n.same.set(k, [...new Set([...(n.same.get(k) ?? []), ...g])]);
      if (!n.label.has(k)) n.label.set(k, `${code.toUpperCase()} · ${name}`);
    }
  }
  return n;
}

/** Les clés demandées + les autres noms du même téléphone. */
export function expandKeys(keys: string[], names: Names): string[] {
  return [...new Set(keys.flatMap((k) => [k, ...(names.same.get(k) ?? [])]))];
}

/** Nom lisible d'une clé : « BF6 · Pop 7 », sinon le code en majuscules. */
export function nameOf(key: string, names: Names): string {
  return names.label.get(key) ?? (/\d/.test(key) && key.length <= 7 ? key.toUpperCase() : key.replace(/([a-z])(\d)/, "$1 $2").replace(/^./, (c) => c.toUpperCase()));
}

const shards = new Map<string, Promise<{ m: string[]; t: Record<string, number> } | null>>();

/** Modèle d'après les 8 premiers chiffres de l'IMEI, ou null s'il n'est pas dans la base publique. */
export async function modelOfTac(tac: string): Promise<{ label: string; keys: string[] } | null> {
  if (!/^\d{8}$/.test(tac)) return null;
  const k = tac.slice(0, 4);
  if (!shards.has(k)) {
    shards.set(
      k,
      fetch(`${base()}data/imei-v1/${k}.json`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => {
          shards.delete(k);
          return null;
        }),
    );
  }
  const shard = await shards.get(k)!;
  const i = shard?.t[tac.slice(4)];
  if (!shard || i === undefined) return null;
  const label = shard.m[i]!;
  return { label, keys: modelKeys(label) };
}
