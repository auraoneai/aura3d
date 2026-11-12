import { describe, expect, it } from "vitest";
import { auditArtDirection, type ArtDirectionSnapshot } from "@aura3d/game/art";
import { webgpuCustomShaderGap } from "../../../packages/engine/src/agent-api/compiler/webgpuCustomShaderGap.js";
import direction from "../../../apps/showcase-polarity-orbs/src/art/direction";
import { PolarityOrbsSim } from "../../../apps/showcase-polarity-orbs/src/sim";
import { NODE_IDS, buildWorld } from "../../../apps/showcase-polarity-orbs/src/world";
import {
  arenaBezelRailMesh,
  crownPrismGemMesh,
  dipoleCollectorOrbMesh
} from "../../../apps/showcase-polarity-orbs/src/art/proceduralModels";
import { LOOK } from "../../../apps/showcase-polarity-orbs/src/look";
import { writeArtDirectionAudit } from "../../../tools/game-checks/lib/art-direction.mjs";

/**
 * Expected in-play draws: sky, cloud sea, 4 scenery layers, hero 5-node orb assembly, shadow, shield, shockwave +
 * merged gameplay batches + multi-material procedural Tokamak / Magnetic Lab backdrop assemblies (zero `.glb` models).
 */
const DRAWS_ESTIMATE = 42;

describe("polarity orbs art direction", () => {
  it("the mounted scene passes auditArtDirection and the audit record is written", () => {
    const sim = new PolarityOrbsSim(7);
    const world = buildWorld({ sim, aspect: 16 / 9 });
    const nodes = world.scene.toJSON().nodes as unknown as Record<string, unknown>[];
    const lights = nodes
      .filter((n) => n.kind === "light")
      .map((n) => ({ type: String(n.light), shadow: Boolean(n.shadow), intensity: Number(n.intensity ?? 1) }));
    const env = nodes.find((n) => n.kind === "environment");
    expect(nodes.filter((n) => n.kind === "model")).toHaveLength(0);
    expect(webgpuCustomShaderGap(world.scene.toJSON())).toBeUndefined();
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

  it("preserves all 30 runtime NODE_IDS and builds finite procedural Tokamak & gameplay meshes", () => {
    expect(NODE_IDS).toHaveLength(30);
    expect(direction.assets).toEqual([]);
    for (const mesh of [arenaBezelRailMesh(2), dipoleCollectorOrbMesh(0.45), crownPrismGemMesh(0.4)]) {
      expect(mesh.positions.length).toBeGreaterThan(24);
      expect(mesh.normals.length).toBe(mesh.positions.length);
      expect(mesh.indices.length).toBeGreaterThan(12);
      expect(mesh.positions.every((v) => Number.isFinite(v))).toBe(true);
    }
  });
});
