import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { type BatchCardData, batchTotals, describeAction, needsPartCost, needsSource, outflowAmount } from "@/assistant/batch";
import { useState } from "react";
import { BIG_CASH_OUT, CASH_SOURCE_LABELS, CASH_SOURCES, type CashSource } from "@/model";

const f = (n: number) => `${Math.round(n).toLocaleString("fr-FR").replace(/[\u202f\u00a0]/g, " ")} F`;

/**
 * Carte du chat : plusieurs opérations comprises dans un long texte. Le patron coche ce qu'il faut enregistrer
 * (les opérations déjà enregistrées aujourd'hui sont décochées), puis « Tout enregistrer ».
 */
export function BatchCard({ card, onToggle, onSource, onCost, onSave, onCancel }: { card: BatchCardData; onToggle: (i: number) => void; onSource?: (i: number, v: CashSource) => void; onCost?: (i: number, cost: number) => void; onSave: () => void; onCancel: () => void }) {
  const waiting = card.status === "attente";
  const kept = card.items.filter((i) => i.keep).length;
  const unanswered = card.items.filter(needsSource).length;
  const noCost = onCost ? card.items.filter(needsPartCost).length : 0;
  const [typed, setTyped] = useState<Record<number, string>>({});
  return (
    <div className={`order-card batch-card is-${card.status}`}>
      <p className="order-title">
        <b>{card.items.length} opération{card.items.length > 1 ? "s" : ""} comprise{card.items.length > 1 ? "s" : ""}</b>
        {waiting && <span> · vérifie, puis enregistre</span>}
      </p>
      <ul className="batch-lines">
        {card.items.map((item, i) => (
          <li key={i} className={item.keep ? "" : "is-off"}>
            <label>
              {waiting && <Checkbox checked={item.keep} onCheckedChange={() => onToggle(i)} aria-label={`Enregistrer : ${describeAction(item.action)}`} />}
              <span>
                <b>{describeAction(item.action)}</b>
                {item.cost !== undefined && item.action.amount ? <small>Achat {f(item.cost)} · bénéfice {f(item.action.amount - item.cost)}</small> : null}
                {item.part ? <small>Sort du stock : {item.part.name}{item.part.stock > 0 ? ` (il en reste ${item.part.stock})` : " (stock pas encore compté : reste à 0)"}</small> : null}
                {item.choices ? <small className="is-late">Plusieurs pièces possibles ({item.choices.join(", ")}) : rien ne sort du stock</small> : null}
                {item.service ? <small>Service : tout est main-d’œuvre (bénéfice {item.action.amount ? f(item.action.amount) : "?"})</small> : null}
                <small>« {item.line.slice(0, 120)} »</small>
                {item.action.paidWith && outflowAmount(item.action) > 0 && <small>{item.action.paidWith === "tiroir" ? "Sort du tiroir" : `Payé par ${CASH_SOURCE_LABELS[item.action.paidWith]} : la caisse ne bouge pas`}</small>}
                {waiting && item.keep && outflowAmount(item.action) >= BIG_CASH_OUT && onSource && (
                  <span className="batch-source" role="radiogroup" aria-label="D'où vient l'argent ?">
                    <small className={item.action.paidWith ? "" : "is-late"}>{item.action.paidWith ? "D'où vient l'argent :" : "Grosse somme : d'où vient l'argent ?"}</small>
                    {CASH_SOURCES.map((k) => (
                      <button key={k} type="button" role="radio" aria-checked={item.action.paidWith === k} className={item.action.paidWith === k ? "on" : ""} onClick={(e) => { e.preventDefault(); onSource(i, k); }}>
                        {k === "autre" ? "Autre" : CASH_SOURCE_LABELS[k]}
                      </button>
                    ))}
                  </span>
                )}
                {waiting && onCost && needsPartCost(item) && (
                  <span className="batch-source">
                    <small className="is-late">Pièce sans prix d'achat : combien t'a coûté la pièce ? (sinon le bénéfice sera faux)</small>
                    <input className="batch-cost" inputMode="numeric" placeholder="Prix d'achat (F)" value={typed[i] ?? ""} onClick={(e) => e.preventDefault()} onChange={(e) => setTyped({ ...typed, [i]: e.target.value })} />
                    <button type="button" className="on" disabled={!Number((typed[i] ?? "").replace(/\D/g, ""))} onClick={(e) => { e.preventDefault(); onCost(i, Number((typed[i] ?? "").replace(/\D/g, ""))); }}>OK</button>
                  </span>
                )}
                {item.duplicate && <small className="is-late">Déjà enregistré aujourd’hui ? ({item.duplicate}) — décoché</small>}
                {!item.action.amount && !item.action.unitPrice && <small className="is-late">Pas de montant : décoché</small>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {(() => {
        const t = batchTotals(card.items);
        return t.sales > 0 ? (
          <p className="note">
            Coché : ventes <b>{f(t.sales)}</b>{t.known > 0 ? <> · achats {f(t.cost)} · bénéfice <b>{f(t.profit)}</b></> : null}
            {t.unknown > 0 ? ` (${t.unknown} vente${t.unknown > 1 ? "s" : ""} sans prix d’achat : bénéfice non compté)` : ""}
          </p>
        ) : null;
      })()}
      {card.ignored.length > 0 && (
        <details className="batch-ignored">
          <summary>{card.ignored.length} ligne{card.ignored.length > 1 ? "s" : ""} pas enregistrée{card.ignored.length > 1 ? "s" : ""} (totaux, consignes…)</summary>
          <ul>{card.ignored.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </details>
      )}
      {waiting ? (
        <div className="order-actions">
          <Button className="h-11 rounded-full px-5" disabled={!kept || unanswered > 0 || noCost > 0} onClick={onSave}>{unanswered ? `Réponds d'abord : d'où vient l'argent (${unanswered})` : noCost ? `Mets d'abord le prix des pièces (${noCost})` : `Tout enregistrer (${kept})`}</Button>
          <Button variant="outline" className="h-11 rounded-full px-4" onClick={onCancel}>Annuler</Button>
        </div>
      ) : card.status === "enregistre" ? (
        <p className="note">✓ {card.done ?? 0} opération{(card.done ?? 0) > 1 ? "s" : ""} enregistrée{(card.done ?? 0) > 1 ? "s" : ""}.{card.failed?.length ? ` À refaire à la main : ${card.failed.join(" ; ")}` : ""}</p>
      ) : (
        <p className="note">Annulé : rien n’a été enregistré.</p>
      )}
    </div>
  );
}
