import { describe, expect, it } from "vitest";
import { type Shop, seedShop } from "../model";
import { applyDraft } from "./apply";
import type { DraftAction } from "./client";
import { type Entry, LiveDesk, normalizeAction, pickByName, sameName } from "./liveDesk";

const blank: DraftAction = {
  type: "sale",
  productId: null,
  productName: null,
  quantity: null,
  amount: null,
  clientId: null,
  clientName: null,
  label: null,
};

function setup() {
  let shop: Shop = seedShop();
  const saved: Entry[] = [];
  const undone: Entry[] = [];
  const desk = new LiveDesk({
    getShop: () => shop,
    lang: () => "wo",
    write: (next) => {
      shop = next;
    },
    onSaved: (entry) => saved.push(entry),
    onUndone: (entry) => undone.push(entry),
  });
  return { desk, saved, undone, shop: () => shop, set: (next: Shop) => (shop = next) };
}

describe("applyDraft", () => {
  it("vend 2 bidons d’huile : vente notée et stock baissé", () => {
    const shop = seedShop();
    const huile = shop.products.find((p) => p.name === "Huile")!;
    const applied = applyDraft(shop, { ...blank, productId: huile.id, quantity: 2 })!;
    expect(applied.summary).toMatch(/^Vente · 2 bidon Huile · 15\s000 F$/);
    expect(applied.shop.sales[0]).toMatchObject({ label: "Huile", amount: 15000, qty: 2, productId: huile.id });
    expect(applied.shop.products.find((p) => p.id === huile.id)!.stock).toBe(1);
  });

  it("vente au comptoir, dépense, réapprovisionnement, dette et facture", () => {
    const shop = seedShop();
    const riz = shop.products.find((p) => p.name === "Riz brisé")!;
    const moussa = shop.clients.find((c) => c.name.startsWith("Moussa"))!;
    expect(applyDraft(shop, { ...blank, amount: 15000 })!.shop.sales[0]).toMatchObject({ label: "Vente", amount: 15000 });
    expect(applyDraft(shop, { ...blank, type: "expense", amount: 2000, label: "Transport" })!.shop.expenses[0]).toMatchObject({ label: "Transport", amount: 2000 });
    expect(applyDraft(shop, { ...blank, type: "stock_adjust", productId: riz.id, quantity: 10 })!.shop.products.find((p) => p.id === riz.id)!.stock).toBe(22);
    expect(applyDraft(shop, { ...blank, type: "debt_payment", clientId: moussa.id, amount: 5000 })!.shop.clients.find((c) => c.id === moussa.id)!.debt).toBe(15000);
    expect(applyDraft(shop, { ...blank, type: "invoice", clientId: moussa.id, amount: 9000 })!.shop.invoices[0]).toMatchObject({ number: `JK-${new Date().getFullYear()}-0001`, amount: 9000, lines: [{ label: "Marchandises", qty: 1, unitPrice: 9000 }] });
  });

  it("une dette pour un client inconnu crée le client", () => {
    const shop = seedShop();
    const applied = applyDraft(shop, { ...blank, type: "debt_add", clientName: "ibrahima", amount: 3000 })!;
    const ibra = applied.shop.clients.find((c) => c.name === "Ibrahima")!;
    expect(ibra.debt).toBe(3000);
    expect(applied.shop.clients).toHaveLength(shop.clients.length + 1);
  });

  it("refuse une écriture incomplète", () => {
    const shop = seedShop();
    expect(applyDraft(shop, blank)).toBeNull();
    expect(applyDraft(shop, { ...blank, type: "expense" })).toBeNull();
    expect(applyDraft(shop, { ...blank, type: "debt_add", amount: 1000 })).toBeNull();
    expect(applyDraft(shop, { ...blank, type: "debt_payment", clientName: "Inconnu", amount: 1000 })).toBeNull();
  });
});

