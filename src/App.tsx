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
import { AmountLedger, guardReply, moneyAmountsSaid } from "@/assistant/wolofNumbers";
import { useCountUp } from "@/components/jokko/useCountUp";
import { StockImport } from "@/components/jokko/StockImport";
import { ProductEditor } from "@/components/jokko/ProductEditor";
import { Bilan } from "@/components/jokko/Bilan";
import { Debts } from "@/components/jokko/Debts";
import { Invoices } from "@/components/jokko/Invoices";
import { Atelier } from "@/components/jokko/Atelier";
import { METIERS, expiringSoon, metierOf } from "@/data/metiers";
import { fitShopLots, removeLot } from "@/data/lots";
import { ReceiveLots } from "@/components/jokko/ReceiveLots";
import { MetierPicker } from "@/components/jokko/MetierPicker";
import { buildReport, inventoryDue, periodOf } from "@/data/report";
import { overdueDebts } from "@/data/debts";
import { acceptTerms, countLiveExchange, noteAssistant, resetCode, sendOtp, setAssistantShop, signIn, signUp, smsAvailable, SUPPORT_PHONE, QUOTA_EVENT, type QuotaDetail, supabase } from "@/data/supabase";
import { playQuotaClip, QUOTA_MESSAGES, quotaVariant, type QuotaVariant } from "@/assistant/quotaVoice";
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
import { Landing } from "@/components/jokko/Landing";
import { demoProfile, isDemoShop } from "@/data/demo";
import { guessLang, type QualityKind } from "@/data/quality";
import { ShopLocation } from "@/components/jokko/ShopLocation";
import { Icon, type IconName } from "@/components/jokko/Icon";
import { clearWantedPlan, peekWantedPlan } from "@/components/jokko/voiceIntro";
import { clearVoicePreferred, setClearVoicePreferred } from "@/assistant/clearVoice";
import { GREETINGS, greetingDue, greetPreferred, markGreeted, playGreeting, setGreetPreferred, setSpeedPreferred, type SpeechSpeed, speedPreferred, stopGreeting } from "@/assistant/greeting";
import { noisePreferred, setNoisePreferred } from "@/assistant/listenFilter";
import { Plans, Upsell } from "@/components/jokko/Plans";
import { can, effectivePlan } from "@/data/plans";
import { saveCashCount } from "@/data/team";
import { waveReady } from "@/data/wave";
import { WaveSettings } from "@/components/jokko/WaveSettings";
import { ShopManager } from "@/components/jokko/ShopManager";
import { AllShops } from "@/components/jokko/AllShops";
import { ComingSoon } from "@/components/jokko/ComingSoon";
import { cachedLaunchState, claimAccessFromUrl, hasAccess, launchState, type LaunchState } from "@/data/launch";
import { PriceSyncBanner } from "@/components/jokko/PriceSync";
import { priceChanges, type PriceChange } from "@/data/multiShop";
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

type Screen = "parler" | "offre" | "distance" | "boutiques" | "conseiller" | "scanner" | "bilan" | "ventes" | "stock" | "clients" | "factures" | "atelier" | "depenses" | "dettes" | "caisse" | "equipe" | "journal" | "reglages";

const LANGS: Array<[Lang, string]> = [
  ["wo", "Wolof"],
  ["fr", "Français"],
];

const NAV: Array<[Screen, string]> = [
  ["parler", "Parler"],
  ["distance", "À distance"],
  ["boutiques", "Mes boutiques"],
  ["conseiller", "Conseiller"],
  ["scanner", "Scanner"],
  ["bilan", "Bilan"],
  ["ventes", "Ventes"],
  ["stock", "Stock"],
  ["clients", "Clients"],
  ["factures", "Factures"],
  ["atelier", "Atelier"],
  ["depenses", "Dépenses"],
  ["dettes", "Dettes"],
  ["caisse", "Caisse"],
  ["equipe", "Équipe"],
  ["journal", "Journal"],
  ["offre", "Mon offre"],
  ["reglages", "Réglages"],
];

/** Icône de chaque rubrique (bibliothèque unique : components/jokko/Icon). */
const NAV_ICONS: Record<Screen, IconName> = {
  parler: "micro",
  distance: "distance",
  boutiques: "boutique",
  conseiller: "conseil",
  scanner: "scanner",
  bilan: "rapport",
  ventes: "vente",
  stock: "stock",
  clients: "client",
  factures: "facture",
  atelier: "reparation",
  depenses: "depense",
  dettes: "dette",
  caisse: "caisse",
  equipe: "equipe",
  journal: "journal",
  offre: "offre",
  reglages: "reglages",
};

