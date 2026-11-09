import type { Client, CoutureOrder, Expense, Invoice, InvoiceLine, Product, Reminder, Repair, Sale, Shop, Shortcut } from "../model.ts";

/** Synchronisation hors ligne des boutiques vers Supabase (sans React). */

export type Row = Record<string, unknown>;

export type Op = { table: string; kind: "upsert" | "delete"; id: string; row?: Row };

/** Tables filles, dans l'ordre d'envoi des upserts (parents avant enfants). */
export const CHILD_TABLES = ["products", "clients", "sales", "expenses", "invoices", "reminders", "shortcuts", "repairs", "couture_orders"] as const;
export type ChildTable = (typeof CHILD_TABLES)[number];
const TABLE_ORDER: string[] = ["shops", ...CHILD_TABLES];

// ---------- Shop -> lignes Postgres ----------

const opt = <T>(v: T | undefined): T | null => (v === undefined ? null : v);

export function shopRow(s: Shop): Row {
  return {
    id: s.id, name: s.name, city: s.city, activity: s.activity, opening_cash: s.openingCash, last_inventory_at: opt(s.lastInventoryAt),
    address: s.address ?? "", phone: s.phone ?? "", ninea: s.ninea ?? "", payment_info: s.paymentInfo ?? "", invoice_note: s.invoiceNote ?? "",
    wave_link: s.waveLink?.trim() ? s.waveLink.trim() : null,
    lat: s.location ? Math.round(s.location.lat * 100) / 100 : null,
    lng: s.location ? Math.round(s.location.lng * 100) / 100 : null,
    located_at: s.location?.at ?? null,
    modules: s.modules ?? [],
  };
}

const toRow = {
  products: (p: Product, shopId: string): Row => ({
    id: p.id, shop_id: shopId, name: p.name, unit: p.unit, stock: p.stock, min: p.min, price: p.price,
    cost: opt(p.cost), retail_unit: p.retail?.unit ?? null, retail_per_unit: p.retail?.perUnit ?? null, retail_price: p.retail?.price ?? null,
    barcode: p.barcode ?? null, retail_barcode: p.retail?.barcode ?? null,
    aliases: p.aliases?.length ? p.aliases : null,
    expires_at: opt(p.expiresAt),
    lots: p.lots?.length ? p.lots : null,
  }),
  clients: (c: Client, shopId: string): Row => ({ id: c.id, shop_id: shopId, name: c.name, phone: c.phone, debt: c.debt, due_at: opt(c.dueAt), measures: c.measures ?? {} }),
  sales: (s: Sale, shopId: string): Row => ({
    id: s.id, shop_id: shopId, at: s.at, label: s.label, amount: s.amount,
    qty: opt(s.qty), product_id: opt(s.productId), client_id: opt(s.clientId),
    cost: opt(s.cost), retail: s.retail ?? false, unit: opt(s.unit), payment: s.payment ?? "especes",
  }),
  expenses: (e: Expense, shopId: string): Row => ({ id: e.id, shop_id: shopId, at: e.at, label: e.label, amount: e.amount, kind: e.kind ?? "depense" }),
  invoices: (i: Invoice, shopId: string): Row => ({
    id: i.id, shop_id: shopId, number: i.number, at: i.at, client_id: i.clientId, amount: i.amount, status: i.status,
    lines: i.lines ?? [], due_at: opt(i.dueAt), pdf_path: opt(i.pdfPath),
  }),
  reminders: (r: Reminder, shopId: string): Row => ({ id: r.id, shop_id: shopId, at: r.at, client_id: r.clientId, note: r.note }),
  shortcuts: (k: Shortcut, shopId: string): Row => ({ id: k.id, shop_id: shopId, phrase: k.phrase, does: k.does }),
  repairs: (r: Repair, shopId: string): Row => ({
    id: r.id, shop_id: shopId, at: r.at, number: r.number, client_id: opt(r.clientId), client_name: r.clientName, phone: r.phone,
    device: r.device, problem: r.problem, price: r.price, paid: r.paid, parts: r.parts, status: r.status,
    repaired_at: opt(r.repairedAt), returned_at: opt(r.returnedAt), warranty_days: opt(r.warrantyDays),
  }),
  couture_orders: (o: CoutureOrder, shopId: string): Row => ({
    id: o.id, shop_id: shopId, at: o.at, number: o.number, client_id: opt(o.clientId), client_name: o.clientName, phone: o.phone,
    garment: o.garment, fabric: o.fabric, measures: o.measures, price: o.price, paid: o.paid, due_at: opt(o.dueAt), status: o.status,
    token: o.token, note: o.note ?? "", ready_at: opt(o.readyAt), delivered_at: opt(o.deliveredAt),
  }),
};

