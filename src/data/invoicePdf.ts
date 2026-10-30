import type { Client, Invoice, InvoiceLine, Shop } from "../model";

/**
 * Facture PDF moderne, aux couleurs de Jokko, avec l'en-tête de la boutique.
 * jsPDF est chargé seulement quand on crée une facture (l'appli reste légère).
 */

/** Montant lisible dans un PDF : espaces normaux (les polices du PDF n'ont pas l'espace fine). */
export function francs(n: number): string {
  return `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} F`;
}

const qtyText = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100).replace(".", ","));
const dateText = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });

/** Les polices standard du PDF ne savent écrire que le latin courant : on remplace le reste. */
const safe = (s: string) =>
  s
    .replace(/[  ]/g, " ")
    .replace(/ŋ/g, "ng")
    .replace(/Ŋ/g, "NG")
    .replace(/[’‘]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/[^\u0000-ÿ€]/g, "");

export type InvoiceDoc = { shop: Shop; client?: Client; invoice: Invoice };

export function invoiceLines(invoice: Invoice): InvoiceLine[] {
  return invoice.lines?.length ? invoice.lines : [{ label: "Marchandises", qty: 1, unit: "", unitPrice: invoice.amount }];
}

export function invoiceFileName(invoice: Invoice): string {
  return `Facture-${invoice.number}.pdf`;
}

const INK: [number, number, number] = [23, 25, 31];
const YELLOW: [number, number, number] = [246, 184, 0];
const SOFT: [number, number, number] = [255, 246, 214];
const GREY: [number, number, number] = [110, 114, 124];
const LINE: [number, number, number] = [228, 226, 218];
const GREEN: [number, number, number] = [22, 128, 74];

