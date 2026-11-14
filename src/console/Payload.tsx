import { useEffect, useState } from "react";
import { ko, type PayloadStats, payloadStats, payloadTone, payloadTrend } from "@/data/payload";

/**
 * Console : taille des demandes envoyées à Gemini, par boutique (14/11/2026, demande de Fallou).
 * On voit venir une boutique qui grossit (beaucoup d'articles ou de clients) bien avant la limite de 32 Ko.
 */
export function PayloadTab() {
  const [stats, setStats] = useState<PayloadStats | null>(null);
  useEffect(() => {
    void payloadStats().then(setStats);
    const timer = window.setInterval(() => void payloadStats().then(setStats), 120_000);
    return () => window.clearInterval(timer);
  }, []);
  if (!stats) return <p className="note">Chargement… (connecte-toi avec le compte admin et le code de sécurité)</p>;
  const limit = stats.limite;
  const full = stats.boutiques.filter((b) => payloadTone(b.max_7j, limit) === "warn");
  const odd = stats.boutiques.filter((b) => payloadTone(b.max_7j, limit) === "bad");
  const refused = stats.boutiques.reduce((a, b) => a + b.refus_7j, 0);

  return (
    <div className="cx-stack">
      <section className="cx-kpis">
        <article className="cx-kpi"><span>Boutiques mesurées (7 j)</span><b className="num">{stats.boutiques.length}</b><small>limite visée {ko(limit)}</small></article>
        <article className="cx-kpi"><span>Fiches pleines (grandes boutiques)</span><b className="num">{full.length}</b><small>{full.length ? full.map((b) => b.nom).slice(0, 2).join(", ") : "aucune"}</small></article>
        <article className="cx-kpi" data-tone={odd.length ? "bad" : "good"}><span>Anormales</span><b className="num">{odd.length}</b><small>{odd.length ? odd.map((b) => b.nom).slice(0, 2).join(", ") : "aucune : tout va bien"}</small></article>
        <article className="cx-kpi" data-tone={refused ? "bad" : "good"}><span>Demandes refusées (7 j)</span><b className="num">{refused}</b><small>{refused ? "trop lourdes : à régler" : "aucune"}</small></article>
      </section>
      <p className="note">
        Chaque phrase dite ou écrite à Jokko part avec une fiche de la boutique (articles, clients, dépôts). L’appli la coupe toujours vers 27 Ko,
        sous la limite de {ko(limit)}. Vert = petite boutique, Gemini voit tout. Orange = fiche pleine : grande boutique, Gemini voit une partie des
        articles et retrouve les autres en les cherchant (c’est normal). Rouge = anormal, préviens Claude.
      </p>
      <section className="cx-card">
        <h3>Taille des demandes, par boutique</h3>
        {stats.boutiques.length === 0 ? (
          <p className="note">Pas encore de mesure : elles arrivent à chaque phrase envoyée à Jokko.</p>
        ) : (
          <div className="cx-table-wrap">
            <table className="cx-table">
              <thead>
                <tr><th>Boutique</th><th>Plus grosse (7 j)</th><th>7 derniers jours</th><th>Aujourd’hui</th><th>Articles</th><th>Clients</th><th>Refus</th></tr>
              </thead>
              <tbody>
                {stats.boutiques.map((b) => {
                  const tone = payloadTone(b.max_7j, limit);
                  const trend = payloadTrend(b.jours);
                  const peak = Math.max(limit, ...b.jours.map((d) => d.max));
                  return (
                    <tr key={b.shop_id}>
                      <td>{b.nom}</td>
                      <td>
                        <div className="cx-gauge" data-tone={tone} title={`${Math.round((b.max_7j / limit) * 100)} % de la limite`}>
                          <span style={{ width: `${Math.min(100, (b.max_7j / limit) * 100)}%` }} />
                        </div>
                        <small className="num">{ko(b.max_7j)} · {Math.round((b.max_7j / limit) * 100)} %{trend !== null && trend !== 0 ? ` · ${trend > 0 ? "▲" : "▼"} ${Math.abs(trend)} %` : ""}</small>
                      </td>
                      <td>
                        <div className="cx-spark" aria-label="Plus grosse demande de chaque jour">
                          {b.jours.map((d) => (
                            <i key={d.jour} title={`${new Date(`${d.jour}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })} : ${d.max ? ko(d.max) : "rien"}`} data-tone={d.max ? payloadTone(d.max, limit) : undefined} style={{ height: `${d.max ? Math.max(8, (d.max / peak) * 100) : 4}%` }} />
                          ))}
                        </div>
                      </td>
                      <td className="num">{b.max_jour ? ko(b.max_jour) : "—"}</td>
                      <td className="num">{b.articles}{b.articles_envoyes !== null && b.articles_envoyes < b.articles ? <small> ({b.articles_envoyes} envoyés)</small> : null}</td>
                      <td className="num">{b.clients}</td>
                      <td className="num" data-tone={b.refus_7j ? "bad" : undefined}>{b.refus_7j || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
