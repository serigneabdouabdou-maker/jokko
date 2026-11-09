import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { forfaitReste, type ForfaitReste, QUOTA_EVENT } from "@/data/supabase";
import { daysLeft, effectivePlan, perDay, valueRecap } from "@/data/plans";
import { metierOf } from "@/data/metiers";
import { money, type Shop } from "@/model";

const LABEL: Record<string, [string, string]> = {
  echange: ["conversation en direct", "conversations en direct"],
  vocal: ["message vocal", "messages vocaux"],
  texte: ["demande écrite", "demandes écrites"],
  image: ["essayage", "essayages"],
};

/** Recharge le compteur au démarrage, puis après chaque refus ou toutes les 2 minutes (les vocaux consomment). */
function useReste(shopId: string): ForfaitReste | null {
  const [left, setLeft] = useState<ForfaitReste | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => void forfaitReste(shopId).then((r) => alive && setLeft(r));
    load();
    const timer = window.setInterval(load, 120_000);
    window.addEventListener(QUOTA_EVENT, load);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener(QUOTA_EVENT, load);
    };
  }, [shopId]);
  return left;
}

/**
 * Petit compteur sur l'écran « Parler » (essai et gratuit seulement) : le commerçant voit ce qu'il lui reste
 * avant que ça s'arrête, et il passe à l'offre d'un toucher. Rien pour une offre payante.
 */
export function ForfaitChip({ shop, onPlans }: { shop: Shop; onPlans?: () => void }) {
  const left = useReste(shop.id);
  if (!left) return null;
  const items = Object.entries(left.reste).filter(([k]) => k !== "image" || metierOf(shop.activity).id === "couture");
  const low = items.some(([, v]) => v && v.reste <= Math.max(1, Math.round(v.total * 0.2)));
  const empty = items.length > 0 && items.every(([, v]) => v && v.reste === 0);
  const plan = effectivePlan(shop);
  const days = left.offre === "essai" ? daysLeft(plan.until) : null;
  const head = left.offre === "essai"
    ? `Essai gratuit${days != null ? ` : encore ${days} jour${days > 1 ? "s" : ""}` : ""}`
    : "Offre gratuite : ce mois";
  return (
    <section className="forfait-chip" data-tone={empty ? "bad" : low ? "warn" : "ok"}>
      <p><b>{head}</b></p>
      <p className="note">
        {empty
          ? "Ta voix et ton IA sont finies. Les boutons de l'appli marchent toujours."
          : `Il te reste ${items.map(([k, v]) => `${v?.reste} ${LABEL[k][v?.reste === 1 ? 0 : 1]}`).join(", ")}.`}
      </p>
      {onPlans && (low || empty || (days != null && days <= 3)) && (
        <Button size="sm" className="rounded-full" onClick={onPlans}>Garder Jokko sans limite</Button>
      )}
    </section>
  );
}

/**
 * En haut de « Mon offre » : ce que Jokko a déjà fait pour cette boutique, et le prix ramené à la journée.
 * Des chiffres vrais, tirés de ses propres ventes : rien d'inventé.
 */
export function ValueRecapCard({ shop, priceMedium }: { shop: Shop; priceMedium: number }) {
  const r = valueRecap(shop);
  if (r.ventes === 0 && r.clients === 0) {
    return (
      <div className="value-recap">
        <h3>Essaie Jokko sur une vraie journée</h3>
        <p className="note">Dis tes ventes à voix haute pendant une journée : le soir, ta caisse et ton bénéfice sont prêts, sans cahier.</p>
      </div>
    );
  }
  return (
    <div className="value-recap">
      <h3>Ce que Jokko a fait pour toi (30 jours)</h3>
      <ul>
        <li><b className="num">{r.ventes}</b> ventes notées · <b className="num">{money(r.montant)}</b></li>
        {r.clients > 0 && <li><b className="num">{r.clients}</b> clients dans ton carnet</li>}
        {r.dettes > 0 && <li><b className="num">{money(r.dettes)}</b> de dettes suivies (de l'argent qui ne se perd pas)</li>}
      </ul>
      <p className="note">L'offre Médium coûte <b>{money(perDay(priceMedium))} par jour</b>. Une seule dette oubliée coûte plus cher.</p>
    </div>
  );
}
