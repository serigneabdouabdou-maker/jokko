import { describe, it, expect } from "vitest";
import type { Shop } from "../model";
import {
  diffShop, loadShops, rowsToShop, SyncQueue,
  type LoadClient, type LoadQuery, type Op, type Row, type ShopRows, type SyncClient, type SyncStorage,
} from "./sync";

function fixture(): Shop {
  return {
    id: "shop-1", name: "Boutique Awa", city: "Pikine", activity: "Alimentation", openingCash: 20000,
    products: [
      { id: "p-1", name: "Riz", unit: "sac", stock: 12, min: 4, price: 18000 },
      { id: "p-2", name: "Huile", unit: "bidon", stock: 3, min: 5, price: 7500 },
    ],
    clients: [{ id: "c-1", name: "Moussa", phone: "221770000111", debt: 20000 }],
    sales: [
      { id: "s-2", at: "2026-10-30T10:00:00.000Z", label: "Huile", amount: 7500, qty: 1, productId: "p-2", clientId: "c-1" },
      { id: "s-1", at: "2026-10-30T09:00:00.000Z", label: "Divers", amount: 500 },
    ],
    expenses: [{ id: "e-1", at: "2026-10-30T08:00:00.000Z", label: "Transport", amount: 2500 }],
    invoices: [{ id: "i-1", number: "F-001", at: "2026-10-29T12:00:00.000Z", clientId: "c-1", amount: 9000, status: "envoyee" }],
    reminders: [{ id: "r-1", at: "2026-10-31T09:00:00.000Z", clientId: "c-1", note: "Relancer" }],
    shortcuts: [{ id: "k-1", phrase: "soir", does: "Fais la clôture" }],
  };
}

function memory(): SyncStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, get: (k) => data.get(k) ?? null, set: (k, v) => void data.set(k, v) };
}

type Call = { table: string; kind: "upsert" | "delete"; ids: string[]; onConflict?: string };

/** Faux client Supabase : enregistre les appels, peut échouer sur une table. */
function fakeClient(opts: { failOn?: string; throwOn?: string } = {}): SyncClient & { calls: Call[] } {
  const calls: Call[] = [];
  const result = (table: string) => {
    if (opts.throwOn === table) return Promise.reject(new Error("Failed to fetch"));
    return Promise.resolve({ error: opts.failOn === table ? { message: "réseau coupé" } : null });
  };
  return {
    calls,
    from: (table) => ({
      upsert: (rows, o) => {
        calls.push({ table, kind: "upsert", ids: rows.map((r) => String(r.id)), onConflict: o.onConflict });
        return result(table);
      },
      delete: () => ({
        in: (_col, ids) => {
          calls.push({ table, kind: "delete", ids });
          return result(table);
        },
      }),
    }),
  };
}

/** Rejoue les ops comme le ferait Postgres, puis groupe les lignes par table. */
function applyOps(ops: Op[]): ShopRows {
  const tables = new Map<string, Map<string, Row>>();
  for (const op of ops) {
    const t = tables.get(op.table) ?? new Map<string, Row>();
    tables.set(op.table, t);
    if (op.kind === "upsert" && op.row) t.set(op.id, op.row);
    else t.delete(op.id);
  }
  const list = (name: string) => [...(tables.get(name)?.values() ?? [])];
  return {
    shop: list("shops")[0], products: list("products"), clients: list("clients"), sales: list("sales"),
    expenses: list("expenses"), invoices: list("invoices"), reminders: list("reminders"), shortcuts: list("shortcuts"),
  };
}

