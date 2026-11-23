import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Shop, money, uid } from "@/model";
import { Drill, DrillOverview } from "./Drill";
import {
  addMmOp, CASH, closeMm, commissionFor, dayBounds, lastGaps, MM_KINDS, mmBalances, mmConf, type MmConf, type MmKind, type MmOp,
  mmSummary, mmWarning, needsFirstCount, OPERATORS, operatorLabel,
} from "@/data/mobileMoney";

const n = (v: string) => Math.max(0, Math.round(Number(v.replace(/[^\d]/g, "")) || 0));
const pct = (v: string) => Math.max(0, Math.min(20, Number(v.replace(",", ".").replace(/[^\d.]/g, "")) || 0));
const time = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
const MAIN: MmKind[] = ["depot", "retrait", "paiement"];
const OTHER: MmKind[] = ["recharge", "versement", "commission", "apport", "sortie"];
const QUICK = [5000, 10000, 25000, 50000, 100000];

/** Ce que l'opération fait aux caisses, en mots (sous le bouton). */
function effectWords(kind: MmKind, op: string, amount: number): string {
  const a = money(amount);
  const who = operatorLabel(op);
  switch (kind) {
    case "depot": return `Tu reçois ${a} en espèces, ton solde ${who} baisse de ${a}.`;
    case "retrait": return `Tu donnes ${a} en espèces, ton solde ${who} monte de ${a}.`;
    case "paiement": return `Tu reçois ${a} en espèces, ton solde ${who} baisse de ${a}.`;
    case "recharge": return `Ton solde ${who} monte de ${a}.`;
    case "versement": return `Ton solde ${who} baisse de ${a}, tu reçois ${a} en espèces.`;
    case "commission": return op === CASH ? `Tu reçois ${a} en espèces.` : `Ton solde ${who} monte de ${a}.`;
    case "apport": return `${op === CASH ? "Tes espèces" : `Ton solde ${who}`} montent de ${a}.`;
    case "sortie": return `${op === CASH ? "Tes espèces" : `Ton solde ${who}`} baissent de ${a}.`;
    default: return "";
  }
}

/**
 * Transfert d'argent (23/11/2026) : la caisse d'un point Wave / Orange Money / Free Money.
 * Soldes attendus (espèces + chaque opérateur), opérations en 3 touchers, clôture du soir avec l'écart, commissions.
 */
