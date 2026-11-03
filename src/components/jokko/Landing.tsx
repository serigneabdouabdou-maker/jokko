import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { JokkoMark } from "@/components/jokko/JokkoMark";
import { CFC_LOGO, CfcSection, cfcWhatsappLink } from "@/components/jokko/Cfc";
import { LegalSheet } from "@/components/jokko/Legal";
import { Icon } from "@/components/jokko/Icon";
import { CONDITIONS, CONFIDENTIALITE, type LegalDoc } from "@/legal";
import { lineAt, rememberPlan, VOICE_LINES, VOICE_URL, type WantedPlan } from "@/components/jokko/voiceIntro";
import "./landing.css";
import { AppPrompt } from "@/components/jokko/Install";

/**
 * Page d'accueil animée. Légère : uniquement CSS + quelques lignes de JavaScript (pas de bibliothèque).
 * Signature de mouvement : expo-out cubic-bezier(0.16, 1, 0.3, 1), 220 / 480 / 900 ms, entrée « monte et se précise ».
 * Tout s'arrête si le téléphone demande moins d'animations (prefers-reduced-motion).
 */

type Mode = "creer" | "entrer";

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const fmt = (n: number) => `${Math.round(n).toLocaleString("fr-FR").replace(/ /g, " ")} F`;

/** Ajoute « is-in » quand l'élément entre à l'écran (une seule fois). */
function useReveal<T extends HTMLElement>(threshold = 0.2) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced() || !("IntersectionObserver" in window)) {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, seen] as const;
}

/** Vrai tant que l'élément est visible (pour ne pas animer hors de l'écran). */
function useVisible<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) return setVisible(true);
    const io = new IntersectionObserver((entries) => setVisible(entries.some((e) => e.isIntersecting)), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, visible] as const;
}

/** Nombre qui monte vers sa valeur (expo-out), quand `run` est vrai. */
function useTween(target: number, run: boolean, duration = 900) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (!run || reduced()) {
      from.current = target;
      setValue(target);
      return;
    }
    const start = from.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const e = 1 - Math.pow(2, -10 * p);
      const v = start + (target - start) * (p >= 1 ? 1 : e);
      setValue(v);
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, run, duration]);
  return value;
}

/** Apparition en cascade : chaque enfant reçoit son rang (--i) pour le décalage. */
function Reveal({ as = "div", className = "", children, threshold }: { as?: "div" | "section"; className?: string; children: ReactNode; threshold?: number }) {
  const [ref, seen] = useReveal<HTMLDivElement>(threshold);
  const cls = `lx-reveal${seen ? " is-in" : ""} ${className}`;
  return as === "section" ? <section ref={ref} className={cls}>{children}</section> : <div ref={ref} className={cls}>{children}</div>;
}

const at = (i: number) => ({ "--i": i }) as CSSProperties;

/** La scène du comptoir, en boucle : la phrase dite → la réponse → la caisse compte → le stock baisse. */
function CounterScene() {
  const [ref, visible] = useVisible<HTMLElement>();
  const [step, setStep] = useState(reduced() ? 4 : 0);
  useEffect(() => {
    if (!visible || reduced()) return;
    const times = [1300, 1400, 1500, 1700, 3600];
    const id = window.setTimeout(() => setStep((s) => (s + 1) % 5), times[step]);
    return () => window.clearTimeout(id);
  }, [step, visible]);
  const cash = useTween(step >= 3 ? 50500 : 35500, visible);
  const sales = useTween(step >= 3 ? 33000 : 18000, visible);

  return (
    <aside ref={ref} className={`lx-ticket step-${step}`} aria-label="Exemple : une vente dite à Jokko">
      <span className="lx-ticket-glow" aria-hidden="true" />
      <header>
        <JokkoMark size={30} listening={step === 0} />
        <div>
          <b>Boutique Awa</b>
          <span>Pikine · Alimentation</span>
        </div>
        <span className="lx-live">En direct</span>
      </header>
      <div className="lx-chat">
        <p className="lx-said">« Jaay naa 2 huile »</p>
        <p className="lx-reply">Jaay bi dugg na. Huile, 15 000 F. Huile néew na, 1 la des.</p>
      </div>
      <dl className="lx-figs">
        <div className="big">
          <dt>Caisse attendue</dt>
          <dd className="num">{fmt(cash)}</dd>
        </div>
        <div>
          <dt>Ventes</dt>
          <dd className="num">{fmt(sales)}</dd>
        </div>
        <div className="lx-stock">
          <dt>Stock huile</dt>
          <dd>
            <i style={{ "--w": step >= 4 ? "12%" : "36%" } as CSSProperties} />
            <span className="num">{step >= 4 ? 1 : 3}</span>
          </dd>
        </div>
      </dl>
      <div className="lx-voice">
        <span className="lx-mic" aria-hidden="true">
          <i /><i /><i /><i /><i />
        </span>
        <span>{step === 0 ? "Jokko écoute…" : step >= 4 ? "Stock bas : Jokko te prévient." : "Dites-le. C’est noté."}</span>
      </div>
    </aside>
  );
}

