import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { money } from "@/model";
import { type GuardKey, type GuardStats, guardSet, guardStats, share } from "@/data/guard";

const F = (n: number) => money(n).replace(/ /g, " ");
const OFFRE: Record<string, string> = { gratuit: "Gratuit", essai: "Essai", medium: "Médium", avance: "Avancé" };
const CAPS: { key: GuardKey; label: string; unit: string; help: string }[] = [
  { key: "global_jour", label: "Plafond total par jour", unit: "F", help: "Tous les clients ensemble. Atteint : Jokko se repose jusqu'à demain (les boutons marchent)." },
  { key: "gratuit_jour", label: "Plafond gratuits + essais par jour", unit: "F", help: "Atteint : les comptes gratuits et d'essai sont en pause, les payants continuent." },
  { key: "images_jour", label: "Fabrique de modèles par jour", unit: "F", help: "La fabrique s'arrête seule à ce montant." },
  { key: "images_mois", label: "Fabrique de modèles par mois", unit: "F", help: "Sécurité du mois pour la fabrique." },
  { key: "comptes_par_appareil", label: "Comptes d'essai par téléphone", unit: "comptes", help: "Au-delà, ce téléphone n'a plus d'essai gratuit : il doit payer." },
];

/** Console : le garde-fou du budget. Fallou voit ce qui part aujourd'hui, ce qui partira ce soir, et qui triche. */
export function GuardTab() {
  const [stats, setStats] = useState<GuardStats | null>(null);
  const [draft, setDraft] = useState<Partial<Record<GuardKey, string>>>({});
  const [note, setNote] = useState("");

  async function refresh() {
    setStats(await guardStats());
  }
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!stats) return <p className="note">Chargement du garde-fou… (connecte-toi avec le compte admin et le code de sécurité)</p>;

  const cap = Number(stats.plafonds.global_jour) || 0;
  const forecastShare = share(stats.prevision_jour, stats.plafonds.global_jour);
  const tone = forecastShare >= 1 ? "bad" : forecastShare >= 0.7 ? "warn" : "good";
  const odd = stats.clients.filter((c) => c.anormal);

  async function save(key: GuardKey) {
    const value = Number(draft[key] ?? stats?.plafonds[key] ?? 0);
    const ok = await guardSet(key, value);
    setNote(ok ? "✓ Réglage enregistré. Il s'applique tout de suite." : "Le réglage n'est pas enregistré.");
    setDraft((d) => ({ ...d, [key]: undefined }));
    void refresh();
  }

  return (
    <div className="cx-stack">
      <section className="cx-kpis">
        <article className="cx-kpi"><span>Dépensé aujourd’hui</span><b className="num">{F(stats.depense_jour)}</b><small>{cap ? `${Math.round(share(stats.depense_jour, stats.plafonds.global_jour) * 100)} % du plafond (${F(cap)})` : "pas de plafond"}</small></article>
        <article className="cx-kpi" data-tone={tone}><span>Prévision ce soir</span><b className="num">{F(stats.prevision_jour)}</b><small>{forecastShare >= 1 ? "le plafond sera atteint : Jokko se reposera" : "au rythme actuel"}</small></article>
        <article className="cx-kpi"><span>Ce mois</span><b className="num">{F(stats.depense_mois)}</b><small>dont fabrique {F(stats.fabrique_mois)}</small></article>
        <article className="cx-kpi"><span>Gratuits et essais</span><b className="num">{F(stats.gratuits_jour)}</b><small>aujourd’hui · plafond {F(Number(stats.plafonds.gratuit_jour) || 0)}</small></article>
        <article className="cx-kpi" data-tone={stats.nouveaux_comptes_24h > 30 ? "warn" : "good"}><span>Nouveaux comptes (24 h)</span><b className="num">{stats.nouveaux_comptes_24h}</b><small>{stats.nouveaux_comptes_24h > 30 ? "beaucoup : regarde les téléphones" : "normal"}</small></article>
      </section>

      {odd.length > 0 && <p className="cx-alert">{odd.length} client(s) dépensent bien plus que les autres aujourd’hui : {odd.map((c) => c.nom).join(", ")}. Si c’est un compte gratuit, c’est peut-être un abus ; si c’est un payant, c’est un bon moment pour l’appeler.</p>}

      <section className="cx-card">
        <h3>Qui coûte le plus aujourd’hui</h3>
        <ul className="cx-rank">
          {stats.clients.length === 0 && <li><span>Personne n’a encore utilisé Jokko aujourd’hui.</span></li>}
          {stats.clients.map((c, i) => (
            <li key={`${c.nom}-${i}`}>
              <span>{c.anormal ? "⚠️ " : ""}{c.nom} · {OFFRE[c.offre] ?? c.offre}</span>
              <b className="num">{F(c.cout)}</b>
            </li>
          ))}
        </ul>
      </section>

      <section className="cx-card">
        <h3>Téléphones avec trop de comptes</h3>
        <p className="note">Une personne qui crée plusieurs comptes sur le même téléphone pour avoir plusieurs essais gratuits. Ces téléphones n’ont déjà plus d’essai : ils doivent payer.</p>
        <ul className="cx-rank">
          {stats.appareils.length === 0 && <li><span>Aucun téléphone suspect. ✓</span></li>}
          {stats.appareils.map((a) => (
            <li key={a.appareil}>
              <span>Téléphone {a.appareil}… · vu le {new Date(a.vu).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
              <b className="num">{a.comptes} comptes</b>
            </li>
          ))}
        </ul>
      </section>

      <section className="cx-card">
        <h3>Plafonds de sécurité</h3>
        <div className="cx-stack" style={{ gap: 12 }}>
          {CAPS.map((c) => (
            <div key={c.key}>
              <b>{c.label}</b>
              <p className="note">{c.help}</p>
              <div className="cx-inline" style={{ gap: 8 }}>
                <Input className="h-9 w-28" inputMode="numeric" value={draft[c.key] ?? stats.plafonds[c.key] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [c.key]: e.target.value.replace(/\D/g, "") }))} />
                <span>{c.unit}</span>
                {draft[c.key] !== undefined && <Button size="sm" onClick={() => void save(c.key)}>Enregistrer</Button>}
              </div>
            </div>
          ))}
        </div>
        {note && <p className="note" role="status">{note}</p>}
      </section>
    </div>
  );
}
