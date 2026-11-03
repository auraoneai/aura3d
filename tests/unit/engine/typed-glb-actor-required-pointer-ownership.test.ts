import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnimationClip } from "@aura3d/animation";
import { Material, Texture, TextureBinding } from "@aura3d/rendering";
import { createGLTFSceneAnimationRuntime } from "../../../packages/assets/src/GLTFAnimationRuntime";
import { GLTFLoader } from "../../../packages/assets/src/GLTFLoader";
import { snapshotParsedGLTFAssetCache } from "../../../packages/assets/src/GLTFAssetParseCache";
import { GLTFSharedTextureCache } from "../../../packages/assets/src/GLTFSharedTextureCache";
import { createGLTFFormatAdapter, FormatRegistry } from "../../../packages/assets/src/FormatRegistry";
import { LoadContext } from "../../../packages/assets/src/LoadContext";
import { sceneFromGLTFAsset } from "../../../packages/assets/src/exporters/ExportContext";
import { exportGLTF } from "../../../packages/assets/src/exporters/GLTFExporter";
import {
  awaitTypedGLBActorDisposals,
  createTypedGLBActor,
  liveTypedGLBActor,
  type TypedGLBActor,
  type TypedGLBActorOptions
} from "../../../packages/engine/src/production-runtime/TypedGLBActor";
import { glbResourceCache } from "../../../packages/engine/src/production-runtime/GlbResourceCache";
import { sharedModelTextures } from "../../../packages/engine/src/production-runtime/actor/ModelTextureShare";
import { registerTypedGLBActorExtension } from "../../../packages/engine/src/production-runtime/actor/extensions";

// A real required pointer can resolve to a glTF node that is absent from the
// selected scene. Parsing succeeds, but the actor's binding diagnostics then
// report that target missing after its render resources have been allocated.
function documentWithPointer(pointer: string): string {
  const materialPointer = pointer.startsWith("/materials/");
  const chunks = [
    new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    new Float32Array([0, 0, 1, 0, 0, 1]),
    new Float32Array([0, 1]),
    new Float32Array(materialPointer ? [0.2, 0.8] : [0, 0, 0, 2, 3, 4])
  ];
  let length = 0;
  const bufferViews = chunks.map((chunk) => {
    const view = { buffer: 0, byteOffset: length, byteLength: chunk.byteLength };
    length += chunk.byteLength;
    return view;
  });
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(new Uint8Array(chunk.buffer), offset);
    offset += chunk.byteLength;
  }
  return JSON.stringify({
    asset: { version: "2.0" },
    extensionsUsed: ["KHR_animation_pointer", ...(materialPointer ? ["KHR_materials_specular"] : [])],
    extensionsRequired: ["KHR_animation_pointer"],
    buffers: [{ uri: `data:application/octet-stream;base64,${Buffer.from(bytes).toString("base64")}`, byteLength: bytes.length }],
    bufferViews,
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 2, componentType: 5126, count: 3, type: "VEC2" },
      { bufferView: 3, componentType: 5126, count: 2, type: "SCALAR" },
      { bufferView: 4, componentType: 5126, count: 2, type: materialPointer ? "SCALAR" : "VEC3" }
    ],
    images: [{ uri: "data:image/png;base64,AA==" }],
    textures: [{ source: 0 }],
    materials: [
      { name: "Paint", ...(materialPointer ? { extensions: { KHR_materials_specular: { specularFactor: 0.2 } } } : {}) },
      { name: "UnusedTexture", pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, material: 0 }] }],
    nodes: [{ name: "Visible", mesh: 0 }, { name: "Orphan" }],
    scenes: [{ nodes: [0] }],
    scene: 0,
    animations: [{
      name: "motion",
      samplers: [{ input: 3, output: 4 }],
      channels: [{ sampler: 0, target: { path: "pointer", extensions: { KHR_animation_pointer: { pointer } } } }]
    }]
  });
}

function mixedNodeChannels(pointerNode: 0 | 1, required: boolean): string {
  const document = JSON.parse(documentWithPointer(`/nodes/${pointerNode}/translation`)) as {
    extensionsRequired?: string[];
    animations: Array<{ channels: Array<{ sampler: number; target: unknown }> }>;
  };
  if (!required) delete document.extensionsRequired;
  document.animations[0]!.channels = ([0, 1] as const).map((node) => ({
    sampler: 0,
    target: node === pointerNode
      ? { path: "pointer", extensions: { KHR_animation_pointer: { pointer: `/nodes/${node}/translation` } } }
      : { node, path: "translation" }
  }));
  return JSON.stringify(document);
}

function documentWithNormalPointer(required = true): string {
  const doc = JSON.parse(documentWithPointer("/materials/0/normalTexture/scale")) as {
    extensionsRequired?: string[];
    materials: Array<{ normalTexture?: { index: number } }>;
  };
  if (!required) delete doc.extensionsRequired;
  doc.materials[0]!.normalTexture = { index: 0 };
  return JSON.stringify(doc);
}

