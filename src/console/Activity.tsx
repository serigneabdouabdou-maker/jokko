import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon, type IconName, Notice } from "@/components/jokko/Icon";
import { supabase } from "@/data/supabase";
import { enableNotifications, isIos, notificationState, type NotifyState, useInstall } from "../pwa";

export type EventKind = "inscription" | "boutique" | "abonnement" | "paiement" | "visite" | "anomalie" | "retabli";
type AdminEvent = { id: number; at: string; kind: EventKind; title: string; body: string; shop_id: string | null };
type Activity = { events: AdminEvent[]; today: { visites: number; inscriptions: number; boutiques: number; abonnements: number }; off: string[] };

const KINDS: { id: EventKind; label: string; icon: IconName }[] = [
  { id: "inscription", label: "Inscriptions", icon: "client" },
  { id: "boutique", label: "Nouvelles boutiques", icon: "boutique" },
  { id: "abonnement", label: "Demandes d'abonnement", icon: "offre" },
  { id: "paiement", label: "Paiements reçus", icon: "mobileMoney" },
  { id: "visite", label: "Visites du site (au plus 1 toutes les 15 min)", icon: "lien" },
  { id: "anomalie", label: "Anomalies (site en panne, bugs, Gemini)", icon: "alerte" },
  { id: "retabli", label: "Retour à la normale", icon: "ok" },
];
const ICON: Record<EventKind, IconName> = { inscription: "client", boutique: "boutique", abonnement: "offre", paiement: "mobileMoney", visite: "lien", anomalie: "alerte", retabli: "ok" };

function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86_400) return `il y a ${Math.round(s / 3600)} h`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Le jour d'un événement, pour regrouper le fil : « Aujourd'hui », « Hier », « 3 nov. ». */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Aujourd'hui";
  if (d.toDateString() === yesterday.toDateString()) return "Hier";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

/**
 * Activité : tout ce qui se passe sur Jokko, en direct (inscriptions, boutiques, abonnements, paiements, visites),
 * et les notifications sur le téléphone de l'admin.
 */