describe("noms wolof des articles", () => {
  it("ceeb = riz, diw = huile, suukar = sucre", () => {
    expect(sameName("Riz brisé", "ceeb")).toBe(true);
    expect(sameName("Huile", "ñaari bidon diw")).toBe(true);
    expect(sameName("Sucre", "suukar")).toBe(true);
    expect(sameName("Huile", "huiles")).toBe(true);
    expect(sameName("Sucre", "riz")).toBe(false);
    expect(sameName("Pomme de terre", "de")).toBe(false);
  });

  it("ne confond pas les articles (sel ≠ liquide vaisselle, sac ≠ sac de charbon)", () => {
    const shop = seedShop();
    const extra: Shop = {
      ...shop,
      products: [
        { id: "p-vaisselle", name: "Liquide vaisselle", unit: "bouteille", stock: 5, min: 1, price: 1000 },
        { id: "p-charbon", name: "Sac de charbon", unit: "sac", stock: 5, min: 1, price: 3000 },
        { id: "p-sel", name: "Sel", unit: "paquet", stock: 5, min: 1, price: 200 },
        ...shop.products,
      ],
    };
    expect(normalizeAction({ type: "sale", productName: "xorom", quantity: 1 }, extra)!.productId).toBe("p-sel");
    expect(normalizeAction({ type: "sale", productName: "sac de riz", quantity: 1 }, extra)!.productName).toBe("Riz brisé");
  });

  it("lit 15.000 et 15 000 F comme quinze mille", () => {
    expect(normalizeAction({ type: "sale", amount: "15.000" }, seedShop())!.amount).toBe(15000);
    expect(normalizeAction({ type: "sale", amount: "15 000 F" }, seedShop())!.amount).toBe(15000);
  });

  it("normalise les montants dits avec des espaces", () => {
    const action = normalizeAction({ type: "sale", productName: "diw", quantity: "2", amount: "15 000" }, seedShop())!;
    expect(action).toMatchObject({ productName: "Huile", quantity: 2, amount: 15000 });
  });
});

