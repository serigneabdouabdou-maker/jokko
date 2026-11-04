import { chromium } from "playwright";
import fs from "node:fs";
fs.mkdirSync("shots", { recursive: true });
const UA = "Mozilla/5.0 (Linux; Android 14; SM-A146B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, locale: "fr-FR" });
// Notifications « pas encore demandées » (comme un téléphone neuf).
await ctx.addInitScript(() => {
  try {
    Object.defineProperty(Notification, "permission", { get: () => "default" });
  } catch {}
});
const B = "http://localhost:4173";
async function open(url, wait = 3500) {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("ERREUR", url, e.message));
  await p.goto(B + url, { waitUntil: "load", timeout: 30000 }).catch((e) => console.log("goto", url, e.message));
  await p.evaluate(() => document.fonts && document.fonts.ready);
  await p.waitForTimeout(wait);
  return p;
}
const ready = (p) =>
  p.evaluate(() => {
    const j = window.__jokko;
    j.setAssistant("ready");
  });
async function shot(p, name) {
  await p.waitForTimeout(500);
  await p.screenshot({ path: `shots/${name}.png` });
  console.log("ok", name);
}
async function step(name, fn) {
  try {
    await fn();
  } catch (e) {
    console.log("ECHEC", name, e.message);
  }
}

await step("voile", async () => { const p = await open("/", 6000); await shot(p, "00-voile"); await p.close(); });
await step("android", async () => { const p = await open("/android/"); await shot(p, "01-android"); await p.close(); });
await step("creer", async () => { const p = await open("/capture.html?v=creer"); await shot(p, "02-creer"); await p.close(); });
await step("parler", async () => {
  const p = await open("/capture.html?ecran=parler");
  await ready(p);
  await shot(p, "03-parler");
  // Le micro écoute (état réel de la barre vocale).
  await p.evaluate(() => {
    window.__jokko.setVoice("ecoute");
    window.__jokko.setLive({ phase: "ecoute", caption: "Jaay naa ñaari sac ceeb" });
  });
  await shot(p, "04-ecoute");
  // Vente enregistrée : bulle du commerçant, bulle de Jokko, réponse avec Annuler.
  await p.evaluate(() => {
    const j = window.__jokko;
    j.setLive(null);
    j.setVoice("succes");
    const at = new Date().toISOString();
    j.setMessages((m) => [...m, { id: "u1", role: "user", text: "Jaay naa ñaari sac ceeb", at }, { id: "j1", role: "jokko", text: "✓ Vente : 2 Sac de riz · 34 000 F", at }]);
    j.setReply({ text: "C’est enregistré.", summary: "Vente : 2 Sac de riz · 34 000 F", tone: "ok", undo: true });
  });
  await p.evaluate(() => document.querySelector(".log")?.scrollIntoView({ block: "end" }));
  await shot(p, "05-vente");
  await p.close();
});
await step("stock", async () => {
  const p = await open("/capture.html?ecran=stock");
  await ready(p);
  await p.getByRole("button", { name: /Ajouter en parlant/ }).first().click();
  await p.waitForTimeout(1200);
  await shot(p, "06-stock-ajout");
  await p.locator("text=Photo d'une facture").first().scrollIntoViewIfNeeded().catch(() => {});
  await shot(p, "06b-stock-photo");
  await p.close();
});
await step("reglages", async () => {
  const p = await open("/capture.html?ecran=reglages");
  await ready(p);
  const btn = p.getByRole("button", { name: /Activer les notifications/ }).first();
  await btn.scrollIntoViewIfNeeded().catch(() => {});
  await p.evaluate(() => window.scrollBy(0, 120));
  await shot(p, "07-notifications");
  await p.close();
});
for (const [ecran, name] of [["equipe", "08-equipe"], ["offre", "09-offre"], ["dettes", "10-dettes"]]) {
  await step(ecran, async () => { const p = await open(`/capture.html?ecran=${ecran}`); await ready(p); await p.evaluate(() => document.querySelector(".screen")?.scrollIntoView({ block: "start" })); await shot(p, name); await p.close(); });
}
await browser.close();
