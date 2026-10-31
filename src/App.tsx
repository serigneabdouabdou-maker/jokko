import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  type ChatMessage,
  type Lang,
  type Payment,
  type Profile,
  type Shop,
  currentShop,
  dayCashSales,
  dayExpenses,
  daySales,
  debtors,
  expectedCash,
  loadProfile,
  lowStock,
  money,
  newShop,
  PAYMENT_LABELS,
  replaceShop,
  roleIn,
  toCsv,
  uid,
} from "./model";
import { talk } from "./talk";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { JokkoMark } from "@/components/jokko/JokkoMark";
import { VoiceBar, type VoiceReply, type VoiceState } from "@/components/jokko/VoiceBar";
import {
  type AssistantStatus,
  type Interpretation,
  assistantStatus,
  buildShopContext,
  guessOrder,
  interpretMessage,
  listenAudio,
} from "@/assistant/client";
import { type LiveHandle, type LivePhase, LiveStartError, prewarmLive, startLive } from "@/assistant/live";
import { LiveDesk, normalizeAction } from "@/assistant/liveDesk";
import { useCountUp } from "@/components/jokko/useCountUp";
import { StockImport } from "@/components/jokko/StockImport";
import { ProductEditor } from "@/components/jokko/ProductEditor";
import { Bilan } from "@/components/jokko/Bilan";
import { Debts } from "@/components/jokko/Debts";
import { Invoices } from "@/components/jokko/Invoices";
import { buildReport, inventoryDue, periodOf } from "@/data/report";
import { overdueDebts } from "@/data/debts";
import { acceptTerms, signIn, signUp, supabase } from "@/data/supabase";
import { CONDITIONS, CONFIDENTIALITE, type LegalDoc, TERMS_VERSION } from "@/legal";
import { LegalSheet } from "@/components/jokko/Legal";
import { Team } from "@/components/jokko/Team";
import { Journal } from "@/components/jokko/Journal";
import { ScanCheckout } from "@/components/jokko/ScanCheckout";
import { Labels } from "@/components/jokko/Labels";
import { StockEntry } from "@/components/jokko/StockEntry";
import { PriceTool } from "@/components/jokko/PriceTool";
import { Remote } from "@/components/jokko/Remote";
import { Advisor } from "@/components/jokko/Advisor";
import { saveCashCount } from "@/data/team";
import { waveReady } from "@/data/wave";
import { WaveSettings } from "@/components/jokko/WaveSettings";
import { normalizeCode } from "@/data/barcode";
import { OrderCard, type OrderCardData } from "@/components/jokko/OrderCard";
import { applyOrder, looksLikeOrder, type Order, orderFromGuess, orderMissing, orderPayment, parseOrder } from "@/assistant/order";
import { InstallBanner, InstallSettings } from "@/components/jokko/Install";
import { ensurePush } from "@/pwa";
import { bootstrap, firstShop, onSyncState, persist, signOut, type SyncState } from "@/data/store";

const MAX_RECORDING_MS = 30_000;
const TEXT_SESSION_IDLE_MS = 3 * 60_000;

/** Message du fil de discussion ; card = panier compris dans une liste en vrac. */
type LogMessage = ChatMessage & { card?: OrderCardData };

const SYNC_LABELS: Record<SyncState, string> = { ok: "Sauvegardé", en_attente: "Sauvegarde…", hors_ligne: "Hors ligne" };

type Screen = "parler" | "distance" | "conseiller" | "scanner" | "bilan" | "ventes" | "stock" | "clients" | "factures" | "depenses" | "dettes" | "caisse" | "equipe" | "journal" | "reglages";

const LANGS: Array<[Lang, string]> = [
  ["wo", "Wolof"],
  ["fr", "Français"],
];

const NAV: Array<[Screen, string]> = [
  ["parler", "Parler"],
  ["distance", "À distance"],
  ["conseiller", "Conseiller"],
  ["scanner", "Scanner"],
  ["bilan", "Bilan"],
  ["ventes", "Ventes"],
  ["stock", "Stock"],
  ["clients", "Clients"],
  ["factures", "Factures"],
  ["depenses", "Dépenses"],
  ["dettes", "Dettes"],
  ["caisse", "Caisse"],
  ["equipe", "Équipe"],
  ["journal", "Journal"],
  ["reglages", "Réglages"],
];