describe("LiveDesk : enregistrement automatique", () => {
  it("enregistre tout de suite, sans attendre de oui", () => {
    const { desk, saved, shop } = setup();
    const result = desk.handle({ name: "enregistrer", args: { type: "sale", productName: "diw", quantity: 2, heard: "Jaay naa ñaari bidon diw" } });
    expect(result).toMatchObject({ statut: "enregistre", resume: expect.stringContaining("15") });
    expect(result.stock_bas).toEqual(["Huile : 1 bidon"]);
    expect(shop().sales).toHaveLength(2);
    expect(shop().products.find((p) => p.name === "Huile")!.stock).toBe(1);
    expect(saved).toHaveLength(1);
  });

  it("« ñaari junni » se calcule en dërëm : 10 000 F, et Jokko reçoit la phrase wolof à dire", () => {
    const { desk, shop } = setup();
    const result = desk.handle({ name: "enregistrer", args: { type: "sale", amount: 2000, montantDit: "ñaari junni", heard: "jaay naa ñaari junni" } });
    expect(result).toMatchObject({ statut: "enregistre", montant_francs: 10000, montant_en_wolof: "ñaari junni" });
    expect(shop().sales[0].amount).toBe(10000);
  });

  it("convertir_montant : 1 500 F = ñetti téeméer, et l'inverse", () => {
    const { desk } = setup();
    expect(desk.handle({ name: "convertir_montant", args: { francs: 1500 } })).toMatchObject({ en_wolof: "ñetti téeméer", en_derem: 300 });
    expect(desk.handle({ name: "convertir_montant", args: { mots: "ñetti téeméer" } })).toMatchObject({ francs: 1500 });
    expect(desk.handle({ name: "convertir_montant", args: { mots: "bla bla" } })).toMatchObject({ statut: "pas_compris" });
  });

  it("garde-fou : montant pas clair → rien n'est enregistré, Jokko fait répéter", () => {
    const { desk, shop } = setup();
    const result = desk.handle({ name: "enregistrer", args: { type: "sale", amount: 3000, montantDit: "euh je sais pas", heard: "jaay naa euh" } });
    expect(result).toMatchObject({ statut: "pas_compris", consigne: expect.stringContaining("Baal ma, ñaata la") });
    expect(shop().sales).toHaveLength(1);
  });

  it("garde-fou : la calculatrice relit la phrase et corrige un montant faux du modèle", () => {
    const { desk, shop } = setup();
    desk.handle({ name: "enregistrer", args: { type: "sale", amount: 2000, heard: "jaay naa ñaari junni" } });
    expect(shop().sales[0].amount).toBe(10000);
  });

  it("lire_boutique donne les dettes en wolof (20 000 F = ñeenti junni)", () => {
    const { desk } = setup();
    const context = desk.handle({ name: "lire_boutique" }) as { montants_en_wolof: { dettes: Record<string, string> } };
    expect(context.montants_en_wolof.dettes["Moussa Ndiaye"]).toBe("ñeenti junni");
  });

  it("phrase incomplète : rien n’est enregistré, Jokko doit demander", () => {
    const { desk, shop } = setup();
    const result = desk.handle({ name: "enregistrer", args: { type: "expense", heard: "transport" } });
    expect(result).toMatchObject({ statut: "incomplet", besoin: "le montant" });
    expect(shop().expenses).toHaveLength(1);
  });

  it("« déedéet » : annule la dernière écriture", () => {
    const { desk, undone, shop } = setup();
    const before = shop();
    desk.handle({ name: "enregistrer", args: { type: "sale", amount: 5000, heard: "vente 5000" } });
    expect(desk.handle({ name: "annuler_derniere" })).toMatchObject({ statut: "annule" });
    expect(shop()).toBe(before);
    expect(undone).toHaveLength(1);
    expect(desk.handle({ name: "annuler_derniere" })).toMatchObject({ statut: "rien_a_annuler" });
  });

  it("annuler garde les changements faits à la main après l’écriture", () => {
    const { desk, shop, set } = setup();
    desk.handle({ name: "enregistrer", args: { type: "sale", productName: "huile", quantity: 2, heard: "2 huile" } });
    const sucre = shop().products.find((p) => p.name === "Sucre")!;
    set({ ...shop(), products: shop().products.map((p) => (p.id === sucre.id ? { ...p, stock: 99 } : p)) });
    desk.undo();
    expect(shop().sales).toHaveLength(1);
    expect(shop().products.find((p) => p.name === "Huile")!.stock).toBe(3);
    expect(shop().products.find((p) => p.name === "Sucre")!.stock).toBe(99);
  });

  it("le commerçant coupe la parole : l’appel annulé par Gemini est défait (pas de double vente)", () => {
    const { desk, shop } = setup();
    desk.handle({ id: "call-1", name: "enregistrer", args: { type: "sale", productName: "huile", quantity: 2, heard: "ñaari diw" } });
    desk.cancelCalls(["call-1"]);
    desk.handle({ id: "call-2", name: "enregistrer", args: { type: "sale", productName: "huile", quantity: 2, heard: "ñaari diw ak suukar" } });
    expect(shop().sales).toHaveLength(2);
    expect(shop().products.find((p) => p.name === "Huile")!.stock).toBe(1);
  });

  it("la même écriture répétée tout de suite n’est enregistrée qu’une fois", () => {
    const { desk, shop } = setup();
    desk.handle({ name: "enregistrer", args: { type: "sale", amount: 5000, heard: "vente 5000" } });
    desk.handle({ name: "enregistrer", args: { type: "sale", amount: 5000, heard: "vente 5000" } });
    expect(shop().sales).toHaveLength(2);
  });

  it("« déedéet » ne défait pas une vente d’il y a une heure", () => {
    const { desk, shop } = setup();
    desk.handle({ name: "enregistrer", args: { type: "sale", amount: 5000, heard: "vente" } });
    desk.history[0].at -= 60 * 60_000;
    expect(desk.handle({ name: "annuler_derniere" })).toMatchObject({ statut: "rien_a_annuler" });
    expect(shop().sales).toHaveLength(2);
  });

  it("n’annule jamais une écriture d’une autre boutique", () => {
    const { desk, shop, set } = setup();
    desk.handle({ name: "enregistrer", args: { type: "sale", amount: 5000, heard: "vente" } });
    const other = { ...seedShop() };
    set(other);
    expect(desk.undo()).toBeNull();
    expect(shop()).toBe(other);
  });

  it("clients : prend le bon client, pas le premier de la liste", () => {
    const { desk, shop } = setup();
    const moussa = shop().clients.find((c) => c.name.startsWith("Moussa"))!;
    const fatou = shop().clients.find((c) => c.name.startsWith("Fatou"))!;
    // Le modèle envoie l'id de Moussa mais le commerçant a dit « Fatou » : c'est Fatou.
    desk.handle({ name: "enregistrer", args: { type: "debt_payment", clientId: moussa.id, clientName: "Fatou", amount: 1000, heard: "Fatou fey na 1000" } });
    expect(shop().clients.find((c) => c.id === fatou.id)!.debt).toBe(7500);
    expect(shop().clients.find((c) => c.id === moussa.id)!.debt).toBe(20000);
  });

  it("clients : deux noms proches → Jokko demande lequel, rien n'est enregistré", () => {
    const { desk, shop, set } = setup();
    set({ ...shop(), clients: [...shop().clients, { id: "c-awa2", name: "Awa Fall", phone: "", debt: 0 }] });
    const result = desk.handle({ name: "enregistrer", args: { type: "debt_add", clientName: "Awa", amount: 2000, heard: "Awa bor na 2000" } });
    expect(result).toMatchObject({ statut: "incomplet", besoin: expect.stringContaining("Awa Diop ou Awa Fall") });
    expect(shop().clients.every((c) => c.debt === 0 || c.name !== "Awa Fall")).toBe(true);
  });

  it("pickByName : nom complet exact, puis prénom", () => {
    const list = [{ id: "1", name: "Awa Diop" }, { id: "2", name: "Awa Fall" }, { id: "3", name: "Moussa Ndiaye" }];
    expect(pickByName(list, "Awa Fall").item?.id).toBe("2");
    expect(pickByName(list, "awa fall bi").item?.id).toBe("2");
    expect(pickByName(list, "Moussa").item?.id).toBe("3");
    expect(pickByName(list, "Awa").ambiguous.map((x) => x.id)).toEqual(["1", "2"]);
    expect(pickByName(list, "Ibrahima").item).toBeUndefined();
  });

  it("annuler un paiement remet aussi l'échéance de la dette", () => {
    const { desk, shop, set } = setup();
    const moussa = shop().clients.find((c) => c.name.startsWith("Moussa"))!;
    const due = new Date(Date.now() + 5 * 86_400_000).toISOString();
    set({ ...shop(), clients: shop().clients.map((c) => (c.id === moussa.id ? { ...c, dueAt: due } : c)) });
    desk.handle({ name: "enregistrer", args: { type: "debt_payment", clientId: moussa.id, amount: 20000, heard: "Moussa fey na" } });
    expect(shop().clients.find((c) => c.id === moussa.id)!.dueAt).toBeUndefined();
    desk.handle({ name: "enregistrer", args: { type: "sale", amount: 500, heard: "vente 500" } });
    desk.cancelCalls([]);
    // annule le paiement alors qu'une autre écriture a suivi
    const entry = desk.history[1];
    desk.history = [entry, desk.history[0]];
    desk.undo();
    expect(shop().clients.find((c) => c.id === moussa.id)).toMatchObject({ debt: 20000, dueAt: due });
  });

  it("unité inconnue à la voix : Jokko demande l'unité", () => {
    const { desk } = setup();
    expect(desk.handle({ name: "enregistrer", args: { type: "sale", productName: "huile", quantity: 2, unite: "sachet", heard: "ñaari sachet diw" } })).toMatchObject({ statut: "incomplet", besoin: expect.stringContaining("bidon") });
  });

  it("lit la boutique sans téléphone et ignore les outils inconnus", () => {
    const { desk } = setup();
    const context = desk.handle({ name: "lire_boutique" });
    expect(context).toMatchObject({ language: "wo" });
    expect(JSON.stringify(context)).not.toMatch(/phone|221\d{9}/);
    expect(desk.handle({ name: "supprimer_tout" })).toEqual({ statut: "outil_inconnu" });
  });
});

