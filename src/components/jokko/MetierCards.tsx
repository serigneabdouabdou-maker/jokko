import { Croissant, Hammer, type LucideIcon, Pill, Printer, Scissors, Shirt, ShoppingBasket, Smartphone, Store, UtensilsCrossed } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ICON_STROKE } from "./Icon";
import { METIERS, type MetierId, metierOf } from "@/data/metiers";

/** Ce que l'écran montre pour chaque métier : dessin, titre court, et ce que Jokko règle tout seul. */
export const METIER_LOOK: Record<MetierId, { icon: LucideIcon; title: string; sub: string; setup: string[] }> = {
  alimentation: {
    icon: ShoppingBasket,
    title: "Alimentation",
    sub: "Boutique, gros et détail",
    setup: ["Stock en sacs, bidons, cartons", "Crédit des clients du quartier", "Alerte quand un article va manquer"],
  },
  reparation: {
    icon: Smartphone,
    title: "Réparation",
    sub: "Téléphones, pièces détachées",
    setup: ["Atelier : dépôts, pannes, avances", "Pièces posées et bénéfice réel", "Message « c'est prêt » sur WhatsApp"],
  },
  pharmacie: {
    icon: Pill,
    title: "Pharmacie",
    sub: "Dépôt de médicaments",
    setup: ["Dates de péremption, lot par lot", "Scan du code carré des boîtes", "Aucun conseil médical : Jokko gère la boutique"],
  },
  quincaillerie: {
    icon: Hammer,
    title: "Quincaillerie",
    sub: "Matériaux, ciment, fer",
    setup: ["Ventes au sac, à la barre, au mètre", "Gros et détail", "Crédit des clients suivi"],
  },
  couture: {
    icon: Scissors,
    title: "Couture",
    sub: "Tailleur, atelier de couture",
    setup: ["Mesures des clients, à la voix", "Commandes, avances, date promise", "Message « ton habit est prêt » sur WhatsApp"],
  },
  restauration: {
    icon: UtensilsCrossed,
    title: "Restauration",
    sub: "Restaurant, dibiterie, jus",
    setup: ["Plats du jour : préparés, vendus, restes", "Coût et bénéfice de chaque plat", "Dépenses du marché et crédit des habitués"],
  },
  boulangerie: {
    icon: Croissant,
    title: "Boulangerie",
    sub: "Pain, pâtisserie",
    setup: ["Fournées : sorties, vendues, invendus", "Pain livré aux boutiques à crédit", "Farine et prix de revient du pain"],
  },
  vetements: {
    icon: Shirt,
    title: "Vêtements",
    sub: "Habits, tissus, chaussures",
    setup: ["Pièces, mètres de tissu, paires", "Ventes à crédit suivies", "Relances sur WhatsApp"],
  },
  multiservice: {
    icon: Printer,
    title: "Multiservice",
    sub: "Impression, photocopie, transfert",
    setup: ["Photocopies et impressions calculées", "Petites réparations au carnet", "Papier et encre suivis"],
  },
  autre: {
    icon: Store,
    title: "Autre activité",
    sub: "Tu l'écris toi-même",
    setup: ["Ventes, stock et caisse", "Dettes des clients", "Exemples simples, sans métier précis"],
  },
};

/** Valeur choisie → id de la carte allumée. Un texte écrit à la main garde la carte « Autre ». */
function selectedId(value: string): MetierId | null {
  if (!value.trim()) return null;
  const exact = METIERS.find((m) => m.label === value);
  if (exact) return exact.id;
  return "autre";
}

/**
 * Choix du métier en cartes illustrées (inscription, nouvelle boutique).
 * Une boutique = un métier : Jokko se règle tout seul d'après ce choix.
 */
export function MetierCards({ value, onChange, compact = false }: { value: string; onChange: (activity: string) => void; compact?: boolean }) {
  const on = selectedId(value);
  const typed = on === "autre" && value !== METIERS.find((m) => m.id === "autre")?.label ? value : "";
  return (
    <div className="metier-pick">
      <div className={`metier-grid${compact ? " is-compact" : ""}`} role="radiogroup" aria-label="Ton métier">
        {METIERS.map((m) => {
          const look = METIER_LOOK[m.id];
          const Glyph = look.icon;
          const active = on === m.id;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={active}
              className={`metier-card${active ? " on" : ""}`}
              onClick={() => onChange(m.id === "autre" ? (typed || m.label) : m.label)}
            >
              <span className="metier-ico" aria-hidden="true">
                <Glyph size={compact ? 22 : 26} strokeWidth={ICON_STROKE} />
              </span>
              <span className="metier-txt">
                <b>{look.title}</b>
                {!compact && <small>{look.sub}</small>}
              </span>
            </button>
          );
        })}
      </div>
      {on === "autre" && (
        <Input
          className="h-11"
          value={typed}
          onChange={(e) => onChange(e.target.value || METIERS.find((m) => m.id === "autre")!.label)}
          placeholder="Écris ton activité (ex. salon de coiffure)"
          aria-label="Ton activité"
        />
      )}
    </div>
  );
}

/** Ce que Jokko règle pour ce métier (affiché sous le choix). */
export function MetierSetup({ value }: { value: string }) {
  const m = metierOf(value);
  const look = METIER_LOOK[m.id];
  return (
    <div className="metier-setup" aria-live="polite">
      <p className="eyebrow">Jokko se règle pour {look.title === "Autre activité" ? "ton activité" : `« ${look.title} »`}</p>
      <ul>
        {look.setup.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </div>
  );
}

/** Le métier choisi à la 1re étape de l'inscription est gardé sur le téléphone jusqu'à l'ouverture de la boutique. */
const KEY = "jokko.metier";
export function rememberMetier(activity: string) {
  try {
    localStorage.setItem(KEY, activity);
  } catch {
    /* navigation privée : on redemandera */
  }
}
export function chosenMetier(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}
export function forgetMetier() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* rien */
  }
}
