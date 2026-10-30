/**
 * Livre de phrases de Jokko en wolof : les SEULES phrases toutes faites qu'il a le droit de dire.
 * Orthographe officielle du wolof (décret 2005-992, CLAD). Chaque phrase porte son statut :
 * "valide" = vérifiée par un locuteur natif ; "a_valider" = en attente de vérification.
 * Pour corriger une phrase : changer `wo`, puis passer `statut` à "valide".
 */
export type Phrase = { situation: string; wo: string; fr: string; statut: "valide" | "a_valider" };

export const WOLOF_PHRASES: Phrase[] = [
  { situation: "faire répéter", wo: "Baal ma, waxaat ko.", fr: "Pardon, redis-le.", statut: "a_valider" },
  { situation: "montant pas clair", wo: "Baal ma, ñaata la ?", fr: "Pardon, c'est combien ?", statut: "a_valider" },
  { situation: "quel article", wo: "Ban produit ?", fr: "Quel article ?", statut: "a_valider" },
  { situation: "quelle quantité", wo: "Ñaata ?", fr: "Combien ?", statut: "a_valider" },
  { situation: "quel client", wo: "Kan la ?", fr: "C'est qui ?", statut: "a_valider" },
  { situation: "écriture enregistrée", wo: "Bind naa ko.", fr: "Je l'ai noté.", statut: "a_valider" },
  { situation: "écriture annulée", wo: "Dindi naa ko.", fr: "Je l'ai enlevé.", statut: "a_valider" },
  { situation: "rien à annuler", wo: "Amul dara lu ma war a dindi.", fr: "Il n'y a rien à enlever.", statut: "a_valider" },
  { situation: "stock bas (article)", wo: "{article} bi dafa néew.", fr: "{article} : il en reste peu.", statut: "a_valider" },
  { situation: "stock restant", wo: "{article} bi, {nombre} la des.", fr: "{article} : il en reste {nombre}.", statut: "a_valider" },
  { situation: "dette d'un client", wo: "{client} dafa la bor {montant}.", fr: "{client} te doit {montant}.", statut: "a_valider" },
  { situation: "caisse attendue", wo: "Caisse bi, {montant} la.", fr: "La caisse : {montant}.", statut: "a_valider" },
  { situation: "j'écoute", wo: "Maa ngi lay déglu.", fr: "Je t'écoute.", statut: "a_valider" },
  { situation: "oui", wo: "Waaw.", fr: "Oui.", statut: "a_valider" },
  { situation: "non", wo: "Déedéet.", fr: "Non.", statut: "a_valider" },
];

/** Bloc à mettre dans les consignes de Jokko. */
export function phrasebookInstruction(): string {
  const lines = WOLOF_PHRASES.map((p) => `- ${p.situation} : « ${p.wo} »`).join("\n");
  return `Livre de phrases wolof (à dire TELLES QUELLES, mot pour mot ; {…} = à remplacer par la valeur, les montants venant des outils) :
${lines}
- Pour ces situations, n'invente jamais une autre tournure. Pour le reste, fais des phrases très courtes avec des mots simples.`;
}
