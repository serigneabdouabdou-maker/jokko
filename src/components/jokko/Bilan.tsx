import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Drill, DrillList, DrillOverview, usePhone } from "@/components/jokko/Drill";
import { Input } from "@/components/ui/input";
import { type Shop, money } from "@/model";
import { licenceCharge } from "@/data/services";
import { correctRepairParts, setArticleCost, setTotalCost } from "@/data/corrections";
import { searchProducts } from "@/data/partSearch";
import type { RepairPart } from "@/model";
import { SalesList } from "./SalesList";
import { ActivityPanel, ChinaPanel, SupplierPanel } from "./Workshop";
import { StockCount, WatchPanel } from "./Surveillance";
import { activityReport, supplierProfitEstimate } from "@/data/workshopStats";
import { workshopWatch } from "@/data/watch";
import { metierOf } from "@/data/metiers";
import { buildReport, dailyReport, dayHistory, dayPeriod, expenseBreakdown, inventoryDue, monthlyReport, type PeriodKind, periodOf, type ProfitDetail, type ProfitItem, profitDetails, reportText, stockValue } from "@/data/report";

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
  const isRepair = metierOf(shop.activity).id === "reparation";
  const watch = useMemo(() => (isRepair ? workshopWatch(shop) : []), [shop, isRepair]);
  const watchBad = watch.filter((x) => x.level === "grave" || x.level === "attention").length;
  const watchSummary = watch.length ? `${watchBad} à regarder · ${watch.length - watchBad} nouvelle${watch.length - watchBad > 1 ? "s" : ""} (prix, tendances, services)` : "Prix, tendances, services, stock";
  const supplierEst = useMemo(() => {
    const sup = (shop.suppliers ?? []).find((x) => x.purchases?.length);
    const e = sup ? supplierProfitEstimate(shop) : null;
    return sup && e ? { name: sup.name, e } : null;
  }, [shop]);
  const due = inventoryDue(shop);

  function startCount() {
    setCounting(true);
    setResult("");
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
      {kind === "jour" && (shop.licences ?? []).length > 0 && (
        <p className="note">La part de tes licences n'est pas comptée sur une journée : elle est dans « Ce mois » ({money(licenceCharge(shop, periodOf("mois").from, periodOf("mois").to))} ce mois-ci).</p>
      )}

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
      {isRepair && (
        <Drill id="surveillance" title="Surveillance de l'atelier : tout ce qui bouge" icon="alerte" summary={watchSummary} badge={watchBad}>
        <WatchPanel shop={shop} commit={commit} />
        </Drill>
      )}
      <Drill id="articles" title="Le détail, ligne par ligne" icon="vente" summary={details.length ? `${details.length} ligne${details.length > 1 ? "s" : ""} · touche pour voir acheté, vendu, bénéfice` : "Aucune vente sur cette période"}>
      <h3>Le détail, ligne par ligne</h3>
      <ProfitDetailsList rows={details} shop={shop} commit={commit} />
      </Drill>
      <Drill id="chaque-jour" title="Chaque jour, depuis le début" icon="journal" summary={dayHistorySummary(shop)}>
      <DayHistory shop={shop} commit={commit} />
      </Drill>
      <Drill id="activite" title="Mon activité : pièces, services, réparations" icon="rapport" summary={activitySummary(shop)}>
      <ActivityPanel shop={shop} />
      </Drill>
      {supplierEst && (
        <Drill id="fournisseur" title={`Mon argent chez ${supplierEst.name} : investi, revenu, gagné`} icon="stock" summary={`Investi ${money(supplierEst.e.bought)} · gagné au moins ${money(supplierEst.e.sure)}`}>
        <SupplierPanel shop={shop} />
        </Drill>
      )}
      {metierOf(shop.activity).id === "reparation" && (
        <Drill id="chine" title="Objectif Chine : acheter moi-même" icon="stock" summary="Combien il faut vendre, combien mettre de côté, quand partir">
        <ChinaPanel shop={shop} />
        </Drill>
      )}
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
        <>
          <StockCount shop={shop} commit={commit} parts={isRepair} onDone={(m) => { setResult(m); setCounting(false); }} />
          <Button variant="ghost" className="h-11 rounded-full px-4" onClick={() => setCounting(false)}>Annuler</Button>
        </>
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
/** Noms des clients d'une ligne groupée (« · Tapha diallo, Serigne diene ») : chaque vente se retrouve. */
const who = (items: ProfitItem[]) => {
  const names = [...new Set(items.map((i) => i.client).filter((n): n is string => Boolean(n)))];
  return names.length ? ` · ${names.slice(0, 3).join(", ")}${names.length > 3 ? "…" : ""}` : "";
};

/** Chaque vente d'une ligne groupée : jour, heure, client, moyen, montant. */
function Items({ items }: { items: ProfitItem[] }) {
  if (items.length < 2 && !items[0]?.client) return null;
  return (
    <>
      {[...items].sort((a, b) => a.at.localeCompare(b.at)).map((i, k) => (
        <div key={k}>
          <dt>{new Date(i.at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · {i.client ?? "client pas noté"}{i.payment !== "especes" ? ` · ${PAY[i.payment] ?? i.payment}` : ""}</dt>
          <dd className="num">{money(i.amount)}</dd>
        </div>
      ))}
    </>
  );
}

function ProfitDetailsList({ rows, shop, commit }: { rows: ProfitDetail[]; shop: Shop; commit: (s: Shop) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!rows.length) return <p className="note">Aucune vente sur cette période.</p>;
  return (
    <ul className="profit-rows">
      {rows.map((r) => {
        const gain = r.kind === "travail" ? r.labor : r.profit;
        const sub =
          r.kind === "article" ? `${q(r.qty)} ${r.unit} · vendu en moyenne ${money(r.avgPrice)}`
          : r.kind === "travail" ? `encaissé ${money(r.revenue)} − pièces ${money(r.partsCost)}${r.parts.length ? "" : " (aucune pièce notée)"}`
          : r.kind === "service" ? `${r.count} fois · ${money(r.revenue)}${who(r.items)}`
          : `${r.count} vente${r.count > 1 ? "s" : ""} · ${money(r.revenue)}${who(r.items)}`;
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
                    <Items items={r.items} />
                    <div><dt>Encaissé ({r.count} fois)</dt><dd className="num">{money(r.revenue)}</dd></div>
                    <div><dt>Matière utilisée</dt><dd className="num">{r.cost ? `− ${money(r.cost)}` : "aucune"}</dd></div>
                    <div className="profit-total"><dt>Service rendu (ta main-d'œuvre)</dt><dd className="num">{money(r.profit)}</dd></div>
                  </>
                )}
                {r.kind === "comptoir" && (
                  <>
                    <Items items={r.items} />
                    <div><dt>Encaissé</dt><dd className="num">{money(r.revenue)}</dd></div>
                    <div className="profit-total"><dt>Bénéfice</dt><dd className="num">{r.profit === null ? "pas connu" : money(r.profit)}</dd></div>
                    {r.profit === null && <p className="note">Vente sans article : Jokko ne connaît pas le prix d'achat. Dis l'article (« vendu un écran BF6 10 000 ») pour avoir le bénéfice.</p>}
                  </>
                )}
              </dl>
            )}
            {isOpen && <FixRow key={`${r.key}:${r.saleIds.join(",")}`} row={r} shop={shop} commit={commit} />}
          </li>
        );
      })}
    </ul>
  );
}

