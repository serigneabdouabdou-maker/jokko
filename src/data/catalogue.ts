import { type Product, type Shop, uid } from "../model.ts";

/**
 * Catalogue Jokko : plats, jus et pains connus au Sénégal, avec une photo signée Jokko.
 * Le commerçant touche un plat, met SON prix, et c'est au menu. Photos dans le stockage public « vitrine »
 * (catalogue/<id>.jpg) : elles s'affichent aussi sur sa vitrine publique.
 * `prompt` (anglais) sert seulement à fabriquer la photo une fois (fonction accueil, action « plat »).
 */
export type CatalogueKind = "plat" | "jus" | "boulangerie";
export type CatalogueItem = { id: string; name: string; kind: CatalogueKind; unit: string; aliases?: string[]; prompt: string };

const PLAT = "Senegalese dish served on a beautiful ceramic plate, ";
const JUS = "Senegalese homemade juice in a clear glass bottle and a tall glass with ice, ";
const PAIN = "Fresh bakery product, ";

export const CATALOGUE: CatalogueItem[] = [
  { id: "ceebu-jen", name: "Ceebu jën", kind: "plat", unit: "plat", aliases: ["thiéboudienne", "thieb", "ceeb"], prompt: PLAT + "thieboudienne: red broken rice with a whole stuffed fish, cassava, carrot, cabbage, eggplant, pumpkin" },
  { id: "ceebu-yapp", name: "Ceebu yapp", kind: "plat", unit: "plat", aliases: ["thieb yapp"], prompt: PLAT + "ceebu yapp: brown rice with tender braised lamb pieces, onions and peas" },
  { id: "yassa-poulet", name: "Yassa poulet", kind: "plat", unit: "plat", aliases: ["yassa"], prompt: PLAT + "chicken yassa: grilled chicken with golden caramelized onion and lemon sauce, olives, white rice" },
  { id: "yassa-poisson", name: "Yassa poisson", kind: "plat", unit: "plat", prompt: PLAT + "fish yassa: grilled fish with lemon onion sauce and white rice" },
  { id: "mafe", name: "Mafé", kind: "plat", unit: "plat", aliases: ["maafe"], prompt: PLAT + "mafe: rich peanut sauce stew with beef, carrots and potatoes, served with white rice" },
  { id: "domoda", name: "Domoda", kind: "plat", unit: "plat", prompt: PLAT + "domoda: red tomato and peanut stew with meat and pumpkin, white rice" },
  { id: "thiou", name: "Thiou", kind: "plat", unit: "plat", aliases: ["ciw"], prompt: PLAT + "thiou: fish in a red tomato sauce with vegetables and white rice" },
  { id: "soupou-kandja", name: "Soupou kandja", kind: "plat", unit: "plat", aliases: ["soupe kandia"], prompt: PLAT + "soupou kandja: okra and palm oil sauce with fish and seafood, white rice" },
  { id: "caldou", name: "Caldou", kind: "plat", unit: "plat", prompt: PLAT + "caldou: fish in a light lemon and onion broth with white rice" },
  { id: "dibi", name: "Dibi", kind: "plat", unit: "portion", aliases: ["dibi agneau", "viande grillée"], prompt: "Senegalese dibi: grilled lamb pieces on brown paper with sliced onions, mustard and chili, " },
  { id: "dibi-hausa", name: "Dibi hausa", kind: "plat", unit: "portion", aliases: ["brochettes"], prompt: "Senegalese dibi hausa: spicy beef skewers with kankankan spice, sliced onions, " },
  { id: "poulet-braise", name: "Poulet braisé", kind: "plat", unit: "plat", prompt: PLAT + "braised grilled chicken with attieke or fries, onion sauce and salad" },
  { id: "poisson-braise", name: "Poisson braisé", kind: "plat", unit: "plat", prompt: PLAT + "whole grilled fish with attieke, onions, tomato and chili" },
  { id: "attieke-poisson", name: "Attiéké poisson", kind: "plat", unit: "plat", aliases: ["attieke"], prompt: PLAT + "attieke cassava couscous with fried fish, onion, tomato and chili sauce" },
  { id: "lakh", name: "Lakh", kind: "plat", unit: "bol", aliases: ["laax"], prompt: "Senegalese lakh: millet porridge with sweet curd (soow) in a bowl, " },
  { id: "thiakry", name: "Thiakry", kind: "plat", unit: "bol", aliases: ["cakri", "degué"], prompt: "Senegalese thiakry: millet couscous dessert with sweet creamy yogurt, raisins, in a glass bowl, " },
  { id: "ndambe", name: "Ndambé", kind: "plat", unit: "sandwich", aliases: ["sandwich haricot"], prompt: "Senegalese ndambe sandwich: baguette filled with spicy black-eyed pea stew, " },
  { id: "sandwich-viande", name: "Sandwich viande", kind: "plat", unit: "sandwich", prompt: "Senegalese street sandwich: baguette with grilled meat, onions, fries and sauce, " },
  { id: "chawarma", name: "Chawarma", kind: "plat", unit: "pièce", aliases: ["shawarma"], prompt: "Dakar chicken shawarma wrap with fries and garlic sauce, " },
  { id: "fataya", name: "Fataya", kind: "plat", unit: "pièce", prompt: "Senegalese fataya: golden fried meat turnovers with spicy tomato onion sauce, " },
  { id: "pastels", name: "Pastels", kind: "plat", unit: "pièce", prompt: "Senegalese pastels: small fried fish turnovers with spicy sauce, " },
  { id: "bissap", name: "Bissap", kind: "jus", unit: "bouteille", aliases: ["jus de bissap", "fleur d'hibiscus"], prompt: JUS + "deep red hibiscus bissap juice with mint leaves and dried hibiscus flowers" },
  { id: "bouye", name: "Bouye", kind: "jus", unit: "bouteille", aliases: ["pain de singe", "buy"], prompt: JUS + "creamy white baobab fruit bouye juice with baobab pods" },
  { id: "gingembre", name: "Gingembre", kind: "jus", unit: "bouteille", aliases: ["jinjar", "jus de gingembre"], prompt: JUS + "pale yellow fresh ginger juice with ginger root and lemon" },
  { id: "ditax", name: "Ditax", kind: "jus", unit: "bouteille", aliases: ["ditakh"], prompt: JUS + "green ditax (detarium) fruit juice with the green ditax fruits" },
  { id: "tamarin", name: "Tamarin", kind: "jus", unit: "bouteille", aliases: ["dakhar", "daqaar"], prompt: JUS + "brown tamarind juice with tamarind pods" },
  { id: "jus-mangue", name: "Jus de mangue", kind: "jus", unit: "bouteille", aliases: ["mango"], prompt: JUS + "thick orange mango juice with fresh mango slices" },
  { id: "cafe-touba", name: "Café Touba", kind: "jus", unit: "verre", aliases: ["kafe touba"], prompt: "Senegalese café Touba: spiced coffee with grains of selim served in a small glass, steam, " },
  { id: "ataya", name: "Ataya", kind: "jus", unit: "verre", aliases: ["thé", "attaya"], prompt: "Senegalese ataya green mint tea with foam in small glasses and a teapot, " },
  { id: "baguette", name: "Baguette", kind: "boulangerie", unit: "baguette", aliases: ["pain"], prompt: PAIN + "golden crusty French baguettes in a wicker basket" },
  { id: "tapalapa", name: "Tapalapa", kind: "boulangerie", unit: "pain", aliases: ["pain tapalapa"], prompt: PAIN + "Senegalese tapalapa bread, dense rustic short loaves" },
  { id: "pain-mie", name: "Pain de mie", kind: "boulangerie", unit: "pièce", prompt: PAIN + "soft sliced white sandwich bread loaf" },
  { id: "croissant", name: "Croissant", kind: "boulangerie", unit: "pièce", prompt: PAIN + "golden flaky butter croissants" },
  { id: "pain-chocolat", name: "Pain au chocolat", kind: "boulangerie", unit: "pièce", prompt: PAIN + "golden pain au chocolat pastries" },
  { id: "beignets", name: "Beignets", kind: "boulangerie", unit: "pièce", aliases: ["botokoin", "pain sucré"], prompt: PAIN + "round golden sugar-dusted beignets (fried dough balls)" },
  { id: "cake", name: "Cake", kind: "boulangerie", unit: "pièce", aliases: ["gâteau"], prompt: PAIN + "sliced golden pound cake" },
];

