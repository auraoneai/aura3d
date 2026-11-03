import { describe, expect, it, vi } from "vitest";
import { AnimationClip } from "@aura3d/animation";
import { Texture, TextureBinding, TexturedPBRMaterial } from "@aura3d/rendering";
import { createGLTFSceneAnimationRuntime } from "../../../packages/assets/src/GLTFAnimationRuntime";
import { GLTFLoader, type GLTFAsset } from "../../../packages/assets/src/GLTFLoader";
import { LoadContext } from "../../../packages/assets/src/LoadContext";
import { inspectExportPointerChannelProvenance, sceneFromGLTFAsset, type AuraExportAttribute, type AuraExportScene } from "../../../packages/assets/src/exporters/ExportContext";
import { exportGLTF } from "../../../packages/assets/src/exporters/GLTFExporter";
import {
  createTypedGLBActor,
  type TypedGLBActor
} from "../../../packages/engine/src/production-runtime/TypedGLBActor";
import { createGLBActorAnimationMaterialResolver } from "../../../packages/engine/src/production-runtime/actor/TypedGLBActorAnimation";
import { registerTypedGLBActorExtension } from "../../../packages/engine/src/production-runtime/actor/extensions";

type SourceKind = "material" | "normal" | "node-pointer" | "node-core" | "off-scene-pointer";

// Independently authored glTF metadata: the writer under test does not create
// the inputs. Node pointer and core sources deliberately have the same curve.
function authored(kind: SourceKind, required: boolean): Record<string, unknown> {
  const values = new Float32Array([0, 1, 0.25, 0.75, 0, 0, 0, 2, 3, 4]);
  const bytes = Buffer.from(values.buffer);
  const node = kind === "off-scene-pointer" ? 1 : 0;
  const nodeTrack = kind === "node-core" || kind === "node-pointer" || kind === "off-scene-pointer";
  const pointer = nodeTrack ? `/nodes/${node}/translation`
    : kind === "normal" ? "/materials/0/normalTexture/scale" : "/materials/0/pbrMetallicRoughness/metallicFactor";
  const target = kind === "node-core" ? { node, path: "translation" }
    : { path: "pointer", extensions: { KHR_animation_pointer: { pointer } } };
  return {
    asset: { version: "2.0" },
    ...(kind === "node-core" ? {} : { extensionsUsed: ["KHR_animation_pointer"] }),
    ...(required && kind !== "node-core" ? { extensionsRequired: ["KHR_animation_pointer"] } : {}),
    buffers: [{ uri: `data:application/octet-stream;base64,${bytes.toString("base64")}`, byteLength: bytes.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 8 },
      { buffer: 0, byteOffset: 8, byteLength: 8 },
      { buffer: 0, byteOffset: 16, byteLength: 24 }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 2, type: "SCALAR" },
      { bufferView: 1, componentType: 5126, count: 2, type: "SCALAR" },
      { bufferView: 2, componentType: 5126, count: 2, type: "VEC3" }
    ],
    ...(kind === "normal" ? {
      images: [{ uri: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aN8AAAAASUVORK5CYII=" }],
      textures: [{ source: 0 }]
    } : {}),
    materials: [{ name: "Paint", pbrMetallicRoughness: { metallicFactor: 0.25 },
      ...(kind === "normal" ? { normalTexture: { index: 0, scale: 0.25 } } : {}) }],
    nodes: [{ name: "Root" }, ...(kind === "off-scene-pointer" ? [{ name: "Orphan" }] : [])],
    scenes: [{ nodes: [0] }], scene: 0,
    animations: [{
      name: "motion",
      samplers: [{ input: 0, output: nodeTrack ? 2 : 1 }, ...(kind === "material" ? [{ input: 0, output: 2 }] : [])],
      channels: [{ sampler: 0, target }, ...(kind === "material" ? [{ sampler: 1, target: { node: 0, path: "translation" } }] : [])]
    }]
  };
}

function authoredSharedLight(required: boolean): Record<string, unknown> {
  const doc = authored("normal", required);
  return {
    ...doc,
    extensionsUsed: ["KHR_animation_pointer", "KHR_lights_punctual"],
    extensions: { KHR_lights_punctual: { lights: [{ name: "Shared", type: "point", intensity: 0.25 }] } },
    nodes: ["One", "Two"].map((name) => ({ name, extensions: { KHR_lights_punctual: { light: 0 } } })),
    scenes: [{ nodes: [0, 1] }],
    animations: [{ name: "light", samplers: [{ input: 0, output: 1 }], channels: [{
      sampler: 0, target: { path: "pointer", extensions: { KHR_animation_pointer: { pointer: "/extensions/KHR_lights_punctual/lights/0/intensity" } } }
    }] }]
  };
}

function authoredTransform(path: "rotation" | "scale", required: boolean): Record<string, unknown> {
  const output = path === "rotation" ? [0, 0, 0, 1, 0, 0, 1, 0] : [1, 1, 1, 2, 3, 4];
  const bytes = Buffer.from(new Float32Array([0, 1, ...output]).buffer);
  return {
    asset: { version: "2.0" }, extensionsUsed: ["KHR_animation_pointer"],
    ...(required ? { extensionsRequired: ["KHR_animation_pointer"] } : {}),
    buffers: [{ uri: `data:application/octet-stream;base64,${bytes.toString("base64")}`, byteLength: bytes.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 8 }, { buffer: 0, byteOffset: 8, byteLength: output.length * 4 }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 2, type: "SCALAR" },
      { bufferView: 1, componentType: 5126, count: 2, type: path === "rotation" ? "VEC4" : "VEC3" }
    ],
    nodes: [{ name: "Root", [path]: path === "rotation" ? [0, 0, 0, 1] : [1, 1, 1] }],
    scenes: [{ nodes: [0] }], scene: 0,
    animations: [{ name: "motion", samplers: [{ input: 0, output: 1 }], channels: [{
      sampler: 0, target: { path: "pointer", extensions: { KHR_animation_pointer: { pointer: `/nodes/0/${path}` } } }
    }] }]
  };
}

function authoredTextureTransform(required: boolean): Record<string, unknown> {
  const document = authored("normal", required) as Record<string, any>;
  const bytes = Buffer.from(new Float32Array([0, 1, 0, 0, 0.5, 0.25]).buffer);
  document.extensionsUsed.push("KHR_texture_transform");
  document.buffers = [{ uri: `data:application/octet-stream;base64,${bytes.toString("base64")}`, byteLength: bytes.length }];
  document.bufferViews = [{ buffer: 0, byteOffset: 0, byteLength: 8 }, { buffer: 0, byteOffset: 8, byteLength: 16 }];
  document.accessors = [
    { bufferView: 0, componentType: 5126, count: 2, type: "SCALAR" },
    { bufferView: 1, componentType: 5126, count: 2, type: "VEC2" }
  ];
  document.materials[0].normalTexture = {
    index: 0, extensions: { KHR_texture_transform: { offset: [0, 0], scale: [1, 1], rotation: 0 } }
  };
  document.animations[0].channels[0].target.extensions.KHR_animation_pointer.pointer =
    "/materials/0/normalTexture/extensions/KHR_texture_transform/offset";
  return document;
}

function authoredMorph(required: boolean, primitiveCount: number): Record<string, unknown> {
  const chunks = [
    new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    new Float32Array([0, 0, 0.2, 0, 0, 0.2, 0, 0, 0.2]),
    new Float32Array([0.1, 0, 0, 0.1, 0, 0, 0.1, 0, 0]),
    new Float32Array([0, 1]),
    new Float32Array([0, 0, 0, 0, 1, 0, 0, 0, 1, 0.5, 0, 0])
  ];
  let length = 0;
  const bufferViews = chunks.map((chunk) => {
    const result = { buffer: 0, byteOffset: length, byteLength: chunk.byteLength };
    length += chunk.byteLength;
    return result;
  });
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(new Uint8Array(chunk.buffer), offset); offset += chunk.byteLength; }
  return {
    asset: { version: "2.0" }, extensionsUsed: ["KHR_animation_pointer"],
    ...(required ? { extensionsRequired: ["KHR_animation_pointer"] } : {}),
    buffers: [{ uri: `data:application/octet-stream;base64,${Buffer.from(bytes).toString("base64")}`, byteLength: bytes.length }],
    bufferViews,
    accessors: [
      { bufferView: 0, componentType: 5126, type: "VEC3", count: 3, min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5126, type: "VEC3", count: 3 },
      { bufferView: 2, componentType: 5126, type: "VEC3", count: 3 },
      { bufferView: 3, componentType: 5126, type: "SCALAR", count: 2 },
      { bufferView: 4, componentType: 5126, type: "SCALAR", count: 12 }
    ],
    meshes: [{ name: "Face", weights: [0, 0], primitives: Array.from({ length: primitiveCount }, () => ({
      attributes: { POSITION: 0 }, targets: [{ POSITION: 1 }, { POSITION: 2 }]
    })) }],
    nodes: [{ name: "Target", mesh: 0, weights: [0, 0] }, { name: "Other", mesh: 0, weights: [0, 0] }],
    scenes: [{ nodes: [0, 1] }], scene: 0,
    animations: [{ name: "expression", samplers: [{ input: 3, output: 4, interpolation: "CUBICSPLINE" }], channels: [{
      sampler: 0, target: { path: "pointer", extensions: { KHR_animation_pointer: { pointer: "/nodes/0/weights" } } }
    }] }]
  };
}

