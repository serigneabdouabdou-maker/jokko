/**
 * Jokko dans l'application Android (Capacitor) : la même appli web, ouverte dans le moteur web d'Android.
 * Ici, ce que le moteur web d'Android ne sait pas faire seul :
 * - télécharger un fichier (facture, étiquettes, CSV) → on l'enregistre et on ouvre le menu de partage du téléphone ;
 * - ouvrir une nouvelle fenêtre (WhatsApp, Wave) → on passe le lien au téléphone, qui ouvre la bonne application.
 */

type Listener = { remove: () => Promise<void> };
export type PushPlugin = {
  checkPermissions: () => Promise<{ receive: string }>;
  requestPermissions: () => Promise<{ receive: string }>;
  register: () => Promise<void>;
  createChannel: (c: { id: string; name: string; description?: string; importance?: number; visibility?: number; vibration?: boolean; lights?: boolean; lightColor?: string }) => Promise<void>;
  addListener: (event: string, cb: (data: never) => void) => Promise<Listener>;
};

type CapPlugins = {
  PushNotifications?: PushPlugin;
  Filesystem?: { writeFile: (o: { path: string; data: string; directory: string }) => Promise<{ uri: string }> };
  Share?: { share: (o: { title?: string; text?: string; files?: string[]; url?: string; dialogTitle?: string }) => Promise<unknown> };
};
type Cap = { isNativePlatform?: () => boolean; Plugins?: CapPlugins };

const cap = (): Cap | undefined => (globalThis as unknown as { Capacitor?: Cap }).Capacitor;

/** Vrai dans l'application Android Jokko (pas dans un navigateur). */
export function isNativeApp(): boolean {
  if (typeof navigator === "undefined") return false;
  return /JokkoApp\//.test(navigator.userAgent) || cap()?.isNativePlatform?.() === true;
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Enregistre le fichier dans l'appli puis ouvre le menu de partage (WhatsApp, impression, Fichiers…). */
export async function shareFileNative(blob: Blob, name: string): Promise<boolean> {
  const plugins = cap()?.Plugins;
  if (!plugins?.Filesystem || !plugins.Share) return false;
  try {
    const safe = name.replace(/[^\w.\-]+/g, "_") || "jokko";
    const { uri } = await plugins.Filesystem.writeFile({ path: safe, data: await toBase64(blob), directory: "CACHE" });
    await plugins.Share.share({ title: safe, files: [uri], dialogTitle: "Envoyer ou enregistrer" });
    return true;
  } catch {
    return false;
  }
}

// ---------- Notifications de l'application (Firebase) ----------

const PUSH_KEY = "jokko.push.natif";
export type NativePushState = "non_dispo" | "a_demander" | "acceptees" | "refusees";

export const nativePush = (): PushPlugin | undefined => (isNativeApp() ? cap()?.Plugins?.PushNotifications : undefined);

/** Dernier état connu (lecture immédiate, sans attendre le téléphone). */
export function nativePushState(): NativePushState {
  if (!nativePush()) return "non_dispo";
  try {
    const v = localStorage.getItem(PUSH_KEY);
    return v === "acceptees" || v === "refusees" ? v : "a_demander";
  } catch {
    return "a_demander";
  }
}

function remember(state: NativePushState) {
  try {
    localStorage.setItem(PUSH_KEY, state);
  } catch {
    /* rien */
  }
}

/**
 * Inscrit le téléphone auprès de Firebase et donne le jeton à `save` (enregistré sur le serveur).
 * `ask` : demander l'autorisation si elle n'est pas encore donnée (au toucher d'un bouton).
 */
export async function registerNativePush(save: (token: string) => Promise<boolean>, ask: boolean): Promise<NativePushState> {
  const push = nativePush();
  if (!push) return "non_dispo";
  try {
    let { receive } = await push.checkPermissions();
    if (receive !== "granted" && ask) ({ receive } = await push.requestPermissions());
    if (receive !== "granted") {
      const state: NativePushState = receive === "denied" ? "refusees" : "a_demander";
      remember(state);
      return state;
    }
    const token = await new Promise<string | null>((resolve) => {
      const timer = window.setTimeout(() => resolve(null), 15_000);
      void push.addListener("registration", ((t: { value: string }) => {
        window.clearTimeout(timer);
        resolve(t.value);
      }) as (data: never) => void);
      void push.addListener("registrationError", (() => {
        window.clearTimeout(timer);
        resolve(null);
      }) as (data: never) => void);
      void push.register();
    });
    if (!token || !(await save(token))) return "a_demander";
    remember("acceptees");
    return "acceptees";
  } catch {
    return "a_demander";
  }
}

/** À appeler une fois au démarrage. Sans effet dans un navigateur. */
export function setupNative() {
  if (!isNativeApp()) return;
  document.documentElement.dataset.app = "android";

  // Canal « Jokko » (son + vibration) et ouverture du bon écran quand on touche une notification.
  const push = nativePush();
  if (push) {
    void push.createChannel({ id: "jokko", name: "Jokko", description: "Ventes, dettes, alertes de la boutique", importance: 4, visibility: 1, vibration: true, lights: true, lightColor: "#F6B800" }).catch(() => undefined);
    void push.addListener("pushNotificationActionPerformed", ((action: { notification?: { data?: { url?: string } } }) => {
      const url = action.notification?.data?.url;
      if (!url) return;
      const target = new URL(url, `${window.location.origin}/`);
      // Une notification de la console CFC ne s'ouvre jamais dans l'appli des boutiques : elle se lit dans Jokko Admin.
      if (target.pathname.startsWith("/console")) return;
      if (target.origin === window.location.origin) window.location.href = target.href;
    }) as (data: never) => void);
  }

  // Nouvelle fenêtre impossible : on navigue vers le lien, Android ouvre WhatsApp / Wave / le navigateur.
  window.open = ((url?: string | URL) => {
    const href = url ? String(url) : "";
    if (href && href !== "about:blank") window.location.href = href;
    return null;
  }) as typeof window.open;

  // Téléchargements (<a download href="blob:…">) : on garde le fichier un moment, puis on le partage.
  const revoke = URL.revokeObjectURL.bind(URL);
  URL.revokeObjectURL = (u: string) => void window.setTimeout(() => revoke(u), 60_000);
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    if (this.download && this.href.startsWith("blob:")) {
      const name = this.download;
      void fetch(this.href)
        .then((r) => r.blob())
        .then((b) => shareFileNative(b, name));
      return;
    }
    click.call(this);
  };
}
