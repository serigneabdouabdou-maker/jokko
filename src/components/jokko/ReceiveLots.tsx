import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Shop } from "@/model";
import { findByCode, normalizeCode } from "@/data/barcode";
import { parseGs1 } from "@/data/gs1";
import { receiveLot } from "@/data/lots";
import { beep, type CameraScan, startCamera } from "@/data/scanner";

/**
 * Réception d'une livraison avec les dates de péremption (pharmacie).
 * Scanne le code carré de la boîte : produit, date et lot se remplissent tout seuls ; tu mets la quantité reçue.
 * Sans code carré : choisis l'article et tape la date.
 */
export function ReceiveLots({ shop, commit, onClose }: { shop: Shop; commit: (s: Shop) => void; onClose: () => void }) {
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("1");
  const [date, setDate] = useState("");
  const [lot, setLot] = useState("");
  const [code, setCode] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scanRef = useRef<CameraScan | null>(null);
  const shopRef = useRef(shop);
  shopRef.current = shop;

  function read(raw: string) {
    const gs1 = parseGs1(raw);
    const match = findByCode(shopRef.current, raw);
    if (gs1?.expiresAt) setDate(gs1.expiresAt);
    if (gs1?.lot) setLot(gs1.lot);
    if (match) {
      setProductId(match.product.id);
      beep(true);
      setNote(`${match.product.name}${gs1?.expiresAt ? ` · périme le ${new Date(`${gs1.expiresAt}T12:00:00`).toLocaleDateString("fr-FR")}` : ""}${gs1?.lot ? ` · lot ${gs1.lot}` : ""}. Mets la quantité reçue.`);
    } else {
      beep(false);
      setCode(normalizeCode(raw));
      setNote(`Code inconnu (${normalizeCode(raw)}). Choisis l'article : le code lui sera attaché pour la prochaine fois.`);
    }
  }

  useEffect(() => () => scanRef.current?.stop(), []);

  async function toggleCamera() {
    if (camera) {
      scanRef.current?.stop();
      scanRef.current = null;
      setCamera(false);
      return;
    }
    if (!videoRef.current) return;
    setCamera(true);
    try {
      scanRef.current = await startCamera(videoRef.current, read);
    } catch {
      setCamera(false);
      setNote("La caméra ne s'ouvre pas. Autorise la caméra, ou tape la date à la main.");
    }
  }

  function save() {
    const q = Number(qty.replace(",", "."));
    if (!productId || !(q > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    let next = receiveLot(shop, productId, q, date, lot.trim() || undefined);
    if (code) next = { ...next, products: next.products.map((p) => (p.id === productId && !p.barcode ? { ...p, barcode: code } : p)) };
    commit(next);
    const p = next.products.find((x) => x.id === productId);
    setNote(`Reçu : ${q} ${p?.unit ?? ""} ${p?.name ?? ""}, périme le ${new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR")}. Stock : ${p?.stock ?? ""}.`);
    setQty("1");
    setDate("");
    setLot("");
    setCode("");
  }

  return (
    <div className="tool-panel" style={{ display: "grid", gap: 8 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <b>Réception d'une livraison</b>
        <Button variant="ghost" className="h-9 rounded-full px-3" onClick={onClose}><Icon name="fermer" size="sm" /> Fermer</Button>
      </div>
      <p className="note">Scanne le code carré de la boîte : l'article, la date et le lot se remplissent tout seuls. Jokko vendra d'abord ce qui périme le plus tôt.</p>
      <Button variant={camera ? "default" : "outline"} className="h-10 rounded-full" onClick={() => void toggleCamera()}>
        <Icon name="scanner" size="sm" /> {camera ? "Arrêter la caméra" : "Scanner une boîte"}
      </Button>
      <video ref={videoRef} style={{ width: "100%", maxHeight: 220, display: camera ? "block" : "none", borderRadius: 12 }} />
      {note && <p className="banner" role="status">{note}</p>}
      <select className="h-11 rounded-md border px-3" value={productId} onChange={(e) => setProductId(e.target.value)} aria-label="Article">
        <option value="">Choisis l'article…</option>
        {shop.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <div className="grid-2">
        <Input className="h-11" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Quantité reçue" aria-label="Quantité reçue" />
        <Input className="h-11" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date de péremption" />
      </div>
      <Input className="h-11" value={lot} onChange={(e) => setLot(e.target.value)} placeholder="Numéro de lot (facultatif)" aria-label="Numéro de lot" />
      <Button className="h-11 rounded-full" disabled={!productId || !date} onClick={save}><Icon name="sauvegarde" size="sm" /> Ajouter au stock</Button>
    </div>
  );
}
