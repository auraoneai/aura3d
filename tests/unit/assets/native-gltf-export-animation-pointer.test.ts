import { describe, expect, it } from "vitest";
import { GLTFLoader } from "../../../packages/assets/src/GLTFLoader";
import { LoadContext } from "../../../packages/assets/src/LoadContext";
import { exportGLTF } from "../../../packages/assets/src/exporters/GLTFExporter";
import { exportUSDZ } from "../../../packages/assets/src/exporters/USDZExporter";
import { sceneFromGLTFAsset, type AuraExportPointerAnimationChannel, type AuraExportScene } from "../../../packages/assets/src/exporters/ExportContext";

const scalar = (pointer: string, values: readonly number[]): AuraExportPointerAnimationChannel => ({
  pointer, times: { itemSize: 1, values: new Float32Array([0, 1]) }, values: { itemSize: 1, values: new Float32Array(values) }
});
const fixture = (): AuraExportScene => ({
  metersPerUnit: 1, upAxis: "Y",
  nodes: [{ name: "First", light: 0 }, { name: "Second", light: 0 }, { name: "Third", light: 1 }],
  roots: [0, 1, 2],
  lights: [{ name: "Lamp", type: "point", intensity: 1, color: [1, 1, 1], range: 10 }, { name: "Lamp", type: "point", intensity: 2, color: [1, 1, 1], range: 5 }],
  materials: [{ name: "Paint.Finish", metallic: 0.25, roughness: 0.5, baseColor: [1, 1, 1, 1], emissive: [0, 0, 0] }],
  animations: [{ name: "change", channels: [], pointerChannels: [
    scalar("/materials/0/pbrMetallicRoughness/metallicFactor", [0.25, 0.75]),
    scalar("/extensions/KHR_lights_punctual/lights/0/intensity", [1, 4]),
    { pointer: "/extensions/KHR_lights_punctual/lights/1/color", times: { itemSize: 1, values: new Float32Array([0, 1]) }, values: { itemSize: 3, values: new Float32Array([1, 1, 1, 0.5, 0.25, 1]) } }
  ] }]
});

