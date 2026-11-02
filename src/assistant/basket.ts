/**
 * Le panier de Jokko (conversation directe) : une vente, un achat ou une facture de PLUSIEURS articles.
 * 1. Jokko ajoute les articles un par un ; le code retrouve chaque produit, son prix, et calcule chaque ligne.
 * 2. Avant d'enregistrer, Jokko RÉCAPITULE (en wolof ou en français) et demande « Noonu la ? ».
 * 3. Le commerçant corrige (« un sac, pas deux », « ajoute le savon », « enlève l'eau ») : le panier change.
 * 4. Sur « waaw » / « oui », tout part d'un coup : facture ou vente, stock, caisse.
 * Sécurité : impossible de valider un panier qui a changé depuis le dernier récapitulatif.
 */
import { type Payment, type Shop, money } from "../model";
import { type CartLine, unitName, unitPrice } from "../data/checkout";
import { applyOrder, isRetail, type Order, type OrderIntent, orderMissing, purchasePrice } from "./order";
import { pickByName } from "./liveDesk";
import { francsToWolof, spokenAmountToFrancs, wolofNumber } from "./wolofNumbers";
import type { Applied } from "./apply";

type Item = { article?: unknown; quantite?: unknown; unite?: unknown; prixUnitaireDit?: unknown };

