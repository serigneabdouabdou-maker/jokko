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
];

/** Bloc à mettre dans les consignes de Jokko. */
export function phrasebookInstruction(): string {
  const lines = WOLOF_PHRASES.map((p) => `- ${p.situation} : « ${p.wo} »`).join("\n");
  return `Livre de phrases wolof (à dire TELLES QUELLES, mot pour mot ; {…} = à remplacer par la valeur, les montants venant des outils) :
${lines}
- Pour ces situations, n'invente jamais une autre tournure. Pour le reste, fais des phrases très courtes avec des mots simples.`;
}
