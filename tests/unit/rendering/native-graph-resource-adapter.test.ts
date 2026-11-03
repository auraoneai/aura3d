import { describe, expect, it } from "vitest";
import { applyCustomUniformWrites, assertCustomUniformWrite, createCustomShaderMaterial, normalizeCustomUniformValue, syncCustomTextureRefs } from "../../../packages/engine/src/agent-api/compiler/customMaterial";
import { shaderGraph } from "../../../packages/engine/src/agent-api/nodes/shaderGraph";
import { texture } from "../../../packages/engine/src/agent-api/nodes/texture";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { Sampler } from "../../../packages/rendering/src/Sampler";
import { globalShaderSource } from "../../../packages/rendering/src/ShaderLibraryCore";
import { Texture } from "../../../packages/rendering/src/Texture";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import type { ShaderGraphDocument } from "../../../packages/rendering/src/program/ShaderGraphCompiler";

const graph: ShaderGraphDocument = {
  version: 1,
  stage: "material",
  resources: [
    { name: "image", kind: "texture2d" },
    { name: "volume", kind: "texture3d" },
    { name: "depthMap", kind: "depth2d" },
    { name: "gain", kind: "uniform", type: "f32" }
  ],
  nodes: [
    { id: "uv", op: "constant", type: "vec2", value: [0, 0] },
    { id: "uvw", op: "constant", type: "vec3", value: [0.25, 0.5, 0.75] },
    { id: "imageColor", op: "textureSample", type: "vec4", resource: "image", inputs: ["uv"] },
    { id: "volumeColor", op: "textureSample", type: "vec4", resource: "volume", inputs: ["uvw"] },
    { id: "color", op: "add", type: "vec4", inputs: ["imageColor", "volumeColor"] },
    { id: "depth", op: "textureLoad", type: "f32", resource: "depthMap", inputs: ["uv"] },
    { id: "gain", op: "uniform", type: "f32", resource: "gain" },
    { id: "opacity", op: "mul", type: "f32", inputs: ["depth", "gain"] }
  ],
  outputs: { color: "color", opacity: "opacity" }
};

function resources() {
  const image = new Texture({ width: 1, height: 1, data: new Uint8Array([255, 0, 0, 255]) });
  const volume = texture.data3d({ width: 1, height: 1, depth: 1, data: new Uint8Array([0, 255, 0, 255]) });
  const depthMap = texture.depth({ width: 1, height: 1 });
  return { image, volume, depthMap, gain: 0.5 };
}

function disposeResources(values: ReturnType<typeof resources>) {
  values.image.dispose();
  values.volume.dispose();
  values.depthMap.dispose();
}

