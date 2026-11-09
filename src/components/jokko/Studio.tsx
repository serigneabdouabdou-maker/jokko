import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { Button } from "@/components/ui/button";
import { CATEGORIES, type CoutureModel, galleryUrl, loadModels, shareImage, tryOn } from "@/data/studio";

/**
 * Studio d'essayage : la galerie de modèles signés Jokko. On touche un modèle, on le voit en grand,
 * puis « Essayer » : selfie du client → Jokko l'habille avec ce modèle (offres Médium et Avancé).
 */
export function Studio() {
  const [models, setModels] = useState<CoutureModel[] | null>(null);
  const [cat, setCat] = useState<CoutureModel["category"]>("femme");
  const [open, setOpen] = useState<CoutureModel | null>(null);
  const [zoom, setZoom] = useState(false);
  const [state, setState] = useState<"repos" | "essai">("repos");
  const [result, setResult] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const camera = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void loadModels().then(setModels);
  }, []);

  const list = (models ?? []).filter((m) => m.category === cat);

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
      <div className="studio-view">
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
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="user"
          hidden
          onChange={(e) => {
            void essayer(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <small className="note">Prends le client en photo de face, bien éclairé, en pied si possible. La photo n'est pas gardée. Essayage : offres Médium (3 par jour) et Avancé (10 par jour).</small>
      </div>
    );
  }

  return (
    <div>
      <div className="debt-actions" style={{ gap: 8, margin: "8px 0", flexWrap: "wrap" }}>
        {CATEGORIES.map((c) => (
          <Button key={c.id} variant={cat === c.id ? "default" : "outline"} className="h-10 rounded-full px-4" onClick={() => setCat(c.id)}>
            {c.label} ({(models ?? []).filter((m) => m.category === c.id).length})
          </Button>
        ))}
      </div>
      {models === null && <p className="note">Jokko ouvre la galerie…</p>}
      {models !== null && list.length === 0 && <p className="note">Pas encore de modèle ici. De nouveaux modèles arrivent bientôt.</p>}
      <div className="studio-grid">
        {list.map((m) => (
          <button key={m.id} type="button" className="studio-card" onClick={() => show(m)}>
            <img src={galleryUrl(m.thumb_path ?? m.image_path)} alt={m.title} loading="lazy" />
            <span>{m.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
