import { describe, expect, it } from "vitest";
import { AnimationClip } from "../../../packages/animation/src/AnimationClip";
import { AnimationTrack } from "../../../packages/animation/src/AnimationTrack";
import { GLTFLoader, type GLTFAsset } from "../../../packages/assets/src/GLTFLoader";
import { LoadContext } from "../../../packages/assets/src/LoadContext";
import { exportGLTF } from "../../../packages/assets/src/exporters/GLTFExporter";
import { sceneFromGLTFAsset, type AuraExportPointerAnimationChannel, type AuraExportScene } from "../../../packages/assets/src/exporters/ExportContext";

// Small independently authored PNG image, supplied as bytes, so these tests do
// not rely on network resources or a browser image decoder.
const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==", "base64"));
const transform = { offset: [0.25, -0.25] as const, scale: [1, 2] as const, rotation: 0.5 };
const texture = { name: "map.png", transform };
const times = { itemSize: 1 as const, values: new Float32Array([0, 2]) };
const offsetValues = [0.25, -0.25, 0.5, 0.75];
// in-tangent, value, out-tangent for each key. Negative values are legal for
// both UV scale and its derivatives.
const scaleValues = [0.5, -0.5, 1, 1, -1, 2, 2, -2, -2, 3, 1, -1];
const rotationValues = [0.25, -2];
const transformSuffix = "/extensions/KHR_texture_transform/";

// This table describes the document paths, independently of the writer's
// implementation and the snapshot's internal material representation.
const bindings = [
  [0, "pbrMetallicRoughness/baseColorTexture"],
  [0, "pbrMetallicRoughness/metallicRoughnessTexture"],
  [0, "normalTexture"],
  [0, "occlusionTexture"],
  [0, "emissiveTexture"],
  [0, "extensions/KHR_materials_clearcoat/clearcoatTexture"],
  [0, "extensions/KHR_materials_clearcoat/clearcoatRoughnessTexture"],
  [0, "extensions/KHR_materials_clearcoat/clearcoatNormalTexture"],
  [0, "extensions/KHR_materials_diffuse_roughness/diffuseRoughnessTexture"],
  [0, "extensions/EXT_materials_bump/bumpTexture"],
  [0, "extensions/KHR_materials_transmission/transmissionTexture"],
  [0, "extensions/KHR_materials_diffuse_transmission/diffuseTransmissionTexture"],
  [0, "extensions/KHR_materials_diffuse_transmission/diffuseTransmissionColorTexture"],
  [0, "extensions/KHR_materials_volume/thicknessTexture"],
  [0, "extensions/KHR_materials_specular/specularTexture"],
  [0, "extensions/KHR_materials_specular/specularColorTexture"],
  [0, "extensions/KHR_materials_sheen/sheenColorTexture"],
  [0, "extensions/KHR_materials_sheen/sheenRoughnessTexture"],
  [0, "extensions/KHR_materials_anisotropy/anisotropyTexture"],
  [0, "extensions/KHR_materials_iridescence/iridescenceTexture"],
  [0, "extensions/KHR_materials_iridescence/iridescenceThicknessTexture"],
  [1, "extensions/KHR_materials_pbrSpecularGlossiness/diffuseTexture"],
  [1, "extensions/KHR_materials_pbrSpecularGlossiness/specularGlossinessTexture"]
] as const;

