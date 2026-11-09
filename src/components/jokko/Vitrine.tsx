import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { type Shop, money } from "@/model";
import { metierOf } from "@/data/metiers";
import { type CoutureModel, galleryUrl, loadModels } from "@/data/studio";
import { loadVitrine, saveVitrine, setInVitrine, setProductPhoto, shareVitrine, uploadProductPhoto, type VitrineSettings, vitrineLink, vitrinePhotoUrl } from "@/data/vitrine";

/**
 * Ma vitrine : la page publique de l'entreprise. Le patron choisit ce qu'il montre (articles avec photo et prix,
 * modèles du Studio pour un tailleur), puis met le lien en statut WhatsApp, sur Facebook ou dans sa bio TikTok.
 */
export function Vitrine({ shop, commit, canEdit }: { shop: Shop; commit: (s: Shop) => void; canEdit: boolean }) {
  const [v, setV] = useState<VitrineSettings | null | undefined>(undefined);
  const [bio, setBio] = useState("");
  const [note, setNote] = useState("");
  const [phone, setPhone] = useState(shop.phone ?? "");
  const [models, setModels] = useState<CoutureModel[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement | null>(null);
  const target = useRef<string | null>(null);
  const tailor = metierOf(shop.activity).id === "couture";

  useEffect(() => {
    void loadVitrine(shop.id).then((x) => {
      setV(x);
      setBio(x?.bio ?? "");
    });
    if (tailor) void loadModels().then(setModels);
  }, [shop.id, tailor]);

  async function open() {
    const x = await saveVitrine(shop.id, { open: true });
    if (!x) return setNote("La vitrine ne s'ouvre pas. Vérifie la connexion, puis réessaie.");
    setV(x);
  }

  async function update(change: { open?: boolean; bio?: string; models?: string[] }, done?: string) {
    const x = await saveVitrine(shop.id, change);
    if (!x) return setNote("Ce n'est pas enregistré. Vérifie la connexion.");
    setV(x);
    if (done) setNote(done);
  }

  async function photo(file: File | undefined) {
    const id = target.current;
    if (!file || !id) return;
    setUploading(id);
    const path = await uploadProductPhoto(shop.id, id, file);
    setUploading(null);
    if (!path) return setNote("La photo n'est pas partie. Vérifie la connexion, puis réessaie.");
    commit(setProductPhoto(shop, id, path));
  }

  if (v === undefined) return <section className="vt"><p className="vt-muted">Ouverture de ta vitrine…</p></section>;

  if (!v) {
    return (
      <section className="vt">
        <header className="vt-head"><h2>Ma vitrine</h2></header>
        <div className="vt-intro">
          <p className="vt-lede">Une page avec tes {tailor ? "modèles" : "articles"} et tes prix, que tes clients ouvrent depuis ton statut WhatsApp, Facebook ou TikTok. Ils commandent directement sur ton WhatsApp.</p>
          {canEdit ? <button type="button" className="vt-primary" onClick={() => void open()}>Ouvrir ma vitrine</button> : <p className="vt-muted">Le patron peut ouvrir la vitrine.</p>}
          {note && <p className="vt-note">{note}</p>}
        </div>
      </section>
    );
  }

  const link = vitrineLink(v.slug);
  const shown = shop.products.filter((p) => p.vitrine);
  const chosen = new Set(v.models);

  return (
    <section className="vt">
      <header className="vt-head">
        <h2>Ma vitrine</h2>
        {canEdit && (
          <button type="button" className={`vt-state${v.open ? " on" : ""}`} onClick={() => void update({ open: !v.open }, v.open ? "Vitrine fermée : le lien n'affiche plus rien." : "Vitrine ouverte.")} aria-pressed={v.open}>
            <span aria-hidden="true" /> {v.open ? "Ouverte" : "Fermée"}
          </button>
        )}
      </header>

      <div className="vt-link">
        <small>Le lien de ta vitrine</small>
        <a href={link} target="_blank" rel="noopener noreferrer">{link.replace(/^https?:\/\//, "")}</a>
        <div className="vt-share">
          <button type="button" className="vt-wa" onClick={() => void shareVitrine(shop, link, "whatsapp")}><Icon name="whatsapp" size="sm" /> Statut WhatsApp</button>
          <button type="button" onClick={() => void shareVitrine(shop, link, "facebook")}>Facebook</button>
          <button type="button" onClick={async () => { await navigator.clipboard?.writeText(link).catch(() => undefined); setNote("Lien copié : colle-le dans ta bio TikTok ou Instagram."); }}>Copier (TikTok)</button>
          <button type="button" onClick={() => void shareVitrine(shop, link, "partager")}>Autre…</button>
        </div>
      </div>
      {note && <p className="vt-note" role="status">{note}</p>}

      {canEdit && !shop.phone && (
        <div className="vt-warn">
          <b>Ton numéro WhatsApp</b>
          <p>Les clients commandent sur ce numéro. Sans lui, ils ne peuvent pas te joindre.</p>
          <div className="vt-row">
            <input inputMode="tel" placeholder="77 123 45 67" value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="Numéro WhatsApp" />
            <button type="button" className="vt-primary small" disabled={phone.replace(/\D/g, "").length < 9} onClick={() => commit({ ...shop, phone: phone.trim() })}>Enregistrer</button>
          </div>
        </div>
      )}

      {canEdit && (
        <label className="vt-bio">
          <span>Une phrase pour tes clients</span>
          <textarea rows={2} maxLength={280} value={bio} placeholder={tailor ? "Couture sur mesure, livraison en 7 jours." : "Téléphones d'occasion garantis 3 mois, livraison à Dakar."} onChange={(e) => setBio(e.target.value)} onBlur={() => bio !== v.bio && void update({ bio }, "Phrase enregistrée.")} />
        </label>
      )}

      {tailor && (
        <div className="vt-block">
          <div className="vt-block-head"><h3>Mes modèles</h3><span>{chosen.size} en vitrine</span></div>
          <p className="vt-muted">Touche les modèles du Studio que tes clients doivent voir.</p>
          <div className="vt-models">
            {models.slice(0, 120).map((m) => {
              const on = chosen.has(m.id);
              return (
                <button key={m.id} type="button" className={on ? "on" : ""} disabled={!canEdit} aria-pressed={on}
                  onClick={() => void update({ models: on ? v.models.filter((x) => x !== m.id) : [...v.models, m.id] })}>
                  <img src={galleryUrl(m.thumb_path ?? m.image_path)} alt={m.garment || m.title} loading="lazy" />
                  {on && <span className="vt-check"><Icon name="ok" size="sm" /></span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="vt-block">
        <div className="vt-block-head"><h3>{tailor ? "Tissus et articles" : "Mes articles"}</h3><span>{shown.length} en vitrine</span></div>
        {shop.products.length === 0 && <p className="vt-muted">Ajoute d'abord tes articles dans le stock : ils apparaîtront ici.</p>}
        <ul className="vt-items">
          {shop.products.map((p) => (
            <li key={p.id} className={p.vitrine ? "on" : ""}>
              <button type="button" className="vt-thumb" disabled={!canEdit || uploading === p.id} onClick={() => { target.current = p.id; camera.current?.click(); }} aria-label={`Photo de ${p.name}`}>
                {p.photoPath ? <img src={vitrinePhotoUrl(p.photoPath)} alt="" /> : <span><Icon name="photo" size="sm" /></span>}
                {uploading === p.id && <em>…</em>}
              </button>
              <span className="vt-item-text"><b>{p.name}</b><small>{money(p.price)} · {p.stock > 0 ? "disponible" : "épuisé"}</small></span>
              {canEdit && (
                <button type="button" className={`vt-toggle${p.vitrine ? " on" : ""}`} role="switch" aria-checked={Boolean(p.vitrine)} aria-label={`Montrer ${p.name} sur la vitrine`} onClick={() => commit(setInVitrine(shop, p.id, !p.vitrine))}>
                  <span />
                </button>
              )}
            </li>
          ))}
        </ul>
        {canEdit && shop.products.length > 0 && <p className="vt-muted">Touche le carré pour prendre la photo de l'article. Un article avec photo se vend mieux.</p>}
      </div>

      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void photo(e.target.files?.[0]); e.target.value = ""; }} />
    </section>
  );
}