describe("totaux faits par le code", () => {
  it("total des dettes de 10 clients, au franc près, en francs et en wolof", async () => {
    const { debtTotals } = await import("./liveDesk");
    const clients = [12500, 8500, 20000, 3750, 45250, 1000, 600, 15000, 2250, 7400].map((debt, i) => ({ name: `Client ${i + 1}`, debt }));
    const t = debtTotals([...clients, { name: "Sans dette", debt: 0 }]);
    expect(t.nombre_clients).toBe(10);
    expect(t.total_francs).toBe(116250);
    expect(t.total_en_francs).toBe("116 250 F");
    expect(t.total_en_wolof).toBe("ñaar-fukk ak ñetti junni ak ñaari téeméer ak juróom-fukk");
    expect(t.liste[0]).toMatchObject({ client: "Client 5", francs: 45250, en_wolof: "juróom-ñeenti junni ak juróom-fukk" });
  });

  it("calculer : somme et différence", async () => {
    const { calculate } = await import("./liveDesk");
    expect(calculate({ operation: "somme", montants: [20000, 8500] })).toMatchObject({ resultat_francs: 28500, en_wolof: "juróomi junni ak juróom-ñaari téeméer" });
    expect(calculate({ operation: "difference", montants: [50000, 45250] })).toMatchObject({ resultat_francs: 4750, en_francs: "4 750 F" });
    expect(calculate({ montants: ["abc"] })).toMatchObject({ statut: "pas_compris" });
  });
});

