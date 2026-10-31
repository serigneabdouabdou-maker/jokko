import type { Product, Shop } from "../model";
import { ean13Modules, isValidEan13 } from "./barcode";
import { francs } from "./invoicePdf";

/**
 * Planche d'étiquettes en PDF : A4, 3 colonnes × 7 lignes (63,5 × 38,1 mm, planche autocollante type L7160).
 * Marche aussi sur papier normal : on découpe et on scotche. Le PDF s'imprime partout (cyber, imprimerie).
 */

export type LabelItem = { product: Product; retail: boolean; copies: number };

const GRID = { cols: 3, rows: 7, w: 63.5, h: 38.1, top: 15.15, left: 7.25, gapX: 2.5, gapY: 0 };

const safe = (s: string) =>
  s.replace(/[  ]/g, " ").replace(/ŋ/g, "ng").replace(/[’‘]/g, "'").replace(/[^\u0000-ÿ€]/g, "");

export function labelCount(items: LabelItem[]): number {
  return items.reduce((a, i) => a + Math.max(0, Math.floor(i.copies)), 0);
}

export async function labelsPdf(shop: Shop, items: LabelItem[]): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const perPage = GRID.cols * GRID.rows;
  let n = 0;
  for (const item of items) {
    const code = item.retail ? item.product.retail?.barcode : item.product.barcode;
    if (!code || !isValidEan13(code)) continue;
    const price = item.retail && item.product.retail ? item.product.retail.price : item.product.price;
    const unit = item.retail && item.product.retail ? item.product.retail.unit : item.product.unit;
    for (let c = 0; c < Math.floor(item.copies); c++) {
      if (n > 0 && n % perPage === 0) doc.addPage();
      const k = n % perPage;
      const x = GRID.left + (k % GRID.cols) * (GRID.w + GRID.gapX);
      const y = GRID.top + Math.floor(k / GRID.cols) * (GRID.h + GRID.gapY);
      drawLabel(doc, x, y, shop.name, item.product.name, unit, price, code);
      n++;
    }
  }
  if (n === 0) doc.text("Aucune étiquette.", 20, 20);
  return doc.output("blob");
}

type Doc = InstanceType<typeof import("jspdf").jsPDF>;

function drawLabel(doc: Doc, x: number, y: number, shopName: string, name: string, unit: string, price: number, code: string) {
  const pad = 3;
  // Cadre fin, utile pour découper sur papier normal
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.1);
  doc.rect(x + 0.6, y + 0.6, GRID.w - 1.2, GRID.h - 1.2);

  doc.setTextColor(110, 114, 124);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.text(safe(shopName).slice(0, 40), x + pad, y + pad + 2);

  doc.setTextColor(23, 25, 31);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(safe(name).slice(0, 28), x + pad, y + pad + 6.6);
  doc.setFontSize(11);
  doc.text(safe(`${francs(price)} / ${unit}`), x + GRID.w - pad, y + pad + 6.6, { align: "right" });

  // Code-barres EAN-13 : 95 modules de 0,33 mm, zones blanches de part et d'autre
  const m = 0.33;
  const bits = ean13Modules(code);
  const bx = x + (GRID.w - 95 * m) / 2;
  const by = y + 13;
  const bh = 16;
  const guard = new Set([0, 1, 2, 45, 46, 47, 48, 49, 92, 93, 94]);
  doc.setFillColor(0, 0, 0);
  for (let i = 0; i < 95; i++) {
    if (bits[i] === "1") doc.rect(bx + i * m, by, m, guard.has(i) ? bh + 1.6 : bh, "F");
  }
  doc.setFont("courier", "normal");
  doc.setFontSize(7.5);
  doc.text(`${code[0]}  ${code.slice(1, 7)}  ${code.slice(7)}`, x + GRID.w / 2, by + bh + 4, { align: "center" });
}

/** Partager le PDF (WhatsApp, impression…) ou le télécharger. */
export async function shareLabels(shop: Shop, items: LabelItem[]): Promise<string> {
  const blob = await labelsPdf(shop, items);
  const name = `Etiquettes-${safe(shop.name).replace(/[^A-Za-z0-9-]+/g, "-")}.pdf`;
  const file = new File([blob], name, { type: "application/pdf" });
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: "Étiquettes Jokko" });
      return "Étiquettes partagées.";
    } catch {
      return "Partage annulé.";
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return "Le PDF des étiquettes est téléchargé.";
}
