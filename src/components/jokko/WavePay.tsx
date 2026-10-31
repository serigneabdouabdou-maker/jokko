import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { money } from "@/model";
import { whatsappLink } from "@/data/debts";
import { checkWave, startWave, type WaveSession, type WaveStatus, watchWave } from "@/data/wave";

const amount = (n: number) => money(n).replace(/ /g, " ");

/**
 * Encaisser par Wave : QR code à scanner par le client (ou lien envoyé sur WhatsApp).
 * La vente n'est enregistrée que lorsque Wave a confirmé le paiement au serveur.
 */
export function WavePay({ shopId, total, reference, onPaid, onCancel }: { shopId: string; total: number; reference: string; onPaid: () => void; onCancel: () => void }) {
  const [session, setSession] = useState<WaveSession | null>(null);
  const [status, setStatus] = useState<WaveStatus | "creation" | "erreur">("creation");
  const [message, setMessage] = useState("");
  const [qr, setQr] = useState("");
  const [phone, setPhone] = useState("");
  const done = useRef(false);

  useEffect(() => {
    let stop: (() => void) | null = null;
    let poll: number | null = null;
    let alive = true;
    void startWave(shopId, total, reference).then(async (r) => {
      if (!alive) return;
      if (!r.ok) {
        setStatus("erreur");
        setMessage(r.message);
        return;
      }
      setSession(r.session);
      setStatus("open");
      const QRCode = (await import("qrcode")).default;
      setQr(await QRCode.toDataURL(r.session.url, { margin: 1, width: 260 }));
      const update = (s: WaveStatus) => {
        if (!alive) return;
        setStatus(s);
        if (s === "succeeded" && !done.current) {
          done.current = true;
          onPaid();
        }
      };
      stop = watchWave(r.session.id, update);
      // Au cas où le direct est coupé : on redemande l'état toutes les 5 secondes.
      poll = window.setInterval(() => void checkWave(r.session.id).then((s) => s && s !== "open" && update(s)), 5000);
    });
    return () => {
      alive = false;
      stop?.();
      if (poll) window.clearInterval(poll);
    };
  }, [shopId, total, reference]); // eslint-disable-line react-hooks/exhaustive-deps

  const wa = session && phone.replace(/\D/g, "").length >= 9 ? whatsappLink(phone, `Bonjour, voici le lien pour payer ${amount(total)} par Wave : ${session.url}`) : null;

  return (
    <div className="wave-pay" role="dialog" aria-label="Paiement Wave">
      <div className="sheet-head">
        <h3>Paiement Wave · {amount(total)}</h3>
        {status !== "succeeded" && <Button variant="ghost" className="h-9 rounded-full px-3" onClick={onCancel}>Annuler</Button>}
      </div>
      {status === "creation" && <p className="note">Création du lien de paiement…</p>}
      {status === "erreur" && <p className="note" data-tone="error">{message}</p>}
      {session && status === "open" && (
        <>
          <p className="wave-step">Le client scanne ce code avec son appli <b>Wave</b>, puis valide.</p>
          {qr ? <img className="wave-qr" src={qr} alt="QR code de paiement Wave" width={260} height={260} /> : <p className="note">Préparation du QR code…</p>}
          <p className="wave-wait"><span className="live-dot on">En attente du paiement</span></p>
          <div className="row">
            <Input className="h-11" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Numéro du client (pour lui envoyer le lien)" />
            <Button variant="outline" className="h-11 rounded-full px-4" disabled={!wa} onClick={() => wa && window.open(wa, "_blank", "noopener")}>Envoyer sur WhatsApp</Button>
          </div>
          <p className="note">La vente sera enregistrée toute seule quand Wave aura confirmé. Ne te fie pas à une capture d'écran : attends ce message.</p>
        </>
      )}
      {status === "succeeded" && <p className="wave-ok">✓ Wave a confirmé le paiement de {amount(total)}. Vente enregistrée.</p>}
      {(status === "expired" || status === "cancelled" || status === "failed") && (
        <p className="note" data-tone="error">
          {status === "expired" ? "Le lien a expiré (30 minutes)." : status === "cancelled" ? "Le client a annulé." : "Le paiement n'a pas abouti (montant différent ou refus)."} Rien n'est enregistré : recommence, ou choisis un autre paiement.
        </p>
      )}
    </div>
  );
}
