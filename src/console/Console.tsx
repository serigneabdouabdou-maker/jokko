import { Fragment, type ReactNode, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { JokkoMark } from "@/components/jokko/JokkoMark";
import { ConsoleMap } from "./ConsoleMap";
import { Icon, type IconName, Notice } from "@/components/jokko/Icon";
import { supabase, signIn, phoneOf } from "@/data/supabase";
import { type PlanName, money } from "@/model";
import { adminDecide, type AdminOverview, adminOverview, adminSetPlan, adminSettings, PLAN_LABELS } from "@/data/plans";
import {
  addAdmin,
  type AdminMember,
  type ConsoleShop,
  type Dashboard,
  extendTrial,
  growth,
  loadAdminTeam,
  loadDashboard,
  loadShops,
  loadUsage,
  type Usage,
  removeAdmin,
  shopStatus,
} from "@/data/admin";

const amount = (n: number) => money(n).replace(/ /g, " ");
const count = (n: number) => n.toLocaleString("fr-FR").replace(/ /g, " ");
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const short = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
const monthName = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { month: "short" });
const phone = (p: string) => p.replace(/^221/, "").replace(/(\d{2})(\d{3})(\d{2})(\d{2})/, "$1 $2 $3 $4");

type Tab = "apercu" | "carte" | "paiements" | "boutiques" | "reglages";
const TABS: [Tab, string][] = [
  ["apercu", "Vue d'ensemble"],
  ["carte", "Carte"],
  ["paiements", "Paiements"],
  ["boutiques", "Boutiques"],
  ["reglages", "Réglages"],
];

const TAB_ICONS: Record<Tab, IconName> = { apercu: "rapport", carte: "position", paiements: "mobileMoney", boutiques: "boutique", reglages: "reglages" };

const STATUS_LABEL = { active: "Active", calme: "Calme", endormie: "Endormie", nouvelle: "Nouvelle" } as const;

/** Console CFC : la tour de contrôle de toute la plateforme, séparée de l'appli des boutiques. */
export function Console() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <main className="cx-gate"><p className="note">Chargement…</p></main>;
  if (!session) return <ConsoleLogin />;
  return (
    <SecondFactor session={session}>
      <ConsoleDesk session={session} />
    </SecondFactor>
  );
}

/**
 * Double vérification : après le numéro et le code secret, la console demande le code à 6 chiffres
 * de l'application d'authentification (Google Authenticator…), qui change toutes les 30 secondes.
 * Le serveur refuse toute action d'administration sans cette étape (niveau « aal2 »).
 */
