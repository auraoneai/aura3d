import { describe, expect, it } from "vitest";
import { createGLTFSceneAnimationRuntime } from "../../../packages/assets/src/GLTFAnimationRuntime";
import { getGLTFExtensionSupport } from "../../../packages/assets/src/GLTFExtensionSupport";
import { GLTFLoader, resolveAnimationPointerBinding, type GLTFJson } from "../../../packages/assets/src/GLTFLoader";
import { LoadContext } from "../../../packages/assets/src/LoadContext";

type AccessorType = "SCALAR" | "VEC2" | "VEC3" | "VEC4";
type Interpolation = "LINEAR" | "STEP" | "CUBICSPLINE";

interface FixtureOptions {
  readonly pointer: string;
  readonly output: readonly number[];
  readonly outputType?: AccessorType;
  readonly times?: readonly number[];
  readonly inputType?: AccessorType;
  readonly inputComponentType?: number;
  readonly outputComponentType?: number;
  readonly inputNormalized?: boolean;
  readonly outputNormalized?: boolean;
  readonly interpolation?: Interpolation;
  readonly required?: boolean;
  readonly nodeRotation?: boolean;
  readonly missingNormal?: "texture" | "extension" | "offset" | "scale" | "rotation";
  readonly materialName?: string;
  readonly extraPointer?: string;
}

const WIDTH: Record<AccessorType, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const basePath = "/materials/0/pbrMetallicRoughness/baseColorTexture/extensions/KHR_texture_transform";
const normalPath = "/materials/0/normalTexture/extensions/KHR_texture_transform";
const clearcoatPath = "/materials/0/extensions/KHR_materials_clearcoat/clearcoatTexture/extensions/KHR_texture_transform";
const coreSlots = [
  "pbrMetallicRoughness/baseColorTexture",
  "pbrMetallicRoughness/metallicRoughnessTexture",
  "normalTexture",
  "occlusionTexture",
  "emissiveTexture"
] as const;