function Marquee({ items, reverse = false }: { items: string[]; reverse?: boolean }) {
  return (
    <div className={`lx-marquee${reverse ? " is-reverse" : ""}`} aria-hidden={reverse}>
      <div className="lx-marquee-track">
        {[...items, ...items].map((p, i) => (
          <span key={`${p}-${i}`}>« {p} »</span>
        ))}
      </div>
    </div>
  );
}

function BentoFigure({ value, prefix = "" }: { value: number; prefix?: string }) {
  const [ref, seen] = useReveal<HTMLParagraphElement>(0.4);
  const v = useTween(seen ? value : 0, seen, 1100);
  return <p ref={ref} className="b-figure num">{prefix}{fmt(v)}</p>;
}


/** « Écoutez Jokko » : l'audio enregistré, avec le sous-titre de chaque phrase (wolof + traduction). */
function VoiceIntro({ onChoose, autoplay }: { onChoose: () => void; autoplay: number }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [state, setState] = useState<"pret" | "charge" | "parle" | "pause" | "fini" | "erreur">("pret");
  const [t, setT] = useState(0);
  const [duration, setDuration] = useState(VOICE_LINES[VOICE_LINES.length - 1].end);
  const current = lineAt(t);
  const line = current >= 0 ? VOICE_LINES[current] : null;

  async function toggle() {
    const el = audio.current;
    if (!el) return;
    if (state === "parle") return el.pause();
    if (state === "fini") el.currentTime = 0;
    setState("charge");
    try {
      await el.play();
    } catch {
      setState("erreur");
    }
  }
  // Le bouton « Écouter Jokko » du haut de page lance la lecture.
  useEffect(() => {
    if (autoplay) void toggle();
  }, [autoplay]); // eslint-disable-line react-hooks/exhaustive-deps

  const playing = state === "parle" || state === "charge";
  return (
    <section className="lx-voice-sec" id="voix" aria-label="Écoutez Jokko">
      <Reveal className="lx-voice-card" threshold={0.25}>
        <div className="lx-voice-left" style={at(0)}>
          <p className="eyebrow">Écoutez Jokko</p>
          <h2>Il parle <em className="accent">wolof</em>. Et français.</h2>
          <p className="lx-voice-lede">Touchez le bouton : Jokko se présente lui-même, en moins d’une minute.</p>
          <button type="button" className={`lx-play${playing ? " is-on" : ""}`} onClick={() => void toggle()} aria-label={playing ? "Mettre en pause" : "Écouter Jokko"}>
            <span className="lx-play-mark"><JokkoMark size={64} listening={state === "parle"} /></span>
            <span className="lx-play-icon" aria-hidden="true"><Icon name={playing ? "pause" : "lecture"} size="sm" /></span>
          </button>
          <div className="lx-progress" aria-hidden="true"><span style={{ width: `${Math.min(100, (t / (duration || 1)) * 100)}%` }} /></div>
          {state === "erreur" && <p className="note" data-tone="error">L’audio ne se lance pas. Vérifiez le son du téléphone et la connexion, puis réessayez.</p>}
        </div>
        <div className="lx-voice-right" style={at(1)} aria-live="polite">
          <div className={`lx-eq${state === "parle" ? " is-on" : ""}`} aria-hidden="true">{Array.from({ length: 24 }, (_, i) => <i key={i} style={{ "--k": i } as CSSProperties} />)}</div>
          {line ? (
            <div className="lx-caption" key={current}>
              <span className="lx-lang">{line.lang === "wo" ? "Wolof" : "Français"}</span>
              <p className="lx-cap-main">{line.text}</p>
              {line.fr && <p className="lx-cap-fr">{line.fr}</p>}
            </div>
          ) : (
            <div className="lx-caption">
              <span className="lx-lang">Wolof · Français</span>
              <p className="lx-cap-main">« Asalaa maalekum ! Maa ngi tudd Jokko. »</p>
              <p className="lx-cap-fr">Bonjour ! Je m’appelle Jokko.</p>
            </div>
          )}
          <div className={`lx-voice-cta${state === "fini" ? " is-shown" : ""}`}>
            <Button className="lx-cta h-12 rounded-full px-6 text-[15px] font-semibold" onClick={onChoose}>Choisir mon offre <Icon name="descendre" size="sm" className="lx-arrow" /></Button>
          </div>
        </div>
      </Reveal>
      <audio
        ref={audio}
        src={VOICE_URL}
        preload="none"
        onPlaying={() => setState("parle")}
        onPause={() => setState((s) => (s === "fini" ? s : "pause"))}
        onEnded={() => setState("fini")}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
        onError={() => setState("erreur")}
      />
    </section>
  );
}

