import { useState } from "react";
import { Icon } from "./Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Repair, type Shop, money } from "@/model";
import { addRepair, deliverRepair, markRepaired, partsCost, payRepair, remaining, repairProfit, repairsOf, setRepairPrice, underWarranty, waitingDays } from "@/data/repairs";
import { whatsappLink } from "@/data/debts";

const STATUS: Record<Repair["status"], string> = { depot: "Au dépôt", repare: "Réparé · attend le client", rendu: "Rendu", annule: "Annulé" };
const n = (v: string) => Math.max(0, Math.round(Number(v.replace(/[^\d]/g, "")) || 0));

/**
 * Atelier : le carnet de réparations.
 * Dépôt (client, téléphone, appareil, panne, prix, avance) → Réparé (pièces prises dans le stock) → Rendu (le client paie le reste,
 * ou le reste va en dette). Bénéfice = prix − prix d'achat des pièces.
 */
export function Atelier({ shop, commit }: { shop: Shop; commit: (s: Shop) => void }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ clientName: "", phone: "", device: "", problem: "", price: "", advance: "" });
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<"cours" | "rendu">("cours");
  const list = repairsOf(shop).filter((r) => (filter === "cours" ? r.status === "depot" || r.status === "repare" : r.status === "rendu"));
  const waiting = repairsOf(shop).filter((r) => r.status === "depot" || r.status === "repare");
  const owed = waiting.reduce((a, r) => a + remaining(r), 0);

  function save() {
    if (!form.clientName.trim() || !form.device.trim()) return;
    const { shop: next } = addRepair(shop, { ...form, price: n(form.price), advance: n(form.advance) });
    commit(next);
    setForm({ clientName: "", phone: "", device: "", problem: "", price: "", advance: "" });
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
          <Input className="h-11" inputMode="numeric" placeholder="Prix de la réparation (F) — vide si pas encore fixé" aria-label="Prix" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
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
                {pieces.length === 0 && <small className="note">Ajoute tes pièces dans Stock (avec leur prix d'achat) pour calculer le bénéfice.</small>}
              </div>
              <Button className="h-10 rounded-full" onClick={() => { const next = markRepaired(shop, r.id, parts.map((id) => ({ productId: id }))); if (next) commit(next); }}>
                <Icon name="reparation" size="sm" /> Réparé
              </Button>
            </>
          )}
          {r.parts.length > 0 && (
            <small className="note">
              Pièces : {r.parts.map((p) => p.label).join(", ")} · coût {money(partsCost(r))}
              {r.price ? ` · bénéfice ${money(repairProfit(r))}` : ""}
            </small>
          )}
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
