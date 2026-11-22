import { useEffect, useMemo, useState } from "react";
import { Icon } from "./Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Shop, money } from "@/model";
import { supabase } from "@/data/supabase";
import { loadShops, type LoadClient } from "@/data/sync";
import { buildInsights, insightsForAdvisor } from "@/data/insights";
import { expiringSoon } from "@/data/metiers";
import { type Advice, askAdvisor } from "@/assistant/client";
import { activityForAdvisor } from "@/data/workshopStats";
import { metierOf } from "@/data/metiers";
import { commerceForAdvisor } from "@/data/advisorContext";
import { quoteLine, quoteStats } from "@/data/quotes";

/** Ce que le patron dit de son quartier et de ses concurrents : gardé sur l'appareil, envoyé au Conseiller. */
const noteKey = (id: string) => `jokko.conseil.${id}`;
const readNote = (id: string) => { try { return localStorage.getItem(noteKey(id)) ?? ""; } catch { return ""; } };

const QUESTIONS_ALL = [
  "Comment gagner plus de clients ce mois ?",
  "Que dire à un client qui trouve mon prix trop cher ?",
  "Écris-moi un statut WhatsApp pour attirer des clients.",
  "Comment faire revenir mes anciens clients ?",
];
const QUESTIONS_REPAIR = [
  "Pourquoi je perds des clients et à quel prix je peux les garder ?",
  "Les concurrents baissent leurs prix : que faire sans travailler à perte ?",
  "Quel service je dois pousser cette semaine ?",
  "Quelles pièces acheter en plus grande quantité ?",
  "Est-ce que je peux aller acheter moi-même en Chine ?",
];

const amount = (n: number) => money(n).replace(/ /g, " ");
const LEVELS = { urgent: "Urgent", important: "Important", info: "Bon à savoir" } as const;

/**
 * Conseiller (offre Avancé) : le diagnostic calculé par Jokko, puis les conseils de l'IA
 * et les réponses aux questions du patron. Les chiffres viennent toujours du calcul, jamais de l'IA.
 */