function fixture(): AuraExportScene {
  const settings = { transform };
  return {
    nodes: [{ name: "root" }], roots: [0], metersPerUnit: 1, upAxis: "Y", uvOrigin: "top-left",
    dependencies: [{ name: "map.png", data: png, mimeType: "image/png" }],
    materials: [
      {
        name: "Paint.Finish", baseColorTexture: "map.png", metallicRoughnessTexture: "map.png", normalTexture: "map.png", occlusionTexture: "map.png", emissiveTexture: "map.png",
        gltf: {
          textures: { baseColorTexture: settings, metallicRoughnessTexture: settings, normalTexture: settings, occlusionTexture: settings, emissiveTexture: settings },
          clearcoat: { texture, roughnessTexture: texture, normalTexture: texture },
          diffuseRoughness: { texture }, bump: { texture }, transmission: { texture },
          diffuseTransmission: { texture, colorTexture: texture }, volume: { thicknessTexture: texture },
          specular: { texture, colorTexture: texture }, sheen: { colorTexture: texture, roughnessTexture: texture },
          anisotropy: { texture }, iridescence: { texture, thicknessTexture: texture }
        }
      },
      { name: "Legacy", gltf: { pbrSpecularGlossiness: { diffuseTexture: texture, specularGlossinessTexture: texture } } }
    ]
  };
}

function pointerChannel(pointer: string, width: 1 | 2, values: readonly number[], interpolation: "LINEAR" | "STEP" | "CUBICSPLINE" = "LINEAR"): AuraExportPointerAnimationChannel {
  return { pointer, times, values: { itemSize: width, values: new Float32Array(values) }, interpolation };
}
function withChannels(source: AuraExportScene, channels: readonly AuraExportPointerAnimationChannel[]): AuraExportScene {
  return { ...source, animations: [{ name: "uv", channels: [], pointerChannels: channels }] };
}
function document(result: ReturnType<typeof exportGLTF>): Record<string, any> {
  if (!(result.data instanceof Uint8Array)) throw new Error("Expected exported bytes");
  return JSON.parse(new TextDecoder().decode(result.data));
}
function readOutput(doc: Record<string, any>, index: number): number[] {
  const accessor = doc.accessors[index], view = doc.bufferViews[accessor.bufferView];
  const uri = doc.buffers[view.buffer].uri as string;
  const buffer = Buffer.from(uri.slice(uri.indexOf(",") + 1), "base64");
  const data = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const width = ({ SCALAR: 1, VEC2: 2 } as Record<string, number>)[accessor.type];
  return Array.from({ length: accessor.count * width }, (_, i) => data.getFloat32((view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + i * 4, true));
}
function urlFromBytes(bytes: Uint8Array): string {
  return `data:model/gltf+json;base64,${Buffer.from(bytes).toString("base64")}`;
}
function resultUrl(result: ReturnType<typeof exportGLTF>): string {
  if (!(result.data instanceof Uint8Array)) throw new Error("Expected exported bytes");
  return urlFromBytes(result.data);
}

/** Hand-authored source document; no exporter is used to construct the input. */
function authoredDocument(binding: string, options: {
  duplicateName?: boolean; transform?: boolean; leaf?: "offset" | "scale" | "rotation";
  values?: readonly number[]; interpolation?: "LINEAR" | "STEP" | "CUBICSPLINE";
} = {}): Record<string, any> {
  const material: Record<string, any> = { name: "Paint.Finish" };
  const segments = binding.split("/");
  let current = material;
  for (const segment of segments.slice(0, -1)) current = current[segment] ??= {};
  current[segments[segments.length - 1]] = { index: 0, ...(options.transform === false ? {} : { extensions: { KHR_texture_transform: transform } }) };
  const extensionName = segments[0] === "extensions" ? segments[1] : undefined;
  const used = ["KHR_animation_pointer", "KHR_texture_transform", ...(extensionName ? [extensionName] : [])];
  if (extensionName === "KHR_materials_volume") {
    material.extensions.KHR_materials_transmission = {};
    used.push("KHR_materials_transmission");
  }
  const leaf = options.leaf ?? "offset";
  const values = options.values ?? offsetValues;
  const width = leaf === "rotation" ? 1 : 2;
  const keyData = new Float32Array([0, 2, ...values]);
  const pointer = `/materials/0/${binding}${transformSuffix}${leaf}`;
  return {
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: "root" }], extensionsUsed: used,
    images: [{ uri: `data:image/png;base64,${Buffer.from(png).toString("base64")}` }], textures: [{ source: 0 }],
    materials: [material, ...(options.duplicateName ? [{ name: "Paint.Finish" }] : [])],
    buffers: [{ byteLength: keyData.byteLength, uri: `data:application/octet-stream;base64,${Buffer.from(keyData.buffer).toString("base64")}` }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 8 }, { buffer: 0, byteOffset: 8, byteLength: values.length * 4 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 2, type: "SCALAR" }, { bufferView: 1, componentType: 5126, count: values.length / width, type: width === 1 ? "SCALAR" : "VEC2" }],
    animations: [{ name: "uv", samplers: [{ input: 0, output: 1, interpolation: options.interpolation ?? "LINEAR" }], channels: [{ sampler: 0, target: { path: "pointer", extensions: { KHR_animation_pointer: { pointer } } } }] }]
  };
}
async function loadDocument(loader: GLTFLoader, input: Record<string, any>): Promise<GLTFAsset> {
  return loader.load({ url: urlFromBytes(new TextEncoder().encode(JSON.stringify(input))) }, new LoadContext());
}

