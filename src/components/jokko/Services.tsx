import { useState } from "react";
import { Icon } from "./Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Payment, PAYMENT_LABELS, type ServiceItem, type Shop, money } from "@/model";
import { clientFor } from "@/data/repairs";
import { addCommonServices, addLicence, licenceStats, licencesOf, removeLicence, removeService, saveService, sellService, servicesOf, servicesMonth } from "@/data/services";

const n = (v: string) => Math.max(0, Math.round(Number(v.replace(/[^\d]/g, "")) || 0));
const PAY: Payment[] = ["especes", "wave", "om"];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const day = (d: Date) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

/**
 * Services sans pièce (décodage, configuration, création de compte, maintenance…) : un toucher, le prix, encaissé.
 * Tout est main-d'œuvre. Licences des outils (décodage) : prix, durée, ce qu'elles ont rapporté, fin proche.
 */
export function Services({ shop, commit, canEdit }: { shop: Shop; commit: (s: Shop) => void; canEdit: boolean }) {
  const services = servicesOf(shop);
  const licences = licencesOf(shop);
  const month = servicesMonth(shop);
  const [picked, setPicked] = useState<ServiceItem | null>(null);
  const [amount, setAmount] = useState("");
  const [payment, setPayment] = useState<Payment>("especes");
  const [who, setWho] = useState({ name: "", phone: "" });
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ id: "", name: "", price: "", licenceId: "" });

  function pick(s: ServiceItem) {
    setPicked(s);
    setAmount(String(s.price));
    setPayment("especes");
    setWho({ name: "", phone: "" });
    setNote("");
  }

  function cash() {
    if (!picked) return;
    // Client noté (facultatif) : le service entre dans sa fiche.
    const known = who.name.trim() || who.phone.replace(/\D/g, "").length >= 9 ? clientFor(shop, who.name, who.phone.replace(/\D/g, "")) : null;
    const base = known ? { ...shop, clients: known.clients } : shop;
    const done = sellService(base, { name: picked.name, amount: n(amount), licenceId: picked.licenceId, payment, ...(known ? { clientId: known.client.id } : {}) });
    if (!done) return;
    commit(done.shop);
    setNote(`✓ ${picked.name} encaissé : ${money(done.sale.amount)} (${PAYMENT_LABELS[payment]}). Tout est main-d'œuvre.`);
    setPicked(null);
  }

  function saveDraft() {
    if (!draft.name.trim()) return;
    commit(saveService(shop, { ...(draft.id ? { id: draft.id } : {}), name: draft.name, price: n(draft.price), ...(draft.licenceId ? { licenceId: draft.licenceId } : {}) }));
    setDraft({ id: "", name: "", price: "", licenceId: "" });
  }

  return (
    <section className="sheet services">
      <div className="sheet-head">
        <h2>Services sans pièce</h2>
        <b className="num sheet-total">{month.count} ce mois · {money(month.earned)}</b>
      </div>
      <p className="note">Décodage, configuration, création de compte, maintenance… : le client paie tout de suite, il n'y a pas de pièce. Tout le prix est ton gain. Tu peux aussi le dire à Jokko : « décodage 5 000 ».</p>

      {services.length === 0 ? (
        canEdit ? (
          <Button className="h-11 rounded-full px-5" onClick={() => commit(addCommonServices(shop))}>
            <Icon name="ajouter" size="sm" /> Ajouter les services courants (décodage, configuration…)
          </Button>
        ) : (
          <p className="note">Le patron n'a pas encore mis la liste des services.</p>
        )
      ) : (
        <div className="service-grid">
          {services.map((s) => (
            <button key={s.id} type="button" className={`service-tile${picked?.id === s.id ? " on" : ""}`} onClick={() => pick(s)}>
              <b>{s.name}</b>
              <span className="num">{money(s.price)}</span>
              {s.licenceId && <small>licence {licences.find((l) => l.id === s.licenceId)?.name ?? ""}</small>}
            </button>
          ))}
        </div>
      )}

      {picked && (
        <div className="service-pay">
          <label>
            <small>Prix payé pour « {picked.name} »</small>
            <Input className="h-11 num" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Prix payé" />
          </label>
          <div className="service-who">
            <Input className="h-10" placeholder="Client (facultatif)" aria-label="Nom du client" value={who.name} onChange={(e) => setWho({ ...who, name: e.target.value })} />
            <Input className="h-10" inputMode="tel" placeholder="Téléphone (77 …)" aria-label="Téléphone du client" value={who.phone} onChange={(e) => setWho({ ...who, phone: e.target.value })} />
          </div>
          <div className="seg" role="radiogroup" aria-label="Paiement">
            {PAY.map((p) => (
              <button key={p} type="button" role="radio" aria-checked={payment === p} className={payment === p ? "on" : ""} onClick={() => setPayment(p)}>{PAYMENT_LABELS[p]}</button>
            ))}
          </div>
          <div className="row">
            <Button className="h-11 rounded-full px-5" disabled={!n(amount)} onClick={cash}>
              <Icon name="ok" size="sm" /> Encaisser {n(amount) ? money(n(amount)) : ""}
            </Button>
            <Button variant="ghost" className="h-11 rounded-full px-4" onClick={() => setPicked(null)}>Annuler</Button>
          </div>
        </div>
      )}
      {note && <p className="note jk-notice" role="status">{note}</p>}

      {canEdit && services.length > 0 && (
        <button type="button" className="link" onClick={() => setEditing((v) => !v)}>{editing ? "Fermer la liste des prix" : "Changer mes services et mes prix"}</button>
      )}
      {canEdit && editing && (
        <div className="service-edit">
          {services.map((s) => (
            <div key={s.id} className="row">
              <span>{s.name} · {money(s.price)}{s.licenceId ? ` · licence ${licences.find((l) => l.id === s.licenceId)?.name ?? ""}` : ""}</span>
              <button type="button" className="link" onClick={() => setDraft({ id: s.id, name: s.name, price: String(s.price), licenceId: s.licenceId ?? "" })}>Modifier</button>
              <button type="button" className="link" onClick={() => commit(removeService(shop, s.id))}>Enlever</button>
            </div>
          ))}
          <div className="service-form">
            <Input className="h-10" placeholder="Service (ex. Décodage Samsung)" aria-label="Nom du service" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <Input className="h-10" inputMode="numeric" placeholder="Prix (F)" aria-label="Prix du service" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
            {licences.length > 0 && (
              <select className="native-select h-10" aria-label="Licence utilisée" value={draft.licenceId} onChange={(e) => setDraft({ ...draft, licenceId: e.target.value })}>
                <option value="">Sans licence</option>
                {licences.map((l) => <option key={l.id} value={l.id}>Licence {l.name}</option>)}
              </select>
            )}
            <Button className="h-10 rounded-full px-4" disabled={!draft.name.trim()} onClick={saveDraft}>{draft.id ? "Enregistrer" : "Ajouter"}</Button>
          </div>
        </div>
      )}

      {canEdit && <Licences shop={shop} commit={commit} />}
    </section>
  );
}