/** Rubriques réservées au patron. */
const PATRON_SCREENS: Screen[] = ["distance", "conseiller", "bilan", "equipe", "journal"];

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [wantsLogin, setWantsLogin] = useState<AuthMode | null>(null);
  const profileRef = useRef<Profile | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (!session) {
      profileRef.current = null;
      setProfileState(null);
      return;
    }
    let live = true;
    // La copie du téléphone s'affiche tout de suite ; Supabase la met à jour ensuite.
    const local = loadProfile();
    if (local?.userId === session.user.id) {
      profileRef.current = local;
      setProfileState(local);
    } else {
      setLoading(true);
    }
    void bootstrap(session).then((loaded) => {
      if (!live) return;
      profileRef.current = loaded;
      setProfileState(loaded);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const setProfile = useCallback((next: Profile) => {
    persist(profileRef.current, next);
    profileRef.current = next;
    setProfileState(next);
  }, []);

  if (session === undefined) return null;
  if (!session) return wantsLogin ? <Login mode={wantsLogin} onBack={() => setWantsLogin(null)} /> : <Landing onStart={setWantsLogin} />;
  if (!profile) return <Splash text={loading ? "Jokko ouvre ta boutique…" : "Un instant…"} />;
  if (profile.termsVersion === null) return <TermsGate profile={profile} onAccepted={() => setProfile({ ...profile, termsVersion: TERMS_VERSION })} />;
  if (!profile.shops.length) return <ShopSetup profile={profile} setProfile={setProfile} />;
  return <Desk profile={profile} setProfile={setProfile} />;
}

function Splash({ text }: { text: string }) {
  return (
    <main className="gate">
      <section className="gate-copy">
        <JokkoMark size={52} />
        <p className="lede">{text}</p>
      </section>
    </main>
  );
}

const amount = (n: number) => money(n).replace(/\u202f/g, "\u00a0");

function Num({ value, className = "" }: { value: number; className?: string }) {
  const shown = useCountUp(value);
  return <span className={`num ${className}`}>{amount(shown)}</span>;
}

function Landing({ onStart }: { onStart: (mode: AuthMode) => void }) {
  const [reading, setReading] = useState<LegalDoc | null>(null);
  const phrases = [
    "Awa m'a payé 15 000",
    "il me reste combien de riz ?",
    "envoie la facture à Moussa",
    "Jaay naa 2 huile",
    "qui me doit de l'argent ?",
    "caisse du jour",
  ];
  return (
    <main className="landing">
      <header className="lnav">
        <a className="lbrand" href="#top" aria-label="Jokko, accueil">
          <JokkoMark size={34} />
          <span>Jokko</span>
        </a>
        <nav className="llinks">
          <a href="#changer">Produit</a>
          <a href="#fonctions">Fonctions</a>
          <a href="#offres">Offres</a>
        </nav>
        <Button variant="ghost" className="h-10 rounded-full px-4" onClick={() => onStart("entrer")}>Se connecter</Button>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Gestion de boutique à la voix</p>
          <h1>
            Parlez.
            <br />
            Votre boutique <em className="accent">suit.</em>
          </h1>
          <p className="lede">
            Jokko note les ventes, surveille le stock, relance les dettes et compte la caisse. En wolof, en français, ou les deux mélangés, comme on parle à Dakar.
          </p>
          <div className="hero-cta">
            <Button className="h-12 rounded-full px-6 text-[15px] font-semibold" onClick={() => onStart("creer")}>Ouvrir ma boutique</Button>
            <a className="textlink" href="#fonctions">Voir ce qu’elle fait</a>
          </div>
          <ul className="langs" aria-label="Langues comprises">
            {LANGS.map(([id, name]) => <li key={id}>{name}</li>)}
          </ul>
        </div>

        <aside className="ticket" aria-label="Exemple de journée dans Jokko">
          <header>
            <JokkoMark size={28} />
            <div>
              <b>Boutique Awa</b>
              <span>Pikine · Alimentation</span>
            </div>
            <span className="ticket-day">Aujourd’hui</span>
          </header>
          <p className="ticket-said">« Jaay naa 2 huile »</p>
          <p className="ticket-reply">Jaay bi dugg na. Huile, 15 000 F. Huile néew na, 1 la des.</p>
          <dl className="ticket-figs">
            <div className="big">
              <dt>Caisse attendue</dt>
              <dd className="num">50 500 F</dd>
            </div>
            <div>
              <dt>Ventes</dt>
              <dd className="num">33 000 F</dd>
            </div>
            <div>
              <dt>Stock bas</dt>
              <dd>Huile · 1</dd>
            </div>
          </dl>
          <div className="ticket-voice">
            <span className="ticket-mic"><JokkoBars /></span>
            <span>Dites-le. C’est noté.</span>
          </div>
        </aside>
      </section>

      <section className="said" aria-label="Phrases que Jokko comprend">
        {phrases.map((phrase) => <span key={phrase}>« {phrase} »</span>)}
      </section>

      <section className="change" id="changer">
        <div className="section-head">
          <p className="eyebrow">Le changement</p>
          <h2>Votre commerce grandit. <em className="accent">Le suivi</em> ne reste plus dans la tête.</h2>
        </div>
        <div className="change-grid">
          <article className="before">
            <h3>Avant</h3>
            <ul>
              <li>Les chiffres restent dans la tête.</li>
              <li>Les dettes s’oublient.</li>
              <li>La rupture arrive sans prévenir.</li>
            </ul>
          </article>
          <article className="after">
            <h3>Avec Jokko</h3>
            <ul>
              <li>Chaque vente est notée, au franc près.</li>
              <li>Vous voyez qui vous doit quoi.</li>
              <li>Le stock bas parle avant la rupture.</li>
              <li>La caisse du soir tombe juste, ou l’écart est clair.</li>
            </ul>
          </article>
        </div>
      </section>

      <section className="features" id="fonctions">
        <div className="section-head">
          <p className="eyebrow">Une seule voix</p>
          <h2>Dites-le. <em className="accent">C’est noté.</em></h2>
        </div>
        <div className="bento">
          <article className="b-ventes">
            <span className="b-tag">Ventes</span>
            <p className="b-said">« Ajoute une vente de 15 000. »</p>
            <p className="b-figure num">+15 000 F</p>
            <p className="b-note">Ajoutée au jour, comptée dans la caisse.</p>
          </article>
          <article className="b-stock">
            <span className="b-tag">Stock</span>
            <p className="b-said">« Il me reste combien de riz ? »</p>
            <div className="b-levels">
              <div><span>Riz brisé</span><i style={{ ["--w" as string]: "100%" }} /><b className="num">12</b></div>
              <div className="low"><span>Huile</span><i style={{ ["--w" as string]: "20%" }} /><b className="num">3</b></div>
            </div>
          </article>
          <article className="b-dettes">
            <span className="b-tag">Clients et dettes</span>
            <p className="b-said">« Qui me doit de l’argent ? »</p>
            <p className="b-line"><span>Moussa</span><b className="num">20 000 F</b></p>
            <p className="b-line"><span>Fatou</span><b className="num">8 500 F</b></p>
          </article>
          <article className="b-factures">
            <span className="b-tag">Factures</span>
            <p className="b-said">« Envoie la facture à Awa. »</p>
            <p className="b-note">Préparée pour WhatsApp.</p>
          </article>
          <article className="b-depenses">
            <span className="b-tag">Dépenses</span>
            <p className="b-said">« J’ai payé le transport. »</p>
          </article>
          <article className="b-caisse">
            <span className="b-tag">Caisse</span>
            <p className="b-said">« On ferme. Combien dans le tiroir ? »</p>
            <p className="b-figure num">50 500 F</p>
            <p className="b-note">Fond du matin + ventes − dépenses.</p>
          </article>
        </div>
      </section>

      <section className="offers" id="offres">
        <div className="section-head">
          <p className="eyebrow">Offres</p>
          <h2>Tout ce qu’il faut pour la boutique.</h2>
        </div>
        <div className="offer-grid">
          <article>
            <h3>Seul</h3>
            <p>Une boutique. La voix en wolof et en français, les ventes, le stock, la caisse et le bilan.</p>
          </article>
          <article className="featured">
            <span className="b-tag">Le plus utile</span>
            <h3>Équipe</h3>
            <p>Les achats et le bénéfice, les dettes avec relance WhatsApp, les factures à envoyer.</p>
            <Button className="mt-auto h-11 rounded-full bg-[#17191F] px-5 text-[#FFFDF7] hover:bg-[#17191F]/90" onClick={() => onStart("creer")}>Commencer</Button>
          </article>
          <article>
            <h3>Maison</h3>
            <p>Plusieurs boutiques, l’import du stock depuis Excel et l’export pour le comptable.</p>
          </article>
        </div>
        <p className="note center">Pendant le lancement, toutes les fonctions sont ouvertes. Connexion avec ton numéro et ton code secret.</p>
      </section>

      <footer className="lfoot">
        <span className="lbrand"><JokkoMark size={24} /><span>Jokko</span></span>
        <span>La boutique qui écoute.</span>
        <span className="lfoot-links">
          <button type="button" className="link" onClick={() => setReading(CONDITIONS)}>Conditions d’utilisation</button>
          <button type="button" className="link" onClick={() => setReading(CONFIDENTIALITE)}>Confidentialité</button>
        </span>
      </footer>
      {reading && <LegalSheet doc={reading} onClose={() => setReading(null)} />}
    </main>
  );
}

function JokkoBars() {
  return (
    <span className="bars" aria-hidden="true">
      <i /><i /><i /><i /><i />
    </span>
  );
}

type AuthMode = "creer" | "entrer";

function Login({ mode: startMode, onBack }: { mode: AuthMode; onBack: () => void }) {
  const [mode, setMode] = useState<AuthMode>(startMode);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [code2, setCode2] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [reading, setReading] = useState<LegalDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const digits = code.replace(/\D/g, "").slice(0, 6);
  const digits2 = code2.replace(/\D/g, "").slice(0, 6);
  const creating = mode === "creer";
  const phoneOk = phone.replace(/\D/g, "").length >= 9;
  const mismatch = creating && digits2.length === 6 && digits2 !== digits;
  const ready = phoneOk && digits.length === 6 && (!creating || (digits2 === digits && agreed));

  function switchTo(next: AuthMode) {
    setMode(next);
    setError("");
    setCode("");
    setCode2("");
  }

  async function enter() {
    setBusy(true);
    setError("");
    const outcome = creating ? await signUp(phone, digits, TERMS_VERSION) : await signIn(phone, digits);
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.message);
      if (outcome.reason === "exists") switchTo("entrer");
    }
    // Si c'est bon, la session change et l'appli ouvre la boutique toute seule.
  }

  return (
    <main className="gate">
      <section className="gate-copy">
        <JokkoMark size={52} />
        <p className="eyebrow">Jokko</p>
        <h1>{creating ? <>Bienvenue. <em className="accent">Crée ton compte.</em></> : <>Bonjour. <em className="accent">Content de te revoir.</em></>}</h1>
        <p className="lede">Tu parles, je travaille : ventes, stock, clients, factures.</p>
      </section>
      <section className="gate-card">
        <div className="auth-tabs" role="tablist" aria-label="Compte">
          <button type="button" role="tab" aria-selected={creating} className={creating ? "on" : ""} onClick={() => switchTo("creer")}>Créer mon compte</button>
          <button type="button" role="tab" aria-selected={!creating} className={!creating ? "on" : ""} onClick={() => switchTo("entrer")}>Me connecter</button>
        </div>
        <form
          className="fields"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy && ready) void enter();
          }}
        >
          <div className="field">
            <Label htmlFor="phone">Ton numéro de téléphone</Label>
            <Input id="phone" className="h-12 text-base" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="77 123 45 67" />
          </div>
          <div className="field">
            <Label htmlFor="code">{creating ? "Choisis un code secret (6 chiffres)" : "Ton code secret (6 chiffres)"}</Label>
            <Input id="code" className="num h-12 text-lg tracking-[0.3em]" type="password" inputMode="numeric" autoComplete={creating ? "new-password" : "current-password"} value={digits} onChange={(e) => setCode(e.target.value)} placeholder="••••••" />
          </div>
          {creating && (
            <>
              <div className="field">
                <Label htmlFor="code2">Retape le même code</Label>
                <Input id="code2" className="num h-12 text-lg tracking-[0.3em]" type="password" inputMode="numeric" autoComplete="new-password" aria-invalid={mismatch} value={digits2} onChange={(e) => setCode2(e.target.value)} placeholder="••••••" />
                {mismatch && <p className="note" role="alert" data-tone="error">Les deux codes ne sont pas pareils.</p>}
              </div>
              <p className="note">Retiens bien ce code : il protège ta boutique. Ne le donne à personne.</p>
              <div className="consent">
                <Checkbox id="agree" checked={agreed} onCheckedChange={(checked) => setAgreed(checked === true)} />
                <label htmlFor="agree">
                  J’ai lu et j’accepte les{" "}
                  <button type="button" className="link" onClick={() => setReading(CONDITIONS)}>conditions d’utilisation</button> et la{" "}
                  <button type="button" className="link" onClick={() => setReading(CONFIDENTIALITE)}>politique de confidentialité</button>.
                </label>
              </div>
            </>
          )}
          {error && <p className="note" role="alert" data-tone="error">{error}</p>}
          <Button type="submit" className="h-12 rounded-full text-[15px] font-semibold" disabled={busy || !ready}>
            {busy ? "Un instant…" : creating ? "Créer mon compte" : "Entrer"}
          </Button>
          {creating && !agreed && phoneOk && digits.length === 6 && digits2 === digits && <p className="note">Coche la case pour continuer.</p>}
          <Button type="button" variant="ghost" className="h-10 rounded-full" onClick={onBack}>Retour</Button>
        </form>
      </section>
      {reading && <LegalSheet doc={reading} onClose={() => setReading(null)} />}
    </main>
  );
}