describe("panier de plusieurs articles (récapitulé avant d'enregistrer)", () => {
  const add = (articles: Array<Record<string, unknown>>) => ({ name: "panier", args: { action: "ajouter", articles } });

  it("ajoute, récapitule, se fait corriger, puis enregistre tout d'un coup après « waaw »", () => {
    const { desk, saved, shop } = setup();
    const stockRiz = shop().products.find((p) => p.name === "Riz brisé")!.stock;
    const r1 = desk.handle(add([{ article: "riz", quantite: 2 }, { article: "huile", quantite: 2 }, { article: "sucre", quantite: 3, unite: "kg" }, { article: "lait", quantite: 4 }]));
    expect(r1).toMatchObject({ statut: "a_confirmer", nombre_articles: 4, total_francs: 56700 });
    expect(saved.length).toBe(0);

    // Valider sans le « oui » du commerçant : refusé, il faut récapituler et attendre
    expect(desk.handle({ name: "panier", args: { action: "valider", paiement: "especes" } })).toMatchObject({ statut: "a_confirmer", total_francs: 56700 });
    expect(saved.length).toBe(0);

    // « Non, un seul sac de riz » : le panier change, nouveau récapitulatif
    expect(desk.handle({ name: "panier", args: { action: "changer", articles: [{ article: "riz", quantite: 1 }] } })).toMatchObject({ statut: "a_confirmer", total_francs: 38700 });
    expect(saved.length).toBe(0);

    // Récapitulatif donné, « waaw » : tout part
    const done = desk.handle({ name: "panier", args: { action: "valider", paiement: "especes", confirmation: "waaw, noonu la" } });
    expect(done).toMatchObject({ statut: "enregistre", nombre_articles: 4, total_francs: 38700, total_en_francs: "38 700 F" });
    expect(saved.length).toBe(1);
    expect(shop().products.find((p) => p.name === "Riz brisé")!.stock).toBe(stockRiz - 1);
    expect(desk.basket.empty).toBe(true);
  });

  it("demande le paiement sans refaire le récapitulatif, et refuse un article inconnu", () => {
    const { desk, saved } = setup();
    desk.handle(add([{ article: "riz", quantite: 1 }, { article: "huile", quantite: 2 }, { article: "sucre", quantite: 3 }]));
    expect(desk.handle({ name: "panier", args: { action: "valider", confirmation: "oui" } })).toMatchObject({ statut: "incomplet", besoin: "C'est payé comment ?" });
    expect(desk.handle({ name: "panier", args: { action: "valider", paiement: "wave", confirmation: "waaw, Wave" } })).toMatchObject({ statut: "enregistre", total_francs: 35100 });
    expect(saved.length).toBe(1);
    expect(desk.handle(add([{ article: "trottinette", quantite: 1 }]))).toMatchObject({ statut: "article_inconnu" });
  });

  it("plus de 10 articles d'un coup", () => {
    const { desk } = setup();
    const many = Array.from({ length: 12 }, (_, i) => ({ article: ["riz", "huile", "sucre", "lait"][i % 4], quantite: 1 }));
    const r = desk.handle(add(many));
    expect(r).toMatchObject({ statut: "a_confirmer", nombre_articles: 4 });
    expect((r.lignes as Array<{ quantite: number }>).map((l) => l.quantite)).toEqual([3, 3, 3, 3]);
  });
});

