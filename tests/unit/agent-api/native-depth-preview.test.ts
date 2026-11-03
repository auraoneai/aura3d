import { describe, expect, it } from "vitest";
import { batched, defineAuraAssets, lines, material, model, points, primitives, scene, sprites, type AuraDepthPreviewMaterialOptions, type AuraSceneSnapshot } from "../../../packages/engine/src/public/index";
import { applyModelTintBridge } from "../../../packages/engine/src/agent-api/compiler/modelMaterials";
import { createProductionPrimitiveMaterial, createProductionRuntimePrimitiveEntries, resolveProductionPrimitiveRuntimeState } from "../../../packages/engine/src/agent-api/compiler/primitives";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { DepthPreviewMaterial } from "../../../packages/rendering/src/DepthPreviewMaterial";
import { globalShaderSource } from "../../../packages/rendering/src/ShaderLibraryCore";

describe("native public depth preview", () => {
  it("exports an authorable typed root material, with a JSON-safe non-custom snapshot", () => {
    const options: AuraDepthPreviewMaterialOptions = { near: 2, far: 12, side: "double" };
    const spec = material.depth(options);
    expect(spec).toEqual({ kind: "depth-preview", depthPreview: { near: 2, far: 12, side: "double" } });
    expect(spec.custom).toBeUndefined();
    expect(Object.isFrozen(spec)).toBe(true);
    expect(Object.isFrozen(spec.depthPreview)).toBe(true);
    const snapshot = JSON.parse(JSON.stringify(primitives.box({ material: spec }).toJSON()));
    expect(snapshot.material).toEqual(spec);
    expect(material.depth().depthPreview).toEqual({ near: 0.1, far: 100, side: "front" });
  });

  it("rejects unsupported fields and invalid float32 ranges at authoring and compilation", () => {
    for (const options of [
      { near: null }, { near: -1 }, { near: 1, far: 1 },
      { near: 1, far: 1 + Number.EPSILON }, { near: 0, far: 1e-44 }, { near: 1e-44, far: 1 },
      { far: Infinity }, { far: 1e40 }, { side: "inside" }, { wireframe: true },
      { depthMode: "reversed" }, { opacity: 0.5 }
    ]) {
      expect(() => material.depth(options as AuraDepthPreviewMaterialOptions)).toThrow();
    }
    expect(() => material.depth(null as unknown as AuraDepthPreviewMaterialOptions)).toThrow();
    const base = primitives.box({ material: material.depth() }).toJSON();
    expect(() => createProductionPrimitiveMaterial({ ...base, material: { ...base.material, color: "#ff0000" } }))
      .toThrow(/DEPTH_PREVIEW_OPTION_UNSUPPORTED/);
    expect(() => createProductionPrimitiveMaterial({ ...base, material: { kind: "depth-preview" } }))
      .toThrow(/missing preview range/);
    expect(() => createProductionPrimitiveMaterial({ ...base, material: {
      kind: "depth-preview", depthPreview: { near: 2, far: 1, side: "front" }
    } })).toThrow(/near and far/);
    expect(material.depth({ near: 0, far: 12 }).depthPreview?.near).toBe(0);
  });

  it("does not silently lower imported models to PBR", () => {
    const asset = defineAuraAssets({ item: { type: "model", format: "glb", url: "/item.glb" } }).item;
    expect(() => model(asset, { material: material.depth() })).toThrow(/DEPTH_PREVIEW_TARGET_UNSUPPORTED/);
    expect(() => model(asset).material(material.depth())).toThrow(/DEPTH_PREVIEW_TARGET_UNSUPPORTED/);
    const node = { ...model(asset).toJSON(), material: material.depth() };
    expect(() => applyModelTintBridge(node)).toThrow(/DEPTH_PREVIEW_MODEL_UNSUPPORTED/);
    expect(() => scene().add(node)).toThrow(/DEPTH_PREVIEW_TARGET_UNSUPPORTED/);
  });

  it("rejects non-primitive targets and scene-wide overrides before creating resources", () => {
    const preview = material.depth();
    expect(() => points({ points: [[0, 0, 0]], material: preview })).toThrow(/DEPTH_PREVIEW_TARGET_UNSUPPORTED/);
    expect(() => lines.line({ points: [[0, 0, 0], [1, 0, 0]], material: preview })).toThrow(/DEPTH_PREVIEW_TARGET_UNSUPPORTED/);
    expect(() => sprites.sprite({ material: preview })).toThrow(/DEPTH_PREVIEW_TARGET_UNSUPPORTED/);
    expect(() => batched.mesh({ maxInstances: 1, material: preview })).toThrow(/DEPTH_PREVIEW_TARGET_UNSUPPORTED/);
    expect(() => scene().overrideMaterial(preview)).toThrow(/DEPTH_PREVIEW_OVERRIDE_UNSUPPORTED/);
  });

  it("rejects runtime replacement on unsupported node kinds without mutating them", () => {
    const asset = defineAuraAssets({ item: { type: "model", format: "glb", url: "/item.glb" } }).item;
    const snapshot = scene().add(model(asset).runtime({ id: "model" })).toJSON() as AuraSceneSnapshot;
    const registry = createAuraRuntimeNodeRegistry(snapshot);
    try {
      const handle = registry.require("model");
      expect(() => handle.setMaterial(material.depth())).toThrow(/DEPTH_PREVIEW_TARGET_UNSUPPORTED/);
      expect((handle.snapshot() as { readonly material?: unknown }).material).toBeUndefined();
      const invalid = { ...model(asset).toJSON(), material: material.depth() };
      expect(() => registry.add(invalid)).toThrow(/DEPTH_PREVIEW_TARGET_UNSUPPORTED/);
      expect(() => registry.reset({ ...snapshot, nodes: [invalid] })).toThrow(/DEPTH_PREVIEW_TARGET_UNSUPPORTED/);
      expect(registry.require("model")).toBe(handle);
    } finally { registry.dispose(); }
  });

  it("shares its native program and releases it after the last material is disposed", () => {
    const nodes = [2, 3].map((near) => primitives.box({ material: material.depth({ near, far: 12 }) }).toJSON());
    const resources = createProductionRuntimePrimitiveEntries(nodes).map((entry) => entry.resources[0]!);
    const a = resources[0]!.material;
    const b = resources[1]!.material;
    try {
      expect(a).toBeInstanceOf(DepthPreviewMaterial);
      expect(b).toBeInstanceOf(DepthPreviewMaterial);
      expect(a.shaderKey).toBe(b.shaderKey);
      expect(globalShaderSource(a.shaderKey)).toBeDefined();
      expect(globalShaderSource(b.shaderKey)).toBeDefined();
      expect(a.renderState).toMatchObject({ blend: false, depthTest: true, depthWrite: true, cullMode: "back" });
      a.dispose();
      a.dispose();
      expect(globalShaderSource(b.shaderKey)).toBeDefined();
      expect(b.getParameter("u_depthPreviewNear")).toBe(3);
      expect(b.getParameter("u_depthPreviewSpan")).toBe(9);
      expect(() => b.setParameter("u_depthPreviewSpan", 0)).toThrow(/RANGE_IMMUTABLE/);
      expect(() => (b as DepthPreviewMaterial).hotReload((b as DepthPreviewMaterial).sources)).toThrow(/IMMUTABLE/);
    } finally {
      for (const resource of resources) {
        resource.geometry.dispose();
        resource.material.dispose();
      }
    }
    expect(globalShaderSource(b.shaderKey)).toBeUndefined();
    expect(() => b.getParameters()).toThrow(/disposed/i);
  });

  it("replaces a live primitive preview and retires the old shader source", () => {
    const node = primitives.box({ material: material.depth({ near: 1, far: 10 }) }).runtime({ id: "preview" }).toJSON();
    const snapshot = scene().add(node).toJSON() as AuraSceneSnapshot;
    const registry = createAuraRuntimeNodeRegistry(snapshot);
    const entry = createProductionRuntimePrimitiveEntries([node])[0]!;
    const before = entry.resources[0]!.material;
    try {
      registry.require("preview").setMaterial(material.depth({ near: 2, far: 20 }));
      resolveProductionPrimitiveRuntimeState(entry, registry);
      const after = entry.resources[0]!.material;
      expect(after).toBeInstanceOf(DepthPreviewMaterial);
      expect(after).not.toBe(before);
      expect(before.disposed).toBe(true);
      expect(after.shaderKey).toBe(before.shaderKey);
      expect(globalShaderSource(after.shaderKey)).toBeDefined();
      expect(after.getParameter("u_depthPreviewNear")).toBe(2);
      expect(after.getParameter("u_depthPreviewSpan")).toBe(18);
    } finally {
      registry.dispose();
      for (const resource of entry.resources) {
        resource.geometry.dispose();
        resource.material.dispose();
      }
    }
  });

  it.each([
    ["front", "back"], ["back", "front"], ["double", "none"]
  ] as const)("maps %s side to %s culling", (side, cullMode) => {
    const instance = createProductionPrimitiveMaterial(primitives.box({ material: material.depth({ side }) }).toJSON());
    try { expect(instance.renderState.cullMode).toBe(cullMode); } finally { instance.dispose(); }
  });
});