describe("graph material sampled resource adapter", () => {
  it("keeps resource types, values, and public aliases through the portable material", () => {
    const values = resources();
    const imageBinding = new TextureBinding({ name: "image", texture: values.image });
    const authored = { ...values, image: imageBinding };
    const replacement = texture.data3d({ width: 1, height: 1, depth: 1, data: new Uint8Array([0, 0, 255, 255]) });
    const device = new MockRenderDevice();
    try {
      const spec = shaderGraph.material({ graph, uniforms: authored });
      const custom = spec.custom!;
      expect(custom.uniformAliases).toEqual({
        image: "auraGraph_resource_image", volume: "auraGraph_resource_volume",
        depthMap: "auraGraph_resource_depthMap", gain: "auraGraph_resource_gain"
      });
      expect(custom.uniforms).toMatchObject({
        auraGraph_resource_image: { type: "texture2d", value: imageBinding },
        auraGraph_resource_volume: { type: "texture3d", value: values.volume },
        auraGraph_resource_depthMap: { type: "depth2d", value: values.depthMap },
        auraGraph_resource_gain: { type: "f32", value: 0.5 }
      });
      expect(shaderGraph.deserialize(shaderGraph.serialize(graph))).toEqual(graph);
      expect(custom.glsl.fragment).toContain("texelFetch(auraGraph_resource_depthMap");
      expect(custom.wgsl!.fragment).toContain("textureLoad(u_auraGraph_resource_depthMapTexture");
      expect(custom.wgsl!.fragment).toContain("textureSample(u_auraGraph_resource_volumeTexture, u_auraGraph_resource_volumeSampler");
      expect(custom.wgsl!.fragment).not.toContain("u_auraGraph_resource_depthMapSampler");
      const material = createCustomShaderMaterial(custom);
      try {
        expect(material.uniformSchema).toEqual(expect.arrayContaining([
          expect.objectContaining({ name: "u_auraGraph_resource_image", kind: "texture2d" }),
          expect.objectContaining({ name: "u_auraGraph_resource_volume", kind: "texture3d" }),
          expect.objectContaining({ name: "u_auraGraph_resource_depthMap", kind: "depth2d" })
        ]));
        expect((material.getParameter("u_auraGraph_resource_image") as TextureBinding).texture).toBe(values.image);
        expect((material.getParameter("u_auraGraph_resource_volume") as TextureBinding).texture).toBe(values.volume.texture);
        expect((material.getParameter("u_auraGraph_resource_depthMap") as TextureBinding).texture).toBe(values.depthMap.texture);
        const graphBindings = shaderGraph.compile(graph, "wgsl").bindings;
        expect(graphBindings.map(({ name, binding, samplerBinding }) => ({ name, binding, samplerBinding }))).toEqual([
          { name: "image", binding: 2, samplerBinding: 1 },
          { name: "volume", binding: 4, samplerBinding: 3 },
          { name: "depthMap", binding: 5, samplerBinding: undefined },
          { name: "gain", binding: 0, samplerBinding: undefined }
        ]);
        const portable = globalShaderSource(material.shaderKey)?.portableBindings ?? [];
        expect(portable.filter(({ name }) => ["u_auraGraph_resource_image", "u_auraGraph_resource_volume", "u_auraGraph_resource_depthMap"].includes(name))
          .map(({ name, kind }) => ({ name, kind }))).toEqual([
            { name: "u_auraGraph_resource_image", kind: "texture2d" },
            { name: "u_auraGraph_resource_volume", kind: "texture3d" },
            { name: "u_auraGraph_resource_depthMap", kind: "depth2d" }
          ]);
        expect(material.compile(device).ok).toBe(true);
        assertCustomUniformWrite(spec, "volume", replacement);
        expect(applyCustomUniformWrites(material, new Map([["volume", replacement]]))).toBe(1);
        expect((material.getParameter("u_auraGraph_resource_volume") as TextureBinding).texture).toBe(replacement.texture);
      } finally { material.dispose(); }
      const defaults = shaderGraph.material({ graph }).custom!;
      expect(defaults.uniforms).toMatchObject({
        auraGraph_resource_image: "texture2d", auraGraph_resource_volume: "texture3d", auraGraph_resource_depthMap: "depth2d"
      });
    } finally { device.dispose(); replacement.dispose(); disposeResources(values); }
  });

  it("rejects mismatched, disposed, and non-sampleable initial resources", () => {
    const values = resources();
    const noSampleUsage = new Texture({ width: 1, height: 1, dimension: "3d", depth: 1, usage: ["storage"] });
    const disposedImage = new Texture({ width: 1, height: 1 });
    const disposedVolume = texture.data3d({ width: 1, height: 1, depth: 1 });
    const disposedDepth = texture.depth({ width: 1, height: 1 });
    disposedImage.dispose();
    disposedVolume.dispose();
    disposedDepth.dispose();
    try {
      for (const [name, value, error] of [
        ["image", values.depthMap, /2d color texture/],
        ["image", values.volume, /2d color texture/],
        ["volume", values.image, /3d texture/],
        ["depthMap", values.image, /2d depth texture/],
        ["image", disposedImage, /live texture/],
        ["volume", new TextureBinding({ name: "volume", texture: disposedVolume.texture }), /live texture/],
        ["depthMap", disposedDepth, /live backing texture/],
        ["volume", noSampleUsage, /sampled usage/],
        ["depthMap", new TextureBinding({ name: "depthMap", texture: values.depthMap.texture, sampler: new Sampler({ compare: "less-equal" }) }), /non-comparison/],
        ["depthMap", new TextureBinding({ name: "depthMap" }), /bound depth2d/]
      ] as const) {
        expect(() => shaderGraph.material({ graph, uniforms: { ...values, [name]: value } })).toThrow(error);
      }
      expect(() => shaderGraph.material({ graph, uniforms: { ...values, extra: 1 } })).toThrow(/unknown-resource/);
    } finally { noSampleUsage.dispose(); disposeResources(values); }
  });

  it("retains depth loads when storage loads are replaced for GLSL reflection", () => {
    const graphWithStorage: ShaderGraphDocument = {
      version: 1, stage: "material",
      resources: [
        { name: "depthMap", kind: "depth2d" },
        { name: "values", kind: "storage-buffer", type: "f32", access: "read" },
        { name: "storageImage", kind: "storage-texture", format: "rgba8unorm", access: "read" }
      ],
      nodes: [
        { id: "pixel", op: "constant", type: "vec2", value: [0, 0] },
        { id: "depth", op: "textureLoad", type: "f32", resource: "depthMap", inputs: ["pixel"] },
        { id: "index", op: "constant", type: "u32", value: 0 },
        { id: "stored", op: "storageLoad", type: "f32", resource: "values", inputs: ["index"] },
        { id: "storedImage", op: "textureLoad", type: "vec4", resource: "storageImage", inputs: ["pixel"] },
        { id: "storedChannel", op: "swizzle", type: "f32", inputs: ["storedImage"], components: "x" },
        { id: "partial", op: "add", type: "f32", inputs: ["depth", "stored"] },
        { id: "sum", op: "add", type: "f32", inputs: ["partial", "storedChannel"] },
        { id: "color", op: "construct", type: "vec3", inputs: ["sum", "sum", "sum"] }
      ], outputs: { color: "color" }
    };
    const device = new MockRenderDevice();
    const buffer = device.createBuffer("storage", 4);
    const depthMap = texture.depth({ width: 1, height: 1 });
    const storageImage = new Texture({ width: 1, height: 1, usage: ["storage"] });
    try {
      const custom = shaderGraph.material({ graph: graphWithStorage, backend: "wgsl", uniforms: { depthMap }, storage: {
        values: { kind: "storage-buffer", buffer }, storageImage: { kind: "storage-texture", texture: storageImage }
      } }).custom!;
      expect(custom.uniforms?.auraGraph_resource_depthMap).toEqual({ type: "depth2d", value: depthMap });
      expect(custom.glsl.fragment).toContain("texelFetch(auraGraph_resource_depthMap");
      expect(custom.glsl.fragment).not.toContain("auraGraph_resource_values");
      expect(custom.glsl.fragment).not.toContain("auraGraph_resource_storageImage");
      expect(custom.wgsl!.fragment).toContain("textureLoad(u_auraGraph_resource_depthMapTexture");
      expect(custom.wgsl!.fragment).toContain("auraGraph_resource_values[");
      expect(custom.wgsl!.fragment).toContain("textureLoad(auraGraph_resource_storageImage");
      const material = createCustomShaderMaterial(custom);
      try { expect(material.compile(device).ok).toBe(false); } finally { material.dispose(); }
    } finally { depthMap.dispose(); storageImage.dispose(); buffer.dispose(); device.dispose(); }
  });
});

