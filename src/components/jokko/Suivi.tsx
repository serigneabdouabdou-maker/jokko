import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { supabase } from "@/data/supabase";
import { STEP_LABEL, STEPS } from "@/data/couture";
import { galleryUrl } from "@/data/studio";
import type { CoutureStatus } from "@/model";

type Suivi = {
  boutique: string;
  telephone: string;
  numero: string;
  client: string;
  modele: string;
  etape: CoutureStatus;
  date_prevue: string | null;
  reste: number;
  pret_le: string | null;
  livre_le: string | null;
  image?: string | null;
};

const day = (d: string) => new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

/** Page publique de suivi d'une commande de couture (lien envoyé par le tailleur, sans compte). */
export function SuiviCouture({ token }: { token: string }) {
  const [data, setData] = useState<Suivi | null | undefined>(undefined);
  useEffect(() => {
    void supabase.rpc("suivi_couture", { p_token: token }).then(
      ({ data: d, error }) => setData(error || !d ? null : (d as Suivi)),
      () => setData(null),
    );
  }, [token]);

  if (data === undefined) return <main className="suivi"><p className="note">Un instant…</p></main>;
  if (!data) return <main className="suivi"><h1>Commande introuvable</h1><p className="note">Ce lien n'est plus valable. Demande un nouveau lien à ton tailleur.</p></main>;

  const at = STEPS.indexOf(data.etape);
  const phone = data.telephone?.replace(/\D/g, "");
  return (
    <main className="suivi">
      <p className="suivi-shop">{data.boutique}</p>
      <h1>{data.etape === "pret" ? "Ton habit est prêt !" : data.etape === "livre" ? "Habit livré, merci !" : data.etape === "annule" ? "Commande annulée" : `Bonjour ${data.client}, ton habit avance`}</h1>
      <p className="note">Commande {data.numero} · {data.modele}</p>
      {data.image && <img className="suivi-model" src={galleryUrl(data.image)} alt={`Modèle choisi : ${data.modele}`} />}
      {data.etape !== "annule" && (
        <ol className="suivi-steps">
          {STEPS.map((s, i) => (
            <li key={s} className={i < at ? "done" : i === at ? "on" : ""}>
              <span aria-hidden="true">{i < at ? "✓" : i + 1}</span>
              {STEP_LABEL[s]}
            </li>
          ))}
        </ol>
      )}
      {data.date_prevue && data.etape !== "livre" && <p>Date prévue : <b>{day(data.date_prevue)}</b></p>}
      {data.reste > 0 && data.etape !== "annule" && <p>Reste à payer : <b className="num">{data.reste.toLocaleString("fr-FR")} F</b></p>}
      {phone && (
        <a className="suivi-call" href={`https://wa.me/${phone.length === 9 ? `221${phone}` : phone}`} target="_blank" rel="noopener noreferrer">
          <Icon name="whatsapp" size="sm" /> Écrire au tailleur
        </a>
      )}
      <p className="suivi-foot">Suivi par Jokko · jokkoapp.com</p>
    </main>
  );
}
