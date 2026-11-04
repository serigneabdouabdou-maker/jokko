import { chromium } from "playwright";
import fs from "node:fs";
fs.mkdirSync("shots", { recursive: true });
const UA = "Mozilla/5.0 (Linux; Android 14; SM-A146B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, locale: "fr-FR", permissions: [] });
const B = "http://localhost:4173";
async function open(url, wait = 3500) {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("ERREUR", url, e.message));
  await p.goto(B + url, { waitUntil: "networkidle", timeout: 30000 }).catch((e) => console.log("goto", url, e.message));
  await p.evaluate(() => document.fonts && document.fonts.ready);
  await p.waitForTimeout(wait);
  return p;
}
async function shot(p, name) {
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

await step("android", async () => { const p = await open("/android/"); await shot(p, "01-android"); await p.close(); });
await step("creer", async () => { const p = await open("/capture.html?v=creer"); await shot(p, "02-creer"); await p.close(); });
await step("entrer", async () => { const p = await open("/capture.html?v=entrer"); await shot(p, "02b-entrer"); await p.close(); });
await step("parler", async () => {
  const p = await open("/capture.html?ecran=parler");
  await shot(p, "03-parler");
  const input = p.getByLabel("Commande pour Jokko");
  await input.fill("J'ai vendu 2 sacs de riz");
  await input.press("Enter");
  await p.waitForTimeout(6000);
  await shot(p, "04-vente");
  await p.close();
});
await step("stock", async () => {
  const p = await open("/capture.html?ecran=stock");
  await shot(p, "05-stock");
  await p.getByRole("button", { name: /Ajouter en parlant/ }).first().click();
  await p.waitForTimeout(1200);
  await shot(p, "06-stock-ajout");
  await p.close();
});
await step("reglages", async () => {
  const p = await open("/capture.html?ecran=reglages");
  await shot(p, "07-reglages");
  const sec = p.locator(".install-settings").filter({ hasText: "Application sur le téléphone" }).first();
  await sec.scrollIntoViewIfNeeded();
  await p.waitForTimeout(600);
  await shot(p, "08-notifications");
  await p.close();
});
for (const [ecran, name] of [["dettes", "09-dettes"], ["equipe", "10-equipe"], ["offre", "11-offre"], ["clients", "12-clients"], ["factures", "13-factures"], ["ventes", "14-ventes"]]) {
  await step(ecran, async () => { const p = await open(`/capture.html?ecran=${ecran}`); await shot(p, name); await p.close(); });
}
await browser.close();
