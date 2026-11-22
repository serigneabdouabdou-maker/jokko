/**
 * Pages à entrer (15/11/2026, demande de Fallou : « tu cliques, ça entre, il y a un bouton de retour »).
 *
 * Sur téléphone et tablette, un écran à plusieurs parties montre d'abord un sommaire : chaque partie est une
 * ligne (icône, titre, résumé, pastille). Un toucher l'ouvre en plein écran avec « ← Retour » ; le bouton retour
 * d'Android ferme aussi la page. Sur ordinateur, tout reste affiché comme avant (rien ne change).
 *
 * - <DrillScope> : une seule page ouverte à la fois, par écran.
 * - <Drill id title …> : une partie de l'écran.
 * - <DrillOverview> : ce qui reste visible sur le sommaire (chiffres clés…), caché quand une partie est ouverte.
 */
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { Icon, type IconName } from "./Icon";

const PHONE = "(max-width: 1023px)";

export function usePhone(): boolean {
  const [phone, setPhone] = useState(() => typeof window !== "undefined" && window.matchMedia?.(PHONE).matches === true);
  useEffect(() => {
    const media = window.matchMedia?.(PHONE);
    if (!media) return;
    const change = () => setPhone(media.matches);
    change();
    media.addEventListener?.("change", change);
    return () => media.removeEventListener?.("change", change);
  }, []);
  return phone;
}

type Scope = { open: string | null; enter: (id: string) => void; leave: () => void; phone: boolean };
const DrillContext = createContext<Scope | null>(null);

export function DrillScope({ children, initial }: { children: ReactNode; initial?: string }) {
  const phone = usePhone();
  const [open, setOpen] = useState<string | null>(initial ?? null);

  // Ouvert depuis la cloche : la page voulue est déjà ouverte, « Retour » revient au sommaire.
  useEffect(() => {
    if (!initial) return;
    try {
      window.history.pushState({ jokkoDrill: initial }, "");
    } catch {
      /* rien */
    }
    // Ordinateur : pas de pages, on descend jusqu'à la partie.
    window.setTimeout(() => document.getElementById(`drill-${initial}`)?.scrollIntoView({ block: "start" }), 50);
  }, [initial]);

  useEffect(() => {
    const back = () => setOpen(null);
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);

  const enter = useCallback((id: string) => {
    setOpen(id);
    try {
      window.history.pushState({ jokkoDrill: id }, "");
    } catch {
      /* rien */
    }
    window.scrollTo({ top: 0 });
  }, []);
  const leave = useCallback(() => {
    if ((window.history.state as { jokkoDrill?: string } | null)?.jokkoDrill) window.history.back();
    else setOpen(null);
    window.scrollTo({ top: 0 });
  }, []);

  return <DrillContext.Provider value={{ open: phone ? open : null, enter, leave, phone }}>{children}</DrillContext.Provider>;
}

/** Une partie de l'écran : sommaire + page plein écran sur téléphone ; inchangée sur ordinateur. */
export function Drill({
  id,
  title,
  icon,
  summary,
  badge,
  tone,
  children,
}: {
  id: string;
  title: string;
  icon: IconName;
  summary?: ReactNode;
  badge?: number;
  tone?: "grave" | "attention";
  children: ReactNode;
}) {
  const scope = useContext(DrillContext);
  if (!scope || !scope.phone) return <><span id={`drill-${id}`} className="drill-anchor" aria-hidden="true" />{children}</>;
  if (scope.open === id) {
    return (
      <div className="drill-page">
        <div className="drill-head">
          <button type="button" className="drill-back" onClick={scope.leave}>
            <Icon name="retour" size="md" />
            <span>Retour</span>
          </button>
          <b>{title}</b>
        </div>
        {children}
      </div>
    );
  }
  if (scope.open) return null;
  return (
    <button type="button" className="drill-entry" data-tone={tone} onClick={() => scope.enter(id)}>
      <span className="drill-ico"><Icon name={icon} size="md" /></span>
      <span className="drill-txt">
        <b>{title}</b>
        {summary ? <small>{summary}</small> : null}
      </span>
      {badge ? <span className="badge-dot num" data-tone={tone}>{badge > 99 ? "99+" : badge}</span> : null}
      <Icon name="suivant" size="sm" className="drill-go" />
    </button>
  );
}

/** Contenu du sommaire (chiffres clés, liste principale) : caché quand une partie est ouverte sur téléphone. */
export function DrillOverview({ children }: { children: ReactNode }) {
  const scope = useContext(DrillContext);
  if (scope?.phone && scope.open) return null;
  return <>{children}</>;
}

/** Groupe de lignes du sommaire (une carte avec les entrées les unes sous les autres). */
export function DrillList({ children, title }: { children: ReactNode; title?: string }) {
  const scope = useContext(DrillContext);
  if (!scope?.phone) return <>{children}</>;
  if (scope.open) return <>{children}</>;
  return (
    <div className="drill-list">
      {title ? <p className="drill-list-title">{title}</p> : null}
      {children}
    </div>
  );
}