/** Lignes d'une table fille pour une boutique. */
export function childRows(shop: Shop, table: ChildTable): Row[] {
  switch (table) {
    case "products": return shop.products.map((x) => toRow.products(x, shop.id));
    case "clients": return shop.clients.map((x) => toRow.clients(x, shop.id));
    case "sales": return shop.sales.map((x) => toRow.sales(x, shop.id));
    case "expenses": return shop.expenses.map((x) => toRow.expenses(x, shop.id));
    case "invoices": return shop.invoices.map((x) => toRow.invoices(x, shop.id));
    case "reminders": return shop.reminders.map((x) => toRow.reminders(x, shop.id));
    case "shortcuts": return shop.shortcuts.map((x) => toRow.shortcuts(x, shop.id));
    case "repairs": return (shop.repairs ?? []).map((x) => toRow.repairs(x, shop.id));
    case "couture_orders": return (shop.couture ?? []).map((x) => toRow.couture_orders(x, shop.id));
  }
}

function sameRow(a: Row, b: Row): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const x = a[k];
    const y = b[k];
    // Les lignes de facture (tableaux) se comparent par leur contenu.
    if (typeof x === "object" && x !== null && typeof y === "object" && y !== null) {
      if (JSON.stringify(x) !== JSON.stringify(y)) return false;
    } else if (!Object.is(x, y)) return false;
  }
  return true;
}

// ---------- Diff ----------

/**
 * Opérations ligne à ligne entre deux états d'une boutique.
 * before null (ou autre boutique) : tout en upsert, la boutique en premier.
 */
export function diffShop(before: Shop | null, after: Shop): Op[] {
  const prev = before && before.id === after.id ? before : null;
  const ops: Op[] = [];
  const shop = shopRow(after);
  if (!prev || !sameRow(shopRow(prev), shop)) ops.push({ table: "shops", kind: "upsert", id: after.id, row: shop });

  for (const table of CHILD_TABLES) {
    const next = childRows(after, table);
    const old = new Map<string, Row>();
    if (prev) for (const r of childRows(prev, table)) old.set(r.id as string, r);
    const seen = new Set<string>();
    for (const r of next) {
      const id = r.id as string;
      seen.add(id);
      const o = old.get(id);
      if (!o || !sameRow(o, r)) ops.push({ table, kind: "upsert", id, row: r });
    }
    for (const id of old.keys()) if (!seen.has(id)) ops.push({ table, kind: "delete", id });
  }
  return ops;
}

// ---------- File d'attente persistante ----------

export interface SyncStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

/** localStorage protégé ; mémoire si indisponible (SSR, navigation privée). */
export function defaultStorage(): SyncStorage {
  const mem = new Map<string, string>();
  return {
    get(key) {
      try {
        return globalThis.localStorage ? globalThis.localStorage.getItem(key) : (mem.get(key) ?? null);
      } catch {
        return mem.get(key) ?? null;
      }
    },
    set(key, value) {
      mem.set(key, value);
      try {
        globalThis.localStorage?.setItem(key, value);
      } catch {
        // quota plein ou stockage bloqué : la copie mémoire suffit pour la session
      }
    },
  };
}

type DbError = { message: string } | null;
type WriteResult = { error: DbError };

/** Sous-ensemble de supabase-js v2 utilisé pour l'écriture. */
export interface SyncClient {
  from(table: string): {
    upsert(rows: Row[], options: { onConflict: string }): PromiseLike<WriteResult>;
    delete(): { in(column: string, values: string[]): PromiseLike<WriteResult> };
  };
}

/** rejected : écritures refusées par les règles de la boutique (ex. un vendeur qui change un prix) et abandonnées. */
export type FlushResult = { sent: number; pending: number; error: string | null; rejected?: number };

