import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Drill, DrillList, DrillOverview, usePhone } from "@/components/jokko/Drill";
import { Input } from "@/components/ui/input";
import { type Shop, money, uid } from "@/model";
import { buildReport, dailyReport, expenseBreakdown, inventoryDue, monthlyReport, type PeriodKind, periodOf, type ProfitDetail, profitDetails, recordInventory, reportText, stockValue } from "@/data/report";

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
  // Ce mois d'abord : le bénéfice de chaque jour se lit dans « Jour par jour ».
  const [kind, setKind] = useState<PeriodKind>("mois");
  const [counting, setCounting] = useState(false);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [result, setResult] = useState("");
  const report = useMemo(() => buildReport(shop, periodOf(kind)), [shop, kind]);
  // Mois par mois : l'année de la période choisie.
  const year = report.period.from.getFullYear();
  const months = useMemo(() => monthlyReport(shop, year), [shop, year]);
  const spending = useMemo(() => expenseBreakdown(shop, report.period), [shop, report.period]);
  const days = useMemo(() => (kind === "mois" || kind === "mois_dernier" ? dailyReport(shop, report.period) : []), [shop, kind, report.period]);
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
  const details = useMemo(() => profitDetails(shop, report.period), [shop, report.period]);
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

  const phone = usePhone();
  return (
    <section className="sheet bilan">
      <DrillOverview>
      <div className="sheet-head">
        <h2>Bénéfices</h2>
        <div className="seg" role="tablist" aria-label="Période">
          {PERIODS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={kind === id} className={kind === id ? "on" : ""} onClick={() => setKind(id)}>{label}</button>
          ))}
        </div>
      </div>
      <p className="note">{report.period.label} · {report.salesCount} vente(s)</p>

      {phone ? (
        <div className="kpi-hero" data-tone={report.netProfit < 0 ? "bad" : "good"}>
          <span>{report.netProfit < 0 ? "Ce que tu as perdu" : "Ce que tu as gagné"}</span>
          <b className="num">{money(Math.abs(report.netProfit))}</b>
          <dl className="kpi-mini">
            <div><dt>Ventes</dt><dd className="num">{money(report.revenue)}</dd></div>
            <div><dt>Bénéfice ventes</dt><dd className="num">{money(report.grossProfit)}</dd></div>
            <div><dt>{chargesLabel(report)}</dt><dd className="num">− {money(report.expenses + report.losses + report.licences)}</dd></div>
          </dl>
        </div>
      ) : (
      <div className="kpis">
          <article><span>Ventes</span><b className="num">{money(report.revenue)}</b></article>
          <article><span>Bénéfice sur les ventes</span><b className="num">{money(report.grossProfit)}</b></article>
          <article><span>Dépenses</span><b className="num">− {money(report.expenses)}</b></article>
          <article><span>Pertes</span><b className="num">− {money(report.losses)}</b></article>
          {report.licences > 0 && <article><span>Part des licences</span><b className="num">− {money(report.licences)}</b></article>}
          <article className="kpi-main" data-tone={report.netProfit < 0 ? "bad" : "good"}><span>{report.netProfit < 0 ? "Ce que tu as perdu" : "Ce que tu as gagné"}</span><b className="num">{money(Math.abs(report.netProfit))}</b></article>
        </div>
      )}
      </DrillOverview>
      <DrillList title="En détail">
      <Drill id="articles" title="Le détail, ligne par ligne" icon="vente" summary={details.length ? `${details.length} ligne${details.length > 1 ? "s" : ""} · touche pour voir acheté, vendu, bénéfice` : "Aucune vente sur cette période"}>
      <h3>Le détail, ligne par ligne</h3>
      <ProfitDetailsList rows={details} />
      </Drill>
      <Drill id="calcul" title="Le calcul, ligne par ligne" icon="rapport" summary={`Ventes ${money(report.revenue)} − achats − dépenses = ${money(report.netProfit)}`}>
      <p className="note bilan-calc">
        Ventes {money(report.revenue)} − prix d'achat de ce qui est vendu {money(report.cost)}
        {report.unknownRevenue > 0 ? ` (sans les ${money(report.unknownRevenue)} de ventes sans prix d'achat)` : ""} = bénéfice sur les ventes {money(report.grossProfit)} ; − dépenses {money(report.expenses)} − pertes {money(report.losses)}{report.licences ? ` − licences ${money(report.licences)}` : ""} = <b>{money(report.netProfit)}</b>.
      </p>
      {report.licences > 0 && (
        <p className="note">
          Part des licences : le prix de tes outils (Chimera, Unlock tool…) est compté petit à petit, mois par mois, sur leur durée.
          Ce n'est pas une perte ni une dépense du jour : c'est ce qu'ils te coûtent pendant cette période.
        </p>
      )}
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

      </Drill>
      {days.length > 0 && (
        <Drill id="jours" title="Jour par jour" icon="journal" summary={`${days.length} jour${days.length > 1 ? "s" : ""} · meilleur : ${money(Math.max(...days.map((d) => d.netProfit)))}`}>
          <h3>Jour par jour · {report.period.label}</h3>
          <div className="import-preview">
            <table className="bilan-months">
              <thead><tr><th>Jour</th><th>Ventes</th><th>Bénéfice ventes</th><th>Dépenses</th><th>Gagné</th></tr></thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.day}>
                    <td>{d.label} <small>({d.salesCount})</small></td>
                    <td className="num">{money(d.revenue)}</td>
                    <td className="num">{money(d.grossProfit)}</td>
                    <td className="num">{d.spent ? `− ${money(d.spent)}` : money(0)}</td>
                    <td className="num" data-tone={d.netProfit < 0 ? "bad" : d.netProfit > 0 ? "good" : undefined}>{money(d.netProfit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Drill>
      )}

      <Drill id="depenses" title="Où part ton argent" icon="depense" summary={spending.length ? `${spending[0].label} en premier : ${money(spending[0].amount)}` : "Aucune dépense sur cette période"}>
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
      </Drill>

      <Drill id="mois" title={`Mois par mois · ${year}`} icon="rapport" summary={bestMonth ? `Meilleur mois : ${bestMonth.label} (${money(bestMonth.netProfit)})` : "Pas encore de mois"}>
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
      </Drill>


      <Drill id="inventaire" title="Stock et inventaire" icon="stock" summary={`Stock : ${money(value.atCost)} au prix d'achat`} badge={due ? 1 : 0}>
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
      </Drill>
      </DrillList>
    </section>
  );
}

