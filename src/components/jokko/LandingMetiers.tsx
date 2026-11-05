import { type CSSProperties, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon, ICON_STROKE } from "@/components/jokko/Icon";
import { METIER_LOOK, rememberMetier } from "@/components/jokko/MetierCards";
import { METIERS, type MetierId } from "@/data/metiers";

type Tone = "ok" | "bas" | "alerte" | "neutre";
type Row = { name: string; sub?: string; value: string; tone?: Tone; bar?: number };

/** Ce que l'écran de Jokko montre pour chaque métier (exemples, aucun vrai client). */
const SHOW: Partial<Record<MetierId, { cta: string; screen: string; said: string; rows: Row[]; foot: string }>> = {
  alimentation: {
    cta: "Ouvrir ma boutique",
    screen: "Stock",
    said: "Il me reste combien de riz ?",
    rows: [
      { name: "Riz brisé", sub: "sacs de 50 kg", value: "12", bar: 80, tone: "ok" },
      { name: "Huile", sub: "bidons de 20 L", value: "3", bar: 18, tone: "bas" },
      { name: "Sucre", sub: "kilos", value: "40", bar: 60, tone: "ok" },
    ],
    foot: "L'huile va manquer : Jokko prévient avant la rupture.",
  },
  reparation: {
    cta: "Ouvrir mon atelier",
    screen: "Atelier",
    said: "Awa dépose un iPhone 11, écran cassé, avance 5 000.",
    rows: [
      { name: "R-014 · Awa", sub: "iPhone 11 · écran cassé", value: "Au dépôt", tone: "neutre" },
      { name: "R-013 · Modou", sub: "Tecno Spark · connecteur", value: "Prêt", tone: "ok" },
      { name: "R-011 · Ibou", sub: "Samsung A12 · batterie", value: "Reste 7 500 F", tone: "bas" },
    ],
    foot: "Bénéfice de chaque réparation = prix − pièces posées.",
  },
  pharmacie: {
    cta: "Ouvrir ma pharmacie",
    screen: "Péremption",
    said: "Quels produits périment bientôt ?",
    rows: [
      { name: "Paracétamol 500 mg", sub: "lot A23 · 14 boîtes", value: "12 jours", tone: "alerte" },
      { name: "Sirop contre la toux", sub: "lot S07 · 8 flacons", value: "45 jours", tone: "bas" },
      { name: "Pommade", sub: "lot P11 · 20 tubes", value: "8 mois", tone: "ok" },
    ],
    foot: "Un scan du code carré remplit le produit, la date et le lot. Jokko ne donne jamais de conseil médical.",
  },
  quincaillerie: {
    cta: "Ouvrir ma quincaillerie",
    screen: "Stock",
    said: "Vends 10 sacs de ciment à Moussa, il paie à la fin du mois.",
    rows: [
      { name: "Ciment", sub: "sacs", value: "42", bar: 70, tone: "ok" },
      { name: "Fer de 10", sub: "barres", value: "18", bar: 45, tone: "ok" },
      { name: "Peinture blanche", sub: "pots", value: "4", bar: 15, tone: "bas" },
    ],
    foot: "Moussa doit 45 000 F : la dette est notée, la relance est prête.",
  },
  vetements: {
    cta: "Ouvrir ma boutique",
    screen: "Ventes à crédit",
    said: "Awa prend 5 mètres de bazin, elle paie samedi.",
    rows: [
      { name: "Awa", sub: "bazin · 5 m", value: "25 000 F", tone: "bas" },
      { name: "Fatou", sub: "2 pantalons", value: "12 000 F", tone: "bas" },
      { name: "Bazin riche", sub: "mètres en stock", value: "30 m", tone: "ok" },
    ],
    foot: "Chaque crédit a sa date : Jokko rappelle qui doit payer.",
  },
  multiservice: {
    cta: "Ouvrir mon multiservice",
    screen: "Caisse du jour",
    said: "50 photocopies à 25.",
    rows: [
      { name: "Photocopies", sub: "50 × 25 F", value: "1 250 F", tone: "ok" },
      { name: "Impressions", sub: "couleur", value: "3 000 F", tone: "ok" },
      { name: "Papier A4", sub: "rames en stock", value: "2", tone: "bas" },
    ],
    foot: "Le calcul est fait par Jokko, au franc près.",
  },
};

