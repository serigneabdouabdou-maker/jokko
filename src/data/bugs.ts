import { supabase } from "@/data/supabase";

/**
 * Bugs de l'application : chaque erreur du navigateur est signalée à la console CFC (onglet Santé),
 * avec seulement le message raccourci, le fichier et la page. Les longs chiffres (téléphones) sont masqués.
 */
const NOISE = /ResizeObserver loop|Script error\.?$|chrome-extension:|moz-extension:|safari-extension:|Load failed|NetworkError|Failed to fetch|AbortError|The operation was aborted/i;

export function cleanError(message: string): string {
  return message.replace(/\d{6,}/g, "#").replace(/\s+/g, " ").trim().slice(0, 200);
}

export function isNoise(message: string, source: string): boolean {
  return !message.trim() || NOISE.test(message) || NOISE.test(source);
}

export function watchBugs(app: "boutique" | "console"): void {
  if (typeof window === "undefined" || import.meta.env.DEV) return;
  let sent = 0;
  const seen = new Set<string>();
  const report = (message: string, source: string) => {
    if (isNoise(message, source)) return;
    const msg = cleanError(message);
    const src = source.replace(/^https?:\/\/[^/]+/, "").slice(0, 120);
    const key = `${msg}|${src}`;
    if (seen.has(key) || sent >= 5) return; // au plus 5 bugs différents par ouverture de page
    seen.add(key);
    sent++;
    void supabase.rpc("note_app_error", { p_app: app, p_page: window.location.pathname, p_message: msg, p_source: src }).then(
      () => undefined,
      () => undefined,
    );
  };
  window.addEventListener("error", (e) => report(e.message || String(e.error ?? ""), e.filename ? `${e.filename}:${e.lineno}` : ""));
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason as { message?: string; stack?: string } | string | undefined;
    const message = typeof r === "string" ? r : r?.message ?? "";
    const at = typeof r === "object" && r?.stack ? (r.stack.split("\n").find((l) => /https?:\/\//.test(l)) ?? "").trim().replace(/^at\s+/, "") : "";
    report(message, at);
  });
}
