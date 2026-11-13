import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Product, type Shop, type Supplier, money, uid } from "@/model";
import { searchProducts } from "@/data/partSearch";
import { addToOrder, changeLine, orderMessage, orderPlan, receiveOrder, shareOnWhatsapp } from "@/data/reorder";
import { whatsappLink } from "@/data/debts";
import { laborStats, suggestedPrice } from "@/data/pricing";
import { evidenceText, type NetLink, sameParts, stockFor } from "@/data/compat";
import { modelKeys, tacOf } from "@/data/modelKeys";
import { expandKeys, modelOfTac, nameOf, type Names, sameNames } from "@/data/phoneBook";
import { compatLearn, compatLookup, compatTacLearn, compatTacLookup } from "@/data/supabase";

const cap = (s: string) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

type Phone = { label: string; from: "base" | "atelier" };
type Net = { keys: string[]; links: NetLink[]; phone: Phone | null; tac: string | null; names: Names | null; online: boolean };

const DOT: Record<string, string> = { pose: "🟢", fournisseur: "🔵", atelier: "🟡" };

/**
 * « Un client demande une pièce ? » : on tape le modèle (BF6, Spark 10) ou l'IMEI (*#06#). Jokko dit si la pièce est en stock,
 * montre les écrans universels qui vont dessus, d'après le stock ET le réseau Jokko des pièces (base commune des réparateurs),
 * et met à la commande ce qui manque. Chaque réponse du réseau dit sa preuve (posé, fournisseur, dit par un atelier).
 */
