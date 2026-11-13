import { useState } from "react";
import { Icon } from "./Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Product, type Shop, money, uid } from "@/model";
import { searchProducts } from "@/data/partSearch";
import { addToOrder, orderMessage, orderPlan, receiveOrder, removeFromOrder, setOrderQty, shareOnWhatsapp } from "@/data/reorder";

const cap = (s: string) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/**
 * « Un client demande une pièce ? » : on tape le modèle, Jokko dit si elle est en stock, montre les écrans universels
 * qui vont dessus, et met à la commande ce qui manque (même une pièce qui n'est pas encore dans la liste).
 */
export function PartLookup({ shop, commit }: { shop: Shop; commit: (s: Shop) => void }) {
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const q = query.trim();
  const hits = q.length >= 2 ? searchProducts(shop.products, q, 8) : [];
  const anyInStock = hits.some((h) => h.product.stock > 0);

  function order(p: Product | null) {
    commit(addToOrder(shop, p ? { name: p.name, productId: p.id, why: "recherche" } : { name: cap(q), why: "recherche" }));
    setNote(`✓ ${p ? p.name : cap(q)} ajouté à la commande.`);
  }

  return (
    <section className="part-lookup" aria-label="Un client demande une pièce">
      <h3>Un client demande une pièce ?</h3>
      <Input className="h-11" placeholder="Tape le modèle : BF6, iPhone 11, A12…" aria-label="Chercher une pièce pour un client" value={query} onChange={(e) => { setQuery(e.target.value); setNote(""); }} />
      {q.length >= 2 && (
        <>
          {hits.length > 0 ? (
            <>
              <p className={`note${anyInStock ? "" : " is-late"}`} role="status">
                {anyInStock ? "Disponible :" : "Rien en stock pour ce modèle. Tu peux la commander :"}
              </p>
              <ul className="lookup-hits">
                {hits.map((h) => (
                  <li key={h.product.id} className={h.product.stock > 0 ? "in-stock" : ""}>
                    <div>
                      <b>{h.product.name}</b>
                      <small>
                        {h.product.stock > 0 ? `${h.product.stock} en stock` : "pas en stock"}
                        {h.via ? ` · écran qui va aussi sur ${h.via}` : ""}
                        {h.product.cost !== undefined ? ` · achat ${money(h.product.cost)}` : ""}
                        {h.product.price ? ` · vente ${money(h.product.price)}` : ""}
                      </small>
                    </div>
                    {h.product.stock <= 0 && (
                      <Button variant="outline" className="h-9 rounded-full px-3" onClick={() => order(h.product)}>À commander</Button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : (
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
          )}
        </>
      )}
      {note && <p className="note jk-notice" role="status">{note}</p>}
    </section>
  );
}

/** « À commander » : la commande prête pour le fournisseur, et les conseils de Jokko (stock bas, pièces qui partent, dépôts). */
export function Commandes({ shop, commit }: { shop: Shop; commit: (s: Shop) => void }) {
  const plan = orderPlan(shop);
  const [open, setOpen] = useState(false);
  const [fromCash, setFromCash] = useState(false);
  const [note, setNote] = useState("");
  const count = plan.order.length + plan.advice.length;
  const text = orderMessage(shop, plan.order);

  return (
    <section className="sheet commandes">
      <button type="button" className="sheet-head commandes-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <h2>À commander</h2>
        <b className="num sheet-total">
          {plan.order.length ? `${plan.order.length} dans la commande` : "rien"}
          {plan.advice.length ? ` · ${plan.advice.length} conseil${plan.advice.length > 1 ? "s" : ""}` : ""}
        </b>
      </button>
      {!open && count > 0 && <p className="note">Touche pour voir ce qu'il faut acheter et préparer la commande du fournisseur.</p>}
      {open && (
        <>
          {plan.advice.length > 0 && (
            <>
              <div className="sheet-head">
                <h3>Jokko conseille d'acheter</h3>
                <Button variant="outline" className="h-9 rounded-full px-3" onClick={() => { let s = shop; for (const a of plan.advice) s = addToOrder(s, { name: a.name, ...(a.productId ? { productId: a.productId } : {}), qty: a.qty, why: "conseil" }); commit(s); }}>
                  Tout ajouter
                </Button>
              </div>
              <ul className="order-list">
                {plan.advice.map((a) => (
                  <li key={a.key}>
                    <span>
                      <b>{a.qty} × {a.name}</b>
                      <small>{a.reason}{a.cost !== undefined ? ` · ${money(a.cost * a.qty)}` : ""}</small>
                    </span>
                    <Button className="h-9 rounded-full px-3" onClick={() => commit(addToOrder(shop, { name: a.name, ...(a.productId ? { productId: a.productId } : {}), qty: a.qty, why: "conseil" }))}>Ajouter</Button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <h3>Ma commande</h3>
          {plan.order.length === 0 ? (
            <p className="note">Vide. Ajoute les conseils de Jokko, ou cherche une pièce plus haut et touche « À commander ».</p>
          ) : (
            <>
              <ul className="order-list">
                {plan.order.map((o) => (
                  <li key={o.key}>
                    <span>
                      <b>{o.name}</b>
                      <small>{o.reason}{o.cost !== undefined ? ` · ${money(o.cost)} pièce · ${money(o.cost * o.qty)}` : " · prix ?"}</small>
                    </span>
                    <div className="qty-step">
                      <Button variant="outline" className="h-9 w-9 rounded-full p-0" aria-label={`Une de moins : ${o.name}`} onClick={() => commit(setOrderQty(shop, o.key, o.qty - 1))}>−</Button>
                      <b className="num">{o.qty}</b>
                      <Button variant="outline" className="h-9 w-9 rounded-full p-0" aria-label={`Une de plus : ${o.name}`} onClick={() => commit(setOrderQty(shop, o.key, o.qty + 1))}>+</Button>
                      <button type="button" className="link" onClick={() => commit(removeFromOrder(shop, o.key))}>Enlever</button>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="repair-calc">Total estimé (prix d'achat connus) : <b>{money(plan.total)}</b></p>
              <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
                <Button className="h-11 rounded-full px-5" onClick={() => window.open(shareOnWhatsapp(text), "_blank", "noopener")}>
                  <Icon name="whatsapp" size="sm" /> Envoyer au fournisseur
                </Button>
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
                    const done = receiveOrder(shop, { fromCash });
                    commit(done.shop);
                    setNote(`✓ Commande reçue : ${done.count} pièce${done.count > 1 ? "s" : ""} ajoutée${done.count > 1 ? "s" : ""} au stock.${fromCash ? " La caisse a baissé du prix d'achat." : ""}`);
                  }}
                >
                  <Icon name="ok" size="sm" /> Commande reçue : tout mettre en stock
                </Button>
              </div>
            </>
          )}
          {note && <p className="note jk-notice" role="status">{note}</p>}
        </>
      )}
    </section>
  );
}
