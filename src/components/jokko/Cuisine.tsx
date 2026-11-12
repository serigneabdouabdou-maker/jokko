import { useState } from "react";
import { Icon } from "./Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Client, money, type Payment, PAYMENT_LABELS, type Shop, uid } from "@/model";
import { addDish, DISH_UNITS, dishCost, dishStats, endService, isDish, leftovers, prepare, setDishCost, soldToday } from "@/data/cuisine";
import { addFromCatalogue, cataloguePath, catalogueFor, onMenu } from "@/data/catalogue";
import { addToCart, type CartLine, cartTotal, checkout, setQty } from "@/data/checkout";
import { deliver, deliveriesToday, returnItems, setTournee, tourneeClients } from "@/data/tournee";
import { vitrinePhotoUrl } from "@/data/vitrine";
import { type ReceiptDoc, receiptFor } from "@/data/tickets";
import { Receipt } from "./Receipt";
import { useCartVoids } from "./useCartVoids";
import { metierOf } from "@/data/metiers";

const n = (v: string) => Math.max(0, Math.round(Number(v.replace(/[^\d]/g, "")) || 0));
const PAY: Payment[] = ["especes", "wave", "om", "credit"];

/**
 * Cuisine (restaurant, dibiterie, jus) ou Fournées (boulangerie).
 * Toucher les photos remplit la commande, puis un seul encaissement (espèces, Wave, Orange Money ou crédit d'un habitué).
 * Catalogue Jokko : plats, jus et pains connus avec leur photo, il suffit de mettre son prix.
 * Boulangerie : tournée du matin (livré à crédit en un toucher, pain rendu le soir).
 */
