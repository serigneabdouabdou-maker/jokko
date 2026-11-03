import { useEffect, useState } from "react";
import { supabase } from "./data/supabase";

/**
 * Jokko comme une vraie appli : installation sur l'écran d'accueil, ouverture sans internet, notifications.
 */

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Lancé une fois au démarrage : enregistre le service worker et écoute l'invitation à installer. */
export function setupPwa(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // on garde l'invitation pour notre propre bouton « Installer »
    deferred = event as InstallPrompt;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    window.addEventListener("load", () => {
      void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => undefined);
    });
  }
}

export function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  if (/JokkoApp\//.test(navigator.userAgent)) return true; // déjà dans l'application Android
  return window.matchMedia?.("(display-mode: standalone)").matches || nav.standalone === true;
}

/** iPhone / iPad : pas de bouton automatique, il faut passer par « Partager → Sur l'écran d'accueil ». */
export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export type InstallState = { installed: boolean; canPrompt: boolean; ios: boolean; install: () => Promise<boolean> };

export function useInstall(): InstallState {
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick((n) => n + 1);
    listeners.add(l);
    const media = window.matchMedia?.("(display-mode: standalone)");
    media?.addEventListener?.("change", l);
    return () => {
      listeners.delete(l);
      media?.removeEventListener?.("change", l);
    };
  }, []);
  return {
    installed: isInstalled(),
    canPrompt: deferred !== null,
    ios: isIos(),
    install: async () => {
      if (!deferred) return false;
      const prompt = deferred;
      deferred = null;
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      notify();
      return outcome === "accepted";
    },
  };
}

export type NotifyState = "non_dispo" | "a_demander" | "acceptees" | "refusees";

export function notificationState(): NotifyState {
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) return "non_dispo";
  if (Notification.permission === "granted") return "acceptees";
  if (Notification.permission === "denied") return "refusees";
  return "a_demander";
}

/** Demande l'autorisation (au toucher d'un bouton, jamais toute seule) et envoie une notification d'essai. */
export async function enableNotifications(): Promise<NotifyState> {
  if (notificationState() === "non_dispo") return "non_dispo";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "refusees" : "a_demander";
  await ensurePush();
  await showNotification("Jokko", "Les notifications sont activées. Jokko te préviendra ici, même appli fermée.");
  return "acceptees";
}

export async function showNotification(title: string, body: string): Promise<void> {
  if (notificationState() !== "acceptees") return;
  const registration = await navigator.serviceWorker.getRegistration();
  const icon = `${import.meta.env.BASE_URL}icon-192.png`;
  if (registration) await registration.showNotification(title, { body, icon, badge: icon });
  else new Notification(title, { body, icon });
}

/** Clé publique des notifications de Jokko (la clé privée reste sur le serveur). */
const VAPID_PUBLIC = "BCRmXSqtWDld3eDDx-7HT5wObrA6AKr9BiEWgYzNOVkS7IT-3gGRStzs3NyR7F7P4zgYZ75VUldC42ZMlx8xbeY";

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Inscrit ce téléphone pour recevoir les notifications même appli fermée (alertes graves, résumé du soir).
 * Sans effet si les notifications ne sont pas autorisées. Ne lance jamais d'exception.
 */
export async function ensurePush(): Promise<boolean> {
  try {
    if (notificationState() !== "acceptees" || !("PushManager" in window)) return false;
    const registration = await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC) }));
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;
    const { error } = await supabase.rpc("save_push_subscription", { p_endpoint: json.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth });
    return !error;
  } catch {
    return false;
  }
}

/** Heure du résumé du soir (heure de Dakar), ou null pour ne pas en recevoir. */
export async function setSummaryHour(userId: string, hour: number | null): Promise<boolean> {
  const { error } = await supabase.from("profiles").update({ summary_hour: hour }).eq("user_id", userId);
  return !error;
}
