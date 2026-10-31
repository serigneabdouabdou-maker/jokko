import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { type Profile, type Shop, expectedCash, money, PAYMENT_LABELS, roleIn } from "@/model";
import { supabase } from "@/data/supabase";
import { loadShops, type LoadClient } from "@/data/sync";
import { detectAlerts, openedAt } from "@/data/alerts";
import type { JournalRow } from "@/data/journal";
import { loadJournal, loadTeam, type Member, watchJournal } from "@/data/team";
import { buildReport, periodOf } from "@/data/report";
import { whatsappLink } from "@/data/debts";
import { daySummary } from "@/data/summary";

const amount = (n: number) => money(n).replace(/ /g, " ");
const hour = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const day = (iso: string) => new Date(iso).toLocaleString("fr-FR", { weekday: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

function ago(iso: string): string {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `il y a ${h} h` : `le ${day(iso)}`;
}

/** Écran « À distance » (patron) : la boutique en direct, les alertes et le résumé du soir. */
export function Remote({ profile }: { profile: Profile }) {
  const shops = profile.shops.filter((s) => roleIn(profile, s.id) === "patron");
  const [shopId, setShopId] = useState(profile.shopId && roleIn(profile) === "patron" ? profile.shopId : (shops[0]?.id ?? ""));
  const [shop, setShop] = useState<Shop | null>(null);
  const [rows, setRows] = useState<JournalRow[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [state, setState] = useState<"charge" | "ok" | "erreur">("charge");
  const [live, setLive] = useState(false);
  const [scope, setScope] = useState<"jour" | "semaine">("jour");
  const reload = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!shopId) return;
    try {
      const [loaded, journal, team] = await Promise.all([loadShops(supabase as unknown as LoadClient, [shopId]), loadJournal(shopId, 800), loadTeam(shopId)]);
      setShop(loaded[0] ?? null);
      setRows(journal);
      setMembers(team.members);
      setState("ok");
    } catch {
      setState("erreur");
    }
  }, [shopId]);

  useEffect(() => {
    setState("charge");
    void refresh();
    // Direct : chaque action dans la boutique arrive ici tout de suite
    const stop = watchJournal(shopId, (row) => {
      setLive(true);
      setRows((list) => (list.some((r) => r.id === row.id) ? list : [row, ...list]));
      if (reload.current) window.clearTimeout(reload.current);
      reload.current = window.setTimeout(() => void refresh(), 1500);
    });
    setLive(true);
    return () => {
      stop();
      setLive(false);
      if (reload.current) window.clearTimeout(reload.current);
    };
  }, [shopId, refresh]);

  const patronIds = useMemo(() => new Set(members.filter((m) => m.role === "patron").map((m) => m.user_id)), [members]);
  const alerts = useMemo(() => (shop ? detectAlerts(rows, shop.products, patronIds) : []), [rows, shop, patronIds]);

  const who = (userId: string | null) => {
    const m = members.find((x) => x.user_id === userId);
    return m ? m.name || (m.role === "patron" ? "Patron" : m.phone.replace(/^221/, "")) : "—";
  };

  if (!shops.length) return <section className="sheet"><h2>À distance</h2><p className="note">Tu n'es patron d'aucune boutique.</p></section>;

  const report = shop ? buildReport(shop, periodOf("jour")) : null;
  const today = shop ? shop.sales.filter((s) => isToday(s.at)) : [];
  const byPay = (m: string) => today.filter((s) => (s.payment ?? "especes") === m).reduce((a, s) => a + s.amount, 0);
  const cashNow = shop ? expectedCash(shop) : 0;
  const opened = openedAt(rows);
  const last = rows[0];
  const counted = rows.find((r) => r.tbl === "cash_counts" && r.action === "ajout" && isToday(r.at));
  const shown = alerts.filter((a) => (scope === "jour" ? isToday(a.at) : Date.now() - Date.parse(a.at) < 7 * 86_400_000));
  const summary = shop ? daySummary(shop, alerts, counted) : "";
  // Paiements Wave sans API, pas encore vérifiés par le patron (7 derniers jours)
  const waveToCheck = shop ? shop.sales.filter((s) => s.payment === "wave" && !s.checked && Date.now() - Date.parse(s.at) < 7 * 86_400_000) : [];
  const wa = profile.phone ? whatsappLink(profile.phone, summary) : null;

  return (
    <section className="remote">
      <div className="sheet remote-head">
        <div className="sheet-head">
          <h2>À distance</h2>
          <span className={`live-dot${live ? " on" : ""}`}>{live ? "En direct" : "Hors ligne"}</span>
          <Button variant="outline" className="h-9 rounded-full px-4" onClick={() => void refresh()}>Actualiser</Button>
        </div>
        {shops.length > 1 && (
          <select className="h-11 rounded-md border px-3" value={shopId} onChange={(e) => setShopId(e.target.value)} aria-label="Boutique">
            {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        {state === "erreur" && <p className="note" data-tone="error">Pas de connexion internet. Touche Actualiser quand le réseau revient.</p>}
        {state === "charge" && <p className="note">Chargement…</p>}
        {shop && report && (
          <>
            <p className="remote-status">
              {opened ? <>Boutique ouverte · 1re vente à <b>{hour(opened)}</b></> : <>Pas encore de vente aujourd'hui</>}
              {last && <> · dernière activité {ago(last.at)} ({who(last.user_id)})</>}
            </p>
            <div className="kpis remote-kpis">
              <article><span>Ventes du jour</span><b className="num">{amount(report.revenue)}</b><small>{report.salesCount} vente(s)</small></article>
              <article><span>Espèces attendues</span><b className="num">{amount(cashNow)}</b><small>{counted ? `comptées ${amount(Number(counted.after?.counted ?? 0))}` : "pas encore clôturé"}</small></article>
              <article><span>{PAYMENT_LABELS.wave} + {PAYMENT_LABELS.om}</span><b className="num">{amount(byPay("wave") + byPay("om"))}</b></article>
              <article><span>À crédit</span><b className="num">{amount(byPay("credit"))}</b></article>
              <article><span>Dépenses</span><b className="num">− {amount(report.expenses)}</b></article>
              <article className="kpi-main" data-tone={report.netProfit < 0 ? "bad" : "good"}><span>Bénéfice du jour</span><b className="num">{amount(report.netProfit)}</b></article>
            </div>
          </>
        )}
      </div>

      <div className="sheet">
        <div className="sheet-head">
          <h3>Alertes de sécurité</h3>
          <div className="journal-filters" role="tablist">
            <button type="button" className={scope === "jour" ? "on" : ""} onClick={() => setScope("jour")}>Aujourd'hui</button>
            <button type="button" className={scope === "semaine" ? "on" : ""} onClick={() => setScope("semaine")}>7 jours</button>
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="note">✅ Rien d'anormal{scope === "jour" ? " aujourd'hui" : " cette semaine"}.</p>
        ) : (
          <ol className="alert-list">
            {shown.map((a) => (
              <li key={a.id} className={`is-${a.level}`}>
                <time className="num">{scope === "jour" ? hour(a.at) : day(a.at)}</time>
                <b>{who(a.userId)}</b>
                <span>{a.text}</span>
              </li>
            ))}
          </ol>
        )}
        <p className="note">Jokko surveille : ventes annulées, ventes sous le prix, stock qui baisse sans vente, articles ou clients supprimés, dettes baissées, dépenses, écarts de caisse.</p>
      </div>

      {shop && waveToCheck.length > 0 && (
        <div className="sheet">
          <h3>Paiements Wave à vérifier</h3>
          <p className="note">Retrouve chaque paiement dans ton appli Wave Business (même montant, même heure), puis touche « Vérifié ». S'il n'y est pas, l'argent n'est pas arrivé : parle au vendeur.</p>
          <ul className="admin-list">
            {waveToCheck.map((s) => (
              <li key={s.id}>
                <span><b>{s.label}</b><br /><small>{day(s.at)}</small></span>
                <b className="num">{amount(s.amount)}</b>
                <Button className="h-9 rounded-full px-4" onClick={async () => {
                  const { error } = await supabase.from("sales").update({ checked: true }).eq("id", s.id);
                  if (!error) void refresh();
                }}>Vérifié</Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {shop && (
        <div className="sheet">
          <h3>Résumé du jour</h3>
          <pre className="day-summary">{summary}</pre>
          <div className="row">
            {wa && <Button className="h-11 rounded-full px-5" onClick={() => window.open(wa, "_blank", "noopener")}>M'envoyer sur WhatsApp</Button>}
            <Button variant="outline" className="h-11 rounded-full px-5" onClick={() => void navigator.clipboard?.writeText(summary)}>Copier</Button>
          </div>
          {shop.products.filter((p) => p.stock <= p.min).length > 0 && (
            <p className="note">Stock bas : {shop.products.filter((p) => p.stock <= p.min).map((p) => `${p.name} (${p.stock} ${p.unit})`).join(", ")}</p>
          )}
        </div>
      )}
    </section>
  );
}
