/**
 * model-tint-bridge.test.ts — PRD-04 P2-3 (C-15 compiler bridge).
 *
 * `applyModelTintBridge(node)` in compiler/modelMaterials.ts:
 *  - flag OFF returns the legacy `tint` object unchanged (byte-equivalent shape: only the
 *    fields the legacy code wrote);
 *  - flag ON lowers `node.material` + `node.materialOverrides` to C-15 overrides and
 *    forwards `node.variant` as `materialVariant`, never emitting `tint`;
 *  - overrides honoured on a two-material fixture: `target: "Body"` changes Body only.
 */
import { afterEach, describe, expect, it } from "vitest";
import { applyModelTintBridge } from "../../../../packages/engine/src/agent-api/compiler/modelMaterials";
import { setTypedGLBActorQrFlags } from "../../../../packages/engine/src/production-runtime/actor/extensions";
import { applyMaterialOverrides, snapshotMaterials } from "../../../../packages/engine/src/production-runtime/ModelMaterialOverrides";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import type { AuraModelNode } from "../../../../packages/engine/src/agent-api/index";
import { Material } from "../../../../packages/rendering/src/Material";

const FLAGS_ON = resolveQrFlags({ options: { A3D_QR_MATERIALS: true } });
const FLAGS_OFF = resolveQrFlags({ options: {} });

afterEach(() => setTypedGLBActorQrFlags(FLAGS_OFF));

const modelNode = (extra: Record<string, unknown> = {}): AuraModelNode =>
  ({ kind: "model", url: "asset://duck", ...extra }) as unknown as AuraModelNode;

function fixtureMaterials(): Material[] {
  const params = () => ({ u_roughness: 0.8, u_baseColorFactor: [1, 1, 1, 1] });
  return [
    new Material({ name: "Body", shaderKey: "test", parameters: params() as never }),
    new Material({ name: "Trim", shaderKey: "test", parameters: params() as never })
  ];
}

describe("flag off — legacy tint shape is unchanged", () => {
  it("emits the verbatim legacy tint object for a colored material", () => {
    setTypedGLBActorQrFlags(FLAGS_OFF);
    const out = applyModelTintBridge(modelNode({
      material: {
        color: "#ff0000",
        emissive: "#00ff00",
        emissiveIntensity: 2,
        roughness: 0.5,
        metallic: 0.1,
        clearcoat: 0.25,
        clearcoatRoughness: 0.4
      }
    }));
    expect(out).toEqual({
      tint: {
        baseColor: [1, 0, 0, 1],
        replaceSurfaceTextures: true,
        emissiveColor: [0, 1, 0],
        emissiveStrength: 2,
        roughness: 0.5,
        metallic: 0.1,
        clearcoat: 0.25,
        clearcoatRoughness: 0.4
      }
    });
  });

  it("emits nothing when material.color is absent", () => {
    setTypedGLBActorQrFlags(FLAGS_OFF);
    expect(applyModelTintBridge(modelNode())).toEqual({});
    expect(applyModelTintBridge(modelNode({ material: { roughness: 0.4 } }))).toEqual({});
  });

  it("ignores the new seam fields entirely when the flag is off", () => {
    setTypedGLBActorQrFlags(FLAGS_OFF);
    const out = applyModelTintBridge(modelNode({
      material: { color: "#0000ff" },
      materialOverrides: [{ target: "Body", roughness: 0.2 }],
      variant: "beige"
    }));
    expect(out).toEqual({ tint: { baseColor: [0, 0, 1, 1], replaceSurfaceTextures: true } });
  });
});

describe("flag on — lowers to C-15 overrides + materialVariant", () => {
  it("lowers spec.color to baseColorMultiply and forwards variant", () => {
    setTypedGLBActorQrFlags(FLAGS_ON);
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

  it("preserves array overrides after the spec-derived override", () => {
    setTypedGLBActorQrFlags(FLAGS_ON);
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
    setTypedGLBActorQrFlags(FLAGS_ON);
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
    setTypedGLBActorQrFlags(FLAGS_ON);
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
    setTypedGLBActorQrFlags(FLAGS_ON);
    expect(applyModelTintBridge(modelNode())).toEqual({});
    expect(applyModelTintBridge(modelNode({ material: { roughness: 0.5 } }))).toEqual({});
  });
});
