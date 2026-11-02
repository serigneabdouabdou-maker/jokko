// Phrases fréquentes de Jokko, enregistrées une fois avec la belle voix de la page d'accueil.
// Quand Jokko dit exactement l'une d'elles, on joue l'enregistrement (instantané, sans token).
// Fichiers : stockage public « media », dossier voix/phrases/ (fabriqués par la fonction voix-accueil).

const BASE = "https://solocpbqtqlxdfpjiewm.supabase.co/storage/v1/object/public/media/voix/phrases/";
/** Changer ce numéro quand on refait les enregistrements (le téléphone garde les anciens sinon). */
export const RECORDED_VERSION = "v1";

export const RECORDED: { slug: string; text: string; lang: "wo" | "fr" }[] = [
  { slug: "salut-ecoute", text: "Asalaa maalekum ! Maa ngi lay déglu.", lang: "wo" },
  { slug: "ecoute", text: "Maa ngi lay déglu.", lang: "wo" },
  { slug: "repete", text: "Baal ma, waxaat ko.", lang: "wo" },
  { slug: "combien-montant", text: "Baal ma, ñaata la ?", lang: "wo" },
  { slug: "quel-produit", text: "Ban produit ?", lang: "wo" },
  { slug: "combien", text: "Ñaata ?", lang: "wo" },
  { slug: "quel-client", text: "Kan la ?", lang: "wo" },
  { slug: "note", text: "Bind naa ko.", lang: "wo" },
  { slug: "enleve", text: "Dindi naa ko.", lang: "wo" },
  { slug: "rien-a-enlever", text: "Amul dara lu ma war a dindi.", lang: "wo" },
  { slug: "oui", text: "Waaw.", lang: "wo" },
  { slug: "non", text: "Déedéet.", lang: "wo" },
  { slug: "on-commence", text: "Kaay, ñu tàmbali !", lang: "wo" },
  // Enregistrées le 02/11/2026 (phrases du commerce validées par le patron)
  { slug: "caisse-juste", text: "Caisse bi jub na.", lang: "wo" },
  { slug: "entends-mal", text: "Dégguma bu baax.", lang: "wo" },
  { slug: "patiente", text: "Xaaral tuuti.", lang: "wo" },
  { slug: "verifie", text: "Noonu la ?", lang: "wo" },
  { slug: "merci", text: "Jërëjëf !", lang: "wo" },
  { slug: "patron-seul", text: "Patron bi rekk a ko mën a def.", lang: "wo" },
  { slug: "rapproche", text: "Jegeel sa telefoon, dégguma bu baax.", lang: "wo" },
  { slug: "hors-ligne", text: "Amul réseau, waaye bind naa ko.", lang: "wo" },
  { slug: "rappel-whatsapp", text: "Fàttali naa ko ci WhatsApp.", lang: "wo" },
];

export const recordedUrl = (slug: string) => `${BASE}${slug}-${RECORDED_VERSION}.mp3`;

/** Même phrase, sans tenir compte des majuscules, de la ponctuation ni des espaces. */
export function normalizePhrase(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const BY_TEXT = new Map(RECORDED.map((r) => [normalizePhrase(r.text), r]));

/** La phrase enregistrée qui correspond exactement à ce que Jokko dit (ou null). */
export function matchRecorded(said: string): string | null {
  const hit = BY_TEXT.get(normalizePhrase(said));
  return hit ? hit.text : null;
}

const buffers = new Map<string, AudioBuffer>();
let loading: Promise<void> | null = null;
let current: AudioBufferSourceNode | null = null;

/** Télécharge et prépare les enregistrements (une fois par visite, ~10 Ko chacun). */
export function prefetchRecorded(context: AudioContext): Promise<void> {
  loading ??= Promise.all(
    RECORDED.map(async (r) => {
      try {
        const res = await fetch(recordedUrl(r.slug));
        if (!res.ok) return;
        buffers.set(normalizePhrase(r.text), await context.decodeAudioData(await res.arrayBuffer()));
      } catch {
        // pas grave : la voix directe de Jokko dira la phrase
      }
    }),
  ).then(() => undefined);
  return loading;
}

/** Joue la phrase enregistrée si elle est prête. Renvoie false sinon (la voix directe prend le relais). */
export function playRecorded(context: AudioContext, text: string, onEnd: () => void): boolean {
  const buffer = buffers.get(normalizePhrase(text));
  if (!buffer) return false;
  stopRecorded();
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.onended = () => {
    if (current === source) current = null;
    onEnd();
  };
  current = source;
  source.start();
  return true;
}

export function stopRecorded() {
  if (!current) return;
  const playing = current;
  current = null;
  playing.onended = null;
  try {
    playing.stop();
  } catch {
    // déjà fini
  }
}

/** Une phrase enregistrée est en train d'être jouée. */
export const recordedPlaying = () => current !== null;