/** Compte créé avant l'arrivée des conditions (ou nouvelle version) : on demande de les accepter une fois. */
function TermsGate({ profile, onAccepted }: { profile: Profile; onAccepted: () => void }) {
  const [agreed, setAgreed] = useState(false);
  const [reading, setReading] = useState<LegalDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function accept() {
    setBusy(true);
    setError("");
    const ok = profile.userId ? await acceptTerms(profile.userId, profile.phone, TERMS_VERSION) : false;
    setBusy(false);
    if (ok) onAccepted();
    else setError("Pas de connexion internet. Réessaie.");
  }

  return (
    <main className="gate">
      <section className="gate-copy">
        <JokkoMark size={52} />
        <p className="eyebrow">Jokko</p>
        <h1>Une chose <em className="accent">avant d’entrer.</em></h1>
        <p className="lede">Lis comment Jokko protège tes données, puis accepte pour continuer.</p>
      </section>
      <section className="gate-card">
        <div className="fields">
          <div className="consent">
            <Checkbox id="agree-gate" checked={agreed} onCheckedChange={(checked) => setAgreed(checked === true)} />
            <label htmlFor="agree-gate">
              J’ai lu et j’accepte les{" "}
              <button type="button" className="link" onClick={() => setReading(CONDITIONS)}>conditions d’utilisation</button> et la{" "}
              <button type="button" className="link" onClick={() => setReading(CONFIDENTIALITE)}>politique de confidentialité</button>.
            </label>
          </div>
          {error && <p className="note" role="alert" data-tone="error">{error}</p>}
          <Button className="h-12 rounded-full text-[15px] font-semibold" disabled={busy || !agreed} onClick={() => void accept()}>
            {busy ? "Un instant…" : "Continuer"}
          </Button>
          <Button variant="ghost" className="h-10 rounded-full" onClick={() => void signOut()}>Se déconnecter</Button>
        </div>
      </section>
      {reading && <LegalSheet doc={reading} onClose={() => setReading(null)} />}
    </main>
  );
}

function ShopSetup({ profile, setProfile }: { profile: Profile; setProfile: (p: Profile) => void }) {
  const [owner, setOwner] = useState(profile.owner);
  const [shopName, setShopName] = useState("");
  const [activity, setActivity] = useState("Alimentation");
  const [city, setCity] = useState("");
  const [lang, setLang] = useState<Lang>(profile.lang || "wo");

  function finish() {
    setProfile(firstShop(profile, owner.trim(), lang, newShop(shopName.trim(), activity.trim(), city.trim())));
  }

  return (
    <main className="gate">
      <section className="gate-copy">
        <JokkoMark size={52} />
        <p className="eyebrow">Jokko</p>
        <h1>Ta boutique. <em className="accent">En deux mots.</em></h1>
        <p className="lede">Ensuite, tu parles à Jokko et il note tout.</p>
      </section>
      <section className="gate-card">
        <div className="fields">
          <div className="grid-2">
            <div className="field">
              <Label htmlFor="owner">Ton prénom</Label>
              <Input id="owner" className="h-11" value={owner} onChange={(e) => setOwner(e.target.value)} />
            </div>
            <div className="field">
              <Label>Langue de Jokko</Label>
              <Select value={lang} onValueChange={(value) => setLang(value as Lang)}>
                <SelectTrigger className="h-11 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LANGS.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="field">
            <Label htmlFor="shop">Nom de la boutique</Label>
            <Input id="shop" className="h-11" value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="Boutique Awa" />
          </div>
          <div className="grid-2">
            <div className="field">
              <Label htmlFor="activity">Tu vends quoi ?</Label>
              <Input id="activity" className="h-11" value={activity} onChange={(e) => setActivity(e.target.value)} />
            </div>
            <div className="field">
              <Label htmlFor="city">Quartier ou ville</Label>
              <Input id="city" className="h-11" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Pikine" />
            </div>
          </div>
          <Button className="h-12 rounded-full text-[15px] font-semibold" disabled={!owner.trim() || !shopName.trim()} onClick={finish}>Ouvrir la boutique</Button>
        </div>
      </section>
    </main>
  );
}

function describeChange(before: Shop, after: Shop): string | undefined {
  const fresh = <T extends { id: string }>(a: T[], b: T[]) => b.filter((x) => !a.some((y) => y.id === x.id));
  const sales = fresh(before.sales, after.sales);
  if (sales.length) return `Vente notée · ${amount(sales.reduce((a, s) => a + s.amount, 0))}`;
  const expenses = fresh(before.expenses, after.expenses);
  if (expenses.length) return `${expenses.every((e) => e.kind === "perte") ? "Perte enregistrée" : expenses.every((e) => e.kind === "achat") ? "Achat noté" : "Dépense notée"} · ${amount(expenses.reduce((a, s) => a + s.amount, 0))}`;
  const invoices = fresh(before.invoices, after.invoices);
  if (invoices.length) return `Facture ${invoices[0].number} prête`;
  if (fresh(before.reminders, after.reminders).length) return "Relance préparée";
  if (fresh(before.products, after.products).length) return "Article ajouté";
  if (before.products.some((p) => after.products.find((q) => q.id === p.id)?.stock !== p.stock)) return "Stock mis à jour";
  if (before.clients.some((c) => after.clients.find((d) => d.id === c.id)?.debt !== c.debt)) return "Dette mise à jour";
  if (before.openingCash !== after.openingCash) return "Fond de caisse mis à jour";
  return undefined;
}

const LETTERS = /[A-Za-zÀ-ÿŋñ]/;
const NOISE = /<[^>]*>/g;

