import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/jokko/Icon";
import { rememberMetier } from "@/components/jokko/MetierCards";
import { galleryUrl } from "@/data/studio";
import type { MetierId } from "@/data/metiers";

/** Diaporama de l'accueil : un métier par image (photos IA signées Jokko), avec ce que Jokko fait pour lui. */
type Slide = { id: MetierId; img: string; tag: string; title: string; said: string; points: string[]; cta: string };

const SLIDES: Slide[] = [
  { id: "alimentation", img: "alimentation", tag: "Boutique", title: "Ceeb, diw, suukar : Jokko comprend.", said: "« Jaay naa ñaari kilo ceeb »", points: ["Ventes à la voix", "Dettes des clients", "Alerte avant la rupture"], cta: "Ouvrir ma boutique" },
  { id: "pharmacie", img: "pharmacie", tag: "Pharmacie", title: "Aucune boîte ne périme en silence.", said: "« Quels produits périment bientôt ? »", points: ["Lots et péremption", "Stock des médicaments", "Caisse du soir"], cta: "Ouvrir ma pharmacie" },
  { id: "couture", img: "couture", tag: "Couture", title: "Mesures et commandes, à la voix.", said: "« Grand boubou pour Awa, avance 10 000 »", points: ["Studio d'essayage", "Avance et reste", "Lien de suivi pour le client"], cta: "Ouvrir mon atelier" },
  { id: "quincaillerie", img: "quincaillerie", tag: "Quincaillerie", title: "Chaque sac de ciment compté.", said: "« Il me reste combien de ciment ? »", points: ["Stock en sacs, barres, mètres", "Crédits des chantiers", "Factures WhatsApp"], cta: "Ouvrir ma quincaillerie" },
  { id: "vetements", img: "vetements", tag: "Vêtements et chaussures", title: "Votre vitrine sur WhatsApp.", said: "« Il me reste combien de pantalons ? »", points: ["Stock par pièce et par paire", "Vitrine à partager", "Bénéfice de la semaine"], cta: "Ouvrir ma boutique" },
  { id: "reparation", img: "reparation", tag: "Réparation", title: "Du dépôt au « c'est prêt ».", said: "« Awa dépose un iPhone, écran cassé »", points: ["Pannes et pièces posées", "Message « c'est prêt »", "Bénéfice par réparation"], cta: "Ouvrir mon atelier" },
];
const EVERY = 5000;
const src = (s: Slide) => galleryUrl(`accueil/${s.img}-v1.jpg`);

export function MetierSlides({ onStart }: { onStart: () => void }) {
  const [at, setAt] = useState(0);
  const [paused, setPaused] = useState(false);
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const touch = useRef<number | null>(null);
  const still = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (paused || still) return;
    const timer = window.setTimeout(() => setAt((i) => (i + 1) % SLIDES.length), EVERY);
    return () => window.clearTimeout(timer);
  }, [at, paused, still]);

  // L'image suivante se charge en avance : pas d'écran blanc au passage.
  useEffect(() => {
    const next = new Image();
    next.src = src(SLIDES[(at + 1) % SLIDES.length]);
  }, [at]);

  const go = (d: number) => setAt((i) => (i + d + SLIDES.length) % SLIDES.length);
  const slide = SLIDES[at];

  return (
    <div
      className="ms"
      role="region"
      aria-roledescription="diaporama"
      aria-label="Jokko pour chaque métier"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; setPaused(true); }}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0].clientX - (touch.current ?? e.changedTouches[0].clientX);
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        touch.current = null;
        window.setTimeout(() => setPaused(false), 4000);
      }}
    >
      {SLIDES.map((s, i) => (
        <div key={s.id} className="ms-slide" data-on={i === at} aria-hidden={i !== at}>
          {!broken[s.id] && (
            <img src={src(s)} alt={`${s.tag} équipée de Jokko`} loading={i === 0 ? "eager" : "lazy"} fetchPriority={i === 0 ? "high" : "auto"} onError={() => setBroken((b) => ({ ...b, [s.id]: true }))} />
          )}
        </div>
      ))}
      <div className="ms-shade" aria-hidden="true" />
      <div className="ms-copy" key={slide.id} aria-live="polite">
        <span className="ms-tag">{slide.tag}</span>
        <h2>{slide.title}</h2>
        <p className="ms-said"><Icon name="micro" size="sm" /> {slide.said}</p>
        <ul>{slide.points.map((p) => <li key={p}>{p}</li>)}</ul>
        <Button className="h-11 rounded-full px-5" onClick={() => { rememberMetier(slide.id); onStart(); }}>
          {slide.cta} <Icon name="suivant" size="sm" />
        </Button>
      </div>
      <div className="ms-dots" role="tablist" aria-label="Choisir un métier">
        {SLIDES.map((s, i) => (
          <button key={s.id} type="button" role="tab" aria-selected={i === at} aria-label={s.tag} data-on={i === at} onClick={() => setAt(i)}>
            <span style={i === at && !paused && !still ? { animationDuration: `${EVERY}ms` } : undefined} />
          </button>
        ))}
      </div>
    </div>
  );
}