export function Cuisine({ shop, commit, canEdit, by }: { shop: Shop; commit: (s: Shop) => void; canEdit: boolean; by: string }) {
  const metier = metierOf(shop.activity).id;
  const bakery = metier === "boulangerie";
  const W = bakery
    ? { title: "Fournées du jour", prep: "Fournée", prepped: "sortis", item: "produit", items: "produits", rest: "invendus", say: "« Fournée de 300 baguettes », « Boutique Modou a pris 100 baguettes à crédit »", example: "Baguette" }
    : { title: "Plats du jour", prep: "Préparer", prepped: "préparés", item: "plat", items: "plats", rest: "restes", say: "« J'ai vendu 2 yassa et 3 bissap », « J'ai préparé 40 plats de ceebu jën »", example: "Yassa poulet" };
  const dishes = shop.products.filter(isDish);
  const sold = soldToday(shop);
  const stats = dishStats(shop, 7);
  const rest = leftovers(shop);
  const catalogue = catalogueFor(metier).filter((c) => !onMenu(shop, c));

  const [cart, setCart] = useState<CartLine[]>([]);
  const voids = useCartVoids(cart, shop, commit, by, "cuisine");
  const [pay, setPay] = useState<Payment>("especes");
  const [clientId, setClientId] = useState("");
  const [newClient, setNewClient] = useState("");
  const [prepFor, setPrepFor] = useState<string | null>(null);
  const [prepQty, setPrepQty] = useState("");
  const [showCatalogue, setShowCatalogue] = useState(dishes.length === 0);
  const [pick, setPick] = useState<string | null>(null);
  const [pickPrice, setPickPrice] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", price: "", unit: bakery ? "baguette" : "plat", portions: "" });
  const [costFor, setCostFor] = useState("");
  const [lines, setLines] = useState([{ label: "", price: "" }]);
  const [portions, setPortions] = useState("");
  const [toss, setToss] = useState<string[] | null>(null);
  const [tour, setTour] = useState({ client: "", productId: "", qty: "" });
  const [ret, setRet] = useState<{ clientId: string; productId: string; qty: string } | null>(null);
  const [note, setNote] = useState("");
  const [receipt, setReceipt] = useState<ReceiptDoc | null>(null);
  const [paid, setPaid] = useState<{ text: string; receipt: ReceiptDoc | null } | null>(null);

  const flash = (text: string) => { setNote(text); window.setTimeout(() => setNote(""), 4000); };
  const total = cartTotal(shop, cart);
  const costDish = dishes.find((d) => d.id === costFor);
  const unitCost = dishCost(lines.map((l) => ({ price: n(l.price) })), n(portions));
  const photo = (path?: string) => (path ? vitrinePhotoUrl(path) : null);

  function encaisser() {
    let s = shop;
    let cid: string | null = null;
    if (pay === "credit") {
      if (clientId) cid = clientId;
      else if (newClient.trim()) {
        const c: Client = { id: uid("c"), name: newClient.trim(), phone: "", debt: 0 };
        s = { ...s, clients: [...s.clients, c] };
        cid = c.id;
      } else return flash("À crédit : choisis le client.");
    }
    const done = checkout(s, cart, pay, cid);
    if (!done) return;
    commit(voids.settle(done.shop, cart));
    const r = done.shop.sales[0] ? receiptFor(done.shop, done.shop.sales[0]) : null;
    setPaid({ text: `✓ Encaissé ${money(done.amount ?? total)} · ${PAYMENT_LABELS[pay]}${r ? ` · ${r.title}` : ""}`, receipt: r });
    if (r) setReceipt(r);
    setCart([]); setPay("especes"); setClientId(""); setNewClient("");
  }

  return (
    <section className="sheet cuisine">
      <div className="sheet-head">
        <h2>{W.title}</h2>
        <b className="num sheet-total">{dishes.length} {dishes.length > 1 ? W.items : W.item}</b>
      </div>
      <p className="note">Touche les photos pour faire la commande, puis encaisse. Tu peux aussi le dire à Jokko : {W.say}.</p>
      {note && <p className="note cz-flash" role="status">{note}</p>}
      {receipt && <Receipt title={receipt.title} text={receipt.text} build={receipt.build} onClose={() => setReceipt(null)} />}

      {dishes.length === 0 && <div className="cz-empty"><p>Ton menu est vide. Choisis tes {W.items} dans le catalogue Jokko ci-dessous et mets ton prix : c'est tout.</p></div>}

      <div className="cz-grid">
        {dishes.map((d) => {
          const img = photo(d.photoPath);
          const inCart = cart.find((l) => l.productId === d.id)?.qty ?? 0;
          return (
            <article key={d.id} className="cz-card" data-in={inCart > 0}>
              <button type="button" className="cz-sell" onClick={() => { setPaid(null); setCart(addToCart(cart, d.id, false)); }} aria-label={`Ajouter 1 ${d.name} à la commande`}>
                {img ? <img className="cz-img" src={img} alt="" loading="lazy" /> : <span className="cz-img cz-img-empty"><Icon name="cuisine" /></span>}
                {inCart > 0 && <span className="cz-badge num">{inCart}</span>}
                <span className="cz-name">{d.name}</span>
                <span className="cz-price num">{money(d.price)}</span>
                {d.stock > 0 && <span className="cz-left" data-tone={d.stock <= 3 ? "low" : "ok"}>Reste {d.stock}</span>}
                <span className="cz-sold">Vendu aujourd'hui : <b className="num">{sold.get(d.id) ?? 0}</b></span>
              </button>
              {prepFor === d.id ? (
                <div className="cz-prep">
                  {[10, 20, 50, 100].map((q) => <Button key={q} size="sm" variant="outline" onClick={() => setPrepQty(String(q))}>{q}</Button>)}
                  <Input className="h-9 w-20" inputMode="numeric" value={prepQty} onChange={(e) => setPrepQty(e.target.value)} aria-label="Nombre" />
                  <Button size="sm" disabled={!n(prepQty)} onClick={() => { commit(prepare(shop, d.id, n(prepQty))); flash(`✓ ${n(prepQty)} ${d.name} ${W.prepped}`); setPrepFor(null); setPrepQty(""); }}>OK</Button>
                </div>
              ) : (
                <Button size="sm" variant="ghost" className="cz-prep-btn" onClick={() => { setPrepFor(d.id); setPrepQty(""); }}><Icon name="ajouter" size="sm" /> {W.prep}</Button>
              )}
            </article>
          );
        })}
      </div>

      {paid && cart.length === 0 && (
        <div className="cz-ticket cz-paid" role="status">
          <b>{paid.text}</b>
          <div className="cz-units" style={{ marginTop: 8 }}>
            {paid.receipt && <Button size="sm" onClick={() => setReceipt(paid.receipt)}>Voir le ticket</Button>}
            <Button size="sm" variant="outline" onClick={() => setPaid(null)}>Nouvelle commande</Button>
          </div>
        </div>
      )}

      {cart.length > 0 && (
        <div className="cz-ticket" role="region" aria-label="Commande en cours">
          <div className="cz-ticket-head">
            <h3>Commande</h3>
            <Button className="h-11 rounded-full px-5 cz-pay" onClick={encaisser}>Encaisser {money(total)}</Button>
          </div>
          <ul>
            {cart.map((l, i) => {
              const p = shop.products.find((x) => x.id === l.productId);
              if (!p) return null;
              return (
                <li key={l.productId}>
                  <span>{p.name}</span>
                  <span className="cz-qty">
                    <Button size="sm" variant="outline" onClick={() => setCart(setQty(cart, i, l.qty - 1))} aria-label="Moins">−</Button>
                    <b className="num">{l.qty}</b>
                    <Button size="sm" variant="outline" onClick={() => setCart(setQty(cart, i, l.qty + 1))} aria-label="Plus">+</Button>
                  </span>
                  <b className="num">{money(p.price * l.qty)}</b>
                </li>
              );
            })}
          </ul>
          <div className="cz-units">
            {PAY.map((p) => <Button key={p} size="sm" variant={pay === p ? "default" : "outline"} onClick={() => setPay(p)}>{PAYMENT_LABELS[p]}</Button>)}
          </div>
          {pay === "credit" && (
            <div className="cz-line" style={{ marginTop: 8 }}>
              <select className="cz-select" value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Client">
                <option value="">Client habitué…</option>
                {shop.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {!clientId && <Input className="h-10" placeholder="ou nouveau client" value={newClient} onChange={(e) => setNewClient(e.target.value)} aria-label="Nouveau client" />}
            </div>
          )}
          <button type="button" className="link cz-clear" onClick={() => { voids.clear(); setCart([]); }}>Vider la commande</button>
        </div>
      )}

      {canEdit && (
        <div className="cz-block">
          <div className="cz-head">
            <h3>Catalogue Jokko</h3>
            <Button size="sm" variant="outline" onClick={() => setShowCatalogue((v) => !v)}>{showCatalogue ? "Fermer" : `Ouvrir (${catalogue.length})`}</Button>
          </div>
          <p className="note">{bakery ? "Pains et pâtisseries" : "Plats et jus du Sénégal"} déjà prêts, avec leur photo : touche, mets ton prix, c'est au menu (et sur ta vitrine).</p>
          {showCatalogue && (
            <div className="cz-grid">
              {catalogue.map((c) => (
                <article key={c.id} className="cz-card">
                  <button type="button" className="cz-sell" onClick={() => { setPick(c.id); setPickPrice(""); }}>
                    <img className="cz-img" src={vitrinePhotoUrl(cataloguePath(c.id))} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
                    <span className="cz-name">{c.name}</span>
                    <span className="cz-sold">{c.unit}</span>
                  </button>
                  {pick === c.id && (
                    <div className="cz-prep">
                      <Input className="h-9 w-24" inputMode="numeric" placeholder="Ton prix" autoFocus value={pickPrice} onChange={(e) => setPickPrice(e.target.value)} aria-label={`Prix de ${c.name}`} />
                      <Button size="sm" disabled={!n(pickPrice)} onClick={() => { commit(addFromCatalogue(shop, c, n(pickPrice))); flash(`✓ ${c.name} au menu · ${money(n(pickPrice))}`); setPick(null); }}>Ajouter</Button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
          <div className="debt-actions" style={{ flexWrap: "wrap", gap: 8, margin: "10px 0 4px" }}>
            <Button variant="outline" className="h-10 rounded-full px-4" onClick={() => setAdding((a) => !a)}><Icon name="ajouter" size="sm" /> Un {W.item} qui n'est pas dans le catalogue</Button>
          </div>
          {adding && (
            <div className="list" style={{ gap: 8, display: "grid" }}>
              <Input className="h-11" placeholder={`Nom (ex. ${W.example}…)`} aria-label="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <Input className="h-11" inputMode="numeric" placeholder="Prix de vente (F)" aria-label="Prix de vente" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              <div className="cz-units">{DISH_UNITS.map((u) => <Button key={u} size="sm" variant={form.unit === u ? "default" : "outline"} onClick={() => setForm({ ...form, unit: u })}>{u}</Button>)}</div>
              <Input className="h-11" inputMode="numeric" placeholder={`Combien ${W.prepped} aujourd'hui (facultatif)`} aria-label="Quantité" value={form.portions} onChange={(e) => setForm({ ...form, portions: e.target.value })} />
              <Button className="h-11 rounded-full" disabled={!form.name.trim() || !n(form.price)} onClick={() => {
                commit(addDish(shop, { name: form.name, price: n(form.price), unit: form.unit, portions: n(form.portions) }, uid("p")));
                flash(`✓ ${form.name.trim()} ajouté au menu`);
                setForm({ name: "", price: "", unit: form.unit, portions: "" }); setAdding(false);
              }}><Icon name="sauvegarde" size="sm" /> Ajouter au menu</Button>
            </div>
          )}
        </div>
      )}

      {bakery && canEdit && (
        <div className="cz-block">
          <h3>Tournée du matin</h3>
          <p className="note">Les boutiques que tu livres chaque matin. « Livré » = à crédit en un toucher ; « Retour » = le pain qu'elles rendent le soir (leur dette baisse).</p>
          <ul className="cz-rank">
            {tourneeClients(shop).map((c) => {
              const done = deliveriesToday(shop, c.id);
              const qtyToday = done.reduce((a, s) => a + (s.qty ?? 0), 0);
              return (
                <li key={c.id} className="cz-tour">
                  <span>
                    <b>{c.name}</b> · {c.tournee!.map((l) => `${l.qty} ${shop.products.find((p) => p.id === l.productId)?.name ?? "?"}`).join(", ")}
                    <br /><small>{done.length ? `Livré aujourd'hui : ${qtyToday}` : "Pas encore livré"} · doit {money(c.debt)}</small>
                  </span>
                  <span className="cz-units">
                    <Button size="sm" variant={done.length ? "outline" : "default"} onClick={() => { const r = deliver(shop, c.id); if (r) { commit(r.shop); flash(`✓ ${c.name} livré · ${money(r.amount)} à crédit`); } }}>Livré</Button>
                    {done.length > 0 && <Button size="sm" variant="ghost" onClick={() => setRet({ clientId: c.id, productId: c.tournee![0].productId, qty: "" })}>Retour</Button>}
                  </span>
                  {ret?.clientId === c.id && (
                    <span className="cz-prep" style={{ width: "100%" }}>
                      <select className="cz-select" value={ret.productId} onChange={(e) => setRet({ ...ret, productId: e.target.value })} aria-label="Produit rendu">
                        {c.tournee!.map((l) => <option key={l.productId} value={l.productId}>{shop.products.find((p) => p.id === l.productId)?.name}</option>)}
                      </select>
                      <Input className="h-9 w-20" inputMode="numeric" placeholder="Rendus" value={ret.qty} onChange={(e) => setRet({ ...ret, qty: e.target.value })} aria-label="Quantité rendue" />
                      <Button size="sm" disabled={!n(ret.qty)} onClick={() => { const r = returnItems(shop, c.id, ret.productId, n(ret.qty)); commit(r.shop); flash(`✓ ${r.returned} rendus par ${c.name}`); setRet(null); }}>OK</Button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="list" style={{ gap: 8, display: "grid", marginTop: 8 }}>
            <b>Ajouter une boutique à la tournée</b>
            <Input className="h-10" list="cz-clients" placeholder="Nom de la boutique (ex. Boutique Modou)" value={tour.client} onChange={(e) => setTour({ ...tour, client: e.target.value })} aria-label="Boutique cliente" />
            <datalist id="cz-clients">{shop.clients.map((c) => <option key={c.id} value={c.name} />)}</datalist>
            <div className="cz-line">
              <select className="cz-select" value={tour.productId} onChange={(e) => setTour({ ...tour, productId: e.target.value })} aria-label="Produit">
                <option value="">Produit…</option>
                {dishes.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <Input className="h-10 w-24" inputMode="numeric" placeholder="Chaque matin" value={tour.qty} onChange={(e) => setTour({ ...tour, qty: e.target.value })} aria-label="Quantité chaque matin" />
            </div>
            <Button className="h-10 rounded-full" disabled={!tour.client.trim() || !tour.productId || !n(tour.qty)} onClick={() => {
              let s = shop;
              let c = s.clients.find((x) => x.name.toLowerCase() === tour.client.trim().toLowerCase());
              if (!c) { c = { id: uid("c"), name: tour.client.trim(), phone: "", debt: 0 }; s = { ...s, clients: [...s.clients, c] }; }
              const lines2 = [...(c.tournee ?? []).filter((l) => l.productId !== tour.productId), { productId: tour.productId, qty: n(tour.qty) }];
              commit(setTournee(s, c.id, lines2));
              flash(`✓ ${c.name} : ${n(tour.qty)} chaque matin`);
              setTour({ client: "", productId: "", qty: "" });
            }}><Icon name="sauvegarde" size="sm" /> Enregistrer</Button>
          </div>
        </div>
      )}

      {canEdit && dishes.length > 0 && (
        <div className="cz-block">
          <h3>Combien me coûte un {W.item} ?</h3>
          <p className="note">Écris ce que tu as acheté pour une marmite (ou une fournée) et combien de portions ça donne : Jokko calcule le coût d'une portion et ton vrai bénéfice.</p>
          <div className="cz-units">{dishes.map((d) => <Button key={d.id} size="sm" variant={costFor === d.id ? "default" : "outline"} onClick={() => setCostFor(d.id)}>{d.name}</Button>)}</div>
          {costDish && (
            <div className="list" style={{ gap: 8, display: "grid", marginTop: 8 }}>
              {lines.map((l, i) => (
                <div key={i} className="cz-line">
                  <Input className="h-10" placeholder={i === 0 ? (bakery ? "Farine" : "Poisson") : "Ingrédient"} aria-label="Ingrédient" value={l.label} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                  <Input className="h-10 w-28" inputMode="numeric" placeholder="Prix (F)" aria-label="Prix de l'ingrédient" value={l.price} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} />
                </div>
              ))}
              <Button size="sm" variant="outline" className="justify-self-start" onClick={() => setLines([...lines, { label: "", price: "" }])}><Icon name="ajouter" size="sm" /> Un ingrédient de plus</Button>
              <Input className="h-11" inputMode="numeric" placeholder="Nombre de portions obtenues" aria-label="Nombre de portions" value={portions} onChange={(e) => setPortions(e.target.value)} />
              {unitCost > 0 && (
                <p className="cz-result">
                  Une portion te coûte <b className="num">{money(unitCost)}</b>. Vendue {money(costDish.price)}, tu gagnes{" "}
                  <b className="num" data-tone={costDish.price - unitCost > 0 ? "ok" : "bad"}>{money(costDish.price - unitCost)}</b> par {W.item}.
                  {costDish.price - unitCost <= 0 && " Attention : tu vends à perte."}
                </p>
              )}
              <Button className="h-11 rounded-full" disabled={unitCost <= 0} onClick={() => {
                commit(setDishCost(shop, costDish.id, unitCost));
                flash(`✓ Coût de ${costDish.name} : ${money(unitCost)} la portion`);
                setLines([{ label: "", price: "" }]); setPortions(""); setCostFor("");
              }}><Icon name="sauvegarde" size="sm" /> Enregistrer ce coût</Button>
            </div>
          )}
        </div>
      )}

      {stats.length > 0 && (
        <div className="cz-block">
          <h3>Ce qui rapporte le plus (7 jours)</h3>
          <ul className="cz-rank">
            {stats.map((s, i) => (
              <li key={s.id}>
                <span><b className="num">{i + 1}.</b> {s.name} · <span className="num">{s.qty}</span> vendus</span>
                <b className="num">{s.profit != null ? `${money(s.profit)} gagnés` : `${money(s.revenue)} encaissés`}</b>
              </li>
            ))}
          </ul>
          {stats.some((s) => s.profit == null) && <p className="note">Calcule le coût des {W.items} sans bénéfice affiché pour voir ce qu'ils te rapportent vraiment.</p>}
        </div>
      )}

      {canEdit && rest.length > 0 && (
        <div className="cz-block">
          <h3>Fin de service</h3>
          <p className="note">Les {W.rest} qui ne se gardent pas passent en perte (au coût du {W.item}) : ta caisse et ton bénéfice restent justes.</p>
          {toss === null ? (
            <Button variant="outline" className="h-10 rounded-full px-4" onClick={() => setToss(rest.map((p) => p.id))}>Fermer le service</Button>
          ) : (
            <div className="list" style={{ gap: 8, display: "grid" }}>
              {rest.map((p) => (
                <label key={p.id} className="cz-check">
                  <input type="checkbox" checked={toss.includes(p.id)} onChange={(e) => setToss(e.target.checked ? [...toss, p.id] : toss.filter((x) => x !== p.id))} />
                  <span>{p.stock} {p.name}{p.cost ? ` · ${money(p.cost * p.stock)}` : ""}</span>
                </label>
              ))}
              <div className="debt-actions" style={{ gap: 8 }}>
                <Button className="h-10 rounded-full px-4" disabled={!toss.length} onClick={() => {
                  const r = endService(shop, toss, uid("e"));
                  commit(r.shop);
                  flash(r.lost > 0 ? `✓ ${r.count} ${W.rest} passés en perte (${money(r.lost)})` : `✓ ${r.count} ${W.rest} retirés`);
                  setToss(null);
                }}>Valider</Button>
                <Button variant="ghost" className="h-10 rounded-full px-4" onClick={() => setToss(null)}>Annuler</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