const PAYMENTS: Record<string, Payment> = { especes: "especes", espece: "especes", cash: "especes", wave: "wave", om: "om", orange: "om", credit: "credit", bor: "credit" };
const INTENTS: Record<string, OrderIntent> = { vente: "vente", achat: "achat", facture: "facture" };
/** Les « oui » du commerçant, en wolof ou en français. */
const YES = /\b(waaw|waw|wao|waa|oui|ouais|ok|okay|d[ëe]gg|baax na|noonu la|c'?est (bon|ça|ca)|vas[- ]?y|valide|enregistre|bind ko|bindal)\b/i;
const fr = (n: number) => `${Math.round(n).toLocaleString("fr-FR").replace(/[  ]/g, " ")} F`;

export class Basket {
  intent: OrderIntent = "vente";
  lines: CartLine[] = [];
  payment: Payment | null = null;
  clientId: string | null = null;
  clientName: string | null = null;
  /** Le récapitulatif a été donné et rien n'a changé depuis : on peut valider. */
  private recapped = false;

  get empty() {
    return this.lines.length === 0;
  }

  clear() {
    this.lines = [];
    this.payment = null;
    this.clientId = null;
    this.clientName = null;
    this.intent = "vente";
    this.recapped = false;
  }

  /** Une demande de l'outil « panier ». Renvoie ce que Jokko doit dire ou faire. */
  handle(shop: Shop, args: Record<string, unknown>, commit: (applied: Applied) => void, isPatron: boolean): Record<string, unknown> {
    const action = String(args.action ?? "voir");
    if (typeof args.type === "string" && INTENTS[args.type]) this.setIntent(INTENTS[args.type]);
    // Le paiement et le client ne changent ni les articles ni le total : le récapitulatif reste valable.
    if (typeof args.paiement === "string" && PAYMENTS[args.paiement.toLowerCase()]) this.payment = PAYMENTS[args.paiement.toLowerCase()];
    if (typeof args.client === "string" && args.client.trim()) this.setClient(shop, args.client.trim());

    const unknown: Array<{ entendu: string; choix_possibles: string[] }> = [];
    const items = Array.isArray(args.articles) ? (args.articles as Item[]) : [];

    if (action === "vider") {
      this.clear();
      return { statut: "panier_vide", consigne: "Dis en quelques mots que le panier est vidé." };
    }
    if (action === "ajouter" || action === "changer" || action === "retirer") {
      for (const item of items) {
        const heard = String(item.article ?? "").trim();
        if (!heard) continue;
        const product = shop.products.find((p) => p.id === heard) ?? pickByName(shop.products, heard).item;
        if (!product) {
          unknown.push({ entendu: heard, choix_possibles: pickByName(shop.products, heard).ambiguous.map((p) => p.name) });
          continue;
        }
        const retail = isRetail(product, typeof item.unite === "string" ? item.unite : null);
        const qty = Number(item.quantite);
        const each = typeof item.prixUnitaireDit === "string" && item.prixUnitaireDit.trim() ? spokenAmountToFrancs(item.prixUnitaireDit)?.francs : undefined;
        const index = this.lines.findIndex((l) => l.productId === product.id && l.retail === retail);
        this.change(() => {
          if (action === "retirer" || (action === "changer" && qty === 0)) {
            if (index >= 0) this.lines.splice(index, 1);
            return;
          }
          const q = Number.isFinite(qty) && qty > 0 ? qty : 1;
          if (index >= 0) {
            const line = this.lines[index];
            this.lines[index] = { ...line, qty: action === "changer" ? q : line.qty + q, ...(each ? { price: each } : {}) };
          } else this.lines.push({ productId: product.id, retail, qty: q, ...(each ? { price: each } : {}) });
        });
      }
    }

    if (action === "valider") {
      if (this.empty) return this.recap(shop, unknown);
      // Il faut le « oui » du commerçant, avec ses mots à lui.
      const yes = typeof args.confirmation === "string" && YES.test(args.confirmation);
      if (!yes) {
        const recap = this.recap(shop, unknown);
        this.recapped = unknown.length === 0;
        return { ...recap, statut: "a_confirmer", consigne: `${this.recapInstruction()} Le commerçant n'a pas encore dit oui : récapitule et attends son « waaw » / « oui », puis rappelle valider avec ses mots dans confirmation.` };
      }
      if (!this.recapped) {
        // Le panier a changé : on renvoie le récapitulatif ; Jokko le dit et attend le « waaw ».
        const recap = this.recap(shop, unknown);
        this.recapped = !this.empty && unknown.length === 0;
        return { ...recap, statut: "a_confirmer", consigne: `${this.recapInstruction()} Le panier a changé : récapitule d'abord, n'enregistre rien avant « waaw » / « oui ».` };
      }
      const order = this.order();
      if (this.intent === "achat" && !isPatron) return { statut: "refuse", consigne: "N'enregistre rien. Dis en une phrase que seul le patron peut faire un achat pour le stock." };
      const missing = orderMissing(shop, order, this.payment);
      if (missing) return { ...this.recap(shop, unknown), statut: "incomplet", besoin: missing, consigne: "Rien n'est enregistré. Pose une seule question courte pour avoir cette information, puis récapitule de nouveau." };
      const applied = applyOrder(shop, order, this.payment);
      if (!applied) return { statut: "incomplet", besoin: "le panier n'a pas pu être enregistré", consigne: "Rien n'est enregistré. Dis-le en une phrase." };
      commit(applied);
      const count = this.lines.length;
      this.clear();
      return {
        statut: "enregistre",
        resume: applied.summary,
        nombre_articles: count,
        total_francs: applied.amount ?? null,
        total_en_francs: applied.amount ? fr(applied.amount) : null,
        total_en_wolof: applied.amount ? francsToWolof(applied.amount) : null,
        consigne: "Dis que tout est enregistré (« Bind naa ko lépp »), avec le total exactement comme donné.",
      };
    }

    const recap = this.recap(shop, unknown);
    this.recapped = !this.empty && unknown.length === 0;
    return recap;
  }

  private setIntent(intent: OrderIntent) {
    if (intent !== this.intent) this.change(() => (this.intent = intent));
  }

  private setClient(shop: Shop, name: string) {
    const found = pickByName(shop.clients, name).item;
    this.clientId = found?.id ?? null;
    this.clientName = found?.name ?? name;
  }

  private change(fn: () => void) {
    fn();
    this.recapped = false;
  }

  private order(): Order {
    return { intent: this.intent, payment: this.payment, clientId: this.clientId, clientName: this.clientName, lines: this.lines, unknown: [] };
  }

  private recapInstruction() {
    return "Récapitule le panier ligne par ligne (quantité en wolof ou en français, article), puis dis le total EXACTEMENT comme total_en_wolof (ou total_en_francs), puis demande « Noonu la ? » (« C'est bien ça ? »). Si le commerçant corrige, appelle panier (changer, ajouter ou retirer). Appelle panier « valider » SEULEMENT après « waaw » / « oui ».";
  }

  /** Le récapitulatif calculé par le code : chaque ligne, son prix et le total. */
  recap(shop: Shop, unknown: Array<{ entendu: string; choix_possibles: string[] }> = []): Record<string, unknown> {
    let total = 0;
    let priced = true;
    const lignes = this.lines.map((l) => {
      const p = shop.products.find((x) => x.id === l.productId)!;
      const price = this.intent === "achat" ? purchasePrice(p, l) : l.price ?? unitPrice(p, l.retail);
      const line = price === null ? null : Math.round(l.qty * price);
      if (line === null) priced = false;
      else total += line;
      return {
        article: p.name,
        quantite: l.qty,
        quantite_en_wolof: wolofNumber(l.qty),
        unite: unitName(p, l.retail),
        prix_unitaire_francs: price,
        total_ligne_francs: line,
        total_ligne_en_francs: line === null ? null : fr(line),
        total_ligne_en_wolof: line === null ? null : francsToWolof(line),
      };
    });
    const missing = this.empty ? null : orderMissing(shop, this.order(), this.payment);
    return {
      statut: unknown.length ? "article_inconnu" : this.empty ? "panier_vide" : "a_confirmer",
      type: this.intent,
      lignes,
      nombre_articles: lignes.length,
      total_francs: priced ? total : null,
      total_en_francs: priced ? fr(total) : null,
      total_en_wolof: priced ? (total > 0 ? francsToWolof(total) : "dara") : null,
      paiement: this.payment,
      client: this.clientName,
      ...(missing ? { a_demander: missing } : {}),
      ...(unknown.length ? { inconnus: unknown, consigne_inconnus: "Ces articles ne sont pas dans le stock : demande lequel c'est (dis les choix possibles), sans rien inventer." } : {}),
      consigne: this.empty ? "Le panier est vide : demande ce que le client prend." : this.recapInstruction(),
      resume_ecran: lignes.map((l) => `${l.quantite} ${l.unite} ${l.article}${l.total_ligne_francs !== null ? ` = ${money(l.total_ligne_francs)}` : ""}`).join(" · "),
    };
  }
}
