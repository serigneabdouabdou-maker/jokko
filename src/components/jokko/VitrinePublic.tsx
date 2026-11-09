import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { Turntable } from "./Turntable";
import { galleryUrl } from "@/data/studio";
import { loadPublicVitrine, orderLink, type PublicArticle, type PublicModele, type PublicVitrine, vitrinePhotoUrl } from "@/data/vitrine";

const F = (n: number) => `${Math.round(n).toLocaleString("fr-FR").replace(/[  ]/g, " ")} F`;
const cap = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
type Item = { kind: "article"; a: PublicArticle } | { kind: "modele"; m: PublicModele };

/**
 * Vitrine publique d'une entreprise (lien du statut WhatsApp, de Facebook ou de TikTok).
 * Le client regarde les articles et les modèles, puis commande sur le WhatsApp de l'entreprise. Aucun compte.
 */
export function VitrinePublic({ slug }: { slug: string }) {
  const [v, setV] = useState<PublicVitrine | null | undefined>(undefined);
  const [open, setOpen] = useState<Item | null>(null);
  useEffect(() => {
    void loadPublicVitrine(slug).then((x) => {
      setV(x);
      if (x) document.title = `${x.nom} · Vitrine`;
    });
  }, [slug]);

  if (v === undefined) return <main className="vp"><p className="vp-wait">Un instant…</p></main>;
  if (!v) return <main className="vp"><h1 className="vp-name">Vitrine fermée</h1><p className="vp-bio">Cette vitrine n'est pas disponible pour le moment.</p></main>;

  const link = window.location.href;
  const call = orderLink(v.telephone, v.nom, "des renseignements", link);
  const initials = v.nom.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  if (open) {
    const name = open.kind === "article" ? open.a.nom : cap(open.m.habit || open.m.titre.split(" · ")[0]);
    const detail = open.kind === "article" ? F(open.a.prix) : cap(open.m.tissu);
    const order = orderLink(v.telephone, v.nom, open.kind === "article" ? `${name} (${F(open.a.prix)})` : `le modèle ${name}`, link);
    const frames = open.kind === "article" ? (open.a.photo ? [vitrinePhotoUrl(open.a.photo)] : []) : [open.m.image, ...(open.m.vues ?? [])].map(galleryUrl);
    return (
      <main className="vp">
        <button type="button" className="vp-back" onClick={() => setOpen(null)}><Icon name="retour" size="sm" /> {v.nom}</button>
        <div className="vp-stage">{frames.length ? <Turntable frames={frames} alt={name} /> : <span className="vp-noimg">{name.charAt(0)}</span>}</div>
        <h1 className="vp-item-name">{name}</h1>
        <p className="vp-price">{detail}</p>
        {open.kind === "article" && !open.a.dispo && <p className="vp-out">Épuisé pour le moment : demande quand il revient.</p>}
        {order ? <a className="vp-order" href={order} target="_blank" rel="noopener noreferrer"><Icon name="whatsapp" size="sm" /> Commander sur WhatsApp</a> : <p className="vp-bio">Contacte {v.nom} pour commander.</p>}
      </main>
    );
  }

  return (
    <main className="vp">
      <header className="vp-head">
        <span className="vp-mark" aria-hidden="true">{initials}</span>
        <div>
          <h1 className="vp-name">{v.nom}</h1>
          <p className="vp-meta">{[cap(v.metier.split(",")[0] ?? ""), v.ville].filter(Boolean).join(", ")}</p>
        </div>
      </header>
      {v.bio && <p className="vp-bio">{v.bio}</p>}
      {call && <a className="vp-call" href={call} target="_blank" rel="noopener noreferrer"><Icon name="whatsapp" size="sm" /> Écrire sur WhatsApp</a>}

      {v.modeles.length > 0 && (
        <section className="vp-section">
          <h2>Modèles</h2>
          <div className="vp-grid">
            {v.modeles.map((m) => (
              <button key={m.id} type="button" className="vp-card" onClick={() => setOpen({ kind: "modele", m })}>
                <span className="vp-frame"><img src={galleryUrl(m.vignette ?? m.image)} alt={m.habit} loading="lazy" /></span>
                <b>{cap(m.habit || m.titre.split(" · ")[0])}</b>
                <small>{cap(m.tissu)}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      {v.articles.length > 0 && (
        <section className="vp-section">
          <h2>{v.modeles.length ? "Tissus et articles" : "Articles"}</h2>
          <div className="vp-grid">
            {v.articles.map((a) => (
              <button key={a.id} type="button" className={`vp-card${a.dispo ? "" : " is-out"}`} onClick={() => setOpen({ kind: "article", a })}>
                <span className="vp-frame square">{a.photo ? <img src={vitrinePhotoUrl(a.photo)} alt={a.nom} loading="lazy" /> : <span className="vp-noimg">{a.nom.charAt(0)}</span>}</span>
                <b>{a.nom}</b>
                <small>{a.dispo ? F(a.prix) : "Épuisé"}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      {v.articles.length === 0 && v.modeles.length === 0 && <p className="vp-bio">La vitrine se prépare : reviens bientôt.</p>}
      <footer className="vp-foot">Vitrine faite avec Jokko · jokkoapp.com</footer>
    </main>
  );
}
