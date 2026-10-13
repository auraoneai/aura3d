/**
 * model-tint-bridge.test.ts — PRD-04 P2-3 (C-15 compiler bridge).
 *
 * `applyModelTintBridge(node)` in compiler/modelMaterials.ts lowers
 * `node.material` + `node.materialOverrides` to C-15 overrides and forwards
 * `node.variant` as `materialVariant`, never emitting the legacy `tint`
 * object. 4.0 Live Fix E2 deleted the A3D_QR_MATERIALS flag-off branch
 * (legacy tint with replaceSurfaceTextures:true): lowering is now
 * unconditional, and spec surface scalars (roughness/metallic/clearcoat)
 * lower even without a color. Overrides honoured on a two-material
 * fixture: `target: "Body"` changes Body only.
 */
import { describe, expect, it } from "vitest";
import { applyModelTintBridge } from "../../../../packages/engine/src/agent-api/compiler/modelMaterials";
import { setTypedGLBActorQrFlags } from "../../../../packages/engine/src/production-runtime/actor/extensions";
import { applyMaterialOverrides, snapshotMaterials } from "../../../../packages/engine/src/production-runtime/ModelMaterialOverrides";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import type { AuraModelNode } from "../../../../packages/engine/src/agent-api/index";
import { Material } from "../../../../packages/rendering/src/Material";

const modelNode = (extra: Record<string, unknown> = {}): AuraModelNode =>
  ({ kind: "model", url: "asset://duck", ...extra }) as unknown as AuraModelNode;

function fixtureMaterials(): Material[] {
  const params = () => ({ u_roughness: 0.8, u_baseColorFactor: [1, 1, 1, 1] });
  return [
    new Material({ name: "Body", shaderKey: "test", parameters: params() as never }),
    new Material({ name: "Trim", shaderKey: "test", parameters: params() as never })
  ];
}

describe("bridge lowers to C-15 overrides + materialVariant", () => {
  it("lowers spec.color to baseColorMultiply and forwards variant", () => {
    const out = applyModelTintBridge(modelNode({
      material: { color: "#ff0000", emissive: "#00ff00", emissiveIntensity: 2 },
      variant: "street"
    }));
    expect(out).not.toHaveProperty("tint");
    expect(out.materialVariant).toBe("street");
    const overrides = out.materialOverrides as { baseColorMultiply?: number[]; emissiveColor?: number[]; emissiveStrength?: number; target?: unknown }[];
    expect(overrides).toHaveLength(2);
    expect(overrides[0].baseColorMultiply).toEqual([1, 0, 0, 1]);
    expect(overrides[0].target).toBeUndefined();
    expect(overrides[1].emissiveColor).toEqual([0, 1, 0]);
    expect(overrides[1].emissiveStrength).toBe(2);
  });

  it("lowers even when actor QR flags resolve materials-off (flag state is irrelevant)", () => {
    setTypedGLBActorQrFlags(resolveQrFlags({ options: { A3D_QR_MATERIALS: false } }));
    const out = applyModelTintBridge(modelNode({ material: { color: "#0000ff" } }));
    expect(out).not.toHaveProperty("tint");
    const overrides = out.materialOverrides as { baseColorMultiply?: number[] }[];
    expect(overrides).toHaveLength(1);
    expect(overrides[0].baseColorMultiply).toEqual([0, 0, 1, 1]);
  });

  it("lowers authored spec surface scalars without a color (roughness-only survives)", () => {
    const out = applyModelTintBridge(modelNode({
      material: { roughness: 0.4, metallic: 0.9, clearcoat: 0.5, clearcoatRoughness: 0.25 }
    }));
    const overrides = out.materialOverrides as { roughness?: number; metallic?: number; clearcoat?: number; clearcoatRoughness?: number }[];
    expect(overrides).toHaveLength(1);
    expect(overrides[0]).toEqual({ roughness: 0.4, metallic: 0.9, clearcoat: 0.5, clearcoatRoughness: 0.25 });
  });

  it("preserves array overrides after the spec-derived override", () => {
    const out = applyModelTintBridge(modelNode({
      material: { color: "#ffffff" },
      materialOverrides: [{ target: "Body", roughness: 0.2 }]
    }));
    const overrides = out.materialOverrides as { target?: (name: string) => boolean; roughness?: number }[];
    expect(overrides).toHaveLength(2);
    expect(overrides[1].roughness).toBe(0.2);
    expect(overrides[1].target!("Body")).toBe(true);
    expect(overrides[1].target!("Trim")).toBe(false);
  });

  it("applies lowered overrides to a two-material fixture — target 'Body' changes only Body", () => {
    const out = applyModelTintBridge(modelNode({
      materialOverrides: [{ target: "Body", roughness: 0.2 }]
    }));
    const mats = fixtureMaterials();
    const snapshot = snapshotMaterials(mats);
    const overrides = (out.materialOverrides ?? []) as { target?: (name: string) => boolean }[];
    applyMaterialOverrides(snapshot, mats, overrides as never);
    expect(mats[0].getParameter("u_roughness")).toBe(0.2);
    expect(mats[1].getParameter("u_roughness")).toBe(0.8);
  });

  it("skips preset-defaulted fields — defaults are not re-asserted over authored glTF values", () => {
    const defaults: Record<string, unknown> = { color: "#ffffff" };
    const material = {
      color: "#ffffff",
      emissive: "#00ff00",
      [Symbol.for("aura3d.presetDefaults")]: new Set(Object.keys(defaults))
    };
    const out = applyModelTintBridge(modelNode({ material }));
    // color was defaulted by the preset -> not lowered; explicit emissive is lowered.
    const overrides = (out.materialOverrides ?? []) as { baseColorMultiply?: number[]; emissiveColor?: number[] }[];
    expect(overrides).toHaveLength(1);
    expect(overrides[0].baseColorMultiply).toBeUndefined();
    expect(overrides[0].emissiveColor).toEqual([0, 1, 0]);
  });

  it("emits nothing for an empty spec and no seams", () => {
    expect(applyModelTintBridge(modelNode())).toEqual({});
    expect(applyModelTintBridge(modelNode({ material: {} }))).toEqual({});
  });
});