export async function invoicePdf({ shop, client, invoice }: InvoiceDoc): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const M = 16;
  let y = 0;

  // Bande de couleur
  doc.setFillColor(...YELLOW);
  doc.rect(0, 0, W, 6, "F");

  // Boutique : pastille avec l'initiale + nom
  y = 22;
  doc.setFillColor(...INK);
  doc.roundedRect(M, y - 9, 14, 14, 3, 3, "F");
  doc.setTextColor(...YELLOW);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(safe(shop.name.trim().charAt(0).toUpperCase() || "J"), M + 7, y + 0.6, { align: "center" });

  doc.setTextColor(...INK);
  doc.setFontSize(17);
  doc.text(safe(shop.name), M + 19, y - 2.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GREY);
  const shopLines = [
    [shop.activity, shop.city].filter(Boolean).join(" · "),
    shop.address ?? "",
    shop.phone ? `Tél. ${shop.phone}` : "",
    shop.ninea ? `NINEA ${shop.ninea}` : "",
  ].filter(Boolean);
  shopLines.forEach((l, i) => doc.text(safe(l), M + 19, y + 2.5 + i * 4.2));

  // Titre FACTURE + numéro et dates
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.text("FACTURE", W - M, y - 1, { align: "right" });
  doc.setFontSize(10);
  doc.text(safe(`N° ${invoice.number}`), W - M, y + 5.5, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GREY);
  doc.text(safe(`Date : ${dateText(invoice.at)}`), W - M, y + 10.5, { align: "right" });
  if (invoice.dueAt) doc.text(safe(`À payer avant le : ${dateText(invoice.dueAt)}`), W - M, y + 15, { align: "right" });

  // Client
  y = Math.max(y + 2.5 + shopLines.length * 4.2, y + 18) + 8;
  doc.setFillColor(...SOFT);
  doc.roundedRect(M, y, W - 2 * M, 22, 3, 3, "F");
  doc.setFontSize(8.5);
  doc.setTextColor(...GREY);
  doc.text("FACTURÉ À", M + 6, y + 7);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...INK);
  doc.text(safe(client?.name ?? "Client"), M + 6, y + 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GREY);
  if (client?.phone) doc.text(safe(`Tél. +${client.phone}`), M + 6, y + 19);

  // Tableau des lignes
  y += 32;
  const col = { label: M + 4, qty: 118, price: 152, total: W - M - 4 };
  doc.setFillColor(...INK);
  doc.roundedRect(M, y, W - 2 * M, 10, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text("DÉSIGNATION", col.label, y + 6.5);
  doc.text("QTÉ", col.qty, y + 6.5, { align: "right" });
  doc.text("PRIX UNITAIRE", col.price, y + 6.5, { align: "right" });
  doc.text("MONTANT", col.total, y + 6.5, { align: "right" });
  y += 10;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const lines = invoiceLines(invoice);
  lines.forEach((line, i) => {
    const label = doc.splitTextToSize(safe(line.label), 80) as string[];
    const h = Math.max(10, 5 + label.length * 4.6);
    if (y + h > 250) {
      doc.addPage();
      y = 20;
    }
    if (i % 2 === 1) {
      doc.setFillColor(250, 249, 245);
      doc.rect(M, y, W - 2 * M, h, "F");
    }
    doc.setTextColor(...INK);
    doc.text(label, col.label, y + 6.5);
    doc.text(safe(`${qtyText(line.qty)}${line.unit ? ` ${line.unit}` : ""}`), col.qty, y + 6.5, { align: "right" });
    doc.text(francs(line.unitPrice), col.price, y + 6.5, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.text(francs(line.qty * line.unitPrice), col.total, y + 6.5, { align: "right" });
    doc.setFont("helvetica", "normal");
    y += h;
    doc.setDrawColor(...LINE);
    doc.line(M, y, W - M, y);
  });

  // Total
  y += 8;
  doc.setFillColor(...YELLOW);
  doc.roundedRect(W - M - 82, y, 82, 18, 3, 3, "F");
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("TOTAL À PAYER", W - M - 77, y + 7);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text(francs(invoice.amount), W - M - 5, y + 13.5, { align: "right" });

  // Tampon « PAYÉE »
  if (invoice.status === "payee") {
    doc.setDrawColor(...GREEN);
    doc.setTextColor(...GREEN);
    doc.setLineWidth(0.8);
    doc.roundedRect(M, y + 1, 40, 14, 2, 2, "S");
    doc.setFontSize(15);
    doc.text("PAYÉE", M + 20, y + 10.5, { align: "center" });
    doc.setLineWidth(0.2);
  }

  // Paiement et mot de la boutique
  y += 30;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  if (shop.paymentInfo) {
    doc.setTextColor(...GREY);
    doc.text("PAIEMENT", M, y);
    doc.setTextColor(...INK);
    doc.text(doc.splitTextToSize(safe(shop.paymentInfo), W - 2 * M) as string[], M, y + 5);
    y += 14;
  }
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "italic");
  doc.text(doc.splitTextToSize(safe(shop.invoiceNote || "Merci pour votre confiance."), W - 2 * M) as string[], M, y);

  // Pied de page
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GREY);
  doc.setDrawColor(...LINE);
  doc.line(M, 282, W - M, 282);
  doc.text(safe(`${shop.name} · Facture ${invoice.number}`), M, 287);
  doc.text("Faite avec Jokko", W - M, 287, { align: "right" });

  return doc.output("blob");
}

/** Message WhatsApp qui accompagne la facture (le lien ouvre le PDF). */
export function invoiceMessage({ shop, client, invoice }: InvoiceDoc, link: string | null): string {
  const first = client?.name.split(" ")[0] ?? "";
  const due = invoice.dueAt ? ` À régler avant le ${dateText(invoice.dueAt)}.` : "";
  const paid = invoice.status === "payee" ? " (payée, merci)" : "";
  return [
    `Bonjour ${first}, voici votre facture ${invoice.number} de ${shop.name} : ${francs(invoice.amount)}${paid}.${due}`,
    link ? `Facture : ${link}` : "",
    shop.paymentInfo && invoice.status !== "payee" ? `Paiement : ${shop.paymentInfo}` : "",
    "Merci.",
  ]
    .filter(Boolean)
    .join("\n");
}
