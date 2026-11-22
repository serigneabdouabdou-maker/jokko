/**
 * Lecteur de la discussion WhatsApp avec le fournisseur (22/11/2026, demande de Fallou : « j'ai la paresse de tout
 * relire : le système lit le fichier, se met à jour avec les dernières factures et les prix, et signale les anomalies »).
 *
 * Tout se fait dans le téléphone (aucune IA, rien n'est envoyé ailleurs) : le fichier exporté par WhatsApp
 * (« Exporter la discussion », .txt ou .zip) est lu, chaque message qui contient « Total … » devient une facture,
 * ses lignes « 4 LCD bf6 4000=16,000 » deviennent des pièces (quantité, prix, sous-total).
 * Anomalies : facture envoyée deux fois (comptée une fois), multiplication fausse, total qui ne correspond pas aux
 * lignes, faute de frappe « 16,0000 ». Les cumuls (mois, types, gammes d'écrans, pièces avec leur historique de prix)
 * vont dans `Supplier` ; une nouvelle discussion n'ajoute que les factures d'après la dernière lecture.
 */
import { unzipSync, strFromU8 } from "fflate";
import type { Product, Shop, Supplier, SupplierItem, SupplierMonth, SupplierTier } from "../model.ts";
import { partForSale } from "./partSearch.ts";
import { kindOf, type PartKind } from "./pricing.ts";

export type ChatLine = { qty: number; name: string; unit: number; sub: number };
export type ChatInvoice = { date: string; total: number; who: string; lines: ChatLine[] };
export type ChatAnomaly = { kind: "doublon" | "calcul" | "total" | "faute"; date: string; text: string; serious: boolean };
export type ChatImport = { invoices: ChatInvoice[]; anomalies: ChatAnomaly[]; from: string; to: string; messages: number };

const DAY = 86_400_000;
const fmt = (n: number) => n.toLocaleString("fr-FR").replace(/[   ]/g, " "); // espace insécable : un nombre ne se coupe jamais
const frDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Le texte du fichier exporté : .txt tel quel, .zip → le plus gros .txt dedans. */
export function chatText(bytes: Uint8Array): string {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const files = unzipSync(bytes, { filter: (f) => /\.txt$/i.test(f.name) });
    const best = Object.values(files).sort((a, b) => b.length - a.length)[0];
    if (!best) throw new Error("Pas de discussion (.txt) dans ce fichier .zip");
    return strFromU8(best);
  }
  return strFromU8(bytes);
}

type Msg = { date: string; who: string; text: string };

// Android : « 22/11/2026, 10:49 - Bathie: … » ; iPhone : « [22/11/2026 10:49:12] Bathie: … » (année sur 2 ou 4 chiffres).
const ANDROID = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),? (\d{1,2}:\d{2})(?::\d{2})?(?:\s?[AP]M)? - ([^:]+?): ?(.*)$/;
const IOS = /^\[(\d{1,2})\/(\d{1,2})\/(\d{2,4}),? (\d{1,2}:\d{2})(?::\d{2})?(?:\s?[AP]M)?\] ([^:]+?): ?(.*)$/;

function messages(text: string): Msg[] {
  const out: Msg[] = [];
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const l = raw.replace(/[‎‏‪-‮]/g, "");
    const m = ANDROID.exec(l) ?? IOS.exec(l);
    if (m) {
      const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
      out.push({ date: `${y}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`, who: m[5]!.trim(), text: m[6]! });
    } else if (out.length) out[out.length - 1]!.text += `\n${l}`;
  }
  return out;
}

/** « 16,000 » → 16000 ; « 16,0000 » (faute) → 16000 avec `fixed` ; « 4000fr » → 4000. */
function num(s: string): { value: number | null; fixed: boolean } {
  let t = s.trim();
  let fixed = false;
  if (/^\d{1,3}[.,]\d{4}$/.test(t)) { t = t.slice(0, -1); fixed = true; }
  t = t.replace(/(fcfa|fr|f)\s*$/i, "").replace(/[\s.,]/g, "");
  return { value: /^\d+$/.test(t) ? Number(t) : null, fixed };
}

