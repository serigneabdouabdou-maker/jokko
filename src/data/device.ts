/**
 * Identifiant du téléphone (tiré au hasard, gardé sur le téléphone) : le serveur repère un téléphone qui sert
 * à créer beaucoup de comptes pour profiter plusieurs fois du gratuit et de l'essai. Rien d'autre n'est lu.
 */
import { supabase } from "./supabase";

const KEY = "jokko.appareil";

export function deviceId(): string {
  try {
    const known = localStorage.getItem(KEY);
    if (known && known.length >= 12) return known;
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const id = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    return "";
  }
}

let noted = "";
/** Note le téléphone pour le compte connecté (une fois par session et par compte). */
export function noteDevice(userId: string | undefined) {
  if (!userId || noted === userId) return;
  const id = deviceId();
  if (!id) return;
  noted = userId;
  void supabase.rpc("note_device", { p_device: id }).then(() => undefined, () => undefined);
}
