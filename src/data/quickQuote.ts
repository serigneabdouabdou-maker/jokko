/**
 * Prix rapide pour un client (22/11/2026, demande de Fallou : « un nouveau client demande une réparation : tu tapes
 * le modèle ou la marque et le prix vient, pour répondre au client vite fait »).
 *
 * Pour le modèle tapé : chaque pièce (écran, batterie, connecteur, dos…) avec ses 3 prix (normal, négocié,
 * jamais sous) calculés par la barrière des prix, qu'elle soit dans le stock ou seulement chez le fournisseur
 * (dernier prix des factures), et si elle est disponible tout de suite. Les services du catalogue qui correspondent.
 */
import type { Product, ServiceItem, Shop } from "../model.ts";
import { modelKeys } from "./modelKeys.ts";
import { searchProducts } from "./partSearch.ts";
import { kindOf, type PartKind } from "./pricing.ts";
import { type Ladder, type LadderContext, ladderContext, priceLadder } from "./priceGuard.ts";
import { type CompatHit, compatFor, modelKey, notCompat } from "./supplierCompat.ts";

export type QuoteLine = {
  kind: PartKind;
  name: string;
  ladder: Ladder;
  stock: number;
  /** stock = article de la boutique ; fournisseur = seulement dans les factures (à commander). */
  source: "stock" | "fournisseur";
  /** Écran universel trouvé par un téléphone compatible. */
  via?: string;
  /** Va sur le modèle cherché d'après le fournisseur (« Liste BF6 »), dit n fois. */
  supplierSays?: { model: string; n: number };
  productId?: string;
};

const ORDER: PartKind[] = ["Écran", "Batterie", "Connecteur", "Dos", "Plaquette", "Bouton", "Nappe", "Autre"];
const squash = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

export function quickQuote(shop: Shop, query: string, now = new Date(), ctx: LadderContext = ladderContext(shop, now)): { lines: QuoteLine[]; services: ServiceItem[]; compat: CompatHit[] } {
  const q = query.trim();
  if (squash(q).length < 2) return { lines: [], services: [], compat: [] };
  const no = (shop.suppliers ?? []).flatMap((s) => s.compatNo ?? []);
  const lines: QuoteLine[] = [];
  const seen = new Set<string>();
  const add = (l: QuoteLine) => {
    const key = `${l.kind}:${squash(l.name)}`;
    if (seen.has(key)) {
      // Déjà trouvée : on ajoute seulement la preuve du fournisseur.
      if (l.supplierSays) { const old = lines.find((x) => `${x.kind}:${squash(x.name)}` === key); if (old && !old.supplierSays) old.supplierSays = l.supplierSays; }
      return;
    }
    seen.add(key);
    lines.push(l);
  };
  // 1. Pièces de la boutique (nom, ou téléphone compatible d'un écran universel).
  for (const h of searchProducts(shop.products, q, 40)) {
    const p: Product = h.product;
    if (h.via && notCompat(no, q, h.via)) continue; // le patron a dit « ne va pas »
    if (kindOf(p.name) === "Autre" && !p.price) continue;
    const ladder = priceLadder(shop, p, now, ctx);
    if (!ladder) continue;
    add({ kind: kindOf(p.name), name: p.name, ladder: p.price > ladder.normal ? { ...ladder, normal: p.price } : ladder, stock: p.stock, source: "stock", productId: p.id, ...(h.via ? { via: h.via } : {}) });
  }
  // 1 bis. Écrans qui vont sur ce modèle d'après le fournisseur (« Liste BF6 » → BF7, KI5K, A60…).
  const compat = compatFor((shop.suppliers ?? []).flatMap((s) => s.compat ?? []), q, no);
  if (compat.length) {
    const byKey = new Map(compat.map((c) => [c.key, c]));
    for (const p of shop.products) {
      if (kindOf(p.name) !== "Écran") continue;
      const hit = [...modelKeys(p.name), ...(p.aliases ?? []).map(modelKey)].map((k) => byKey.get(k)).find(Boolean);
      if (!hit) continue;
      const ladder = priceLadder(shop, p, now, ctx);
      if (ladder) add({ kind: "Écran", name: p.name, ladder: p.price > ladder.normal ? { ...ladder, normal: p.price } : ladder, stock: p.stock, source: "stock", productId: p.id, supplierSays: { model: hit.model, n: hit.n } });
    }
  }
  // 2. Pièces vues seulement dans les factures du fournisseur (dernier prix), même modèle.
  const keys = new Set(modelKeys(q));
  const whole = squash(q);
  for (const i of (shop.suppliers ?? []).flatMap((s) => s.items ?? [])) {
    if (i.kind === "Autre") continue;
    const last = i.prices?.[i.prices.length - 1]?.[1];
    if (!last) continue;
    const match = squash(i.name).includes(whole) || modelKeys(i.name).some((k) => keys.has(k));
    if (!match) continue;
    // Déjà dans le stock sous un autre nom (« Écran Tecno BF6 » pour « Écran BF6 ») : on garde la fiche du stock.
    const inStock = lines.some((l) => l.kind === i.kind && modelKeys(l.name).some((k) => modelKeys(i.name).includes(k)));
    if (inStock) continue;
    const ladder = priceLadder(shop, { name: i.name, cost: last }, now, ctx);
    if (ladder) add({ kind: i.kind as PartKind, name: i.name, ladder, stock: 0, source: "fournisseur" });
  }
  lines.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || Number(b.stock > 0) - Number(a.stock > 0) || a.ladder.normal - b.ladder.normal);
  // 3. Services du catalogue dont le nom correspond (« décodage », « FRP »…).
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
  const services = (shop.services ?? []).filter((s) => words.some((w) => s.name.toLowerCase().includes(w)));
  // 4 pièces au plus par type (écrans, batteries…), 14 en tout : la liste tient sur l'écran du téléphone.
  const perKind = new Map<string, number>();
  const kept = lines.filter((l) => { const n = (perKind.get(l.kind) ?? 0) + 1; perKind.set(l.kind, n); return n <= (l.kind === "Écran" ? 6 : 4); }).slice(0, 16);
  return { lines: kept, services, compat };
}

/** Le message à envoyer au client (WhatsApp), une ligne par pièce, le prix normal seulement. */
export function quoteMessage(shopName: string, model: string, lines: QuoteLine[]): string {
  const rows = lines.map((l) => `- ${l.name} : ${l.ladder.normal.toLocaleString("fr-FR").replace(/[  ]/g, " ")} F${l.stock > 0 ? " (réparé aujourd'hui)" : ""}`);
  return [`Bonjour, voici nos prix pour ${model} :`, ...rows, `Pièce + main-d'œuvre compris. ${shopName}`].join("\n");
}
