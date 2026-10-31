import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Shop } from "@/model";
import { removeWaveKeys, saveWaveKeys, waveReady, waveWebhookUrl } from "@/data/wave";

/**
 * Brancher Wave Business (patron). Les clés sont envoyées une seule fois au serveur et ne reviennent jamais
 * dans l'appli : même un vendeur ou quelqu'un qui prend le téléphone ne peut pas les lire.
 */
export function WaveSettings({ shop, onLink }: { shop: Shop; onLink: (link: string | undefined) => void }) {
  const [link, setLink] = useState(shop.waveLink ?? "");
  const [linkNote, setLinkNote] = useState("");
  const [ready, setReady] = useState<boolean | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const hook = waveWebhookUrl(shop.id);

  useEffect(() => {
    void waveReady(shop.id).then(setReady, () => setReady(false));
  }, [shop.id]);

  return (
    <div className="install-settings wave-settings">
      <h3>Wave Business · {shop.name}</h3>
      <p className="note"><b>Sans API (le plus simple) :</b> colle le lien de paiement de ta boutique Wave Business (dans l'appli Wave Business : « Partager mon lien » ou « Lien de paiement »). Au moment d'encaisser par Wave, Jokko montre ce lien en QR code au client. Tu cocheras ensuite chaque paiement « Vérifié » dans À distance.</p>
      <div className="row">
        <Input className="h-11" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://pay.wave.com/…" aria-label="Lien Wave Business de la boutique" />
        <Button variant="outline" className="h-11 rounded-full px-4" onClick={() => {
          const v = link.trim();
          if (v && !/^https:\/\//.test(v)) return setLinkNote("Le lien doit commencer par https://");
          onLink(v || undefined);
          setLinkNote(v ? "✓ Lien enregistré." : "Lien retiré.");
        }}>Enregistrer le lien</Button>
      </div>
      {linkNote && <p className="note">{linkNote}</p>}
      <p className="note"><b>Avec l'API Wave (automatique) :</b> si Wave t'a donné l'accès « Développeurs », branche-le ci-dessous : chaque paiement sera confirmé tout seul.</p>
      {ready ? (
        <>
          <p className="note">✓ Wave est branché. Au moment d'encaisser, choisis « Wave » : le client scanne le QR code, et la vente s'enregistre quand Wave confirme.</p>
          <div className="row">
            <Button variant="outline" className="h-10 rounded-full px-4" onClick={() => setOpen(!open)}>Changer les clés</Button>
            <Button variant="ghost" className="h-10 rounded-full px-4" onClick={async () => {
              if (!window.confirm("Débrancher Wave pour cette boutique ?")) return;
              if (await removeWaveKeys(shop.id)) setReady(false);
            }}>Débrancher</Button>
          </div>
        </>
      ) : (
        <Button variant="outline" className="h-10 rounded-full px-4" onClick={() => setOpen(!open)}>{open ? "Fermer" : "J'ai l'accès API Wave : le brancher"}</Button>
      )}
      {open && (
        <>
          <ol className="install-steps">
            <li>Sur un ordinateur, ouvre <b>business.wave.com</b> et connecte-toi avec le compte <b>administrateur</b> de ta boutique.</li>
            <li>Va dans <b>Développeurs</b> (« Developers »), puis <b>Clés API</b> (« API keys »). Crée une clé avec l'accès <b>Checkout API</b>, puis copie-la (elle commence par <code>wave_sn_prod_</code>).</li>
            <li>Toujours dans Développeurs, ouvre <b>Webhooks</b>. Ajoute cette adresse : <code className="wave-hook">{hook}</code>
              <Button variant="ghost" className="h-8 rounded-full px-3" onClick={() => void navigator.clipboard?.writeText(hook)}>Copier</Button>
              <br />Choisis la sécurité <b>« Signing secret »</b> et coche l'événement <b>checkout.session.completed</b> (et checkout.session.payment_failed). Copie le <b>secret</b> affiché.</li>
            <li>Colle la clé et le secret ci-dessous, puis touche <b>Enregistrer</b>.</li>
          </ol>
          <Input className="h-11" type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Clé API Wave (wave_sn_prod_…)" aria-label="Clé API Wave" />
          <Input className="h-11" type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Secret de signature du webhook" aria-label="Secret du webhook Wave" />
          <Button className="h-11 rounded-full px-5" disabled={busy || !apiKey.trim() || !secret.trim()} onClick={async () => {
            setBusy(true);
            const error = await saveWaveKeys(shop.id, apiKey, secret);
            setBusy(false);
            if (error) {
              setNote(error);
              return;
            }
            setApiKey("");
            setSecret("");
            setOpen(false);
            setReady(true);
            setNote("✓ Wave est branché. Fais un essai avec un petit montant (100 F).");
          }}>{busy ? "Enregistrement…" : "Enregistrer"}</Button>
          <p className="note">Les clés partent une seule fois vers le serveur de Jokko et ne sont plus jamais affichées. Ne les envoie à personne, ni par WhatsApp.</p>
        </>
      )}
      {note && <p className="note" role="status">{note}</p>}
    </div>
  );
}
