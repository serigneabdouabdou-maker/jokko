// node render-ov.mjs '<json params>' <dossier_sortie> <durée_s>
// Rend la couche transparente (PNG avec alpha) à 24 i/s.
import { chromium } from 'playwright';
import path from 'node:path'; import fs from 'node:fs';
const [json, outDir, durS] = process.argv.slice(2);
const DUR = +durS, FPS = 24, N = Math.round(DUR * FPS);
fs.mkdirSync(outDir, { recursive: true });
const params = JSON.parse(json); params.dur = DUR;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await p.goto('file://' + path.resolve('overlay.html') + '#' + encodeURIComponent(JSON.stringify(params)));
await p.waitForFunction(() => window.READY === true, null, { timeout: 20000 });
for (let i = 0; i < N; i++) {
  await p.evaluate(t => window.seek(t), i / FPS);
  await p.screenshot({ path: path.join(outDir, `f${String(i).padStart(4, '0')}.png`), omitBackground: true });
}
await b.close(); console.log('ok', outDir, N);
