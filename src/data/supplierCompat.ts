/**
 * Écrans qui vont ensemble, d'après le fournisseur (22/11/2026, demande de Fallou : « je lui écris "Liste BF6" et il me
 * liste les écrans qui prennent : il faut repérer ça dans nos discussions, ce sont des écrans universels »).
 *
 * Dans la discussion WhatsApp : un message du fournisseur fait seulement de modèles (« Bf6 / Bf7 / Ki5k / A60 / X6516 »,
 * un par ligne, ou séparés par | , /) = un groupe d'écrans qui vont ensemble. « spark 7 : kf6 Kg6 » = un groupe
 * avec son nom. Chaque groupe garde combien de fois le fournisseur l'a dit et la dernière date : la recherche montre
 * « dit 4 fois par Bathie » (preuve forte) ou « dit 1 fois » (à vérifier). Jamais de chaîne : seulement les groupes
 * qui contiennent le modèle cherché.
 */
import type { SupplierCompat } from "../model.ts";

const MODEL = /^(?:(?:infinix|tecno|itel|samsung|galaxy|redmi|xiaomi|oppo|realme|huawei|honor|spark|camon|pop|hot|smart|note|moto|iphone)\s*)*[a-z]{0,6}\s?\d{1,4}[a-z0-9+]{0,4}(?:\s?(?:pro|plus|lite|go|core|s|i|c|max|5g|4g))*$/i;
const NOT_MODEL = /^(lcd|ecran|écran|plaque|plaquette|dos|batterie|prix|total|incel+|oled|copie|original)\b/i;

/** « Spark 7 » → « spark7 », « Bg6m » → « bg6m » : la clé d'un modèle. */
export const modelKey = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/(infinix|tecno|itel|samsung|galaxy|xiaomi)\s*/g, "").replace(/[^a-z0-9+]/g, "");

function cleanModel(raw: string): string | null {
  const t = raw.trim().replace(/^[-•*]\s*/, "").replace(/[?!.]+$/, "");
  if (!t || t.length > 22 || NOT_MODEL.test(t) || !MODEL.test(t) || !/[a-z]/i.test(t) || !/\d/.test(t)) return null;
  return t;
}

/** Les groupes « écrans qui vont ensemble » d'une liste de messages (seulement ceux du fournisseur). */
export function compatGroups(messages: Array<{ date: string; who: string; text: string }>, supplier: string): Array<{ date: string; models: string[] }> {
  const out: Array<{ date: string; models: string[] }> = [];
  for (const m of messages) {
    if (m.who !== supplier) continue;
    const text = m.text.trim();
    if (/total|=|\bfr\b|\d\s*f\b/i.test(text)) continue;
    // « spark 7 : kf6 Kg6 » / « spark 4: kc8 Kb8 … » : un groupe par nom, la suite jusqu'au prochain nom.
    if (/^[^:\n]{2,15}:/m.test(text)) {
      for (const block of text.split(/\n(?=[^:\n]{2,15}:)/)) {
        const [head, ...rest] = block.split(":");
        const models = [head!, ...rest.join(":").split(/[\s,|/]+/)].map(cleanModel).filter((x): x is string => Boolean(x));
        if (models.length >= 2) out.push({ date: m.date, models });
      }
      continue;
    }
    const parts = text.split(/\n|\||\/|,/).map((x) => x.trim()).filter(Boolean);
    if (parts.length < 2 || parts.length > 25) continue;
    const models = parts.map(cleanModel).filter((x): x is string => Boolean(x));
    if (models.length >= 2 && models.length >= 0.8 * parts.length) out.push({ date: m.date, models });
  }
  return out;
}

/** Regroupe : même ensemble de modèles = un groupe, compté autant de fois que dit. */
export function mergeCompat(old: SupplierCompat[], groups: Array<{ date: string; models: string[] }>, replace: boolean): SupplierCompat[] {
  const by = new Map<string, SupplierCompat>();
  const add = (models: string[], n: number, last: string) => {
    const uniq = [...new Map(models.map((x) => [modelKey(x), x])).entries()];
    if (uniq.length < 2) return;
    const key = uniq.map(([k]) => k).sort().join("|");
    const g = by.get(key);
    if (g) { g.n += n; if (last > g.last) g.last = last; }
    else by.set(key, { models: uniq.map(([, v]) => v), n, last });
  };
  if (!replace) for (const g of old) add(g.models, g.n, g.last);
  for (const g of groups) add(g.models, 1, g.date);
  return [...by.values()].sort((a, b) => b.n - a.n || b.last.localeCompare(a.last)).slice(0, 120);
}

export type CompatHit = { model: string; key: string; n: number; last: string };

/** Les modèles qui vont avec celui cherché, d'après le fournisseur (le plus souvent dit d'abord). */
export function compatFor(groups: SupplierCompat[], query: string): CompatHit[] {
  const q = modelKey(query);
  if (q.length < 2) return [];
  const hits = new Map<string, CompatHit>();
  for (const g of groups) {
    const keys = g.models.map(modelKey);
    if (!keys.includes(q)) continue;
    g.models.forEach((m, i) => {
      const k = keys[i]!;
      if (k === q) return;
      const h = hits.get(k) ?? { model: m, key: k, n: 0, last: g.last };
      h.n += g.n;
      if (g.last > h.last) h.last = g.last;
      hits.set(k, h);
    });
  }
  return [...hits.values()].sort((a, b) => b.n - a.n || a.model.localeCompare(b.model));
}
