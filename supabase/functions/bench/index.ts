// Banc d'essai TEMPORAIRE : chronomètre les modèles de conversation Gemini avec une phrase wolof.
// Réservé aux comptes connectés. À supprimer après la comparaison.
import { GoogleGenAI } from "npm:@google/genai@2.32.0";
import { liveConfig } from "https://raw.githubusercontent.com/serigneabdouabdou-maker/jokko/7ace2866c6dc37b29b7e97091925f23ab25f8aa8/server/assistant/live.ts";

const shop = {
  language: "wo" as const,
  products: [
    { id: "p-riz", name: "Riz brisé", unit: "sac", stock: 12, min: 4, price: 18000 },
    { id: "p-huile", name: "Huile", unit: "bidon", stock: 3, min: 5, price: 7500 },
  ],
  clients: [{ id: "c-moussa", name: "Moussa Ndiaye", debt: 20000 }],
  figures: { openingCash: 20000, daySales: 18000, dayExpenses: 2500, expectedCash: 35500 },
};

async function run(model: string, phrase: string) {
  const ai = new GoogleGenAI({ apiKey: Deno.env.get("GEMINI_API_KEY") ?? "" });
  const t0 = performance.now();
  const ms = () => Math.round(performance.now() - t0);
  const out: Record<string, unknown> = { model };
  let said = "";
  let resolveDone: () => void = () => {};
  const done = new Promise<void>((r) => (resolveDone = r));
  try {
    const session = await ai.live.connect({
      model,
      config: liveConfig(shop),
      callbacks: {
        onmessage: (m) => {
          if (m.setupComplete && out.pret_ms === undefined) out.pret_ms = ms();
          const c = m.serverContent;
          if (c?.modelTurn?.parts?.some((p) => p.inlineData) && out.premier_son_ms === undefined) out.premier_son_ms = ms();
          if (c?.outputTranscription?.text) said += c.outputTranscription.text;
          if (m.toolCall?.functionCalls?.length) {
            out.outil_ms ??= ms();
            out.outils = m.toolCall.functionCalls.map((f) => ({ nom: f.name, args: f.args }));
            session.sendToolResponse({
              functionResponses: m.toolCall.functionCalls.map((f) => ({
                id: f.id,
                name: f.name,
                response: f.name === "enregistrer"
                  ? { statut: "enregistre", resume: "Vente · 10 000 F", montant_francs: 10000, montant_en_wolof: "ñaari junni", stock_bas: [] }
                  : shop,
              })),
            });
          }
          if (c?.turnComplete && out.premier_son_ms !== undefined) {
            out.fin_ms = ms();
            resolveDone();
          }
        },
        onerror: (e) => {
          out.erreur = String((e as ErrorEvent).message ?? e).slice(0, 200);
          resolveDone();
        },
        onclose: (e) => {
          if (out.fin_ms === undefined) out.ferme = `${e.code} ${String(e.reason).slice(0, 200)}`;
          resolveDone();
        },
      },
    });
    out.connexion_ms = ms();
    session.sendClientContent({ turns: [{ role: "user", parts: [{ text: phrase }] }], turnComplete: true });
    out.envoi_ms = ms();
    await Promise.race([done, new Promise((r) => setTimeout(r, 20000))]);
    out.jokko_dit = said;
    try {
      session.close();
    } catch {
      // déjà fermé
    }
  } catch (e) {
    out.erreur = String((e as Error).message ?? e).slice(0, 300);
  }
  return out;
}

Deno.serve(async (req) => {
  const { models, phrase } = await req.json().catch(() => ({}));
  const list: string[] = Array.isArray(models) ? models.slice(0, 3) : ["gemini-2.5-flash-native-audio-latest", "gemini-3.8-live"];
  const results = [];
  for (const m of list) results.push(await run(String(m), String(phrase ?? "Jaay naa ñaari junni")));
  return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
});
