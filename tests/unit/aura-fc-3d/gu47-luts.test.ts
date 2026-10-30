import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateCubeLut } from "../../../packages/aura3d-cli/src/admission/cubeLut";
import { assets } from "../../../apps/showcase-aura-fc-3d/src/aura-assets-v2";
import { FC_LUT_SIZE, VENUE_LUTS, fcLutApply, fcLutCube } from "../../../apps/showcase-aura-fc-3d/src/game/luts";
import { VENUE_LUT_ASSETS, buildFcScene, fcEngineGates } from "../../../apps/showcase-aura-fc-3d/src/game/scene";
import { VENUE_ORDER } from "../../../apps/showcase-aura-fc-3d/src/game/content";

/** GU47 WP-19 FC47-P2 (lane g09): per-venue display LUTs are reproducible, admissible and bound on the look grade. */
function hueDeg([r, g, b]: readonly number[]): number {
  const max = Math.max(r!, g!, b!), min = Math.min(r!, g!, b!), d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g! - b!) / d) % 6 : max === g ? (b! - r!) / d + 2 : (r! - g!) / d + 4;
  return (h * 60 + 360) % 360;
}

describe("aura-fc-3d GU47 venue LUTs (FC47-P2)", () => {
  it("each committed .cube equals the generator output, matches its manifest hash and passes admission", () => {
    for (const venue of VENUE_ORDER) {
      const ref = VENUE_LUT_ASSETS[venue];
      const text = readFileSync(`apps/showcase-aura-fc-3d/public${ref.url}`, "utf8");
      expect(text).toBe(fcLutCube(venue));
      expect(ref.hash).toBe(`sha256-${createHash("sha256").update(text).digest("hex")}`);
      expect(validateCubeLut(text)).toMatchObject({ size: FC_LUT_SIZE, rows: FC_LUT_SIZE ** 3 });
      expect(ref.type).toBe("lut");
    }
    expect(Object.keys(assets).filter((k) => k.startsWith("fcLut"))).toHaveLength(6);
  });

  const gradeOf = (venue: (typeof VENUE_ORDER)[number], lut: boolean) => {
    const nodes = (buildFcScene(venue, { engineGates: { lut } }).toJSON() as unknown as { nodes: { name?: string; children?: { name?: string; lut?: { url?: string } }[] }[] }).nodes;
    return nodes.flatMap((n) => [n, ...(n.children ?? [])]).find((n) => n.name === "look color grade") as { lut?: { url?: string } } | undefined;
  };

  it("with the lut gate on (?lut=on), the look grade of every venue binds that venue's LUT", () => {
    for (const venue of VENUE_ORDER) expect(gradeOf(venue, true)?.lut?.url).toBe(VENUE_LUT_ASSETS[venue].url);
  });

  it("by default the LUT stays off until the E-C LUT_PENDING fix lands (phase-2 fallback)", () => {
    for (const venue of VENUE_ORDER) expect(gradeOf(venue, false)?.lut).toBeUndefined();
    expect(fcEngineGates("")).toEqual({ spotShadow: false, stars: false, lut: false });
    expect(fcEngineGates("?lut=on&spotShadow=on&stars=on")).toEqual({ spotShadow: true, stars: true, lut: true });
  });

  it("Munich and Kyoto push the same turf green at least 8 degrees apart in hue", () => {
    const turf: [number, number, number] = [0.18, 0.42, 0.22];
    const dh = Math.abs(hueDeg(fcLutApply(VENUE_LUTS.munich, turf)) - hueDeg(fcLutApply(VENUE_LUTS.kyoto, turf)));
    expect(Math.min(dh, 360 - dh)).toBeGreaterThanOrEqual(8);
  });
});
