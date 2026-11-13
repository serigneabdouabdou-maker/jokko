import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Shop, money } from "@/model";
import { campaignMessage, type ClientFile, rankClients, type Segment, SEGMENTS } from "@/data/clientFiles";
import { whatsappLink } from "@/data/debts";

const ORDER: Segment[] = ["fidele", "bon", "nouveau", "relancer", "payeur"];
const date = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—");
const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Fiches clients : l'historique de chaque client (appareils, pannes, dates, prix, services, dettes),
 * et les clients classés (fidèles, bons, nouveaux, à relancer, mauvais payeurs) pour les campagnes WhatsApp.
 */
export function ClientFiles({ shop, canEdit }: { shop: Shop; canEdit: boolean }) {
  const ranked = useMemo(() => rankClients(shop), [shop]);
  const [segment, setSegment] = useState<Segment | "tous">("tous");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [campaign, setCampaign] = useState(false);
  const [offer, setOffer] = useState("");
  const [sent, setSent] = useState<string[]>([]);

  const counts = Object.fromEntries(ORDER.map((s) => [s, ranked.filter((f) => f.segment === s).length])) as Record<Segment, number>;
  const q = plain(query.trim());
  const digits = query.replace(/\D/g, "");
  const list = ranked
    .filter((f) => f.segment !== "aucun" || segment === "tous")
    .filter((f) => segment === "tous" || f.segment === segment)
    .filter((f) => !q || plain(f.client.name).includes(q) || (digits.length >= 3 && f.client.phone.replace(/\D/g, "").includes(digits)));
  const file = open ? ranked.find((f) => f.client.id === open) : undefined;

  return (
    <section className="sheet client-files">
      <div className="sheet-head">
        <h2>Fiches clients</h2>
        <b className="num sheet-total">{ranked.filter((f) => f.visits > 0).length} clients</b>
      </div>
      <p className="note">Chaque client garde son historique : appareils, pannes, dates, prix, services. Quand il revient, tu sais tout de suite qui c'est.</p>

      <div className="seg" role="tablist" aria-label="Groupes de clients">
        <button type="button" role="tab" aria-selected={segment === "tous"} className={segment === "tous" ? "on" : ""} onClick={() => setSegment("tous")}>Tous</button>
        {ORDER.map((s) => (
          <button key={s} type="button" role="tab" aria-selected={segment === s} className={segment === s ? "on" : ""} onClick={() => setSegment(s)}>
            {SEGMENTS[s].label} {counts[s] ? `(${counts[s]})` : ""}
          </button>
        ))}
      </div>
      {segment !== "tous" && <p className="note">{SEGMENTS[segment].hint}</p>}
      <Input className="h-11" placeholder="Cherche un nom ou un numéro" aria-label="Chercher un client" value={query} onChange={(e) => setQuery(e.target.value)} />

      {canEdit && segment !== "tous" && list.length > 0 && (
        <div className="campaign">
          <Button variant={campaign ? "default" : "outline"} className="h-10 rounded-full px-4" onClick={() => setCampaign((v) => !v)}>
            <Icon name="whatsapp" size="sm" /> Campagne WhatsApp : {SEGMENTS[segment].label.toLowerCase()} ({list.length})
          </Button>
          {campaign && (
            <div className="fields">
              <Input className="h-10" placeholder="Ton offre, si tu veux (ex. −10 % sur l'écran cette semaine)" aria-label="Offre" value={offer} onChange={(e) => setOffer(e.target.value)} />
              <p className="note">Exemple : « {campaignMessage(list[0], shop.name, offer)} »</p>
              <p className="note">Touche chaque client : WhatsApp s'ouvre avec le message prêt, tu n'as plus qu'à envoyer.</p>
            </div>
          )}
        </div>
      )}

      <div className="list">
        {list.length === 0 && <p className="note">Aucun client ici pour le moment.</p>}
        {list.slice(0, 60).map((f) => {
          const link = campaign && f.client.phone ? whatsappLink(f.client.phone, campaignMessage(f, shop.name, offer)) : null;
          return (
            <article key={f.client.id} className={f.segment === "payeur" ? "is-late" : ""}>
              <span onClick={() => setOpen(open === f.client.id ? null : f.client.id)} style={{ cursor: "pointer" }}>
                <b>{f.client.name}</b> <small className={`seg-badge seg-${f.segment}`}>{SEGMENTS[f.segment].label.replace(/s$/, "")}</small>
                <small>
                  {f.visits} visite{f.visits > 1 ? "s" : ""} · {money(f.spent)} · dernière : {date(f.lastAt)}
                  {f.devices.length ? ` · ${f.devices.slice(0, 2).join(", ")}` : ""}
                </small>
              </span>
              <div className="debt-actions">
                {campaign ? (
                  link ? (
                    <Button variant={sent.includes(f.client.id) ? "outline" : "default"} className="h-9 rounded-full px-3" onClick={() => { window.open(link, "_blank", "noopener"); setSent([...sent, f.client.id]); }}>
                      {sent.includes(f.client.id) ? "Envoyé" : "Envoyer"}
                    </Button>
                  ) : (
                    <small className="note">pas de numéro</small>
                  )
                ) : (
                  <b className="num">{f.score}/100</b>
                )}
              </div>
              {open === f.client.id && file && <Fiche f={file} shopName={shop.name} />}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Fiche({ f, shopName }: { f: ClientFile; shopName: string }) {
  const wa = f.client.phone ? whatsappLink(f.client.phone, `Salaam ${f.client.name.split(" ")[0]}, c'est ${shopName}.`) : null;
  return (
    <div className="fiche">
      <div className="kpis">
        <article><span>Visites</span><b className="num">{f.visits}</b></article>
        <article><span>Dépensé chez toi</span><b className="num">{money(f.spent)}</b></article>
        <article><span>Client depuis</span><b>{date(f.firstAt)}</b></article>
        <article><span>Reste / dette</span><b className="num">{money(f.owedRepairs + f.debt)}</b></article>
      </div>
      <p className="note">
        {f.client.phone ? `Téléphone : ${f.client.phone}. ` : "Pas de numéro noté. "}
        {f.devices.length ? `Appareils : ${f.devices.join(", ")}. ` : ""}
        {f.underWarranty.length ? `Sous garantie : ${f.underWarranty.map((r) => `${r.number} (${r.device})`).join(", ")}. ` : ""}
        {f.late ? "Dette en retard : à régler avant un nouveau crédit." : ""}
      </p>
      {wa && (
        <div className="row">
          <Button variant="outline" className="h-9 rounded-full px-3" onClick={() => window.open(wa, "_blank", "noopener")}><Icon name="whatsapp" size="sm" /> WhatsApp</Button>
          <Button variant="outline" className="h-9 rounded-full px-3" onClick={() => window.open(`tel:${f.client.phone}`, "_self")}>Appeler</Button>
        </div>
      )}
      <h4>Historique</h4>
      {f.entries.length === 0 ? (
        <p className="note">Rien encore.</p>
      ) : (
        <ol className="fiche-history">
          {f.entries.slice(0, 30).map((e, i) => (
            <li key={i}>
              <small>{date(e.at)}</small>
              <span>
                <b>{e.kind === "reparation" ? "Réparation" : e.kind === "service" ? "Service" : "Achat"} · {e.title}</b>
                {e.detail ? ` — ${e.detail}` : ""}
                {e.status ? <em> ({e.status})</em> : null}
              </span>
              <b className="num">{money(e.amount)}</b>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
