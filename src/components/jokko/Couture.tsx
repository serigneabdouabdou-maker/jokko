import { useRef, useState } from "react";
import { Icon } from "./Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type CoutureOrder, type Lang, type Shop, money } from "@/model";
import { readSpokenCouture } from "@/data/coutureVoice";
import { readCoutureAudio } from "@/data/coutureReader";
import {
  addCouture,
  byUrgency,
  clientMessage,
  daysLeft,
  deliverCouture,
  isOpen,
  knownMeasures,
  MEASURES,
  ordersOf,
  payCouture,
  remaining,
  setCouturePrice,
  setDueDate,
  setStep,
  STEP_LABEL,
  STEPS,
  trackUrl,
} from "@/data/couture";

const n = (v: string) => Math.max(0, Math.round(Number(v.replace(/[^\d]/g, "")) || 0));
const date = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
const EMPTY = { clientName: "", phone: "", garment: "", fabric: "", price: "", advance: "", dueAt: "", note: "" };

/**
 * Atelier couture (tailleurs) : commandes sur mesure, classées par date promise.
 * Le client reçoit un lien pour suivre son habit (reçu → coupe → couture → finition → prêt → livré).
 */
export function Couture({ shop, commit, lang = "wo" }: { shop: Shop; commit: (s: Shop) => void; lang?: Lang }) {
  const [adding, setAdding] = useState(false);
  const [voice, setVoice] = useState<"repos" | "ecoute" | "lecture">("repos");
  const [voiceNote, setVoiceNote] = useState("");
  const rec = useRef<MediaRecorder | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [measures, setMeasures] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<"cours" | "prets" | "livres">("cours");
  const all = ordersOf(shop);
  const inProgress = all.filter((o) => isOpen(o) && o.status !== "pret");
  const ready = all.filter((o) => o.status === "pret");
  const list = filter === "cours" ? byUrgency(inProgress) : filter === "prets" ? byUrgency(ready) : all.filter((o) => o.status === "livre");
  const late = inProgress.filter((o) => (daysLeft(o) ?? 1) < 0).length;
  const owed = all.filter(isOpen).reduce((a, o) => a + remaining(o), 0);

  function pickClient(name: string) {
    setForm({ ...form, clientName: name });
    const known = knownMeasures(shop, name);
    if (Object.keys(known).length) setMeasures(Object.fromEntries(Object.entries(known).map(([k, v]) => [k, String(v)])));
  }

  /** Le tailleur dit toute la commande ; Jokko remplit la fiche, il vérifie et touche « Enregistrer ». */
  async function dictate() {
    if (rec.current) {
      rec.current.stop();
      return;
    }
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setVoiceNote("Le micro n'est pas autorisé. Autorise-le dans les réglages du téléphone.");
      return;
    }
    const chunks: Blob[] = [];
    const mimeType = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
    const recorder = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
    const limit = window.setTimeout(() => recorder.state !== "inactive" && recorder.stop(), 60_000);
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = async () => {
      window.clearTimeout(limit);
      media.getTracks().forEach((t) => t.stop());
      rec.current = null;
      setVoice("lecture");
      setVoiceNote("Jokko écrit la commande…");
      const heard = await readCoutureAudio(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }), lang);
      setVoice("repos");
      if (!heard.ok) {
        setVoiceNote(heard.message);
        return;
      }
      const { input, unclear } = readSpokenCouture(heard.fields);
      const known = knownMeasures(shop, input.clientName);
      setForm({
        clientName: input.clientName,
        phone: input.phone ?? "",
        garment: input.garment,
        fabric: input.fabric ?? "",
        price: input.price ? String(input.price) : "",
        advance: input.advance ? String(input.advance) : "",
        dueAt: input.dueAt ?? "",
        note: input.note ?? "",
      });
      setMeasures(Object.fromEntries(Object.entries({ ...known, ...(input.measures ?? {}) }).map(([k, v]) => [k, String(v)])));
      setAdding(true);
      const missing = [!input.clientName && "le nom du client", !input.garment && "le modèle", ...unclear].filter(Boolean);
      setVoiceNote(`J'ai entendu : « ${heard.transcript} ». ${missing.length ? `À compléter : ${missing.join(", ")}. ` : ""}Vérifie la fiche, puis touche « Enregistrer la commande ».`);
    };
    recorder.start();
    rec.current = recorder;
    setVoice("ecoute");
    setVoiceNote(lang === "fr"
      ? "Je t'écoute… Dis le client, l'habit, le tissu, les mesures, le prix, l'avance et le jour. Puis touche « J'ai fini »."
      : "Maa ngi lay déglu… Wax kiliyaan bi, yére bi, mesure yi, njëg li, avance bi ak bis bi. Bu noppee, bësal « J'ai fini ».");
  }

  function save() {
    if (!form.clientName.trim() || !form.garment.trim()) return;
    const { shop: next, order } = addCouture(shop, { ...form, price: n(form.price), advance: n(form.advance), measures });
    commit(next);
    setForm(EMPTY);
    setMeasures({});
    setAdding(false);
    setVoiceNote("");
    setOpen(order.id);
  }

  return (
    <section className="sheet">
      <div className="sheet-head">
        <h2>Atelier couture</h2>
        <b className="num sheet-total">{inProgress.length + ready.length} en cours</b>
      </div>
      <p className="note">
        {late ? `${late} commande${late > 1 ? "s" : ""} en retard. ` : ""}
        {owed ? `Reste à encaisser : ${money(owed)}.` : "Rien à encaisser."} Chaque client reçoit un lien pour suivre son habit.
      </p>
      <div className="debt-actions" style={{ flexWrap: "wrap", gap: 8, margin: "8px 0" }}>
        <Button className="h-12 rounded-full px-5" variant={voice === "ecoute" ? "destructive" : "default"} disabled={voice === "lecture"} onClick={() => void dictate()}>
          <Icon name="micro" size="sm" /> {voice === "ecoute" ? "J'ai fini" : voice === "lecture" ? "Jokko écrit…" : "Dicter une commande"}
        </Button>
        <Button variant="outline" className="h-10 rounded-full px-4" onClick={() => setAdding((a) => !a)}>
          <Icon name="ajouter" size="sm" /> Nouvelle commande
        </Button>
        <Button variant={filter === "cours" ? "default" : "outline"} className="h-10 rounded-full px-4" onClick={() => setFilter("cours")}>En cours</Button>
        <Button variant={filter === "prets" ? "default" : "outline"} className="h-10 rounded-full px-4" onClick={() => setFilter("prets")}>Prêts ({ready.length})</Button>
        <Button variant={filter === "livres" ? "default" : "outline"} className="h-10 rounded-full px-4" onClick={() => setFilter("livres")}>Livrés</Button>
      </div>

      {voiceNote && <p className="note" role="status">{voiceNote}</p>}

      {adding && (
        <div className="list" style={{ gap: 8, display: "grid" }}>
          <Input className="h-11" placeholder="Nom du client" aria-label="Nom du client" list="couture-clients" value={form.clientName} onChange={(e) => pickClient(e.target.value)} />
          <datalist id="couture-clients">{shop.clients.map((c) => <option key={c.id} value={c.name} />)}</datalist>
          <Input className="h-11" inputMode="tel" placeholder="Téléphone du client (pour le lien de suivi)" aria-label="Téléphone du client" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input className="h-11" placeholder="Modèle (grand boubou brodé, taille basse…)" aria-label="Modèle" value={form.garment} onChange={(e) => setForm({ ...form, garment: e.target.value })} />
          <Input className="h-11" placeholder="Tissu (bazin bleu apporté, 6 m de wax…)" aria-label="Tissu" value={form.fabric} onChange={(e) => setForm({ ...form, fabric: e.target.value })} />
          <small className="note">Mesures en cm {Object.keys(knownMeasures(shop, form.clientName)).length ? "· reprises de sa dernière commande" : ""}</small>
          <div className="couture-measures">
            {MEASURES.map((m) => (
              <label key={m.key}>
                <span>{m.label}</span>
                <Input className="h-10" inputMode="decimal" aria-label={m.label} value={measures[m.key] ?? ""} onChange={(e) => setMeasures({ ...measures, [m.key]: e.target.value })} />
              </label>
            ))}
          </div>
          <Input className="h-11" inputMode="numeric" placeholder="Prix (F)" aria-label="Prix" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          <Input className="h-11" inputMode="numeric" placeholder="Avance payée (F)" aria-label="Avance" value={form.advance} onChange={(e) => setForm({ ...form, advance: e.target.value })} />
          <label className="note">
            Date promise au client
            <Input className="h-11" type="date" aria-label="Date promise" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} />
          </label>
          <Input className="h-11" placeholder="Remarque (broderie dorée, col officier…)" aria-label="Remarque" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <Button className="h-11 rounded-full" onClick={save} disabled={!form.clientName.trim() || !form.garment.trim()}>
            <Icon name="sauvegarde" size="sm" /> Enregistrer la commande
          </Button>
        </div>
      )}

      <div className="list">
        {list.length === 0 && <p className="note">{filter === "cours" ? "Aucune commande en cours." : filter === "prets" ? "Aucun habit prêt." : "Aucune commande livrée."}</p>}
        {list.map((o) => (
          <OrderRow key={o.id} o={o} shop={shop} commit={commit} open={open === o.id} toggle={() => setOpen(open === o.id ? null : o.id)} />
        ))}
      </div>
    </section>
  );
}

