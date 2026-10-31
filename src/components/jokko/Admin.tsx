import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type PlanName, money } from "@/model";
import { adminDecide, type AdminOverview, adminOverview, adminSetPlan, adminSettings, PLAN_LABELS } from "@/data/plans";

const amount = (n: number) => money(n).replace(/ /g, " ");
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const phone = (p: string) => p.replace(/^221/, "");

/** Administration de la plateforme (CFC) : paiements des abonnements, offres des boutiques, prix et lien Wave. */
export function Admin() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [link, setLink] = useState("");
  const [pm, setPm] = useState("3000");
  const [pa, setPa] = useState("7500");
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState("");

  async function refresh() {
    const d = await adminOverview();
    setData(d);
    if (d) {
      setLink(d.wave_link ?? "");
      setPm(String(d.price_medium));
      setPa(String(d.price_avance));
    }
  }
  useEffect(() => {
    void refresh();
  }, []);

  if (!data) return <section className="sheet"><h2>Administration</h2><p className="note">Chargement… (réservé à CFC)</p></section>;
  const waiting = data.requests.filter((r) => r.status === "en_attente");
  const shops = data.shops.filter((s) => !filter.trim() || `${s.name} ${s.city} ${s.patron_phone}`.toLowerCase().includes(filter.toLowerCase()));
  const paying = data.shops.filter((s) => s.plan !== "gratuit" && s.plan_until && Date.parse(s.plan_until) > Date.now());

  return (
    <section className="admin">
      <div className="sheet">
        <div className="sheet-head"><h2>Administration · CFC</h2><Button variant="outline" className="h-9 rounded-full px-4" onClick={() => void refresh()}>Actualiser</Button></div>
        <div className="kpis">
          <article><span>Boutiques</span><b className="num">{data.shops.length}</b></article>
          <article><span>Offres payées actives</span><b className="num">{paying.length}</b></article>
          <article><span>Paiements à vérifier</span><b className="num">{waiting.length}</b></article>
        </div>
      </div>

      <div className="sheet">
        <h3>Paiements à vérifier</h3>
        <p className="note">Ouvre ton appli Wave Business, retrouve le paiement (montant + référence dans le message), puis touche Activer.</p>
        {waiting.length === 0 ? <p className="note">Aucun paiement en attente.</p> : (
          <ul className="admin-list">
            {waiting.map((r) => (
              <li key={r.id}>
                <span><b>{r.reference}</b> · {r.shop_name} · patron {phone(r.patron_phone)}{r.payer_phone ? ` · payé par ${r.payer_phone}` : ""}<br /><small>{PLAN_LABELS[r.plan]} · {r.months} mois · demandé le {date(r.created_at)}</small></span>
                <b className="num">{amount(r.amount)}</b>
                <span className="row">
                  <Button className="h-9 rounded-full px-4" onClick={async () => { if (await adminDecide(r.id, true)) { setNote(`✓ ${r.shop_name} : offre ${PLAN_LABELS[r.plan]} activée.`); void refresh(); } }}>Activer</Button>
                  <Button variant="ghost" className="h-9 rounded-full px-3" onClick={async () => { if (window.confirm("Refuser ce paiement (introuvable dans Wave) ?") && (await adminDecide(r.id, false))) void refresh(); }}>Refuser</Button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {note && <p className="note">{note}</p>}
      </div>

      <div className="sheet">
        <h3>Boutiques</h3>
        <Input className="h-10" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Chercher (nom, ville, numéro)" />
        <ul className="admin-list">
          {shops.map((s) => (
            <li key={s.id}>
              <span><b>{s.name}</b> · {s.city || "—"} · patron {phone(s.patron_phone)}<br /><small>Offre active : {PLAN_LABELS[s.effective]}{s.plan !== "gratuit" ? ` (payée jusqu'au ${date(s.plan_until)})` : ""}{s.trial_until && Date.parse(s.trial_until) > Date.now() ? ` · essai jusqu'au ${date(s.trial_until)}` : ""} · {s.sales_30} ventes en 30 j</small></span>
              <select className="h-9 rounded-md border px-2" value="" aria-label={`Offre de ${s.name}`} onChange={async (e) => {
                const [plan, m] = e.target.value.split(":");
                if (!plan) return;
                const until = plan === "gratuit" ? null : new Date(Date.now() + Number(m) * 30 * 86_400_000).toISOString();
                if (await adminSetPlan(s.id, plan as PlanName, until)) void refresh();
              }}>
                <option value="">Changer l'offre…</option>
                <option value="avance:6">Avancé offert 6 mois (pilote)</option>
                <option value="avance:1">Avancé 1 mois</option>
                <option value="medium:1">Médium 1 mois</option>
                <option value="gratuit:0">Gratuit</option>
              </select>
            </li>
          ))}
        </ul>
      </div>

      <div className="sheet">
        <h3>Prix et lien de paiement</h3>
        <label className="note" htmlFor="adm-link">Ton lien Wave Business (celui que tu partages pour être payé)</label>
        <Input id="adm-link" className="h-11" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://pay.wave.com/…" />
        <div className="grid-2">
          <Input className="num h-11" inputMode="numeric" value={pm} onChange={(e) => setPm(e.target.value)} aria-label="Prix Médium par mois" />
          <Input className="num h-11" inputMode="numeric" value={pa} onChange={(e) => setPa(e.target.value)} aria-label="Prix Avancé par mois" />
        </div>
        <Button className="h-11 rounded-full px-5" onClick={async () => setNote((await adminSettings(link, Number(pm) || 0, Number(pa) || 0)) ? "✓ Réglages enregistrés." : "Le lien doit commencer par https://")}>Enregistrer</Button>
      </div>
    </section>
  );
}
