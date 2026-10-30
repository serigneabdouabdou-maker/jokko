import {
  type Client,
  type Lang,
  type Shop,
  dayExpenses,
  daySales,
  debtors,
  expectedCash,
  findClient,
  findProduct,
  lowStock,
  money,
  todayStamp,
  uid,
} from "./model";

export type TalkResult = { say: string; lang: Lang; shop: Shop; wa?: string };

function digits(raw: string): number {
  return Number(raw.replace(/[^\d]/g, "")) || 0;
}

function detectLang(text: string, fallback: Lang): Lang {
  const t = text.toLowerCase();
  if (/\b(njaay|pulaar|mi |aɗa)\b/.test(t)) return "ff";
  if (/\b(jaay|ñata|nata|yónnee|yonnee|fàttali|fattali|wax|bor|des)\b/.test(t)) return "wo";
  if (/\b(sale|invoice|stock|owes|expense)\b/.test(t)) return "en";
  if (/[a-zàâçéèêëîïôùû]/i.test(t)) return "fr";
  return fallback;
}

function saySale(lang: Lang, amount: number, label: string): string {
  if (lang === "wo") return `Jaay bi dugg na. ${label}, ${money(amount)}.`;
  if (lang === "en") return `Sale recorded. ${label}, ${money(amount)}.`;
  if (lang === "ff") return `Njaayngal naatii. ${label}, ${money(amount)}.`;
  return `Vente notée. ${label}, ${money(amount)}.`;
}

function listDebts(shop: Shop, lang: Lang): string {
  const rows = debtors(shop);
  if (!rows.length) {
    if (lang === "wo") return "Amul kenn ku la ame.";
    if (lang === "en") return "Nobody owes you anything.";
    if (lang === "ff") return "Alaa ko jogii.";
    return "Personne ne te doit d'argent.";
  }
  const body = rows.map((c) => `${c.name.split(" ")[0]} ${money(c.debt)}`).join(", ");
  if (lang === "wo") return `Ñii nga ame : ${body}.`;
  if (lang === "en") return `They owe you: ${body}.`;
  if (lang === "ff") return `Ɓe njogii : ${body}.`;
  return `On te doit : ${body}.`;
}

function stockLine(shop: Shop, productName: string | undefined, lang: Lang): string {
  const lows = lowStock(shop);
  if (!productName) {
    if (!lows.length) {
      if (lang === "wo") return "Stock bi mat na. Amul lu néew.";
      if (lang === "en") return "Stock looks fine. Nothing is low.";
      return "Le stock est bon. Rien n'est bas.";
    }
    const body = lows.map((p) => `${p.name} ${p.stock}`).join(", ");
    if (lang === "wo") return `Lu néew : ${body}.`;
    if (lang === "en") return `Running low: ${body}.`;
    return `Stock bas : ${body}.`;
  }
  const p = findProduct(shop, productName);
  if (!p) {
    return lang === "wo" ? "Gisuma benn article bu ni mel." : "Je ne trouve pas cet article.";
  }
  const warn = p.stock <= p.min ? (lang === "wo" ? " Néew na." : " C'est bas.") : "";
  if (lang === "wo") return `${p.name} : ${p.stock} ${p.unit} la des.${warn}`;
  if (lang === "en") return `${p.name}: ${p.stock} ${p.unit} left.${warn}`;
  return `${p.name} : il reste ${p.stock} ${p.unit}.${warn}`;
}

function advice(shop: Shop, lang: Lang): string {
  const best = [...shop.sales].sort((a, b) => b.amount - a.amount)[0];
  const low = lowStock(shop)[0];
  const top = best ? best.label : "tes ventes";
  if (lang === "wo") {
    return low
      ? `${top} moo gën a jaay. Waaye ${low.name} néew na : yokk ko balaa nga xañ.`
      : `${top} moo gën a jaay. Stock bi mat na tey.`;
  }
  if (lang === "en") {
    return low
      ? `${top} sells best. ${low.name} is low: restock before you miss a sale.`
      : `${top} sells best. Stock is fine today.`;
  }
  return low
    ? `${top} se vend le mieux. ${low.name} est bas : réapprovisionne avant la rupture.`
    : `${top} se vend le mieux. Le stock tient aujourd'hui.`;
}

function cashSay(shop: Shop, lang: Lang): string {
  const expected = expectedCash(shop);
  if (lang === "wo") {
    return `Caisse bi : jaay ${money(daySales(shop))}, dépense ${money(dayExpenses(shop))}. War nga am ${money(expected)}.`;
  }
  if (lang === "en") {
    return `Till: sales ${money(daySales(shop))}, expenses ${money(dayExpenses(shop))}. You should have ${money(expected)}.`;
  }
  return `Caisse : ventes ${money(daySales(shop))}, dépenses ${money(dayExpenses(shop))}. Tu dois avoir ${money(expected)}.`;
}

function waLink(client: Client, text: string): string {
  return `https://wa.me/${client.phone}?text=${encodeURIComponent(text)}`;
}

