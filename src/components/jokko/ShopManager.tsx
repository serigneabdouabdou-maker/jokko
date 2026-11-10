import { MetierCards } from "./MetierCards";
import { useState } from "react";
import { Notice } from "./Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { newShop, type Profile, type Shop } from "@/model";
import { supabase } from "@/data/supabase";
import { flushNow } from "@/data/store";
import { shopWithMetier } from "@/data/metiers";

/** Supprime une entreprise au serveur (le patron qui l'a créée, en retapant son nom). */
async function deleteShop(shopId: string, name: string): Promise<string | null> {
  try {
    await flushNow();
    const { data, error } = await supabase.rpc("delete_shop", { p_shop: shopId, p_name: name });
    if (error) return "Pas de connexion internet. Réessaie.";
    const r = data as { ok: boolean; reason?: string };
    if (r.ok) return null;
    if (r.reason === "nom") return "Le nom ne correspond pas. Tape exactement le nom de l'entreprise.";
    if (r.reason === "derniere") return "C’est ta seule entreprise : on ne peut pas la supprimer.";
    if (r.reason === "proprietaire") return "Seul le patron qui a créé cette entreprise peut la supprimer.";
    return "Cette entreprise n’existe plus.";
  } catch {
    return "Pas de connexion internet. Réessaie.";
  }
}

/**
 * Patron : créer une entreprise (avec un vrai nom, pas une copie automatique) et supprimer une entreprise créée par erreur.
 * Plusieurs entreprises = offre Avancé (vérifié aussi par le serveur).
 */
export function ShopManager({ profile, setProfile, canAdd }: { profile: Profile; setProfile: (p: Profile) => void; canAdd: boolean }) {
  const shop = profile.shops.find((s) => s.id === profile.shopId) ?? profile.shops[0];
  const [mode, setMode] = useState<"" | "creer" | "supprimer">("");
  const [name, setName] = useState("");
  const [city, setCity] = useState(shop?.city ?? "");
  const [activity, setActivity] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  if (!shop) return null;
  // Règle de CFC : un numéro = une seule entreprise par métier (chaque entreprise garde ses données à part).
  const taken = activity ? shopWithMetier(profile.shops, activity, profile.roles) : undefined;

  function create() {
    if (taken || !activity) return;
    const created: Shop = newShop(name.trim(), activity.trim(), city.trim());
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
      <h3>Mes entreprises</h3>
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
            <Button variant="outline" className="h-11 rounded-full px-5" onClick={() => { setMode("creer"); setNote(""); }}>Nouvelle entreprise</Button>
          ) : (
            <p className="note">Plusieurs entreprises : c’est dans l’offre Avancé (« Mon offre »).</p>
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
          <Input className="h-11" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom de la nouvelle entreprise (ex. Boutique Médina)" aria-label="Nom de la nouvelle entreprise" autoFocus />
          <Input className="h-11" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ville ou quartier" aria-label="Ville" />
          <MetierCards value={activity} onChange={setActivity} compact />
          {taken ? (
            <p className="note" data-tone="error">
              Tu as déjà « {taken.name} » pour ce métier. Un numéro = une seule entreprise par métier.{" "}
              <button type="button" className="link" onClick={() => { setProfile({ ...profile, shopId: taken.id }); setMode(""); }}>Ouvrir « {taken.name} »</button>
            </p>
          ) : (
            <p className="note">La nouvelle entreprise démarre vide : ses articles, ses clients et sa caisse sont à part.</p>
          )}
          <p className="note">Chaque entreprise a son propre stock, sa caisse, ses ventes et ses dettes. Tu passes de l’une à l’autre en touchant son nom ci-dessus.</p>
          <div className="row">
            <Button type="submit" className="h-11 rounded-full px-5" disabled={!name.trim() || !activity || Boolean(taken)}>Créer l'entreprise</Button>
            <Button type="button" variant="ghost" className="h-11 rounded-full px-5" onClick={() => setMode("")}>Annuler</Button>
          </div>
        </form>
      )}

      {mode === "supprimer" && (
        <div className="fields shop-delete">
          <p className="note" data-tone="error">
            <b>Attention :</b> l'entreprise « {shop.name} » va disparaître de Jokko pour toi et tes vendeurs : stock, ventes, dettes, factures. Si c’était une erreur, CFC peut la récupérer.
          </p>
          <Input className="h-11" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={`Tape « ${shop.name} » pour confirmer`} aria-label="Nom de l'entreprise à supprimer" />
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
