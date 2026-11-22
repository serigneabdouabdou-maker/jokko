/**
 * Jokko comprend tout seul, sans IA (22/11/2026, demande de Fallou : « tout ce qui est dans l'appli, si je le dis
 * à la voix, ça s'enregistre ; trier ce qui demande Gemini et ce qui se fait avec le code ; gratuitement »).
 *
 * La phrase (écrite, ou dite au micro gratuit du téléphone en français) passe d'abord ici. Si le code est SÛR de ce
 * qu'il faut faire, il prépare l'appel de l'outil, exactement comme le ferait l'IA en direct — puis `LiveDesk.handle`
 * applique les mêmes règles (prix d'achat, barrière des prix, source de l'argent, dettes, services, licences…).
 * Sinon il rend null et la phrase part à l'IA (écrit, moins cher que le vocal et le direct).
 *
 * Ce qui est compris ici : vente (et vente à crédit), service, dépense, achat, dette, dette remboursée, réparation
 * (réparé, acompte, rendu), comptage du stock, client perdu, prix négocié, annuler, et les questions courantes
 * (caisse, ventes, bénéfice, dettes, stock, prix, appareils au dépôt). Le dépôt d'un appareil (client, appareil,
 * panne, prix) reste à l'IA ou à l'écran « Nouveau dépôt ».
 */
import type { LiveToolCall } from "./live";
import { cashSourceSaid, dayExpenses, daySales, expectedCash, type LostReason, type Product, type QuoteRecord, type Shop, money } from "../model";
import { moneyAmountsSaid, readFrenchNumber, saysUnitPrice } from "./wolofNumbers";
import { pickByName, plain } from "./wolofNames";
import { modelKeys } from "../data/modelKeys";
import { partForSale, searchProducts } from "../data/partSearch";
import { kindOf } from "../data/pricing";
import { metierOf } from "../data/metiers";
import { findRepair, remaining, repairsOf } from "../data/repairs";
import { buildReport, periodOf } from "../data/report";
import { priceLadder } from "../data/priceGuard";
import { overdueDebts } from "../data/debts";

export type LocalPlan =
  | { kind: "call"; call: LiveToolCall; what: string; quote?: Omit<QuoteRecord, "id" | "at"> }
  | { kind: "answer"; text: string }
  | { kind: "lost"; quote: Omit<QuoteRecord, "id" | "at">; text: string }
  | { kind: "count"; counts: Record<string, number>; lines: string[]; unknown: string[] }
  | { kind: "ask"; text: string };

/** Question posée par Jokko qui attend une réponse courte (« Wave », « ajoute », « le BF6 »…). */
export type Pending = { call: LiveToolCall; sorte: "paye_avec" | "ajout_ou_total" | "besoin"; at: number };

const fr = (n: number) => money(n).replace(/[  ]/g, " ");