describe("diffShop", () => {
  it("before null : tout en upsert, la boutique en premier", () => {
    const ops = diffShop(null, fixture());
    expect(ops[0]).toMatchObject({ table: "shops", kind: "upsert", id: "shop-1", row: { opening_cash: 20000 } });
    expect(ops.every((o) => o.kind === "upsert")).toBe(true);
    expect(ops).toHaveLength(1 + 2 + 1 + 2 + 1 + 1 + 1 + 1);
    expect(ops[0].row && "owner_id" in ops[0].row).toBe(false);
  });

  it("champs optionnels absents → null", () => {
    const op = diffShop(null, fixture()).find((o) => o.id === "s-1");
    expect(op?.row).toEqual({
      id: "s-1", shop_id: "shop-1", at: "2026-10-30T09:00:00.000Z", label: "Divers", amount: 500,
      qty: null, product_id: null, client_id: null, cost: null, retail: false, unit: null, payment: "especes", ticket: null, licence_id: null,
    });
  });

  it("aucun changement → aucune op", () => {
    expect(diffShop(fixture(), fixture())).toHaveLength(0);
  });

  it("ajout, modification et suppression", () => {
    const before = fixture();
    const after: Shop = {
      ...before,
      products: [{ ...before.products[0], stock: 11 }, before.products[1]],
      sales: [{ id: "s-3", at: "2026-10-30T11:00:00.000Z", label: "Riz", amount: 18000, qty: 1, productId: "p-1" }, ...before.sales],
      shortcuts: [],
    };
    const ops = diffShop(before, after);
    expect(ops).toHaveLength(3);
    expect(ops).toMatchObject([
      { table: "products", kind: "upsert", id: "p-1", row: { stock: 11, shop_id: "shop-1" } },
      { table: "sales", kind: "upsert", id: "s-3", row: { product_id: "p-1", client_id: null } },
      { table: "shortcuts", kind: "delete", id: "k-1" },
    ]);
    expect(ops[2].row).toBe(undefined);
  });

  it("modification de la boutique seule", () => {
    const before = fixture();
    const ops = diffShop(before, { ...before, openingCash: 25000 });
    expect(ops).toMatchObject([{ table: "shops", kind: "upsert", row: { opening_cash: 25000 } }]);
  });

  it("champ optionnel retiré → upsert avec null", () => {
    const before = fixture();
    const { clientId: _drop, ...rest } = before.sales[0];
    void _drop;
    const ops = diffShop(before, { ...before, sales: [rest, before.sales[1]] });
    expect(ops).toMatchObject([{ table: "sales", id: "s-2", row: { client_id: null, product_id: "p-2" } }]);
  });
});

describe("SyncQueue", () => {
  const up = (table: string, id: string, extra: Row = {}): Op => ({ table, kind: "upsert", id, row: { id, ...extra } });
  const del = (table: string, id: string): Op => ({ table, kind: "delete", id });

  it("fusionne : la dernière op pour table+id gagne, et persiste", () => {
    const store = memory();
    const q = new SyncQueue(store);
    q.push([up("products", "p-1", { stock: 5 }), up("clients", "c-1")]);
    q.push([up("products", "p-1", { stock: 4 })]);
    expect(q.size).toBe(2);
    expect(q.pending.find((o) => o.id === "p-1")?.row).toEqual({ id: "p-1", stock: 4 });
    q.push([del("products", "p-1")]);
    expect(q.pending.find((o) => o.id === "p-1")).toEqual({ table: "products", kind: "delete", id: "p-1" });
    // même id, autre table : pas de fusion
    q.push([up("sales", "p-1")]);
    expect(q.size).toBe(3);
    const reloaded = new SyncQueue(store);
    expect(reloaded.pending).toEqual(q.pending);
    expect(store.data.has("jokko.sync.v1")).toBe(true);
  });

  it("file corrompue → vide, sans exception", () => {
    const store = memory();
    store.set("jokko.sync.v1", "{pas du json");
    expect(new SyncQueue(store).size).toBe(0);
  });

  it("flush : shops d'abord, upserts groupés par table, deletes à la fin", async () => {
    const q = new SyncQueue(memory());
    q.push([
      del("products", "p-9"),
      up("sales", "s-1"),
      up("products", "p-1"),
      del("shops", "shop-old"),
      up("sales", "s-2"),
      del("sales", "s-9"),
      up("shops", "shop-1"),
    ]);
    const client = fakeClient();
    const res = await q.flush(client);
    expect(res).toEqual({ sent: 7, pending: 0, error: null, rejected: 0 });
    expect(client.calls).toEqual([
      { table: "shops", kind: "upsert", ids: ["shop-1"], onConflict: "id" },
      { table: "products", kind: "upsert", ids: ["p-1"], onConflict: "id" },
      { table: "sales", kind: "upsert", ids: ["s-1", "s-2"], onConflict: "id" },
      { table: "sales", kind: "delete", ids: ["s-9"] },
      { table: "products", kind: "delete", ids: ["p-9"] },
      { table: "shops", kind: "delete", ids: ["shop-old"] },
    ]);
    expect(q.size).toBe(0);
  });

  it("échec réseau : ops restantes conservées et persistées", async () => {
    const store = memory();
    const q = new SyncQueue(store);
    q.push(diffShop(null, fixture()));
    const res = await q.flush(fakeClient({ failOn: "sales" }));
    expect(res.error).toBe("réseau coupé");
    expect(res.sent).toBe(1 + 2 + 1); // shops, products, clients
    expect(res.pending).toBe(2 + 1 + 1 + 1 + 1);
    expect(new SyncQueue(store).pending.map((o) => o.table)).toEqual(["sales", "sales", "expenses", "invoices", "reminders", "shortcuts"]);
    // une exception levée par le client est aussi absorbée
    const thrown = await q.flush(fakeClient({ throwOn: "sales" }));
    expect(thrown).toMatchObject({ sent: 0, pending: 6, error: "Failed to fetch" });
    const ok = await q.flush(fakeClient());
    expect(ok).toEqual({ sent: 6, pending: 0, error: null, rejected: 0 });
  });

  it("écriture refusée par les règles (vendeur) : abandonnée, la file ne reste pas bloquée", async () => {
    const q = new SyncQueue(memory());
    q.push([up("shops", "shop-1"), up("sales", "s-1")]);
    const client: SyncClient = {
      from: (table) => ({
        upsert: () => Promise.resolve({ error: table === "shops" ? { message: 'new row violates row-level security policy for table "shops"' } : null }),
        delete: () => ({ in: () => Promise.resolve({ error: null }) }),
      }),
    };
    const res = await q.flush(client);
    expect(res).toEqual({ sent: 1, pending: 0, error: null, rejected: 1 });
    expect(q.size).toBe(0);
  });

  it("deux flush simultanés → un seul envoi", async () => {
    const q = new SyncQueue(memory());
    q.push([up("shops", "shop-1")]);
    const client = fakeClient();
    const [a, b] = await Promise.all([q.flush(client), q.flush(client)]);
    expect(client.calls).toHaveLength(1);
    expect(a).toEqual(b);
    expect(q.flushing).toBe(false);
  });

  it("op remplacée pendant le flush : la nouvelle version reste en file", async () => {
    const q = new SyncQueue(memory());
    q.push([up("products", "p-1", { stock: 5 })]);
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const slow: SyncClient = {
      from: () => ({
        upsert: () => gate.then(() => ({ error: null })),
        delete: () => ({ in: () => Promise.resolve({ error: null }) }),
      }),
    };
    const pending = q.flush(slow);
    q.push([up("products", "p-1", { stock: 4 })]);
    release();
    const res = await pending;
    expect(res).toEqual({ sent: 1, pending: 1, error: null, rejected: 0 });
    expect(q.pending[0].row).toEqual({ id: "p-1", stock: 4 });
  });
});

