/**
 * Réseau Jokko des pièces (demande de Fallou, 13/11/2026) : une base commune à tous les réparateurs qui s'enrichit toute seule.
 * - Fournisseur : un écran universel et ses téléphones compatibles (« Kd7 | Cc6 | Cd7 ») → ces modèles ont le même écran.
 * - Pose : « Réparé » avec l'écran X sur un Tecno BF6 → le BF6 prend l'écran X (la preuve la plus forte).
 * - Atelier : le réparateur dit lui-même « le BF6 a le même écran que le BF7 ».
 * Aucune donnée de client ne part : seulement des modèles (« bf6 ») et le type de pièce.
 * Chaque lien montre combien d'ateliers l'ont confirmé : Jokko ne dit jamais « sûr » sans preuve.
 */
import type { Product, Repair, Shop } from "../model.ts";
import { kindOf, type PartKind } from "./pricing.ts";
import { modelKeys } from "./modelKeys.ts";
import { repairsOf } from "./repairs.ts";

export type CompatSource = "fournisseur" | "pose" | "atelier";
export type Family = { kind: Exclude<PartKind, "Autre">; source: CompatSource; models: string[] };

/** Les modèles sur lesquels va un article : son nom et ses « autres noms » (téléphones compatibles). */
export function productModels(p: Pick<Product, "name" | "aliases">): string[] {
  return [...new Set([p.name, ...(p.aliases ?? [])].flatMap(modelKeys))];
}

const partKind = (label: string): Exclude<PartKind, "Autre"> | null => {
  const k = kindOf(label);
  return k === "Autre" ? null : k;
};

/** Listes du fournisseur : chaque pièce qui va sur plusieurs modèles. */
export function supplierFamilies(products: Product[]): Family[] {
  const out: Family[] = [];
  for (const p of products) {
    if (!p.aliases?.length) continue;
    const kind = partKind(p.name);
    const models = productModels(p);
    if (kind && models.length >= 2) out.push({ kind, source: "fournisseur", models: models.slice(0, 30) });
  }
  return out;
}

/** Réparation faite : l'appareil prend chaque pièce posée (et donc tous les modèles de cette pièce). */
export function poseFamilies(shop: Pick<Shop, "products">, repair: Pick<Repair, "device" | "parts">): Family[] {
  const device = modelKeys(repair.device);
  if (!device.length) return [];
  const out: Family[] = [];
  for (const part of repair.parts) {
    const product = part.productId ? shop.products.find((p) => p.id === part.productId) : undefined;
    const kind = partKind(product?.name ?? part.label);
    if (!kind) continue;
    const models = [...new Set([...device, ...(product ? productModels(product) : modelKeys(part.label))])];
    if (models.length >= 2) out.push({ kind, source: "pose", models: models.slice(0, 30) });
  }
  return out;
}

const done = (r: Repair) => r.status === "repare" || r.status === "rendu";

/** Tout ce que la boutique sait déjà (premier envoi, puis une fois par jour) : fournisseur + réparations faites. */
export function shopFamilies(shop: Shop): Family[] {
  return [...supplierFamilies(shop.products), ...repairsOf(shop).filter(done).flatMap((r) => poseFamilies(shop, r))];
}

/** Ce qu'une écriture vient d'apprendre : réparations qui passent à « Réparé », pièces dont les compatibles changent. */
export function learnedBetween(before: Shop, after: Shop): Family[] {
  if (before.id !== after.id) return [];
  const old = new Map(repairsOf(before).map((r) => [r.id, r]));
  const poses = repairsOf(after)
    .filter((r) => done(r) && r.parts.length > (old.get(r.id)?.parts.length ?? 0))
    .flatMap((r) => poseFamilies(after, { device: r.device, parts: r.parts.slice(old.get(r.id)?.parts.length ?? 0) }));
  const oldAliases = new Map(before.products.map((p) => [p.id, (p.aliases ?? []).join("|")]));
  const changed = after.products.filter((p) => p.aliases?.length && oldAliases.get(p.id) !== p.aliases.join("|"));
  return [...poses, ...supplierFamilies(changed)];
}

