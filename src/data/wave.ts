import { SUPABASE_KEY, SUPABASE_URL, supabase } from "./supabase";

/**
 * Wave Business : le patron enregistre ses clés une fois (elles restent sur le serveur) ;
 * au comptoir, Jokko crée un lien de paiement, le client paie, Wave confirme, la vente s'enregistre.
 */

export type WaveStatus = "open" | "succeeded" | "cancelled" | "expired" | "failed";
export type WaveSession = { id: string; url: string; expiresAt: string | null };

/** Adresse à donner à Wave pour les confirmations (webhook) de cette boutique. */
export function waveWebhookUrl(shopId: string): string {
  return `${SUPABASE_URL}/functions/v1/wave/webhook/${encodeURIComponent(shopId)}`;
}

export async function waveReady(shopId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("wave_ready", { p_shop: shopId });
  return !error && data === true;
}

export async function saveWaveKeys(shopId: string, apiKey: string, webhookSecret: string): Promise<string | null> {
  const { error } = await supabase.rpc("set_wave_keys", { p_shop: shopId, p_api_key: apiKey.trim(), p_webhook_secret: webhookSecret.trim() });
  if (!error) return null;
  if (/clé API/i.test(error.message)) return "La clé API ne ressemble pas à une clé Wave (elle commence par « wave_ »).";
  if (/secret/i.test(error.message)) return "Le secret de signature est trop court : copie-le en entier.";
  if (/patron/i.test(error.message)) return "Seul le patron peut brancher Wave.";
  return "Enregistrement impossible. Vérifie la connexion internet.";
}

export async function removeWaveKeys(shopId: string): Promise<boolean> {
  const { error } = await supabase.rpc("remove_wave_keys", { p_shop: shopId });
  return !error;
}

async function call(route: "checkout" | "check", body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> | null }> {
  const { data } = await supabase.auth.getSession();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/wave/${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify(body),
  });
  return { ok: response.ok, data: (await response.json().catch(() => null)) as Record<string, unknown> | null };
}

/** Crée un lien de paiement Wave pour ce montant (le numéro du client limite qui peut payer, s'il est donné). */
export async function startWave(shopId: string, amount: number, reference: string, payerPhone?: string): Promise<{ ok: true; session: WaveSession } | { ok: false; message: string }> {
  try {
    const digits = (payerPhone ?? "").replace(/\D/g, "");
    const payerMobile = digits.length === 9 ? `+221${digits}` : digits.length === 12 && digits.startsWith("221") ? `+${digits}` : undefined;
    const { ok, data } = await call("checkout", { shopId, amount: Math.round(amount), reference, payerMobile });
    if (ok && data && typeof data.id === "string" && typeof data.url === "string") {
      return { ok: true, session: { id: data.id, url: data.url, expiresAt: typeof data.expiresAt === "string" ? data.expiresAt : null } };
    }
    return { ok: false, message: typeof data?.message === "string" ? data.message : "Wave ne répond pas pour le moment. Réessaie." };
  } catch {
    return { ok: false, message: "Pas de connexion internet. Réessaie." };
  }
}

/** Redemande l'état à Wave (utile si la confirmation tarde). */
export async function checkWave(id: string): Promise<WaveStatus | null> {
  try {
    const { ok, data } = await call("check", { id });
    return ok && typeof data?.status === "string" ? (data.status as WaveStatus) : null;
  } catch {
    return null;
  }
}

/** Suit un paiement en direct ; renvoie de quoi arrêter. */
export function watchWave(id: string, onStatus: (status: WaveStatus) => void): () => void {
  const channel = supabase
    .channel(`wave-${id}`)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "wave_payments", filter: `id=eq.${id}` }, (payload) => {
      const status = (payload.new as { status?: string }).status;
      if (status) onStatus(status as WaveStatus);
    })
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
