import { describe, expect, it } from "vitest";
import { LAYERS, MESHY_PIECES, meshyPose } from "../../../apps/showcase-shape-shift-sprint/src/scenery";
import { ROAD_DIMS, playerMesh } from "../../../apps/showcase-shape-shift-sprint/src/meshes";
import { ShapeShiftSim } from "../../../apps/showcase-shape-shift-sprint/src/sim";
import { buildWorld } from "../../../apps/showcase-shape-shift-sprint/src/world";
import {
  buildBridgeViaductStationNode,
  buildFloatingPrismClustersNode,
  buildHorizonStadiumPylonsNode,
  buildMorphPlayerNode,
  buildShapeGatePortalNode,
  buildToyBlockTowerNode,
  buildToyCastleIslandNode
} from "../../../apps/showcase-shape-shift-sprint/src/art/proceduralModels";

interface SceneJsonNode {
  readonly kind?: string;
  readonly effect?: string;
  readonly name?: string;
  readonly castShadow?: boolean;
  readonly geometry?: {
    readonly positions?: Float32Array;
    readonly bounds?: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] };
    readonly groups?: readonly { readonly start: number; readonly count: number; readonly materialIndex: number }[];
  };
  readonly children?: readonly SceneJsonNode[];
}

function walkSceneNodes(nodes: readonly SceneJsonNode[], out: SceneJsonNode[] = []): SceneJsonNode[] {
  for (const n of nodes) {
    out.push(n);
    if (Array.isArray(n.children)) walkSceneNodes(n.children, out);
  }
  return out;
}

function collectNodeBounds(root: SceneJsonNode): { min: [number, number, number]; max: [number, number, number] } {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const n of walkSceneNodes([root])) {
    const pos = n.geometry?.positions;
    if (!pos) continue;
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i]!, y = pos[i + 1]!, z = pos[i + 2]!;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

describe("shape shift sprint procedural multi-material backdrop & corridor dressing (WP-14)", () => {
  it("keeps every landmark piece well clear of the road at every clock and never hides it", () => {
    for (const p of MESHY_PIECES) {
      const halfWidth = (p.size / 2) * 1.05;
      expect(Math.abs(p.x) - halfWidth, p.id).toBeGreaterThan(ROAD_DIMS.width / 2 + 10);
      const { span, near } = LAYERS[p.layer];
      for (let t = 0; t < 40; t += 0.37) {
        const pose = meshyPose(p, t, false);
        expect(pose.z, p.id).toBeGreaterThanOrEqual(near - span);
        expect(pose.z, p.id).toBeLessThanOrEqual(near);
        expect(pose.scale, p.id).toBeGreaterThan(0);
        expect(pose.scale, p.id).toBeLessThanOrEqual(1);
      }
      const still = meshyPose(p, 12, true);
      expect(still.yaw, p.id).toBe(p.yaw);
      expect(still.y, p.id).toBeCloseTo(p.y + Math.sin(p.z0) * p.bob, 9);
    }
  });

  it("mounts 100% procedural multi-material landmarks, portals, and instanced clusters with zero static GLB model nodes or DOF blur", () => {
    const sim = new ShapeShiftSim(7);
    const world = buildWorld({ sim, aspect: 16 / 9 });
    const topNodes = world.scene.toJSON().nodes as unknown as SceneJsonNode[];
    const allNodes = walkSceneNodes(topNodes);

    expect(allNodes.filter((n) => n.kind === "model")).toHaveLength(0);
    expect(allNodes.filter((n) => n.kind === "effect" && (n.effect === "depthOfField" || n.effect === "motionBlur"))).toHaveLength(0);

    // Grounded castle islands & block spire towers match targetMaxDim
    for (const [fn, dim] of [
      [() => buildToyCastleIslandNode("test-castle", 10, 0), 10],
      [() => buildToyBlockTowerNode("test-tower", 26, 1), 26]
    ] as const) {
      const bounds = collectNodeBounds(fn().toJSON() as unknown as SceneJsonNode);
      const maxSpan = Math.max(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]);
      expect(bounds.min[1]).toBeCloseTo(0, 3);
      expect(maxSpan).toBeCloseTo(dim, 3);
    }

    // Morph player forms stay strictly inside their pinned PLAYER_DIMS core envelopes
    for (const shapeIdx of [0, 1, 2] as const) {
      const coreBounds = collectNodeBounds({ geometry: { positions: Float32Array.from(playerMesh(shapeIdx).positions) } });
      const bounds = collectNodeBounds(buildMorphPlayerNode(shapeIdx, playerMesh(shapeIdx)).toJSON() as unknown as SceneJsonNode);
      expect(bounds.max[0] - bounds.min[0]).toBeLessThanOrEqual(coreBounds.max[0] - coreBounds.min[0] + 0.02);
      expect(bounds.max[1] - bounds.min[1]).toBeLessThanOrEqual(coreBounds.max[1] - coreBounds.min[1] + 0.02);
    }

    // Portal piers clear all 3 lanes and translucent lunettes never cast opaque shadows
    const portalNodes = walkSceneNodes([buildShapeGatePortalNode("test-portal", 0).toJSON() as unknown as SceneJsonNode]);
    const lunette = portalNodes.find((n) => n.name === "test-portal-lunette");
    expect(lunette?.castShadow).toBe(false);

    // Viaduct station + instanced horizon pylons & floating prism clusters build cleanly
    expect(walkSceneNodes([buildBridgeViaductStationNode("test-pillar", 0).toJSON() as unknown as SceneJsonNode]).length).toBeGreaterThan(2);
    expect((buildHorizonStadiumPylonsNode().toJSON() as unknown as SceneJsonNode).kind).toBe("primitive");
    expect((buildFloatingPrismClustersNode().toJSON() as unknown as SceneJsonNode).kind).toBe("primitive");
  });
});
