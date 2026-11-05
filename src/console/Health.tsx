import { useEffect, useState } from "react";
import { Icon, Notice } from "@/components/jokko/Icon";
import { supabase } from "@/data/supabase";

type Check = { at: string; ok: boolean; status: number | null; detail: string | null };
type Service = { target: string; label: string; last: Check | null; uptime: number | null; open: boolean };
type Incident = { id: number; target: string; title: string; detail: string; opened_at: string; closed_at: string | null };
type Bug = { id: number; app: string; page: string; message: string; source: string; count: number; first_at: string; last_at: string };
type Health = { services: Service[]; gemini: { calls: number; fail: number }; incidents: Incident[]; bugs: Bug[] };

const when = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const mins = (a: string, b?: string | null) => Math.max(1, Math.round(((b ? Date.parse(b) : Date.now()) - Date.parse(a)) / 60_000));
const duration = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`);

/**
 * Santé de la plateforme : le site, la console et chaque fonction du serveur sont contrôlés toutes les 5 minutes ;
 * Gemini et les bugs de l'appli aussi. Une anomalie envoie une notification, le retour à la normale aussi.
 */
export function HealthTab() {
  const [data, setData] = useState<Health | null>(null);
  const [failed, setFailed] = useState(false);

  async function load() {
    const { data: d, error } = await supabase.rpc("admin_health");
    if (error) return setFailed(true);
    setFailed(false);
    setData(d as Health);
  }
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (failed) return <Notice text="Impossible de lire l'état de la plateforme. Si ça dure, c'est peut-être la base de données elle-même : réessaie dans une minute." tone="erreur" />;
  if (!data) return <p className="note">Contrôle en cours…</p>;

  const open = data.incidents.filter((i) => !i.closed_at);
  const geminiBad = data.gemini.calls >= 5 && data.gemini.fail * 2 >= data.gemini.calls;
  const allOk = open.length === 0;
  const lastCheck = data.services.map((s) => s.last?.at).filter(Boolean).sort().pop();

  return (
    <div className="cx-stack">
      <div className="cx-health-banner" data-ok={allOk}>
        <span className="cx-health-big" aria-hidden="true"><Icon name={allOk ? "ok" : "alerte"} size="lg" /></span>
        <span>
          <b>{allOk ? "Tout marche normalement" : `${open.length} anomalie${open.length > 1 ? "s" : ""} en cours`}</b>
          <small>
            {allOk ? "Le site, la console, l'assistant, les paiements et les notifications répondent." : open.map((i) => i.title).join(" · ")}
            {lastCheck ? ` Dernier contrôle : ${when(lastCheck)}.` : " Premier contrôle dans 5 minutes."}
          </small>
        </span>
      </div>

      <section className="cx-card">
        <h3>Services contrôlés toutes les 5 minutes</h3>
        <div className="cx-services">
          {data.services.map((s) => {
            const state = s.open || (s.last && !s.last.ok) ? "bad" : s.last ? "ok" : "unknown";
            return (
              <article key={s.target} className="cx-service" data-state={state}>
                <header><i aria-hidden="true" />{s.label}</header>
                <small>{!s.last ? "Pas encore contrôlé" : s.last.ok ? `OK · ${when(s.last.at)}` : s.last.detail ?? "En panne"}</small>
                {s.uptime !== null && <span className="cx-uptime">Disponible {s.uptime} % sur 24 h</span>}
              </article>
            );
          })}
          <article className="cx-service" data-state={geminiBad ? "bad" : "ok"}>
            <header><i aria-hidden="true" />Réponses de Gemini</header>
            <small>{data.gemini.calls ? `${data.gemini.calls - data.gemini.fail} réussies sur ${data.gemini.calls} en 1 h` : "Aucun appel dans l'heure"}</small>
          </article>
        </div>
      </section>

      <div className="cx-grid">
        <section className="cx-card">
          <h3>Incidents (7 jours)</h3>
          {data.incidents.length === 0 ? (
            <p className="note">Aucun incident. Si un service tombe deux contrôles de suite, il apparaît ici et ton téléphone sonne.</p>
          ) : (
            <ul className="cx-list">
              {data.incidents.map((i) => (
                <li key={i.id}>
                  <span>
                    <b>{i.title}</b> {i.closed_at ? <small>· rétabli</small> : <small style={{ color: "var(--j-danger)" }}>· en cours</small>}
                    <br />
                    <small>{i.detail}</small>
                  </span>
                  <small>
                    {when(i.opened_at)} · {i.closed_at ? `${duration(mins(i.opened_at, i.closed_at))} de panne` : `depuis ${duration(mins(i.opened_at))}`}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="cx-card">
          <h3>Bugs dans l'application (7 jours)</h3>
          {data.bugs.length === 0 ? (
            <p className="note">Aucun bug signalé par les téléphones des commerçants.</p>
          ) : (
            <ul className="cx-list">
              {data.bugs.map((b) => (
                <li key={b.id}>
                  <span>
                    <span className="cx-bug-msg">{b.message}</span>
                    <br />
                    <small>
                      {b.app === "console" ? "Console" : "Appli boutique"} · page {b.page}
                      {b.source ? ` · ${b.source}` : ""}
                    </small>
                  </span>
                  <small>
                    <b className="num">{b.count}×</b> · dernier {when(b.last_at)}
                  </small>
                </li>
              ))}
            </ul>
          )}
          <p className="note">Envoie-moi une capture de cette liste : je corrige les bugs qui reviennent.</p>
        </section>
      </div>
    </div>
  );
}
