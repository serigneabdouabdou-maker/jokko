import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { Turntable } from "./Turntable";
import { framesOf, galleryUrl, loadPublicModel, type PublicModel } from "@/data/studio";

const cap = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

/**
 * Page publique d'un modèle (lien partagé par le tailleur sur WhatsApp) : le client voit le modèle,
 * le fait tourner, et commande chez l'atelier en un toucher (WhatsApp). Aucun compte nécessaire.
 */
export function ModelePublic({ id, shopId }: { id: string; shopId: string | null }) {
  const [m, setM] = useState<PublicModel | null | undefined>(undefined);
  useEffect(() => {
    void loadPublicModel(id, shopId).then(setM);
  }, [id, shopId]);

  if (m === undefined) return <main className="mp"><p className="mp-wait">Un instant…</p></main>;
  if (!m) return <main className="mp"><h1>Modèle introuvable</h1><p>Ce modèle n'est plus disponible. Demande un autre lien à ton tailleur.</p></main>;

  const name = cap(m.habit || m.titre.split(" · ")[0]);
  const phone = (m.telephone ?? "").replace(/\D/g, "");
  const wa = phone ? `https://wa.me/${phone.length === 9 ? `221${phone}` : phone}?text=${encodeURIComponent(`Bonjour${m.atelier ? ` ${m.atelier}` : ""}, je veux commander ce modèle : ${name} (${m.tissu}). ${window.location.href}`)}` : null;

  return (
    <main className="mp">
      {m.atelier && <p className="mp-shop">{m.atelier}</p>}
      <div className="st-stage mp-stage">
        <Turntable frames={framesOf({ image_path: m.image, views: m.vues ?? [] }).map(galleryUrl)} alt={name} />
      </div>
      <h1>{name}</h1>
      <p className="mp-fabric">{cap(m.tissu)}</p>
      {wa ? (
        <a className="mp-order" href={wa} target="_blank" rel="noopener noreferrer"><Icon name="whatsapp" size="sm" /> Commander chez {m.atelier ?? "le tailleur"}</a>
      ) : (
        <p className="mp-fabric">Montre ce modèle à ton tailleur pour le commander.</p>
      )}
      <p className="mp-foot">Modèle Jokko · jokkoapp.com</p>
    </main>
  );
}
