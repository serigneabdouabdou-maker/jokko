import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Payment, PAYMENT_LABELS, type Role, type Shop, money } from "@/model";
import { groupLines, type Order, orderMissing, orderTotal, purchasePrice, purchaseTotal } from "@/assistant/order";
import { setQty, unitName, unitPrice } from "@/data/checkout";

const amount = (n: number) => money(n).replace(/ /g, " ");
const qtyText = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000).replace(".", ","));

export type OrderCardData = { order: Order; status: "attente" | "enregistre" | "annule"; entryId?: string; summary?: string; note?: string };

const TITLES = { vente: "Vente", achat: "Achat pour le stock", facture: "Facture" } as const;

/** Carte du chat : le panier compris par Jokko, à vérifier, puis encaissé, acheté ou facturé d'un toucher. */
export function OrderCard({
  card,
  shop,
  role,
  onChange,
  onConfirm,
  onUndo,
}: {
  card: OrderCardData;
  shop: Shop;
  role: Role;
  onChange: (order: Order) => void;
  /** order : la carte modifiée juste avant de confirmer (client choisi ou tapé). */
  onConfirm: (payment: Payment | null, order?: Order) => void;
  onUndo: () => void;
}) {
  const { order, status } = card;
  const [credit, setCredit] = useState(false);
  const [newClient, setNewClient] = useState(order.clientName ?? "");
  const waiting = status === "attente";
  const purchase = order.intent === "achat";
  const total = purchase ? purchaseTotal(shop, order) : orderTotal(shop, order);
  const missing = orderMissing(shop, order, order.intent === "vente" ? "especes" : null);

  const priceOf = (line: Order["lines"][number]) => {
    const p = shop.products.find((x) => x.id === line.productId);
    if (!p) return null;
    return purchase ? purchasePrice(p, line) : (line.price ?? unitPrice(p, line.retail));
  };

  return (
    <div className={`order-card is-${status}`}>
      <p className="order-title">
        <b>{TITLES[order.intent]}</b>
        {order.clientName && <span> · {order.clientName}</span>}
      </p>
      <ul className="order-lines">
        {order.lines.map((line, i) => {
          const p = shop.products.find((x) => x.id === line.productId);
          if (!p) return null;
          const price = priceOf(line);
          return (
            <li key={`${line.productId}-${line.retail}-${line.price ?? ""}`}>
              <span className="order-name">{p.name}</span>
              {waiting ? (
                <span className="cart-qty">
                  <button type="button" aria-label="Moins" onClick={() => onChange({ ...order, lines: setQty(order.lines, i, line.qty - 1) })}>−</button>
                  <span className="num">{qtyText(line.qty)}</span>
                  <button type="button" aria-label="Plus" onClick={() => onChange({ ...order, lines: setQty(order.lines, i, line.qty + 1) })}>+</button>
                </span>
              ) : (
                <span className="num">{qtyText(line.qty)}</span>
              )}
              <small>{unitName(p, line.retail)} × {price === null ? "prix ?" : amount(price)}</small>
              <b className="num">{price === null ? "—" : amount(Math.round(line.qty * price))}</b>
            </li>
          );
        })}
      </ul>

      {waiting && order.unknown.map((u, k) => (
        <div key={`${u.text}-${k}`} className="order-unknown">
          <span>Je ne connais pas « {u.text} »{u.qty !== 1 ? ` (× ${qtyText(u.qty)})` : ""}. C'est quel article ?</span>
          <select
            className="h-10 rounded-md border px-2"
            value=""
            onChange={(e) => {
              const id = e.target.value;
              const unknown = order.unknown.filter((_, j) => j !== k);
              if (id === "__ignore") return onChange({ ...order, unknown });
              onChange({ ...order, unknown, lines: groupLines([...order.lines, { productId: id, retail: false, qty: u.qty }]) });
            }}
          >
            <option value="">Choisir…</option>
            {[...shop.products].sort((a, b) => Number(u.candidates.includes(b.name)) - Number(u.candidates.includes(a.name))).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
            <option value="__ignore">Ne pas compter</option>
          </select>
        </div>
      ))}

      <p className="order-total">
        <span>Total</span>
        <b className="num">{total === null ? "prix d'achat à dire" : amount(total)}</b>
      </p>

      {card.note && waiting && <p className="note" data-tone="error">{card.note}</p>}

      {waiting && order.intent === "vente" && !missing?.startsWith("Je ne connais") && (
        <>
          <p className="order-ask">C'est payé comment ?</p>
          <div className="pay-modes">
            {(["especes", "wave", "om"] as Payment[]).map((m) => (
              <button key={m} type="button" onClick={() => onConfirm(m)}>{PAYMENT_LABELS[m]}</button>
            ))}
            <button type="button" className={credit ? "on" : ""} onClick={() => (order.clientId ? onConfirm("credit") : setCredit(true))}>Crédit</button>
          </div>
          {credit && !order.clientId && (
            <select className="h-10 rounded-md border px-2" value="" onChange={(e) => {
              const c = shop.clients.find((x) => x.id === e.target.value);
              if (c) onConfirm("credit", { ...order, clientId: c.id, clientName: c.name });
            }}>
              <option value="">Quel client ?</option>
              {shop.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </>
      )}

      {waiting && order.intent === "achat" && (
        role === "patron" ? (
          <Button className="h-11 rounded-full px-5" disabled={total === null || Boolean(order.unknown.length)} onClick={() => onConfirm(null)}>
            Enregistrer l'achat{total ? ` · ${amount(total)}` : ""}
          </Button>
        ) : (
          <p className="note">Les achats pour le stock se font avec le compte du patron.</p>
        )
      )}

      {waiting && order.intent === "facture" && (
        <div className="order-invoice">
          {!order.clientId && (
            <Input className="h-10" value={newClient} onChange={(e) => setNewClient(e.target.value)} placeholder="Nom du client" />
          )}
          <Button className="h-11 rounded-full px-5" disabled={Boolean(order.unknown.length) || (!order.clientId && !newClient.trim())} onClick={() => {
            onConfirm(null, order.clientId ? order : { ...order, clientName: newClient.trim() });
          }}>Créer la facture</Button>
        </div>
      )}

      {status === "enregistre" && (
        <div className="order-done">
          <span>✓ {card.summary}</span>
          <Button variant="outline" className="h-9 rounded-full px-4" onClick={onUndo}>Annuler</Button>
        </div>
      )}
      {status === "annule" && <p className="note">Annulé : rien n'a été gardé.</p>}
    </div>
  );
}
