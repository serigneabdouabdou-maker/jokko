import { JokkoMark } from "./JokkoMark";
import { Icon } from "./Icon";
import { CFC_WHATSAPP } from "./Cfc";

/** Voile « Bientôt disponible » posé sur la page d'accueil avant le lancement officiel (on voit le site derrière). */
export function ComingSoon() {
  const wa = `https://wa.me/${CFC_WHATSAPP}?text=${encodeURIComponent("Bonjour CFC, je veux être prévenu du lancement de Jokko.")}`;
  return (
    <div className="soon" role="dialog" aria-modal="true" aria-labelledby="soon-title">
      <div className="soon-card">
        <JokkoMark size={84} />
        <p className="soon-brand">Jokko</p>
        <h1 id="soon-title">Bientôt disponible</h1>
        <p className="soon-text">L’assistant vocal qui tient ta boutique, en wolof et en français. Le lancement arrive très bientôt.</p>
        <a className="soon-wa" href={wa} target="_blank" rel="noreferrer"><Icon name="whatsapp" size="sm" /> Être prévenu sur WhatsApp</a>
        <p className="soon-cfc">Une solution CFC – Cissé Family Company</p>
      </div>
    </div>
  );
}