/** Refus définitif du serveur (droits) : réessayer ne servirait à rien et bloquerait toute la file. */
export function isRefusal(error: string): boolean {
  return /row-level security|permission denied|42501|violates check constraint|offre Avancé requise/i.test(error);
}

export const QUEUE_KEY = "jokko.sync.v1";

const opKey = (op: Pick<Op, "table" | "id">) => `${op.table}:${op.id}`;

function isOp(v: unknown): v is Op {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.table === "string" && typeof o.id === "string" && (o.kind === "upsert" || o.kind === "delete");
}

function errorText(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

/** Ordre d'envoi : shops, upserts parents → enfants, puis deletes enfants → parents. */
function sortForFlush(ops: Op[]): Op[] {
  const rank = (op: Op) => {
    const t = TABLE_ORDER.indexOf(op.table);
    const pos = t < 0 ? TABLE_ORDER.length : t;
    return op.kind === "upsert" ? pos : 100 + (TABLE_ORDER.length - pos);
  };
  return ops.map((op, i) => ({ op, i })).sort((a, b) => rank(a.op) - rank(b.op) || a.i - b.i).map((x) => x.op);
}

export class SyncQueue {
  private ops = new Map<string, Op>();
  private running: Promise<FlushResult> | null = null;
  private storage: SyncStorage;
  private key: string;

  constructor(storage: SyncStorage = defaultStorage(), key = QUEUE_KEY) {
    this.storage = storage;
    this.key = key;
    try {
      const raw = storage.get(key);
      const list: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(list)) for (const op of list) if (isOp(op)) this.ops.set(opKey(op), op);
    } catch {
      // file corrompue : on repart de zéro
    }
  }

  /** Ops en attente, dans l'ordre d'arrivée. */
  get pending(): Op[] {
    return [...this.ops.values()];
  }

  get size(): number {
    return this.ops.size;
  }

  get flushing(): boolean {
    return this.running !== null;
  }

  /** Ajoute des ops ; la dernière pour un même table+id gagne. */
  push(ops: Op[]): void {
    if (!ops.length) return;
    for (const op of ops) {
      const k = opKey(op);
      this.ops.delete(k);
      this.ops.set(k, op);
    }
    this.save();
  }

  /** Envoie la file ; un seul flush à la fois (un second appel reçoit le même résultat). */
  flush(client: SyncClient): Promise<FlushResult> {
    if (!this.running) {
      this.running = this.send(client).finally(() => {
        this.running = null;
      });
    }
    return this.running;
  }

  private save() {
    try {
      this.storage.set(this.key, JSON.stringify(this.pending));
    } catch {
      // stockage injecté défaillant : on garde la file en mémoire
    }
  }

  private async send(client: SyncClient): Promise<FlushResult> {
    const ordered = sortForFlush(this.pending);
    let sent = 0;
    let rejected = 0;
    let i = 0;
    while (i < ordered.length) {
      // lot : même table et même type d'op, consécutifs
      const first = ordered[i];
      let j = i;
      while (j < ordered.length && ordered[j].table === first.table && ordered[j].kind === first.kind) j++;
      const batch = ordered.slice(i, j);
      let error: string | null = null;
      try {
        const q = client.from(first.table);
        const res =
          first.kind === "upsert"
            ? await q.upsert(batch.map((op) => op.row ?? { id: op.id }), { onConflict: "id" })
            : await q.delete().in("id", batch.map((op) => op.id));
        if (res && res.error) error = errorText(res.error);
      } catch (e) {
        error = errorText(e);
      }
      if (error !== null && !isRefusal(error)) return { sent, pending: this.ops.size, error, rejected };
      if (error !== null) {
        rejected += batch.length;
        console.warn("[jokko] écriture refusée par les règles de la boutique :", error);
      } else sent += batch.length;
      // retire seulement les ops non remplacées entre-temps par un push
      for (const op of batch) if (this.ops.get(opKey(op)) === op) this.ops.delete(opKey(op));
      this.save();
      i = j;
    }
    return { sent, pending: this.ops.size, error: null, rejected };
  }
}

// ---------- Lignes Postgres -> Shop ----------

