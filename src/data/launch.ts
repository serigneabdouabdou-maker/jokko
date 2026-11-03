import { supabase } from "./supabase";

/**
 * Avant le lancement officiel : la page d'accueil est couverte par « Bientôt disponible ».
 * Entrent seulement : les appareils ouverts une fois avec le lien d'accès secret (gardé sur l'appareil),
 * et les comptes déjà connectés. L'état se règle dans la console CFC (Réglages → Lancement).
 */
export type LaunchState = "bientot" | "ouvert";

const STATE_KEY = "jokko-lancement";
const ACCESS_KEY = "jokko-acces";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // stockage bloqué : l'accès ne sera pas retenu sur cet appareil
  }
}

/** Dernier état connu (affiché tout de suite, sans attendre le réseau). */
export function cachedLaunchState(): LaunchState {
  return read(STATE_KEY) === "ouvert" ? "ouvert" : "bientot";
}

export async function launchState(): Promise<LaunchState> {
  const { data, error } = await supabase.rpc("launch_state");
  if (error || (data !== "bientot" && data !== "ouvert")) return cachedLaunchState();
  write(STATE_KEY, data);
  return data;
}

export function hasAccess(): boolean {
  return Boolean(read(ACCESS_KEY));
}

/** Lien d'accès « ?acces=CODE » : vérifié par le serveur, puis retenu sur cet appareil ; le code disparaît de l'adresse. */
export async function claimAccessFromUrl(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const url = new URL(window.location.href);
  const code = url.searchParams.get("acces");
  if (!code) return hasAccess();
  url.searchParams.delete("acces");
  window.history.replaceState(null, "", url.pathname + (url.search ? url.search : "") + url.hash);
  const { data } = await supabase.rpc("check_access", { p_code: code });
  if (data === true) write(ACCESS_KEY, "1");
  return hasAccess();
}
