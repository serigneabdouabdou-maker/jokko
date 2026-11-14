import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { type BatchCardData, batchTotals, describeAction } from "@/assistant/batch";

const f = (n: number) => `${Math.round(n).toLocaleString("fr-FR").replace(/[\u202f\u00a0]/g, " ")} F`;

/**
 * Carte du chat : plusieurs opérations comprises dans un long texte. Le patron coche ce qu'il faut enregistrer
 * (les opérations déjà enregistrées aujourd'hui sont décochées), puis « Tout enregistrer ».
 */
export function BatchCard({ card, onToggle, onSave, onCancel }: { card: BatchCardData; onToggle: (i: number) => void; onSave: () => void; onCancel: () => void }) {
  const waiting = card.status === "attente";
  const kept = card.items.filter((i) => i.keep).length;
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
                {item.service ? <small>Service : tout est main-d’œuvre (bénéfice {item.action.amount ? f(item.action.amount) : "?"})</small> : null}
                <small>« {item.line.slice(0, 120)} »</small>
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
          <Button className="h-11 rounded-full px-5" disabled={!kept} onClick={onSave}>Tout enregistrer ({kept})</Button>
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
