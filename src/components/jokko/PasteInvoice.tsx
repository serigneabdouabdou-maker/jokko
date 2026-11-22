import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { type CashSource, type Shop, money, uid } from "@/model";
import { applyPastedInvoice, errorsMessage, type PasteResult, pasteSummary, readPastedInvoice } from "@/data/pasteInvoice";
import { CashSourcePicker } from "./CashSourcePicker";

const frDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const CHANGE: Record<string, string> = { hausse: "▲", baisse: "▼", pareil: "=", nouvelle: "★" };

/**
 * « Coller la facture du fournisseur » (22/11/2026) : le patron copie le message de Bathie (la facture de 15 jours,
 * ou une commande), Jokko vérifie chaque calcul, compare chaque prix aux anciens, et entre au stock seulement les
 * pièces pas encore reçues. Rien n'est enregistré avant « Enregistrer ».
 */
export function PasteInvoiceBox({ shop, commit }: { shop: Shop; commit: (s: Shop) => void }) {
  const sup = (shop.suppliers ?? []).find((s) => s.purchases?.length) ?? shop.suppliers?.[0];
  const [text, setText] = useState("");
  const [res, setRes] = useState<PasteResult | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [off, setOff] = useState<Record<string, boolean>>({});
  const [updateCost, setUpdateCost] = useState(true);
  const [pay, setPay] = useState<CashSource | "" | "plus-tard">("plus-tard");

  function check() {
    setDone(""); setError(""); setOff({});
    const r = readPastedInvoice(text, shop, sup);
    if (!r) { setRes(null); setError("Je ne trouve aucune ligne de pièce (ex. « 4 LCD bf6 4000=16.000 »). Colle le message de ton fournisseur tel quel."); return; }
    setRes(r);
  }

  const keys = useMemo(() => new Set((res?.lines ?? []).filter((l) => l.newQty > 0 && !off[l.key]).map((l) => l.key)), [res, off]);
  const toAdd = (res?.lines ?? []).filter((l) => keys.has(l.key) && l.newQty > 0);
  const errMsg = res ? errorsMessage(res) : "";
  const digits = (sup?.phone ?? "").replace(/\D/g, "");
  const wa = errMsg ? `https://wa.me/${digits.length === 9 ? `221${digits}` : digits}?text=${encodeURIComponent(errMsg)}` : "";

  function save() {
    if (!res) return;
    const out = applyPastedInvoice(shop, sup?.id, res, keys, { updateCost }, uid);
    let next = out.shop;
    if (pay && pay !== "plus-tard") {
      next = { ...next, expenses: [...next.expenses, { id: uid("e"), at: new Date().toISOString(), label: `Facture ${sup?.name ?? "fournisseur"} du ${frDate(res.date)}`, amount: res.total, kind: "achat", paidWith: pay }] };
    }
    commit(next);
    setDone(`Enregistré : ${out.added} pièce${out.added > 1 ? "s" : ""} entrée${out.added > 1 ? "s" : ""} au stock (${money(out.amount)})${pay && pay !== "plus-tard" ? `, facture de ${money(res.total)} payée` : ""}.`);
    setRes(null); setText("");
  }

  return (
    <div className="import-box paste-invoice">
      <div className="import-head">
        <b>Coller la facture de {sup?.name ?? "ton fournisseur"}</b>
        <span className="note">Dans WhatsApp, appuie longtemps sur son message → Copier. Colle-le ici : Jokko vérifie les calculs, les prix, et entre les nouvelles pièces au stock.</span>
      </div>
      <textarea className="paste-area" rows={6} placeholder={"4 LCD bf6 4000=16.000\n6 LCD a12 4300=25.800\nTotal 🟰 41,800fr"} value={text} onChange={(e) => { setText(e.target.value); setRes(null); }} aria-label="Message de la facture" />
      <div className="import-actions">
        <Button className="h-11 rounded-full px-5 font-semibold" disabled={!text.trim()} onClick={check}>Vérifier la facture</Button>
        {text && <Button variant="ghost" className="h-11 rounded-full px-4" onClick={() => { setText(""); setRes(null); }}>Effacer</Button>}
      </div>
      {error && <p className="note" data-tone="error">{error}</p>}
      {done && <p className="note" role="status">{done}</p>}
      {res && (
        <div className="paste-result">
          <div className="ws-verdict" data-tone={res.anomalies.some((a) => a.serious) ? "bad" : res.written && res.sum === res.total ? "good" : "mid"}>
            <b>Facture du {frDate(res.date)} : {money(res.total)}{res.written ? "" : " (total calculé par Jokko)"}</b>
            <p>{res.written ? (res.sum === res.total ? `✓ Les lignes font bien ${money(res.sum)}.` : `Les lignes font ${money(res.sum)} : écart de ${money(Math.abs(res.total - res.sum))}.`) : "Pas de total écrit dans le message."}</p>
            <p>{pasteSummary(res)}</p>
          </div>
          {res.anomalies.length > 0 && (
            <div className="paste-errors">
              <b>{res.anomalies.length} erreur{res.anomalies.length > 1 ? "s" : ""} dans la facture</b>
              <ul>{res.anomalies.map((a, i) => <li key={i} data-tone={a.serious ? "error" : undefined}>{a.serious ? "⚠ " : ""}{a.text}</li>)}</ul>
              {wa && <Button asChild variant="outline" className="h-10 rounded-full px-4"><a href={wa} target="_blank" rel="noreferrer">Envoyer les erreurs à {sup?.name ?? "ton fournisseur"} sur WhatsApp</a></Button>}
            </div>
          )}
          <ul className="paste-lines">
            {res.lines.map((l, i) => {
              const can = l.newQty > 0;
              const on = can && !off[l.key];
              return (
                <li key={`${l.key}-${i}`} data-change={l.change} className={can ? "" : "is-done"}>
                  <label className="paste-line-main">
                    <input type="checkbox" disabled={!can} checked={on} onChange={() => setOff({ ...off, [l.key]: on })} aria-label={`Entrer ${l.label} au stock`} />
                    <span>
                      <b>{l.label}</b>
                      <small className="num">{l.qty} × {money(l.unit)} = {money(l.sub)}</small>
                    </span>
                    <span className={`paste-change is-${l.change}`}>
                      {CHANGE[l.change]} {l.change === "nouvelle" ? "nouvelle pièce" : l.change === "pareil" ? "même prix" : `${l.change === "hausse" ? "+" : "−"}${money(Math.abs(l.unit - (l.before?.unit ?? l.unit)))}`}
                    </span>
                  </label>
                  <small className="note">
                    {l.before && l.change !== "pareil" ? `Avant : ${money(l.before.unit)}${l.before.date ? ` (${frDate(l.before.date)})` : " (prix du stock)"}. ` : ""}
                    {l.doneQty ? `${l.doneQty} déjà entrée${l.doneQty > 1 ? "s" : ""} au stock. ` : ""}
                    {can ? (l.productName ? `→ ${l.newQty} dans « ${l.productName} »` : l.choices ? `→ plusieurs pièces possibles : nouvel article « ${l.label} »` : `→ nouvel article « ${l.label} » (prix de vente à fixer)`) : "Rien à ajouter."}
                  </small>
                </li>
              );
            })}
          </ul>
          <label className="check-row"><input type="checkbox" checked={updateCost} onChange={(e) => setUpdateCost(e.target.checked)} /> Mettre ces prix d'achat dans mon stock</label>
          <div className="paste-pay">
            <div className="seg" role="radiogroup" aria-label="Payée ?">
              <button type="button" className={pay === "plus-tard" ? "on" : ""} aria-checked={pay === "plus-tard"} role="radio" onClick={() => setPay("plus-tard")}>Je paie plus tard</button>
              <button type="button" className={pay !== "plus-tard" ? "on" : ""} aria-checked={pay !== "plus-tard"} role="radio" onClick={() => setPay("")}>Je l'ai payée</button>
            </div>
            {pay !== "plus-tard" && <CashSourcePicker amount={res.total} value={pay} onChange={setPay} title="Tu l'as payée comment ?" />}
          </div>
          <Button className="h-12 rounded-full px-6 font-semibold" disabled={pay === ""} onClick={save}>
            Enregistrer{toAdd.length ? ` : ${toAdd.reduce((a, l) => a + l.newQty, 0)} pièces au stock` : ""}
          </Button>
        </div>
      )}
    </div>
  );
}
