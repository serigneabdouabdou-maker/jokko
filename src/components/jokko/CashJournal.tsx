import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Shop, money } from "@/model";
import { SalesList } from "./SalesList";
import { ExpenseRow } from "./ExpensesList";

type Range = "jour" | "7j" | "mois" | "tout";
const RANGES: Array<[Range, string]> = [["jour", "Aujourd'hui"], ["7j", "7 jours"], ["mois", "Ce mois"], ["tout", "Depuis le début"]];
const PAY: Record<string, string> = { especes: "espèces", wave: "Wave", om: "Orange Money", credit: "crédit" };

const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const squash = (t: string) => t.toLocaleLowerCase("fr").normalize("NFD").replace(/[̀-ͯ]/g, "");

function since(range: Range): number {
  const now = new Date();
  if (range === "tout") return 0;
  if (range === "jour") return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (range === "mois") return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).getTime();
}

/**
 * Historique de la caisse (17/11/2026, demande de Fallou : « tout ce qui vient dans la caisse et tout ce que je gagne
 * doit avoir des historiques, avec son nom… et si ce n'est pas normal, je le modifie direct »).
 * Jour par jour depuis le début : chaque vente (nom, client, moyen, payé, prix d'achat, bénéfice), chaque dette
 * remboursée, chaque sortie d'argent ; un toucher sur « Modifier » corrige le payé, le prix en gros, le moyen, le nom.
 */
