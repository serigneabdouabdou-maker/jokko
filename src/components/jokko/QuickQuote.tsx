import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Shop, money } from "@/model";
import { ladderContext } from "@/data/priceGuard";
import { quickQuote, quoteMessage } from "@/data/quickQuote";
import { unlinkModel } from "@/data/supplierCompat";

/**
 * Prix pour un client (22/11/2026) : tape le modèle → chaque pièce avec le prix à annoncer, le négocié, le minimum,
 * disponible ou à commander ; les écrans qui vont dessus d'après le fournisseur. Plusieurs choses pour le même client
 * (écran + connecteur + batterie + décodage) : coche-les, le total se calcule, et « Faire le dépôt » remplit tout.
 */
export function QuickQuote({ shop, onDeposit, onChange }: { shop: Shop; onDeposit?: (device: string, productIds: string[], serviceIds: string[]) => void; onChange?: (next: Shop) => void }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [svc, setSvc] = useState<string[]>([]);
  const [phone, setPhone] = useState("");
  const ctx = useMemo(() => ladderContext(shop), [shop]);
  const res = useMemo(() => quickQuote(shop, q, new Date(), ctx), [shop, q, ctx]);
  const keyOf = (l: { kind: string; name: string }) => `${l.kind}:${l.name}`;
  const chosen = res.lines.filter((l) => picked.includes(keyOf(l)));
  const services = (shop.services ?? []).filter((s) => svc.includes(s.id));
  const total = chosen.reduce((a, l) => a + l.ladder.normal, 0) + services.reduce((a, s) => a + s.price, 0);
  const nego = chosen.reduce((a, l) => a + l.ladder.nego, 0) + services.reduce((a, s) => a + s.price, 0);
  const floor = chosen.reduce((a, l) => a + l.ladder.floor, 0) + services.reduce((a, s) => a + s.price, 0);
  const forMsg = chosen.length ? chosen : res.lines.slice(0, 5);
  const msg = forMsg.length || services.length
    ? quoteMessage(shop.name, q.trim(), forMsg) + (services.length ? `\n${services.map((s) => `- ${s.name} : ${s.price.toLocaleString("fr-FR").replace(/[  ]/g, " ")} F`).join("\n")}` : "") + (chosen.length + services.length > 1 ? `\nTotal : ${total.toLocaleString("fr-FR").replace(/[  ]/g, " ")} F` : "")
    : "";
  const digits = phone.replace(/\D/g, "");
  const wa = msg ? `https://wa.me/${digits.length === 9 ? `221${digits}` : digits}?text=${encodeURIComponent(msg)}` : "";
  const allServices = shop.services ?? [];
  const matching = new Set(res.services.map((s) => s.id));
  const toggle = (k: string) => setPicked(picked.includes(k) ? picked.filter((x) => x !== k) : [...picked, k]);
  return (
    <div className="quick-quote">
      <label className="quick-quote-head">
        <b>Prix pour un client</b>
        <Input className="h-12" placeholder="Tape le modèle : BF6, iPhone 11, A12, Redmi…" aria-label="Modèle du téléphone" value={q} onChange={(e) => { setQ(e.target.value); setPicked([]); }} />
      </label>
      {q.trim().length >= 2 && !res.lines.length && !res.services.length && (
        <p className="note">Aucune pièce connue pour « {q} ». Demande la liste à ton fournisseur, ou cherche dans « Un client demande une pièce ? ».</p>
      )}
      {res.compat.length > 0 && (
        <div className="note quote-compat">
          <span>D'après les listes de ton fournisseur, l'écran de {q.trim().toUpperCase()} va aussi sur :</span>
          <div className="compat-chips">
            {res.compat.slice(0, 12).map((c) => (
              <span key={c.key} className="compat-chip">
                {c.model.toUpperCase()}{c.n > 1 ? ` (${c.n} fois)` : ""}
                {onChange && <button type="button" aria-label={`${c.model} ne va pas sur ${q.trim()}`} onClick={() => onChange(unlinkModel(shop, q.trim(), c.model))}>✕</button>}
              </span>
            ))}
          </div>
          {onChange && <small>Un modèle ne va pas ? Touche ✕ : il ne sera plus jamais proposé avec {q.trim().toUpperCase()}.</small>}
        </div>
      )}
      {res.lines.length > 0 && (
        <>
          <small className="note">Coche tout ce que le client veut réparer : le total se calcule.</small>
          <ul className="quote-list">
            {res.lines.map((l) => {
              const k = keyOf(l);
              const on = picked.includes(k);
              return (
                <li key={k} className={`${l.stock > 0 ? "in-stock" : ""}${on ? " is-picked" : ""}`} onClick={() => toggle(k)}>
                  <div className="quote-main">
                    <input type="checkbox" checked={on} onChange={() => toggle(k)} onClick={(e) => e.stopPropagation()} aria-label={`Choisir ${l.name}`} />
                    <span>
                      <b>{l.name}</b>
                      <small>
                        {l.stock > 0 ? `✓ en stock (${l.stock})` : l.source === "fournisseur" ? "à commander chez le fournisseur" : "pas en stock · à commander"}
                        {l.via ? ` · va aussi sur ${l.via}` : ""}
                        {l.supplierSays ? ` · va sur ${q.trim().toUpperCase()} (fournisseur${l.supplierSays.n > 1 ? `, ${l.supplierSays.n} fois` : ""})` : ""}
                      </small>
                    </span>
                    <b className="num quote-price">{money(l.ladder.normal)}</b>
                  </div>
                  {onChange && (l.via || l.supplierSays) && (
                    <button type="button" className="quote-unlink" onClick={(e) => { e.stopPropagation(); onChange(unlinkModel(shop, q.trim(), l.supplierSays?.model ?? l.via!)); }}>
                      ✕ Ne va pas sur {q.trim().toUpperCase()}
                    </button>
                  )}
                  <small className="ladder-line">Négocié {money(l.ladder.nego)} · <b>jamais sous {money(l.ladder.floor)}</b> · pièce {money(l.ladder.cost)}</small>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {q.trim().length >= 2 && allServices.length > 0 && (
        <div className="job-services">
          <small className="note">Services en plus (décodage, FRP, configuration…) :</small>
          <div className="wizard-chips">
            {[...allServices].sort((a, b) => Number(matching.has(b.id)) - Number(matching.has(a.id))).map((s) => {
              const on = svc.includes(s.id);
              return <button key={s.id} type="button" className={on ? "on" : ""} aria-pressed={on} onClick={() => setSvc(on ? svc.filter((x) => x !== s.id) : [...svc, s.id])}>{s.name} · {money(s.price)}</button>;
            })}
          </div>
        </div>
      )}
      {(chosen.length > 0 || services.length > 0) && (
        <div className="ws-verdict" data-tone="good">
          <b>Total pour le client : {money(total)}</b>
          <p>{[...chosen.map((l) => `${l.name} ${money(l.ladder.normal)}`), ...services.map((s) => `${s.name} ${money(s.price)}`)].join(" + ")}</p>
          <p>Négocié : {money(nego)} · <b>jamais sous {money(floor)}</b>{services.length ? " (services au prix du catalogue)" : ""}</p>
          {onDeposit && (
            <Button className="h-11 rounded-full px-5" disabled={chosen.some((l) => !l.productId)} onClick={() => onDeposit(q.trim(), chosen.map((l) => l.productId!).filter(Boolean), services.map((s) => s.id))}>
              Faire le dépôt ({chosen.length + services.length})
            </Button>
          )}
          {chosen.some((l) => !l.productId) && <small className="note">Une pièce n'est pas encore dans ton stock : crée-la dans Pièces avant le dépôt, ou enlève-la.</small>}
        </div>
      )}
      {msg && (
        <div className="quote-send">
          <Input className="h-11" inputMode="tel" placeholder="Numéro du client (facultatif)" aria-label="Numéro du client" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Button asChild variant="outline" className="h-11 rounded-full px-5"><a href={wa} target="_blank" rel="noreferrer">Envoyer les prix sur WhatsApp</a></Button>
        </div>
      )}
    </div>
  );
}