describe("rowsToShop", () => {
  it("convertit numeric/bigint reçus en string et trie par at décroissant", () => {
    const shop = rowsToShop({
      shop: { id: "shop-1", name: "B", city: "Dakar", activity: "x", opening_cash: "20000.00", owner_id: "u-1" },
      products: [{ id: "p-1", shop_id: "shop-1", name: "Riz", unit: "sac", stock: "12", min: "4", price: "18000.50" }],
      clients: [{ id: "c-1", shop_id: "shop-1", name: "Moussa", phone: "221", debt: "8500" }],
      sales: [
        { id: "s-1", shop_id: "shop-1", at: "2026-10-30T09:00:00+00:00", label: "a", amount: "500", qty: null, product_id: null, client_id: null },
        { id: "s-2", shop_id: "shop-1", at: "2026-10-30T10:00:00+00:00", label: "b", amount: "7500", qty: "2", product_id: "p-1", client_id: "c-1" },
      ],
      expenses: [
        { id: "e-1", shop_id: "shop-1", at: "2026-10-29T08:00:00Z", label: "t", amount: "100" },
        { id: "e-2", shop_id: "shop-1", at: "2026-10-30T08:00:00Z", label: "t", amount: "200" },
      ],
      invoices: [{ id: "i-1", shop_id: "shop-1", number: "F-1", at: "2026-10-29T12:00:00Z", client_id: "c-1", amount: "9000", status: "inconnu" }],
      reminders: [],
      shortcuts: [],
    });
    expect(shop.openingCash).toBe(20000);
    expect(shop.products[0]).toEqual({ id: "p-1", name: "Riz", unit: "sac", stock: 12, min: 4, price: 18000.5 });
    expect(shop.clients[0].debt).toBe(8500);
    expect(shop.sales.map((s) => s.id)).toEqual(["s-2", "s-1"]);
    expect(shop.sales[0]).toEqual({ id: "s-2", at: "2026-10-30T10:00:00.000Z", label: "b", amount: 7500, qty: 2, productId: "p-1", clientId: "c-1" });
    expect("qty" in shop.sales[1] || "productId" in shop.sales[1] || "clientId" in shop.sales[1]).toBe(false);
    expect(shop.expenses.map((e) => e.amount)).toEqual([200, 100]);
    expect(shop.invoices[0].status).toBe("brouillon");
    expect("owner_id" in shop).toBe(false);
  });

  it("aller-retour diffShop(null, shop) → rowsToShop == shop", () => {
    const shop = fixture();
    expect(rowsToShop(applyOps(diffShop(null, shop)))).toEqual(shop);
  });

  it("aller-retour après des modifications successives", () => {
    const a = fixture();
    const b: Shop = { ...a, name: "Awa & fils", clients: [], products: [a.products[1]], sales: [a.sales[1]] };
    const ops = [...diffShop(null, a), ...diffShop(a, b)];
    expect(rowsToShop(applyOps(ops))).toEqual(b);
  });
});