/** « Dépenses », « Dépenses, part des licences »… : seulement ce qui existe sur la période (une part de licence n'est pas une perte). */
function chargesLabel(r: { expenses: number; losses: number; licences: number }): string {
  const parts = [r.expenses ? "dépenses" : "", r.losses ? "pertes" : "", r.licences ? "part des licences" : ""].filter(Boolean);
  const text = parts.length ? parts.join(", ") : "dépenses";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** En haut des Dépenses : ce mois, ce que les ventes ont rapporté moins les dépenses, et le lien vers Bénéfices. */
export function ProfitStrip({ shop, onOpen }: { shop: Shop; onOpen: () => void }) {
  const r = useMemo(() => buildReport(shop, periodOf("mois")), [shop]);
  if (!r.salesCount && !r.expenses && !r.losses) return null;
  return (
    <button type="button" className="banner banner-link profit-strip" onClick={onOpen}>
      <span>
        <b>{r.period.label}</b> · bénéfice sur les ventes {money(r.grossProfit)} − dépenses {money(r.expenses)}{r.losses ? ` − pertes ${money(r.losses)}` : ""}{r.licences ? ` − part des licences ${money(r.licences)}` : ""} ={" "}
        <b data-tone={r.netProfit < 0 ? "bad" : "good"}>{r.netProfit < 0 ? `perdu ${money(-r.netProfit)}` : `gagné ${money(r.netProfit)}`}</b>
      </span>
      <span className="profit-go">Mes bénéfices ›</span>
    </button>
  );
}

const PAY: Record<string, string> = { especes: "espèces", wave: "Wave", om: "Orange Money", credit: "crédit" };
const q = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

/** Chaque ligne du bénéfice : un toucher ouvre le calcul (acheté en gros, vendu, pièces, main-d'œuvre). */
function ProfitDetailsList({ rows }: { rows: ProfitDetail[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!rows.length) return <p className="note">Aucune vente sur cette période.</p>;
  return (
    <ul className="profit-rows">
      {rows.map((r) => {
        const gain = r.kind === "travail" ? r.labor : r.profit;
        const sub =
          r.kind === "article" ? `${q(r.qty)} ${r.unit} · vendu en moyenne ${money(r.avgPrice)}`
          : r.kind === "travail" ? `encaissé ${money(r.revenue)} − pièces ${money(r.partsCost)}${r.parts.length ? "" : " (aucune pièce notée)"}`
          : r.kind === "service" ? `${r.count} fois · ${money(r.revenue)}`
          : `${r.count} vente${r.count > 1 ? "s" : ""} · ${money(r.revenue)}`;
        const isOpen = open === r.key;
        return (
          <li key={r.key} className={isOpen ? "is-open" : ""}>
            <button type="button" className="profit-row" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : r.key)}>
              <span className="profit-name">
                <b>{r.kind === "travail" ? `${r.ref} · ${r.title}` : r.name}</b>
                <small>{sub}</small>
              </span>
              <span className="profit-gain num" data-tone={gain === null ? undefined : gain < 0 ? "bad" : "good"}>
                {gain === null ? "?" : `${gain < 0 ? "− " : "+ "}${money(Math.abs(gain))}`}
              </span>
            </button>
            {isOpen && (
              <dl className="profit-calc">
                {r.kind === "article" && (
                  <>
                    <div><dt>Acheté en gros</dt><dd className="num">{r.unitCost === null ? "pas connu" : `${money(r.unitCost)} / ${r.unit || "unité"}`}</dd></div>
                    <div><dt>Vendu (en moyenne)</dt><dd className="num">{money(r.avgPrice)} / {r.unit || "unité"}</dd></div>
                    {r.unitCost !== null && <div><dt>Bénéfice par {r.unit || "unité"}</dt><dd className="num">{money(r.avgPrice - r.unitCost)}</dd></div>}
                    <div><dt>Quantité vendue</dt><dd className="num">× {q(r.qty)}</dd></div>
                    <div className="profit-total"><dt>Ventes {money(r.revenue)} − achat {r.cost === null ? "?" : money(r.cost)}</dt><dd className="num">{r.profit === null ? "?" : money(r.profit)}</dd></div>
                    {r.cost === null && <p className="note">Prix d'achat pas connu pour certaines ventes : mets-le dans Stock pour avoir le vrai bénéfice.</p>}
                  </>
                )}
                {r.kind === "travail" && (
                  <>
                    {r.payments.map((p, i) => <div key={i}><dt>Payé ({p.what}, {PAY[p.payment] ?? p.payment})</dt><dd className="num">{money(p.amount)}</dd></div>)}
                    {r.parts.length ? r.parts.map((p, i) => <div key={i}><dt>{p.label} (prix d'achat)</dt><dd className="num">− {money(p.cost)}</dd></div>) : <div><dt>Pièce</dt><dd>aucune</dd></div>}
                    <div className="profit-total"><dt>Service rendu (ta main-d'œuvre)</dt><dd className="num">{money(r.labor)}</dd></div>
                    {r.partsLater && <p className="note">L'appareil n'est pas encore rendu : le prix des pièces sera compté au rendu.</p>}
                  </>
                )}
                {r.kind === "service" && (
                  <>
                    <div><dt>Encaissé ({r.count} fois)</dt><dd className="num">{money(r.revenue)}</dd></div>
                    <div><dt>Matière utilisée</dt><dd className="num">{r.cost ? `− ${money(r.cost)}` : "aucune"}</dd></div>
                    <div className="profit-total"><dt>Service rendu (ta main-d'œuvre)</dt><dd className="num">{money(r.profit)}</dd></div>
                  </>
                )}
                {r.kind === "comptoir" && (
                  <>
                    <div><dt>Encaissé</dt><dd className="num">{money(r.revenue)}</dd></div>
                    <div className="profit-total"><dt>Bénéfice</dt><dd className="num">{r.profit === null ? "pas connu" : money(r.profit)}</dd></div>
                    {r.profit === null && <p className="note">Vente sans article : Jokko ne connaît pas le prix d'achat. Dis l'article (« vendu un écran BF6 10 000 ») pour avoir le bénéfice.</p>}
                  </>
                )}
              </dl>
            )}
          </li>
        );
      })}
    </ul>
  );
}