function documentWithLightPointer(lightNode: 0 | 1, required = true): string {
  const doc = JSON.parse(documentWithPointer("/extensions/KHR_lights_punctual/lights/0/intensity")) as {
    extensionsUsed: string[];
    extensionsRequired?: string[];
    extensions?: object;
    accessors: Array<{ type: string }>;
    nodes: Array<{ extensions?: object }>;
  };
  if (!required) delete doc.extensionsRequired;
  doc.extensionsUsed.push("KHR_lights_punctual");
  doc.extensions = { KHR_lights_punctual: { lights: [{ name: "Lamp", type: "point", intensity: 1 }] } };
  doc.accessors[4]!.type = "SCALAR";
  doc.nodes[lightNode]!.extensions = { KHR_lights_punctual: { light: 0 } };
  return JSON.stringify(doc);
}

function documentWithMorphPointer(node: 0 | 1): string {
  const doc = JSON.parse(documentWithPointer(`/nodes/${node}/weights`)) as {
    accessors: Array<{ type: string }>;
    nodes: Array<{ mesh?: number }>;
    meshes: Array<{ weights?: number[]; primitives: Array<{ targets?: Array<{ POSITION: number }> }> }>;
  };
  doc.accessors[4]!.type = "SCALAR";
  doc.nodes[1]!.mesh = 0;
  doc.meshes[0]!.weights = [0];
  doc.meshes[0]!.primitives[0]!.targets = [{ POSITION: 0 }];
  return JSON.stringify(doc);
}

const url = "https://fixture.invalid/required-pointer-ownership.gltf";
const actors: TypedGLBActor[] = [];
const unregisterExtensions: Array<() => void> = [];
const closeImage = vi.fn();
const imageDecoder = vi.fn(() => ({
  width: 1,
  height: 1,
  source: { width: 1, height: 1, close: closeImage } as unknown as TexImageSource
}));
let document: string;
let initialCacheKeys: Set<string>;
const fetchDocument = vi.fn(async (input: RequestInfo | URL) => {
  if (String(input) !== url) throw new Error(`Unexpected fetch: ${String(input)}`);
  return new Response(document, { status: 200 });
});

beforeEach(() => {
  document = documentWithPointer("/nodes/1/translation");
  initialCacheKeys = new Set(glbResourceCache.snapshot().keys);
  closeImage.mockClear();
  imageDecoder.mockClear();
  fetchDocument.mockClear();
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("fetch", fetchDocument);
});

afterEach(() => {
  for (const actor of actors.splice(0)) actor.dispose();
  for (const unregister of unregisterExtensions.splice(0)) unregister();
  for (const key of glbResourceCache.snapshot().keys) {
    if (!initialCacheKeys.has(key)) glbResourceCache.release(key);
  }
  vi.unstubAllGlobals();
});

async function loadActor(id: string, options: Partial<TypedGLBActorOptions> = {}): Promise<TypedGLBActor> {
  const actor = await createTypedGLBActor({
    asset: { url, format: "gltf" },
    id,
    width: 8,
    height: 8,
    request: { credentials: "omit" },
    imageDecoder,
    ...options
  });
  actors.push(actor);
  return actor;
}

function observeActor(onLoad: (actor: TypedGLBActor) => void): () => void {
  // Observe the unpublished actor/resources. Admission is production policy,
  // not an exception thrown by this extension.
  const unregister = registerTypedGLBActorExtension({
    id: "test.required-pointer-binding",
    owner: "test",
    onLoad
  });
  unregisterExtensions.push(unregister);
  return unregister;
}