export type ShopRows = {
  shop: Row;
  products: Row[];
  clients: Row[];
  sales: Row[];
  expenses: Row[];
  invoices: Row[];
  reminders: Row[];
  shortcuts: Row[];
  repairs?: Row[];
  couture_orders?: Row[];
};

/** numeric / bigint peuvent arriver en string. */
function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function optNum(v: unknown): number | undefined {
  return v === null || v === undefined || v === "" ? undefined : num(v);
}

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

function optStr(v: unknown): string | undefined {
  return v === null || v === undefined ? undefined : String(v);
}

/** Normalise un horodatage Postgres (« +00:00 ») au format ISO de l'appli. */
function iso(v: unknown): string {
  const s = str(v);
  const t = Date.parse(s);
  return Number.isNaN(t) ? s : new Date(t).toISOString();
}

const STATUSES: Invoice["status"][] = ["brouillon", "envoyee", "payee"];

function byAtDesc<T extends { at: string }>(list: T[]): T[] {
  const time = (x: T) => {
    const t = Date.parse(x.at);
    return Number.isNaN(t) ? -Infinity : t;
  };
  return list.map((x, i) => ({ x, i })).sort((a, b) => time(b.x) - time(a.x) || a.i - b.i).map((e) => e.x);
}

/** Lignes de facture lues depuis le jsonb (tolérant aux données incomplètes). */
function readLines(value: unknown): InvoiceLine[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((l): l is Record<string, unknown> => Boolean(l) && typeof l === "object")
    .map((l) => {
      const line: InvoiceLine = { label: str(l.label), qty: num(l.qty), unit: str(l.unit), unitPrice: num(l.unitPrice) };
      if (typeof l.productId === "string") line.productId = l.productId;
      return line;
    })
    .filter((l) => l.label);
}

