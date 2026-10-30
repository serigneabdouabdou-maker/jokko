import type { Connect, Plugin } from "vite";
import { loadEnv } from "vite";
import { type AssistantEnv, handleAssistant } from "./assistant/http.ts";

export function jokkoApi(): Plugin {
  let env: AssistantEnv = {};

  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    if (!req.url?.startsWith("/api/")) return next();
    handleAssistant(req, res, env)
      .then((handled) => {
        if (!handled) next();
      })
      .catch(next);
  };

  return {
    name: "jokko-api",
    configResolved(config) {
      const all = loadEnv(config.mode, config.envDir || config.root, "");
      if (all.VITE_GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY) {
        throw new Error("VITE_GEMINI_API_KEY est interdit : la clé exposerait Gemini dans le navigateur. Utilise GEMINI_API_KEY.");
      }
      env = {
        apiKey: process.env.GEMINI_API_KEY ?? all.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL ?? all.GEMINI_MODEL,
        ttsModel: process.env.GEMINI_TTS_MODEL ?? all.GEMINI_TTS_MODEL,
        voice: process.env.GEMINI_TTS_VOICE ?? all.GEMINI_TTS_VOICE,
        liveModel: process.env.GEMINI_LIVE_MODEL ?? all.GEMINI_LIVE_MODEL,
      };
    },
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
