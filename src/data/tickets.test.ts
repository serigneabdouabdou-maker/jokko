import { describe, expect, it } from "vitest";
import type { Shop } from "../model.ts";
import { checkout } from "./checkout";
import { dayOfSale, escposBase64, nextTicket, receiptText, ticketSales, zReport, zText } from "./tickets";
import { paperPage } from "./printer";

const base = (): Shop => ({
  id: "s", name: "Chez Awa", activity: "restauration", address: "Médina", phone: "77 000 00 00",
  products: [
    { id: "yassa", name: "Yassa poulet", unit: "plat", stock: 0, min: 0, price: 1500 },
    { id: "bissap", name: "Bissap", unit: "bouteille", stock: 0, min: 0, price: 500 },
  ],
  clients: [], sales: [], expenses: [], invoices: [], reminders: [], shortcuts: [],
} as unknown as Shop);

describe("tickets de caisse", () => {
  it("un encaissement = un numéro, qui se suit dans la journée", () => {
    let s = base();
    expect(nextTicket(s)).toBe(1);
    s = checkout(s, [{ productId: "yassa", retail: false, qty: 2 }, { productId: "bissap", retail: false, qty: 3 }], "especes")!.shop;
    expect(new Set(s.sales.map((x) => x.ticket))).toEqual(new Set([1]));
    s = checkout(s, [{ productId: "bissap", retail: false, qty: 1 }], "wave")!.shop;
    expect(nextTicket(s)).toBe(3);
    expect(ticketSales(s, 1, dayOfSale(s.sales[0]))).toHaveLength(2);
  });
  it("le ticket client tient sur 32 caractères et donne le total", () => {
    const s = checkout(base(), [{ productId: "yassa", retail: false, qty: 2 }, { productId: "bissap", retail: false, qty: 3 }], "especes")!.shop;
    const text = receiptText(s, s.sales.filter((x) => x.ticket === 1));
    expect(text.split("\n").every((l) => l.length <= 32)).toBe(true);
    expect(text).toContain("CHEZ AWA");
    expect(text).toMatch(/TOTAL\s+4 500 F/);
    expect(text).not.toMatch(/[éèà]/);
  });
  it("le ticket Z compte les tickets et signale les numéros manquants", () => {
    let s = base();
    for (let i = 0; i < 3; i++) s = checkout(s, [{ productId: "bissap", retail: false, qty: 1 }], i === 1 ? "wave" : "especes")!.shop;
    s = { ...s, sales: s.sales.filter((x) => x.ticket !== 2) };
    const z = zReport(s);
    expect(z).toMatchObject({ tickets: 2, first: 1, last: 3, missing: [2], total: 1000 });
    expect(z.byPayment.especes).toBe(1000);
    expect(zText(s, z, 900)).toMatch(/Ecart\s+-100 F/);
  });
  it("les commandes ESC/POS commencent par l'initialisation et finissent par la coupe", () => {
    const bytes = atob(escposBase64("A\nB"));
    expect(bytes.charCodeAt(0)).toBe(0x1b);
    expect(bytes.charCodeAt(1)).toBe(0x40);
    expect(bytes.slice(-3)).toBe("\x1d\x56\x01");
    expect(bytes).toContain("A\nB\n");
  });
});

describe("ligne du numéro", () => {
  it("la date complète et l'heure tiennent sur la ligne", () => {
    const s = checkout(base(), [{ productId: "yassa", retail: false, qty: 1 }], "especes")!.shop;
    const head = receiptText(s, s.sales).split("\n").find((l) => l.startsWith("Ticket"))!;
    expect(head).toMatch(/^Ticket n 0001\s+\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
    expect(head.length).toBeLessThanOrEqual(32);
  });
});

describe("papier 80 mm (kits de caisse)", () => {
  it("le ticket client tient sur 48 caractères en 80 mm et sur 32 en 58 mm", () => {
    const s = checkout(base(), [{ productId: "yassa", retail: false, qty: 2 }, { productId: "bissap", retail: false, qty: 3 }], "especes")!.shop;
    const t80 = receiptText(s, s.sales, undefined, 80);
    const t58 = receiptText(s, s.sales, undefined, 58);
    expect(t80.split("\n").every((l) => l.length <= 48)).toBe(true);
    expect(t80.split("\n").some((l) => l.length > 32)).toBe(true);
    expect(t58.split("\n").every((l) => l.length <= 32)).toBe(true);
    expect(t80).toMatch(/TOTAL\s+4 500 F/);
  });
  it("le ticket Z suit la largeur choisie", () => {
    const s = checkout(base(), [{ productId: "bissap", retail: false, qty: 1 }], "especes")!.shop;
    expect(zText(s, zReport(s), 500, 80).split("\n").every((l) => l.length <= 48)).toBe(true);
    expect(zText(s, zReport(s), 500, 80).split("\n").find((l) => l.startsWith("TOTAL VENTES"))!.length).toBe(48);
  });
  it("la page d'impression 80 mm fait tenir 48 caractères dans 72 mm", () => {
    expect(paperPage(80)).toContain("size:80mm auto");
    expect(paperPage(80)).toContain("width:72mm");
    expect(paperPage(58)).toContain("width:48mm");
  });
});
