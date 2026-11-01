import { type CSSProperties, useState } from "react";
import { Icon, type IconName } from "./Icon";

/**
 * « Qui est derrière Jokko » : l'entreprise CFC, son fondateur, ses métiers et ses réalisations.
 * Les logos des réalisations sont chargés depuis leurs propres sites ; s'ils ne répondent pas, on affiche les initiales.
 */

export const CFC_WHATSAPP = "221775674725";
export const CFC_WHATSAPP_LABEL = "77 567 47 25";
export const CFC_EMAIL = "cfallou26@gmail.com";
export const cfcWhatsappLink = (text = "Bonjour CFC, je viens de la page Jokko.") => `https://wa.me/${CFC_WHATSAPP}?text=${encodeURIComponent(text)}`;
export const CFC_LOGO = `${import.meta.env.BASE_URL}cfc-logo.webp`;

const at = (i: number) => ({ "--i": i }) as CSSProperties;

type Project = { name: string; url: string; host: string; image: string; imageFit: "logo" | "banner"; initials: string; icon: IconName; tags: string[]; text: string; color: string };

export const CFC_PROJECTS: Project[] = [
  {
    name: "Sunu Bulletin",
    url: "https://sunubulletin.com/",
    host: "sunubulletin.com",
    image: "https://sunubulletin.com/assets/logo.png",
    imageFit: "logo",
    initials: "SB",
    icon: "ecole",
    tags: ["Éducation", "Gratuit", "Marche sans internet"],
    text: "Le logiciel de gestion scolaire des écoles primaires du Sénégal : classes du CI au CM2, notes, moyennes au barème officiel et bulletins PDF prêts à imprimer.",
    color: "#1565C0",
  },
  {
    name: "Smart Map Mboss",
    url: "https://www.mbosssmartmap.com/",
    host: "mbosssmartmap.com",
    image: "https://mbosssmartmap.com/og-image.png",
    imageFit: "banner",
    initials: "SM",
    icon: "carte",
    tags: ["Commune", "Carte interactive"],
    text: "La carte intelligente de la commune de Mboss (Kaolack) : météo agricole, prix du marché, signalements en temps réel, radios et télés sénégalaises.",
    color: "#1A6B3C",
  },
];

const TRADES: { icon: IconName; title: string; text: string }[] = [
  { icon: "numerique", title: "Solutions numériques", text: "Applications et sites pensés pour ceux qui les utilisent vraiment, avec l'intelligence artificielle quand elle aide." },
  { icon: "reparation", title: "Réparation de smartphones", text: "Diagnostic, pièces de rechange et réparations complexes, dans nos ateliers." },
  { icon: "accessoire", title: "Pièces et accessoires", text: "Boutique d'écrans, de pièces détachées et d'accessoires électroniques." },
];

function ProjectVisual({ p }: { p: Project }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`cfc-visual is-${p.imageFit}`} style={{ "--c": p.color } as CSSProperties}>
      {failed ? (
        <span className="cfc-initials" aria-hidden="true">{p.initials}</span>
      ) : (
        <img src={p.image} alt={`Logo ${p.name}`} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      )}
    </div>
  );
}

export function CfcSection() {
  return (
    <section className="cfc" id="cfc" aria-labelledby="cfc-title">
      <div className="section-head cfc-head">
        <p className="eyebrow">Qui est derrière Jokko</p>
        <h2 id="cfc-title">Fait au Sénégal, par des gens <em className="accent">du terrain</em>.</h2>
      </div>

      <div className="cfc-intro">
        <figure className="cfc-logo">
          <img src={CFC_LOGO} alt="Logo CFC – Cissé Family Company" width={640} height={365} loading="lazy" decoding="async" />
        </figure>
        <div className="cfc-copy">
          <p className="cfc-lede">
            <b>CFC – Cissé Family Company</b> crée des solutions numériques pour le Sénégal. Nous tenons aussi des ateliers de réparation de smartphones et une boutique de pièces et d'accessoires : le commerce, nous le vivons tous les jours. Jokko vient de là.
          </p>
          <p className="cfc-founder">
            <span className="cfc-founder-mark" aria-hidden="true">FC</span>
            <span><b>Fallou Cissé</b>, fondateur et directeur général. Spécialiste de la téléphonie mobile et des smartphones, et informaticien.</span>
          </p>
          <ul className="cfc-trades">
            {TRADES.map((t, i) => (
              <li key={t.title} style={at(i)}>
                <span className="cfc-trade-icon"><Icon name={t.icon} /></span>
                <span><b>{t.title}</b><small>{t.text}</small></span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <h3 className="cfc-sub">Nos réalisations</h3>
      <div className="cfc-projects">
        {CFC_PROJECTS.map((p) => (
          <a key={p.name} className="cfc-project" href={p.url} target="_blank" rel="noopener" aria-label={`${p.name} : voir le site (nouvel onglet)`}>
            <ProjectVisual p={p} />
            <div className="cfc-project-body">
              <p className="cfc-project-name"><Icon name={p.icon} size="sm" />{p.name}</p>
              <p className="cfc-project-text">{p.text}</p>
              <ul className="cfc-tags">{p.tags.map((t) => <li key={t}>{t}</li>)}</ul>
              <span className="cfc-project-link">{p.host} <Icon name="lien" size="sm" /></span>
            </div>
          </a>
        ))}
        <div className="cfc-project cfc-next">
          <span className="cfc-trade-icon"><Icon name="ia" size="lg" /></span>
          <p className="cfc-project-name">Et votre projet ?</p>
          <p className="cfc-project-text">CFC conçoit aussi des solutions sur mesure pour les commerces, les écoles, les communes et les entreprises.</p>
          <a className="cfc-wa" href={cfcWhatsappLink("Bonjour CFC, j'ai un projet et je viens de la page Jokko.")} target="_blank" rel="noopener">
            <Icon name="whatsapp" size="sm" /> Écrire à CFC sur WhatsApp
          </a>
        </div>
      </div>

      <div className="cfc-contact">
        <p><b>Une question sur Jokko ?</b> L'équipe CFC vous répond.</p>
        <div className="cfc-contact-actions">
          <a className="cfc-wa" href={cfcWhatsappLink()} target="_blank" rel="noopener"><Icon name="whatsapp" size="sm" /> WhatsApp · {CFC_WHATSAPP_LABEL}</a>
          <a className="cfc-mail" href={`mailto:${CFC_EMAIL}?subject=${encodeURIComponent("Jokko")}`}><Icon name="email" size="sm" /> {CFC_EMAIL}</a>
        </div>
      </div>
    </section>
  );
}
