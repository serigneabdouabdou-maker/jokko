/**
 * « D'où vient l'argent ? » (16/11/2026, règle de Fallou) : tiroir, Wave, Orange Money ou autre.
 * Seul « tiroir » baisse la caisse attendue ; les autres sont gardés comme justificatif.
 * À partir de BIG_CASH_OUT, rien n'est choisi d'avance : le commerçant doit répondre.
 */
import { BIG_CASH_OUT, CASH_SOURCE_LABELS, CASH_SOURCES, type CashSource, money } from "@/model";

/** Choix de départ : tiroir pour une petite somme, rien pour une grosse (il faut répondre). */
export const defaultCashSource = (amount: number): CashSource | "" => (amount >= BIG_CASH_OUT ? "" : "tiroir");

export function CashSourcePicker({ amount, value, onChange, title = "D'où vient l'argent ?" }: { amount: number; value: CashSource | ""; onChange: (v: CashSource) => void; title?: string }) {
  return (
    <fieldset className="licence-paid cash-source">
      <legend>{title}</legend>
      <div className="seg licence-paid-choices" role="radiogroup" aria-label={title}>
        {CASH_SOURCES.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={value === k} className={value === k ? "on" : ""} onClick={() => onChange(k)}>
            {CASH_SOURCE_LABELS[k]}
          </button>
        ))}
      </div>
      {value === "tiroir" && amount > 0 && <small className="note" data-tone={amount >= BIG_CASH_OUT ? "error" : undefined}>{money(amount)} sortent du tiroir : la caisse attendue baisse d'autant.</small>}
      {value && value !== "tiroir" && <small className="note">La caisse ne bouge pas. Jokko garde « {CASH_SOURCE_LABELS[value]} » comme justificatif.</small>}
      {!value && <small className="note" data-tone="error">Grosse somme ({money(amount)}) : choisis d'où vient l'argent avant d'enregistrer.</small>}
    </fieldset>
  );
}