const TOTAL = /total\s*[:🟰=]*\s*(\d[\d.,\s]*\d)/i;
const LINE_QTY = /^(\d+)\s+(.+?)\s+(\d[\d.,]*)\s*(?:[=🟰]\s*(\d[\d.,]*))?\s*(?:fr|f|fcfa)?\s*$/i;
const LINE_ONE = /^([A-Za-zÀ-ÿ].+?)\s+(\d[\d.,]*)\s*(?:fr|f)?\s*$/;

type Draft = ChatInvoice & { sig: string[]; own: ChatAnomaly[] };

/** Le prix à l'unité écrit est-il une faute de frappe ? (750 pour 4 750, 49 000 pour 4 900) */
function unitTypo(pu: number, w: number): boolean {
  if (!Number.isInteger(w) || w <= 0) return false;
  const a = String(pu);
  const b = String(w);
  return pu === w * 10 || w === pu * 10 || (a.length !== b.length && (a.endsWith(b) || b.endsWith(a)));
}

/**
 * Lit toutes les factures de la discussion, avec les anomalies trouvées.
 * Le fournisseur renvoie souvent la facture entière avec les nouvelles pièces ajoutées (ou corrigée) : une facture
 * dont les lignes se retrouvent dans une facture suivante (21 jours au plus) est remplacée par celle-ci,
 * pour ne jamais compter deux fois la même pièce.
 */
