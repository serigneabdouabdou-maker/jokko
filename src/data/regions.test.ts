import { describe, expect, it } from "vitest";
import { regionAt, regionFromCity, roundCoord } from "./regions.ts";
import { SENEGAL as map } from "../console/senegalRegions.ts";

describe("régions du Sénégal", () => {
  it("contient les 14 régions", () => {
    expect(map.regions.length).toBe(14);
  });
  it("trouve la région à partir de la position (villes principales)", () => {
    const cases: Array<[number, number, string]> = [
      [14.69, -17.45, "Dakar"], [14.79, -16.93, "Thiès"], [14.86, -15.88, "Diourbel"], [14.15, -16.07, "Kaolack"],
      [16.03, -16.49, "Saint-Louis"], [12.57, -16.27, "Ziguinchor"], [13.77, -13.67, "Tambacounda"], [15.62, -16.22, "Louga"],
      [14.11, -15.55, "Kaffrine"], [12.88, -14.95, "Kolda"], [12.56, -12.18, "Kédougou"], [15.66, -13.26, "Matam"],
      [14.34, -16.41, "Fatick"], [12.71, -15.56, "Sédhiou"],
    ];
    for (const [lat, lng, name] of cases) expect(regionAt(lat, lng, map)).toBe(name);
  });
  it("hors du Sénégal : pas de région", () => {
    expect(regionAt(48.85, 2.35, map)).toBe(null);
  });
  it("devine la région à partir du nom de la ville", () => {
    expect(regionFromCity("Pikine")).toBe("Dakar");
    expect(regionFromCity("Touba Mosquée")).toBe("Diourbel");
    expect(regionFromCity("Mbour")).toBe("Thiès");
    expect(regionFromCity("Commune inconnue")).toBe(null);
  });
  it("arrondit à environ 1 km", () => {
    expect(roundCoord(14.69372)).toBe(14.69);
    expect(roundCoord(-17.44681)).toBe(-17.45);
  });
});