const num = (v: string) => Math.round(Number(v.replace(/\s/g, "").replace(",", ".")));

/**
 * « Le calcul n'est pas bon ? Corriger » sous chaque ligne des Bénéfices (17/11/2026, demande de Fallou) :
 * prix d'achat d'un article, coût d'une vente ou d'un service, pièces d'une réparation. Le bénéfice se recalcule tout de suite.
 */
function FixRow({ row, shop, commit }: { row: ProfitDetail; shop: Shop; commit: (s: Shop) => void }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState("");
  const repair = row.kind === "travail" && row.repairId ? (shop.repairs ?? []).find((x) => x.id === row.repairId) : undefined;
  const product = row.kind === "article" ? shop.products.find((p) => p.id === row.productId) : undefined;
  const [cost, setCost] = useState(() =>
    row.kind === "article" ? String(row.unitCost ?? product?.cost ?? "") : row.kind === "service" ? String(row.cost || "") : row.kind === "comptoir" ? String(row.cost ?? "") : "",
  );
  const [keep, setKeep] = useState(true);
  const [parts, setParts] = useState<RepairPart[]>(() => repair?.parts ?? []);
  const [query, setQuery] = useState("");
  const [freeName, setFreeName] = useState("");
  const [freeCost, setFreeCost] = useState("");
  if (row.kind === "travail" && !repair) return null;

  if (!open) {
    return (
      <div className="fix-row">
        {done && <p className="note fix-done">✓ {done}</p>}
        <Button variant="outline" className="h-10 rounded-full px-4" onClick={() => { setDone(""); setOpen(true); }}>
          Le calcul n'est pas bon ? Corriger
        </Button>
      </div>
    );
  }

  const c = num(cost);
  const costOk = cost.trim() !== "" && Number.isFinite(c) && c >= 0;
  const close = (msg: string) => { setOpen(false); setDone(msg); };

  if (row.kind === "article") {
    const profit = costOk ? row.revenue - c * row.qty : null;
    return (
      <div className="fix-row fix-form">
        <label className="fix-label" htmlFor={`fx-${row.key}`}>Prix d'achat d'1 {row.unit || "unité"} (en gros)</label>
        <Input id={`fx-${row.key}`} className="h-11" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} />
        <label className="check-row"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Garder ce prix pour les prochaines ventes</label>
        {profit !== null && <p className="fix-preview">Nouveau bénéfice : {money(row.revenue)} − {money(c)} × {qty(row.qty)} = <b data-tone={profit < 0 ? "bad" : "good"}>{money(profit)}</b></p>}
        <div className="fix-actions">
          <Button variant="outline" className="h-11 rounded-full px-4" onClick={() => setOpen(false)}>Annuler</Button>
          <Button className="h-11 rounded-full px-5" disabled={!costOk} onClick={() => { commit(setArticleCost(shop, row.saleIds, c, row.productId, keep)); close("Prix d'achat corrigé."); }}>OK, corriger</Button>
        </div>
      </div>
    );
  }

  if (row.kind === "service" || row.kind === "comptoir") {
    const profit = costOk ? row.revenue - c : null;
    return (
      <div className="fix-row fix-form">
        <label className="fix-label" htmlFor={`fx-${row.key}`}>{row.kind === "service" ? "Matière utilisée (ce que ça t'a coûté en tout)" : "Ce que ça t'a coûté en tout (prix d'achat)"}</label>
        <Input id={`fx-${row.key}`} className="h-11" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} />
        {profit !== null && <p className="fix-preview">Nouveau bénéfice : {money(row.revenue)} − {money(c)} = <b data-tone={profit < 0 ? "bad" : "good"}>{money(profit)}</b></p>}
        <div className="fix-actions">
          <Button variant="outline" className="h-11 rounded-full px-4" onClick={() => setOpen(false)}>Annuler</Button>
          <Button className="h-11 rounded-full px-5" disabled={!costOk} onClick={() => { commit(setTotalCost(shop, row.saleIds, c)); close("Coût corrigé."); }}>OK, corriger</Button>
        </div>
      </div>
    );
  }

  // Réparation : les pièces posées.
  const r = repair!;
  const partsTotal = parts.reduce((a, p) => a + p.cost, 0);
  const hits = searchProducts(shop.products, query, 5);
  const fc = num(freeCost);
  const labor = r.price - partsTotal;
  return (
    <div className="fix-row fix-form">
      <b className="fix-label">Pièces posées sur {r.device}</b>
      {parts.length ? (
        <ul className="fix-parts">
          {parts.map((p, i) => (
            <li key={i}>
              <span>{p.label}</span>
              <Input className="h-10 fix-cost" inputMode="numeric" aria-label={`Prix d'achat ${p.label}`} value={String(p.cost)} onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, cost: Math.max(0, num(e.target.value) || 0) } : x)))} />
              <Button variant="outline" className="h-10 rounded-full px-3" aria-label={`Enlever ${p.label}`} onClick={() => setParts(parts.filter((_, j) => j !== i))}>✕</Button>
            </li>
          ))}
        </ul>
      ) : <p className="note">Aucune pièce : tout est compté en main-d'œuvre.</p>}
      <Input className="h-11" placeholder="Cherche la pièce dans ton stock (ex. P smart 2021)" aria-label="Cherche la pièce" value={query} onChange={(e) => setQuery(e.target.value)} />
      {hits.length > 0 && (
        <div className="fix-hits">
          {hits.map(({ product: p }) => (
            <Button key={p.id} variant="outline" className="h-10 rounded-full px-3" onClick={() => { setParts([...parts, { productId: p.id, label: p.name, qty: 1, cost: p.cost ?? 0 }]); setQuery(""); }}>
              + {p.name} ({money(p.cost ?? 0)})
            </Button>
          ))}
        </div>
      )}
      <div className="fix-free">
        <Input className="h-11" placeholder="Ou écris la pièce" aria-label="Nom de la pièce" value={freeName} onChange={(e) => setFreeName(e.target.value)} />
        <Input className="h-11 fix-cost" inputMode="numeric" placeholder="Prix d'achat" aria-label="Prix d'achat de la pièce" value={freeCost} onChange={(e) => setFreeCost(e.target.value)} />
        <Button variant="outline" className="h-11 rounded-full px-3" disabled={!freeName.trim() || !Number.isFinite(fc) || fc < 0 || freeCost.trim() === ""} onClick={() => { setParts([...parts, { label: freeName.trim(), qty: 1, cost: fc }]); setFreeName(""); setFreeCost(""); }}>Ajouter</Button>
      </div>
      <p className="fix-preview">Prix {money(r.price)} − pièces {money(partsTotal)} = main-d'œuvre <b data-tone={labor < 0 ? "bad" : "good"}>{money(labor)}</b></p>
      {r.status !== "rendu" && <p className="note">L'appareil n'est pas encore rendu : le prix des pièces comptera au rendu.</p>}
      <div className="fix-actions">
        <Button variant="outline" className="h-11 rounded-full px-4" onClick={() => setOpen(false)}>Annuler</Button>
        <Button className="h-11 rounded-full px-5" onClick={() => { const next = correctRepairParts(shop, r.id, parts); if (next) { commit(next); close("Pièces corrigées, stock remis juste."); } }}>OK, corriger</Button>
      </div>
    </div>
  );
}