const SHOWN = METIERS.filter((m) => SHOW[m.id]);

/** Section « Jokko pour votre métier » de la page d'accueil : un onglet par métier, un écran d'exemple, un bouton qui ouvre l'inscription avec ce métier choisi. */
export function LandingMetiers({ onStart }: { onStart: () => void }) {
  const [id, setId] = useState<MetierId>("reparation");
  const m = METIERS.find((x) => x.id === id) ?? SHOWN[0];
  const look = METIER_LOOK[m.id];
  const show = SHOW[m.id]!;
  const Glyph = look.icon;

  function start(label: string) {
    rememberMetier(label);
    onStart();
  }

  return (
    <section className="lx-met" id="metiers" aria-labelledby="lx-met-title">
      <div className="section-head">
        <p className="eyebrow">Un Jokko pour chaque métier</p>
        <h2 id="lx-met-title">
          Votre métier. <em className="accent">Votre Jokko.</em>
        </h2>
        <p className="lede">À l'inscription, vous choisissez votre activité : Jokko se règle tout seul, avec les bons écrans, les bons mots et les bonnes alertes.</p>
      </div>

      <div className="lx-met-tabs" role="tablist" aria-label="Métiers">
        {SHOWN.map((x) => {
          const L = METIER_LOOK[x.id];
          const G = L.icon;
          return (
            <button key={x.id} type="button" role="tab" aria-selected={x.id === id} aria-controls="lx-met-panel" className={x.id === id ? "on" : ""} onClick={() => setId(x.id)}>
              <G size={18} strokeWidth={ICON_STROKE} aria-hidden="true" />
              {L.title}
            </button>
          );
        })}
      </div>

      <div className="lx-met-panel" id="lx-met-panel" role="tabpanel" key={m.id}>
        <div className="lx-met-copy">
          <span className="lx-met-badge" aria-hidden="true">
            <Glyph size={30} strokeWidth={ICON_STROKE} />
          </span>
          <h3>{look.title}</h3>
          <p className="lx-met-sub">{look.sub}</p>
          <ul className="lx-met-list">
            {look.setup.map((s, i) => (
              <li key={s} style={{ "--i": i } as CSSProperties}>
                <Icon name="ok" size="sm" />
                {s}
              </li>
            ))}
          </ul>
          <Button className="lx-cta h-12 rounded-full px-6 text-[15px] font-semibold" onClick={() => start(m.label)}>
            {show.cta} <Icon name="suivant" size="sm" className="lx-arrow" />
          </Button>
        </div>

        <figure className="lx-met-phone" aria-label={`Exemple d'écran de Jokko pour ${look.title}`}>
          <div className="lx-met-top">
            <span><Glyph size={16} strokeWidth={ICON_STROKE} aria-hidden="true" /> {show.screen}</span>
            <small>Jokko</small>
          </div>
          <p className="lx-met-said">
            <span className="lx-met-mic" aria-hidden="true"><i /><i /><i /></span>« {show.said} »
          </p>
          <div className="lx-met-rows">
            {show.rows.map((r, i) => (
              <div key={r.name} className="lx-met-row" data-tone={r.tone ?? "neutre"} style={{ "--i": i } as CSSProperties}>
                <span className="lx-met-name">
                  <b>{r.name}</b>
                  {r.sub && <small>{r.sub}</small>}
                  {r.bar !== undefined && <i className="lx-met-bar" style={{ "--w": `${r.bar}%` } as CSSProperties} />}
                </span>
                <span className="lx-met-val num">{r.value}</span>
              </div>
            ))}
          </div>
          <figcaption>{show.foot}</figcaption>
        </figure>
      </div>

      <p className="lx-met-more">
        Votre activité n'est pas dans la liste ?{" "}
        <button type="button" className="link" onClick={() => start(METIERS[METIERS.length - 1].label)}>
          Choisissez « Autre activité »
        </button>{" "}
        : Jokko gère quand même vos ventes, votre stock et vos dettes.
      </p>
    </section>
  );
}
