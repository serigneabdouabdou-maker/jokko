/**
 * Écrans qui vont ensemble, d'après le fournisseur (22/11/2026, règle de Fallou : « chaque fois que je lui dis
 * "List", il me donne les écrans qui vont avec »).
 *
 * Seule source : une demande du patron (« List ke5 », « Liste échange BG6? », ou le modèle puis « List ») suivie
 * de la réponse du fournisseur faite seulement de modèles (« Ke5 / X657 / S16 / P36 », un par ligne, ou plusieurs
 * par ligne « Pop9 KL4 »). Tout autre message qui ressemble à une liste (commande, stock) est ignoré.
 * Le modèle demandé entre dans le groupe. Une nouvelle liste du même groupe remplace l'ancienne (le 16/11/2026 la
 * liste du BF6 n'a plus l'A05s : l'ancienne du 27/07 ne compte plus). Ce que le patron marque « ne va pas »
 * gagne toujours (`Supplier.compatNo`). Jamais de chaîne : seulement les groupes qui contiennent le modèle cherché.
 */
import type { SupplierCompat } from "../model.ts";

const MODEL = /^(?:(?:infinix|tecno|itel|samsung|galaxy|redmi|xiaomi|oppo|realme|huawei|honor|spark|camon|pop|hot|smart|note|moto|iphone)\s*)*[a-z]{0,6}\s?\d{1,4}[a-z0-9+]{0,4}(?:\s?(?:pro|plus|lite|go|core|s|i|c|max|5g|4g))*$/i;
const NOT_MODEL = /^(lcd|ecran|écran|plaque|plaquette|dos|batterie|prix|total|incel+|oled|copie|original)\b/i;
const MEDIA = /^<.*omis>$|^$|^‎/;

/** « Spark 7 » → « spark7 », « Infinix smart 7 » → « smart7 », « Bg6m » → « bg6m » : la clé d'un modèle. */
export const modelKey = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/(infinix|tecno|itel|samsung|galaxy|xiaomi)\s*/g, "").replace(/[^a-z0-9+]/g, "");

function cleanModel(raw: string): string | null {
  const t = raw.trim().replace(/^[-•*]\s*/, "").replace(/[?!.]+$/, "").trim();
  if (!t || t.length > 22 || NOT_MODEL.test(t) || !MODEL.test(t) || !/[a-z]/i.test(t) || !/\d/.test(t)) return null;
  return t;
}

/** Une ligne de modèles : « Smart 7 » (un seul), ou « Pop9 KL4 » / « Spark30c KL5 » (deux). */
function lineModels(line: string): string[] | null {
  const one = cleanModel(line);
  if (one) return [one];
  const out: string[] = [];
  let wait = "";
  for (const tok of line.trim().split(/[\s,|/]+/).filter(Boolean)) {
    const t = wait ? `${wait} ${tok}` : tok;
    const m = cleanModel(t);
    if (m) { out.push(m); wait = ""; }
    else if (!/\d/.test(tok) && tok.length <= 8) wait = t; // « Spark » attend son numéro
    else return null;
  }
  return out.length && !wait ? out : null;
}

/** Réponse faite seulement de modèles (au moins 2). */
function answerModels(text: string): string[] | null {
  if (/total|=|\bfr\b|\d\s*f\b|\d{4,}\s*$/im.test(text) && !/^\s*[a-z]/i.test(text)) return null;
  const lines = text.split(/\n/).map((x) => x.trim()).filter(Boolean);
  if (lines.length > 25) return null;
  const models: string[] = [];
  for (const l of lines) {
    const m = lineModels(l);
    if (!m) return null;
    models.push(...m);
  }
  return models.length >= 2 ? models : null;
}

const REQUEST = /\blist(e|es)?\b/i;
/** Le modèle demandé : « List ke5 » → ke5, « Liste échange BG6? » → BG6, « Diokhma liste spark 8c » → spark 8c. */
function askedIn(text: string): string | null {
  const rest = text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(REQUEST, " ").replace(/(^|\s)(echange|diokhma|dioxma|bi|ci|lane|la|nak)(?=\s|$|\?)/gi, " ").replace(/[?!.]/g, " ").split(/\n/).map((x) => x.trim()).filter(Boolean);
  for (const r of rest) { const m = cleanModel(r); if (m) return m; }
  return null;
}

export type CompatAnswer = { date: string; asked?: string; models: string[] };

/** Les réponses du fournisseur aux demandes « List … » du patron, dans l'ordre. */
export function compatGroups(messages: Array<{ date: string; who: string; text: string }>, supplier: string): CompatAnswer[] {
  const out: CompatAnswer[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!;
    if (m.who === supplier || !REQUEST.test(m.text) || m.text.length > 60) continue;
    let asked = askedIn(m.text);
    // « Ki5k » puis « List » : le modèle est dans le message juste avant (même personne).
    for (let b = i - 1; !asked && b >= Math.max(0, i - 4); b--) {
      const p = messages[b]!;
      if (p.who !== m.who) break;
      if (MEDIA.test(p.text.trim())) continue;
      asked = cleanModel(p.text) ?? null;
      break;
    }
    // La première réponse écrite du fournisseur dans les 7 jours, avant une autre demande.
    for (let a = i + 1; a < messages.length; a++) {
      const r = messages[a]!;
      if ((Date.parse(r.date) - Date.parse(m.date)) / 86_400_000 > 7) break;
      if (r.who !== supplier) { if (REQUEST.test(r.text) && r.text.length <= 60) break; continue; }
      if (MEDIA.test(r.text.trim())) continue;
      const models = answerModels(r.text);
      if (models) {
        if (asked && !models.some((x) => modelKey(x) === modelKey(asked!))) models.push(asked);
        out.push({ date: r.date, ...(asked ? { asked } : {}), models });
      }
      break;
    }
  }
  return out;
}