/** Minuscules sans accents, apostrophes simples. */
export function norm(text: string): string {
  return ` ${text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’`]/g, "'").replace(/\s+/g, " ").trim()} `;
}

/** Mots de phrase française : ils ne font jamais partie d'un modèle (« est parti Spark 8C » → « Spark 8C »). */
const FILLER = new Set(
  ("j ai je tu il elle on nous vous ils elles un une des le la les l d de du au aux a à est sont ete etait suis c ca ce cet cette mon ma mes son sa ses "
    + "client cliente monsieur madame dame gars quelqu qu quelqu'un vient venu venue parti partie reparti repartie pris prend prendre achete acheter vendu vends vente "
    + "paye payer paiera payera rembourse donne trop cher prix voulait veut propose proposait demandait dit lui leur pour par avec sans "
    + "et ou mais donc car pas ne n plus tard demain revient reviendra revenir aujourd hui hier ce matin soir francs franc f fcfa balles mille cent cents "
    + "repare reparee rendu rendue fini termine negocie negociation marchande baisse reparation changer change mis mettre credit dette doit "
    + "chacun chaque piece pieces lui fois service").split(" "),
);

/** Sans accents ni pluriel : « écrans » = « ecran », « chargeurs » = « chargeur ». */
const single = (text: string) => plain(text).split(" ").map((w) => (w.length > 3 ? w.replace(/(s|x)$/, "") : w)).join(" ");

function forModel(text: string): string {
  return plain(text).split(" ").filter((w) => w && !FILLER.has(w)).join(" ");
}

/** Le modèle dit (« BF6 », « iPhone 11 », « Spark 8C »), ou "". */
export function modelSaid(text: string): string {
  const k = modelKeys(forModel(text))[0];
  return k ? k.toUpperCase() : "";
}

/**
 * L'article dont parle la phrase : pièce (même type + même modèle, comme la carte de plusieurs opérations),
 * sinon un article du stock dont le nom (ou un autre nom) est dans la phrase. Plusieurs possibles = choix.
 */
export function productIn(shop: Shop, text: string): { product?: Product; choices?: Product[] } {
  const clean = forModel(text);
  if (modelKeys(clean).length && kindOf(clean) !== "Autre") {
    const r = partForSale(shop.products, clean, kindOf);
    if (r.product || r.choices) return r;
  }
  // Nom entier d'un article (« chargeur », « riz parfumé », « Écran Tecno BF6 ») dans la phrase ; le pluriel compte (« chargeurs »).
  const t = ` ${single(text)} `;
  const named = shop.products
    .filter((p) => [p.name, ...(p.aliases ?? [])].some((n) => {
      const w = single(n);
      return w.length >= 3 && t.includes(` ${w} `);
    }))
    .sort((a, b) => b.name.length - a.name.length);
  if (named.length === 1) return { product: named[0] };
  if (named.length > 1) {
    const longest = single(named[0]!.name).length;
    const top = named.filter((p) => single(p.name).length === longest);
    return top.length === 1 ? { product: top[0] } : { choices: top.slice(0, 4) };
  }
  // Un modèle seul (« BF6 10 000 ») : la seule pièce qui le porte.
  const key = modelKeys(clean)[0];
  if (key) {
    // Le modèle dans le NOM de l'article d'abord ; plusieurs pièces de ce modèle : l'écran (la pièce dont on parle le plus).
    const direct = shop.products.filter((p) => modelKeys(p.name).includes(key));
    if (direct.length === 1) return { product: direct[0] };
    const screens = direct.filter((p) => kindOf(p.name) === "Écran");
    if (screens.length === 1) return { product: screens[0] };
    if (direct.length > 1) return { choices: direct.slice(0, 4) };
    const hits = searchProducts(shop.products, key, 4);
    if (hits.length === 1) return { product: hits[0]!.product };
    const viaScreens = hits.filter((h) => kindOf(h.product.name) === "Écran");
    if (viaScreens.length === 1) return { product: viaScreens[0]!.product };
    if (hits.length > 1) return { choices: hits.map((h) => h.product) };
  }
  return {};
}

/** Le client nommé : un client du cahier dont le nom est dans la phrase, sinon un prénom écrit avec une majuscule. */
export function clientIn(shop: Shop, raw: string): string | null {
  const t = ` ${plain(raw)} `;
  const known = shop.clients
    .map((c) => ({ c, full: plain(c.name), first: plain(c.name).split(" ")[0] ?? "" }))
    .filter(({ full, first }) => t.includes(` ${full} `) || (first.length >= 3 && t.includes(` ${first} `)))
    .sort((a, b) => (t.includes(` ${b.full} `) ? 1 : 0) - (t.includes(` ${a.full} `) ? 1 : 0) || b.full.length - a.full.length);
  if (known.length) {
    const exact = known.find((k) => t.includes(` ${k.full} `));
    return exact ? exact.c.name : known[0]!.first.replace(/^./, (m) => m.toUpperCase());
  }
  // Prénom avec majuscule (dicté par le téléphone : « Moussa a pris… », « … pour Awa Ndiaye »).
  const m =
    raw.match(/(?:^|[.!?]\s+)([A-ZÀ-Ý][\p{L}'-]{2,}(?:\s+[A-ZÀ-Ý][\p{L}'-]{2,})?)\s+(?:a|m'a|me|doit|n'a|va|prend|est)\b/u) ??
    raw.match(/\b(?:pour|à|a|client|cliente|monsieur|madame|chez)\s+([A-ZÀ-Ý][\p{L}'-]{2,}(?:\s+[A-ZÀ-Ý][\p{L}'-]{2,})?)/u);
  const name = m?.[1]?.trim();
  if (!name) return null;
  const first = plain(name.split(" ")[0]!);
  if (/^(jokko|wave|orange|tecno|techno|itel|infinix|samsung|iphone|redmi|xiaomi|huawei|bathie|le|la|les|un|une|il|elle|je|j|vente|depense|achat|comptage|transport|service|decodage|flash)$/.test(first)) return null;
  if (FILLER.has(first) || kindOf(name) !== "Autre") return null;
  return name;
}

const has = (n: string, rx: RegExp) => rx.test(n);

/** Mots wolof (pas français) : deux ou plus = phrase wolof, laissée à l'IA. */
const WOLOF = new Set(("na naa nga nanu dafa dafay dina dinaa dinga ci ak bu yi bi li mu dañu danu jend jaay jaaye jaayal fey fay fayul fayu bor borom new nyew jel jox joxe amul amna def waxal ndax lan naata nata "
  + "xaalis derem junni teemeer ñaari naari nyaari benn ñett nett nyett ñeent neent juroom fukk ceeb diw meew suukar soow ma ngi mangi tey demb suba leegi").split(" "));
export function wolofish(text: string): boolean {
  const words = plain(text.replace(/ñ/gi, "ny")).split(" ");
  return words.filter((w) => WOLOF.has(w)).length >= 2;
}
const QUESTION = /\?|^ (combien|est-ce|est ce|qui|quel|quelle|quels|c'est combien|il reste combien|j'ai combien|on a combien|montre|dis-moi|dis moi|donne-moi|donne moi) /;

/** Petite quantité dite avant l'article : « 2 chargeurs », « trois écrans ». */
function quantityIn(raw: string, product?: Product): number | null {
  const n = norm(raw);
  const m = n.match(/ (\d{1,3}|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|quinze|vingt) (?!f |francs|mille|cent|fcfa|dirham|balles)([a-z]{3,})/);
  if (!m) return null;
  const word = m[2]!;
  // « iPhone 11 », « Spark 10 » : le nombre fait partie du modèle, pas une quantité.
  if (/^(pro|max|plus|mini|lite|go)$/.test(word)) return null;
  if (product && modelKeys(product.name).some((k) => k.endsWith(m[1]!))) return null;
  const q = /^\d+$/.test(m[1]!) ? Number(m[1]) : readFrenchNumber(m[1]!);
  return q && q > 0 && q < 1000 ? q : null;
}

/** Montant après un mot (« voulait 7 000 », « je lui ai dit 10 000 »), sinon null. */
function amountAfter(raw: string, words: RegExp): number | null {
  const n = raw.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const m = n.match(new RegExp(`(?:${words.source})\\s*(?:de|a|à|payer|me donner|donner)?\\s*([\\d\\s.,]+(?:\\s*(?:mille|francs|f|fcfa))?)`));
  if (!m) return null;
  return moneyAmountsSaid(m[1]!)[0] ?? (Number(m[1]!.replace(/[^\d]/g, "")) || null);
}

const EXPENSE_LABELS: Array<[RegExp, string]> = [
  [/\b(transport|taxi|clando|moto|car rapide|tiak tiak|ndiaga ndiaye)\b/, "Transport"],
  [/\b(electricite|courant|senelec|woyofal)\b/, "Électricité"],
  [/\b(loyer|location)\b/, "Loyer"],
  [/\b(salaire|apprenti|employe)\b/, "Salaire"],
  [/\b(repas|dejeuner|manger|petit dejeuner|diner|cafe)\b/, "Repas"],
  [/\b(internet|wifi|connexion|credit telephone|recharge)\b/, "Internet et téléphone"],
  [/\b(eau|sde|sen eau)\b/, "Eau"],
  [/\b(essence|carburant|gasoil)\b/, "Carburant"],
  [/\b(impot|impots|taxe|taxes|patente|mairie)\b/, "Taxes"],
];

/**
 * Comprend la phrase avec le code seul. null = pas sûr : l'IA s'en charge.
 * `patron` : seul le patron reçoit le bénéfice et les prix d'achat.
 */
export function planLocal(raw: string, shop: Shop, patron = true): LocalPlan | null {
  const text = raw.trim();
  if (text.length < 2 || text.length > 400) return null;
  const n = norm(text);
  // Phrase en wolof (« jël na ceeb 2 000 te fayul ») : l'IA la comprend mieux que le code ; rien n'est deviné ici.
  if (wolofish(text)) return null;
  const repairer = metierOf(shop.activity).id === "reparation";
  // Les codes de modèle (« KI5K », « A35 ») ne sont jamais de l'argent : on les enlève avant de lire les montants.
  const amounts = moneyAmountsSaid(text.replace(/\b(?=[\p{L}\d]*\p{L})(?=[\p{L}\d]*\d)[\p{L}\d]+\b/gu, (w) => (/^\d+(f|fcfa|frs?)$/i.test(w) ? w : " ")));
  const amount = amounts[0] ?? null;

  // 1. Annuler la dernière écriture.
  if (has(n, /^ (annule|annuler|efface|supprime|c'est faux|non annule)( ca| la derniere| le dernier| ce que je viens de dire| tout)? $/)) {
    return { kind: "call", call: { name: "annuler_derniere", args: {} }, what: "annuler" };
  }

  // 2. Client perdu : il est parti sans prendre.
  const leftNow = has(n, /(client|cliente|monsieur|madame|dame|gars|il|elle|quelqu'un).{0,80}(est parti|est partie|est reparti|est repartie|n'a pas pris|n'a rien pris|a refuse|a pas pris|n'a pas achete|a pas achete|est alle ailleurs|parti sans)/);
  const comesBack = has(n, /(va revenir|reviendra|revient plus tard)/) && has(n, /\bcher\b|\bchere\b|\bprix\b|\bclient|\bvoulait\b/) && !has(n, / r[\s-]?\d/);
  if (has(n, / client perdu /) || leftNow || comesBack) {
    const found = productIn(shop, text);
    const model = modelSaid(text) || (found.product ? found.product.name : "");
    if (!model) return { kind: "ask", text: "Pour quel téléphone ? Redis par exemple : « client parti, BF6, trop cher, il voulait 7 000 »." };
    const reason: LostReason = has(n, /ailleurs|chez un autre|autre reparateur|compar|a cote moins cher|moins cher a cote/)
      ? "compare"
      : has(n, /pas en stock|pas de piece|pas la piece|pas disponible|rupture|j'avais pas|je n'avais pas|j'ai pas la/)
        ? "pas_stock"
        : has(n, /\bcher\b|\bchere\b|\bprix\b/)
          ? "cher"
          : has(n, /revenir|reviendra|revient|plus tard|demain/)
            ? "plus_tard"
            : "autre";
    const lad = found.product ? priceLadder(shop, found.product) : null;
    const wanted = amountAfter(text, /voulait|propose|proposait|offrait|demandait|donnait|veut|il a dit|elle a dit/);
    const offered = amountAfter(text, /je lui ai dit|j'ai dit|mon prix|je demandais|j'ai demande|je proposais/) ?? lad?.normal ?? (wanted ? null : amount) ?? 0;
    const quote: Omit<QuoteRecord, "id" | "at"> = {
      model, items: found.product ? [found.product.name] : [], offered, ...(lad ? { floor: lad.floor } : {}), outcome: "perdu", reason,
      ...(wanted ? { wanted } : {}),
    };
    const label = { cher: "trop cher", compare: "il compare ailleurs", plus_tard: "il revient plus tard", pas_stock: "pièce pas en stock", autre: "autre raison" }[reason];
    const verdict = wanted && lad ? (wanted >= lad.floor ? ` Il voulait ${fr(wanted)} : c'est au-dessus de ton minimum (${fr(lad.floor)}), tu pouvais le garder.` : ` Il voulait ${fr(wanted)} : c'est sous ton minimum (${fr(lad.floor)}), bien de le laisser partir.`) : wanted ? ` Il voulait ${fr(wanted)}.` : "";
    return { kind: "lost", quote, text: `Client perdu noté : ${model}, ${label}.${verdict}` };
  }

  // 3. Questions : la réponse vient des chiffres de la boutique, rien n'est écrit.
  if (has(n, QUESTION) || (has(n, / combien /) && !amount)) {
    const answer = answerLocal(text, n, shop, patron, repairer);
    if (answer) return { kind: "answer", text: answer };
    return null;
  }

  // 4. Réparations (R-005 réparé / rendu / acompte).
  const ticket = n.match(/ (?:r|air|erre|ticket)[\s-]?0*(\d{1,4}) /);
  if ((repairer || repairsOf(shop).length) && ticket) {
    const ref = `R-${ticket[1]!.padStart(3, "0")}`;
    const found = findRepair(shop, ref);
    if (!found) return { kind: "ask", text: `Je ne trouve pas la réparation ${ref}. Redis le numéro écrit sur le ticket.` };
    if (has(n, /rendu|rendue|recupere|recuperer|livre|venu chercher|venue chercher|il est venu|elle est venue|remis/)) {
      return {
        kind: "call",
        what: "rendu",
        call: { name: "reparation", args: { action: "rendre", ticket: found.number, heard: text, ...(amount ? { montantDit: String(amount) } : {}), ...(has(n, /reste|dette|credit|pas tout paye|paiera|payera|pas paye/) ? { resteEnDette: true } : {}) } },
      };
    }
    if (has(n, /repare|reparee|fini|termine|pret|prete|c'est bon/)) {
      const after = text.split(/\b(?:avec|pièce|piece|écran|ecran)\b/i).slice(1).join(" ").trim();
      const pieces = after ? [text.match(/\b(?:pièce|piece)\b/i) ? after : `écran ${after}`].map((p) => p.replace(/\s+/g, " ").trim()) : [];
      return { kind: "call", what: "réparé", call: { name: "reparation", args: { action: "reparee", ticket: found.number, heard: text, pieces } } };
    }
    if (amount && has(n, /acompte|avance|a paye|a donne|verse|a ajoute/)) {
      return { kind: "call", what: "acompte", call: { name: "reparation", args: { action: "payer", ticket: found.number, heard: text, montantDit: String(amount) } } };
    }
    return null;
  }

  // 5. Comptage du stock : « comptage : BF6 quatre, KI5K deux » / « BF6 4, A12 2 ».
  const counting = has(n, /^ (comptage|inventaire|je compte|j'ai compte|stock reel|il me reste|il reste) /);
  const segments = text.replace(/^\s*(comptage|inventaire|je compte|j'ai compté|j'ai compte|stock réel|stock reel|il me reste|il reste)\s*:?\s*/i, "").split(/\s*(?:,|;|\bet\b|\n)\s*/i).filter(Boolean);
  if ((counting || (segments.length >= 2 && !amounts.length)) && segments.length >= 1) {
    const counts: Record<string, number> = {};
    const lines: string[] = [];
    const unknown: string[] = [];
    for (const seg of segments) {
      const words = seg.trim().split(/\s+/);
      const last = words[words.length - 1] ?? "";
      const num = /^\d{1,4}$/.test(last) ? Number(last) : readFrenchNumber(last);
      if (num === null || words.length < 2) {
        unknown.push(seg.trim());
        continue;
      }
      const name = words.slice(0, -1).join(" ");
      const hit = productIn(shop, name);
      if (!hit.product) {
        unknown.push(name);
        continue;
      }
      counts[hit.product.id] = num;
      lines.push(`${hit.product.name} : ${num}${hit.product.stock !== num ? ` (avant ${hit.product.stock})` : ""}`);
    }
    if (lines.length && (counting || !unknown.length)) return { kind: "count", counts, lines, unknown };
    if (counting) return { kind: "ask", text: unknown.length ? `Je ne trouve pas : ${unknown.join(", ")}. Redis avec le nom de la pièce et le nombre, par exemple « comptage : BF6 quatre ».` : "Dis chaque pièce et son nombre, par exemple « comptage : BF6 quatre, KI5K deux »." };
  }

  const found = productIn(shop, text);
  if (found.choices && !found.product && amount) {
    return { kind: "ask", text: `Quel article : ${found.choices.map((p) => p.name).join(" ou ")} ? Redis la phrase avec le bon nom.` };
  }
  const product = found.product;
  const client = clientIn(shop, text);
  const qty = quantityIn(text, product);
  const via = cashSourceSaid(text);
  // « 4 écrans à 3 800 chacun » : prix d'UN article, le total est calculé par le code.
  const priceArg = (v: number) => (qty && qty > 1 && saysUnitPrice(text) ? { prixUnitaireDit: String(v) } : { montantDit: String(v) });

  // 6. Dette remboursée : « Awa a payé 5 000 », « Moussa m'a remboursé 3 000 ».
  if (amount && client && !product && has(n, /rembourse|a paye|m'a paye|a regle|a verse|m'a donne|a donne|a solde|sur sa dette|de sa dette/)) {
    return { kind: "call", what: "remboursement", call: { name: "enregistrer", args: { type: "debt_payment", clientName: client, montantDit: String(amount), heard: text } } };
  }

  // 7. Dette sans article : « Moussa me doit 5 000 », « mets 3 000 sur le compte de Awa ».
  if (amount && client && !product && has(n, /me doit|doit encore|sur (son|le) compte|a credit|en dette|dette de|prend a credit|il doit|elle doit/)) {
    return { kind: "call", what: "dette", call: { name: "enregistrer", args: { type: "debt_add", clientName: client, montantDit: String(amount), heard: text } } };
  }

  // 8. Achat de marchandise : « j'ai acheté 5 écrans BF6 à 3 700 ».
  if (amount && product && has(n, /achete|achat|commande recue|j'ai recu|recu de|j'ai pris chez|ravitaille/)) {
    return {
      kind: "call",
      what: "achat",
      call: { name: "enregistrer", args: { type: "purchase", productId: product.id, productName: product.name, ...(qty ? { quantity: qty } : {}), ...priceArg(amount), heard: text, ...(via ? { payeAvec: via } : {}) } },
    };
  }

  // 9. Service du catalogue : « décodage 5 000 », « flash 3 000 », « 50 photocopies ».
  const service = (shop.services ?? []).find((s) => {
    const w = plain(s.name);
    return w.length >= 3 && ` ${plain(text)} `.includes(` ${w} `);
  });
  if (service && !product && (amount || service.price > 0)) {
    return { kind: "call", what: "service", call: { name: "enregistrer", args: { type: "sale", productName: service.name, heard: text, ...(amount ? { montantDit: String(amount) } : {}), ...(client ? { clientName: client } : {}) } } };
  }

  // 10. Dépense : « transport 2 000 », « j'ai payé l'électricité 15 000 ».
  const expense = EXPENSE_LABELS.find(([rx]) => rx.test(n));
  if (amount && !product && (expense || has(n, /depense|j'ai paye|achete du|achete de la/)) && !client) {
    return { kind: "call", what: "dépense", call: { name: "enregistrer", args: { type: "expense", label: expense?.[1] ?? "Dépense", montantDit: String(amount), heard: text, ...(via ? { payeAvec: via } : {}) } } };
  }

  // 11. Vente (ou vente à crédit, ou prix négocié).
  const sold = has(n, /vendu|vente|vends|j'ai fait|encaisse|a achete|a pris|reparation|change|negoci|marchande|baisse|client/) || Boolean(product && amount);
  if (sold && (amount || (product && product.price > 0 && qty))) {
    const credit = Boolean(client) && has(n, /pas paye|n'a pas paye|pas encore paye|a credit|credit|paiera|payera|va payer|me doit|sur son compte|sur le compte|en dette|il doit|elle doit/);
    const negotiated = has(n, /negoci|marchande|baisse|j'ai fait a|j'ai laisse a|apres discussion/);
    const final = negotiated && amounts.length >= 2 ? amounts[amounts.length - 1]! : amount;
    if (!product && !final) return null;
    if (!product && !has(n, /vendu|vente|vends|encaisse/)) return null;
    const lad = product && negotiated ? priceLadder(shop, product) : null;
    const offered = negotiated ? (amounts.length >= 2 ? amounts[0]! : lad?.normal ?? null) : null;
    const quote = negotiated && product && final && offered
      ? { model: modelSaid(text) || product.name, items: [product.name], offered, ...(lad ? { floor: lad.floor } : {}), outcome: "pris" as const, paid: final }
      : undefined;
    return {
      kind: "call",
      what: credit ? "vente à crédit" : negotiated ? "prix négocié" : "vente",
      ...(quote ? { quote } : {}),
      call: {
        name: "enregistrer",
        args: {
          type: "sale",
          ...(product ? { productId: product.id, productName: product.name } : { label: saleLabel(text) }),
          ...(qty ? { quantity: qty } : {}),
          ...(final ? priceArg(final) : {}),
          ...(client ? { clientName: client } : {}),
          ...(credit ? { paiement: "credit" } : via === "wave" || via === "om" ? { paiement: via } : {}),
          heard: text,
        },
      },
    };
  }
  return null;
}

/** « J'ai vendu des écouteurs 3 000 » → « Écouteurs » ; rien d'utile → « Vente ». */
function saleLabel(text: string): string {
  const words = plain(text).split(" ").filter((w) => w && !FILLER.has(w) && !/^\d+$/.test(w) && !/^(cinq|six|sept|huit|neuf|dix|deux|trois|quatre|vingt|trente|quarante|cinquante|soixante)$/.test(w));
  const label = words.join(" ").slice(0, 60).trim();
  return label ? label.replace(/^./, (m) => m.toUpperCase()) : "Vente";
}

/** Réponses aux questions courantes, calculées par le code. null = l'IA répond. */
function answerLocal(raw: string, n: string, shop: Shop, patron: boolean, repairer: boolean): string | null {
  if (has(n, /qui me doit|les dettes|combien on me doit|qui doit|mes dettes|dettes en retard/)) {
    const owing = shop.clients.filter((c) => c.debt > 0).sort((a, b) => b.debt - a.debt);
    if (!owing.length) return "Personne ne te doit d'argent.";
    const total = owing.reduce((a, c) => a + c.debt, 0);
    const late = overdueDebts(shop).length;
    return `${owing.length} client${owing.length > 1 ? "s" : ""} te doi${owing.length > 1 ? "vent" : "t"} ${fr(total)}${late ? `, dont ${late} en retard` : ""} : ${owing.slice(0, 5).map((c) => `${c.name} ${fr(c.debt)}`).join(", ")}${owing.length > 5 ? "…" : "."}`;
  }
  const client = clientIn(shop, raw);
  if (client && has(n, /doit|dette/)) {
    const c = pickByName(shop.clients, client).item;
    return c ? (c.debt > 0 ? `${c.name} te doit ${fr(c.debt)}.` : `${c.name} ne te doit rien.`) : null;
  }
  if (has(n, /caisse|tiroir|en especes/)) {
    return `Caisse d'aujourd'hui : ventes ${fr(daySales(shop))}, dépenses ${fr(dayExpenses(shop))}. Tu dois avoir ${fr(expectedCash(shop))} dans le tiroir.`;
  }
  if (has(n, /benefice|gagne|gagner|marge/)) {
    if (!patron) return "Seul le patron voit le bénéfice.";
    const r = buildReport(shop, periodOf(has(n, /mois/) ? "mois" : "jour"));
    const when = has(n, /mois/) ? "Ce mois" : "Aujourd'hui";
    return `${when} : ventes ${fr(r.revenue)}, bénéfice des ventes ${fr(r.grossProfit)}, dépenses ${fr(r.expenses)}. ${r.netProfit >= 0 ? `Tu as gagné ${fr(r.netProfit)}` : `Tu as perdu ${fr(-r.netProfit)}`}.${r.unknownRevenue > 0 ? ` (${fr(r.unknownRevenue)} de ventes sans prix d'achat.)` : ""}`;
  }
  if (has(n, /vendu|ventes|vente/)) {
    const r = buildReport(shop, periodOf(has(n, /mois/) ? "mois" : "jour"));
    return `${has(n, /mois/) ? "Ce mois" : "Aujourd'hui"} : ${fr(r.revenue)} de ventes.`;
  }
  if (has(n, /depot|attend|en cours|reparations|appareils/) && (repairer || repairsOf(shop).length)) {
    const open = repairsOf(shop).filter((r) => r.status === "depot" || r.status === "repare");
    if (!open.length) return "Aucun appareil n'attend.";
    const ready = open.filter((r) => r.status === "repare");
    return `${open.length} appareil${open.length > 1 ? "s" : ""} en cours, dont ${ready.length} réparé${ready.length > 1 ? "s" : ""} qui attend${ready.length > 1 ? "ent" : ""} le client : ${open.slice(0, 5).map((r) => `${r.number} ${r.clientName} (${r.device}${remaining(r) ? `, reste ${fr(remaining(r))}` : ""})`).join(", ")}.`;
  }
  const found = productIn(shop, raw);
  const p = found.product;
  if (!p) return found.choices ? `Lequel : ${found.choices.map((x) => x.name).join(" ou ")} ?` : null;
  if (has(n, /prix|coute|c'est combien|combien pour|a combien|je donne combien|je dis combien/)) {
    const lad = repairer ? priceLadder(shop, p) : null;
    if (lad) return `${p.name} : prix ${fr(lad.normal)}, négocié ${fr(lad.nego)}, jamais sous ${fr(lad.floor)}.${patron ? ` Pièce ${fr(lad.cost)}.` : ""} En stock : ${p.stock}.`;
    return p.price > 0 ? `${p.name} : ${fr(p.price)}. En stock : ${p.stock} ${p.unit}.` : `${p.name} n'a pas encore de prix de vente. En stock : ${p.stock} ${p.unit}.`;
  }
  if (has(n, /reste|stock|combien|j'ai/)) return `${p.name} : il en reste ${p.stock} ${p.unit}.`;
  return null;
}

/**
 * Une réponse courte, en français, d'après ce que l'outil a fait (pas d'IA).
 * `pending` : la question à laquelle le commerçant doit répondre (source de l'argent, ajout ou total…).
 */
export function replyFor(res: Record<string, unknown>, plan: Extract<LocalPlan, { kind: "call" }>): { text: string; ok: boolean; pending?: Pending["sorte"]; extra?: string } {
  const st = String(res.statut ?? "");
  const W = (v: unknown) => (v && typeof v === "object" && "francs" in (v as object) ? Number((v as { francs: number }).francs) : typeof v === "number" ? v : 0);
  if (st === "enregistre") {
    const resume = typeof res.resume === "string" ? res.resume : "";
    if (plan.call.name === "reparation") {
      const t = String(res.ticket ?? "");
      if (plan.what === "rendu") {
        const rest = W(res.reste_en_dette);
        return { ok: true, text: `${t} rendu. Payé maintenant ${fr(W(res.paye))}${rest ? `, reste ${fr(rest)} en dette` : ""}.${res.note ? ` ${res.note}` : ""}` };
      }
      if (plan.what === "réparé") {
        const pieces = Array.isArray(res.pieces) ? (res.pieces as string[]).join(", ") : "";
        const mo = W(res.main_oeuvre);
        const missing = Array.isArray(res.pieces_sans_prix) && res.pieces_sans_prix.length ? ` Combien as-tu payé ${(res.pieces_sans_prix as string[]).join(", ")} ?` : "";
        return { ok: true, text: `${t} réparé${pieces ? ` avec ${pieces}` : " (aucune pièce)"}.${mo ? ` Main-d'œuvre gagnée : ${fr(mo)}.` : ""}${missing}` };
      }
      return { ok: true, text: `${t} : acompte ${fr(W(res.paye))} noté, reste ${fr(W(res.reste))}.` };
    }
    const extra = res.nouveau_client ? ` Nouveau client : ${res.nouveau_client}.` : "";
    const totalDebt = typeof res.dette_totale === "number" && typeof res.dette_avant === "number" && res.dette_avant > 0 ? ` Dette totale : ${fr(res.dette_totale)}.` : "";
    const low = Array.isArray(res.stock_bas) && res.stock_bas.length ? ` Stock bas : ${(res.stock_bas as string[]).join(", ")}.` : "";
    const calc = typeof res.calcul === "string" ? ` (${res.calcul})` : "";
    // L'écran montre déjà « ✓ résumé » : Jokko ajoute seulement ce qui est nouveau (dette totale, nouveau client, stock bas).
    return { ok: true, text: `C'est noté : ${resume}${calc}.${totalDebt}${extra}${low}`.replace(/\.\./g, "."), extra: `${totalDebt}${extra}${low}`.trim() };
  }
  if (st === "annule") return { ok: true, text: `Annulé : ${res.resume}.` };
  if (st === "rien_a_annuler") return { ok: false, text: "Rien à annuler (seulement une écriture de moins de 2 minutes). Corrige-la dans l'écran concerné." };
  if (st === "paye_avec") return { ok: false, pending: "paye_avec", text: `Ces ${fr(Number(res.montant) || 0)}, tu les as payés avec l'argent du tiroir, par Wave, par Orange Money ou autrement ?` };
  if (st === "ajout_ou_total") {
    return { ok: false, pending: "ajout_ou_total", text: `Il devait déjà ${fr(Number(res.avant) || 0)}. J'ajoute ${fr(Number(res.ajout) || 0)} (total ${fr(Number(res.total_si_ajout) || 0)}), ou sa dette totale est ${fr(Number(res.ajout) || 0)} ? Réponds « ajoute » ou « total ».` };
  }
  if (st === "hors_metier") return { ok: false, text: `« ${res.article} » n'est pas dans ta boutique. Si c'est une dépense, dis « dépense ${res.article} … ».` };
  if (st === "refuse") return { ok: false, text: String(res.raison ?? "Seul le patron peut faire ça.") };
  if (st === "incomplet") return { ok: false, pending: "besoin", text: `Il me manque ${String(res.besoin ?? "une information")}. Redis la phrase en entier.` };
  return { ok: false, text: "Je n'ai pas compris. Redis la phrase en entier, avec le montant." };
}

/** Réponse courte à une question de Jokko (« Wave », « ajoute »…) : l'appel est refait avec la réponse. */
export function answerPending(raw: string, p: Pending): LiveToolCall | null {
  if (Date.now() - p.at > 3 * 60_000) return null;
  const n = norm(raw);
  const args = { ...(p.call.args ?? {}) };
  if (p.sorte === "paye_avec") {
    const src = cashSourceSaid(raw) ?? (has(n, /orange/) ? "om" : has(n, / ma poche | autrement | autre /) ? "autre" : undefined);
    if (!src) return null;
    return { ...p.call, args: { ...args, payeAvec: src, heard: `${String(args.heard ?? "")} ${raw}` } };
  }
  if (p.sorte === "ajout_ou_total") {
    const mode = has(n, /ajout|ajoute|en plus|additionne|rajoute/) ? "ajout" : has(n, /total|en tout|tout ce qu'il doit/) ? "total" : null;
    if (!mode) return null;
    return { ...p.call, args: { ...args, modeDette: mode } };
  }
  return null;
}
