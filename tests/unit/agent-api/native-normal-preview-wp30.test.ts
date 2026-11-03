import { describe, expect, it } from "vitest";
import { defineAuraAssets, material, model, primitives } from "../../../packages/engine/src/public/index";
import type { AuraNormalMaterialOptions } from "../../../packages/engine/src/agent-api/nodes/material";
import { assertAuraCustomMaterialSpec, createCustomShaderMaterial } from "../../../packages/engine/src/agent-api/compiler/customMaterial";
import { applyModelTintBridge } from "../../../packages/engine/src/agent-api/compiler/modelMaterials";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { globalShaderSource } from "../../../packages/rendering/src/ShaderLibraryCore";

describe("WP-30 public normal preview", () => {
  it("authors the public custom-surface spec and snapshots the chosen side", () => {
    const options: { side: "front" | "back" | "double" } = { side: "double" };
    const spec = material.normal(options);
    options.side = "front";
    expect(spec.kind).toBe("custom");
    expect(spec.custom?.side).toBe("double");
    expect(spec.custom?.uniforms).toBeUndefined();
    expect(spec.custom?.fog).toBeUndefined();
    expect(spec.custom?.transparent).toBeUndefined();
    expect(() => assertAuraCustomMaterialSpec(spec.custom, "material.normal")).not.toThrow();
    const snapshot = JSON.parse(JSON.stringify(primitives.box({ material: spec }).toJSON()));
    expect(snapshot.material).toEqual(spec);
    expect(material.normal().custom?.side).toBe("front");
    expect(material.normal({ side: undefined }).custom?.side).toBe("front");
  });

  it.each(["front", "back", "double"] as const)("accepts the %s side", (side) => {
    const options: AuraNormalMaterialOptions = { side };
    expect(material.normal(options).custom?.side).toBe(side);
  });

  it("rejects non-object, unknown, and invalid side inputs instead of ignoring them", () => {
    for (const options of [null, [], "double", 0, true, NaN]) {
      expect(() => material.normal(options as never)).toThrow(/material\.normal.*object/i);
    }
    for (const side of [null, "", "both", 0, false, NaN, Infinity]) {
      expect(() => material.normal({ side } as never)).toThrow(/material\.normal.*side/i);
    }
    for (const extra of [
      { opacity: 0.5 }, { wireframe: true }, { clipping: {} },
      { normalMap: {} }, { flatShading: true }, { depthMode: "reversed" }
    ]) {
      expect(() => material.normal(extra as never)).toThrow(/material\.normal.*unsupported option/i);
    }
  });

  it.each([
    ["front", "back"],
    ["back", "front"],
    ["double", "none"]
  ] as const)("lowers %s faces to %s culling with an opaque depth-writing material", (side, cullMode) => {
    const compiled = createCustomShaderMaterial(material.normal({ side }).custom!);
    try {
      expect(compiled.renderState).toMatchObject({
        blend: false, depthTest: true, depthWrite: true, cullMode
      });
      expect(compiled.requiredAttributes).toEqual(expect.arrayContaining(["a_position", "a_normal"]));
    } finally {
      compiled.dispose();
    }
  });

  it("does not pretend the generic custom-shader model bridge supports skinning", () => {
    const asset = defineAuraAssets({ item: { type: "model", format: "glb", url: "/item.glb" } }).item;
    const bridge = applyModelTintBridge(model(asset, { material: material.normal() }).toJSON());
    const factory = bridge.customMaterialFactory as (context: { readonly skinned: boolean }) => unknown;
    expect(typeof factory).toBe("function");
    expect(() => factory({ skinned: true })).toThrow(/MODEL_CUSTOM_MATERIAL_UNSUPPORTED.*skinned/i);
  });

  it("reflects the engine-bound matrices and registers paired GLSL/WGSL stages", () => {
    const compiled = createCustomShaderMaterial(material.normal().custom!);
    const device = new MockRenderDevice();
    try {
      const source = globalShaderSource(compiled.shaderKey)!;
      const result = compiled.compile(device);
      expect(result.ok).toBe(true);
      const reflection = result.program!.reflection;
      expect(reflection.attributes.get("a_position")).toBe(0);
      expect(reflection.attributes.get("a_normal")).toBe(1);
      for (const name of ["u_modelMatrix", "u_normalMatrix", "u_viewMatrix", "u_projectionMatrix"]) {
        expect(reflection.uniforms.has(name), name).toBe(true);
        expect(source.portableBindings).toContainEqual(expect.objectContaining({ name, kind: "mat4" }));
      }
      expect(source.vertex).toContain("normalMatrix * normal");
      expect(source.vertex).toContain("mat3(c0, c1, c2)");
      expect(source.fragment).toContain("gl_FrontFacing");
      expect(source.fragment).toContain("inversesqrt(dot(scaled, scaled))");
      expect(source.webgpu?.vertex).toContain("@location(1) normal: vec3<f32>");
      expect(source.webgpu?.vertex).toContain("aura.u_normalMatrix * vec4<f32>(normal, 0.0)");
      expect(source.webgpu?.vertex).toContain("clip.z * 0.5 + clip.w * 0.5");
      expect(source.webgpu?.fragment).toContain("@builtin(front_facing)");
      expect(source.webgpu?.fragment).toContain("inverseSqrt(dot(scaled, scaled))");
    } finally {
      compiled.dispose();
      device.dispose();
    }
  });
});
