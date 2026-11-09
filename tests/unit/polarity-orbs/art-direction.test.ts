import { describe, expect, it } from "vitest";
import { auditArtDirection, type ArtDirectionSnapshot } from "@aura3d/game/art";
import direction from "../../../apps/showcase-polarity-orbs/src/art/direction";
import { PolarityOrbsSim } from "../../../apps/showcase-polarity-orbs/src/sim";
import { buildWorld } from "../../../apps/showcase-polarity-orbs/src/world";
import { LOOK } from "../../../apps/showcase-polarity-orbs/src/look";
import { writeArtDirectionAudit } from "../../../tools/game-checks/lib/art-direction.mjs";

/**
 * Expected in-play draws: sky, cloud sea, 4 scenery layers, ball, shadow, shield, shockwave + 9 merged batches, plus the
 * 12 Meshy backdrop pieces (one primitive each).
 */
const DRAWS_ESTIMATE = 31;
/** Meshy backdrop models (triangles after the Meshy-07 admission decimation; three maps each: BC, ORM, N). */
const BACKDROP_TRIANGLES: Record<string, number> = {
  poChargeCoil: 6242, poCrystalRed: 5388, poCrystalIslandB: 5906, poCrystalBlue: 7420, poCrystalIsland: 6824, poMagnet: 6782
};

describe("polarity orbs art direction", () => {
  it("the mounted scene passes auditArtDirection and the audit record is written", () => {
    const sim = new PolarityOrbsSim(7);
    const world = buildWorld({ sim, aspect: 16 / 9 });
    const nodes = world.scene.toJSON().nodes as unknown as Record<string, unknown>[];
    const lights = nodes
      .filter((n) => n.kind === "light")
      .map((n) => ({ type: String(n.light), shadow: Boolean(n.shadow), intensity: Number(n.intensity ?? 1) }));
    const env = nodes.find((n) => n.kind === "environment");
    const snapshot: ArtDirectionSnapshot = {
      lights,
      hasAmbient: lights.some((l) => l.type === "ambient"),
      environment: { kind: env?.environment === "hdri" ? "hdri" : env ? "preset" : "none", background: env?.background === true },
      models: Object.entries(BACKDROP_TRIANGLES).map(([assetKey, triangles]) => ({ assetKey, triangles, textures: 3, unlit: false, overridesTextures: false })),
      drawCalls: DRAWS_ESTIMATE
    };
    expect(lights.filter((l) => l.shadow)).toHaveLength(1);
    expect(snapshot.hasAmbient).toBe(false);
    expect(snapshot.environment.kind).toBe("preset");
    const violations = auditArtDirection(direction, snapshot);
    writeArtDirectionAudit("apps/showcase-polarity-orbs/src/art/direction.ts", { direction, snapshot, violations });
    expect(violations).toEqual([]);
  });

  it("the signature effect and palette name the split warm-red / cool-blue dusk identity", () => {
    expect(direction.signatureEffect).toMatch(/Dual-tone world halves/);
    expect(direction.signatureEffect).toMatch(/flip shockwave ring/);
    expect(direction.signatureEffect).toMatch(/magnet attraction streams/);
    expect(direction.palette.primary).toEqual([LOOK.red, LOOK.blue, LOOK.deckWarm, LOOK.deckCool]);
    expect(direction.palette.accent).toBe(LOOK.gold);
    expect(direction.palette.reservedObjective).toBe(LOOK.mint);
    expect(direction.lighting.environment.background).toBe("sky");
  });
});
