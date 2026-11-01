import { Icon } from "./Icon";
import { Button } from "@/components/ui/button";
import { type Lang, type Shop, money, todayStamp, uid } from "@/model";
import { debtList, reminderMessage, setDueIn, whatsappLink } from "@/data/debts";

const dateFr = (d: Date) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

/**
 * Dettes : qui doit combien, pour quand, et relance WhatsApp en un toucher
 * (Jokko écrit le message, le commerçant appuie sur Envoyer dans WhatsApp).
 */
export function Debts({ shop, lang, commit }: { shop: Shop; lang: Lang; commit: (s: Shop) => void }) {
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
            <article key={client.id} className={overdue ? "is-late" : ""}>
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
            </article>
          );
        })}
      </div>
    </section>
  );
}
