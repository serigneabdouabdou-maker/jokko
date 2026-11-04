import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type Product, money } from "@/model";
import { normalizeCode } from "@/data/barcode";

const toNum = (s: string) => {
  const n = Number(s.replace(/[\s  ]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

/**
 * Fiche d'un article : prix d'achat (gros), prix de vente, et vente au détail.
 * Le bénéfice par unité s'affiche en direct pendant la saisie.
 */
export function ProductEditor({
  product,
  onSave,
  onClose,
  codeOwner,
  onDelete,
}: {
  product: Product;
  onSave: (p: Product, stockChanged: boolean) => void;
  onClose: () => void;
  /** Id de l'article qui porte déjà ce code (pour éviter deux articles avec le même code). */
  codeOwner?: (code: string) => string | undefined;
  /** Supprimer l'article (patron) : demandé avec confirmation. */
  onDelete?: () => void;
}) {
  const [name, setName] = useState(product.name);
  const [unit, setUnit] = useState(product.unit);
  const [cost, setCost] = useState(product.cost !== undefined ? String(product.cost) : "");
  const [price, setPrice] = useState(String(product.price));
  const [min, setMin] = useState(String(product.min));
  const [stock, setStock] = useState(String(product.stock));
  const [retailOn, setRetailOn] = useState(Boolean(product.retail));
  const [retailUnit, setRetailUnit] = useState(product.retail?.unit ?? "sachet");
  const [perUnit, setPerUnit] = useState(product.retail ? String(product.retail.perUnit) : "");
  const [retailPrice, setRetailPrice] = useState(product.retail ? String(product.retail.price) : "");
  const [code, setCode] = useState(product.barcode ?? "");
  const [aliases, setAliases] = useState((product.aliases ?? []).join(", "));
  const [expires, setExpires] = useState(product.expiresAt ?? "");
  const [retailCode, setRetailCode] = useState(product.retail?.barcode ?? "");
  const [error, setError] = useState("");

  const c = toNum(cost);
  const p = toNum(price);
  const n = toNum(perUnit);
  const rp = toNum(retailPrice);
  const bulkMargin = cost && Number.isFinite(c) && Number.isFinite(p) ? p - c : null;
  const retailMargin = retailOn && cost && Number.isFinite(c) && n > 0 && Number.isFinite(rp) ? rp * n - c : null;

  function save() {
    if (!name.trim()) return setError("Donne un nom à l'article.");
    if (!Number.isFinite(p) || p < 0) return setError("Le prix de vente n'est pas un nombre.");
    if (cost && (!Number.isFinite(c) || c < 0)) return setError("Le prix d'achat n'est pas un nombre.");
    const s = toNum(stock);
    if (!Number.isFinite(s) || s < 0) return setError("Le stock n'est pas un nombre.");
    if (retailOn && (!retailUnit.trim() || !(n > 0) || !Number.isFinite(rp) || rp < 0)) {
      return setError("Pour le détail : l'unité, combien dans une unité de gros, et le prix.");
    }
    const next: Product = {
      id: product.id,
      name: name.trim(),
      unit: unit.trim() || "pièce",
      stock: s,
      min: Math.max(0, toNum(min) || 0),
      price: Math.round(p),
    };
    const cleanCode = (v: string) => normalizeCode(v);
    if (code.trim() && !/^[0-9A-Za-z-]{4,32}$/.test(cleanCode(code))) return setError("Le code-barres n'est pas valable.");
    if (retailOn && retailCode.trim() && !/^[0-9A-Za-z-]{4,32}$/.test(cleanCode(retailCode))) return setError("Le code-barres du détail n'est pas valable.");
    const taken = (v: string) => {
      const other = codeOwner?.(cleanCode(v));
      return other && other !== product.id ? other : null;
    };
    if (code.trim() && taken(code)) return setError("Ce code-barres est déjà sur un autre article.");
    if (retailOn && retailCode.trim() && taken(retailCode)) return setError("Ce code-barres du détail est déjà sur un autre article.");
    if (cost && Number.isFinite(c)) next.cost = Math.round(c);
    if (code.trim()) next.barcode = cleanCode(code);
    const names = [...new Set(aliases.split(/[,;\n]/).map((a) => a.trim()).filter((a) => a && a.toLowerCase() !== next.name.toLowerCase()))].slice(0, 8);
    if (names.length) next.aliases = names;
    if (product.lots?.length) {
      next.lots = product.lots;
      if (product.expiresAt) next.expiresAt = product.expiresAt;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(expires)) next.expiresAt = expires;
    if (retailOn) next.retail = { unit: retailUnit.trim(), perUnit: n, price: Math.round(rp), ...(retailCode.trim() ? { barcode: cleanCode(retailCode) } : {}) };
    // Le stock n'est remplacé que si on l'a changé ici (une vente à la voix a pu le modifier entre-temps).
    onSave(next, stock.trim() !== String(product.stock));
  }

  return (
    <div className="product-editor" role="group" aria-label={`Fiche ${product.name}`}>
      <div className="grid-2">
        <div className="field">
          <Label htmlFor="pe-name">Article</Label>
          <Input id="pe-name" className="h-11" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <Label htmlFor="pe-unit">Unité de gros (sac, bidon, carton…)</Label>
          <Input id="pe-unit" className="h-11" value={unit} onChange={(e) => setUnit(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <Label htmlFor="pe-alias">Autres noms, en wolof ou surnoms (séparés par des virgules)</Label>
        <Input id="pe-alias" className="h-11" value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="ex. diwu oto, diwu moteur" />
        <p className="note">Comment tes clients et tes vendeurs appellent cet article : Jokko le reconnaîtra mieux à la voix, surtout en wolof.</p>
      </div>
      <div className="field">
        <Label htmlFor="pe-expires">Date de péremption (si l'article périme)</Label>
        {product.lots?.length ? (
          <p className="note">
            Lots : {[...product.lots].sort((a, b) => a.expiresAt.localeCompare(b.expiresAt)).map((l) => `${l.qty} ${product.unit} → ${new Date(`${l.expiresAt}T12:00:00`).toLocaleDateString("fr-FR")}${l.lot ? ` (lot ${l.lot})` : ""}`).join(" · ")}. Ajoute une livraison avec « Réception (dates) ».
          </p>
        ) : (
          <Input id="pe-expires" type="date" className="h-11" value={expires} onChange={(e) => setExpires(e.target.value)} />
        )}
        <p className="note">Jokko te prévient 30 jours avant. Utile pour les médicaments, le lait, les conserves.</p>
      </div>
      <div className="grid-2">
        <div className="field">
          <Label htmlFor="pe-cost">Prix d'achat en gros (1 {unit || "unité"})</Label>
          <Input id="pe-cost" className="num h-11" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="ex. 30000" />
        </div>
        <div className="field">
          <Label htmlFor="pe-price">Prix de vente (1 {unit || "unité"})</Label>
          <Input id="pe-price" className="num h-11" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
      </div>
      <div className="grid-2">
        <div className="field">
          <Label htmlFor="pe-stock">En stock ({unit || "unités"})</Label>
          <Input id="pe-stock" className="num h-11" inputMode="decimal" value={stock} onChange={(e) => setStock(e.target.value)} />
        </div>
        <div className="field">
          <Label htmlFor="pe-min">Alerte stock bas à</Label>
          <Input id="pe-min" className="num h-11" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} />
        </div>
      </div>

      <div className="field">
        <Label htmlFor="pe-code">Code-barres (scanne-le avec la douchette, ou tape les chiffres)</Label>
        <Input id="pe-code" className="num h-11" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Vide : Jokko en crée un pour l'étiquette" />
      </div>

      <div className="row">
        <Checkbox id="pe-retail" checked={retailOn} onCheckedChange={(v) => setRetailOn(v === true)} />
        <Label htmlFor="pe-retail">Se vend aussi au détail (sachet, kilo, pièce…)</Label>
      </div>
      {retailOn && (
        <div className="grid-3">
          <div className="field">
            <Label htmlFor="pe-runit">Unité de détail</Label>
            <Input id="pe-runit" className="h-11" value={retailUnit} onChange={(e) => setRetailUnit(e.target.value)} />
          </div>
          <div className="field">
            <Label htmlFor="pe-per">Combien dans 1 {unit || "unité"}</Label>
            <Input id="pe-per" className="num h-11" inputMode="decimal" value={perUnit} onChange={(e) => setPerUnit(e.target.value)} placeholder="ex. 50" />
          </div>
          <div className="field">
            <Label htmlFor="pe-rprice">Prix d'1 {retailUnit || "unité"}</Label>
            <Input id="pe-rprice" className="num h-11" inputMode="numeric" value={retailPrice} onChange={(e) => setRetailPrice(e.target.value)} placeholder="ex. 900" />
          </div>
          <div className="field">
            <Label htmlFor="pe-rcode">Code-barres du détail</Label>
            <Input id="pe-rcode" className="num h-11" inputMode="numeric" value={retailCode} onChange={(e) => setRetailCode(e.target.value)} placeholder="Facultatif" />
          </div>
        </div>
      )}

      <div className="margins" aria-live="polite">
        {bulkMargin !== null ? (
          <span data-tone={bulkMargin < 0 ? "bad" : "good"}>Bénéfice en gros : <b className="num">{money(bulkMargin)}</b> par {unit || "unité"}</span>
        ) : (
          <span>Mets le prix d'achat pour voir le bénéfice.</span>
        )}
        {retailMargin !== null && (
          <span data-tone={retailMargin < 0 ? "bad" : "good"}>
            Au détail : <b className="num">{money(retailMargin)}</b> par {unit || "unité"} vendue en {retailUnit}s
          </span>
        )}
      </div>
      {error && <p className="note" role="alert" data-tone="error">{error}</p>}
      <div className="import-actions">
        <Button className="h-11 rounded-full px-5 font-semibold" onClick={save}>Enregistrer</Button>
        <Button variant="ghost" className="h-11 rounded-full px-4" onClick={onClose}>Fermer</Button>
        {onDelete && (
          <Button
            variant="ghost"
            className="product-delete h-11 rounded-full px-4"
            onClick={() => {
              const left = product.stock > 0 ? ` Il en reste ${product.stock} ${product.unit}.` : "";
              if (window.confirm(`Supprimer « ${product.name} » du stock ?${left} Les ventes passées restent dans le bilan et le journal.`)) onDelete();
            }}
          >
            Supprimer l'article
          </Button>
        )}
      </div>
    </div>
  );
}
