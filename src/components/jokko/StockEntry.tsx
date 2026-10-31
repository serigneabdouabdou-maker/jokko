import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Lang, type Shop, money, uid } from "@/model";
import { applyStockDrafts, parseStockList, type StockDraft } from "@/assistant/stockEntry";
import { buildShopContext, listenAudio } from "@/assistant/client";

const amount = (n: number) => money(n).replace(/ /g, " ");
const toNum = (s: string) => {
  const n = Number(s.replace(/[\s  F]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Entrer le stock en parlant ou en écrivant (patron).
 * Jokko propose un tableau ; le patron corrige si besoin, puis « Enregistrer dans le stock ».
 */
export function StockEntry({ shop, lang, commit, onClose }: { shop: Shop; lang: Lang; commit: (s: Shop) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<StockDraft[] | null>(null);
  const [state, setState] = useState<"repos" | "ecoute" | "lecture">("repos");
  const [note, setNote] = useState("");
  const rec = useRef<MediaRecorder | null>(null);

  function understand(input = text) {
    const found = parseStockList(input, shop);
    setDrafts(found);
    setNote(found.length ? "" : "Je n'ai trouvé aucun article. Exemple : « 10 sacs de riz à 18 000, acheté à 16 000 ».");
  }

  async function dictate() {
    if (rec.current) {
      rec.current.stop();
      return;
    }
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setNote("Le micro n'est pas autorisé. Autorise-le, ou écris la liste.");
      return;
    }
    const chunks: Blob[] = [];
    const mimeType = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
    const recorder = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
    const limit = window.setTimeout(() => recorder.state !== "inactive" && recorder.stop(), 30_000);
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = async () => {
      window.clearTimeout(limit);
      media.getTracks().forEach((t) => t.stop());
      rec.current = null;
      setState("lecture");
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      const outcome = await listenAudio({ mimeType: blob.type || "audio/webm", data: await blobToBase64(blob) }, buildShopContext(shop, lang));
      setState("repos");
      if (!outcome.ok) {
        setNote(outcome.message);
        return;
      }
      const heard = outcome.data.transcript;
      const next = text.trim() ? `${text.trim()}, ${heard}` : heard;
      setText(next);
      understand(next);
    };
    recorder.start();
    rec.current = recorder;
    setState("ecoute");
    setNote("Je t'écoute… Dis tes articles, puis touche « J'ai fini ».");
  }

  const edit = (i: number, patch: Partial<StockDraft>) => setDrafts((d) => d && d.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <div className="stock-entry">
      <div className="sheet-head">
        <h3>Ajouter au stock en parlant ou en écrivant</h3>
        <Button variant="ghost" className="h-9 rounded-full px-3" onClick={onClose}>Fermer</Button>
      </div>
      <p className="note">Exemple : « 10 sacs de riz à 18 000, acheté à 16 000 ; 5 bidons d'huile ; 20 savons à 300 ». Les articles déjà là montent en stock, les autres sont créés.</p>
      <textarea className="stock-entry-text" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Écris ou dicte ta liste ici" />
      <div className="row">
        <Button variant={state === "ecoute" ? "default" : "outline"} className="h-11 rounded-full px-5" disabled={state === "lecture"} onClick={() => void dictate()}>
          {state === "ecoute" ? "J'ai fini" : state === "lecture" ? "Je lis…" : "🎤 Dicter"}
        </Button>
        <Button className="h-11 rounded-full px-5" disabled={!text.trim() || state !== "repos"} onClick={() => understand()}>Comprendre</Button>
      </div>
      {note && <p className="note" role="status">{note}</p>}

      {drafts && drafts.length > 0 && (
        <>
          <div className="stock-drafts">
            {drafts.map((d, i) => (
              <div key={`${d.name}-${i}`} className="stock-draft">
                <span className={`tag ${d.productId ? "is-old" : "is-new"}`}>{d.productId ? "déjà en stock" : "nouveau"}</span>
                <Input className="h-10" aria-label="Article" value={d.name} disabled={Boolean(d.productId)} onChange={(e) => edit(i, { name: e.target.value })} />
                <Input className="num h-10" aria-label="Quantité" inputMode="decimal" value={String(d.qty)} onChange={(e) => edit(i, { qty: toNum(e.target.value) })} />
                <Input className="h-10" aria-label="Unité" value={d.unit} disabled={Boolean(d.productId)} onChange={(e) => edit(i, { unit: e.target.value })} />
                <Input className="num h-10" aria-label="Prix de vente" inputMode="numeric" placeholder="prix de vente" value={d.price ?? ""} onChange={(e) => edit(i, { price: e.target.value.trim() ? toNum(e.target.value) : null })} />
                <Input className="num h-10" aria-label="Prix d'achat" inputMode="numeric" placeholder="prix d'achat" value={d.cost ?? ""} onChange={(e) => edit(i, { cost: e.target.value.trim() ? toNum(e.target.value) : null })} />
                <Button variant="ghost" className="h-10 w-10 rounded-full p-0" aria-label="Retirer la ligne" onClick={() => setDrafts((x) => x && x.filter((_, j) => j !== i))}>×</Button>
              </div>
            ))}
          </div>
          {drafts.some((d) => !d.productId && !d.price) && <p className="note" data-tone="error">Un nouvel article sans prix de vente sera à 0 F : mets son prix.</p>}
          <Button
            className="h-12 w-full rounded-full font-semibold"
            disabled={drafts.some((d) => !Number.isFinite(d.qty) || d.qty < 0 || !d.name.trim() || (d.price !== null && !Number.isFinite(d.price)) || (d.cost !== null && !Number.isFinite(d.cost)))}
            onClick={() => {
              const done = applyStockDrafts(shop, drafts, () => uid("p"));
              commit(done.shop);
              setNote(`✓ ${done.summary}`);
              setDrafts(null);
              setText("");
            }}
          >
            Enregistrer dans le stock
          </Button>
          <p className="note">Les prix ne changent que s'ils sont écrits. Valeur des nouveaux prix : {amount(drafts.reduce((a, d) => a + (d.price ?? 0) * (d.qty || 0), 0))}.</p>
        </>
      )}
    </div>
  );
}