function Desk({ profile, setProfile }: { profile: Profile; setProfile: (p: Profile) => void }) {
  // Une notification touchée ouvre le bon écran (?ecran=distance)
  const [screen, setScreen] = useState<Screen>(() => {
    const wanted = new URLSearchParams(window.location.search).get("ecran");
    return NAV.some(([id]) => id === wanted) ? (wanted as Screen) : "parler";
  });
  useEffect(() => {
    void ensurePush();
  }, []);
  // Wave branché pour la boutique ouverte : les paiements Wave du chat passent par la confirmation de Wave.
  const [waveOn, setWaveOn] = useState(false);
  useEffect(() => {
    void waveReady(profile.shopId).then(setWaveOn, () => setWaveOn(false));
  }, [profile.shopId]);
  const shop = currentShop(profile);
  const today = useMemo(() => buildReport(shop, periodOf("jour")), [shop]);
  const late = useMemo(() => overdueDebts(shop), [shop]);
  function commit(next: Shop) {
    setProfile(replaceShop(profile, next));
  }

  const [messages, setMessages] = useState<LogMessage[]>(() => [
    { id: "hello", role: "jokko", at: new Date().toISOString(), text: profile.lang === "wo" ? "Nanga def ? Wax ma sa jaay, sa stock, walla ku la ame." : "Dis-moi une vente, un stock, ou qui te doit de l’argent." },
  ]);
  const [text, setText] = useState("");
  const [voice, setVoice] = useState<VoiceState>("repos");
  const [reply, setReply] = useState<VoiceReply | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [wave, setWave] = useState(0);
  const [assistant, setAssistant] = useState<AssistantStatus>("checking");
  const [live, setLive] = useState<{ phase: LivePhase; caption: string } | null>(null);
  const [sync, setSync] = useState<SyncState>("ok");
  useEffect(() => onSyncState(setSync), []);
  const rec = useRef<MediaRecorder | null>(null);
  const timers = useRef<number[]>([]);
  const status = useRef<Promise<Exclude<AssistantStatus, "checking">> | null>(null);
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const liveRef = useRef<LiveHandle | null>(null);
  const connecting = useRef<Promise<LiveHandle | "microphone" | null> | null>(null);
  const idle = useRef<number | null>(null);
  const replies = useRef(0);
  const reconnects = useRef<number[]>([]);
  const turn = useRef<{ user?: string; jokko?: string; userText: string; jokkoText: string }>({ userText: "", jokkoText: "" });
  const lastUserBubble = useRef<string | null>(null);
  const deskRef = useRef<LiveDesk | null>(null);
  deskRef.current ??= new LiveDesk({
    getShop: () => currentShop(profileRef.current),
    lang: () => profileRef.current.lang,
    role: () => roleIn(profileRef.current),
    write: (next) => {
      const updated = replaceShop(profileRef.current, next);
      profileRef.current = updated;
      setProfile(updated);
    },
    onHeard: (heard) => {
      const id = lastUserBubble.current;
      if (id) setMessages((m) => m.map((msg) => (msg.id === id ? { ...msg, text: heard } : msg)));
      else {
        const next = uid("m");
        lastUserBubble.current = next;
        setMessages((m) => [...m, { id: next, role: "user", text: heard, at: new Date().toISOString() }]);
      }
    },
    onSaved: (entry) => {
      setMessages((m) => [...m, { id: uid("m"), role: "jokko", text: `✓ ${entry.summary}`, at: new Date().toISOString() }]);
      // Facture dite à la voix : on l'affiche tout de suite, avec le bouton « Envoyer sur WhatsApp ».
      if (entry.summary.startsWith("Facture ")) setScreen("factures");
      setReply({ text: "C’est enregistré.", summary: entry.summary, tone: "ok", undo: true });
      setWave((w) => w + 1);
      if (!liveRef.current?.listening) {
        setVoice("succes");
        later(1600, () => setVoice("repos"));
      }
    },
    onUndone: (entry) => {
      setMessages((m) => [...m, { id: uid("m"), role: "jokko", text: `↩ Annulé : ${entry.summary}`, at: new Date().toISOString() }]);
      setReply({ text: "Annulé. La boutique est revenue comme avant.", summary: entry.summary, tone: "ok" });
    },
  });
  const desk = deskRef.current;

  useEffect(() => () => liveRef.current?.stop(), []);
  // Changement de boutique : on n'annule jamais une écriture d'une autre boutique.
  useEffect(() => desk.reset(), [profile.shopId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const check = assistantStatus();
    status.current = check;
    let live = true;
    void check.then((value) => {
      if (live) setAssistant(value);
    });
    return () => {
      live = false;
    };
  }, []);

  // Préchauffage : quand Gemini est prêt et que le micro n'est pas ouvert, on garde
  // une conversation prête à démarrer (jeton renouvelé toutes les minutes).
  useEffect(() => {
    if (assistant !== "ready" || live) return;
    const warm = () => {
      if (!liveRef.current && document.visibilityState === "visible") {
        prewarmLive(buildShopContext(currentShop(profileRef.current), profileRef.current.lang));
      }
    };
    warm();
    const id = window.setInterval(warm, 60_000);
    document.addEventListener("visibilitychange", warm);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", warm);
    };
  }, [assistant, live]);

  // Liste des clients et articles : la préparer à l'avance avec la liste à jour, et prévenir
  // une conversation déjà ouverte quand un client ou un article est ajouté ou renommé.
  const names = JSON.stringify([shop.clients.map((c) => c.name), shop.products.map((p) => p.name)]);
  const namesRef = useRef(names);
  useEffect(() => {
    if (namesRef.current === names) return;
    namesRef.current = names;
    if (!liveRef.current && assistant === "ready") {
      prewarmLive(buildShopContext(currentShop(profileRef.current), profileRef.current.lang));
    }
    liveRef.current?.note(
      `(Info de l'écran, ne réponds pas : la boutique a changé. Clients : ${shop.clients.map((c) => `${c.name} [${c.id}]`).join(", ") || "aucun"}. Articles : ${shop.products.map((p) => `${p.name} [${p.id}]`).join(", ") || "aucun"}.)`,
    );
  }, [names]); // eslint-disable-line react-hooks/exhaustive-deps

  function say(text: string) {
    setMessages((m) => [...m, { id: uid("m"), role: "jokko", text, at: new Date().toISOString() }]);
  }

  useEffect(() => {
    if (profile.geminiKey) setProfile({ ...profile, geminiKey: "" });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function isReady(): Promise<boolean> {
    return assistant === "ready" || (assistant === "checking" && (await status.current) === "ready");
  }

  /**
   * Réponse du mode secours (sans conversation en direct) : texte seulement.
   * Jokko ne parle qu'avec sa voix en direct, pour ne jamais changer de voix.
   */
  function present(result: Interpretation, heard = "") {
    if (result.draftAction) {
      // Mêmes règles que la conversation en direct : on retrouve l'article et le client par leur nom.
      const action = normalizeAction({ ...result.draftAction }, currentShop(profileRef.current));
      if (!action) {
        const message = result.draftAction.type === "cash_count"
          ? "Le comptage de caisse se fait dans l’écran Caisse."
          : "Je n’ai pas compris quoi enregistrer. Redis la phrase en entier.";
        say(message);
        fail(message);
        return;
      }
      const saved = desk.record(action, heard);
      if (saved.ok) {
        say(result.spokenReply);
        return;
      }
      const message = `Il me manque ${saved.besoin}. Redis la phrase en entier.`;
      say(message);
      fail(message);
      return;
    }
    say(result.spokenReply);
    settle(result.spokenReply, undefined);
  }

  function bubble(role: "user" | "jokko", chunk: string) {
    const key = role === "user" ? "user" : "jokko";
    const id = turn.current[key];
    if (!id) {
      const next = uid("m");
      turn.current[key] = next;
      if (role === "user") lastUserBubble.current = next;
      setMessages((m) => [...m, { id: next, role, text: chunk.trimStart(), at: new Date().toISOString() }]);
    } else {
      setMessages((m) => m.map((msg) => (msg.id === id ? { ...msg, text: msg.text + chunk } : msg)));
    }
  }

  function micMode(stream: MediaStream) {
    clearIdle();
    setStream(stream);
    setReply(null);
    setVoice("ecoute");
    setLive({ phase: "ecoute", caption: "" });
  }

  function clearIdle() {
    if (idle.current) window.clearTimeout(idle.current);
    idle.current = null;
  }

  function armIdle() {
    clearIdle();
    idle.current = window.setTimeout(() => {
      if (liveRef.current && !liveRef.current.listening) liveRef.current.stop();
    }, TEXT_SESSION_IDLE_MS);
  }

  async function openLive(microphone: boolean, greet = false): Promise<LiveHandle | "microphone" | null> {
    const existing = liveRef.current;
    if (existing) {
      if (!microphone || existing.listening) return existing;
      try {
        micMode(await existing.listen());
        return existing;
      } catch (error) {
        fail(error instanceof Error ? error.message : "Le micro n’est pas autorisé.");
        return "microphone";
      }
    }
    if (connecting.current) return connecting.current;
    if (microphone) {
      setReply(null);
      setVoice("ecoute");
      setLive({ phase: "connexion", caption: "" });
    }
    turn.current = { userText: "", jokkoText: "" };
    lastUserBubble.current = null;
    const opening = (async (): Promise<LiveHandle | "microphone" | null> => {
      try {
        const handle = await startLive(
          buildShopContext(currentShop(profileRef.current), profileRef.current.lang),
          {
            onPhase: (phase) => {
              if (liveRef.current?.listening ?? microphone) setLive((current) => (current ? { ...current, phase } : current));
            },
            onUser: (raw) => {
              const chunk = raw.replace(NOISE, "");
              if (!chunk.trim()) return;
              if (!LETTERS.test(chunk)) return;
              turn.current.userText += chunk;
              bubble("user", chunk);
              setLive((current) => (current && !turn.current.jokkoText ? { ...current, caption: turn.current.userText.trim() } : current));
            },
            onJokko: (chunk) => {
              replies.current += 1;
              if (!turn.current.jokkoText) setWave((w) => w + 1);
              turn.current.jokkoText += chunk;
              bubble("jokko", chunk);
              const caption = turn.current.jokkoText.trim();
              if (liveRef.current?.listening) setLive((current) => (current ? { ...current, caption } : current));
              else {
                setVoice("repos");
                // Garde le résumé et le bouton Annuler d'une écriture faite pendant ce tour.
                setReply((current) => (current?.undo ? { ...current, text: caption } : { text: caption, tone: "ok" }));
              }
            },
            onTurnEnd: () => {
              turn.current = { userText: "", jokkoText: "" };
              if (!liveRef.current?.listening) armIdle();
            },
            onTool: (call) => desk.handle(call),
            onToolCancel: (ids) => desk.cancelCalls(ids),
            onEnd: (reason, reconnect) => {
              const wasListening = liveRef.current?.listening ?? false;
              clearIdle();
              liveRef.current = null;
              setLive(null);
              setStream(null);
              setVoice("repos");
              // Limite de temps de Gemini : on rouvre une conversation sans couper le commerçant.
              if (reconnect && wasListening) {
                const now = Date.now();
                reconnects.current = reconnects.current.filter((t) => now - t < 60_000);
                if (reconnects.current.length < 3) {
                  reconnects.current.push(now);
                  void openLive(true, false).then((handle) => {
                    if (!handle) fail("La conversation a été coupée. Touche le micro pour reprendre.");
                  });
                  return;
                }
                fail("La conversation a été coupée. Touche le micro pour reprendre.");
                return;
              }
              if (reason) fail(reason);
            },
          },
          { microphone, greet, mute: !profileRef.current.speak },
        );
        liveRef.current = handle;
        if (handle.stream) setStream(handle.stream);
        return handle;
      } catch (error) {
        setLive(null);
        setVoice("repos");
        if (error instanceof LiveStartError && error.reason === "microphone") {
          fail(error.message);
          return "microphone";
        }
        if (error instanceof LiveStartError && error.reason === "not_configured") setAssistant("off");
        return null;
      } finally {
        connecting.current = null;
      }
    })();
    connecting.current = opening;
    return opening;
  }

  function undoLast() {
    const entry = desk.undo();
    if (!entry) return;
    liveRef.current?.tell(`(À l'écran, le commerçant a annulé : ${entry.summary}. C'est défait. Dis-le en trois mots, sans appeler d'outil.)`);
  }

  async function interpretText(input: string): Promise<boolean> {
    if (!(await isReady())) return false;
    const outcome = await interpretMessage(input, buildShopContext(shop, profile.lang));
    if (!outcome.ok) {
      if (outcome.reason === "not_configured") {
        setAssistant("off");
        return false;
      }
      say(outcome.message);
      fail(outcome.message);
      return true;
    }
    present(outcome.data, input);
    return true;
  }

  async function hear(audio: { mimeType: string; data: string }) {
    clearTimers();
    setReply(null);
    setVoice("transcription");
    const heardNothing = "Je n’ai rien entendu. Rapproche-toi du micro et réessaie.";
    if (audio.data.length < 400) {
      fail(heardNothing);
      return;
    }
    if (!(await isReady())) {
      const message = "Le micro passe par Gemini sur le serveur, qui n’est pas configuré. Écris la phrase.";
      say(message);
      fail(message);
      return;
    }
    const outcome = await listenAudio(audio, buildShopContext(shop, profile.lang));
    if (!outcome.ok) {
      if (outcome.reason === "not_configured") setAssistant("off");
      setMessages((m) => [...m, { id: uid("m"), role: "user", text: "Message vocal", at: new Date().toISOString() }]);
      say(outcome.message);
      fail(outcome.message);
      return;
    }
    const { transcript, interpretation } = outcome.data;
    setMessages((m) => [...m, { id: uid("m"), role: "user", text: transcript, at: new Date().toISOString() }]);
    present(interpretation, transcript);
  }

  function clearTimers() {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  }
  useEffect(() => clearTimers, []);

  function later(ms: number, fn: () => void) {
    timers.current.push(window.setTimeout(fn, ms));
  }

  function settle(say: string, summary: string | undefined) {
    setReply({ text: say, summary, tone: "ok" });
    setVoice("confirmation");
    setWave((w) => w + 1);
    later(260, () => {
      if (summary) {
        setVoice("succes");
        later(1600, () => setVoice("repos"));
      } else {
        setVoice("repos");
      }
    });
  }

  function fail(message: string, summary?: string) {
    setReply({ text: message, summary, tone: "error" });
    setVoice("erreur");
    later(2400, () => setVoice("repos"));
  }

  async function send(input: string) {
    clearTimers();
    const id = uid("m");
    setMessages((m) => [...m, { id, role: "user", text: input, at: new Date().toISOString() }]);
    setText("");
    // Pendant une conversation au micro, le texte rejoint la conversation.
    // Sinon, il passe par la compréhension rapide (texte), sans ouvrir de ligne audio.
    const handle = liveRef.current;
    if (handle?.listening) {
      clearIdle();
      turn.current = { user: id, userText: input, jokkoText: "" };
      lastUserBubble.current = id;
      handle.tell(input);
      return;
    }
    if (await tryOrder(input)) return;
    setReply(null);
    setVoice("comprehension");
    let handled: boolean;
    try {
      handled = await interpretText(input);
    } catch {
      const message = "Gemini ne répond pas pour le moment. Réessaie dans un instant.";
      say(message);
      fail(message);
      handled = true;
    }
    if (handled) return;
    const result = talk(shop, input, profile.lang);
    say(result.say);
    if (result.wa) window.open(result.wa, "_blank", "noopener");
    const summary = describeChange(shop, result.shop);
    if (result.shop !== shop) desk.commit(shop, result.shop, summary ?? "Boutique mise à jour", input);
    else settle(result.say, undefined);
  }

  /** Met à jour la carte d'un message du fil. */
  function updateCard(id: string, patch: Partial<OrderCardData>) {
    setMessages((list) => list.map((m) => (m.id === id && m.card ? { ...m, card: { ...m.card, ...patch } } : m)));
  }

  /** Enregistre une carte (vente encaissée, achat, facture). Le commerçant peut annuler depuis la carte. */
  function finishOrder(id: string, order: Order, payment: Payment | null) {
    const before = currentShop(profileRef.current);
    if (order.intent === "achat" && roleIn(profileRef.current) !== "patron") {
      updateCard(id, { order, note: "Les achats pour le stock se font avec le compte du patron." });
      return;
    }
    const missing = orderMissing(before, order, payment);
    if (missing) {
      updateCard(id, { order, note: missing });
      return;
    }
    const applied = applyOrder(before, order, payment);
    if (!applied) {
      updateCard(id, { order, note: "Je n'ai pas pu l'enregistrer. Vérifie les articles." });
      return;
    }
    const entry = desk.commit(before, applied.shop, applied.summary, "");
    updateCard(id, { order: { ...order, payment }, status: "enregistre", entryId: entry.id, summary: applied.summary, note: undefined });
  }

  function undoOrder(id: string, entryId?: string) {
    if (!entryId) return;
    if (desk.undoEntry(entryId)) updateCard(id, { status: "annule" });
  }

  /**
   * Liste en vrac (« 2 sacs de riz, big bleu, big bleu… ») : panier regroupé et calculé par le code.
   * Si le paiement est dit (« payé cash »), c'est encaissé tout de suite ; sinon Jokko le demande.
   * Renvoie false si ce n'est pas une liste : la phrase suit alors le chemin habituel.
   */
  async function tryOrder(input: string): Promise<boolean> {
    // Réponse courte à « C'est payé comment ? » pour le dernier panier en attente
    const pending = [...messages].reverse().find((m) => m.card?.status === "attente" && m.card.order.intent === "vente");
    const pay = orderPayment(input);
    if (pending?.card && pay && input.trim().length <= 30 && !(pay === "wave" && waveOn)) {
      finishOrder(pending.id, pending.card.order, pay);
      return true;
    }
    if (!looksLikeOrder(input)) return false;
    let order = parseOrder(input, shop);
    // Mots flous (wolof, fautes) : Gemini léger propose les articles, le code garde les calculs.
    if ((order.unknown.length || !order.lines.length) && assistant !== "off") {
      const guess = await guessOrder(input, buildShopContext(shop, profile.lang));
      const better = guess ? orderFromGuess(guess, input, shop) : null;
      if (better && better.lines.length >= order.lines.length) order = better;
      else if (!order.lines.length) return false;
    }
    if (!order.lines.length) return false;
    const id = uid("m");
    const missing = orderMissing(shop, order, order.payment);
    setMessages((m) => [...m, { id, role: "jokko", text: "", at: new Date().toISOString(), card: { order, status: "attente" } }]);
    if (!missing && (order.intent !== "vente" || (order.payment && !(order.payment === "wave" && waveOn)))) finishOrder(id, order, order.payment);
    else say(missing ?? "C'est payé comment ?");
    return true;
  }

  async function toggleMic() {
    if (liveRef.current?.listening) {
      liveRef.current.stop();
      return;
    }
    if (rec.current) {
      rec.current.stop();
      rec.current = null;
      return;
    }
    if (live || connecting.current) return;
    clearTimers();
    if (liveRef.current || (await isReady())) {
      const handle = await openLive(true);
      if (handle) return;
      say("La conversation en direct ne démarre pas. Je passe en message vocal : parle, puis appuie de nouveau pour envoyer.");
    }
    await record();
  }

  async function record() {
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      fail("Le micro n’est pas autorisé. Autorise-le dans le navigateur, ou écris la phrase.");
      return;
    }
    const chunks: Blob[] = [];
    const mimeType = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
    const limit = window.setTimeout(() => {
      if (rec.current === recorder) {
        recorder.stop();
        rec.current = null;
      }
    }, MAX_RECORDING_MS);
    recorder.ondataavailable = (event) => chunks.push(event.data);
    recorder.onstop = async () => {
      window.clearTimeout(limit);
      media.getTracks().forEach((track) => track.stop());
      setStream(null);
      setVoice("transcription");
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      const data = await blobToBase64(blob);
      await hear({ data, mimeType: blob.type || "audio/webm" });
    };
    recorder.start();
    rec.current = recorder;
    setReply(null);
    setStream(media);
    setVoice("ecoute");
  }

  const prompts = ["Ajoute une vente de 15 000", "Il me reste combien de riz ?", "Qui me doit de l'argent ?", "Jaay naa 2 huile", "Caisse du jour", "Relance Moussa"];
  const busy = voice === "transcription" || voice === "comprehension";
  const role = roleIn(profile);
  const patron = role === "patron";
  // Un vendeur ne reste jamais sur une rubrique du patron (ex. après un changement de boutique).
  useEffect(() => {
    if (!patron && PATRON_SCREENS.includes(screen)) setScreen("parler");
  }, [patron, screen]);

  return (
    <div className="desk">
      <aside className="side">
        <div className="side-brand">
          <JokkoMark size={34} listening={voice === "ecoute" && live?.phase !== "parle"} wave={wave} />
          <span>Jokko</span>
        </div>
        <nav className="side-nav" aria-label="Rubriques">
          {NAV.filter(([id]) => patron || !PATRON_SCREENS.includes(id)).map(([id, label]) => (
            <button key={id} className={screen === id ? "on" : ""} aria-current={screen === id ? "page" : undefined} onClick={() => { setScreen(id); if (!busy && voice !== "ecoute") setReply(null); }}>{label}</button>
          ))}
        </nav>
        <div className="side-foot">
          <span>{profile.owner}</span>
          <Badge variant="secondary" className="capitalize">{role}</Badge>
        </div>
      </aside>

      <main className="main">
        <header className="top">
          <div>
            <p className="eyebrow">{shop.city} · {shop.activity}</p>
            <h1>{shop.name}</h1>
          </div>
          <div className="who">
            <span>{profile.owner}</span>
            <Badge variant={sync === "ok" ? "secondary" : "outline"} title="Sauvegarde en ligne">{SYNC_LABELS[sync]}</Badge>
          </div>
        </header>

        <section className="stats" aria-label="Chiffres du jour">
          <article className="stat stat-cash">
            <span>Caisse attendue</span>
            <Num value={expectedCash(shop)} className="stat-big" />
            <small>Fond {amount(shop.openingCash)} + ventes en espèces − dépenses</small>
          </article>
          <article className="stat stat-sales">
            <span>Ventes du jour{patron && today.revenue - today.unknownRevenue > 0 ? <small className="stat-profit"> · bénéfice {amount(today.grossProfit)}</small> : null}</span>
            <Num value={daySales(shop)} />
          </article>
          <article className="stat">
            <span>Dépenses</span>
            <Num value={dayExpenses(shop)} />
          </article>
          <article className="stat">
            <span>Dettes</span>
            <Num value={debtors(shop).reduce((a, c) => a + c.debt, 0)} />
          </article>
        </section>

        <div className="screen" key={screen}>
          {screen === "parler" && (
            <div className="work">
              <section className="sheet talk">
                <div className="sheet-head">
                  <h2>Parle à Jokko</h2>
                  <p className="note assistant-note" data-status={assistant}>
                    {assistant === "ready"
                      ? live
                        ? "Parle normalement, en wolof ou en français. Jokko enregistre tout de suite. Dis « déedéet » ou touche Annuler pour défaire."
                        : "Touche le micro et parle normalement : Jokko t’écoute en continu et enregistre tout de suite. Tu peux toujours annuler."
                      : assistant === "off"
                        ? "Gemini n’est pas configuré sur le serveur. Jokko comprend les phrases de boutique en local."
                        : "Connexion à Jokko…"}
                  </p>
                </div>
                <div className="chips">
                  {prompts.map((p) => <button key={p} disabled={busy} onClick={() => void send(p)}>{p}</button>)}
                </div>
                <div className="log">
                  {messages.map((m) =>
                    m.card ? (
                      <OrderCard
                        key={m.id}
                        card={m.card}
                        shop={shop}
                        role={role}
                        onChange={(order) => updateCard(m.id, { order, note: undefined })}
                        onConfirm={(payment, order) => finishOrder(m.id, order ?? m.card!.order, payment)}
                        onUndo={() => undoOrder(m.id, m.card?.entryId)}
                        waveShopId={waveOn ? shop.id : undefined}
                      />
                    ) : (
                      <div key={m.id} className={`bubble ${m.role}`}>{m.text}</div>
                    ),
                  )}
                </div>
              </section>
              <section className="sheet today">
                <h2>Aujourd’hui</h2>
                <InstallBanner />
                {inventoryDue(shop) && (
                  <button type="button" className="banner banner-link" onClick={() => setScreen("bilan")}>Nouveau mois : fais l'inventaire du stock →</button>
                )}
                {late.length > 0 && (
                  <button type="button" className="banner banner-link" onClick={() => setScreen("dettes")}>
                    {late.length} dette(s) en retard ({amount(late.reduce((a, d) => a + d.client.debt, 0))}) : relancer →
                  </button>
                )}
                <div className="list">
                  {lowStock(shop).map((p) => <article key={p.id} className="is-low"><span>{p.name} <em>stock bas</em></span><b className="num">{p.stock} {p.unit}</b></article>)}
                  {shop.sales.slice(0, 4).map((s) => <article key={s.id}><span>{s.label}</span><b className="num">{amount(s.amount)}</b></article>)}
                </div>
              </section>
            </div>
          )}
          {screen === "ventes" && <MoneyList title="Ventes" rows={shop.sales.map((s) => [s.id, s.label, amount(s.amount), new Date(s.at).toLocaleString("fr-FR")])} />}
          {screen === "distance" && patron && <Remote profile={profile} />}
          {screen === "conseiller" && patron && <Advisor shop={shop} />}
          {screen === "scanner" && <ScanCheckout shop={shop} commit={commit} role={role} />}
          {screen === "stock" && <Stock shop={shop} commit={commit} canEdit={patron} lang={profile.lang} />}
          {screen === "clients" && <Clients shop={shop} commit={commit} />}
          {screen === "factures" && <Invoices shop={shop} commit={commit} canEditShop={patron} />}
          {screen === "depenses" && <MoneyList title="Dépenses" rows={shop.expenses.map((s) => [s.id, s.kind === "perte" ? `${s.label} (perte de stock)` : s.kind === "achat" ? `${s.label} (achat de marchandise)` : s.label, amount(s.amount), new Date(s.at).toLocaleString("fr-FR")])} />}
          {screen === "dettes" && <Debts shop={shop} lang={profile.lang} commit={commit} />}
          {screen === "bilan" && patron && <Bilan shop={shop} commit={commit} />}
          {screen === "caisse" && <Cash shop={shop} commit={commit} canEdit={patron} />}
          {screen === "equipe" && patron && <Team shop={shop} />}
          {screen === "journal" && patron && <Journal shop={shop} />}
          {screen === "reglages" && <Settings profile={profile} setProfile={setProfile} />}
        </div>
      </main>

      <VoiceBar
        state={voice}
        reply={reply}
        stream={stream}
        text={text}
        onText={setText}
        onSend={(value) => void send(value)}
        onMic={() => void toggleMic()}
        onDismiss={() => setReply(null)}
        onUndo={undoLast}
        live={live}
      />
    </div>
  );
}

