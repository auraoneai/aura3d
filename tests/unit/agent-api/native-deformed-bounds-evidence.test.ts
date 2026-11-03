/**
 * S5-WP11-03: nodes tagged `aura:evidence-deformed-bounds` publish per-frame
 * posed (skinned) world bounds next to the undeformed `bounds`, so a browser
 * harness can project the deforming subject into a screen-space mask.
 */
import { describe, expect, it } from "vitest";
import type { RenderItem } from "@aura3d/rendering";
import { Geometry, IndexBuffer, VertexBuffer, VertexFormat } from "../../../packages/rendering/src";
import type { TypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor";
import type { AuraModelNode, AuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/nodes/types";
import { createRuntimeNodeHandle } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { attachProductionActorEvidence } from "../../../packages/engine/src/agent-api/compiler/actors";
import { AURA_DEFORMED_BOUNDS_EVIDENCE_TAG } from "../../../packages/engine/src/agent-api/runtimeEvidence";

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const translation = (x: number, y = 0, z = 0): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];

/** Two vertices: one bound to joint 0 at x=0, one bound to joint 1 at x=1. */
function skinnedGeometry(): Geometry {
  const vertices = new VertexBuffer(VertexFormat.P3J4W4, 3);
  vertices.setAttribute(0, "position", [0, 0, 0]);
  vertices.setAttribute(0, "joints", [0, 0, 0, 0]);
  vertices.setAttribute(0, "weights", [1, 0, 0, 0]);
  vertices.setAttribute(1, "position", [1, 0, 0]);
  vertices.setAttribute(1, "joints", [1, 0, 0, 0]);
  vertices.setAttribute(1, "weights", [1, 0, 0, 0]);
  vertices.setAttribute(2, "position", [0, 1, 0]);
  vertices.setAttribute(2, "joints", [0, 0, 0, 0]);
  vertices.setAttribute(2, "weights", [1, 0, 0, 0]);
  return new Geometry(vertices, new IndexBuffer([0, 1, 2], 3));
}

function fixture(tags: readonly string[]) {
  const node = {
    kind: "model",
    asset: { kind: "aura-asset-ref", id: "model", type: "model", format: "glb", url: "/model.glb" },
    runtime: { id: "model", tags }, position: [0, 0, 0], scale: 1,
    castShadow: true, receiveShadow: true, visible: true
  } as unknown as AuraModelNode;
  const actor = {
    pipeline: { asset: { skins: [], meshes: [] }, resources: { bounds: { min: [0, 0, 0], max: [1, 1, 0] } } },
    evidence: { clips: [], skinningBindingCount: 2, lastSkinningPalettesUpdated: 1, lastFootPlantingMissingLegs: [] }
  } as unknown as TypedGLBActor;
  const handle = createRuntimeNodeHandle(node as never, { id: "model" });
  const runtimeNodes = { has: (id: string) => id === "model", get: (id: string) => id === "model" ? handle : undefined } as unknown as AuraRuntimeNodeRegistry;
  return { handle, attach: (items: readonly RenderItem[]) => attachProductionActorEvidence(node, actor, items, runtimeNodes) };
}

function posed(jointOneOffsetY: number): RenderItem {
  // Joint 1 lifts its vertex; the undeformed envelope cannot see this.
  const matrices = new Float32Array([...identity, ...translation(0, jointOneOffsetY, 0)]);
  return { geometry: skinnedGeometry(), modelMatrix: translation(10), skinning: { jointCount: 2, matrices } } as unknown as RenderItem;
}

describe("deformed bounds evidence", () => {
  it("publishes per-frame posed world bounds for tagged nodes and tracks the pose", () => {
    const f = fixture(["skinned", AURA_DEFORMED_BOUNDS_EVIDENCE_TAG]);
    f.attach([posed(0)]);
    expect(f.handle.importedAssetEvidence?.()?.deformedBounds).toMatchObject({ min: [10, 0, 0], max: [11, 1, 0] });
    f.attach([posed(3)]);
    const evidence = f.handle.importedAssetEvidence?.();
    expect(evidence?.deformedBounds).toMatchObject({ min: [10, 0, 0], max: [11, 3, 0] });
    // The undeformed envelope is unchanged by the pose.
    expect(evidence?.bounds).toMatchObject({ min: [10, 0, 0], max: [11, 1, 0] });
  });

  it("is not computed for untagged nodes", () => {
    const f = fixture(["skinned"]);
    f.attach([posed(3)]);
    expect(f.handle.importedAssetEvidence?.()?.deformedBounds).toBeUndefined();
  });

  it("omits the field rather than publishing a partial union for malformed submissions", () => {
    const f = fixture([AURA_DEFORMED_BOUNDS_EVIDENCE_TAG]);
    const broken = { ...posed(0), modelMatrix: [Number.NaN, ...identity.slice(1)] } as unknown as RenderItem;
    f.attach([posed(1), broken]);
    expect(f.handle.importedAssetEvidence?.()?.deformedBounds).toBeUndefined();
  });
});
