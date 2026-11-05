// Jokko — notifications envoyées même quand l'appli est fermée (Web Push dans le navigateur, Firebase dans l'application Android).
// Appelée par la base de données seulement (en-tête secret) :
//  - { kind: "journal", id } : une action dans une boutique ; le patron est prévenu des alertes GRAVES,
//    et (selon son choix) des ventes, dépenses, factures et dettes payées — un panier = une seule notification.
//  - { kind: "summary" } : chaque heure ; résumé du jour à ceux qui l'ont demandé à cette heure (heure de Dakar).
// Les règles d'alerte et le résumé sont les mêmes que dans l'appli (fichiers du dépôt, figés sur une version).
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { importPKCS8, SignJWT } from "npm:jose@5.9.6";
import { detectAlerts } from "https://raw.githubusercontent.com/serigneabdouabdou-maker/jokko/8f7f67f42bf6f4883fd3a66d27a3902f5d72f36b/src/data/alerts.ts";
import { rowsToShop, type ShopRows } from "https://raw.githubusercontent.com/serigneabdouabdou-maker/jokko/8f7f67f42bf6f4883fd3a66d27a3902f5d72f36b/src/data/sync.ts";
import { shortSummary } from "https://raw.githubusercontent.com/serigneabdouabdou-maker/jokko/8f7f67f42bf6f4883fd3a66d27a3902f5d72f36b/src/data/summary.ts";
import { activityNotice, activityTargets, type ActivityPref } from "https://raw.githubusercontent.com/serigneabdouabdou-maker/jokko/a15d9575a1e3c6ae465afd684774cea89a64fc2d/src/data/activity.ts";

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

// ---------- Firebase (application Android) ----------
// Clé du compte de service Firebase : secret FCM_SERVICE_ACCOUNT (le JSON complet), mis par le patron dans Supabase.
type ServiceAccount = { project_id: string; client_email: string; private_key: string };
let fcmAccount: ServiceAccount | null | undefined;
let fcmToken: { value: string; until: number } | null = null;

function serviceAccount(): ServiceAccount | null {
  if (fcmAccount) return fcmAccount; // une clé absente est relue la fois suivante (secret ajouté entre-temps)
  try {
    const raw = Deno.env.get("FCM_SERVICE_ACCOUNT");
    const parsed = raw ? JSON.parse(raw) : null;
    fcmAccount = parsed?.private_key && parsed?.client_email && parsed?.project_id ? parsed : null;
  } catch {
    fcmAccount = null;
  }
  return fcmAccount;
}

async function fcmAccess(sa: ServiceAccount): Promise<string> {
  if (fcmToken && fcmToken.until > Date.now() + 60_000) return fcmToken.value;
  const key = await importPKCS8(sa.private_key, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error("firebase: jeton refusé");
  fcmToken = { value: data.access_token, until: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
  return fcmToken.value;
}

/** Application Android : envoie par Firebase ; les jetons morts (appli désinstallée) sont effacés. */
async function pushFcm(userIds: string[], payload: { title: string; body: string; url?: string; tag?: string }) {
  const sa = serviceAccount();
  if (!sa) return 0;
  const { data: rows } = await admin.from("push_fcm_tokens").select("token").in("user_id", userIds);
  if (!rows?.length) return 0;
  let access: string;
  try {
    access = await fcmAccess(sa);
  } catch (error) {
    console.warn("[jokko] firebase:", error instanceof Error ? error.message : "erreur");
    return 0;
  }
  let sent = 0;
  for (const { token } of rows) {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: payload.title, body: payload.body },
          data: { url: payload.url ?? "/", tag: payload.tag ?? "" },
          android: {
            priority: "HIGH",
            ttl: "21600s",
            notification: { channel_id: "jokko", icon: "ic_stat_jokko", color: "#F6B800", tag: payload.tag || undefined, default_sound: true },
          },
        },
      }),
    }).catch(() => null);
    if (res?.ok) {
      sent++;
      continue;
    }
    const text = res ? await res.text().catch(() => "") : "";
    if (res && (res.status === 404 || /UNREGISTERED/.test(text))) {
      await admin.from("push_fcm_tokens").delete().eq("token", token);
    } else console.warn("[jokko] firebase envoi échoué", res?.status ?? "réseau");
  }
  return sent;
}

/** Envoie à tous les téléphones de ces personnes (navigateur + application Android) ; les abonnements morts sont effacés. */
async function push(userIds: string[], payload: { title: string; body: string; url?: string; tag?: string }) {
  if (!userIds.length) return 0;
  const viaApp = await pushFcm(userIds, payload).catch(() => 0);
  return viaApp + (await pushWeb(userIds, payload));
}