describe("custom material texture writes", () => {
  it("checks graph aliases and keeps the existing binding after a rejected write", () => {
    const values = resources();
    const noSampleUsage = new Texture({ width: 1, height: 1, dimension: "3d", depth: 1, usage: ["storage"] });
    const disposedImage = new Texture({ width: 1, height: 1 });
    const disposedDepth = texture.depth({ width: 1, height: 1 });
    const replacement = texture.data3d({ width: 1, height: 1, depth: 1 });
    disposedImage.dispose();
    disposedDepth.dispose();
    const spec = shaderGraph.material({ graph, uniforms: values });
    const material = createCustomShaderMaterial(spec.custom!);
    try {
      for (const [name, value, error] of [
        ["image", values.volume, /2d color texture/],
        ["volume", values.image, /3d texture/],
        ["depthMap", values.image, /2d depth texture/],
        ["image", disposedImage, /live texture/],
        ["depthMap", disposedDepth, /live backing texture/],
        ["volume", noSampleUsage, /sampled usage/]
      ] as const) {
        const key = `u_auraGraph_resource_${name}`;
        const previous = material.getParameter(key);
        expect(() => assertCustomUniformWrite(spec, name, value)).toThrow(error);
        expect(() => applyCustomUniformWrites(material, new Map([[name, value]]))).toThrow(error);
        expect(material.getParameter(key)).toBe(previous);
      }
      values.volume.dispose();
      expect(syncCustomTextureRefs(material)).toBe(0);
      expect((material.getParameter("u_auraGraph_resource_volume") as TextureBinding).validate().ok).toBe(false);
      expect(applyCustomUniformWrites(material, new Map([["volume", replacement]]))).toBe(1);
      expect((material.getParameter("u_auraGraph_resource_volume") as TextureBinding).texture).toBe(replacement.texture);
    } finally { material.dispose(); replacement.dispose(); noSampleUsage.dispose(); disposeResources(values); }
  });

  it("preserves deferred and unbacked 2D placeholders while rejecting missing required textures", () => {
    const asset = { kind: "aura-asset-ref", type: "texture", id: "image", url: "/image.png" };
    const optional = new TextureBinding({ name: "optional" });
    expect((normalizeCustomUniformValue("texture2d", asset) as TextureBinding).texture).toBeNull();
    expect(normalizeCustomUniformValue("texture2d", optional)).toBe(optional);
    expect(() => normalizeCustomUniformValue("texture3d", optional)).toThrow(/bound texture3d/);
    expect(() => normalizeCustomUniformValue("depth2d", optional)).toThrow(/bound depth2d/);
    const unbacked = normalizeCustomUniformValue("texture2d", { kind: "aura-texture-ref", id: "unbacked" }) as TextureBinding;
    expect(unbacked.texture).toBeNull();
    expect(unbacked.required).toBe(false);
  });
});
