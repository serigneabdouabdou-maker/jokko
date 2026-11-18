import { useState } from "react";
import { Icon } from "./Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Payment, type Sale, type Shop, money } from "@/model";
import { editSale, removeSale } from "@/data/sales";
import { isServicePayment } from "@/data/report";
import { isToolService } from "@/data/services";
import { type ReceiptDoc, receiptFor } from "@/data/tickets";
import { Receipt } from "./Receipt";

const num = (v: string) => Number(v.replace(/[^\d.,]/g, "").replace(",", "."));

/**
 * Liste des ventes. Chaque vente a ses boutons « Modifier » (prix, quantité) et « Supprimer » (patron seulement)
 * (le stock revient, la dette du client à crédit baisse, la caisse du jour suit).
 */
const PAYS: Array<[Payment, string]> = [["especes", "Espèces"], ["wave", "Wave"], ["om", "Orange Money"]];

/** Ce que la vente a rapporté, écrit en clair sous la ligne (17/11/2026, demande de Fallou : « tout voir, tout corriger »). */
export function saleGain(s: Sale): { text: string; tone: "good" | "bad" | "warn" } {
  if (s.cost !== undefined) {
    const g = s.amount - s.cost;
    return { text: s.amount === 0 ? `pièces ${money(s.cost)}` : `achat ${money(s.cost)} · bénéfice ${money(g)}`, tone: g < 0 ? "bad" : "good" };
  }
  if (isServicePayment(s)) return { text: `main-d'œuvre ${money(s.amount)}`, tone: "good" };
  return { text: "prix d'achat pas noté", tone: "warn" };
}

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
  const [cost, setCost] = useState(s.cost !== undefined ? String(s.cost) : "");
  const [label, setLabel] = useState(s.label);
  const [pay, setPay] = useState<Payment>(s.payment ?? "especes");
  const [keep, setKeep] = useState(true);
  const tools = isToolService(s.label) ? shop.licences ?? [] : [];
  const [tool, setTool] = useState<string>(s.licenceId ?? "");
  const toolName = s.licenceId ? (shop.licences ?? []).find((l) => l.id === s.licenceId)?.name : undefined;
  const client = s.clientId ? shop.clients.find((c) => c.id === s.clientId)?.name : undefined;
  const gain = saleGain(s);
  const [qty, setQty] = useState(s.qty !== undefined ? String(s.qty) : "");
  const [sure, setSure] = useState(false);
  const [ticket, setTicket] = useState<ReceiptDoc | null>(null);
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
        <small>{when}{client ? ` · ${client}` : ""}{s.ticket ? ` · ticket ${s.ticket}` : ""}{s.payment && s.payment !== "especes" ? ` · ${s.payment === "credit" ? "crédit" : s.payment === "om" ? "Orange Money" : "Wave"}` : ""}</small>
        {canEdit && <small className="sale-gain" data-tone={gain.tone}>{gain.text}{toolName ? ` · licence ${toolName}` : tools.length ? " · outil pas noté" : ""}</small>}
      </span>
      <b className="num">{money(s.amount)}</b>
      {ticket && <Receipt title={ticket.title} text={ticket.text} build={ticket.build} onClose={() => setTicket(null)} />}
      {!canEdit && (
        <Button variant="ghost" className="h-9 rounded-full px-3" onClick={() => setTicket(receiptFor(shop, s))}><Icon name="imprimer" size="sm" /> Ticket</Button>
      )}
      {canEdit && !open && (
        <div className="row-actions">
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
              <Button variant="ghost" className="h-10 rounded-full px-3" onClick={() => setTicket(receiptFor(shop, s))}>
                <Icon name="imprimer" size="sm" /> Ticket
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
            Nom
            <Input className="h-11" value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <label className="note">
            {s.amount === 0 ? "Payé à ce moment (F)" : "Le client a payé (F)"}
            <Input className="h-11 num" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} disabled={s.amount === 0} />
          </label>
          <label className="note">
            Prix d'achat en gros (F){s.qty && s.qty !== 1 ? ` pour les ${String(s.qty).replace(".", ",")}` : ""} — vide si pas de pièce ni d'achat
            <Input className="h-11 num" inputMode="numeric" placeholder={isServicePayment(s) ? "0 (main-d'œuvre)" : "pas noté"} value={cost} onChange={(e) => setCost(e.target.value)} />
          </label>
          {s.productId && !s.retail && cost.trim() !== "" && (
            <label className="check-row"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Garder ce prix d'achat pour les prochaines ventes</label>
          )}
          {s.payment !== "credit" && s.amount > 0 && (
            <div className="seg" role="group" aria-label="Moyen de paiement">
              {PAYS.map(([k, l]) => (
                <button key={k} type="button" aria-pressed={pay === k} className={pay === k ? "on" : ""} onClick={() => setPay(k)}>{l}</button>
              ))}
            </div>
          )}
          {tools.length > 0 && (
            <div className="seg" role="group" aria-label="Avec quel outil ?">
              {tools.map((l) => (
                <button key={l.id} type="button" aria-pressed={tool === l.id} className={tool === l.id ? "on" : ""} onClick={() => setTool(l.id)}>{l.name}</button>
              ))}
              <button type="button" aria-pressed={tool === ""} className={tool === "" ? "on" : ""} onClick={() => setTool("")}>Sans outil</button>
            </div>
          )}
          {(() => {
            const a = s.amount === 0 ? 0 : num(price);
            const c = cost.trim() === "" ? null : num(cost);
            if (!Number.isFinite(a) || (c !== null && !Number.isFinite(c))) return null;
            const g = c === null ? (isServicePayment(s) ? a : null) : a - c;
            return g === null ? <small className="note">Bénéfice : pas connu tant que le prix d'achat n'est pas noté.</small>
              : <small className="sale-gain" data-tone={g < 0 ? "bad" : "good"}>{s.amount === 0 ? `Pièces : ${money(c ?? 0)} (comptées sur cette réparation)` : `Bénéfice : ${money(a)} − ${money(c ?? 0)} = ${money(g)}`}</small>;
          })()}
          <div className="debt-actions" style={{ flexWrap: "wrap", gap: 8 }}>
            <Button
              className="h-11 rounded-full px-5"
              disabled={!(num(price) > 0 || s.amount === 0) || (cost.trim() !== "" && !Number.isFinite(num(cost)))}
              onClick={() => {
                commit(editSale(shop, s.id, {
                  amount: s.amount === 0 ? 0 : num(price),
                  qty: qty ? num(qty) : undefined,
                  label: label.trim() || s.label,
                  cost: cost.trim() === "" ? null : Math.round(num(cost)),
                  payment: pay,
                  keepProductCost: keep,
                  ...(tools.length ? { licenceId: tool || null } : {}),
                }));
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
