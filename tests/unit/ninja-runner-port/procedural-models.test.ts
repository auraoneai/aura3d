import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import direction from "../../../examples/ninja-runner-port/art/direction";
import { MESHY_MANIFEST, type PropId } from "../../../examples/ninja-runner-port/assets/meshy/manifest";
import {
  INST_SENGOKU_MATERIALS,
  SENGOKU_MATERIALS,
  WATER_WHEEL_ROTOR_RADIUS,
  buildBarrierHazardNodes,
  buildKanaboWeaponNode,
  buildKatanaWeaponNode,
  buildPagodaSetpieceNode,
  buildPickupPropNode,
  buildProceduralDistrictBatches,
  buildShrineGateSetpieceNode,
  buildShurikenStarNode,
  buildSpikedBeamHazardNode,
  buildWaterWheelRotorSpec,
  buildWaterWheelSetpieceGroup,
  computeWaterWheelRotorBounds,
  getNormalizedPropParts,
  shinobiActorMaterialOverrides
} from "../../../examples/ninja-runner-port/art/proceduralModels";
import { buildProceduralCourseAccents, buildScenery, type ModelSink } from "../../../examples/ninja-runner-port/scenery";
import { eveningSetPieces } from "../../../examples/ninja-runner-port/setpieces";

const PROP_IDS: readonly PropId[] = [
  "houseA", "houseB", "houseC", "houseD",
  "teahouse", "marketStall", "tower", "gate",
  "lantern", "fenceRail", "pine", "oak",
  "bush", "boulder", "cliffA", "cliffB", "ridge"
];

describe("WP-24 Shadowstep Gauntlet procedural multi-material overhaul", () => {
  it("prunes art/direction.ts assets down to ONLY the 6 rigged ninja/rival skeletons", () => {
    expect(direction.assets.map((a) => a.assetKey)).toEqual([
      "ninja-hero",
      "ninja-soldier",
      "ninja-brute",
      "ninja-sage",
      "ninja-caster",
      "ninja-scout"
    ]);
    for (const asset of direction.assets) {
      expect(asset.animated?.clips.length ?? 0).toBeGreaterThanOrEqual(4);
    }
  });

  it("removes all static GLB instances.model calls from world.ts", () => {
    const worldSrc = readFileSync(new URL("../../../examples/ninja-runner-port/world.ts", import.meta.url), "utf8");
    expect(worldSrc).not.toContain("instances.model(");
    expect(worldSrc).not.toContain("cinematic-film");
    expect(worldSrc).not.toContain("depthOfField");
    expect(worldSrc).not.toContain("motionBlur");
  });

  it("centers waterWheel rotor strictly around (0, 0, 0) on its local X spin axis for wobble-free rotation", () => {
    const spec = buildWaterWheelRotorSpec();
    expect(spec.groups?.length ?? 0).toBeGreaterThanOrEqual(3);
    const bounds = computeWaterWheelRotorBounds();
    // Exact symmetry on X, Y, and Z around (0, 0, 0)
    expect(Math.abs(bounds.min[0] + bounds.max[0])).toBeLessThan(1e-4);
    expect(Math.abs(bounds.min[1] + bounds.max[1])).toBeLessThan(1e-4);
    expect(Math.abs(bounds.min[2] + bounds.max[2])).toBeLessThan(1e-4);
    // Circular YZ wheel envelope matching WATER_WHEEL_ROTOR_RADIUS (4.0m -> 8.0m diameter)
    expect(bounds.max[1]).toBeCloseTo(WATER_WHEEL_ROTOR_RADIUS, 2);
    expect(bounds.max[2]).toBeCloseTo(WATER_WHEEL_ROTOR_RADIUS, 2);
    expect(Math.abs((bounds.max[1] - bounds.min[1]) - (bounds.max[2] - bounds.min[2]))).toBeLessThan(1e-3);
  });

  it("enforces clearcoat: 0 and sheen: 0 on all instanced district batch materials and safe physical shoji", () => {
    for (const [key, spec] of Object.entries(INST_SENGOKU_MATERIALS)) {
      expect(spec.clearcoat, `${key}.clearcoat`).toBe(0);
      expect(spec.sheen ?? 0, `${key}.sheen`).toBe(0);
    }
    expect(SENGOKU_MATERIALS.shojiWashiPaper.opacity).toBeCloseTo(0.55, 2);
    expect(SENGOKU_MATERIALS.lanternFlameEmissive.practical).toBe(true);
    expect(SENGOKU_MATERIALS.spiritSealEmissive.practical).toBe(true);
  });

  it("normalizes all 17 procedural district prop assemblies to manifest footprints with valid geometry", () => {
    for (const id of PROP_IDS) {
      const parts = getNormalizedPropParts(id);
      expect(parts.length, id).toBeGreaterThanOrEqual(1);
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (const p of parts) {
        expect(p.mesh.indices.length).toBeGreaterThan(0);
        expect(p.mesh.positions.every(Number.isFinite)).toBe(true);
        for (let i = 0; i < p.mesh.positions.length; i += 3) {
          const x = p.mesh.positions[i]!, y = p.mesh.positions[i + 1]!, z = p.mesh.positions[i + 2]!;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (z < minZ) minZ = z;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
          if (z > maxZ) maxZ = z;
        }
      }
      const target = MESHY_MANIFEST[id].size;
      expect(maxX - minX, `${id} width`).toBeCloseTo(target[0], 2);
      expect(maxY - minY, `${id} height`).toBeCloseTo(target[1], 2);
      expect(maxZ - minZ, `${id} depth`).toBeCloseTo(target[2], 2);
    }
  });

  it("assembles multi-material set-pieces, course accents, weapons, hazards, pickups, and shinobi rig overrides", () => {
    const sink: ModelSink = {};
    buildScenery(sink, { paintedTrees: true });
    const accents = buildProceduralCourseAccents();
    expect(accents.bambooGroves.length).toBeGreaterThan(10);
    expect(accents.ishigakiRamparts.length).toBeGreaterThan(5);
    expect(accents.stoneBridgeArches.length).toBeGreaterThanOrEqual(5);

    const batches = buildProceduralDistrictBatches(sink, accents, { castShadow: true });
    expect(batches.length).toBeGreaterThan(20);

    const setPieces = eveningSetPieces();
    expect(buildShrineGateSetpieceNode(setPieces.shrineGate[0]!).toJSON().kind).toBe("group");
    expect(buildWaterWheelSetpieceGroup(setPieces.waterWheel[0]!).toJSON().kind).toBe("group");
    expect(buildPagodaSetpieceNode(setPieces.pagoda[0]!).toJSON().kind).toBe("group");

    expect(buildKatanaWeaponNode("hero-blade").toJSON().kind).toBe("group");
    expect(buildKanaboWeaponNode("club-0").toJSON().kind).toBe("group");
    expect(buildBarrierHazardNodes(0)).toHaveLength(3);
    expect(buildSpikedBeamHazardNode(0).toJSON().kind).toBe("group");
    expect(buildShurikenStarNode(0).toJSON().kind).toBe("group");
    expect(buildPickupPropNode(0, "scroll").toJSON().kind).toBe("group");
    expect(buildPickupPropNode(1, "coin").toJSON().kind).toBe("group");

    for (const charId of ["hero", "soldier", "brute", "sage", "caster", "scout"] as const) {
      const ov = shinobiActorMaterialOverrides(charId, "base", { base: [1, 1, 1, 1] }, true);
      expect(ov).toHaveLength(1);
      expect(ov[0]!.sheenColor).toBeDefined();
      expect(ov[0]!.rim).toBeDefined();
    }
  });
});
