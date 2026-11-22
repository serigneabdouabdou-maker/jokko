import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Shop, money, uid } from "@/model";
import { addStockLines, chatText, type ChatImport, invoiceStockLines, mergeSupplierChat, readSupplierChat, type StockLine } from "@/data/supplierChat";
import { kindOf, type PartKind } from "@/data/pricing";
import { recordInventory } from "@/data/report";
import { usageMap } from "@/data/reorder";
import { partForSale } from "@/data/partSearch";
import { type Signal, skillServices, workshopWatch } from "@/data/watch";
import { applyPriceUpdates, supplierPriceUpdates } from "@/data/priceGuard";

const LEVEL_ICON: Record<Signal["level"], string> = { grave: "🔴", attention: "🟠", info: "🔵", bon: "🟢" };
const frDate = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");

/**
 * Surveillance de l'atelier (22/11/2026, demande de Fallou) : tout ce qui bouge, signalé.
 * Lecture de la discussion WhatsApp du fournisseur, signaux, services sans matériel, comptage du stock.
 */
export function WatchPanel({ shop, commit }: { shop: Shop; commit: (s: Shop) => void }) {
  const now = useMemo(() => new Date(), []);
  const signals = useMemo(() => workshopWatch(shop, now), [shop, now]);
  const skills = useMemo(() => skillServices(shop, now), [shop, now]);
  const look = signals.filter((s) => s.level === "grave" || s.level === "attention");
  const rest = signals.filter((s) => s.level === "info" || s.level === "bon");
  const sup = (shop.suppliers ?? []).find((s) => s.purchases?.length);
  return (
    <div className="workshop watch">
      <h3>Surveillance de l'atelier</h3>
      <p className="note">Jokko regarde tes réparations, tes services, ton stock et les factures de {sup?.name ?? "ton fournisseur"}. {sup?.readAt ? `Factures lues jusqu'au ${frDate(sup.historyTo ?? "")}.` : ""}</p>

      <ChatImportBox shop={shop} commit={commit} />

      <b className="ws-title">À regarder maintenant ({look.length})</b>
      {look.length ? <SignalList items={look} /> : <p className="note">Rien d'anormal. 👍</p>}

      <b className="ws-title">Ce qui bouge</b>
      {rest.length ? <SignalList items={rest} /> : <p className="note">Lis la discussion de ton fournisseur pour voir les prix et les pièces qui montent.</p>}

      <b className="ws-title">Services sans matériel (ta compétence)</b>
      <dl className="journal-sum">
        <div><dt>Ce mois</dt><dd className="num">{skills.month.count} · {money(skills.month.earned)}</dd></div>
        <div><dt>Le mois dernier</dt><dd className="num">{skills.prev.count} · {money(skills.prev.earned)}</dd></div>
        <div><dt>Depuis le début</dt><dd className="num">{skills.total.count} · {money(skills.total.earned)}</dd></div>
      </dl>
      {skills.lines.length > 0 && (
        <dl className="profit-calc ws-table">
          {skills.lines.map((l) => (
            <div key={l.name}><dt>{l.name} <small>{l.count} fois · {money(l.avg)} en moyenne{l.tool ? " · avec un outil (licence)" : ""}</small></dt><dd className="num">{money(l.earned)}</dd></div>
          ))}
        </dl>
      )}
      <p className="note">Configuration, logiciel, décodage, pilote… : aucune pièce à acheter, tout ce que le client paie est gagné. Mets-les sur ton statut WhatsApp.</p>

      <PriceUpdates shop={shop} commit={commit} />
      <StarsMinimum shop={shop} commit={commit} />
      <CountBlock shop={shop} commit={commit} />
    </div>
  );
}

/** Les prix d'achat suivent le fournisseur : baisse → baisse, hausse → hausse (les 3 prix de vente suivent tout seuls). */
function PriceUpdates({ shop, commit }: { shop: Shop; commit: (s: Shop) => void }) {
  const [done, setDone] = useState("");
  const upd = useMemo(() => supplierPriceUpdates(shop), [shop]);
  if (!upd.length && !done) return null;
  return (
    <div className="stars-min">
      <b className="ws-title">Prix d'achat à mettre à jour ({upd.length})</b>
      {upd.length > 0 && (
        <>
          <ul className="watch-list">{upd.slice(0, 12).map((u) => <li key={u.productId} data-level={u.from !== undefined && u.to > u.from ? "attention" : "bon"}><p>{u.name} : {u.from !== undefined ? money(u.from) : "?"} → <b>{money(u.to)}</b> (facture du {frDate(u.at)})</p></li>)}</ul>
          <Button variant="outline" className="h-11 rounded-full px-5" onClick={() => { commit(applyPriceUpdates(shop, upd)); setDone(`${upd.length} prix d'achat mis à jour : les prix conseillés ont suivi.`); }}>Mettre à jour les prix d'achat</Button>
        </>
      )}
      {done && <p className="note" role="status">{done}</p>}
    </div>
  );
}

function CountBlock({ shop, commit }: { shop: Shop; commit: (s: Shop) => void }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <div className="stars-min">
      <b className="ws-title">Compter mon stock</b>
      {msg && <p className="note" role="status">{msg}</p>}
      {open ? <StockCount shop={shop} commit={commit} parts onDone={(m) => { setMsg(m); setOpen(false); }} /> : (
        <Button className="h-11 rounded-full px-5 font-semibold" onClick={() => setOpen(true)}>Compter mes pièces</Button>
      )}
    </div>
  );
}

