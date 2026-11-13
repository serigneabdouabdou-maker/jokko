import { useState } from "react";
import { Icon } from "./Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Shop } from "@/model";
import { addVariants, parseVariants } from "@/data/variants";

const n = (v: string) => Math.max(0, Math.round(Number(v.replace(/[^\d]/g, "")) || 0));

/** Ajouter un article en plusieurs tailles ou couleurs d'un coup (un article par variante, chacun son stock). */
export function VariantAdd({ shop, commit, onClose }: { shop: Shop; commit: (s: Shop) => void; onClose: () => void }) {
  const [form, setForm] = useState({ name: "", unit: "pièce", price: "", cost: "", list: "", stock: "" });
  const [stocks, setStocks] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const variants = parseVariants(form.list);

  function save() {
    const done = addVariants(shop, {
      name: form.name,
      unit: form.unit,
      price: n(form.price),
      ...(n(form.cost) ? { cost: n(form.cost) } : {}),
      variants: variants.map((label) => ({ label, stock: n(stocks[label] ?? form.stock) })),
    });
    if (!done.created && !done.updated) return;
    commit(done.shop);
    setNote(`✓ ${done.created} article(s) créé(s)${done.updated ? `, ${done.updated} mis à jour` : ""} : ${variants.map((v) => `${form.name} · ${v}`).join(", ")}.`);
    setForm({ ...form, name: "", list: "", stock: "" });
    setStocks({});
  }

  return (
    <div className="service-form">
      <b>Plusieurs tailles ou couleurs</b>
      <small className="note">Un article par taille ou par couleur, chacun avec son stock : tu sais exactement ce qui manque (fil bleu, maillot XL…).</small>
      <Input className="h-11" placeholder="Article (ex. Fil à coudre, Maillot blanc)" aria-label="Article" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <Input className="h-11" placeholder="Couleurs ou tailles, séparées par des virgules (noir, blanc, or · S, M, L, XL)" aria-label="Variantes" value={form.list} onChange={(e) => setForm({ ...form, list: e.target.value })} />
      <div className="service-who">
        <Input className="h-11" placeholder="Unité (bobine, pièce, mètre)" aria-label="Unité" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
        <Input className="h-11 num" inputMode="numeric" placeholder="Stock de chaque" aria-label="Stock de chaque variante" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
      </div>
      <div className="service-who">
        <Input className="h-11 num" inputMode="numeric" placeholder="Prix de vente (F)" aria-label="Prix de vente" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        <Input className="h-11 num" inputMode="numeric" placeholder="Prix d'achat (F)" aria-label="Prix d'achat" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
      </div>
      {variants.length > 1 && (
        <div className="list">
          {variants.map((v) => (
            <label key={v} className="row">
              <span style={{ flex: 1 }}>{form.name || "Article"} · {v}</span>
              <Input className="h-10 num" style={{ width: 100 }} inputMode="numeric" placeholder={form.stock || "0"} aria-label={`Stock ${v}`} value={stocks[v] ?? ""} onChange={(e) => setStocks({ ...stocks, [v]: e.target.value })} />
            </label>
          ))}
        </div>
      )}
      <div className="row">
        <Button className="h-11 rounded-full px-5" disabled={!form.name.trim() || !variants.length} onClick={save}><Icon name="ajouter" size="sm" /> Ajouter {variants.length || ""} article{variants.length > 1 ? "s" : ""}</Button>
        <Button variant="ghost" className="h-11 rounded-full px-4" onClick={onClose}>Fermer</Button>
      </div>
      {note && <p className="note jk-notice" role="status">{note}</p>}
    </div>
  );
}