/** Petite empreinte d'une liste (pour n'envoyer le tout qu'une fois tant que rien ne change). */
export function fingerprint(families: Family[]): string {
  const s = families.map((f) => `${f.kind}:${f.source}:${[...f.models].sort().join(",")}`).sort().join(";");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return `${families.length}-${(h >>> 0).toString(36)}`;
}

// ---------- Ce que le réseau répond ----------

export type NetLink = { model: string; other: string; kind: string; poses: number; fournisseurs: number; ateliers: number };
export type Evidence = { poses: number; fournisseurs: number; ateliers: number };

/** Confiance lisible : 🟢 posé par des ateliers, 🔵 liste d'un fournisseur, 🟡 dit par un atelier. */
export function evidenceText(e: Evidence): { level: "pose" | "fournisseur" | "atelier"; text: string } {
  if (e.poses > 0) return { level: "pose", text: `posé dans ${e.poses} atelier${e.poses > 1 ? "s" : ""}` };
  if (e.fournisseurs > 0) return { level: "fournisseur", text: `liste de ${e.fournisseurs} fournisseur${e.fournisseurs > 1 ? "s" : ""}` };
  return { level: "atelier", text: `dit par ${e.ateliers} atelier${e.ateliers > 1 ? "s" : ""}, à vérifier` };
}

export type StockMatch = { product: Product; through: string; evidence: Evidence | null; kind: string };

/**
 * Pièces du stock qui vont sur le modèle demandé : directement (nom ou compatibles de la pièce),
 * ou parce que le réseau dit qu'un modèle de la pièce a la même pièce (un seul pas, jamais une chaîne).
 */
export function stockFor(products: Product[], keys: string[], links: NetLink[]): StockMatch[] {
  const want = new Set(keys);
  const out = new Map<string, StockMatch>();
  for (const p of products) {
    const kind = partKind(p.name);
    if (!kind) continue;
    const models = productModels(p);
    const direct = models.find((m) => want.has(m));
    if (direct) {
      out.set(p.id, { product: p, through: direct, evidence: null, kind });
      continue;
    }
    let best: StockMatch | null = null;
    for (const l of links) {
      if (l.kind !== kind || !want.has(l.model) || !models.includes(l.other)) continue;
      const e = { poses: l.poses, fournisseurs: l.fournisseurs, ateliers: l.ateliers };
      const score = (x: Evidence) => x.poses * 100 + x.fournisseurs * 10 + x.ateliers;
      if (!best || score(e) > score(best.evidence!)) best = { product: p, through: l.other, evidence: e, kind };
    }
    if (best) out.set(p.id, best);
  }
  return [...out.values()].sort((a, b) => Number(b.product.stock > 0) - Number(a.product.stock > 0) || Number(!!a.evidence) - Number(!!b.evidence));
}

/** Modèles qui ont la même pièce (réponse du réseau), par type, les mieux prouvés d'abord. */
export function sameParts(links: NetLink[]): Array<{ kind: string; models: Array<{ model: string; evidence: Evidence }> }> {
  const byKind = new Map<string, Map<string, Evidence>>();
  for (const l of links) {
    const m = byKind.get(l.kind) ?? new Map<string, Evidence>();
    const e = m.get(l.other) ?? { poses: 0, fournisseurs: 0, ateliers: 0 };
    m.set(l.other, { poses: Math.max(e.poses, l.poses), fournisseurs: Math.max(e.fournisseurs, l.fournisseurs), ateliers: Math.max(e.ateliers, l.ateliers) });
    byKind.set(l.kind, m);
  }
  const order = ["Écran", "Batterie", "Plaquette", "Connecteur", "Nappe", "Dos", "Bouton"];
  return [...byKind.entries()]
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([kind, m]) => ({
      kind,
      models: [...m.entries()].map(([model, evidence]) => ({ model, evidence })).sort((a, b) => b.evidence.poses - a.evidence.poses || b.evidence.fournisseurs - a.evidence.fournisseurs || b.evidence.ateliers - a.evidence.ateliers),
    }));
}

