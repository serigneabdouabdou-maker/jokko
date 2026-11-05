import { supabase } from "@/data/supabase";

/**
 * Visite du site : une seule fois par session de navigation. On garde seulement la page, d'où vient le visiteur
 * (Facebook, TikTok, WhatsApp, Google…) et s'il est sur téléphone ou ordinateur. Ni adresse IP, ni identité.
 */
export function visitSource(search: string, referrer: string): string {
  const utm = new URLSearchParams(search).get("utm_source")?.toLowerCase() ?? "";
  const ref = (() => {
    try {
      return referrer ? new URL(referrer).hostname.toLowerCase() : "";
    } catch {
      return "";
    }
  })();
  const s = `${utm} ${ref}`;
  if (/facebook|fb\.|fbclid|messenger/.test(s) || new URLSearchParams(search).has("fbclid")) return "facebook";
  if (/tiktok/.test(s)) return "tiktok";
  if (/instagram/.test(s)) return "instagram";
  if (/whatsapp|wa\.me/.test(s)) return "whatsapp";
  if (/google/.test(s)) return "google";
  if (!utm && (!ref || ref.endsWith("jokkoapp.com"))) return "direct";
  return "autre site";
}

export function noteVisit(): void {
  try {
    if (sessionStorage.getItem("jokko.visite")) return;
    sessionStorage.setItem("jokko.visite", "1");
  } catch {
    /* navigation privée : on compte quand même */
  }
  const device = window.matchMedia?.("(pointer: coarse)").matches || /android|iphone|mobile/i.test(navigator.userAgent) ? "mobile" : "ordinateur";
  void supabase.rpc("note_visit", { p_path: window.location.pathname, p_source: visitSource(window.location.search, document.referrer), p_device: device }).then(
    () => undefined,
    () => undefined,
  );
}