export function Advisor({ shop: local }: { shop: Shop }) {
  const [shop, setShop] = useState<Shop>(local);
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [situation, setSituation] = useState(() => readNote(local.id));
  const [copied, setCopied] = useState(-1);

  // Les ventes du vendeur faites ailleurs : on recharge la boutique depuis le serveur (sinon la copie du téléphone).
  useEffect(() => {
    setShop(local);
    void loadShops(supabase as unknown as LoadClient, [local.id]).then(
      (s) => s[0] && setShop(s[0]),
      () => undefined,
    );
  }, [local.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const insights = useMemo(() => buildInsights(shop), [shop]);
  const soon = insights.products.filter((p) => p.daysLeft !== null && p.daysLeft <= 14).sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));

  const repairer = metierOf(shop.activity).id === "reparation";
  const lost = useMemo(() => quoteStats(shop), [shop]);
  async function ask(withQuestion: boolean, asked = question) {
    setBusy(true);
    setNote("");
    // Réparateur : l'IA lit aussi le détail de l'atelier (écrans, plaquettes, services…) et l'objectif Chine (22/11/2026).
    const base = insightsForAdvisor(insights, shop.name, shop.activity, expiringSoon(shop.products, 60).map((p) => ({ nom: p.name, quantite: p.lotQty, jours_restants: p.daysLeft, ...(p.lotRef ? { lot: p.lotRef } : {}) })));
    // Tout le commerce de la boutique (22/11/2026) : clients, prix donnés et clients perdus, échelle des prix, services, concurrents.
    try { localStorage.setItem(noteKey(shop.id), situation.slice(0, 400)); } catch { /* appareil sans stockage */ }
    const full = { ...base, ...(repairer ? activityForAdvisor(shop) : {}), ...commerceForAdvisor(shop, situation) };
    const result = await askAdvisor(full, withQuestion ? asked : null);
    setBusy(false);
    if (result.ok) setAdvice(result.data);
    else setNote(result.message);
  }

  return (
    <section className="advisor">
      <div className="sheet">
        <div className="sheet-head">
          <h2>Conseiller</h2>
          <span className="offer-tag">Offre Avancé</span>
        </div>
        <p className="note">Les 30 derniers jours de {shop.name}. Tous les chiffres sont calculés par Jokko à partir de tes ventes.</p>
        <div className="kpis">
          <article>
            <span>Ventes (30 jours)</span>
            <b className="num">{amount(insights.revenue)}</b>
            {insights.trendPct !== null && <small data-tone={insights.trendPct < 0 ? "bad" : "good"}>{insights.trendPct > 0 ? "+" : ""}{insights.trendPct} % sur le mois d'avant</small>}
          </article>
          <article className="kpi-main" data-tone={insights.netProfit < 0 ? "bad" : "good"}><span>Bénéfice net</span><b className="num">{amount(insights.netProfit)}</b></article>
          <article><span>Vente moyenne</span><b className="num">{amount(insights.averageSale)}</b><small>{insights.salesCount} ventes</small></article>
          <article><span>Dettes en retard</span><b className="num">{amount(insights.overdueTotal)}</b><small>sur {amount(insights.debtTotal)}</small></article>
        </div>
      </div>

      <div className="sheet">
        <h3>Ce que Jokko a remarqué</h3>
        {insights.findings.length === 0 ? (
          <p className="note">Rien d'inquiétant. Continue d'enregistrer tes ventes et tes prix d'achat : le diagnostic sera plus précis.</p>
        ) : (
          <ul className="findings">
            {insights.findings.map((f) => (
              <li key={f.id} className={`is-${f.level}`}>
                <span className="finding-level">{LEVELS[f.level]}</span>
                <b>{f.title}</b>
                <p>{f.detail}</p>
                <p className="finding-action jk-notice"><Icon name="suivant" size="sm" /><span>{f.action}</span></p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {soon.length > 0 && (
        <div className="sheet">
          <h3>À commander bientôt</h3>
          <ul className="price-preview">
            {soon.map((p) => (
              <li key={p.id}>
                <span>{p.name} · reste {p.stock} {p.unit} ({p.daysLeft} j)</span>
                <b className="num">{p.reorder ? `commander ${p.reorder} ${p.unit}` : "ça va"}</b>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="sheet">
        <h3>Conseils de l'IA</h3>
        <p className="note">L'IA lit ce diagnostic et propose les actions les plus utiles cette semaine. Elle lit tes ventes, tes clients (en chiffres), les prix donnés et les clients perdus ; elle ne voit jamais les numéros de téléphone de tes clients.</p>
        {lost.given > 0 && <p className="note">{quoteLine(lost)}</p>}
        <label className="advisor-situation">
          <span>Ton quartier, tes concurrents (facultatif)</span>
          <textarea rows={2} maxLength={400} value={situation} onChange={(e) => setSituation(e.target.value)} placeholder="Ex. 2 réparateurs à côté, ils font l'écran BF6 à 7 000 F, moi je donne une garantie." />
        </label>
        <Button className="h-12 rounded-full px-6 font-semibold" disabled={busy} onClick={() => void ask(false)}>{busy ? "Le conseiller réfléchit…" : advice ? "Redemander des conseils" : "Demander conseil"}</Button>
        <div className="advisor-chips">
          {[...(repairer ? QUESTIONS_REPAIR : []), ...QUESTIONS_ALL].map((q) => (
              <button key={q} type="button" className="chip" disabled={busy} onClick={() => { setQuestion(q); void ask(true, q); }}>{q}</button>
            ))}
          </div>
        <form className="advisor-ask" onSubmit={(e) => { e.preventDefault(); if (question.trim() && !busy) void ask(true); }}>
          <Input className="h-11" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ta question : quel article arrêter ? comment gagner plus ?" />
          <Button type="submit" variant="outline" className="h-11 rounded-full px-5" disabled={busy || !question.trim()}>Demander</Button>
        </form>
        {note && <p className="note" data-tone="error">{note}</p>}
        {advice && (
          <div className="advice">
            {advice.reponse && <p className="advice-answer">{advice.reponse}</p>}
            <p className="advice-resume">{advice.resume}</p>
            <ol className="advice-actions">
              {advice.actions.map((a, k) => (
                <li key={`${a.titre}-${k}`}>
                  <b>{a.titre}</b>
                  {a.pourquoi && <p><span>Pourquoi :</span> {a.pourquoi}</p>}
                  {a.comment && <p><span>Comment :</span> {a.comment}</p>}
                  {a.impact && <p className="advice-impact">{a.impact}</p>}
                </li>
              ))}
            </ol>
            {advice.messages && advice.messages.length > 0 && (
              <div className="advice-messages">
                <h4>Textes prêts</h4>
                {advice.messages.map((m, k) => (
                  <article key={`${m.pour}-${k}`}>
                    <b>{m.pour}</b>
                    <p>{m.texte}</p>
                    <div className="row-actions">
                      <Button variant="outline" className="h-10 rounded-full px-4" onClick={() => { void navigator.clipboard?.writeText(m.texte).then(() => setCopied(k), () => undefined); }}>{copied === k ? "Copié ✓" : "Copier"}</Button>
                      <Button asChild variant="outline" className="h-10 rounded-full px-4"><a href={`https://wa.me/?text=${encodeURIComponent(m.texte)}`} target="_blank" rel="noreferrer">WhatsApp</a></Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
            <p className="note">Conseils généraux, à adapter à ta boutique. Pour une question d'impôts, de droit ou d'emprunt, demande à un professionnel.</p>
          </div>
        )}
      </div>
    </section>
  );
}
