import { describe, expect, it } from "vitest";
import type { RenderItem } from "@aura3d/rendering";
import type { TypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor";
import type { AuraModelNode, AuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/nodes/types";
import { createRuntimeNodeHandle } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { attachProductionActorEvidence } from "../../../packages/engine/src/agent-api/compiler/actors";

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const translation = (x: number, y = 0, z = 0): number[] => [
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1
];

function item(
  min: readonly [number, number, number],
  max: readonly [number, number, number],
  options: Partial<RenderItem> = {}
): RenderItem {
  return { geometry: { bounds: { min, max } } as RenderItem["geometry"], ...options };
}

function fixture() {
  const node = {
    kind: "model",
    asset: { kind: "aura-asset-ref", id: "model", type: "model", format: "glb", url: "/model.glb" },
    runtime: { id: "model" }, position: [5, 2, -1], scale: 2,
    castShadow: true, receiveShadow: true, visible: true
  } as unknown as AuraModelNode;
  const actor = {
    pipeline: {
      asset: { skins: [], meshes: [] },
      resources: { bounds: { min: [0, 0, 0], max: [2, 1, 1] } }
    },
    evidence: { clips: [], skinningBindingCount: 0, lastFootPlantingMissingLegs: [] }
  } as unknown as TypedGLBActor;
  const handle = createRuntimeNodeHandle(node as never, { id: "model" });
  const runtimeNodes = {
    has: (id: string) => id === "model",
    get: (id: string) => id === "model" ? handle : undefined
  } as unknown as AuraRuntimeNodeRegistry;
  return {
    handle,
    attach: (items: readonly RenderItem[]) => attachProductionActorEvidence(node, actor, items, runtimeNodes)
  };
}

describe("submitted model world bounds", () => {
  it("follows the submitted rotated and scaled parent matrix across frames", () => {
    const f = fixture();
    // x' = 10 - 3y, y' = 1 + 2x, z' = z - 2.
    const first = [0, 2, 0, 0, -3, 0, 0, 0, 0, 0, 1, 0, 10, 1, -2, 1];
    f.attach([item([0, 0, 0], [2, 1, 1], { modelMatrix: first })]);
    expect(f.handle.bounds()).toMatchObject({ min: [7, 1, -2], max: [10, 5, -1], center: [8.5, 3, -1.5], size: [3, 4, 1] });
    expect(f.handle.bounds().radius).toBeCloseTo(Math.sqrt(26) / 2);

    const saved = f.handle.bounds();
    first[12] = 15;
    f.attach([item([0, 0, 0], [2, 1, 1], { modelMatrix: first })]);
    expect(f.handle.bounds()).toMatchObject({ min: [12, 1, -2], max: [15, 5, -1] });
    expect(saved.min).toEqual([7, 1, -2]);
  });

  it("unions submitted mesh and instance placements in model × instance × geometry order", () => {
    const f = fixture();
    const model = [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 0, 0, 1];
    const geometry = [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const instances = new Float32Array([...translation(1), ...translation(3)]);
    f.attach([
      item([0, 0, 0], [1, 1, 1], { modelMatrix: model, geometryMatrix: geometry, instanceTransforms: instances }),
      item([0, 0, 0], [1, 1, 1], { modelMatrix: translation(-2) })
    ]);
    expect(f.handle.bounds()).toMatchObject({ min: [-2, 0, 0], max: [20, 1, 1], size: [22, 1, 1] });
  });

  it("handles mirrored and sheared affine placements without decomposing them", () => {
    const f = fixture();
    // x' = 1 - 2x + y, y' = 3y, z' = z.
    const matrix = [-2, 0, 0, 0, 1, 3, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1];
    f.attach([item([0, 0, 0], [1, 1, 1], { modelMatrix: matrix })]);
    expect(f.handle.bounds()).toMatchObject({ min: [-1, 0, 0], max: [2, 3, 1] });
  });

  it("retains the loaded model fallback when no submitted geometry is available", () => {
    const f = fixture();
    f.attach([]);
    expect(f.handle.bounds()).toMatchObject({ min: [5, 2, -1], max: [9, 4, 1] });
    f.attach([{ geometry: {} as RenderItem["geometry"] }]);
    expect(f.handle.bounds()).toMatchObject({ min: [5, 2, -1], max: [9, 4, 1] });
  });

  it("does not publish a partial or non-finite union when a submission is malformed", () => {
    const f = fixture();
    const malformed = [...identity];
    malformed[0] = Number.NaN;
    f.attach([item([0, 0, 0], [1, 1, 1], { modelMatrix: translation(99) }), item([0, 0, 0], [1, 1, 1], { modelMatrix: malformed })]);
    expect(f.handle.bounds()).toMatchObject({ min: [5, 2, -1], max: [9, 4, 1] });
  });

  it("uses undeformed geometry envelopes for skin and morph submissions", () => {
    const f = fixture();
    f.attach([item([0, 0, 0], [2, 1, 1], {
      modelMatrix: translation(4),
      skinning: { jointCount: 1, matrices: new Float32Array(identity) },
      morphTargets: [{ positions: [[0, 0, 2]] }], morphWeights: [1]
    })]);
    expect(f.handle.bounds()).toMatchObject({ min: [4, 0, 0], max: [6, 1, 1] });
    expect(f.handle.importedAssetEvidence?.()).toMatchObject({ skinnedRenderItemCount: 1, morphRenderItemCount: 1 });
  });
});
