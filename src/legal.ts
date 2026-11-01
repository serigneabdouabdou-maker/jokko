/**
 * Conditions d'utilisation et politique de confidentialité de Jokko.
 * Textes simples, à faire relire par un juriste au Sénégal avant l'ouverture au public.
 * Changer TERMS_VERSION oblige chaque commerçant à accepter de nouveau.
 */

export const TERMS_VERSION = "2026-11-01";
export const LEGAL_DATE = "1er novembre 2026";
export const COMPANY = "CFC – Cisse Family Company";
export const CONTACT_EMAIL = "cfallou26@gmail.com";

export type LegalSection = { title: string; text: string[] };
export type LegalDoc = { id: "conditions" | "confidentialite"; title: string; intro: string; sections: LegalSection[] };

export const CONDITIONS: LegalDoc = {
  id: "conditions",
  title: "Conditions d’utilisation",
  intro: `Ces conditions expliquent comment utiliser Jokko. En créant ton compte, tu les acceptes. Version du ${LEGAL_DATE}.`,
  sections: [
    {
      title: "1. Qui sommes-nous",
      text: [`Jokko est une application éditée par ${COMPANY}, au Sénégal. Pour toute question : ${CONTACT_EMAIL}.`],
    },
    {
      title: "2. Le service",
      text: [
        "Jokko t’aide à tenir ta boutique à la voix ou à l’écran : ventes, achats, stock, clients, dettes, dépenses, caisse, bilan et factures.",
        "Pendant le lancement, toutes les fonctions sont ouvertes. Si des offres payantes arrivent, tu seras prévenu à l’avance dans l’application, et rien ne te sera facturé sans ton accord.",
      ],
    },
    {
      title: "3. Ton compte",
      text: [
        "Ton compte est lié à ton numéro de téléphone et protégé par un code secret de 6 chiffres.",
        "Garde ton code pour toi : ne le donne à personne. Tout ce qui est fait avec ton code est considéré comme fait par toi.",
        "Jokko est réservé aux personnes majeures (18 ans et plus) qui gèrent un commerce.",
      ],
    },
    {
      title: "4. Tes données t’appartiennent",
      text: [
        "Les chiffres de ta boutique sont à toi. Tu peux les exporter (Réglages) et demander leur suppression à tout moment.",
        "Les numéros de tes clients que tu ajoutes dans Jokko : tu dois avoir leur accord pour les garder et leur envoyer des relances ou des factures.",
      ],
    },
    {
      title: "5. Bonne utilisation",
      text: [
        "Tu t’engages à utiliser Jokko pour ton commerce, dans le respect de la loi : pas d’activité illégale, pas de tentative de piratage, pas d’usage du compte d’une autre personne.",
      ],
    },
    {
      title: "6. Jokko est une aide",
      text: [
        "Jokko note ce que tu dis ou écris. Avant une décision importante (gros paiement, déclaration, crédit), vérifie les montants. Tu peux annuler une écriture fausse.",
        "Jokko ne remplace pas un comptable. Dans les limites permises par la loi, l’éditeur n’est pas responsable des pertes dues à une information mal dite, mal saisie ou non vérifiée.",
      ],
    },
    {
      title: "7. Disponibilité",
      text: [
        "Nous faisons de notre mieux pour que Jokko marche tout le temps. Mais il dépend d’internet et de prestataires techniques : des coupures peuvent arriver. Ce qui est noté sans internet est envoyé quand la connexion revient.",
      ],
    },
    {
      title: "8. Arrêter Jokko",
      text: [
        `Tu peux arrêter quand tu veux et demander la suppression de ton compte à ${CONTACT_EMAIL}.`,
        "En cas d’abus grave (piratage, fraude, usage illégal), un compte peut être suspendu.",
      ],
    },
    {
      title: "9. Changements",
      text: ["Si ces conditions changent, tu seras prévenu dans l’application et on te demandera de les accepter de nouveau."],
    },
    {
      title: "10. Loi applicable",
      text: ["Ces conditions sont soumises à la loi sénégalaise. En cas de désaccord, on cherche d’abord une solution à l’amiable ; sinon, les tribunaux de Dakar sont compétents."],
    },
  ],
};

