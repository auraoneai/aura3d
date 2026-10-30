/**
 * IRON CROWN GU47 IC47-M2: every fighter carries a Fresnel rim in its own emissive colour (model override when untinted,
 * on the tint material otherwise); the Gilded and Crimson studio palettes add a clearcoat.
 */
import { describe, expect, it } from "vitest";
import { FIGHTERS, fighterSurface, isLacquerSwatch, PALETTE_SWATCHES } from "../../../apps/showcase-iron-crown/src/game/fighters";

describe("iron-crown fighter surface (GU47 IC47-M2)", () => {
  it("rims each fighter in its own emissive colour, no clearcoat on the default palettes", () => {
    for (const f of FIGHTERS) {
      const s = fighterSurface(f.palette);
      expect(s.rim.color).toBe(f.palette.emissive);
      expect(s.rim.power).toBeGreaterThanOrEqual(0.1);
      expect(s.rim.power).toBeLessThanOrEqual(16);
      expect(s.rim.intensity).toBeGreaterThan(0);
      expect(s.clearcoat).toBeUndefined();
    }
  });

  it("lacquers only the Gilded and Crimson studio palettes", () => {
    const base = FIGHTERS[0]!.palette;
    for (const sw of PALETTE_SWATCHES) {
      const s = fighterSurface({ ...base, color: sw.color, emissive: sw.emissive || base.emissive, lacquer: isLacquerSwatch(sw.id) });
      expect(Boolean(s.clearcoat), sw.id).toBe(sw.id === "gilded" || sw.id === "crimson");
    }
  });
});