function SecondFactor({ session, children }: { session: Session; children: ReactNode }) {
  const [step, setStep] = useState<"check" | "ok" | "verify" | "enroll" | "refuse">("check");
  const [factorId, setFactorId] = useState("");
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [uri, setUri] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const digits = code.replace(/\D/g, "").slice(0, 6);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data: access } = await supabase.rpc("console_access");
      if (!alive) return;
      if (!(access as { team?: boolean } | null)?.team) return setStep("refuse");
      const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (level?.currentLevel === "aal2") return setStep("ok");
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const verified = factors?.totp?.find((f) => f.status === "verified");
      if (verified) {
        setFactorId(verified.id);
        return setStep("verify");
      }
      // Première fois : on retire un essai d'inscription non terminé, puis on prépare l'application.
      for (const f of factors?.all ?? []) if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data: enrolled, error: failed } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Console CFC", issuer: "Jokko CFC" });
      if (!alive) return;
      if (failed || !enrolled) {
        setError("La double vérification ne se prépare pas. Réessaie dans un instant.");
        return setStep("enroll");
      }
      setFactorId(enrolled.id);
      setQr(enrolled.totp.qr_code);
      setSecret(enrolled.totp.secret);
      setUri(enrolled.totp.uri);
      setStep("enroll");
    })();
    return () => {
      alive = false;
    };
  }, [session.user.id]);

  async function confirm() {
    setBusy(true);
    setError("");
    const { error: wrong } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: digits });
    setBusy(false);
    if (wrong) {
      setCode("");
      return setError("Code incorrect ou expiré. Prends le code affiché maintenant dans l'application (il change toutes les 30 secondes).");
    }
    setStep("ok");
  }

  if (step === "ok" || step === "refuse") return <>{children}</>;
  if (step === "check") return <main className="cx-gate"><p className="note" style={{ color: "#F3F1EA" }}>Vérification…</p></main>;

  const form = (
    <form className="cx-mfa-form" onSubmit={(e) => { e.preventDefault(); if (digits.length === 6 && !busy) void confirm(); }}>
      <label className="note" htmlFor="cx-otp">Code de l’application (6 chiffres)</label>
      <Input id="cx-otp" className="num h-12 text-lg tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code" value={digits} onChange={(e) => setCode(e.target.value)} placeholder="000000" autoFocus />
      {error && <p className="note" role="alert" data-tone="error">{error}</p>}
      <Button type="submit" className="h-12 rounded-full font-semibold" disabled={busy || digits.length !== 6}>{busy ? "Vérification…" : "Confirmer"}</Button>
    </form>
  );

  return (
    <main className="cx-gate">
      <div className="cx-gate-card">
        <div className="cx-brand"><JokkoMark size={40} /><span>Jokko <b>Console</b></span></div>
        {step === "verify" ? (
          <>
            <h1>Double vérification</h1>
            <p className="note">Ouvre ton application d’authentification et tape le code à 6 chiffres de « Jokko CFC ».</p>
            {form}
          </>
        ) : (
          <>
            <h1>Protège ta console</h1>
            <p className="note">Une seule fois : relie la console à une application de codes sur ton téléphone. Ensuite, à chaque connexion, elle te demandera le code du moment en plus de ton code secret.</p>
            <ol className="cx-steps">
              <li>Installe <b>Google Authenticator</b> (gratuit, Play Store ou App Store).</li>
              <li>{uri ? <>Touche <a className="cx-link" href={uri}>Ajouter à l’application</a>, ou scanne ce code avec l’application :</> : "Prépare l’application…"}</li>
            </ol>
            {qr && <img className="cx-qr" src={qr} alt="QR code à scanner avec l’application d’authentification" width={180} height={180} />}
            {secret && <p className="note">Sinon, dans l’application : « Saisir une clé », nom « Jokko CFC », clé : <b className="cx-ref">{secret}</b></p>}
            <p className="note"><b>3.</b> Tape le code à 6 chiffres que l’application affiche :</p>
            {form}
          </>
        )}
        <button type="button" className="cx-link" onClick={() => void supabase.auth.signOut()}>Se déconnecter</button>
      </div>
    </main>
  );
}

function ConsoleLogin() {
  const [tel, setTel] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const digits = code.replace(/\D/g, "").slice(0, 6);

  return (
    <main className="cx-gate">
      <form
        className="cx-gate-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const r = await signIn(tel, digits);
          setBusy(false);
          if (!r.ok) setError(r.message);
        }}
      >
        <div className="cx-brand"><JokkoMark size={40} /><span>Jokko <b>Console</b></span></div>
        <h1>Tableau de bord CFC</h1>
        <p className="note">Réservé à l'équipe CFC – Cisse Family Company. Connecte-toi avec ton compte Jokko.</p>
        <label className="note" htmlFor="cx-tel">Numéro</label>
        <Input id="cx-tel" className="h-12 text-base" inputMode="tel" autoComplete="tel" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="77 123 45 67" />
        <label className="note" htmlFor="cx-code">Code secret (6 chiffres)</label>
        <Input id="cx-code" className="num h-12 text-lg tracking-[0.3em]" type="password" inputMode="numeric" autoComplete="current-password" value={digits} onChange={(e) => setCode(e.target.value)} placeholder="••••••" />
        {error && <p className="note" role="alert" data-tone="error">{error}</p>}
        <Button type="submit" className="h-12 rounded-full font-semibold" disabled={busy || digits.length !== 6 || tel.replace(/\D/g, "").length < 9}>{busy ? "Un instant…" : "Entrer dans la console"}</Button>
      </form>
    </main>
  );
}