type Art = { title: string; body: ReactNode };

/** Trois petites images par offre : de vraies scènes de l'appli, dessinées en léger (pas de photos lourdes). */
const OFFER_ART: Record<WantedPlan, Art[]> = {
  gratuit: [
    { title: "Vente à la voix", body: <><p className="oa-said">« Jaay naa 2 huile »</p><p className="oa-big num">+15 000 F</p></> },
    { title: "Stock qui prévient", body: <div className="oa-levels"><span><i style={{ "--w": "90%" } as CSSProperties} />Riz</span><span className="low"><i style={{ "--w": "18%" } as CSSProperties} />Huile</span><span><i style={{ "--w": "60%" } as CSSProperties} />Sucre</span></div> },
    { title: "Caisse et dettes", body: <><p className="oa-row"><span>Moussa</span><b className="num">20 000 F</b></p><p className="oa-row"><span>Caisse</span><b className="num">50 500 F</b></p></> },
  ],
  medium: [
    { title: "Caisse par scan", body: <div className="oa-scan"><span className="oa-code" aria-hidden="true" /><span className="oa-laser" aria-hidden="true" /><b className="num">Riz · 15 500 F</b></div> },
    { title: "Vendeurs et journal", body: <><p className="oa-row"><span className="oa-ico"><Icon name="vendeur" size="sm" />Awa</span><b>vendeuse</b></p><p className="oa-row"><span>10:41 vente</span><b><Icon name="verrou" size="sm" label="non effaçable" /></b></p></> },
    { title: "Alertes à distance", body: <><p className="oa-alert ok oa-ico"><Icon name="ok" size="sm" />Wave 12 500 F</p><p className="oa-alert bad">Caisse − 2 000 F</p></> },
  ],
  avance: [
    { title: "Chat intelligent", body: <><p className="oa-said">« 2 riz, 1 huile, big bleu »</p><p className="oa-row"><span>Panier</span><b className="num">34 000 F</b></p></> },
    { title: "Conseiller IA", body: <p className="oa-tip oa-ico"><Icon name="conseil" size="sm" />Le riz part vite le samedi : prenez 5 sacs de plus.</p> },
    { title: "Résumé du soir", body: <><p className="oa-notif"><b>Jokko · 20:00</b>Ventes 86 500 F · bénéfice 14 200 F</p><p className="oa-row"><span>2 boutiques</span><b><Icon name="echange" size="sm" label="deux boutiques" /></b></p></> },
  ],
};

const OFFERS: { plan: WantedPlan; name: string; price: string; pitch: string; features: string[]; cta: string }[] = [
  { plan: "gratuit", name: "Gratuit", price: "0 F", pitch: "Pour commencer seul dans sa boutique.", features: ["1 boutique, 1 utilisateur", "10 messages vocaux par jour, en wolof et en français", "Ventes, stock, caisse et bilan", "Dettes et factures WhatsApp"], cta: "Commencer gratuitement" },
  { plan: "medium", name: "Médium", price: "4 000 F", pitch: "Pour la boutique avec des vendeurs.", features: ["Tout le Gratuit", "40 messages vocaux par jour", "Vendeurs, rôles et journal non effaçable", "Caisse par scan et étiquettes", "La boutique à distance + alertes", "Relances WhatsApp, import Excel"], cta: "Choisir Médium" },
  { plan: "avance", name: "Avancé", price: "8 000 F", pitch: "Pour le patron qui veut tout voir et grandir.", features: ["Tout le Médium", "Conversation en direct avec Jokko, mains libres", "Chat intelligent : une liste en vrac devient un panier", "Conseiller IA pour gagner plus", "Résumé du soir sur le téléphone", "Plusieurs boutiques"], cta: "Choisir Avancé" },
];

