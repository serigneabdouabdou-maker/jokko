import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "./Icon";
import { type Shop, money } from "@/model";
import { type Segment, weeklyNudge } from "@/data/clientFiles";

const key = (shopId: string) => `jokko.relance-semaine.${shopId}`;
const doneThisWeek = (shopId: string, week: string) => {
  try {
    return localStorage.getItem(key(shopId)) === week;
  } catch {
    return false;
  }
};

/**
 * Chaque semaine (à partir du lundi), en haut de l'écran Parler : « 3 clients fidèles ne sont pas venus depuis
 * 2 mois : les relancer ? » et les dettes en retard. Un toucher ouvre la campagne WhatsApp du bon groupe.
 * « Plus tard » le cache jusqu'au lundi suivant (sur ce téléphone).
 */
export function ClientNudge({ shop, onOpen }: { shop: Shop; onOpen: (segment: Segment) => void }) {
  const nudge = useMemo(() => weeklyNudge(shop), [shop]);
  const [hidden, setHidden] = useState(() => (nudge ? doneThisWeek(shop.id, nudge.week) : true));
  if (!nudge || hidden) return null;

  function close() {
    try {
      localStorage.setItem(key(shop.id), nudge!.week);
    } catch {
      /* navigation privée : la carte reviendra au prochain lancement */
    }
    setHidden(true);
  }

  const names = (list: typeof nudge.relancer) => list.slice(0, 3).map((f) => f.client.name.split(" ")[0]).join(", ") + (list.length > 3 ? "…" : "");

  return (
    <section className="sheet client-nudge" aria-label="Clients à relancer cette semaine">
      <div className="fs-head">
        <h2>Tes clients cette semaine</h2>
        <button type="button" className="link" onClick={close}>Plus tard</button>
      </div>
      {nudge.relancer.length > 0 && (
        <div className="nudge-row">
          <p>
            <b>{nudge.relancer.length} client{nudge.relancer.length > 1 ? "s" : ""} fidèle{nudge.relancer.length > 1 ? "s" : ""}</b> ne {nudge.relancer.length > 1 ? "sont" : "est"} pas venu{nudge.relancer.length > 1 ? "s" : ""} depuis 2 mois ({names(nudge.relancer)}). Les relancer ?
          </p>
          <Button className="h-10 rounded-full px-4" onClick={() => { close(); onOpen("relancer"); }}>
            <Icon name="whatsapp" size="sm" /> Relancer
          </Button>
        </div>
      )}
      {nudge.payeurs.length > 0 && (
        <div className="nudge-row">
          <p>
            <b>{nudge.payeurs.length} dette{nudge.payeurs.length > 1 ? "s" : ""} en retard</b> : {money(nudge.owed)} à récupérer ({names(nudge.payeurs)}).
          </p>
          <Button variant="outline" className="h-10 rounded-full px-4" onClick={() => { close(); onOpen("payeur"); }}>
            <Icon name="whatsapp" size="sm" /> Rappeler
          </Button>
        </div>
      )}
    </section>
  );
}