const sampleBinding = "normalTexture";
const samplePrefix = `/materials/0/${sampleBinding}${transformSuffix}`;

describe("glTF texture-transform pointer animation export", () => {
  it.each(bindings)("writes VEC2 and scalar animation through material %i, %s", (index, binding) => {
    const prefix = `/materials/${index}/${binding}${transformSuffix}`;
    const channels = [
      pointerChannel(`${prefix}offset`, 2, offsetValues),
      pointerChannel(`${prefix}scale`, 2, scaleValues, "CUBICSPLINE"),
      pointerChannel(`${prefix}rotation`, 1, rotationValues, "STEP")
    ];
    const doc = document(exportGLTF(withChannels(fixture(), channels)));
    expect(doc.extensionsUsed).toEqual(expect.arrayContaining(["KHR_animation_pointer", "KHR_texture_transform"]));
    expect(doc.extensionsRequired ?? []).not.toContain("KHR_animation_pointer");
    const clip = doc.animations[0];
    expect(clip.channels.map((channel: any) => channel.target.extensions.KHR_animation_pointer.pointer)).toEqual(channels.map((channel) => channel.pointer));
    expect(clip.channels.every((channel: any) => channel.target.path === "pointer" && channel.target.node === undefined)).toBe(true);
    for (const [i, channel] of clip.channels.entries()) {
      const sampler = clip.samplers[channel.sampler], accessor = doc.accessors[sampler.output];
      expect(accessor.type).toBe(i === 2 ? "SCALAR" : "VEC2");
      expect(sampler.interpolation).toBe(["LINEAR", "CUBICSPLINE", "STEP"][i]);
      expect(readOutput(doc, sampler.output)).toEqual([offsetValues, scaleValues, rotationValues][i]);
    }
  });

  it.each(bindings)("snapshots a loaded offset track for texture binding %i, %s", async (_index, binding) => {
    const loader = new GLTFLoader();
    const input = await loadDocument(loader, authoredDocument(binding));
    const snapshot = sceneFromGLTFAsset(input);
    const channel = snapshot.animations?.[0]?.pointerChannels?.[0];
    expect(channel?.pointer).toBe(`/materials/0/${binding}${transformSuffix}offset`);
    expect(channel?.values.itemSize).toBe(2);
    expect(Array.from(channel?.values.values ?? [])).toEqual(offsetValues);
    expect(snapshot.sourceWarnings?.some((warning) => warning.code === "ANIMATION_TRACK_LOST")).toBe(false);
    const output = document(exportGLTF(snapshot));
    expect(output.animations[0].channels[0].target.extensions.KHR_animation_pointer.pointer).toBe(channel?.pointer);
    expect(readOutput(output, output.animations[0].samplers[0].output)).toEqual(offsetValues);
    loader.dispose(input);
  });

  it("preserves a correctly typed scalar rotation track and cubic VEC2 tangents when snapshotting", async () => {
    const loader = new GLTFLoader();
    const input = await loadDocument(loader, authoredDocument(sampleBinding));
    const target = `material:Paint.Finish.${sampleBinding}.extensions.KHR_texture_transform.`;
    const scalar = new AnimationTrack({ target: `${target}rotation`, valueType: "scalar", keyframes: [
      { time: 0, value: 0.25, interpolation: "step" }, { time: 2, value: -2, interpolation: "step" }
    ] });
    const vector = new AnimationTrack({ target: `${target}scale`, valueType: "number-array", keyframes: [
      { time: 0, inTangent: [0.5, -0.5], value: [1, 1], outTangent: [-1, 2], interpolation: "cubicspline" },
      { time: 2, inTangent: [2, -2], value: [-2, 3], outTangent: [1, -1], interpolation: "cubicspline" }
    ] });
    const snapshot = sceneFromGLTFAsset({ ...input, animations: [new AnimationClip({ name: "uv", tracks: [scalar, vector] })] });
    const channels = snapshot.animations?.[0]?.pointerChannels ?? [];
    expect(channels.map((channel) => channel.pointer)).toEqual([`${samplePrefix}rotation`, `${samplePrefix}scale`]);
    expect(channels.map((channel) => channel.interpolation)).toEqual(["STEP", "CUBICSPLINE"]);
    expect(channels.map((channel) => channel.values.itemSize)).toEqual([1, 2]);
    expect(Array.from(channels[0].values.values)).toEqual(rotationValues);
    expect(Array.from(channels[1].values.values)).toEqual(scaleValues);
    const output = document(exportGLTF(snapshot));
    expect(readOutput(output, output.animations[0].samplers[1].output)).toEqual(scaleValues);
    loader.dispose(input);
  });

  it.each([
    { leaf: "rotation" as const, values: rotationValues, interpolation: "STEP" as const, expected: 0.25 },
    { leaf: "scale" as const, values: scaleValues, interpolation: "CUBICSPLINE" as const, expected: [-1.25, 3] }
  ])("round-trips a sampled $leaf curve from an independently authored glTF document", async ({ leaf, values, interpolation, expected }) => {
    const loader = new GLTFLoader();
    const input = await loadDocument(loader, authoredDocument(sampleBinding, { leaf, values, interpolation }));
    expect(input.animations[0].tracks[0].sample(1)).toEqual(expected);
    const snapshot = sceneFromGLTFAsset(input);
    expect(snapshot.animations?.[0]?.pointerChannels?.[0]).toMatchObject({ pointer: `${samplePrefix}${leaf}`, interpolation });
    loader.dispose(input);
    const written = exportGLTF(snapshot);
    const output = await loader.load({ url: resultUrl(written) }, new LoadContext());
    expect(output.animations[0].tracks[0].sample(1)).toEqual(expected);
    expect(readOutput(document(written), document(written).animations[0].samplers[0].output)).toEqual(values);
    loader.dispose(output);
  });

  it("reports ambiguous names, absent transforms and missing texture bytes as lost tracks", async () => {
    const loader = new GLTFLoader();
    // 5.0 loader contract (GLTFMaterialAsset.name, 0c51a09c6): a repeated
    // authored name loads as `Paint.Finish#1`, so the loaded track names one
    // material and exports to its exact source index. Names are ambiguous only
    // when an adapter restores the colliding authored names; that is lost.
    const duplicated = await loadDocument(loader, authoredDocument(sampleBinding, { duplicateName: true }));
    expect(duplicated.materials.map((material) => material.name)).toEqual(["Paint.Finish", "Paint.Finish#1"]);
    const uniqueSnapshot = sceneFromGLTFAsset(duplicated);
    expect(uniqueSnapshot.sourceWarnings?.filter((warning) => warning.code === "ANIMATION_TRACK_LOST")).toEqual([]);
    expect(uniqueSnapshot.animations?.[0]?.pointerChannels?.map((channel) => channel.pointer)).toEqual([`${samplePrefix}offset`]);
    loader.dispose(duplicated);
    const ambiguous = await loadDocument(loader, authoredDocument(sampleBinding, { duplicateName: true }));
    const ambiguousSnapshot = sceneFromGLTFAsset({ ...ambiguous, materials: ambiguous.materials.map((material) => material.sourceName === undefined ? material : { ...material, name: material.sourceName }) });
    expect(ambiguousSnapshot.animations).toEqual([]);
    expect(ambiguousSnapshot.sourceWarnings?.map((warning) => warning.code)).toEqual(expect.arrayContaining(["ANIMATION_TRACK_LOST", "ANIMATION_CLIP_LOST"]));
    loader.dispose(ambiguous);

    // Supply a valid runtime track to an asset lacking the transform. Source
    // loaders may diagnose and omit nonexistent pointer targets themselves.
    const withoutTransform = authoredDocument(sampleBinding, { transform: false });
    delete withoutTransform.animations;
    const absent = await loadDocument(loader, withoutTransform);
    const target = `material:Paint.Finish.${sampleBinding}.extensions.KHR_texture_transform.offset`;
    const track = new AnimationTrack({ target, valueType: "number-array", keyframes: [
      { time: 0, value: [0.25, -0.25] }, { time: 2, value: [0.5, 0.75] }
    ] });
    const absentSnapshot = sceneFromGLTFAsset({ ...absent, animations: [new AnimationClip({ name: "uv", tracks: [track] })] });
    expect(absentSnapshot.animations).toEqual([]);
    expect(absentSnapshot.sourceWarnings?.map((warning) => warning.code)).toEqual(expect.arrayContaining(["ANIMATION_TRACK_LOST", "ANIMATION_CLIP_LOST"]));
    loader.dispose(absent);

    const input = await loadDocument(loader, authoredDocument(sampleBinding));
    const noImage = { ...input, images: [{ name: "not-retained" }] };
    const snapshot = sceneFromGLTFAsset(noImage);
    expect(snapshot.animations).toEqual([]);
    expect(snapshot.sourceWarnings?.map((warning) => warning.code)).toEqual(expect.arrayContaining(["MISSING_TEXTURE_BYTES", "ANIMATION_TRACK_LOST", "ANIMATION_CLIP_LOST"]));
    loader.dispose(input);
  });

  it("reports wrong runtime track types and mixed interpolation instead of guessing", async () => {
    const loader = new GLTFLoader();
    const input = await loadDocument(loader, authoredDocument(sampleBinding));
    const target = `material:Paint.Finish.${sampleBinding}.extensions.KHR_texture_transform.`;
    const badType = new AnimationTrack({ target: `${target}rotation`, valueType: "number-array", keyframes: [
      { time: 0, value: [0.25] }, { time: 2, value: [-2] }
    ] });
    const badVector = new AnimationTrack({ target: `${target}scale`, valueType: "vector3", keyframes: [
      { time: 0, value: [1, 1, 1] }, { time: 2, value: [2, 2, 2] }
    ] });
    const mixed = new AnimationTrack({ target: `${target}offset`, valueType: "number-array", keyframes: [
      { time: 0, value: [0, 0], interpolation: "step" }, { time: 2, value: [1, 1], interpolation: "linear" }
    ] });
    const snapshot = sceneFromGLTFAsset({ ...input, animations: [new AnimationClip({ name: "invalid", tracks: [badType, badVector, mixed] })] });
    expect(snapshot.animations).toEqual([]);
    expect(snapshot.sourceWarnings?.map((warning) => warning.code)).toEqual(expect.arrayContaining(["ANIMATION_TRACK_LOST", "ANIMATION_INTERPOLATION_LOST", "ANIMATION_CLIP_LOST"]));
    expect(snapshot.sourceWarnings?.filter((warning) => warning.code === "ANIMATION_TRACK_LOST")).toHaveLength(2);
    loader.dispose(input);
  });

  it("reports duplicate runtime targets and rejects FLOAT loss in snapshot times and values", async () => {
    const loader = new GLTFLoader();
    const input = await loadDocument(loader, authoredDocument(sampleBinding));
    const target = `material:Paint.Finish.${sampleBinding}.extensions.KHR_texture_transform.offset`;
    const normal = new AnimationTrack({ target, valueType: "number-array", keyframes: [
      { time: 0, value: [0, 0] }, { time: 1, value: [1, 1] }
    ] });
    const lostValue = new AnimationTrack({ target, valueType: "number-array", keyframes: [
      { time: 0, value: [1e-50, 0] }, { time: 1, value: [1, 1] }
    ] });
    const lostTime = new AnimationTrack({ target, valueType: "number-array", keyframes: [
      { time: 1, value: [0, 0] }, { time: 1 + 1e-10, value: [1, 1] }
    ] });
    const snapshot = sceneFromGLTFAsset({ ...input, animations: [new AnimationClip({ name: "duplicate", tracks: [normal, normal, lostValue, lostTime] })] });
    expect(snapshot.animations?.[0]?.pointerChannels).toHaveLength(1);
    expect(snapshot.sourceWarnings?.filter((warning) => warning.code === "ANIMATION_TRACK_LOST")).toHaveLength(3);
    loader.dispose(input);
  });

  it("rejects absent, unsupported, duplicate, malformed, and non-finite pointer data", () => {
    const source = fixture();
    const offset = pointerChannel(`${samplePrefix}offset`, 2, offsetValues);
    const write = (channels: readonly AuraExportPointerAnimationChannel[]) => exportGLTF(withChannels(source, channels));
    const absent = { ...source, materials: [{ name: "Paint.Finish", normalTexture: "map.png" }] };
    expect(() => exportGLTF(withChannels(absent, [offset]))).toThrow(/does not exist/);
    expect(() => write([{ ...offset, pointer: `${samplePrefix}texCoord` }])).toThrow(/not a supported/);
    expect(() => write([{ ...offset, pointer: `${samplePrefix}offset/0` }])).toThrow(/not a supported/);
    expect(() => write([{ ...offset, pointer: `${samplePrefix}offset\n` }])).toThrow(/not a supported/);
    expect(() => write([offset, offset])).toThrow(/duplicates/);
    expect(() => write([{ ...offset, values: { itemSize: 1, values: [1, 2] } }])).toThrow(/count or type/);
    expect(() => write([{ ...offset, values: { itemSize: 2, values: [1, 2, 3] } }])).toThrow(/count or type/);
    expect(() => write([{ ...offset, values: { itemSize: 2, values: new Uint16Array([1, 2, 3, 4]) } }])).toThrow(/count or type/);
    expect(() => write([{ ...offset, values: { itemSize: 2, values: offsetValues, normalized: true } }])).toThrow(/count or type/);
    expect(() => write([{ ...offset, values: { itemSize: 2, values: [0, Number.NaN, 0, 1] } }])).toThrow(/finite/);
    expect(() => write([{ ...offset, values: { itemSize: 2, values: [0, 1, 0, Number.MAX_VALUE] } }])).toThrow(/finite/);
    expect(() => write([{ ...offset, times: { itemSize: 1, values: [0, 0] } }])).toThrow(/strictly increasing/);
  });

  it("rejects bottom-left UV animation when convention conversion cannot preserve the curves", () => {
    const source = { ...fixture(), uvOrigin: "bottom-left" as const };
    for (const leaf of ["offset", "scale", "rotation"] as const) {
      const channel = leaf === "rotation" ? pointerChannel(`${samplePrefix}${leaf}`, 1, rotationValues) : pointerChannel(`${samplePrefix}${leaf}`, 2, offsetValues);
      expect(() => exportGLTF(withChannels(source, [channel]))).toThrow(/GLTF_CONVENTION_UNREPRESENTABLE/);
    }
  });
});
