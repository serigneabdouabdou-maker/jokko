import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon, Notice } from "./Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isLow, money, type Profile, roleIn, type Shop } from "@/model";
import { supabase } from "@/data/supabase";
import { loadShops, type LoadClient } from "@/data/sync";
import { allDebts, consolidatedStock, shopDays, type StockRow, totalDay } from "@/data/multiShop";
import { whatsappLink } from "@/data/debts";

const amount = (n: number) => money(n).replace(/ /g, " ");
const qty = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100).replace(".", ","));

type View = "resume" | "stock" | "dettes";

/** « Toutes mes entreprises » (patron, offre Avancé) : les boutiques côte à côte, l'inventaire général, les dettes, les transferts. */
export function AllShops({ profile, setProfile }: { profile: Profile; setProfile: (p: Profile) => void }) {
  const mine = useMemo(() => profile.shops.filter((s) => roleIn(profile, s.id) === "patron"), [profile]);
  const [shops, setShops] = useState<Shop[]>(mine);
  const [state, setState] = useState<"charge" | "ok" | "local">("charge");
  const [view, setView] = useState<View>("resume");
  const [moving, setMoving] = useState<StockRow | null>(null);
  const ids = mine.map((s) => s.id).join(",");

  // Chiffres frais du serveur (les vendeurs vendent sur d'autres téléphones) ; sinon la copie du téléphone.
  const refresh = useCallback(async (): Promise<Shop[] | null> => {
    try {
      const fresh = await loadShops(supabase as unknown as LoadClient, ids.split(",").filter(Boolean));
      setShops(fresh);
      setState("ok");
      return fresh;
    } catch {
      setState("local");
      return null;
    }
  }, [ids]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const days = useMemo(() => shopDays(shops), [shops]);
  const total = useMemo(() => totalDay(days), [days]);
  const stock = useMemo(() => consolidatedStock(shops), [shops]);
  const debts = useMemo(() => allDebts(shops), [shops]);

  if (mine.length < 2) {
    return (
      <section className="sheet all-shops">
        <h2>Toutes mes entreprises</h2>
        <p className="note">Tu as une seule entreprise. Crée la deuxième dans Réglages → Mes entreprises : ici, tu les verras côte à côte.</p>
      </section>
    );
  }

  /** Après un transfert : on reprend les boutiques fraîches du serveur dans l'appli. */
  async function afterTransfer() {
    const fresh = await refresh();
    if (!fresh) return;
    setProfile({ ...profile, shops: profile.shops.map((s) => fresh.find((f) => f.id === s.id) ?? s) });
  }

  return (
    <section className="sheet all-shops">
      <h2>Toutes mes entreprises</h2>
      <p className="note">{state === "charge" ? "Mise à jour…" : state === "local" ? "Pas de connexion : chiffres de ce téléphone." : `${shops.length} boutiques · mis à jour à l'instant`}</p>
      <div className="seg" role="tablist">
        {([["resume", "Aujourd’hui"], ["stock", "Inventaire général"], ["dettes", "Dettes"]] as [View, string][]).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} className={view === id ? "on" : ""} onClick={() => setView(id)}>{label}</button>
        ))}
      </div>

      {view === "resume" && (
        <>
          <div className="all-total">
            <div><span>Ventes du jour</span><b className="num">{amount(total.revenue)}</b><small>{total.salesCount} vente(s)</small></div>
            <div><span>Bénéfice</span><b className="num">{amount(total.profit)}</b></div>
            <div><span>Caisse attendue</span><b className="num">{amount(total.cash)}</b></div>
            <div><span>Dettes clients</span><b className="num">{amount(total.debts)}</b></div>
          </div>
          <div className="all-table-wrap">
            <table className="all-table">
              <thead><tr><th>Boutique</th><th>Ventes</th><th>Bénéfice</th><th>Caisse</th><th>Dettes</th><th>Stock bas</th></tr></thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.id}>
                    <td><b>{d.name}</b><br /><small>{d.salesCount} vente(s)</small></td>
                    <td className="num">{amount(d.revenue)}</td>
                    <td className="num">{amount(d.profit)}</td>
                    <td className="num">{amount(d.cash)}</td>
                    <td className="num">{amount(d.debts)}</td>
                    <td className="num" data-tone={d.lowStock ? "warn" : undefined}>{d.lowStock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {view === "stock" && (
        <>
          <p className="note">Chaque article, le stock de chaque entreprise et le total. Touche « Transférer » pour envoyer de la marchandise d’une entreprise à une autre (sans fausse vente).</p>
          <div className="all-table-wrap">
            <table className="all-table">
              <thead><tr><th>Article</th>{shops.map((s) => <th key={s.id}>{s.name}</th>)}<th>Total</th><th /></tr></thead>
              <tbody>
                {stock.map((r) => (
                  <tr key={r.key} data-low={r.low || undefined}>
                    <td><b>{r.name}</b><br /><small>{r.unit}</small></td>
                    {shops.map((s) => {
                      const cell = r.perShop[s.id];
                      return <td key={s.id} className="num" data-tone={cell && isLow(cell) ? "warn" : undefined}>{cell ? qty(cell.stock) : "—"}</td>;
                    })}
                    <td className="num"><b>{qty(r.total)}</b></td>
                    <td><Button variant="ghost" className="h-9 rounded-full px-3" onClick={() => setMoving(r)}>Transférer</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {moving && <Transfer row={moving} shops={shops} onClose={() => setMoving(null)} onDone={afterTransfer} />}
        </>
      )}

      {view === "dettes" && (
        debts.length === 0 ? <p className="note">Aucune dette dans tes boutiques.</p> : (
          <>
            <p className="note">Total : <b className="num">{amount(total.debts)}</b> · {debts.filter((d) => d.late).length} en retard.</p>
            <ul className="all-debts">
              {debts.map((d) => (
                <li key={`${d.shopId}-${d.clientId}`} data-late={d.late || undefined}>
                  <span><b>{d.name}</b> · {d.shopName}<br /><small>{d.late ? "En retard" : d.dueAt ? `À payer avant le ${new Date(d.dueAt).toLocaleDateString("fr-FR")}` : "Sans date"}</small></span>
                  <b className="num">{amount(d.debt)}</b>
                  {(() => {
                    const link = d.phone ? whatsappLink(d.phone, `Bonjour ${d.name}, petit rappel de ${d.shopName} : il reste ${amount(d.debt)} à payer. Merci !`) : null;
                    return link ? <a className="link" href={link} target="_blank" rel="noreferrer"><Icon name="whatsapp" size="sm" /> Rappeler</a> : null;
                  })()}
                </li>
              ))}
            </ul>
          </>
        )
      )}
    </section>
  );
}

/** Envoyer du stock d'une entreprise à une autre : une seule opération au serveur. */
function Transfer({ row, shops, onClose, onDone }: { row: StockRow; shops: Shop[]; onClose: () => void; onDone: () => Promise<void> }) {
  const sources = shops.filter((s) => (row.perShop[s.id]?.stock ?? 0) > 0);
  const [from, setFrom] = useState(sources[0]?.id ?? "");
  const [to, setTo] = useState(shops.find((s) => s.id !== (sources[0]?.id ?? ""))?.id ?? "");
  const [count, setCount] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const available = row.perShop[from]?.stock ?? 0;
  const n = Number(count.replace(",", "."));
  const name = (id: string) => shops.find((s) => s.id === id)?.name ?? "";

  async function send() {
    setBusy(true);
    setNote("");
    const { data, error } = await supabase.rpc("transfer_stock", { p_from: from, p_to: to, p_product: row.perShop[from]?.productId ?? "", p_qty: n });
    setBusy(false);
    const r = data as { ok: boolean; reason?: string } | null;
    if (error || !r) return setNote("Pas de connexion internet. Réessaie.");
    if (!r.ok) {
      const why: Record<string, string> = {
        stock: `Pas assez de stock à ${name(from)} (il reste ${qty(available)} ${row.unit}).`,
        meme: "Choisis deux boutiques différentes.",
        quantite: "Mets une quantité.",
        patron: "Il faut être le patron des deux boutiques.",
        article: "Cet article n’existe plus dans cette entreprise. Rafraîchis la page.",
      };
      return setNote(why[r.reason ?? ""] ?? "Transfert impossible.");
    }
    await onDone();
    setNote(`✓ ${qty(n)} ${row.unit} de ${row.name} envoyés de ${name(from)} à ${name(to)}.`);
    setCount("");
  }

  return (
    <div className="install-settings transfer">
      <h3>Transférer : {row.name} ({row.unit})</h3>
      {sources.length === 0 ? <p className="note">Aucune entreprise n’a de stock de cet article.</p> : (
        <>
          <label className="field">
            <span className="text-sm font-medium">De</span>
            <select className="h-11 rounded-md border px-3" value={from} onChange={(e) => { setFrom(e.target.value); if (e.target.value === to) setTo(shops.find((s) => s.id !== e.target.value)?.id ?? ""); }}>
              {sources.map((s) => <option key={s.id} value={s.id}>{s.name} ({qty(row.perShop[s.id]?.stock ?? 0)} {row.unit})</option>)}
            </select>
          </label>
          <label className="field">
            <span className="text-sm font-medium">Vers</span>
            <select className="h-11 rounded-md border px-3" value={to} onChange={(e) => setTo(e.target.value)}>
              {shops.filter((s) => s.id !== from).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <Input className="h-11 num" inputMode="decimal" value={count} onChange={(e) => setCount(e.target.value)} placeholder={`Quantité (${row.unit})`} aria-label="Quantité à transférer" />
          <div className="row">
            <Button className="h-11 rounded-full px-5" disabled={busy || !(n > 0) || n > available || !to} onClick={() => void send()}>{busy ? "Transfert…" : "Transférer"}</Button>
            <Button variant="ghost" className="h-11 rounded-full px-5" onClick={onClose}>Fermer</Button>
          </div>
        </>
      )}
      {note && <Notice text={note} tone={note.startsWith("✓") ? "ok" : "erreur"} />}
    </div>
  );
}
