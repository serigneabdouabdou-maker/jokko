/**
 * Jokko dans l'application Android (Capacitor) : la même appli web, ouverte dans le moteur web d'Android.
 * Ici, ce que le moteur web d'Android ne sait pas faire seul :
 * - télécharger un fichier (facture, étiquettes, CSV) → on l'enregistre et on ouvre le menu de partage du téléphone ;
 * - ouvrir une nouvelle fenêtre (WhatsApp, Wave) → on passe le lien au téléphone, qui ouvre la bonne application.
 */

type CapPlugins = {
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

/** À appeler une fois au démarrage. Sans effet dans un navigateur. */
export function setupNative() {
  if (!isNativeApp()) return;
  document.documentElement.dataset.app = "android";

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