export function readSupplierChat(text: string): ChatImport {
  const msgs = messages(text);
  const drafts: Draft[] = [];
  const anomalies: ChatAnomaly[] = [];
  const seen = new Set<string>();
  for (const m of msgs) {
    const tm = TOTAL.exec(m.text);
    if (!tm) continue;
    const t = num(tm[1]!);
    if (!t.value || t.value < 1000) continue;
    const key = `${m.date}|${t.value}`;
    if (seen.has(key)) continue; // même facture renvoyée le même jour
    seen.add(key);
    const own: ChatAnomaly[] = [];
    if (t.fixed) own.push({ kind: "faute", date: m.date, text: `Total du ${frDate(m.date)} écrit « ${tm[1]!.trim()} » : lu ${fmt(t.value)} F.`, serious: false });
    const lines: ChatLine[] = [];
    const sig: string[] = [];
    let unread = 0;
    for (const rawLine of m.text.split("\n")) {
      if (/total/i.test(rawLine)) continue;
      const l = rawLine.replace(/<Ce message.*$/i, "").replace(/✅/g, "").trim();
      if (!l) continue;
      const q = LINE_QTY.exec(l);
      if (q) {
        const qty = Number(q[1]);
        const pu = num(q[3]!).value ?? 0;
        const written = q[4] ? num(q[4]).value : null;
        if (!qty || (!pu && !written)) { unread++; continue; }
        let unit = pu || Math.round((written ?? 0) / qty);
        let sub = written ?? qty * unit;
        if (written && pu && written !== qty * pu) {
          const w = written / qty;
          if (unitTypo(pu, w)) unit = w; // prix à l'unité mal tapé, le sous-total est juste
          else {
            own.push({ kind: "calcul", date: m.date, text: `${frDate(m.date)} : « ${q[2]} » ${qty} × ${fmt(pu)} = ${fmt(qty * pu)} F, mais la facture compte ${fmt(written)} F (${written > qty * pu ? `${fmt(written - qty * pu)} F de trop` : `${fmt(qty * pu - written)} F de moins`}).`, serious: written > qty * pu });
            sub = written;
          }
        }
        lines.push({ qty, name: q[2]!.trim(), unit, sub });
        sig.push(`${qty}|${q[2]!.trim().toLowerCase()}|${pu}`);
        continue;
      }
      const one = LINE_ONE.exec(l);
      if (one) {
        const pu = num(one[2]!).value;
        if (pu && pu >= 200) { lines.push({ qty: 1, name: one[1]!.trim(), unit: pu, sub: pu }); sig.push(`1|${one[1]!.trim().toLowerCase()}|${pu}`); continue; }
      }
      if (/\d/.test(l) && l.length < 60) unread++;
    }
    const sum = lines.reduce((a, x) => a + x.sub, 0);
    // Total ≠ lignes : seulement quand toutes les lignes ont été lues (sinon l'écart vient d'une ligne illisible).
    if (lines.length >= 2 && !unread && Math.abs(sum - t.value) >= 500) {
      const more = t.value > sum;
      own.push({ kind: "total", date: m.date, text: `Facture du ${frDate(m.date)} : total ${fmt(t.value)} F, mais les lignes font ${fmt(sum)} F (${fmt(Math.abs(t.value - sum))} F ${more ? "de trop sur le total" : "de moins : remise ou avance déduite ?"}).`, serious: more });
    }
    drafts.push({ date: m.date, total: t.value, who: m.who, lines, sig, own });
  }
  drafts.sort((a, b) => a.date.localeCompare(b.date));
  // Factures renvoyées en entier (avec des pièces en plus) ou corrigées : seule la dernière version compte.
  const replaced = new Set<number>();
  for (let a = 0; a < drafts.length; a++) {
    const A = drafts[a]!;
    if (!A.sig.length) continue;
    for (let b = a + 1; b < drafts.length; b++) {
      const B = drafts[b]!;
      const days = (Date.parse(B.date) - Date.parse(A.date)) / DAY;
      if (days > 21) break;
      const pool = [...B.sig];
      let common = 0;
      for (const x of A.sig) { const k = pool.indexOf(x); if (k >= 0) { common++; pool.splice(k, 1); } }
      const inside = common === A.sig.length;
      const revised = A.sig.length >= 3 && common >= 0.8 * A.sig.length;
      const resent = inside && (A.sig.length >= 3 || B.sig.length > A.sig.length || days <= 3);
      if (resent || revised) {
        replaced.add(a);
        anomalies.push({ kind: "doublon", date: A.date, text: `Facture de ${fmt(A.total)} F du ${frDate(A.date)} reprise dans celle de ${fmt(B.total)} F du ${frDate(B.date)}${inside ? "" : " (corrigée)"} : comptée une seule fois.`, serious: false });
        break;
      }
    }
  }
  const invoices: ChatInvoice[] = [];
  const told = new Set<string>();
  drafts.forEach((d, k) => {
    if (replaced.has(k)) return;
    invoices.push({ date: d.date, total: d.total, who: d.who, lines: d.lines });
    for (const x of d.own) {
      const same = x.text.replace(/^\S+ : |du \d\d\/\d\d\/\d{4} /, "");
      if (told.has(same)) continue;
      told.add(same);
      anomalies.push(x);
    }
  });
  anomalies.sort((a, b) => Number(b.serious) - Number(a.serious) || b.date.localeCompare(a.date));
  return { invoices, anomalies, from: invoices[0]?.date ?? "", to: invoices[invoices.length - 1]?.date ?? "", messages: msgs.length };
}

// ---------- Pièces : nom propre, type, gamme ----------

const KIND_PLURAL: Record<PartKind, string> = { Écran: "Écrans", Plaquette: "Plaquettes", Batterie: "Batteries", Connecteur: "Connecteurs", Dos: "Dos / vitres", Bouton: "Boutons", Nappe: "Nappes", Autre: "Autres pièces" };
const iphoneish = (w: string) => /^(x|xr|xs|se)$/.test(w);
const IPHONE = /^(iphone\s*)?(x|xr|xs|xs ?max|11|11 ?pro( ?max)?|12( ?mini| ?pro)?( ?max)?|13( ?mini| ?pro)?( ?max)?|14( ?plus| ?pro)?( ?max)?|15( ?plus| ?pro)?( ?max)?|6s?( ?plus)?|7( ?plus)?|8( ?plus)?|se)$/;
const KIND_WORDS = /\b(ecran|écran|lcd|lca|tactile|afficheur|batterie|batteries|battery|plaquette|plaquettes|plaque|connecteur|contact|contac|charge|de|dos|cover|vitre|arriere|arrière|chassis|châssis|bouton|nappe|flex)\b/g;
const NOISE_WORDS = /\b(avec|cadre|copie|original|orig|incell|oled|tft|noir|black|blanc|white|complet|tecno|samsung|itel|infinix|huawei|xiaomi|redmi?|oppo|nokia)\b/g;