function OfferShowcase({ onChoose }: { onChoose: (plan: WantedPlan) => void }) {
  return (
    <section className="offers lx-offers-sec" id="offres">
      <Reveal className="section-head">
        <p className="eyebrow" style={at(0)}>Offres</p>
        <h2 style={at(1)}>Choisissez <em className="accent">votre offre</em>.</h2>
        <p className="lx-offers-lede" style={at(2)}>Toutes commencent par 14 jours d’Avancé offerts. Paiement par Wave, sans engagement.</p>
      </Reveal>
      <Reveal className="lx-offer-grid" threshold={0.1}>
        {OFFERS.map((o, k) => (
          <article key={o.plan} className={`lx-offer is-${o.plan}`} style={at(k)}>
            {o.plan === "avance" && <span className="lx-badge">Le plus complet</span>}
            <header>
              <h3>{o.name}</h3>
              <p className="lx-price num">{o.price}{o.plan !== "gratuit" && <small> / mois</small>}</p>
              <p className="lx-pitch">{o.pitch}</p>
            </header>
            <div className="lx-arts">
              {OFFER_ART[o.plan].map((a) => (
                <figure key={a.title} className="lx-art">
                  <div className="lx-art-body">{a.body}</div>
                  <figcaption>{a.title}</figcaption>
                </figure>
              ))}
            </div>
            <ul className="lx-feats">{o.features.map((f) => <li key={f}><span className="lx-check"><Icon name="coche" size="sm" /></span><span>{f}</span></li>)}</ul>
            <Button className={`lx-offer-btn h-12 rounded-full px-5 text-[15px] font-semibold${o.plan === "avance" ? " is-main" : ""}`} variant={o.plan === "avance" ? "default" : "outline"} onClick={() => onChoose(o.plan)}>
              {o.cta} <Icon name="suivant" size="sm" className="lx-arrow" />
            </Button>
          </article>
        ))}
      </Reveal>
    </section>
  );
}

