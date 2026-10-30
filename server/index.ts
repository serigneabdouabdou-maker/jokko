import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { handleAssistant } from "./assistant/http.ts";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Sans .env.local, Jokko démarre en mode local, sans Gemini.
}
if (process.env.VITE_GEMINI_API_KEY) {
  throw new Error("VITE_GEMINI_API_KEY est interdit. Utilise GEMINI_API_KEY.");
}

const env = {
  apiKey: process.env.GEMINI_API_KEY,
  model: process.env.GEMINI_MODEL,
  ttsModel: process.env.GEMINI_TTS_MODEL,
  voice: process.env.GEMINI_TTS_VOICE,
  liveModel: process.env.GEMINI_LIVE_MODEL,
};
const root = resolve("dist");
const port = Number(process.env.PORT ?? 8787);
const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".json": "application/json",
};

createServer(async (req, res) => {
  if (await handleAssistant(req, res, env)) return;
  const path = decodeURIComponent(new URL(req.url ?? "/", "http://jokko.local").pathname);
  let file = normalize(join(root, path));
  if (file !== root && !file.startsWith(root + sep)) {
    res.statusCode = 403;
    res.end();
    return;
  }
  try {
    if (path.endsWith("/")) file = join(file, "index.html");
    const data = await readFile(file);
    res.setHeader("Content-Type", types[extname(file)] ?? "application/octet-stream");
    res.end(data);
  } catch {
    const html = await readFile(join(root, "index.html"));
    res.setHeader("Content-Type", types[".html"]);
    res.end(html);
  }
}).listen(port, () => {
  console.log(`Jokko sur http://localhost:${port} · Gemini ${env.apiKey ? "configuré" : "non configuré"}`);
});
