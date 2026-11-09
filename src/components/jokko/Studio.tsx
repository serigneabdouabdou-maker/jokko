import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { AGES, CATEGORIES, type CoutureModel, filterModels, galleryUrl, isNew, loadModels, OCCASIONS, shareImage, tryOn } from "@/data/studio";

/**
 * Studio d'essayage : le lookbook des tailleurs.
 * Galerie (vitrine + rubriques + âges) → cabine (le modèle en grand, sur fond bleu bazin)
 * → « Essayer » (photo du visage, photo en pied ou photo déjà faite) → « Je commande ce modèle ».
 */

const cap = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
/** Nom affiché : le modèle (sans la suite technique du titre). */
const nameOf = (m: CoutureModel) => cap(m.garment || m.title.split(" · ")[0]);

type Shot = "visage" | "pied" | "galerie";

export function Studio({ onOrder }: { onOrder?: (m: CoutureModel) => void }) {
  const [models, setModels] = useState<CoutureModel[] | null>(null);
  const [cat, setCat] = useState<CoutureModel["category"]>("femme");
  const [occasion, setOccasion] = useState("tout");
  const [age, setAge] = useState("tout");
  const [open, setOpen] = useState<CoutureModel | null>(null);

  useEffect(() => {
    void loadModels().then(setModels);
  }, []);

  const all = models ?? [];
  const ofCat = all.filter((m) => m.category === cat);
  const ages = AGES.filter((a) => (cat === "enfant" ? a.for === "enfant" : a.for === "adulte"));
  const rubrics = OCCASIONS.map((o) => ({ ...o, n: filterModels(all, cat, o.id, "tout").length })).filter((o) => o.n > 0);
  const list = filterModels(all, cat, occasion, age);
  const [hero, ...rest] = list;

  if (open) return <Cabine m={open} onBack={() => setOpen(null)} onOrder={onOrder} />;

  return (
    <section className="st">
      <header className="st-head">
        <h2>Studio</h2>
        <p>{models === null ? "Jokko ouvre la galerie…" : `${ofCat.length} modèles ${cat === "enfant" ? "pour enfants" : cat === "homme" ? "pour hommes" : "pour femmes"}`}</p>
      </header>

      <div className="st-genre" role="tablist" aria-label="Pour qui">
        {CATEGORIES.map((c) => (
          <button key={c.id} type="button" role="tab" aria-selected={cat === c.id} className={cat === c.id ? "on" : ""} onClick={() => { setCat(c.id); setOccasion("tout"); setAge("tout"); }}>
            {c.label}
          </button>
        ))}
      </div>

      <nav className="st-rubrics" aria-label="Rubriques">
        <button type="button" className={occasion === "tout" ? "on" : ""} onClick={() => setOccasion("tout")}>Tout</button>
        {rubrics.map((o) => (
          <button key={o.id} type="button" className={occasion === o.id ? "on" : ""} onClick={() => setOccasion(o.id)}>
            {o.label}<span>{o.n}</span>
          </button>
        ))}
      </nav>

      <div className="st-ages" aria-label="Âge">
        <button type="button" className={age === "tout" ? "on" : ""} onClick={() => setAge("tout")}>Tous âges</button>
        {ages.map((a) => (
          <button key={a.id} type="button" className={age === a.id ? "on" : ""} onClick={() => setAge(a.id)}>{a.label}</button>
        ))}
      </div>

      {models !== null && list.length === 0 && (
        <div className="st-empty">
          <p>Pas encore de modèle pour ce choix.</p>
          <button type="button" onClick={() => { setOccasion("tout"); setAge("tout"); }}>Voir tous les modèles</button>
        </div>
      )}

      {hero && (
        <button type="button" className="st-hero" onClick={() => setOpen(hero)}>
          <img src={galleryUrl(hero.image_path)} alt={nameOf(hero)} />
          <span className="st-hero-text">
            {isNew(hero) && <em>Nouveau</em>}
            <b>{nameOf(hero)}</b>
            <small>{cap(hero.fabric)}</small>
          </span>
          <span className="st-hero-cta"><Icon name="photo" size="sm" /> Essayer</span>
        </button>
      )}

      <div className="st-grid">
        {rest.map((m) => (
          <button key={m.id} type="button" className="st-card" onClick={() => setOpen(m)}>
            <span className="st-frame">
              <img src={galleryUrl(m.thumb_path ?? m.image_path)} alt={nameOf(m)} loading="lazy" />
              {isNew(m) && <em>Nouveau</em>}
            </span>
            <b>{nameOf(m)}</b>
            <small>{cap(m.fabric)}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

/** La cabine : le modèle en grand, l'essayage sur le client, puis la commande. */
function Cabine({ m, onBack, onOrder }: { m: CoutureModel; onBack: () => void; onOrder?: (m: CoutureModel) => void }) {
  const [result, setResult] = useState<string | null>(null);
  const [view, setView] = useState<"modele" | "client">("modele");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [choosing, setChoosing] = useState(false);
  const [zoom, setZoom] = useState(false);
  const inputs = { visage: useRef<HTMLInputElement | null>(null), pied: useRef<HTMLInputElement | null>(null), galerie: useRef<HTMLInputElement | null>(null) };

  async function essayer(file: File | undefined) {
    if (!file) return;
    setChoosing(false);
    setBusy(true);
    setNote("Jokko habille ton client… environ 20 secondes.");
    const out = await tryOn(m, file);
    setBusy(false);
    if (!out.ok) return setNote(out.message);
    setResult(out.src);
    setView("client");
    setNote("");
  }

  const src = view === "client" && result ? result : galleryUrl(m.image_path);

  return (
    <section className="st-cabine" aria-label={`Modèle : ${nameOf(m)}`}>
      <div className="st-cabine-top">
        <button type="button" className="st-back" onClick={onBack} aria-label="Retour à la galerie"><Icon name="retour" size="sm" /> Galerie</button>
        {result && (
          <div className="st-switch" role="tablist" aria-label="Voir">
            <button type="button" role="tab" aria-selected={view === "modele"} className={view === "modele" ? "on" : ""} onClick={() => setView("modele")}>Le modèle</button>
            <button type="button" role="tab" aria-selected={view === "client"} className={view === "client" ? "on" : ""} onClick={() => setView("client")}>Sur le client</button>
          </div>
        )}
      </div>

      <figure className={`st-stage${busy ? " is-busy" : ""}`}>
        <img src={src} alt={view === "client" ? `Le client en ${nameOf(m)}` : nameOf(m)} className={zoom ? "is-zoom" : ""} onClick={() => setZoom((z) => !z)} />
        {busy && <span className="st-busy" role="status"><span className="st-thread" aria-hidden="true" />Jokko habille ton client…</span>}
      </figure>

      <div className="st-caption">
        <h3>{nameOf(m)}</h3>
        <p>{cap(m.fabric)}</p>
      </div>
      {note && <p className="st-note" role="status">{note}</p>}

      {choosing && !busy && (
        <div className="st-shots" role="menu" aria-label="Quelle photo du client ?">
          {([
            ["visage", "Photographier le visage", "Selfie : Jokko garde son visage et l'habille en entier"],
            ["pied", "Photo en pied", "Caméra de derrière, de la tête aux pieds"],
            ["galerie", "Choisir une photo", "Une photo déjà dans le téléphone"],
          ] as [Shot, string, string][]).map(([id, label, hint]) => (
            <button key={id} type="button" role="menuitem" onClick={() => inputs[id].current?.click()}>
              <Icon name={id === "galerie" ? "image" : "photo"} size="md" />
              <span><b>{label}</b><small>{hint}</small></span>
            </button>
          ))}
        </div>
      )}

      <div className="st-actions">
        <button type="button" className="st-try" disabled={busy} onClick={() => setChoosing((c) => !c)}>
          <Icon name="photo" size="sm" /> {result ? "Essayer une autre photo" : "Essayer sur le client"}
        </button>
        {onOrder && <button type="button" className="st-order" onClick={() => onOrder(m)}>Je commande ce modèle</button>}
        {result && view === "client" && (
          <button type="button" className="st-share" onClick={() => void shareImage(result, nameOf(m))}><Icon name="whatsapp" size="sm" /> Envoyer au client</button>
        )}
      </div>
      <p className="st-fine">La photo du client sert seulement à l'essayage : elle n'est pas gardée. Essayage avec les offres Médium (3 par jour) et Avancé (10 par jour).</p>

      <input ref={inputs.visage} type="file" accept="image/*" capture="user" hidden onChange={(e) => { void essayer(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={inputs.pied} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void essayer(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={inputs.galerie} type="file" accept="image/*" hidden onChange={(e) => { void essayer(e.target.files?.[0]); e.target.value = ""; }} />
    </section>
  );
}
