import { useState } from "react";
import { Icon } from "./Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Sale, type Shop, money } from "@/model";
import { editSale, removeSale } from "@/data/sales";

const num = (v: string) => Number(v.replace(/[^\d.,]/g, "").replace(",", "."));

/**
 * Liste des ventes. Chaque vente a ses boutons « Modifier » (prix, quantité) et « Supprimer » (patron seulement)
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
    <article style={{ flexWrap: "wrap" }}>
      <span>
        {s.qty && s.unit ? `${String(s.qty).replace(".", ",")} ${s.unit} · ` : ""}{s.label}
        <small>{when}{s.payment && s.payment !== "especes" ? ` · ${s.payment === "credit" ? "crédit" : s.payment === "om" ? "Orange Money" : "Wave"}` : ""}</small>
      </span>
      <b className="num">{money(s.amount)}</b>
      {canEdit && !open && (
        <div className="debt-actions" style={{ width: "100%", flexBasis: "100%", gap: 8, marginTop: 6 }}>
          {sure ? (
            <>
              <small className="note" style={{ flex: 1 }}>Supprimer cette vente ?{s.productId ? " L'article revient en stock." : ""}</small>
              <Button variant="destructive" className="h-10 rounded-full px-4" onClick={() => commit(removeSale(shop, s.id))}>Oui, supprimer</Button>
              <Button variant="ghost" className="h-10 rounded-full px-3" onClick={() => setSure(false)}>Non</Button>
            </>
          ) : (
            <>
              <Button variant="outline" className="h-10 rounded-full px-4" onClick={toggle}>
                <Icon name="modifier" size="sm" /> Modifier
              </Button>
              <Button variant="outline" className="h-10 rounded-full px-4" onClick={() => setSure(true)}>
                <Icon name="supprimer" size="sm" /> Supprimer
              </Button>
            </>
          )}
        </div>
      )}
      {open && canEdit && (
        <div style={{ display: "grid", gap: 8, width: "100%", flexBasis: "100%", marginTop: 8 }}>
          {s.qty !== undefined && (
            <label className="note">
              Quantité {s.unit ? `(${s.unit})` : ""}
              <Input className="h-11" inputMode="decimal" value={qty} onChange={(e) => changeQty(e.target.value)} />
            </label>
          )}
          <label className="note">
            Prix de la vente (F)
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
            <Button variant="ghost" className="h-11 rounded-full px-4" onClick={toggle}>Annuler</Button>
          </div>
        </div>
      )}
    </article>
  );
}
