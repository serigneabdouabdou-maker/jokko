import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { Button } from "@/components/ui/button";
import { AGES, CATEGORIES, type CoutureModel, filterModels, galleryUrl, isNew, loadModels, OCCASIONS, shareImage, tryOn } from "@/data/studio";

/**
 * Studio d'essayage : la galerie de modèles signés Jokko. On touche un modèle, on le voit en grand,
 * puis « Essayer » : selfie du client → Jokko l'habille avec ce modèle (offres Médium et Avancé).
 */
export function Studio({ onOrder }: { onOrder?: (m: CoutureModel) => void }) {
  const [models, setModels] = useState<CoutureModel[] | null>(null);
  const [cat, setCat] = useState<CoutureModel["category"]>("femme");
  const [occasion, setOccasion] = useState("tout");
  const [age, setAge] = useState("tout");
  const [open, setOpen] = useState<CoutureModel | null>(null);
  const [zoom, setZoom] = useState(false);
  const [state, setState] = useState<"repos" | "essai">("repos");
  const [result, setResult] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const camera = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void loadModels().then(setModels);
  }, []);

  const all = models ?? [];
  const list = filterModels(all, cat, occasion, age);
  const ages = AGES.filter((a) => (cat === "enfant" ? a.for === "enfant" : a.for === "adulte"));
  // Rubriques qui ont des modèles pour ce genre (les vides sont cachées).
  const rubrics = OCCASIONS.map((o) => ({ ...o, n: filterModels(all, cat, o.id, "tout").length })).filter((o) => o.n > 0);
  // « Tout » : la galerie rangée par rubrique, comme un grand catalogue.
  const sections = occasion === "tout" ? rubrics.map((o) => ({ ...o, items: filterModels(all, cat, o.id, age) })).filter((s) => s.items.length) : [];

  function show(m: CoutureModel | null) {
    setOpen(m);
    setResult(null);
    setNote("");
    setZoom(false);
  }

  async function essayer(file: File | undefined) {
    if (!file || !open) return;
    setState("essai");
    setNote("Jokko habille ton client… (environ 20 secondes)");
    const out = await tryOn(open, file);
    setState("repos");
    if (!out.ok) {
      setNote(out.message);
      return;
    }
    setResult(out.src);
    setNote("Voilà ! Montre-le au client, ou envoie-le sur WhatsApp.");
  }

  if (open) {
    const src = result ?? galleryUrl(open.image_path);
    return (
      <div className="studio-view sheet">
        <Button variant="ghost" className="h-10 rounded-full px-3" onClick={() => show(null)}>← Galerie</Button>
        <h3>{open.title}</h3>
        {open.fabric && <p className="note">{open.fabric}</p>}
        <img
          src={src}
          alt={result ? `Le client en ${open.title}` : open.title}
          className={zoom ? "studio-big is-zoom" : "studio-big"}
          onClick={() => setZoom((z) => !z)}
        />
        <small className="note">Touche l'image pour zoomer.</small>
        {note && <p className="note" role="status">{note}</p>}
        <div className="debt-actions" style={{ flexWrap: "wrap", gap: 8 }}>
          <Button className="h-12 rounded-full px-5" disabled={state === "essai"} onClick={() => camera.current?.click()}>
            <Icon name="photo" size="sm" /> {state === "essai" ? "Jokko habille…" : result ? "Réessayer avec une autre photo" : "Essayer sur le client"}
          </Button>
          {result && (
            <Button variant="outline" className="h-12 rounded-full px-5" onClick={() => void shareImage(result, open.title)}>
              <Icon name="whatsapp" size="sm" /> Envoyer
            </Button>
          )}
          {result && (
            <Button variant="ghost" className="h-12 rounded-full px-4" onClick={() => setResult(null)}>Voir le modèle</Button>
          )}
        </div>
        {onOrder && (
          <div className="studio-order">
            <b>Ça lui plaît ?</b>
            <Button className="h-14 rounded-full px-5 text-lg font-semibold" onClick={() => onOrder(open)}>
              <Icon name="couture" size="sm" /> Je commande ce modèle
            </Button>
            <small className="note">Jokko ouvre la fiche de commande avec ce modèle : tu mets le client, ses mesures, le prix et l'avance. Le client reçoit son lien de suivi avec la photo du modèle.</small>
          </div>
        )}
        <input
          ref={camera}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            void essayer(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <small className="note">Prends le client en photo (caméra de derrière, de la tête aux pieds, bien éclairé) ou choisis une photo déjà faite. La photo n'est pas gardée. Essayage : offres Médium (3 par jour) et Avancé (10 par jour).</small>
      </div>
    );
  }

  return (
    <section className="sheet">
      <div className="sheet-head">
        <h2>Studio d'essayage</h2>
        <b className="num sheet-total">{(models ?? []).length} modèles</b>
      </div>
      <p className="note">Touche un modèle pour le voir en grand, l'essayer sur ton client, puis le commander.</p>
      <div className="debt-actions" style={{ gap: 8, margin: "8px 0", flexWrap: "wrap" }}>
        {CATEGORIES.map((c) => (
          <Button key={c.id} variant={cat === c.id ? "default" : "outline"} className="h-11 rounded-full px-5" onClick={() => { setCat(c.id); setAge("tout"); setOccasion("tout"); }}>
            {c.label} ({all.filter((m) => m.category === c.id).length})
          </Button>
        ))}
      </div>
      <div className="studio-chips" role="tablist" aria-label="Rubriques">
        <button type="button" className={occasion === "tout" ? "on" : ""} onClick={() => setOccasion("tout")}>Tout</button>
        {rubrics.map((o) => (
          <button key={o.id} type="button" className={occasion === o.id ? "on" : ""} onClick={() => setOccasion(o.id)}>{o.label} <small>{o.n}</small></button>
        ))}
      </div>
      <div className="studio-chips" aria-label="Âge">
        <button type="button" className={age === "tout" ? "on" : ""} onClick={() => setAge("tout")}>Tous âges</button>
        {ages.map((a) => (
          <button key={a.id} type="button" className={age === a.id ? "on" : ""} onClick={() => setAge(a.id)}>{a.label}</button>
        ))}
      </div>
      {models === null && <p className="note">Jokko ouvre la galerie…</p>}
      {models !== null && (occasion === "tout" ? sections.length === 0 : list.length === 0) && <p className="note">Pas encore de modèle ici. De nouveaux modèles arrivent chaque semaine.</p>}
      {occasion === "tout"
        ? sections.map((s) => (
            <div key={s.id} className="studio-section">
              <div className="studio-section-head">
                <h3>{s.label}</h3>
                <button type="button" className="link" onClick={() => setOccasion(s.id)}>Voir les {s.items.length}</button>
              </div>
              <div className="studio-row">
                {s.items.slice(0, 12).map((m) => <Card key={m.id} m={m} onOpen={show} />)}
              </div>
            </div>
          ))
        : (
          <div className="studio-grid">
            {list.map((m) => <Card key={m.id} m={m} onOpen={show} />)}
          </div>
        )}
    </section>
  );
}

function Card({ m, onOpen }: { m: CoutureModel; onOpen: (m: CoutureModel) => void }) {
  return (
    <button type="button" className="studio-card" onClick={() => onOpen(m)}>
      <img src={galleryUrl(m.thumb_path ?? m.image_path)} alt={m.title} loading="lazy" />
      <span>{isNew(m) && <em className="studio-new">Nouveau</em>}{m.title}</span>
    </button>
  );
}
