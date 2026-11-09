import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trialLeft, type TrialLeft } from "@/data/supabase";
import { isNativeApp } from "@/native";
import { type PlanName, type Shop, money } from "@/model";
import {
  daysLeft,
  effectivePlan,
  type Feature,
  FEATURE_PLAN,
  freshPlan,
  checkOnline,
  checkSubscriptionWave,
  declarePaid,
  myRequests,
  payOnline,
  paySubscriptionWave,
  PLAN_FEATURES,
  PLAN_LABELS,
  requestSubscription,
  type SubscriptionInfo,
  type SubscriptionRequest,
  subscriptionInfo,
  waveLinkFor,
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

type Step = "duree" | "payer" | "attente";
const STEP_ORDER: Record<Step, number> = { duree: 0, payer: 1, attente: 2 };
type Pending = { id: string; reference: string; amount: number; plan: "medium" | "avance" };

/** Écran « Mon offre » (patron) : offre actuelle, essai, choix d'une offre et paiement par le lien Wave de CFC. */
export function Plans({ shop, onPlanUpdated, initialChoice = null }: { shop: Shop; onPlanUpdated: (plan: Shop["plan"]) => void; initialChoice?: "medium" | "avance" | null }) {
  const current = effectivePlan(shop);
  const [info, setInfo] = useState<SubscriptionInfo | null>(null);
  const [requests, setRequests] = useState<SubscriptionRequest[]>([]);
  const [choice, setChoice] = useState<"medium" | "avance" | null>(initialChoice);
  const [months, setMonths] = useState(1);
  const [payer, setPayer] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [activated, setActivated] = useState<string | null>(null);
  const [qr, setQr] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState<TrialLeft | null>(null);
  const [txId, setTxId] = useState("");
  /** Parcours en une seule fenêtre : durée → paiement → validation par CFC. */
  const [step, setStep] = useState<Step | null>(null);
  const ordering = useRef(false);
  // Paiement automatique : l'agrégateur (tous les moyens) d'abord, sinon Wave Business de CFC, sinon vérification à la main.
  const online = info?.paydunya ? "paydunya" : info?.wave_auto ? "wave" : null;

  useEffect(() => {
    if (current.trial) void trialLeft(shop.id).then(setLeft);
  }, [shop.id, current.trial]);

  async function refresh() {
    const [i, r, p] = await Promise.all([subscriptionInfo(), myRequests(shop.id), freshPlan(shop.id)]);
    setInfo(i);
    setRequests(r);
    if (p) onPlanUpdated(p);
  }
  useEffect(() => {
    void refresh();
  }, [shop.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Arrivée depuis l'inscription avec une offre choisie : la fenêtre de paiement s'ouvre directement.
  useEffect(() => {
    if (initialChoice) setStep("duree");
  }, [initialChoice]);

  // Retour de Wave (ou paiement en cours) : on demande l'état quelques fois ; l'offre s'active dès que Wave confirme.
  const waiting = requests.filter((r) => r.status === "en_attente").map((r) => r.id).join(",");
  useEffect(() => {
    if (!online || !waiting) return;
    let tries = 0;
    let stop = false;
    const tick = async () => {
      for (const id of waiting.split(",")) {
        if (stop) return;
        if ((await (online === "paydunya" ? checkOnline(id) : checkSubscriptionWave(id))) === "active") {
          setActivated(id);
          setPending(null);
          setStep(null);
          void refresh();
          return;
        }
      }
      if (++tries < 40 && !stop) window.setTimeout(() => void tick(), tries < 10 ? 3000 : 15000);
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [online, waiting]); // eslint-disable-line react-hooks/exhaustive-deps

  async function payWave(id: string) {
    setBusy(true);
    setNote("");
    const r = online === "paydunya" ? await payOnline(id) : await paySubscriptionWave(id);
    setBusy(false);
    if (!r.ok) return setNote(r.message);
    window.location.href = r.url;
  }

  useEffect(() => {
    if (!pending || !info?.wave_link) return setQr("");
    void import("qrcode").then(({ default: QRCode }) => QRCode.toDataURL(waveLinkFor(info.wave_link!, pending.amount), { margin: 1, width: 240 })).then(setQr, () => setQr(""));
  }, [pending, info?.wave_link]);

  const price = (p: "medium" | "avance") => (p === "medium" ? info?.price_medium : info?.price_avance) ?? (p === "medium" ? 4000 : 8000);

  // Une demande déjà en attente : on la reprend au lieu d'en créer une autre.
  const waitingReq = requests.find((r) => r.status === "en_attente") ?? null;

  function start(p: "medium" | "avance") {
    setNote("");
    if (waitingReq?.declared_at) return openWaiting(waitingReq);
    setChoice(p);
    setMonths(waitingReq && waitingReq.plan === p ? waitingReq.months : 1);
    setPending(null);
    setStep("duree");
  }

  function openWaiting(r: SubscriptionRequest) {
    setNote("");
    setChoice(r.plan);
    setMonths(r.months);
    setPending({ id: r.id, reference: r.reference, amount: r.amount, plan: r.plan });
    setStep(r.declared_at ? "attente" : "payer");
  }

  function close() {
    setStep(null);
    setNote("");
  }

  async function order() {
    // Un seul envoi, même si on touche plusieurs fois très vite.
    if (!choice || ordering.current) return;
    ordering.current = true;
    setBusy(true);
    setNote("");
    const r = await requestSubscription(shop.id, choice, months, payer);
    setBusy(false);
    ordering.current = false;
    if (!r.ok) return setNote(r.message);
    setPending({ id: r.id, reference: r.reference, amount: r.amount, plan: r.plan ?? choice });
    void refresh();
    // Déjà déclarée payée : on attend la validation, rien d'autre à faire.
    if (r.declared) return setStep("attente");
    setStep("payer");
    // Paiement automatique : on ouvre Wave tout de suite.
    if (online) await payWave(r.id);
  }

  async function declare() {
    if (!pending || ordering.current) return;
    ordering.current = true;
    setBusy(true);
    const ok = await declarePaid(pending.id, txId);
    setBusy(false);
    ordering.current = false;
    if (!ok) return setNote("Pas de connexion internet. Réessaie.");
    setStep("attente");
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
        {current.trial && left && (
          <div className="trial-left">
            <p className="note">
              L’essai comprend un nombre limité d’utilisations de la voix et de l’IA. Il te reste :
            </p>
            <ul>
              <li><b className="num">{left.echange.reste}</b> / {left.echange.total} échanges en direct avec Jokko</li>
              <li><b className="num">{left.vocal.reste}</b> / {left.vocal.total} messages vocaux</li>
              <li><b className="num">{left.texte.reste}</b> / {left.texte.total} demandes écrites</li>
              <li><b className="num">{left.conseil.reste}</b> / {left.conseil.total} conseils de l’IA</li>
            </ul>
            <p className="note">Quand c’est fini, la voix s’arrête jusqu’au choix d’une offre. Les boutons de l’appli (ventes, stock, dettes, factures) marchent toujours.</p>
          </div>
        )}
        {initialChoice && current.trial && (
          <p className="note">Bienvenue ! Tu as choisi l’offre <b>{PLAN_LABELS[initialChoice]}</b>. Tes 14 premiers jours sont offerts en Avancé : tu peux payer maintenant, ou plus tard avant la fin de l’essai.</p>
        )}
      </div>

      {waitingReq && step === null && (
        <div className="sheet plan-pay" role="status">
          <h3>{waitingReq.declared_at ? "Paiement en cours de vérification" : "Demande en attente de paiement"}</h3>
          <p className="note">
            Offre <b>{PLAN_LABELS[waitingReq.plan]}</b> · {waitingReq.months} mois · <b className="num">{amount(waitingReq.amount)}</b> · réf <b>{waitingReq.reference}</b>.{" "}
            {waitingReq.declared_at ? "CFC vérifie ton paiement et active ton offre (en général dans l'heure)." : "Tu n'as pas encore payé."}
          </p>
          <Button className="h-12 rounded-full font-semibold" onClick={() => openWaiting(waitingReq)}>{waitingReq.declared_at ? "Voir" : "Continuer le paiement"}</Button>
        </div>
      )}

      <div className="plan-grid">
        {plans.map((p) => (
          <article key={p} className={`plan-card${p === "avance" ? " featured" : ""}${current.plan === p ? " is-current" : ""}`}>
            <h3>{PLAN_LABELS[p]}</h3>
            <p className="plan-price num">{p === "gratuit" ? "0 F" : amount(price(p))}<small>{p === "gratuit" ? "" : " / mois"}</small></p>
            <ul>{PLAN_FEATURES[p].map((f) => <li key={f}>{f}</li>)}</ul>
            {p !== "gratuit" && (
              <Button variant={p === "avance" ? "default" : "outline"} className="mt-auto h-11 rounded-full" disabled={Boolean(waitingReq?.declared_at)} onClick={() => start(p)}>
                {waitingReq?.declared_at ? "Paiement en vérification" : current.plan === p && !current.trial ? "Prolonger" : "Choisir"}
              </Button>
            )}
          </article>
        ))}
      </div>

      {activated && (
        <div className="sheet plan-pay" role="status">
          <h3><Icon name="ok" size="sm" className="jk-ok" /> Paiement reçu, offre activée</h3>
          <p className="note">Merci ! Wave a confirmé le paiement et ton offre est active tout de suite. Ton reçu est dans « Mes paiements » ci-dessous.</p>
        </div>
      )}

      {step && (
        <div className="legal-scrim" role="dialog" aria-modal="true" aria-labelledby="pay-title" onClick={close}>
          <article className="legal-sheet plan-steps" onClick={(e) => e.stopPropagation()}>
            <header className="legal-head">
              <h2 id="pay-title">{step === "attente" ? "C’est noté !" : `Offre ${PLAN_LABELS[(pending?.plan ?? choice) || "medium"]}`}</h2>
              <Button variant="outline" className="h-10 rounded-full px-4" onClick={close}>Fermer</Button>
            </header>
            <ol className="plan-stepper" aria-label="Étapes">
              {(["duree", "payer", "attente"] as const).map((s, i) => (
                <li key={s} className={step === s ? "on" : STEP_ORDER[s] < STEP_ORDER[step] ? "done" : ""}>{i + 1}. {s === "duree" ? "Durée" : s === "payer" ? "Paiement" : "Validation"}</li>
              ))}
            </ol>

            {step === "duree" && choice && (
              <>
                <p className="note">Combien de mois ?</p>
                <div className="pay-modes">
                  {[1, 2, 3, 6, 12].map((m) => <button key={m} type="button" className={months === m ? "on" : ""} onClick={() => setMonths(m)}>{m} mois</button>)}
                </div>
                <Input className="h-11" inputMode="tel" value={payer} onChange={(e) => setPayer(e.target.value)} placeholder="Numéro Wave qui va payer (facultatif)" />
                <p className="plan-total">Total : <b className="num">{amount(price(choice) * months)}</b></p>
                <Button className="h-12 w-full rounded-full font-semibold" disabled={busy} onClick={() => void order()}>{busy ? "Un instant…" : "Suivant : payer"}</Button>
                {note && <p className="note" data-tone="error">{note}</p>}
              </>
            )}

            {step === "payer" && pending && online && (
              <>
                <p className="note">
                  {online === "paydunya"
                    ? <>La page de paiement s’ouvre : choisis <b>Wave, Orange Money, Free Money ou ta carte</b>, et paie <b>{amount(pending.amount)}</b> à <b>CFC – Cissé Family Company</b>.</>
                    : <>Wave va s’ouvrir : confirme le paiement de <b>{amount(pending.amount)}</b> à <b>CFC – Cissé Family Company</b>.</>}{" "}
                  Ton offre s’active toute seule dès que le paiement est confirmé, de jour comme de nuit.
                </p>
                {info?.paydunya_mode === "test" && online === "paydunya" && <p className="note" data-tone="error">Mode test : aucun vrai argent n’est prélevé.</p>}
                <Button className="h-12 w-full rounded-full font-semibold" disabled={busy} onClick={() => void payWave(pending.id)}>{busy ? "Ouverture…" : online === "paydunya" ? "Ouvrir la page de paiement" : "Ouvrir Wave"}</Button>
                {note && <p className="note" data-tone="error">{note}</p>}
              </>
            )}

            {step === "payer" && pending && !online && (
              info?.wave_link ? (
                <>
                  <p className="plan-total">À payer : <b className="num">{amount(pending.amount)}</b> · réf <b className="plan-ref">{pending.reference}</b></p>
                  <ol className="install-steps">
                    <li>Scanne ce code avec ton appli <b>Wave</b>, ou touche « Ouvrir Wave ».</li>
                    <li>Paie <b>{amount(pending.amount)}</b> à <b>CFC – Cisse Family Company</b>.</li>
                    <li>Dans le message du paiement, écris la référence <b className="plan-ref">{pending.reference}</b>.</li>
                    <li>Reviens ici et touche <b>« J’ai payé »</b>.</li>
                  </ol>
                  {qr && <img className="wave-qr" src={qr} alt="QR code Wave de CFC" width={240} height={240} />}
                  <Button variant="outline" className="h-11 w-full rounded-full" onClick={() => window.open(waveLinkFor(info.wave_link!, pending.amount), "_blank", "noopener")}>Ouvrir Wave</Button>
                  <Input className="h-11" value={txId} onChange={(e) => setTxId(e.target.value)} placeholder="N° de transaction Wave (facultatif)" />
                  <Button className="h-12 w-full rounded-full font-semibold" disabled={busy} onClick={() => void declare()}>{busy ? "Un instant…" : "J’ai payé"}</Button>
                  {note && <p className="note" data-tone="error">{note}</p>}
                </>
              ) : (
                <p className="note">Le lien de paiement n'est pas encore prêt. Contacte CFC : cfallou26@gmail.com, avec la référence <b>{pending.reference}</b>.</p>
              )
            )}

            {step === "attente" && pending && (
              <>
                <p className="note"><Icon name="ok" size="sm" className="jk-ok" /> Merci ! CFC est prévenu. Il vérifie ton paiement de <b className="num">{amount(pending.amount)}</b> (réf <b>{pending.reference}</b>) et active ton offre, en général dans l’heure.</p>
                <p className="note">Tu n’as rien d’autre à faire. Tu verras « offre activée » ici dès que c’est fait.</p>
                <Button className="h-12 w-full rounded-full font-semibold" onClick={close}>Compris</Button>
              </>
            )}
          </article>
        </div>
      )}

      {requests.length > 0 && (
        <div className="sheet">
          <h3>Mes paiements</h3>
          <ul className="price-preview">
            {requests.map((r) => (
              <li key={r.id}>
                <span>{PLAN_LABELS[r.plan]} · {r.months} mois · <b>{r.reference}</b>{r.paid_at && <><br /><small>Payé {r.paid_via === "paydunya" ? "en ligne" : "par Wave"} le {date(r.paid_at)}{r.transaction_id ? ` · n° ${r.transaction_id}` : ""}</small></>}</span>
                <span>
                  {amount(r.amount)} · {r.status === "en_attente" ? "en attente du paiement" : r.status === "active" ? "activée" : "refusée"}
                  {r.status === "active" && <Icon name="ok" size="sm" className="jk-ok" label="Activée" />}
                  {r.status === "active" && <> · <button type="button" className="link" onClick={() => printReceipt(shop.name, r)}>Reçu</button></>}
                  {r.status === "en_attente" && online && <> · <button type="button" className="link" disabled={busy} onClick={() => void payWave(r.id)}>Payer</button></>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Reçu de paiement (CFC) : s'ouvre pour être imprimé ou enregistré en PDF. */
function printReceipt(shopName: string, r: SubscriptionRequest) {
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const paid = r.paid_at ?? r.created_at;
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reçu ${esc(r.reference)}</title>
<style>body{font-family:system-ui,Roboto,sans-serif;color:#17191F;max-width:560px;margin:24px auto;padding:0 16px}h1{font-size:22px;margin:0}table{width:100%;border-collapse:collapse;margin:18px 0}td{padding:8px 0;border-bottom:1px solid #eee}td:last-child{text-align:right;font-weight:600}.tot td{font-size:18px;border:0}small{color:#666}button{margin-top:16px;padding:12px 20px;border-radius:999px;border:0;background:#F6B800;font-weight:700}@media print{button{display:none}}</style></head><body>
<h1>Reçu de paiement</h1><small>CFC – Cissé Family Company · Jokko · jokkoapp.com</small>
<table><tr><td>Reçu n°</td><td>${esc(r.reference)}</td></tr><tr><td>Date</td><td>${new Date(paid).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</td></tr>
<tr><td>Boutique</td><td>${esc(shopName)}</td></tr><tr><td>Offre</td><td>Jokko ${esc(PLAN_LABELS[r.plan])} · ${r.months} mois</td></tr>
<tr><td>Moyen de paiement</td><td>${r.paid_via === "paydunya" ? "Paiement en ligne (PayDunya)" : r.paid_via === "wave" ? "Wave" : "Wave (vérifié par CFC)"}</td></tr>${r.transaction_id ? `<tr><td>N° de transaction</td><td>${esc(r.transaction_id)}</td></tr>` : ""}
<tr class="tot"><td>Total payé</td><td>${r.amount.toLocaleString("fr-FR")} F CFA</td></tr></table>
<small>Merci pour votre confiance. Contact : WhatsApp 77 567 47 25.</small><br><button onclick="print()">Imprimer ou enregistrer en PDF</button></body></html>`;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  // Dans l'application Android : le reçu est partagé (WhatsApp, impression…) ; sur le site : nouvel onglet.
  if (isNativeApp()) a.download = `Recu-Jokko-${r.reference}.html`;
  else {
    a.target = "_blank";
    a.rel = "noopener";
  }
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
