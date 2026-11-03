import { JokkoMark } from "./JokkoMark";
import { Icon } from "./Icon";
import { CFC_WHATSAPP } from "./Cfc";
import { useRef, useState } from "react";
import { claimAccessCode } from "@/data/launch";

/** Voile « Bientôt disponible » posé sur la page d'accueil avant le lancement officiel (on voit le site derrière). */
export function ComingSoon() {
  const wa = `https://wa.me/${CFC_WHATSAPP}?text=${encodeURIComponent("Bonjour CFC, je veux être prévenu du lancement de Jokko.")}`;
  // Équipe CFC : toucher 5 fois le logo fait apparaître le champ « code d'accès » (utile dans l'application, sans barre d'adresse).
  const taps = useRef<number[]>([]);
  const [asking, setAsking] = useState(false);
  const [code, setCode] = useState("");
  const [wrong, setWrong] = useState(false);
  function tap() {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 3000), now];
    if (taps.current.length >= 5) setAsking(true);
  }
  async function enter() {
    setWrong(false);
    if (await claimAccessCode(code)) window.location.reload();
    else setWrong(true);
  }
  return (
    <div className="soon" role="dialog" aria-modal="true" aria-labelledby="soon-title">
      <div className="soon-card">
        <span onClick={tap} aria-hidden="true"><JokkoMark size={84} /></span>
        <p className="soon-brand">Jokko</p>
        <h1 id="soon-title">Bientôt disponible</h1>
        <p className="soon-text">L’assistant vocal qui tient ta boutique, en wolof et en français. Le lancement arrive très bientôt.</p>
        <a className="soon-wa" href={wa} target="_blank" rel="noreferrer"><Icon name="whatsapp" size="sm" /> Être prévenu sur WhatsApp</a>
        {asking && (
          <form className="soon-code" onSubmit={(e) => { e.preventDefault(); void enter(); }}>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code d’accès" aria-label="Code d’accès" autoFocus autoComplete="off" />
            <button type="submit">Entrer</button>
            {wrong && <small>Code incorrect.</small>}
          </form>
        )}
        <p className="soon-cfc">Une solution CFC – Cissé Family Company</p>
      </div>
    </div>
  );
}