/** Où la photo d'un plat du catalogue est rangée (stockage public « vitrine »). */
export const cataloguePath = (id: string) => `catalogue/${id}.jpg`;

/** Ce qu'un métier voit dans le catalogue : plats et jus au restaurant, pains et pâtisseries à la boulangerie. */
export function catalogueFor(metierId: string): CatalogueItem[] {
  if (metierId === "boulangerie") return CATALOGUE.filter((c) => c.kind === "boulangerie");
  return CATALOGUE.filter((c) => c.kind !== "boulangerie");
}

/** Déjà au menu ? (même nom, sans accents ni majuscules) */
const key = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
export const onMenu = (shop: Pick<Shop, "products">, item: CatalogueItem) => shop.products.some((p) => key(p.name) === key(item.name));

/** Met un plat du catalogue au menu : SON prix, la photo Jokko, les autres noms (wolof) pour que Jokko le reconnaisse à la voix. */
export function addFromCatalogue(shop: Shop, item: CatalogueItem, price: number, id = uid("p")): Shop {
  const product: Product = {
    id, name: item.name, unit: item.unit, stock: 0, min: 0, price: Math.max(0, Math.round(price)),
    photoPath: cataloguePath(item.id), vitrine: true,
    ...(item.aliases?.length ? { aliases: item.aliases } : {}),
  };
  return { ...shop, products: [...shop.products, product] };
}
