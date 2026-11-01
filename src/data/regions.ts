// Régions du Sénégal : trouver la région d'une boutique (par sa position, sinon par le nom de sa ville).
// Contours : public/senegal-regions.json (Gouvernement du Sénégal / OCHA, via geoBoundaries, CC BY 3.0 IGO).

export type RegionShape = { name: string; rings: Array<Array<[number, number]>> };
export type RegionMap = { source: string; regions: RegionShape[] };

export const REGIONS = ["Dakar", "Thiès", "Diourbel", "Fatick", "Kaolack", "Kaffrine", "Louga", "Saint-Louis", "Matam", "Tambacounda", "Kédougou", "Kolda", "Sédhiou", "Ziguinchor"] as const;

/** Le point (lng, lat) est-il dans l'anneau ? (méthode du rayon) */
function inRing(lng: number, lat: number, ring: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Région qui contient la position ; sinon la plus proche (position arrondie au bord ou sur la côte). */
export function regionAt(lat: number, lng: number, map: RegionMap): string | null {
  for (const r of map.regions) if (r.rings.some((ring) => inRing(lng, lat, ring))) return r.name;
  let best: string | null = null;
  let bestD = 0.15 ** 2; // au-delà d'environ 15 km du Sénégal : hors carte
  for (const r of map.regions) {
    for (const ring of r.rings) {
      for (const [x, y] of ring) {
        const d = (x - lng) ** 2 + (y - lat) ** 2;
        if (d < bestD) {
          bestD = d;
          best = r.name;
        }
      }
    }
  }
  return best;
}

/** Villes et communes courantes → région (quand la boutique n'est pas placée sur la carte). */
const CITY_REGION: Array<[RegExp, string]> = [
  [/dakar|pikine|gu[ée]diawaye|rufisque|keur massar|parcelles|yoff|ouakam|m[ée]dina|grand.?yoff|thiaroye|bargny|s[ée]bikotane|diamniadio|sangalkam|mbao|malika|yeumbeul/i, "Dakar"],
  [/thi[èe]s|mbour|saly|tivaouane|joal|khombole|pout|kayar|m[ée]kh[ée]|somone|nguekhokh|popenguine/i, "Thiès"],
  [/touba|mback[ée]|diourbel|bambey/i, "Diourbel"],
  [/fatick|foundiougne|gossas|sokone|passy|diofior/i, "Fatick"],
  [/kaolack|nioro|gandiaye|guinguin[ée]o/i, "Kaolack"],
  [/kaffrine|koungheul|birkelane|malem.?hodar/i, "Kaffrine"],
  [/louga|lingu[èe]re|k[ée]b[ée]mer|dahra/i, "Louga"],
  [/saint.?louis|ndar|richard.?toll|dagana|podor|ross.?b[ée]thio/i, "Saint-Louis"],
  [/matam|ourossogui|kanel|ran[ée]rou|thilogne/i, "Matam"],
  [/tambacounda|tamba|bakel|goudiry|koumpentoum/i, "Tambacounda"],
  [/k[ée]dougou|saraya|salemata/i, "Kédougou"],
  [/kolda|v[ée]lingara|m[ée]dina.?yoro.?foulah/i, "Kolda"],
  [/s[ée]dhiou|goudomp|bounkiling/i, "Sédhiou"],
  [/ziguinchor|bignona|oussouye|cap.?skirring/i, "Ziguinchor"],
];

export function regionFromCity(city: string): string | null {
  const c = city.normalize("NFC");
  for (const [re, region] of CITY_REGION) if (re.test(c)) return region;
  return null;
}

/** Arrondi à 0,01° (environ 1 km) : on ne garde jamais une position plus précise. */
export const roundCoord = (v: number) => Math.round(v * 100) / 100;
