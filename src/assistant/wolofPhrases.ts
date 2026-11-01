/**
 * Livre de phrases de Jokko en wolof : les SEULES phrases toutes faites qu'il a le droit de dire.
 * Orthographe officielle du wolof (décret 2005-992, CLAD). Chaque phrase porte son statut :
 * "valide" = vérifiée par un locuteur natif ; "a_valider" = en attente de vérification.
 * Les 14 premières phrases ont été validées par le patron de Jokko le 31/10/2026 ; les 4 dernières viennent
 * de la présentation audio de la page d'accueil, validée le 31/10/2026 (« aucune faute, très naturel »).
 * Les 30 phrases du commerce ont été validées par le patron le 01/11/2026 (« tout est correct »).
 * Pour corriger une phrase : changer `wo`, puis passer `statut` à "valide".
 */
export type Phrase = { situation: string; wo: string; fr: string; statut: "valide" | "a_valider" };

export const WOLOF_PHRASES: Phrase[] = [
  { situation: "faire répéter", wo: "Baal ma, waxaat ko.", fr: "Pardon, redis-le.", statut: "valide" },
  { situation: "montant pas clair", wo: "Baal ma, ñaata la ?", fr: "Pardon, c'est combien ?", statut: "valide" },
  { situation: "quel article", wo: "Ban produit ?", fr: "Quel article ?", statut: "valide" },
  { situation: "quelle quantité", wo: "Ñaata ?", fr: "Combien ?", statut: "valide" },
  { situation: "quel client", wo: "Kan la ?", fr: "C'est qui ?", statut: "valide" },
  { situation: "écriture enregistrée", wo: "Bind naa ko.", fr: "Je l'ai noté.", statut: "valide" },
  { situation: "écriture annulée", wo: "Dindi naa ko.", fr: "Je l'ai enlevé.", statut: "valide" },
  { situation: "rien à annuler", wo: "Amul dara lu ma war a dindi.", fr: "Il n'y a rien à enlever.", statut: "valide" },
  { situation: "stock bas (article)", wo: "{article} bi dafa néew.", fr: "{article} : il en reste peu.", statut: "valide" },
  { situation: "stock restant", wo: "{article} bi, {nombre} la des.", fr: "{article} : il en reste {nombre}.", statut: "valide" },
  { situation: "dette d'un client", wo: "{client} dafa la bor {montant}.", fr: "{client} te doit {montant}.", statut: "valide" },
  { situation: "caisse attendue", wo: "Caisse bi, {montant} la.", fr: "La caisse : {montant}.", statut: "valide" },
  { situation: "j'écoute", wo: "Maa ngi lay déglu.", fr: "Je t'écoute.", statut: "valide" },
  { situation: "oui", wo: "Waaw.", fr: "Oui.", statut: "valide" },
  { situation: "non", wo: "Déedéet.", fr: "Non.", statut: "valide" },
  { situation: "saluer", wo: "Asalaa maalekum !", fr: "Bonjour !", statut: "valide" },
  { situation: "se présenter", wo: "Maa ngi tudd Jokko. Maay sa ndimbal ci sa bitig.", fr: "Je m'appelle Jokko. Je suis ton aide dans ta boutique.", statut: "valide" },
  { situation: "inviter à parler", wo: "Waxal rekk, ni nga koy waxe.", fr: "Parle simplement, comme tu parles.", statut: "valide" },
  { situation: "commencer", wo: "Kaay, ñu tàmbali !", fr: "Viens, on commence !", statut: "valide" },
  // --- Phrases du commerce : vocabulaire recoupé dans plusieurs sources, validées par le patron de Jokko le 01/11/2026 ---
  { situation: "vente notée avec montant", wo: "Bind naa ko : {montant}.", fr: "Je l'ai noté : {montant}.", statut: "valide" },
  { situation: "total", wo: "Lépp, {montant} la.", fr: "En tout, c'est {montant}.", statut: "valide" },
  { situation: "prix d'un article", wo: "Benn bi, {montant} la.", fr: "L'unité, c'est {montant}.", statut: "valide" },
  { situation: "paiement reçu", wo: "{client} fey na {montant}.", fr: "{client} a payé {montant}.", statut: "valide" },
  { situation: "reste de dette", wo: "{client}, bor bi des na {montant}.", fr: "{client} : il reste {montant} de dette.", statut: "valide" },
  { situation: "dette soldée", wo: "{client} fey na bor bi lépp.", fr: "{client} a payé toute sa dette.", statut: "valide" },
  { situation: "stock épuisé", wo: "{article} bi jeex na.", fr: "{article} : c'est fini.", statut: "valide" },
  { situation: "conseil de racheter", wo: "War nga jëndaat {article}.", fr: "Tu dois racheter du {article}.", statut: "valide" },
  { situation: "stock ajouté", wo: "Yokk naa {quantité} {article} ci stock bi.", fr: "J'ai ajouté {quantité} {article} au stock.", statut: "valide" },
  { situation: "article introuvable", wo: "Gisuma {article} ci sa stock.", fr: "Je ne vois pas {article} dans ton stock.", statut: "valide" },
  { situation: "dépense notée", wo: "Bind naa depaans bi : {montant}.", fr: "J'ai noté la dépense : {montant}.", statut: "valide" },
  { situation: "caisse juste", wo: "Caisse bi jub na.", fr: "La caisse est juste.", statut: "valide" },
  { situation: "caisse qui manque", wo: "{montant} ñàkk na ci caisse bi.", fr: "Il manque {montant} dans la caisse.", statut: "valide" },
  { situation: "caisse en trop", wo: "Caisse bi ëpp na {montant}.", fr: "La caisse a {montant} de trop.", statut: "valide" },
  { situation: "ventes du jour", wo: "Tey, jaay nga {montant}.", fr: "Aujourd'hui, tu as vendu pour {montant}.", statut: "valide" },
  { situation: "bonne journée de ventes", wo: "Tey, jaay bi baax na.", fr: "Aujourd'hui, les ventes ont été bonnes.", statut: "valide" },
  { situation: "facture envoyée", wo: "Yónnee naa {client} fakteer bi.", fr: "J'ai envoyé la facture à {client}.", statut: "valide" },
  { situation: "rappel envoyé", wo: "Fàttali naa ko ci WhatsApp.", fr: "Je le lui ai rappelé sur WhatsApp.", statut: "valide" },
  { situation: "paiement Wave reçu", wo: "Wave bi ñëw na : {montant}.", fr: "Le Wave est arrivé : {montant}.", statut: "valide" },
  { situation: "réservé au patron", wo: "Patron bi rekk a ko mën a def.", fr: "Seul le patron peut le faire.", statut: "valide" },
  { situation: "nouveau client", wo: "Yokk naa {client} ci sa kiliyaan yi.", fr: "J'ai ajouté {client} à tes clients.", statut: "valide" },
  { situation: "patienter", wo: "Xaaral tuuti.", fr: "Attends un peu.", statut: "valide" },
  { situation: "pas bien entendu", wo: "Dégguma bu baax.", fr: "Je n'ai pas bien entendu.", statut: "valide" },
  { situation: "demander de parler plus près", wo: "Jegeel sa telefoon, dégguma bu baax.", fr: "Approche ton téléphone, je n'entends pas bien.", statut: "valide" },
  { situation: "vérifier", wo: "Noonu la ?", fr: "C'est bien ça ?", statut: "valide" },
  { situation: "remercier", wo: "Jërëjëf !", fr: "Merci !", statut: "valide" },
  { situation: "répondre à un merci", wo: "Ñoo ko bokk.", fr: "De rien (c'est partagé).", statut: "valide" },
  { situation: "à demain", wo: "Ba ëllëg !", fr: "À demain !", statut: "valide" },
  { situation: "bonne nuit", wo: "Fanaanal ak jàmm.", fr: "Bonne nuit, en paix.", statut: "valide" },
  { situation: "hors connexion", wo: "Amul réseau, waaye bind naa ko.", fr: "Il n'y a pas de réseau, mais je l'ai noté.", statut: "valide" },
];

/** Bloc à mettre dans les consignes de Jokko. */
export function phrasebookInstruction(): string {
  // Seules les phrases validées par un locuteur natif vont dans les consignes de Jokko.
  const lines = WOLOF_PHRASES.filter((p) => p.statut === "valide").map((p) => `- ${p.situation} : « ${p.wo} »`).join("\n");
  return `Livre de phrases wolof (à dire TELLES QUELLES, mot pour mot ; {…} = à remplacer par la valeur, les montants venant des outils) :
${lines}
- Pour ces situations, n'invente jamais une autre tournure. Pour le reste, fais des phrases très courtes avec des mots simples.`;
}
