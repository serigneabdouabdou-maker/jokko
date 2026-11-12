import type { Shop } from "../model.ts";
import { metierOf, type MetierId } from "./metiers.ts";

/**
 * Premiers pas (12/11/2026) : sur 15 boutiques inscrites, 5 seulement avaient noté une vente et 2 étaient revenues
 * un autre jour. La carte « Premiers pas » de l'écran Parler montre au nouveau patron les 4 ou 5 gestes qui font
 * qu'on garde Jokko : choisir son métier, dire une vente, mettre ses articles, noter un client, recevoir le rappel du soir.
 */

export type StepId = "metier" | "vente" | "articles" | "client" | "rappel";
export type Step = { id: StepId; title: string; hint: string; done: boolean };

/** Une phrase de vente qui parle au métier (jamais l'exemple d'un autre métier). */
const SALE_EXAMPLE: Record<MetierId, string> = {
  alimentation: "« Vends 2 sacs de riz à 18 000 » ou « Jaay naa 2 bidon diw »",
  reparation: "« Awa dépose un iPhone 11, écran cassé »",
  pharmacie: "« Vends 2 boîtes de paracétamol »",
  quincaillerie: "« Vends 5 sacs de ciment »",
  couture: "« Commande d'Awa : grand boubou, 25 000, avance 10 000 »",
  vetements: "« Vends 2 pantalons à 7 500 »",
  restauration: "« J'ai vendu 2 yassa et 3 bissap »",
  boulangerie: "« Vends 20 baguettes »",
  multiservice: "« 50 photocopies à 25 »",
  autre: "« Ajoute une vente de 15 000 »",
};

export function firstSteps(
  shop: Pick<Shop, "activity" | "sales" | "products" | "clients" | "repairs" | "couture">,
  notifications: boolean,
): Step[] {
  const metier = metierOf(shop.activity);
  const sold = shop.sales.length > 0 || (shop.repairs?.length ?? 0) > 0 || (shop.couture?.length ?? 0) > 0;
  const steps: Step[] = [];
  if (metier.id === "autre") {
    steps.push({ id: "metier", title: "Choisis ton métier", hint: "Jokko se règle sur ton métier : écrans, exemples et mots qu'il comprend.", done: false });
  }
  steps.push(
    { id: "vente", title: metier.id === "couture" ? "Dis ta première commande" : "Dis ta première vente", hint: `Touche le micro et dis : ${SALE_EXAMPLE[metier.id]}`, done: sold },
    { id: "articles", title: "Mets tes articles", hint: `Dis tout ce que tu as, d'un coup : ${metier.ex.stock}`, done: shop.products.length >= 3 },
    { id: "client", title: "Note un client ou une dette", hint: "Dis : « Moussa me doit 2 000 » ou « Awa a pris 1 sac de sucre à crédit »", done: shop.clients.length > 0 },
    { id: "rappel", title: "Reçois le résumé du soir", hint: "Chaque soir à 20 h, Jokko t'envoie tes ventes et ton bénéfice du jour.", done: notifications },
  );
  return steps;
}

/** La carte reste tant qu'il reste un geste à faire (et que le patron ne l'a pas fermée). */
export const stepsLeft = (steps: Step[]) => steps.filter((s) => !s.done).length;
