import { useState } from "react";
import { Icon } from "./Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Sale, type Shop, money } from "@/model";
import { editSale, removeSale } from "@/data/sales";

const num = (v: string) => Number(v.replace(/[^\d.,]/g, "").replace(",", "."));

/**
 * Liste des ventes. Le patron touche une vente pour corriger le prix ou la quantité, ou la supprimer
 * (le stock revient, la dette du client à crédit baisse, la caisse du jour suit).
 */
export function SalesList({ shop, commit, canEdit, sales, empty = "Rien pour l’instant." }: { shop: Shop; commit: (s: Shop) => void; canEdit: boolean; sales: Sale[]; empty?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="list">
      {sales.length === 0 && <p className="note">{empty}</p>}
      {sales.map((s) => (
        <SaleRow key={s.id} s={s} shop={shop} commit={commit} canEdit={canEdit} open={open === s.id} toggle={() => setOpen(open === s.id ? null : s.id)} />
      ))}
      {canEdit && sales.length > 0 && <small className="note">Touche une vente pour corriger le prix ou la supprimer.</small>}
    </div>
  );
}

function SaleRow({ s, shop, commit, canEdit, open, toggle }: { s: Sale; shop: Shop; commit: (s: Shop) => void; canEdit: boolean; open: boolean; toggle: () => void }) {
  const [price, setPrice] = useState(String(s.amount));
  const [qty, setQty] = useState(s.qty !== undefined ? String(s.qty) : "");
  const [sure, setSure] = useState(false);
  const when = new Date(s.at).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const unitPrice = s.qty && s.qty > 0 ? s.amount / s.qty : null;

  function changeQty(v: string) {
    setQty(v);
    // Quantité changée : le prix suit (même prix de l'unité), le patron peut encore le corriger.
    const q = num(v);
    if (unitPrice && q > 0) setPrice(String(Math.round(unitPrice * q)));
  }

  return (
    <article style={open ? { flexWrap: "wrap" } : undefined}>
      <span onClick={canEdit ? toggle : undefined} style={canEdit ? { cursor: "pointer" } : undefined}>
        {s.qty && s.unit ? `${String(s.qty).replace(".", ",")} ${s.unit} · ` : ""}{s.label}
        <small>{when}{s.payment && s.payment !== "especes" ? ` · ${s.payment === "credit" ? "crédit" : s.payment === "om" ? "Orange Money" : "Wave"}` : ""}</small>
      </span>
      <b className="num" onClick={canEdit ? toggle : undefined}>{money(s.amount)}</b>
      {open && canEdit && (
        <div style={{ display: "grid", gap: 8, width: "100%", flexBasis: "100%", marginTop: 8 }}>
          {s.qty !== undefined && (
            <label className="note">
              Quantité {s.unit ? `(${s.unit})` : ""}
              <Input className="h-11" inputMode="decimal" value={qty} onChange={(e) => changeQty(e.target.value)} />
            </label>
          )}
          <label className="note">
            Prix total (F)
            <Input className="h-11 num" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
          <div className="debt-actions" style={{ flexWrap: "wrap", gap: 8 }}>
            <Button
              className="h-11 rounded-full px-5"
              disabled={!(num(price) > 0)}
              onClick={() => {
                commit(editSale(shop, s.id, { amount: num(price), qty: qty ? num(qty) : undefined }));
                toggle();
              }}
            >
              <Icon name="sauvegarde" size="sm" /> Enregistrer
            </Button>
            <Button
              variant={sure ? "destructive" : "outline"}
              className="h-11 rounded-full px-5"
              onClick={() => {
                if (!sure) return setSure(true);
                commit(removeSale(shop, s.id));
              }}
            >
              {sure ? "Oui, supprimer" : "Supprimer la vente"}
            </Button>
            <Button variant="ghost" className="h-11 rounded-full px-4" onClick={() => { setSure(false); toggle(); }}>Annuler</Button>
          </div>
          {sure && <small className="note">La vente sera effacée{s.productId ? ", l'article revient dans le stock" : ""}{s.payment === "credit" ? ", la dette du client baisse" : ""}.</small>}
        </div>
      )}
    </article>
  );
}