export function rowsToShop(rows: ShopRows): Shop {
  const s = rows.shop;
  return {
    id: str(s.id),
    name: str(s.name),
    city: str(s.city),
    activity: str(s.activity),
    openingCash: num(s.opening_cash),
    ...(optStr(s.last_inventory_at) ? { lastInventoryAt: iso(s.last_inventory_at) } : {}),
    ...(optStr(s.address) ? { address: str(s.address) } : {}),
    ...(optStr(s.phone) ? { phone: str(s.phone) } : {}),
    ...(optStr(s.ninea) ? { ninea: str(s.ninea) } : {}),
    ...(optStr(s.payment_info) ? { paymentInfo: str(s.payment_info) } : {}),
    ...(optStr(s.invoice_note) ? { invoiceNote: str(s.invoice_note) } : {}),
    ...(optStr(s.wave_link) ? { waveLink: str(s.wave_link) } : {}),
    ...(Array.isArray(s.modules) && s.modules.length ? { modules: (s.modules as unknown[]).filter((m): m is string => typeof m === "string") } : {}),
    ...(optNum(s.lat) !== undefined && optNum(s.lng) !== undefined ? { location: { lat: num(s.lat), lng: num(s.lng), at: optStr(s.located_at) ? iso(s.located_at) : "" } } : {}),
    ...(s.plan === "medium" || s.plan === "avance" || s.plan === "gratuit"
      ? { plan: { plan: s.plan, until: optStr(s.plan_until) ? iso(s.plan_until) : null, trialUntil: optStr(s.trial_until) ? iso(s.trial_until) : null } }
      : {}),
    products: rows.products.map((r) => {
      const product: Product = { id: str(r.id), name: str(r.name), unit: str(r.unit), stock: num(r.stock), min: num(r.min), price: num(r.price) };
      const cost = optNum(r.cost);
      if (cost !== undefined) product.cost = cost;
      const perUnit = optNum(r.retail_per_unit);
      const retailUnit = optStr(r.retail_unit);
      if (retailUnit && perUnit) {
        product.retail = { unit: retailUnit, perUnit, price: optNum(r.retail_price) ?? 0 };
        const retailCode = optStr(r.retail_barcode);
        if (retailCode) product.retail.barcode = retailCode;
      }
      const code = optStr(r.barcode);
      if (code) product.barcode = code;
      const expires = optStr(r.expires_at);
      if (expires) product.expiresAt = expires.slice(0, 10);
      if (Array.isArray(r.lots)) {
        const lots = (r.lots as Row[])
          .map((l) => ({ expiresAt: str(l.expiresAt).slice(0, 10), qty: num(l.qty), ...(optStr(l.lot) ? { lot: str(l.lot) } : {}) }))
          .filter((l) => /^\d{4}-\d{2}-\d{2}$/.test(l.expiresAt) && l.qty > 0);
        if (lots.length) product.lots = lots;
      }
      if (Array.isArray(r.aliases)) {
        const aliases = (r.aliases as unknown[]).map((a) => String(a ?? "").trim()).filter(Boolean);
        if (aliases.length) product.aliases = aliases;
      }
      return product;
    }),
    clients: rows.clients.map((r) => {
      const client: Client = { id: str(r.id), name: str(r.name), phone: str(r.phone), debt: num(r.debt) };
      const due = optStr(r.due_at);
      if (due) client.dueAt = iso(due);
      const measures = readMeasures(r.measures);
      if (Object.keys(measures).length) client.measures = measures;
      return client;
    }),
    sales: byAtDesc(
      rows.sales.map((r) => {
        const sale: Sale = { id: str(r.id), at: iso(r.at), label: str(r.label), amount: num(r.amount) };
        const qty = optNum(r.qty);
        const productId = optStr(r.product_id);
        const clientId = optStr(r.client_id);
        if (qty !== undefined) sale.qty = qty;
        if (productId !== undefined) sale.productId = productId;
        if (clientId !== undefined) sale.clientId = clientId;
        const cost = optNum(r.cost);
        if (cost !== undefined) sale.cost = cost;
        if (r.retail === true) sale.retail = true;
        const unit = optStr(r.unit);
        if (unit) sale.unit = unit;
        if (r.payment === "wave" || r.payment === "om" || r.payment === "credit") sale.payment = r.payment;
        if (r.checked === true) sale.checked = true;
        return sale;
      }),
    ),
    expenses: byAtDesc(
      rows.expenses.map((r) => {
        const expense: Expense = { id: str(r.id), at: iso(r.at), label: str(r.label), amount: num(r.amount) };
        if (r.kind === "perte" || r.kind === "achat") expense.kind = r.kind;
        return expense;
      }),
    ),
    invoices: byAtDesc(
      rows.invoices.map((r) => {
        const status = str(r.status) as Invoice["status"];
        const invoice: Invoice = {
          id: str(r.id), number: str(r.number), at: iso(r.at), clientId: str(r.client_id), amount: num(r.amount),
          status: STATUSES.includes(status) ? status : "brouillon",
        };
        const lines = readLines(r.lines);
        if (lines.length) invoice.lines = lines;
        const due = optStr(r.due_at);
        if (due) invoice.dueAt = iso(due);
        const pdf = optStr(r.pdf_path);
        if (pdf) invoice.pdfPath = pdf;
        return invoice;
      }),
    ),
    reminders: byAtDesc(rows.reminders.map((r) => ({ id: str(r.id), at: iso(r.at), clientId: str(r.client_id), note: str(r.note) }))),
    shortcuts: rows.shortcuts.map((r) => ({ id: str(r.id), phrase: str(r.phrase), does: str(r.does) })),
    ...(rows.repairs?.length ? { repairs: byAtDesc(rows.repairs.map(readRepair)) } : {}),
    ...(rows.couture_orders?.length ? { couture: byAtDesc(rows.couture_orders.map(readCouture)) } : {}),
  };
}

/** Mesures en cm : on ne garde que les nombres positifs. */
function readMeasures(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const [k, n] of Object.entries(v as Record<string, unknown>)) if (typeof n === "number" && Number.isFinite(n) && n > 0) out[k] = n;
  }
  return out;
}

const COUTURE_STATUSES: CoutureOrder["status"][] = ["recu", "coupe", "couture", "finition", "pret", "livre", "annule"];
function readCouture(r: Row): CoutureOrder {
  const status = str(r.status) as CoutureOrder["status"];
  const order: CoutureOrder = {
    id: str(r.id), at: iso(r.at), number: str(r.number), clientName: str(r.client_name), phone: str(r.phone),
    garment: str(r.garment), fabric: str(r.fabric), measures: readMeasures(r.measures), price: num(r.price), paid: num(r.paid),
    status: COUTURE_STATUSES.includes(status) ? status : "recu", token: str(r.token),
  };
  const clientId = optStr(r.client_id);
  if (clientId) order.clientId = clientId;
  const due = optStr(r.due_at);
  if (due) order.dueAt = due.slice(0, 10);
  if (optStr(r.note)) order.note = str(r.note);
  if (optStr(r.ready_at)) order.readyAt = iso(r.ready_at);
  if (optStr(r.delivered_at)) order.deliveredAt = iso(r.delivered_at);
  return order;
}