export function CashJournal({ shop, commit, canEdit }: { shop: Shop; commit: (s: Shop) => void; canEdit: boolean }) {
  const [range, setRange] = useState<Range>("tout");
  const [query, setQuery] = useState("");
  const [days, setDays] = useState(10);

  const data = useMemo(() => {
    const from = since(range);
    const q = squash(query.trim());
    const clientName = (id?: string) => (id ? shop.clients.find((c) => c.id === id)?.name ?? "" : "");
    const keep = (at: string, text: string) => new Date(at).getTime() >= from && (!q || squash(text).includes(q));
    const sales = shop.sales.filter((s) => keep(s.at, `${s.label} ${clientName(s.clientId)}`));
    const repaid = (shop.repayments ?? []).filter((r) => keep(r.at, `${r.clientName} dette`));
    const expenses = shop.expenses.filter((e) => keep(e.at, e.label));
    const byDay = new Map<string, { sales: typeof sales; repaid: typeof repaid; expenses: typeof expenses }>();
    const slot = (k: string) => byDay.get(k) ?? (byDay.set(k, { sales: [], repaid: [], expenses: [] }), byDay.get(k)!);
    for (const s of sales) slot(dayKey(s.at)).sales.push(s);
    for (const r of repaid) slot(dayKey(r.at)).repaid.push(r);
    for (const e of expenses) slot(dayKey(e.at)).expenses.push(e);
    const list = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([k, v]) => ({
      key: k,
      sales: [...v.sales].sort((a, b) => b.at.localeCompare(a.at)),
      repaid: v.repaid,
      expenses: [...v.expenses].sort((a, b) => b.at.localeCompare(a.at)),
    }));
    const inTotal = sales.reduce((a, s) => a + s.amount, 0);
    const byPay: Record<string, number> = {};
    for (const s of sales) byPay[s.payment ?? "especes"] = (byPay[s.payment ?? "especes"] ?? 0) + s.amount;
    const gain = sales.reduce((a, s) => a + s.amount - (s.cost ?? 0), 0);
    const noCost = sales.filter((s) => s.cost === undefined && s.productId).length;
    const out = expenses.filter((e) => e.kind !== "perte").reduce((a, e) => a + e.amount, 0);
    const repaidTotal = repaid.reduce((a, r) => a + r.amount, 0);
    return { list, inTotal, byPay, gain, noCost, out, repaidTotal, count: sales.length };
  }, [shop, range, query]);

  return (
    <section className="sheet cash-journal">
      <div className="sheet-head">
        <h2>Historique de la caisse</h2>
        <span className="count num">{data.count}</span>
      </div>
      <p className="note">Tout ce qui est entré et sorti, jour par jour, avec son nom. {canEdit ? "Une ligne n'est pas bonne ? Touche « Modifier » : tu changes ce que le client a payé, le prix d'achat en gros, le moyen de paiement ou le nom, et le bénéfice se recalcule." : ""}</p>
      <div className="seg" role="group" aria-label="Période">
        {RANGES.map(([k, l]) => (
          <button key={k} type="button" className={range === k ? "on" : ""} aria-pressed={range === k} onClick={() => { setRange(k); setDays(10); }}>{l}</button>
        ))}
      </div>
      <Input className="h-11 journal-search" placeholder="Cherche un nom, un client, un article…" aria-label="Chercher dans l'historique" value={query} onChange={(e) => setQuery(e.target.value)} />
      <dl className="journal-sum">
        <div><dt>Entré (ventes)</dt><dd className="num">{money(data.inTotal)}</dd></div>
        {Object.entries(data.byPay).filter(([k]) => k !== "especes").map(([k, v]) => <div key={k}><dt>dont {PAY[k] ?? k}</dt><dd className="num">{money(v)}</dd></div>)}
        {data.repaidTotal > 0 && <div><dt>Dettes remboursées</dt><dd className="num">{money(data.repaidTotal)}</dd></div>}
        {data.out > 0 && <div><dt>Sorti (dépenses, achats)</dt><dd className="num">− {money(data.out)}</dd></div>}
        <div className="journal-gain"><dt>Bénéfice des ventes</dt><dd className="num">{money(data.gain)}</dd></div>
      </dl>
      {data.noCost > 0 && <p className="note journal-warn">{data.noCost} vente{data.noCost > 1 ? "s" : ""} d'article sans prix d'achat : le bénéfice est trop haut. Cherche « prix d'achat pas noté » et touche « Modifier ».</p>}
      {data.list.length === 0 && <p className="note">Rien sur cette période.</p>}
      {data.list.slice(0, days).map((d) => {
        const dayIn = d.sales.reduce((a, s) => a + s.amount, 0);
        const dayGain = d.sales.reduce((a, s) => a + s.amount - (s.cost ?? 0), 0);
        const dayOut = d.expenses.filter((e) => e.kind !== "perte").reduce((a, e) => a + e.amount, 0);
        const date = new Date(`${d.key}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: new Date().getFullYear() === Number(d.key.slice(0, 4)) ? undefined : "numeric" });
        return (
          <div key={d.key} className="journal-day">
            <div className="journal-day-head">
              <b>{date}</b>
              <small>entré {money(dayIn)}{dayOut ? ` · sorti ${money(dayOut)}` : ""} · bénéfice {money(dayGain)}</small>
            </div>
            {d.sales.length > 0 && <SalesList shop={shop} commit={commit} canEdit={canEdit} sales={d.sales} />}
            {d.repaid.length > 0 && (
              <div className="list">
                {d.repaid.map((r) => (
                  <article key={r.id}>
                    <span>Dette remboursée · {r.clientName}<small>{new Date(r.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · {PAY[r.payment] ?? r.payment}</small></span>
                    <b className="num">+ {money(r.amount)}</b>
                  </article>
                ))}
              </div>
            )}
            {d.expenses.length > 0 && (
              <div className="list journal-out">
                {d.expenses.map((e) => <ExpenseRow key={e.id} e={e} shop={shop} commit={commit} canEdit={canEdit} />)}
              </div>
            )}
          </div>
        );
      })}
      {data.list.length > days && (
        <Button variant="outline" className="h-11 rounded-full" onClick={() => setDays(days + 14)}>Voir les jours d'avant ({data.list.length - days})</Button>
      )}
      {data.list.length > 0 && <small className="note">Seules les espèces entrent dans le tiroir : Wave et Orange Money arrivent sur ton téléphone.</small>}
    </section>
  );
}
