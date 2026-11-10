import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, PAYMENT_ICON } from "./Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type Payment, PAYMENT_LABELS, type Product, type Role, type Shop, money, uid } from "@/model";
import { codesInUse, findByCode, normalizeCode } from "@/data/barcode";
import { addToCart, cartTotal, type CartLine, checkout, setQty, shortages, unitName, unitPrice } from "@/data/checkout";
import { beep, type CameraScan, startCamera } from "@/data/scanner";
import { waveReady } from "@/data/wave";
import { WavePay } from "@/components/jokko/WavePay";
import { metierOf } from "@/data/metiers";
import { receiptFor } from "@/data/tickets";
import { Receipt } from "./Receipt";

const amount = (n: number) => money(n).replace(/ /g, " ");
const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const toNum = (s: string) => Number(s.replace(/[\s  ]/g, "").replace(",", "."));

type Notice = { tone: "ok" | "bad" | "info"; text: string };

/**
 * Caisse par scan : caméra du téléphone ou douchette Bluetooth (elle tape le code comme un clavier, puis Entrée).
 * Chaque scan ajoute l'article au panier ; « Encaisser » enregistre les ventes, baisse le stock et monte la caisse.
 */
export function ScanCheckout({ shop, commit, role }: { shop: Shop; commit: (s: Shop) => void; role: Role }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [receipt, setReceipt] = useState<{ title: string; text: string } | null>(null);
  const [code, setCode] = useState("");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [unknown, setUnknown] = useState<string | null>(null);
  const [payment, setPayment] = useState<Payment>("especes");
  // Wave branché (Réglages) : le paiement est confirmé par Wave avant d'enregistrer la vente.
  const [waveOn, setWaveOn] = useState(false);
  const [waving, setWaving] = useState<{ lines: CartLine[]; total: number; reference: string } | null>(null);
  useEffect(() => {
    void waveReady(shop.id).then(setWaveOn, () => setWaveOn(false));
  }, [shop.id]);
  const [clientId, setClientId] = useState("");
  const [received, setReceived] = useState("");
  const [camera, setCamera] = useState<"off" | "starting" | "on">("off");
  const videoRef = useRef<HTMLVideoElement>(null);
  const scanRef = useRef<CameraScan | null>(null);
  const shopRef = useRef(shop);
  shopRef.current = shop;
  const inputRef = useRef<HTMLInputElement>(null);
  const patron = role === "patron";

  const total = cartTotal(shop, lines);
  const short = useMemo(() => shortages(shop, lines), [shop, lines]);
  const change = payment === "especes" && received ? toNum(received) - total : null;

  const handleCode = useCallback((raw: string) => {
    const value = normalizeCode(raw);
    if (!value) return;
    const match = findByCode(shopRef.current, value);
    if (!match) {
      beep(false);
      setUnknown(value);
      setNotice({ tone: "bad", text: `Code inconnu : ${value}` });
      return;
    }
    beep(true);
    setUnknown(null);
    setLines((l) => addToCart(l, match.product.id, match.retail));
    setNotice({ tone: "ok", text: `+1 ${unitName(match.product, match.retail)} ${match.product.name} · ${amount(unitPrice(match.product, match.retail))}` });
  }, []);

  // Douchette Bluetooth hors du champ : les touches arrivent très vite, puis « Entrée ».
  useEffect(() => {
    let buffer = "";
    let lastAt = 0;
    let startAt = 0;
    let snap = "";
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLInputElement | null;
      if (target?.id === "scan-code") return; // le champ de la douchette gère lui-même la lecture
      const typing = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      // Heure où la touche a été frappée (pas celle où le téléphone a fini de la traiter) : juste même si l'écran est chargé.
      const now = e.timeStamp;
      if (now - lastAt > 80) buffer = "";
      // Début d'une lecture : on note l'heure et ce qu'il y avait dans le champ (pour le remettre).
      if (!buffer && e.key !== "Enter") { startAt = now; snap = typing ? target.value : ""; }
      lastAt = now;
      if (e.key === "Enter") {
        // Une douchette tape très vite (moins de 40 ms par caractère) : à la main, c'est beaucoup plus lent.
        const fast = buffer.length >= 4 && (now - startAt) / buffer.length < 40;
        if (fast && (!typing || buffer.length >= 6)) {
          e.preventDefault();
          if (typing && target.id === "scan-received") setReceived(snap);
          if (typing && target.id === "scan-search") setSearch(snap);
          handleCode(buffer);
        }
        buffer = "";
      } else if (e.key.length === 1) buffer += e.key;
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [handleCode]);

  useEffect(() => () => scanRef.current?.stop(), []);

  async function toggleCamera() {
    if (scanRef.current) {
      scanRef.current.stop();
      scanRef.current = null;
      setCamera("off");
      return;
    }
    if (!videoRef.current) return;
    setCamera("starting");
    try {
      scanRef.current = await startCamera(videoRef.current, handleCode);
      setCamera("on");
    } catch {
      setCamera("off");
      setNotice({ tone: "bad", text: "La caméra ne s'ouvre pas. Autorise la caméra pour Jokko, ou utilise la douchette." });
    }
  }

  function pay(paidLines = lines, paidWith: Payment = payment) {
    const applied = checkout(shop, paidLines, paidWith, paidWith === "credit" ? clientId || null : null);
    if (!applied) {
      setNotice({ tone: "bad", text: payment === "credit" ? "Choisis le client qui prend à crédit." : "Le panier est vide." });
      return;
    }
    commit(applied.shop);
    const cash = paidWith === "especes" && received && toNum(received) >= (applied.amount ?? 0) ? { recu: toNum(received), rendu: toNum(received) - (applied.amount ?? 0) } : undefined;
    if (applied.shop.sales[0]) setReceipt(receiptFor(applied.shop, applied.shop.sales[0], cash));
    setLines([]);
    setReceived("");
    setPayment("especes");
    setClientId("");
    setNotice({ tone: "ok", text: `Encaissé · ${applied.summary.replace(/^Caisse · /, "")}` });
    beep(true);
  }

  const found = search.trim()
    ? shop.products.filter((p) => plain(p.name).includes(plain(search.trim()))).slice(0, 6)
    : [];

  return (
    <section className="scan">
      {receipt && <Receipt title={receipt.title} text={receipt.text} onClose={() => setReceipt(null)} />}
      <article className="sheet scan-main">
        <div className="sheet-head">
          <h2>Scanner</h2>
          <Button variant={camera === "on" ? "default" : "outline"} className="h-10 rounded-full px-4" onClick={() => void toggleCamera()} disabled={camera === "starting"}>
            {camera === "on" ? "Arrêter la caméra" : camera === "starting" ? "Ouverture…" : "Scanner avec la caméra"}
          </Button>
        </div>
        <div className={`scan-video${camera === "off" ? " is-off" : ""}`}>
          <video ref={videoRef} playsInline muted aria-label="Caméra" />
          <span className="scan-aim" aria-hidden="true" />
        </div>

        <form
          className="scan-code"
          onSubmit={(e) => {
            e.preventDefault();
            handleCode(code);
            setCode("");
          }}
        >
          <Label htmlFor="scan-code">Douchette ou code tapé à la main</Label>
          <div className="row">
            <Input id="scan-code" ref={inputRef} className="num h-12 text-lg" inputMode="numeric" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Scanne ici" />
            <Button type="submit" variant="outline" className="h-12 rounded-full px-5">Ajouter</Button>
          </div>
        </form>

        {notice && <p className={`scan-notice is-${notice.tone}`} role="status">{notice.text}</p>}
        {unknown && <UnknownCode code={unknown} shop={shop} patron={patron} commit={commit} onDone={(p, retail) => {
          setUnknown(null);
          if (p) {
            setLines((l) => addToCart(l, p.id, retail));
            setNotice({ tone: "ok", text: `Code associé à ${p.name}. Ajouté au panier.` });
          }
        }} />}

        <div className="field">
          <Label htmlFor="scan-search">Article sans code ? Cherche-le</Label>
          <Input id="scan-search" className="h-11" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={metierOf(shop.activity).ex.search} />
        </div>
        {found.length > 0 && (
          <div className="scan-found">
            {found.map((p) => (
              <span key={p.id} className="row">
                <Button variant="outline" className="h-10 rounded-full px-4" onClick={() => { setLines((l) => addToCart(l, p.id, false)); setSearch(""); }}>
                  {p.name} · {p.unit} · {amount(p.price)}
                </Button>
                {p.retail && (
                  <Button variant="outline" className="h-10 rounded-full px-4" onClick={() => { setLines((l) => addToCart(l, p.id, true)); setSearch(""); }}>
                    {p.retail.unit} · {amount(p.retail.price)}
                  </Button>
                )}
              </span>
            ))}
          </div>
        )}
      </article>

      <article className="sheet scan-cart">
        <div className="sheet-head">
          <h2>Panier</h2>
          {lines.length > 0 && <Button variant="ghost" className="h-9 rounded-full px-3" onClick={() => setLines([])}>Vider</Button>}
        </div>
        {lines.length === 0 ? (
          <p className="note">Scanne un article pour commencer.</p>
        ) : (
          <ul className="cart">
            {lines.map((line, i) => {
              const p = shop.products.find((x) => x.id === line.productId);
              if (!p) return null;
              const price = unitPrice(p, line.retail);
              return (
                <li key={`${line.productId}-${line.retail}`}>
                  <span className="cart-name">
                    <b>{p.name}</b>
                    <small className="num">{amount(price)} / {unitName(p, line.retail)}</small>
                  </span>
                  <span className="cart-qty">
                    <button type="button" aria-label="Moins" onClick={() => setLines((l) => setQty(l, i, l[i].qty - 1))}><Icon name="moins" size="sm" /></button>
                    <input className="num" inputMode="decimal" aria-label={`Quantité ${p.name}`} value={String(line.qty).replace(".", ",")} onChange={(e) => {
                      const q = toNum(e.target.value);
                      if (Number.isFinite(q)) setLines((l) => setQty(l, i, q));
                    }} />
                    <button type="button" aria-label="Plus" onClick={() => setLines((l) => setQty(l, i, l[i].qty + 1))}><Icon name="ajouter" size="sm" /></button>
                  </span>
                  <b className="cart-line num">{amount(Math.round(line.qty * price))}</b>
                </li>
              );
            })}
          </ul>
        )}
        {short.length > 0 && <p className="note" data-tone="error">Stock insuffisant d'après Jokko : {short.join(", ")}. Tu peux vendre quand même ; pense à vérifier le stock.</p>}

        <div className="cart-total">
          <span>Total</span>
          <b className="num">{amount(total)}</b>
        </div>

        <div className="pay-modes" role="radiogroup" aria-label="Paiement">
          {(Object.keys(PAYMENT_LABELS) as Payment[]).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={payment === m} className={payment === m ? "on" : ""} onClick={() => setPayment(m)}><Icon name={PAYMENT_ICON[m]} size="sm" />{PAYMENT_LABELS[m]}</button>
          ))}
        </div>
        {payment === "especes" && (
          <div className="field">
            <Label htmlFor="scan-received">Argent reçu (pour la monnaie)</Label>
            <Input id="scan-received" className="num h-11" inputMode="numeric" value={received} onChange={(e) => setReceived(e.target.value)} placeholder="ex. 10000" />
            <div className="cash-quick">
              <button type="button" onClick={() => setReceived(String(total))}>Compte juste</button>
              {[1000, 2000, 5000, 10000, 20000, 50000].filter((b) => b > total).slice(0, 3).map((b) => <button key={b} type="button" onClick={() => setReceived(String(b))}>{amount(b)}</button>)}
            </div>
            {change !== null && Number.isFinite(change) && (
              <p className={`scan-change${change < 0 ? " is-bad" : ""}`}>{change < 0 ? `Il manque ${amount(-change)}` : `Rends ${amount(change)}`}</p>
            )}
          </div>
        )}
        {payment === "credit" && (
          <div className="field">
            <Label htmlFor="scan-client">Client qui prend à crédit</Label>
            <select id="scan-client" className="h-11 rounded-md border px-3" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Choisir…</option>
              {shop.clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.debt ? ` (doit ${amount(c.debt)})` : ""}</option>)}
            </select>
          </div>
        )}
        {payment === "wave" && !waveOn && shop.waveLink && <WaveLinkQr link={shop.waveLink} total={total} />}
        {(payment === "om" || (payment === "wave" && !waveOn)) && <p className="note">Vérifie le message de {PAYMENT_LABELS[payment]} sur le téléphone du client avant d'encaisser. Cet argent n'entre pas dans le tiroir ; le patron le cochera « Vérifié ».</p>}

        {waving && (
          <WavePay
            shopId={shop.id}
            total={waving.total}
            reference={waving.reference}
            onPaid={() => {
              pay(waving.lines, "wave");
              window.setTimeout(() => setWaving(null), 2500);
            }}
            onCancel={() => setWaving(null)}
          />
        )}
        {!waving && payment === "wave" && waveOn ? (
          <Button className="h-14 w-full rounded-full text-lg font-semibold" disabled={!lines.length} onClick={() => setWaving({ lines, total, reference: uid("w") })}>
            Encaisser par Wave {total ? amount(total) : ""}
          </Button>
        ) : !waving && (
          <Button className="h-14 w-full rounded-full text-lg font-semibold" disabled={!lines.length || (payment === "credit" && !clientId)} onClick={() => pay()}>
            Encaisser {total ? amount(total) : ""}
          </Button>
        )}
      </article>
    </section>
  );
}

