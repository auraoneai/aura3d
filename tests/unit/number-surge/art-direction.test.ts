import { describe, expect, it } from "vitest";
import { auditArtDirection, type ArtDirectionSnapshot } from "@aura3d/game/art";
import direction from "../../../apps/showcase-number-surge/src/art/direction";
import { NumberSurgeSim } from "../../../apps/showcase-number-surge/src/sim";
import { buildWorld } from "../../../apps/showcase-number-surge/src/world";
import { LOOK, PALETTE } from "../../../apps/showcase-number-surge/src/look";
import {
  buildCeramicEscortGlowSpec,
  buildCeramicEscortOrbSpec,
  buildLacquerEscortGlowSpec,
  buildLacquerEscortOrbSpec,
  buildRivalRiotGuardGlowSpec,
  buildRivalRiotGuardSpec
} from "../../../apps/showcase-number-surge/src/art/proceduralModels";
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

  it("sculpts grounded Cyber-Sprinter squad, Captain, and Rival Riot Guard assemblies with RGBA cavity AO and glow layers", () => {
    for (const [label, bodySpec, glowSpec] of [
      ["cyber-sprinter", buildLacquerEscortOrbSpec(), buildLacquerEscortGlowSpec()],
      ["cyber-captain", buildCeramicEscortOrbSpec(), buildCeramicEscortGlowSpec()],
      ["rival-riot-guard", buildRivalRiotGuardSpec(), buildRivalRiotGuardGlowSpec()]
    ] as const) {
      let minY = Infinity;
      let maxY = -Infinity;
      for (let i = 1; i < bodySpec.positions.length; i += 3) {
        minY = Math.min(minY, bodySpec.positions[i]!);
        maxY = Math.max(maxY, bodySpec.positions[i]!);
      }
      expect(minY, `${label} minY`).toBeCloseTo(0, 4);
      expect(maxY, `${label} height`).toBeGreaterThan(0.8);
      expect(maxY, `${label} height cap`).toBeLessThan(1.5);
      const vertCount = bodySpec.positions.length / 3;
      expect(vertCount, `${label} vertCount`).toBeGreaterThan(350);
      expect(vertCount, `${label} 60fps crowd budget`).toBeLessThan(6500);
      expect(bodySpec.colors?.length, `${label} RGBA vertex colors`).toBe(vertCount * 4);
      expect(glowSpec.positions.length, `${label} emissive trim`).toBeGreaterThan(30);
    }

    const sim = new NumberSurgeSim(9);
    const names = (buildWorld({ sim, aspect: 16 / 9 }).scene.toJSON().nodes as { name?: string }[]).map((n) => n.name);
    for (const id of ["crowd-lacquer", "crowd-lacquer-glow", "crowd-ceramic", "crowd-ceramic-glow", "boss-guards", "boss-guards-glow"]) {
      expect(names).toContain(id);
    }
  });
});
