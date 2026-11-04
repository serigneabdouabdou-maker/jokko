// node render.mjs stills 1,5,9 outdir   |   node render.mjs video <start> <end> out.mp4
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import { spawn } from "node:child_process"; import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const ROOT = path.resolve(".");
const MIME = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".json": "application/json" };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split("?")[0])); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r); }).listen(0);
await new Promise((r) => srv.once("listening", r));
const b = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--force-device-scale-factor=1"] });
const PAGE = process.env.PAGE || "film.html"; const VW = +(process.env.VW || 1920), VH = +(process.env.VH || 1080);
const p = await b.newPage({ viewport: { width: VW, height: VH } });
p.on("pageerror", (e) => console.log("ERR", e.message)); p.on("console", (m) => m.type() === "error" && console.log("CONSOLE", m.text()));
await p.goto(`http://127.0.0.1:${srv.address().port}/${PAGE}?render`);
await p.waitForFunction(() => window.READY === true, null, { timeout: 60000 });
const [mode, a1, a2, a3] = process.argv.slice(2);
if (mode === "stills") {
  fs.mkdirSync(a2, { recursive: true });
  for (const t of a1.split(",").map(Number)) { await p.evaluate((t) => window.seek(t), t); await p.screenshot({ path: `${a2}/f${String(t).padStart(5, "0")}.jpg`, type: "jpeg", quality: 85 }); }
} else {
  const FPS = 30, s = +a1, e = +a2, out = a3, tmp = out.replace(/\.mp4$/, ".part.mp4");
  const ff = spawn("ffmpeg", ["-v", "error", "-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-r", String(FPS), tmp], { stdio: ["pipe", "inherit", "inherit"] });
  const n0 = Math.round(s * FPS), n1 = Math.round(e * FPS); const t0 = Date.now();
  for (let i = n0; i < n1; i++) {
    await p.evaluate((t) => window.seek(t), i / FPS);
    const buf = await p.screenshot({ type: "jpeg", quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    if ((i - n0) % 150 === 0) console.log(out, i - n0, "/", n1 - n0, ((Date.now() - t0) / 1000).toFixed(0) + "s");
  }
  ff.stdin.end(); const code = await new Promise((r) => ff.on("close", r));
  if (code === 0) fs.renameSync(tmp, out);
}
await b.close(); srv.close();