/** Code lu mais inconnu : le patron l'associe à un article (ou crée l'article) ; le vendeur prévient le patron. */
function UnknownCode({ code, shop, patron, commit, onDone }: { code: string; shop: Shop; patron: boolean; commit: (s: Shop) => void; onDone: (p: Product | null, retail: boolean) => void }) {
  const [target, setTarget] = useState("");
  const [retail, setRetail] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState("pièce");

  if (!patron) {
    return (
      <div className="scan-unknown">
        <p>Ce code n'est relié à aucun article. Demande au patron de l'ajouter dans Jokko, ou cherche l'article par son nom ci-dessous.</p>
        <Button variant="ghost" className="h-9 rounded-full px-3" onClick={() => onDone(null, false)}>Fermer</Button>
      </div>
    );
  }
  if (codesInUse(shop).has(code)) return null;
  const product = shop.products.find((p) => p.id === target);

  return (
    <div className="scan-unknown">
      <p><b>Nouveau code {code}.</b> À quel article le relier ? C'est à faire une seule fois.</p>
      <div className="field">
        <Label htmlFor="unk-target">Article existant</Label>
        <select id="unk-target" className="h-11 rounded-md border px-3" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Choisir…</option>
          {shop.products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.barcode ? " (a déjà un code)" : ""}</option>)}
        </select>
      </div>
      {product?.retail && (
        <div className="pay-modes">
          <button type="button" className={!retail ? "on" : ""} onClick={() => setRetail(false)}>{product.unit} (gros)</button>
          <button type="button" className={retail ? "on" : ""} onClick={() => setRetail(true)}>{product.retail.unit} (détail)</button>
        </div>
      )}
      {product && (
        <Button className="h-11 rounded-full px-5" onClick={() => {
          const next: Product = retail && product.retail ? { ...product, retail: { ...product.retail, barcode: code } } : { ...product, barcode: code };
          commit({ ...shop, products: shop.products.map((p) => (p.id === product.id ? next : p)) });
          onDone(next, retail);
        }}>Relier à {product.name}</Button>
      )}
      <p className="note">Ou crée un nouvel article avec ce code :</p>
      <div className="grid-3">
        <Input className="h-11" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom (ex. Lait Vitalait 400 g)" />
        <Input className="h-11" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Unité" />
        <Input className="num h-11" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Prix de vente" />
      </div>
      <div className="row">
        <Button variant="outline" className="h-11 rounded-full px-5" disabled={!name.trim() || !(toNum(price) > 0)} onClick={() => {
          const created: Product = { id: uid("p"), name: name.trim(), unit: unit.trim() || "pièce", stock: 0, min: 1, price: Math.round(toNum(price)), barcode: code };
          commit({ ...shop, products: [...shop.products, created] });
          onDone(created, false);
        }}>Créer l'article</Button>
        <Button variant="ghost" className="h-11 rounded-full px-4" onClick={() => onDone(null, false)}>Plus tard</Button>
      </div>
      <p className="note">Pense à mettre son stock et son prix d'achat dans Stock.</p>
    </div>
  );
}

/** Paiement Wave sans API : le QR code du lien Wave Business de la boutique ; le client tape le montant. */
function WaveLinkQr({ link, total }: { link: string; total: number }) {
  const [qr, setQr] = useState("");
  useEffect(() => {
    void import("qrcode").then(({ default: QRCode }) => QRCode.toDataURL(link, { margin: 1, width: 220 })).then(setQr, () => setQr(""));
  }, [link]);
  return (
    <div className="wave-pay">
      <p className="wave-step">Le client scanne avec <b>Wave</b> et paie <b>{amount(total)}</b>.</p>
      {qr && <img className="wave-qr" src={qr} alt="QR code Wave de la boutique" width={220} height={220} />}
    </div>
  );
}