const url = (document: unknown): string =>
  `data:model/gltf+json;base64,${Buffer.from(JSON.stringify(document)).toString("base64")}`;

async function load(loader: GLTFLoader, document: unknown): Promise<GLTFAsset> {
  return loader.load({ url: url(document), type: "gltf" }, new LoadContext());
}

function json(result: ReturnType<typeof exportGLTF>): Record<string, any> {
  if (!(result.data instanceof Uint8Array)) throw new Error("Expected glTF JSON bytes");
  return JSON.parse(new TextDecoder().decode(result.data));
}

function reloadUrl(result: ReturnType<typeof exportGLTF>): string {
  if (!(result.data instanceof Uint8Array)) throw new Error("Expected glTF JSON bytes");
  return `data:model/gltf+json;base64,${Buffer.from(result.data).toString("base64")}`;
}

// Read the exported payload directly rather than relying on the loader to
// confirm values produced by the exporter.
function exportedFloatValues(document: Record<string, any>, accessorIndex: number, width: number): number[] {
  const accessor = document.accessors[accessorIndex];
  const view = document.bufferViews[accessor.bufferView];
  const uri = document.buffers[view.buffer].uri as string;
  const bytes = Buffer.from(uri.slice(uri.indexOf(",") + 1), "base64");
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const stride = view.byteStride ?? width * 4;
  return Array.from({ length: accessor.count * width }, (_, index) =>
    data.getFloat32((view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
      + Math.floor(index / width) * stride + index % width * 4, true));
}

describe("glTF animation-pointer requiredness through export", () => {
  it("round-trips required and optional material pointers without attributing ordinary core channels", async () => {
    const loader = new GLTFLoader();
    const required = await load(loader, authored("material", true));
    const optional = await load(loader, authored("material", false));
    try {
      const requiredTrack = required.animations[0]!.tracks[0]!;
      const optionalTrack = optional.animations[0]!.tracks[0]!;
      expect(required.animationPointerForTrack?.(requiredTrack)).toMatchObject({ required: true });
      expect(optional.animationPointerForTrack?.(optionalTrack)).toMatchObject({ required: false });
      expect(required.animationPointerForTrack?.(required.animations[0]!.tracks[1]!)).toBeUndefined();
      const requiredSnapshot = sceneFromGLTFAsset(required);
      const optionalSnapshot = sceneFromGLTFAsset(optional);
      // Source provenance is deliberately not serialized into the snapshot.
      expect(requiredSnapshot).toEqual(optionalSnapshot);
      const requiredChannel = requiredSnapshot.animations![0]!.pointerChannels![0]!;
      const optionalChannel = optionalSnapshot.animations![0]!.pointerChannels![0]!;
      const requiredOrigin = inspectExportPointerChannelProvenance(requiredSnapshot, requiredChannel)!;
      const optionalOrigin = inspectExportPointerChannelProvenance(optionalSnapshot, optionalChannel)!;
      expect(requiredOrigin).toMatchObject({ status: "verified", provenance: {
        animationIndex: 0, channelIndex: 0, pointer: "/materials/0/pbrMetallicRoughness/metallicFactor",
        exportedPointer: requiredChannel.pointer, required: true
      } });
      expect(optionalOrigin).toMatchObject({ status: "verified", provenance: { required: false } });
      expect(Object.isFrozen(requiredOrigin)).toBe(true);
      expect(Object.isFrozen(requiredOrigin.provenance)).toBe(true);
      expect(Reflect.set(requiredOrigin.provenance, "required", false)).toBe(false);
      expect(inspectExportPointerChannelProvenance(requiredSnapshot, { ...requiredChannel })).toBeUndefined();
      const requiredOutput = exportGLTF(requiredSnapshot);
      const optionalOutput = exportGLTF(optionalSnapshot);
      const requiredDoc = json(requiredOutput), optionalDoc = json(optionalOutput);
      expect(requiredDoc.extensionsRequired).toContain("KHR_animation_pointer");
      expect(optionalDoc.extensionsRequired ?? []).not.toContain("KHR_animation_pointer");
      expect(requiredDoc.buffers).toEqual(optionalDoc.buffers);
      expect(requiredDoc.bufferViews).toEqual(optionalDoc.bufferViews);
      expect(requiredDoc.accessors).toEqual(optionalDoc.accessors);
      expect(requiredDoc.animations[0].channels.map((channel: any) => channel.target.path)).toEqual(["translation", "pointer"]);
      expect(requiredOutput.warnings.map((warning) => warning.code)).not.toContain("ANIMATION_POINTER_REQUIREDNESS_UNAVAILABLE");
      expect(requiredOutput.warnings.map((warning) => warning.code)).not.toContain("ANIMATION_POINTER_ORIGIN_UNAVAILABLE");
      for (const [output, isRequired] of [[requiredOutput, true], [optionalOutput, false]] as const) {
        const reloaded = await loader.load({ url: reloadUrl(output), type: "gltf" }, new LoadContext());
        try {
          const [coreTrack, resultTrack] = reloaded.animations[0]!.tracks;
          expect(reloaded.animationPointerForTrack?.(coreTrack!)).toBeUndefined();
          expect(reloaded.animationPointerForTrack?.(resultTrack!)).toMatchObject({ channelIndex: 1, required: isRequired });
          expect(required.animationPointerForTrack?.(resultTrack!)).toBeUndefined();
          expect(required.animationPointerForTrack?.(requiredTrack)?.required).toBe(true);
        } finally {
          loader.dispose(reloaded);
        }
      }
    } finally {
      loader.dispose(required);
      loader.dispose(optional);
    }
  });

  it("retains requiredness when one source light track expands into multiple output pointers", async () => {
    const loader = new GLTFLoader();
    const required = await load(loader, authoredSharedLight(true));
    const optional = await load(loader, authoredSharedLight(false));
    try {
      expect(required.animationPointerForTrack?.(required.animations[0]!.tracks[0]!)).toMatchObject({ channelIndex: 0, required: true });
      expect(optional.animationPointerForTrack?.(optional.animations[0]!.tracks[0]!)).toMatchObject({ channelIndex: 0, required: false });
      const snapshot = sceneFromGLTFAsset(required);
      expect(snapshot).toEqual(sceneFromGLTFAsset(optional));
      const pointers = snapshot.animations![0]!.pointerChannels!;
      expect(pointers).toHaveLength(2);
      expect(pointers[0]!.pointer).not.toBe(pointers[1]!.pointer);
      expect(pointers.map((channel) => inspectExportPointerChannelProvenance(snapshot, channel)?.provenance))
        .toEqual(pointers.map((channel) => expect.objectContaining({
          channelIndex: 0, pointer: "/extensions/KHR_lights_punctual/lights/0/intensity", exportedPointer: channel.pointer, required: true
        })));
      const result = exportGLTF(snapshot);
      const doc = json(result);
      expect(doc.extensionsUsed).toEqual(expect.arrayContaining(["KHR_animation_pointer", "KHR_lights_punctual"]));
      expect(doc.extensionsRequired).toContain("KHR_animation_pointer");
      const optionalOutput = exportGLTF(sceneFromGLTFAsset(optional));
      expect(json(optionalOutput).extensionsRequired ?? []).not.toContain("KHR_animation_pointer");
      const reloaded = await loader.load({ url: reloadUrl(result), type: "gltf" }, new LoadContext());
      try {
        expect(reloaded.animations[0]!.tracks).toHaveLength(2);
        expect(reloaded.animations[0]!.tracks.map((track) => reloaded.animationPointerForTrack?.(track)?.required)).toEqual([true, true]);
      } finally {
        loader.dispose(reloaded);
      }
    } finally {
      loader.dispose(required);
      loader.dispose(optional);
    }
  });

  it("round-trips an optional texture-transform pointer without requiring KHR_texture_transform", async () => {
    const loader = new GLTFLoader();
    const source = await load(loader, authoredTextureTransform(false));
    try {
      const snapshot = sceneFromGLTFAsset(source);
      const output = exportGLTF(snapshot);
      const doc = json(output);
      expect(doc.extensionsUsed).toEqual(expect.arrayContaining(["KHR_animation_pointer", "KHR_texture_transform"]));
      expect(doc.extensionsRequired ?? []).not.toContain("KHR_animation_pointer");
      expect(doc.extensionsRequired ?? []).not.toContain("KHR_texture_transform");
      const reloaded = await loader.load({ url: reloadUrl(output), type: "gltf" }, new LoadContext());
      try {
        const track = reloaded.animations[0]!.tracks[0]!;
        expect(reloaded.animationPointerForTrack?.(track)).toMatchObject({
          required: false, pointer: "/materials/0/normalTexture/extensions/KHR_texture_transform/offset"
        });
        expect(track.sample(1)).toEqual([0.5, 0.25]);
      } finally {
        loader.dispose(reloaded);
      }
    } finally {
      loader.dispose(source);
    }
  });

  it("round-trips a required texture-transform pointer and its actor image prerequisite", async () => {
    const loader = new GLTFLoader();
    const document = authoredTextureTransform(true);
    const source = await load(loader, document);
    const actors: TypedGLBActor[] = [];
    const pointer = "/materials/0/normalTexture/extensions/KHR_texture_transform/offset";
    const target = "material:Paint.normalTexture.extensions.KHR_texture_transform.offset";
    const prerequisite = {
      clipName: "motion", target, materialIndex: 0, materialName: "Paint", textureIndex: 0, imageIndex: 0
    };
    try {
      const sourceTrack = source.animations[0]!.tracks[0]!;
      expect(sourceTrack).toMatchObject({ target, valueType: "number-array", valueSize: 2 });
      expect(source.animationPointerForTrack?.(sourceTrack)).toEqual({
        animationIndex: 0, channelIndex: 0, pointer, required: true
      });
      expect(source.requiredTextureAnimationTargets).toEqual([prerequisite]);
      expect(sourceTrack.sample(0.5)).toEqual([0.25, 0.125]);

      const snapshot = sceneFromGLTFAsset(source);
      const channel = snapshot.animations![0]!.pointerChannels![0]!;
      expect(inspectExportPointerChannelProvenance(snapshot, channel)).toMatchObject({
        status: "verified", resolvedPointer: pointer,
        provenance: { animationIndex: 0, channelIndex: 0, pointer, exportedPointer: pointer, required: true }
      });
      expect(Array.from(channel.times.values)).toEqual([0, 1]);
      expect(Array.from(channel.values.values)).toEqual([0, 0, 0.5, 0.25]);

      const output = exportGLTF(snapshot);
      const doc = json(output);
      expect(doc.extensionsUsed).toEqual(expect.arrayContaining(["KHR_animation_pointer", "KHR_texture_transform"]));
      expect(doc.extensionsRequired).toEqual(["KHR_animation_pointer"]);
      expect(doc.materials[0].normalTexture.extensions.KHR_texture_transform.offset).toEqual([0, 0]);
      const animation = doc.animations[0];
      expect(animation.channels).toHaveLength(1);
      expect(animation.channels[0].target).toEqual({
        path: "pointer", extensions: { KHR_animation_pointer: { pointer } }
      });
      const sampler = animation.samplers[animation.channels[0].sampler];
      expect(sampler.interpolation).toBe("LINEAR");
      expect(doc.accessors[sampler.input]).toMatchObject({ componentType: 5126, type: "SCALAR", count: 2 });
      expect(doc.accessors[sampler.output]).toMatchObject({ componentType: 5126, type: "VEC2", count: 2 });
      expect(exportedFloatValues(doc, sampler.input, 1)).toEqual([0, 1]);
      expect(exportedFloatValues(doc, sampler.output, 2)).toEqual([0, 0, 0.5, 0.25]);
      expect(output.warnings.map((warning) => warning.code)).not.toContain("ANIMATION_TRACK_LOST");

      const reloaded = await loader.load({ url: reloadUrl(output), type: "gltf" }, new LoadContext());
      try {
        const track = reloaded.animations[0]!.tracks[0]!;
        expect(reloaded.animationPointerForTrack?.(track)).toEqual({
          animationIndex: 0, channelIndex: 0, pointer, required: true
        });
        expect(reloaded.requiredTextureAnimationTargets).toEqual([prerequisite]);
        expect(track).toMatchObject({ target, valueType: "number-array", valueSize: 2 });
        expect(track.sample(0.5)).toEqual([0.25, 0.125]);
        expect(track.sample(1)).toEqual([0.5, 0.25]);
      } finally {
        loader.dispose(reloaded);
      }

      const options = {
        width: 8, height: 8, shareTextures: false,
        imageDecoder: () => ({ width: 1, height: 1, data: new Uint8Array([128, 128, 255, 255]), colorSpace: "linear" as const })
      };
      for (const [id, assetUrl] of [["source", url(document)], ["roundtrip", reloadUrl(output)]] as const) {
        const actor = await createTypedGLBActor({ ...options, id: `required-transform-${id}`, asset: { url: assetUrl, format: "gltf" } });
        actors.push(actor);
        const track = actor.pipeline.asset.animations[0]!.tracks[0]!;
        expect(actor.pipeline.asset.animationPointerForTrack?.(track)).toMatchObject({ pointer, required: true });
        expect(actor.animation.inspectTrackBinding(track)).toMatchObject({ status: "available" });
        expect(actor.playClip("motion", 0.5)).toMatchObject({ materialTracksApplied: 1, missingTargets: [] });
        expect(actor.pipeline.resources.materialLibrary.get("Paint")!.getParameter("u_normalTextureOffset")).toEqual([0.25, 0.125]);
        await expect(createTypedGLBActor({
          ...options, id: `required-transform-broken-${id}`, asset: { url: assetUrl, format: "gltf" },
          imageDecoder: () => { throw new Error("required image decode failure"); }
        })).rejects.toMatchObject({ name: "GLTFTextureLoadError", issue: { imageIndex: 0, fallback: false } });
      }
    } finally {
      for (const actor of actors) actor.dispose();
      loader.dispose(source);
    }
  });

  it.each([false, true])("keeps node pointer requiredness=%s distinct from an ordinary core channel", async (required) => {
    const loader = new GLTFLoader();
    const pointer = await load(loader, authored("node-pointer", required));
    const core = await load(loader, authored("node-core", false));
    try {
      expect(pointer.animationPointerForTrack?.(pointer.animations[0]!.tracks[0]!)).toMatchObject({ required });
      expect(core.animationPointerForTrack?.(core.animations[0]!.tracks[0]!)).toBeUndefined();
      const pointerSnapshot = sceneFromGLTFAsset(pointer);
      const coreSnapshot = sceneFromGLTFAsset(core);
      const output = exportGLTF(pointerSnapshot);
      const coreOutput = exportGLTF(coreSnapshot);
      const doc = json(output);
      expect(doc.animations[0].channels[0].target).toEqual({
        path: "pointer", extensions: { KHR_animation_pointer: { pointer: "/nodes/1/translation" } }
      });
      expect(doc.extensionsUsed).toContain("KHR_animation_pointer");
      expect((doc.extensionsRequired ?? []).includes("KHR_animation_pointer")).toBe(required);
      expect(json(coreOutput).animations[0].channels[0].target.path).toBe("translation");
      expect(json(coreOutput).extensionsUsed ?? []).not.toContain("KHR_animation_pointer");
      expect(coreOutput.warnings.map((warning) => warning.code)).not.toContain("ANIMATION_POINTER_ORIGIN_UNAVAILABLE");
      const nodeChannel = pointerSnapshot.animations![0]!.pointerChannels![0]!;
      expect(inspectExportPointerChannelProvenance(pointerSnapshot, nodeChannel)).toMatchObject({
        status: "verified", provenance: { pointer: "/nodes/0/translation", exportedPointer: "/nodes/1/translation", required }
      });
      const manual: AuraExportScene = {
        nodes: [{ name: "Root" }], roots: [0], metersPerUnit: 1, upAxis: "Y", uvOrigin: "top-left",
        animations: [{ channels: [{
          node: 0, path: "translation", times: { itemSize: 1, values: new Float32Array([0, 1]) },
          values: { itemSize: 3, values: new Float32Array([0, 0, 0, 2, 3, 4]) }
        }] }]
      };
      expect(exportGLTF(manual).warnings.map((warning) => warning.code)).not.toContain("ANIMATION_POINTER_ORIGIN_UNAVAILABLE");
      const reloaded = await loader.load({ url: reloadUrl(output), type: "gltf" }, new LoadContext());
      try {
        const track = reloaded.animations[0]!.tracks[0]!;
        expect(reloaded.animationPointerForTrack?.(track)).toMatchObject({ pointer: "/nodes/1/translation", required });
        const scene = reloaded.createScene();
        const runtime = createGLTFSceneAnimationRuntime({ scene, clips: reloaded.animations, asset: reloaded });
        try {
          expect(runtime.inspectTrackBinding(track)).toMatchObject({ status: "available" });
          expect(runtime.applyClipByName("motion", 1).missingTargets).toEqual([]);
          expect(scene.findByName("Root")[0]!.transform.position).toEqual([2, 3, 4]);
        } finally {
          runtime.dispose(); scene.dispose();
        }
      } finally {
        loader.dispose(reloaded);
      }
    } finally {
      loader.dispose(pointer);
      loader.dispose(core);
    }
  });

  it("keeps a pointer and a core channel with the same node target distinct by track identity", async () => {
    const loader = new GLTFLoader();
    const document = authored("node-pointer", true) as Record<string, any>;
    document.animations[0].channels.push({ sampler: 0, target: { node: 0, path: "translation" } });
    const source = await load(loader, document);
    try {
      const [pointer, core] = source.animations[0]!.tracks;
      expect(pointer!.target).toBe(core!.target);
      expect(source.animationPointerForTrack?.(pointer!)?.required).toBe(true);
      expect(source.animationPointerForTrack?.(core!)).toBeUndefined();
      const output = exportGLTF(sceneFromGLTFAsset(source));
      expect(json(output).animations[0].channels.map((channel: any) => channel.target.path)).toEqual(["translation", "pointer"]);
      const reloaded = await loader.load({ url: reloadUrl(output), type: "gltf" }, new LoadContext());
      try {
        const [coreAgain, pointerAgain] = reloaded.animations[0]!.tracks;
        expect(coreAgain!.target).toBe(pointerAgain!.target);
        expect(reloaded.animationPointerForTrack?.(coreAgain!)).toBeUndefined();
        expect(reloaded.animationPointerForTrack?.(pointerAgain!)).toMatchObject({ required: true, channelIndex: 1 });
      } finally {
        loader.dispose(reloaded);
      }
    } finally {
      loader.dispose(source);
    }
  });

  it.each([
    ["rotation", false], ["rotation", true], ["scale", false], ["scale", true]
  ] as const)("round-trips a %s node pointer with required=%s", async (path, required) => {
    const loader = new GLTFLoader();
    const source = await load(loader, authoredTransform(path, required));
    try {
      const snapshot = sceneFromGLTFAsset(source);
      const output = exportGLTF(snapshot);
      const doc = json(output);
      expect((doc.extensionsRequired ?? []).includes("KHR_animation_pointer")).toBe(required);
      expect(doc.animations[0].channels[0].target.extensions.KHR_animation_pointer.pointer).toBe(`/nodes/1/${path}`);
      const reloaded = await loader.load({ url: reloadUrl(output), type: "gltf" }, new LoadContext());
      const scene = reloaded.createScene();
      const runtime = createGLTFSceneAnimationRuntime({ scene, clips: reloaded.animations, asset: reloaded });
      try {
        expect(reloaded.animationPointerForTrack?.(reloaded.animations[0]!.tracks[0]!)).toMatchObject({ required });
        expect(runtime.applyClipByName("motion", 1).missingTargets).toEqual([]);
        expect(path === "rotation" ? scene.findByName("Root")[0]!.transform.rotation : scene.findByName("Root")[0]!.transform.scale)
          .toEqual(path === "rotation" ? [0, 0, 1, 0] : [2, 3, 4]);
      } finally {
        runtime.dispose(); scene.dispose(); loader.dispose(reloaded);
      }
    } finally {
      loader.dispose(source);
    }
  });

  it.each([
    [false, 1], [true, 1], [false, 2], [true, 2]
  ] as const)("retains cubic morph node pointers, required=%s, primitives=%s", async (required, primitiveCount) => {
    const loader = new GLTFLoader();
    const source = await load(loader, authoredMorph(required, primitiveCount));
    try {
      const snapshot = sceneFromGLTFAsset(source);
      const channels = snapshot.animations![0]!.pointerChannels!;
      expect(channels).toHaveLength(primitiveCount);
      for (const channel of channels) {
        expect(inspectExportPointerChannelProvenance(snapshot, channel)).toMatchObject({
          status: "verified", provenance: { pointer: "/nodes/0/weights", required }
        });
        expect(channel.values.itemSize).toBe(1);
        expect(Array.from(channel.values.values)).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 1, 0.5, 0, 0]);
      }
      const output = exportGLTF(snapshot);
      const doc = json(output);
      expect((doc.extensionsRequired ?? []).includes("KHR_animation_pointer")).toBe(required);
      expect(doc.animations[0].samplers.every((sampler: any) => sampler.interpolation === "CUBICSPLINE")).toBe(true);
      const reloaded = await loader.load({ url: reloadUrl(output), type: "gltf" }, new LoadContext());
      const scene = reloaded.createScene();
      const runtime = createGLTFSceneAnimationRuntime({ scene, clips: reloaded.animations, asset: reloaded });
      try {
        expect(reloaded.animations[0]!.tracks).toHaveLength(primitiveCount);
        expect(reloaded.animations[0]!.tracks.every((track) => reloaded.animationPointerForTrack?.(track)?.required === required)).toBe(true);
        expect(runtime.applyClipByName("expression", 0.5).missingTargets).toEqual([]);
        const target = scene.findByName("Target")[0]!;
        const affected = primitiveCount === 1 ? [target.renderable!] : target.children.map((node) => node.renderable!);
        expect(affected.map((renderable) => renderable.morphWeights)).toEqual(
          Array.from({ length: primitiveCount }, () => [0.625, 0.25])
        );
        const other = scene.findByName("Other")[0]!;
        const untouched = primitiveCount === 1 ? [other.renderable!] : other.children.map((node) => node.renderable!);
        expect(untouched.map((renderable) => renderable.morphWeights)).toEqual(
          Array.from({ length: primitiveCount }, () => [0, 0])
        );
      } finally {
        runtime.dispose(); scene.dispose(); loader.dispose(reloaded);
      }
    } finally {
      loader.dispose(source);
    }
  });

  it("writes direct node pointer defaults and scales translations without mutating input buffers", () => {
    const times = new Float32Array([0, 1]);
    const values = new Float32Array([0, 0, 0, 2, 3, 4]);
    const input: AuraExportScene = {
      nodes: [{ name: "Root" }], roots: [0], metersPerUnit: 2, upAxis: "Y",
      animations: [{ channels: [], pointerChannels: [{
        pointer: "/nodes/0/translation", times: { itemSize: 1, values: times }, values: { itemSize: 3, values }
      }] }]
    };
    const output = exportGLTF(input);
    const doc = json(output);
    expect(doc.nodes[0].translation).toEqual([0, 0, 0]);
    expect(input.nodes[0]!.translation).toBeUndefined();
    expect(doc.extensionsRequired ?? []).not.toContain("KHR_animation_pointer");
    expect(output.warnings).toContainEqual(expect.objectContaining({ code: "ANIMATION_POINTER_REQUIREDNESS_UNAVAILABLE" }));
    const sampler = doc.animations[0].samplers[0], accessor = doc.accessors[sampler.output], view = doc.bufferViews[accessor.bufferView];
    const uri = doc.buffers[0].uri as string;
    const bytes = Buffer.from(uri.slice(uri.indexOf(",") + 1), "base64");
    const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(Array.from({ length: 6 }, (_, i) => data.getFloat32((view.byteOffset ?? 0) + i * 4, true))).toEqual([0, 0, 0, 4, 6, 8]);
    expect(input.animations![0]!.pointerChannels![0]!.values.values).toBe(values);
    expect(Array.from(values)).toEqual([0, 0, 0, 2, 3, 4]);
  });

  it("validates node pointer indices, matrices, weights, rotations and canonical paths", () => {
    const times = { itemSize: 1 as const, values: new Float32Array([0, 1]) };
    const vectors = { itemSize: 3 as const, values: new Float32Array([0, 0, 0, 2, 3, 4]) };
    const write = (pointer: string, values: AuraExportAttribute = vectors, node: AuraExportScene["nodes"][number] = { name: "Root" }) =>
      exportGLTF({ nodes: [node], roots: [0], metersPerUnit: 1, upAxis: "Y",
        animations: [{ channels: [], pointerChannels: [{ pointer, times, values }] }] });
    expect(() => write("/nodes/00/translation")).toThrow(/not a supported/);
    expect(() => write("/nodes/1/translation")).toThrow(/unavailable node/);
    expect(() => write("/nodes/0/translation", vectors, { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] })).toThrow(/matrix node/);
    expect(() => write("/nodes/0/weights", { itemSize: 1, values: new Float32Array([0, 1]) })).toThrow(/consistent morph targets/);
    expect(() => write("/nodes/0/rotation", { itemSize: 4, values: new Float32Array([0, 0, 0, 2, 0, 0, 0, 1]) })).toThrow(/unit quaternions/);
  });

  it("does not invent source requiredness for a reconstructed track or hand-authored interchange", async () => {
    const loader = new GLTFLoader();
    const source = await load(loader, authored("material", true));
    try {
      const original = source.animations[0]!;
      const reconstructed = AnimationClip.fromJSON(original.toJSON());
      expect(source.animationPointerForTrack?.(reconstructed.tracks[0]!)).toBeUndefined();
      const snapshot = sceneFromGLTFAsset({ ...source, animations: [reconstructed] });
      expect(snapshot.animations).toEqual(sceneFromGLTFAsset(source).animations);
      expect(snapshot.sourceWarnings).toContainEqual(expect.objectContaining({
        code: "ANIMATION_POINTER_ORIGIN_UNAVAILABLE", path: "animations[0].tracks[0]"
      }));
      const pointer = snapshot.animations![0]!.pointerChannels![0]!;
      expect(inspectExportPointerChannelProvenance(snapshot, pointer)).toBeUndefined();
      const manual: AuraExportScene = {
        nodes: [{ name: "Root" }], roots: [0], metersPerUnit: 1, upAxis: "Y", uvOrigin: "top-left",
        materials: [{ name: "Paint", metallic: 0.25 }],
        animations: [{ channels: [], pointerChannels: [pointer] }]
      };
      for (const input of [snapshot, manual]) {
        const result = exportGLTF(input);
        expect(result.warnings).toContainEqual(expect.objectContaining({ code: "ANIMATION_POINTER_REQUIREDNESS_UNAVAILABLE" }));
        expect(json(result).extensionsRequired ?? []).not.toContain("KHR_animation_pointer");
      }
      expect(source.animationPointerForTrack?.(original.tracks[0]!)?.required).toBe(true);
    } finally {
      loader.dispose(source);
    }
  });

  it.each([false, true])("does not transfer changed material-pointer provenance, required=%s", async (required) => {
    const loader = new GLTFLoader();
    const source = await load(loader, authored("material", required));
    try {
      const snapshot = sceneFromGLTFAsset(source);
      const channel = snapshot.animations![0]!.pointerChannels![0]!;
      const originalPointer = channel.pointer;
      const changedPointer = "/materials/0/pbrMetallicRoughness/roughnessFactor";
      expect(inspectExportPointerChannelProvenance(snapshot, channel)?.status).toBe("verified");
      expect(Reflect.set(channel, "pointer", changedPointer)).toBe(true);
      expect(inspectExportPointerChannelProvenance(snapshot, channel)).toMatchObject({
        status: "changed-target", provenance: { pointer: originalPointer, required }
      });
      if (required) {
        expect(() => exportGLTF(snapshot)).toThrowError(expect.objectContaining({
          code: "GLTF_REQUIRED_ANIMATION_POINTER_LOST", path: "animations[0].pointerChannels[0]", pointer: originalPointer
        }));
      } else {
        const changed = exportGLTF(snapshot);
        expect(json(changed).extensionsRequired ?? []).not.toContain("KHR_animation_pointer");
        expect(json(changed).animations[0].channels[1].target.extensions.KHR_animation_pointer.pointer).toBe(changedPointer);
        expect(changed.warnings).toContainEqual(expect.objectContaining({ code: "ANIMATION_POINTER_PROVENANCE_CHANGED" }));
        expect(changed.warnings.map((warning) => warning.code)).not.toContain("REQUIRED_ANIMATION_POINTER_LOST");
        const reloaded = await loader.load({ url: reloadUrl(changed), type: "gltf" }, new LoadContext());
        try {
          const track = reloaded.animations[0]!.tracks[1]!;
          expect(track.target).toBe("material:Paint.pbrMetallicRoughness.roughnessFactor");
          expect(reloaded.animationPointerForTrack?.(track)).toEqual({
            animationIndex: 0, channelIndex: 1, pointer: changedPointer, required: false
          });
          expect(track.sample(0.5)).toBe(0.5);
        } finally {
          loader.dispose(reloaded);
        }
      }
      expect(Reflect.set(channel, "pointer", originalPointer)).toBe(true);
      expect(inspectExportPointerChannelProvenance(snapshot, channel)?.status).toBe("verified");
      const restored = json(exportGLTF(snapshot));
      expect((restored.extensionsRequired ?? []).includes("KHR_animation_pointer")).toBe(required);
      expect(restored.animations[0].channels[1].target.extensions.KHR_animation_pointer.pointer).toBe(originalPointer);

      const replaced: AuraExportScene = { ...snapshot, materials: snapshot.materials!.map((material) => ({ ...material })) };
      expect(inspectExportPointerChannelProvenance(replaced, channel)?.status).toBe("changed-target");
      if (required) {
        expect(() => exportGLTF(replaced)).toThrowError(expect.objectContaining({
          code: "GLTF_REQUIRED_ANIMATION_POINTER_LOST", path: "animations[0].pointerChannels[0]", pointer: originalPointer
        }));
      } else {
        const replacedOutput = exportGLTF(replaced);
        expect(json(replacedOutput).extensionsRequired ?? []).not.toContain("KHR_animation_pointer");
        expect(json(replacedOutput).animations[0].channels[1].target.extensions.KHR_animation_pointer.pointer).toBe(originalPointer);
        expect(replacedOutput.warnings).toContainEqual(expect.objectContaining({ code: "ANIMATION_POINTER_PROVENANCE_CHANGED" }));
      }

      const cloned = structuredClone(snapshot);
      const reconstructed = cloned.animations![0]!.pointerChannels![0]!;
      expect(inspectExportPointerChannelProvenance(cloned, reconstructed)).toBeUndefined();
      const clonedOutput = exportGLTF(cloned);
      expect(json(clonedOutput).extensionsRequired ?? []).not.toContain("KHR_animation_pointer");
      expect(clonedOutput.warnings).toContainEqual(expect.objectContaining({ code: "ANIMATION_POINTER_REQUIREDNESS_UNAVAILABLE" }));
      expect(source.animationPointerForTrack?.(source.animations[0]!.tracks[0]!)?.required).toBe(required);
    } finally {
      loader.dispose(source);
    }
  });

  it.each([false, true])("does not transfer morph-pointer provenance to a replaced node or mesh, required=%s", async (required) => {
    const loader = new GLTFLoader();
    const source = await load(loader, authoredMorph(required, 1));
    try {
      const snapshot = sceneFromGLTFAsset(source);
      const channel = snapshot.animations![0]!.pointerChannels![0]!;
      const nodeIndex = Number(/^\/nodes\/(\d+)\//.exec(channel.pointer)![1]);
      const node = snapshot.nodes[nodeIndex]!;
      const meshIndex = node.mesh!;
      const changedNodes = [...snapshot.nodes];
      changedNodes[nodeIndex] = { ...node };
      const changedMeshes = [...snapshot.meshes!];
      changedMeshes[meshIndex] = { ...changedMeshes[meshIndex]! };
      for (const edited of [
        { ...snapshot, nodes: changedNodes },
        { ...snapshot, meshes: changedMeshes }
      ]) {
        expect(inspectExportPointerChannelProvenance(edited, channel)?.status).toBe("changed-target");
        if (required) {
          expect(() => exportGLTF(edited)).toThrowError(expect.objectContaining({
            code: "GLTF_REQUIRED_ANIMATION_POINTER_LOST",
            path: "animations[0].pointerChannels[0]", pointer: "/nodes/0/weights"
          }));
        } else {
          const output = exportGLTF(edited);
          const doc = json(output);
          expect(doc.extensionsRequired ?? []).not.toContain("KHR_animation_pointer");
          expect(doc.animations[0].channels[0].target.extensions.KHR_animation_pointer.pointer).toBe(channel.pointer);
          expect(output.warnings).toContainEqual(expect.objectContaining({ code: "ANIMATION_POINTER_PROVENANCE_CHANGED" }));
          const reloaded = await loader.load({ url: reloadUrl(output), type: "gltf" }, new LoadContext());
          try {
            const track = reloaded.animations[0]!.tracks[0]!;
            expect(reloaded.animationPointerForTrack?.(track)).toMatchObject({ pointer: channel.pointer, required: false });
            expect(track.sample(0.5)).toEqual([0.625, 0.25]);
          } finally {
            loader.dispose(reloaded);
          }
        }
      }
      expect(inspectExportPointerChannelProvenance(snapshot, channel)?.status).toBe("verified");
    } finally {
      loader.dispose(source);
    }
  });

  it.each([
    ["material", false], ["material", true], ["node-pointer", false], ["node-pointer", true]
  ] as const)("does not transfer a retargeted %s track's provenance, required=%s", async (kind, required) => {
    const loader = new GLTFLoader();
    const source = await load(loader, authored(kind, required));
    try {
      const track = source.animations[0]!.tracks[0]!;
      const pointer = kind === "material" ? "/materials/0/pbrMetallicRoughness/metallicFactor" : "/nodes/0/translation";
      const changedTarget = kind === "material" ? "material:Paint.pbrMetallicRoughness.roughnessFactor" : "Root.scale";
      expect(Reflect.set(track, "target", changedTarget)).toBe(true);
      expect(source.animationPointerForTrack?.(track)).toMatchObject({ pointer, required });
      const snapshot = sceneFromGLTFAsset(source);
      expect(snapshot.sourceWarnings).toContainEqual(expect.objectContaining({
        code: "ANIMATION_TRACK_LOST", path: "animations[0].tracks[0]"
      }));
      if (required) {
        expect(snapshot.sourceWarnings).toContainEqual(expect.objectContaining({
          code: "REQUIRED_ANIMATION_POINTER_LOST", path: "animations[0].tracks[0]"
        }));
        expect(() => exportGLTF(snapshot)).toThrowError(expect.objectContaining({
          code: "GLTF_REQUIRED_ANIMATION_POINTER_LOST", path: "animations[0].tracks[0]", pointer
        }));
      } else {
        expect(snapshot.sourceWarnings?.map((warning) => warning.code)).not.toContain("REQUIRED_ANIMATION_POINTER_LOST");
        const output = exportGLTF(snapshot);
        const doc = json(output);
        expect(doc.extensionsUsed ?? []).not.toContain("KHR_animation_pointer");
        expect(doc.extensionsRequired ?? []).not.toContain("KHR_animation_pointer");
        // A retargeted node pointer is not silently reclassified as core.
        if (kind === "node-pointer") expect(doc.animations).toBeUndefined();
        else expect(doc.animations[0].channels.map((channel: any) => channel.target.path)).toEqual(["translation"]);
      }
    } finally {
      loader.dispose(source);
    }
  });

  it.each([false, true])("distinguishes an intentionally removed pointer channel, required=%s", async (required) => {
    const loader = new GLTFLoader();
    const source = await load(loader, authored("material", required));
    try {
      const snapshot = sceneFromGLTFAsset(source);
      const animations = snapshot.animations!.map((animation) => ({ ...animation, pointerChannels: [] }));
      const edited: AuraExportScene = { ...snapshot, animations };
      if (required) {
        const loss = {
          code: "GLTF_REQUIRED_ANIMATION_POINTER_LOST",
          path: "animations[0].tracks[0]", pointer: "/materials/0/pbrMetallicRoughness/metallicFactor"
        };
        expect(() => exportGLTF(edited)).toThrowError(expect.objectContaining(loss));
        // Removing diagnostics cannot erase the contract attached to the original snapshot.
        expect(Reflect.set(snapshot, "animations", animations)).toBe(true);
        expect(Reflect.set(snapshot, "sourceWarnings", [])).toBe(true);
        expect(() => exportGLTF(snapshot)).toThrowError(expect.objectContaining(loss));
      } else {
        const output = exportGLTF(edited);
        const doc = json(output);
        expect(doc.extensionsUsed ?? []).not.toContain("KHR_animation_pointer");
        expect(doc.extensionsRequired ?? []).not.toContain("KHR_animation_pointer");
        expect(doc.animations[0].channels.map((channel: any) => channel.target.path)).toEqual(["translation"]);
        const reloaded = await loader.load({ url: reloadUrl(output), type: "gltf" }, new LoadContext());
        try {
          const core = reloaded.animations[0]!.tracks[0]!;
          expect(reloaded.animationPointerForTrack?.(core)).toBeUndefined();
          expect(core.sample(1)).toEqual([2, 3, 4]);
        } finally {
          loader.dispose(reloaded);
        }
      }
    } finally {
      loader.dispose(source);
    }
  });

  it("fails rather than promoting an unknown pointer when mixed with a verified required pointer", async () => {
    const loader = new GLTFLoader();
    const source = await load(loader, authored("material", true));
    try {
      const snapshot = sceneFromGLTFAsset(source);
      const animation = snapshot.animations![0]!;
      const original = animation.pointerChannels![0]!;
      const reconstructed = { ...original, pointer: "/materials/0/pbrMetallicRoughness/roughnessFactor" };
      expect(inspectExportPointerChannelProvenance(snapshot, reconstructed)).toBeUndefined();
      const mixed: AuraExportScene = { ...snapshot, animations: [{ ...animation, pointerChannels: [original, reconstructed] }] };
      expect(() => exportGLTF(mixed)).toThrowError(expect.objectContaining({
        code: "GLTF_UNREPRESENTABLE_ANIMATION_POINTER_REQUIREDNESS",
        requiredPointerCount: 1, optionalPointerCount: 0, unknownPointerCount: 1
      }));
    } finally {
      loader.dispose(source);
    }
  });

  it("fails rather than promoting a verified optional pointer when mixed with a required pointer", async () => {
    const loader = new GLTFLoader();
    const optionalDoc = authored("material", false) as Record<string, any>;
    optionalDoc.materials.push({ name: "Other", pbrMetallicRoughness: { metallicFactor: 0.25 } });
    optionalDoc.animations[0].channels[0].target.extensions.KHR_animation_pointer.pointer = "/materials/1/pbrMetallicRoughness/metallicFactor";
    const required = await load(loader, authored("material", true));
    const optional = await load(loader, optionalDoc);
    try {
      const requiredScene = sceneFromGLTFAsset(required), optionalScene = sceneFromGLTFAsset(optional);
      const requiredChannel = requiredScene.animations![0]!.pointerChannels![0]!;
      const optionalChannel = optionalScene.animations![0]!.pointerChannels![0]!;
      const combined: AuraExportScene = {
        ...requiredScene,
        materials: [requiredScene.materials![0]!, optionalScene.materials![1]!],
        animations: [{ channels: [], pointerChannels: [requiredChannel, optionalChannel] }]
      };
      expect(inspectExportPointerChannelProvenance(combined, requiredChannel)).toMatchObject({ status: "verified", provenance: { required: true } });
      expect(inspectExportPointerChannelProvenance(combined, optionalChannel)).toMatchObject({ status: "verified", provenance: { required: false } });
      expect(() => exportGLTF(combined)).toThrowError(expect.objectContaining({
        code: "GLTF_UNREPRESENTABLE_ANIMATION_POINTER_REQUIREDNESS",
        requiredPointerCount: 1, optionalPointerCount: 1, unknownPointerCount: 0
      }));
    } finally {
      loader.dispose(required); loader.dispose(optional);
    }
  });

  it.each([false, true])("does not infer requiredness=%s from pending versus final failed live textures", async (required) => {
    const loader = new GLTFLoader();
    const source = await load(loader, authored("normal", required));
    const scene = source.createScene();
    const texture = new Texture({ width: 1, height: 1, data: new Uint8Array([128, 128, 255, 255]), colorSpace: "linear" });
    const pendingMaterial = new TexturedPBRMaterial({ name: "Paint", normalTexture: texture });
    const failedMaterial = new TexturedPBRMaterial({ name: "Paint", normalTexture: texture });
    const original = pendingMaterial.getParameter("u_normalTexture") as TextureBinding;
    pendingMaterial.setParameter("u_normalTexture", new TextureBinding({
      name: "u_normalTexture", texture, sampler: original.sampler, ready: false
    }));
    const pending = createGLTFSceneAnimationRuntime({
      scene, asset: source, clips: source.animations,
      resolveAnimationMaterial: createGLBActorAnimationMaterialResolver({ materialLibrary: new Map([["Paint", pendingMaterial]]) }, source)
    });
    const failed = createGLTFSceneAnimationRuntime({
      scene, asset: source, clips: source.animations,
      resolveAnimationMaterial: createGLBActorAnimationMaterialResolver({
        materialLibrary: new Map([["Paint", failedMaterial]]),
        loadIssues: [{ code: "texture-load-failed", textureIndex: 0, imageIndex: 0 }]
      }, source, { textureLoadFailuresFinal: true })
    });
    try {
      const track = source.animations[0]!.tracks[0]!;
      expect(source.animationPointerForTrack?.(track)?.required).toBe(required);
      expect(pending.inspectTrackBinding(track)).toMatchObject({ status: "pending", reason: "missing-map" });
      const pendingOutput = exportGLTF(sceneFromGLTFAsset(source, scene));
      expect(failed.inspectTrackBinding(track)).toMatchObject({ status: "unavailable", reason: "texture-load-failed" });
      const failedOutput = exportGLTF(sceneFromGLTFAsset(source, scene));
      expect(pendingOutput.data).toEqual(failedOutput.data);
      expect((json(pendingOutput).extensionsRequired ?? []).includes("KHR_animation_pointer")).toBe(required);
      expect(pendingOutput.warnings.map((warning) => warning.code)).not.toContain("ANIMATION_POINTER_REQUIREDNESS_UNAVAILABLE");
      expect(pending.inspectTrackBinding(track)).toMatchObject({ status: "pending" });
      expect(failed.inspectTrackBinding(track)).toMatchObject({ status: "unavailable" });
      expect(source.animationPointerForTrack?.(track)?.required).toBe(required);
    } finally {
      pending.dispose();
      failed.dispose();
      pendingMaterial.dispose();
      failedMaterial.dispose();
      texture.dispose();
      scene.dispose();
      loader.dispose(source);
    }
  });

  it("preserves actor rejection for a required pointer after a final failed texture roundtrip", async () => {
    const loader = new GLTFLoader();
    const document = authored("normal", true);
    const source = await load(loader, document);
    const result = exportGLTF(sceneFromGLTFAsset(source));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const options = {
      width: 8, height: 8, shareTextures: false, request: { credentials: "include" as const },
      imageDecoder: () => { throw new Error("permanent decode failure"); }
    };
    try {
      await expect(createTypedGLBActor({
        ...options, id: "required-export-source", asset: { url: url(document), format: "gltf" }
      })).rejects.toMatchObject({
        code: "GLTF_REQUIRED_ANIMATION_POINTER_BINDING_UNAVAILABLE",
        pointer: "/materials/0/normalTexture/scale", reason: "texture-load-failed"
      });
      expect(json(result).extensionsRequired).toContain("KHR_animation_pointer");
      await expect(createTypedGLBActor({
        ...options, id: "required-export-roundtrip", asset: { url: reloadUrl(result), format: "gltf" }
      })).rejects.toMatchObject({
        code: "GLTF_REQUIRED_ANIMATION_POINTER_BINDING_UNAVAILABLE",
        pointer: "/materials/0/normalTexture/scale", reason: "texture-load-failed"
      });
    } finally {
      warn.mockRestore();
      loader.dispose(source);
    }
  });

  it("preserves optional actor admission after the same final texture failure", async () => {
    const loader = new GLTFLoader();
    const document = authored("normal", false);
    const source = await load(loader, document);
    const result = exportGLTF(sceneFromGLTFAsset(source));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const actors: TypedGLBActor[] = [];
    const options = {
      width: 8, height: 8, shareTextures: false, request: { credentials: "include" as const },
      imageDecoder: () => { throw new Error("permanent decode failure"); }
    };
    try {
      expect(json(result).extensionsRequired ?? []).not.toContain("KHR_animation_pointer");
      for (const [id, assetUrl] of [["optional-export-source", url(document)], ["optional-export-roundtrip", reloadUrl(result)]]) {
        const actor = await createTypedGLBActor({ ...options, id, asset: { url: assetUrl, format: "gltf" } });
        actors.push(actor);
        const track = actor.pipeline.asset.animations[0]!.tracks[0]!;
        expect(actor.pipeline.asset.animationPointerForTrack?.(track)?.required).toBe(false);
        expect(actor.animation.inspectTrackBinding(track)).toMatchObject({ status: "unavailable", reason: "texture-load-failed" });
      }
    } finally {
      for (const actor of actors) actor.dispose();
      warn.mockRestore();
      loader.dispose(source);
    }
  });

  it("allows a pending required texture binding on both sides of the export", async () => {
    const loader = new GLTFLoader();
    const document = authored("normal", true);
    const source = await load(loader, document);
    const result = exportGLTF(sceneFromGLTFAsset(source));
    const actors: TypedGLBActor[] = [];
    const unregister = registerTypedGLBActorExtension({
      id: "test.export-pending-texture", owner: "test",
      onLoad(actor) {
        const material = actor.pipeline.resources.materialLibrary.get("Paint")!;
        const binding = material.getParameter("u_normalTexture") as TextureBinding;
        material.setParameter("u_normalTexture", new TextureBinding({
          name: "u_normalTexture", texture: binding.texture, sampler: binding.sampler, ready: false
        }));
      }
    });
    const options = {
      width: 8, height: 8, shareTextures: false, request: { credentials: "include" as const },
      imageDecoder: () => ({ width: 1, height: 1, data: new Uint8Array([128, 128, 255, 255]), colorSpace: "linear" as const })
    };
    try {
      expect(json(result).extensionsRequired).toContain("KHR_animation_pointer");
      for (const [id, assetUrl] of [["pending-export-source", url(document)], ["pending-export-roundtrip", reloadUrl(result)]]) {
        const actor = await createTypedGLBActor({ ...options, id, asset: { url: assetUrl, format: "gltf" } });
        actors.push(actor);
        const track = actor.pipeline.asset.animations[0]!.tracks[0]!;
        expect(actor.pipeline.asset.animationPointerForTrack?.(track)?.required).toBe(true);
        expect(actor.animation.inspectTrackBinding(track)).toMatchObject({ status: "pending", reason: "missing-map" });
      }
    } finally {
      for (const actor of actors) actor.dispose();
      unregister();
      loader.dispose(source);
    }
  });

  it.each([false, true])("does not misrepresent an unavailable node pointer, required=%s", async (required) => {
    const loader = new GLTFLoader();
    const document = authored("off-scene-pointer", required);
    const source = await load(loader, document);
    const scene = source.createScene();
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: source.animations, asset: source });
    let actor: TypedGLBActor | undefined;
    const pointer = "/nodes/1/translation";
    try {
      const track = source.animations[0]!.tracks[0]!;
      expect(source.animationPointerForTrack?.(track)).toMatchObject({ pointer, required });
      expect(runtime.inspectTrackBinding(track)).toMatchObject({ status: "unavailable", reason: "missing-node" });
      const snapshot = sceneFromGLTFAsset(source, scene);
      expect(snapshot.sourceWarnings).toContainEqual(expect.objectContaining({
        code: "ANIMATION_TRACK_LOST", path: "animations[0].tracks[0]"
      }));
      if (required) {
        expect(snapshot.sourceWarnings).toContainEqual(expect.objectContaining({
          code: "REQUIRED_ANIMATION_POINTER_LOST", path: "animations[0].tracks[0]"
        }));
        expect(() => exportGLTF(snapshot)).toThrowError(expect.objectContaining({
          code: "GLTF_REQUIRED_ANIMATION_POINTER_LOST", path: "animations[0].tracks[0]", pointer
        }));
        await expect(createTypedGLBActor({
          id: "off-scene-required", asset: { url: url(document), format: "gltf" }, width: 8, height: 8
        })).rejects.toMatchObject({
          code: "GLTF_REQUIRED_ANIMATION_POINTER_BINDING_UNAVAILABLE", pointer, reason: "missing-node"
        });
      } else {
        const result = exportGLTF(snapshot);
        expect(result.warnings).toContainEqual(expect.objectContaining({ code: "ANIMATION_TRACK_LOST" }));
        expect(result.warnings.map((warning) => warning.code)).not.toContain("REQUIRED_ANIMATION_POINTER_LOST");
        expect(json(result).animations).toBeUndefined();
        expect(json(result).extensionsUsed ?? []).not.toContain("KHR_animation_pointer");
        expect(json(result).extensionsRequired ?? []).not.toContain("KHR_animation_pointer");
        actor = await createTypedGLBActor({
          id: "off-scene-optional", asset: { url: url(document), format: "gltf" }, width: 8, height: 8
        });
        const actorTrack = actor.pipeline.asset.animations[0]!.tracks[0]!;
        expect(actor.pipeline.asset.animationPointerForTrack?.(actorTrack)).toMatchObject({ pointer, required: false });
        expect(actor.animation.inspectTrackBinding(actorTrack)).toMatchObject({ status: "unavailable", reason: "missing-node" });
        expect(actor.playClip("motion", 1).missingTargets).toContain(actorTrack.target);
      }
    } finally {
      actor?.dispose();
      runtime.dispose();
      scene.dispose();
      loader.dispose(source);
    }
  });

  it.each([
    { extension: "KHR_materials_specular", leaf: "specularFactor", start: 0.25, end: 0.75, uniform: "u_specularFactor" },
    { extension: "KHR_materials_sheen", leaf: "sheenRoughnessFactor", start: 0.25, end: 0.75, uniform: "u_sheenRoughnessFactor" },
    { extension: "KHR_materials_iridescence", leaf: "iridescenceFactor", start: 0.25, end: 0.75, uniform: "u_iridescenceFactor" },
    { extension: "KHR_materials_iridescence", leaf: "iridescenceIor", start: 1.25, end: 1.75, uniform: "u_iridescenceIor" }
  ])("round-trips $extension/$leaf with its exact required or optional identity", async ({ extension, leaf, start, end, uniform }) => {
    const loader = new GLTFLoader();
    const pointer = `/materials/0/extensions/${extension}/${leaf}`;
    const target = `material:Paint.extensions.${extension}.${leaf}`;
    const payloads: Record<string, any>[] = [];
    for (const required of [true, false]) {
      const document = authored("material", required) as Record<string, any>;
      const bytes = Buffer.from(new Float32Array([0, 1, start, end, 0, 0, 0, 2, 3, 4]).buffer);
      document.buffers[0] = { uri: `data:application/octet-stream;base64,${bytes.toString("base64")}`, byteLength: bytes.length };
      document.extensionsUsed.push(extension);
      document.materials[0].extensions = { [extension]: { [leaf]: start } };
      document.animations[0].channels[0].target.extensions.KHR_animation_pointer.pointer = pointer;
      const source = await load(loader, document);
      const actors: TypedGLBActor[] = [];
      try {
        const [sourceTrack, sourceCore] = source.animations[0]!.tracks;
        expect(sourceTrack).toMatchObject({ target, valueType: "scalar" });
        expect(source.animationPointerForTrack?.(sourceTrack!)).toEqual({
          animationIndex: 0, channelIndex: 0, pointer, required
        });
        expect(source.animationPointerForTrack?.(sourceCore!)).toBeUndefined();
        expect(sourceTrack!.sample(0.5)).toBe((start + end) / 2);

        const snapshot = sceneFromGLTFAsset(source);
        const channel = snapshot.animations![0]!.pointerChannels![0]!;
        expect(inspectExportPointerChannelProvenance(snapshot, channel)).toMatchObject({
          status: "verified", resolvedPointer: pointer,
          provenance: { animationIndex: 0, channelIndex: 0, pointer, exportedPointer: pointer, required }
        });
        expect(Array.from(channel.values.values)).toEqual([start, end]);
        expect(snapshot.sourceWarnings?.map((warning) => warning.code)).not.toContain("ANIMATION_TRACK_LOST");

        const output = exportGLTF(snapshot);
        const doc = json(output);
        payloads.push(doc);
        expect(doc.extensionsUsed).toEqual(expect.arrayContaining(["KHR_animation_pointer", extension]));
        expect(doc.extensionsRequired ?? []).toEqual(required ? ["KHR_animation_pointer"] : []);
        expect(doc.materials[0].extensions[extension][leaf]).toBe(start);
        const animation = doc.animations[0];
        expect(animation.channels.map((entry: any) => entry.target.path)).toEqual(["translation", "pointer"]);
        expect(animation.channels[1].target).toEqual({
          path: "pointer", extensions: { KHR_animation_pointer: { pointer } }
        });
        const sampler = animation.samplers[animation.channels[1].sampler];
        expect(sampler.interpolation).toBe("LINEAR");
        expect(doc.accessors[sampler.input]).toMatchObject({ componentType: 5126, type: "SCALAR", count: 2 });
        expect(doc.accessors[sampler.output]).toMatchObject({ componentType: 5126, type: "SCALAR", count: 2 });
        expect(exportedFloatValues(doc, sampler.input, 1)).toEqual([0, 1]);
        expect(exportedFloatValues(doc, sampler.output, 1)).toEqual([start, end]);
        expect(output.warnings.map((warning) => warning.code)).not.toContain("ANIMATION_POINTER_REQUIREDNESS_UNAVAILABLE");

        const reloaded = await loader.load({ url: reloadUrl(output), type: "gltf" }, new LoadContext());
        try {
          const [core, resultTrack] = reloaded.animations[0]!.tracks;
          expect(reloaded.animationPointerForTrack?.(core!)).toBeUndefined();
          expect(core!.target).toBe("Root.translation");
          expect(core!.sample(1)).toEqual([2, 3, 4]);
          expect(resultTrack).toMatchObject({ target, valueType: "scalar" });
          expect(reloaded.animationPointerForTrack?.(resultTrack!)).toEqual({
            animationIndex: 0, channelIndex: 1, pointer, required
          });
          expect(resultTrack!.sample(0)).toBe(start);
          expect(resultTrack!.sample(0.5)).toBe((start + end) / 2);
          expect(resultTrack!.sample(1)).toBe(end);
        } finally {
          loader.dispose(reloaded);
        }

        for (const [id, assetUrl] of [["source", url(document)], ["roundtrip", reloadUrl(output)]] as const) {
          const actor = await createTypedGLBActor({
            id: `physical-${leaf}-${required}-${id}`, asset: { url: assetUrl, format: "gltf" }, width: 8, height: 8
          });
          actors.push(actor);
          const track = actor.pipeline.asset.animations[0]!.tracks.find((entry) =>
            actor.pipeline.asset.animationPointerForTrack?.(entry)?.pointer === pointer)!;
          expect(track.target).toBe(target);
          expect(actor.pipeline.asset.animationPointerForTrack?.(track)?.required).toBe(required);
          expect(actor.animation.inspectTrackBinding(track)).toMatchObject({ status: "available" });
          expect(actor.playClip("motion", 0.5)).toMatchObject({ materialTracksApplied: 1, missingTargets: [] });
          expect(actor.pipeline.resources.materialLibrary.get("Paint")!.getParameter(uniform)).toBe((start + end) / 2);
        }
      } finally {
        for (const actor of actors) actor.dispose();
        loader.dispose(source);
      }
    }
    expect(payloads[0]!.animations).toEqual(payloads[1]!.animations);
    expect(payloads[0]!.accessors).toEqual(payloads[1]!.accessors);
    expect(payloads[0]!.bufferViews).toEqual(payloads[1]!.bufferViews);
    expect(payloads[0]!.buffers).toEqual(payloads[1]!.buffers);
  });

  it("still rejects a genuinely unsupported required material pointer while diagnosing the optional channel", async () => {
    const loader = new GLTFLoader();
    const pointer = "/materials/0/extensions/KHR_materials_transmission/transmissionFactor";
    const document = authored("material", true) as Record<string, any>;
    document.extensionsUsed.push("KHR_materials_transmission");
    document.materials[0].extensions = { KHR_materials_transmission: { transmissionFactor: 0.25 } };
    document.animations[0].channels[0].target.extensions.KHR_animation_pointer.pointer = pointer;
    await expect(load(loader, document)).rejects.toThrow(`unsupported required animation pointer: ${pointer}`);

    delete document.extensionsRequired;
    const optional = await load(loader, document);
    try {
      expect(optional.loaderDiagnostics.unsupportedFeatures).toContain(`animation-pointer-unsupported:${pointer}`);
      expect(optional.animations[0]!.tracks.map((track) => track.target)).toEqual(["Root.translation"]);
      const output = exportGLTF(sceneFromGLTFAsset(optional));
      expect(json(output).extensionsUsed ?? []).not.toContain("KHR_animation_pointer");
      expect(json(output).extensionsRequired ?? []).not.toContain("KHR_animation_pointer");
      expect(json(output).animations[0].channels.map((channel: any) => channel.target.path)).toEqual(["translation"]);
    } finally {
      loader.dispose(optional);
    }
  });

  it("leaves other extension flags, input buffers and exported payloads intact", () => {
    const times = new Float32Array([0, 1]);
    const values = new Float32Array([0.25, 0.75]);
    const matrices = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const scene: AuraExportScene = {
      metersPerUnit: 1, upAxis: "Y", uvOrigin: "top-left",
      nodes: [{ name: "Root", mesh: 0, instances: { transforms: matrices } }], roots: [0],
      meshes: [{ primitives: [{ attributes: { POSITION: { itemSize: 3, values: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]) } } }] }],
      materials: [{ name: "Paint", metallic: 0.25 }],
      animations: [{ channels: [{
        node: 0, path: "translation", times: { itemSize: 1, values: times },
        values: { itemSize: 3, values: new Float32Array([0, 0, 0, 2, 3, 4]) }
      }], pointerChannels: [{
        pointer: "/materials/0/pbrMetallicRoughness/metallicFactor",
        times: { itemSize: 1, values: times }, values: { itemSize: 1, values }
      }] }]
    };
    const first = exportGLTF(scene, { embedDependencies: false });
    const second = exportGLTF(scene, { embedDependencies: false });
    const withUnknownOrigin = exportGLTF({
      ...scene, sourceWarnings: [{ code: "SOURCE_DOCUMENT_METADATA_UNAVAILABLE", message: "Source metadata was not retained." }]
    }, { embedDependencies: false });
    const doc = json(first);
    expect(doc.extensionsUsed).toEqual(expect.arrayContaining(["KHR_animation_pointer", "EXT_mesh_gpu_instancing"]));
    expect(doc.extensionsRequired).toEqual(["EXT_mesh_gpu_instancing"]);
    expect(first.data).toEqual(second.data);
    expect(first.dependencies).toEqual(second.dependencies);
    expect(withUnknownOrigin.data).toEqual(first.data);
    expect(withUnknownOrigin.dependencies).toEqual(first.dependencies);
    expect(withUnknownOrigin.warnings).toContainEqual(expect.objectContaining({ code: "ANIMATION_POINTER_ORIGIN_UNAVAILABLE" }));
    const buffer = first.dependencies.find((entry) => entry.name === doc.buffers[0].uri)!.data as Uint8Array;
    const readScalar = (accessorIndex: number): number[] => {
      const accessor = doc.accessors[accessorIndex];
      const view = doc.bufferViews[accessor.bufferView];
      const data = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      return Array.from({ length: accessor.count }, (_, i) => data.getFloat32((view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + i * 4, true));
    };
    const sampler = doc.animations[0].samplers[1];
    expect(sampler.input).not.toBe(sampler.output);
    expect(readScalar(sampler.input)).toEqual([0, 1]);
    expect(readScalar(sampler.output)).toEqual([0.25, 0.75]);
    expect(scene.animations![0]!.pointerChannels![0]!.times.values).toBe(times);
    expect(scene.animations![0]!.pointerChannels![0]!.values.values).toBe(values);
    expect(scene.nodes[0]!.instances!.transforms).toBe(matrices);
    expect(Array.from(times)).toEqual([0, 1]);
    expect(Array.from(values)).toEqual([0.25, 0.75]);
    expect(Array.from(matrices)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });
});
