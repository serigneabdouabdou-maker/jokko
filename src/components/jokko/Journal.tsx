import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Shop } from "@/model";
import { describe, type JournalKind, type JournalRow } from "@/data/journal";
import { loadJournal, loadTeam, type Member } from "@/data/team";

type Filter = "tout" | "alertes" | "vente" | "stock" | "argent";
const FILTERS: Array<[Filter, string]> = [
  ["tout", "Tout"],
  ["alertes", "À vérifier"],
  ["vente", "Ventes"],
  ["stock", "Stock"],
  ["argent", "Dépenses"],
];

const when = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

/** Journal (patron) : tout ce qui a été fait dans la boutique, par qui et quand. Personne ne peut l'effacer. */
export function Journal({ shop }: { shop: Shop }) {
  const [rows, setRows] = useState<JournalRow[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [filter, setFilter] = useState<Filter>("tout");
  const [state, setState] = useState<"charge" | "ok" | "erreur">("charge");

  async function refresh() {
    setState("charge");
    try {
      const [journal, team] = await Promise.all([loadJournal(shop.id), loadTeam(shop.id)]);
      setRows(journal);
      setMembers(team.members);
      setState("ok");
    } catch {
      setState("erreur");
    }
  }

  useEffect(() => {
    void refresh();
  }, [shop.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const lines = useMemo(
    () =>
      rows
        .map((row) => ({ row, line: describe(row) }))
        .filter(({ line }) => filter === "tout" || (filter === "alertes" ? line.alert : line.kind === (filter as JournalKind))),
    [rows, filter],
  );
  const who = (userId: string | null) => {
    const m = members.find((x) => x.user_id === userId);
    return m ? m.name || (m.role === "patron" ? "Patron" : m.phone.replace(/^221/, "")) : userId ? "Ancien membre" : "Système";
  };

  return (
    <section className="sheet journal">
      <div className="sheet-head">
        <h2>Journal</h2>
        <Button variant="outline" className="h-9 rounded-full px-4" onClick={() => void refresh()}>Actualiser</Button>
        <span className="note">Chaque vente, annulation, changement de prix ou de stock est noté ici, avec le nom de la personne. Personne ne peut l'effacer.</span>
      </div>
      <div className="journal-filters" role="tablist" aria-label="Filtrer">
        {FILTERS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={filter === id} className={filter === id ? "on" : ""} onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>
      {state === "charge" && <p className="note">Chargement…</p>}
      {state === "erreur" && <p className="note" data-tone="error">Pas de connexion internet. Touche Actualiser quand le réseau revient.</p>}
      {state === "ok" && lines.length === 0 && <p className="note">Rien à afficher pour l'instant.</p>}
      <ol className="journal-list">
        {lines.map(({ row, line }) => (
          <li key={row.id} className={line.alert ? "is-alert" : ""}>
            <time className="num">{when(row.at)}</time>
            <b>{who(row.user_id)}</b>
            <span>{line.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