export function talk(shop: Shop, text: string, fallback: Lang): TalkResult {
  const lang = detectLang(text, fallback);
  const raw = text.trim();
  const q = raw.toLowerCase();

  const saleAmount =
    q.match(/(?:vente|sale|jaay(?:\s+naa)?)\s+(?:de\s+)?(\d[\d\s.]*)/) ||
    q.match(/(\d[\d\s.]*)\s*(?:f|fcfa|francs)/);

  if (/(facture|invoice|yónnee|yonnee)/.test(q)) {
    const client = findClient(shop, q);
    const amount = digits(saleAmount?.[1] ?? q.match(/(\d[\d\s.]*)/)?.[1] ?? "");
    if (!client || !amount) {
      const say =
        lang === "wo"
          ? "Wax ma turu kiliyaan bi ak njëg li. Misaal : facture Awa 15 000."
          : "Dis-moi le client et le montant. Par exemple : facture Awa 15 000.";
      return { say, lang, shop };
    }
    const invoice = {
      id: uid("inv"),
      number: `JK-${shop.invoices.length + 1}`,
      at: todayStamp(),
      clientId: client.id,
      amount,
      status: "brouillon" as const,
    };
    const next: Shop = { ...shop, invoices: [invoice, ...shop.invoices] };
    const note = `Facture ${invoice.number} — ${shop.name} — ${money(amount)}`;
    const say =
      lang === "wo"
        ? `Facture ${invoice.number} bi pare na ngir ${client.name.split(" ")[0]} ci WhatsApp.`
        : lang === "en"
          ? `Invoice ${invoice.number} is ready for ${client.name.split(" ")[0]} on WhatsApp.`
          : `Facture ${invoice.number} prête pour ${client.name.split(" ")[0]} sur WhatsApp.`;
    return { say, lang, shop: next, wa: waLink(client, note) };
  }

  if (/(relance|rappelle|fàttali|fattali|remind)/.test(q)) {
    const client = findClient(shop, q) ?? debtors(shop)[0];
    if (!client) return { say: listDebts(shop, lang), lang, shop };
    const reminder = { id: uid("r"), at: todayStamp(), clientId: client.id, note: "Relance" };
    const next = { ...shop, reminders: [reminder, ...shop.reminders] };
    const note = `Salaam ${client.name.split(" ")[0]}, sa dette ${money(client.debt)} reste. — ${shop.name}`;
    const say =
      lang === "wo"
        ? `Fàttali naa ${client.name.split(" ")[0]}. Dette bi ${money(client.debt)}.`
        : `Relance prête pour ${client.name.split(" ")[0]}, ${money(client.debt)}.`;
    return { say, lang, shop: next, wa: waLink(client, note) };
  }

  if (/(qui me doit|ku ma ame|dette|owes|bor)/.test(q)) {
    return { say: listDebts(shop, lang), lang, shop };
  }

  if (/(caisse|clôture|cloture|till|soir)/.test(q)) {
    return { say: cashSay(shop, lang), lang, shop };
  }

  if (/(conseil|mieux|bénéfice|benefice|yokk|best)/.test(q)) {
    return { say: advice(shop, lang), lang, shop };
  }

  if (/(dépens|depens|transport|jënd|expense)/.test(q)) {
    const amount = digits(saleAmount?.[1] ?? q.match(/(\d[\d\s.]*)/)?.[1] ?? "");
    if (!amount) {
      return {
        say: lang === "wo" ? "Wax ma ngana dépensé." : "Dis-moi le montant dépensé.",
        lang,
        shop,
      };
    }
    const label = /transport/.test(q) ? "Transport" : "Dépense";
    const next: Shop = {
      ...shop,
      expenses: [{ id: uid("e"), at: todayStamp(), label, amount }, ...shop.expenses],
    };
    const say = lang === "wo" ? `Dépense bi dugg na. ${money(amount)}.` : `Dépense notée. ${money(amount)}.`;
    return { say, lang, shop: next };
  }

  if (/(stock|ñata|nata|reste|combien|des )/.test(q) && !/(vente|jaay)/.test(q)) {
    const product = findProduct(shop, q);
    return { say: stockLine(shop, product?.name, lang), lang, shop };
  }

  if (/(vente|jaay|sale|ajoute)/.test(q) || saleAmount) {
    const product = findProduct(shop, q);
    const qtyMatch = q.match(/(\d+)\s*(?:kilo|kg|sac|sachet|bidon|pièce|piece|l)?/);
    const qty = product && qtyMatch ? Number(qtyMatch[1]) : undefined;
    const amount = product && qty ? qty * product.price : digits(saleAmount?.[1] ?? "");
    if (!amount) {
      return {
        say: lang === "wo" ? "Wax ma ngana jaay." : "Dis le montant, par exemple : ajoute une vente de 15 000.",
        lang,
        shop,
      };
    }
    const products = product
      ? shop.products.map((p) => (p.id === product.id ? { ...p, stock: Math.max(0, p.stock - (qty || 1)) } : p))
      : shop.products;
    const label = product ? product.name : "Vente";
    const next: Shop = {
      ...shop,
      products,
      sales: [{ id: uid("s"), at: todayStamp(), label, amount, qty, productId: product?.id }, ...shop.sales],
    };
    const low = product && next.products.find((p) => p.id === product.id);
    let say = saySale(lang, amount, label);
    if (low && low.stock <= low.min) {
      say += lang === "wo" ? ` ${low.name} néew na, ${low.stock} la des.` : ` Alerte : ${low.name} est bas (${low.stock}).`;
    }
    return { say, lang, shop: next };
  }

  if (lang === "wo") {
    return {
      say: "Mën nga wax : jaay, ñata riz, ku ma ame, facture Awa, walla caisse.",
      lang,
      shop,
    };
  }
  if (lang === "en") {
    return { say: "Try: add a sale of 15000, how much rice is left, who owes me, invoice Awa, or close the till.", lang, shop };
  }
  return {
    say: "Tu peux dire : ajoute une vente de 15 000, il me reste combien de riz, qui me doit de l'argent, envoie la facture à Awa, ou caisse du jour.",
    lang,
    shop,
  };
}
