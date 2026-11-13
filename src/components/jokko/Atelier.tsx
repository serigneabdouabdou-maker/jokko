import { useState } from "react";
import { Icon } from "./Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Repair, type Shop, money } from "@/model";
import { addRepair, deliverRepair, markRepaired, type PartInput, partsCost, payRepair, remaining, repairBreakdown, repairsOf, setRepairPrice, underWarranty, waitingDays, workshopMonth } from "@/data/repairs";
import { whatsappLink } from "@/data/debts";

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
 * Atelier : le carnet de réparations.
 * Dépôt (client, téléphone, appareil, panne, prix, avance) → Réparé (pièces prises dans le stock) → Rendu (le client paie le reste,
 * ou le reste va en dette). Bénéfice = prix − prix d'achat des pièces.
 */
export function Atelier({ shop, commit }: { shop: Shop; commit: (s: Shop) => void }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ clientName: "", phone: "", device: "", problem: "", price: "", advance: "", piece: "", labor: "" });
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<"cours" | "rendu">("cours");
  const list = repairsOf(shop).filter((r) => (filter === "cours" ? r.status === "depot" || r.status === "repare" : r.status === "rendu"));
  const waiting = repairsOf(shop).filter((r) => r.status === "depot" || r.status === "repare");
  const owed = waiting.reduce((a, r) => a + remaining(r), 0);
  const month = workshopMonth(shop);
  // Calcul du prix : pièce + main-d'œuvre = prix pour le client (ou prix − pièce = main-d'œuvre).
  const piece = n(form.piece);
  const labor = n(form.labor);
  const typedPrice = n(form.price);
  const price = typedPrice || (piece || labor ? piece + labor : 0);

  function save() {
    if (!form.clientName.trim() || !form.device.trim()) return;
    const { shop: next } = addRepair(shop, { ...form, price, advance: n(form.advance) });
    commit(next);
    setForm({ clientName: "", phone: "", device: "", problem: "", price: "", advance: "", piece: "", labor: "" });
    setAdding(false);
  }

  return (
    <section className="sheet">
      <div className="sheet-head">
        <h2>Atelier · réparations</h2>
        <b className="num sheet-total">{waiting.length} en cours</b>
      </div>
      <p className="note">
        {waiting.length ? `Reste à encaisser sur les appareils au dépôt : ${money(owed)}.` : "Aucun appareil au dépôt."} Tu peux aussi le dire à Jokko : « Awa dépose un iPhone 11, écran cassé, 25 000, avance 5 000 ».
      </p>
      <div className="kpis atelier-month" aria-label="L'atelier ce mois-ci">
        <article><span>Rendues ce mois</span><b className="num">{month.done}</b></article>
        <article><span>Encaissé</span><b className="num">{money(month.revenue)}</b></article>
        <article><span>Pièces</span><b className="num">− {money(month.parts)}</b></article>
        <article className="kpi-main" data-tone={month.labor < 0 ? "bad" : "good"}><span>Main-d'œuvre gagnée ce mois</span><b className="num">{money(month.labor)}</b></article>
      </div>
      <div className="debt-actions" style={{ flexWrap: "wrap", gap: 8, margin: "8px 0" }}>
        <Button className="h-10 rounded-full px-4" onClick={() => setAdding((a) => !a)}>
          <Icon name="ajouter" size="sm" /> Nouveau dépôt
        </Button>
        <Button variant={filter === "cours" ? "default" : "outline"} className="h-10 rounded-full px-4" onClick={() => setFilter("cours")}>En cours</Button>
        <Button variant={filter === "rendu" ? "default" : "outline"} className="h-10 rounded-full px-4" onClick={() => setFilter("rendu")}>Rendus</Button>
      </div>

      {adding && (
        <div className="list" style={{ gap: 8, display: "grid" }}>
          <Input className="h-11" placeholder="Nom du client" aria-label="Nom du client" value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
          <Input className="h-11" inputMode="tel" placeholder="Téléphone du client (77 …)" aria-label="Téléphone du client" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input className="h-11" placeholder="Appareil (iPhone 11, Tecno Spark 10…)" aria-label="Appareil" value={form.device} onChange={(e) => setForm({ ...form, device: e.target.value })} />
          <Input className="h-11" placeholder="Panne (écran cassé, connecteur…)" aria-label="Panne" value={form.problem} onChange={(e) => setForm({ ...form, problem: e.target.value })} />
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
          <Input className="h-11" inputMode="numeric" placeholder="Avance payée (F)" aria-label="Avance" value={form.advance} onChange={(e) => setForm({ ...form, advance: e.target.value })} />
          <Button className="h-11 rounded-full" onClick={save} disabled={!form.clientName.trim() || !form.device.trim()}>
            <Icon name="sauvegarde" size="sm" /> Enregistrer le dépôt
          </Button>
        </div>
      )}

      <div className="list">
        {list.length === 0 && <p className="note">{filter === "cours" ? "Rien en cours." : "Aucune réparation rendue."}</p>}
        {list.map((r) => (
          <RepairRow key={r.id} r={r} shop={shop} commit={commit} open={open === r.id} toggle={() => setOpen(open === r.id ? null : r.id)} />
        ))}
      </div>
    </section>
  );
}

