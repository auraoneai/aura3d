/**
 * ModelMaterialOverrides (PRD-04 §7.2, P1-4): snapshot/apply/lower semantics
 * on MockRenderDevice-backed materials — idempotent re-application, multiply
 * preserving base-colour textures, last-match-wins, replaceTextures scoping,
 * and lowerModelMaterialOverrides C-15 mapping.
 */
import { describe, expect, it } from "vitest";
import { Material } from "../../../../packages/rendering/src/Material";
import {
  applyMaterialOverrides,
  lowerModelMaterialOverrides,
  snapshotMaterials
} from "../../../../packages/engine/src/production-runtime/ModelMaterialOverrides";

function material(name: string, parameters: Record<string, unknown>): Material {
  return new Material({ name, shaderKey: "test", parameters: parameters as never });
}

function authored(): Material[] {
  return [
    material("shell", {
      u_baseColor: [1, 1, 1, 1],
      u_baseColorFactor: [0.8, 0.8, 0.8, 1],
      u_baseColorTextureEnabled: 1,
      u_metallicRoughnessTextureEnabled: 1,
      u_roughness: 0.7,
      u_metallic: 0.1,
      u_emissiveColor: [0, 0, 0],
      u_emissiveStrength: 0,
      u_clearcoatFactor: 0,
      u_clearcoatRoughnessFactor: 0,
      u_environmentIntensity: 1,
      u_opacity: 1
    }),
    material("trim", { u_baseColorFactor: [0.5, 0.5, 0.5, 1], u_roughness: 0.3, u_metallic: 0.9 })
  ];
}

describe("applyMaterialOverrides", () => {
  it("multiplies authored baseColor by baseColorMultiply and keeps the texture enabled", () => {
    const mats = authored();
    const snapshot = snapshotMaterials(mats);
    applyMaterialOverrides(snapshot, mats, [{ baseColorMultiply: [0.5, 0.5, 0.5, 1] }]);
    const shell = mats[0];
    expect(shell.getParameter("u_baseColorFactor")).toEqual([0.4, 0.4, 0.4, 1]);
    expect(shell.getParameter("u_baseColor")).toEqual([0.4, 0.4, 0.4, 1]);
    expect(shell.getParameter("u_baseColorTextureEnabled")).toBe(1);
  });

  it("is idempotent: double-apply re-applies from authored snapshot, not accumulated", () => {
    const mats = authored();
    const snapshot = snapshotMaterials(mats);
    const overrides = [{ baseColorMultiply: [0.5, 0.5, 0.5, 1] as const, roughness: 0.2 }];
    applyMaterialOverrides(snapshot, mats, overrides);
    applyMaterialOverrides(snapshot, mats, overrides);
    expect(mats[0].getParameter("u_baseColorFactor")).toEqual([0.4, 0.4, 0.4, 1]);
    expect(mats[0].getParameter("u_roughness")).toBe(0.2);
    // and clearing the list restores authored values
    applyMaterialOverrides(snapshot, mats, []);
    expect(mats[0].getParameter("u_baseColorFactor")).toEqual([0.8, 0.8, 0.8, 1]);
    expect(mats[0].getParameter("u_roughness")).toBe(0.7);
  });

  it("last match wins per field for targeted overrides", () => {
    const mats = authored();
    const snapshot = snapshotMaterials(mats);
    applyMaterialOverrides(snapshot, mats, [
      { target: () => true, roughness: 0.9 },
      { target: (n) => n === "trim", roughness: 0.1, metallic: 0.0 }
    ]);
    expect(mats[0].getParameter("u_roughness")).toBe(0.9);
    expect(mats[1].getParameter("u_roughness")).toBe(0.1);
    expect(mats[1].getParameter("u_metallic")).toBe(0);
    // non-mentioned field from the earlier override still applies to trim
    expect(mats[1].getParameter("u_roughness")).not.toBe(0.9);
  });

  it("replaceTextures disables only baseColor + metallicRoughness slots", () => {
    const mats = authored();
    const snapshot = snapshotMaterials(mats);
    applyMaterialOverrides(snapshot, mats, [{ replaceTextures: true }]);
    expect(mats[0].getParameter("u_baseColorTextureEnabled")).toBe(0);
    expect(mats[0].getParameter("u_metallicRoughnessTextureEnabled")).toBe(0);
  });

  it("writes emissive only when provided — never baseColor fallbacks", () => {
    const mats = authored();
    const snapshot = snapshotMaterials(mats);
    applyMaterialOverrides(snapshot, mats, [{ baseColorMultiply: [1, 0, 0, 1] }]);
    expect(mats[0].getParameter("u_emissiveColor")).toEqual([0, 0, 0]);
    expect(mats[0].getParameter("u_emissiveStrength")).toBe(0);
    applyMaterialOverrides(snapshot, mats, [{ emissiveColor: [0, 1, 0], emissiveStrength: 4 }]);
    expect(mats[0].getParameter("u_emissiveColor")).toEqual([0, 1, 0]);
    expect(mats[0].getParameter("u_emissiveStrength")).toBe(4);
  });
});

describe("lowerModelMaterialOverrides", () => {
  it("lowers spec.color to a leading baseColorMultiply override", () => {
    const out = lowerModelMaterialOverrides({ color: "#ffffff" }, []);
    expect(out).toHaveLength(1);
    expect(out[0].baseColorMultiply).toEqual([1, 1, 1, 1]);
    expect(out[0].target).toBeUndefined();
  });

  it("maps colorMode 'replace' to baseColorReplace and array targets to a predicate", () => {
    const out = lowerModelMaterialOverrides(undefined, [
      { target: ["a", /B$/], color: "#ff0000", colorMode: "replace", roughness: 0.4 }
    ]);
    expect(out[0].baseColorReplace).toEqual([1, 0, 0, 1]);
    expect(out[0].target!("a")).toBe(true);
    expect(out[0].target!("trimB")).toBe(true);
    expect(out[0].target!("zzz")).toBe(false);
  });

  it("spec-derived override sorts before array overrides (array wins)", () => {
    const mats = authored();
    const snapshot = snapshotMaterials(mats);
    const lowered = lowerModelMaterialOverrides({ color: "#ffffff" }, [
      { target: "trim", color: "#ff0000" }
    ]);
    applyMaterialOverrides(snapshot, mats, lowered);
    expect(mats[1].getParameter("u_baseColorFactor")).toEqual([0.5, 0, 0, 1]);
  });
});
