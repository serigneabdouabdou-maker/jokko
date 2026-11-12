import { useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Icon } from "./Icon";
import { rawbtLink } from "@/data/tickets";
import { getPaper, type Paper, paperPage, setPaper } from "@/data/printer";

const isAndroid = () => typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);

/**
 * Aperçu d'un ticket (client ou Z) au format de l'imprimante (58 mm ou 80 mm, réglé sur cet appareil), avec trois façons de le sortir :
 * - Imprimante Bluetooth (Android, appli gratuite RawBT) : le ticket sort directement ;
 * - Imprimer : l'impression de l'appareil (téléphone, ou caisse tactile Windows / Android avec imprimante USB) ;
 * - WhatsApp : le ticket en message, sans imprimante.
 */
export function Receipt({ text: given, build, title, onClose }: { text: string; build?: (paper: Paper) => string; title: string; onClose: () => void }) {
  const [paper, setPaperState] = useState<Paper>(getPaper);
  const text = build ? build(paper) : given;
  function choose(p: Paper) {
    setPaper(p);
    setPaperState(p);
  }
  function printIt() {
    const w = window.open("", "_blank", "width=380,height=640");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${paperPage(paper)}</style></head><body>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
  }
  // Toujours au-dessus de tout l'écran (jamais coincé dans un écran animé, sinon il s'ouvre hors de vue).
  return createPortal(
    <div className="rc-backdrop" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="rc-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="rc-head">
          <h3>{title}</h3>
          <button type="button" className="link" onClick={onClose}>Fermer</button>
        </div>
        {build && (
          <div className="rc-paper-size" role="group" aria-label="Largeur du papier">
            <span>Papier</span>
            {([58, 80] as Paper[]).map((p) => (
              <button key={p} type="button" className={paper === p ? "is-on" : ""} aria-pressed={paper === p} onClick={() => choose(p)}>{p} mm</button>
            ))}
          </div>
        )}
        <pre className={`rc-paper${paper === 80 ? " is-80" : ""}`}>{text}</pre>
        <div className="rc-actions">
          {isAndroid() && (
            <Button asChild className="h-11 rounded-full px-4">
              <a href={rawbtLink(text)}><Icon name="imprimer" size="sm" /> Imprimante Bluetooth</a>
            </Button>
          )}
          <Button variant="outline" className="h-11 rounded-full px-4" onClick={printIt}><Icon name="facture" size="sm" /> Imprimer</Button>
          <Button asChild variant="outline" className="h-11 rounded-full px-4">
            <a href={`https://wa.me/?text=${encodeURIComponent("```\n" + text + "\n```")}`} target="_blank" rel="noopener"><Icon name="partager" size="sm" /> WhatsApp</a>
          </Button>
        </div>
        {isAndroid() && <p className="note">Imprimante Bluetooth : installe une fois l'appli gratuite « RawBT » (Play Store) et choisis ton imprimante dedans.</p>}
      </div>
    </div>,
    document.body,
  );
}