export function Landing({ onStart, langs }: { onStart: (mode: Mode) => void; langs: string[] }) {
  const [reading, setReading] = useState<LegalDoc | null>(null);
  const [listen, setListen] = useState(0);
  const choose = (plan: WantedPlan) => {
    rememberPlan(plan);
    onStart("creer");
  };
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  const phrases = ["Awa m'a payé 15 000", "il me reste combien de riz ?", "envoie la facture à Moussa", "Jaay naa 2 huile", "qui me doit de l'argent ?", "caisse du jour"];
  const phrases2 = ["2 sacs de riz, big bleu, big bleu", "j'ai acheté 3 sacs à 15 500", "jënd naa ñetti sac ceeb", "facture pour Fatou", "payé par Wave", "dugal ñaari bidon diw"];

  return (
    <main className="landing lx">
      <header className={`lnav lx-nav${scrolled ? " is-scrolled" : ""}`}>
        <a className="lbrand" href="#top" aria-label="Jokko, accueil">
          <JokkoMark size={34} />
          <span>Jokko</span>
        </a>
        <nav className="llinks">
          <a href="#voix">Écouter</a>
          <a href="#offres">Offres</a>
          <a href="#fonctions">Fonctions</a>
          <a href="#distance">À distance</a>
          <a href="#cfc">Qui sommes-nous</a>
        </nav>
        <span className="lx-nav-actions">
          <Button variant="ghost" className="h-10 rounded-full px-4" onClick={() => onStart("entrer")}>Se connecter</Button>
          <Button className="lx-nav-offers h-10 rounded-full px-4" onClick={() => scrollTo("offres")}>Voir les offres</Button>
        </span>
      </header>

      <section className="hero lx-hero" id="top">
        <span className="lx-aura" aria-hidden="true" />
        <div className="hero-copy lx-hero-copy">
          <div className="lx-sting" aria-hidden="true">
            <JokkoMark size={76} />
            <span className="lx-ring" />
            <span className="lx-ring lx-ring-2" />
          </div>
          <p className="eyebrow lx-in" style={at(0)}>Gestion de boutique à la voix</p>
          <h1 className="lx-title">
            <span className="lx-line"><span style={at(1)}>Parlez.</span></span>
            <span className="lx-line"><span style={at(2)}>Votre boutique</span></span>
            <span className="lx-line">
              <span style={at(3)}>
                <em className="accent lx-underline">suit.</em>
              </span>
            </span>
          </h1>
          <p className="lede lx-in" style={at(4)}>
            Jokko note les ventes, surveille le stock, relance les dettes et compte la caisse. En wolof, en français, ou les deux mélangés, comme on parle à Dakar.
          </p>
          <div className="hero-cta lx-in" style={at(5)}>
            <Button className="lx-cta h-12 rounded-full px-6 text-[15px] font-semibold" onClick={() => onStart("creer")}>
              Ouvrir ma boutique <Icon name="suivant" size="sm" className="lx-arrow" />
            </Button>
            <Button variant="outline" className="lx-listen h-12 rounded-full px-5 text-[15px] font-semibold" onClick={() => { scrollTo("voix"); setListen((n) => n + 1); }}>
              <span className="lx-listen-dot" aria-hidden="true"><Icon name="lecture" size="sm" /></span> Écouter Jokko
            </Button>
          </div>
          <ul className="langs lx-in" style={at(6)} aria-label="Langues comprises">
            {langs.map((name) => <li key={name}>{name}</li>)}
          </ul>
          <a className="lx-by lx-in" style={at(7)} href="#cfc">Une solution <b>CFC – Cissé Family Company</b></a>
        </div>
        <CounterScene />
      </section>

      <VoiceIntro autoplay={listen} onChoose={() => scrollTo("offres")} />

      <OfferShowcase onChoose={choose} />

      <section className="lx-phrases" aria-label="Phrases que Jokko comprend">
        <Marquee items={phrases} />
        <Marquee items={phrases2} reverse />
      </section>

      <section className="change" id="changer">
        <Reveal className="section-head">
          <p className="eyebrow" style={at(0)}>Le changement</p>
          <h2 style={at(1)}>Votre commerce grandit. <em className="accent">Le suivi</em> ne reste plus dans la tête.</h2>
        </Reveal>
        <Reveal className="change-grid lx-change" threshold={0.25}>
          <article className="before">
            <h3>Avant</h3>
            <ul>
              <li style={at(0)}><span className="lx-strike">Les chiffres restent dans la tête.</span></li>
              <li style={at(1)}><span className="lx-strike">Les dettes s’oublient.</span></li>
              <li style={at(2)}><span className="lx-strike">La rupture arrive sans prévenir.</span></li>
            </ul>
          </article>
          <article className="after">
            <h3>Avec Jokko</h3>
            <ul>
              <li style={at(3)}>Chaque vente est notée, au franc près.</li>
              <li style={at(4)}>Vous voyez qui vous doit quoi.</li>
              <li style={at(5)}>Le stock bas parle avant la rupture.</li>
              <li style={at(6)}>La caisse du soir tombe juste, ou l’écart est clair.</li>
            </ul>
          </article>
        </Reveal>
      </section>

      <section className="features" id="fonctions">
        <Reveal className="section-head">
          <p className="eyebrow" style={at(0)}>Une seule voix</p>
          <h2 style={at(1)}>Dites-le. <em className="accent">C’est noté.</em></h2>
        </Reveal>
        <Reveal className="bento lx-bento" threshold={0.12}>
          <article className="b-ventes" style={at(0)}>
            <span className="b-tag">Ventes</span>
            <p className="b-said">« Ajoute une vente de 15 000. »</p>
            <BentoFigure value={15000} prefix="+" />
            <p className="b-note">Ajoutée au jour, comptée dans la caisse.</p>
          </article>
          <article className="b-stock" style={at(1)}>
            <span className="b-tag">Stock</span>
            <p className="b-said">« Il me reste combien de riz ? »</p>
            <div className="b-levels">
              <div><span>Riz brisé</span><i style={{ "--w": "100%" } as CSSProperties} /><b className="num">12</b></div>
              <div className="low"><span>Huile</span><i style={{ "--w": "20%" } as CSSProperties} /><b className="num">3</b></div>
            </div>
          </article>
          <article className="b-dettes" style={at(2)}>
            <span className="b-tag">Clients et dettes</span>
            <p className="b-said">« Qui me doit de l’argent ? »</p>
            <p className="b-line"><span>Moussa</span><b className="num">20 000 F</b></p>
            <p className="b-line"><span>Fatou</span><b className="num">8 500 F</b></p>
          </article>
          <article className="b-factures" style={at(3)}>
            <span className="b-tag">Factures</span>
            <p className="b-said">« Envoie la facture à Awa. »</p>
            <p className="b-note lx-send"><Icon name="message" size="sm" /> Préparée pour WhatsApp.</p>
          </article>
          <article className="b-depenses" style={at(4)}>
            <span className="b-tag">Dépenses</span>
            <p className="b-said">« J’ai payé le transport. »</p>
          </article>
          <article className="b-caisse" style={at(5)}>
            <span className="b-tag">Caisse</span>
            <p className="b-said">« On ferme. Combien dans le tiroir ? »</p>
            <BentoFigure value={50500} />
            <p className="b-note">Fond du matin + ventes en espèces − dépenses.</p>
          </article>
        </Reveal>
      </section>

      <section className="lx-remote" id="distance">
        <Reveal className="lx-remote-inner" threshold={0.2}>
          <div className="lx-remote-copy">
            <p className="eyebrow" style={at(0)}>Le patron, même loin</p>
            <h2 style={at(1)}>Votre boutique, <em className="accent">sous vos yeux</em>, où que vous soyez.</h2>
            <p style={at(2)}>Le vendeur scanne et encaisse. Vous voyez chaque vente en direct, et Jokko vous prévient au moindre problème, même téléphone fermé.</p>
            <ul className="lx-points">
              <li style={at(3)}><span className="lx-check"><Icon name="coche" size="sm" /></span><span>Caisse par scan, à la caméra ou à la douchette</span></li>
              <li style={at(4)}><span className="lx-check"><Icon name="coche" size="sm" /></span><span>Paiement Wave confirmé par Wave</span></li>
              <li style={at(5)}><span className="lx-check"><Icon name="coche" size="sm" /></span><span>Journal que personne ne peut effacer</span></li>
              <li style={at(6)}><span className="lx-check"><Icon name="coche" size="sm" /></span><span>Conseils pour gagner plus</span></li>
            </ul>
          </div>
          <div className="lx-phone" aria-label="Exemple d’alertes reçues par le patron">
            <p className="lx-phone-head"><span className="lx-dot" /> En direct · Boutique Awa</p>
            <div className="lx-alert ok" style={at(3)}><b>08:12</b><span>Boutique ouverte · 1re vente</span></div>
            <div className="lx-alert ok" style={at(4)}><b>10:41</b><span>Wave confirmé · 12 500 F</span></div>
            <div className="lx-alert warn" style={at(5)}><b>13:05</b><span>Vente annulée par le vendeur</span></div>
            <div className="lx-alert bad" style={at(6)}><b>19:30</b><span>Écart de caisse : − 2 000 F</span></div>
          </div>
        </Reveal>
      </section>


      <CfcSection />

      <Reveal as="section" className="lx-final">
        <div className="lx-final-mark" style={at(0)}><JokkoMark size={64} /></div>
        <h2 style={at(1)}>Dites votre première vente.</h2>
        <p style={at(2)}>Deux minutes pour ouvrir votre boutique.</p>
        <div style={at(3)}>
          <Button className="lx-cta h-12 rounded-full px-7 text-[15px] font-semibold" onClick={() => scrollTo("offres")}>
            Choisir mon offre <Icon name="monter" size="sm" className="lx-arrow" />
          </Button>
        </div>
      </Reveal>

      <footer className="lfoot">
        <span className="lbrand"><JokkoMark size={24} /><span>Jokko</span></span>
        <a className="lfoot-cfc" href="#cfc"><img src={CFC_LOGO} alt="" width={56} height={32} loading="lazy" /><span>Une solution CFC – Cissé Family Company</span></a>
        <span className="lfoot-links">
          <a className="link" href={cfcWhatsappLink()} target="_blank" rel="noopener">WhatsApp</a>
          <button type="button" className="link" onClick={() => setReading(CONDITIONS)}>Conditions d’utilisation</button>
          <button type="button" className="link" onClick={() => setReading(CONFIDENTIALITE)}>Confidentialité</button>
        </span>
      </footer>
      {reading && <LegalSheet doc={reading} onClose={() => setReading(null)} />}
      <AppPrompt />
    </main>
  );
}
