// Jokko — notifications envoyées même quand l'appli est fermée (Web Push).
// Appelée par la base de données seulement (en-tête secret) :
//  - { kind: "journal", id } : une action dans une boutique ; si c'est une alerte GRAVE, le patron est prévenu.
//  - { kind: "summary" } : chaque heure ; résumé du jour à ceux qui l'ont demandé à cette heure (heure de Dakar).
// Les règles d'alerte et le résumé sont les mêmes que dans l'appli (fichiers du dépôt, figés sur une version).
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { detectAlerts } from "https://raw.githubusercontent.com/serigneabdouabdou-maker/jokko/8f7f67f42bf6f4883fd3a66d27a3902f5d72f36b/src/data/alerts.ts";
import { rowsToShop, type ShopRows } from "https://raw.githubusercontent.com/serigneabdouabdou-maker/jokko/8f7f67f42bf6f4883fd3a66d27a3902f5d72f36b/src/data/sync.ts";
import { shortSummary } from "https://raw.githubusercontent.com/serigneabdouabdou-maker/jokko/8f7f67f42bf6f4883fd3a66d27a3902f5d72f36b/src/data/summary.ts";

type Row = Record<string, unknown>;
type JournalRow = { id: number; shop_id: string; at: string; user_id: string | null; tbl: string; row_id: string; action: "ajout" | "modification" | "suppression"; before: Row | null; after: Row | null };

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CHILDREN = ["products", "clients", "sales", "expenses", "invoices", "reminders", "shortcuts"] as const;
let config: { vapid_public: string; vapid_private: string; notify_secret: string } | null = null;

async function loadConfig() {
  if (config) return config;
  const { data, error } = await admin.rpc("notify_config");
  if (error || !data?.vapid_private) throw new Error("configuration manquante");
  config = data;
  webpush.setVapidDetails("mailto:cfallou26@gmail.com", data.vapid_public, data.vapid_private);
  return config!;
}

async function loadShop(shopId: string, salesSince?: string) {
  const { data: shop } = await admin.from("shops").select("*").eq("id", shopId).maybeSingle();
  if (!shop) return null;
  const rows: Record<string, Row[]> = {};
  await Promise.all(
    CHILDREN.map(async (t) => {
      let q = admin.from(t).select("*").eq("shop_id", shopId);
      if (salesSince && (t === "sales" || t === "expenses")) q = q.gte("at", salesSince);
      const { data } = await q.limit(5000);
      rows[t] = data ?? [];
    }),
  );
  return rowsToShop({ shop, ...rows } as ShopRows);
}

async function patronsOf(shopId: string): Promise<string[]> {
  const { data } = await admin.from("shop_members").select("user_id").eq("shop_id", shopId).eq("role", "patron");
  return (data ?? []).map((m) => m.user_id as string);
}

/** Envoie à tous les téléphones de ces personnes ; les abonnements morts sont effacés. */
async function push(userIds: string[], payload: { title: string; body: string; url?: string; tag?: string }) {
  if (!userIds.length) return 0;
  const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").in("user_id", userIds);
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 6 * 3600, urgency: "high" });
      sent++;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await admin.from("push_subscriptions").delete().eq("id", s.id);
      else console.warn("[jokko] push échoué", status ?? "");
    }
  }
  return sent;
}

async function onJournal(id: number) {
  // On laisse arriver la vente qui accompagne une baisse de stock (elles sont envoyées l'une après l'autre).
  await new Promise((r) => setTimeout(r, 8000));
  const { data: row } = await admin.from("journal").select("*").eq("id", id).maybeSingle();
  if (!row) return 0;
  const from = new Date(Date.parse(row.at) - 10 * 60_000).toISOString();
  const to = new Date(Date.parse(row.at) + 10 * 60_000).toISOString();
  const { data: around } = await admin.from("journal").select("*").eq("shop_id", row.shop_id).gte("at", from).lte("at", to).limit(500);
  const [shop, patrons] = await Promise.all([loadShop(row.shop_id, new Date().toISOString()), patronsOf(row.shop_id)]);
  if (!shop) return 0;
  const alert = detectAlerts((around ?? []) as JournalRow[], shop.products, new Set(patrons)).find((a) => a.id === String(id));
  if (!alert || alert.level !== "grave") return 0;
  // La personne qui a fait l'action n'est pas prévenue de sa propre action.
  const targets = patrons.filter((p) => p !== row.user_id);
  return push(targets, { title: `⚠️ Jokko · ${shop.name}`, body: alert.text, url: "./?ecran=distance", tag: `alerte-${id}` });
}

async function onSummary() {
  const hour = new Date().getUTCHours(); // Dakar = UTC
  const { data: profiles } = await admin.from("profiles").select("user_id").eq("summary_hour", hour);
  let sent = 0;
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  for (const p of profiles ?? []) {
    const { data: shops } = await admin.from("shop_members").select("shop_id").eq("user_id", p.user_id).eq("role", "patron");
    for (const m of shops ?? []) {
      const shop = await loadShop(m.shop_id as string, dayStart.toISOString());
      if (!shop) continue;
      const patrons = await patronsOf(shop.id);
      const { data: rows } = await admin.from("journal").select("*").eq("shop_id", shop.id).gte("at", dayStart.toISOString()).limit(2000);
      const graves = detectAlerts((rows ?? []) as JournalRow[], shop.products, new Set(patrons)).filter((a) => a.level === "grave").length;
      const { title, body } = shortSummary(shop, graves);
      sent += await push([p.user_id as string], { title, body, url: "./?ecran=distance", tag: `resume-${shop.id}` });
    }
  }
  return sent;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });
  let cfg;
  try {
    cfg = await loadConfig();
  } catch {
    return new Response("not_configured", { status: 503 });
  }
  if (req.headers.get("x-jokko-notify") !== cfg.notify_secret) return new Response("forbidden", { status: 403 });
  const body = await req.json().catch(() => ({}));
  try {
    const sent = body.kind === "journal" && Number.isFinite(body.id) ? await onJournal(Number(body.id)) : body.kind === "summary" ? await onSummary() : 0;
    return Response.json({ sent });
  } catch (error) {
    console.warn("[jokko] notify:", error instanceof Error ? error.message : "erreur");
    return new Response("error", { status: 500 });
  }
});
