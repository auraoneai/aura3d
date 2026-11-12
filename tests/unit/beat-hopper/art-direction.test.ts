import { describe, expect, it } from "vitest";
import { auditArtDirection, type ArtDirectionSnapshot } from "@aura3d/game/art";
import direction from "../../../apps/showcase-beat-hopper/src/art/direction";
import { BeatHopperSim } from "../../../apps/showcase-beat-hopper/src/sim";
import { buildWorld } from "../../../apps/showcase-beat-hopper/src/world";
import { LOOK } from "../../../apps/showcase-beat-hopper/src/look";
import { writeArtDirectionAudit } from "../../../tools/game-checks/lib/art-direction.mjs";

/** Expected in-play draws: sky, player, shadow + 9 merged batches. */
const DRAWS_ESTIMATE = 12;

describe("beat-hopper art direction", () => {
  it("the mounted scene passes auditArtDirection and the audit record is written", () => {
    const sim = new BeatHopperSim(7);
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
    expect(JSON.stringify(nodes)).not.toContain(".glb");
    expect(nodes.some((n) => n.name === "grp-dress-stacks")).toBe(true);
    expect(nodes.some((n) => n.name === "grp-dress-decks")).toBe(true);
    expect(nodes.some((n) => n.name === "beat-threshold-gate")).toBe(true);
    const violations = auditArtDirection(direction, snapshot);
    writeArtDirectionAudit("apps/showcase-beat-hopper/src/art/direction.ts", { direction, snapshot, violations });
    expect(violations).toEqual([]);
  });

  it("the signature effect and palette name the night-neon equalizer identity", () => {
    expect(direction.signatureEffect).toMatch(/equalizer/);
    expect(direction.signatureEffect).toMatch(/timing rings/);
    expect(direction.palette.primary).toEqual(["#14082e", "#23e6ff", "#ff2fb3", "#341259"]);
    expect(direction.lighting.environment.background).toBe("sky");
    expect(LOOK.road).toBe("#1c1240");
    expect(LOOK.hudInk).toBe("#f4f0ff");
  });
});
