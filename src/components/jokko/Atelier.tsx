import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { Button } from "@/components/ui/button";
import { Drill, DrillList, DrillOverview, usePhone } from "@/components/jokko/Drill";
import { CashSourcePicker, defaultCashSource } from "@/components/jokko/CashSourcePicker";
import { Input } from "@/components/ui/input";
import { type CashSource, type Product, type Repair, type Shop, money } from "@/model";
import { addRepair, deliverRepair, markRepaired, type PartInput, partsCost, payRepair, remaining, repairBreakdown, repairsOf, setRepairPrice, underWarranty, waitingDays, workshopMonth } from "@/data/repairs";
import { whatsappLink } from "@/data/debts";
import { clientFile, knownClient } from "@/data/clientFiles";
import { productNamedIn, searchProducts } from "@/data/partSearch";
import { Commandes, PartLookup } from "./Commandes";
import { laborStats, suggestedPrice } from "@/data/pricing";
import { orderPlan } from "@/data/reorder";
import { imeiLooksWrong, mainModelKey, tacOf } from "@/data/modelKeys";
import { expandKeys, modelOfTac, sameNames } from "@/data/phoneBook";
import { compatLookup, compatTacLearn, compatTacLookup } from "@/data/supabase";
import { evidenceText, type StockMatch, stockFor } from "@/data/compat";
import { kindOf } from "@/data/pricing";
import { modelKeys } from "@/data/modelKeys";

type ImeiInfo = { state: "cherche" } | { state: "trouve"; label: string; from: "base" | "atelier" } | { state: "inconnu" } | { state: "faux" };

/**
 * IMEI tapé au dépôt (*#06#) : le modèle se remplit tout seul (ateliers Jokko d'abord, puis base publique).
 * Inconnu : le réparateur écrit l'appareil, et Jokko l'apprend pour tous les ateliers à l'enregistrement.
 */
function useImeiModel(imei: string, onFound: (label: string) => void): ImeiInfo | null {
  const [info, setInfo] = useState<ImeiInfo | null>(null);
  const found = useRef(onFound);
  found.current = onFound;
  useEffect(() => {
    const tac = tacOf(imei);
    if (!tac) return setInfo(null);
    if (imeiLooksWrong(imei)) return setInfo({ state: "faux" });
    let stop = false;
    setInfo({ state: "cherche" });
    void (async () => {
      const learned = navigator.onLine !== false ? await compatTacLookup(tac) : [];
      const hit = learned[0] ? { label: learned[0].label, from: "atelier" as const } : await modelOfTac(tac).then((m) => (m ? { label: m.label, from: "base" as const } : null));
      if (stop) return;
      if (hit) {
        setInfo({ state: "trouve", ...hit });
        found.current(hit.label);
      } else setInfo({ state: "inconnu" });
    })();
    return () => {
      stop = true;
    };
  }, [imei]);
  return info;
}

const STATUS: Record<Repair["status"], string> = { depot: "Au dépôt", repare: "Réparé · attend le client", rendu: "Rendu", annule: "Annulé" };
const n = (v: string) => Math.max(0, Math.round(Number(v.replace(/[^\d]/g, "")) || 0));

/** « Le client paie 15 000 F = pièce 5 000 F + main-d'œuvre 10 000 F » : le calcul du réparateur, écrit en clair. */
function Breakdown({ r }: { r: Repair }) {
  const b = repairBreakdown(r);
  if (!b.price) return null;
  return (
    <p className={`repair-calc${b.labor < 0 ? " is-loss" : ""}`}>
      Le client paie <b>{money(b.price)}</b> = pièces {money(b.parts)} + main-d'œuvre <b>{money(b.labor)}</b>
      {b.labor < 0 ? " : la pièce coûte plus que le prix, tu perds de l'argent." : r.parts.length ? " (ton gain)" : " (pièces pas encore notées)"}
    </p>
  );
}

/**
 * Chercher une pièce par son nom ou par le téléphone (« BF6 ») : l'écran universel qui va dessus sort aussi,
 * avec son prix d'achat (pris dans le stock, modifiable ensuite).
 */
