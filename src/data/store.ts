import type { Session } from "@supabase/supabase-js";
import { type Lang, type Profile, type Role, type Shop, clearProfile, loadProfile, roleIn, saveProfile } from "../model";
import { phoneOf, supabase } from "./supabase";
import { diffShop, loadShops, type LoadClient, type SyncClient, SyncQueue } from "./sync";

/**
 * Le magasin de données de l'appli : le téléphone garde une copie (marche sans internet),
 * et chaque changement part vers Supabase dès que la connexion le permet.
 */
export const queue = new SyncQueue();

export type SyncState = "ok" | "en_attente" | "hors_ligne";
type Listener = (state: SyncState) => void;
const listeners = new Set<Listener>();
let timer: ReturnType<typeof setTimeout> | null = null;

export function onSyncState(listener: Listener): () => void {
  listeners.add(listener);
  listener(queue.size ? "en_attente" : "ok");
  return () => {
    listeners.delete(listener);
  };
}

function emit(state: SyncState) {
  for (const listener of listeners) listener(state);
}

/** Envoie tout ce qui attend. Ne lance jamais d'exception. */
export async function flushNow(): Promise<boolean> {
  if (!queue.size) {
    emit("ok");
    return true;
  }
  const result = await queue.flush(supabase as unknown as SyncClient);
  emit(result.pending ? (result.error ? "hors_ligne" : "en_attente") : "ok");
  if (result.error) console.warn("[jokko] synchro en attente :", result.error);
  return result.pending === 0;
}

function scheduleFlush(delay = 800) {
  if (timer) clearTimeout(timer);
  emit("en_attente");
  timer = setTimeout(() => {
    timer = null;
    void flushNow();
  }, delay);
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => void flushNow());
  // Réessaie régulièrement si des ventes attendent (réseau instable).
  setInterval(() => {
    if (queue.size && navigator.onLine !== false) void flushNow();
  }, 30_000);
}

/** Enregistre un nouveau profil : copie locale + changements envoyés à Supabase. */
export function persist(prev: Profile | null, next: Profile) {
  saveProfile(next);
  if (!next.userId) return;
  let changed = false;
  for (const shop of next.shops) {
    const before = prev?.shops.find((s) => s.id === shop.id) ?? null;
    if (before === shop) continue;
    // Un vendeur ne modifie pas la fiche de la boutique (le serveur le refuserait de toute façon).
    const ops = diffShop(before, shop).filter((op) => op.table !== "shops" || roleIn(next, shop.id) === "patron");
    if (ops.length) {
      queue.push(ops);
      changed = true;
    }
  }
  if (changed) scheduleFlush();
  if (!prev || prev.owner !== next.owner || prev.lang !== next.lang || prev.speak !== next.speak || prev.shopId !== next.shopId) {
    void saveProfileRow(next);
  }
}

async function saveProfileRow(profile: Profile) {
  if (!profile.userId) return;
  const { error } = await supabase.from("profiles").upsert(
    {
      user_id: profile.userId,
      phone: profile.phone,
      owner: profile.owner,
      lang: profile.lang,
      speak: profile.speak,
      current_shop_id: profile.shopId || null,
    },
    { onConflict: "user_id" },
  );
  if (error) console.warn("[jokko] profil non sauvegardé :", error.message);
}

/** Lancement : wolof et français seulement. */
const LANGS: Lang[] = ["wo", "fr"];

/**
 * Au démarrage ou après connexion : retrouve le profil et les boutiques du commerçant.
 * Hors ligne, on garde la copie du téléphone.
 */
export async function bootstrap(session: Session): Promise<Profile> {
  const userId = session.user.id;
  const local = loadProfile();
  const mine = local?.userId === userId ? local : null;

  // On envoie d'abord ce qui attend, pour ne pas l'écraser avec l'ancienne version du serveur.
  const synced = await flushNow();
  if (mine && !synced) return mine;

  try {
    // Invitations en attente pour ce numéro : la boutique du patron apparaît tout de suite.
    await supabase.rpc("accept_invites").then(
      () => undefined,
      () => undefined,
    );
    const [{ data: row }, shops, { data: members }] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
      loadShops(supabase as unknown as LoadClient),
      supabase.from("shop_members").select("shop_id, role").eq("user_id", userId),
    ]);
    const roles: Record<string, Role> = {};
    for (const m of (members ?? []) as Array<{ shop_id: string; role: string }>) roles[m.shop_id] = m.role === "vendeur" ? "vendeur" : "patron";
    const lang = LANGS.find((l) => l === row?.lang) ?? LANGS.find((l) => l === mine?.lang) ?? "wo";
    const shopId = shops.find((s) => s.id === (mine?.shopId ?? row?.current_shop_id))?.id ?? shops[0]?.id ?? "";
    const profile: Profile = {
      userId,
      phone: phoneOf(session),
      owner: (row?.owner as string | undefined) || mine?.owner || "",
      lang,
      role: "patron",
      geminiKey: "",
      speak: typeof row?.speak === "boolean" ? row.speak : (mine?.speak ?? true),
      shopId,
      shops: shops.length ? shops : (mine?.shops ?? []),
      termsVersion: typeof row?.terms_version === "string" ? row.terms_version : null,
      roles,
    };
    saveProfile(profile);
    return profile;
  } catch {
    if (mine) return mine;
    return { userId, phone: phoneOf(session), owner: "", lang: "wo", role: "patron", geminiKey: "", speak: true, shopId: "", shops: [] };
  }
}

/** Création de la première boutique après l'inscription. */
export function firstShop(profile: Profile, owner: string, lang: Lang, shop: Shop): Profile {
  return { ...profile, owner, lang, shops: [...profile.shops, shop], shopId: shop.id };
}

/** Déconnexion : n'efface le téléphone qu'une fois tout envoyé. */
export async function signOut(): Promise<boolean> {
  const synced = await flushNow();
  if (!synced) return false;
  await supabase.auth.signOut();
  clearProfile();
  return true;
}

export function pendingCount(): number {
  return queue.size;
}

export function isSession(value: unknown): value is Session {
  return Boolean(value && typeof value === "object" && "access_token" in value);
}