function json(result: ReturnType<typeof exportGLTF>): Record<string, any> {
  if (!(result.data instanceof Uint8Array)) throw new Error("Expected JSON bytes");
  return JSON.parse(new TextDecoder().decode(result.data));
}
function url(result: ReturnType<typeof exportGLTF>): string {
  if (!(result.data instanceof Uint8Array)) throw new Error("Expected JSON bytes");
  return `data:model/gltf+json;base64,${Buffer.from(result.data).toString("base64")}`;
}
function outputValues(result: ReturnType<typeof exportGLTF>, accessorIndex: number): number[] {
  const doc = json(result), accessor = doc.accessors[accessorIndex], view = doc.bufferViews[accessor.bufferView];
  const dataUri = doc.buffers[0].uri as string;
  const buffer = Buffer.from(dataUri.slice(dataUri.indexOf(",") + 1), "base64");
  const width = ({ SCALAR: 1, VEC3: 3, VEC4: 4 } as Record<string, number>)[accessor.type];
  const data = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return Array.from({ length: accessor.count * width }, (_, i) => data.getFloat32((view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + i * 4, true));
}

describe("glTF property animation export", () => {
  it("writes typed material and light pointers with independent output accessors", () => {
    const result = exportGLTF(fixture());
    const doc = json(result);
    expect(doc.extensionsUsed).toEqual(expect.arrayContaining(["KHR_animation_pointer", "KHR_lights_punctual"]));
    expect(doc.extensionsRequired ?? []).not.toContain("KHR_animation_pointer");
    const clip = doc.animations[0];
    expect(clip.channels.map((channel: any) => channel.target.extensions.KHR_animation_pointer.pointer)).toEqual([
      "/materials/0/pbrMetallicRoughness/metallicFactor",
      "/extensions/KHR_lights_punctual/lights/0/intensity",
      "/extensions/KHR_lights_punctual/lights/1/color"
    ]);
    expect(clip.channels.every((channel: any) => channel.target.path === "pointer" && channel.target.node === undefined)).toBe(true);
    expect(outputValues(result, clip.samplers[clip.channels[0].sampler].output)).toEqual([0.25, 0.75]);
    expect(outputValues(result, clip.samplers[clip.channels[2].sampler].output)).toEqual([1, 1, 1, 0.5, 0.25, 1]);
  });

  it("snapshots the original light definition across all exported instances without merging duplicate names", async () => {
    const loader = new GLTFLoader();
    const input = await loader.load({ url: url(exportGLTF(fixture())) }, new LoadContext());
    const live = input.createScene();
    const snapshot = sceneFromGLTFAsset(input, live);
    const pointers = snapshot.animations![0].pointerChannels!.map((channel) => channel.pointer);
    const byName = new Map(snapshot.nodes.map((node) => [node.name, node.light]));
    expect(pointers).toEqual([
      "/materials/0/pbrMetallicRoughness/metallicFactor",
      `/extensions/KHR_lights_punctual/lights/${byName.get("First")}/intensity`,
      `/extensions/KHR_lights_punctual/lights/${byName.get("Second")}/intensity`,
      `/extensions/KHR_lights_punctual/lights/${byName.get("Third")}/color`
    ]);
    expect(snapshot.sourceWarnings?.filter((warning) => warning.code === "ANIMATION_TRACK_LOST")).toEqual([]);
    const exported = exportGLTF(snapshot);
    const output = await loader.load({ url: url(exported) }, new LoadContext());
    expect(output.animations[0].tracks).toHaveLength(4);
    expect(output.animations[0].tracks.find((track) => track.target === "material:Paint.Finish.pbrMetallicRoughness.metallicFactor")?.sample(1)).toBe(0.75);
    expect(output.animations[0].tracks.filter((track) => track.target.endsWith(".intensity")).map((track) => track.sample(1))).toEqual([4, 4]);
    live.dispose(); loader.dispose(output); loader.dispose(input);
  });

  it("reports loss for ambiguous material names rather than guessing which definition was animated", async () => {
    const source = fixture();
    const onlyMaterial = source.animations![0].pointerChannels![0];
    const duplicate = { ...source, materials: [source.materials![0], { ...source.materials![0] }], animations: [{ name: "ambiguous", channels: [], pointerChannels: [onlyMaterial] }] };
    const loader = new GLTFLoader();
    const input = await loader.load({ url: url(exportGLTF(duplicate)) }, new LoadContext());
    const snapshot = sceneFromGLTFAsset(input);
    expect(snapshot.animations).toEqual([]);
    expect(snapshot.sourceWarnings?.map((warning) => warning.code)).toEqual(expect.arrayContaining(["ANIMATION_TRACK_LOST", "ANIMATION_CLIP_LOST"]));
    loader.dispose(input);
  });

  it("does not treat a missing extension on one of two identically named materials as identity", async () => {
    const source = fixture();
    const pointer = scalar("/materials/0/extensions/KHR_materials_clearcoat/clearcoatFactor", [0.25, 0.75]);
    const duplicate: AuraExportScene = {
      ...source,
      materials: [{ ...source.materials![0], gltf: { clearcoat: { factor: 0.25 } } }, source.materials![0]],
      animations: [{ channels: [], pointerChannels: [pointer] }]
    };
    const loader = new GLTFLoader();
    const input = await loader.load({ url: url(exportGLTF(duplicate)) }, new LoadContext());
    const snapshot = sceneFromGLTFAsset(input);
    expect(snapshot.animations).toEqual([]);
    expect(snapshot.sourceWarnings?.some((warning) => warning.code === "ANIMATION_TRACK_LOST")).toBe(true);
    loader.dispose(input);
  });

  it("retains cubic tangents and converts range and its derivatives into exported length units", () => {
    const source = fixture();
    const range: AuraExportPointerAnimationChannel = {
      pointer: "/extensions/KHR_lights_punctual/lights/0/range",
      times: { values: new Float32Array([0, 1]), itemSize: 1 },
      values: { values: new Float32Array([-1, 2, 3, 4, 5, -6]), itemSize: 1 }, interpolation: "CUBICSPLINE"
    };
    const result = exportGLTF({ ...source, metersPerUnit: 2, animations: [{ channels: [], pointerChannels: [range] }] });
    const doc = json(result), clip = doc.animations[0];
    expect(clip.samplers[0].interpolation).toBe("CUBICSPLINE");
    expect(outputValues(result, clip.samplers[0].output)).toEqual([-2, 4, 6, 8, 10, -12]);
    expect(doc.extensions.KHR_lights_punctual.lights[0].range).toBe(20);
  });

  it("reports pointer animation as unsupported when the same interchange scene is exported to USDZ", () => {
    const result = exportUSDZ(fixture());
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "UNSUPPORTED_PROPERTY", path: "animations[0].pointerChannels" }));
  });

  it("rejects missing, unsupported, duplicate, malformed and out-of-range property targets", () => {
    const source = fixture(), channel = source.animations![0].pointerChannels![0];
    const write = (channels: readonly AuraExportPointerAnimationChannel[]) => exportGLTF({ ...source, animations: [{ channels: [], pointerChannels: channels }] });
    expect(() => write([{ ...channel, pointer: "/materials/0/normalTexture/scale" }])).toThrow(/does not exist/);
    expect(() => write([{ ...channel, pointer: "/materials/0/unknown" }])).toThrow(/not a supported/);
    expect(() => write([{ ...channel, pointer: "/materials/00/pbrMetallicRoughness/metallicFactor" }])).toThrow(/not a supported/);
    expect(() => write([{ ...channel, pointer: "/extensions/KHR_lights_punctual/lights/0/intensity\n" }])).toThrow(/not a supported/);
    expect(() => write([channel, channel])).toThrow(/duplicates/);
    expect(() => write([{ ...channel, values: { itemSize: 1, values: [0.1, 1.1] } }])).toThrow(/outside the property range/);
    expect(() => write([{ ...channel, times: { itemSize: 1, values: [0, 0] } }])).toThrow(/strictly increasing/);
    expect(() => write([{ ...channel, values: { itemSize: 3, values: [1, 1, 1, 1, 1, 1] } }])).toThrow(/count or type/);
  });
});
