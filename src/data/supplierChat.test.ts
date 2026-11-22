import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { chatText, mergeSupplierChat, partOf, readSupplierChat } from "./supplierChat";

const CHAT = [
  "12/07/2024, 10:00 - Bathie: 4 LCD bf6 4000=16,000",
  "2 batterie kf6 1700=3400",
  "Total 🟰 19.400fr",
  "12/07/2024, 10:05 - Bathie: 4 LCD bf6 4000=16,000", // même facture renvoyée le même jour
  "2 batterie kf6 1700=3400",
  "Total 🟰 19.400fr",
  "30/01/2026, 19:54 - Bathie: 2 LCD moto g54 6000=12,000",
  "5 lcd spark 4 4000=20,000",
  "3 dos complet a30s 2000=6000",
  "Total 🟰 38,000fr",
  // Deux jours après : la même facture + des pièces en plus (facture cumulée) → seule celle-ci compte.
  "01/02/2026, 10:50 - Bathie: 2 LCD moto g54 6000=12,000",
  "5 lcd spark 4 4000=20,000",
  "3 dos complet a30s 2000=6000",
  "2 LCD 11pro max 10,000=20,000",
  "Total 🟰 58,000fr",
  "29/07/2026, 16:53 - Bathie: 4 LCD Redmi 14c 7000=28.000",
  "6 LCD A12 4500=39.000", // 6 × 4 500 = 27 000 : 12 000 F de trop
  "Total 🟰 67.000fr",
  "05/08/2026, 09:00 - Bathie: 3 lcd a12 49000=14.700", // prix à l'unité mal tapé (4 900)
  "Total 🟰 16,0000", // faute : 16 000
  "05/08/2026, 09:30 - Fallou: Ok merci",
].join("\n");

describe("discussion WhatsApp du fournisseur", () => {
  it("lit les factures, compte une fois les factures renvoyées ou cumulées", () => {
    const r = readSupplierChat(CHAT);
    for (const a of r.anomalies) a.text = a.text.replace(/\u00a0/g, " ");
    expect(r.invoices.map((i) => [i.date, i.total])).toEqual([["2024-07-12", 19400], ["2026-02-01", 58000], ["2026-07-29", 67000], ["2026-08-05", 16000]]);
    expect(r.anomalies.some((a) => a.kind === "doublon" && a.text.includes("38 000 F du 30/01/2026"))).toBe(true);
  });

  it("signale la ligne comptée trop cher, corrige les fautes de frappe sans fausse alerte", () => {
    const r = readSupplierChat(CHAT);
    for (const a of r.anomalies) a.text = a.text.replace(/\u00a0/g, " ");
    const serious = r.anomalies.filter((a) => a.serious);
    expect(serious).toHaveLength(1);
    expect(serious[0]!.text).toContain("12 000 F de trop");
    const a12 = r.invoices.find((i) => i.date === "2026-08-05")!.lines[0]!;
    expect(a12).toMatchObject({ qty: 3, unit: 4900, sub: 14700 });
    expect(r.anomalies.some((a) => a.kind === "faute" && a.text.includes("16 000"))).toBe(true);
  });

  it("lit aussi le .zip exporté et le format iPhone", () => {
    const zip = zipSync({ "Discussion WhatsApp avec Bathie.txt": strToU8(CHAT), "contact.vcf": strToU8("BEGIN:VCARD") });
    expect(readSupplierChat(chatText(zip)).invoices).toHaveLength(4);
    const ios = "[12/07/2024 10:00:12] Bathie: 4 LCD bf6 4000=16,000\nTotal 16.000";
    expect(readSupplierChat(ios).invoices[0]).toMatchObject({ date: "2024-07-12", total: 16000 });
  });

  it("nom propre des pièces, iPhone reconnu", () => {
    expect(partOf("LCD bf6")).toMatchObject({ key: "Écran:bf6", label: "Écran BF6" });
    expect(partOf("écran A12").key).toBe(partOf("lcd a12").key);
    expect(partOf("LCD 11pro max")).toMatchObject({ label: "Écran iPhone 11 Pro Max", iphone: true });
    expect(partOf("lcd xr").label).toBe("Écran iPhone XR");
    expect(partOf("batterie kf6").label).toBe("Batterie KF6");
  });

  it("première lecture : tout est calculé ; lecture suivante : seules les nouvelles factures s'ajoutent", () => {
    const first = readSupplierChat(CHAT.split("29/07/2026")[0]!);
    const a = mergeSupplierChat({ id: "f", name: "Bathie", phone: "" }, first);
    expect(a.full).toBe(true);
    expect(a.added).toEqual([]);
    expect(a.supplier.purchases!.reduce((s, m) => s + m.total, 0)).toBe(77400);
    const b = mergeSupplierChat(a.supplier, readSupplierChat(CHAT));
    expect(b.full).toBe(true); // la discussion part du début : tout est recalculé, sans compter deux fois
    expect(b.added.map((i) => i.date)).toEqual(["2026-07-29", "2026-08-05"]);
    expect(b.supplier.purchases!.reduce((s, m) => s + m.total, 0)).toBe(77400 + 67000 + 16000);
    // Relire la même discussion n'ajoute rien.
    const c = mergeSupplierChat(b.supplier, readSupplierChat(CHAT));
    expect(c.added).toEqual([]);
    expect(c.supplier.purchases!.reduce((s, m) => s + m.total, 0)).toBe(160400);
    const a12 = c.supplier.items!.find((i) => i.key === "Écran:a12")!;
    expect(a12).toMatchObject({ qty: 9, prices: [["2026-07-29", 4500], ["2026-08-05", 4900]] });
    expect(c.supplier.tiers!.find((t) => t.iphone)).toMatchObject({ qty: 2, total: 20000 });
    // Discussion partielle (seulement la fin) : on ajoute à l'historique gardé, sans tout effacer.
    const tail = "29/07/2026" + CHAT.split("29/07/2026")[1]!;
    const d = mergeSupplierChat(a.supplier, readSupplierChat(tail));
    expect(d.full).toBe(false);
    expect(d.supplier.purchases!.reduce((s, m) => s + m.total, 0)).toBe(160400);
    expect(d.supplier.historyFrom).toBe("2024-07-12");
  });
});
