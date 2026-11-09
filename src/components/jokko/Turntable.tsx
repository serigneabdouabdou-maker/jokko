import { useRef, useState } from "react";

const ANGLES = ["Face", "Profil", "Dos"];

/**
 * Le modèle qui tourne : on glisse le doigt (ou on touche Face / Profil / Dos) pour passer d'une vue à l'autre.
 * Avec une seule photo, elle « respire » doucement (léger zoom lent), sans jamais dépasser la qualité de l'image.
 */
export function Turntable({ frames, alt, className = "", zoom = false, onTap }: { frames: string[]; alt: string; className?: string; zoom?: boolean; onTap?: () => void }) {
  const [at, setAt] = useState(0);
  const start = useRef<number | null>(null);
  const moved = useRef(false);
  const many = frames.length > 1;
  const go = (i: number) => setAt((i + frames.length) % frames.length);

  return (
    <div className={`tt ${className}`}>
      <div
        className="tt-view"
        onPointerDown={(e) => { start.current = e.clientX; moved.current = false; }}
        onPointerMove={(e) => {
          if (!many || start.current === null) return;
          const dx = e.clientX - start.current;
          if (Math.abs(dx) > 40) {
            go(at + (dx < 0 ? 1 : -1));
            start.current = e.clientX;
            moved.current = true;
          }
        }}
        onPointerUp={() => { if (!moved.current) onTap?.(); start.current = null; }}
        onPointerCancel={() => { start.current = null; }}
        style={{ touchAction: many ? "pan-y" : "auto" }}
      >
        {frames.map((src, i) => (
          <img key={src} src={src} alt={i === 0 ? alt : `${alt}, ${ANGLES[i]?.toLowerCase() ?? "autre vue"}`} className={`${i === at ? "on" : ""}${zoom && i === at ? " is-zoom" : ""}${!many ? " tt-breathe" : ""}`} draggable={false} />
        ))}
        {many && <span className="tt-hint" aria-hidden="true">Glisse pour tourner</span>}
      </div>
      {many && (
        <div className="tt-angles" role="tablist" aria-label="Vue">
          {frames.map((_, i) => (
            <button key={i} type="button" role="tab" aria-selected={i === at} className={i === at ? "on" : ""} onClick={() => go(i)}>{ANGLES[i] ?? `Vue ${i + 1}`}</button>
          ))}
        </div>
      )}
    </div>
  );
}
