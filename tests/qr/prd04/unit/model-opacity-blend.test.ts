/**
 * Gridlock QA: `model(..., { material: { opacity < 1 } })` / a `materialOverrides` entry with `opacity < 1` kept the
 * glTF material's opaque render state (blend off, depth write on), so "see-through" copies drew solid. The bridge now
 * emits load-time render-state overrides that switch the matched materials to alpha blending without depth writes,
 * and the opacity scales the base-colour alpha on glTF materials (which carry no opacity scalar).
 */
import { describe, expect, it } from "vitest";
import { applyModelTintBridge } from "../../../../packages/engine/src/agent-api/compiler/modelMaterials";
import { applyMaterialOverrides, snapshotMaterials, type TypedGLBActorMaterialOverride } from "../../../../packages/engine/src/production-runtime/ModelMaterialOverrides";
import type { AuraModelNode } from "../../../../packages/engine/src/agent-api/index";
import { renderStateForGLTFMaterial, type GLTFMaterialAsset, type GLTFMaterialRenderStateOverride } from "../../../../packages/assets/src";
import { Material } from "../../../../packages/rendering/src/Material";

const modelNode = (extra: Record<string, unknown> = {}): AuraModelNode =>
  ({ kind: "model", url: "asset://tree", ...extra }) as unknown as AuraModelNode;

const gltfMaterial = (name: string): GLTFMaterialAsset => ({
  name, unlit: false, baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1, emissiveFactor: [0, 0, 0],
  emissiveStrength: 1, alphaMode: "OPAQUE", alphaCutoff: 0.5, doubleSided: false
}) as GLTFMaterialAsset;

function split(out: Record<string, unknown>) {
  const all = (out.materialOverrides ?? []) as readonly (GLTFMaterialRenderStateOverride | TypedGLBActorMaterialOverride)[];
  return {
    states: all.filter((entry): entry is GLTFMaterialRenderStateOverride => "renderState" in entry),
    scalars: all.filter((entry): entry is TypedGLBActorMaterialOverride => !("renderState" in entry))
  };
}

describe("model opacity < 1 switches to alpha blending", () => {
  it("a whole-model material opacity blends every material without depth writes", () => {
    const { states, scalars } = split(applyModelTintBridge(modelNode({ material: { opacity: 0.4 } })));
    expect(scalars.some((entry) => entry.opacity === 0.4)).toBe(true);
    for (const name of ["Leaves", "Trunk"]) {
      const state = renderStateForGLTFMaterial(gltfMaterial(name), states);
      expect(state.blend).toBe(true);
      expect(state.depthWrite).toBe(false);
    }
  });

  it("a targeted override blends only the matching materials", () => {
    const { states } = split(applyModelTintBridge(modelNode({ materialOverrides: [{ target: ["Leaves", /^Glass/g], opacity: 0.5 }] })));
    expect(renderStateForGLTFMaterial(gltfMaterial("Leaves"), states).blend).toBe(true);
    expect(renderStateForGLTFMaterial(gltfMaterial("GlassPane"), states).blend).toBe(true);
    expect(renderStateForGLTFMaterial(gltfMaterial("GlassPane"), states).blend).toBe(true);
    const trunk = renderStateForGLTFMaterial(gltfMaterial("Trunk"), states);
    expect(trunk.blend).toBe(false);
    expect(trunk.depthWrite).toBe(true);
  });

  it("opaque overrides (opacity 1, no opacity) leave the authored render state alone", () => {
    expect(split(applyModelTintBridge(modelNode({ material: { opacity: 1, color: "#ff0000" } }))).states).toHaveLength(0);
    expect(split(applyModelTintBridge(modelNode({ materialOverrides: [{ target: "Trunk", roughness: 0.4 }] }))).states).toHaveLength(0);
  });

  it("scales the base-colour alpha of glTF materials that carry no opacity scalar, idempotently", () => {
    const materials = [new Material({ name: "Leaves", shaderKey: "test", parameters: { u_baseColorFactor: [0.2, 0.6, 0.2, 1] } as never })];
    const snapshot = snapshotMaterials(materials);
    const overrides: TypedGLBActorMaterialOverride[] = [{ baseColorMultiply: [0.5, 1, 1, 1], opacity: 0.25 }];
    applyMaterialOverrides(snapshot, materials, overrides);
    applyMaterialOverrides(snapshot, materials, overrides);
    expect(materials[0]!.getParameter("u_baseColorFactor")).toEqual([0.1, 0.6, 0.2, 0.25]);
    applyMaterialOverrides(snapshot, materials, []);
    expect(materials[0]!.getParameter("u_baseColorFactor")).toEqual([0.2, 0.6, 0.2, 1]);
  });
});
