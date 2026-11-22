/**
 * Conseiller connecté à toute la boutique (22/11/2026, demande de Fallou : « des conseils stratégiques, commerciaux,
 * marketing : comment gagner plus de clients, des prix abordables, comment communiquer, convaincre, concurrencer »).
 * Ce bloc s'ajoute au diagnostic : clients (groupes, fidélité), prix donnés et clients perdus, échelle des prix
 * (normal / négocié / minimum) des pièces qui partent le plus, services, délais et garanties, et ce que le patron
 * dit de ses concurrents. Jamais un nom ni un numéro de client : seulement des chiffres.
 */
import type { Shop } from "../model.ts";
import { rankClients, SEGMENTS, type Segment } from "./clientFiles.ts";
import { metierOf } from "./metiers.ts";
import { ladderContext, priceLadder } from "./priceGuard.ts";
import { quoteStats } from "./quotes.ts";
import { usageMap } from "./reorder.ts";
import { kindOf } from "./pricing.ts";

const DAY = 86_400_000;

export function commerceForAdvisor(shop: Shop, note = "", now = new Date()) {
  const repairer = metierOf(shop.activity).id === "reparation";
  const files = rankClients(shop, now);
  const seg = new Map<Segment, number>();
  for (const f of files) seg.set(f.segment, (seg.get(f.segment) ?? 0) + 1);
  const month = now.getTime() - 30 * DAY;
  const newThisMonth = files.filter((f) => f.firstAt && Date.parse(f.firstAt) >= month).length;
  const returning = files.filter((f) => f.visits >= 2).length;

  const used = usageMap(shop, now, 30);
  const ctx = repairer ? ladderContext(shop, now) : undefined;
  const top = shop.products
    .filter((p) => (used.get(p.id) ?? 0) > 0)
    .sort((a, b) => (used.get(b.id) ?? 0) - (used.get(a.id) ?? 0))
    .slice(0, 10)
    .map((p) => {
      const l = repairer ? priceLadder(shop, p, now, ctx) : null;
      return {
        article: p.name,
        partis_30_jours: used.get(p.id) ?? 0,
        en_stock: p.stock,
        prix_achat: p.cost ?? null,
        prix_de_vente_actuel: p.price || null,
        ...(l ? { prix_normal: l.normal, prix_negocie: l.nego, prix_minimum: l.floor, type: kindOf(p.name) } : {}),
      };
    });

  const qs = quoteStats(shop, now, 30);
  const repairs = (shop.repairs ?? []).filter((r) => r.status !== "annule" && Date.parse(r.at) >= month);
  const delays = repairs.filter((r) => r.repairedAt).map((r) => (Date.parse(r.repairedAt!) - Date.parse(r.at)) / DAY);
  const withWarranty = repairs.filter((r) => (r.warrantyDays ?? 0) > 0).length;

  return {
    commerce: {
      clients: {
        total: files.length,
        nouveaux_30_jours: newThisMonth,
        revenus_au_moins_2_fois: returning,
        groupes: [...seg.entries()].filter(([k]) => k !== "aucun").map(([k, n]) => ({ groupe: SEGMENTS[k].label, nombre: n })),
      },
      ...(qs.given
        ? {
            prix_donnes_30_jours: {
              donnes: qs.given,
              pris: qs.won,
              perdus: qs.lost,
              taux_pris_pct: qs.wonPct,
              raisons_des_pertes: qs.reasons.map((r) => ({ raison: r.label, nombre: r.n })),
              ecart_moyen_avec_le_prix_voulu: qs.gapAvg,
              perdus_avec_prix_voulu_note: qs.wantedNoted,
              perdus_qui_pouvaient_etre_gardes_au_dessus_du_minimum: qs.savable,
              argent_de_ces_clients: qs.savableAmount,
              perdus_qui_voulaient_moins_que_le_minimum: qs.belowFloor,
              modeles_les_plus_perdus: qs.models.map((m) => ({ modele: m.model, perdus: m.lost, prix_donnes: m.given })),
            },
          }
        : { prix_donnes_30_jours: "pas encore noté : dans Atelier → Prix pour un client, touche « Le client n'a pas pris » quand il part" }),
      articles_qui_partent_le_plus: top,
      services_du_catalogue: (shop.services ?? []).slice(0, 15).map((s) => ({ service: s.name, prix: s.price })),
      ...(repairer
        ? {
            atelier_30_jours: {
              reparations_recues: repairs.length,
              delai_moyen_jours: delays.length ? Math.round((delays.reduce((a, d) => a + d, 0) / delays.length) * 10) / 10 : null,
              reparations_avec_garantie: withWarranty,
            },
          }
        : {}),
      ...(note.trim() ? { ce_que_dit_le_patron: note.trim().slice(0, 400) } : {}),
    },
  };
}