function PartPicker({ products, query, setQuery, onPick, label }: { products: Product[]; query: string; setQuery: (q: string) => void; onPick: (p: Product) => void; label: string }) {
  const hits = searchProducts(products, query, 6);
  return (
    <div className="part-pick">
      <Input className="h-11" placeholder={label} aria-label={label} value={query} onChange={(e) => setQuery(e.target.value)} />
      {query.trim().length >= 2 &&
        (hits.length ? (
          <ul className="part-hits">
            {hits.map((h) => (
              <li key={h.product.id}>
                <button type="button" onClick={() => onPick(h.product)}>
                  <b>{h.product.name}</b>
                  <small>
                    {h.product.cost !== undefined ? `achat ${money(h.product.cost)}` : "prix d'achat ?"}
                    {" · "}
                    {h.product.stock > 0 ? `${h.product.stock} en stock` : "à commander"}
                    {h.via ? ` · va aussi sur ${h.via}` : ""}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <small className="note">Aucune pièce trouvée : tape le prix d'achat toi-même.</small>
        ))}
    </div>
  );
}

const DOT: Record<string, string> = { pose: "🟢", fournisseur: "🔵", atelier: "🟡" };

/**
 * « Réparé » : les pièces qui vont sur CET appareil, proposées en premier (stock d'abord), d'après le nom des pièces
 * et le réseau Jokko des pièces. Le type de pièce de la panne passe devant (écran cassé → écrans).
 */
function FitParts({ shop, device, problem, chosen, onPick }: { shop: Shop; device: string; problem: string; chosen: string[]; onPick: (p: Product) => void }) {
  const [matches, setMatches] = useState<StockMatch[] | null>(null);
  useEffect(() => {
    let stop = false;
    void (async () => {
      const names = await sameNames();
      const keys = expandKeys(modelKeys(device), names);
      if (!keys.length) return !stop && setMatches([]);
      const links = navigator.onLine !== false ? await compatLookup(keys) : [];
      if (!stop) setMatches(stockFor(shop.products, keys, links));
    })();
    return () => {
      stop = true;
    };
  }, [device, shop.products]);
  if (!matches?.length) return null;
  const want = kindOf(problem);
  const list = [...matches]
    .sort((a, b) => Number(b.kind === want) - Number(a.kind === want) || Number(b.product.stock > 0) - Number(a.product.stock > 0))
    .slice(0, 6);
  return (
    <div className="fit-parts">
      <small className="note">Pièces qui vont sur {device} :</small>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {list.map((m) => {
          const e = m.evidence ? evidenceText(m.evidence) : null;
          return (
            <Button key={m.product.id} variant={chosen.includes(m.product.id) ? "default" : "outline"} className="h-auto min-h-9 rounded-2xl px-3 py-1 text-left" onClick={() => onPick(m.product)}>
              <span style={{ display: "grid" }}>
                <span>{m.product.name}</span>
                <small style={{ fontWeight: 400 }}>
                  {m.product.stock > 0 ? `${m.product.stock} en stock` : `à acheter${m.product.cost !== undefined ? ` · ${money(m.product.cost)}` : ""}`}
                  {e ? ` · ${DOT[e.level]} ${e.text}` : ""}
                </small>
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}

const STEPS = ["Le client", "L'appareil", "La panne", "La pièce à poser", "Le prix", "L'avance", "Vérifie et enregistre"];
const PANNES = ["Écran cassé", "Batterie", "Ne charge pas", "Ne s'allume pas", "Tombé dans l'eau", "Son / micro", "Caméra", "Décodage / logiciel", "Boutons"];

/**
 * Atelier : le carnet de réparations.
 * Dépôt (client, téléphone, appareil, panne, prix, avance) → Réparé (pièces prises dans le stock) → Rendu (le client paie le reste,
 * ou le reste va en dette). Bénéfice = prix − prix d'achat des pièces.
 */
export function Atelier({ shop, commit }: { shop: Shop; commit: (s: Shop) => void }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ clientName: "", phone: "", imei: "", device: "", problem: "", price: "", advance: "", piece: "", labor: "" });
  const autoDevice = useRef("");
  const imeiInfo = useImeiModel(form.imei, (label) =>
    setForm((f) => {
      // On ne remplace jamais un appareil écrit à la main.
      if (f.device.trim() && f.device !== autoDevice.current) return f;
      autoDevice.current = label;
      return { ...f, device: label };
    }),
  );
  const [open, setOpen] = useState<string | null>(null);
  const [partQuery, setPartQuery] = useState("");
  const [picked, setPicked] = useState<Product | null>(null);
  // Dépôt pas à pas (16/11/2026, demande de Fallou : « ça passe, ça passe, tu cliques OK et ça calcule ») :
  // une question par écran ; la pièce est obligatoire (une pièce ou « Pas de pièce ») pour que le bénéfice soit juste.
  const [step, setStep] = useState(0);
  const [noPart, setNoPart] = useState(false);
  const [filter, setFilter] = useState<"cours" | "rendu">("cours");
  const list = repairsOf(shop).filter((r) => (filter === "cours" ? r.status === "depot" || r.status === "repare" : r.status === "rendu"));
  const waiting = repairsOf(shop).filter((r) => r.status === "depot" || r.status === "repare");
  const owed = waiting.reduce((a, r) => a + remaining(r), 0);
  const month = workshopMonth(shop);
  // Commande automatique : ce que Jokko conseille d'acheter (dépôts, stock bas, pièces qui partent vite).
  const ready = shop.products.length ? orderPlan(shop).ready : [];
  // Calcul du prix : pièce + main-d'œuvre = prix pour le client (ou prix − pièce = main-d'œuvre).
  const piece = n(form.piece);
  const labor = n(form.labor);
  const typedPrice = n(form.price);
  const price = typedPrice || (piece || labor ? piece + labor : 0);
  // Client qui revient : même numéro ou même nom → sa fiche (visites, appareils, garantie, dette).
  const known = adding ? knownClient(shop, form.clientName, form.phone) : undefined;
  const knownFile = known ? clientFile(shop, known) : undefined;

  function pickPart(p: Product) {
    setPicked(p);
    setNoPart(false);
    setPartQuery("");
    // Main-d'œuvre : celle du prix de vente de la pièce, sinon celle que tu prends d'habitude (prix conseillé).
    const sp = p.price > 0 && p.cost !== undefined ? { labor: p.price - p.cost } : suggestedPrice(p, laborStats(shop));
    setForm((f) => ({
      ...f,
      ...(p.cost !== undefined ? { piece: String(p.cost) } : {}),
      ...(!f.labor && !f.price && sp && sp.labor > 0 ? { labor: String(sp.labor) } : {}),
    }));
  }
  const stepOk = [form.clientName.trim().length > 0, form.device.trim().length > 0, form.problem.trim().length > 0, Boolean(picked) || noPart, true, true, true][step];
  function closeWizard() {
    setAdding(false);
    setStep(0);
    setNoPart(false);
  }

  function save() {
    if (!form.clientName.trim() || !form.device.trim()) return;
    // La pièce choisie est écrite dans la panne : on la retrouve au moment de « Réparé ».
    const problem = picked ? [form.problem.trim(), picked.name].filter(Boolean).join(" · ") : form.problem;
    const { shop: next } = addRepair(shop, { ...form, problem, price, advance: n(form.advance) });
    commit(next);
    // Réseau Jokko : cet IMEI = cet appareil (8 premiers chiffres seulement), appris pour tous les ateliers.
    const tac = tacOf(form.imei);
    const key = mainModelKey(form.device);
    if (tac && key && !imeiLooksWrong(form.imei) && (imeiInfo?.state === "inconnu" || form.device !== autoDevice.current)) compatTacLearn(shop.id, tac, key, form.device.trim());
    autoDevice.current = "";
    setForm({ clientName: "", phone: "", imei: "", device: "", problem: "", price: "", advance: "", piece: "", labor: "" });
    setPicked(null);
    setPartQuery("");
    closeWizard();
  }

  const phone = usePhone();
  const commandes = shop.products.length > 0 ? (
    <Drill id="commande" title="Commande au fournisseur" icon="stock" summary={ready.length ? `Commande prête : ${ready.length} pièce${ready.length > 1 ? "s" : ""} à acheter` : "Rien à commander pour le moment"} badge={ready.length ? 1 : 0}>
      <Commandes shop={shop} commit={commit} />
    </Drill>
  ) : null;
  return (
    <section className="sheet">
      <DrillOverview>
      <div className="sheet-head">
        <h2>Atelier · réparations</h2>
        <b className="num sheet-total">{waiting.length} en cours</b>
      </div>
      <p className="note">
        {waiting.length ? `Reste à encaisser sur les appareils au dépôt : ${money(owed)}.` : "Aucun appareil au dépôt."} Tu peux aussi le dire à Jokko : « Awa dépose un iPhone 11, écran cassé, 25 000, avance 5 000 ».
      </p>
      </DrillOverview>
      <DrillList>
      <Drill id="mois" title="L'atelier ce mois-ci" icon="rapport" summary={`${month.done} rendue${month.done > 1 ? "s" : ""} · main-d'œuvre ${money(month.labor)}`}>
      <div className="kpis atelier-month" aria-label="L'atelier ce mois-ci">
        <article><span>Rendues ce mois</span><b className="num">{month.done}</b></article>
        <article><span>Encaissé</span><b className="num">{money(month.revenue)}</b></article>
        <article><span>Pièces</span><b className="num">− {money(month.parts)}</b></article>
        <article className="kpi-main" data-tone={month.labor < 0 ? "bad" : "good"}><span>Main-d'œuvre gagnée ce mois</span><b className="num">{money(month.labor)}</b></article>
      </div>
      </Drill>
      {!phone && ready.length > 0 && (
        <p className="note jk-notice" role="status">
          Commande prête : {ready.length} pièce{ready.length > 1 ? "s" : ""} à acheter ({ready.slice(0, 2).map((r) => r.name).join(", ")}{ready.length > 2 ? "…" : ""}).{" "}
          <a className="link" href="#commande">Voir et envoyer</a>
        </p>
      )}
      {shop.products.length > 0 && (
        <Drill id="piece" title="Un client demande une pièce ?" icon="scanner" summary="Cherche par modèle (BF6, Spark 10…) ou par IMEI">
          <PartLookup shop={shop} commit={commit} />
        </Drill>
      )}
      {phone && commandes}
      </DrillList>
      <DrillOverview>
      <div className="list-bar">
        <Button className="h-11 rounded-full px-5" onClick={() => (adding ? closeWizard() : (setStep(0), setAdding(true)))}>
          <Icon name="ajouter" size="sm" /> Nouveau dépôt
        </Button>
        <div className="seg" role="tablist" aria-label="Réparations à montrer">
          <button type="button" role="tab" aria-selected={filter === "cours"} className={filter === "cours" ? "on" : ""} onClick={() => setFilter("cours")}>En cours</button>
          <button type="button" role="tab" aria-selected={filter === "rendu"} className={filter === "rendu" ? "on" : ""} onClick={() => setFilter("rendu")}>Rendus</button>
        </div>
      </div>

      {adding && (
        <div className={`wizard${noPart ? " no-part" : ""}`} role="group" aria-label="Nouveau dépôt">
          <div className="wizard-head">
            <small>Étape {step + 1} sur {STEPS.length}</small>
            <b>{STEPS[step]}</b>
            <span className="wizard-bar" aria-hidden="true"><i style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></span>
          </div>

          {step === 0 && (
            <div className="wizard-body">
              <Input className="h-12" autoFocus placeholder="Nom du client" aria-label="Nom du client" value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
              <Input className="h-12" inputMode="tel" placeholder="Téléphone du client (77 …)" aria-label="Téléphone du client" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              {knownFile && (
                <div className={`known-client${knownFile.late ? " is-late" : ""}`} role="status">
                  <b>Client connu : {knownFile.client.name}</b>
                  <small>
                    {knownFile.visits} visite{knownFile.visits > 1 ? "s" : ""} · {money(knownFile.spent)} dépensés
                    {knownFile.entries[0] ? ` · dernière fois le ${new Date(knownFile.entries[0].at).toLocaleDateString("fr-FR")} : ${knownFile.entries[0].title}${knownFile.entries[0].detail ? ` (${knownFile.entries[0].detail})` : ""}` : ""}
                  </small>
                  {knownFile.underWarranty.length > 0 && <small>Sous garantie : {knownFile.underWarranty.map((r) => `${r.number} ${r.device}`).join(", ")}</small>}
                  {(knownFile.debt > 0 || knownFile.owedRepairs > 0) && <small>Il doit encore {money(knownFile.debt + knownFile.owedRepairs)}{knownFile.late ? " (en retard)" : ""}.</small>}
                  {!form.phone && knownFile.client.phone && (
                    <button type="button" className="link" onClick={() => setForm({ ...form, clientName: knownFile.client.name, phone: knownFile.client.phone })}>Reprendre son numéro ({knownFile.client.phone})</button>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="wizard-body">
              <Input className="h-11 num" inputMode="numeric" placeholder="IMEI (facultatif : tape *#06# sur le téléphone)" aria-label="IMEI de l'appareil" value={form.imei} onChange={(e) => setForm({ ...form, imei: e.target.value })} />
              {imeiInfo && (
                <small className={`note${imeiInfo.state === "faux" || imeiInfo.state === "inconnu" ? " is-late" : ""}`} role="status">
                  {imeiInfo.state === "cherche" && "Je cherche le modèle…"}
                  {imeiInfo.state === "trouve" && `📱 ${imeiInfo.label} (${imeiInfo.from === "atelier" ? "appris par les ateliers Jokko" : "base publique, vérifie sur le téléphone"})`}
                  {imeiInfo.state === "inconnu" && "IMEI pas encore connu : écris l'appareil, Jokko l'apprendra pour tous les ateliers."}
                  {imeiInfo.state === "faux" && "Cet IMEI semble mal recopié : vérifie les 15 chiffres."}
                </small>
              )}
              <Input className="h-12" placeholder="Appareil (iPhone 11, Tecno Spark 10…)" aria-label="Appareil" value={form.device} onChange={(e) => setForm({ ...form, device: e.target.value })} />
            </div>
          )}

          {step === 2 && (
            <div className="wizard-body">
              <div className="wizard-chips">
                {PANNES.map((p) => {
                  const on = form.problem.split(", ").includes(p);
                  return (
                    <button key={p} type="button" className={on ? "on" : ""} aria-pressed={on} onClick={() => {
                      const list = form.problem.split(", ").filter(Boolean);
                      setForm({ ...form, problem: (on ? list.filter((x) => x !== p) : [...list, p]).join(", ") });
                    }}>{p}</button>
                  );
                })}
              </div>
              <Input className="h-12" placeholder="Ou écris la panne" aria-label="Panne" value={form.problem} onChange={(e) => setForm({ ...form, problem: e.target.value })} />
            </div>
          )}

          {step === 3 && (
            <div className="wizard-body">
              {picked ? (
                <p className="wizard-picked" role="status">
                  <Icon name="ok" size="sm" />
                  <span><b>{picked.name}</b>{picked.cost !== undefined ? ` · prix d'achat ${money(picked.cost)}` : " · prix d'achat à taper à l'étape suivante"}</span>
                  <button type="button" className="link" onClick={() => setPicked(null)}>Changer</button>
                </p>
              ) : noPart ? (
                <p className="wizard-picked" role="status">
                  <Icon name="ok" size="sm" />
                  <span><b>Pas de pièce</b> · tout le prix est ta main-d'œuvre</span>
                  <button type="button" className="link" onClick={() => setNoPart(false)}>Changer</button>
                </p>
              ) : (
                <>
                  {form.device.trim() && <FitParts shop={shop} device={form.device} problem={form.problem} chosen={[]} onPick={pickPart} />}
                  {shop.products.length > 0 && (
                    <PartPicker products={shop.products} query={partQuery} setQuery={setPartQuery} label="Cherche la pièce (BF6, iPhone 11, batterie KF6…)" onPick={pickPart} />
                  )}
                  <Button variant="outline" className="h-11 rounded-full" onClick={() => { setNoPart(true); setForm({ ...form, piece: "" }); }}>
                    Pas de pièce (décodage, logiciel, nettoyage…)
                  </Button>
                </>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="wizard-body">
              <div className="repair-price">
                <label>
                  <small>Prix d'achat de la pièce</small>
                  <Input className="h-11" inputMode="numeric" placeholder="ex. 5 000" aria-label="Prix d'achat de la pièce" value={form.piece} onChange={(e) => setForm({ ...form, piece: e.target.value })} />
                </label>
                <span aria-hidden="true">+</span>
                <label>
                  <small>Main-d'œuvre</small>
                  <Input className="h-11" inputMode="numeric" placeholder="ex. 10 000" aria-label="Main-d'œuvre" value={form.labor} onChange={(e) => setForm({ ...form, labor: e.target.value })} />
                </label>
                <span aria-hidden="true">=</span>
                <label>
                  <small>Prix pour le client</small>
                  <Input className="h-11" inputMode="numeric" placeholder={piece || labor ? String(piece + labor) : "vide si pas fixé"} aria-label="Prix pour le client" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
                </label>
              </div>
              {price > 0 && (
                <p className="repair-calc">
                  Prix pour le client <b>{money(price)}</b>
                  {piece ? <> − pièce {money(piece)} = ta main-d'œuvre <b>{money(price - piece)}</b></> : null}
                  {piece && price - piece < 0 ? " : attention, tu perds de l'argent." : ""}
                  {piece ? " Tu noteras la pièce quand tu la poses (bouton « Réparé »)." : ""}
                </p>
              )}
            </div>
          )}

          {step === 5 && (
            <div className="wizard-body">
              <Input className="h-12 num" inputMode="numeric" autoFocus placeholder="Avance payée maintenant (F)" aria-label="Avance" value={form.advance} onChange={(e) => setForm({ ...form, advance: e.target.value })} />
              {price > 0 && (
                <div className="wizard-chips">
                  {[0, Math.round(price / 2 / 500) * 500, price].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
                    <button key={v} type="button" className={n(form.advance) === v ? "on" : ""} onClick={() => setForm({ ...form, advance: v ? String(v) : "" })}>
                      {v === 0 ? "Rien pour le moment" : v === price ? `Tout (${money(v)})` : `La moitié (${money(v)})`}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 6 && (
            <div className="wizard-body">
              <dl className="wizard-recap">
                <div><dt>Client</dt><dd>{form.clientName}{form.phone ? ` · ${form.phone}` : ""}</dd></div>
                <div><dt>Appareil</dt><dd>{form.device}{form.imei ? ` · IMEI ${form.imei}` : ""}</dd></div>
                <div><dt>Panne</dt><dd>{form.problem || "—"}</dd></div>
                <div><dt>Pièce</dt><dd>{picked ? `${picked.name} · ${money(piece)}` : "Pas de pièce"}</dd></div>
                <div><dt>Prix pour le client</dt><dd className="num">{price ? money(price) : "pas encore fixé"}</dd></div>
                {price > 0 && <div><dt>Ta main-d'œuvre</dt><dd className="num" data-tone={price - piece < 0 ? "bad" : "good"}>{money(price - piece)}</dd></div>}
                <div><dt>Avance</dt><dd className="num">{money(n(form.advance))}{price ? ` · reste ${money(Math.max(0, price - n(form.advance)))}` : ""}</dd></div>
              </dl>
              {price > 0 && price - piece < 0 && <p className="note" data-tone="error">Attention : la pièce coûte plus que le prix. Tu perds {money(piece - price)}.</p>}
            </div>
          )}

          <div className="wizard-nav">
            <Button variant="outline" className="h-12 rounded-full px-5" onClick={() => (step ? setStep(step - 1) : closeWizard())}>
              <Icon name="retour" size="sm" /> {step ? "Retour" : "Annuler"}
            </Button>
            {step < STEPS.length - 1 ? (
              <Button className="h-12 rounded-full px-6" disabled={!stepOk} onClick={() => setStep(step + 1)}>
                Suivant <Icon name="suivant" size="sm" />
              </Button>
            ) : (
              <Button className="h-12 rounded-full px-6" onClick={save}>
                <Icon name="ok" size="sm" /> OK, enregistrer
              </Button>
            )}
          </div>
          {!stepOk && step === 3 && <small className="note">Choisis la pièce à poser, ou « Pas de pièce » : la pièce comptera dans ton bénéfice.</small>}
        </div>
      )}

      {!adding && <div className="list">
        {list.length === 0 && <p className="note">{filter === "cours" ? "Rien en cours." : "Aucune réparation rendue."}</p>}
        {list.map((r) => (
          <RepairRow key={r.id} r={r} shop={shop} commit={commit} open={open === r.id} toggle={() => setOpen(open === r.id ? null : r.id)} />
        ))}
      </div>}
      </DrillOverview>
      {!phone && commandes}
    </section>
  );
}

function RepairRow({ r, shop, commit, open, toggle }: { r: Repair; shop: Shop; commit: (s: Shop) => void; open: boolean; toggle: () => void }) {
  // Pièce choisie au dépôt (écrite dans la panne) : déjà mise dans les pièces posées (16/11/2026 : R-005 et R-006
  // marquées « Réparé » sans pièce → 19 000 F comptés en main-d'œuvre, les écrans oubliés dans le bénéfice).
  const planned = r.status === "depot" ? productNamedIn(shop.products, r.problem) : undefined;
  const [parts, setParts] = useState<string[]>(() => (planned ? [planned.id] : []));
  const [bare, setBare] = useState(false);
  const [bought, setBought] = useState<Array<{ label: string; cost: number }>>([]);
  const [buyName, setBuyName] = useState("");
  const [buyCost, setBuyCost] = useState("");
  const [source, setSource] = useState<CashSource | "">("");
  const [pay, setPay] = useState("");
  const [price, setPrice] = useState(r.price ? String(r.price) : "");
  // La pièce choisie au dépôt (écrite dans la panne) est déjà cherchée.
  const [partQuery, setPartQuery] = useState("");
  const days = waitingDays(r);
  // Pièce de ta liste (même à stock 0, stock pas encore compté) : posée, son prix d'achat compte, le stock ne descend jamais sous 0.
  function pick(p: Product) {
    setPartQuery("");
    setBare(false);
    if (!parts.includes(p.id)) setParts([...parts, p.id]);
  }
  const [fix, setFix] = useState<0 | 1 | 2>(0);
  const chosen = parts.map((id) => shop.products.find((p) => p.id === id)).filter((p): p is Product => Boolean(p));
  const boughtTotal = bought.reduce((a, b) => a + b.cost, 0);
  const labor = r.price - boughtTotal - chosen.reduce((a, p) => a + (p.cost ?? 0), 0);
  const rest = remaining(r);
  const ready = r.status === "repare";
  const notify = r.phone
    ? whatsappLink(r.phone, `Salaam ${r.clientName}, sa ${r.device} paré na (ticket ${r.number}). ${rest ? `Reste à payer : ${money(rest)}.` : ""} ${shop.name}`.trim())
    : null;

  return (
    <article className={days > 30 && r.status !== "rendu" ? "is-late" : ""}>
      <span onClick={toggle} style={{ cursor: "pointer" }}>
        <span className="row-title"><b>{r.number}</b> · {r.clientName} · {r.device}</span>
        <small>
          {STATUS[r.status]}
          {r.problem ? ` · ${r.problem}` : ""}
          {r.status !== "rendu" ? ` · depuis ${days} j` : r.returnedAt ? ` · rendu le ${new Date(r.returnedAt).toLocaleDateString("fr-FR")}` : ""}
          {underWarranty(r) ? " · sous garantie" : ""}
          {r.imei ? ` · IMEI ${r.imei}` : ""}
        </small>
      </span>
      <div className="debt-actions">
        <b className="num">{r.price ? money(r.price) : "Prix ?"}</b>
        {rest > 0 && <small className="note">reste {money(rest)}</small>}
      </div>
      {open && (
        <div style={{ display: "grid", gap: 8, width: "100%", marginTop: 8 }}>
          {r.status !== "rendu" && (
            <div style={{ display: "flex", gap: 8 }}>
              <Input className="h-10" inputMode="numeric" placeholder="Prix (F)" aria-label="Prix de la réparation" value={price} onChange={(e) => setPrice(e.target.value)} />
              <Button variant="outline" className="h-10 rounded-full px-3" onClick={() => commit(setRepairPrice(shop, r.id, n(price)))}>Fixer le prix</Button>
            </div>
          )}
          {r.status === "depot" && fix === 0 && (
            <Button className="h-11 rounded-full" onClick={() => setFix(1)}>
              <Icon name="reparation" size="sm" /> Réparé…
            </Button>
          )}
          {r.status === "depot" && fix > 0 && (
            <div className="wizard wizard-inline" role="group" aria-label="Réparé">
              <div className="wizard-head">
                <small>Réparé · étape {fix} sur 2</small>
                <b>{fix === 1 ? "Quelle pièce as-tu posée ?" : "Vérifie et confirme"}</b>
                <span className="wizard-bar" aria-hidden="true"><i style={{ width: `${fix * 50}%` }} /></span>
              </div>

              {fix === 1 && (
                <div className="wizard-body">
                  {chosen.length > 0 && (
                    <div className="wizard-chips">
                      {chosen.map((p) => (
                        <button key={p.id} type="button" className="on" onClick={() => setParts(parts.filter((x) => x !== p.id))}>
                          ✓ {p.name}{p.cost !== undefined ? ` (${money(p.cost)})` : ""}{planned?.id === p.id ? " · prévue au dépôt" : ""} ✕
                        </button>
                      ))}
                    </div>
                  )}
                  {bought.length > 0 && (
                    <div className="wizard-chips">
                      {bought.map((b, i) => (
                        <button key={i} type="button" className="on" onClick={() => setBought(bought.filter((_, j) => j !== i))}>✓ {b.label} ({money(b.cost)}) · achetée exprès ✕</button>
                      ))}
                    </div>
                  )}
                  <FitParts shop={shop} device={r.device} problem={r.problem} chosen={parts} onPick={pick} />
                  <PartPicker products={shop.products} query={partQuery} setQuery={setPartQuery} label="Cherche une autre pièce (BF6, iPhone 11…)" onPick={pick} />
                  <details className="repair-buy-more">
                    <summary>Pièce achetée exprès (pas dans ta liste)</summary>
                    <div className="repair-buy">
                      <Input className="h-10" placeholder="Pièce (écran, batterie…)" aria-label="Pièce achetée" value={buyName} onChange={(e) => setBuyName(e.target.value)} />
                      <Input className="h-10" inputMode="numeric" placeholder="Prix d'achat (F)" aria-label="Prix d'achat de la pièce" value={buyCost} onChange={(e) => setBuyCost(e.target.value)} />
                      <Button variant="outline" className="h-10 rounded-full px-3" disabled={!buyName.trim() || !n(buyCost)} onClick={() => { setBought([...bought, { label: buyName.trim(), cost: n(buyCost) }]); setBuyName(""); setBuyCost(""); setBare(false); }}>
                        <Icon name="ajouter" size="sm" /> Ajouter
                      </Button>
                    </div>
                  </details>
                  {!chosen.length && !bought.length && (
                    <Button variant={bare ? "default" : "outline"} className="h-11 rounded-full" onClick={() => setBare(!bare)}>
                      {bare ? "✓ " : ""}Aucune pièce (décodage, logiciel, nettoyage…)
                    </Button>
                  )}
                </div>
              )}

              {fix === 2 && (
                <div className="wizard-body">
                  <dl className="wizard-recap">
                    <div><dt>Prix pour le client</dt><dd className="num">{r.price ? money(r.price) : "pas encore fixé"}</dd></div>
                    {chosen.map((p) => <div key={p.id}><dt>{p.name}</dt><dd className="num">− {money(p.cost ?? 0)}</dd></div>)}
                    {bought.map((b, i) => <div key={i}><dt>{b.label} (achetée exprès)</dt><dd className="num">− {money(b.cost)}</dd></div>)}
                    {!chosen.length && !bought.length && <div><dt>Pièce</dt><dd>Aucune</dd></div>}
                    {r.price > 0 && <div><dt>Main-d'œuvre gagnée</dt><dd className="num" data-tone={labor < 0 ? "bad" : "good"}>{money(labor)}</dd></div>}
                  </dl>
                  {r.price > 0 && labor < 0 && <p className="note" data-tone="error">Attention : les pièces coûtent plus que le prix. Tu perds {money(-labor)}.</p>}
                  {bought.length > 0 && (
                    <CashSourcePicker title="La pièce achetée, tu l'as payée comment ?" amount={boughtTotal} value={source || defaultCashSource(boughtTotal)} onChange={setSource} />
                  )}
                </div>
              )}

              <div className="wizard-nav">
                <Button variant="outline" className="h-12 rounded-full px-5" onClick={() => setFix(fix === 2 ? 1 : 0)}>
                  <Icon name="retour" size="sm" /> {fix === 2 ? "Retour" : "Annuler"}
                </Button>
                {fix === 1 ? (
                  <Button className="h-12 rounded-full px-6" disabled={!chosen.length && !bought.length && !bare} onClick={() => setFix(2)}>
                    Suivant <Icon name="suivant" size="sm" />
                  </Button>
                ) : (
                  <Button
                    className="h-12 rounded-full px-6"
                    disabled={bought.length > 0 && !(source || defaultCashSource(boughtTotal))}
                    onClick={() => {
                      const paidWith = source || defaultCashSource(boughtTotal) || undefined;
                      const inputs: PartInput[] = [...parts.map((id) => ({ productId: id })), ...bought.map((b) => ({ label: b.label, cost: b.cost, paidWith }))];
                      const next = markRepaired(shop, r.id, inputs);
                      if (next) commit(next);
                    }}
                  >
                    <Icon name="ok" size="sm" /> OK, réparé
                  </Button>
                )}
              </div>
              {fix === 1 && !chosen.length && !bought.length && !bare && <small className="note">Choisis la pièce posée, ou « Aucune pièce » : la pièce compte dans ton bénéfice.</small>}
            </div>
          )}
          {r.parts.length > 0 && (
            <small className="note">
              Pièces : {r.parts.map((p) => `${p.label} (${money(p.cost)})`).join(", ")} · total {money(partsCost(r))}
            </small>
          )}
          {fix === 0 && <Breakdown r={r} />}
          {r.status !== "rendu" && fix === 0 && (
            <>
              {r.price > 0 && rest === 0 ? (
                <p className="note jk-notice" data-tone="ok"><Icon name="ok" size="sm" /><span>Déjà tout payé ({money(r.paid)}) : rien à encaisser au rendu.</span></p>
              ) : (
                <Input className="h-10" inputMode="numeric" placeholder={rest ? `Payé maintenant (reste ${money(rest)})` : "Payé maintenant (F)"} aria-label="Payé maintenant" value={pay} onChange={(e) => setPay(e.target.value)} />
              )}
              {r.price > 0 && n(pay) > rest && rest > 0 && (
                <p className="note" data-tone="error">Le client a déjà payé {money(r.paid)} : il ne reste que {money(rest)}. « Rendu » encaisse seulement {money(rest)}.</p>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {!(r.price > 0 && rest === 0) && (
                  <Button variant="outline" className="h-10 rounded-full px-3" disabled={!n(pay) || (r.price > 0 && n(pay) > rest)} onClick={() => { const next = payRepair(shop, r.id, n(pay)); if (next) { commit(next); setPay(""); } }}>
                    Acompte
                  </Button>
                )}
                <Button className="h-10 rounded-full px-3" onClick={() => { const next = deliverRepair(shop, r.id, r.price > 0 && rest === 0 ? 0 : n(pay), true); if (next) { commit(next); setPay(""); } }}>
                  <Icon name="ok" size="sm" /> Rendu au client{rest - n(pay) > 0 ? " (reste en dette)" : ""}
                </Button>
                {r.price > 0 && n(pay) > rest && (
                  <Button variant="outline" className="h-10 rounded-full px-3" onClick={() => { const next = deliverRepair(shop, r.id, n(pay), true, true); if (next) { commit(next); setPay(""); } }}>
                    Le prix passe à {money(r.paid + n(pay))}
                  </Button>
                )}
                {notify && ready && (
                  <Button variant="outline" className="h-10 rounded-full px-3" onClick={() => window.open(notify, "_blank", "noopener")}>
                    <Icon name="whatsapp" size="sm" /> Prévenir : c'est prêt
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </article>
  );
}
