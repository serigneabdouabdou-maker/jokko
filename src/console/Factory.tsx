import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { money } from "@/model";
import { AGES, type CoutureModel, galleryUrl, loadModels, OCCASIONS, type StudioStats, studioCancel, studioEnqueue, studioHide, studioSetCap, studioStats } from "@/data/studio";

const F = (n: number) => money(n).replace(/ /g, " ");
const GENRES = [
  { id: "femme", label: "Femme" },
  { id: "homme", label: "Homme" },
  { id: "enfant", label: "Enfant" },
];
const PRESETS = [5, 10, 20, 50];

/**
 * Console : la fabrique de modèles du Studio. Fallou choisit combien de modèles (genre, rubrique, âge),
 * voit le prix avant de lancer, et suit chaque jour ce que ça coûte. La file avance seule (2 par minute),
 * et s'arrête d'elle-même au plafond du jour.
 */
export function FactoryTab() {
  const [stats, setStats] = useState<StudioStats | null>(null);
  const [genre, setGenre] = useState("femme");
  const [occasion, setOccasion] = useState("tabaski");
  const [age, setAge] = useState("adulte");
  const [count, setCount] = useState(10);
  const [note, setNote] = useState("");
  const [cap, setCap] = useState("");
  const [models, setModels] = useState<CoutureModel[]>([]);

  async function refresh() {
    const s = await studioStats();
    setStats(s);
    if (s && !cap) setCap(String(s.plafond_jour));
    setModels(await loadModels());
  }
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!stats) return <p className="note">Chargement de la fabrique…</p>;

  const price = stats.prix_image;
  const ages = AGES.filter((a) => (genre === "enfant" ? a.for === "enfant" : a.for === "adulte"));
  const ageOk = ages.some((a) => a.id === age) ? age : ages[0].id;
  const spentToday = stats.fabriques_jour * price;
  const leftToday = Math.max(0, stats.plafond_jour - spentToday);
  const tryonsToday = stats.essayages_jour * stats.prix_essayage;
  const minutes = Math.ceil((stats.en_attente + count) / 2) + 1;
  const rubric = (c: string, o: string) => stats.par_rubrique.find((r) => r.category === c && r.occasion === o)?.n ?? 0;
  const recent = models.slice(0, 24);

  async function launch() {
    setNote("");
    const done = await studioEnqueue(genre, occasion, ageOk, count);
    if (!done) return setNote("La commande n'est pas passée. Vérifie que tu es connecté avec le compte admin.");
    setNote(`✓ ${done.ajoutes} modèles en fabrication (≈ ${F(done.cout_estime)}). Ils arrivent dans le Studio au fil des minutes.`);
    void refresh();
  }

  return (
    <div className="cx-stack">
      <section className="cx-kpis">
        <article className="cx-kpi"><span>Fabriqués aujourd’hui</span><b className="num">{stats.fabriques_jour}</b><small>{F(spentToday)} · reste {F(leftToday)} avant le plafond</small></article>
        <article className="cx-kpi"><span>Fabriqués ce mois</span><b className="num">{stats.fabriques_mois}</b><small>{F(stats.fabriques_mois * price)}</small></article>
        <article className="cx-kpi" data-tone={stats.en_attente ? "warn" : "good"}><span>En attente</span><b className="num">{stats.en_attente}</b><small>{stats.en_attente ? `≈ ${Math.ceil(stats.en_attente / 2)} min · ${F(stats.en_attente * price)}` : "rien en cours"}</small></article>
        <article className="cx-kpi"><span>Essayages des tailleurs</span><b className="num">{stats.essayages_jour}</b><small>aujourd’hui ≈ {F(tryonsToday)} · ce mois {stats.essayages_mois}</small></article>
        <article className="cx-kpi" data-tone="good"><span>Modèles dans le Studio</span><b className="num">{stats.galerie_total}</b><small>visibles par tous les tailleurs</small></article>
      </section>
      {stats.erreurs_jour > 0 && <p className="cx-alert">{stats.erreurs_jour} image(s) ratée(s) aujourd’hui (non facturées en général). Si ça continue, regarde l’onglet Santé (crédit Gemini).</p>}

      <section className="cx-card">
        <h3>Fabriquer de nouveaux modèles</h3>
        <p className="note">Choisis le genre, la rubrique et l’âge, puis combien. Chaque modèle est différent (coupe, tissu, couleur, broderie tirés au hasard) et arrive avec 3 photos (face, profil, dos) pour le faire tourner dans le Studio. Prix : ≈ {F(price)} le modèle.</p>
        <div className="cx-inline" style={{ flexWrap: "wrap", gap: 6 }}>
          {GENRES.map((g) => <Button key={g.id} size="sm" variant={genre === g.id ? "default" : "outline"} onClick={() => setGenre(g.id)}>{g.label}</Button>)}
        </div>
        <div className="cx-inline" style={{ flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {OCCASIONS.map((o) => <Button key={o.id} size="sm" variant={occasion === o.id ? "default" : "outline"} onClick={() => setOccasion(o.id)}>{o.label} ({rubric(genre, o.id)})</Button>)}
        </div>
        <div className="cx-inline" style={{ flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {ages.map((a) => <Button key={a.id} size="sm" variant={ageOk === a.id ? "default" : "outline"} onClick={() => setAge(a.id)}>{a.label}</Button>)}
        </div>
        <div className="cx-inline" style={{ flexWrap: "wrap", gap: 6, marginTop: 8, alignItems: "center" }}>
          {PRESETS.map((n) => <Button key={n} size="sm" variant={count === n ? "default" : "outline"} onClick={() => setCount(n)}>{n}</Button>)}
          <Input className="h-9 w-20" inputMode="numeric" value={String(count)} onChange={(e) => setCount(Math.min(100, Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1)))} />
          <span>modèles</span>
        </div>
        <p style={{ marginTop: 10 }}>
          <b>Coût estimé : {F(count * price)}</b> · prêt en ≈ {minutes} min
          {count * price > leftToday ? ` · attention : le plafond du jour (${F(stats.plafond_jour)}) arrêtera la fabrique, la suite partira demain.` : ""}
        </p>
        <div className="cx-inline" style={{ gap: 8 }}>
          <Button onClick={() => void launch()}>Lancer la fabrication</Button>
          {stats.en_attente > 0 && <Button variant="outline" onClick={async () => { const n = await studioCancel(); setNote(`${n} modèle(s) annulé(s), rien n'est payé pour eux.`); void refresh(); }}>Arrêter la file</Button>}
        </div>
        {note && <p className="note" role="status">{note}</p>}
      </section>

      <section className="cx-card">
        <h3>Plafond de dépense par jour</h3>
        <p className="note">La fabrique s’arrête toute seule quand ce montant est atteint dans la journée (les essayages des tailleurs ne sont pas comptés ici : ils sont payés par leur offre).</p>
        <div className="cx-inline" style={{ gap: 8 }}>
          <Input className="h-9 w-28" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value.replace(/\D/g, ""))} />
          <span>F par jour</span>
          <Button size="sm" onClick={async () => { const ok = await studioSetCap(Number(cap) || 0); setNote(ok ? "✓ Plafond enregistré." : "Le plafond n'est pas enregistré."); void refresh(); }}>Enregistrer</Button>
        </div>
      </section>

      <section className="cx-card">
        <h3>14 derniers jours</h3>
        <ul className="cx-rank">
          {stats.jours.length === 0 && <li><span>Aucune fabrication pour l’instant.</span></li>}
          {stats.jours.map((d) => (
            <li key={d.jour}>
              <span>{new Date(`${d.jour}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}</span>
              <b className="num">{d.faits} modèles · {F(d.faits * price)}{d.erreurs ? ` · ${d.erreurs} ratés` : ""}</b>
            </li>
          ))}
        </ul>
      </section>

      <section className="cx-card">
        <h3>Derniers modèles</h3>
        <p className="note">Un modèle raté ou pas assez beau ? Touche « Retirer » : il disparaît du Studio.</p>
        <div className="studio-grid">
          {recent.map((m) => (
            <div key={m.id} className="studio-card">
              <img src={galleryUrl(m.thumb_path ?? m.image_path)} alt={m.title} loading="lazy" />
              <span>{m.title}</span>
              <Button size="sm" variant="ghost" onClick={async () => { if (await studioHide(m.id)) void refresh(); }}>Retirer</Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
