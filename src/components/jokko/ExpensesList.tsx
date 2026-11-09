import { useState } from "react";
import { Icon } from "./Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Expense, type Shop, money } from "@/model";
import { editExpense, removeExpense } from "@/data/sales";

const num = (v: string) => Number(v.replace(/[^\d]/g, ""));
const KIND: Record<string, string> = { perte: " (perte de stock)", achat: " (achat de marchandise)" };

/** Liste des dépenses, avec « Modifier » (nom, montant) et « Supprimer » sous chacune (patron seulement). */
export function ExpensesList({ shop, commit, canEdit }: { shop: Shop; commit: (s: Shop) => void; canEdit: boolean }) {
  return (
    <section className="sheet">
      <div className="sheet-head">
        <h2>Dépenses</h2>
        <span className="count num">{shop.expenses.length}</span>
      </div>
      <div className="list">
        {shop.expenses.length === 0 && <p className="note">Rien pour l’instant.</p>}
        {shop.expenses.map((e) => <ExpenseRow key={e.id} e={e} shop={shop} commit={commit} canEdit={canEdit} />)}
      </div>
    </section>
  );
}

function ExpenseRow({ e, shop, commit, canEdit }: { e: Expense; shop: Shop; commit: (s: Shop) => void; canEdit: boolean }) {
  const [mode, setMode] = useState<"" | "modifier" | "supprimer">("");
  const [label, setLabel] = useState(e.label);
  const [price, setPrice] = useState(String(e.amount));
  const stockNote = e.kind === "achat" || e.kind === "perte" ? " Le stock ne change pas : corrige-le dans Stock si besoin." : "";
  return (
    <article style={{ flexWrap: "wrap" }}>
      <span>
        {e.label}{KIND[e.kind ?? ""] ?? ""}
        <small>{new Date(e.at).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</small>
      </span>
      <b className="num">{money(e.amount)}</b>
      {canEdit && mode === "" && (
        <div className="debt-actions" style={{ width: "100%", flexBasis: "100%", gap: 8, marginTop: 6 }}>
          <Button variant="outline" className="h-10 rounded-full px-4" onClick={() => setMode("modifier")}><Icon name="modifier" size="sm" /> Modifier</Button>
          <Button variant="outline" className="h-10 rounded-full px-4" onClick={() => setMode("supprimer")}><Icon name="supprimer" size="sm" /> Supprimer</Button>
        </div>
      )}
      {canEdit && mode === "supprimer" && (
        <div className="debt-actions" style={{ width: "100%", flexBasis: "100%", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
          <small className="note" style={{ flex: 1 }}>Supprimer cette dépense ? L'argent revient dans la caisse.{stockNote}</small>
          <Button variant="destructive" className="h-10 rounded-full px-4" onClick={() => commit(removeExpense(shop, e.id))}>Oui, supprimer</Button>
          <Button variant="ghost" className="h-10 rounded-full px-3" onClick={() => setMode("")}>Non</Button>
        </div>
      )}
      {canEdit && mode === "modifier" && (
        <div style={{ display: "grid", gap: 8, width: "100%", flexBasis: "100%", marginTop: 8 }}>
          <label className="note">Nom<Input className="h-11" value={label} onChange={(x) => setLabel(x.target.value)} /></label>
          <label className="note">Montant (F)<Input className="h-11 num" inputMode="numeric" value={price} onChange={(x) => setPrice(x.target.value)} /></label>
          <div className="debt-actions" style={{ gap: 8 }}>
            <Button className="h-11 rounded-full px-5" disabled={!(num(price) > 0)} onClick={() => { commit(editExpense(shop, e.id, { amount: num(price), label })); setMode(""); }}>
              <Icon name="sauvegarde" size="sm" /> Enregistrer
            </Button>
            <Button variant="ghost" className="h-11 rounded-full px-4" onClick={() => setMode("")}>Annuler</Button>
          </div>
        </div>
      )}
    </article>
  );
}
