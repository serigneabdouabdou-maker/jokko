import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Shop, money, uid } from "@/model";
import { buildReport, expenseBreakdown, inventoryDue, monthlyReport, type PeriodKind, periodOf, recordInventory, reportText, stockValue } from "@/data/report";

const PERIODS: Array<[PeriodKind, string]> = [
  ["jour", "Aujourd'hui"],
  ["mois", "Ce mois"],
  ["mois_dernier", "Mois dernier"],
  ["annee", "Cette année"],
  ["annee_derniere", "L'an dernier"],
];

const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toLocaleString("fr-FR", { maximumFractionDigits: 2 }));

/**
 * Bénéfices (ancien « Bilan ») : ventes − prix d'achat de ce qui est vendu = bénéfice sur les ventes ;
 * − dépenses − pertes = ce que tu as gagné. Par jour, mois, année, et mois par mois (demande de Fallou, 13/11/2026).
 * Et l'inventaire du mois : compter le stock, les manques deviennent des pertes.
 */
export function Bilan({ shop, commit }: { shop: Shop; commit: (s: Shop) => void }) {
  const [kind, setKind] = useState<PeriodKind>("jour");
  const [counting, setCounting] = useState(false);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [result, setResult] = useState("");
  const report = useMemo(() => buildReport(shop, periodOf(kind)), [shop, kind]);
  // Mois par mois : l'année de la période choisie.
  const year = report.period.from.getFullYear();
  const months = useMemo(() => monthlyReport(shop, year), [shop, year]);
  const spending = useMemo(() => expenseBreakdown(shop, report.period), [shop, report.period]);
  const bestMonth = months.rows.filter((r) => r.salesCount > 0).sort((a, b) => b.netProfit - a.netProfit)[0];

  async function share() {
    const text = reportText(shop.name, report, money);
    try {
      if (navigator.share) {
        await navigator.share({ title: `Bénéfices ${report.period.label}`, text });
        return;
      }
    } catch {
      return; // partage annulé
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }
  const value = useMemo(() => stockValue(shop), [shop]);
  const due = inventoryDue(shop);

  function startCount() {
    setCounts(Object.fromEntries(shop.products.map((p) => [p.id, String(p.stock)])));
    setCounting(true);
    setResult("");
  }

  function saveCount() {
    const parsed: Record<string, number> = {};
    for (const [id, raw] of Object.entries(counts)) {
      const n = Number(raw.replace(",", "."));
      if (raw.trim() !== "" && Number.isFinite(n) && n >= 0) parsed[id] = n;
    }
    const done = recordInventory(shop, parsed, () => uid("e"));
    commit(done.shop);
    setCounting(false);
    const missing = done.lines.filter((l) => l.counted < l.expected);
    const noCost = missing.filter((l) => l.loss === 0).length;
    setResult(
      missing.length
        ? `Inventaire enregistré. ${missing.length} article(s) manquant(s), perte ${money(done.losses)}.${noCost ? ` ${noCost} article(s) sans prix d'achat : leur perte n'est pas chiffrée.` : ""}`
        : "Inventaire enregistré. Rien ne manque.",
    );
  }

  return (
    <section className="sheet bilan">
      <div className="sheet-head">
        <h2>Bénéfices</h2>
        <div className="seg" role="tablist" aria-label="Période">
          {PERIODS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={kind === id} className={kind === id ? "on" : ""} onClick={() => setKind(id)}>{label}</button>
          ))}
        </div>
      </div>
      <p className="note">{report.period.label} · {report.salesCount} vente(s)</p>

      <div className="kpis">
        <article><span>Ventes</span><b className="num">{money(report.revenue)}</b></article>
        <article><span>Bénéfice sur les ventes</span><b className="num">{money(report.grossProfit)}</b></article>
        <article><span>Dépenses</span><b className="num">− {money(report.expenses)}</b></article>
        <article><span>Pertes</span><b className="num">− {money(report.losses)}</b></article>
        {report.licences > 0 && <article><span>Licences (part)</span><b className="num">− {money(report.licences)}</b></article>}
        <article className="kpi-main" data-tone={report.netProfit < 0 ? "bad" : "good"}><span>{report.netProfit < 0 ? "Ce que tu as perdu" : "Ce que tu as gagné"}</span><b className="num">{money(Math.abs(report.netProfit))}</b></article>
      </div>
      <p className="note bilan-calc">
        Ventes {money(report.revenue)} − prix d'achat de ce qui est vendu {money(report.cost)}
        {report.unknownRevenue > 0 ? ` (sans les ${money(report.unknownRevenue)} de ventes sans prix d'achat)` : ""} = bénéfice sur les ventes {money(report.grossProfit)} ; − dépenses {money(report.expenses)} − pertes {money(report.losses)}{report.licences ? ` − licences ${money(report.licences)}` : ""} = <b>{money(report.netProfit)}</b>.
      </p>
      <div className="row">
        <Button variant="outline" className="h-10 rounded-full px-4" onClick={() => void share()}>Envoyer ce bilan sur WhatsApp</Button>
      </div>
      {report.unknownRevenue > 0 && (
        <p className="note">
          {money(report.unknownRevenue)} de ventes sans prix d'achat connu (vente au comptoir ou article sans prix d'achat) : leur bénéfice n'est pas compté. Mets le prix d'achat dans Stock.
        </p>
      )}
      {report.purchases > 0 && (
        <p className="note">
          Marchandise achetée : {money(report.purchases)}. Cet argent est sorti de la caisse, mais ce n'est pas une perte : il est dans ton stock, et son coût compte quand tu vends.
        </p>
      )}

      <h3>Où part ton argent</h3>
      {spending.length === 0 ? (
        <p className="note">Aucune dépense sur cette période. Dis à Jokko : « dépense 5 000 pour le transport ».</p>
      ) : (
        <ul className="bilan-spend">
          {spending.map((g) => (
            <li key={g.label}>
              <span>{g.label} <small>({g.count})</small></span>
              <span className="bar" aria-hidden="true"><i style={{ width: `${Math.max(4, (g.amount / spending[0].amount) * 100)}%` }} /></span>
              <b className="num">{money(g.amount)}</b>
            </li>
          ))}
        </ul>
      )}

      <h3>Mois par mois · {year}</h3>
      {months.rows.length === 0 ? (
        <p className="note">Pas encore de mois dans cette année.</p>
      ) : (
        <>
          <div className="import-preview">
            <table className="bilan-months">
              <thead><tr><th>Mois</th><th>Ventes</th><th>Bénéfice ventes</th><th>Dépenses, pertes{months.total.licences ? ", licences" : ""}</th><th>Gagné</th></tr></thead>
              <tbody>
                {months.rows.map((r) => (
                  <tr key={r.month}>
                    <td>{r.label}</td>
                    <td className="num">{money(r.revenue)}</td>
                    <td className="num">{money(r.grossProfit)}</td>
                    <td className="num">{r.expenses + r.losses + r.licences ? `− ${money(r.expenses + r.losses + r.licences)}` : money(0)}</td>
                    <td className="num" data-tone={r.netProfit < 0 ? "bad" : r.netProfit > 0 ? "good" : undefined}>{money(r.netProfit)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th>Total {year}</th>
                  <th className="num">{money(months.total.revenue)}</th>
                  <th className="num">{money(months.total.grossProfit)}</th>
                  <th className="num">− {money(months.total.expenses + months.total.losses + months.total.licences)}</th>
                  <th className="num" data-tone={months.total.netProfit < 0 ? "bad" : "good"}>{money(months.total.netProfit)}</th>
                </tr>
              </tfoot>
            </table>
          </div>
          {bestMonth && months.rows.length > 1 && <p className="note">Ton meilleur mois : {bestMonth.label} ({money(bestMonth.netProfit)} gagnés).</p>}
        </>
      )}

      <h3>Ce qui s'est vendu</h3>
      {report.byProduct.length === 0 ? (
        <p className="note">Aucune vente d'article sur cette période.</p>
      ) : (
        <div className="import-preview">
          <table>
            <thead><tr><th>Article</th><th>Vendu</th><th>Ventes</th><th>Bénéfice</th></tr></thead>
            <tbody>
              {report.byProduct.map((l) => (
                <tr key={l.productId}>
                  <td>{l.name}</td>
                  <td className="num">
                    {[l.bulkQty ? `${qty(l.bulkQty)} ${l.bulkUnit}` : "", l.retailQty ? `${qty(l.retailQty)} ${l.retailUnit ?? ""}` : ""].filter(Boolean).join(" + ")}
                  </td>
                  <td className="num">{money(l.revenue)}</td>
                  <td className="num">{l.profit === null ? "—" : money(l.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3>Stock et inventaire</h3>
      <p className="note">
        Valeur du stock : {money(value.atCost)} au prix d'achat, {money(value.atPrice)} au prix de vente.
        {value.missingCost > 0 && ` ${value.missingCost} article(s) sans prix d'achat.`}
      </p>
      {due && !counting && <p className="banner" role="status">C'est le moment de faire l'inventaire du mois : compte ce qu'il reste vraiment dans la boutique.</p>}
      {result && <p className="note" role="status">{result}</p>}
      {!counting ? (
        <Button className="h-11 rounded-full px-5 font-semibold" disabled={!shop.products.length} onClick={startCount}>Faire l'inventaire</Button>
      ) : (
        <div className="inventory">
          <p className="note">Écris ce que tu comptes vraiment. Ce qui manque sera compté comme perte, au prix d'achat.</p>
          {shop.products.map((p) => (
            <label key={p.id} className="inventory-row">
              <span>{p.name} <small>(prévu : {qty(p.stock)} {p.unit})</small></span>
              <Input className="num h-10" inputMode="decimal" value={counts[p.id] ?? ""} onChange={(e) => setCounts({ ...counts, [p.id]: e.target.value })} />
            </label>
          ))}
          <div className="import-actions">
            <Button className="h-11 rounded-full px-5 font-semibold" onClick={saveCount}>Enregistrer l'inventaire</Button>
            <Button variant="ghost" className="h-11 rounded-full px-4" onClick={() => setCounting(false)}>Annuler</Button>
          </div>
        </div>
      )}
    </section>
  );
}

/** En haut des Dépenses : ce mois, ce que les ventes ont rapporté moins les dépenses, et le lien vers Bénéfices. */
export function ProfitStrip({ shop, onOpen }: { shop: Shop; onOpen: () => void }) {
  const r = useMemo(() => buildReport(shop, periodOf("mois")), [shop]);
  if (!r.salesCount && !r.expenses && !r.losses) return null;
  return (
    <button type="button" className="banner banner-link profit-strip" onClick={onOpen}>
      <span>
        <b>{r.period.label}</b> · bénéfice sur les ventes {money(r.grossProfit)} − dépenses et pertes {money(r.expenses + r.losses + r.licences)} ={" "}
        <b data-tone={r.netProfit < 0 ? "bad" : "good"}>{r.netProfit < 0 ? `perdu ${money(-r.netProfit)}` : `gagné ${money(r.netProfit)}`}</b>
      </span>
      <span className="profit-go">Mes bénéfices ›</span>
    </button>
  );
}
