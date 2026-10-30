import { type Product, type Shop, uid } from "../model";

/**
 * Import du stock en une fois : fichier Excel (.xlsx), fichier CSV, ou liste collée
 * (depuis Excel, WhatsApp, un carnet recopié…). On reconnaît les colonnes par leur titre.
 */

export type ImportItem = {
  name: string;
  unit: string;
  quantity: number;
  /** Prix de vente d'une unité de gros */
  price: number | null;
  min: number | null;
  /** Prix d'achat d'une unité de gros */
  cost?: number | null;
  /** Vente au détail : unité, nombre par unité de gros, prix */
  retailUnit?: string | null;
  retailPerUnit?: number | null;
  retailPrice?: number | null;
};
export type ImportLine = ImportItem & { status: "nouveau" | "mis à jour"; productId?: string };
export type Parsed = { items: ImportItem[]; errors: string[] };

export type Cell = string | number | boolean | Date | null | undefined;

type Column = "name" | "unit" | "quantity" | "price" | "min" | "cost" | "retailUnit" | "retailPerUnit" | "retailPrice";

const HEADERS: Record<Column, RegExp> = {
  name: /^(article|produit|produits|nom|designation|désignation|libelle|libellé|item|marchandise)s?$/,
  unit: /^(unite|unité|unites|unités|unit|conditionnement|mesure|unite gros|unité gros|unité de gros)$/,
  quantity: /^(quantite|quantité|qte|qté|qty|stock|nombre|nb|en stock)$/,
  // Au Sénégal, « prix gros » = prix de vente en gros (le prix d'achat s'écrit « prix d'achat »).
  price: /^(prix|prix de vente|prix unitaire|pu|p\.u\.|tarif|prix vente|vente|pv|prix gros|prix en gros|prix vente gros|prix de vente gros|prix de vente en gros)$/,
  min: /^(seuil|minimum|min|alerte|stock minimum|seuil d'alerte)$/,
  cost: /^(prix d' ?achat|prix achat|achat|pa|p\.a\.|cout|coût|cout d'achat|coût d'achat|prix de revient)$/,
  retailUnit: /^(unite detail|unité détail|unité de détail|unite de detail|detail|détail)$/,
  retailPerUnit: /^(nb par unite|nb par unité|nombre par unite|nombre par unité|par unite|par unité|contenance|nb detail|nb détail)$/,
  retailPrice: /^(prix detail|prix détail|prix de detail|prix de détail|prix au detail|prix au détail)$/,
};

const norm = (v: Cell) => (v === null || v === undefined ? "" : String(v)).trim();
const head = (v: Cell) => norm(v).toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, " ").replace(/[:*]/g, "").trim();

function num(v: Cell): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = norm(v).replace(/[\s  ]/g, "").replace(/f(cfa)?$/i, "");
  if (!s) return null;
  const n = Number(/^\d{1,3}([.,]\d{3})+$/.test(s) ? s.replace(/[.,]/g, "") : s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Tableau de cellules (lignes d'Excel ou de CSV) → articles. */
export function parseRows(rows: Cell[][]): Parsed {
  const errors: string[] = [];
  const filled = rows.filter((r) => r.some((c) => norm(c) !== ""));
  if (!filled.length) return { items: [], errors: ["Le fichier est vide."] };

  // Colonnes : d'après les titres de la première ligne, sinon ordre Article, Quantité, Prix, Unité, Seuil.
  const first = filled[0].map(head);
  const col: Partial<Record<Column, number>> = {};
  for (const key of Object.keys(HEADERS) as Column[]) {
    const i = first.findIndex((h) => HEADERS[key].test(h));
    if (i >= 0) col[key] = i;
  }
  const hasHeader = col.name !== undefined;
  if (!hasHeader) Object.assign(col, { name: 0, quantity: 1, price: 2, unit: 3, min: 4 });

  const items: ImportItem[] = [];
  const seen = new Map<string, number>();
  filled.slice(hasHeader ? 1 : 0).forEach((row, index) => {
    const line = index + (hasHeader ? 2 : 1);
    const name = norm(row[col.name ?? 0]).replace(/\s+/g, " ");
    if (!name) return;
    const quantity = col.quantity !== undefined ? num(row[col.quantity]) : 0;
    if (quantity === null || quantity < 0) {
      errors.push(`Ligne ${line} (${name}) : quantité illisible, ligne ignorée.`);
      return;
    }
    const price = col.price !== undefined ? num(row[col.price]) : null;
    const min = col.min !== undefined ? num(row[col.min]) : null;
    const unit = col.unit !== undefined ? norm(row[col.unit]) : "";
    const item: ImportItem = { name, unit: unit || "pièce", quantity, price: price !== null && price >= 0 ? Math.round(price) : null, min: min !== null && min >= 0 ? min : null };
    if (col.cost !== undefined) {
      const cost = num(row[col.cost]);
      if (cost !== null && cost >= 0) item.cost = Math.round(cost);
    }
    if (col.retailUnit !== undefined || col.retailPerUnit !== undefined || col.retailPrice !== undefined) {
      const retailUnit = col.retailUnit !== undefined ? norm(row[col.retailUnit]) : "";
      const perUnit = col.retailPerUnit !== undefined ? num(row[col.retailPerUnit]) : null;
      const retailPrice = col.retailPrice !== undefined ? num(row[col.retailPrice]) : null;
      if (retailUnit && perUnit && perUnit > 0 && retailPrice !== null && retailPrice >= 0) {
        item.retailUnit = retailUnit;
        item.retailPerUnit = perUnit;
        item.retailPrice = Math.round(retailPrice);
      }
    }
    const key = name.toLowerCase();
    // Même article deux fois dans le fichier : on additionne les quantités.
    if (seen.has(key)) {
      const prev = items[seen.get(key)!];
      prev.quantity += quantity;
      if (item.price !== null) prev.price = item.price;
      if (item.cost !== undefined) prev.cost = item.cost;
      if (item.retailUnit) Object.assign(prev, { retailUnit: item.retailUnit, retailPerUnit: item.retailPerUnit, retailPrice: item.retailPrice });
    } else {
      seen.set(key, items.length);
      items.push(item);
    }
  });
  if (!items.length && !errors.length) errors.push("Aucun article trouvé. Vérifie que la première colonne contient les noms d'articles.");
  return { items, errors };
}

/** Texte collé ou fichier CSV → lignes de cellules (séparateur ; , tabulation ou « - »). */
export function textToRows(text: string): Cell[][] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines.map((line) => {
    // Séparateur choisi ligne par ligne : une liste collée peut mélanger les formats.
    const sep = line.includes("\t") ? "\t" : line.includes(";") ? ";" : /,\s*\d/.test(line) || line.split(",").length > 2 ? "," : null;
    if (sep) return line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
    // « Riz 12 sac 18000 » ou « Riz - 12 - 18000 » : nom puis nombres
    const parts = line.split(/\s+-\s+|\s+/);
    const firstNumber = parts.findIndex((p) => /^\d/.test(p));
    if (firstNumber <= 0) return [line];
    const name = parts.slice(0, firstNumber).join(" ");
    const rest = parts.slice(firstNumber);
    const numbers = rest.filter((p) => /^\d/.test(p));
    const unit = rest.find((p) => !/^\d/.test(p)) ?? "";
    return [name, numbers[0] ?? "", numbers[1] ?? "", unit];
  });
}

const key = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/** Aperçu : quels articles seront créés, lesquels mis à jour. */
export function previewImport(shop: Shop, items: ImportItem[]): ImportLine[] {
  return items.map((item) => {
    const existing = shop.products.find((p) => key(p.name) === key(item.name));
    return existing ? { ...item, status: "mis à jour", productId: existing.id } : { ...item, status: "nouveau" };
  });
}

/**
 * Applique l'import. mode « remplacer » : le stock devient la quantité du fichier (inventaire).
 * mode « ajouter » : la quantité s'ajoute au stock (réapprovisionnement).
 */
export function applyImport(shop: Shop, lines: ImportLine[], mode: "remplacer" | "ajouter"): Shop {
  const products: Product[] = shop.products.map((p) => {
    const line = lines.find((l) => l.productId === p.id);
    if (!line) return p;
    return withPrices(
      {
        ...p,
        stock: mode === "ajouter" ? p.stock + line.quantity : line.quantity,
        price: line.price ?? p.price,
        min: line.min ?? p.min,
        unit: line.unit && line.unit !== "pièce" ? line.unit : p.unit,
      },
      line,
    );
  });
  for (const line of lines.filter((l) => l.status === "nouveau")) {
    products.push(withPrices({ id: uid("p"), name: line.name, unit: line.unit || "pièce", stock: line.quantity, min: line.min ?? 2, price: line.price ?? 0 }, line));
  }
  return { ...shop, products };
}

/** Prix d'achat et vente au détail venant du fichier (ceux déjà connus restent si la colonne est vide). */
function withPrices(p: Product, line: ImportItem): Product {
  const out = { ...p };
  if (line.cost !== undefined && line.cost !== null) out.cost = line.cost;
  if (line.retailUnit && line.retailPerUnit && line.retailPrice !== undefined && line.retailPrice !== null) {
    out.retail = { unit: line.retailUnit, perUnit: line.retailPerUnit, price: line.retailPrice };
  }
  return out;
}

/** Modèle à remplir dans Excel (CSV avec « ; », s'ouvre directement dans Excel). */
export function templateCsv(): string {
  return "\uFEFF" + [
    "Article;Unité;Quantité;Prix d'achat;Prix de vente;Seuil;Unité détail;Nb par unité;Prix détail",
    "Riz brisé;sac;12;16000;18000;4;kilo;50;400",
    "Huile;bidon;10;6500;7500;5;;;",
    "Lait en poudre;sac;2;30000;40000;1;sachet;50;900",
    "Sucre;kg;40;600;700;10;;;",
  ].join("\r\n");
}
