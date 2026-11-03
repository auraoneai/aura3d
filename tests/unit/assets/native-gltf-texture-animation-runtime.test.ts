import { describe, expect, it, vi } from "vitest";
import { AnimationClip, AnimationTrack } from "@aura3d/animation";
import { Material, SkinnedLitMaterial, Texture, TextureBinding, TexturedPBRMaterial, TexturedUnlitMaterial } from "@aura3d/rendering";
import { Scene } from "@aura3d/scene";
import { createGLTFSceneAnimationRuntime } from "../../../packages/assets/src/GLTFAnimationRuntime";
import { gltfRuntimeMaterialKey } from "../../../packages/assets/src/GLTFLoader";
import { createTypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor";
import { createGLBActorAnimationMaterialResolver } from "../../../packages/engine/src/production-runtime/actor/TypedGLBActorAnimation";
import { GENERATED_PBR_MATERIAL_OFFSETS, packGeneratedPbrMaterialUniforms } from "../../../packages/rendering/src/webgpu/GeneratedPbrProgram";

const name = "Paint.body.v2";
const slots = [
  ["pbrMetallicRoughness.baseColorTexture", "baseColor", "baseUv", "mapControls", 0],
  ["normalTexture", "normal", "normalUv", "normalControls", 0],
  ["pbrMetallicRoughness.metallicRoughnessTexture", "metallicRoughness", "metalRoughUv", "coreMapControls", 0],
  ["occlusionTexture", "occlusion", "occlusionUv", "coreMapControls", 1],
  ["emissiveTexture", "emissive", "emissiveUv", "coreMapControls", 2]
] as const;
const suffix = ".extensions.KHR_texture_transform.";
const target = (path: string, part: string) => "material:" + name + "." + path + suffix + part;
const baseOffset = target(slots[0][0], "offset");
const source = { materials: [{
  name, baseColorTexture: {}, metallicRoughnessTexture: {}, normalTexture: {}, occlusionTexture: {}, emissiveTexture: {}
}] };

function texture(): Texture {
  return new Texture({ width: 1, height: 1, data: new Uint8Array([64, 128, 192, 255]), colorSpace: "linear" });
}

function material(map: Texture): TexturedPBRMaterial {
  return new TexturedPBRMaterial({
    name, baseColorTexture: map, metallicRoughnessTexture: map,
    normalTexture: map, occlusionTexture: map, emissiveTexture: map
  });
}

function clip(): AnimationClip {
  return new AnimationClip({ name: "uv", tracks: slots.flatMap(([path]) => [
    new AnimationTrack({ target: target(path, "offset"), valueType: "number-array", keyframes: [
      { time: 0, value: [0, 0] }, { time: 1, value: [0.2, 0.4] }
    ] }),
    new AnimationTrack({ target: target(path, "scale"), valueType: "number-array", keyframes: [
      { time: 0, value: [1, 1] }, { time: 1, value: [2, 3] }
    ] }),
    new AnimationTrack({ target: target(path, "rotation"), valueType: "scalar", keyframes: [
      { time: 0, value: 0 }, { time: 1, value: 0.8 }
    ] })
  ]) });
}

function runtime(library: Map<string, Material>, definitions: NonNullable<Parameters<typeof createGLBActorAnimationMaterialResolver>[1]> = source, overridden = false) {
  return createGLTFSceneAnimationRuntime({
    scene: new Scene(), clips: [clip()],
    resolveAnimationMaterial: createGLBActorAnimationMaterialResolver(
      { materialLibrary: library }, definitions, { importedMaterialOverridden: overridden }
    )
  });
}

/** A standalone glTF triangle with authored scalar and VEC2 pointer outputs. */
function animatedGltfUrl(): string {
  const data: number[] = [];
  const bufferViews: { buffer: number; byteOffset: number; byteLength: number }[] = [];
  const accessors: Record<string, unknown>[] = [];
  const add = (values: number[], type: "SCALAR" | "VEC2" | "VEC3") => {
    const byteOffset = data.length * 4;
    data.push(...values);
    const bufferView = bufferViews.push({ buffer: 0, byteOffset, byteLength: values.length * 4 }) - 1;
    const count = values.length / (type === "SCALAR" ? 1 : type === "VEC2" ? 2 : 3);
    return accessors.push({ bufferView, componentType: 5126, count, type }) - 1;
  };
  const position = add([0, 0, 0, 1, 0, 0, 0, 1, 0], "VEC3");
  Object.assign(accessors[position]!, { min: [0, 0, 0], max: [1, 1, 0] });
  const normal = add([0, 0, 1, 0, 0, 1, 0, 0, 1], "VEC3");
  const uv = add([0, 0, 1, 0, 0, 1], "VEC2");
  const time = add([0, 1], "SCALAR");
  const samplers: { input: number; output: number }[] = [];
  const channels: unknown[] = [];
  for (const [path] of slots) {
    for (const part of ["offset", "scale", "rotation"] as const) {
      const values = part === "offset" ? [0, 0, 0.2, 0.4] : part === "scale" ? [1, 1, 2, 3] : [0, 0.8];
      const output = add(values, part === "rotation" ? "SCALAR" : "VEC2");
      const sampler = samplers.push({ input: time, output }) - 1;
      channels.push({ sampler, target: { path: "pointer", extensions: { KHR_animation_pointer: {
        pointer: "/materials/0/" + path.replaceAll(".", "/") + "/extensions/KHR_texture_transform/" + part
      } } } });
    }
  }
  const textureInfo = () => ({ index: 0, extensions: {
    KHR_texture_transform: { offset: [0, 0], scale: [1, 1], rotation: 0 }
  } });
  const bytes = Buffer.from(new Float32Array(data).buffer);
  const doc = {
    asset: { version: "2.0" }, extensionsUsed: ["KHR_animation_pointer", "KHR_texture_transform"],
    buffers: [{ uri: "data:application/octet-stream;base64," + bytes.toString("base64"), byteLength: bytes.byteLength }],
    bufferViews, accessors, images: [{ uri: "data:image/png;base64,AA==" }], textures: [{ source: 0 }],
    materials: [{ name, pbrMetallicRoughness: { baseColorTexture: textureInfo(), metallicRoughnessTexture: textureInfo() },
      normalTexture: textureInfo(), occlusionTexture: textureInfo(), emissiveTexture: textureInfo() }],
    meshes: [{ primitives: [{ attributes: { POSITION: position, NORMAL: normal, TEXCOORD_0: uv }, material: 0 }] }],
    nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0,
    animations: [{ name: "uv", samplers, channels }]
  };
  return "data:model/gltf+json," + encodeURIComponent(JSON.stringify(doc));
}

describe("glTF texture-transform animation", () => {
  it("samples all five authored map transforms into the actor and the renderer's live uniform packet", async () => {
    const url = animatedGltfUrl();
    const options = { asset: { url, format: "gltf" as const }, width: 8, height: 8, shareTextures: false,
      imageDecoder: () => ({ width: 1, height: 1, data: new Uint8Array([64, 128, 192, 255]), colorSpace: "linear" as const }) };
    const actor = await createTypedGLBActor({ ...options, id: "animated-uv" });
    const other = await createTypedGLBActor({ ...options, id: "other-uv" });
    try {
      expect(actor.playClip("uv", 0.5)).toMatchObject({ materialTracksApplied: 15, missingTargets: [] });
      const live = actor.pipeline.resources.materialLibrary.get(name)!;
      const untouched = other.pipeline.resources.materialLibrary.get(name)!;
      const bytes = packGeneratedPbrMaterialUniforms(live.getParameters());
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const read = (field: string, index: number) => view.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS[field]! + 4 * index, true);
      for (const [, slot, uvField, angleField, angleIndex] of slots) {
        expect(live.getParameter("u_" + slot + "TextureOffset")).toEqual([expect.closeTo(0.1), expect.closeTo(0.2)]);
        expect(live.getParameter("u_" + slot + "TextureScale")).toEqual([1.5, 2]);
        expect(live.getParameter("u_" + slot + "TextureRotation")).toBeCloseTo(0.4);
        expect([read(uvField, 0), read(uvField, 1), read(uvField, 2), read(uvField, 3)])
          .toEqual([expect.closeTo(0.1), expect.closeTo(0.2), 1.5, 2]);
        expect(read(angleField, angleIndex)).toBeCloseTo(0.4);
        expect(untouched.getParameter("u_" + slot + "TextureOffset")).toEqual([0, 0]);
      }
    } finally { actor.dispose(); other.dispose(); }
  });

  it("reports a decoded-texture fallback as missing rather than counting an invisible animation", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let actor: Awaited<ReturnType<typeof createTypedGLBActor>> | undefined;
    try {
      actor = await createTypedGLBActor({ id: "missing-uv", asset: { url: animatedGltfUrl(), format: "gltf" },
        width: 8, height: 8, shareTextures: false, imageDecoder: () => { throw new Error("decode failed"); } });
      const result = actor.playClip("uv", 1);
      expect(result.materialTracksApplied).toBe(0);
      expect(result.materialBindingIssues).toContainEqual({ target: baseOffset, reason: "missing-map" });
    } finally { actor?.dispose(); warn.mockRestore(); }
  });

  it("updates source variants and aliases once while preserving independent materials", () => {
    const map = texture();
    const first = material(map);
    const second = material(map);
    const independent = material(map);
    const library = new Map<string, Material>([[name, first], [gltfRuntimeMaterialKey(name, { skinned: true }), second]]);
    const animation = runtime(library);
    const set = vi.spyOn(first, "setParameter");
    library.set(gltfRuntimeMaterialKey(name, { instanced: true }), first);
    expect(animation.applyClipByName("uv", 0.5).materialTracksApplied).toBe(15);
    expect(set.mock.calls.filter(([key]) => key === "u_baseColorTextureOffset")).toHaveLength(1);
    expect(second.getParameter("u_baseColorTextureOffset")).toEqual([0.1, 0.2]);
    expect(independent.getParameter("u_baseColorTextureOffset")).toEqual([0, 0]);
    const late = material(map);
    library.set(gltfRuntimeMaterialKey(name, { instanced: true }), late);
    expect(animation.applyClipByName("uv", 1).materialTracksApplied).toBe(15);
    expect(late.getParameter("u_normalTextureOffset")).toEqual([0.2, 0.4]);
    const otherMap = texture();
    const untrusted = material(otherMap);
    library.set(gltfRuntimeMaterialKey(name, { instanced: true }), untrusted);
    expect(animation.applyClipByName("uv", 0.5).materialBindingIssues).toContainEqual({ target: baseOffset, reason: "changed-map" });
    expect(first.getParameter("u_baseColorTextureOffset")).toEqual([0.2, 0.4]);
    [first, second, independent, late, untrusted].forEach((entry) => entry.dispose());
    map.dispose(); otherMap.dispose();
  });

  it("blends sampled vector and scalar channels, including stepped and cubic tracks", () => {
    const map = texture();
    const live = material(map);
    const library = new Map<string, Material>([[name, live]]);
    const animation = runtime(library);
    expect(animation.applyClips([{ clipName: "uv", time: 0, weight: 1 }, { clipName: "uv", time: 1, weight: 3 }]).materialTracksApplied).toBe(15);
    expect(live.getParameter("u_baseColorTextureOffset")).toEqual([expect.closeTo(0.15), expect.closeTo(0.3)]);
    expect(live.getParameter("u_normalTextureRotation")).toBeCloseTo(0.6);

    const tracks = new AnimationClip({ name: "modes", tracks: [
      new AnimationTrack({ target: baseOffset, valueType: "number-array", keyframes: [
        { time: 0, value: [0, 0], outTangent: [1, 2], interpolation: "cubicspline" },
        { time: 1, value: [1, 2], inTangent: [1, 2] }
      ] }),
      new AnimationTrack({ target: target(slots[1][0], "rotation"), valueType: "scalar", keyframes: [
        { time: 0, value: 0.25, interpolation: "step" }, { time: 1, value: 1 }
      ] })
    ] });
    const second = createGLTFSceneAnimationRuntime({ scene: new Scene(), clips: [tracks],
      resolveAnimationMaterial: createGLBActorAnimationMaterialResolver({ materialLibrary: library }, source) });
    expect(second.applyClipByName("modes", 0.5)).toMatchObject({ materialTracksApplied: 2, missingTargets: [] });
    expect(live.getParameter("u_baseColorTextureOffset")).toEqual([0.5, 1]);
    expect(live.getParameter("u_normalTextureRotation")).toBe(0.25);
    live.dispose(); map.dispose();
  });

  it("rejects duplicate source names, cross-source aliases, and shared actor materials", () => {
    const map = texture();
    const first = material(map);
    const duplicate = runtime(new Map([[name, first]]), { materials: [source.materials[0], source.materials[0]] });
    expect(duplicate.applyClipByName("uv", 1).materialBindingIssues).toContainEqual({ target: baseOffset, reason: "ambiguous" });
    const crossSource = runtime(new Map([[name, first], ["other", first]]));
    expect(crossSource.applyClipByName("uv", 1).materialBindingIssues).toContainEqual({ target: baseOffset, reason: "ambiguous" });
    const a = material(map);
    const firstActor = runtime(new Map([[name, a]]));
    const secondActor = runtime(new Map([[name, a]]));
    expect(firstActor.applyClipByName("uv", 1).materialBindingIssues).toContainEqual({ target: baseOffset, reason: "ambiguous" });
    expect(secondActor.applyClipByName("uv", 1).materialBindingIssues).toContainEqual({ target: baseOffset, reason: "ambiguous" });
    expect(a.getParameter("u_baseColorTextureOffset")).toEqual([0, 0]);
    first.dispose(); a.dispose(); map.dispose();
  });

  it("diagnoses missing, replaced, disabled and disposed bindings without updating sibling variants", () => {
    const map = texture();
    const replacement = texture();
    const first = material(map);
    const second = material(map);
    const library = new Map<string, Material>([[name, first], [gltfRuntimeMaterialKey(name, { skinned: true }), second]]);
    const animation = runtime(library);
    second.setParameter("u_baseColorTexture", new TextureBinding({ name: "replacement", texture: replacement }));
    expect(animation.applyClipByName("uv", 1).materialBindingIssues).toContainEqual({ target: baseOffset, reason: "changed-map" });
    const newResolver = runtime(library);
    expect(newResolver.applyClipByName("uv", 1).materialBindingIssues).toContainEqual({ target: baseOffset, reason: "changed-map" });
    expect(first.getParameter("u_baseColorTextureOffset")).toEqual([0, 0]);
    second.setParameter("u_baseColorTextureEnabled", 0);
    expect(animation.inspectClipBindings("uv")[0]?.materialBindingIssues).toContainEqual({ target: baseOffset, reason: "missing-map" });
    second.setParameter("u_baseColorTextureEnabled", 1);
    replacement.dispose();
    expect(animation.applyClipByName("uv", 1).materialBindingIssues).toContainEqual({ target: baseOffset, reason: "disposed" });
    second.dispose();
    expect(animation.inspectClipBindings("uv")[0]?.materialBindingIssues).toContainEqual({ target: baseOffset, reason: "disposed" });
    first.dispose(); map.dispose();

    const map2 = texture();
    const missing = material(map2);
    const missingSource = runtime(new Map([[name, missing]]), { materials: [{ ...source.materials[0], baseColorTexture: undefined }] });
    expect(missingSource.applyClipByName("uv", 1).materialBindingIssues).toContainEqual({ target: baseOffset, reason: "missing-map" });
    missing.dispose(); map2.dispose();
  });

  it("detects a texture object swapped inside an existing binding", () => {
    const map = texture();
    const replacement = texture();
    const live = material(map);
    const animation = runtime(new Map([[name, live]]));
    const binding = live.getParameter("u_baseColorTexture") as TextureBinding;
    Object.defineProperty(binding, "texture", { value: replacement });
    expect(animation.applyClipByName("uv", 1).materialBindingIssues).toContainEqual({ target: baseOffset, reason: "changed-map" });
    expect(live.getParameter("u_baseColorTextureOffset")).toEqual([0, 0]);
    live.dispose(); map.dispose(); replacement.dispose();
  });

  it("rolls back all variants when a setter fails or changes another binding during a write", () => {
    const map = texture();
    const replacement = texture();
    const first = material(map);
    const second = material(map);
    const animation = runtime(new Map([[name, first], [gltfRuntimeMaterialKey(name, { skinned: true }), second]]));
    const original = second.setParameter.bind(second);
    const spy = vi.spyOn(second, "setParameter").mockImplementation((parameter, value) => {
      if (parameter === "u_baseColorTextureOffset" && Array.isArray(value) && value[0] === 0.2) throw new Error("write failed");
      original(parameter, value);
    });
    expect(() => animation.applyClipByName("uv", 1)).toThrow("write failed");
    expect(first.getParameter("u_baseColorTextureOffset")).toEqual([0, 0]);
    expect(second.getParameter("u_baseColorTextureOffset")).toEqual([0, 0]);
    spy.mockRestore();
    const originalFirst = first.setParameter.bind(first);
    vi.spyOn(first, "setParameter").mockImplementation((parameter, value) => {
      originalFirst(parameter, value);
      if (parameter === "u_baseColorTextureOffset" && Array.isArray(value) && value[0] === 0.2) {
        second.setParameter("u_baseColorTexture", new TextureBinding({ name: "replacement", texture: replacement }));
      }
    });
    expect(animation.applyClipByName("uv", 1).materialBindingIssues).toContainEqual({ target: baseOffset, reason: "changed-map" });
    expect(first.getParameter("u_baseColorTextureOffset")).toEqual([0, 0]);
    expect(second.getParameter("u_baseColorTextureOffset")).toEqual([0, 0]);
    first.dispose(); second.dispose(); map.dispose(); replacement.dispose();
  });

  it("revalidates after the last setter before claiming a successful write", () => {
    const map = texture();
    const replacement = texture();
    const first = material(map);
    const last = material(map);
    const animation = runtime(new Map([[name, first], [gltfRuntimeMaterialKey(name, { skinned: true }), last]]));
    const original = last.setParameter.bind(last);
    vi.spyOn(last, "setParameter").mockImplementation((parameter, value) => {
      original(parameter, value);
      if (parameter === "u_baseColorTextureOffset" && Array.isArray(value) && value[0] === 0.2) {
        first.setParameter("u_baseColorTexture", new TextureBinding({ name: "replacement", texture: replacement }));
      }
    });
    expect(animation.applyClipByName("uv", 1).materialBindingIssues).toContainEqual({ target: baseOffset, reason: "changed-map" });
    expect(first.getParameter("u_baseColorTextureOffset")).toEqual([0, 0]);
    expect(last.getParameter("u_baseColorTextureOffset")).toEqual([0, 0]);
    first.dispose(); last.dispose(); map.dispose(); replacement.dispose();
  });

  it("rolls back if a material setter silently drops the sampled uniform", () => {
    const map = texture();
    const first = material(map);
    const last = material(map);
    const animation = runtime(new Map([[name, first], [gltfRuntimeMaterialKey(name, { skinned: true }), last]]));
    const original = last.setParameter.bind(last);
    vi.spyOn(last, "setParameter").mockImplementation((parameter, value) => {
      if (parameter === "u_baseColorTextureOffset" && Array.isArray(value) && value[0] === 0.2) return;
      original(parameter, value);
    });
    expect(animation.applyClipByName("uv", 1).materialBindingIssues).toContainEqual({ target: baseOffset, reason: "unsupported" });
    expect(first.getParameter("u_baseColorTextureOffset")).toEqual([0, 0]);
    expect(last.getParameter("u_baseColorTextureOffset")).toEqual([0, 0]);
    first.dispose(); last.dispose(); map.dispose();
  });

  it("limits shader and source contexts, and rejects malformed samples before writing", () => {
    const map = texture();
    const unlit = new TexturedUnlitMaterial({ name, texture: map });
    const unlitResolver = createGLBActorAnimationMaterialResolver(
      { materialLibrary: new Map([[name, unlit]]) }, { materials: [{ ...source.materials[0], unlit: true }] }
    )(name)!;
    expect(unlitResolver.animationParameterStatus?.("u_baseColorTextureOffset")).toBe("available");
    expect(unlitResolver.animationParameterStatus?.("u_normalTextureOffset")).toBe("unsupported");
    const skin = new SkinnedLitMaterial({ name, baseColorTexture: new TextureBinding({ name: "base", texture: map }) });
    const skinResolver = createGLBActorAnimationMaterialResolver({ materialLibrary: new Map([[name, skin]]) }, source)(name)!;
    expect(skinResolver.animationParameterStatus?.("u_baseColorTextureOffset")).toBe("available");
    expect(skinResolver.animationParameterStatus?.("u_normalTextureOffset")).toBe("unsupported");
    const plain = material(map);
    const library = new Map<string, Material>([[name, plain]]);
    const animation = runtime(library);
    expect(() => animation.applyAnimationValues("bad", 0, new Map([[baseOffset, [1, 2, 3]]]))).toThrow(/invalid texture transform vec2/);
    expect(() => animation.applyAnimationValues("bad", 0, new Map([[baseOffset, [1, 1e100]]]))).toThrow(/invalid texture transform vec2/);
    expect(plain.getParameter("u_baseColorTextureOffset")).toEqual([0, 0]);
    expect(runtime(library, source, true).applyClipByName("uv", 1).materialBindingIssues)
      .toContainEqual({ target: baseOffset, reason: "unsupported" });
    expect(runtime(library, { materials: [{ ...source.materials[0], pbrSpecularGlossiness: {} }] }).applyClipByName("uv", 1).materialBindingIssues)
      .toContainEqual({ target: baseOffset, reason: "unsupported" });
    const unsupportedPath = target("extensions.KHR_materials_clearcoat.clearcoatTexture", "offset");
    expect(animation.applyAnimationValues("extension", 0, new Map([[unsupportedPath, [0.1, 0.2]]])).materialBindingIssues)
      .toContainEqual({ target: unsupportedPath, reason: "unsupported" });
    unlit.dispose(); skin.dispose(); plain.dispose(); map.dispose();
  });
});