const REPAIR_STATUSES: Repair["status"][] = ["depot", "repare", "rendu", "annule"];
function readRepair(r: Row): Repair {
  const status = str(r.status) as Repair["status"];
  const repair: Repair = {
    id: str(r.id), at: iso(r.at), number: str(r.number), clientName: str(r.client_name), phone: str(r.phone),
    device: str(r.device), problem: str(r.problem), price: num(r.price), paid: num(r.paid),
    parts: Array.isArray(r.parts)
      ? (r.parts as Row[]).map((p) => ({ ...(optStr(p.productId) ? { productId: str(p.productId) } : {}), label: str(p.label), qty: num(p.qty) || 1, cost: num(p.cost) }))
      : [],
    status: REPAIR_STATUSES.includes(status) ? status : "depot",
  };
  const clientId = optStr(r.client_id);
  if (clientId) repair.clientId = clientId;
  if (optStr(r.repaired_at)) repair.repairedAt = iso(r.repaired_at);
  if (optStr(r.returned_at)) repair.returnedAt = iso(r.returned_at);
  const warranty = optNum(r.warranty_days);
  if (warranty) repair.warrantyDays = warranty;
  return repair;
}

// ---------- Chargement ----------

type SelectResult = { data: Row[] | null; error: DbError };

/** Requête de lecture chaînable et « thenable », comme le PostgrestFilterBuilder. */
export interface LoadQuery extends PromiseLike<SelectResult> {
  in(column: string, values: string[]): LoadQuery;
  order(column: string, options?: { ascending?: boolean }): LoadQuery;
  range(from: number, to: number): LoadQuery;
}

/** Sous-ensemble de supabase-js v2 utilisé pour la lecture. */
export interface LoadClient {
  from(table: string): { select(columns: string): LoadQuery };
}

/** Taille de page (PostgREST limite à 1000 lignes par défaut). */
const PAGE = 1000;

async function selectAll(client: LoadClient, table: string, column: string, ids: string[] | null): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = client.from(table).select("*");
    if (ids) q = q.in(column, ids);
    const { data, error } = await q.order("id", { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${errorText(error)}`);
    const page = data ?? [];
    out.push(...page);
    if (page.length < PAGE) return out;
  }
}

/**
 * Charge les boutiques visibles (RLS) ou celles demandées.
 * Lance une Error si une requête échoue.
 */
export async function loadShops(client: LoadClient, shopIds?: string[]): Promise<Shop[]> {
  if (shopIds && !shopIds.length) return [];
  const shops = await selectAll(client, "shops", "id", shopIds ?? null);
  const ids = shops.map((s) => str(s.id));
  if (!ids.length) return [];
  const children = await Promise.all(CHILD_TABLES.map((t) => selectAll(client, t, "shop_id", ids)));
  const byTable = new Map<ChildTable, Row[]>(CHILD_TABLES.map((t, i) => [t, children[i]]));
  const pick = (t: ChildTable, id: string) => (byTable.get(t) ?? []).filter((r) => str(r.shop_id) === id);
  // garde l'ordre demandé si des ids sont fournis
  const ordered = shopIds ? shopIds.map((id) => shops.find((s) => str(s.id) === id)).filter((s): s is Row => !!s) : shops;
  return ordered.map((shop) => {
    const id = str(shop.id);
    return rowsToShop({
      shop,
      products: pick("products", id),
      clients: pick("clients", id),
      sales: pick("sales", id),
      expenses: pick("expenses", id),
      invoices: pick("invoices", id),
      reminders: pick("reminders", id),
      shortcuts: pick("shortcuts", id),
      repairs: pick("repairs", id),
      couture_orders: pick("couture_orders", id),
    });
  });
}
