import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  type ChatMessage,
  type Lang,
  type Profile,
  type Shop,
  currentShop,
  dayExpenses,
  daySales,
  debtors,
  expectedCash,
  loadProfile,
  lowStock,
  money,
  newShop,
  replaceShop,
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
import { buildReport, inventoryDue, periodOf } from "@/data/report";
import { overdueDebts } from "@/data/debts";
import { signInOrUp, supabase } from "@/data/supabase";
import { bootstrap, firstShop, onSyncState, persist, signOut, type SyncState } from "@/data/store";

const MAX_RECORDING_MS = 30_000;
const TEXT_SESSION_IDLE_MS = 3 * 60_000;

const SYNC_LABELS: Record<SyncState, string> = { ok: "Sauvegardé", en_attente: "Sauvegarde…", hors_ligne: "Hors ligne" };

type Screen = "parler" | "bilan" | "ventes" | "stock" | "clients" | "factures" | "depenses" | "dettes" | "caisse" | "reglages";

const LANGS: Array<[Lang, string]> = [
  ["wo", "Wolof"],
  ["fr", "Français"],
];

const NAV: Array<[Screen, string]> = [
  ["parler", "Parler"],
  ["bilan", "Bilan"],
  ["ventes", "Ventes"],
  ["stock", "Stock"],
  ["clients", "Clients"],
  ["factures", "Factures"],
  ["depenses", "Dépenses"],
  ["dettes", "Dettes"],
  ["caisse", "Caisse"],
  ["reglages", "Réglages"],
];

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [wantsLogin, setWantsLogin] = useState(false);
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
  if (!session) return wantsLogin ? <Login onBack={() => setWantsLogin(false)} /> : <Landing onStart={() => setWantsLogin(true)} />;
  if (!profile) return <Splash text={loading ? "Jokko ouvre ta boutique…" : "Un instant…"} />;
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

