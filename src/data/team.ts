import { normalizePhone, supabase } from "./supabase";
import type { JournalRow } from "./journal";

/** L'équipe d'une boutique et les invitations : tout passe par le serveur (règles vérifiées par la base). */

export type Member = { user_id: string; role: "patron" | "vendeur"; phone: string; name: string; since: string };
export type Invite = { id: string; phone: string; name: string; created_at: string };

export async function loadTeam(shopId: string): Promise<{ members: Member[]; invites: Invite[] }> {
  const [team, invites] = await Promise.all([
    supabase.rpc("shop_team", { p_shop: shopId }),
    supabase.from("shop_invites").select("id, phone, name, created_at").eq("shop_id", shopId).is("accepted_at", null).order("created_at"),
  ]);
  if (team.error) throw new Error(team.error.message);
  return { members: (team.data ?? []) as Member[], invites: (invites.data ?? []) as Invite[] };
}

export async function inviteSeller(shopId: string, rawPhone: string, name: string): Promise<string | null> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return "Numéro sénégalais invalide (ex. 77 123 45 67).";
  const { error } = await supabase.from("shop_invites").insert({ shop_id: shopId, phone, name: name.trim().slice(0, 80) });
  if (!error) return null;
  if (/duplicate|unique/i.test(error.message)) return "Ce numéro est déjà invité dans cette boutique.";
  return "Invitation impossible pour le moment. Vérifie la connexion internet.";
}

export async function cancelInvite(id: string): Promise<boolean> {
  const { error } = await supabase.from("shop_invites").delete().eq("id", id);
  return !error;
}

/** Retire un vendeur : il perd l'accès tout de suite. Son invitation est aussi effacée (il ne peut pas revenir seul). */
export async function removeMember(shopId: string, userId: string): Promise<boolean> {
  const { error } = await supabase.from("shop_members").delete().eq("shop_id", shopId).eq("user_id", userId);
  if (error) return false;
  await supabase.from("shop_invites").delete().eq("shop_id", shopId).eq("accepted_by", userId);
  return true;
}

export async function loadJournal(shopId: string, limit = 300): Promise<JournalRow[]> {
  const { data, error } = await supabase.from("journal").select("*").eq("shop_id", shopId).order("at", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as JournalRow[];
}

/** Clôture de caisse : le comptage du tiroir est gardé sur le serveur (le patron voit l'écart à distance). */
export async function saveCashCount(shopId: string, expected: number, counted: number, note = ""): Promise<boolean> {
  const { error } = await supabase.from("cash_counts").insert({ shop_id: shopId, expected: Math.round(expected), counted: Math.round(counted), note: note.slice(0, 200) });
  return !error;
}

/** Le journal en direct : appelé à chaque nouvelle ligne de cette boutique. Renvoie de quoi arrêter l'écoute. */
export function watchJournal(shopId: string, onRow: (row: JournalRow) => void): () => void {
  const channel = supabase
    .channel(`journal-${shopId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "journal", filter: `shop_id=eq.${shopId}` }, (payload) => onRow(payload.new as JournalRow))
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