const MONTHS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function dayHistorySummary(shop: Shop): string {
  const days = dayHistory(shop);
  if (!days.length) return "Pas encore de vente";
  const first = new Date(`${days[days.length - 1].day}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  return `${days.length} jour${days.length > 1 ? "s" : ""} depuis le ${first} · touche une date pour voir tout`;
}

/**
 * Chaque jour depuis le début (18/11/2026, demande de Fallou) : regroupé par mois, chaque date montre ventes et gagné ;
 * un toucher ouvre la journée : le calcul, chaque article / réparation / service vendu (avec « Corriger ») et toutes les ventes.
 */
function DayHistory({ shop, commit }: { shop: Shop; commit: (s: Shop) => void }) {
  const days = useMemo(() => dayHistory(shop), [shop]);
  const [shown, setShown] = useState(31);
  const [open, setOpen] = useState<string | null>(null);
  const [allSales, setAllSales] = useState(false);
  if (!days.length) return <p className="note">Pas encore de vente.</p>;
  const total = days.reduce((a, d) => ({ revenue: a.revenue + d.revenue, gross: a.gross + d.grossProfit, spent: a.spent + d.spent, net: a.net + d.netProfit }), { revenue: 0, gross: 0, spent: 0, net: 0 });
  const first = new Date(`${days[days.length - 1].day}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const visible = days.slice(0, shown);
  const months = new Map<string, typeof visible>();
  for (const d of visible) months.set(d.day.slice(0, 7), [...(months.get(d.day.slice(0, 7)) ?? []), d]);
  return (
    <div className="day-history">
      <h3>Chaque jour, depuis le début</h3>
      <dl className="journal-sum">
        <div><dt>Depuis le {first}</dt><dd className="num">{days.length} jour{days.length > 1 ? "s" : ""}</dd></div>
        <div><dt>Ventes</dt><dd className="num">{money(total.revenue)}</dd></div>
        <div><dt>Bénéfice sur les ventes</dt><dd className="num">{money(total.gross)}</dd></div>
        {total.spent > 0 && <div><dt>Dépenses et pertes</dt><dd className="num">− {money(total.spent)}</dd></div>}
        <div className="journal-gain"><dt>Gagné (avant la part des licences)</dt><dd className="num">{money(total.net)}</dd></div>
      </dl>
      {[...months.entries()].map(([m, list]) => {
        const mm = list.reduce((a, d) => a + d.netProfit, 0);
        return (
          <section key={m} className="day-month">
            <div className="journal-day-head"><b>{MONTHS_FR[Number(m.slice(5)) - 1]} {m.slice(0, 4)}</b><small>gagné {money(mm)}{list.length === days.filter((d) => d.day.startsWith(m)).length ? "" : " (jours affichés)"}</small></div>
            <ul className="profit-rows">
              {list.map((d) => {
                const isOpen = open === d.day;
                return (
                  <li key={d.day} className={isOpen ? "is-open" : ""}>
                    <button type="button" className="profit-row" aria-expanded={isOpen} onClick={() => { setOpen(isOpen ? null : d.day); setAllSales(false); }}>
                      <span className="profit-name">
                        <b className="day-name">{d.label}</b>
                        <small>{d.salesCount} vente{d.salesCount > 1 ? "s" : ""} · {money(d.revenue)}{d.spent ? ` · dépenses ${money(d.spent)}` : ""}</small>
                      </span>
                      <span className="profit-gain num" data-tone={d.netProfit < 0 ? "bad" : "good"}>{d.netProfit < 0 ? "− " : "+ "}{money(Math.abs(d.netProfit))}</span>
                    </button>
                    {isOpen && <DayOpen shop={shop} commit={commit} day={d.day} allSales={allSales} setAllSales={setAllSales} />}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {days.length > shown && <Button variant="outline" className="h-11 rounded-full" onClick={() => setShown(shown + 31)}>Voir les jours d'avant ({days.length - shown})</Button>}
    </div>
  );
}

function DayOpen({ shop, commit, day, allSales, setAllSales }: { shop: Shop; commit: (s: Shop) => void; day: string; allSales: boolean; setAllSales: (v: boolean) => void }) {
  const period = dayPeriod(day);
  const r = buildReport(shop, period);
  const rows = profitDetails(shop, period);
  const bought = shop.expenses.filter((e) => e.kind === "achat" && Date.parse(e.at) >= period.from.getTime() && Date.parse(e.at) < period.to.getTime());
  const sales = shop.sales.filter((x) => Date.parse(x.at) >= period.from.getTime() && Date.parse(x.at) < period.to.getTime()).sort((a, b) => b.at.localeCompare(a.at));
  return (
    <div className="day-open">
      <dl className="profit-calc">
        <div><dt>Ventes ({r.salesCount})</dt><dd className="num">{money(r.revenue)}</dd></div>
        <div><dt>Prix d'achat de ce qui est vendu</dt><dd className="num">− {money(r.revenue - r.grossProfit)}</dd></div>
        <div><dt>Bénéfice sur les ventes</dt><dd className="num">{money(r.grossProfit)}</dd></div>
        {r.expenses + r.losses > 0 && <div><dt>Dépenses et pertes</dt><dd className="num">− {money(r.expenses + r.losses)}</dd></div>}
        <div className="profit-total"><dt>Gagné ce jour</dt><dd className="num">{money(r.grossProfit - r.expenses - r.losses)}</dd></div>
      </dl>
      <b className="day-open-title">Ce que tu as vendu</b>
      <ProfitDetailsList rows={rows} shop={shop} commit={commit} />
      {sales.length > 0 && (
        <button type="button" className="link" onClick={() => setAllSales(!allSales)}>{allSales ? "Cacher les ventes une par une" : `Voir les ${sales.length} vente${sales.length > 1 ? "s" : ""} une par une (modifier)`}</button>
      )}
      {allSales && <SalesList shop={shop} commit={commit} canEdit sales={sales} />}
      {bought.length > 0 && (
        <>
          <b className="day-open-title">Ce que tu as acheté ou ajouté au stock</b>
          <dl className="profit-calc">
            {bought.map((e) => <div key={e.id}><dt>{e.label}</dt><dd className="num">{money(e.amount)}</dd></div>)}
          </dl>
          <small className="note">Ces achats ne baissent pas le gagné du jour : leur prix compte quand l'article est vendu.</small>
        </>
      )}
    </div>
  );
}

function activitySummary(shop: Shop): string {
  const w = activityReport(shop, "semaine");
  const screens = w.parts.find((k) => k.kind === "Écran")?.count ?? 0;
  if (!w.partsCount && !w.servicesCount) return "Écrans, plaquettes, services : semaine, mois, année";
  return `Cette semaine : ${screens} écran${screens > 1 ? "s" : ""}, ${w.partsCount} pièce${w.partsCount > 1 ? "s" : ""}, ${w.servicesCount} service${w.servicesCount > 1 ? "s" : ""}`;
}