export function ActivityTab() {
  const [data, setData] = useState<Activity | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<EventKind | "tout">("tout");
  const [, tick] = useState(0);

  async function load() {
    const { data: d, error } = await supabase.rpc("admin_activity", { p_limit: 150 });
    if (error) return setFailed(true);
    setFailed(false);
    setData(d as Activity);
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    const clock = window.setInterval(() => tick((n) => n + 1), 60_000);
    const back = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", back);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(clock);
      document.removeEventListener("visibilitychange", back);
    };
  }, []);

  const events = (data?.events ?? []).filter((e) => filter === "tout" || e.kind === filter);
  let lastDay = "";

  return (
    <div className="cx-stack">
      <section className="cx-kpis">
        <Count label="Visites aujourd'hui" value={data?.today.visites} icon="lien" />
        <Count label="Inscriptions" value={data?.today.inscriptions} icon="client" />
        <Count label="Nouvelles boutiques" value={data?.today.boutiques} icon="boutique" />
        <Count label="Abonnements" value={data?.today.abonnements} icon="offre" />
      </section>

      <div className="cx-grid cx-act-grid">
        <section className="cx-card">
          <div className="cx-act-head">
            <h3>En direct</h3>
            <span className="cx-live" aria-label="Mis à jour toutes les 30 secondes"><i />En direct</span>
          </div>
          <div className="cx-act-filters" role="tablist" aria-label="Filtrer">
            {([["tout", "Tout"], ...KINDS.map((k) => [k.id, k.label.split(" (")[0]])] as [EventKind | "tout", string][]).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={filter === id} className={filter === id ? "on" : ""} onClick={() => setFilter(id)}>{label}</button>
            ))}
          </div>
          {failed && <Notice text="Impossible de charger l'activité. Vérifie la connexion." tone="erreur" />}
          {data && events.length === 0 && <p className="note">Rien pour le moment. Dès qu'un visiteur arrive ou qu'un commerçant s'inscrit, ça s'affiche ici.</p>}
          <ol className="cx-feed">
            {events.map((e) => {
              const day = dayLabel(e.at);
              const head = day !== lastDay;
              lastDay = day;
              return (
                <li key={e.id} data-kind={e.kind}>
                  {head && <p className="cx-feed-day">{day}</p>}
                  <div className="cx-feed-row">
                    <span className="cx-feed-ico" aria-hidden="true"><Icon name={ICON[e.kind]} /></span>
                    <span className="cx-feed-txt">
                      <b>{e.title}</b>
                      <small>{e.body}</small>
                    </span>
                    <time dateTime={e.at}>{ago(e.at)}</time>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <div className="cx-stack">
          <PhoneCard />
          <section className="cx-card">
            <h3>Ce qui sonne sur ton téléphone</h3>
            <ul className="cx-list">
              {KINDS.map((k) => {
                const on = !(data?.off ?? []).includes(k.id);
                return (
                  <li key={k.id}>
                    <span className="cx-inline"><Icon name={k.icon} size="sm" />{k.label}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-label={k.label}
                      className={`cx-switch${on ? " on" : ""}`}
                      disabled={!data}
                      onClick={async () => {
                        const { error } = await supabase.rpc("admin_notify_set", { p_kind: k.id, p_on: !on });
                        if (!error) void load();
                      }}
                    >
                      <i />
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="note">Tout reste visible ici dans le fil, même ce qui ne sonne pas.</p>
          </section>
        </div>
      </div>
    </div>
  );
}

function Count({ label, value, icon }: { label: string; value: number | undefined; icon: IconName }) {
  return (
    <article className="cx-kpi cx-act-kpi">
      <span className="cx-inline"><Icon name={icon} size="sm" />{label}</span>
      <b className="num">{value === undefined ? "…" : value.toLocaleString("fr-FR")}</b>
    </article>
  );
}

/** Installer « Jokko Admin » sur le téléphone et y recevoir les notifications. */
function PhoneCard() {
  const install = useInstall();
  const [state, setState] = useState<NotifyState>(() => notificationState());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  return (
    <section className="cx-card cx-phone">
      <h3>Jokko Admin sur ton téléphone</h3>
      {install.installed ? (
        <Notice text="✓ Installée : tu l'ouvres depuis l'icône Jokko Admin." />
      ) : install.canPrompt ? (
        <Button className="h-11 rounded-full" onClick={() => void install.install()}>
          <Icon name="telecharger" size="sm" /> Installer l'application
        </Button>
      ) : (
        <p className="note">
          {isIos()
            ? "Sur iPhone : touche Partager, puis « Sur l'écran d'accueil »."
            : "Dans Chrome : touche les 3 points en haut à droite, puis « Installer l'application » (ou « Ajouter à l'écran d'accueil »)."}
        </p>
      )}
      {state === "acceptees" ? (
        <Notice text="✓ Notifications activées sur cet appareil." />
      ) : state === "refusees" ? (
        <p className="note" data-tone="error">Les notifications sont bloquées pour ce site. Ouvre les réglages du navigateur (cadenas à côté de l'adresse) et autorise les notifications.</p>
      ) : state === "non_dispo" ? (
        <p className="note">Ce navigateur ne reçoit pas les notifications. Installe d'abord l'application, ou ouvre la console dans Chrome.</p>
      ) : (
        <Button
          variant="outline"
          className="h-11 rounded-full"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const next = await enableNotifications();
            setBusy(false);
            setState(next);
            setNote(next === "acceptees" ? "Une notification d'essai vient d'arriver." : "");
          }}
        >
          <Icon name="alerte" size="sm" /> Activer les notifications
        </Button>
      )}
      {note && <p className="note">{note}</p>}
      <p className="note">L'application Android Jokko connectée à ton compte reçoit aussi ces notifications.</p>
    </section>
  );
}