describe("loadShops", () => {
  /** Faux PostgREST en mémoire : in / order / range. */
  function fakeDb(tables: Record<string, Row[]>, log: string[] = []): LoadClient {
    const query = (table: string, filters: Array<[string, string[]]>, range: [number, number] | null): LoadQuery => ({
      in: (col, ids) => query(table, [...filters, [col, ids]], range),
      order: () => query(table, filters, range),
      range: (from, to) => query(table, filters, [from, to]),
      then: (ok, ko) => {
        log.push(`${table} ${filters.map(([c, v]) => `${c}=${v.join(",")}`).join(" ")}`.trim());
        let rows = (tables[table] ?? []).filter((r) => filters.every(([c, v]) => v.includes(String(r[c]))));
        rows = [...rows].sort((x, y) => String(x.id).localeCompare(String(y.id)));
        if (range) rows = rows.slice(range[0], range[1] + 1);
        return Promise.resolve({ data: rows, error: null }).then(ok, ko);
      },
    });
    return { from: (t) => ({ select: () => query(t, [], null) }) };
  }

  it("charge les boutiques visibles et répartit les lignes", async () => {
    const shop = fixture();
    const rows = applyOps(diffShop(null, shop));
    const other = applyOps(diffShop(null, { ...fixture(), id: "shop-2", name: "Deux", products: [], sales: [] }));
    // ids distincts pour la seconde boutique
    const rename = (list: Row[]) => list.map((r) => ({ ...r, id: `2-${String(r.id)}` }));
    const db: Record<string, Row[]> = {
      shops: [rows.shop, other.shop],
      products: rows.products,
      clients: [...rows.clients, ...rename(other.clients)],
      sales: rows.sales,
      expenses: [...rows.expenses, ...rename(other.expenses)],
      invoices: rows.invoices,
      reminders: rows.reminders,
      shortcuts: rows.shortcuts,
    };
    const all = await loadShops(fakeDb(db));
    expect(all.map((s) => s.id)).toEqual(["shop-1", "shop-2"]);
    expect(all[0]).toEqual(shop);
    expect(all[1].clients.map((c) => c.id)).toEqual(["2-c-1"]);

    const log: string[] = [];
    const only = await loadShops(fakeDb(db, log), ["shop-2"]);
    expect(only.map((s) => s.name)).toEqual(["Deux"]);
    expect(log[0]).toBe("shops id=shop-2");
    expect(log[1]).toBe("products shop_id=shop-2");
    expect(await loadShops(fakeDb(db), [])).toEqual([]);
  });

  it("pagine au-delà de 1000 lignes", async () => {
    const sales: Row[] = Array.from({ length: 2500 }, (_, i) => ({
      id: `s-${String(i).padStart(4, "0")}`, shop_id: "shop-1", at: "2026-10-30T09:00:00Z", label: "x", amount: 1,
      qty: null, product_id: null, client_id: null,
    }));
    const [shop] = await loadShops(fakeDb({ shops: [{ id: "shop-1", name: "B", city: "", activity: "", opening_cash: 0 }], sales }));
    expect(shop.sales).toHaveLength(2500);
  });

  it("erreur PostgREST → Error", async () => {
    const broken: LoadClient = {
      from: () => {
        const q: LoadQuery = {
          in: () => q, order: () => q, range: () => q,
          then: (ok, ko) => Promise.resolve({ data: null, error: { message: "JWT expired" } }).then(ok, ko),
        };
        return { select: () => q };
      },
    };
    let message = "";
    try {
      await loadShops(broken);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/JWT expired/);
  });
});

describe("une entreprise par métier", () => {
  it("le refus du serveur est abandonné, pas réessayé sans fin", async () => {
    const { isRefusal } = await import("./sync");
    expect(isRefusal("une entreprise par métier : ce numéro a déjà une entreprise pour cette activité")).toBe(true);
  });
});
