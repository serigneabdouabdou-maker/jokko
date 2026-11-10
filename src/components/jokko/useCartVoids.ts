import { useCallback, useEffect, useRef } from "react";
import type { Shop } from "@/model";
import type { CartLine } from "@/data/checkout";
import { addVoids, bumpPeak, type Peak, voidsFrom } from "@/data/voids";

/**
 * Suit un panier pour noter les articles retirés avant encaissement.
 * - `settle(base, final)` : à l'encaissement, ajoute à `base` ce qui a été retiré (maximum vu − encaissé).
 * - `clear()` : bouton « Vider » : tout le panier est noté comme retiré.
 * - Quitter l'écran avec un panier plein = retrait noté aussi.
 * - Champ de quantité tapé au clavier : on attend la fin de la saisie (`typing`) pour ne pas compter « 1 → 10 → 1 ».
 */
export function useCartVoids(lines: CartLine[], shop: Shop, commit: (s: Shop) => void, by: string, where: "scanner" | "cuisine") {
  const peak = useRef<Peak>({});
  const typingRef = useRef(false);
  const live = useRef({ lines, shop, commit, by });
  live.current = { lines, shop, commit, by };

  useEffect(() => {
    if (!typingRef.current) peak.current = bumpPeak(peak.current, lines);
  }, [lines]);

  const settle = useCallback((base: Shop, final: CartLine[]): Shop => {
    const voids = voidsFrom(base, peak.current, final, live.current.by, where);
    peak.current = {};
    return addVoids(base, voids);
  }, [where]);

  const clear = useCallback(() => {
    const { shop: s, commit: c } = live.current;
    const next = settle(s, []);
    if (next !== s) c(next);
  }, [settle]);

  const typing = useCallback((on: boolean) => {
    typingRef.current = on;
    if (!on) peak.current = bumpPeak(peak.current, live.current.lines);
  }, []);

  useEffect(() => () => {
    if (live.current.lines.length && Object.keys(peak.current).length) {
      const { shop: s, commit: c } = live.current;
      const next = settle(s, []);
      if (next !== s) c(next);
    }
  }, [settle]);

  return { settle, clear, typing };
}