const keysOf = (models: string[]) => [...new Set(models.map(modelKey))];

/**
 * Regroupe : même groupe (même liste, ou ≥ 60 % des modèles en commun) = un seul groupe, compté n fois ;
 * la liste la plus récente remplace l'ancienne (un modèle enlevé par le fournisseur disparaît).
 */
export function mergeCompat(old: SupplierCompat[], groups: CompatAnswer[], replace: boolean): SupplierCompat[] {
  // Les anciens groupes (lus avant la règle « List », 22/11/2026) ne sont jamais repris.
  const list: SupplierCompat[] = replace ? [] : old.filter((g) => g.from === "liste").map((g) => ({ ...g, models: [...g.models] }));
  for (const g of [...groups].sort((a, b) => a.date.localeCompare(b.date))) {
    const keys = keysOf(g.models);
    if (keys.length < 2) continue;
    const same = list.find((x) => {
      const xk = keysOf(x.models);
      const common = xk.filter((k) => keys.includes(k)).length;
      return common >= 0.6 * Math.min(xk.length, keys.length) && common >= 2;
    });
    const models = [...new Map(g.models.map((x) => [modelKey(x), x])).values()];
    if (!same) { list.push({ models, n: 1, last: g.date, from: "liste" }); continue; }
    same.n += 1;
    if (g.date >= same.last) { same.models = models; same.last = g.date; }
  }
  return list.sort((a, b) => b.last.localeCompare(a.last)).slice(0, 120);
}

export type CompatHit = { model: string; key: string; n: number; last: string };

const pair = (a: string, b: string) => [modelKey(a), modelKey(b)].sort().join("|");

/** Les modèles qui vont avec celui cherché, d'après le fournisseur, sans ceux que le patron a marqués « ne va pas ». */
export function compatFor(groups: SupplierCompat[], query: string, no: string[] = []): CompatHit[] {
  const q = modelKey(query);
  if (q.length < 2) return [];
  const banned = new Set(no);
  const hits = new Map<string, CompatHit>();
  for (const g of groups) {
    if (g.from !== "liste") continue;
    const keys = g.models.map(modelKey);
    if (!keys.includes(q)) continue;
    g.models.forEach((m, i) => {
      const k = keys[i]!;
      if (k === q || banned.has(pair(q, k))) return;
      const h = hits.get(k) ?? { model: m, key: k, n: 0, last: g.last };
      h.n += g.n;
      if (g.last > h.last) h.last = g.last;
      hits.set(k, h);
    });
  }
  return [...hits.values()].sort((a, b) => b.n - a.n || a.model.localeCompare(b.model));
}

/** « A05s ne va pas avec BF6 » : la paire est écartée, et aussi avec chaque modèle du groupe du BF6. */
export function markNotCompat(groups: SupplierCompat[], no: string[], query: string, model: string): string[] {
  const out = new Set(no);
  out.add(pair(query, model));
  for (const g of groups) {
    if (g.from !== "liste") continue;
    const keys = g.models.map(modelKey);
    if (!keys.includes(modelKey(query))) continue;
    for (const k of keys) if (k !== modelKey(model)) out.add(pair(k, model));
  }
  return [...out].slice(-300);
}

/** Est-ce que le patron a dit que ces deux modèles ne vont pas ensemble ? */
export const notCompat = (no: string[] | undefined, a: string, b: string) => Boolean(no?.includes(pair(a, b)));

/**
 * Le patron touche « ✕ ne va pas » (22/11/2026, constat de Fallou : « l'A05s n'a rien à voir avec le BF6 ») :
 * la paire est écartée des listes du fournisseur (`compatNo`, gardé même si la discussion est relue), et le modèle
 * est enlevé des « autres noms » des écrans de cette famille (et inversement) : la recherche ne le montre plus.
 */
export function unlinkModel<S extends { products: Array<{ name: string; aliases?: string[] }>; suppliers?: Array<{ compat?: SupplierCompat[]; compatNo?: string[] }> }>(shop: S, query: string, model: string): S {
  const q = modelKey(query);
  const m = modelKey(model);
  if (!q || !m || q === m) return shop;
  const groups = (shop.suppliers ?? []).flatMap((x) => x.compat ?? []);
  const nameKeys = (name: string) => (name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z]*\s?\d+[a-z0-9+]*/g) ?? []).map(modelKey);
  const family = new Set([q, ...compatFor(groups, query).map((h) => h.key)]);
  for (const p of shop.products) if (nameKeys(p.name).includes(q)) for (const a of p.aliases ?? []) if (modelKey(a) !== m) family.add(modelKey(a));
  const products = shop.products.map((p) => {
    if (!p.aliases?.length) return p;
    const own = nameKeys(p.name);
    const inFamily = own.some((k) => family.has(k)) || p.aliases.some((a) => modelKey(a) === q);
    const isModel = own.includes(m);
    const aliases = p.aliases.filter((a) => !(inFamily && modelKey(a) === m) && !(isModel && family.has(modelKey(a))));
    return aliases.length === p.aliases.length ? p : { ...p, aliases };
  });
  const suppliers = shop.suppliers?.map((x, i) => (x.compat?.length || i === 0 ? { ...x, compatNo: markNotCompat(groups, x.compatNo ?? [], query, model).concat([...family].filter((k) => k !== q).map((k) => [k, m].sort().join("|"))).filter((v, j, all) => all.indexOf(v) === j).slice(-300) } : x));
  return { ...shop, products, ...(suppliers ? { suppliers } : {}) };
}
