import { describe, expect, it } from "vitest";
import { PointLight } from "@aura3d/scene";
import { createGLTFSceneAnimationRuntime, GLTFLoader, LoadContext } from "../../../packages/assets/src";

type FixtureOptions = {
  required?: boolean;
  pointer?: string;
  outputType?: "SCALAR" | "VEC3" | "VEC4";
  output?: readonly number[];
  times?: readonly number[];
  materials?: readonly Record<string, unknown>[];
  lights?: readonly Record<string, unknown>[];
  missingPointer?: boolean;
  targetNode?: number;
};

function fixture(options: FixtureOptions = {}): string {
  const times = new Float32Array(options.times ?? [0, 1]);
  const output = new Float32Array(options.output ?? [0.2, 0.8]);
  const bytes = new Uint8Array(times.byteLength + output.byteLength);
  bytes.set(new Uint8Array(times.buffer));
  bytes.set(new Uint8Array(output.buffer), times.byteLength);
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  const outputType = options.outputType ?? "SCALAR";
  const width = outputType === "SCALAR" ? 1 : outputType === "VEC3" ? 3 : 4;
  const document = {
    asset: { version: "2.0" },
    extensionsUsed: ["KHR_animation_pointer", "KHR_lights_punctual"],
    ...(options.required ? { extensionsRequired: ["KHR_animation_pointer"] } : {}),
    extensions: { KHR_lights_punctual: { lights: options.lights ?? [{ name: "Lamp", type: "point", intensity: 1 }] } },
    scenes: [{ nodes: [0, 1] }], scene: 0,
    nodes: [
      { name: "Duplicate", extensions: { KHR_lights_punctual: { light: 0 } } },
      { name: "Duplicate", extensions: { KHR_lights_punctual: { light: 0 } } }
    ],
    materials: options.materials ?? [{ name: "Paint", pbrMetallicRoughness: { metallicFactor: 0.2 } }],
    buffers: [{ uri: `data:application/octet-stream;base64,${btoa(binary)}`, byteLength: bytes.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: times.byteLength },
      { buffer: 0, byteOffset: times.byteLength, byteLength: output.byteLength }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, type: "SCALAR", count: times.length },
      { bufferView: 1, componentType: 5126, type: outputType, count: output.length / width }
    ],
    animations: [{ name: "move", samplers: [{ input: 0, output: 1 }], channels: [{
      sampler: 0, target: { path: "pointer", ...(options.targetNode === undefined ? {} : { node: options.targetNode }),
        extensions: { KHR_animation_pointer: options.missingPointer ? {} : { pointer: options.pointer ?? "/materials/0/pbrMetallicRoughness/metallicFactor" } } }
    }] }]
  };
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(document))}`;
}

const load = (options: FixtureOptions = {}) => new GLTFLoader().load({ url: fixture(options), type: "gltf" }, new LoadContext());

describe("required animation-pointer channels", () => {
  it.each([false, true])("loads and samples a supported material track when required=%s", async (required) => {
    const asset = await load({ required });
    expect(asset.animations[0]?.tracks[0]).toMatchObject({ target: "material:Paint.pbrMetallicRoughness.metallicFactor", valueType: "scalar" });
    expect(asset.animations[0]?.tracks[0]?.sample(0.5)).toBeCloseTo(0.5);
    expect(asset.loaderDiagnostics.unsupportedFeatures).toEqual([]);
    const writes = new Map<string, number | readonly number[]>();
    const runtime = createGLTFSceneAnimationRuntime({
      scene: asset.createScene(), clips: asset.animations,
      resolveAnimationMaterial: (name) => name === "Paint"
        ? { name, setAnimationParameter: (parameter, value) => { writes.set(parameter, value); } }
        : undefined
    });
    expect(runtime.applyClipByName("move", 1)).toMatchObject({ materialTracksApplied: 1, missingTargets: [] });
    expect(writes.get("u_metallic")).toBeCloseTo(0.8);
  });

  it("binds a required node track to the unique imported node despite duplicate source names", async () => {
    const asset = await load({ required: true, pointer: "/nodes/1/translation", outputType: "VEC3", output: [0, 0, 0, 2, 4, 6] });
    expect(asset.animations[0]?.tracks[0]).toMatchObject({ target: "Duplicate_1.translation", valueType: "vector3" });
    const scene = asset.createScene();
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: asset.animations });
    expect(runtime.applyClipByName("move", 1).missingTargets).toEqual([]);
    expect(scene.findByName("Duplicate")[0]?.transform.position).toEqual([0, 0, 0]);
    expect(scene.findByName("Duplicate_1")[0]?.transform.position).toEqual([2, 4, 6]);
  });

  it("retains required punctual-light definition identity across all referencing nodes", async () => {
    const asset = await load({ required: true, pointer: "/extensions/KHR_lights_punctual/lights/0/intensity", output: [1, 3] });
    const scene = asset.createScene();
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: asset.animations });
    expect(runtime.applyClipByName("move", 1)).toMatchObject({ lightTracksApplied: 1, missingTargets: [] });
    const lights = scene.collectLights();
    expect(lights).toHaveLength(2);
    expect(lights.every((light) => light instanceof PointLight && light.intensity === 3)).toBe(true);
  });

  it.each([
    "/cameras/0/perspective/yfov",
    "/nodes/0/translation/0",
    "/materials/0/notARealProperty",
    "/materials/0/normalTexture/scale",
    "/materials/0/extensions/KHR_materials_clearcoat/clearcoatFactor",
    "/materials/0/normalTexture/extensions/KHR_texture_transform/scale"
  ])("rejects unsupported required pointer %s", async (pointer) => {
    await expect(load({ required: true, pointer })).rejects.toThrow(/unsupported required animation pointer/);
  });

  it("reports the same unsupported pointer when the extension is optional", async () => {
    const pointer = "/nodes/0/translation/0";
    const asset = await load({ pointer });
    expect(asset.animations[0]?.tracks).toEqual([]);
    expect(asset.loaderDiagnostics.unsupportedFeatures).toContain(`animation-pointer-unsupported:${pointer}`);
  });

  it("rejects ambiguous required material identities and directional-light range", async () => {
    await expect(load({ required: true, materials: [{ name: "Paint" }, { name: "Paint" }] })).rejects.toThrow(/unsupported required animation pointer/);
    await expect(load({ required: true, pointer: "/extensions/KHR_lights_punctual/lights/0/range", lights: [{ type: "directional" }] })).rejects.toThrow(/unsupported required animation pointer/);
  });

  it("accepts a supported clearcoat pointer only when its material extension exists", async () => {
    const asset = await load({ required: true, pointer: "/materials/0/extensions/KHR_materials_clearcoat/clearcoatFactor",
      materials: [{ name: "Paint", extensions: { KHR_materials_clearcoat: { clearcoatFactor: 0.2 } } }] });
    expect(asset.animations[0]?.tracks[0]).toMatchObject({ target: "material:Paint.extensions.KHR_materials_clearcoat.clearcoatFactor", valueType: "scalar" });
    expect(asset.animations[0]?.tracks[0]?.sample(0.5)).toBeCloseTo(0.5);
  });

  it("rejects malformed required targets and sampler values instead of silently dropping them", async () => {
    await expect(load({ required: true, missingPointer: true })).rejects.toThrow(/invalid required animation pointer target/);
    await expect(load({ required: true, targetNode: 0 })).rejects.toThrow(/invalid required animation pointer target/);
    await expect(load({ required: true, outputType: "VEC3", output: [0, 0, 0, 1, 1, 1] })).rejects.toThrow(/requires a float SCALAR output accessor/);
    await expect(load({ required: true, times: [1, 0] })).rejects.toThrow(/strictly increasing input times/);
    await expect(load({ required: true, output: [0.2, Number.NaN] })).rejects.toThrow(/requires finite values and tangents/);
  });
});