export function Transfert({ shop, commit, patron }: { shop: Shop; commit: (s: Shop) => void; patron: boolean }) {
  const conf = mmConf(shop);
  const balances = useMemo(() => mmBalances(shop), [shop]);
  const today = useMemo(() => { const b = dayBounds(); return mmSummary(shop, b.from, b.to); }, [shop]);
  const month = useMemo(() => { const now = new Date(); return mmSummary(shop, new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 1)); }, [shop]);
  const first = needsFirstCount(shop);
  const gaps = useMemo(() => lastGaps(shop).filter((g) => g.gap !== 0 && Date.now() - Date.parse(g.at) < 2 * 86_400_000), [shop]);

  const [kind, setKind] = useState<MmKind>("depot");
  const [op, setOp] = useState<string>(conf.operators[0] ?? "wave");
  const [amount, setAmount] = useState("");
  const [client, setClient] = useState("");
  const [phone, setPhone] = useState("");
  const [fee, setFee] = useState("");
  const [comm, setComm] = useState("");
  const [source, setSource] = useState<"especes" | "autre">("especes");
  const [more, setMore] = useState(false);
  const [done, setDone] = useState("");
  const [sure, setSure] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [closed, setClosed] = useState<ReturnType<typeof closeMm>["gaps"] | null>(null);
  const [q, setQ] = useState("");

  const value = n(amount);
  const cashOk = kind === "apport" || kind === "sortie" || kind === "commission";
  const account = cashOk ? op : op === CASH ? conf.operators[0] ?? "wave" : op;
  const estimated = commissionFor(conf, account, kind, value);
  const warn = value ? mmWarning(shop, account, kind, value) : null;

  function save() {
    if (!value) return;
    const next = addMmOp(shop, {
      operator: account, kind, amount: value,
      ...(comm.trim() ? { commission: n(comm) } : {}),
      ...(n(fee) ? { fee: n(fee) } : {}),
      ...(kind === "recharge" ? { source } : {}),
      client, phone,
    }, () => uid("mm"));
    commit(next);
    const after = mmBalances(next);
    setDone(`✓ ${MM_KINDS[kind].split(" (")[0]} ${operatorLabel(account)} ${money(value)} noté. ${after.map((b) => `${b.label} : ${money(b.expected)}`).join(" · ")}`);
    setAmount(""); setClient(""); setPhone(""); setFee(""); setComm(""); setMore(false);
  }

  function remove(o: MmOp) {
    commit({ ...shop, mm: (shop.mm ?? []).filter((x) => x.id !== o.id) });
    setSure(null);
  }

  function setConf(patch: Partial<MmConf>) {
    commit({ ...shop, mmConf: { ...conf, ...patch } });
  }

  function close() {
    const counted: Record<string, number> = {};
    for (const b of balances) if ((counts[b.account] ?? "").trim() !== "") counted[b.account] = n(counts[b.account]!);
    if (!Object.keys(counted).length) return;
    const r = closeMm(shop, counted, () => uid("mm"));
    commit(r.shop);
    setClosed(r.gaps);
    setCounts({});
  }

  const todays = (shop.mm ?? []).filter((o) => Date.parse(o.at) >= dayBounds().from.getTime());
  const canDelete = (o: MmOp) => patron || Date.now() - Date.parse(o.at) < 10 * 60_000;
  const history = (shop.mm ?? []).filter((o) => {
    const t = q.trim().toLowerCase();
    return !t || (o.client ?? "").toLowerCase().includes(t) || (o.phone ?? "").includes(t.replace(/\D/g, "") || "§") || String(o.amount).includes(t.replace(/\D/g, "") || "§");
  }).slice(0, 80);

  const opRow = (o: MmOp) => (
    <li key={o.id} className={`mm-op is-${o.kind}`}>
      <span className="mm-op-main">
        <b>{MM_KINDS[o.kind].split(" (")[0]} · {operatorLabel(o.operator)}</b>
        <small>{time(o.at)}{o.client ? ` · ${o.client}` : ""}{o.phone ? ` · ${o.phone}` : ""}{o.commission ? ` · commission ${money(o.commission)}` : ""}{o.fee ? ` · frais ${money(o.fee)}` : ""}{o.kind === "recharge" && o.source === "autre" ? " · payé hors caisse" : ""}</small>
      </span>
      <b className="num">{money(o.amount)}</b>
      {canDelete(o) && (sure === o.id
        ? <Button variant="outline" className="h-9 rounded-full px-3 mm-del" onClick={() => remove(o)}>Oui, supprimer</Button>
        : <button type="button" className="mm-x" aria-label="Supprimer" onClick={() => setSure(o.id)}>✕</button>)}
    </li>
  );

  return (
    <section className="sheet transfert">
      <DrillOverview>
        <div className="sheet-head">
          <h2>Transfert d'argent</h2>
          <b className="num sheet-total">{today.count} opération{today.count > 1 ? "s" : ""}</b>
        </div>
        <p className="note">Tu peux aussi le dire au micro : « dépôt Wave 25 000 pour Moussa », « retrait Orange Money 10 000 », « solde Wave ? ».</p>

        {first && (
          <div className="mm-first">
            <b>Avant de commencer : combien as-tu maintenant ?</b>
            <p className="note">Compte tes espèces du transfert et lis chaque solde sur ton téléphone. Jokko part de là.</p>
            {balances.map((b) => (
              <label key={b.account} className="mm-count">
                <span>{b.label}</span>
                <Input className="h-11" inputMode="numeric" placeholder="0" value={counts[b.account] ?? ""} onChange={(e) => setCounts({ ...counts, [b.account]: e.target.value })} />
              </label>
            ))}
            <Button className="h-12 rounded-full px-6" disabled={!balances.every((b) => (counts[b.account] ?? "").trim() !== "")} onClick={close}>Enregistrer mes soldes de départ</Button>
          </div>
        )}

        {!first && (
          <div className="mm-balances">
            {balances.map((b) => (
              <article key={b.account} data-tone={b.expected < 0 || b.low ? "bad" : undefined}>
                <span>{b.label}</span>
                <b className="num">{money(b.expected)}</b>
                <small>{b.expected < 0 ? "Négatif : refais le comptage" : b.low ? "Solde bas : recharge" : b.account === CASH ? "espèces attendues" : "solde attendu"}</small>
              </article>
            ))}
          </div>
        )}
        {gaps.length > 0 && (
          <p className="note" data-tone="error">Dernier comptage : {gaps.map((g) => `${g.label} ${g.gap > 0 ? "+" : "−"}${money(Math.abs(g.gap))}`).join(", ")}. {gaps.some((g) => g.gap < 0) ? "Il manquait de l'argent : vérifie les opérations du jour." : ""}</p>
        )}

        {!first && (
          <div className="mm-form">
            <div className="pay-modes mm-kinds" role="radiogroup" aria-label="Opération">
              {MAIN.map((k) => <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? "on" : ""} onClick={() => { setKind(k); if (op === CASH) setOp(conf.operators[0] ?? "wave"); }}>{MM_KINDS[k].split(" (")[0]}</button>)}
              <button type="button" className={OTHER.includes(kind) ? "on" : ""} onClick={() => setKind(OTHER.includes(kind) ? "depot" : "recharge")}>Autre…</button>
            </div>
            {OTHER.includes(kind) && (
              <div className="wizard-chips">
                {OTHER.map((k) => <button key={k} type="button" className={kind === k ? "on" : ""} aria-pressed={kind === k} onClick={() => setKind(k)}>{MM_KINDS[k]}</button>)}
              </div>
            )}
            <div className="wizard-chips mm-ops">
              {[...conf.operators, ...(cashOk ? [CASH] : [])].map((id) => <button key={id} type="button" className={account === id ? "on" : ""} aria-pressed={account === id} onClick={() => setOp(id)}>{operatorLabel(id)}</button>)}
            </div>
            <Input className="h-14 mm-amount" inputMode="numeric" placeholder="Montant" aria-label="Montant" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <div className="wizard-chips">
              {QUICK.map((v) => <button key={v} type="button" onClick={() => setAmount(String(v))}>{money(v)}</button>)}
            </div>
            {kind === "recharge" && (
              <div className="wizard-chips">
                <button type="button" className={source === "especes" ? "on" : ""} onClick={() => setSource("especes")}>Payé avec les espèces du transfert</button>
                <button type="button" className={source === "autre" ? "on" : ""} onClick={() => setSource("autre")}>Payé autrement (banque, poche…)</button>
              </div>
            )}
            {(kind === "depot" || kind === "retrait" || kind === "paiement") && (
              <button type="button" className="mm-more" onClick={() => setMore(!more)}>{more ? "▾" : "▸"} Client, frais, commission (facultatif)</button>
            )}
            {more && (
              <div className="mm-extra">
                <Input className="h-11" placeholder="Nom du client" value={client} onChange={(e) => setClient(e.target.value)} />
                <Input className="h-11" inputMode="tel" placeholder="Numéro du client" value={phone} onChange={(e) => setPhone(e.target.value)} />
                <Input className="h-11" inputMode="numeric" placeholder="Frais pris au client (espèces)" value={fee} onChange={(e) => setFee(e.target.value)} />
                <Input className="h-11" inputMode="numeric" placeholder={estimated ? `Commission (estimée : ${money(estimated)})` : "Commission (si tu la connais)"} value={comm} onChange={(e) => setComm(e.target.value)} />
              </div>
            )}
            {value > 0 && <p className="note">{effectWords(kind, account, value)}{estimated && !comm ? ` Commission estimée : ${money(estimated)}.` : ""}</p>}
            {warn && <p className="note" data-tone="error">⚠ {warn}</p>}
            <Button className="h-12 rounded-full px-6" disabled={!value} onClick={save}>
              {value ? `Enregistrer : ${MM_KINDS[kind].split(" (")[0].toLowerCase()} ${operatorLabel(account)} ${money(value)}` : "Tape le montant"}
            </Button>
            {done && <p className="note" data-tone="good">{done}</p>}
          </div>
        )}

        {!first && (
          <div className="kpis mm-kpis">
            <article><span>Dépôts</span><b className="num">{money(today.depots)}</b></article>
            <article><span>Retraits</span><b className="num">{money(today.retraits)}</b></article>
            <article><span>Paiements</span><b className="num">{money(today.paiements)}</b></article>
            <article className="kpi-main" data-tone="good"><span>Gagné aujourd'hui</span><b className="num">{money(today.gain)}</b><small>{today.fees ? `dont frais ${money(today.fees)}` : "commissions estimées"}</small></article>
          </div>
        )}
        {todays.length > 0 && (
          <>
            <h3>Aujourd'hui</h3>
            <ul className="mm-list">{todays.filter((o) => o.kind !== "comptage").slice(0, 40).map(opRow)}</ul>
          </>
        )}
      </DrillOverview>

      {!first && (
        <Drill id="cloture" title="Clôture : compter et voir l'écart" icon="caisse" summary="Compte les espèces, lis tes soldes : Jokko dit s'il manque de l'argent">
          <h3>Clôture</h3>
          <p className="note">Compte tes espèces du transfert, puis lis chaque solde sur ton téléphone. Laisse vide ce que tu ne comptes pas.</p>
          {balances.map((b) => (
            <label key={b.account} className="mm-count">
              <span>{b.label} <small>(attendu {money(b.expected)})</small></span>
              <Input className="h-11" inputMode="numeric" placeholder="compté" value={counts[b.account] ?? ""} onChange={(e) => setCounts({ ...counts, [b.account]: e.target.value })} />
            </label>
          ))}
          <Button className="h-12 rounded-full px-6" disabled={!Object.values(counts).some((v) => v.trim())} onClick={close}>Clôturer</Button>
          {closed && (
            <ul className="mm-gaps">
              {closed.map((g) => (
                <li key={g.account} data-tone={g.gap < 0 ? "bad" : g.gap > 0 ? "warn" : "good"}>
                  <b>{g.label}</b>
                  <span>attendu {money(g.expected)} · compté {money(g.counted)}</span>
                  <b className="num">{g.first ? "départ" : g.gap === 0 ? "✓ juste" : `${g.gap > 0 ? "+" : "−"}${money(Math.abs(g.gap))} ${g.gap > 0 ? "en trop" : "manque"}`}</b>
                </li>
              ))}
            </ul>
          )}
        </Drill>
      )}

      <Drill id="mois" title="Ce mois" icon="rapport" summary={`${month.count} opérations · gagné ${money(month.gain)}`}>
        <h3>Ce mois</h3>
        <ul className="price-preview">
          {month.byOperator.map((l) => (
            <li key={l.operator}><span>{l.label} · {l.count} op. · dépôts {money(l.depots)} · retraits {money(l.retraits)}</span><b className="num">{money(l.commissions)}</b></li>
          ))}
          <li><span><b>Total gagné</b> (commissions estimées {money(month.commissions)} + frais {money(month.fees)})</span><b className="num">{money(month.gain)}</b></li>
        </ul>
        {conf.operators.every((o) => !Object.values(conf.rates[o] ?? {}).some((r) => r > 0)) && (
          <p className="note" data-tone="error">Les taux de commission ne sont pas encore réglés : le gain affiché ne compte que les frais. Ouvre « Réglages du transfert ».</p>
        )}
      </Drill>

      <Drill id="historique" title="Historique et recherche" icon="journal" summary="Retrouver une opération par client, numéro ou montant (120 jours)">
        <h3>Historique</h3>
        <Input className="h-11" placeholder="Nom, numéro ou montant" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="mm-list">
          {history.map((o) => (
            <li key={o.id} className={`mm-op is-${o.kind}`}>
              <span className="mm-op-main"><b>{MM_KINDS[o.kind].split(" (")[0]} · {operatorLabel(o.operator)}</b><small>{dayLabel(o.at)} {time(o.at)}{o.client ? ` · ${o.client}` : ""}{o.phone ? ` · ${o.phone}` : ""}</small></span>
              <b className="num">{money(o.amount)}</b>
            </li>
          ))}
        </ul>
      </Drill>

      {patron && (
        <Drill id="reglages" title="Réglages du transfert" icon="reglages" summary="Opérateurs, taux de commission, alerte de solde bas">
          <h3>Opérateurs utilisés</h3>
          <div className="wizard-chips">
            {OPERATORS.map((o) => {
              const on = conf.operators.includes(o.id);
              return <button key={o.id} type="button" className={on ? "on" : ""} aria-pressed={on} onClick={() => setConf({ operators: on ? conf.operators.filter((x) => x !== o.id) : [...conf.operators, o.id] })}>{o.label}</button>;
            })}
          </div>
          <h3>Commission en % (ton contrat)</h3>
          <p className="note">Jokko ne connaît pas ton contrat : mets les taux que l'opérateur te paie. Si tu ne sais pas, laisse 0 et tape la commission sur l'opération.</p>
          {conf.operators.map((id) => {
            const r = conf.rates[id] ?? { depot: 0, retrait: 0, paiement: 0 };
            const set = (k: keyof typeof r, v: string) => setConf({ rates: { ...conf.rates, [id]: { ...r, [k]: pct(v) } } });
            return (
              <div key={id} className="mm-rates">
                <b>{operatorLabel(id)}</b>
                <label>Dépôt <Input className="h-10" inputMode="decimal" defaultValue={r.depot || ""} placeholder="0" onBlur={(e) => set("depot", e.target.value)} /></label>
                <label>Retrait <Input className="h-10" inputMode="decimal" defaultValue={r.retrait || ""} placeholder="0" onBlur={(e) => set("retrait", e.target.value)} /></label>
                <label>Paiement <Input className="h-10" inputMode="decimal" defaultValue={r.paiement || ""} placeholder="0" onBlur={(e) => set("paiement", e.target.value)} /></label>
              </div>
            );
          })}
          <h3>Alerte solde bas</h3>
          {[CASH, ...conf.operators].map((id) => (
            <label key={id} className="mm-count">
              <span>{operatorLabel(id)} sous</span>
              <Input className="h-10" inputMode="numeric" defaultValue={conf.low[id] || ""} placeholder="pas d'alerte" onBlur={(e) => setConf({ low: { ...conf.low, [id]: n(e.target.value) } })} />
            </label>
          ))}
        </Drill>
      )}
    </section>
  );
}
