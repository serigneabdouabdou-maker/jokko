import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Shop } from "@/model";
import { regionFromCity, roundCoord } from "@/data/regions";

const date = (iso: string) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "");

/**
 * « Ma boutique sur la carte » : le patron place SA BOUTIQUE (une seule fois, avec son accord).
 * La position est arrondie à environ 1 km avant d'être gardée ; elle sert à compter les boutiques par région.
 */
export function ShopLocation({ shop, onChange }: { shop: Shop; onChange: (location: Shop["location"] | undefined) => void }) {
  const [state, setState] = useState<"repos" | "recherche" | "refus" | "erreur">("repos");

  function locate() {
    if (!("geolocation" in navigator)) return setState("erreur");
    setState("recherche");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({ lat: roundCoord(pos.coords.latitude), lng: roundCoord(pos.coords.longitude), at: new Date().toISOString() });
        setState("repos");
      },
      (err) => setState(err.code === err.PERMISSION_DENIED ? "refus" : "erreur"),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
    );
  }

  const guess = regionFromCity(shop.city);
  return (
    <div className="shop-location">
      <div>
        <b>Ma boutique sur la carte</b>
        {shop.location ? (
          <p className="note">📍 Boutique placée sur la carte de Jokko (à environ 1 km près){shop.location.at ? `, le ${date(shop.location.at)}` : ""}.</p>
        ) : (
          <p className="note">
            Fais-le depuis ta boutique : Jokko garde seulement la position de la boutique, arrondie à environ 1 km, pour compter les boutiques par région.
            Jamais ta position quand tu te déplaces.{guess ? ` Région devinée d'après ta ville : ${guess}.` : ""}
          </p>
        )}
        {state === "refus" && <p className="note" data-tone="error">Le téléphone a refusé la localisation. Autorise-la pour ce site dans les réglages du navigateur, puis réessaie.</p>}
        {state === "erreur" && <p className="note" data-tone="error">Position introuvable pour le moment. Active la localisation du téléphone et réessaie, de préférence près d'une fenêtre.</p>}
      </div>
      <div className="row">
        <Button variant="outline" className="h-11 rounded-full px-5" disabled={state === "recherche"} onClick={locate}>
          {state === "recherche" ? "Recherche…" : shop.location ? "Mettre à jour" : "Placer ma boutique"}
        </Button>
        {shop.location && <Button variant="ghost" className="h-11 rounded-full px-4" onClick={() => onChange(undefined)}>Retirer</Button>}
      </div>
    </div>
  );
}
