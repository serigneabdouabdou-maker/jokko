import { useMemo, useState } from "react";
import { Download, MessageCircle, Plus, Share2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type Invoice, type InvoiceLine, type Shop, todayStamp, uid } from "@/model";
import { invoiceTotal, nextInvoiceNumber } from "@/assistant/apply";
import { francs, invoiceLines } from "@/data/invoicePdf";
import { downloadInvoice, sendInvoiceWhatsApp, shareInvoice } from "@/data/invoiceShare";

const STATUS: Record<Invoice["status"], string> = { brouillon: "À envoyer", envoyee: "Envoyée", payee: "Payée" };
const dateFr = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const toNum = (s: string) => Number(s.replace(/[\s  ]/g, "").replace(",", "."));

type Draft = { label: string; qty: string; unit: string; unitPrice: string; productId?: string };

/**
 * Factures : créer, voir, télécharger, partager, envoyer au client sur WhatsApp, marquer payée.
 */
export function Invoices({ shop, commit, canEditShop = true }: { shop: Shop; commit: (s: Shop) => void; canEditShop?: boolean }) {
  const [openId, setOpenId] = useState<string | null>(shop.invoices[0]?.id ?? null);
  const [creating, setCreating] = useState(false);
  const [settings, setSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const open = shop.invoices.find((i) => i.id === openId) ?? null;

  async function run(action: () => Promise<string | void>) {
    setBusy(true);
    setNote("");
    try {
      const message = await action();
      if (message) setNote(message);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Action impossible pour le moment.");
    } finally {
      setBusy(false);
    }
  }

  function doc(invoice: Invoice) {
    return { shop, invoice, client: shop.clients.find((c) => c.id === invoice.clientId) };
  }

  function sendWhatsApp(invoice: Invoice) {
    // La fenêtre s'ouvre tout de suite (au toucher), sinon le téléphone bloque WhatsApp.
    const win = window.open("", "_blank");
    void run(async () => {
      const result = await sendInvoiceWhatsApp(doc(invoice), win);
      if (result.opened) commit(result.shop);
      return result.message;
    });
  }

  function setStatus(invoice: Invoice, status: Invoice["status"]) {
    commit({ ...shop, invoices: shop.invoices.map((i) => (i.id === invoice.id ? { ...i, status } : i)) });
  }

  return (
    <section className="sheet">
      <div className="sheet-head">
        <h2>Factures</h2>
        <div className="import-actions">
          <Button className="h-10 rounded-full px-4 font-semibold" onClick={() => { setCreating(true); setOpenId(null); }}>
            <Plus size={16} /> Nouvelle facture
          </Button>
          {canEditShop && <Button variant="ghost" className="h-10 rounded-full px-4" onClick={() => setSettings(!settings)}>Infos de la boutique</Button>}
        </div>
      </div>
      <p className="note">Tu peux aussi dire à Jokko : « Facture Moussa ñaari bidon diw » ou « Fais une facture de 15 000 pour Awa ».</p>

      {settings && canEditShop && <InvoiceSettings shop={shop} commit={commit} onClose={() => setSettings(false)} />}
      {creating && (
        <InvoiceForm
          shop={shop}
          onCancel={() => setCreating(false)}
          onCreate={(invoice, next) => {
            commit(next);
            setCreating(false);
            setOpenId(invoice.id);
          }}
        />
      )}

      {open && (
        <div className="invoice-view">
          <InvoicePreview shop={shop} invoice={open} />
          <div className="import-actions">
            <Button className="h-11 rounded-full px-5 font-semibold" disabled={busy} onClick={() => sendWhatsApp(open)}>
              <MessageCircle size={16} /> Envoyer sur WhatsApp
            </Button>
            <Button variant="outline" className="h-11 rounded-full px-4" disabled={busy} onClick={() => void run(() => shareInvoice(doc(open)))}>
              <Share2 size={16} /> Partager
            </Button>
            <Button variant="ghost" className="h-11 rounded-full px-4" disabled={busy} onClick={() => void run(() => downloadInvoice(doc(open)))}>
              <Download size={16} /> PDF
            </Button>
            {open.status !== "payee" ? (
              <Button variant="ghost" className="h-11 rounded-full px-4" onClick={() => setStatus(open, "payee")}>Marquer payée</Button>
            ) : (
              <Button variant="ghost" className="h-11 rounded-full px-4" onClick={() => setStatus(open, "envoyee")}>Pas encore payée</Button>
            )}
          </div>
          {busy && <p className="note" role="status">Préparation de la facture…</p>}
          {note && <p className="note" role="status">{note}</p>}
        </div>
      )}

      <div className="list">
        {shop.invoices.length === 0 && <p className="note">Aucune facture pour l'instant.</p>}
        {shop.invoices.map((i) => {
          const client = shop.clients.find((c) => c.id === i.clientId);
          return (
            <article key={i.id} className={`is-clickable${i.id === openId ? " is-open" : ""}`} onClick={() => { setOpenId(i.id); setCreating(false); setNote(""); }}>
              <span>
                {i.number} · {client?.name ?? "Client"}
                <small>{dateFr(i.at)} · <span className={`inv-status is-${i.status}`}>{STATUS[i.status]}</span></small>
              </span>
              <b className="num">{francs(i.amount)}</b>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/** Aperçu à l'écran, fidèle au PDF. */
function InvoicePreview({ shop, invoice }: { shop: Shop; invoice: Invoice }) {
  const client = shop.clients.find((c) => c.id === invoice.clientId);
  const lines = invoiceLines(invoice);
  return (
    <article className="invoice-paper" aria-label={`Facture ${invoice.number}`}>
      <div className="inv-band" />
      <header className="inv-head">
        <div className="inv-shop">
          <span className="inv-mark">{shop.name.trim().charAt(0).toUpperCase() || "J"}</span>
          <div>
            <b>{shop.name}</b>
            <small>{[shop.activity, shop.city].filter(Boolean).join(" · ")}</small>
            {shop.address && <small>{shop.address}</small>}
            {shop.phone && <small>Tél. {shop.phone}</small>}
            {shop.ninea && <small>NINEA {shop.ninea}</small>}
          </div>
        </div>
        <div className="inv-title">
          <b>FACTURE</b>
          <small>N° {invoice.number}</small>
          <small>Date : {dateFr(invoice.at)}</small>
          {invoice.dueAt && <small>À payer avant le {dateFr(invoice.dueAt)}</small>}
        </div>
      </header>
      <div className="inv-client">
        <small>FACTURÉ À</small>
        <b>{client?.name ?? "Client"}</b>
        {client?.phone && <small>Tél. +{client.phone}</small>}
      </div>
      <table className="inv-table">
        <thead>
          <tr><th>Désignation</th><th>Qté</th><th>Prix unitaire</th><th>Montant</th></tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td>{l.label}</td>
              <td className="num">{l.qty} {l.unit}</td>
              <td className="num">{francs(l.unitPrice)}</td>
              <td className="num"><b>{francs(l.qty * l.unitPrice)}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="inv-foot">
        {invoice.status === "payee" ? <span className="inv-stamp">PAYÉE</span> : <span />}
        <div className="inv-total"><small>TOTAL À PAYER</small><b className="num">{francs(invoice.amount)}</b></div>
      </div>
      {shop.paymentInfo && <p className="inv-pay"><small>PAIEMENT</small> {shop.paymentInfo}</p>}
      <p className="inv-thanks">{shop.invoiceNote || "Merci pour votre confiance."}</p>
    </article>
  );
}

/** Créer une facture : client, lignes (articles du stock ou texte libre), échéance. */
function InvoiceForm({ shop, onCreate, onCancel }: { shop: Shop; onCreate: (invoice: Invoice, next: Shop) => void; onCancel: () => void }) {
  const [clientId, setClientId] = useState(shop.clients[0]?.id ?? "");
  const [newClient, setNewClient] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [lines, setLines] = useState<Draft[]>([{ label: "", qty: "1", unit: "", unitPrice: "" }]);
  const [dueDays, setDueDays] = useState("");
  const [error, setError] = useState("");

  const parsed: InvoiceLine[] = useMemo(
    () =>
      lines
        .filter((l) => l.label.trim())
        .map((l) => ({ label: l.label.trim(), qty: toNum(l.qty) || 0, unit: l.unit.trim(), unitPrice: Math.round(toNum(l.unitPrice) || 0), ...(l.productId ? { productId: l.productId } : {}) })),
    [lines],
  );
  const total = invoiceTotal(parsed);

  function pickProduct(index: number, productId: string) {
    const p = shop.products.find((x) => x.id === productId);
    if (!p) return;
    setLines(lines.map((l, i) => (i === index ? { ...l, label: p.name, unit: p.unit, unitPrice: String(p.price), productId: p.id } : l)));
  }

  function create() {
    if (!parsed.length || parsed.some((l) => !(l.qty > 0) || l.unitPrice < 0)) return setError("Chaque ligne a besoin d'un nom, d'une quantité et d'un prix.");
    if (!total) return setError("Le total est de 0 F.");
    let clients = shop.clients;
    let id = clientId;
    if (clientId === "nouveau") {
      if (!newClient.trim()) return setError("Écris le nom du client.");
      let phone = newPhone.replace(/\D/g, "");
      if (phone.length === 9) phone = `221${phone}`;
      id = uid("c");
      clients = [...clients, { id, name: newClient.trim(), phone, debt: 0 }];
    }
    if (!id) return setError("Choisis un client.");
    const invoice: Invoice = { id: uid("inv"), number: nextInvoiceNumber(shop), at: todayStamp(), clientId: id, amount: total, status: "brouillon", lines: parsed };
    const days = toNum(dueDays);
    if (days > 0) invoice.dueAt = new Date(Date.now() + days * 86_400_000).toISOString();
    onCreate(invoice, { ...shop, clients, invoices: [invoice, ...shop.invoices] });
  }

  return (
    <div className="product-editor">
      <b>Nouvelle facture · {nextInvoiceNumber(shop)}</b>
      <div className="grid-2">
        <div className="field">
          <Label htmlFor="inv-client">Client</Label>
          <select id="inv-client" className="native-select" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            {shop.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="nouveau">+ Nouveau client</option>
          </select>
        </div>
        <div className="field">
          <Label htmlFor="inv-due">À payer dans (jours, facultatif)</Label>
          <Input id="inv-due" className="num h-11" inputMode="numeric" value={dueDays} onChange={(e) => setDueDays(e.target.value)} placeholder="ex. 15" />
        </div>
      </div>
      {clientId === "nouveau" && (
        <div className="grid-2">
          <Input className="h-11" value={newClient} onChange={(e) => setNewClient(e.target.value)} placeholder="Nom du client" />
          <Input className="num h-11" inputMode="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="77 123 45 67 (WhatsApp)" />
        </div>
      )}

      <div className="inv-lines">
        {lines.map((l, i) => (
          <div key={i} className="inv-line">
            <select className="native-select" value={l.productId ?? ""} onChange={(e) => pickProduct(i, e.target.value)} aria-label="Article du stock">
              <option value="">Article…</option>
              {shop.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <Input className="h-10" value={l.label} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, label: e.target.value, productId: undefined } : x)))} placeholder="Désignation" />
            <Input className="num h-10" inputMode="decimal" value={l.qty} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} placeholder="Qté" aria-label="Quantité" />
            <Input className="num h-10" inputMode="numeric" value={l.unitPrice} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, unitPrice: e.target.value } : x)))} placeholder="Prix" aria-label="Prix unitaire" />
            <Button variant="ghost" className="h-10 w-10 rounded-full p-0" aria-label="Retirer la ligne" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))}>
              <Trash2 size={15} />
            </Button>
          </div>
        ))}
        <Button variant="ghost" className="h-9 rounded-full px-3 justify-self-start" onClick={() => setLines([...lines, { label: "", qty: "1", unit: "", unitPrice: "" }])}>
          <Plus size={15} /> Ajouter une ligne
        </Button>
      </div>
      <p className="inv-form-total">Total : <b className="num">{francs(total)}</b></p>
      {error && <p className="note" role="alert" data-tone="error">{error}</p>}
      <div className="import-actions">
        <Button className="h-11 rounded-full px-5 font-semibold" onClick={create}>Créer la facture</Button>
        <Button variant="ghost" className="h-11 rounded-full px-4" onClick={onCancel}>Annuler</Button>
      </div>
    </div>
  );
}

