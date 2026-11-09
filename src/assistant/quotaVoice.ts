/**
 * Forfait épuisé : Jokko le DIT avec une voix enregistrée (pas de Gemini, donc ça marche même quota fini),
 * l'écrit dans la conversation, puis ouvre « Mon offre » pour proposer Médium ou Avancé.
 * Sans ça, le commerçant croit que l'appli est en panne alors que c'est son forfait.
 */
import { recordedUrl } from "./recorded";

/** Ce que le serveur renvoie quand il refuse (402). */
export type QuotaRefusal = { reason?: string; tier?: string; kind?: string };

export type QuotaVariant = "essai" | "mois" | "budget" | "jour" | "jour-max" | "vendeur";

/** Quel message dire (null = pas un forfait épuisé : par exemple une fonction hors de l'offre). */
export function quotaVariant(refusal: QuotaRefusal, isPatron: boolean): QuotaVariant | null {
  const reason = refusal.reason ?? "";
  // « mois » : offre gratuite, plafond du mois atteint. « pause » : plafond de sécurité des comptes gratuits, jusqu'à demain.
  // « budget » : offre payante, budget Gemini du mois de la boutique atteint (l'écrit continue).
  if (reason !== "essai" && reason !== "quota" && reason !== "echanges" && reason !== "mois" && reason !== "pause" && reason !== "budget") return null;
  if (!isPatron) return "vendeur";
  if (reason === "essai") return "essai";
  if (reason === "mois") return "mois";
  if (reason === "budget") return "budget";
  return refusal.tier === "avance" ? "jour-max" : "jour";
}

export const QUOTA_MESSAGES: Record<QuotaVariant, { wo: string; fr: string; slug: string; offers: boolean }> = {
  essai: {
    slug: "forfait-essai-fini",
    wo: "Sa essai gratuit jeex na. Ngir wéy di wax ak Jokko, tànnal offre Médium walla offre Avancé. Maa ngi lay won offre yi.",
    fr: "Votre essai gratuit est terminé. Pour continuer à parler avec Jokko, choisissez l'offre Médium ou l'offre Avancé. Je vous montre les offres.",
    offers: true,
  },
  mois: {
    slug: "forfait-mois-fini",
    wo: "Sa forfait gratuit bu weer wi jeex na. Ngir wéy di wax ak Jokko, tànnal offre Médium walla offre Avancé. Maa ngi lay won offre yi.",
    fr: "Votre forfait gratuit du mois est épuisé. Pour continuer à parler avec Jokko, choisissez l'offre Médium ou l'offre Avancé. Je vous montre les offres.",
    offers: true,
  },
  budget: {
    slug: "forfait-budget-mois",
    wo: "Sa forfait bu weer wi jeex na. Ba weer wiy ñëw, mën nga bind walla jëfandikoo bouton yi.",
    fr: "Votre forfait voix du mois est épuisé. Jusqu'au mois prochain, vous pouvez écrire ou utiliser les boutons de l'application.",
    offers: false,
  },
  jour: {
    slug: "forfait-jour-fini",
    wo: "Sa forfait bu tey jeex na, ëllëg dina delsi. Soo bëggee wax ak Jokko lu ëpp, jëlal offre bu gën a mag. Maa ngi lay won offre yi.",
    fr: "Votre forfait du jour est épuisé, il revient demain. Pour parler davantage avec Jokko, passez à une offre supérieure. Je vous montre les offres.",
    offers: true,
  },
  "jour-max": {
    slug: "forfait-jour-max",
    wo: "Sa forfait bu tey jeex na, ëllëg dina delsi. Ba ëllëg, mën nga bind walla jëfandikoo bouton yi.",
    fr: "Votre forfait du jour est épuisé, il revient demain. En attendant, vous pouvez écrire ou utiliser les boutons de l'application.",
    offers: false,
  },
  vendeur: {
    slug: "forfait-vendeur",
    wo: "Forfait boutique bi jeex na. Waxal patron bi, mu tànn offre.",
    fr: "Le forfait de la boutique est épuisé. Demandez au patron de choisir une offre.",
    offers: false,
  },
};

export const quotaClipUrl = (variant: QuotaVariant, lang: "wo" | "fr") =>
  recordedUrl(lang === "fr" ? `${QUOTA_MESSAGES[variant].slug}-fr` : QUOTA_MESSAGES[variant].slug);

/** Joue le message enregistré ; se termine quand il est fini (ou tout de suite si le fichier manque). */
export function playQuotaClip(variant: QuotaVariant, lang: "wo" | "fr"): Promise<void> {
  return new Promise((resolve) => {
    try {
      const audio = new Audio(quotaClipUrl(variant, lang));
      const done = () => resolve();
      audio.addEventListener("ended", done, { once: true });
      audio.addEventListener("error", done, { once: true });
      void audio.play().catch(done);
      // Filet de sécurité : jamais bloqué plus de 20 s.
      window.setTimeout(done, 20_000);
    } catch {
      resolve();
    }
  });
}
