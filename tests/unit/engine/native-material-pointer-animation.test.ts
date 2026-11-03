import { describe, expect, it, vi } from "vitest";
import { AnimationClip, AnimationTrack } from "@aura3d/animation";
import { Scene } from "@aura3d/scene";
import { Material, PBRMaterial, SkinnedLitMaterial, Texture, TextureBinding, TexturedPBRMaterial } from "@aura3d/rendering";
import { createGLTFSceneAnimationRuntime } from "../../../packages/assets/src/GLTFAnimationRuntime";
import { gltfRuntimeMaterialKey } from "../../../packages/assets/src/GLTFLoader";
import { createTypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor";
import { createGLBActorAnimationMaterialResolver } from "../../../packages/engine/src/production-runtime/actor/TypedGLBActorAnimation";

const name = "paint.layer";
const normalTarget = `material:${name}.normalTexture.scale`;
const occlusionTarget = `material:${name}.occlusionTexture.strength`;
const specularTarget = `material:${name}.extensions.KHR_materials_specular.specularFactor`;
const sheenTarget = `material:${name}.extensions.KHR_materials_sheen.sheenRoughnessFactor`;

function texture(): Texture {
  return new Texture({ width: 1, height: 1, colorSpace: "linear", data: new Uint8Array([128, 128, 255, 255]) });
}

function source(...names: string[]) {
  return { materials: names.map((entry) => ({ name: entry, normalTexture: {}, occlusionTexture: {} })) };
}

function clip(): AnimationClip {
  return new AnimationClip({ name: "surface", tracks: [
    new AnimationTrack({ target: normalTarget, valueType: "scalar", keyframes: [{ time: 0, value: 1 }, { time: 1, value: 0.25 }] }),
    new AnimationTrack({ target: occlusionTarget, valueType: "scalar", keyframes: [{ time: 0, value: 1 }, { time: 1, value: 0.5 }] })
  ] });
}

function runtime(library: Map<string, Material>, asset = source(name)) {
  return createGLTFSceneAnimationRuntime({
    scene: new Scene(), clips: [clip()],
    resolveAnimationMaterial: createGLBActorAnimationMaterialResolver({ materialLibrary: library }, asset)
  });
}

/** Independent in-memory triangle with two scalar material-pointer channels. */
function animatedGltfUrl(options: {
  readonly kind?: "map-scalar" | "texture-transform" | "physical";
  readonly required?: boolean;
} = {}): string {
  const data = new Float32Array([
    0, 0, 0, 1, 0, 0, 0, 1, 0,
    0, 0, 1, 0, 0, 1, 0, 0, 1,
    0, 0, 1, 0, 0, 1,
    0, 1,
    1, 0.25,
    1, 0.5
  ]);
  const bytes = Buffer.from(data.buffer);
  const physical = options.kind === "physical";
  const textureTransform = options.kind === "texture-transform";
  const transform = textureTransform ? { extensions: { KHR_texture_transform: { rotation: 0 } } } : {};
  const paths = physical
    ? ["extensions/KHR_materials_specular/specularFactor", "extensions/KHR_materials_sheen/sheenRoughnessFactor"]
    : textureTransform
      ? ["normalTexture/extensions/KHR_texture_transform/rotation", "occlusionTexture/extensions/KHR_texture_transform/rotation"]
      : ["normalTexture/scale", "occlusionTexture/strength"];
  const document = {
    asset: { version: "2.0" },
    extensionsUsed: ["KHR_animation_pointer", ...(textureTransform ? ["KHR_texture_transform"] : []),
      ...(physical ? ["KHR_materials_specular", "KHR_materials_sheen"] : [])],
    ...(options.required ? { extensionsRequired: ["KHR_animation_pointer"] } : {}),
    buffers: [{ uri: `data:application/octet-stream;base64,${bytes.toString("base64")}`, byteLength: bytes.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 36 },
      { buffer: 0, byteOffset: 72, byteLength: 24 }, { buffer: 0, byteOffset: 96, byteLength: 8 },
      { buffer: 0, byteOffset: 104, byteLength: 8 }, { buffer: 0, byteOffset: 112, byteLength: 8 }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 2, componentType: 5126, count: 3, type: "VEC2" },
      ...[3, 4, 5].map((bufferView) => ({ bufferView, componentType: 5126, count: 2, type: "SCALAR" }))
    ],
    ...(physical ? {} : { images: [{ uri: "data:image/png;base64,AA==" }], textures: [{ source: 0 }] }),
    materials: [physical ? {
      name, extensions: {
        KHR_materials_specular: { specularFactor: 1 },
        KHR_materials_sheen: { sheenRoughnessFactor: 1 }
      }
    } : { name, normalTexture: { index: 0, scale: 1, ...transform }, occlusionTexture: { index: 0, strength: 1, ...transform } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, material: 0 }] }],
    nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0,
    animations: [{ name: "surface", samplers: [{ input: 3, output: 4 }, { input: 3, output: 5 }],
      channels: paths.map((path, sampler) => ({
        sampler, target: { path: "pointer", extensions: { KHR_animation_pointer: { pointer: `/materials/0/${path}` } } }
      })) }]
  };
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(document))}`;
}

describe("actor material pointer bindings", () => {
  it("loads and samples both pointer properties through the typed actor path", async () => {
    const actor = await createTypedGLBActor({
      id: "pointer-material", asset: { url: animatedGltfUrl(), format: "gltf" }, width: 8, height: 8,
      imageDecoder: () => ({ width: 1, height: 1, data: new Uint8Array([128, 128, 255, 255]), colorSpace: "linear" }),
      shareTextures: false
    });
    try {
      const result = actor.playClip("surface", 1);
      expect(result.materialTracksApplied).toBe(2);
      expect(result.missingTargets).toEqual([]);
      const material = actor.pipeline.resources.materialLibrary.get(name);
      expect(material?.getParameter("u_normalScale")).toBeCloseTo(0.25);
      expect(material?.getParameter("u_occlusionStrength")).toBeCloseTo(0.5);
    } finally {
      actor.dispose();
    }
  });

  // A whole-model replacement over a textured slot must sample (declare) or
  // supply every authored map; transformed maps cannot be carried at all.
  it.each([
    { kind: "map-scalar", required: false },
    { kind: "map-scalar", required: true },
    { kind: "texture-transform", required: false },
    { kind: "texture-transform", required: true }
  ] as const)("rejects a custom material that drops authored maps for $kind pointers (required=$required)", async ({ kind, required }) => {
    const custom = new PBRMaterial({ name: "override" });
    const factory = vi.fn(() => custom);
    try {
      expect(custom.getParameter("u_normalTexture")).toBeUndefined();
      expect(custom.getParameter("u_occlusionTexture")).toBeUndefined();
      await expect(createTypedGLBActor({
        id: `custom-pointer-${kind}-${required}-missing`,
        asset: { url: animatedGltfUrl({ kind, required }), format: "gltf" }, width: 8, height: 8,
        imageDecoder: () => ({ width: 1, height: 1, data: new Uint8Array([128, 128, 255, 255]), colorSpace: "linear" }),
        customMaterialFactory: factory, shareTextures: false
      })).rejects.toMatchObject({
        code: "MODEL_CUSTOM_MATERIAL_UNSUPPORTED",
        message: kind === "texture-transform"
          ? expect.stringContaining("with a texture transform, which a custom shader binding cannot carry")
          : expect.stringContaining("does not declare texture2d uniform(s) normalTexture, occlusionTexture")
      });
      // A transformed map is rejected while planning, before any material is created.
      expect(factory).toHaveBeenCalledTimes(kind === "texture-transform" ? 0 : 1);
    } finally {
      custom.dispose();
    }
  });

  it("rejects caller-supplied replacement maps when the overridden pointer tracks are required", async () => {
    const foreignMap = texture();
    const custom = new TexturedPBRMaterial({ name: "override", normalTexture: foreignMap, occlusionTexture: foreignMap });
    try {
      await expect(createTypedGLBActor({
        id: "custom-pointer-map-scalar-required-foreign",
        asset: { url: animatedGltfUrl({ kind: "map-scalar", required: true }), format: "gltf" }, width: 8, height: 8,
        imageDecoder: () => ({ width: 1, height: 1, data: new Uint8Array([128, 128, 255, 255]), colorSpace: "linear" }),
        customMaterialFactory: () => custom, shareTextures: false
      })).rejects.toThrow(/Required KHR_animation_pointer binding unavailable.*imported-material-overridden/);
      expect(custom.disposed).toBe(true);
      expect(foreignMap.disposed).toBe(false);
    } finally {
      custom.dispose();
      foreignMap.dispose();
    }
  });

  it("accepts caller-supplied replacement maps over authored maps and reports the optional pointer tracks overridden", async () => {
    const foreignMap = texture();
    const custom = new TexturedPBRMaterial({ name: "override", normalTexture: foreignMap, occlusionTexture: foreignMap });
    const actor = await createTypedGLBActor({
      id: "custom-pointer-map-scalar-optional-foreign",
      asset: { url: animatedGltfUrl({ kind: "map-scalar", required: false }), format: "gltf" }, width: 8, height: 8,
      imageDecoder: () => ({ width: 1, height: 1, data: new Uint8Array([128, 128, 255, 255]), colorSpace: "linear" }),
      customMaterialFactory: () => custom, shareTextures: false
    });
    try {
      const items = actor.collectRenderItems();
      expect(items).toHaveLength(1);
      expect(items[0]!.material).toBe(custom);
      // Caller-supplied maps are kept, never overwritten by the authored ones.
      expect((custom.getParameter("u_normalTexture") as TextureBinding).texture).toBe(foreignMap);
      expect((custom.getParameter("u_occlusionTexture") as TextureBinding).texture).toBe(foreignMap);
      for (const track of actor.pipeline.asset.animations[0]!.tracks) {
        expect(actor.animation.inspectTrackBinding(track)).toMatchObject({ status: "unavailable", reason: "imported-material-overridden" });
      }
    } finally {
      actor.dispose();
    }
    expect(custom.disposed).toBe(true);
    expect(foreignMap.disposed).toBe(false);
    foreignMap.dispose();
  });

  it("does not claim guarded imported material tracks apply when a texture-free actor draws a custom material", async () => {
    const custom = new PBRMaterial({ name: "override", specularFactor: 0.6, sheenRoughnessFactor: 0.7 });
    const actor = await createTypedGLBActor({
      id: "custom-pointer-material", asset: { url: animatedGltfUrl({ kind: "physical" }), format: "gltf" }, width: 8, height: 8,
      customMaterialFactory: () => custom, shareTextures: false
    });
    try {
      const items = actor.collectRenderItems();
      expect(items).toHaveLength(1);
      expect(items[0]!.material).toBe(custom);
      const imported = actor.pipeline.resources.materialLibrary.get(name)!;
      for (const track of actor.pipeline.asset.animations[0]!.tracks) {
        expect(actor.animation.inspectTrackBinding(track)).toMatchObject({ status: "unavailable", reason: "imported-material-overridden" });
      }
      const result = actor.playClip("surface", 1);
      expect(result.materialTracksApplied).toBe(0);
      expect(result.materialBindingIssues).toContainEqual({ target: specularTarget, reason: "unsupported" });
      expect(result.materialBindingIssues).toContainEqual({ target: sheenTarget, reason: "unsupported" });
      expect(imported.getParameter("u_specularFactor")).toBe(1);
      expect(imported.getParameter("u_sheenRoughnessFactor")).toBe(1);
      expect(custom.getParameter("u_specularFactor")).toBe(0.6);
      expect(custom.getParameter("u_sheenRoughnessFactor")).toBe(0.7);
    } finally {
      actor.dispose();
    }
  });

  it("rejects an unavailable required guarded pointer even when a texture-free custom material is otherwise admissible", async () => {
    const custom = new PBRMaterial({ name: "override" });
    const factory = vi.fn(() => custom);
    try {
      await expect(createTypedGLBActor({
        id: "required-custom-physical-pointer",
        asset: { url: animatedGltfUrl({ kind: "physical", required: true }), format: "gltf" },
        width: 8, height: 8, customMaterialFactory: factory, shareTextures: false
      })).rejects.toMatchObject({
        code: "GLTF_REQUIRED_ANIMATION_POINTER_BINDING_UNAVAILABLE",
        pointer: "/materials/0/extensions/KHR_materials_specular/specularFactor",
        reason: "imported-material-overridden"
      });
      expect(factory).toHaveBeenCalledTimes(1);
      expect(custom.disposed).toBe(true);
    } finally {
      if (!custom.disposed) custom.dispose();
    }
  });

  it("keeps normal and occlusion bindings unsupported when the imported material is overridden", () => {
    const map = texture();
    const imported = new TexturedPBRMaterial({ name, normalTexture: map, occlusionTexture: map });
    const library = new Map<string, Material>([[name, imported]]);
    const resolve = createGLBActorAnimationMaterialResolver({ materialLibrary: library }, source(name), { importedMaterialOverridden: true });
    const scene = new Scene();
    const animation = createGLTFSceneAnimationRuntime({ scene, clips: [clip()], resolveAnimationMaterial: resolve });
    try {
      expect(resolve(name)?.animationParameterAvailability?.("u_normalScale"))
        .toEqual({ status: "unavailable", reason: "imported-material-overridden" });
      const result = animation.applyClipByName("surface", 1);
      expect(result.materialTracksApplied).toBe(0);
      expect(result.materialBindingIssues).toContainEqual({ target: normalTarget, reason: "unsupported" });
      expect(result.materialBindingIssues).toContainEqual({ target: occlusionTarget, reason: "unsupported" });
      expect(imported.getParameter("u_normalScale")).toBe(1);
      expect(imported.getParameter("u_occlusionStrength")).toBe(1);
    } finally {
      animation.dispose();
      scene.dispose();
      imported.dispose();
      map.dispose();
    }
  });

  it("updates every live contract for the source material, including a newly added variant, without touching another actor", () => {
    const map = texture();
    const plain = new TexturedPBRMaterial({ name, normalTexture: map, occlusionTexture: map });
    const skin = new SkinnedLitMaterial({ name, normalTexture: new TextureBinding({ name: "normal", texture: map }), occlusionTexture: new TextureBinding({ name: "occlusion", texture: map }) });
    const otherActor = new TexturedPBRMaterial({ name, normalTexture: map, occlusionTexture: map });
    const library = new Map<string, Material>([[name, plain], [gltfRuntimeMaterialKey(name, { skinned: true }), skin]]);
    const animation = runtime(library);

    const first = animation.applyClipByName("surface", 1);
    expect(first.materialTracksApplied).toBe(2);
    expect(first.missingTargets).toEqual([]);
    for (const material of [plain, skin]) {
      expect(material.getParameter("u_normalScale")).toBeCloseTo(0.25);
      expect(material.getParameter("u_occlusionStrength")).toBeCloseTo(0.5);
    }
    expect(otherActor.getParameter("u_normalScale")).toBe(1);

    const newVariant = new TexturedPBRMaterial({ name, normalTexture: map, occlusionTexture: map });
    library.set(gltfRuntimeMaterialKey(name, { instanced: true }), newVariant);
    expect(animation.applyClipByName("surface", 0.5).materialTracksApplied).toBe(2);
    expect(newVariant.getParameter("u_normalScale")).toBeCloseTo(0.625);
    expect(newVariant.getParameter("u_occlusionStrength")).toBeCloseTo(0.75);
    expect(otherActor.getParameter("u_occlusionStrength")).toBe(1);
    [plain, skin, newVariant, otherActor].forEach((material) => material.dispose());
    map.dispose();
  });

  it("rejects duplicate source definitions and shared objects across different source materials", () => {
    const map = texture();
    const material = new TexturedPBRMaterial({ name, normalTexture: map, occlusionTexture: map });
    const duplicate = runtime(new Map([[name, material]]), source(name, name));
    const duplicateResult = duplicate.applyClipByName("surface", 1);
    expect(duplicateResult.materialTracksApplied).toBe(0);
    expect(duplicateResult.materialBindingIssues).toContainEqual({ target: normalTarget, reason: "ambiguous" });
    expect(material.getParameter("u_normalScale")).toBe(1);

    const shared = runtime(new Map([[name, material], ["other", material]]), source(name, "other"));
    expect(shared.applyClipByName("surface", 1).materialBindingIssues).toContainEqual({ target: occlusionTarget, reason: "ambiguous" });
    expect(material.getParameter("u_occlusionStrength")).toBe(1);
    material.dispose();
    map.dispose();
  });

  it("diagnoses absent, disabled and disposed maps without partially updating sibling materials", () => {
    const map = texture();
    const active = new TexturedPBRMaterial({ name, normalTexture: map, occlusionTexture: map });
    const disabled = new TexturedPBRMaterial({ name, occlusionTexture: map });
    const library = new Map<string, Material>([[name, active], [gltfRuntimeMaterialKey(name, { skinned: true }), disabled]]);
    const animation = runtime(library);
    const disabledResult = animation.applyClipByName("surface", 1);
    expect(disabledResult.materialBindingIssues).toContainEqual({ target: normalTarget, reason: "missing-map" });
    expect(active.getParameter("u_normalScale")).toBe(1);
    expect(disabledResult.materialTracksApplied).toBe(1);

    const absent = createGLBActorAnimationMaterialResolver({ materialLibrary: library }, { materials: [{ name }] })(name);
    expect(absent?.animationParameterStatus?.("u_normalScale")).toBe("missing-map");
    disabled.dispose();
    const disposed = animation.applyClipByName("surface", 1);
    expect(disposed.materialTracksApplied).toBe(0);
    expect(disposed.materialBindingIssues).toContainEqual({ target: occlusionTarget, reason: "disposed" });

    library.delete(gltfRuntimeMaterialKey(name, { skinned: true }));
    map.dispose();
    expect(animation.applyClipByName("surface", 1).materialBindingIssues).toContainEqual({ target: normalTarget, reason: "disposed" });
    active.dispose();
  });

  it("keeps an unsupported shader and a resolver without source identity diagnostic-only", () => {
    const material = new PBRMaterial({ name });
    const library = new Map<string, Material>([[name, material]]);
    const animation = runtime(library);
    expect(animation.applyClipByName("surface", 1).materialBindingIssues).toContainEqual({ target: normalTarget, reason: "unsupported" });
    const withoutIdentity = createGLBActorAnimationMaterialResolver({ materialLibrary: library })(name);
    expect(withoutIdentity?.animationParameterStatus?.("u_normalScale")).toBe("unsupported");
    material.dispose();
  });
});
