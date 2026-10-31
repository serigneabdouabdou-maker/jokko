/**
 * Lecture des codes-barres avec la caméra du téléphone.
 * 1. Le lecteur intégré au téléphone (Chrome sur Android) : rapide et léger.
 * 2. Sinon (iPhone, vieux navigateurs), la bibliothèque ZXing, chargée seulement à ce moment-là.
 * La douchette Bluetooth, elle, se comporte comme un clavier : voir useScannerKeys.
 */

type Detected = { rawValue: string };
type NativeDetector = { detect(source: CanvasImageSource): Promise<Detected[]> };
type NativeDetectorClass = {
  new (options?: { formats: string[] }): NativeDetector;
  getSupportedFormats?: () => Promise<string[]>;
};

const WANTED = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"];

export type CameraScan = { stop: () => void; engine: "telephone" | "zxing" };

async function nativeDetector(): Promise<NativeDetector | null> {
  const Detector = (globalThis as unknown as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector;
  if (!Detector) return null;
  try {
    const supported = (await Detector.getSupportedFormats?.()) ?? WANTED;
    const formats = WANTED.filter((f) => supported.includes(f));
    return formats.length ? new Detector({ formats }) : null;
  } catch {
    return null;
  }
}

/**
 * Allume la caméra arrière dans `video` et appelle onCode à chaque code lu
 * (le même code n'est pas répété avant 1,5 s : on laisse le temps d'enlever l'article).
 */
export async function startCamera(video: HTMLVideoElement, onCode: (code: string) => void): Promise<CameraScan> {
  let last = "";
  let lastAt = 0;
  const emit = (code: string) => {
    const now = Date.now();
    if (code === last && now - lastAt < 1500) return;
    last = code;
    lastAt = now;
    onCode(code);
  };

  const detector = await nativeDetector();
  if (detector) {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    video.srcObject = stream;
    video.setAttribute("playsinline", "true");
    video.muted = true;
    await video.play();
    let running = true;
    const loop = async () => {
      if (!running) return;
      try {
        if (video.readyState >= 2) {
          const found = await detector.detect(video);
          if (found[0]?.rawValue) emit(found[0].rawValue);
        }
      } catch {
        /* image floue : on réessaie */
      }
      if (running) setTimeout(loop, 120);
    };
    void loop();
    return {
      engine: "telephone",
      stop: () => {
        running = false;
        stream.getTracks().forEach((t) => t.stop());
        video.srcObject = null;
      },
    };
  }

  const { BrowserMultiFormatReader } = await import("@zxing/browser");
  const reader = new BrowserMultiFormatReader();
  const controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } }, audio: false }, video, (result) => {
    if (result) emit(result.getText());
  });
  return {
    engine: "zxing",
    stop: () => {
      controls.stop();
      const stream = video.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    },
  };
}

/** Petit « bip » et vibration : le vendeur sait que le scan est passé sans regarder l'écran. */
export function beep(ok = true): void {
  try {
    navigator.vibrate?.(ok ? 40 : [60, 60, 60]);
    const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = ok ? 1650 : 300;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.08 : 0.25));
    osc.onended = () => void ctx.close();
  } catch {
    /* pas de son : ce n'est pas grave */
  }
}
