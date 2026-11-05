import { MetierCards } from "./MetierCards";
import { useState } from "react";
import { Notice } from "./Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { newShop, type Profile, type Shop, uid } from "@/model";
import { supabase } from "@/data/supabase";
import { flushNow } from "@/data/store";
import { metierOf } from "@/data/metiers";

/** Supprime une boutique au serveur (le patron qui l'a créée, en retapant son nom). */
async function deleteShop(shopId: string, name: string): Promise<string | null> {
  try {
    await flushNow();
    const { data, error } = await supabase.rpc("delete_shop", { p_shop: shopId, p_name: name });
    if (error) return "Pas de connexion internet. Réessaie.";
    const r = data as { ok: boolean; reason?: string };
    if (r.ok) return null;
    if (r.reason === "nom") return "Le nom ne correspond pas. Tape exactement le nom de la boutique.";
    if (r.reason === "derniere") return "C’est ta seule boutique : on ne peut pas la supprimer.";
    if (r.reason === "proprietaire") return "Seul le patron qui a créé cette boutique peut la supprimer.";
    return "Cette boutique n’existe plus.";
  } catch {
    return "Pas de connexion internet. Réessaie.";
  }
}

/**
 * Patron : créer une boutique (avec un vrai nom, pas une copie automatique) et supprimer une boutique créée par erreur.
 * Plusieurs boutiques = offre Avancé (vérifié aussi par le serveur).
 */
export function ShopManager({ profile, setProfile, canAdd }: { profile: Profile; setProfile: (p: Profile) => void; canAdd: boolean }) {
  const shop = profile.shops.find((s) => s.id === profile.shopId) ?? profile.shops[0];
  const [mode, setMode] = useState<"" | "creer" | "supprimer">("");
  const [name, setName] = useState("");
  const [city, setCity] = useState(shop?.city ?? "");
  const [activity, setActivity] = useState(shop?.activity ?? "");
  const [copyProducts, setCopyProducts] = useState(true);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  if (!shop) return null;
  // Jamais de mélange : on ne reprend les articles que pour une boutique du même métier.
  const sameMetier = metierOf(activity).id === metierOf(shop.activity).id;
  const copy = copyProducts && sameMetier;

  function create() {
    const fresh: Shop = newShop(name.trim(), activity.trim(), city.trim());
    // Mêmes articles et prix si demandé (stock à zéro, nouveaux identifiants). Pas de clients ni de dettes.
    const created: Shop = copy ? { ...fresh, products: shop.products.map((p) => ({ ...p, id: uid("p"), stock: 0 })) } : fresh;
    setProfile({ ...profile, shops: [...profile.shops, created], shopId: created.id });
    setMode("");
    setName("");
    setNote(`✓ Boutique « ${created.name} » créée. Tu es dedans maintenant.`);
  }

  async function remove() {
    setBusy(true);
    setNote("");
    const failed = await deleteShop(shop.id, typed);
    setBusy(false);
    if (failed) return setNote(failed);
    const rest = profile.shops.filter((s) => s.id !== shop.id);
    setProfile({ ...profile, shops: rest, shopId: rest[0]?.id ?? "" });
    setMode("");
    setTyped("");
    setNote(`✓ Boutique « ${shop.name} » supprimée.`);
  }

  return (
    <div className="install-settings shop-manager">
      <h3>Mes boutiques</h3>
      <ul className="shop-list">
        {profile.shops.map((s) => (
          <li key={s.id} className={s.id === shop.id ? "on" : ""}>
            <button type="button" onClick={() => setProfile({ ...profile, shopId: s.id })}>
              <b>{s.name}</b>
              <small>{[s.activity, s.city].filter(Boolean).join(" · ") || "—"}</small>
            </button>
            {s.id === shop.id && <span className="offer-tag">Ouverte</span>}
          </li>
        ))}
      </ul>

      {mode === "" && (
        <div className="row">
          {canAdd ? (
            <Button variant="outline" className="h-11 rounded-full px-5" onClick={() => { setMode("creer"); setNote(""); }}>Nouvelle boutique</Button>
          ) : (
            <p className="note">Plusieurs boutiques : c’est dans l’offre Avancé (« Mon offre »).</p>
          )}
          {profile.shops.length > 1 && (
            <Button variant="ghost" className="h-11 rounded-full px-5 text-red-700" onClick={() => { setMode("supprimer"); setNote(""); setTyped(""); }}>Supprimer « {shop.name} »</Button>
          )}
        </div>
      )}

      {mode === "creer" && (
        <form
          className="fields"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create();
          }}
        >
          <Input className="h-11" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom de la nouvelle boutique (ex. Boutique Médina)" aria-label="Nom de la nouvelle boutique" autoFocus />
          <Input className="h-11" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ville ou quartier" aria-label="Ville" />
          <MetierCards value={activity} onChange={setActivity} compact />
          {sameMetier ? (
            <label className="row">
              <input type="checkbox" checked={copyProducts} onChange={(e) => setCopyProducts(e.target.checked)} />
              <span>Reprendre les articles et les prix de « {shop.name} » (stock à zéro)</span>
            </label>
          ) : (
            <p className="note">Autre métier : la nouvelle boutique démarre vide, sans les articles de « {shop.name} ».</p>
          )}
          <p className="note">Chaque boutique a son propre stock, sa caisse, ses ventes et ses dettes. Tu passes de l’une à l’autre en touchant son nom ci-dessus.</p>
          <div className="row">
            <Button type="submit" className="h-11 rounded-full px-5" disabled={!name.trim()}>Créer la boutique</Button>
            <Button type="button" variant="ghost" className="h-11 rounded-full px-5" onClick={() => setMode("")}>Annuler</Button>
          </div>
        </form>
      )}

      {mode === "supprimer" && (
        <div className="fields shop-delete">
          <p className="note" data-tone="error">
            <b>Attention :</b> la boutique « {shop.name} » va disparaître de Jokko pour toi et tes vendeurs : stock, ventes, dettes, factures. Si c’était une erreur, CFC peut la récupérer.
          </p>
          <Input className="h-11" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={`Tape « ${shop.name} » pour confirmer`} aria-label="Nom de la boutique à supprimer" />
          <div className="row">
            <Button variant="destructive" className="h-11 rounded-full px-5" disabled={busy || typed.trim().toLowerCase() !== shop.name.trim().toLowerCase()} onClick={() => void remove()}>
              {busy ? "Suppression…" : "Supprimer définitivement"}
            </Button>
            <Button variant="ghost" className="h-11 rounded-full px-5" onClick={() => setMode("")}>Annuler</Button>
          </div>
        </div>
      )}

      {note && <Notice text={note} tone={note.startsWith("✓") ? "ok" : "erreur"} />}
    </div>
  );
}