function SignalList({ items }: { items: Signal[] }) {
  return (
    <ul className="watch-list">
      {items.map((s) => (
        <li key={s.id} data-level={s.level}>
          <b>{LEVEL_ICON[s.level]} {s.title}</b>
          <p>{s.text}</p>
        </li>
      ))}
    </ul>
  );
}

/** « Mettre à jour avec la discussion WhatsApp » : lit le fichier exporté, montre tout avant d'enregistrer. */
export function ChatImportBox({ shop, commit }: { shop: Shop; commit: (s: Shop) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [imp, setImp] = useState<ChatImport | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [updateCost, setUpdateCost] = useState(true);
  const [help, setHelp] = useState(false);

  const supIndex = Math.max(0, (shop.suppliers ?? []).findIndex((s) => s.purchases?.length));
  const current = shop.suppliers?.[supIndex];
  const merged = useMemo(() => {
    if (!imp) return null;
    const most = new Map<string, number>();
    for (const i of imp.invoices) most.set(i.who, (most.get(i.who) ?? 0) + 1);
    const who = [...most.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Fournisseur";
    const base = current ?? { id: uid("f"), name: who, phone: "" };
    return mergeSupplierChat(base, imp);
  }, [imp, current]);
  const lines = useMemo<StockLine[]>(() => (merged ? invoiceStockLines(shop.products, merged.added) : []), [merged, shop.products]);

  async function onFile(f?: File) {
    setError(""); setDone(""); setImp(null);
    if (!f) return;
    try {
      const r = readSupplierChat(chatText(new Uint8Array(await f.arrayBuffer())));
      if (!r.invoices.length) { setError("Aucune facture « Total … » trouvée dans ce fichier. Exporte bien la discussion avec ton fournisseur."); return; }
      setImp(r);
      setPicked({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fichier illisible");
    }
  }

  function save() {
    if (!merged) return;
    const suppliers = [...(shop.suppliers ?? [])];
    if (current) suppliers[supIndex] = merged.supplier; else suppliers.push(merged.supplier);
    let next: Shop = { ...shop, suppliers };
    const chosen = lines.filter((l) => picked[l.key] ?? !!l.productId);
    if (chosen.length) next = addStockLines(next, chosen, { updateCost }, () => uid("p"));
    // Les derniers prix du fournisseur vont dans le stock (baisse → baisse, hausse → hausse).
    const prices = updateCost ? supplierPriceUpdates(next) : [];
    if (prices.length) next = applyPriceUpdates(next, prices);
    commit(next);
    setDone(`Mis à jour : ${merged.supplier.purchases?.length ?? 0} mois de factures${merged.added.length ? `, ${merged.added.length} nouvelle${merged.added.length > 1 ? "s" : ""} facture${merged.added.length > 1 ? "s" : ""}` : ""}${chosen.length ? `, ${chosen.reduce((a, l) => a + l.qty, 0)} pièces ajoutées au stock` : ""}.`);
    setImp(null);
  }

  const serious = imp?.anomalies.filter((a) => a.serious) ?? [];
  const others = imp?.anomalies.filter((a) => !a.serious && a.kind !== "doublon") ?? [];
  const doubles = imp?.anomalies.filter((a) => a.kind === "doublon").length ?? 0;
  return (
    <div className="import-box chat-import">
      <div className="import-head">
        <b>Mettre à jour avec la discussion WhatsApp</b>
        <span className="note">Jokko lit les factures de ton fournisseur : nouveaux achats, prix, erreurs. Rien n'est envoyé ailleurs.</span>
      </div>
      <div className="import-actions">
        <input ref={file} type="file" accept=".txt,.zip,text/plain,application/zip" hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
        <Button className="h-11 rounded-full px-5 font-semibold" onClick={() => file.current?.click()}>Choisir le fichier de la discussion</Button>
        <Button variant="ghost" className="h-11 rounded-full px-4" onClick={() => setHelp(!help)}>Comment faire ?</Button>
      </div>
      {help && (
        <ol className="note chat-help">
          <li>Ouvre WhatsApp, puis la discussion avec ton fournisseur.</li>
          <li>Touche ⋮ en haut à droite → <b>Plus</b> → <b>Exporter la discussion</b>.</li>
          <li>Choisis <b>Sans médias</b>, puis enregistre le fichier (Fichiers / Téléchargements).</li>
          <li>Reviens ici et touche « Choisir le fichier de la discussion ».</li>
        </ol>
      )}
      {error && <p className="note" data-tone="error">{error}</p>}
      {done && <p className="note" role="status">{done}</p>}
      {imp && merged && (
        <div className="chat-preview">
          <dl className="journal-sum">
            <div><dt>Factures lues</dt><dd className="num">{imp.invoices.length}</dd></div>
            <div><dt>Du … au …</dt><dd>{frDate(imp.from)} → {frDate(imp.to)}</dd></div>
            <div><dt>Total de ces factures</dt><dd className="num">{money(imp.invoices.reduce((a, i) => a + i.total, 0))}</dd></div>
            <div><dt>Nouvelles depuis la dernière lecture</dt><dd className="num">{current?.historyTo ? merged.added.length : "première lecture"}</dd></div>
          </dl>
          {doubles > 0 && <p className="note">{doubles} facture{doubles > 1 ? "s" : ""} renvoyée{doubles > 1 ? "s" : ""} en entier ou corrigée{doubles > 1 ? "s" : ""} : chaque pièce n'est comptée qu'une fois.</p>}
          {serious.length > 0 && (
            <div className="ws-verdict" data-tone="bad">
              <b>{serious.length} erreur{serious.length > 1 ? "s" : ""} en ta défaveur</b>
              <ul className="watch-list">{serious.map((a) => <li key={a.text}><p>{a.text}</p></li>)}</ul>
            </div>
          )}
          {others.length > 0 && (
            <details className="ws-hyp">
              <summary>{others.length} autre{others.length > 1 ? "s" : ""} chose{others.length > 1 ? "s" : ""} à vérifier (en ta faveur ou fautes de frappe)</summary>
              <ul className="watch-list">{others.map((a) => <li key={a.text}><p>{a.text}</p></li>)}</ul>
            </details>
          )}
          <label className="chat-stock-row"><input type="checkbox" checked={updateCost} onChange={(e) => setUpdateCost(e.target.checked)} /> <span>Mettre les derniers prix de {merged.supplier.name} dans mon stock (prix d'achat)</span></label>
          {lines.length > 0 && (
            <div className="chat-stock">
              <b className="ws-title">Ajouter au stock les pièces des nouvelles factures ?</b>
              {lines.map((l) => (
                <label key={l.key} className="chat-stock-row">
                  <input type="checkbox" checked={picked[l.key] ?? !!l.productId} onChange={(e) => setPicked({ ...picked, [l.key]: e.target.checked })} />
                  <span>{l.qty} × {l.productName ?? l.label} <small>{money(l.unit)}{l.productId ? (l.oldCost !== undefined && l.oldCost !== l.unit ? ` · avant ${money(l.oldCost)}` : "") : l.choices ? " · plusieurs pièces possibles : nouvelle fiche" : " · nouvelle pièce"}</small></span>
                </label>
              ))}
            </div>
          )}
          <div className="import-actions">
            <Button className="h-11 rounded-full px-5 font-semibold" onClick={save}>OK, enregistrer</Button>
            <Button variant="ghost" className="h-11 rounded-full px-4" onClick={() => setImp(null)}>Annuler</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Garder 2 en stock pour les pièces qui partent le plus (la commande se prépare toute seule ensuite). */
function StarsMinimum({ shop, commit }: { shop: Shop; commit: (s: Shop) => void }) {
  const [done, setDone] = useState("");
  const stars = useMemo(() => {
    const items = (shop.suppliers ?? []).flatMap((s) => s.items ?? []).filter((i) => (i.recent ?? 0) >= 6 && i.kind !== "Autre").sort((a, b) => (b.recent ?? 0) - (a.recent ?? 0)).slice(0, 12);
    const out: Array<{ id: string; name: string; perMonth: number; min: number }> = [];
    for (const i of items) {
      const p = partForSale(shop.products, i.name, kindOf).product;
      if (p && !out.some((x) => x.id === p.id)) out.push({ id: p.id, name: p.name, perMonth: Math.round(((i.recent ?? 0) / 6) * 10) / 10, min: p.min });
    }
    return out;
  }, [shop]);
  if (!stars.length) return null;
  const todo = stars.filter((s) => s.min < 2);
  return (
    <div className="stars-min">
      <b className="ws-title">Tes pièces stars</b>
      <p className="note">{stars.map((s) => `${s.name} (≈ ${s.perMonth}/mois${s.min >= 2 ? `, minimum ${s.min}` : ""})`).join(" · ")}</p>
      {todo.length > 0 ? (
        <>
          <p className="note">Compte d'abord ton stock (plus bas), sinon Jokko croira qu'il te manque tout.</p>
          <Button variant="outline" className="h-11 rounded-full px-5" onClick={() => {
            const ids = new Set(todo.map((s) => s.id));
            commit({ ...shop, products: shop.products.map((p) => (ids.has(p.id) ? { ...p, min: 2 } : p)) });
            setDone(`Minimum de 2 mis sur ${todo.length} pièce${todo.length > 1 ? "s" : ""} : quand il en reste moins, elles entrent dans la commande prête.`);
          }}>Garder toujours 2 en stock ({todo.length})</Button>
        </>
      ) : <p className="note">Minimum déjà réglé : elles entrent toutes seules dans la commande prête.</p>}
      {done && <p className="note" role="status">{done}</p>}
    </div>
  );
}

const KIND_CHIPS: Array<PartKind | "Tout"> = ["Tout", "Écran", "Batterie", "Plaquette", "Connecteur", "Dos", "Bouton", "Nappe", "Autre"];

/**
 * Compter mon stock (22/11/2026) : pour une boutique de 600 pièces, on ne compte pas tout d'un coup.
 * Recherche, type de pièce, celles qui partent le plus d'abord ; une case vide = pas comptée (ne change rien).
 */
export function StockCount({ shop, commit, parts, onDone }: { shop: Shop; commit: (s: Shop) => void; parts: boolean; onDone?: (msg: string) => void }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<PartKind | "Tout">(parts ? "Écran" : "Tout");
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [limit, setLimit] = useState(40);
  const score = useMemo(() => {
    const used = usageMap(shop, new Date(), 90);
    const m = new Map<string, number>();
    for (const i of (shop.suppliers ?? []).flatMap((s) => s.items ?? [])) {
      const p = partForSale(shop.products, i.name, kindOf).product;
      if (p) m.set(p.id, (m.get(p.id) ?? 0) + (i.recent ?? 0));
    }
    for (const [id, n] of used) m.set(id, (m.get(id) ?? 0) + n * 3);
    return m;
  }, [shop]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return shop.products
      .filter((p) => (kind === "Tout" || kindOf(p.name) === kind) && (!t || p.name.toLowerCase().includes(t) || (p.aliases ?? []).some((a) => a.toLowerCase().includes(t))))
      .sort((a, b) => (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0) || b.stock - a.stock || a.name.localeCompare(b.name));
  }, [shop.products, q, kind, score]);
  const typed = Object.entries(counts).filter(([, v]) => v.trim() !== "");
  function save() {
    const parsed: Record<string, number> = {};
    for (const [id, raw] of typed) {
      const n = Number(raw.replace(",", "."));
      if (Number.isFinite(n) && n >= 0) parsed[id] = n;
    }
    const r = recordInventory(shop, parsed, () => uid("e"));
    commit(r.shop);
    setCounts({});
    onDone?.(`${r.lines.length} article${r.lines.length > 1 ? "s" : ""} compté${r.lines.length > 1 ? "s" : ""}${r.losses ? `, ${money(r.losses)} de pertes notées` : ""}.`);
  }
  return (
    <div className="inventory stock-count">
      <p className="note">Écris ce que tu comptes vraiment. Une case vide n'est pas comptée (rien ne change). Ce qui manque est noté en perte, au prix d'achat.</p>
      <Input className="h-11" placeholder="Cherche une pièce (BF6, A12…)" value={q} onChange={(e) => { setQ(e.target.value); setLimit(40); }} />
      {parts && (
        <div className="seg" role="group" aria-label="Type de pièce">
          {KIND_CHIPS.map((k) => <button key={k} type="button" className={kind === k ? "on" : ""} onClick={() => { setKind(k); setLimit(40); }}>{k === "Autre" ? "Autres" : k === "Tout" ? "Tout" : `${k}s`}</button>)}
        </div>
      )}
      <small className="note">{list.length} article{list.length > 1 ? "s" : ""} · celles qui partent le plus en premier</small>
      {list.slice(0, limit).map((p) => (
        <label key={p.id} className="inventory-row">
          <span>{p.name} <small>(Jokko pense : {p.stock} {p.unit})</small></span>
          <Input className="num h-10" inputMode="decimal" placeholder={String(p.stock)} value={counts[p.id] ?? ""} onChange={(e) => setCounts({ ...counts, [p.id]: e.target.value })} />
        </label>
      ))}
      {list.length > limit && <Button variant="ghost" className="h-10 rounded-full px-4" onClick={() => setLimit(limit + 40)}>Voir {Math.min(40, list.length - limit)} de plus</Button>}
      <div className="import-actions">
        <Button className="h-11 rounded-full px-5 font-semibold" disabled={!typed.length} onClick={save}>Enregistrer ({typed.length} compté{typed.length > 1 ? "s" : ""})</Button>
      </div>
    </div>
  );
}
