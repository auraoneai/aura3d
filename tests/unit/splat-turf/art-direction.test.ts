import { describe, expect, it } from "vitest";
import { auditArtDirection, type ArtDirectionSnapshot } from "@aura3d/game/art";
import direction from "../../../apps/showcase-splat-turf/src/art/direction";
import { SplatTurfSim } from "../../../apps/showcase-splat-turf/src/sim";
import { buildWorld } from "../../../apps/showcase-splat-turf/src/world";
import { LOOK } from "../../../apps/showcase-splat-turf/src/look";
import { writeArtDirectionAudit } from "../../../tools/game-checks/lib/art-direction.mjs";

/** Expected in-play draws: sky, ball, shadow, finish + 7 merged batches + key light rig. */
const DRAWS_ESTIMATE = 12;

describe("splat turf art direction", () => {
  it("the mounted scene passes auditArtDirection and the audit record is written", () => {
    const sim = new SplatTurfSim(7);
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
      models: [],
      drawCalls: DRAWS_ESTIMATE
    };
    expect(lights.filter((l) => l.shadow)).toHaveLength(1);
    expect(snapshot.hasAmbient).toBe(false);
    expect(snapshot.environment.kind).toBe("preset");
    const violations = auditArtDirection(direction, snapshot);
    writeArtDirectionAudit("apps/showcase-splat-turf/src/art/direction.ts", { direction, snapshot, violations });
    expect(violations).toEqual([]);
  });

  it("the signature effect and palette name the paint-world carnival identity", () => {
    expect(direction.signatureEffect).toMatch(/coverage map/);
    expect(direction.signatureEffect).toMatch(/solvent wipe wash/);
    expect(direction.palette.primary).toEqual(["#4f2a8f", "#ff9fc8", "#ffd9a8", "#ffffff"]);
    expect(direction.lighting.environment.background).toBe("sky");
    expect(LOOK.road).toBe("#ffffff");
    expect(LOOK.ink).toBe("#3b1f47");
  });
});