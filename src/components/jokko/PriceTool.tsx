import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Shop, money } from "@/model";
import { adjustPrices } from "@/assistant/stockEntry";

const amount = (n: number) => money(n).replace(/ /g, " ");

/** Changer les prix en lot (patron) : tous les articles ou un seul, en % ou en francs, avec un aperçu avant. */
export function PriceTool({ shop, commit, onClose }: { shop: Shop; commit: (s: Shop) => void; onClose: () => void }) {
  const [kind, setKind] = useState<"pourcent" | "francs">("pourcent");
  const [value, setValue] = useState("5");
  const [scope, setScope] = useState("tous");
  const [note, setNote] = useState("");
  const n = Number(value.replace(",", "."));
  const ids = scope === "tous" ? ("tous" as const) : [scope];
  const preview = Number.isFinite(n) && n !== 0 ? adjustPrices(shop, ids, { kind, value: n }) : null;
  const changed = preview ? preview.products.filter((p, i) => p.price !== shop.products[i].price || p.retail?.price !== shop.products[i].retail?.price) : [];

  return (
    <div className="price-tool">
      <div className="sheet-head">
        <h3>Changer les prix</h3>
        <Button variant="ghost" className="h-9 rounded-full px-3" onClick={onClose}>Fermer</Button>
      </div>
      <div className="price-tool-row">
        <select className="h-11 rounded-md border px-3" value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Articles">
          <option value="tous">Tous les articles</option>
          {shop.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <Input className="num h-11" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Changement" />
        <div className="pay-modes">
          <button type="button" className={kind === "pourcent" ? "on" : ""} onClick={() => setKind("pourcent")}>%</button>
          <button type="button" className={kind === "francs" ? "on" : ""} onClick={() => setKind("francs")}>F</button>
        </div>
      </div>
      <p className="note">Un nombre négatif baisse les prix (−5 = 5 % de moins). Arrondi aux 5 F. En %, les prix au détail suivent aussi.</p>
      {changed.length > 0 && (
        <ul className="price-preview">
          {changed.slice(0, 6).map((p) => {
            const before = shop.products.find((x) => x.id === p.id)!;
            return <li key={p.id}><span>{p.name}</span><span className="num">{amount(before.price)} → <b>{amount(p.price)}</b></span></li>;
          })}
          {changed.length > 6 && <li><span>… et {changed.length - 6} autre(s)</span></li>}
        </ul>
      )}
      <Button className="h-11 rounded-full px-5" disabled={!preview || !changed.length} onClick={() => {
        if (!preview) return;
        commit(preview);
        setNote(`✓ ${changed.length} prix changé(s). C'est noté dans le Journal.`);
      }}>Appliquer ({changed.length})</Button>
      {note && <p className="note" role="status">{note}</p>}
    </div>
  );
}
