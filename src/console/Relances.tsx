import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { intlPhone, type Relance, relanceMark, relanceMessage, relancesList } from "@/data/guard";
import { metierOf } from "@/data/metiers";

const RAISON: Record<Relance["raison"], string> = { fini: "Essai fini", epuise: "Essai de la voix épuisé", bientot: "Essai fini dans moins de 2 jours" };
const ISSUE: Record<NonNullable<Relance["issue"]>, string> = { paye: "✓ A payé", rappeler: "À rappeler", non: "Pas intéressé" };
const show = (tel: string) => tel.replace(/^221/, "").replace(/(\d{2})(\d{3})(\d{2})(\d{2})/, "$1 $2 $3 $4");

/**
 * Console : les commerçants à appeler au bon moment (essai qui se termine ou épuisé).
 * Un toucher pour appeler, un toucher pour WhatsApp (message prêt avec ses vraies ventes), puis on note le résultat.
 */
export function RelancesTab() {
  const [rows, setRows] = useState<Relance[] | null>(null);
  const [note, setNote] = useState("");

  async function refresh() {
    setRows(await relancesList());
  }
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 120_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!rows) return <p className="note">Chargement… (connecte-toi avec le compte admin et le code de sécurité)</p>;

  const todo = rows.filter((r) => !r.issue || r.issue === "rappeler");
  const paid = rows.filter((r) => r.issue === "paye").length;
  const called = rows.filter((r) => r.issue).length;

  async function mark(r: Relance, issue: "paye" | "rappeler" | "non") {
    const ok = await relanceMark(r.shop_id, issue);
    setNote(ok ? `✓ ${r.nom} : ${ISSUE[issue]}.${issue === "paye" ? " Active son offre dans l'onglet Paiements dès que tu vois l'argent." : ""}` : "Pas enregistré, réessaie.");
    void refresh();
  }

  return (
    <div className="cx-stack">
      <section className="cx-kpis">
        <article className="cx-kpi" data-tone={todo.length ? "warn" : "good"}><span>À appeler</span><b className="num">{todo.length}</b><small>essais qui finissent</small></article>
        <article className="cx-kpi"><span>Appelés</span><b className="num">{called}</b><small>60 derniers jours</small></article>
        <article className="cx-kpi" data-tone="good"><span>Ont payé</span><b className="num">{paid}</b><small>{called ? `${Math.round((paid / called) * 100)} % des appels` : "—"}</small></article>
      </section>
      <p className="note">Le meilleur moment pour appeler : juste quand l’essai se termine. Parle de ses vraies ventes, propose de l’aider à payer avec Wave pendant l’appel.</p>
      {note && <p className="note" role="status">{note}</p>}

      {rows.length === 0 && <section className="cx-card"><p>Personne à appeler pour l’instant. Tu recevras une notification dès qu’un essai se termine.</p></section>}
      {rows.map((r) => {
        const tel = intlPhone(r.tel);
        return (
          <section key={r.shop_id} className="cx-card" style={r.issue && r.issue !== "rappeler" ? { opacity: 0.6 } : undefined}>
            <h3>{r.nom}</h3>
            <p className="note">
              {RAISON[r.raison]} · {metierOf(r.metier ?? "").label}{r.ville ? ` · ${r.ville}` : ""} · {r.ventes} vente(s) en 30 jours · {r.usages} demande(s) à Jokko
              {r.issue ? ` · ${ISSUE[r.issue]}` : ""}
            </p>
            {tel ? (
              <div className="cx-inline" style={{ flexWrap: "wrap", gap: 8 }}>
                <Button asChild size="sm"><a href={`tel:+${tel}`}>Appeler {show(tel)}</a></Button>
                <Button asChild size="sm" variant="outline"><a href={`https://wa.me/${tel}?text=${encodeURIComponent(relanceMessage(r))}`} target="_blank" rel="noopener">WhatsApp</a></Button>
              </div>
            ) : (
              <p className="note">Pas de numéro.</p>
            )}
            <div className="cx-inline" style={{ flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              <Button size="sm" variant={r.issue === "paye" ? "default" : "ghost"} onClick={() => void mark(r, "paye")}>A payé</Button>
              <Button size="sm" variant={r.issue === "rappeler" ? "default" : "ghost"} onClick={() => void mark(r, "rappeler")}>À rappeler</Button>
              <Button size="sm" variant={r.issue === "non" ? "default" : "ghost"} onClick={() => void mark(r, "non")}>Pas intéressé</Button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
