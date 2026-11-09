import { useState } from "react";
import { Icon } from "./Icon";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { type Client, type Lang, type Shop, money, todayStamp, uid } from "@/model";
import { debtList, payDebt, reminderMessage, setDebt, setDueIn, whatsappLink } from "@/data/debts";

const dateFr = (d: Date) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

/**
 * Dettes : qui doit combien, pour quand, et relance WhatsApp en un toucher
 * (Jokko écrit le message, le commerçant appuie sur Envoyer dans WhatsApp).
 */
export function Debts({ shop, lang, commit, canEdit = true }: { shop: Shop; lang: Lang; commit: (s: Shop) => void; canEdit?: boolean }) {
  const rows = debtList(shop);
  const total = rows.reduce((a, d) => a + d.client.debt, 0);
  const late = rows.filter((d) => d.overdue);

  function remind(clientId: string) {
    const client = shop.clients.find((c) => c.id === clientId);
    if (!client) return;
    const link = whatsappLink(client.phone, reminderMessage(client, shop, lang));
    if (!link) return;
    window.open(link, "_blank", "noopener");
    commit({ ...shop, reminders: [{ id: uid("r"), at: todayStamp(), clientId, note: "Relance WhatsApp" }, ...shop.reminders] });
  }

  return (
    <section className="sheet">
      <div className="sheet-head">
        <h2>Dettes et relances</h2>
        <b className="num sheet-total">{money(total)}</b>
      </div>
      {late.length > 0 && (
        <p className="banner" role="status">
          {late.length} client(s) en retard de paiement : {money(late.reduce((a, d) => a + d.client.debt, 0))}. Touche « Relancer » pour envoyer un message WhatsApp.
        </p>
      )}
      <div className="list">
        {rows.length === 0 && <p className="note">Personne ne te doit d'argent.</p>}
        {rows.map(({ client, dueAt, daysLeft, overdue }) => {
          const reminders = shop.reminders.filter((r) => r.clientId === client.id);
          const last = reminders[0];
          return (
            <article key={client.id} className={overdue ? "is-late" : ""} style={{ flexWrap: "wrap" }}>
              <span>
                {client.name}
                <small>
                  {dueAt
                    ? overdue
                      ? `En retard de ${-(daysLeft ?? 0)} jour(s) (prévu le ${dateFr(dueAt)})`
                      : `À payer avant le ${dateFr(dueAt)}`
                    : "Pas de date"}
                  {last ? ` · relancé le ${dateFr(new Date(last.at))}` : ""}
                </small>
              </span>
              <div className="debt-actions">
                <b className="num owes">{money(client.debt)}</b>
                {client.phone ? (
                  <Button variant={overdue ? "default" : "outline"} className="h-9 rounded-full px-3" onClick={() => remind(client.id)}>
                    <Icon name="whatsapp" size="sm" /> Relancer
                  </Button>
                ) : (
                  <small className="note">Pas de numéro</small>
                )}
                <Button variant="ghost" className="h-9 rounded-full px-3" title="Repousser l'échéance de 7 jours" onClick={() => commit(setDueIn(shop, client.id, Math.max(7, (daysLeft ?? 0) + 7)))}>
                  +7 j
                </Button>
              </div>
              <DebtTools client={client} shop={shop} commit={commit} canEdit={canEdit} />
            </article>
          );
        })}
      </div>
    </section>
  );
}

const num = (v: string) => Number(v.replace(/[^\d]/g, ""));

/** Sous chaque dette : « Il a payé » (avance ou tout), « Modifier » (corriger le montant), « Supprimer » (effacer la dette). */
function DebtTools({ client, shop, commit, canEdit }: { client: Client; shop: Shop; commit: (s: Shop) => void; canEdit: boolean }) {
  const [mode, setMode] = useState<"" | "payer" | "modifier" | "supprimer">("");
  const [value, setValue] = useState("");
  const open = (m: typeof mode) => {
    setMode(m);
    setValue(m === "modifier" ? String(client.debt) : "");
  };
  const done = (next: Shop) => {
    commit(next);
    setMode("");
  };
  const paid = num(value);
  return (
    <div style={{ width: "100%", flexBasis: "100%", marginTop: 6, display: "grid", gap: 8 }}>
      {mode === "" && (
        <div className="debt-actions" style={{ gap: 8, flexWrap: "wrap" }}>
          <Button variant="outline" className="h-10 rounded-full px-4" onClick={() => open("payer")}><Icon name="especes" size="sm" /> Il a payé</Button>
          {canEdit && <Button variant="outline" className="h-10 rounded-full px-4" onClick={() => open("modifier")}><Icon name="modifier" size="sm" /> Modifier</Button>}
          {canEdit && <Button variant="outline" className="h-10 rounded-full px-4" onClick={() => open("supprimer")}><Icon name="supprimer" size="sm" /> Supprimer</Button>}
        </div>
      )}
      {mode === "payer" && (
        <>
          <label className="note">
            Combien {client.name} a payé (avance ou tout) ?
            <Input className="h-11 num" inputMode="numeric" autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder={`Il doit ${money(client.debt)}`} />
          </label>
          {paid > 0 && <small className="note">{paid >= client.debt ? "Dette soldée : elle disparaît de la liste." : `Il restera ${money(client.debt - paid)}.`}</small>}
          <div className="debt-actions" style={{ gap: 8, flexWrap: "wrap" }}>
            <Button className="h-11 rounded-full px-5" disabled={!(paid > 0)} onClick={() => done(payDebt(shop, client.id, paid))}><Icon name="sauvegarde" size="sm" /> Enregistrer</Button>
            <Button variant="outline" className="h-11 rounded-full px-4" onClick={() => done(payDebt(shop, client.id, client.debt))}>Il a tout payé</Button>
            <Button variant="ghost" className="h-11 rounded-full px-4" onClick={() => setMode("")}>Annuler</Button>
          </div>
        </>
      )}
      {mode === "modifier" && (
        <>
          <label className="note">
            Nouveau montant de la dette (F)
            <Input className="h-11 num" inputMode="numeric" autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
          </label>
          <div className="debt-actions" style={{ gap: 8 }}>
            <Button className="h-11 rounded-full px-5" disabled={value.trim() === ""} onClick={() => done(setDebt(shop, client.id, paid))}><Icon name="sauvegarde" size="sm" /> Enregistrer</Button>
            <Button variant="ghost" className="h-11 rounded-full px-4" onClick={() => setMode("")}>Annuler</Button>
          </div>
        </>
      )}
      {mode === "supprimer" && (
        <div className="debt-actions" style={{ gap: 8, flexWrap: "wrap" }}>
          <small className="note" style={{ flex: 1 }}>Effacer toute la dette de {client.name} ({money(client.debt)}) ? Le client reste dans ta liste.</small>
          <Button variant="destructive" className="h-10 rounded-full px-4" onClick={() => done(setDebt(shop, client.id, 0))}>Oui, effacer</Button>
          <Button variant="ghost" className="h-10 rounded-full px-3" onClick={() => setMode("")}>Non</Button>
        </div>
      )}
    </div>
  );
}