export function ConsoleDesk({ session }: { session: Session }) {
  const [tab, setTab] = useState<Tab>(() => {
    const wanted = new URLSearchParams(window.location.search).get("onglet");
    return TABS.some(([id]) => id === wanted) ? (wanted as Tab) : "apercu";
  });
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [shops, setShops] = useState<ConsoleShop[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stamp, setStamp] = useState<Date | null>(null);

  async function refresh() {
    setLoading(true);
    const [d, o, s, u] = await Promise.all([loadDashboard(), adminOverview(), loadShops(), loadUsage()]);
    setLoading(false);
    if (d.denied) return setDenied(true);
    setDash(d.data);
    setOverview(o);
    setShops(s);
    setUsage(u);
    setStamp(new Date());
  }
  useEffect(() => {
    void refresh();
    // Les nouveaux paiements arrivent tout seuls.
    const channel = supabase
      .channel("console-demandes")
      .on("postgres_changes", { event: "*", schema: "public", table: "subscription_requests" }, () => void refresh())
      .subscribe();
    const timer = window.setInterval(() => void refresh(), 120_000);
    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function go(next: Tab) {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("onglet", next);
    window.history.replaceState(null, "", url);
  }

  if (denied) {
    return (
      <main className="cx-gate">
        <div className="cx-gate-card">
          <div className="cx-brand"><JokkoMark size={40} /><span>Jokko <b>Console</b></span></div>
          <h1>Accès réservé</h1>
          <p className="note">Le compte {phone(phoneOf(session))} n'est pas dans l'équipe CFC. Cette page ne montre rien aux autres comptes.</p>
          <Button variant="outline" className="h-11 rounded-full" onClick={() => void supabase.auth.signOut()}>Changer de compte</Button>
        </div>
      </main>
    );
  }

  const pending = overview?.requests.filter((r) => r.status === "en_attente").length ?? 0;

  return (
    <div className="cx">
      <aside className="cx-side">
        <div className="cx-brand"><JokkoMark size={34} /><span>Jokko <b>Console</b></span></div>
        <nav className="cx-nav" aria-label="Console">
          {TABS.map(([id, label]) => (
            <button key={id} className={tab === id ? "on" : ""} aria-current={tab === id ? "page" : undefined} onClick={() => go(id)}>
              <span className="cx-nav-label"><Icon name={TAB_ICONS[id]} />{label}</span>
              {id === "paiements" && pending > 0 && <span className="cx-dot num">{pending}</span>}
            </button>
          ))}
        </nav>
        <div className="cx-side-foot">
          <a className="cx-link" href="../" target="_blank" rel="noopener">Ouvrir l'appli boutique <Icon name="ouvrir" size="sm" /></a>
          <span>{phone(phoneOf(session))} · CFC</span>
          <button type="button" className="cx-link" onClick={() => void supabase.auth.signOut()}>Se déconnecter</button>
        </div>
      </aside>

      <main className="cx-main">
        <header className="cx-top">
          <div>
            <p className="eyebrow">CFC – Cisse Family Company</p>
            <h1>{TABS.find(([id]) => id === tab)?.[1]}</h1>
          </div>
          <div className="row">
            {stamp && <span className="note">Mis à jour à {stamp.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>}
            <Button variant="outline" className="h-9 rounded-full px-4" disabled={loading} onClick={() => void refresh()}>{loading ? "…" : "Actualiser"}</Button>
          </div>
        </header>

        {!dash || !overview ? (
          <p className="note">{loading ? "Chargement des chiffres…" : "Impossible de charger les chiffres. Vérifie la connexion puis touche Actualiser."}</p>
        ) : (
          <>
            {tab === "apercu" && <Overview dash={dash} shops={shops} usage={usage} onGo={go} />}
            {tab === "carte" && <ConsoleMap shops={shops} />}
            {tab === "paiements" && <Payments overview={overview} onChanged={refresh} />}
            {tab === "boutiques" && <Shops shops={shops} onChanged={refresh} />}
            {tab === "reglages" && <Settings overview={overview} onChanged={refresh} />}
          </>
        )}
      </main>
    </div>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "bad" | "warn" }) {
  return (
    <article className="cx-kpi" data-tone={tone}>
      <span>{label}</span>
      <b className="num">{value}</b>
      {hint && <small>{hint}</small>}
    </article>
  );
}

function Bars({ items, format }: { items: { label: string; value: number }[]; format: (n: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="cx-bars" role="img" aria-label={items.map((i) => `${i.label} : ${format(i.value)}`).join(", ")}>
      {items.map((i, k) => (
        <div key={`${i.label}-${k}`} className="cx-bar" title={`${i.label} : ${format(i.value)}`}>
          <span className="cx-bar-val num">{i.value ? format(i.value) : ""}</span>
          <span className="cx-bar-fill" style={{ height: `${Math.max(i.value ? 4 : 0, (i.value / max) * 100)}%` }} />
          <span className="cx-bar-lab">{i.label}</span>
        </div>
      ))}
    </div>
  );
}

function Rank({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <p className="note">Pas encore de données.</p>;
  return (
    <ul className="cx-rank">
      {items.map((i) => (
        <li key={i.label}>
          <span>{i.label}</span>
          <span className="cx-rank-track"><span style={{ width: `${(i.value / max) * 100}%` }} /></span>
          <b className="num">{count(i.value)}</b>
        </li>
      ))}
    </ul>
  );
}

function Overview({ dash, shops, usage, onGo }: { dash: Dashboard; shops: ConsoleShop[]; usage: Usage | null; onGo: (t: Tab) => void }) {
  const g = growth(dash.revenue_month, dash.revenue_prev_month);
  const paying = dash.paying_medium + dash.paying_avance;
  const conversion = dash.shops_total ? Math.round((paying / dash.shops_total) * 100) : 0;
  const ending = shops
    .filter((s) => s.trial_until && Date.parse(s.trial_until) > Date.now() && Date.parse(s.trial_until) < Date.now() + 3 * 86_400_000 && !(s.plan !== "gratuit" && s.plan_until && Date.parse(s.plan_until) > Date.now()))
    .slice(0, 6);

  return (
    <div className="cx-stack">
      {dash.pending > 0 && (
        <button type="button" className="cx-alert" onClick={() => onGo("paiements")}>
          <b>{dash.pending} paiement(s) à vérifier</b> · {amount(dash.pending_amount)} — ouvre Wave Business puis active-les ici <Icon name="suivant" size="sm" />
        </button>
      )}

      <section className="cx-kpis">
        <Kpi label="Encaissé ce mois" value={amount(dash.revenue_month)} hint={g === null ? "Premier mois" : `${g >= 0 ? "+" : ""}${g} % vs mois dernier`} tone={g !== null && g < 0 ? "bad" : "good"} />
        <Kpi label="Revenu mensuel récurrent" value={amount(dash.mrr)} hint={`${paying} abonnement(s) payé(s)`} />
        <Kpi label="Boutiques" value={count(dash.shops_total)} hint={`+${dash.shops_new_7d} cette semaine · +${dash.shops_new_30d} en 30 j`} />
        <Kpi label="Actives (7 jours)" value={count(dash.active_7d)} hint={dash.shops_total ? `${Math.round((dash.active_7d / dash.shops_total) * 100)} % des boutiques` : undefined} />
      </section>

      <section className="cx-kpis">
        <Kpi label="Comptes" value={count(dash.users_total)} hint={`dont ${dash.sellers_total} vendeur(s)`} />
        <Kpi label="Essais en cours" value={count(dash.trials_active)} hint={dash.trials_ending_3d ? `${dash.trials_ending_3d} finissent dans 3 jours` : "Aucun ne finit bientôt"} tone={dash.trials_ending_3d ? "warn" : undefined} />
        <Kpi label="Taux de paiement" value={`${conversion} %`} hint="boutiques avec une offre payée" />
        <Kpi label="Ventes enregistrées (30 j)" value={count(dash.sales_30_count)} hint={amount(dash.sales_30_amount)} />
      </section>

      <div className="cx-grid">
        <section className="cx-card">
          <h3>Encaissé par mois</h3>
          <Bars items={dash.revenue_months.map((m) => ({ label: monthName(m.month), value: m.amount }))} format={(n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))} />
        </section>
        <section className="cx-card">
          <h3>Nouvelles boutiques par semaine</h3>
          <Bars items={dash.signups_weeks.map((w) => ({ label: short(w.week), value: w.n }))} format={String} />
        </section>
      </div>

      <div className="cx-grid">
        <section className="cx-card">
          <h3>Répartition des offres</h3>
          <div className="cx-plans">
            {(["gratuit", "medium", "avance"] as PlanName[]).map((p) => (
              <div key={p} className={`cx-plan is-${p}`}>
                <span>{PLAN_LABELS[p]}</span>
                <b className="num">{count(dash.plans[p] ?? 0)}</b>
              </div>
            ))}
          </div>
          <p className="note">Essais compris dans Avancé. Payés : Médium {dash.paying_medium} · Avancé {dash.paying_avance}.</p>
        </section>
        <section className="cx-card">
          <h3>Villes</h3>
          <Rank items={dash.cities.map((c) => ({ label: c.city, value: c.n }))} />
        </section>
      </div>

      <div className="cx-grid">
        <section className="cx-card">
          <h3>Activités</h3>
          <Rank items={dash.activities.map((c) => ({ label: c.activity, value: c.n }))} />
        </section>
        <section className="cx-card">
          <h3>Essais qui finissent bientôt</h3>
          {ending.length === 0 ? <p className="note">Aucun dans les 3 prochains jours.</p> : (
            <ul className="cx-list">
              {ending.map((s) => (
                <li key={s.id}><span><b>{s.name}</b> · {s.city || "—"}<br /><small>{phone(s.patron_phone)} · fin le {date(s.trial_until)}</small></span><a className="cx-link" href={`tel:+${s.patron_phone}`}>Appeler</a></li>
              ))}
            </ul>
          )}
          <p className="note">Un appel avant la fin de l'essai aide beaucoup à convertir.</p>
        </section>
      </div>

      {usage && (
        <section className="cx-card">
          <h3>Coût de l’intelligence artificielle (Gemini)</h3>
          <div className="cx-kpis">
            <Kpi label="Aujourd’hui" value={amount(Math.round(usage.cost_today))} hint={`${count(usage.today.echange ?? 0)} échanges en direct · ${count(usage.today.vocal ?? 0)} vocaux · ${count(usage.today.texte ?? 0)} écrits`} />
            <Kpi label="Ce mois" value={amount(Math.round(usage.cost_month))} hint={dash.revenue_month ? `${Math.round((usage.cost_month / dash.revenue_month) * 100)} % de l’encaissé du mois` : "Rien encaissé ce mois"} tone={dash.revenue_month && usage.cost_month > dash.revenue_month * 0.5 ? "bad" : undefined} />
            <Kpi label="30 derniers jours" value={amount(Math.round(usage.cost_30))} hint="estimation au tarif payant de Google" />
            <Kpi label="Marge (MRR − coût 30 j)" value={amount(Math.round(dash.mrr - usage.cost_30))} tone={dash.mrr - usage.cost_30 < 0 ? "bad" : "good"} hint="avant Supabase (≈ 15 000 F/mois)" />
          </div>
          {usage.shops.length > 0 && (
            <ul className="cx-list">
              {usage.shops.slice(0, 8).map((u) => (
                <li key={u.shop_id}>
                  <span><b>{u.name}</b> · {u.tier}<br /><small>{count(u.echange ?? 0)} direct · {count(u.vocal ?? 0)} vocaux · {count(u.texte ?? 0)} écrits (30 j)</small></span>
                  <b className="num">{amount(u.cost_30)}</b>
                </li>
              ))}
            </ul>
          )}
          <p className="note">Limites par jour : Gratuit 10 vocaux · Médium 40 vocaux · Avancé 40 échanges en direct + 80 vocaux · Essai 20 en direct.</p>
        </section>
      )}

      <p className="note">Total encaissé depuis le lancement : <b className="num">{amount(dash.revenue_total)}</b>.</p>
    </div>
  );
}

function Payments({ overview, onChanged }: { overview: AdminOverview; onChanged: () => Promise<void> }) {
  const [note, setNote] = useState("");
  const [show, setShow] = useState<"en_attente" | "tout">("en_attente");
  const list = overview.requests.filter((r) => show === "tout" || r.status === "en_attente");

  return (
    <div className="cx-stack">
      <section className="cx-card">
        <ol className="cx-steps">
          <li>Ouvre ton appli <b>Wave Business</b>.</li>
          <li>Retrouve le paiement : même <b>montant</b>, et la <b>référence</b> dans le message.</li>
          <li>Touche <b>Activer</b> ici. L'offre de la boutique s'ouvre tout de suite.</li>
        </ol>
      </section>
      <div className="row">
        <button type="button" className={`cx-chip${show === "en_attente" ? " on" : ""}`} onClick={() => setShow("en_attente")}>À vérifier</button>
        <button type="button" className={`cx-chip${show === "tout" ? " on" : ""}`} onClick={() => setShow("tout")}>Tout l'historique</button>
      </div>
      {note && <Notice text={note} />}
      <section className="cx-card">
        {list.length === 0 ? <p className="note">{show === "en_attente" ? "Aucun paiement en attente." : "Aucun paiement pour l'instant."}</p> : (
          <ul className="cx-list">
            {list.map((r) => (
              <li key={r.id}>
                <span>
                  <b className="cx-ref">{r.reference}</b> · <b>{r.shop_name}</b>
                  <br />
                  <small>{PLAN_LABELS[r.plan]} · {r.months} mois · patron {phone(r.patron_phone)}{r.payer_phone ? ` · payé par ${r.payer_phone}` : ""} · {date(r.created_at)}</small>
                </span>
                <b className="num">{amount(r.amount)}</b>
                {r.status === "en_attente" ? (
                  <span className="row">
                    <Button className="h-9 rounded-full px-4" onClick={async () => { if (await adminDecide(r.id, true)) { setNote(`✓ ${r.shop_name} : offre ${PLAN_LABELS[r.plan]} activée pour ${r.months} mois.`); await onChanged(); } }}>Activer</Button>
                    <Button variant="ghost" className="h-9 rounded-full px-3" onClick={async () => { if (window.confirm(`Refuser le paiement ${r.reference} (introuvable dans Wave) ?`) && (await adminDecide(r.id, false))) await onChanged(); }}>Refuser</Button>
                  </span>
                ) : (
                  <span className={`cx-tag is-${r.status}`}>{r.status === "active" ? "Activé" : "Refusé"}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Shops({ shops, onChanged }: { shops: ConsoleShop[]; onChanged: () => Promise<void> }) {
  const [filter, setFilter] = useState("");
  const [plan, setPlan] = useState<PlanName | "tout">("tout");
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const list = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return shops.filter((s) => (plan === "tout" || s.effective === plan) && (!q || `${s.name} ${s.city} ${s.activity} ${s.patron_phone} ${s.patron_name ?? ""}`.toLowerCase().includes(q)));
  }, [shops, filter, plan]);

  async function setOffer(s: ConsoleShop, value: string) {
    const [p, m] = value.split(":");
    if (!p) return;
    const until = p === "gratuit" ? null : new Date(Date.now() + Number(m) * 30 * 86_400_000).toISOString();
    if (await adminSetPlan(s.id, p as PlanName, until)) {
      setNote(`✓ ${s.name} : offre ${PLAN_LABELS[p as PlanName]}${until ? ` jusqu'au ${date(until)}` : ""}.`);
      await onChanged();
    }
  }

  return (
    <div className="cx-stack">
      <div className="cx-filters">
        <Input className="h-10" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Chercher : nom, ville, numéro, activité" />
        <div className="row">
          {(["tout", "gratuit", "medium", "avance"] as const).map((p) => (
            <button key={p} type="button" className={`cx-chip${plan === p ? " on" : ""}`} onClick={() => setPlan(p)}>{p === "tout" ? `Toutes (${shops.length})` : `${PLAN_LABELS[p]} (${shops.filter((s) => s.effective === p).length})`}</button>
          ))}
        </div>
      </div>
      {note && <Notice text={note} />}
      <section className="cx-card cx-table-card">
        <table className="cx-table cx-shops-table">
          <thead>
            <tr><th>Boutique</th><th>Patron</th><th>Offre</th><th className="r">Ventes 30 j</th><th>Activité</th><th /></tr>
          </thead>
          <tbody>
            {list.map((s) => {
              const st = shopStatus(s);
              const trial = s.trial_until && Date.parse(s.trial_until) > Date.now() && !(s.plan !== "gratuit" && s.plan_until && Date.parse(s.plan_until) > Date.now());
              return (
                <Fragment key={s.id}>
                  <tr className={open === s.id ? "is-open" : ""}>
                    <td><b>{s.name}</b><br /><small>{s.city || "—"} · {s.activity || "—"}</small></td>
                    <td>{s.patron_name || "—"}<br /><small className="num">{phone(s.patron_phone)}</small></td>
                    <td><span className={`cx-tag is-${s.effective}`}>{PLAN_LABELS[s.effective]}{trial ? " · essai" : ""}</span><br /><small>{trial ? `jusqu'au ${date(s.trial_until)}` : s.plan !== "gratuit" && s.plan_until ? `payée jusqu’au ${date(s.plan_until)}` : ""}</small></td>
                    <td className="r num">{count(s.sales_30)}<br /><small>{amount(s.amount_30)}</small></td>
                    <td><span className={`cx-status is-${st}`}>{STATUS_LABEL[st]}</span><br /><small>{s.last_sale_at ? `dernière vente ${short(s.last_sale_at)}` : "aucune vente"}</small></td>
                    <td className="r"><button type="button" className="cx-link" onClick={() => setOpen(open === s.id ? null : s.id)}>{open === s.id ? "Fermer" : "Gérer"}</button></td>
                  </tr>
                  {open === s.id && (
                    <tr className="cx-detail">
                      <td colSpan={6}>
                        <div className="cx-detail-grid">
                          <span>Créée le <b>{date(s.created_at)}</b></span>
                          <span><b>{s.members}</b> membre(s) · <b>{s.products}</b> article(s)</span>
                          <a className="cx-link" href={`tel:+${s.patron_phone}`}>Appeler le patron</a>
                          <a className="cx-link" href={`https://wa.me/${s.patron_phone}`} target="_blank" rel="noopener">WhatsApp</a>
                        </div>
                        <div className="row">
                          <select className="h-10 rounded-md border px-2" value="" aria-label={`Changer l'offre de ${s.name}`} onChange={(e) => void setOffer(s, e.target.value)}>
                            <option value="">Changer l'offre…</option>
                            <option value="avance:6">Avancé offert 6 mois (pilote)</option>
                            <option value="avance:1">Avancé 1 mois</option>
                            <option value="medium:1">Médium 1 mois</option>
                            <option value="gratuit:0">Repasser en Gratuit</option>
                          </select>
                          <Button variant="outline" className="h-10 rounded-full px-4" onClick={async () => { if (await extendTrial(s.id, 7)) { setNote(`✓ ${s.name} : essai prolongé de 7 jours.`); await onChanged(); } }}>Prolonger l'essai de 7 jours</Button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {list.length === 0 && <p className="note">Aucune boutique ne correspond.</p>}
      </section>
    </div>
  );
}

function Settings({ overview, onChanged }: { overview: AdminOverview; onChanged: () => Promise<void> }) {
  const [link, setLink] = useState(overview.wave_link ?? "");
  const [pm, setPm] = useState(String(overview.price_medium));
  const [pa, setPa] = useState(String(overview.price_avance));
  const [note, setNote] = useState("");
  const [team, setTeam] = useState<AdminMember[]>([]);
  const [newAdmin, setNewAdmin] = useState("");
  const [teamNote, setTeamNote] = useState("");

  async function refreshTeam() {
    setTeam(await loadAdminTeam());
  }
  useEffect(() => {
    void refreshTeam();
  }, []);

  return (
    <div className="cx-stack">
      <section className="cx-card">
        <h3>Prix et lien de paiement</h3>
        <p className="note">Le lien Wave Business de CFC. Le montant est ajouté tout seul pour chaque demande (1, 3, 6 ou 12 mois).</p>
        <Input className="h-11" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://pay.wave.com/…" aria-label="Lien Wave Business de CFC" />
        <div className="grid-2">
          <label className="field"><span className="note">Médium (F / mois)</span><Input className="num h-11" inputMode="numeric" value={pm} onChange={(e) => setPm(e.target.value)} /></label>
          <label className="field"><span className="note">Avancé (F / mois)</span><Input className="num h-11" inputMode="numeric" value={pa} onChange={(e) => setPa(e.target.value)} /></label>
        </div>
        <Button className="h-11 rounded-full px-5" onClick={async () => {
          const ok = await adminSettings(link, Number(pm) || 0, Number(pa) || 0);
          setNote(ok ? "✓ Réglages enregistrés." : "Le lien doit commencer par https://");
          if (ok) await onChanged();
        }}>Enregistrer</Button>
        {note && <Notice text={note} />}
      </section>

      <section className="cx-card">
        <h3>Équipe CFC</h3>
        <p className="note">Ces comptes peuvent ouvrir la console. La personne doit d'abord avoir un compte Jokko.</p>
        <ul className="cx-list">
          {team.map((m) => (
            <li key={m.user_id}>
              <span><b>{m.name || "—"}</b><br /><small className="num">{phone(m.phone)}{m.me ? " · toi" : ""}</small></span>
              {!m.me && <Button variant="ghost" className="h-9 rounded-full px-3" onClick={async () => { if (window.confirm(`Retirer ${phone(m.phone)} de l'équipe CFC ?`) && (await removeAdmin(m.user_id))) void refreshTeam(); }}>Retirer</Button>}
            </li>
          ))}
        </ul>
        <div className="row">
          <Input className="h-10 max-w-xs" inputMode="tel" value={newAdmin} onChange={(e) => setNewAdmin(e.target.value)} placeholder="Numéro : 77 123 45 67" />
          <Button variant="outline" className="h-10 rounded-full px-4" onClick={async () => {
            let digits = newAdmin.replace(/\D/g, "");
            if (digits.length === 9) digits = `221${digits}`;
            const err = await addAdmin(digits);
            setTeamNote(err ?? "✓ Ajouté à l'équipe CFC.");
            if (!err) { setNewAdmin(""); void refreshTeam(); }
          }}>Ajouter</Button>
        </div>
        {teamNote && <Notice text={teamNote} tone={teamNote.startsWith("✓") ? "ok" : "erreur"} />}
      </section>
    </div>
  );
}
