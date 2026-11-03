import { createClient } from "npm:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.9.6";

/**
 * Clé de signature de l'application Android : remise UNIQUEMENT à la construction officielle
 * (GitHub Actions du dépôt Jokko, branche main), prouvée par un jeton OIDC signé par GitHub.
 */
const REPO = "serigneabdouabdou-maker/jokko";
const AUDIENCE = "jokko-android";
const jwks = createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "methode" });
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "jeton" });
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: "https://token.actions.githubusercontent.com", audience: AUDIENCE });
    const okRepo = payload.repository === REPO;
    const okRef = payload.ref === "refs/heads/main";
    const okEvent = payload.event_name === "push" || payload.event_name === "workflow_dispatch";
    if (!okRepo || !okRef || !okEvent) return json(403, { error: "refuse" });
  } catch {
    return json(401, { error: "jeton" });
  }
  const { data, error } = await admin.rpc("android_signing");
  if (error || !data) return json(500, { error: "cle" });
  return json(200, data);
});
