import { describe, expect, it } from "vitest";
import { TURF_LAYOUT, bladeNormalTexels, clayNormalTexels, hash01, mowMaskTexels, tileRepeat } from "../../../apps/showcase-aura-diamond-3d/art/turf";
import { PARK_LOOKS } from "../../../apps/showcase-aura-diamond-3d/art/look";
import { buildFieldNodes, DEFAULT_SCENE_CONTEXT } from "../../../apps/showcase-aura-diamond-3d/src/scene";
import { PARKS, PARK_ORDER } from "../../../apps/showcase-aura-diamond-3d/src/rules";

const at = (d: Uint8ClampedArray, size: number, x: number, y: number, c = 0) => d[(y * size + x) * 4 + c]!;
type FieldNode = { readonly name?: string; readonly material?: { readonly emissiveIntensity?: number; readonly color?: string; readonly roughness?: number } };
const field = (park: keyof typeof PARKS, variant: "gu47" | "original") =>
  (buildFieldNodes(PARKS[park], { ...DEFAULT_SCENE_CONTEXT, variant }) as { toJSON(): FieldNode }[]).map((n) => n.toJSON());

describe("aura-diamond turf texels (DIA-M1)", () => {
  it("paints the same bytes for the same seed and different bytes for another", () => {
    expect(mowMaskTexels(64).data).toEqual(mowMaskTexels(64).data);
    expect(bladeNormalTexels(64, 1).data).not.toEqual(bladeNormalTexels(64, 2).data);
    expect(hash01(3, 4, 5)).toBe(hash01(3, 4, 5));
    expect(hash01(3, 4, 5)).toBeGreaterThanOrEqual(0);
    expect(hash01(3, 4, 5)).toBeLessThan(1);
  });

  it("draws two soft mowing stripes per tile, about 12% apart once decoded, tiling seamlessly", () => {
    const { size, data } = mowMaskTexels(128);
    const column = (x: number) => {
      let s = 0;
      for (let y = 0; y < size; y++) s += at(data, size, x, y);
      return s / size;
    };
    const light = column(Math.round(size * 0.25));
    const dark = column(Math.round(size * 0.75));
    expect(light - dark).toBeGreaterThan(12);
    expect(light - dark).toBeLessThan(32);
    // Seam: the first and last columns (and rows) meet without a step.
    expect(Math.abs(column(0) - column(size - 1))).toBeLessThan(4);
    for (let i = 0; i < size * size * 4; i += 4) {
      expect(data[i]).toBe(data[i + 1]);
      expect(data[i + 3]).toBe(255);
    }
  });

  it("encodes unit-length, upward tangent normals for grass blades and clay", () => {
    for (const block of [bladeNormalTexels(64), clayNormalTexels(64)]) {
      for (let i = 0; i < block.data.length; i += 4) {
        const n = [0, 1, 2].map((c) => block.data[i + c]! / 127.5 - 1);
        expect(Math.hypot(n[0]!, n[1]!, n[2]!)).toBeGreaterThan(0.95);
        expect(n[2]!).toBeGreaterThan(0.85);
      }
    }
  });

  it("tiles the blades every 2 m on the 340 m field", () => {
    expect(tileRepeat(TURF_LAYOUT.planeMetres, TURF_LAYOUT.bladeTileMetres)).toBe(170);
    expect(TURF_LAYOUT.planeMetres / tileRepeat(TURF_LAYOUT.planeMetres, TURF_LAYOUT.tileMetres) / TURF_LAYOUT.stripesPerTile).toBe(7.5);
  });
});

describe("aura-diamond GU47 field (DIA-M1)", () => {
  it("has no mow- planes (-9 draws), one warning track and chalk at 0.05 in every park", () => {
    for (const park of PARK_ORDER) {
      const nodes = field(park, "gu47");
      expect(nodes.filter((n) => String(n.name).startsWith("mow-"))).toHaveLength(0);
      expect(nodes.filter((n) => n.name === "field-grass")).toHaveLength(1);
      const track = nodes.filter((n) => n.name === "warning-track");
      expect(track).toHaveLength(1);
      expect(track[0]?.material).toMatchObject({ color: PARK_LOOKS[park].turf.track, roughness: PARK_LOOKS[park].turf.trackRoughness });
      // DIA-W2: the batter's, catcher's and foul lines are one instanced chalk draw, the clay circles and mound another.
      expect(nodes.find((n) => n.name === "field-chalk")?.material?.emissiveIntensity).toBe(0.05);
      expect(nodes.find((n) => n.name === "field-clay")?.material?.color).toBe(PARK_LOOKS[park].turf.clay);
    }
  });

  it("keeps the nine mow planes and the glowing chalk under ?look=original", () => {
    const nodes = field("sandlot", "original");
    expect(nodes.filter((n) => String(n.name).startsWith("mow-"))).toHaveLength(9);
    expect(nodes.some((n) => n.name === "warning-track")).toBe(false);
    expect(nodes.find((n) => n.name === "field-chalk")?.material?.emissiveIntensity).toBe(0.18);
  });
});
