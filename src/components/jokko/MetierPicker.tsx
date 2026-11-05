import { METIERS, metierOf } from "@/data/metiers";
import { Input } from "@/components/ui/input";

/**
 * Choix du métier : une liste simple ; « Autre activité » laisse écrire. Jokko se règle selon ce choix
 * (Atelier pour les réparateurs, dates de péremption pour les pharmacies, vocabulaire donné à Gemini).
 */
export function MetierPicker({ id, value, onChange }: { id?: string; value: string; onChange: (activity: string) => void }) {
  const metier = metierOf(value);
  const listed = METIERS.some((m) => m.label === value);
  const selected = listed ? value : value.trim() && metier.id !== "autre" ? metier.label : value.trim() ? "Autre activité" : METIERS[0].label;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <select
        id={id}
        className="h-11 rounded-md border px-3"
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Métier"
      >
        {METIERS.map((m) => (
          <option key={m.id} value={m.label}>{m.label}</option>
        ))}
      </select>
      {selected === "Autre activité" && (
        <Input className="h-11" value={listed ? "" : value} onChange={(e) => onChange(e.target.value)} placeholder="Écris ton activité (ex. salon de coiffure)" aria-label="Autre activité" />
      )}
    </div>
  );
}
