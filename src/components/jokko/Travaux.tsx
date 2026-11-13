import { useState } from "react";
import { Icon } from "./Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Repair, type Shop, money } from "@/model";
import { addRepair, cancelRepair, deliverRepair, markRepaired, payRepair, repairsOf } from "@/data/repairs";
import { whatsappLink } from "@/data/debts";

const n = (v: string) => Math.max(0, Math.round(Number(v.replace(/[^\d]/g, "")) || 0));
const dayFr = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const STATUS: Record<Repair["status"], string> = { depot: "En cours", repare: "Prêt · attend le client", rendu: "Livré", annule: "Annulé" };

/**
 * Multiservice (demande de Fallou, 13/11/2026) : commandes à livrer — maillots floqués, bâches, cartes de visite,
 * logos… Client, travail, détails (noms, numéros, tailles), date promise, prix, avance → Prêt (message WhatsApp)
 * → Livré (le reste est payé ou passe en dette). Même carnet que l'atelier (numéros R-001), libellés du multiservice.
 */
export function Travaux({ shop, commit }: { shop: Shop; commit: (s: Shop) => void }) {
  const [filter, setFilter] = useState<"cours" | "livre">("cours");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ client: "", phone: "", work: "", details: "", due: "", price: "", advance: "" });
  const [note, setNote] = useState("");
  const all = repairsOf(shop);
  const open = all.filter((r) => r.status === "depot" || r.status === "repare");
  const list = filter === "cours" ? open : all.filter((r) => r.status === "rendu");
  const owed = open.reduce((a, r) => a + Math.max(0, r.price - r.paid), 0);

  function save() {
    const due = form.due ? ` · pour le ${new Date(`${form.due}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}` : "";
    const done = addRepair(shop, { clientName: form.client, phone: form.phone, device: form.work.trim(), problem: `${form.details.trim()}${due}`.replace(/^ · /, ""), price: n(form.price), advance: n(form.advance) });
    commit(done.shop);
    setNote(`✓ Commande ${done.repair.number} notée${n(form.advance) ? `, avance ${money(n(form.advance))} encaissée` : ""}. Reste : ${money(Math.max(0, done.repair.price - done.repair.paid))}.`);
    setForm({ client: "", phone: "", work: "", details: "", due: "", price: "", advance: "" });
    setAdding(false);
  }

  return (
    <section className="sheet atelier travaux">
      <div className="sheet-head">
        <h2>Commandes à livrer</h2>
        <b className="num sheet-total">{open.length} en cours</b>
      </div>
      <p className="note">
        Maillots floqués, bâches, cartes de visite, logos… : note la commande avec l'avance, touche « Prêt » pour prévenir le client sur WhatsApp, puis « Livré ».
        {open.length ? ` Reste à encaisser : ${money(owed)}.` : ""}
      </p>
      <div className="row">
        <Button className="h-11 rounded-full px-5" onClick={() => setAdding((v) => !v)}><Icon name="ajouter" size="sm" /> Nouvelle commande</Button>
        <Button variant={filter === "cours" ? "default" : "outline"} className="h-10 rounded-full px-4" onClick={() => setFilter("cours")}>En cours</Button>
        <Button variant={filter === "livre" ? "default" : "outline"} className="h-10 rounded-full px-4" onClick={() => setFilter("livre")}>Livrées</Button>
      </div>

      {adding && (
        <div className="service-form">
          <Input className="h-11" placeholder="Client (ex. ASC Mboss)" aria-label="Client" value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} />
          <Input className="h-11" inputMode="tel" placeholder="Téléphone (77 …)" aria-label="Téléphone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input className="h-11" placeholder="Travail (ex. 20 maillots floqués)" aria-label="Travail" value={form.work} onChange={(e) => setForm({ ...form, work: e.target.value })} />
          <Input className="h-11" placeholder="Détails : noms, numéros, tailles, couleurs…" aria-label="Détails" value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} />
          <label className="row">
            <small>Pour le</small>
            <Input className="h-11" type="date" aria-label="Date promise" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
          </label>
          <Input className="h-11 num" inputMode="numeric" placeholder="Prix total (F)" aria-label="Prix" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          <Input className="h-11 num" inputMode="numeric" placeholder="Avance reçue (F)" aria-label="Avance" value={form.advance} onChange={(e) => setForm({ ...form, advance: e.target.value })} />
          {n(form.price) > 0 && <small className="note">Reste à payer à la livraison : {money(Math.max(0, n(form.price) - n(form.advance)))}</small>}
          <Button className="h-11 rounded-full px-5" disabled={!form.client.trim() || !form.work.trim()} onClick={save}><Icon name="sauvegarde" size="sm" /> Enregistrer la commande</Button>
        </div>
      )}
      {note && <p className="note jk-notice" role="status">{note}</p>}

      <div className="list">
        {list.length === 0 && <p className="note">{filter === "cours" ? "Aucune commande en cours." : "Aucune commande livrée."}</p>}
        {list.map((r) => <Job key={r.id} r={r} shop={shop} commit={commit} onNote={setNote} />)}
      </div>
    </section>
  );
}

function Job({ r, shop, commit, onNote }: { r: Repair; shop: Shop; commit: (s: Shop) => void; onNote: (t: string) => void }) {
  const [pay, setPay] = useState("");
  const rest = Math.max(0, r.price - r.paid);
  const msg = `Bonjour ${r.clientName.split(" ")[0]}, c'est ${shop.name}. Votre commande ${r.number} (${r.device}) est prête.${rest ? ` Reste à payer : ${rest.toLocaleString("fr-FR")} F.` : ""} Merci !`;
  const wa = r.phone ? whatsappLink(r.phone, msg) : null;
  return (
    <article>
      <span>
        <b>{r.number} · {r.device}</b> — {r.clientName}
        <small>
          {r.problem ? `${r.problem} · ` : ""}reçue le {dayFr(r.at)} · {STATUS[r.status]}
          {" · "}prix {money(r.price)} · payé {money(r.paid)}{rest ? ` · reste ${money(rest)}` : ""}
        </small>
      </span>
      {r.status !== "rendu" && r.status !== "annule" && (
        <div className="debt-actions" style={{ flexWrap: "wrap", gap: 8, width: "100%" }}>
          {r.status === "depot" && (
            <Button variant="outline" className="h-10 rounded-full px-4" onClick={() => { const s = markRepaired(shop, r.id, []); if (s) { commit(s); onNote(`✓ ${r.number} est prête.${wa ? " Préviens le client sur WhatsApp." : ""}`); } }}>
              <Icon name="ok" size="sm" /> Prêt
            </Button>
          )}
          {wa && r.status === "repare" && <a className="link" href={wa} target="_blank" rel="noreferrer">Prévenir sur WhatsApp</a>}
          <Input className="h-10 num" style={{ width: 130 }} inputMode="numeric" placeholder={rest ? String(rest) : "Montant"} aria-label="Montant payé" value={pay} onChange={(e) => setPay(e.target.value)} />
          <Button variant="outline" className="h-10 rounded-full px-4" disabled={!n(pay)} onClick={() => { const s = payRepair(shop, r.id, n(pay)); if (s) { commit(s); setPay(""); onNote(`✓ Acompte de ${money(n(pay))} encaissé sur ${r.number}.`); } }}>Acompte</Button>
          <Button className="h-10 rounded-full px-4" onClick={() => {
            const paid = pay ? n(pay) : rest;
            const s = deliverRepair(shop, r.id, paid, true);
            if (s) { commit(s); setPay(""); onNote(`✓ ${r.number} livrée${paid ? `, ${money(paid)} encaissés` : ""}${rest - paid > 0 ? `, ${money(rest - paid)} passent en dette` : ""}.`); }
          }}>Livré{rest ? ` (${money(pay ? n(pay) : rest)})` : ""}</Button>
          <button type="button" className="link" onClick={() => commit(cancelRepair(shop, r.id))}>Annuler</button>
        </div>
      )}
    </article>
  );
}
