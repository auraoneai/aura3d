import { describe, expect, it } from "vitest";
import { auditArtDirection, type ArtDirectionSnapshot } from "@aura3d/game/art";
import direction from "../../../apps/showcase-shape-shift-sprint/src/art/direction";
import { ShapeShiftSim } from "../../../apps/showcase-shape-shift-sprint/src/sim";
import { buildWorld } from "../../../apps/showcase-shape-shift-sprint/src/world";
import { LOOK } from "../../../apps/showcase-shape-shift-sprint/src/look";
import { writeArtDirectionAudit } from "../../../tools/game-checks/lib/art-direction.mjs";

/** Expected in-play draws: sky, 3 player meshes, shadow, shield, wildcard ring + 6 merged batches + key light rig. */
const DRAWS_ESTIMATE = 13;

describe("shape shift sprint art direction", () => {
  it("the mounted scene passes auditArtDirection and the audit record is written", () => {
    const sim = new ShapeShiftSim(7);
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
    writeArtDirectionAudit("apps/showcase-shape-shift-sprint/src/art/direction.ts", { direction, snapshot, violations });
    expect(violations).toEqual([]);
  });

  it("the signature effect and palette name the candy-primaries-on-cream identity", () => {
    expect(direction.signatureEffect).toMatch(/morph burst/);
    expect(direction.signatureEffect).toMatch(/shape-confetti trail/);
    expect(direction.signatureEffect).toMatch(/hole rims glowing/);
    expect(direction.palette.primary).toEqual(["#e8453c", "#f7c531", "#2f6fe4", "#f7ecd9"]);
    expect(direction.lighting.environment.background).toBe("sky");
    expect(LOOK.shapes).toEqual(["#e8453c", "#f7c531", "#2f6fe4"]);
    expect(LOOK.road).toBe("#f7ecd9");
    expect(LOOK.ink).toBe("#1f2a44");
  });
});