describe("deux articles qui se ressemblent : huile moteur et huile de cuisine", () => {
  const items = [
    { id: "moteur", name: "Huile moteur" },
    { id: "cuisine", name: "Huile de cuisine" },
  ];
  it("le mot qui distingue suffit, en français comme en wolof", () => {
    expect(pickByName(items, "huile moteur").item?.id).toBe("moteur");
    expect(pickByName(items, "diwu oto").item?.id).toBe("moteur");
    expect(pickByName(items, "ñaari bidon diwu togg").item?.id).toBe("cuisine");
    expect(pickByName(items, "huile de cuisine").item?.id).toBe("cuisine");
  });
  it("sans mot qui distingue (« diw », « huile »), Jokko demande au lieu de deviner", () => {
    expect(pickByName(items, "diw").ambiguous.map((x) => x.id).sort()).toEqual(["cuisine", "moteur"]);
    expect(pickByName(items, "huile").ambiguous).toHaveLength(2);
  });
  it("les autres noms donnés par le patron (wolof, surnoms) sont reconnus", () => {
    const named = [
      { id: "moteur", name: "Huile moteur", aliases: ["Total Quartz"] },
      { id: "cuisine", name: "Huile de cuisine", aliases: ["diwlin Niinal"] },
    ];
    expect(pickByName(named, "total quartz").item?.id).toBe("moteur");
    expect(pickByName(named, "niinal").item?.id).toBe("cuisine");
  });
});

describe("Un métier = ses articles, et ses mots", () => {
  const tailor = (): Shop => ({
    ...seedShop(),
    activity: "Couture, tailleur",
    products: [
      { id: "bazin", name: "Bazin riche", unit: "mètre", stock: 40, min: 10, price: 3500 },
      { id: "fil", name: "Fil à coudre", unit: "bobine", stock: 20, min: 5, price: 250 },
    ],
  });

  it("du riz chez un tailleur n'est pas enregistré sans question ; une dépense passe", () => {
    const { desk, shop, set } = setup();
    set(tailor());
    const asked = desk.handle({ name: "enregistrer", args: { type: "sale", productName: "riz", quantity: 2, amount: 36000, heard: "vends 2 sacs de riz à 36 000" } });
    expect(asked).toMatchObject({ statut: "hors_metier", article: "riz" });
    expect(shop().sales).toHaveLength(tailor().sales.length);
    // Le commerçant confirme : c'est bien pour sa boutique.
    expect(desk.handle({ name: "enregistrer", args: { type: "sale", productName: "riz", quantity: 2, amount: 36000, heard: "waaw, vends 2 sacs de riz à 36 000", horsMetierConfirme: true } })).toMatchObject({ statut: "enregistre" });
    // Le repas du tailleur reste une dépense normale.
    expect(desk.handle({ name: "enregistrer", args: { type: "expense", amount: 1500, label: "repas : riz au poisson", heard: "dépense 1 500 pour le repas" } })).toMatchObject({ statut: "enregistre" });
  });

  it("l'alimentation vend du riz sans question", () => {
    const { desk } = setup();
    expect(desk.handle({ name: "enregistrer", args: { type: "sale", productName: "riz", quantity: 1, heard: "jaay naa benn sac riz" } })).toMatchObject({ statut: "enregistre" });
  });

  it("carnet de mots : le mot du commerçant devient un autre nom de l'article, oublié si on annule", () => {
    const { desk, shop, set } = setup();
    set(tailor());
    const first = desk.handle({ name: "enregistrer", args: { type: "sale", productId: "bazin", productName: "getzner bleu", quantity: 2, heard: "jaay naa ñaari mètre getzner bleu" } });
    expect(first).toMatchObject({ statut: "enregistre", mot_appris: "getzner bleu = Bazin riche" });
    expect(shop().products.find((p) => p.id === "bazin")!.aliases).toEqual(["getzner bleu"]);
    // La fois suivante, le code le reconnaît tout seul, sans l'id donné par Gemini.
    expect(pickByName(shop().products, "getzner bleu").item?.id).toBe("bazin");
    desk.handle({ name: "annuler_derniere", args: {} });
    expect(shop().products.find((p) => p.id === "bazin")!.aliases ?? []).toEqual([]);
  });

  it("carnet de mots : rien n'est appris si le mot n'a pas été dit, ou s'il est déjà connu", () => {
    const { desk, shop, set } = setup();
    set(tailor());
    // Gemini reformule (« tissu bleu » n'est pas dans la phrase) : rien appris.
    expect(desk.handle({ name: "enregistrer", args: { type: "sale", productId: "bazin", productName: "tissu bleu", quantity: 1, heard: "jaay naa benn mètre bu bleu" } }).mot_appris).toBeUndefined();
    // Nom déjà connu : rien appris.
    desk.handle({ name: "enregistrer", args: { type: "sale", productId: "fil", productName: "fil", quantity: 1, heard: "vends un fil" } });
    expect(shop().products.every((p) => !p.aliases?.length)).toBe(true);
  });
});
