/**
 * Livre de phrases de Jokko en wolof : les SEULES phrases toutes faites qu'il a le droit de dire.
 * Orthographe officielle du wolof (décret 2005-992, CLAD). Chaque phrase porte son statut :
 * "valide" = vérifiée par un locuteur natif ; "a_valider" = en attente de vérification.
 * Les 14 premières phrases ont été validées par le patron de Jokko le 31/10/2026 ; les 4 dernières viennent
 * de la présentation audio de la page d'accueil, validée le 31/10/2026 (« aucune faute, très naturel »).
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
  // --- Proposées le 01/11/2026 (vocabulaire recoupé dans plusieurs sources), À FAIRE VALIDER par un locuteur natif ---
  { situation: "vente notée avec montant", wo: "Bind naa ko : {montant}.", fr: "Je l'ai noté : {montant}.", statut: "a_valider" },
  { situation: "total", wo: "Lépp, {montant} la.", fr: "En tout, c'est {montant}.", statut: "a_valider" },
  { situation: "prix d'un article", wo: "Benn bi, {montant} la.", fr: "L'unité, c'est {montant}.", statut: "a_valider" },
  { situation: "paiement reçu", wo: "{client} fey na {montant}.", fr: "{client} a payé {montant}.", statut: "a_valider" },
  { situation: "reste de dette", wo: "{client}, bor bi des na {montant}.", fr: "{client} : il reste {montant} de dette.", statut: "a_valider" },
  { situation: "dette soldée", wo: "{client} fey na bor bi lépp.", fr: "{client} a payé toute sa dette.", statut: "a_valider" },
  { situation: "stock épuisé", wo: "{article} bi jeex na.", fr: "{article} : c'est fini.", statut: "a_valider" },
  { situation: "conseil de racheter", wo: "War nga jëndaat {article}.", fr: "Tu dois racheter du {article}.", statut: "a_valider" },
  { situation: "stock ajouté", wo: "Yokk naa {quantité} {article} ci stock bi.", fr: "J'ai ajouté {quantité} {article} au stock.", statut: "a_valider" },
  { situation: "article introuvable", wo: "Gisuma {article} ci sa stock.", fr: "Je ne vois pas {article} dans ton stock.", statut: "a_valider" },
  { situation: "dépense notée", wo: "Bind naa depaans bi : {montant}.", fr: "J'ai noté la dépense : {montant}.", statut: "a_valider" },
  { situation: "caisse juste", wo: "Caisse bi jub na.", fr: "La caisse est juste.", statut: "a_valider" },
  { situation: "caisse qui manque", wo: "{montant} ñàkk na ci caisse bi.", fr: "Il manque {montant} dans la caisse.", statut: "a_valider" },
  { situation: "caisse en trop", wo: "Caisse bi ëpp na {montant}.", fr: "La caisse a {montant} de trop.", statut: "a_valider" },
  { situation: "ventes du jour", wo: "Tey, jaay nga {montant}.", fr: "Aujourd'hui, tu as vendu pour {montant}.", statut: "a_valider" },
  { situation: "bonne journée de ventes", wo: "Tey, jaay bi baax na.", fr: "Aujourd'hui, les ventes ont été bonnes.", statut: "a_valider" },
  { situation: "facture envoyée", wo: "Yónnee naa {client} fakteer bi.", fr: "J'ai envoyé la facture à {client}.", statut: "a_valider" },
  { situation: "rappel envoyé", wo: "Fàttali naa ko ci WhatsApp.", fr: "Je le lui ai rappelé sur WhatsApp.", statut: "a_valider" },
  { situation: "paiement Wave reçu", wo: "Wave bi ñëw na : {montant}.", fr: "Le Wave est arrivé : {montant}.", statut: "a_valider" },
  { situation: "réservé au patron", wo: "Patron bi rekk a ko mën a def.", fr: "Seul le patron peut le faire.", statut: "a_valider" },
  { situation: "nouveau client", wo: "Yokk naa {client} ci sa kiliyaan yi.", fr: "J'ai ajouté {client} à tes clients.", statut: "a_valider" },
  { situation: "patienter", wo: "Xaaral tuuti.", fr: "Attends un peu.", statut: "a_valider" },
  { situation: "pas bien entendu", wo: "Dégguma bu baax.", fr: "Je n'ai pas bien entendu.", statut: "a_valider" },
  { situation: "rapprocher le téléphone", wo: "Jegeel sa telefoon, dégguma bu baax.", fr: "Approche ton téléphone, je n'entends pas bien.", statut: "a_valider" },
  { situation: "vérifier", wo: "Noonu la ?", fr: "C'est bien ça ?", statut: "a_valider" },
  { situation: "remercier", wo: "Jërëjëf !", fr: "Merci !", statut: "a_valider" },
  { situation: "répondre à un merci", wo: "Ñoo ko bokk.", fr: "De rien (c'est partagé).", statut: "a_valider" },
  { situation: "à demain", wo: "Ba ëllëg !", fr: "À demain !", statut: "a_valider" },
  { situation: "bonne nuit", wo: "Fanaanal ak jàmm.", fr: "Bonne nuit, en paix.", statut: "a_valider" },
  { situation: "hors connexion", wo: "Amul réseau, waaye bind naa ko.", fr: "Il n'y a pas de réseau, mais je l'ai noté.", statut: "a_valider" },
];

/** Bloc à mettre dans les consignes de Jokko. */
export function phrasebookInstruction(): string {
  // Seules les phrases validées par un locuteur natif vont dans les consignes de Jokko.
  const lines = WOLOF_PHRASES.filter((p) => p.statut === "valide").map((p) => `- ${p.situation} : « ${p.wo} »`).join("\n");
  return `Livre de phrases wolof (à dire TELLES QUELLES, mot pour mot ; {…} = à remplacer par la valeur, les montants venant des outils) :
${lines}
- Pour ces situations, n'invente jamais une autre tournure. Pour le reste, fais des phrases très courtes avec des mots simples.`;
}
