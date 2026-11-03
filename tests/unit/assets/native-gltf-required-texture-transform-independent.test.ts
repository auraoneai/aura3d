import { describe, expect, it, vi } from "vitest";
import { Material, Texture, TextureBinding, TexturedPBRMaterial } from "@aura3d/rendering";
import { createGLTFSceneAnimationRuntime } from "../../../packages/assets/src/GLTFAnimationRuntime";
import { GLTFLoader } from "../../../packages/assets/src/GLTFLoader";
import { createGLTFRenderResources } from "../../../packages/assets/src/GLTFRenderResources";
import { LoadContext } from "../../../packages/assets/src/LoadContext";
import { createTypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor";
import { createGLBActorAnimationMaterialResolver } from "../../../packages/engine/src/production-runtime/actor/TypedGLBActorAnimation";
import { registerTypedGLBActorExtension } from "../../../packages/engine/src/production-runtime/actor/extensions";

type Leaf = "offset" | "scale" | "rotation";
type Target = { readonly path: string; readonly leaf: Leaf; readonly interpolation?: "LINEAR" | "STEP" | "CUBICSPLINE"; readonly values?: readonly number[] };
const slots = [
  ["pbrMetallicRoughness/baseColorTexture", "baseColor"],
  ["pbrMetallicRoughness/metallicRoughnessTexture", "metallicRoughness"],
  ["normalTexture", "normal"],
  ["occlusionTexture", "occlusion"],
  ["emissiveTexture", "emissive"]
] as const;
const leaves: readonly Leaf[] = ["offset", "scale", "rotation"];
const name = "Paint.body.v1";
const transformSuffix = "/extensions/KHR_texture_transform/";
const pointer = (path: string, leaf: string) => `/materials/0/${path}${transformSuffix}${leaf}`;
const publicTarget = (path: string, leaf: string) => `material:${name}.${path.replaceAll("/", ".")}.extensions.KHR_texture_transform.${leaf}`;

/**
 * Independently authored glTF: binary accessors, textureInfo objects, mesh,
 * optional skin and pointer channels are constructed without either exporter.
 */
function document(options: {
  readonly required?: boolean;
  readonly targets?: readonly Target[];
  readonly times?: readonly number[];
  readonly skinned?: boolean;
  readonly unlit?: boolean;
  readonly extraSlots?: readonly string[];
  readonly infoTexCoord?: number;
  readonly transformTexCoord?: number;
} = {}): Record<string, any> {
  const targets: readonly Target[] = options.targets ?? slots.flatMap(([path]) => leaves.map((leaf) => ({ path, leaf })));
  const views: Record<string, number>[] = [];
  const accessors: Record<string, unknown>[] = [];
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  const add = (values: readonly number[], type: "SCALAR" | "VEC2" | "VEC3" | "VEC4", componentType = 5126): number => {
    const data = componentType === 5121 ? new Uint8Array(values) : new Uint8Array(new Float32Array(values).buffer);
    const padding = (4 - byteLength % 4) % 4;
    if (padding) { chunks.push(new Uint8Array(padding)); byteLength += padding; }
    const bufferView = views.push({ buffer: 0, byteOffset: byteLength, byteLength: data.byteLength }) - 1;
    chunks.push(data);
    byteLength += data.byteLength;
    const width = type === "SCALAR" ? 1 : Number(type.slice(-1));
    return accessors.push({ bufferView, componentType, type, count: values.length / width }) - 1;
  };
  const position = add([0, 0, 0, 1, 0, 0, 0, 1, 0], "VEC3");
  Object.assign(accessors[position]!, { min: [0, 0, 0], max: [1, 1, 0] });
  const normal = add([0, 0, 1, 0, 0, 1, 0, 0, 1], "VEC3");
  const uv = add([0, 0, 1, 0, 0, 1], "VEC2");
  const uv1 = add([0.1, 0.1, 0.9, 0.1, 0.1, 0.9], "VEC2");
  const joints = options.skinned ? add(new Array<number>(12).fill(0), "VEC4", 5121) : undefined;
  const weights = options.skinned ? add([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], "VEC4") : undefined;
  const time = add(options.times ?? [0, 1], "SCALAR");
  const samplers: Record<string, unknown>[] = [];
  const channels: Record<string, unknown>[] = [];
  for (const target of targets) {
    const values = target.values ?? (target.leaf === "rotation" ? [0, 0.8]
      : target.leaf === "scale" ? [1, 1, 2, 3] : [0, 0, 0.2, 0.4]);
    const output = add(values, target.leaf === "rotation" ? "SCALAR" : "VEC2");
    const sampler = samplers.push({ input: time, output, interpolation: target.interpolation ?? "LINEAR" }) - 1;
    channels.push({ sampler, target: { path: "pointer", extensions: { KHR_animation_pointer: {
      pointer: pointer(target.path, target.leaf)
    } } } });
  }
  const material: Record<string, any> = { name };
  for (const path of new Set([...targets.map((target) => target.path), ...(options.extraSlots ?? [])])) {
    const parts = path.split("/");
    let parent = material;
    for (const part of parts.slice(0, -1)) parent = parent[part] ??= {};
    parent[parts.at(-1)!] = {
      index: 0,
      ...(options.infoTexCoord === undefined ? {} : { texCoord: options.infoTexCoord }),
      extensions: { KHR_texture_transform: {
        offset: [0, 0], scale: [1, 1], rotation: 0,
        ...(options.transformTexCoord === undefined ? {} : { texCoord: options.transformTexCoord })
      } }
    };
  }
  if (options.unlit) (material.extensions ??= {}).KHR_materials_unlit = {};
  const extensionNames = targets.flatMap(({ path }) => path.startsWith("extensions/") ? [path.split("/")[1]!] : []);
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const attributes: Record<string, number> = { POSITION: position, NORMAL: normal, TEXCOORD_0: uv, TEXCOORD_1: uv1, TEXCOORD_2: uv1 };
  if (joints !== undefined && weights !== undefined) { attributes.JOINTS_0 = joints; attributes.WEIGHTS_0 = weights; }
  return {
    asset: { version: "2.0" },
    extensionsUsed: [...new Set(["KHR_animation_pointer", "KHR_texture_transform", ...extensionNames, ...(options.unlit ? ["KHR_materials_unlit"] : [])])],
    ...(options.required === false ? {} : { extensionsRequired: ["KHR_animation_pointer"] }),
    buffers: [{ uri: `data:application/octet-stream;base64,${Buffer.from(bytes).toString("base64")}`, byteLength }],
    bufferViews: views,
    accessors,
    images: [{ uri: "data:image/png;base64,AA==" }],
    textures: [{ source: 0 }],
    materials: [material],
    meshes: [{ primitives: [{ attributes, material: 0 }] }],
    nodes: options.skinned ? [{ name: "mesh", mesh: 0, skin: 0 }, { name: "joint" }] : [{ name: "mesh", mesh: 0 }],
    ...(options.skinned ? { skins: [{ joints: [1] }] } : {}),
    scenes: [{ nodes: options.skinned ? [0, 1] : [0] }], scene: 0,
    animations: [{ name: "uv", samplers, channels }]
  };
}

const url = (doc: Record<string, any>) => `data:model/gltf+json,${encodeURIComponent(JSON.stringify(doc))}`;
const load = (doc: Record<string, any>) => new GLTFLoader().load({ url: url(doc), type: "gltf" }, new LoadContext());
const imageDecoder = () => ({ width: 1, height: 1, data: new Uint8Array([64, 128, 192, 255]) });
const actor = (doc: Record<string, any>, id: string, decoder = imageDecoder) => createTypedGLBActor({
  id, asset: { url: url(doc), format: "gltf" }, width: 8, height: 8, shareTextures: false, imageDecoder: decoder
});
const one = (path: string, leaf: Leaf): Target[] => [{ path, leaf }];

describe("independent required glTF texture-transform pointers", () => {
  it("loads all 15 core channels with immutable source/image provenance and drives real actor material uniforms", async () => {
    const doc = document();
    const source = await load(doc);
    const tracks = source.animations[0]!.tracks;
    expect(tracks).toHaveLength(15);
    expect(source.requiredTextureAnimationTargets).toHaveLength(15);
    expect(Object.isFrozen(source.requiredTextureAnimationTargets)).toBe(true);
    expect(Object.isFrozen(source.requiredTextureAnimationTargets![0])).toBe(true);
    expect(Reflect.set(source, "requiredTextureAnimationTargets", [])).toBe(false);
    for (const [index, track] of tracks.entries()) {
      const [path] = slots[Math.floor(index / 3)]!;
      const leaf = leaves[index % 3]!;
      expect(track).toMatchObject({ target: publicTarget(path, leaf), valueType: leaf === "rotation" ? "scalar" : "number-array", valueSize: leaf === "rotation" ? 1 : 2 });
      expect(source.animationPointerForTrack?.(track)).toEqual({ animationIndex: 0, channelIndex: index, pointer: pointer(path, leaf), required: true });
      expect(source.requiredTextureAnimationTargets![index]).toEqual({
        clipName: "uv", target: track.target, materialIndex: 0, materialName: name, textureIndex: 0, imageIndex: 0
      });
    }
    const first = await actor(doc, "required-uv-first");
    const second = await actor(doc, "required-uv-second");
    try {
      const actorTracks = first.pipeline.asset.animations[0]!.tracks;
      expect(actorTracks.every((track) => first.animation.inspectTrackBinding(track).status === "available")).toBe(true);
      expect(first.playClip("uv", 0.5)).toMatchObject({ materialTracksApplied: 15, missingTargets: [] });
      const material = first.pipeline.resources.materialLibrary.get(name)!;
      const other = second.pipeline.resources.materialLibrary.get(name)!;
      for (const [, slot] of slots) {
        expect(material.getParameter(`u_${slot}TextureOffset`)).toEqual([expect.closeTo(0.1), expect.closeTo(0.2)]);
        expect(material.getParameter(`u_${slot}TextureScale`)).toEqual([1.5, 2]);
        expect(material.getParameter(`u_${slot}TextureRotation`)).toBeCloseTo(0.4);
        expect(other.getParameter(`u_${slot}TextureOffset`)).toEqual([0, 0]);
      }
    } finally {
      first.dispose();
      second.dispose();
      new GLTFLoader().dispose(source);
    }
  });

  it.each([
    { leaf: "offset" as const, interpolation: "CUBICSPLINE" as const, values: [0, 0, 1, -1, 1, -0.5, -1, 2, 3, 5, 0, 0], expected: [2.5, 1.375] },
    { leaf: "scale" as const, interpolation: "STEP" as const, values: [1, 2, 3, 4], expected: [1, 2] },
    { leaf: "rotation" as const, interpolation: "CUBICSPLINE" as const, values: [0, 0.25, 0.5, -0.25, 1.75, 0], expected: 1.1875 }
  ])("preserves $interpolation sampler values and tangents for required $leaf", async ({ leaf, interpolation, values, expected }) => {
    const doc = document({ targets: [{ path: "normalTexture", leaf, interpolation, values }], times: [0, 2] });
    const source = await load(doc);
    const track = source.animations[0]!.tracks[0]!;
    expect(track.sample(1)).toEqual(expected);
    const instance = await actor(doc, `required-${interpolation}-${leaf}`);
    try {
      expect(instance.playClip("uv", 1)).toMatchObject({ materialTracksApplied: 1, missingTargets: [] });
      expect(instance.pipeline.resources.materialLibrary.get(name)!.getParameter(
        `u_normalTexture${leaf[0]!.toUpperCase()}${leaf.slice(1)}`
      )).toEqual(expected);
    } finally {
      instance.dispose();
      new GLTFLoader().dispose(source);
    }
  });

  it("retains optional pointer behavior and does not make optional images strict", async () => {
    const doc = document({ required: false, targets: one("normalTexture", "offset") });
    const source = await load(doc);
    const track = source.animations[0]!.tracks[0]!;
    expect(source.animationPointerForTrack?.(track)?.required).toBe(false);
    expect(source.requiredTextureAnimationTargets).toBeUndefined();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const instance = await actor(doc, "optional-uv-decode-failure", () => { throw new Error("broken image"); });
      try {
        expect(instance.playClip("uv", 1)).toMatchObject({ materialTracksApplied: 0, missingTargets: [track.target] });
      } finally { instance.dispose(); }
    } finally {
      warn.mockRestore();
      new GLTFLoader().dispose(source);
    }
  });

  it.each([
    "extensions/KHR_materials_clearcoat/clearcoatTexture",
    "extensions/KHR_materials_transmission/transmissionTexture",
    "extensions/KHR_materials_sheen/sheenColorTexture"
  ])("does not admit required %s transforms that lack an actor runtime binding", async (path) => {
    const required = document({ targets: one(path, "offset") });
    await expect(load(required)).rejects.toThrow(/unsupported required animation pointer/);
    const optional = await load(document({ required: false, targets: one(path, "offset") }));
    try {
      expect(optional.animations[0]!.tracks[0]!.target).toBe(publicTarget(path, "offset"));
      const instance = await actor(document({ required: false, targets: one(path, "offset") }), `optional-${path}`);
      try {
        expect(instance.playClip("uv", 1)).toMatchObject({
          materialTracksApplied: 0, materialBindingIssues: [{ target: publicTarget(path, "offset"), reason: "unsupported" }]
        });
      } finally { instance.dispose(); }
    } finally { new GLTFLoader().dispose(optional); }
  });

  it("requires the transform extension and an actual authored target without changing optional diagnostics", async () => {
    const path = "normalTexture";
    const undeclared = document({ targets: one(path, "offset") });
    undeclared.extensionsUsed = ["KHR_animation_pointer"];
    await expect(load(undeclared)).rejects.toThrow(/unsupported required animation pointer/);
    delete undeclared.extensionsRequired;
    const optionalUndeclared = await load(undeclared);
    expect(optionalUndeclared.animations[0]!.tracks).toHaveLength(1);
    new GLTFLoader().dispose(optionalUndeclared);

    for (const missing of ["texture", "extension", "offset", "scale", "rotation"] as const) {
      const leaf = missing === "scale" ? "scale" : missing === "rotation" ? "rotation" : "offset";
      const doc = document({ targets: one(path, leaf) });
      if (missing === "texture") delete doc.materials[0].normalTexture;
      else if (missing === "extension") delete doc.materials[0].normalTexture.extensions;
      else delete doc.materials[0].normalTexture.extensions.KHR_texture_transform[missing];
      await expect(load(doc)).rejects.toThrow(/unsupported required animation pointer/);
      delete doc.extensionsRequired;
      const optional = await load(doc);
      expect(optional.animations[0]!.tracks).toEqual([]);
      expect(optional.loaderDiagnostics.unsupportedFeatures).toContain(`animation-pointer-missing-target:${pointer(path, leaf)}`);
      new GLTFLoader().dispose(optional);
    }
  });

  it.each([
    "/materials/00/normalTexture/extensions/KHR_texture_transform/offset",
    "/materials/0/normalTexture/extensions/KHR_texture_transform/texCoord",
    "/materials/0/normalTexture/extensions/KHR_texture_transform/offset/0",
    "/materials/0/notATexture/extensions/KHR_texture_transform/offset"
  ])("rejects malformed or unsupported required pointer %s", async (bad) => {
    const doc = document({ targets: one("normalTexture", "offset") });
    doc.animations[0].channels[0].target.extensions.KHR_animation_pointer.pointer = bad;
    await expect(load(doc)).rejects.toThrow(/unsupported required animation pointer/);
  });

  it("rejects duplicate material identities and spec/gloss or unlit slots that use a different source", async () => {
    const duplicate = document({ targets: one("normalTexture", "rotation") });
    duplicate.materials.push({ name });
    await expect(load(duplicate)).rejects.toThrow(/unsupported required animation pointer/);
    const unlit = document({ unlit: true, targets: one("normalTexture", "rotation") });
    await expect(load(unlit)).rejects.toThrow(/unsupported required animation pointer/);
    const specGloss = document({ targets: one("pbrMetallicRoughness/baseColorTexture", "offset") });
    specGloss.extensionsUsed.push("KHR_materials_pbrSpecularGlossiness");
    specGloss.materials[0].extensions = { KHR_materials_pbrSpecularGlossiness: {} };
    await expect(load(specGloss)).rejects.toThrow(/unsupported required animation pointer/);
  });

  it.each([
    { mutate: (doc: Record<string, any>) => { doc.accessors[doc.animations[0].samplers[0].input].type = "VEC2"; }, error: /float SCALAR input/ },
    { mutate: (doc: Record<string, any>) => { doc.accessors[doc.animations[0].samplers[0].input].componentType = 5123; }, error: /float SCALAR input/ },
    { mutate: (doc: Record<string, any>) => { doc.accessors[doc.animations[0].samplers[0].input].normalized = true; }, error: /float SCALAR input/ },
    { mutate: (doc: Record<string, any>) => { doc.accessors[doc.animations[0].samplers[0].output].type = "SCALAR"; }, error: /float VEC2 output/ },
    { mutate: (doc: Record<string, any>) => { doc.accessors[doc.animations[0].samplers[0].output].normalized = true; }, error: /float VEC2 output/ },
    { mutate: (doc: Record<string, any>) => { doc.accessors[doc.animations[0].samplers[0].output].componentType = 5123; }, error: /float VEC2 output/ },
    { mutate: (doc: Record<string, any>) => { doc.accessors[doc.animations[0].samplers[0].output].count = 1; }, error: /input\/output count mismatch/ }
  ])("rejects invalid required accessor descriptors", async ({ mutate, error }) => {
    const doc = document({ targets: one("normalTexture", "offset") });
    mutate(doc);
    await expect(load(doc)).rejects.toThrow(error);
  });

  it("requires scalar float output for rotation and validates cubic tangent values", async () => {
    const wrongShape = document({ targets: one("normalTexture", "rotation") });
    wrongShape.accessors[wrongShape.animations[0].samplers[0].output].type = "VEC4";
    await expect(load(wrongShape)).rejects.toThrow(/float SCALAR output/);
    const integer = document({ targets: one("normalTexture", "rotation") });
    integer.accessors[integer.animations[0].samplers[0].output].componentType = 5123;
    await expect(load(integer)).rejects.toThrow(/float SCALAR output/);
    const cubic = document({ targets: [{
      path: "normalTexture", leaf: "rotation", interpolation: "CUBICSPLINE",
      values: [0, 0.25, Number.NaN, -0.25, 1, 0]
    }] });
    await expect(load(cubic)).rejects.toThrow(/finite scalar values and tangents/);
  });

  it.each([
    { times: [0, 0], values: [0, 0, 1, 1], error: /strictly increasing input times/ },
    { times: [0, Number.NaN], values: [0, 0, 1, 1], error: /strictly increasing input times/ },
    { times: [-1, 1], values: [0, 0, 1, 1], error: /strictly increasing input times/ },
    { times: [0, 1], values: [0, 0, 1, Number.NaN], error: /finite values and tangents/ },
    { times: [0, 1], values: [0, 0, 1, 1], interpolation: "CUBICSPLINE" as const, error: /CUBICSPLINE output count/ }
  ])("rejects corrupt required sampler data before track creation", async ({ times, values, interpolation, error }) => {
    await expect(load(document({ times, targets: [{ path: "normalTexture", leaf: "offset", values, interpolation }] }))).rejects.toThrow(error);
  });

  it("uses transform texCoord precedence, supports PBR UV1 and rejects UV sets the runtime cannot sample", async () => {
    const target = one("normalTexture", "offset");
    const pbrUv1 = document({ targets: target, infoTexCoord: 0, transformTexCoord: 1 });
    const source = await load(pbrUv1);
    expect(source.materials[0]!.normalTexture?.texCoord).toBe(1);
    const instance = await actor(pbrUv1, "required-normal-uv1");
    try {
      const material = instance.pipeline.resources.materialLibrary.get(name)!;
      expect(material.getParameter("u_normalTextureTexCoord")).toBe(1);
      expect(instance.playClip("uv", 1).materialTracksApplied).toBe(1);
    } finally {
      instance.dispose();
      new GLTFLoader().dispose(source);
    }
    await expect(load(document({ targets: target, transformTexCoord: 2 }))).rejects.toThrow(/unsupported required animation pointer/);
    await expect(load(document({ unlit: true, targets: one("pbrMetallicRoughness/baseColorTexture", "offset"), transformTexCoord: 1 })))
      .rejects.toThrow(/unsupported required animation pointer/);
  });

  it("records the selected image source, including an image shared by another texture alias", async () => {
    const doc = document({ targets: one("normalTexture", "offset") });
    doc.images.push({ uri: "data:image/webp;base64,AQ==" });
    doc.extensionsUsed.push("EXT_texture_webp");
    doc.textures = [{ source: 1 }, { source: 0, extensions: { EXT_texture_webp: { source: 1 } } }];
    doc.materials[0].normalTexture.index = 1;
    doc.materials.unshift({ name: "alias", normalTexture: { index: 0 } });
    doc.meshes[0].primitives[0].material = 1;
    doc.animations[0].channels[0].target.extensions.KHR_animation_pointer.pointer =
      "/materials/1/normalTexture/extensions/KHR_texture_transform/offset";
    const source = await load(doc);
    expect(source.requiredTextureAnimationTargets).toMatchObject([{ materialIndex: 1, textureIndex: 1, imageIndex: 1 }]);
    const decoder = vi.fn(() => { throw new Error("decode failed"); });
    await expect(createGLTFRenderResources(source, { imageDecoder: decoder })).rejects.toMatchObject({
      name: "GLTFTextureLoadError", issue: { imageIndex: 1, fallback: false }
    });
    expect(decoder).toHaveBeenCalledTimes(1);
    new GLTFLoader().dispose(source);
  });

  it("keeps unrelated image failures as fallbacks while the required source image succeeds", async () => {
    const doc = document({ targets: one("normalTexture", "offset") });
    doc.images.push({ uri: "data:image/png;base64,AQ==" });
    doc.textures.push({ source: 1 });
    doc.materials.push({ name: "unrelated", normalTexture: { index: 1 } });
    const source = await load(doc);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const resources = await createGLTFRenderResources(source, { imageDecoder: (_image, imageIndex) => {
        if (imageIndex === 1) throw new Error("unrelated failure");
        return imageDecoder();
      } });
      expect(resources.loadIssues).toContainEqual(expect.objectContaining({
        code: "texture-load-failed", imageIndex: 1, fallback: true
      }));
      const textures = [...resources.textureLibrary.values()];
      expect(textures.length).toBeGreaterThan(0);
      resources.dispose();
      expect(textures.every((texture) => texture.disposed)).toBe(true);
    } finally {
      warn.mockRestore();
      new GLTFLoader().dispose(source);
    }
  });

  it("rejects a final required image decode failure rather than accepting its fallback", async () => {
    const doc = document({ targets: one("normalTexture", "offset") });
    await expect(actor(doc, "required-uv-decode-failure", () => { throw new Error("decode failed"); })).rejects.toMatchObject({
      name: "GLTFTextureLoadError", issue: { imageIndex: 0, fallback: false }
    });
  });

  it.each(["not-ready", "unassigned", "disabled"] as const)("does not reject a %s lazy actor texture before its source binding returns", async (state) => {
    const doc = document({ targets: one("normalTexture", "offset") });
    let material: Material | undefined;
    let original: TextureBinding | undefined;
    const unregister = registerTypedGLBActorExtension({
      id: "test.required-uv-pending", owner: "test",
      onLoad(instance) {
        material = instance.pipeline.resources.materialLibrary.get(name)!;
        original = material.getParameter("u_normalTexture") as TextureBinding;
        if (state === "disabled") material.setParameter("u_normalTextureEnabled", 0);
        else material.setParameter("u_normalTexture", new TextureBinding({
          name: "u_normalTexture", texture: state === "unassigned" ? null : original.texture,
          sampler: original.sampler, ready: state !== "not-ready"
        }));
        const track = instance.pipeline.asset.animations[0]!.tracks[0]!;
        expect(instance.animation.inspectTrackBinding(track)).toMatchObject({
          status: state === "not-ready" ? "pending" : "unknown", reason: "missing-map"
        });
      }
    });
    let instance: Awaited<ReturnType<typeof actor>> | undefined;
    try {
      instance = await actor(doc, `required-uv-${state}`);
      unregister();
      expect(instance.playClip("uv", 1)).toMatchObject({ materialTracksApplied: 0 });
      material!.setParameter("u_normalTexture", original!);
      material!.setParameter("u_normalTextureEnabled", 1);
      expect(instance.animation.inspectTrackBinding(instance.pipeline.asset.animations[0]!.tracks[0]!)).toMatchObject({ status: "available" });
      expect(instance.playClip("uv", 1)).toMatchObject({ materialTracksApplied: 1, missingTargets: [] });
    } finally {
      unregister();
      instance?.dispose();
    }
  });

  it("admits a lazy binding becoming ready only for the same captured texture and sampler", async () => {
    const source = await load(document({ targets: one("normalTexture", "offset") }));
    const texture = new Texture({ width: 1, height: 1, data: new Uint8Array([128, 128, 255, 255]) });
    const material = new TexturedPBRMaterial({ name, normalTexture: texture });
    const original = material.getParameter("u_normalTexture") as TextureBinding;
    const pending = new TextureBinding({ name: "u_normalTexture", texture, sampler: original.sampler, ready: false });
    material.setParameter("u_normalTexture", pending);
    const scene = source.createScene();
    const runtime = createGLTFSceneAnimationRuntime({ scene, asset: source, clips: source.animations,
      resolveAnimationMaterial: createGLBActorAnimationMaterialResolver({ materialLibrary: new Map([[name, material]]) }, source) });
    try {
      const track = source.animations[0]!.tracks[0]!;
      expect(runtime.inspectTrackBinding(track)).toMatchObject({ status: "pending" });
      material.setParameter("u_normalTexture", new TextureBinding({ name: "u_normalTexture", texture, sampler: original.sampler }));
      expect(runtime.inspectTrackBinding(track)).toMatchObject({ status: "available" });
      expect(runtime.applyClipByName("uv", 1)).toMatchObject({ materialTracksApplied: 1, missingTargets: [] });
      expect(material.getParameter("u_normalTextureOffset")).toEqual([expect.closeTo(0.2), expect.closeTo(0.4)]);
    } finally {
      runtime.dispose(); scene.dispose(); material.dispose(); texture.dispose(); new GLTFLoader().dispose(source);
    }
  });

  it("keeps an unassigned lazy texture pending but does not trust an unverified later map", async () => {
    const source = await load(document({ targets: one("normalTexture", "offset") }));
    const texture = new Texture({ width: 1, height: 1, data: new Uint8Array([128, 128, 255, 255]) });
    const material = new TexturedPBRMaterial({ name, normalTexture: texture });
    const original = material.getParameter("u_normalTexture") as TextureBinding;
    material.setParameter("u_normalTexture", new TextureBinding({
      name: "u_normalTexture", texture: null, sampler: original.sampler, ready: false
    }));
    const scene = source.createScene();
    const runtime = createGLTFSceneAnimationRuntime({ scene, asset: source, clips: source.animations,
      resolveAnimationMaterial: createGLBActorAnimationMaterialResolver({ materialLibrary: new Map([[name, material]]) }, source) });
    try {
      const track = source.animations[0]!.tracks[0]!;
      expect(runtime.inspectTrackBinding(track)).toMatchObject({ status: "pending" });
      material.setParameter("u_normalTexture", original);
      expect(runtime.inspectTrackBinding(track)).toMatchObject({ status: "unavailable", reason: "changed-map" });
      expect(runtime.applyClipByName("uv", 1)).toMatchObject({
        materialTracksApplied: 0, materialBindingIssues: [{ target: track.target, reason: "changed-map" }]
      });
    } finally {
      runtime.dispose(); scene.dispose(); material.dispose(); texture.dispose(); new GLTFLoader().dispose(source);
    }
  });

  it("rejects a ready replacement for a required source map instead of claiming a successful binding", async () => {
    const doc = document({ targets: one("normalTexture", "offset") });
    const replacement = new Texture({ width: 1, height: 1, data: new Uint8Array([1, 2, 3, 255]) });
    const unregister = registerTypedGLBActorExtension({
      id: "test.required-uv-replacement", owner: "test",
      onLoad(instance) {
        const material = instance.pipeline.resources.materialLibrary.get(name)!;
        const original = material.getParameter("u_normalTexture") as TextureBinding;
        material.setParameter("u_normalTexture", new TextureBinding({ name: "u_normalTexture", texture: replacement, sampler: original.sampler }));
      }
    });
    try {
      await expect(actor(doc, "required-uv-replaced")).rejects.toMatchObject({
        code: "GLTF_REQUIRED_ANIMATION_POINTER_BINDING_UNAVAILABLE",
        pointer: pointer("normalTexture", "offset"), reason: "changed-map"
      });
    } finally { unregister(); replacement.dispose(); }
  });

  it("rejects a required target when another source material aliases the same mutable runtime material", async () => {
    const doc = document({ targets: one("normalTexture", "offset") });
    const unregister = registerTypedGLBActorExtension({
      id: "test.required-uv-ambiguous", owner: "test",
      onLoad(instance) {
        const library = instance.pipeline.resources.materialLibrary as Map<string, Material>;
        library.set("unrelated-source", library.get(name)!);
      }
    });
    try {
      await expect(actor(doc, "required-uv-ambiguous")).rejects.toMatchObject({
        code: "GLTF_REQUIRED_ANIMATION_POINTER_BINDING_UNAVAILABLE",
        pointer: pointer("normalTexture", "offset"), reason: "ambiguous"
      });
    } finally { unregister(); }
  });

  it("supports a skinned base map only where the shader can preserve the authored slot and UV set", async () => {
    const base = "pbrMetallicRoughness/baseColorTexture";
    const supported = await actor(document({ skinned: true, targets: one(base, "offset") }), "required-skinned-base");
    try {
      expect(supported.playClip("uv", 1)).toMatchObject({ materialTracksApplied: 1, missingTargets: [] });
    } finally { supported.dispose(); }
    await expect(actor(document({ skinned: true, targets: one("normalTexture", "offset") }), "required-skinned-normal"))
      .rejects.toMatchObject({ code: "GLTF_REQUIRED_ANIMATION_POINTER_BINDING_UNAVAILABLE", reason: "unsupported" });
    await expect(actor(document({ skinned: true, targets: one(base, "offset"), transformTexCoord: 1 }), "required-skinned-uv1"))
      .rejects.toMatchObject({ code: "GLTF_REQUIRED_ANIMATION_POINTER_BINDING_UNAVAILABLE", reason: "unsupported" });
    await expect(actor(document({ skinned: true, targets: one(base, "offset"), extraSlots: ["normalTexture"] }), "required-skinned-shared-uv"))
      .rejects.toMatchObject({ code: "GLTF_REQUIRED_ANIMATION_POINTER_BINDING_UNAVAILABLE", reason: "unsupported" });
  });

  it("applies required base-color transforms through the real unlit actor shader contract", async () => {
    const base = "pbrMetallicRoughness/baseColorTexture";
    const doc = document({ unlit: true, infoTexCoord: 1, transformTexCoord: 0, targets: leaves.map((leaf) => ({ path: base, leaf })) });
    const instance = await actor(doc, "required-unlit-base");
    try {
      expect(instance.pipeline.asset.materials[0]!.baseColorTexture?.texCoord).toBe(0);
      const material = instance.pipeline.resources.materialLibrary.get(name)!;
      expect(material.shaderKey).toBe("aura3d/textured-unlit");
      expect(instance.playClip("uv", 0.5)).toMatchObject({ materialTracksApplied: 3, missingTargets: [] });
      expect(material.getParameter("u_baseColorTextureOffset")).toEqual([expect.closeTo(0.1), expect.closeTo(0.2)]);
      expect(material.getParameter("u_baseColorTextureScale")).toEqual([1.5, 2]);
      expect(material.getParameter("u_baseColorTextureRotation")).toBeCloseTo(0.4);
    } finally { instance.dispose(); }
  });
});
