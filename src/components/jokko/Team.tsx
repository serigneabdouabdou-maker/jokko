import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Shop } from "@/model";
import { whatsappLink } from "@/data/debts";
import { cancelInvite, type Invite, inviteSeller, loadTeam, type Member, removeMember } from "@/data/team";

const APP_URL = "https://jokkoapp.com/";
const show = (phone: string) => phone.replace(/^221/, "").replace(/(\d{2})(\d{3})(\d{2})(\d{2})/, "$1 $2 $3 $4");

/** Message WhatsApp pour prévenir le vendeur : il crée son compte avec ce numéro et retrouve la boutique. */
function inviteMessage(shop: Shop, name: string): string {
  return [
    `Bonjour ${name.split(" ")[0] || ""}, je t'ai ajouté comme vendeur de « ${shop.name} » sur Jokko.`,
    `1. Ouvre ${APP_URL}`,
    "2. Touche « Ouvrir ma boutique » et crée ton compte avec CE numéro de téléphone.",
    `3. La boutique ${shop.name} s'ouvre toute seule.`,
  ].join("\n");
}

/** Écran Équipe (patron) : inviter un vendeur par son numéro, voir l'équipe, retirer un accès. */
export function Team({ shop }: { shop: Shop }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const team = await loadTeam(shop.id);
      setMembers(team.members);
      setInvites(team.invites);
      setLoaded(true);
    } catch {
      setNote("Pas de connexion internet : l'équipe s'affichera quand le réseau reviendra.");
    }
  }, [shop.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function invite() {
    setBusy(true);
    setNote("");
    const error = await inviteSeller(shop.id, phone, name);
    setBusy(false);
    if (error) {
      setNote(error);
      return;
    }
    const link = whatsappLink(phone, inviteMessage(shop, name));
    setNote(`${name || "Le vendeur"} est invité(e). Préviens-le sur WhatsApp pour qu'il crée son compte avec ce numéro.`);
    if (link) window.open(link, "_blank", "noopener");
    setPhone("");
    setName("");
    void refresh();
  }

  return (
    <section className="sheet team">
      <div className="sheet-head">
        <h2>Équipe</h2>
        <span className="note">Le vendeur vend et encaisse. Il ne peut pas changer les prix, voir le bénéfice, ni effacer ce qui est fait : tout reste dans le Journal.</span>
      </div>

      <h3>Inviter un vendeur</h3>
      <form
        className="team-invite"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) void invite();
        }}
      >
        <div className="field">
          <Label htmlFor="inv-name">Son prénom</Label>
          <Input id="inv-name" className="h-11" value={name} onChange={(e) => setName(e.target.value)} placeholder="Moussa" />
        </div>
        <div className="field">
          <Label htmlFor="inv-phone">Son numéro</Label>
          <Input id="inv-phone" className="h-11" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="77 123 45 67" />
        </div>
        <Button type="submit" className="h-11 rounded-full px-5 font-semibold" disabled={busy || phone.replace(/\D/g, "").length < 9 || !name.trim()}>
          {busy ? "Un instant…" : "Inviter"}
        </Button>
      </form>
      {note && <p className="note" role="status">{note}</p>}

      <h3>Dans la boutique</h3>
      {!loaded ? (
        <p className="note">Chargement…</p>
      ) : (
        <div className="list">
          {members.map((m) => (
            <article key={m.user_id}>
              <span>
                <b>{m.name || (m.role === "patron" ? "Patron" : "Vendeur")}</b> · {show(m.phone)} <em>{m.role}</em>
              </span>
              {m.role === "vendeur" && (
                <Button
                  variant="outline"
                  className="h-9 rounded-full px-4"
                  onClick={async () => {
                    if (!window.confirm(`Retirer l'accès de ${m.name || show(m.phone)} ? Il ne pourra plus ouvrir la boutique.`)) return;
                    setNote((await removeMember(shop.id, m.user_id)) ? "Accès retiré." : "Impossible pour le moment. Vérifie la connexion internet.");
                    void refresh();
                  }}
                >
                  Retirer
                </Button>
              )}
            </article>
          ))}
        </div>
      )}

      {invites.length > 0 && (
        <>
          <h3>Invitations en attente</h3>
          <div className="list">
            {invites.map((i) => (
              <article key={i.id}>
                <span>
                  <b>{i.name || "Vendeur"}</b> · {show(i.phone)} <em>n'a pas encore créé son compte</em>
                </span>
                <span className="row">
                  <Button variant="ghost" className="h-9 rounded-full px-3" onClick={() => {
                    const link = whatsappLink(i.phone, inviteMessage(shop, i.name));
                    if (link) window.open(link, "_blank", "noopener");
                  }}>Renvoyer</Button>
                  <Button variant="outline" className="h-9 rounded-full px-3" onClick={async () => {
                    await cancelInvite(i.id);
                    void refresh();
                  }}>Annuler</Button>
                </span>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