function MoneyList({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <section className="sheet">
      <div className="sheet-head">
        <h2>{title}</h2>
        <span className="count num">{rows.length}</span>
      </div>
      <div className="list">
        {rows.length === 0 && <p className="note">Rien pour l’instant.</p>}
        {rows.map((row) => <article key={row[0]}><span>{row[1]}<small>{row[3]}</small></span><b className="num">{row[2]}</b></article>)}
      </div>
    </section>
  );
}

function Stock({ shop, commit, canEdit, lang }: { shop: Shop; commit: (s: Shop) => void; canEdit: boolean; lang: Lang }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("1000");
  const [editing, setEditing] = useState<string | null>(null);
  const [tool, setTool] = useState<"voix" | "prix" | "etiquettes" | null>(null);
  const toggle = (t: typeof tool) => setTool((cur) => (cur === t ? null : t));
  const codeOwner = (code: string) =>
    shop.products.find((p) => (p.barcode && normalizeCode(p.barcode) === code) || (p.retail?.barcode && normalizeCode(p.retail.barcode) === code))?.id;
  return (
    <section className="sheet">
      <div className="sheet-head">
        <h2>Stock</h2>
        {canEdit && (
          <div className="stock-tools" role="toolbar" aria-label="Gestion du stock (patron)">
            <Button variant={tool === "voix" ? "default" : "outline"} className="h-9 rounded-full px-4" onClick={() => toggle("voix")}>🎤 Ajouter en parlant</Button>
            <Button variant={tool === "prix" ? "default" : "outline"} className="h-9 rounded-full px-4" onClick={() => toggle("prix")}>Changer les prix</Button>
            <Button variant={tool === "etiquettes" ? "default" : "outline"} className="h-9 rounded-full px-4" onClick={() => toggle("etiquettes")}>Étiquettes</Button>
          </div>
        )}
        <span className="note">{lowStock(shop).length} article(s) sous le seuil</span>
      </div>
      {canEdit && tool === "voix" && <StockEntry shop={shop} lang={lang} commit={commit} onClose={() => setTool(null)} />}
      {canEdit && tool === "prix" && <PriceTool shop={shop} commit={commit} onClose={() => setTool(null)} />}
      {canEdit && tool === "etiquettes" && <Labels shop={shop} commit={commit} onClose={() => setTool(null)} />}
      <div className="stock-list">
        {shop.products.map((p) => {
          const low = p.stock <= p.min;
          const fill = Math.max(4, Math.min(100, (p.stock / Math.max(1, p.min * 3)) * 100));
          return (
            editing === p.id ? (
              <ProductEditor
                key={p.id}
                product={p}
                codeOwner={codeOwner}
                onClose={() => setEditing(null)}
                onDelete={() => {
                  commit({ ...shop, products: shop.products.filter((x) => x.id !== p.id) });
                  setEditing(null);
                }}
                onSave={(next, stockChanged) => {
                  commit({ ...shop, products: shop.products.map((x) => (x.id === next.id ? { ...next, stock: stockChanged ? next.stock : x.stock } : x)) });
                  setEditing(null);
                }}
              />
            ) : (
            <article key={p.id} className={`${low ? "is-low" : ""}${canEdit ? " is-clickable" : ""}`} onClick={canEdit ? () => setEditing(p.id) : undefined} title={canEdit ? "Modifier les prix et le détail" : undefined}>
              <div className="stock-name">
                <b>{p.name}</b>
                <small className="num">
                  {canEdit ? (p.cost !== undefined ? `achat ${amount(p.cost)} · ` : "prix d'achat ? · ") : ""}vente {amount(p.price)}
                  {p.retail ? ` · détail ${amount(p.retail.price)}/${p.retail.unit}` : ""}
                </small>
              </div>
              <span className="meter" aria-hidden="true"><i style={{ width: `${fill}%` }} /></span>
              <b className="stock-qty num">
                {Number.isInteger(p.stock) ? p.stock : p.stock.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} <small>{p.unit}</small>
                {p.retail && !Number.isInteger(p.stock) && <small className="stock-retail"> ≈ {Math.round(p.stock * p.retail.perUnit)} {p.retail.unit}s</small>}
              </b>
            </article>
            )
          );
        })}
      </div>
      {!canEdit && <p className="note">Seul le patron ajoute des articles et change les prix.</p>}
      {canEdit && <div className="add-row">
        <Input className="h-11" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nouvel article" />
        <Input className="num h-11" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Prix" />
        <Button className="h-11 rounded-full px-5 font-semibold" onClick={() => {
          if (!name.trim()) return;
          commit({ ...shop, products: [...shop.products, { id: uid("p"), name: name.trim(), unit: "pièce", stock: 0, min: 2, price: Number(price) || 0 }] });
          setName("");
        }}>Ajouter au stock</Button>
      </div>}
      {canEdit && <StockImport shop={shop} commit={commit} />}
    </section>
  );
}