/** Infos imprimées sur toutes les factures. */
function InvoiceSettings({ shop, commit, onClose }: { shop: Shop; commit: (s: Shop) => void; onClose: () => void }) {
  const [form, setForm] = useState({
    name: shop.name,
    address: shop.address ?? "",
    phone: shop.phone ?? "",
    ninea: shop.ninea ?? "",
    paymentInfo: shop.paymentInfo ?? "",
    invoiceNote: shop.invoiceNote ?? "",
  });
  const field = (key: keyof typeof form, label: string, placeholder: string) => (
    <div className="field">
      <Label htmlFor={`is-${key}`}>{label}</Label>
      <Input id={`is-${key}`} className="h-11" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={placeholder} />
    </div>
  );
  return (
    <div className="product-editor">
      <b>Ce qui s'imprime en haut et en bas de tes factures</b>
      <div className="grid-2">
        {field("name", "Nom de la boutique / entreprise", "Boutique Awa")}
        {field("phone", "Téléphone", "77 123 45 67")}
      </div>
      <div className="grid-2">
        {field("address", "Adresse", "Rue 10, Pikine")}
        {field("ninea", "NINEA / RC (facultatif)", "0000000 2G3")}
      </div>
      {field("paymentInfo", "Comment te payer", "Wave ou Orange Money au 77 123 45 67")}
      {field("invoiceNote", "Mot en bas de la facture", "Merci pour votre confiance.")}
      <div className="import-actions">
        <Button
          className="h-11 rounded-full px-5 font-semibold"
          onClick={() => {
            commit({ ...shop, name: form.name.trim() || shop.name, address: form.address.trim(), phone: form.phone.trim(), ninea: form.ninea.trim(), paymentInfo: form.paymentInfo.trim(), invoiceNote: form.invoiceNote.trim() });
            onClose();
          }}
        >
          Enregistrer
        </Button>
        <Button variant="ghost" className="h-11 rounded-full px-4" onClick={onClose}>Fermer</Button>
      </div>
    </div>
  );
}
