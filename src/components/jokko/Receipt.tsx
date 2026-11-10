import { Button } from "@/components/ui/button";
import { Icon } from "./Icon";
import { rawbtLink } from "@/data/tickets";

const isAndroid = () => typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);

/**
 * Aperçu d'un ticket (client ou Z) au format de l'imprimante 58 mm, avec trois façons de le sortir :
 * - Imprimante Bluetooth (Android, appli gratuite RawBT) : le ticket sort directement ;
 * - Imprimer : l'impression du téléphone (service d'impression installé) ;
 * - WhatsApp : le ticket en message, sans imprimante.
 */
export function Receipt({ text, title, onClose }: { text: string; title: string; onClose: () => void }) {
  function printIt() {
    const w = window.open("", "_blank", "width=380,height=640");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>@page{size:58mm auto;margin:2mm}body{margin:0;font:12px/1.35 ui-monospace,Menlo,Consolas,monospace;white-space:pre;width:48mm}</style></head><body>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
  }
  return (
    <div className="rc-backdrop" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="rc-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="rc-head">
          <h3>{title}</h3>
          <button type="button" className="link" onClick={onClose}>Fermer</button>
        </div>
        <pre className="rc-paper">{text}</pre>
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
    </div>
  );
}
