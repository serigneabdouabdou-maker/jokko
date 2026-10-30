import type { Invoice, Shop } from "../model";
import { invoiceFileName, invoiceMessage, invoicePdf, type InvoiceDoc } from "./invoicePdf";
import { supabase } from "./supabase";
import { whatsappLink } from "./debts";

/**
 * Mettre la facture en ligne (lien à envoyer au client) et la partager.
 * Le PDF est rangé dans le dossier de la boutique, sous un nom impossible à deviner.
 */
export async function uploadInvoice(doc: InvoiceDoc, blob: Blob): Promise<{ path: string; url: string }> {
  const path = doc.invoice.pdfPath ?? `${doc.shop.id}/${crypto.randomUUID()}.pdf`;
  const { error } = await supabase.storage.from("factures").upload(path, blob, { contentType: "application/pdf", upsert: true, cacheControl: "60" });
  if (error) throw new Error("La facture n'a pas pu être mise en ligne. Vérifie la connexion internet.");
  const { data } = supabase.storage.from("factures").getPublicUrl(path);
  return { path, url: `${data.publicUrl}?v=${Date.now()}` };
}

export type SendResult = { shop: Shop; opened: boolean; message: string };

/**
 * Envoyer sur WhatsApp : crée le PDF, le met en ligne, puis ouvre la conversation du client
 * avec le message et le lien déjà écrits. Le commerçant n'a plus qu'à appuyer sur Envoyer.
 * `win` est une fenêtre ouverte au moment du toucher (sinon le téléphone bloque l'ouverture).
 */
export async function sendInvoiceWhatsApp(doc: InvoiceDoc, win: Window | null): Promise<SendResult> {
  const { client, invoice, shop } = doc;
  if (!client?.phone) {
    win?.close();
    return { shop, opened: false, message: "Ce client n'a pas de numéro. Ajoute son numéro dans Clients." };
  }
  try {
    const blob = await invoicePdf(doc);
    const { path, url } = await uploadInvoice(doc, blob);
    const link = whatsappLink(client.phone, invoiceMessage(doc, url));
    if (!link) throw new Error("Numéro du client invalide.");
    if (win) win.location.href = link;
    else window.location.href = link;
    const next: Invoice = { ...invoice, pdfPath: path, status: invoice.status === "payee" ? "payee" : "envoyee" };
    return {
      shop: { ...shop, invoices: shop.invoices.map((i) => (i.id === invoice.id ? next : i)) },
      opened: true,
      message: `WhatsApp s'ouvre sur la conversation de ${client.name} : appuie sur Envoyer.`,
    };
  } catch (error) {
    win?.close();
    return { shop, opened: false, message: error instanceof Error ? error.message : "Envoi impossible pour le moment." };
  }
}

/** Partager le PDF (WhatsApp, e-mail, Bluetooth…) avec le menu de partage du téléphone, sinon le télécharger. */
export async function shareInvoice(doc: InvoiceDoc): Promise<string> {
  const blob = await invoicePdf(doc);
  const file = new File([blob], invoiceFileName(doc.invoice), { type: "application/pdf" });
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: `Facture ${doc.invoice.number}`, text: invoiceMessage(doc, null) });
      return "Facture partagée.";
    } catch {
      return "Partage annulé.";
    }
  }
  downloadBlob(blob, invoiceFileName(doc.invoice));
  return "Ce navigateur ne sait pas partager un fichier : la facture est téléchargée.";
}

export async function downloadInvoice(doc: InvoiceDoc): Promise<void> {
  downloadBlob(await invoicePdf(doc), invoiceFileName(doc.invoice));
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