type ContactPicker = { select: (props: string[], options: { multiple: boolean }) => Promise<Array<{ name?: string[]; tel?: string[] }>> };

/** 77 123 45 67 / +221 77… → 221771234567 ; vide si ce n'est pas un numéro. */
function phoneDigits(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 9) d = `221${d}`;
  return d;
}

function Clients({ shop, commit }: { shop: Shop; commit: (s: Shop) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  // Choisir dans le répertoire du téléphone : possible sur Android (Chrome), pas sur iPhone ni ordinateur.
  const picker = (typeof navigator !== "undefined" ? (navigator as Navigator & { contacts?: ContactPicker }).contacts : undefined);

  function addClients(found: Array<{ name: string; phone: string }>) {
    const known = new Set(shop.clients.map((c) => c.phone || c.name.toLowerCase()));
    const fresh = found.filter((f) => f.name && !known.has(f.phone || f.name.toLowerCase()));
    if (!fresh.length) {
      setNote("Ces contacts sont déjà dans tes clients.");
      return;
    }
    commit({ ...shop, clients: [...shop.clients, ...fresh.map((f) => ({ id: uid("c"), name: f.name, phone: f.phone, debt: 0 }))] });
    setNote(`${fresh.length} client(s) ajouté(s).`);
  }

  async function pickContacts() {
    if (!picker) return;
    try {
      const chosen = await picker.select(["name", "tel"], { multiple: true });
      addClients(chosen.map((c) => ({ name: (c.name?.[0] ?? "").trim(), phone: phoneDigits(c.tel?.[0] ?? "") })));
    } catch {
      setNote("Le répertoire n'a pas pu s'ouvrir. Ajoute le client à la main.");
    }
  }
  return (
    <section className="sheet">
      <div className="sheet-head">
        <h2>Clients</h2>
        <span className="count num">{shop.clients.length}</span>
      </div>
      <div className="list">
        {shop.clients.map((c) => <article key={c.id}><span>{c.name}<small className="num">+{c.phone}</small></span><b className={`num${c.debt > 0 ? " owes" : ""}`}>{amount(c.debt)}</b></article>)}
      </div>
      <div className="add-row">
        <Input className="h-11" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom" />
        <Input className="num h-11" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="77 123 45 67" />
        <Button className="h-11 rounded-full px-5 font-semibold" onClick={() => {
          if (!name.trim()) return;
          addClients([{ name: name.trim(), phone: phoneDigits(phone) }]);
          setName("");
          setPhone("");
        }}>Ajouter le client</Button>
      </div>
      {picker && (
        <div className="add-row">
          <Button variant="outline" className="h-11 rounded-full px-5" onClick={() => void pickContacts()}>Choisir dans mes contacts</Button>
        </div>
      )}
      {note && <p className="note" role="status">{note}</p>}
    </section>
  );
}

function Cash({ shop, commit, canEdit }: { shop: Shop; commit: (s: Shop) => void; canEdit: boolean }) {
  const [counted, setCounted] = useState(String(expectedCash(shop)));
  const [closing, setClosing] = useState<"" | "envoi" | "ok" | "erreur">("");
  const expected = expectedCash(shop);
  const gap = (Number(counted) || 0) - expected;
  return (
    <section className="cash">
      <article className="sheet cash-main">
        <h2>Clôture de caisse</h2>
        <p className="cash-label">Attendu dans le tiroir</p>
        <Num value={expected} className="cash-big" />
        <dl className="cash-calc">
          <div><dt>Fond du matin</dt><dd className="num">{amount(shop.openingCash)}</dd></div>
          <div><dt>+ Ventes en espèces</dt><dd className="num">{amount(dayCashSales(shop))}</dd></div>
          <div><dt>− Dépenses</dt><dd className="num">{amount(dayExpenses(shop))}</dd></div>
        </dl>
        {daySales(shop) !== dayCashSales(shop) && (
          <p className="note">
            Hors tiroir aujourd’hui :{" "}
            {(["wave", "om", "credit"] as const)
              .map((m) => [m, shop.sales.filter((s) => s.payment === m && new Date(s.at).toDateString() === new Date().toDateString()).reduce((a, s) => a + s.amount, 0)] as const)
              .filter(([, v]) => v > 0)
              .map(([m, v]) => `${PAYMENT_LABELS[m]} ${amount(v)}`)
              .join(" · ")}
          </p>
        )}
      </article>
      <article className="sheet cash-count">
        <div className="field">
          <Label htmlFor="counted">Compté dans le tiroir</Label>
          <Input id="counted" className="num h-14 text-2xl font-semibold" value={counted} onChange={(e) => setCounted(e.target.value)} />
        </div>
        <p className={`cash-gap${gap === 0 ? " ok" : " off"}`}>{gap === 0 ? "La caisse tombe juste." : `Écart ${amount(gap)}.`}</p>
        <Button className="h-11 rounded-full" disabled={closing === "envoi" || !(Number(counted) >= 0)} onClick={async () => {
          setClosing("envoi");
          setClosing((await saveCashCount(shop.id, expected, Number(counted) || 0)) ? "ok" : "erreur");
        }}>{closing === "envoi" ? "Envoi…" : "Clôturer la caisse"}</Button>
        {closing === "ok" && <p className="note">✓ Clôture enregistrée. Le patron la voit à distance{gap ? `, avec l'écart de ${amount(gap)}` : ""}.</p>}
        {closing === "erreur" && <p className="note" data-tone="error">Pas de connexion internet : réessaie quand le réseau revient.</p>}
        {canEdit && <Button variant="outline" className="h-11 rounded-full" onClick={() => commit({ ...shop, openingCash: Number(counted) || 0 })}>Reprendre ce montant demain matin</Button>}
      </article>
    </section>
  );
}

function Settings({ profile, setProfile }: { profile: Profile; setProfile: (p: Profile) => void }) {
  const [reading, setReading] = useState<LegalDoc | null>(null);
  const shop = currentShop(profile);
  const file = useMemo(() => toCsv(shop), [shop]);
  return (
    <section className="sheet settings">
      <h2>Réglages</h2>
      <InstallSettings userId={roleIn(profile) === "patron" ? profile.userId : undefined} />
      {roleIn(profile) === "patron" && <WaveSettings shop={shop} />}
      <div className="settings-grid">
        <div className="field">
          <Label>Langue</Label>
          <Select value={profile.lang} onValueChange={(value) => setProfile({ ...profile, lang: value as Lang })}>
            <SelectTrigger className="h-11 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LANGS.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="field">
          <Label>Boutique active</Label>
          <Select value={profile.shopId} onValueChange={(value) => setProfile({ ...profile, shopId: value })}>
            <SelectTrigger className="h-11 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {profile.shops.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {roleIn(profile) === "patron" && <div className="field field-end">
          <Button variant="outline" className="h-11 rounded-full" onClick={() => {
            // Nouvelle boutique : mêmes articles et clients, mais avec de nouveaux identifiants (base partagée).
            const copy = {
              ...shop,
              id: uid("shop"),
              name: `${shop.name} 2`,
              products: shop.products.map((p) => ({ ...p, id: uid("p") })),
              clients: shop.clients.map((c) => ({ ...c, id: uid("c"), debt: 0 })),
              shortcuts: shop.shortcuts.map((k) => ({ ...k, id: uid("k") })),
              sales: [],
              expenses: [],
              invoices: [],
              reminders: [],
            };
            setProfile({ ...profile, shops: [...profile.shops, copy], shopId: copy.id });
          }}>Nouvelle boutique</Button>
        </div>}
      </div>
      <p className="note">Pour t’écouter et te répondre, Jokko a besoin d’internet. Tes comptes sont gardés en sécurité.</p>
      <p className="note">
        <button type="button" className="link" onClick={() => setReading(CONDITIONS)}>Conditions d’utilisation</button>
        {" · "}
        <button type="button" className="link" onClick={() => setReading(CONFIDENTIALITE)}>Politique de confidentialité</button>
      </p>
      {reading && <LegalSheet doc={reading} onClose={() => setReading(null)} />}
      <div className="row">
        <Checkbox id="speak" checked={profile.speak} onCheckedChange={(checked) => setProfile({ ...profile, speak: checked === true })} />
        <Label htmlFor="speak">Lire les réponses à voix haute</Label>
      </div>
      <div className="row actions">
        <Button variant="outline" className="h-11 rounded-full" onClick={() => download(`jokko-${shop.name}.csv`, file)}>Exporter CSV</Button>
        <Button variant="outline" className="h-11 rounded-full" onClick={() => {
          void signOut().then((ok) => {
            if (!ok) window.alert("Des ventes ne sont pas encore sauvegardées. Connecte-toi à internet, puis réessaie.");
          });
        }}>Se déconnecter</Button>
      </div>
    </section>
  );
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