/** Rubriques réservées au patron. */
const PATRON_SCREENS: Screen[] = ["offre", "distance", "boutiques", "conseiller", "bilan", "equipe", "journal"];

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [wantsLogin, setWantsLogin] = useState<AuthMode | null>(null);
  const [demo, setDemo] = useState<Profile | null>(null);
  const profileRef = useRef<Profile | null>(null);
  // Avant le lancement : « Bientôt disponible » pour les visiteurs (sauf appareils ouverts avec le lien d'accès).
  const [launch, setLaunch] = useState<LaunchState>(cachedLaunchState);
  const [access, setAccess] = useState(hasAccess);
  useEffect(() => {
    void claimAccessFromUrl().then(setAccess);
    void launchState().then(setLaunch);
  }, []);

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
  if (!session) {
    if (launch !== "ouvert" && !access) {
      return (
        <>
          <Landing onStart={() => undefined} langs={LANGS.map(([, name]) => name)} />
          <ComingSoon />
        </>
      );
    }
    return wantsLogin ? <Login mode={wantsLogin} onBack={() => setWantsLogin(null)} /> : <Landing onStart={setWantsLogin} langs={LANGS.map(([, name]) => name)} />;
  }
  if (!profile) return <Splash text={loading ? "Jokko ouvre ta boutique…" : "Un instant…"} />;
  if (profile.termsVersion === null) return <TermsGate profile={profile} onAccepted={() => setProfile({ ...profile, termsVersion: TERMS_VERSION })} />;
  if (!profile.shops.length) return <ShopSetup profile={profile} setProfile={setProfile} />;
  // Démo : une boutique exemple qui reste sur ce téléphone (jamais envoyée au serveur).
  if (demo) {
    return (
      <Desk
        key="demo"
        profile={demo}
        setProfile={setDemo}
        demo={{ realShopId: profile.shopId, restart: () => setDemo(demoProfile(profile)), quit: () => setDemo(null) }}
      />
    );
  }
  return <Desk key="real" profile={profile} setProfile={setProfile} onDemo={() => setDemo(demoProfile(profile))} />;
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

/** Jour (heure de Dakar = UTC) : sert à ne refuser le direct qu'une fois par jour. */
const todayKey = () => new Date().toISOString().slice(0, 10);

/** Pendant l'essai gratuit, une conversation en direct est coupée au bout de 5 minutes. */
const TRIAL_LIVE_MS = 5 * 60_000;

type AuthMode = "creer" | "entrer" | "oubli";

function Login({ mode: startMode, onBack }: { mode: AuthMode; onBack: () => void }) {
  const [mode, setMode] = useState<AuthMode>(startMode);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [code2, setCode2] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [sms, setSms] = useState<boolean | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [reading, setReading] = useState<LegalDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const digits = code.replace(/\D/g, "").slice(0, 6);
  const digits2 = code2.replace(/\D/g, "").slice(0, 6);
  const otpDigits = otp.replace(/\D/g, "").slice(0, 6);
  const creating = mode === "creer";
  const forgot = mode === "oubli";
  const newCode = creating || forgot;
  const phoneOk = phone.replace(/\D/g, "").length >= 9;
  const mismatch = newCode && digits2.length === 6 && digits2 !== digits;
  const codesOk = digits.length === 6 && (!newCode || digits2 === digits);
  // Avec les SMS branchés, l'inscription et le code oublié passent par un code reçu par SMS.
  const needsOtp = (creating && sms === true) || forgot;
  const askingOtp = needsOtp && !otpSent;
  const ready = forgot
    ? sms === true && phoneOk && (askingOtp || (otpDigits.length === 6 && codesOk))
    : phoneOk && codesOk && (!creating || agreed) && (askingOtp || !needsOtp || otpDigits.length === 6);

  useEffect(() => {
    void smsAvailable().then(setSms);
  }, []);

  function switchTo(next: AuthMode) {
    setMode(next);
    setError("");
    setInfo("");
    setCode("");
    setCode2("");
    setOtp("");
    setOtpSent(false);
  }

  async function requestOtp() {
    const failed = await sendOtp(phone, forgot ? "oubli" : "inscription");
    if (failed) {
      setError(failed);
      return;
    }
    setOtpSent(true);
    setOtp("");
    setInfo(`Code envoyé par SMS au ${phone.trim()}. Il arrive en moins d’une minute.`);
  }

  async function enter() {
    setBusy(true);
    setError("");
    if (askingOtp) {
      await requestOtp();
      setBusy(false);
      return;
    }
    const outcome = forgot
      ? await resetCode(phone, otpDigits, digits)
      : creating
        ? await signUp(phone, digits, TERMS_VERSION, needsOtp ? otpDigits : "")
        : await signIn(phone, digits);
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.message);
      if (outcome.reason === "exists") switchTo("entrer");
    }
    // Si c'est bon, la session change et l'appli ouvre la boutique toute seule.
  }

  const otpField = needsOtp && otpSent && (
    <div className="field">
      <Label htmlFor="otp">Code reçu par SMS</Label>
      <Input id="otp" className="num h-12 text-lg tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code" value={otpDigits} onChange={(e) => setOtp(e.target.value)} placeholder="123456" />
      <button
        type="button"
        className="link"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          await requestOtp();
          setBusy(false);
        }}
      >
        Pas reçu ? Renvoyer le code
      </button>
    </div>
  );

  const label = busy
    ? "Un instant…"
    : askingOtp
      ? "Recevoir le code par SMS"
      : forgot
        ? "Changer mon code"
        : creating
          ? "Créer mon compte"
          : "Entrer";

  return (
    <main className="gate">
      <section className="gate-copy">
        <JokkoMark size={52} />
        <p className="eyebrow">Jokko</p>
        <h1>
          {forgot ? <>Code oublié ? <em className="accent">On le change.</em></> : creating ? <>Bienvenue. <em className="accent">Crée ton compte.</em></> : <>Bonjour. <em className="accent">Content de te revoir.</em></>}
        </h1>
        <p className="lede">Tu parles, je travaille : ventes, stock, clients, factures.</p>
      </section>
      <section className="gate-card">
        {!forgot && (
          <div className="auth-tabs" role="tablist" aria-label="Compte">
            <button type="button" role="tab" aria-selected={creating} className={creating ? "on" : ""} onClick={() => switchTo("creer")}>Créer mon compte</button>
            <button type="button" role="tab" aria-selected={!creating} className={!creating ? "on" : ""} onClick={() => switchTo("entrer")}>Me connecter</button>
          </div>
        )}
        <form
          className="fields"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy && ready) void enter();
          }}
        >
          <div className="field">
            <Label htmlFor="phone">Ton numéro de téléphone</Label>
            <Input id="phone" className="h-12 text-base" inputMode="tel" autoComplete="tel" value={phone} readOnly={otpSent} onChange={(e) => setPhone(e.target.value)} placeholder="77 123 45 67" />
          </div>
          {forgot && sms === false && (
            <p className="note">Pour changer ton code, écris sur WhatsApp au {SUPPORT_PHONE} depuis ce numéro : on t’aide tout de suite.</p>
          )}
          {forgot && sms === true && !otpSent && <p className="note">On t’envoie un code par SMS sur ce numéro pour prouver que c’est bien toi.</p>}
          {forgot && otpField}
          {(!forgot || otpSent) && (
            <div className="field">
              <Label htmlFor="code">{forgot ? "Choisis un nouveau code secret (6 chiffres)" : creating ? "Choisis un code secret (6 chiffres)" : "Ton code secret (6 chiffres)"}</Label>
              <Input id="code" className="num h-12 text-lg tracking-[0.3em]" type="password" inputMode="numeric" autoComplete={newCode ? "new-password" : "current-password"} value={digits} onChange={(e) => setCode(e.target.value)} placeholder="••••••" />
            </div>
          )}
          {newCode && (!forgot || otpSent) && (
            <>
              <div className="field">
                <Label htmlFor="code2">Retape le même code</Label>
                <Input id="code2" className="num h-12 text-lg tracking-[0.3em]" type="password" inputMode="numeric" autoComplete="new-password" aria-invalid={mismatch} value={digits2} onChange={(e) => setCode2(e.target.value)} placeholder="••••••" />
                {mismatch && <p className="note" role="alert" data-tone="error">Les deux codes ne sont pas pareils.</p>}
              </div>
              <p className="note">Retiens bien ce code : il protège ta boutique. Ne le donne à personne.</p>
            </>
          )}
          {creating && (
            <div className="consent">
              <Checkbox id="agree" checked={agreed} onCheckedChange={(checked) => setAgreed(checked === true)} />
              <label htmlFor="agree">
                J’ai lu et j’accepte les{" "}
                <button type="button" className="link" onClick={() => setReading(CONDITIONS)}>conditions d’utilisation</button> et la{" "}
                <button type="button" className="link" onClick={() => setReading(CONFIDENTIALITE)}>politique de confidentialité</button>.
              </label>
            </div>
          )}
          {creating && otpField}
          {info && !error && <p className="note">{info}</p>}
          {error && <p className="note" role="alert" data-tone="error">{error}</p>}
          {!(forgot && sms === false) && (
            <Button type="submit" className="h-12 rounded-full text-[15px] font-semibold" disabled={busy || !ready}>
              {label}
            </Button>
          )}
          {creating && !agreed && phoneOk && codesOk && <p className="note">Coche la case pour continuer.</p>}
          {mode === "entrer" && (
            <Button type="button" variant="ghost" className="h-10 rounded-full" onClick={() => switchTo("oubli")}>Code oublié ?</Button>
          )}
          {forgot ? (
            <Button type="button" variant="ghost" className="h-10 rounded-full" onClick={() => switchTo("entrer")}>Retour à la connexion</Button>
          ) : (
            <Button type="button" variant="ghost" className="h-10 rounded-full" onClick={onBack}>Retour</Button>
          )}
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
  const [activity, setActivity] = useState(METIERS[0].label);
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
              <Label htmlFor="activity">Ton métier</Label>
              <MetierPicker id="activity" value={activity} onChange={setActivity} />
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

