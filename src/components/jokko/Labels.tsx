import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Shop } from "@/model";
import { withCodes } from "@/data/barcode";
import { type LabelItem, shareLabels } from "@/data/labels";

/**
 * Étiquettes à imprimer (patron) : on choisit les articles et le nombre d'étiquettes.
 * Les articles sans code reçoivent un code Jokko ; ceux qui ont déjà le code du fabricant gardent le leur
 * (inutile d'imprimer : on scanne l'emballage). Le PDF s'imprime sur une planche de 21 autocollants, ou sur papier normal.
 */
export function Labels({ shop, commit, onClose }: { shop: Shop; commit: (s: Shop) => void; onClose: () => void }) {
  const [copies, setCopies] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const key = (id: string, retail: boolean) => `${id}:${retail ? "d" : "g"}`;
  const rows = shop.products.flatMap((p) => [
    { product: p, retail: false, unit: p.unit, price: p.price, code: p.barcode },
    ...(p.retail ? [{ product: p, retail: true, unit: p.retail.unit, price: p.retail.price, code: p.retail.barcode }] : []),
  ]);
  const chosen = rows.filter((r) => (copies[key(r.product.id, r.retail)] ?? 0) > 0);
  const total = chosen.reduce((a, r) => a + (copies[key(r.product.id, r.retail)] ?? 0), 0);
  const isMaker = (code?: string) => Boolean(code && !code.startsWith("20"));

  async function print() {
    setBusy(true);
    setNote("");
    // 1. Codes Jokko pour ce qui n'en a pas encore (enregistrés dans la boutique : les mêmes codes à chaque impression)
    const coded = withCodes(shop, [...new Set(chosen.map((r) => r.product.id))]);
    if (coded !== shop) commit(coded);
    const items: LabelItem[] = chosen.map((r) => ({
      product: coded.products.find((p) => p.id === r.product.id)!,
      retail: r.retail,
      copies: copies[key(r.product.id, r.retail)] ?? 0,
    }));
    try {
      setNote(await shareLabels(coded, items));
    } catch {
      setNote("Le PDF n'a pas pu être créé. Réessaie.");
    }
    setBusy(false);
  }

  return (
    <div className="labels">
      <div className="sheet-head">
        <h3>Étiquettes à imprimer</h3>
        <Button variant="ghost" className="h-9 rounded-full px-3" onClick={onClose}>Fermer</Button>
      </div>
      <p className="note">Mets le nombre d'étiquettes pour chaque article. Les produits qui ont déjà un code-barres sur l'emballage n'en ont pas besoin : scanne l'emballage une fois pour le relier.</p>
      <ul className="labels-list">
        {rows.map((r) => {
          const k = key(r.product.id, r.retail);
          return (
            <li key={k}>
              <span>
                <b>{r.product.name}</b> · {r.unit}
                <small>{r.code ? (isMaker(r.code) ? " · code du fabricant" : " · code Jokko") : " · pas encore de code"}</small>
              </span>
              <span className="cart-qty">
                <button type="button" aria-label="Moins" onClick={() => setCopies((c) => ({ ...c, [k]: Math.max(0, (c[k] ?? 0) - 1) }))}>−</button>
                <input className="num" inputMode="numeric" aria-label={`Étiquettes ${r.product.name}`} value={copies[k] ?? 0} onChange={(e) => {
                  const n = Math.max(0, Math.min(500, Math.floor(Number(e.target.value) || 0)));
                  setCopies((c) => ({ ...c, [k]: n }));
                }} />
                <button type="button" aria-label="Plus" onClick={() => setCopies((c) => ({ ...c, [k]: Math.min(500, (c[k] ?? 0) + 1) }))}>+</button>
              </span>
            </li>
          );
        })}
      </ul>
      <Button className="h-12 w-full rounded-full font-semibold" disabled={busy || total === 0} onClick={() => void print()}>
        {busy ? "Préparation…" : `Créer le PDF (${total} étiquette${total > 1 ? "s" : ""}, ${Math.ceil(total / 21) || 0} page${total > 21 ? "s" : ""})`}
      </Button>
      {note && <p className="note" role="status">{note}</p>}
      <p className="note">Planche A4 de 21 étiquettes autocollantes (63,5 × 38,1 mm, référence L7160), ou papier normal à découper. Le prix est imprimé pour le client ; si tu changes un prix, réimprime seulement cet article.</p>
    </div>
  );
}
