/** Idol wow pass grounding sweep: the wider Idol canyon pieces sink far enough that their downhill edge stays buried. */
import { describe, expect, it } from "vitest";
import { IDOL_POOL_SINK } from "../../../examples/heatsink-port/art/idolModels";
import { ION_IDOL } from "../../../apps/showcase-heatsink-port/src/idol-assets";

/** The steepest banked-shoulder fall across the scenery band (models.ts SHOULDER_DROPS: 4.3 m over 26 m). */
const SHOULDER_SLOPE = 0.17;
/** How deep the procedural placements already sit (models.ts: `- 0.55`). */
const BASE_SINK = 0.55;

describe("Ion Circuit Idol canyon scenery grounding", () => {
  const pools = { caps: ION_IDOL.ioncMesa, corals: ION_IDOL.ioncCryoVent, ruins: ION_IDOL.ioncCoolantTower, arches: ION_IDOL.ioncBoostArch } as const;
  for (const [kind, asset] of Object.entries(pools) as [keyof typeof pools, (typeof pools)[keyof typeof pools]][]) {
    it(`${kind}: the downhill edge of the footprint stays at or below the shoulder at every instance scale`, () => {
      const b = (asset as { bounds?: readonly number[] }).bounds!;
      const half = Math.min(b[0]!, b[2]!) / 2;
      for (const scale of [0.8, 1.05, 1.3]) {
        const lift = half * scale * SHOULDER_SLOPE - BASE_SINK - IDOL_POOL_SINK[kind] * scale;
        expect(lift, `${kind} at ${scale}`).toBeLessThanOrEqual(0.05);
      }
    });
  }
});