export function PartLookup({ shop, commit }: { shop: Shop; commit: (s: Shop) => void }) {
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [net, setNet] = useState<Net | null>(null);
  const [teach, setTeach] = useState("");
  const [teachKind, setTeachKind] = useState<"Écran" | "Batterie">("Écran");
  const [tacModel, setTacModel] = useState("");
  const q = query.trim();
  const tac = tacOf(q);

  useEffect(() => {
    setNet(null);
    if (q.length < 2) return;
    let stop = false;
    const timer = window.setTimeout(async () => {
      const names = await sameNames();
      let phone: Phone | null = null;
      let keys = tac ? [] : modelKeys(q);
      if (tac) {
        const learned = await compatTacLookup(tac);
        if (learned[0]) {
          phone = { label: learned[0].label, from: "atelier" };
          keys = [learned[0].model, ...modelKeys(learned[0].label)];
        } else {
          const found = await modelOfTac(tac);
          if (found) {
            phone = { label: found.label, from: "base" };
            keys = found.keys;
          }
        }
      }
      keys = expandKeys([...new Set(keys)], names);
      const links = keys.length && navigator.onLine !== false ? await compatLookup(keys) : [];
      if (!stop) setNet({ keys, links, phone, tac, names, online: navigator.onLine !== false });
    }, 450);
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [q, tac]);

  // Stock : recherche par le texte tapé, plus les pièces qui vont sur le modèle (directement ou d'après le réseau).
  const fromText = !tac && q.length >= 2 ? searchProducts(shop.products, q, 8) : [];
  const fromKeys = net ? net.keys.flatMap((k) => searchProducts(shop.products, k, 4)) : [];
  const network = net ? stockFor(shop.products, net.keys, net.links) : [];
  const seen = new Set<string>();
  const hits: Array<{ product: Product; via?: string; proof?: string }> = [];
  for (const h of [...fromText, ...fromKeys]) {
    if (seen.has(h.product.id)) continue;
    seen.add(h.product.id);
    hits.push({ product: h.product, ...(h.via ? { via: h.via } : {}) });
  }
  for (const m of network) {
    if (seen.has(m.product.id) || !m.evidence) continue;
    seen.add(m.product.id);
    const e = evidenceText(m.evidence);
    hits.push({ product: m.product, proof: `${DOT[e.level]} même ${m.kind.toLowerCase()} que ${net?.names ? nameOf(m.through, net.names) : m.through.toUpperCase()} (${e.text})` });
  }
  hits.sort((a, b) => Number(b.product.stock > 0) - Number(a.product.stock > 0));
  const shown = hits.slice(0, 10);
  const anyInStock = shown.some((h) => h.product.stock > 0);
  const stats = shown.length ? laborStats(shop) : null;
  const same = net ? sameParts(net.links) : [];
  const mainKey = net?.keys[0] ?? modelKeys(q)[0];

  function order(p: Product | null) {
    commit(addToOrder(shop, p ? { name: p.name, productId: p.id, why: "recherche" } : { name: cap(q), why: "recherche" }));
    setNote(`✓ ${p ? p.name : cap(q)} ajouté à la commande.`);
  }

  async function learn() {
    const other = modelKeys(teach);
    if (!mainKey || !other.length) return setNote("Écris le modèle d'un téléphone qui a la même pièce (ex. BF7).");
    const ok = await compatLearn(shop.id, [{ kind: teachKind, source: "atelier", models: [...new Set([...(net?.keys ?? [mainKey]).slice(0, 4), ...other])] }]);
    setNote(ok ? `✓ Merci : le réseau Jokko sait maintenant que ${mainKey.toUpperCase()} et ${other[0]!.toUpperCase()} ont le même ${teachKind.toLowerCase()} (à vérifier par une pose).` : "Pas de connexion : réessaie plus tard.");
    setTeach("");
  }

  function learnTac() {
    const keys = modelKeys(tacModel);
    if (!tac || !keys.length) return setNote("Écris le modèle du téléphone (ex. BF6 ou Spark 10).");
    compatTacLearn(shop.id, tac, keys[0]!, cap(tacModel));
    setNote(`✓ Noté : cet IMEI = ${cap(tacModel)}. Les autres ateliers Jokko le reconnaîtront aussi.`);
    setQuery(tacModel);
    setTacModel("");
  }

  return (
    <section className="part-lookup" aria-label="Un client demande une pièce">
      <h3>Un client demande une pièce ?</h3>
      <Input className="h-11" placeholder="Modèle (BF6, Spark 10…) ou IMEI (tape *#06#)" aria-label="Chercher une pièce pour un client" value={query} onChange={(e) => { setQuery(e.target.value); setNote(""); }} />
      {tac && net && (
        net.phone ? (
          <p className="note" role="status">📱 <b>{net.phone.label}</b> <small>({net.phone.from === "atelier" ? "appris par les ateliers Jokko" : "base publique des IMEI, à vérifier sur le téléphone"})</small></p>
        ) : (
          <div className="part-missing" role="status">
            <p className="note is-late">IMEI pas encore connu. Regarde le modèle dans Paramètres → À propos du téléphone, puis apprends-le à Jokko :</p>
            <div className="row">
              <Input className="h-10" style={{ maxWidth: 180 }} placeholder="Modèle (ex. BF6)" aria-label="Modèle de ce téléphone" value={tacModel} onChange={(e) => setTacModel(e.target.value)} />
              <Button className="h-10 rounded-full px-4" onClick={learnTac}>Apprendre</Button>
            </div>
          </div>
        )
      )}
      {q.length >= 2 && !(tac && !net?.phone) && (
        <>
          {shown.length > 0 ? (
            <>
              <p className={`note${anyInStock ? "" : " is-late"}`} role="status">
                {anyInStock ? "Disponible :" : "Rien en stock pour ce modèle. Tu peux la commander :"}
              </p>
              <ul className="lookup-hits">
                {shown.map((h) => (
                  <li key={h.product.id} className={h.product.stock > 0 ? "in-stock" : ""}>
                    <div>
                      <b>{h.product.name}</b>
                      <small>
                        {h.product.stock > 0 ? `${h.product.stock} en stock` : "pas en stock"}
                        {h.via ? ` · écran qui va aussi sur ${h.via}` : ""}
                        {h.product.cost !== undefined ? ` · achat ${money(h.product.cost)}` : ""}
                        {h.product.price ? ` · prix client ${money(h.product.price)}` : (() => { const sp = stats && suggestedPrice(h.product, stats); return sp ? ` · prix conseillé ${money(sp.price)}` : ""; })()}
                      </small>
                      {h.proof && <small>{h.proof}</small>}
                    </div>
                    {h.product.stock <= 0 && (
                      <Button variant="outline" className="h-9 rounded-full px-3" onClick={() => order(h.product)}>À commander</Button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            !tac && (
              <div className="part-missing" role="status">
                <p className="note is-late">« {cap(q)} » n'est pas dans ta liste de pièces.</p>
                <div className="row">
                  <Button className="h-10 rounded-full px-4" onClick={() => order(null)}><Icon name="ajouter" size="sm" /> À commander</Button>
                  <Button
                    variant="outline"
                    className="h-10 rounded-full px-4"
                    onClick={() => {
                      commit({ ...shop, products: [...shop.products, { id: uid("p"), name: cap(q), unit: "pièce", stock: 0, min: 0, price: 0 }] });
                      setNote(`✓ ${cap(q)} ajouté à ton stock (stock 0). Mets son prix d'achat dans Stock.`);
                    }}
                  >
                    Créer la pièce
                  </Button>
                </div>
              </div>
            )
          )}
          {same.length > 0 && (
            <div className="compat-net">
              <b>Réseau Jokko : même pièce que {net?.names && mainKey ? nameOf(mainKey, net.names) : mainKey?.toUpperCase()}</b>
              {same.map((g) => (
                <p key={g.kind} className="note">
                  <span>{g.kind} : </span>
                  {g.models.slice(0, 8).map((m, i) => {
                    const e = evidenceText(m.evidence);
                    return <span key={m.model} title={e.text}>{i ? ", " : ""}{DOT[e.level]} {net?.names ? nameOf(m.model, net.names) : m.model.toUpperCase()}</span>;
                  })}
                </p>
              ))}
              <small className="note">🟢 posé par des ateliers · 🔵 liste d'un fournisseur · 🟡 dit par un atelier, à vérifier</small>
            </div>
          )}
          {mainKey && net?.online && (
            <div className="compat-teach">
              <small>Tu sais quel téléphone a la même pièce ? Apprends-le au réseau :</small>
              <div className="row">
                <select className="h-10 rounded-md border px-2" aria-label="Type de pièce" value={teachKind} onChange={(e) => setTeachKind(e.target.value as "Écran" | "Batterie")}>
                  <option value="Écran">Écran</option>
                  <option value="Batterie">Batterie</option>
                </select>
                <Input className="h-10" style={{ maxWidth: 160 }} placeholder="Même que… (ex. BF7)" aria-label="Téléphone qui a la même pièce" value={teach} onChange={(e) => setTeach(e.target.value)} />
                <Button variant="outline" className="h-10 rounded-full px-4" onClick={() => void learn()}>Apprendre</Button>
              </div>
            </div>
          )}
        </>
      )}
      {note && <p className="note jk-notice" role="status">{note}</p>}
    </section>
  );
}

/**
 * « Commande prête » : Jokko remplit la commande tout seul (pièces des appareils au dépôt, stock bas, pièces qui partent vite,
 * pièces demandées par les clients) ; le patron ajuste, puis l'envoie à son fournisseur sur WhatsApp en un toucher.
 */
export function Commandes({ shop, commit }: { shop: Shop; commit: (s: Shop) => void }) {
  const plan = orderPlan(shop);
  const suppliers = shop.suppliers ?? [];
  const [open, setOpen] = useState(plan.ready.length > 0);
  const [fromCash, setFromCash] = useState(false);
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "" });
  const text = orderMessage(shop, plan.ready);

  function send(supplier?: Supplier) {
    const link = supplier?.phone ? whatsappLink(supplier.phone, text) : null;
    window.open(link ?? shareOnWhatsapp(text), "_blank", "noopener");
    setNote(supplier ? `Commande envoyée à ${supplier.name} sur WhatsApp. Touche « Commande reçue » quand elle arrive.` : "Choisis ton fournisseur dans WhatsApp.");
  }

  function saveSupplier() {
    const name = form.name.trim();
    const phone = form.phone.replace(/[^\d+]/g, "");
    if (!name || phone.replace(/\D/g, "").length < 9) return;
    commit({ ...shop, suppliers: [...suppliers, { id: uid("f"), name, phone }] });
    setForm({ name: "", phone: "" });
    setAdding(false);
  }

  return (
    <section className="sheet commandes" id="commande">
      <button type="button" className="sheet-head commandes-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <h2>Commande prête</h2>
        <b className="num sheet-total">{plan.ready.length ? `${plan.ready.length} pièce${plan.ready.length > 1 ? "s" : ""} · ${money(plan.total)}` : "rien à commander"}</b>
      </button>
      {!open && plan.ready.length > 0 && <p className="note">Jokko a préparé ta commande. Touche pour la voir et l'envoyer à ton fournisseur.</p>}
      {open && (
        <>
          <p className="note">Jokko la remplit tout seul : pièces des appareils au dépôt, stock bas, pièces qui partent vite, pièces demandées par les clients. Change les quantités, puis envoie.</p>
          {plan.ready.length === 0 ? (
            <p className="note">Rien à commander pour le moment. Cherche une pièce plus haut et touche « À commander » pour l'ajouter.</p>
          ) : (
            <>
              <ul className="order-list">
                {plan.ready.map((o) => (
                  <li key={o.key}>
                    <span>
                      <b>{o.name}</b>
                      <small>{o.reason}{o.cost !== undefined ? ` · ${money(o.cost)} pièce · ${money(o.cost * o.qty)}` : " · prix ?"}</small>
                    </span>
                    <div className="qty-step">
                      <Button variant="outline" className="h-9 w-9 rounded-full p-0" aria-label={`Une de moins : ${o.name}`} onClick={() => commit(changeLine(shop, o, o.qty - 1))}>−</Button>
                      <b className="num">{o.qty}</b>
                      <Button variant="outline" className="h-9 w-9 rounded-full p-0" aria-label={`Une de plus : ${o.name}`} onClick={() => commit(changeLine(shop, o, o.qty + 1))}>+</Button>
                      <button type="button" className="link" onClick={() => commit(changeLine(shop, o, 0))}>{o.line ? "Enlever" : "Pas cette fois"}</button>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="repair-calc">Total estimé au prix de gros : <b>{money(plan.total)}</b></p>
              <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
                {suppliers.map((f) => (
                  <Button key={f.id} className="h-11 rounded-full px-5" onClick={() => send(f)}>
                    <Icon name="whatsapp" size="sm" /> Envoyer à {f.name}
                  </Button>
                ))}
                {suppliers.length === 0 && (
                  <Button className="h-11 rounded-full px-5" onClick={() => send()}>
                    <Icon name="whatsapp" size="sm" /> Envoyer sur WhatsApp
                  </Button>
                )}
                <Button variant="outline" className="h-11 rounded-full px-4" onClick={() => { void navigator.clipboard?.writeText(text); setNote("✓ Commande copiée."); }}>Copier</Button>
              </div>
              <div className="order-receive">
                <label className="row">
                  <input type="checkbox" checked={fromCash} onChange={(e) => setFromCash(e.target.checked)} />
                  <span>Payée avec l'argent de la caisse</span>
                </label>
                <Button
                  variant="outline"
                  className="h-11 rounded-full px-4"
                  onClick={() => {
                    const done = receiveOrder(shop, plan.ready, { fromCash });
                    commit(done.shop);
                    setNote(`✓ Commande reçue : ${done.count} pièce${done.count > 1 ? "s" : ""} ajoutée${done.count > 1 ? "s" : ""} au stock.${fromCash ? " La caisse a baissé du prix de gros." : ""}`);
                  }}
                >
                  <Icon name="ok" size="sm" /> Commande reçue : tout mettre en stock
                </Button>
              </div>
            </>
          )}

          <div className="suppliers">
            <div className="sheet-head">
              <h3>Mes fournisseurs</h3>
              <Button variant="outline" className="h-9 rounded-full px-3" onClick={() => setAdding((v) => !v)}><Icon name="ajouter" size="sm" /> Ajouter</Button>
            </div>
            {suppliers.length === 0 && !adding && <p className="note">Ajoute le numéro WhatsApp de ton fournisseur : la commande partira directement chez lui.</p>}
            {suppliers.map((f) => (
              <div key={f.id} className="row supplier-row">
                <span><b>{f.name}</b> · {f.phone}</span>
                <button type="button" className="link" onClick={() => commit({ ...shop, suppliers: suppliers.filter((x) => x.id !== f.id) })}>Enlever</button>
              </div>
            ))}
            {adding && (
              <div className="service-form">
                <Input className="h-10" placeholder="Nom (ex. Bathie Touba)" aria-label="Nom du fournisseur" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <Input className="h-10" inputMode="tel" placeholder="Numéro WhatsApp (77 …)" aria-label="Numéro WhatsApp du fournisseur" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                <Button className="h-10 rounded-full px-4" disabled={!form.name.trim() || form.phone.replace(/\D/g, "").length < 9} onClick={saveSupplier}>Enregistrer</Button>
              </div>
            )}
          </div>
          {note && <p className="note jk-notice" role="status">{note}</p>}
        </>
      )}
    </section>
  );
}