/** Rubriques cachées en démo : elles parlent au serveur (équipe, journal, à distance, offre). */
const DEMO_HIDDEN: Screen[] = ["offre", "distance", "boutiques", "equipe", "journal"];
type DemoControls = { realShopId: string; restart: () => void; quit: () => void };

export function Desk({ profile, setProfile, demo, onDemo }: { profile: Profile; setProfile: (p: Profile) => void; demo?: DemoControls; onDemo?: () => void }) {
  // Une notification touchée ouvre le bon écran (?ecran=distance)
  // Offre choisie sur la page d'accueil avant de créer le compte : on l'ouvre tout de suite.
  const [wantedPlan] = useState(() => {
    const w = peekWantedPlan();
    return w === "medium" || w === "avance" ? w : null;
  });
  useEffect(() => clearWantedPlan(), []);
  const [screen, setScreen] = useState<Screen>(() => {
    const wanted = new URLSearchParams(window.location.search).get("ecran");
    if (NAV.some(([id]) => id === wanted)) return wanted as Screen;
    return wantedPlan ? "offre" : "parler";
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
  function commit(input: Shop) {
    // Lots des médicaments : ce qui est vendu sort d'abord des lots qui périment le plus tôt.
    const next = fitShopLots(input);
    // Patron avec plusieurs boutiques : un prix changé ici peut être mis partout (proposé, jamais automatique).
    const before = profile.shops.find((s) => s.id === next.id);
    if (before && roleIn(profile, next.id) === "patron" && can(next, "boutiques")) {
      const others = profile.shops.filter((s) => s.id !== next.id && roleIn(profile, s.id) === "patron");
      const changes = others.length ? priceChanges(before, next, others) : [];
      if (changes.length) setPriceSync({ shopId: next.id, changes });
    }
    setProfile(replaceShop(profile, next));
  }
  const [priceSync, setPriceSync] = useState<{ shopId: string; changes: PriceChange[] } | null>(null);
  const [priceNote, setPriceNote] = useState<string | null>(null);

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
  // Forfait épuisé (essai, limite du jour) : Jokko le dit avec une voix enregistrée, l'écrit,
  // puis ouvre « Mon offre ». Sinon le commerçant croit que l'appli est en panne.
  const [quotaBanner, setQuotaBanner] = useState<QuotaVariant | null>(null);
  const lastTap = useRef(0);
  const patronRef = useRef(false);
  const quotaSpokenAt = useRef<Partial<Record<QuotaVariant, number>>>({});
  useEffect(() => {
    const onQuota = (event: Event) => {
      const detail = (event as CustomEvent<QuotaDetail>).detail ?? {};
      const variant = quotaVariant(detail, patronRef.current);
      if (!variant) return;
      setQuotaBanner(variant);
      if (detail.reason === "essai") liveRef.current?.stop();
      // Seulement si le commerçant vient d'appuyer (pas pour un préchargement en arrière-plan), et une fois par 10 min.
      const now = Date.now();
      if (now - lastTap.current > 20_000) return;
      if (now - (quotaSpokenAt.current[variant] ?? 0) < 10 * 60_000) return;
      quotaSpokenAt.current[variant] = now;
      void announceQuota(variant);
    };
    window.addEventListener(QUOTA_EVENT, onQuota);
    return () => window.removeEventListener(QUOTA_EVENT, onQuota);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function announceQuota(variant: QuotaVariant) {
    const lang = profileRef.current.lang === "fr" ? "fr" : "wo";
    const message = QUOTA_MESSAGES[variant];
    setMessages((m) => [...m, { id: uid("m"), role: "jokko", text: message[lang], at: new Date().toISOString() }]);
    if (profileRef.current.speak) {
      setVoice("confirmation");
      setWave((w) => w + 1);
      await playQuotaClip(variant, lang);
      setVoice("repos");
    }
    if (message.offers && patronRef.current) setScreen("offre");
  }
  const connecting = useRef<Promise<LiveHandle | "microphone" | null> | null>(null);
  const idle = useRef<number | null>(null);
  const replies = useRef(0);
  const reconnects = useRef<number[]>([]);
  const turn = useRef<{ user?: string; jokko?: string; userText: string; jokkoText: string }>({ userText: "", jokkoText: "" });
  const lastUserBubble = useRef<string | null>(null);
  const deskRef = useRef<LiveDesk | null>(null);
  // Cahier des erreurs : chaque action, chaque annulation, chaque « Jokko s'est trompé » (jamais en démo).
  const flagged = useRef(new Set<string>());
  const note = (kind: QualityKind, entry: { heard: string; summary: string }) => {
    if (demo) return;
    const p = profileRef.current;
    noteAssistant(p.shopId, guessLang(entry.heard, p.lang), kind, kind === "action" ? "" : entry.heard, kind === "action" ? "" : entry.summary);
  };
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
      note("action", entry);
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
    onUndone: (entry, reason) => {
      if (reason !== "coupure" && !flagged.current.delete(entry.id)) note("annule", entry);
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
  // Conversation en direct : offre Avancé (et essai). Sinon, le micro envoie des messages vocaux.
  const direct = can(shop, "direct");
  useEffect(() => {
    // En démo, l'usage de Jokko compte pour la vraie boutique (le serveur ne connaît pas la boutique exemple).
    setAssistantShop(demo ? demo.realShopId : shop.id);
  }, [shop.id, demo]);
  useEffect(() => {
    if (assistant !== "ready" || live || !direct) return;
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
  }, [assistant, live, direct]);

  // Liste des clients et articles : la préparer à l'avance avec la liste à jour, et prévenir
  // une conversation déjà ouverte quand un client ou un article est ajouté ou renommé.
  const names = JSON.stringify([shop.clients.map((c) => c.name), shop.products.map((p) => p.name)]);
  const namesRef = useRef(names);
  useEffect(() => {
    if (namesRef.current === names) return;
    namesRef.current = names;
    if (!liveRef.current && assistant === "ready" && direct) {
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
        // Garde-fou de l'argent : la phrase dit le montant ENREGISTRÉ par le code, jamais un calcul de Gemini.
        say(guardReply(result.spokenReply, moneyAmountsSaid(heard), result.language, undefined, saved.entry.amount ?? null));
        return;
      }
      const message = `Il me manque ${saved.besoin}. Redis la phrase en entier.`;
      say(message);
      fail(message);
      return;
    }
    // Garde-fou de l'argent : un montant qui ne vient ni de la phrase, ni de la boutique est remplacé.
    const book = new AmountLedger();
    book.addFrom(buildShopContext(currentShop(profileRef.current), profileRef.current.lang));
    const reply = guardReply(result.spokenReply, moneyAmountsSaid(heard), result.language, book);
    say(reply);
    settle(reply, undefined);
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

  const quotaNote = useRef<string | null>(null);
  const quotaReason = useRef<string | undefined>(undefined);
  /** Jour où le direct a été refusé pour forfait : ensuite on passe directement en message vocal. */
  const liveRefused = useRef<string | null>(null);
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
              countLiveExchange();
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
          { microphone, greet, mute: !profileRef.current.speak, clear: clearVoicePreferred(), lang: () => (profileRef.current.lang === "fr" ? "fr" : "wo"), noise: noisePreferred(), speed: speedPreferred() },
        );
        liveRef.current = handle;
        if (handle.stream) setStream(handle.stream);
        // Essai : une conversation en direct dure au plus 5 minutes (on peut en recommencer une).
        if (effectivePlan(currentShop(profileRef.current)).trial) {
          window.setTimeout(() => {
            if (liveRef.current !== handle) return;
            handle.stop();
            fail("Pendant l’essai, une conversation dure 5 minutes au plus. Touche le micro pour en commencer une autre.");
          }, TRIAL_LIVE_MS);
        }
        return handle;
      } catch (error) {
        setLive(null);
        setVoice("repos");
        if (error instanceof LiveStartError && error.reason === "microphone") {
          fail(error.message);
          return "microphone";
        }
        if (error instanceof LiveStartError && error.reason === "not_configured") setAssistant("off");
        if (error instanceof LiveStartError && error.reason === "quota") {
          quotaNote.current = error.message;
          quotaReason.current = error.quota;
        }
        return null;
      } finally {
        connecting.current = null;
      }
    })();
    connecting.current = opening;
    return opening;
  }

  /** « Jokko s'est trompé » : on note ce qui a été dit et compris, puis on annule (un seul geste). */
  function flagLast() {
    const entry = desk.last;
    if (!entry) return;
    flagged.current.add(entry.id);
    note("signale", entry);
    if (!desk.undo()) flagged.current.delete(entry.id);
    liveRef.current?.tell(`(À l'écran, le commerçant dit que tu t'es trompé : « ${entry.summary} » est annulé. Excuse-toi en trois mots et demande-lui de redire, sans appeler d'outil.)`);
    setReply({ text: "Merci, c’est noté pour améliorer Jokko. J’ai annulé : redis la phrase.", summary: entry.summary, tone: "ok" });
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
    lastTap.current = Date.now();
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
    if (can(shop, "chat") && (await tryOrder(input))) return;
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

  /**
   * Salutation automatique : la toute première fois Jokko se présente, puis il salue au premier micro de la journée.
   * Un nouvel appui pendant la salutation la coupe et ouvre le micro tout de suite.
   */
  const greeting = useRef(false);
  async function greetFirst() {
    const kind = greetingDue();
    if (!kind) return;
    markGreeted();
    const lang = profileRef.current.lang === "fr" ? "fr" : "wo";
    say(GREETINGS[kind][lang].text);
    if (!profileRef.current.speak) return;
    greeting.current = true;
    setVoice("confirmation");
    setWave((w) => w + 1);
    await playGreeting(kind, lang);
    greeting.current = false;
  }

  async function toggleMic() {
    if (greeting.current) {
      stopGreeting();
      return;
    }
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
    lastTap.current = Date.now();
    clearTimers();
    await greetFirst();
    if (liveRef.current || (direct && liveRefused.current !== todayKey() && (await isReady()))) {
      quotaNote.current = null;
      quotaReason.current = undefined;
      const handle = await openLive(true);
      if (handle) return;
      // Forfait du direct épuisé : Jokko vient de le dire (voix enregistrée). Au prochain appui : message vocal.
      if (quotaReason.current === "echanges" || quotaReason.current === "essai") {
        liveRefused.current = todayKey();
        return;
      }
      say(quotaNote.current ?? "La conversation en direct ne démarre pas. Je passe en message vocal : parle, puis appuie de nouveau pour envoyer.");
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

  const prompts = metierOf(shop.activity).ex.prompts;
  const busy = voice === "transcription" || voice === "comprehension";
  const role = roleIn(profile);
  const patron = role === "patron";
  patronRef.current = patron;
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
          {NAV.filter(([id]) => (patron || !PATRON_SCREENS.includes(id)) && !(demo && DEMO_HIDDEN.includes(id)) && (id !== "boutiques" || profile.shops.length > 1) && (id !== "atelier" || metierOf(shop.activity).atelier || (shop.repairs?.length ?? 0) > 0)).map(([id, label]) => (
            <button key={id} className={screen === id ? "on" : ""} aria-current={screen === id ? "page" : undefined} onClick={() => { setScreen(id); if (!busy && voice !== "ecoute") setReply(null); }}><Icon name={NAV_ICONS[id]} /><span>{label}</span></button>
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
            {demo ? <Badge variant="outline">Démo</Badge> : <Badge variant={sync === "ok" ? "secondary" : "outline"} title="Sauvegarde en ligne"><Icon name={sync === "hors_ligne" ? "horsLigne" : "sauvegarde"} size="sm" />{SYNC_LABELS[sync]}</Badge>}
          </div>
        </header>

        {demo && (
          <div className="demo-bar" role="status">
            <p><Icon name="boutique" size="sm" /> <b>Mode démo.</b> Boutique exemple avec des prix du Sénégal : essaie tout, rien n’est enregistré.</p>
            <div className="row">
              <Button variant="outline" className="h-9 rounded-full px-4" onClick={demo.restart}><Icon name="rafraichir" size="sm" />Recommencer</Button>
              <Button className="h-9 rounded-full px-4" onClick={demo.quit}><Icon name="fermer" size="sm" />Quitter la démo</Button>
            </div>
          </div>
        )}

        <section className="stats" aria-label="Chiffres du jour">
          <article className="stat stat-cash">
            <span className="stat-label"><Icon name="caisse" size="sm" />Caisse attendue</span>
            <Num value={expectedCash(shop)} className="stat-big" />
            <small>Fond {amount(shop.openingCash)} + ventes en espèces − dépenses</small>
          </article>
          <article className="stat stat-sales">
            <span className="stat-label"><Icon name="vente" size="sm" />Ventes du jour{patron && today.revenue - today.unknownRevenue > 0 ? <small className="stat-profit"> · bénéfice {amount(today.grossProfit)}</small> : null}</span>
            <Num value={daySales(shop)} />
          </article>
          <article className="stat">
            <span className="stat-label"><Icon name="depense" size="sm" />Dépenses</span>
            <Num value={dayExpenses(shop)} />
          </article>
          <article className="stat">
            <span className="stat-label"><Icon name="dette" size="sm" />Dettes</span>
            <Num value={debtors(shop).reduce((a, c) => a + c.debt, 0)} />
          </article>
        </section>

        <div className="screen" key={screen}>
          {screen === "parler" && (
            <div className="work">
              {!demo && onDemo && shop.products.length < 3 && (
                <section className="sheet demo-invite">
                  <div>
                    <h2>Découvre Jokko avec une boutique exemple</h2>
                    <p className="note">Riz, huile, sucre, clients, dettes et une semaine de ventes, avec des prix du Sénégal. Essaie tout sans risque : ta vraie boutique ne change pas.</p>
                  </div>
                  <Button className="h-11 rounded-full px-5" onClick={onDemo}><Icon name="boutique" size="sm" />Essayer la démo</Button>
                </section>
              )}
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
                      <div key={m.id} className={`bubble ${m.role}`}><BubbleText text={m.text} /></div>
                    ),
                  )}
                </div>
              </section>
              <section className="sheet today">
                <h2>Aujourd’hui</h2>
                {quotaBanner && (
                  <button type="button" className="banner banner-link" onClick={() => (patron && QUOTA_MESSAGES[quotaBanner].offers ? setScreen("offre") : undefined)}>
                    <Icon name={NAV_ICONS.offre} />
                    <span>{QUOTA_MESSAGES[quotaBanner].fr}</span>
                    {patron && QUOTA_MESSAGES[quotaBanner].offers && <Icon name="suivant" className="banner-go" />}
                  </button>
                )}
                <InstallBanner />
                {inventoryDue(shop) && (
                  <button type="button" className="banner banner-link" onClick={() => setScreen("bilan")}><Icon name="stock" /><span>Nouveau mois : fais l'inventaire du stock</span><Icon name="suivant" className="banner-go" /></button>
                )}
                {late.length > 0 && (
                  <button type="button" className="banner banner-link" onClick={() => setScreen("dettes")}>
                    <Icon name="dette" />
                    <span>{late.length} dette(s) en retard ({amount(late.reduce((a, d) => a + d.client.debt, 0))}) : relancer</span>
                    <Icon name="suivant" className="banner-go" />
                  </button>
                )}
                <div className="list">
                  {expiringSoon(shop.products, 30).map((p) => (
                    <article key={`exp-${p.id}-${p.expiresAt}-${p.lotRef ?? ""}`} className="is-low">
                      <span>{p.name} <em><Icon name="alerte" size="sm" />{p.daysLeft < 0 ? "périmé" : p.daysLeft === 0 ? "périme aujourd'hui" : `périme dans ${p.daysLeft} j`}</em><small>{new Date(`${p.expiresAt}T12:00:00`).toLocaleDateString("fr-FR")}{p.lotRef ? ` · lot ${p.lotRef}` : ""}</small></span>
                      <b className="num">{p.lotQty} {p.unit}</b>
                      {patron && p.daysLeft < 0 && p.lots?.length ? (
                        <Button variant="outline" className="h-9 rounded-full px-3" onClick={() => commit(removeLot(shop, p.id, p.expiresAt!, p.lotRef))}>Retirer</Button>
                      ) : null}
                    </article>
                  ))}
                  {lowStock(shop).map((p) => <article key={p.id} className="is-low"><span>{p.name} <em><Icon name="stockBas" size="sm" />stock bas</em></span><b className="num">{p.stock} {p.unit}</b></article>)}
                  {shop.sales.slice(0, 4).map((s) => <article key={s.id}><span>{s.label}</span><b className="num">{amount(s.amount)}</b></article>)}
                </div>
              </section>
            </div>
          )}
          {screen === "ventes" && <MoneyList title="Ventes" rows={shop.sales.map((s) => [s.id, s.label, amount(s.amount), new Date(s.at).toLocaleString("fr-FR")])} />}
          {screen === "offre" && patron && <Plans shop={shop} initialChoice={wantedPlan} onPlanUpdated={(plan) => plan && JSON.stringify(plan) !== JSON.stringify(shop.plan) && setProfile(replaceShop(profileRef.current, { ...currentShop(profileRef.current), plan }))} />}
          {priceSync && (
            <PriceSyncBanner
              shopId={priceSync.shopId}
              changes={priceSync.changes}
              profile={profile}
              setProfile={setProfile}
              onDone={(message) => {
                setPriceSync(null);
                setPriceNote(message);
                if (message) window.setTimeout(() => setPriceNote(null), 6000);
              }}
            />
          )}
          {priceNote && <p className="banner" role="status">{priceNote}</p>}
          {screen === "boutiques" && patron && (can(shop, "boutiques") ? <AllShops profile={profile} setProfile={setProfile} /> : <Upsell feature="boutiques" title="Toutes mes boutiques" onPlans={() => setScreen("offre")} />)}
          {screen === "distance" && patron && (can(shop, "distance") ? <Remote profile={profile} /> : <Upsell feature="distance" title="Voir la boutique à distance" onPlans={() => setScreen("offre")} />)}
          {screen === "conseiller" && patron && (can(shop, "conseiller") ? <Advisor shop={shop} /> : <Upsell feature="conseiller" title="Le Conseiller IA" onPlans={() => setScreen("offre")} />)}
          {screen === "scanner" && (can(shop, "scanner") ? <ScanCheckout shop={shop} commit={commit} role={role} /> : <Upsell feature="scanner" title="La caisse par scan" onPlans={() => setScreen(patron ? "offre" : "parler")} />)}
          {screen === "stock" && <Stock shop={shop} commit={commit} canEdit={patron} lang={profile.lang} />}
          {screen === "clients" && <Clients shop={shop} commit={commit} />}
          {screen === "factures" && <Invoices shop={shop} commit={commit} canEditShop={patron} />}
          {screen === "atelier" && <Atelier shop={shop} commit={commit} />}
          {screen === "depenses" && <MoneyList title="Dépenses" rows={shop.expenses.map((s) => [s.id, s.kind === "perte" ? `${s.label} (perte de stock)` : s.kind === "achat" ? `${s.label} (achat de marchandise)` : s.label, amount(s.amount), new Date(s.at).toLocaleString("fr-FR")])} />}
          {screen === "dettes" && <Debts shop={shop} lang={profile.lang} commit={commit} />}
          {screen === "bilan" && patron && <Bilan shop={shop} commit={commit} />}
          {screen === "caisse" && <Cash shop={shop} commit={commit} canEdit={patron} />}
          {screen === "equipe" && patron && (can(shop, "vendeurs") ? <Team shop={shop} /> : <Upsell feature="vendeurs" title="Ajouter des vendeurs" onPlans={() => setScreen("offre")} />)}
          {screen === "journal" && patron && (can(shop, "journal") ? <Journal shop={shop} /> : <Upsell feature="journal" title="Le journal de la boutique" onPlans={() => setScreen("offre")} />)}
          {screen === "reglages" && <Settings profile={profile} setProfile={setProfile} onDemo={demo ? undefined : onDemo} />}
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
        onHold={(on) => liveRef.current?.hold(on)}
        onDismiss={() => setReply(null)}
        onUndo={undoLast}
        onWrong={flagLast}
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
  const [tool, setTool] = useState<"voix" | "prix" | "etiquettes" | "reception" | null>(null);
  const toggle = (t: typeof tool) => setTool((cur) => (cur === t ? null : t));
  const codeOwner = (code: string) =>
    shop.products.find((p) => (p.barcode && normalizeCode(p.barcode) === code) || (p.retail?.barcode && normalizeCode(p.retail.barcode) === code))?.id;
  return (
    <section className="sheet">
      <div className="sheet-head">
        <h2>Stock</h2>
        {canEdit && (
          <div className="stock-tools" role="toolbar" aria-label="Gestion du stock (patron)">
            <Button variant={tool === "voix" ? "default" : "outline"} className="h-9 rounded-full px-4" onClick={() => toggle("voix")}><Icon name="micro" size="sm" />Ajouter en parlant</Button>
            <Button variant={tool === "prix" ? "default" : "outline"} className="h-9 rounded-full px-4" onClick={() => toggle("prix")}><Icon name="etiquette" size="sm" />Changer les prix</Button>
            {(metierOf(shop.activity).peremption || shop.products.some((p) => p.lots?.length)) && <Button variant={tool === "reception" ? "default" : "outline"} className="h-9 rounded-full px-4" onClick={() => toggle("reception")}><Icon name="scanner" size="sm" />Réception (dates)</Button>}
            {can(shop, "etiquettes") && <Button variant={tool === "etiquettes" ? "default" : "outline"} className="h-9 rounded-full px-4" onClick={() => toggle("etiquettes")}><Icon name="scanner" size="sm" />Étiquettes</Button>}
          </div>
        )}
        <span className="note">{lowStock(shop).length} article(s) sous le seuil</span>
      </div>
      {canEdit && tool === "voix" && <StockEntry shop={shop} lang={lang} commit={commit} onClose={() => setTool(null)} />}
      {canEdit && tool === "prix" && <PriceTool shop={shop} commit={commit} onClose={() => setTool(null)} />}
      {canEdit && tool === "etiquettes" && <Labels shop={shop} commit={commit} onClose={() => setTool(null)} />}
      {canEdit && tool === "reception" && <ReceiveLots shop={shop} commit={commit} onClose={() => setTool(null)} />}
      <div className="stock-list">
        {shop.products.map((p) => {
          const low = p.stock <= p.min;
          const fill = Math.max(4, Math.min(100, (p.stock / Math.max(1, p.min * 3)) * 100));
          return (
            editing === p.id ? (
              <ProductEditor
                key={p.id}
                units={metierOf(shop.activity).units}
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
      {canEdit && can(shop, "import") && <StockImport shop={shop} commit={commit} />}
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
          // Démo : la clôture est seulement simulée (rien n'est envoyé).
          setClosing(isDemoShop(shop) || (await saveCashCount(shop.id, expected, Number(counted) || 0)) ? "ok" : "erreur");
        }}>{closing === "envoi" ? "Envoi…" : "Clôturer la caisse"}</Button>
        {closing === "ok" && <p className="note jk-notice" data-tone="ok"><Icon name="ok" size="sm" /><span>Clôture enregistrée. Le patron la voit à distance{gap ? `, avec l'écart de ${amount(gap)}` : ""}.</span></p>}
        {closing === "erreur" && <p className="note" data-tone="error">Pas de connexion internet : réessaie quand le réseau revient.</p>}
        {canEdit && <Button variant="outline" className="h-11 rounded-full" onClick={() => commit({ ...shop, openingCash: Number(counted) || 0 })}>Reprendre ce montant demain matin</Button>}
      </article>
    </section>
  );
}

function Settings({ profile, setProfile, onDemo }: { profile: Profile; setProfile: (p: Profile) => void; onDemo?: () => void }) {
  const [reading, setReading] = useState<LegalDoc | null>(null);
  const shop = currentShop(profile);
  const file = useMemo(() => toCsv(shop), [shop]);
  return (
    <section className="sheet settings">
      <h2>Réglages</h2>
      {onDemo && (
        <div className="demo-invite">
          <div>
            <b>Démonstration</b>
            <p className="note">Ouvre une boutique exemple remplie (produits, prix du Sénégal, clients, ventes) pour montrer Jokko ou t’entraîner. Rien n’est enregistré ; « Quitter la démo » efface tout.</p>
          </div>
          <Button variant="outline" className="h-11 rounded-full px-5" onClick={onDemo}>Essayer la démo</Button>
        </div>
      )}
      <InstallSettings userId={roleIn(profile) === "patron" && can(shop, "resume") ? profile.userId : undefined} />
      {roleIn(profile) === "patron" && !isDemoShop(shop) && <ShopManager profile={profile} setProfile={setProfile} canAdd={can(shop, "boutiques")} />}
      {roleIn(profile) === "patron" && !isDemoShop(shop) && (
        <div className="field">
          <Label htmlFor="metier">Métier de « {shop.name} »</Label>
          <MetierPicker
            id="metier"
            value={shop.activity}
            onChange={(activity) => {
              const before = metierOf(shop.activity);
              const after = metierOf(activity);
              const used = shop.products.length + shop.sales.length + shop.clients.length > 0;
              if (
                before.id !== after.id &&
                used &&
                !window.confirm(
                  `« ${shop.name} » a déjà des articles, des ventes ou des clients (${before.label}).\n\n` +
                    `Si tu passes en « ${after.label} », rien n'est effacé : les anciens articles restent dans le stock.\n\n` +
                    "Pour une autre activité, crée plutôt une NOUVELLE boutique (Mes boutiques, juste au-dessus) : chaque boutique garde son stock, sa caisse et ses dettes, sans mélange.\n\nChanger quand même le métier ?",
                )
              )
                return;
              setProfile(replaceShop(profile, { ...shop, activity }));
            }}
          />
          <p className="note">Une boutique = un métier. Jokko s'y adapte : vocabulaire, exemples, unités, Atelier pour les réparateurs, dates de péremption pour les pharmacies. Pour une autre activité, crée une autre boutique.</p>
        </div>
      )}
      {roleIn(profile) === "patron" && <WaveSettings shop={shop} onLink={(waveLink) => setProfile(replaceShop(profile, { ...shop, waveLink }))} />}
      {roleIn(profile) === "patron" && !isDemoShop(shop) && (
        <ShopLocation
          shop={shop}
          onChange={(location) => {
            const { location: _old, ...rest } = shop;
            void _old;
            setProfile(replaceShop(profile, location ? { ...rest, location } : rest));
          }}
        />
      )}
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
        {roleIn(profile) !== "patron" && profile.shops.length > 1 && (
          <div className="field">
            <Label>Boutique active</Label>
            <Select value={profile.shopId} onValueChange={(value) => setProfile({ ...profile, shopId: value })}>
              <SelectTrigger className="h-11 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {profile.shops.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
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
      <ClearVoiceSetting />
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

const SPEEDS: [SpeechSpeed, string][] = [["lent", "Lent"], ["normal", "Normal"], ["rapide", "Rapide"]];

/** Écoute en boutique : filtre anti-bruit, voix claire, salutation et vitesse. */
function ClearVoiceSetting() {
  const [on, setOn] = useState(clearVoicePreferred);
  const [noise, setNoise] = useState(noisePreferred);
  const [greet, setGreet] = useState(greetPreferred);
  const [speed, setSpeed] = useState<SpeechSpeed>(speedPreferred);
  return (
    <>
      <div className="row">
        <Checkbox id="filtre-fort" checked={noise === "fort"} onCheckedChange={(checked) => { const level = checked === true ? "fort" : "normal"; setNoise(level); setNoisePreferred(level); }} />
        <Label htmlFor="filtre-fort">Boutique très bruyante : filtre anti-bruit fort (parle près du téléphone)</Label>
      </div>
      <div className="row">
        <Checkbox id="voix-claire" checked={on} onCheckedChange={(checked) => { setOn(checked === true); setClearVoicePreferred(checked === true); }} />
        <Label htmlFor="voix-claire">Toutes les réponses avec la voix de l’accueil (environ 1 seconde plus lent)</Label>
      </div>
      <div className="row">
        <Checkbox id="salutation" checked={greet} onCheckedChange={(checked) => { setGreet(checked === true); setGreetPreferred(checked === true); }} />
        <Label htmlFor="salutation">Jokko me salue au premier micro de la journée (« Asalaa maalekum ! »)</Label>
      </div>
      <div className="voice-speed">
        <span>Vitesse de la voix de Jokko</span>
        <div className="pay-modes" role="radiogroup" aria-label="Vitesse de la voix de Jokko">
          {SPEEDS.map(([value, label]) => (
            <button key={value} type="button" role="radio" aria-checked={speed === value} className={speed === value ? "on" : ""} onClick={() => { setSpeed(value); setSpeedPreferred(value); }}>{label}</button>
          ))}
        </div>
      </div>
      <p className="note">Ces réglages comptent à partir du prochain appui sur le micro.</p>
    </>
  );
}

/** Texte d'une bulle : « ✓ » et « ↩ » (anciens messages) deviennent des icônes. */
function BubbleText({ text }: { text: string }) {
  if (text.startsWith("✓ ")) return <span className="bubble-status"><Icon name="ok" size="sm" />{text.slice(2)}</span>;
  if (text.startsWith("↩ ")) return <span className="bubble-status"><Icon name="annuler" size="sm" />{text.slice(2)}</span>;
  return <>{text}</>;
}
