import { describe, expect, it } from "vitest";
import { HORIZON_DRAWS, horizonBand, horizonForTier } from "../../../apps/showcase-aura-diamond-3d/art/horizon";
import { WINDOW_CANVAS, windowPattern } from "../../../apps/showcase-aura-diamond-3d/src/windowTexture";
import { buildParkScene, DEFAULT_SCENE_CONTEXT } from "../../../apps/showcase-aura-diamond-3d/src/scene";
import { PARKS, PARK_ORDER, HARBOR_WATER } from "../../../apps/showcase-aura-diamond-3d/src/rules";

const sceneNodes = (park: keyof typeof PARKS, ctx = DEFAULT_SCENE_CONTEXT): any[] => (buildParkScene(PARKS[park], ctx).toJSON() as any).nodes;
const flat = (nodes: any[]): any[] => nodes.flatMap((n) => [n, ...flat(n.children ?? [])]);

describe("aura-diamond horizon per park (DIA-W1)", () => {
  it("gives every open-air park one band with its own name, shape mix and colour; the Dome none", () => {
    const bands = PARK_ORDER.map((p) => horizonBand(p));
    expect(bands.filter(Boolean)).toHaveLength(5);
    expect(horizonBand("dome")).toBeNull();
    const live = bands.filter((b): b is NonNullable<typeof b> => b !== null);
    expect(new Set(live.map((b) => b.name)).size).toBe(5);
    expect(new Set(live.map((b) => b.color)).size).toBe(5);
    for (const p of PARK_ORDER) expect(HORIZON_DRAWS[p]).toBe(horizonBand(p) ? 1 : 0);
  });

  it("puts every piece well behind the fence and is deterministic", () => {
    for (const p of PARK_ORDER) {
      const band = horizonBand(p);
      if (!band) continue;
      for (const i of band.instances) expect(Math.hypot(i.position[0], i.position[2])).toBeGreaterThan(PARKS[p].fenceCenter + 30);
      expect(horizonBand(p)).toEqual(band);
    }
  });

  it("mounts the band as one instanced node in GU47 only, half the pieces on Low", () => {
    for (const p of PARK_ORDER) {
      const band = horizonBand(p);
      const found = flat(sceneNodes(p)).filter((n) => band && n.name === band.name);
      expect(found).toHaveLength(band ? 1 : 0);
      if (band) {
        expect(flat(sceneNodes(p, { ...DEFAULT_SCENE_CONTEXT, variant: "original" })).some((n) => n.name === band.name)).toBe(false);
        expect(horizonForTier(band, true).instances.length).toBe(Math.ceil(band.instances.length / 2));
      }
    }
  });

  it("swaps Harbor's flat plane for world.water on the same footprint (original keeps the plane)", () => {
    const water = flat(sceneNodes("sandlot")).find((n) => n.name === "harbor-water");
    expect(water.kind).toBe("water");
    expect(water.options.height).toBe(HARBOR_WATER.y);
    expect(water.options.reflection.high).toBe("ibl");
    const orig = flat(sceneNodes("sandlot", { ...DEFAULT_SCENE_CONTEXT, variant: "original" })).find((n) => n.name === "harbor-water");
    expect(orig.kind).not.toBe("water");
  });

  it("lights about 45% of Midtown's windows with no dark row", () => {
    const lit = windowPattern();
    expect(lit).toHaveLength(WINDOW_CANVAS.columns * WINDOW_CANVAS.rows);
    const frac = lit.reduce((a, b) => a + b, 0) / lit.length;
    expect(frac).toBeGreaterThan(0.35);
    expect(frac).toBeLessThan(0.6);
    for (let r = 0; r < WINDOW_CANVAS.rows; r++) expect(lit.slice(r * 8, r * 8 + 8).some(Boolean)).toBe(true);
  });
});
