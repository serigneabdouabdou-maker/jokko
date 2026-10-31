import { useEffect, useState } from "react";

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
  await showNotification("Jokko", "Les notifications sont activées. Jokko te préviendra ici.");
  return "acceptees";
}

export async function showNotification(title: string, body: string): Promise<void> {
  if (notificationState() !== "acceptees") return;
  const registration = await navigator.serviceWorker.getRegistration();
  const icon = `${import.meta.env.BASE_URL}icon-192.png`;
  if (registration) await registration.showNotification(title, { body, icon, badge: icon });
  else new Notification(title, { body, icon });
}
