import { useEffect, useState } from "react";
import { Notice } from "./Icon";
import { supabase } from "@/data/supabase";
import { Button } from "@/components/ui/button";
import { enableNotifications, notificationState, type NotifyState, setSummaryHour, useInstall } from "@/pwa";
import { isNativeApp } from "@/native";

const HIDE_KEY = "jokko.install.hidden";

function hidden(): boolean {
  try {
    return localStorage.getItem(HIDE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Petite invitation dans « Aujourd'hui » : installer Jokko sur l'écran d'accueil. */
export function InstallBanner() {
  const { installed, canPrompt, ios, install } = useInstall();
  const [gone, setGone] = useState(hidden);
  const [help, setHelp] = useState(false);
  const android = isAndroidWeb();
  if (gone || (!android && (installed || (!canPrompt && !ios)))) return null;

  function hide() {
    try {
      localStorage.setItem(HIDE_KEY, "1");
    } catch {
      /* rien : la bannière reviendra simplement */
    }
    setGone(true);
  }

  if (android) {
    return (
      <div className="install-banner">
        <p><b>Télécharge l’application Jokko pour Android</b> : les vraies notifications (ventes, dettes, alertes), en plein écran, même sans Chrome.</p>
        <div className="row">
          <a className="app-dl" href={ANDROID_APK}>Télécharger l’application</a>
          <Button variant="ghost" className="h-10 rounded-full px-4" onClick={hide}>Plus tard</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="install-banner">
      <p><b>Installe Jokko sur ton téléphone</b> : une icône sur l’écran d’accueil, en plein écran, même sans internet.</p>
      {help && <IosSteps />}
      <div className="row">
        <Button className="h-10 rounded-full px-4" onClick={() => (canPrompt ? void install() : setHelp(true))}>Installer</Button>
        <Button variant="ghost" className="h-10 rounded-full px-4" onClick={hide}>Plus tard</Button>
      </div>
    </div>
  );
}

function IosSteps() {
  return (
    <ol className="install-steps">
      <li>Touche le bouton <b>Partager</b> (le carré avec une flèche vers le haut), en bas de Safari.</li>
      <li>Descends et touche <b>Sur l’écran d’accueil</b>.</li>
      <li>Touche <b>Ajouter</b>, en haut à droite.</li>
    </ol>
  );
}

/** Android dans un navigateur (pas dans l'application) : on propose la vraie application. */
export function isAndroidWeb(): boolean {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent) && !isNativeApp();
}

const PROMPT_KEY = "jokko.appli.proposee";

/**
 * Page d'accueil (nouveau visiteur) : en bas de l'écran, la bonne façon d'avoir Jokko sur ce téléphone.
 * Android → l'application Jokko (vraies notifications). iPhone → « Sur l'écran d'accueil » (Safari).
 */
export function AppPrompt() {
  const { installed, ios } = useInstall();
  const [gone, setGone] = useState(() => {
    try {
      return localStorage.getItem(PROMPT_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [steps, setSteps] = useState(false);
  const android = isAndroidWeb();
  if (gone || (!android && !(ios && !installed))) return null;
  function close() {
    try {
      localStorage.setItem(PROMPT_KEY, "1");
    } catch {
      /* rien */
    }
    setGone(true);
  }
  return (
    <aside className="app-prompt" aria-label="Avoir Jokko sur ce téléphone">
      <img src="/icon-192.png" alt="" width={44} height={44} />
      <div className="app-prompt-text">
        <b>{android ? "Jokko pour Android" : "Jokko sur ton iPhone"}</b>
        <span>{android ? "L’application, avec les vraies notifications." : "Ajoute Jokko à l’écran d’accueil, comme une application."}</span>
        {steps && <IosSteps />}
      </div>
      {android ? (
        <a className="app-prompt-go" href={ANDROID_APK}>Télécharger</a>
      ) : (
        !steps && <button type="button" className="app-prompt-go" onClick={() => setSteps(true)}>Comment ?</button>
      )}
      <button type="button" className="app-prompt-x" aria-label="Fermer" onClick={close}>×</button>
    </aside>
  );
}

/** Page de téléchargement de l'application Android (sur jokkoapp.com). */
const ANDROID_APK = "/android/";

const NOTIFY_TEXT: Record<NotifyState, string> = {
  non_dispo: "Ce navigateur ne sait pas afficher de notifications. Installe Jokko, ou ouvre-le avec Chrome.",
  a_demander: "Active les notifications : Jokko pourra te prévenir (dettes en retard, alertes de la boutique).",
  acceptees: "Notifications activées : Jokko te prévient même quand l’appli est fermée.",
  refusees: "Notifications bloquées. Pour les débloquer : touche le cadenas à côté de l’adresse, puis Notifications → Autoriser.",
};

/** Dans Réglages : installer l'appli et activer les notifications. */
export function InstallSettings({ userId }: { userId?: string }) {
  const { installed, canPrompt, ios, install } = useInstall();
  const [notify, setNotify] = useState<NotifyState>(notificationState);
  const [busy, setBusy] = useState(false);
  const inApp = isNativeApp();

  return (
    <div className="install-settings">
      <h3>Application sur le téléphone</h3>
      {installed ? (
        <p className="note">{inApp ? "Tu es dans l’application Jokko pour Android." : "Jokko est installé sur ce téléphone."}</p>
      ) : canPrompt ? (
        <div className="row">
          <Button className="h-11 rounded-full px-5" onClick={() => void install()}>Installer Jokko</Button>
        </div>
      ) : ios ? (
        <IosSteps />
      ) : (
        <p className="note">Pour installer : ouvre le menu de Chrome (les trois points en haut à droite), puis touche « Installer l’application » ou « Ajouter à l’écran d’accueil ».</p>
      )}
      {!inApp && /Android/i.test(navigator.userAgent) && (
        <p className="note">
          Ou l’application Android (sans Chrome) : <a className="link" href={ANDROID_APK}>Télécharger Jokko pour Android</a>
        </p>
      )}
      <p className="note">{inApp && notify === "non_dispo" ? "Dans l’application, les notifications arrivent dans la prochaine version. En attendant, elles marchent avec Jokko ouvert dans Chrome." : NOTIFY_TEXT[notify]}</p>
      {notify === "a_demander" && (
        <div className="row">
          <Button
            variant="outline"
            className="h-11 rounded-full px-5"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setNotify(await enableNotifications());
              setBusy(false);
            }}
          >
            Activer les notifications
          </Button>
        </div>
      )}
      {userId && notify === "acceptees" && <PushTest />}
      {userId && notify === "acceptees" && <ActivityChoice userId={userId} />}
      {userId && notify === "acceptees" && <SummaryHour userId={userId} />}
    </div>
  );
}

/** Bouton d'essai : le serveur envoie une vraie notification à ce compte (tous ses téléphones). */
function PushTest() {
  const [note, setNote] = useState("");
  return (
    <div className="row">
      <Button
        variant="outline"
        className="h-11 rounded-full px-5"
        onClick={async () => {
          setNote("");
          const { data, error } = await supabase.rpc("push_test");
          setNote(error ? "Pas de connexion internet. Réessaie." : data ? "✓ Envoyée : regarde en haut de ton écran dans quelques secondes." : "Attends 30 secondes avant un nouvel essai.");
        }}
      >
        Envoyer une notification d’essai
      </Button>
      {note && <Notice text={note} tone={note.startsWith("✓") ? "ok" : "erreur"} />}
    </div>
  );
}

const ACTIVITY: Array<[string, string]> = [
  ["employes", "Ce que font mes employés"],
  ["toutes", "Tout, même ce que je fais"],
  ["aucune", "Rien (alertes graves seulement)"],
];

/** Patron : être prévenu de chaque vente, dépense, facture ou dette payée, même appli fermée. */
function ActivityChoice({ userId }: { userId: string }) {
  const [pref, setPref] = useState<string>("employes");
  const [note, setNote] = useState("");
  useEffect(() => {
    void supabase
      .from("profiles")
      .select("notify_activity")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => data?.notify_activity && setPref(String(data.notify_activity)));
  }, [userId]);
  return (
    <div className="field">
      <label htmlFor="notify-activity" className="text-sm font-medium">Me prévenir à chaque vente, dépense, facture ou dette payée</label>
      <select
        id="notify-activity"
        className="h-11 rounded-md border px-3"
        value={pref}
        onChange={async (e) => {
          setPref(e.target.value);
          const { error } = await supabase.from("profiles").update({ notify_activity: e.target.value }).eq("user_id", userId);
          setNote(error ? "Pas de connexion internet. Réessaie." : "✓ Enregistré.");
        }}
      >
        {ACTIVITY.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
      </select>
      {note && <Notice text={note} />}
    </div>
  );
}

/** Patron : heure du résumé du soir envoyé en notification (heure de Dakar). */
function SummaryHour({ userId }: { userId: string }) {
  const [hour, setHour] = useState<string>("20");
  const [note, setNote] = useState("");
  useEffect(() => {
    void supabase
      .from("profiles")
      .select("summary_hour")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => setHour(data?.summary_hour === null || data?.summary_hour === undefined ? "aucun" : String(data.summary_hour)));
  }, [userId]);
  return (
    <div className="field">
      <label htmlFor="summary-hour" className="text-sm font-medium">Résumé du jour en notification, chaque soir à</label>
      <select
        id="summary-hour"
        className="h-11 rounded-md border px-3"
        value={hour}
        onChange={async (e) => {
          setHour(e.target.value);
          const ok = await setSummaryHour(userId, e.target.value === "aucun" ? null : Number(e.target.value));
          setNote(ok ? "✓ Enregistré." : "Pas de connexion internet. Réessaie.");
        }}
      >
        {[17, 18, 19, 20, 21, 22, 23].map((h) => <option key={h} value={String(h)}>{h} h</option>)}
        <option value="aucun">Pas de résumé</option>
      </select>
      {note && <Notice text={note} />}
    </div>
  );
}