async function pushWeb(userIds: string[], payload: { title: string; body: string; url?: string; tag?: string }) {
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
  // On laisse arriver la vente qui accompagne une baisse de stock, et les autres articles du même panier
  // (au-delà de BASKET_GAP_MS = 20 s, c'est une autre vente).
  await new Promise((r) => setTimeout(r, 21_000));
  const { data: row } = await admin.from("journal").select("*").eq("id", id).maybeSingle();
  if (!row) return 0;
  const from = new Date(Date.parse(row.at) - 10 * 60_000).toISOString();
  const to = new Date(Date.parse(row.at) + 10 * 60_000).toISOString();
  const { data: around } = await admin.from("journal").select("*").eq("shop_id", row.shop_id).gte("at", from).lte("at", to).limit(500);
  const [shop, patrons] = await Promise.all([loadShop(row.shop_id, new Date().toISOString()), patronsOf(row.shop_id)]);
  if (!shop) return 0;
  let sent = 0;
  const alert = detectAlerts((around ?? []) as JournalRow[], shop.products, new Set(patrons)).find((a) => a.id === String(id));
  if (alert && alert.level === "grave") {
    // La personne qui a fait l'action n'est pas prévenue de sa propre action.
    const targets = patrons.filter((p) => p !== row.user_id);
    sent += await push(targets, { title: `Alerte Jokko · ${shop.name}`, body: alert.text, url: "./?ecran=distance", tag: `alerte-${id}` });
  }
  sent += await activity(row as JournalRow, (around ?? []) as JournalRow[], shop.name, patrons);
  return sent;
}

/** « Votre boutique a vendu… » : au patron, selon son choix (employés seulement, tout, ou rien). */
async function activity(row: JournalRow, around: JournalRow[], shopName: string, patrons: string[]) {
  if (!patrons.length) return 0;
  const { data: prefs } = await admin.from("profiles").select("user_id, notify_activity, owner").in("user_id", [...new Set([...patrons, ...(row.user_id ? [row.user_id] : [])])]);
  const prefOf = new Map((prefs ?? []).map((p) => [p.user_id as string, p]));
  const targets = activityTargets(patrons.map((p) => ({ user_id: p, pref: (prefOf.get(p)?.notify_activity ?? null) as ActivityPref | null })), row.user_id);
  if (!targets.length) return 0;
  // Qui a fait l'action : rien si c'est le patron, sinon le nom de l'employé.
  const actorIsPatron = row.user_id !== null && patrons.includes(row.user_id);
  const who = actorIsPatron ? "" : String(prefOf.get(row.user_id ?? "")?.owner ?? "").trim() || "un employé";
  const notice = activityNotice(row, shopName, around, who);
  if (!notice) return 0;
  return push(targets, { ...notice, url: "./?ecran=distance" });
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
      // Le résumé du soir fait partie de l'offre Avancé (essai compris).
      const { data: plan } = await admin.rpc("effective_plan", { p_shop: m.shop_id });
      if (plan !== "avance") continue;
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
    if (body.kind === "journal" && Number.isFinite(body.id)) {
      // Réponse tout de suite à la base ; le travail (attente du panier + envoi) continue en arrière-plan.
      const work = onJournal(Number(body.id)).catch((error) => console.warn("[jokko] notify:", error instanceof Error ? error.message : "erreur"));
      (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime?.waitUntil(work);
      return Response.json({ accepted: true }, { status: 202 });
    }
    if (body.kind === "fcm_check") {
      // Diagnostic (sans rien montrer de la clé) : la clé est-elle là, et Google l'accepte-t-il ?
      const sa = serviceAccount();
      if (!sa) return Response.json({ configured: false });
      try {
        await fcmAccess(sa);
        return Response.json({ configured: true, project: sa.project_id, google: "ok" });
      } catch {
        return Response.json({ configured: true, project: sa.project_id, google: "refus" });
      }
    }
    if (body.kind === "cfc" && typeof body.title === "string" && typeof body.body === "string") {
      // Équipe CFC (administrateurs) : paiements reçus, etc.
      const { data: ids } = await admin.rpc("platform_admin_ids");
      // Chaque événement a son étiquette : les notifications s'empilent au lieu de se remplacer.
      const tag = typeof body.tag === "string" && /^[a-z0-9-]{1,40}$/.test(body.tag) ? body.tag : `cfc-${Date.now()}`;
      const url = typeof body.url === "string" && body.url.startsWith("/console/") ? body.url.slice(0, 80) : "/console/?tab=activite";
      // D'abord Jokko Admin (notifications du navigateur) ; l'appli Android des boutiques seulement si Jokko Admin n'est pas branché.
      const admins = ((ids ?? []) as string[]).filter(Boolean);
      const payload = { title: body.title.slice(0, 80), body: body.body.slice(0, 200), url, tag };
      const viaWeb = await pushWeb(admins, payload);
      const sent = viaWeb > 0 ? viaWeb : await pushFcm(admins, payload).catch(() => 0);
      return Response.json({ sent });
    }
    if (body.kind === "test" && typeof body.user === "string") {
      const sent = await push([body.user], { title: "Jokko", body: "Les notifications marchent ✓ Jokko te préviendra ici, même appli fermée.", url: "/", tag: "test" });
      return Response.json({ sent });
    }
    const sent = body.kind === "summary" ? await onSummary() : 0;
    return Response.json({ sent });
  } catch (error) {
    console.warn("[jokko] notify:", error instanceof Error ? error.message : "erreur");
    return new Response("error", { status: 500 });
  }
});