function OrderRow({ o, shop, commit, open, toggle }: { o: CoutureOrder; shop: Shop; commit: (s: Shop) => void; open: boolean; toggle: () => void }) {
  const [pay, setPay] = useState("");
  const [price, setPrice] = useState(o.price ? String(o.price) : "");
  const [copied, setCopied] = useState(false);
  const left = daysLeft(o);
  const rest = remaining(o);
  const origin = typeof window !== "undefined" ? window.location.origin : undefined;
  const suivi = clientMessage(shop, o, "suivi", origin);
  const pret = clientMessage(shop, o, "pret", origin);
  const next = STEPS[STEPS.indexOf(o.status) + 1];
  const measures = MEASURES.filter((m) => o.measures[m.key]).map((m) => `${m.label} ${o.measures[m.key]}`);
  const extra = Object.entries(o.measures).filter(([k]) => !MEASURES.some((m) => m.key === k)).map(([k, v]) => `${k} ${v}`);

  return (
    <article className={left !== null && left < 0 && isOpen(o) ? "is-late" : ""} style={open ? { flexWrap: "wrap" } : undefined}>
      <span onClick={toggle} style={{ cursor: "pointer" }}>
        <b>{o.number}</b> · {o.clientName} · {o.garment}
        <small>
          {STEP_LABEL[o.status]}
          {isOpen(o) && o.dueAt ? ` · pour ${date(o.dueAt)}${left !== null ? (left < 0 ? ` (retard ${-left} j)` : left === 0 ? " (aujourd'hui)" : ` (dans ${left} j)`) : ""}` : ""}
          {o.fabric ? ` · ${o.fabric}` : ""}
        </small>
      </span>
      <div className="debt-actions">
        <b className="num">{o.price ? money(o.price) : "Prix ?"}</b>
        {rest > 0 && <small className="note">reste {money(rest)}</small>}
      </div>
      {open && (
        <div style={{ display: "grid", gap: 8, width: "100%", flexBasis: "100%", marginTop: 8 }}>
          <ol className="couture-steps" aria-label="Étapes">
            {STEPS.map((s) => (
              <li key={s} className={s === o.status ? "on" : STEPS.indexOf(s) < STEPS.indexOf(o.status) ? "done" : ""}>{STEP_LABEL[s]}</li>
            ))}
          </ol>
          {(measures.length > 0 || extra.length > 0) && <small className="note">Mesures (cm) : {[...measures, ...extra].join(" · ")}</small>}
          {o.note && <small className="note">Remarque : {o.note}</small>}
          {isOpen(o) && (
            <>
              {next && next !== "livre" && (
                <Button className="h-10 rounded-full" onClick={() => { const s = setStep(shop, o.id, next); if (s) commit(s); }}>
                  <Icon name="ok" size="sm" /> Passer à : {STEP_LABEL[next]}
                </Button>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <Input className="h-10" inputMode="numeric" placeholder="Prix (F)" aria-label="Prix" value={price} onChange={(e) => setPrice(e.target.value)} />
                <Button variant="outline" className="h-10 rounded-full px-3" onClick={() => commit(setCouturePrice(shop, o.id, n(price)))}>Fixer le prix</Button>
              </div>
              <label className="note">
                Date promise
                <Input className="h-10" type="date" aria-label="Date promise" value={o.dueAt ?? ""} onChange={(e) => commit(setDueDate(shop, o.id, e.target.value))} />
              </label>
              <Input className="h-10" inputMode="numeric" placeholder={rest ? `Payé maintenant (reste ${money(rest)})` : "Payé maintenant (F)"} aria-label="Payé maintenant" value={pay} onChange={(e) => setPay(e.target.value)} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <Button variant="outline" className="h-10 rounded-full px-3" disabled={!n(pay)} onClick={() => { const s = payCouture(shop, o.id, n(pay)); if (s) { commit(s); setPay(""); } }}>
                  Acompte
                </Button>
                <Button className="h-10 rounded-full px-3" onClick={() => { const s = deliverCouture(shop, o.id, n(pay)); if (s) commit(s); }}>
                  <Icon name="ok" size="sm" /> Livré{rest - n(pay) > 0 ? " (reste en dette)" : ""}
                </Button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {pret && o.status === "pret" && (
                  <Button className="h-10 rounded-full px-3" onClick={() => window.open(pret, "_blank", "noopener")}>
                    <Icon name="whatsapp" size="sm" /> Prévenir : c'est prêt
                  </Button>
                )}
                {suivi && (
                  <Button variant="outline" className="h-10 rounded-full px-3" onClick={() => window.open(suivi, "_blank", "noopener")}>
                    <Icon name="whatsapp" size="sm" /> Envoyer le lien de suivi
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="h-10 rounded-full px-3"
                  onClick={() => {
                    void navigator.clipboard?.writeText(trackUrl(o, origin)).then(() => setCopied(true), () => undefined);
                  }}
                >
                  {copied ? "Lien copié ✓" : "Copier le lien"}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </article>
  );
}
