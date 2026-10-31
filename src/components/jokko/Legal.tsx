import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { COMPANY, CONTACT_EMAIL, type LegalDoc } from "@/legal";

/** Texte légal en plein écran, lisible sur téléphone, avec un bouton pour revenir. */
export function LegalSheet({ doc, onClose }: { doc: LegalDoc; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="legal-scrim" role="dialog" aria-modal="true" aria-labelledby="legal-title" onClick={onClose}>
      <article className="legal-sheet" onClick={(e) => e.stopPropagation()}>
        <header className="legal-head">
          <h2 id="legal-title">{doc.title}</h2>
          <Button ref={closeRef} variant="outline" className="h-10 rounded-full px-4" onClick={onClose}>Fermer</Button>
        </header>
        <p className="legal-intro">{doc.intro}</p>
        {doc.sections.map((section) => (
          <section key={section.title}>
            <h3>{section.title}</h3>
            {section.text.map((t) => <p key={t}>{t}</p>)}
          </section>
        ))}
        <p className="legal-foot">{COMPANY} · {CONTACT_EMAIL}</p>
        <Button className="h-12 w-full rounded-full text-[15px] font-semibold" onClick={onClose}>J’ai lu, revenir</Button>
      </article>
    </div>
  );
}
