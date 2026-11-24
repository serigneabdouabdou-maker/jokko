import { Button } from "@/components/ui/button";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { type Shop, money } from "@/model";
import { activityReport, CHINA_DEFAULTS, type ChinaInput, chinaPlan, RANGE_LABELS, type Range, purchaseControl, supplierProfitEstimate } from "@/data/workshopStats";

const RANGES: Range[] = ["semaine", "mois", "annee", "tout"];
const trend = (now: number, before: number) => (before ? (now > before ? `▲ ${now - before}` : now < before ? `▼ ${before - now}` : "=") : now ? "nouveau" : "");

/**
 * Mon activité (22/11/2026, demande de Fallou) : combien d'écrans, de plaquettes, de connecteurs… et de services,
 * par semaine, mois, année ; ce qui monte, le mieux payé, quoi pousser. Calculé, sans IA.
 */
export function ActivityPanel({ shop }: { shop: Shop }) {
  const [range, setRange] = useState<Range>("semaine");
  const [openKind, setOpenKind] = useState<string | null>(null);
  const r = useMemo(() => activityReport(shop, range), [shop, range]);
  const prevWord = range === "semaine" ? "semaine d'avant" : range === "mois" ? "mois d'avant" : range === "annee" ? "an dernier" : "";
  return (
    <div className="workshop">
      <h3>Mon activité</h3>
      <div className="seg" role="group" aria-label="Période">
        {RANGES.map((k) => <button key={k} type="button" className={range === k ? "on" : ""} aria-pressed={range === k} onClick={() => setRange(k)}>{RANGE_LABELS[k]}</button>)}
      </div>
      <div className="ws-kpis">
        <article><b className="num">{r.partsCount}</b><span>pièces posées ou vendues</span>{range !== "tout" && <small>{trend(r.partsCount, r.partsPrev)} {r.partsPrev ? `(${r.partsPrev} ${prevWord})` : ""}</small>}</article>
        <article><b className="num">{r.servicesCount}</b><span>services</span><small>{money(r.servicesRevenue)}</small></article>
        <article><b className="num">{r.repairs.count}</b><span>réparations reçues</span><small>main-d'œuvre {money(r.repairs.labor)}</small></article>
      </div>

      {r.notes.length > 0 && (
        <ul className="ws-notes">
          {r.notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}

      <b className="ws-title">Pièces</b>
      {r.parts.length === 0 ? <p className="note">Aucune pièce sur cette période.</p> : (
        <ul className="profit-rows">
          {r.parts.map((k) => {
            const isOpen = openKind === k.kind;
            return (
              <li key={k.kind} className={isOpen ? "is-open" : ""}>
                <button type="button" className="profit-row" aria-expanded={isOpen} onClick={() => setOpenKind(isOpen ? null : k.kind)}>
                  <span className="profit-name">
                    <b>{k.label}</b>
                    <small>achat {money(k.cost)}{k.gainKnown ? ` · main-d'œuvre ${money(k.gain)}` : ""}{range !== "tout" && k.prev ? ` · ${k.prev} ${prevWord}` : ""}</small>
                  </span>
                  <span className="profit-gain num">{k.count}<small className="ws-trend">{range !== "tout" ? trend(k.count, k.prev) : ""}</small></span>
                </button>
                {isOpen && (
                  <dl className="profit-calc">
                    {k.models.map((m) => <div key={m.name}><dt>{m.name}</dt><dd className="num">× {m.count}</dd></div>)}
                  </dl>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <b className="ws-title">Services</b>
      {r.services.filter((s) => s.count).length === 0 ? <p className="note">Aucun service sur cette période.</p> : (
        <dl className="profit-calc ws-table">
          {r.services.filter((s) => s.count).map((s) => (
            <div key={s.name}>
              <dt>{s.name} <small>× {s.count}{range !== "tout" && s.prev ? ` (${s.prev} ${prevWord})` : ""} · moyenne {money(s.avg)}</small></dt>
              <dd className="num">{money(s.revenue)}</dd>
            </div>
          ))}
        </dl>
      )}

      {r.items.length > 0 && (
        <>
          <b className="ws-title">Accessoires et autres articles</b>
          <dl className="profit-calc ws-table">
            {r.items.map((i) => <div key={i.name}><dt>{i.name} <small>× {i.qty}</small></dt><dd className="num">{money(i.revenue)}</dd></div>)}
          </dl>
        </>
      )}
      <p className="note">Pièces = posées sur tes réparations (ou prévues au dépôt quand l'appareil est déjà payé) + vendues seules. Le Conseiller (offre Avancé) lit ces chiffres pour te dire quoi accélérer.</p>
    </div>
  );
}

const KEY = (shop: Shop) => `jokko.chine.${shop.id}`;
function loadInput(shop: Shop): ChinaInput {
  try {
    const raw = localStorage.getItem(KEY(shop));
    return raw ? { ...CHINA_DEFAULTS, ...JSON.parse(raw) } : CHINA_DEFAULTS;
  } catch {
    return CHINA_DEFAULTS;
  }
}

const VERDICT = {
  "pas-encore": { title: "Pas encore", tone: "warn", text: "Tes achats de pièces ne suffisent pas encore pour payer le voyage. Continue chez ton fournisseur et laisse Jokko compter." },
  bientot: { title: "Tu t'en approches", tone: "warn", text: "Le voyage commence à avoir du sens. Mets de côté chaque mois et vérifie les vrais prix en Chine avant de partir." },
  oui: { title: "Oui, c'est jouable", tone: "good", text: "Avec tes chiffres, un voyage rapporte plus qu'il ne coûte et tu peux réunir le budget en moins de 6 mois. Vérifie d'abord les vrais prix chez 2 ou 3 vendeurs en Chine." },
} as const;

/**
 * Objectif Chine (22/11/2026, demande de Fallou : « est-ce qu'un jour je peux partir en Chine acheter moi-même ? »).
 * Pièces utilisées par mois au prix du fournisseur, budget du voyage (billet, visa, séjour, fret, douane : hypothèses
 * modifiables), économie par voyage, seuil de rentabilité, mois pour réunir le budget avec le bénéfice réel.
 */
export function ChinaPanel({ shop }: { shop: Shop }) {
  const [input, setInput] = useState<ChinaInput>(() => loadInput(shop));
  const plan = useMemo(() => chinaPlan(shop, input), [shop, input]);
  const set = (k: keyof ChinaInput, v: string) => {
    const n = Math.max(0, Math.round(Number(v.replace(/[^\d]/g, "")) || 0));
    const next = { ...input, [k]: n };
    setInput(next);
    try { localStorage.setItem(KEY(shop), JSON.stringify(next)); } catch { /* stockage indisponible */ }
  };
  const v = VERDICT[plan.verdict];
  const buyPerMonth = plan.base === "fournisseur" ? plan.supplierPerMonth : plan.partsPerMonth;
  const field = (k: keyof ChinaInput, label: string, suffix = "F") => (
    <label className="ws-field">
      <small>{label}</small>
      <span><Input className="h-10 num" inputMode="numeric" value={String(input[k])} onChange={(e) => set(k, e.target.value)} /><em>{suffix}</em></span>
    </label>
  );
  return (
    <div className="workshop">
      <h3>Objectif Chine : acheter moi-même</h3>
      <div className="ws-verdict" data-tone={v.tone}>
        <b>{v.title}</b>
        <p>{v.text}</p>
      </div>
      {plan.confidence === "faible" && <p className="note journal-warn">Jokko n'a que {plan.days} jours de chiffres : c'est une première idée. Après 2 à 3 mois d'enregistrement, ce calcul sera fiable.</p>}

      <dl className="journal-sum">
        {plan.base === "fournisseur"
          ? <div><dt>Tes achats par mois chez {plan.supplierName ?? "ton fournisseur"} (12 derniers mois)</dt><dd className="num">{money(plan.supplierPerMonth)}</dd></div>
          : <div><dt>Pièces utilisées par mois (prix du fournisseur)</dt><dd className="num">{money(plan.partsPerMonth)}</dd></div>}
        <div><dt>Ton bénéfice par mois</dt><dd className="num">{money(plan.profitPerMonth)}</dd></div>
        <div><dt>Commande en Chine ({input.months} mois de pièces, − {input.discountPct} %)</dt><dd className="num">{money(plan.order)}</dd></div>
        <div><dt>Fret et douane ({input.freightPct} %)</dt><dd className="num">{money(plan.freight)}</dd></div>
        <div><dt>Billet, visa, séjour</dt><dd className="num">{money(plan.tripFixed)}</dd></div>
        <div className="journal-gain"><dt>Budget total du voyage</dt><dd className="num">{money(plan.budget)}</dd></div>
        <div><dt>Ce que le voyage te fait gagner (ou perdre)</dt><dd className="num" data-tone={plan.savingPerTrip >= 0 ? "good" : "bad"}>{plan.savingPerTrip >= 0 ? "+ " : "− "}{money(Math.abs(plan.savingPerTrip))}</dd></div>
        {plan.breakEvenPerMonth > 0 && <div><dt>Il faut acheter au moins, par mois</dt><dd className="num">{money(plan.breakEvenPerMonth)}</dd></div>}
        <div><dt>En mettant {input.savePct} % du bénéfice de côté</dt><dd className="num">{plan.monthsToSave === null ? "bénéfice trop bas" : `${plan.monthsToSave} mois`}</dd></div>
        {plan.tripBreakEvenPct !== null && <div><dt>Le voyage gagne si la Chine est moins chère d'au moins</dt><dd className="num">{plan.tripBreakEvenPct} %</dd></div>}
      </dl>
      <b className="ws-title">Sans voyager : commander en ligne depuis la Chine</b>
      <dl className="journal-sum">
        <div><dt>Avion, douane et agent ({input.airPct} %)</dt><dd className="num">{money(Math.round(plan.order * input.airPct / 100))}</dd></div>
        <div><dt>Ce que la commande te fait gagner (ou perdre)</dt><dd className="num" data-tone={plan.onlineSaving >= 0 ? "good" : "bad"}>{plan.onlineSaving >= 0 ? "+ " : "− "}{money(Math.abs(plan.onlineSaving))}</dd></div>
        <div><dt>Ça gagne si la Chine est moins chère d'au moins</dt><dd className="num">{plan.onlineBreakEvenPct} %</dd></div>
      </dl>
      {plan.breakEvenPerMonth > 0 && (
        <div className="ws-gauge" aria-label="Où tu en es">
          <span style={{ width: `${Math.min(100, Math.round((buyPerMonth / plan.breakEvenPerMonth) * 100))}%` }} />
          <small>Aujourd'hui : {Math.round((buyPerMonth / plan.breakEvenPerMonth) * 100)} % du seuil où le voyage devient rentable</small>
        </div>
      )}

      {plan.topModels.length > 0 && (
        <>
          <b className="ws-title">Ce que tu achèterais en premier (par mois)</b>
          <dl className="profit-calc ws-table">
            {plan.topModels.map((m) => <div key={m.name}><dt>{m.name} <small>≈ {String(m.qty).replace(".", ",")} / mois</small></dt><dd className="num">{money(m.cost)}</dd></div>)}
          </dl>
        </>
      )}

      <details className="ws-hyp">
        <summary>Changer les hypothèses (prix, billet, visa…)</summary>
        <div className="ws-fields">
          {field("discountPct", "Moins cher en Chine", "%")}
          {field("months", "Mois de pièces par voyage", "mois")}
          {field("ticket", "Billet aller-retour")}
          {field("visa", "Visa et assurance")}
          {field("stay", "Séjour (hôtel, repas, transport)")}
          {field("freightPct", "Fret et douane (voyage)", "%")}
          {field("airPct", "Avion + douane + agent (en ligne)", "%")}
          {field("savePct", "Bénéfice mis de côté", "%")}
        </div>
        <p className="note">Ces montants sont des hypothèses de départ, pas des prix vérifiés : mets les tiens (agence de voyage, transitaire, vendeurs chinois). Le calcul change tout de suite.</p>
      </details>
      {plan.base !== "fournisseur" && <p className="note">Jokko ne voit pas encore tes anciens achats chez ton fournisseur, seulement ce que tu poses et vends depuis que tu utilises Jokko. Note chaque commande reçue (Atelier → À commander → Commande reçue) pour que ce calcul suive tes vrais achats.</p>}
    </div>
  );
}

const MONTHS_SHORT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** Achats chez le fournisseur, lus dans ses factures WhatsApp : total, par année, mois par mois, par type de pièce. */
export function SupplierHistory({ shop }: { shop: Shop }) {
  const sup = (shop.suppliers ?? []).find((x) => x.purchases?.length);
  if (!sup?.purchases) return null;
  const list = [...sup.purchases].sort((a, b) => a.month.localeCompare(b.month));
  const total = list.reduce((a, m) => a + m.total, 0);
  const invoices = list.reduce((a, m) => a + m.invoices, 0);
  const years = new Map<string, number>();
  for (const m of list) years.set(m.month.slice(0, 4), (years.get(m.month.slice(0, 4)) ?? 0) + m.total);
  const max = Math.max(...list.map((m) => m.total), 1);
  const label = (m: string) => `${MONTHS_SHORT[Number(m.slice(5)) - 1]} ${m.slice(2, 4)}`;
  return (
    <div className="supplier-history">
      <b className="ws-title">Tes achats chez {sup.name}</b>
      <dl className="journal-sum">
        <div><dt>{invoices} factures, de {label(list[0].month)} à {label(list[list.length - 1].month)}</dt><dd className="num">{money(total)}</dd></div>
        {[...years.entries()].map(([y, v]) => {
          const n = list.filter((m) => m.month.startsWith(y)).length;
          return <div key={y}><dt>{y} ({n} mois)</dt><dd className="num">{money(v)}</dd></div>;
        })}
        <div><dt>En moyenne par mois</dt><dd className="num">{money(Math.round(total / list.length))}</dd></div>
      </dl>
      <div className="sh-bars" role="img" aria-label="Achats mois par mois">
        {list.map((m) => (
          <span key={m.month} title={`${label(m.month)} : ${money(m.total)}`}>
            <i style={{ height: `${Math.max(4, Math.round((m.total / max) * 100))}%` }} />
            <small>{MONTHS_SHORT[Number(m.month.slice(5)) - 1].slice(0, 1).toUpperCase()}</small>
          </span>
        ))}
      </div>
      {sup.kinds && sup.kinds.length > 0 && (
        <dl className="profit-calc ws-table">
          {sup.kinds.map((k) => <div key={k.label}><dt>{k.label} <small>{k.qty} pièces</small></dt><dd className="num">{money(k.total)}</dd></div>)}
        </dl>
      )}
      {sup.top && sup.top.length > 0 && (
        <details className="ws-hyp">
          <summary>Ce que tu achètes le plus chez {sup.name}</summary>
          <dl className="profit-calc ws-table">
            {sup.top.map((t) => <div key={t.name}><dt>{t.name.toUpperCase()} <small>{t.qty} pièces · {money(Math.round(t.total / Math.max(1, t.qty)))} en moyenne</small></dt><dd className="num">{money(t.total)}</dd></div>)}
          </dl>
        </details>
      )}
      <small className="note">Lu dans vos factures WhatsApp (« Total … »). Les commandes envoyées seulement en photo ne sont pas comptées : c'est un minimum.</small>
    </div>
  );
}

/** Page « Mon argent chez <fournisseur> » : investi, revenu, gagné ; contrôle ; historique des factures. */
export function SupplierPanel({ shop }: { shop: Shop }) {
  const sup = (shop.suppliers ?? []).find((x) => x.purchases?.length);
  if (!sup) return null;
  return (
    <div className="workshop">
      <h3>Mon argent chez {sup.name}</h3>
      <SupplierEstimateBlock shop={shop} />
      <PurchaseControlBlock shop={shop} />
      <InvoiceErrors shop={shop} />
      <SupplierHistory shop={shop} />
    </div>
  );
}

/** Investi, revenu dans la caisse avec les réparations, gagné en plus (minimum assuré et plus probable). */
function SupplierEstimateBlock({ shop }: { shop: Shop }) {
  const e = supplierProfitEstimate(shop);
  if (!e) return null;
  return (
    <>
      <div className="ws-verdict" data-tone="good">
        <b>Ton argent est revenu, avec un gain en plus</b>
        <dl className="profit-calc ws-table">
          <div><dt>Investi en pièces ({e.months} mois)</dt><dd className="num">{money(e.bought)}</dd></div>
          <div><dt>Revenu avec les réparations <small>prix des pièces posées, payé par les clients</small></dt><dd className="num">≈ {money(e.recovered)}</dd></div>
          <div><dt>Pas encore revenu <small>en stock, cassé à la pose, repris sous garantie</small></dt><dd className="num">≈ {money(e.waiting)}</dd></div>
          <div><dt><b>Gagné en plus : minimum assuré</b> <small>≈ {money(e.sureMonth)} par mois</small></dt><dd className="num"><b>{money(e.sure)}</b></dd></div>
          <div><dt>Gagné en plus : le plus probable <small>≈ {money(e.perMonth)} par mois</small></dt><dd className="num">{money(e.profit)}</dd></div>
        </dl>
        <p>Chaque réparation te rend le prix de la pièce <b>et</b> ta main-d'œuvre. Ce gain est avant le loyer, l'électricité et le transport.</p>
      </div>
      <details className="ws-hyp">
        <summary>Le calcul, pièce par pièce</summary>
        <dl className="profit-calc ws-table">
          {e.lines.filter((l) => l.likely > 0).map((l) => (
            <div key={l.label}>
              <dt>{l.label} <small>{l.qty} achetées · {l.how}{l.perPiece ? ` · ${money(l.perPiece[0])} à ${money(l.perPiece[1])} par pièce` : ""}</small></dt>
              <dd className="num">{money(l.sure)} → {money(l.likely)}</dd>
            </div>
          ))}
        </dl>
        <p className="note">Minimum assuré : le bas de tes gains réels dans Jokko et 85 % des pièces posées. Le plus probable : tes gains moyens et 90 % posées. Les écrans vendus 12 000 F avant la baisse des prix et les téléphones tombés dans l'eau ne sont pas comptés en plus : ton vrai gain est très probablement au-dessus du minimum.</p>
      </details>
    </>
  );
}

const MONTH_NAMES = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** Contrôle strict : ce qui est acheté chez le fournisseur doit ressortir dans Jokko (posé, vendu) ou rester en stock. */
function PurchaseControlBlock({ shop }: { shop: Shop }) {
  const c = purchaseControl(shop);
  if (!c || !c.months.length) return null;
  const missing = c.gap - c.stockValue;
  const tone = missing > c.bought * 0.15 ? "bad" : missing > 0 ? "warn" : "good";
  return (
    <div className="ws-verdict" data-tone={tone}>
      <b>Contrôle : acheté ↔ sorti dans Jokko</b>
      <dl className="profit-calc ws-table">
        {c.months.map((m) => {
          const [y, mo] = m.month.split("-").map(Number);
          return <div key={m.month}><dt>{MONTH_NAMES[mo - 1]} {y} <small>acheté {money(m.bought)} · sorti {money(m.used)}</small></dt><dd className="num">{m.gap > 0 ? "+" : ""}{money(m.gap)}</dd></div>;
        })}
        <div><dt>Pièces en stock dans Jokko (prix d'achat)</dt><dd className="num">{money(c.stockValue)}</dd></div>
        <div><dt><b>À retrouver</b> <small>acheté − sorti − en stock</small></dt><dd className="num"><b>{money(Math.max(0, missing))}</b></dd></div>
      </dl>
      <p>{missing > 0
        ? `${money(missing)} de pièces achetées ne sont ni posées, ni vendues, ni en stock dans Jokko. Soit elles sont dans ton tiroir (compte-les et mets-les dans Stock), soit des réparations ont été faites sans être notées.`
        : "Tout ce que tu as acheté est sorti dans Jokko ou est en stock. Bien."}</p>
      <small className="note">Compté depuis ton premier jour dans Jokko. Les mois d'avant ne sont pas contrôlables.</small>
    </div>
  );
}

/** Erreurs trouvées dans les factures du fournisseur (lecture de la discussion WhatsApp). */
function InvoiceErrors({ shop }: { shop: Shop }) {
  const sup = (shop.suppliers ?? []).find((x) => x.anomalies?.length);
  if (!sup?.anomalies) return null;
  const bad = sup.anomalies.filter((a) => a.serious);
  const other = sup.anomalies.filter((a) => !a.serious);
  return (
    <details className="ws-hyp" open={bad.length > 0}>
      <summary>Erreurs dans les factures : {bad.length} en ta défaveur{other.length ? `, ${other.length} autres à vérifier` : ""}</summary>
      <ul className="watch-list">
        {bad.map((a) => <li key={a.text} data-level="attention"><p>{a.text}</p></li>)}
        {other.map((a) => <li key={a.text}><p>{a.text}</p></li>)}
      </ul>
      <p className="note">Montre ces lignes à {sup.name} : chaque erreur vient de ses propres messages.</p>
      {bad.length > 0 && (
        <Button asChild variant="outline" className="h-11 rounded-full px-5"><a href={`https://wa.me/${(sup.phone ?? "").replace(/\D/g, "").length === 9 ? `221${(sup.phone ?? "").replace(/\D/g, "")}` : (sup.phone ?? "").replace(/\D/g, "")}?text=${encodeURIComponent(["Salam, j'ai vérifié tes factures, il y a des erreurs :", ...bad.map((a) => `- ${a.text}`), "Tu peux vérifier stp ? Merci."].join("\n"))}`} target="_blank" rel="noreferrer">Envoyer ces erreurs à {sup.name} sur WhatsApp</a></Button>
      )}
    </details>
  );
}
