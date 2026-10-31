import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type PlanName, type Shop, money } from "@/model";
import {
  daysLeft,
  effectivePlan,
  type Feature,
  FEATURE_PLAN,
  freshPlan,
  myRequests,
  PLAN_FEATURES,
  PLAN_LABELS,
  requestSubscription,
  type SubscriptionInfo,
  type SubscriptionRequest,
  subscriptionInfo,
} from "@/data/plans";

const amount = (n: number) => money(n).replace(/ /g, " ");
const date = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

/** Petit encart « disponible avec l'offre … » à la place d'un écran réservé. */
export function Upsell({ feature, title, onPlans }: { feature: Feature; title: string; onPlans: () => void }) {
  const plan = FEATURE_PLAN[feature];
  return (
    <section className="sheet upsell">
      <span className="offer-tag">Offre {PLAN_LABELS[plan]}</span>
      <h2>{title}</h2>
      <ul>{PLAN_FEATURES[plan].slice(1).map((f) => <li key={f}>{f}</li>)}</ul>
      <Button className="h-12 rounded-full px-6 font-semibold" onClick={onPlans}>Voir les offres</Button>
    </section>
  );
}

/** Écran « Mon offre » (patron) : offre actuelle, essai, choix d'une offre et paiement par le lien Wave de CFC. */
export function Plans({ shop, onPlanUpdated }: { shop: Shop; onPlanUpdated: (plan: Shop["plan"]) => void }) {
  const current = effectivePlan(shop);
  const [info, setInfo] = useState<SubscriptionInfo | null>(null);
  const [requests, setRequests] = useState<SubscriptionRequest[]>([]);
  const [choice, setChoice] = useState<"medium" | "avance" | null>(null);
  const [months, setMonths] = useState(1);
  const [payer, setPayer] = useState("");
  const [pending, setPending] = useState<{ reference: string; amount: number } | null>(null);
  const [qr, setQr] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [i, r, p] = await Promise.all([subscriptionInfo(), myRequests(shop.id), freshPlan(shop.id)]);
    setInfo(i);
    setRequests(r);
    if (p) onPlanUpdated(p);
  }
  useEffect(() => {
    void refresh();
  }, [shop.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!pending || !info?.wave_link) return setQr("");
    void import("qrcode").then(({ default: QRCode }) => QRCode.toDataURL(info.wave_link!, { margin: 1, width: 240 })).then(setQr, () => setQr(""));
  }, [pending, info?.wave_link]);

  const price = (p: "medium" | "avance") => (p === "medium" ? info?.price_medium : info?.price_avance) ?? (p === "medium" ? 3000 : 7500);

  async function order() {
    if (!choice) return;
    setBusy(true);
    setNote("");
    const r = await requestSubscription(shop.id, choice, months, payer);
    setBusy(false);
    if (!r.ok) return setNote(r.message);
    setPending({ reference: r.reference, amount: r.amount });
    void refresh();
  }

  const plans: PlanName[] = ["gratuit", "medium", "avance"];

  return (
    <section className="plans">
      <div className="sheet">
        <h2>Mon offre</h2>
        <p className="plans-current">
          <span className="offer-tag">{PLAN_LABELS[current.plan]}{current.trial ? " · essai" : ""}</span>
          {current.trial && current.until && <> Essai gratuit : encore <b>{daysLeft(current.until)} jour(s)</b> (jusqu'au {date(current.until)}).</>}
          {!current.trial && current.plan !== "gratuit" && current.until && <> Payée jusqu'au <b>{date(current.until)}</b>.</>}
          {current.plan === "gratuit" && <> Tu peux passer à une offre supérieure quand tu veux.</>}
        </p>
      </div>

      <div className="plan-grid">
        {plans.map((p) => (
          <article key={p} className={`plan-card${p === "avance" ? " featured" : ""}${current.plan === p ? " is-current" : ""}`}>
            <h3>{PLAN_LABELS[p]}</h3>
            <p className="plan-price num">{p === "gratuit" ? "0 F" : amount(price(p))}<small>{p === "gratuit" ? "" : " / mois"}</small></p>
            <ul>{PLAN_FEATURES[p].map((f) => <li key={f}>{f}</li>)}</ul>
            {p !== "gratuit" && (
              <Button variant={choice === p ? "default" : "outline"} className="mt-auto h-11 rounded-full" onClick={() => { setChoice(p); setPending(null); }}>
                {current.plan === p && !current.trial ? "Prolonger" : "Choisir"}
              </Button>
            )}
          </article>
        ))}
      </div>

      {choice && !pending && (
        <div className="sheet plan-order">
          <h3>Offre {PLAN_LABELS[choice]}</h3>
          <div className="pay-modes">
            {[1, 3, 6, 12].map((m) => <button key={m} type="button" className={months === m ? "on" : ""} onClick={() => setMonths(m)}>{m} mois</button>)}
          </div>
          <Input className="h-11" inputMode="tel" value={payer} onChange={(e) => setPayer(e.target.value)} placeholder="Numéro Wave qui va payer (facultatif)" />
          <p className="plan-total">Total : <b className="num">{amount(price(choice) * months)}</b></p>
          <Button className="h-12 rounded-full font-semibold" disabled={busy} onClick={() => void order()}>{busy ? "Un instant…" : "Payer avec Wave"}</Button>
          {note && <p className="note" data-tone="error">{note}</p>}
        </div>
      )}

      {pending && (
        <div className="sheet plan-pay">
          <h3>Paiement Wave · {amount(pending.amount)}</h3>
          {info?.wave_link ? (
            <>
              <ol className="install-steps">
                <li>Scanne ce code avec ton appli <b>Wave</b>, ou touche « Ouvrir Wave ».</li>
                <li>Paie <b>{amount(pending.amount)}</b> à <b>CFC – Cisse Family Company</b>.</li>
                <li>Dans le message du paiement, écris la référence <b className="plan-ref">{pending.reference}</b>.</li>
              </ol>
              {qr && <img className="wave-qr" src={qr} alt="QR code Wave de CFC" width={240} height={240} />}
              <Button className="h-11 rounded-full" onClick={() => window.open(info.wave_link!, "_blank", "noopener")}>Ouvrir Wave</Button>
              <p className="note">Ton offre est activée dès que CFC a vu le paiement (en général dans la journée). Tu n'as rien d'autre à faire.</p>
            </>
          ) : (
            <p className="note">Le lien de paiement n'est pas encore prêt. Contacte CFC : cfallou26@gmail.com, avec la référence <b>{pending.reference}</b>.</p>
          )}
        </div>
      )}

      {requests.length > 0 && (
        <div className="sheet">
          <h3>Mes demandes</h3>
          <ul className="price-preview">
            {requests.map((r) => (
              <li key={r.id}>
                <span>{PLAN_LABELS[r.plan]} · {r.months} mois · <b>{r.reference}</b></span>
                <span>{amount(r.amount)} · {r.status === "en_attente" ? "en attente du paiement" : r.status === "active" ? "✓ activée" : "refusée"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
