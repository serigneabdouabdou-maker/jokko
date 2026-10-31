import { useState } from "react";
import { Button } from "@/components/ui/button";
import { enableNotifications, notificationState, type NotifyState, useInstall } from "@/pwa";

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
  if (installed || gone || (!canPrompt && !ios)) return null;

  function hide() {
    try {
      localStorage.setItem(HIDE_KEY, "1");
    } catch {
      /* rien : la bannière reviendra simplement */
    }
    setGone(true);
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

const NOTIFY_TEXT: Record<NotifyState, string> = {
  non_dispo: "Ce navigateur ne sait pas afficher de notifications. Installe Jokko, ou ouvre-le avec Chrome.",
  a_demander: "Active les notifications : Jokko pourra te prévenir (dettes en retard, alertes de la boutique).",
  acceptees: "Notifications activées.",
  refusees: "Notifications bloquées. Pour les débloquer : touche le cadenas à côté de l’adresse, puis Notifications → Autoriser.",
};

/** Dans Réglages : installer l'appli et activer les notifications. */
export function InstallSettings() {
  const { installed, canPrompt, ios, install } = useInstall();
  const [notify, setNotify] = useState<NotifyState>(notificationState);
  const [busy, setBusy] = useState(false);

  return (
    <div className="install-settings">
      <h3>Application sur le téléphone</h3>
      {installed ? (
        <p className="note">Jokko est installé sur ce téléphone.</p>
      ) : canPrompt ? (
        <div className="row">
          <Button className="h-11 rounded-full px-5" onClick={() => void install()}>Installer Jokko</Button>
        </div>
      ) : ios ? (
        <IosSteps />
      ) : (
        <p className="note">Pour installer : ouvre le menu de Chrome (les trois points en haut à droite), puis touche « Installer l’application » ou « Ajouter à l’écran d’accueil ».</p>
      )}
      <p className="note">{NOTIFY_TEXT[notify]}</p>
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
    </div>
  );
}
