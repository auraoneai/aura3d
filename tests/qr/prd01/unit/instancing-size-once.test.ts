/**
 * Scene 16-instancing regression (LPIPS 0.77 vs three in both `none` and
 * `core`; L4 promote runs 38150267563, 38156934612): aura drew a small central
 * cluster instead of the full 10,000-box field.
 *
 * Root cause: instanced primitives applied the node `size` twice. Each instance
 * matrix already carries T_i·R_i·S(scale_i ⊙ size), and the renderer draws
 * `modelMatrix · instanceMatrix`; the node model matrix also applied S(size),
 * so every instance translation was scaled by `size` (0.3 → the field
 * collapsed to 0.3× around the origin) and every box shrank again.
 *
 * This test drives the real render-input path (createProductionRuntimeRendererInput)
 * with the benchmark's own 10,000-transform grid and asserts, in three.js terms
 * (mesh.matrixWorld · instanceMatrix · geometry(size)):
 * - all 10,000 instances and colours are submitted in one item
 * - every instance's world centre equals its authored position
 * - every instance's world extent equals size ⊙ scale
 * - the item's culling bounds (model · instance per instance) contain every
 *   instance and span the full field, and the camera frustum keeps the item
 */

import { describe, expect, it } from "vitest";
import { Frustum } from "@aura3d/math";
import { cullExplicitRenderItems } from "../../../../packages/rendering/src/renderer/CullingBatching";
import { lookAtMat4, multiplyMat4, perspectiveMat4, toMathMat4 } from "@aura3d/scene/math";

import { instances } from "../../../../packages/engine/src/agent-api/nodes/instances";
import { createProductionRuntimePrimitiveEntries } from "../../../../packages/engine/src/agent-api/compiler/primitives";
import { createProductionRuntimeRendererInput, instancedPrimitiveModelNode } from "../../../../packages/engine/src/agent-api/compiler/renderInput";
import { instancingGrid } from "../../../../benchmarks/quality-rebuild/shared/procedural";
import type { AuraPrimitiveNode, AuraSceneSnapshot, AuraVec3 } from "../../../../packages/engine/src/agent-api/nodes/types";
import type { RenderItem } from "@aura3d/rendering";

const SIZE: AuraVec3 = [0.3, 0.3, 0.3];
const grid = instancingGrid(10_000, 1616);

function buildItem(): { item: RenderItem; node: AuraPrimitiveNode } {
  const node = instances.box({
    name: "instanced boxes",
    size: SIZE,
    transforms: grid.transforms.map((t) => ({ position: t.position, ...(t.rotation ? { rotation: t.rotation } : {}), ...(t.scale !== undefined ? { scale: t.scale } : {}) })),
    colors: grid.colors as `#${string}`[]
  }).toJSON() as AuraPrimitiveNode;
  const snapshot = {
    schema: "aura3d-scene-snapshot/1.0",
    background: "#1a1e24",
    diagnostics: { enabled: false },
    nodes: [node],
    camera: { mode: "orbit", position: [0, 14, 26], target: [0, 0, 0], fov: 45, near: 0.1, far: 200 }
  } as unknown as AuraSceneSnapshot;
  const entries = createProductionRuntimePrimitiveEntries([node]);
  const canvas = { width: 1280, height: 720 } as HTMLCanvasElement;
  const input = createProductionRuntimeRendererInput(snapshot, canvas, [], entries, 0, undefined, new Set(), { color: [0, 0, 0], intensity: 0 }, []);
  const items = [...(input.source.collectRenderItems?.() ?? [])];
  expect(items).toHaveLength(1);
  return { item: items[0]!, node };
}

/** Column-major world matrix of instance `i`: model · instance. */
function instanceWorld(item: RenderItem, i: number): number[] {
  const model = Array.from(item.modelMatrix as ArrayLike<number>);
  const inst = Array.from((item.instanceTransforms as Float32Array).subarray(i * 16, i * 16 + 16));
  return multiplyMat4(model as never, inst as never) as unknown as number[];
}

describe("16-instancing: instanced primitive size is applied once", () => {
  it("submits all 10,000 instances and colours in one item", () => {
    const { item } = buildItem();
    expect((item.instanceTransforms as Float32Array).length).toBe(10_000 * 16);
    expect((item.instanceColors as Float32Array).length).toBe(10_000 * 4);
  });

  it("every instance's world centre is its authored position and its extent is size ⊙ scale", () => {
    const { item } = buildItem();
    for (let i = 0; i < 10_000; i += 1) {
      const w = instanceWorld(item, i);
      const t = grid.transforms[i]!;
      expect(w[12]).toBeCloseTo(t.position[0], 4);
      expect(w[13]).toBeCloseTo(t.position[1], 4);
      expect(w[14]).toBeCloseTo(t.position[2], 4);
      const scale = t.scale === undefined ? [1, 1, 1] : typeof t.scale === "number" ? [t.scale, t.scale, t.scale] : t.scale;
      // column lengths of the world basis = unit box × size ⊙ scale
      expect(Math.hypot(w[0]!, w[1]!, w[2]!)).toBeCloseTo(SIZE[0] * scale[0]!, 4);
      expect(Math.hypot(w[4]!, w[5]!, w[6]!)).toBeCloseTo(SIZE[1] * scale[1]!, 4);
      expect(Math.hypot(w[8]!, w[9]!, w[10]!)).toBeCloseTo(SIZE[2] * scale[2]!, 4);
    }
  });

  it("culling bounds contain every instance, span the whole field, and the camera keeps the item", () => {
    const { item } = buildItem();
    const xs = grid.transforms.map((t) => t.position[0]);
    const zs = grid.transforms.map((t) => t.position[2]);
    const fieldMin = [Math.min(...xs), Math.min(...zs)];
    const fieldMax = [Math.max(...xs), Math.max(...zs)];
    expect(fieldMax[0]! - fieldMin[0]!).toBeGreaterThan(40);
    for (let i = 0; i < 10_000; i += 97) {
      const w = instanceWorld(item, i);
      expect(w[12]! >= fieldMin[0]! - 1e-4 && w[12]! <= fieldMax[0]! + 1e-4).toBe(true);
      expect(w[14]! >= fieldMin[1]! - 1e-4 && w[14]! <= fieldMax[1]! + 1e-4).toBe(true);
    }
    const view = lookAtMat4([0, 14, 26], [0, 0, 0], [0, 1, 0]);
    const projection = perspectiveMat4((45 * Math.PI) / 180, 1280 / 720, 0.1, 200);
    const frustum = Frustum.fromMatrix(toMathMat4(multiplyMat4(projection, view)));
    const diagnostics = { submittedObjects: 0, visibleObjects: 0, culledObjects: 0 } as never;
    expect(cullExplicitRenderItems([item], frustum, diagnostics)).toHaveLength(1);
  });

  it("the node model matrix carries the node TRS only (no size) for instanced primitives", () => {
    const { item, node } = buildItem();
    expect(Array.from(item.modelMatrix as ArrayLike<number>)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expect(instancedPrimitiveModelNode(node)).toBe(instancedPrimitiveModelNode(node));
    expect(instancedPrimitiveModelNode(node).size).toBeUndefined();
  });

  it("non-instanced primitives keep size in the model matrix (unchanged)", () => {
    const plain = { kind: "primitive", primitive: "box", size: [2, 3, 4] } as AuraPrimitiveNode;
    expect(instancedPrimitiveModelNode(plain)).toBe(plain);
  });
});
