import { useRef, useState } from "react";
import { Icon } from "@/components/jokko/Icon";

const SRC = "/media/jokko-metiers-v1.mp4";
const POSTER = "/media/jokko-metiers-v1.jpg";

/**
 * « Jokko en 1 minute » : l'épisode de Modou qui présente chaque métier (voix wolof, sous-titres français).
 * Rien n'est téléchargé avant le toucher (preload="none") : la page reste légère sur les téléphones.
 */
export function LandingVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const share = `https://wa.me/?text=${encodeURIComponent("Jokko, l'assistant vocal des commerçants, en wolof et en français. Regarde la vidéo : https://jokkoapp.com/#video")}`;
  return (
    <section className="lv" id="video" aria-labelledby="lv-title">
      <div className="lv-copy">
        <p className="eyebrow">Jokko en 1 minute</p>
        <h2 id="lv-title">Modou vous présente Jokko, <em className="accent">métier par métier.</em></h2>
        <p className="lede">Pharmacie, couture, quincaillerie, vêtements, réparation, boutique : écoutez Jokko en wolof, avec les sous-titres en français.</p>
        <a className="lv-share" href={share} target="_blank" rel="noopener"><Icon name="partager" size="sm" /> Partager sur WhatsApp</a>
      </div>
      <div className="lv-frame">
        <video ref={ref} src={SRC} poster={POSTER} preload="none" playsInline controls={playing} onPlay={() => setPlaying(true)} onEnded={() => setPlaying(false)} aria-label="Vidéo : Modou présente Jokko pour chaque métier" />
        {!playing && (
          <button type="button" className="lv-play" onClick={() => { setPlaying(true); void ref.current?.play(); }} aria-label="Lire la vidéo (1 minute, avec le son)">
            <span className="lv-play-btn"><Icon name="lecture" /></span>
            <span className="lv-play-text">Regarder · 1 min · avec le son</span>
          </button>
        )}
      </div>
    </section>
  );
}
