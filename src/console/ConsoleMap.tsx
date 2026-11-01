import { useMemo, useState } from "react";
import type { ConsoleShop } from "@/data/admin";
import { PLAN_LABELS } from "@/data/plans";
import { REGIONS, regionAt, regionFromCity, type RegionMap } from "@/data/regions";
import { SENEGAL } from "./senegalRegions";

const K = Math.cos((14.5 * Math.PI) / 180); // les degrés de longitude sont plus courts au Sénégal
const NONE = "Non classée";
const count = (n: number) => n.toLocaleString("fr-FR").replace(/ /g, " ");

type Row = { region: string; shops: number; located: number; paying: number; users: number; sales: number };

/** Carte des boutiques par région (position de la boutique, arrondie à ~1 km, donnée par le patron). */
export function ConsoleMap({ shops }: { shops: ConsoleShop[] }) {
  const map: RegionMap = SENEGAL;
  const [focus, setFocus] = useState<string | null>(null);

  // Région de chaque boutique : par sa position si elle est placée, sinon d'après sa ville.
  const placed = useMemo(() => {
    return shops.map((s) => {
      const located = s.lat !== null && s.lat !== undefined && s.lng !== null && s.lng !== undefined;
      const region = (located ? regionAt(Number(s.lat), Number(s.lng), map) : null) ?? regionFromCity(s.city) ?? NONE;
      const paying = s.plan !== "gratuit" && Boolean(s.plan_until) && Date.parse(s.plan_until ?? "") > Date.now();
      return { shop: s, region, located, paying };
    });
  }, [shops, map]);

  const rows = useMemo(() => {
    const by = new Map<string, Row>();
    for (const name of [...REGIONS, NONE]) by.set(name, { region: name, shops: 0, located: 0, paying: 0, users: 0, sales: 0 });
    for (const p of placed) {
      const r = by.get(p.region) ?? by.get(NONE)!;
      r.shops += 1;
      r.located += p.located ? 1 : 0;
      r.paying += p.paying ? 1 : 0;
      r.users += Number(p.shop.members) || 0;
      r.sales += Number(p.shop.sales_30) || 0;
    }
    return [...by.values()].filter((r) => r.region !== NONE || r.shops > 0).sort((a, b) => Number(a.region === NONE) - Number(b.region === NONE) || b.shops - a.shops || a.region.localeCompare(b.region));
  }, [placed]);

  const view = useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const r of map.regions) for (const ring of r.rings) for (const [lng, lat] of ring) {
      minX = Math.min(minX, lng * K); maxX = Math.max(maxX, lng * K);
      minY = Math.min(minY, -lat); maxY = Math.max(maxY, -lat);
    }
    const pad = 0.08;
    return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
  }, [map]);

  if (!view) return null;

  const max = Math.max(1, ...rows.filter((r) => r.region !== NONE).map((r) => r.shops));
  const shade = (n: number) => (n ? `color-mix(in oklab, var(--j-yellow) ${Math.round(25 + (n / max) * 75)}%, var(--j-white))` : "var(--j-wash)");
  const path = (ring: Array<[number, number]>) => `M${ring.map(([lng, lat]) => `${(lng * K).toFixed(3)},${(-lat).toFixed(3)}`).join("L")}Z`;
  const byRegion = new Map(rows.map((r) => [r.region, r]));
  const located = placed.filter((p) => p.located);
  const total = placed.length;
  const unplaced = total - located.length;

  return (
    <div className="cx-stack">
      <section className="cx-kpis">
        <article className="cx-kpi"><span>Boutiques</span><b className="num">{count(total)}</b><small>{count(located.length)} placées sur la carte</small></article>
        <article className="cx-kpi"><span>Régions touchées</span><b className="num">{rows.filter((r) => r.region !== NONE && r.shops > 0).length} / 14</b></article>
        <article className="cx-kpi"><span>Utilisateurs</span><b className="num">{count(rows.reduce((n, r) => n + r.users, 0))}</b><small>patrons et vendeurs</small></article>
        <article className="cx-kpi"><span>Non classées</span><b className="num">{count(byRegion.get(NONE)?.shops ?? 0)}</b><small>ni position, ni ville reconnue</small></article>
      </section>

      <div className="cx-grid cx-map-grid">
        <section className="cx-card">
          <h3>Boutiques par région</h3>
          <svg className="cx-map" viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} role="img" aria-label={rows.map((r) => `${r.region} : ${r.shops} boutique(s)`).join(", ")}>
            {map.regions.map((r) => {
              const n = byRegion.get(r.name)?.shops ?? 0;
              return (
                <g key={r.name} className={`cx-region${focus === r.name ? " on" : ""}`} onClick={() => setFocus(focus === r.name ? null : r.name)}>
                  <title>{`${r.name} : ${n} boutique(s)`}</title>
                  {r.rings.map((ring, i) => <path key={i} d={path(ring)} style={{ fill: shade(n) }} />)}
                </g>
              );
            })}
            {located.map((p) => (
              <circle key={p.shop.id} className={`cx-dot is-${p.shop.effective}`} cx={Number(p.shop.lng) * K} cy={-Number(p.shop.lat)} r={0.06}>
                <title>{`${p.shop.name} · ${p.region} · ${PLAN_LABELS[p.shop.effective]}`}</title>
              </circle>
            ))}
          </svg>
          <div className="cx-legend">
            <span><i className="cx-dot-key is-avance" /> Avancé</span>
            <span><i className="cx-dot-key is-medium" /> Médium</span>
            <span><i className="cx-dot-key is-gratuit" /> Gratuit</span>
            <span>Couleur de la région = nombre de boutiques</span>
          </div>
          <p className="note">Touche une région pour la mettre en avant. « Ventes » = ventes des 30 derniers jours. Les points sont arrondis à environ 1 km. {map.source}.</p>
        </section>

        <section className="cx-card cx-table-card">
          <table className="cx-table cx-region-table">
            <thead>
              <tr><th>Région</th><th className="r">Boutiques</th><th className="r">Payantes</th><th className="r">Utilisateurs</th><th className="r">Ventes</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.region} className={focus === r.region ? "is-open" : ""} onClick={() => setFocus(focus === r.region ? null : r.region)}>
                  <td><b>{r.region}</b>{r.shops > 0 && r.located < r.shops && r.region !== NONE ? <><br /><small>{r.shops - r.located} d’après la ville</small></> : null}</td>
                  <td className="r num">{count(r.shops)}</td>
                  <td className="r num">{count(r.paying)}</td>
                  <td className="r num">{count(r.users)}</td>
                  <td className="r num">{count(r.sales)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
      {unplaced > 0 && (
        <p className="note">{count(unplaced)} boutique(s) ne sont pas encore placées sur la carte : elles sont classées d’après leur ville. Le patron peut placer sa boutique dans l’appli : Réglages → « Ma boutique sur la carte ».</p>
      )}
    </div>
  );
}
