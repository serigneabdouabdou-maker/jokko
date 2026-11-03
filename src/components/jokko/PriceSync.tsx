import { useState } from "react";
import { Icon } from "./Icon";
import { Button } from "@/components/ui/button";
import { money, type Profile } from "@/model";
import { supabase } from "@/data/supabase";
import { flushNow } from "@/data/store";
import { loadShops, type LoadClient } from "@/data/sync";
import type { PriceChange } from "@/data/multiShop";

const amount = (n: number) => money(n).replace(/ /g, " ");

/** « Mettre ce prix aussi dans mes autres boutiques ? » après un changement de prix (patron, plusieurs boutiques). */
export function PriceSyncBanner({ shopId, changes, profile, setProfile, onDone }: { shopId: string; changes: PriceChange[]; profile: Profile; setProfile: (p: Profile) => void; onDone: (message: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const targets = [...new Map(changes.flatMap((c) => c.shops).map((s) => [s.id, s])).values()];
  const first = changes[0];

  async function apply() {
    setBusy(true);
    // Le nouveau prix doit d'abord être au serveur.
    await flushNow();
    const { data, error } = await supabase.rpc("sync_prices", { p_shop: shopId, p_products: changes.map((c) => c.productId), p_targets: targets.map((t) => t.id) });
    if (error || !(data as { ok?: boolean } | null)?.ok) {
      setBusy(false);
      return onDone("Les prix n’ont pas pu être changés dans les autres boutiques. Vérifie la connexion et réessaie.");
    }
    try {
      const fresh = await loadShops(supabase as unknown as LoadClient, targets.map((t) => t.id));
      setProfile({ ...profile, shops: profile.shops.map((s) => fresh.find((f) => f.id === s.id) ?? s) });
    } catch {
      // les autres boutiques se mettront à jour à la prochaine ouverture
    }
    setBusy(false);
    onDone(`✓ Nouveau prix appliqué aussi à ${targets.map((t) => t.name).join(", ")}.`);
  }

  return (
    <div className="banner price-sync" role="status">
      <Icon name="etiquette" />
      <span>
        {changes.length === 1
          ? <>Prix de <b>{first.name}</b> : {amount(first.oldPrice)} → <b>{amount(first.newPrice)}</b>. Mettre ce prix aussi à <b>{targets.map((t) => t.name).join(", ")}</b> ?</>
          : <>{changes.length} prix changés ({changes.map((c) => c.name).join(", ")}). Les mettre aussi à <b>{targets.map((t) => t.name).join(", ")}</b> ?</>}
      </span>
      <span className="price-sync-actions">
        <Button className="h-9 rounded-full px-4" disabled={busy} onClick={() => void apply()}>{busy ? "Un instant…" : "Oui, partout"}</Button>
        <Button variant="ghost" className="h-9 rounded-full px-3" disabled={busy} onClick={() => onDone(null)}>Non</Button>
      </span>
    </div>
  );
}