export const CONFIDENTIALITE: LegalDoc = {
  id: "confidentialite",
  title: "Politique de confidentialité",
  intro: `Ce texte explique quelles données Jokko garde, pourquoi, et comment elles sont protégées, selon la loi sénégalaise n° 2008-12 sur les données personnelles. Version du ${LEGAL_DATE}.`,
  sections: [
    {
      title: "1. Responsable",
      text: [`${COMPANY}, Sénégal. Contact pour tes données : ${CONTACT_EMAIL}.`],
    },
    {
      title: "2. Les données gardées",
      text: [
        "Ton numéro de téléphone et ton code secret. Le code est gardé sous une forme brouillée : personne ne peut le relire, pas même nous.",
        "Ton prénom, la langue choisie, le nom et les informations de ta boutique.",
        "Ce que tu enregistres : ventes, achats, stock, dépenses, caisse, dettes, factures, et les noms et numéros des clients que tu ajoutes.",
        "Ta voix, seulement quand le micro est ouvert : elle est transformée en texte pour comprendre ta phrase. Jokko ne garde pas l’enregistrement de ta voix.",
        "La position de ta boutique, seulement si tu choisis de la placer sur la carte : elle est arrondie à environ 1 km. Jokko ne suit jamais ta position quand tu te déplaces. Tu peux la retirer à tout moment dans Réglages.",
        "Le nombre de fois où tu utilises l’assistant vocal chaque jour, pour appliquer les limites de ton offre.",
      ],
    },
    {
      title: "3. Pourquoi",
      text: [
        "Pour faire marcher Jokko : noter, calculer, sauvegarder ta boutique et la retrouver sur un autre téléphone, et protéger ton compte.",
        "Compter les boutiques par région et suivre l’usage du service, pour l’améliorer et l’ouvrir dans de nouvelles régions.",
        "Pas de publicité. Tes données ne sont jamais vendues.",
      ],
    },
    {
      title: "4. Qui les traite",
      text: [
        "Toi, et seulement toi : chaque boutique ne voit que ses propres données.",
        "L’équipe de CFC, pour gérer les comptes et les abonnements : elle voit le nom et la ville de la boutique, le numéro du patron, l’offre, le nombre de ventes et leur total, et la région de la boutique. Ces accès sont protégés par une double vérification.",
        "Nos prestataires techniques, uniquement pour faire marcher le service : Supabase (sauvegarde de tes données, serveurs à Paris, en France) et Google Gemini (compréhension de la voix et des phrases).",
        "WhatsApp, seulement quand tu choisis d’envoyer une facture ou une relance.",
      ],
    },
    {
      title: "5. Données hors du Sénégal",
      text: [
        "Tes données sont gardées sur des serveurs en France (Union européenne). La voix est traitée par les serveurs de Google. Ces transferts sont protégés par une connexion chiffrée et un accès limité.",
      ],
    },
    {
      title: "6. Combien de temps",
      text: [
        "Tant que ton compte existe. Si tu demandes la suppression, tes données sont effacées dans les 30 jours, sauf si la loi oblige à garder certaines informations.",
      ],
    },
    {
      title: "7. Sécurité",
      text: [
        "Connexion chiffrée (HTTPS), code secret brouillé, cloisonnement entre boutiques, accès limité aux serveurs.",
        "En cas de fuite de données, nous prévenons la Commission de protection des données personnelles (CDP) et les personnes concernées.",
      ],
    },
    {
      title: "8. Tes droits",
      text: [
        `Tu peux demander à voir tes données, les corriger, les supprimer ou t’opposer à leur utilisation : écris à ${CONTACT_EMAIL}. Nous répondons dans les 30 jours.`,
        "Tu peux aussi faire une réclamation auprès de la CDP (Commission de protection des données personnelles du Sénégal).",
      ],
    },
    {
      title: "9. Changements",
      text: ["Si ce texte change, tu seras prévenu dans l’application."],
    },
  ],
};

export const LEGAL_DOCS = [CONDITIONS, CONFIDENTIALITE];