/** « 4 LCD bf6 » → { key: "Écran:bf6", label: "Écran BF6", kind: "Écran" } ; « lcd 11 pro max » → « Écran iPhone 11 Pro Max ». */
export function partOf(name: string): { key: string; label: string; kind: PartKind; iphone: boolean } {
  const kind = kindOf(name);
  let rest = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\(.*?\)/g, " ").replace(/\\/g, "").replace(KIND_WORDS, " ");
  const iphoneWord = /iphone/.test(rest);
  rest = rest.replace(/iphone/g, " ").replace(NOISE_WORDS, " ").replace(/[^a-z0-9+/ ]/g, " ").replace(/\s+/g, " ").trim();
  const iphone = kind === "Écran" && (iphoneWord || IPHONE.test(rest));
  const model = rest
    .replace(/(\d+)\s*pins?\b/, "$1 pins")
    .replace(/(\d)(core|pro|max|plus|mini|lite|go)\b/g, "$1 $2")
    .split(" ")
    .map((w) => (w === "pins" ? w : /\d/.test(w) && /[a-z]/.test(w) ? w.toUpperCase() : iphoneish(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
  const head = kind === "Autre" ? "" : kind;
  const label = [head, iphone ? "iPhone" : "", /pins/.test(model) ? "téléphone à touches" : "", model || (kind === "Autre" ? name.trim() : "")].filter(Boolean).join(" ");
  const key = `${kind}:${iphone ? "iphone" : ""}${rest.replace(/\s+/g, "") || name.toLowerCase().replace(/\s+/g, "")}`;
  return { key, label: label.charAt(0).toUpperCase() + label.slice(1), kind, iphone };
}

function tierOf(unit: number, iphone: boolean): SupplierTier {
  if (iphone) return { label: "Écrans d'iPhone", qty: 0, total: 0, iphone: true };
  if (unit < 5000) return { label: "Écrans à moins de 5 000 F", qty: 0, total: 0, max: 5000 };
  if (unit < 8000) return { label: "Écrans de 5 000 à 8 000 F", qty: 0, total: 0, min: 5000, max: 8000 };
  return { label: "Écrans de 8 000 F et plus", qty: 0, total: 0, min: 8000 };
}

type Built = Required<Pick<Supplier, "purchases" | "kinds" | "tiers" | "items" | "top">>;

/** Ajoute des factures aux cumuls (mois, types, gammes, pièces avec prix). */
function addInvoices(base: Built, invoices: ChatInvoice[]): Built {
  const months = new Map<string, SupplierMonth>(base.purchases.map((m) => [m.month, { ...m }]));
  const kinds = new Map(base.kinds.map((k) => [k.label, { ...k }]));
  const tiers = new Map(base.tiers.map((t) => [t.label, { ...t }]));
  const items = new Map(base.items.map((i) => [i.key, { ...i, prices: [...(i.prices ?? [])] }]));
  for (const inv of invoices) {
    const mk = inv.date.slice(0, 7);
    const m = months.get(mk) ?? { month: mk, total: 0, invoices: 0 };
    m.total += inv.total; m.invoices += 1; months.set(mk, m);
    for (const l of inv.lines) {
      const p = partOf(l.name);
      const kl = KIND_PLURAL[p.kind];
      const k = kinds.get(kl) ?? { label: kl, qty: 0, total: 0 };
      k.qty += l.qty; k.total += l.sub; kinds.set(kl, k);
      if (p.kind === "Écran") {
        const t0 = tierOf(l.unit, p.iphone);
        const t = tiers.get(t0.label) ?? t0;
        t.qty += l.qty; t.total += l.sub; tiers.set(t.label, t);
      }
      const it = items.get(p.key) ?? { key: p.key, name: p.label, kind: p.kind, qty: 0, total: 0, first: inv.date, last: inv.date, prices: [] as Array<[string, number]> };
      it.qty += l.qty; it.total += l.sub;
      if (inv.date >= it.last) it.name = p.label;
      if (inv.date < it.first) it.first = inv.date;
      if (inv.date >= it.last) it.last = inv.date;
      // Historique des prix : une entrée par changement de prix (date, prix à l'unité).
      const prev = it.prices[it.prices.length - 1];
      if (!prev || prev[1] !== l.unit) it.prices.push([inv.date, l.unit]);
      items.set(p.key, it);
    }
  }
  const purchases = [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
  const itemList = [...items.values()];
  const top = itemList.filter((i) => i.kind === "Écran").sort((a, b) => b.qty - a.qty).slice(0, 20).map((i) => ({ name: i.name, qty: i.qty, total: i.total }));
  return {
    purchases,
    kinds: [...kinds.values()].sort((a, b) => b.total - a.total),
    tiers: [...tiers.values()].sort((a, b) => (a.iphone ? 1 : 0) - (b.iphone ? 1 : 0) || (a.min ?? 0) - (b.min ?? 0)),
    items: itemList,
    top,
  };
}

/** Quantités sur les 6 derniers mois et les 6 mois d'avant, pour voir ce qui monte ou baisse. */
function withTrend(items: SupplierItem[], invoices: ChatInvoice[], to: string, keep?: SupplierItem[]): SupplierItem[] {
  const end = Date.parse(to);
  const recent = new Map<string, number>();
  const older = new Map<string, number>();
  for (const inv of invoices) {
    const age = (end - Date.parse(inv.date)) / DAY;
    for (const l of inv.lines) {
      const k = partOf(l.name).key;
      if (age <= 182) recent.set(k, (recent.get(k) ?? 0) + l.qty);
      else if (age <= 365) older.set(k, (older.get(k) ?? 0) + l.qty);
    }
  }
  const was = new Map((keep ?? []).map((i) => [i.key, i]));
  return items.map((i) => ({ ...i, recent: recent.get(i.key) ?? (invoices.length ? 0 : was.get(i.key)?.recent ?? 0), older: older.get(i.key) ?? (invoices.length ? 0 : was.get(i.key)?.older ?? 0) }));
}

/** Pièces gardées : achetées au moins 3 fois ou pendant l'année, 110 au plus, celles achetées dans l'année d'abord (ce qui monte et ce qui baisse) (fiche ≈ 30 Ko). */
// Les gros écrans (≥ 20 achetés) restent toujours, même quand ils baissent : c'est là qu'on voit la tendance.
const weight = (i: SupplierItem) => (i.recent ?? 0) + (i.older ?? 0) + (i.kind === "Écran" && i.qty >= 20 ? 1000 : 0);

function trimItems(items: SupplierItem[], to: string): SupplierItem[] {
  const year = Date.parse(to) - 365 * DAY;
  return items
    .filter((i) => i.qty >= 3 || Date.parse(i.last) >= year)
    .sort((a, b) => weight(b) - weight(a) || b.qty - a.qty)
    .slice(0, 110)
    .map((i) => ({ ...i, prices: (i.prices ?? []).slice(-5) }));
}

/** Erreurs gardées : les plus graves puis les plus récentes, 30 au plus. */
function keepAnomalies(old: NonNullable<Supplier["anomalies"]>, fresh: ChatAnomaly[]): NonNullable<Supplier["anomalies"]> {
  const all = [...fresh.map((a) => ({ date: a.date, text: a.text, serious: a.serious })), ...old];
  const seen = new Set<string>();
  return all
    .filter((a) => (seen.has(a.text) ? false : (seen.add(a.text), true)))
    .sort((a, b) => Number(b.serious) - Number(a.serious) || b.date.localeCompare(a.date))
    .slice(0, 30);
}

export type MergeResult = { supplier: Supplier; added: ChatInvoice[]; full: boolean; skipped: number };

/**
 * Met le fournisseur à jour avec une discussion lue.
 * Discussion qui commence avant (ou sans) l'historique gardé : tout est recalculé (complet).
 * Sinon : seules les factures d'après la dernière lecture sont ajoutées (`lastKeys` évite de recompter le même jour).
 */
export function mergeSupplierChat(sup: Supplier, imp: ChatImport): MergeResult {
  if (!imp.invoices.length) return { supplier: sup, added: [], full: false, skipped: 0 };
  const hadItems = !!sup.items?.length;
  const full = !sup.historyTo || !hadItems || imp.from <= (sup.historyFrom ?? imp.from);
  const lastKeys = new Set(sup.lastKeys ?? []);
  const after = sup.historyTo ? imp.invoices.filter((i) => i.date > sup.historyTo! || (i.date === sup.historyTo && !lastKeys.has(`${i.date}|${i.total}`))) : imp.invoices;
  const empty: Built = { purchases: [], kinds: [], tiers: [], items: [], top: [] };
  const base: Built = full ? empty : { purchases: sup.purchases ?? [], kinds: sup.kinds ?? [], tiers: sup.tiers ?? [], items: sup.items ?? [], top: sup.top ?? [] };
  const use = full ? imp.invoices : after;
  const built = addInvoices(base, use);
  const to = full ? imp.to : [sup.historyTo ?? "", imp.to].sort().pop()!;
  // Tendances : sur toute la discussion fournie (elle couvre en général l'année).
  const items = trimItems(withTrend(built.items, imp.invoices.filter((i) => Date.parse(to) - Date.parse(i.date) <= 365 * DAY), to, sup.items), to);
  const lastDay = imp.invoices.filter((i) => i.date === to).map((i) => `${i.date}|${i.total}`);
  const supplier: Supplier = {
    ...sup,
    ...built,
    items,
    historyFrom: full ? imp.from : sup.historyFrom ?? imp.from,
    historyTo: to,
    lastKeys: [...new Set([...(to === sup.historyTo ? [...lastKeys] : []), ...lastDay])],
    readAt: new Date().toISOString(),
    anomalies: keepAnomalies(full ? [] : sup.anomalies ?? [], imp.anomalies.filter((a) => a.kind !== "doublon" && (full || !sup.historyTo || a.date > sup.historyTo))),
  };
  // Factures nouvelles (pour le stock) : seulement celles d'après la lecture précédente, jamais tout l'historique.
  const added = sup.historyTo ? after : [];
  return { supplier, added, full, skipped: imp.invoices.length - use.length };
}

// ---------- Nouvelles factures → stock ----------

export type StockLine = { key: string; label: string; qty: number; unit: number; productId?: string; productName?: string; oldCost?: number; choices?: number };

/** Les pièces des nouvelles factures, regroupées, avec l'article du stock qui correspond (même type et même modèle). */
export function invoiceStockLines(products: Product[], invoices: ChatInvoice[]): StockLine[] {
  const by = new Map<string, StockLine>();
  for (const inv of invoices) {
    for (const l of inv.lines) {
      const p = partOf(l.name);
      const s = by.get(p.key) ?? { key: p.key, label: p.label, qty: 0, unit: l.unit };
      s.qty += l.qty; s.unit = l.unit; by.set(p.key, s);
    }
  }
  return [...by.values()].map((s) => {
    const hit = partForSale(products, s.label, kindOf);
    return hit.product ? { ...s, productId: hit.product.id, productName: hit.product.name, ...(hit.product.cost !== undefined ? { oldCost: hit.product.cost } : {}) } : { ...s, ...(hit.choices ? { choices: hit.choices.length } : {}) };
  });
}

/** Ajoute les pièces cochées au stock ; une pièce inconnue devient un article (prix de vente à fixer). */
export function addStockLines(shop: Shop, lines: StockLine[], opts: { updateCost: boolean }, makeId: () => string): Shop {
  let products = [...shop.products];
  for (const l of lines) {
    const p = l.productId ? products.find((x) => x.id === l.productId) : undefined;
    if (p) products = products.map((x) => (x.id === p.id ? { ...x, stock: Math.max(0, x.stock) + l.qty, ...(opts.updateCost && l.unit ? { cost: l.unit } : {}) } : x));
    else products = [...products, { id: makeId(), name: l.label, unit: "pièce", stock: l.qty, min: 0, price: 0, cost: l.unit }];
  }
  return { ...shop, products };
}
