import { describe, expect, it } from "vitest";
import { auditArtDirection, type ArtDirectionSnapshot } from "@aura3d/game/art";
import direction from "../../../apps/showcase-splat-turf/src/art/direction";
import { SplatTurfSim } from "../../../apps/showcase-splat-turf/src/sim";
import { buildWorld } from "../../../apps/showcase-splat-turf/src/world";
import { LOOK } from "../../../apps/showcase-splat-turf/src/look";
import {
  TURF_ARENA_MATERIALS,
  TURF_MAT,
  TURF_SIGHT_GLASS_MATERIAL,
  buildAerosolMonumentSlots,
  buildArenaBleacherWithSunSailSlots,
  buildInkReservoirTankParts,
  buildPottedStreetPalmSlots,
  buildTrussSpeakerFloodlightTowerSlots,
  buildTurfBackdropIslandSpec,
  buildTurfInflatableBarrierSlots
} from "../../../apps/showcase-splat-turf/src/art/proceduralModels";
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
    expect(direction.assets).toEqual([]);
    expect(LOOK.road).toBe("#ffffff");
    expect(LOOK.ink).toBe("#3b1f47");
  });

  it("mounts procedural multi-material Street-Sport Ink Arena architecture with zero static GLB model nodes", () => {
    const sim = new SplatTurfSim(11);
    const world = buildWorld({ sim, aspect: 16 / 9 });
    const nodes = world.scene.toJSON().nodes as unknown as Record<string, unknown>[];

    const collectNodes = (list: readonly Record<string, unknown>[]): Record<string, unknown>[] => {
      const acc: Record<string, unknown>[] = [];
      for (const n of list) {
        acc.push(n);
        if (Array.isArray(n.children)) {
          acc.push(...collectNodes(n.children as Record<string, unknown>[]));
        }
      }
      return acc;
    };
    const allNodes = collectNodes(nodes);
    expect(allNodes.filter((n) => n.kind === "model")).toEqual([]);
    for (const n of allNodes) {
      const assetVal = typeof n.asset === "string" ? n.asset : typeof n.url === "string" ? n.url : "";
      expect(assetVal).not.toContain(".glb");
    }

    const names = nodes.map((n) => String(n.name ?? ""));
    expect(names).toContain("finish");
    expect(names).toContain("arena-belt-0");
    expect(names).toContain("arena-belt-1");
    expect(names).toContain("arena-glass-0");
    expect(names).toContain("arena-glass-1");
    expect(names).toContain("isle-group-balloon");
    expect(names).toContain("isle-group-paintPotIsland");

    const glassNode = nodes.find((n) => n.name === "arena-glass-0");
    expect(glassNode?.castShadow).toBe(false);
  });

  it("builds finite multi-material Street-Sport Ink Arena assemblies and physical sight-glass", () => {
    expect(TURF_ARENA_MATERIALS.length).toBeGreaterThanOrEqual(12);
    expect((TURF_SIGHT_GLASS_MATERIAL as unknown as Record<string, unknown>).opacity).toBe(0.45);

    const tank = buildInkReservoirTankParts(TURF_MAT.CLEARCOAT_MAGENTA, TURF_MAT.LED_MAGENTA);
    expect(tank.opaqueSlots.length).toBeGreaterThanOrEqual(10);
    expect(tank.glassMeshes.length).toBeGreaterThanOrEqual(2);

    const assemblies = [
      ...tank.opaqueSlots,
      ...buildArenaBleacherWithSunSailSlots(true),
      ...buildTrussSpeakerFloodlightTowerSlots(TURF_MAT.CLEARCOAT_CYAN),
      ...buildAerosolMonumentSlots(TURF_MAT.CLEARCOAT_GOLD, TURF_MAT.CLEARCOAT_MAGENTA),
      ...buildTurfInflatableBarrierSlots(TURF_MAT.SAIL_FABRIC_WARM, TURF_MAT.CLEARCOAT_GOLD),
      ...buildPottedStreetPalmSlots(TURF_MAT.CLEARCOAT_LIME, 17)
    ];
    for (const slot of assemblies) {
      expect(slot.mesh.positions.length).toBeGreaterThan(0);
      expect(slot.mesh.indices.length).toBeGreaterThan(0);
      for (const v of slot.mesh.positions) expect(Number.isFinite(v)).toBe(true);
    }

    for (const kind of ["balloon", "easelIsland", "islandTower", "islandTree", "paintPotIsland", "paletteIsland"] as const) {
      const spec = buildTurfBackdropIslandSpec(kind);
      expect(spec.positions.length).toBeGreaterThan(90);
      expect(spec.bounds).toBeDefined();
    }
  });
});