function RepairRow({ r, shop, commit, open, toggle }: { r: Repair; shop: Shop; commit: (s: Shop) => void; open: boolean; toggle: () => void }) {
  const [parts, setParts] = useState<string[]>([]);
  const [bought, setBought] = useState<Array<{ label: string; cost: number }>>([]);
  const [buyName, setBuyName] = useState("");
  const [buyCost, setBuyCost] = useState("");
  const [fromCash, setFromCash] = useState(true);
  const [pay, setPay] = useState("");
  const [price, setPrice] = useState(r.price ? String(r.price) : "");
  const days = waitingDays(r);
  const pieces = shop.products.filter((p) => p.stock > 0);
  const rest = remaining(r);
  const ready = r.status === "repare";
  const notify = r.phone
    ? whatsappLink(r.phone, `Salaam ${r.clientName}, sa ${r.device} paré na (ticket ${r.number}). ${rest ? `Reste à payer : ${money(rest)}.` : ""} ${shop.name}`.trim())
    : null;

  return (
    <article className={days > 30 && r.status !== "rendu" ? "is-late" : ""}>
      <span onClick={toggle} style={{ cursor: "pointer" }}>
        <b>{r.number}</b> · {r.clientName} · {r.device}
        <small>
          {STATUS[r.status]}
          {r.problem ? ` · ${r.problem}` : ""}
          {r.status !== "rendu" ? ` · depuis ${days} j` : r.returnedAt ? ` · rendu le ${new Date(r.returnedAt).toLocaleDateString("fr-FR")}` : ""}
          {underWarranty(r) ? " · sous garantie" : ""}
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
          {r.status === "depot" && (
            <>
              <small className="note">Pièces posées (elles sortent du stock) :</small>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {pieces.map((p) => (
                  <Button key={p.id} variant={parts.includes(p.id) ? "default" : "outline"} className="h-9 rounded-full px-3" onClick={() => setParts(parts.includes(p.id) ? parts.filter((x) => x !== p.id) : [...parts, p.id])}>
                    {p.name}
                  </Button>
                ))}
                {pieces.length === 0 && <small className="note">Pas de pièce dans ton stock : note ci-dessous la pièce achetée exprès.</small>}
              </div>
              <small className="note">Pièce achetée exprès pour cette réparation :</small>
              <div className="repair-buy">
                <Input className="h-10" placeholder="Pièce (écran, batterie…)" aria-label="Pièce achetée" value={buyName} onChange={(e) => setBuyName(e.target.value)} />
                <Input className="h-10" inputMode="numeric" placeholder="Prix d'achat (F)" aria-label="Prix d'achat de la pièce" value={buyCost} onChange={(e) => setBuyCost(e.target.value)} />
                <Button
                  variant="outline"
                  className="h-10 rounded-full px-3"
                  disabled={!buyName.trim() || !n(buyCost)}
                  onClick={() => {
                    setBought([...bought, { label: buyName.trim(), cost: n(buyCost) }]);
                    setBuyName("");
                    setBuyCost("");
                  }}
                >
                  <Icon name="ajouter" size="sm" /> Ajouter
                </Button>
              </div>
              {bought.length > 0 && (
                <>
                  <ul className="repair-bought">
                    {bought.map((b, i) => (
                      <li key={i}>
                        {b.label} · {money(b.cost)}{" "}
                        <button type="button" className="link" onClick={() => setBought(bought.filter((_, j) => j !== i))}>Enlever</button>
                      </li>
                    ))}
                  </ul>
                  <label className="row">
                    <input type="checkbox" checked={fromCash} onChange={(e) => setFromCash(e.target.checked)} />
                    <span>Payée avec l'argent de la caisse (la caisse baisse de {money(bought.reduce((a, b) => a + b.cost, 0))})</span>
                  </label>
                </>
              )}
              {r.price > 0 && (parts.length > 0 || bought.length > 0) && (
                <p className="repair-calc">
                  Avec ces pièces : main-d'œuvre{" "}
                  <b>{money(r.price - bought.reduce((a, b) => a + b.cost, 0) - parts.reduce((a, id) => a + (shop.products.find((p) => p.id === id)?.cost ?? 0), 0))}</b>
                </p>
              )}
              <Button
                className="h-10 rounded-full"
                onClick={() => {
                  const inputs: PartInput[] = [...parts.map((id) => ({ productId: id })), ...bought.map((b) => ({ label: b.label, cost: b.cost, fromCash }))];
                  const next = markRepaired(shop, r.id, inputs);
                  if (next) commit(next);
                }}
              >
                <Icon name="reparation" size="sm" /> Réparé
              </Button>
            </>
          )}
          {r.parts.length > 0 && (
            <small className="note">
              Pièces : {r.parts.map((p) => `${p.label} (${money(p.cost)})`).join(", ")} · total {money(partsCost(r))}
            </small>
          )}
          <Breakdown r={r} />
          {r.status !== "rendu" && (
            <>
              <Input className="h-10" inputMode="numeric" placeholder={rest ? `Payé maintenant (reste ${money(rest)})` : "Payé maintenant (F)"} aria-label="Payé maintenant" value={pay} onChange={(e) => setPay(e.target.value)} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <Button variant="outline" className="h-10 rounded-full px-3" disabled={!n(pay)} onClick={() => { const next = payRepair(shop, r.id, n(pay)); if (next) { commit(next); setPay(""); } }}>
                  Acompte
                </Button>
                <Button className="h-10 rounded-full px-3" onClick={() => { const next = deliverRepair(shop, r.id, n(pay), true); if (next) commit(next); }}>
                  <Icon name="ok" size="sm" /> Rendu au client{rest - n(pay) > 0 ? " (reste en dette)" : ""}
                </Button>
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
