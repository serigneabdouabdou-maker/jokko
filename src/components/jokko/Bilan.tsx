import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Shop, money, uid } from "@/model";
import { buildReport, inventoryDue, type PeriodKind, periodOf, recordInventory, stockValue } from "@/data/report";

const PERIODS: Array<[PeriodKind, string]> = [
  ["jour", "Aujourd'hui"],
  ["mois", "Ce mois"],
  ["mois_dernier", "Mois dernier"],
];

const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toLocaleString("fr-FR", { maximumFractionDigits: 2 }));

/**
 * Bilan : ce qui s'est vendu, ce qu'on a gagné, ce qu'on a dépensé ou perdu.
 * Et l'inventaire du mois : compter le stock, les manques deviennent des pertes.
 */
export function Bilan({ shop, commit }: { shop: Shop; commit: (s: Shop) => void }) {
  const [kind, setKind] = useState<PeriodKind>("jour");
  const [counting, setCounting] = useState(false);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [result, setResult] = useState("");
  const report = useMemo(() => buildReport(shop, periodOf(kind)), [shop, kind]);
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
        <h2>Bilan</h2>
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
        <article className="kpi-main" data-tone={report.netProfit < 0 ? "bad" : "good"}><span>Ce que tu as gagné</span><b className="num">{money(report.netProfit)}</b></article>
      </div>
      {report.unknownRevenue > 0 && (
        <p className="note">
          {money(report.unknownRevenue)} de ventes sans prix d'achat connu (vente au comptoir ou article sans prix d'achat) : leur bénéfice n'est pas compté. Mets le prix d'achat dans Stock.
        </p>
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
