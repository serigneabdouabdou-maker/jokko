import type { ShopContext } from "./schema.ts";

export const shopContext: ShopContext = {
  language: "fr",
  products: [
    { id: "p-riz", name: "Riz brisé", unit: "sac", stock: 12, min: 4, price: 18000 },
    { id: "p-huile", name: "Huile", unit: "bidon", stock: 3, min: 5, price: 7500 },
    { id: "p-sucre", name: "Sucre", unit: "kg", stock: 40, min: 10, price: 700 },
    { id: "p-lait", name: "Lait", unit: "pièce", stock: 8, min: 6, price: 900 },
  ],
  clients: [
    { id: "c-awa", name: "Awa Diop", debt: 0 },
    { id: "c-moussa", name: "Moussa Ndiaye", debt: 20000 },
    { id: "c-fatou", name: "Fatou Sall", debt: 8500 },
  ],
  figures: { openingCash: 20000, daySales: 18000, dayExpenses: 2500, expectedCash: 35500 },
};