function Landing({ onStart }: { onStart: () => void }) {
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
        <Button variant="ghost" className="h-10 rounded-full px-4" onClick={onStart}>Se connecter</Button>
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
            <Button className="h-12 rounded-full px-6 text-[15px] font-semibold" onClick={onStart}>Ouvrir ma boutique</Button>
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
          <h2>Tout est ouvert dans cette démo.</h2>
        </div>
        <div className="offer-grid">
          <article>
            <h3>Seul</h3>
            <p>Une boutique. La voix, les ventes, le stock et la caisse.</p>
          </article>
          <article className="featured">
            <span className="b-tag">Le plus utile</span>
            <h3>Équipe</h3>
            <p>Le rôle caissier, les alertes de stock et les relances clients.</p>
            <Button className="mt-auto h-11 rounded-full bg-[#17191F] px-5 text-[#FFFDF7] hover:bg-[#17191F]/90" onClick={onStart}>Commencer</Button>
          </article>
          <article>
            <h3>Maison</h3>
            <p>Plusieurs boutiques, l’export, et la clé Gemini pour la voix libre.</p>
          </article>
        </div>
        <p className="note center">Démo sur cet ordinateur. Le code s’affiche à l’écran, sans SMS.</p>
      </section>

      <footer className="lfoot">
        <span className="lbrand"><JokkoMark size={24} /><span>Jokko</span></span>
        <span>La boutique qui écoute.</span>
      </footer>
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

function Login({ onBack }: { onBack: () => void }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const digits = code.replace(/\D/g, "").slice(0, 6);

  async function enter() {
    setBusy(true);
    setError("");
    const outcome = await signInOrUp(phone, digits);
    setBusy(false);
    if (!outcome.ok) setError(outcome.message);
    // Si c'est bon, la session change et l'appli ouvre la boutique toute seule.
  }

  return (
    <main className="gate">
      <section className="gate-copy">
        <JokkoMark size={52} />
        <p className="eyebrow">Jokko</p>
        <h1>Bonjour. <em className="accent">Je suis Jokko.</em></h1>
        <p className="lede">Tu parles, je travaille : ventes, stock, clients, factures.</p>
      </section>
      <section className="gate-card">
        <form
          className="fields"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) void enter();
          }}
        >
          <div className="field">
            <Label htmlFor="phone">Ton numéro de téléphone</Label>
            <Input id="phone" className="h-12 text-base" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="77 123 45 67" />
          </div>
          <div className="field">
            <Label htmlFor="code">Ton code secret (6 chiffres)</Label>
            <Input id="code" className="num h-12 text-lg tracking-[0.3em]" type="password" inputMode="numeric" autoComplete="current-password" value={digits} onChange={(e) => setCode(e.target.value)} placeholder="••••••" />
          </div>
          <p className="note">Première fois ? Choisis un code de 6 chiffres et retiens-le bien : il protège ta boutique. Déjà inscrit ? Mets ton code habituel.</p>
          {error && <p className="note" role="alert" data-tone="error">{error}</p>}
          <Button type="submit" className="h-12 rounded-full text-[15px] font-semibold" disabled={busy || phone.replace(/\D/g, "").length < 9 || digits.length !== 6}>
            {busy ? "Un instant…" : "Entrer"}
          </Button>
          <Button type="button" variant="ghost" className="h-10 rounded-full" onClick={onBack}>Retour</Button>
        </form>
      </section>
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
  if (expenses.length) return `${expenses.every((e) => e.kind === "perte") ? "Perte enregistrée" : "Dépense notée"} · ${amount(expenses.reduce((a, s) => a + s.amount, 0))}`;
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
  const [screen, setScreen] = useState<Screen>("parler");
  const shop = currentShop(profile);
  const today = useMemo(() => buildReport(shop, periodOf("jour")), [shop]);
  const late = useMemo(() => overdueDebts(shop), [shop]);
  function commit(next: Shop) {
    setProfile(replaceShop(profile, next));
  }

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
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

  return (
    <div className="desk">
      <aside className="side">
        <div className="side-brand">
          <JokkoMark size={34} listening={voice === "ecoute" && live?.phase !== "parle"} wave={wave} />
          <span>Jokko</span>
        </div>
        <nav className="side-nav" aria-label="Rubriques">
          {NAV.map(([id, label]) => (
            <button key={id} className={screen === id ? "on" : ""} aria-current={screen === id ? "page" : undefined} onClick={() => { setScreen(id); if (!busy && voice !== "ecoute") setReply(null); }}>{label}</button>
          ))}
        </nav>
        <div className="side-foot">
          <span>{profile.owner}</span>
          <Badge variant="secondary" className="capitalize">{profile.role}</Badge>
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
            <small>Fond {amount(shop.openingCash)} + ventes − dépenses</small>
          </article>
          <article className="stat stat-sales">
            <span>Ventes du jour{today.revenue - today.unknownRevenue > 0 ? <small className="stat-profit"> · bénéfice {amount(today.grossProfit)}</small> : null}</span>
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
                  {messages.map((m) => <div key={m.id} className={`bubble ${m.role}`}>{m.text}</div>)}
                </div>
              </section>
              <section className="sheet today">
                <h2>Aujourd’hui</h2>
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
          {screen === "stock" && <Stock shop={shop} commit={commit} />}
          {screen === "clients" && <Clients shop={shop} commit={commit} />}
          {screen === "factures" && <Invoices shop={shop} />}
          {screen === "depenses" && <MoneyList title="Dépenses" rows={shop.expenses.map((s) => [s.id, s.kind === "perte" ? `${s.label} (perte de stock)` : s.label, amount(s.amount), new Date(s.at).toLocaleString("fr-FR")])} />}
          {screen === "dettes" && <Debts shop={shop} lang={profile.lang} commit={commit} />}
          {screen === "bilan" && <Bilan shop={shop} commit={commit} />}
          {screen === "caisse" && <Cash shop={shop} commit={commit} />}
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

function Stock({ shop, commit }: { shop: Shop; commit: (s: Shop) => void }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("1000");
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <section className="sheet">
      <div className="sheet-head">
        <h2>Stock</h2>
        <span className="note">{lowStock(shop).length} article(s) sous le seuil</span>
      </div>
      <div className="stock-list">
        {shop.products.map((p) => {
          const low = p.stock <= p.min;
          const fill = Math.max(4, Math.min(100, (p.stock / Math.max(1, p.min * 3)) * 100));
          return (
            editing === p.id ? (
              <ProductEditor
                key={p.id}
                product={p}
                onClose={() => setEditing(null)}
                onSave={(next, stockChanged) => {
                  commit({ ...shop, products: shop.products.map((x) => (x.id === next.id ? { ...next, stock: stockChanged ? next.stock : x.stock } : x)) });
                  setEditing(null);
                }}
              />
            ) : (
            <article key={p.id} className={`${low ? "is-low" : ""} is-clickable`} onClick={() => setEditing(p.id)} title="Modifier les prix et le détail">
              <div className="stock-name">
                <b>{p.name}</b>
                <small className="num">
                  {p.cost !== undefined ? `achat ${amount(p.cost)} · ` : "prix d'achat ? · "}vente {amount(p.price)}
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
      <div className="add-row">
        <Input className="h-11" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nouvel article" />
        <Input className="num h-11" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Prix" />
        <Button className="h-11 rounded-full px-5 font-semibold" onClick={() => {
          if (!name.trim()) return;
          commit({ ...shop, products: [...shop.products, { id: uid("p"), name: name.trim(), unit: "pièce", stock: 0, min: 2, price: Number(price) || 0 }] });
          setName("");
        }}>Ajouter au stock</Button>
      </div>
      <StockImport shop={shop} commit={commit} />
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

function Invoices({ shop }: { shop: Shop }) {
  return (
    <section className="sheet">
      <div className="sheet-head">
        <h2>Factures</h2>
        <span className="count num">{shop.invoices.length}</span>
      </div>
      <div className="list">
        {shop.invoices.length === 0 && <p className="note">Dis « envoie la facture à Awa ».</p>}
        {shop.invoices.map((inv) => {
          const client = shop.clients.find((c) => c.id === inv.clientId);
          return <article key={inv.id}><span>{inv.number} · {client?.name}<small>{inv.status}</small></span><b className="num">{amount(inv.amount)}</b></article>;
        })}
      </div>
    </section>
  );
}

function Cash({ shop, commit }: { shop: Shop; commit: (s: Shop) => void }) {
  const [counted, setCounted] = useState(String(expectedCash(shop)));
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
          <div><dt>+ Ventes</dt><dd className="num">{amount(daySales(shop))}</dd></div>
          <div><dt>− Dépenses</dt><dd className="num">{amount(dayExpenses(shop))}</dd></div>
        </dl>
      </article>
      <article className="sheet cash-count">
        <div className="field">
          <Label htmlFor="counted">Compté dans le tiroir</Label>
          <Input id="counted" className="num h-14 text-2xl font-semibold" value={counted} onChange={(e) => setCounted(e.target.value)} />
        </div>
        <p className={`cash-gap${gap === 0 ? " ok" : " off"}`}>{gap === 0 ? "La caisse tombe juste." : `Écart ${amount(gap)}.`}</p>
        <Button variant="outline" className="h-11 rounded-full" onClick={() => commit({ ...shop, openingCash: Number(counted) || 0 })}>Reprendre ce montant demain matin</Button>
      </article>
    </section>
  );
}

function Settings({ profile, setProfile }: { profile: Profile; setProfile: (p: Profile) => void }) {
  const shop = currentShop(profile);
  const file = useMemo(() => toCsv(shop), [shop]);
  return (
    <section className="sheet settings">
      <h2>Réglages</h2>
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
          <Label>Rôle</Label>
          <Select value={profile.role} onValueChange={(value) => setProfile({ ...profile, role: value as Profile["role"] })}>
            <SelectTrigger className="h-11 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="patron">Patron</SelectItem>
              <SelectItem value="caissier">Caissier</SelectItem>
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
        <div className="field field-end">
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
        </div>
      </div>
      <p className="note">Le micro, la compréhension et la voix passent par Gemini sur le serveur de Jokko. Aucune clé n’est gardée dans ce navigateur.</p>
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
