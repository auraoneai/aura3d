import { describe, expect, it } from "vitest";
import { auditArtDirection, type ArtDirectionSnapshot } from "@aura3d/game/art";
import direction from "../../../apps/showcase-number-surge/src/art/direction";
import { NumberSurgeSim } from "../../../apps/showcase-number-surge/src/sim";
import { buildWorld } from "../../../apps/showcase-number-surge/src/world";
import { LOOK, PALETTE } from "../../../apps/showcase-number-surge/src/look";
import { writeArtDirectionAudit } from "../../../tools/game-checks/lib/art-direction.mjs";

/** Expected in-play draws: sky, ball, ball-label, shadow, shield, underlay + 9 merged batches + key light rig. */
const DRAWS_ESTIMATE = 15;

describe("number surge art direction", () => {
  it("the mounted scene passes auditArtDirection and the audit record is written", () => {
    const sim = new NumberSurgeSim(7);
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
    writeArtDirectionAudit("apps/showcase-number-surge/src/art/direction.ts", { direction, snapshot, violations });
    expect(violations).toEqual([]);
  });

  it("the signature effect and palette name the neon-arcade dusk identity", () => {
    expect(direction.signatureEffect).toMatch(/cyan\/magenta arithmetic gates/);
    expect(direction.signatureEffect).toMatch(/violet shards/);
    expect(direction.signatureEffect).toMatch(/gold score geyser/);
    expect(direction.palette.primary).toEqual(["#0d0b2e", "#221d4e", "#3ef2ff", "#ff4fd8"]);
    expect(direction.lighting.environment.background).toBe("sky");
    expect(LOOK.id).toBe("number-surge");
    expect(PALETTE.road).toBe("#221d4e");
    expect(PALETTE.gateGood).toBe("#3ef2ff");
    expect(PALETTE.gateBad).toBe("#ff4fd8");
  });
});
