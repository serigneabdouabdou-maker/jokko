import { useState } from "react";
import { Icon } from "./Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { money, type Shop, uid } from "@/model";
import { addDish, DISH_UNITS, dishCost, dishStats, endService, isDish, leftovers, prepare, sellDish, setDishCost, soldToday } from "@/data/cuisine";
import { metierOf } from "@/data/metiers";

const n = (v: string) => Math.max(0, Math.round(Number(v.replace(/[^\d]/g, "")) || 0));

/**
 * Cuisine (restaurant, dibiterie, jus) ou Fournées (boulangerie) : les plats du jour.
 * Un toucher = une portion vendue ; « Préparer » ajoute des portions ; le coût de chaque plat donne le vrai bénéfice ;
 * la fin de service passe les restes en perte. Tout se dit aussi à Jokko.
 */
export function Cuisine({ shop, commit, canEdit }: { shop: Shop; commit: (s: Shop) => void; canEdit: boolean }) {
  const bakery = metierOf(shop.activity).id === "boulangerie";
  const W = bakery
    ? { title: "Fournées du jour", prep: "Fournée", prepped: "sortis", item: "produit", items: "produits", rest: "invendus", say: "« Fournée de 300 baguettes », « Boutique Modou a pris 100 baguettes à crédit »", example: "Baguette" }
    : { title: "Plats du jour", prep: "Préparer", prepped: "préparés", item: "plat", items: "plats", rest: "restes", say: "« J'ai vendu 2 yassa et 3 bissap », « J'ai préparé 40 plats de ceebu jën »", example: "Yassa poulet" };
  const dishes = shop.products.filter(isDish);
  const sold = soldToday(shop);
  const stats = dishStats(shop, 7);
  const rest = leftovers(shop);

  const [prepFor, setPrepFor] = useState<string | null>(null);
  const [prepQty, setPrepQty] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", price: "", unit: bakery ? "baguette" : "plat", portions: "" });
  const [costFor, setCostFor] = useState("");
  const [lines, setLines] = useState([{ label: "", price: "" }]);
  const [portions, setPortions] = useState("");
  const [toss, setToss] = useState<string[] | null>(null);
  const [note, setNote] = useState("");

  const flash = (text: string) => { setNote(text); window.setTimeout(() => setNote(""), 4000); };
  const costDish = dishes.find((d) => d.id === costFor);
  const unitCost = dishCost(lines.map((l) => ({ price: n(l.price) })), n(portions));

  return (
    <section className="sheet cuisine">
      <div className="sheet-head">
        <h2>{W.title}</h2>
        <b className="num sheet-total">{dishes.length} {dishes.length > 1 ? W.items : W.item}</b>
      </div>
      <p className="note">Touche un {W.item} pour le vendre. Tu peux aussi le dire à Jokko : {W.say}.</p>
      {note && <p className="note cz-flash" role="status">{note}</p>}

      {dishes.length === 0 && (
        <div className="cz-empty">
          <p>Ton menu est vide. Ajoute tes {W.items} et leur prix : Jokko comptera chaque vente, ce qui reste et ce que tu gagnes.</p>
        </div>
      )}

      <div className="cz-grid">
        {dishes.map((d) => {
          const out = d.stock <= 0;
          return (
            <article key={d.id} className="cz-card" data-out={out}>
              <button type="button" className="cz-sell" disabled={out} onClick={() => { commit(sellDish(shop, d.id, 1, uid("v"))); flash(`✓ 1 ${d.name} vendu · ${money(d.price)}`); }} aria-label={`Vendre 1 ${d.name}`}>
                <span className="cz-name">{d.name}</span>
                <span className="cz-price num">{money(d.price)}</span>
                <span className="cz-left" data-tone={out ? "out" : d.stock <= 3 ? "low" : "ok"}>{out ? "Fini" : `Reste ${d.stock}`}</span>
                <span className="cz-sold">Vendu aujourd'hui : <b className="num">{sold.get(d.id) ?? 0}</b></span>
              </button>
              {prepFor === d.id ? (
                <div className="cz-prep">
                  {[10, 20, 50].map((q) => <Button key={q} size="sm" variant="outline" onClick={() => setPrepQty(String(q))}>{q}</Button>)}
                  <Input className="h-9 w-20" inputMode="numeric" value={prepQty} onChange={(e) => setPrepQty(e.target.value)} aria-label="Nombre de portions" />
                  <Button size="sm" disabled={!n(prepQty)} onClick={() => { commit(prepare(shop, d.id, n(prepQty))); flash(`✓ ${n(prepQty)} ${d.name} ${W.prepped}`); setPrepFor(null); setPrepQty(""); }}>OK</Button>
                </div>
              ) : (
                <Button size="sm" variant="ghost" className="cz-prep-btn" onClick={() => { setPrepFor(d.id); setPrepQty(""); }}><Icon name="ajouter" size="sm" /> {W.prep}</Button>
              )}
            </article>
          );
        })}
      </div>

      {canEdit && (
        <>
          <div className="debt-actions" style={{ flexWrap: "wrap", gap: 8, margin: "12px 0 4px" }}>
            <Button className="h-10 rounded-full px-4" onClick={() => setAdding((a) => !a)}><Icon name="ajouter" size="sm" /> Ajouter un {W.item} ou une boisson</Button>
          </div>
          {adding && (
            <div className="list" style={{ gap: 8, display: "grid" }}>
              <Input className="h-11" placeholder={`Nom (ex. ${W.example}, Bissap…)`} aria-label="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <Input className="h-11" inputMode="numeric" placeholder="Prix de vente (F)" aria-label="Prix de vente" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              <div className="cz-units">
                {DISH_UNITS.map((u) => <Button key={u} size="sm" variant={form.unit === u ? "default" : "outline"} onClick={() => setForm({ ...form, unit: u })}>{u}</Button>)}
              </div>
              <Input className="h-11" inputMode="numeric" placeholder={`Combien ${W.prepped} aujourd'hui (facultatif)`} aria-label="Quantité" value={form.portions} onChange={(e) => setForm({ ...form, portions: e.target.value })} />
              <Button className="h-11 rounded-full" disabled={!form.name.trim() || !n(form.price)} onClick={() => {
                commit(addDish(shop, { name: form.name, price: n(form.price), unit: form.unit, portions: n(form.portions) }, uid("p")));
                flash(`✓ ${form.name.trim()} ajouté au menu`);
                setForm({ name: "", price: "", unit: form.unit, portions: "" }); setAdding(false);
              }}><Icon name="sauvegarde" size="sm" /> Ajouter au menu</Button>
            </div>
          )}

          <div className="cz-block">
            <h3>Combien me coûte un {W.item} ?</h3>
            <p className="note">Écris ce que tu as acheté pour une marmite (ou une fournée) et combien de portions ça donne : Jokko calcule le coût d'une portion et ton vrai bénéfice.</p>
            <div className="cz-units">
              {dishes.map((d) => <Button key={d.id} size="sm" variant={costFor === d.id ? "default" : "outline"} onClick={() => setCostFor(d.id)}>{d.name}</Button>)}
            </div>
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
        </>
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