// A complete data-URI glTF keeps these tests independent of exporter code and
// covers accessor decoding, pointer resolution, track creation and sampling.
function fixture(options: FixtureOptions): string {
  const times = new Float32Array(options.times ?? [0, 2]);
  const output = new Float32Array(options.output);
  const bytes = new Uint8Array(times.byteLength + output.byteLength);
  bytes.set(new Uint8Array(times.buffer));
  bytes.set(new Uint8Array(output.buffer), times.byteLength);
  const inputType = options.inputType ?? "SCALAR";
  const outputType = options.outputType ?? "SCALAR";
  const texture = { index: 0, extensions: { KHR_texture_transform: { offset: [0, 0], scale: [1, 1], rotation: 0 } } };
  const normalTransform = Object.fromEntries(Object.entries(texture.extensions.KHR_texture_transform).filter(([key]) => key !== options.missingNormal));
  const normalTexture = options.missingNormal === "texture" ? undefined : options.missingNormal === "extension" ? { index: 0 } :
    { index: 0, extensions: { KHR_texture_transform: normalTransform } };
  const target = options.nodeRotation
    ? { path: "rotation", node: 0 }
    : { path: "pointer", extensions: { KHR_animation_pointer: { pointer: options.pointer } } };
  const json = {
    asset: { version: "2.0" },
    extensionsUsed: ["KHR_animation_pointer", "KHR_texture_transform", "KHR_materials_clearcoat"],
    ...(options.required ? { extensionsRequired: ["KHR_animation_pointer"] } : {}),
    scenes: [{ nodes: [0] }], scene: 0, nodes: [{ name: "Actor" }],
    images: [{ uri: "data:image/png;base64,AQ==" }], textures: [{ source: 0 }],
    materials: [{
      name: options.materialName ?? "Paint",
      pbrMetallicRoughness: { baseColorTexture: texture, metallicRoughnessTexture: texture },
      normalTexture,
      occlusionTexture: texture,
      emissiveTexture: texture,
      extensions: { KHR_materials_clearcoat: { clearcoatTexture: texture } }
    }],
    buffers: [{ uri: `data:application/octet-stream;base64,${Buffer.from(bytes).toString("base64")}`, byteLength: bytes.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: times.byteLength },
      { buffer: 0, byteOffset: times.byteLength, byteLength: output.byteLength }
    ],
    accessors: [
      { bufferView: 0, componentType: options.inputComponentType ?? 5126, type: inputType, count: times.length / WIDTH[inputType], normalized: options.inputNormalized },
      { bufferView: 1, componentType: options.outputComponentType ?? 5126, type: outputType, count: output.length / WIDTH[outputType], normalized: options.outputNormalized }
    ],
    animations: [{ name: "texture", samplers: [{ input: 0, output: 1, interpolation: options.interpolation }], channels: [
      { sampler: 0, target },
      ...(options.extraPointer ? [{ sampler: 0, target: { path: "pointer", extensions: { KHR_animation_pointer: { pointer: options.extraPointer } } } }] : [])
    ] }]
  };
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(json))}`;
}

const load = (options: FixtureOptions) => new GLTFLoader().load({ url: fixture(options), type: "gltf" }, new LoadContext());

describe("glTF texture-transform animation pointer import", () => {
  it.each([
    ["pbrMetallicRoughness/baseColorTexture"],
    ["pbrMetallicRoughness/metallicRoughnessTexture"],
    ["normalTexture"], ["occlusionTexture"], ["emissiveTexture"],
    ["extensions/KHR_materials_clearcoat/clearcoatTexture"],
    ["extensions/KHR_materials_clearcoat/clearcoatRoughnessTexture"],
    ["extensions/KHR_materials_clearcoat/clearcoatNormalTexture"],
    ["extensions/KHR_materials_diffuse_roughness/diffuseRoughnessTexture"],
    ["extensions/EXT_materials_bump/bumpTexture"],
    ["extensions/KHR_materials_transmission/transmissionTexture"],
    ["extensions/KHR_materials_diffuse_transmission/diffuseTransmissionTexture"],
    ["extensions/KHR_materials_diffuse_transmission/diffuseTransmissionColorTexture"],
    ["extensions/KHR_materials_volume/thicknessTexture"],
    ["extensions/KHR_materials_specular/specularTexture"],
    ["extensions/KHR_materials_specular/specularColorTexture"],
    ["extensions/KHR_materials_sheen/sheenColorTexture"],
    ["extensions/KHR_materials_sheen/sheenRoughnessTexture"],
    ["extensions/KHR_materials_anisotropy/anisotropyTexture"],
    ["extensions/KHR_materials_iridescence/iridescenceTexture"],
    ["extensions/KHR_materials_iridescence/iridescenceThicknessTexture"],
    ["extensions/KHR_materials_pbrSpecularGlossiness/diffuseTexture"],
    ["extensions/KHR_materials_pbrSpecularGlossiness/specularGlossinessTexture"]
  ])("classifies the parseable %s textureInfo leaves", (slot) => {
    const json = { asset: { version: "2.0" }, materials: [{ name: "Paint" }], nodes: [{ name: "Actor" }] } as GLTFJson;
    for (const [leaf, valueType] of [["rotation", "scalar"], ["offset", "number-array"], ["scale", "number-array"]] as const) {
      const pointer = `/materials/0/${slot}/extensions/KHR_texture_transform/${leaf}`;
      expect(resolveAnimationPointerBinding(json, pointer)).toMatchObject({
        pointer, target: `material:Paint.${slot.replaceAll("/", ".")}.extensions.KHR_texture_transform.${leaf}`, valueType
      });
    }
    expect(resolveAnimationPointerBinding(json, "/nodes/0/rotation")?.valueType).toBe("quaternion");
    expect(resolveAnimationPointerBinding(json, "/nodes/0/scale")?.valueType).toBe("vector3");
  });

  it.each([
    { interpolation: "LINEAR" as const, output: [0.25, 1.75], midpoint: 1 },
    { interpolation: "STEP" as const, output: [0.25, 1.75], midpoint: 0.25 },
    { interpolation: "CUBICSPLINE" as const, output: [0, 0.25, 0.5, -0.25, 1.75, 0], midpoint: 1.1875 }
  ])("imports scalar rotation and samples $interpolation without quaternion normalization", async ({ interpolation, output, midpoint }) => {
    const asset = await load({ pointer: `${basePath}/rotation`, interpolation, output });
    const track = asset.animations[0]!.tracks[0]!;
    expect(track.target).toBe("material:Paint.pbrMetallicRoughness.baseColorTexture.extensions.KHR_texture_transform.rotation");
    expect(track.valueType).toBe("scalar");
    expect(track.sample(0)).toBeCloseTo(0.25);
    expect(track.sample(1)).toBeCloseTo(midpoint);
    expect(track.sample(2)).toBeCloseTo(1.75);
    if (interpolation === "CUBICSPLINE") {
      expect(track.keyframes).toEqual([
        { time: 0, inTangent: 0, value: 0.25, outTangent: 0.5, interpolation: "cubicspline" },
        { time: 2, inTangent: -0.25, value: 1.75, outTangent: 0, interpolation: "cubicspline" }
      ]);
    }
  });

  it.each(coreSlots)("retains a dotted material name and all transform tracks for %s", async (slot) => {
    for (const leaf of ["offset", "scale", "rotation"] as const) {
      const rotation = leaf === "rotation";
      const pointer = `/materials/0/${slot}/extensions/KHR_texture_transform/${leaf}`;
      const asset = await load({
        pointer, materialName: "Car.paint.detail", outputType: rotation ? "SCALAR" : "VEC2",
        output: rotation ? [-2, 4] : [2, -2, 4, 6]
      });
      const track = asset.animations[0]!.tracks[0]!;
      expect(track).toMatchObject({
        target: `material:Car.paint.detail.${slot.replaceAll("/", ".")}.extensions.KHR_texture_transform.${leaf}`,
        valueType: rotation ? "scalar" : "number-array",
        valueSize: rotation ? 1 : 2
      });
      expect(track.sample(1)).toEqual(rotation ? 1 : [3, 2]);
    }
  });

  it.each(["offset", "scale"] as const)("imports both components and cubic tangents of %s", async (leaf) => {
    for (const [interpolation, output, midpoint] of [
      ["LINEAR", [1, -1, 3, 5], [2, 2]],
      ["STEP", [1, -1, 3, 5], [1, -1]],
      ["CUBICSPLINE", [0, 0, 1, -1, 1, -0.5, -1, 2, 3, 5, 0, 0], [2.5, 1.375]]
    ] as const) {
      const asset = await load({ pointer: `${clearcoatPath}/${leaf}`, outputType: "VEC2", interpolation, output });
      const track = asset.animations[0]!.tracks[0]!;
      expect(track.valueType).toBe("number-array");
      expect(track.valueSize).toBe(2);
      expect(track.sample(0)).toEqual([1, -1]);
      expect(track.sample(1)).toEqual(midpoint);
      expect(track.sample(2)).toEqual([3, 5]);
      if (interpolation === "CUBICSPLINE") {
        expect(track.keyframes).toEqual([
          { time: 0, inTangent: [0, 0], value: [1, -1], outTangent: [1, -0.5], interpolation: "cubicspline" },
          { time: 2, inTangent: [-1, 2], value: [3, 5], outTangent: [0, 0], interpolation: "cubicspline" }
        ]);
      }
    }
  });

  it.each([false, true])("preserves quaternion sampling for node rotation (ordinary channel: %s)", async (nodeRotation) => {
    const asset = await load({ pointer: "/nodes/0/rotation", nodeRotation, outputType: "VEC4", output: [0, 0, 0, 1, 0, 0, 1, 0] });
    const track = asset.animations[0]!.tracks[0]!;
    expect(track).toMatchObject({ target: "Actor.rotation", valueType: "quaternion" });
    const sample = track.sample(1) as readonly number[];
    expect(sample[2]).toBeCloseTo(Math.SQRT1_2);
    expect(sample[3]).toBeCloseTo(Math.SQRT1_2);
  });

  it.each([
    "/materials/00/normalTexture/extensions/KHR_texture_transform/rotation",
    "/materials/0\n/normalTexture/extensions/KHR_texture_transform/rotation",
    "/materials/0/notATexture/extensions/KHR_texture_transform/rotation",
    "/materials/0/normalTexture/KHR_texture_transform/rotation",
    "/materials/0/normalTexture/extensions/KHR_texture_transform/texCoord",
    "/materials/0/normalTexture/extensions/KHR_texture_transform/rotation/0",
    "/materials/0/normalTexture/extensions/KHR_texture_transform/rotation/"
  ])("diagnoses unsupported or noncanonical texture-transform pointer %s", async (pointer) => {
    const asset = await load({ pointer, output: [0, 1] });
    expect(asset.animations[0]!.tracks).toEqual([]);
    expect(asset.loaderDiagnostics.unsupportedFeatures).toContain(`animation-pointer-unsupported:${pointer}`);
  });

  it.each([
    { missingNormal: "texture" as const, leaf: "rotation" },
    { missingNormal: "extension" as const, leaf: "rotation" },
    { missingNormal: "rotation" as const, leaf: "rotation" },
    { missingNormal: "offset" as const, leaf: "offset" },
    { missingNormal: "scale" as const, leaf: "scale" }
  ])("diagnoses an absent source $missingNormal without synthesizing an animated default", async ({ missingNormal, leaf }) => {
    const pointer = `${normalPath}/${leaf}`;
    const outputType = leaf === "rotation" ? "SCALAR" as const : "VEC2" as const;
    const output = leaf === "rotation" ? [0, 1] : [0, 0, 1, 1];
    const asset = await load({ pointer, missingNormal, output, outputType });
    expect(asset.animations[0]!.tracks).toEqual([]);
    expect(asset.loaderDiagnostics.unsupportedFeatures).toContain(`animation-pointer-missing-target:${pointer}`);
  });

  it("keeps unrelated legacy tracks when a texture-transform source target is absent", async () => {
    const pointer = `${normalPath}/rotation`;
    const asset = await load({ pointer, missingNormal: "rotation", output: [0, 1], extraPointer: "/materials/0/pbrMetallicRoughness/metallicFactor" });
    expect(asset.animations[0]!.tracks).toHaveLength(1);
    expect(asset.animations[0]!.tracks[0]).toMatchObject({ target: "material:Paint.pbrMetallicRoughness.metallicFactor", valueType: "scalar" });
    expect(asset.animations[0]!.tracks[0]!.sample(1)).toBeCloseTo(0.5);
    expect(asset.loaderDiagnostics.unsupportedFeatures).toContain(`animation-pointer-missing-target:${pointer}`);
  });

  it.each(coreSlots)("imports required offset, scale and rotation for the core %s slot", async (slot) => {
    for (const leaf of ["offset", "scale", "rotation"] as const) {
      const pointer = `/materials/0/${slot}/extensions/KHR_texture_transform/${leaf}`;
      const rotation = leaf === "rotation";
      const output = rotation ? [0, 2] : leaf === "scale" ? [1, 1, 3, 5] : [0, 0, 2, 4];
      const asset = await load({ pointer, output, outputType: rotation ? "SCALAR" : "VEC2", required: true });
      try {
        const track = asset.animations[0]!.tracks[0]!;
        expect(track).toMatchObject({
          target: `material:Paint.${slot.replaceAll("/", ".")}.extensions.KHR_texture_transform.${leaf}`,
          valueType: rotation ? "scalar" : "number-array",
          valueSize: rotation ? 1 : 2
        });
        expect(track.sample(1)).toEqual(rotation ? 1 : leaf === "scale" ? [2, 3] : [1, 2]);
        expect(asset.animationPointerForTrack?.(track)).toEqual({ animationIndex: 0, channelIndex: 0, pointer, required: true });
        expect(asset.requiredTextureAnimationTargets).toEqual([{
          clipName: "texture", target: track.target, materialIndex: 0, materialName: "Paint", textureIndex: 0, imageIndex: 0
        }]);
        expect(asset.loaderDiagnostics.unsupportedFeatures).toEqual([]);
      } finally {
        new GLTFLoader().dispose(asset);
      }
    }
  });

  it("retains optional clearcoat texture transforms but rejects them when the pointer is required", async () => {
    const pointer = `${clearcoatPath}/rotation`;
    const optional = await load({ pointer, output: [0, 2] });
    const scene = optional.createScene();
    const animation = createGLTFSceneAnimationRuntime({ scene, clips: optional.animations });
    try {
      const track = optional.animations[0]!.tracks[0]!;
      expect(track.target).toBe("material:Paint.extensions.KHR_materials_clearcoat.clearcoatTexture.extensions.KHR_texture_transform.rotation");
      expect(track.sample(1)).toBe(1);
      expect(optional.animationPointerForTrack?.(track)).toMatchObject({ pointer, required: false });
      expect(optional.requiredTextureAnimationTargets).toBeUndefined();
      expect(animation.applyClipByName("texture", 1)).toMatchObject({
        materialTracksApplied: 0, materialBindingIssues: [{ target: track.target, reason: "unsupported" }]
      });
    } finally {
      animation.dispose();
      scene.dispose();
      new GLTFLoader().dispose(optional);
    }
    await expect(load({ pointer, output: [0, 2], required: true })).rejects.toThrow(/unsupported required animation pointer/);
  });

  it("advertises only the five core texture-transform slots and the required-pointer boundary", () => {
    const support = getGLTFExtensionSupport("KHR_animation_pointer");
    expect(support).toMatchObject({
      status: "parsed-with-limits", parseSupport: "limited", runtimeSupport: "limited", renderSupport: "limited", requiredAccepted: true
    });
    expect(support.knownLimits).toEqual(expect.arrayContaining([
      "KHR_texture_transform offset, scale and rotation tracks can bind only these five core texture slots: pbrMetallicRoughness/baseColorTexture, pbrMetallicRoughness/metallicRoughnessTexture, normalTexture, occlusionTexture and emissiveTexture.",
      "Required texture-transform pointers need an authored target and compatible source/UV set at import. Playback needs a compatible live shader/map, while pending bindings may resolve later; unlit, skinned and specular-glossiness configurations have narrower support.",
      "Material-extension texture transforms can be imported when optional but are not runtime-bound; required pointers to them are rejected."
    ]));
  });

  it.each([
    { pointer: `${normalPath}/rotation`, output: [0, 0, 1, 0], outputType: "VEC2" as const, error: /requires a float SCALAR output accessor/ },
    { pointer: `${normalPath}/offset`, output: [0, 1], error: /requires a float VEC2 output accessor/ },
    { pointer: `${normalPath}/scale`, output: [1, 1, 2, 2], outputType: "VEC2" as const, inputType: "VEC2" as const, times: [0, 0, 2, 0], error: /requires a float SCALAR input accessor/ },
    { pointer: `${normalPath}/rotation`, output: [0, 1], inputComponentType: 5123, error: /requires a float SCALAR input accessor/ },
    { pointer: `${normalPath}/rotation`, output: [0, 1], outputComponentType: 5123, error: /requires a float SCALAR output accessor/ },
    { pointer: `${normalPath}/rotation`, output: [0, 1], inputNormalized: true, error: /requires a float SCALAR input accessor/ },
    { pointer: `${normalPath}/offset`, output: [0, 0, 1, 1], outputType: "VEC2" as const, outputNormalized: true, error: /requires a float VEC2 output accessor/ },
    { pointer: `${normalPath}/rotation`, output: [0, 1], times: [0, 0], error: /strictly increasing input times/ },
    { pointer: `${normalPath}/rotation`, output: [0, 1], times: [0, Number.NaN], error: /strictly increasing input times/ },
    { pointer: `${normalPath}/rotation`, output: [0, Number.NaN], error: /requires finite scalar values and tangents/ },
    { pointer: `${normalPath}/offset`, output: [0, 0, 1, Number.NaN], outputType: "VEC2" as const, error: /requires finite values and tangents/ },
    { pointer: `${normalPath}/rotation`, output: [0, 0.25, Number.NaN, -0.25, 1, 0], interpolation: "CUBICSPLINE" as const, error: /requires finite scalar values and tangents/ },
    { pointer: `${normalPath}/offset`, output: [0, 0, 1, 1], outputType: "VEC2" as const, interpolation: "CUBICSPLINE" as const, error: /CUBICSPLINE output count must be three times input count/ },
    { pointer: `${normalPath}/rotation`, output: [0], error: /input\/output count mismatch/ }
  ])("rejects malformed texture-transform accessors and samples", async ({ error, ...options }) => {
    await expect(load(options)).rejects.toThrow(error);
  });
});