/** Licences des outils (décodage…) : payées d'un coup, réparties sur leur durée dans les bénéfices. */
function Licences({ shop, commit }: { shop: Shop; commit: (s: Shop) => void }) {
  const licences = licencesOf(shop);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", cost: "", months: "12", fromCash: true });
  const [note, setNote] = useState("");

  function save(base?: { name: string; cost: number; months: number; startAt?: string }) {
    const input = base ?? { name: form.name, cost: n(form.cost), months: n(form.months) || 12 };
    const done = addLicence(shop, { ...input, fromCash: form.fromCash });
    if (!done) return;
    commit(done.shop);
    const perMonth = Math.round(done.licence.cost / done.licence.months);
    setNote(`✓ Licence ${done.licence.name} : ${money(done.licence.cost)} pour ${done.licence.months} mois. Dans tes bénéfices, elle compte ${money(perMonth)} par mois.`);
    setForm({ name: "", cost: "", months: "12", fromCash: true });
    setAdding(false);
  }

  return (
    <div className="licences">
      <div className="sheet-head">
        <h3>Mes licences</h3>
        <Button variant="outline" className="h-10 rounded-full px-4" onClick={() => setAdding((v) => !v)}>
          <Icon name="ajouter" size="sm" /> Nouvelle licence
        </Button>
      </div>
      <p className="note">Un outil de décodage payé 90 000 F pour 1 an ne compte pas 90 000 F de perte le jour de l'achat : Jokko le répartit, 7 500 F par mois, et te montre ce qu'il t'a rapporté.</p>
      {adding && (
        <div className="service-form">
          <Input className="h-10" placeholder="Nom de l'outil (ex. Chimera, UnlockTool)" aria-label="Nom de la licence" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input className="h-10" inputMode="numeric" placeholder="Prix payé (F)" aria-label="Prix de la licence" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
          <label className="row">
            <Input className="h-10 num" inputMode="numeric" aria-label="Durée en mois" value={form.months} onChange={(e) => setForm({ ...form, months: e.target.value })} style={{ width: 80 }} />
            <span>mois</span>
          </label>
          <label className="row">
            <input type="checkbox" checked={form.fromCash} onChange={(e) => setForm({ ...form, fromCash: e.target.checked })} />
            <span>Payée avec l'argent de la caisse aujourd'hui</span>
          </label>
          <Button className="h-10 rounded-full px-4" disabled={!form.name.trim() || !n(form.cost)} onClick={() => save()}>Enregistrer la licence</Button>
        </div>
      )}
      {note && <p className="note jk-notice" role="status">{note}</p>}
      {licences.length === 0 ? (
        <p className="note">Aucune licence notée.</p>
      ) : (
        <div className="list">
          {licences.map((l) => {
            const st = licenceStats(shop, l);
            return (
              <article key={l.id} className={st.expired || st.soon ? "is-late" : ""}>
                <span>
                  <b>{l.name}</b> · {money(l.cost)} pour {l.months} mois ({money(st.perMonth)} / mois)
                  <small>
                    {st.expired ? `Finie le ${day(st.endsAt)}` : `Finit le ${day(st.endsAt)} · reste ${st.daysLeft} jour${st.daysLeft > 1 ? "s" : ""}`}
                    {" · "}
                    {st.uses} service{st.uses > 1 ? "s" : ""} · rapporté {money(st.earned)}
                    {st.paidBack >= 1 ? " · déjà remboursée" : ` · remboursée à ${Math.round(st.paidBack * 100)} %`}
                  </small>
                  <span className="licence-bar" aria-hidden="true"><i style={{ width: `${Math.round(st.used * 100)}%` }} /></span>
                </span>
                <div className="debt-actions">
                  {(st.expired || st.soon) && (
                    <Button variant="outline" className="h-9 rounded-full px-3" onClick={() => save({ name: l.name, cost: l.cost, months: l.months, ...(st.expired ? {} : { startAt: ymd(st.endsAt) }) })}>Renouveler</Button>
                  )}
                  <button type="button" className="link" onClick={() => commit(removeLicence(shop, l.id))}>Enlever</button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
