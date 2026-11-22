import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Shop, money } from "@/model";
import { ladderContext } from "@/data/priceGuard";
import { quickQuote, quoteMessage } from "@/data/quickQuote";

/**
 * Prix rapide pour un client (22/11/2026) : tape le modèle ou la marque → chaque pièce avec le prix à annoncer,
 * le prix négocié, le minimum, et si elle est là tout de suite. « Envoyer au client » prépare le message WhatsApp ;
 * « Faire le dépôt » ouvre le dépôt avec l'appareil et la pièce déjà remplis.
 */
export function QuickQuote({ shop, onDeposit }: { shop: Shop; onDeposit?: (device: string, productId?: string) => void }) {
  const [q, setQ] = useState("");
  const ctx = useMemo(() => ladderContext(shop), [shop]);
  const res = useMemo(() => quickQuote(shop, q, new Date(), ctx), [shop, q, ctx]);
  const [phone, setPhone] = useState("");
  const msg = res.lines.length ? quoteMessage(shop.name, q.trim(), res.lines.slice(0, 5)) : "";
  const digits = phone.replace(/\D/g, "");
  const wa = msg ? `https://wa.me/${digits.length === 9 ? `221${digits}` : digits}?text=${encodeURIComponent(msg)}` : "";
  return (
    <div className="quick-quote">
      <label className="quick-quote-head">
        <b>Prix pour un client</b>
        <Input className="h-12" placeholder="Tape le modèle : BF6, iPhone 11, A12, Redmi…" aria-label="Modèle du téléphone" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {q.trim().length >= 2 && !res.lines.length && !res.services.length && (
        <p className="note">Aucune pièce connue pour « {q} ». Cherche dans « Un client demande une pièce ? » (réseau Jokko), ou crée la pièce.</p>
      )}
      {res.lines.length > 0 && (
        <ul className="quote-list">
          {res.lines.map((l) => (
            <li key={`${l.kind}-${l.name}`} className={l.stock > 0 ? "in-stock" : ""}>
              <div className="quote-main">
                <span>
                  <b>{l.name}</b>
                  <small>{l.stock > 0 ? `✓ en stock (${l.stock}) · réparé aujourd'hui` : l.source === "fournisseur" ? "à commander chez le fournisseur" : "pas en stock · à commander"}{l.via ? ` · va aussi sur ${l.via}` : ""}</small>
                </span>
                <b className="num quote-price">{money(l.ladder.normal)}</b>
              </div>
              <small className="ladder-line">Négocié {money(l.ladder.nego)} · <b>jamais sous {money(l.ladder.floor)}</b> · pièce {money(l.ladder.cost)}</small>
              {onDeposit && <button type="button" className="link" onClick={() => onDeposit(q.trim(), l.productId)}>Faire le dépôt avec cette pièce →</button>}
            </li>
          ))}
        </ul>
      )}
      {res.services.length > 0 && (
        <dl className="profit-calc ws-table">
          {res.services.map((s) => <div key={s.id}><dt>{s.name} <small>service, sans pièce</small></dt><dd className="num">{money(s.price)}</dd></div>)}
        </dl>
      )}
      {msg && (
        <div className="quote-send">
          <Input className="h-11" inputMode="tel" placeholder="Numéro du client (facultatif)" aria-label="Numéro du client" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Button asChild className="h-11 rounded-full px-5"><a href={wa} target="_blank" rel="noreferrer">Envoyer les prix sur WhatsApp</a></Button>
        </div>
      )}
    </div>
  );
}