describe("typed actor required pointer failure ownership", () => {
  it("retains immutable per-track loader provenance across scene clones, not reconstructed tracks", async () => {
    const doc = JSON.parse(mixedNodeChannels(0, true)) as {
      animations: Array<{ channels: Array<{ sampler: number; target: unknown }> }>;
    };
    // The pointer and ordinary track have the same public target and samples.
    doc.animations[0]!.channels.push({ sampler: 0, target: { node: 0, path: "translation" } });
    document = JSON.stringify(doc);
    const loader = new GLTFLoader();
    const asset = await loader.load({ url, type: "gltf", credentials: "include" }, new LoadContext());
    try {
      const clip = asset.animations[0]!;
      const [pointer, missingCore, sameTargetCore] = clip.tracks;
      expect(pointer!.target).toBe(sameTargetCore!.target);
      const provenance = asset.animationPointerForTrack?.(pointer!);
      expect(provenance).toEqual({
        animationIndex: 0, channelIndex: 0, pointer: "/nodes/0/translation", required: true
      });
      expect(Object.isFrozen(provenance)).toBe(true);
      expect(Reflect.set(provenance!, "required", false)).toBe(false);
      expect(Reflect.set(asset, "animationPointerForTrack", () => undefined)).toBe(false);
      expect(Reflect.set(asset, "sceneIncludesTrackTarget", () => true)).toBe(false);
      expect(asset.animationPointerForTrack?.(sameTargetCore!)).toBeUndefined();
      expect(asset.animationPointerForTrack?.(missingCore!)).toBeUndefined();

      const scene = asset.createScene();
      const runtime = createGLTFSceneAnimationRuntime({ scene, clips: asset.animations, asset });
      const cloneRuntime = createGLTFSceneAnimationRuntime({ scene: scene.clone(), clips: asset.animations, asset });
      try {
        for (const instance of [runtime, cloneRuntime]) {
          expect(instance.inspectTrackBinding(pointer!)).toMatchObject({ track: pointer, status: "available" });
          expect(instance.inspectTrackBinding(sameTargetCore!)).toMatchObject({ track: sameTargetCore, status: "available" });
        }
        expect(runtime.inspectTrackBinding(missingCore!)).toMatchObject({ track: missingCore, status: "unavailable", reason: "missing-node" });
        // Clone APIs do not carry the loader's complete-scene certificate.
        expect(cloneRuntime.inspectTrackBinding(missingCore!)).toMatchObject({ track: missingCore, status: "unknown", reason: "missing-node" });
        const reconstructed = AnimationClip.fromJSON(clip.toJSON()).tracks[0]!;
        expect(reconstructed.target).toBe(pointer!.target);
        expect(asset.animationPointerForTrack?.(reconstructed)).toBeUndefined();
        expect(asset.nodeIndexForTrack?.(reconstructed)).toBeUndefined();
        expect(runtime.inspectTrackBinding(reconstructed)).toMatchObject({ status: "unknown", reason: "missing-node" });
      } finally {
        runtime.dispose();
        cloneRuntime.dispose();
      }
    } finally {
      loader.dispose(asset);
    }
  });

  it("reconstructs required pointer metadata from the exported document", async () => {
    const doc = JSON.parse(documentWithPointer("/materials/0/pbrMetallicRoughness/metallicFactor")) as {
      images?: unknown; textures?: unknown; materials: unknown[];
    };
    delete doc.images;
    delete doc.textures;
    doc.materials.pop();
    document = JSON.stringify(doc);
    const loader = new GLTFLoader();
    const source = await loader.load({ url, type: "gltf", credentials: "include" }, new LoadContext());
    try {
      expect(source.animationPointerForTrack?.(source.animations[0]!.tracks[0]!)?.required).toBe(true);
      const exported = exportGLTF(sceneFromGLTFAsset(source));
      expect(exported.data).toBeInstanceOf(Uint8Array);
      const data = exported.data as Uint8Array;
      const json = JSON.parse(new TextDecoder().decode(data)) as { extensionsRequired?: string[] };
      expect(json.extensionsRequired ?? []).toContain("KHR_animation_pointer");
      const reloaded = await loader.load({ url: `data:model/gltf+json;base64,${Buffer.from(data).toString("base64")}` }, new LoadContext());
      try {
        const track = reloaded.animations[0]!.tracks[0]!;
        expect(reloaded.animationPointerForTrack?.(track)).toMatchObject({ required: true });
        expect(source.animationPointerForTrack?.(track)).toBeUndefined();
      } finally {
        loader.dispose(reloaded);
      }
    } finally {
      loader.dispose(source);
    }
  });

  it("rejects only the missing required pointer when core and pointer channel attribution is swapped", async () => {
    // Private requests ensure each real document is parsed rather than reused by URL.
    const request = { credentials: "include" as const };
    document = mixedNodeChannels(0, true);
    const requiredVisible = await loadActor("required-visible", { request });
    document = mixedNodeChannels(1, true);
    await expect(loadActor("required-missing", { request })).rejects.toMatchObject({
      code: "GLTF_REQUIRED_ANIMATION_POINTER_BINDING_UNAVAILABLE",
      animationIndex: 0, channelIndex: 1, pointer: "/nodes/1/translation", reason: "missing-node"
    });
    document = mixedNodeChannels(1, false);
    const optionalMissing = await loadActor("optional-missing", { request });

    for (const actor of [requiredVisible, optionalMissing]) {
      expect(actor.animation.inspectClipBindings("motion")[0]?.missingTargets).toEqual(["Orphan.translation"]);
      const asset = actor.pipeline.asset;
      expect(asset.animations[0]!.tracks.map((track) => asset.nodeIndexForTrack?.(track))).toEqual([0, 1]);
    }
    const visibleTracks = requiredVisible.pipeline.asset.animations[0]!.tracks;
    expect(requiredVisible.pipeline.asset.animationPointerForTrack?.(visibleTracks[0]!)).toMatchObject({
      pointer: "/nodes/0/translation", required: true, channelIndex: 0
    });
    expect(requiredVisible.pipeline.asset.animationPointerForTrack?.(visibleTracks[1]!)).toBeUndefined();
    const optionalTracks = optionalMissing.pipeline.asset.animations[0]!.tracks;
    expect(optionalMissing.pipeline.asset.animationPointerForTrack?.(optionalTracks[1]!)).toMatchObject({
      pointer: "/nodes/1/translation", required: false, channelIndex: 1
    });
  });

  it("checks every exact track even when multiple clips have the same name", async () => {
    const doc = JSON.parse(documentWithPointer("/nodes/1/translation")) as {
      animations: Array<{ channels: Array<{ target: { extensions: { KHR_animation_pointer: { pointer: string } } } }> }>;
    };
    const first = JSON.parse(JSON.stringify(doc.animations[0])) as typeof doc.animations[number];
    first.channels[0]!.target.extensions.KHR_animation_pointer.pointer = "/nodes/0/translation";
    doc.animations.unshift(first);
    document = JSON.stringify(doc);
    await expect(loadActor("duplicate-clip-required-pointer")).rejects.toMatchObject({
      code: "GLTF_REQUIRED_ANIMATION_POINTER_BINDING_UNAVAILABLE",
      animationIndex: 1, channelIndex: 0, pointer: "/nodes/1/translation", reason: "missing-node"
    });
  });

  it("preserves playback for a valid required legacy material binding whose shader consumption is unproven", async () => {
    document = documentWithPointer("/materials/0/pbrMetallicRoughness/metallicFactor");
    const actor = await loadActor("required-legacy-material");
    const track = actor.pipeline.asset.animations[0]!.tracks[0]!;
    expect(actor.pipeline.asset.animationPointerForTrack?.(track)?.required).toBe(true);
    expect(actor.animation.inspectTrackBinding(track)).toMatchObject({ status: "unknown", reason: "legacy-material-contract" });
    expect(actor.playClip("motion", 1)).toMatchObject({ materialTracksApplied: 1, missingTargets: [] });
    expect(actor.pipeline.resources.materialLibrary.get("Paint")?.getParameter("u_metallic")).toBeCloseTo(0.8);
  });

  it("uses source light identity for missing, optional and valid required light pointers", async () => {
    const request = { credentials: "include" as const };
    document = documentWithLightPointer(1);
    await expect(loadActor("missing-required-light", { request })).rejects.toMatchObject({
      code: "GLTF_REQUIRED_ANIMATION_POINTER_BINDING_UNAVAILABLE",
      pointer: "/extensions/KHR_lights_punctual/lights/0/intensity", reason: "missing-light"
    });
    document = documentWithLightPointer(1, false);
    const optional = await loadActor("missing-optional-light", { request });
    const optionalTrack = optional.pipeline.asset.animations[0]!.tracks[0]!;
    expect(optional.pipeline.asset.animationPointerForTrack?.(optionalTrack)?.required).toBe(false);
    expect(optional.animation.inspectTrackBinding(optionalTrack)).toMatchObject({ status: "unavailable", reason: "missing-light" });

    document = documentWithLightPointer(0);
    const valid = await loadActor("valid-required-light", { request });
    const validTrack = valid.pipeline.asset.animations[0]!.tracks[0]!;
    expect(valid.animation.inspectTrackBinding(validTrack)).toMatchObject({ status: "available" });
    expect(valid.playClip("motion", 1)).toMatchObject({ lightTracksApplied: 1, missingTargets: [] });
  });

  it("rejects an off-scene required morph node but does not guess that a missing live morph is permanent", async () => {
    document = documentWithMorphPointer(1);
    await expect(loadActor("off-scene-required-morph")).rejects.toMatchObject({
      code: "GLTF_REQUIRED_ANIMATION_POINTER_BINDING_UNAVAILABLE",
      pointer: "/nodes/1/weights", reason: "missing-node"
    });

    document = documentWithMorphPointer(0);
    let observed = false;
    observeActor((actor) => {
      const renderable = actor.pipeline.resources.scene.collectRenderables()[0]!.renderable;
      expect(renderable.morphWeights).toHaveLength(1);
      renderable.morphWeights = [];
      actor.animation.reindexScene();
      const track = actor.pipeline.asset.animations[0]!.tracks[0]!;
      expect(actor.animation.inspectTrackBinding(track)).toMatchObject({ status: "unknown", reason: "missing-morph" });
      observed = true;
    });
    await loadActor("missing-required-morph");
    expect(observed).toBe(true);
  });

  it("does not assume an authored scene node temporarily detached during startup is permanently missing", async () => {
    document = documentWithPointer("/nodes/0/translation");
    let reattach: (() => void) | undefined;
    const stopObserving = observeActor((actor) => {
      const scene = actor.pipeline.resources.scene;
      const node = scene.findByName("Visible")[0]!;
      expect(node.parent?.removeChild(node)).toBe(true);
      actor.animation.reindexScene();
      const track = actor.pipeline.asset.animations[0]!.tracks[0]!;
      expect(actor.pipeline.asset.sceneIncludesTrackTarget?.(scene, track)).toBe(true);
      expect(actor.animation.inspectTrackBinding(track)).toMatchObject({ status: "unknown", reason: "missing-node" });
      reattach = () => { scene.root.addChild(node); actor.animation.reindexScene(); };
    });
    const actor = await loadActor("temporarily-detached-node");
    stopObserving();
    reattach!();
    const track = actor.pipeline.asset.animations[0]!.tracks[0]!;
    expect(actor.animation.inspectTrackBinding(track)).toMatchObject({ status: "available" });
    expect(actor.playClip("motion", 1)).toMatchObject({ transformTracksApplied: 1, missingTargets: [] });
  });

  it.each(["not-ready", "unassigned", "disabled"] as const)(
    "allows a required normal-map pointer when its lazy binding is %s",
    async (state) => {
      document = documentWithNormalPointer();
      let material: Material | undefined;
      let original: TextureBinding | undefined;
      const stopObserving = observeActor((actor) => {
        material = actor.pipeline.resources.materialLibrary.get("Paint")!;
        original = material.getParameter("u_normalTexture") as TextureBinding;
        expect(original.texture).not.toBeNull();
        if (state === "disabled") material.setParameter("u_normalTextureEnabled", 0);
        else material.setParameter("u_normalTexture", new TextureBinding({
          name: "u_normalTexture",
          texture: state === "unassigned" ? null : original.texture,
          sampler: original.sampler,
          ready: state !== "not-ready"
        }));
        const track = actor.pipeline.asset.animations[0]!.tracks[0]!;
        expect(actor.pipeline.asset.animationPointerForTrack?.(track)?.required).toBe(true);
        expect(actor.animation.inspectClipBindings("motion")[0]?.missingTargets)
          .toEqual(["material:Paint.normalTexture.scale"]);
        expect(actor.animation.inspectTrackBinding(track)).toMatchObject({
          status: state === "not-ready" ? "pending" : "unknown", reason: "missing-map"
        });
      });
      const actor = await loadActor(`lazy-required-normal-${state}`);
      stopObserving();
      material!.setParameter("u_normalTexture", original!);
      material!.setParameter("u_normalTextureEnabled", 1);
      const track = actor.pipeline.asset.animations[0]!.tracks[0]!;
      expect(actor.animation.inspectTrackBinding(track)).toMatchObject({ status: "available" });
      expect(actor.playClip("motion", 1)).toMatchObject({ materialTracksApplied: 1, missingTargets: [] });
    }
  );

  it("rejects a proven required normal-image decode failure but not the optional pointer", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const brokenDecoder = vi.fn(() => { throw new Error("image decode failed"); });
    let failedActor: TypedGLBActor | undefined;
    const stopObserving = observeActor((actor) => { failedActor = actor; });
    try {
      document = documentWithNormalPointer();
      await expect(loadActor("required-normal-failed", { imageDecoder: brokenDecoder })).rejects.toMatchObject({
        code: "GLTF_REQUIRED_ANIMATION_POINTER_BINDING_UNAVAILABLE",
        pointer: "/materials/0/normalTexture/scale", reason: "texture-load-failed"
      });
      stopObserving();
      expect(failedActor!.pipeline.asset.disposed).toBe(true);
      expect([...failedActor!.pipeline.resources.textureLibrary.values()].every((texture) => texture.disposed)).toBe(true);

      document = documentWithNormalPointer(false);
      const optional = await loadActor("optional-normal-failed", { imageDecoder: brokenDecoder });
      const track = optional.pipeline.asset.animations[0]!.tracks[0]!;
      expect(optional.pipeline.asset.animationPointerForTrack?.(track)?.required).toBe(false);
      expect(optional.animation.inspectTrackBinding(track)).toMatchObject({ status: "unavailable", reason: "texture-load-failed" });
    } finally {
      warn.mockRestore();
    }
  });

  it.each(["not-ready", "ready", "disabled"] as const)(
    "does not treat an earlier texture decode error as permanent after a %s replacement",
    async (replacementState) => {
      document = documentWithNormalPointer();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const brokenDecoder = vi.fn(() => { throw new Error("image decode failed"); });
      const replacement = new Texture({ width: 1, height: 1, data: new Uint8Array([128, 128, 255, 255]) });
      let material: Material | undefined;
      const stopObserving = observeActor((actor) => {
        material = actor.pipeline.resources.materialLibrary.get("Paint")!;
        const fallback = material.getParameter("u_normalTexture") as TextureBinding;
        if (replacementState === "disabled") material.setParameter("u_normalTextureEnabled", 0);
        else material.setParameter("u_normalTexture", new TextureBinding({
          name: "u_normalTexture", texture: replacement, sampler: fallback.sampler, ready: replacementState === "ready"
        }));
        const track = actor.pipeline.asset.animations[0]!.tracks[0]!;
        expect(actor.animation.inspectTrackBinding(track)).toMatchObject({
          status: replacementState === "not-ready" ? "pending" : "unknown"
        });
      });
      try {
        const actor = await loadActor(`normal-replacement-${replacementState}`, { imageDecoder: brokenDecoder });
        stopObserving();
        if (replacementState !== "ready") {
          material!.setParameter("u_normalTexture", new TextureBinding({ name: "u_normalTexture", texture: replacement }));
          material!.setParameter("u_normalTextureEnabled", 1);
        }
        expect(actor.playClip("motion", 1)).toMatchObject({ materialTracksApplied: 1, missingTargets: [] });
        actor.dispose();
        expect(replacement.disposed).toBe(false);
      } finally {
        replacement.dispose();
        warn.mockRestore();
      }
    }
  );

  it("preserves structural format adapters that cannot attribute required tracks", async () => {
    const loader = new GLTFLoader();
    const asset = await loader.load({ url, type: "gltf", credentials: "omit" }, new LoadContext());
    const legacy = Object.create(asset) as typeof asset;
    Object.defineProperty(legacy, "animationPointerForTrack", { value: undefined });
    const registry = new FormatRegistry();
    registry.register(createGLTFFormatAdapter("gltf", ["gltf"], {
      type: "gltf", canLoad: () => true, load: async () => legacy, dispose: () => {}
    }));
    try {
      const actor = await loadActor("legacy-format-unknown", { formatRegistry: registry });
      const track = asset.animations[0]!.tracks[0]!;
      expect(asset.loaderDiagnostics.extensionsRequired).toContain("KHR_animation_pointer");
      expect(legacy.animationPointerForTrack).toBeUndefined();
      expect(actor.animation.inspectTrackBinding(track)).toMatchObject({ status: "unavailable", reason: "missing-node" });
      // Global extensionsRequired is insufficient to identify this channel.
      actor.dispose();
      await awaitTypedGLBActorDisposals();
      expect(asset.disposed).toBe(false);
    } finally {
      loader.dispose(asset);
    }
  });

  it("does not assume a registered adapter's failed texture fallback is final", async () => {
    document = documentWithNormalPointer();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const registry = new FormatRegistry();
    registry.register(createGLTFFormatAdapter("gltf", ["gltf"], new GLTFLoader()));
    try {
      const actor = await loadActor("adapter-normal-unknown", {
        formatRegistry: registry, imageDecoder: () => { throw new Error("decode failed"); }
      });
      const track = actor.pipeline.asset.animations[0]!.tracks[0]!;
      expect(actor.pipeline.asset.animationPointerForTrack?.(track)?.required).toBe(true);
      expect(actor.animation.inspectTrackBinding(track)).toMatchObject({ status: "unknown", reason: "texture-load-failed" });
    } finally {
      warn.mockRestore();
    }
  });

  it.each([false, true])("releases an unpublished actor and permits a corrected same-URL retry (mount signal=%s)", async (useSignal) => {
    const cacheBefore = glbResourceCache.snapshot().entries;
    const parseBefore = snapshotParsedGLTFAssetCache();
    const sharesBefore = sharedModelTextures.size;
    const request = { credentials: "omit" as const, ...(useSignal ? { signal: new AbortController().signal } : {}) };
    let failedActor: TypedGLBActor | undefined;
    const stopObserving = observeActor((actor) => {
      failedActor = actor;
      expect(actor.animation.inspectClipBindings("motion")[0]?.missingTargets).toEqual(["Orphan.translation"]);
      expect(actor.animation.inspectTrackBinding(actor.pipeline.asset.animations[0]!.tracks[0]!))
        .toMatchObject({ status: "unavailable", reason: "missing-node" });
      expect(actor.pipeline.resources.geometryLibrary.size).toBeGreaterThan(0);
      expect(actor.pipeline.resources.materialLibrary.size).toBeGreaterThan(0);
      expect(actor.pipeline.resources.textureLibrary.size).toBeGreaterThan(0);
      expect([...actor.pipeline.resources.geometryLibrary.values()].every((geometry) => !geometry.disposed)).toBe(true);
      expect([...actor.pipeline.resources.textureLibrary.values()].every((texture) => !texture.disposed)).toBe(true);
    });

    await expect(loadActor("failed-required-pointer", { request })).rejects.toMatchObject({
      code: "GLTF_REQUIRED_ANIMATION_POINTER_BINDING_UNAVAILABLE",
      pointer: "/nodes/1/translation", reason: "missing-node"
    });
    stopObserving();
    expect(failedActor).toBeDefined();
    const failed = failedActor!;
    expect(liveTypedGLBActor(failed.id)).toBeUndefined();
    expect(() => failed.animation.inspectClipBindings()).toThrow(/disposed/);
    expect([...failed.pipeline.resources.geometryLibrary.values()].every((geometry) => geometry.disposed)).toBe(true);
    expect([...failed.pipeline.resources.materialLibrary.values()].every((material) => material.disposed)).toBe(true);
    expect([...failed.pipeline.resources.textureLibrary.values()].every((texture) => texture.disposed)).toBe(true);
    expect(closeImage).toHaveBeenCalledTimes(1);
    expect(sharedModelTextures.size).toBe(sharesBefore);
    expect(glbResourceCache.snapshot().entries).toBe(cacheBefore);
    expect(snapshotParsedGLTFAssetCache()).toMatchObject({
      cachedEntries: parseBefore.cachedEntries,
      totalReferences: parseBefore.totalReferences
    });
    expect(failed.pipeline.asset.disposed).toBe(true);

    document = documentWithPointer("/nodes/0/translation");
    const retry = await loadActor("corrected-required-pointer", { request });
    expect(fetchDocument).toHaveBeenCalledTimes(2);
    expect(imageDecoder).toHaveBeenCalledTimes(2);
    expect(retry.pipeline.asset).not.toBe(failed.pipeline.asset);
    expect(retry.animation.inspectClipBindings("motion")[0]?.missingTargets).toEqual([]);
    expect(retry.playClip("motion", 1).missingTargets).toEqual([]);
    expect(retry.pipeline.resources.scene.findByName("Visible")[0]?.transform.position).toEqual([2, 3, 4]);
    retry.dispose();
    // Published actors still populate the ordinary remount cache.
    expect(glbResourceCache.snapshot().entries).toBe(cacheBefore + 1);
    expect(retry.pipeline.asset.disposed).toBe(false);
    const remount = await loadActor("required-pointer-remount", { request });
    expect(remount.pipeline.asset).toBe(retry.pipeline.asset);
    expect(remount.pipeline.asset.animationPointerForTrack?.(remount.pipeline.asset.animations[0]!.tracks[0]!))
      .toMatchObject({ pointer: "/nodes/0/translation", required: true });
    expect(fetchDocument).toHaveBeenCalledTimes(2);
  });

  it("releases only the failed actor's leases, not its peer or caller-owned texture", async () => {
    document = documentWithPointer("/materials/0/extensions/KHR_materials_specular/specularFactor");
    const cache = new GLTFSharedTextureCache();
    const callerLease = cache.acquire();
    const borrowed = new Texture({ width: 1, height: 1, data: new Uint8Array([5, 6, 7, 255]) });
    const custom = new Material({
      shaderKey: "test/borrowed-texture",
      parameters: { u_borrowed: new TextureBinding({ name: "u_borrowed", texture: borrowed }) }
    });
    const disposeWork = vi.fn();
    const cacheBefore = glbResourceCache.snapshot().entries;
    try {
      const peer = await loadActor("pointer-peer", { sharedTextures: cache });
      const peerTexture = [...peer.pipeline.resources.textureLibrary.values()][0]!;
      const peerGeometry = [...peer.pipeline.resources.geometryLibrary.values()][0]!;
      const peerAsset = peer.pipeline.asset;
      expect(cache.refCount).toBe(2);
      expect(peerTexture.disposed).toBe(false);
      expect(peer.animation.inspectClipBindings("motion")[0]?.missingTargets).toEqual([]);

      let failedActor: TypedGLBActor | undefined;
      observeActor((actor) => {
        failedActor = actor;
        expect(actor.animation.inspectClipBindings("motion")[0]?.materialBindingIssues).toEqual([{
          target: "material:Paint.extensions.KHR_materials_specular.specularFactor",
          reason: "unsupported"
        }]);
        expect(actor.pipeline.asset).toBe(peerAsset);
        expect([...actor.pipeline.resources.textureLibrary.values()][0]).toBe(peerTexture);
        expect(cache.refCount).toBe(3);
      });
      await expect(loadActor("pointer-peer-failure", {
        sharedTextures: cache,
        customMaterialFactory: (context) => {
          context.adoptTextureWork({ ready: Promise.resolve(), warnings: [], dispose: disposeWork });
          return custom;
        }
      })).rejects.toMatchObject({
        code: "GLTF_REQUIRED_ANIMATION_POINTER_BINDING_UNAVAILABLE",
        pointer: "/materials/0/extensions/KHR_materials_specular/specularFactor",
        reason: "imported-material-overridden"
      });

      expect(failedActor).toBeDefined();
      expect([...failedActor!.pipeline.resources.geometryLibrary.values()].every((geometry) => geometry.disposed)).toBe(true);
      expect([...failedActor!.pipeline.resources.materialLibrary.values()].every((material) => material.disposed)).toBe(true);
      expect(custom.disposed).toBe(true);
      expect(disposeWork).toHaveBeenCalledTimes(1);
      expect(borrowed.disposed).toBe(false);
      expect(cache.refCount).toBe(2);
      expect(peerTexture.disposed).toBe(false);
      expect(peerGeometry.disposed).toBe(false);
      expect(peerAsset.disposed).toBe(false);
      expect(peer.collectRenderItems()).toHaveLength(1);
      expect(glbResourceCache.snapshot().entries).toBe(cacheBefore);
      expect(imageDecoder).toHaveBeenCalledTimes(1);
      expect(fetchDocument).toHaveBeenCalledTimes(1);

      peer.dispose();
      expect(cache.refCount).toBe(1);
      expect(peerTexture.disposed).toBe(false);
      expect(borrowed.disposed).toBe(false);
    } finally {
      callerLease.release();
      borrowed.dispose();
    }
  });

  it("does not cache an actor disposed reentrantly during binding initialization", async () => {
    const cacheBefore = glbResourceCache.snapshot().entries;
    let failedActor: TypedGLBActor | undefined;
    observeActor((actor) => {
      failedActor = actor;
      actor.dispose();
    });
    await expect(loadActor("reentrant-pointer-failure")).rejects.toMatchObject({ name: "AbortError" });
    expect(failedActor).toBeDefined();
    expect(failedActor!.pipeline.asset.disposed).toBe(true);
    expect(glbResourceCache.snapshot().entries).toBe(cacheBefore);
    expect(liveTypedGLBActor("reentrant-pointer-failure")).toBeUndefined();
  });

  it("tracks asynchronous adapter cleanup without taking the caller's parsed asset", async () => {
    document = documentWithPointer("/materials/0/extensions/KHR_materials_specular/specularFactor");
    const loader = new GLTFLoader();
    const asset = await loader.load({ url, type: "gltf", credentials: "omit" }, new LoadContext());
    const owner = {};
    const registry = new FormatRegistry();
    let releaseCleanup!: () => void;
    let signalCleanupStarted!: () => void;
    const cleanupGate = new Promise<void>((resolve) => { releaseCleanup = resolve; });
    const cleanupStarted = new Promise<void>((resolve) => { signalCleanupStarted = resolve; });
    const disposeAssetLease = vi.fn(async () => {
      signalCleanupStarted();
      await cleanupGate;
      // The adapter owns a lease, not the caller's parsed asset.
    });
    registry.register(createGLTFFormatAdapter("gltf", ["gltf"], {
      type: "gltf",
      canLoad: () => true,
      load: async () => asset,
      dispose: disposeAssetLease
    }));
    let failedActor: TypedGLBActor | undefined;
    const stopObserving = observeActor((actor) => {
      failedActor = actor;
    });
    try {
      await expect(loadActor("registered-pointer-failure", {
        runtimeOwner: owner,
        formatRegistry: registry,
        customMaterialFactory: () => new Material({ shaderKey: "test/override" })
      })).rejects.toMatchObject({
        code: "GLTF_REQUIRED_ANIMATION_POINTER_BINDING_UNAVAILABLE",
        reason: "imported-material-overridden"
      });
      stopObserving();
      await cleanupStarted;
      expect(disposeAssetLease).toHaveBeenCalledTimes(1);
      expect(asset.disposed).toBe(false);
      expect([...failedActor!.pipeline.resources.geometryLibrary.values()].every((geometry) => geometry.disposed)).toBe(true);
      expect([...failedActor!.pipeline.resources.textureLibrary.values()].every((texture) => texture.disposed)).toBe(true);

      let settled = false;
      const cleanup = awaitTypedGLBActorDisposals(owner).then(() => { settled = true; });
      await Promise.resolve();
      expect(settled).toBe(false);
      releaseCleanup();
      await cleanup;
      expect(asset.disposed).toBe(false);

      const retry = await loadActor("registered-pointer-retry", { runtimeOwner: owner, formatRegistry: registry });
      expect(retry.pipeline.asset).toBe(asset);
      expect(retry.animation.inspectClipBindings("motion")[0]?.missingTargets).toEqual([]);
      retry.dispose();
      await awaitTypedGLBActorDisposals(owner);
      expect(disposeAssetLease).toHaveBeenCalledTimes(2);
      expect(asset.disposed).toBe(false);
    } finally {
      releaseCleanup();
      await awaitTypedGLBActorDisposals(owner);
      loader.dispose(asset);
    }
  });

  it("retains the original binding error when an extension disposer also fails", async () => {
    const cleanupError = new Error("extension cleanup failed");
    let failedActor: TypedGLBActor | undefined;
    unregisterExtensions.push(registerTypedGLBActorExtension({
      id: "test.required-pointer-cleanup-error",
      owner: "test",
      onLoad(actor) {
        expect(actor.animation.inspectClipBindings("motion")[0]?.missingTargets).toEqual(["Orphan.translation"]);
        failedActor = actor;
      },
      dispose() { throw cleanupError; }
    }));
    const error = await loadActor("pointer-cleanup-error").then(() => undefined, (failure: unknown) => failure);
    expect(error).toBeInstanceOf(AggregateError);
    const aggregate = error as AggregateError;
    expect(aggregate.errors[0]).toMatchObject({
      code: "GLTF_REQUIRED_ANIMATION_POINTER_BINDING_UNAVAILABLE",
      pointer: "/nodes/1/translation", reason: "missing-node"
    });
    expect(aggregate.errors[1]).toBeInstanceOf(AggregateError);
    expect((aggregate.errors[1] as AggregateError).errors).toContain(cleanupError);
    expect(failedActor!.pipeline.asset.disposed).toBe(true);
    expect([...failedActor!.pipeline.resources.geometryLibrary.values()].every((geometry) => geometry.disposed)).toBe(true);
  });

  it("releases the share after GLTFLoader rejects an unsupported required pointer before resource creation", async () => {
    document = documentWithPointer("/cameras/0/perspective/yfov");
    const cacheBefore = glbResourceCache.snapshot().entries;
    const parseBefore = snapshotParsedGLTFAssetCache();
    const sharesBefore = sharedModelTextures.size;
    await expect(new GLTFLoader().load({ url, type: "gltf", credentials: "omit" }, new LoadContext()))
      .rejects.toThrow(/unsupported required animation pointer/);
    await expect(loadActor("parse-failure")).rejects.toThrow(/unsupported required animation pointer/);
    expect(imageDecoder).not.toHaveBeenCalled();
    expect(sharedModelTextures.size).toBe(sharesBefore);
    expect(glbResourceCache.snapshot().entries).toBe(cacheBefore);
    expect(snapshotParsedGLTFAssetCache()).toMatchObject({
      cachedEntries: parseBefore.cachedEntries,
      totalReferences: parseBefore.totalReferences
    });
    expect(liveTypedGLBActor("parse-failure")).toBeUndefined();

    document = documentWithPointer("/nodes/0/translation");
    const retry = await loadActor("parse-retry");
    expect(retry.animation.inspectClipBindings("motion")[0]?.missingTargets).toEqual([]);
    expect(fetchDocument).toHaveBeenCalledTimes(3);
    expect(imageDecoder).toHaveBeenCalledTimes(1);
  });
});
