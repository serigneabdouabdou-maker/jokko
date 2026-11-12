import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "./Icon";
import type { Shop } from "@/model";
import { firstSteps, type StepId, stepsLeft } from "@/data/firstSteps";
import { enableNotifications, notificationState, setSummaryHour } from "@/pwa";

const hiddenKey = (shopId: string) => `jokko.premiers-pas.${shopId}`;
const isHidden = (shopId: string) => {
  try {
    return localStorage.getItem(hiddenKey(shopId)) === "1";
  } catch {
    return false;
  }
};

/**
 * Carte « Premiers pas » en haut de l'écran Parler, pour le patron d'une boutique qui commence.
 * Chaque geste se coche tout seul quand il est fait (vente, articles, client, notifications).
 */
export function FirstSteps({ shop, userId, onMic, onGo }: { shop: Shop; userId?: string; onMic: () => void; onGo: (to: "reglages" | "stock") => void }) {
  const [hidden, setHidden] = useState(() => isHidden(shop.id));
  const [notif, setNotif] = useState(() => notificationState() === "acceptees");
  const [busy, setBusy] = useState(false);
  const steps = firstSteps(shop, notif);
  const left = stepsLeft(steps);
  if (hidden || left === 0) return null;
  const next = steps.find((s) => !s.done)?.id;
  const done = steps.length - left;

  function hide() {
    try {
      localStorage.setItem(hiddenKey(shop.id), "1");
    } catch {
      /* rien : la carte reviendra au prochain lancement */
    }
    setHidden(true);
  }

  async function act(id: StepId) {
    if (id === "metier") onGo("reglages");
    else if (id === "articles") onGo("stock");
    else if (id === "rappel") {
      setBusy(true);
      const state = await enableNotifications();
      if (state === "acceptees" && userId) await setSummaryHour(userId, 20);
      setNotif(state === "acceptees");
      setBusy(false);
    } else onMic();
  }

  const label: Record<StepId, string> = { metier: "Choisir", vente: "Parler", articles: "Mes articles", client: "Parler", rappel: "Activer" };

  return (
    <section className="sheet first-steps" aria-label="Premiers pas avec Jokko">
      <div className="fs-head">
        <div>
          <h2>Premiers pas</h2>
          <p className="note">{done} sur {steps.length} faits. Jokko te sera vraiment utile quand tout est coché.</p>
        </div>
        <button type="button" className="link" onClick={hide}>Masquer</button>
      </div>
      <div className="fs-bar" aria-hidden="true"><span style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      <ol className="fs-list">
        {steps.map((s) => (
          <li key={s.id} className={s.done ? "is-done" : s.id === next ? "is-next" : ""}>
            <span className="fs-check" aria-hidden="true">{s.done ? <Icon name="ok" size="sm" /> : null}</span>
            <span className="fs-text">
              <b>{s.title}</b>
              {!s.done && s.id === next && <small>{s.hint}</small>}
            </span>
            {!s.done && s.id === next && (
              <Button className="h-10 rounded-full px-4" disabled={busy} onClick={() => void act(s.id)}>
                {s.id === "vente" || s.id === "client" ? <Icon name="micro" size="sm" /> : null}
                {label[s.id]}
              </Button>
            )}
            <span className="sr-only">{s.done ? "fait" : "à faire"}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
