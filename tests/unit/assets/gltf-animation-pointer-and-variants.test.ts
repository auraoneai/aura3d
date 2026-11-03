import { describe, expect, it } from "vitest";
import {
  GLTFLoader,
  LoadContext,
  parseMaterialVariantSelection,
  resolveAnimationPointerBinding,
  serializeMaterialVariantSelection,
  type GLTFJson,
  type GLTFMaterialVariantAsset
} from "../../../packages/assets/src";

/**
 * M1 — `KHR_animation_pointer` promotion (property-track binding instead of
 * diagnose-and-drop) and the `KHR_materials_variants` switch→save→reload round-trip
 * via scene-state JSON (NOT glTF export — there is no exporter in any package source tree).
 */

function jsonWith(overrides: Record<string, unknown> = {}): GLTFJson {
  return {
    asset: { version: "2.0" },
    nodes: [{ name: "Arm" }],
    materials: [{ name: "TestMat" }],
    meshes: [{ name: "HeroMesh", primitives: [] }],
    extensions: { KHR_lights_punctual: { lights: [{ name: "Key", type: "point", color: [1, 1, 1], intensity: 3 }] } },
    ...overrides
  } as unknown as GLTFJson;
}

describe("resolveAnimationPointerBinding — pointer channels drive runtime targets", () => {
  it("binds node TRS pointers to node tracks", () => {
    const json = jsonWith({});
    expect(resolveAnimationPointerBinding(json, "/nodes/0/translation")).toMatchObject({
      target: "Arm.translation",
      valueType: "vector3"
    });
    expect(resolveAnimationPointerBinding(json, "/nodes/0/rotation")).toMatchObject({
      target: "Arm.rotation",
      valueType: "quaternion"
    });
  });

  it("binds material property pointers to material tracks with leaf-typed values", () => {
    const json = jsonWith({});
    expect(resolveAnimationPointerBinding(json, "/materials/0/emissiveStrength")).toMatchObject({
      target: "material:TestMat.emissiveStrength",
      valueType: "scalar"
    });
    expect(resolveAnimationPointerBinding(json, "/materials/0/emissiveFactor")).toMatchObject({
      target: "material:TestMat.emissiveFactor",
      valueType: "vector3"
    });
    expect(resolveAnimationPointerBinding(json, "/materials/0/pbrMetallicRoughness/baseColorFactor")).toMatchObject({
      target: "material:TestMat.pbrMetallicRoughness.baseColorFactor",
      valueType: "number-array"
    });
  });

  it("distinguishes scalar texture controls from node and texture-transform scales", () => {
    const json = jsonWith({ materials: [{ name: "Paint.Finish" }] });
    expect(resolveAnimationPointerBinding(json, "/materials/0/normalTexture/scale")).toMatchObject({
      target: "material:Paint.Finish.normalTexture.scale", valueType: "scalar"
    });
    expect(resolveAnimationPointerBinding(json, "/materials/0/occlusionTexture/strength")).toMatchObject({
      target: "material:Paint.Finish.occlusionTexture.strength", valueType: "scalar"
    });
    expect(resolveAnimationPointerBinding(json, "/nodes/0/scale")).toMatchObject({
      target: "Arm.scale", valueType: "vector3"
    });
    expect(resolveAnimationPointerBinding(json, "/materials/0/normalTexture/extensions/KHR_texture_transform/scale")).toMatchObject({
      target: "material:Paint.Finish.normalTexture.extensions.KHR_texture_transform.scale", valueType: "number-array"
    });
    expect(resolveAnimationPointerBinding(json, "/materials/00/normalTexture/scale")).toBeUndefined();
    expect(resolveAnimationPointerBinding(json, "/materials/0//normalTexture/scale")).toBeUndefined();
    expect(resolveAnimationPointerBinding(json, "/materials/0/normalTexture/scale/")).toBeUndefined();
    expect(resolveAnimationPointerBinding(jsonWith({ materials: [{ name: " " }] }), "/materials/0/normalTexture/scale")).toBeUndefined();
    expect(resolveAnimationPointerBinding(jsonWith({ materials: [{}] }), "/materials/0/normalTexture/scale")?.target)
      .toBe("material:material-0.normalTexture.scale");
  });

  it("binds punctual-light pointers (full and short forms)", () => {
    const json = jsonWith({});
    expect(
      resolveAnimationPointerBinding(json, "/extensions/KHR_lights_punctual/lights/0/intensity")
    ).toMatchObject({ target: "light:Key.intensity", valueType: "scalar" });
    expect(resolveAnimationPointerBinding(json, "/lights/0/color")).toMatchObject({
      target: "light:Key.color",
      valueType: "vector3"
    });
  });

  it("binds mesh/node weight pointers for morph animation", () => {
    const json = jsonWith({});
    expect(resolveAnimationPointerBinding(json, "/meshes/0/weights")).toMatchObject({
      target: "HeroMesh.weights",
      valueType: "number-array"
    });
  });

  it("returns undefined for out-of-subset leaves (camera, unknown roots, bad indices)", () => {
    const json = jsonWith({});
    expect(resolveAnimationPointerBinding(json, "/cameras/0/perspective/yfov")).toBeUndefined();
    expect(resolveAnimationPointerBinding(json, "/nodes/9/translation")).toBeUndefined();
    expect(resolveAnimationPointerBinding(json, "/materials/0")).toBeUndefined();
    expect(resolveAnimationPointerBinding(json, "not-a-pointer")).toBeUndefined();
    expect(resolveAnimationPointerBinding(json, "/lights/0/spot/innerConeAngle")).toBeUndefined();
  });
});

const VARIANTS: readonly GLTFMaterialVariantAsset[] = [{ name: "day" }, { name: "night" }];

describe("material variant switch→persist→reload round-trip", () => {
  it("round-trips a selection through JSON (save → reload)", () => {
    const saved = serializeMaterialVariantSelection("night", VARIANTS);
    expect(saved).toEqual({ schemaVersion: "gltf-material-variant-state", selectedVariant: "night" });
    const reloaded = parseMaterialVariantSelection(JSON.parse(JSON.stringify(saved)), VARIANTS);
    expect(reloaded).toBe("night");
  });

  it("round-trips the default (no variant) selection", () => {
    const saved = serializeMaterialVariantSelection(undefined, VARIANTS);
    expect(parseMaterialVariantSelection(JSON.parse(JSON.stringify(saved)), VARIANTS)).toBeUndefined();
  });

  it("rejects unknown variants at switch time and at reload time", () => {
    expect(() => serializeMaterialVariantSelection("dusk", VARIANTS)).toThrow(/not defined/);
    expect(() =>
      parseMaterialVariantSelection({ schemaVersion: "gltf-material-variant-state", selectedVariant: "dusk" }, VARIANTS)
    ).toThrow(/not defined/);
  });

  it("rejects malformed scene state instead of silently defaulting", () => {
    expect(() => parseMaterialVariantSelection(null, VARIANTS)).toThrow(/must be an object/);
    expect(() => parseMaterialVariantSelection({ schemaVersion: "other" }, VARIANTS)).toThrow(/schemaVersion/);
    expect(() =>
      parseMaterialVariantSelection({ schemaVersion: "gltf-material-variant-state", selectedVariant: 3 }, VARIANTS)
    ).toThrow(/must be a string/);
  });
});

describe("pointer channels survive the real loader (synthetic GLB end-to-end)", () => {
  it("emits a material property track for a KHR_animation_pointer channel", async () => {
    const asset = await new GLTFLoader().load({ url: pointerFixtureUrl() }, new LoadContext());
    const clip = asset.animations.find((candidate) => candidate.name === "glow");
    expect(clip, "pointer animation clip must survive loading").toBeDefined();
    const track = clip?.tracks.find((candidate) => candidate.target === "material:TestMat.emissiveStrength");
    expect(track, "pointer channel must become a runtime property track").toBeDefined();
    expect(track?.valueType).toBe("scalar");
    expect(track?.sample(0)).toBeCloseTo(0.5, 5);
    expect(track?.sample(1)).toBeCloseTo(2, 5);
  });

  it.each([
    ["/materials/0/normalTexture/scale", "normalTexture.scale"],
    ["/materials/0/occlusionTexture/strength", "occlusionTexture.strength"]
  ])("loads %s as a scalar with linear, step and cubic-spline interpolation", async (pointer, path) => {
    const fixtures = [
      { interpolation: "LINEAR" as const, outputs: [0.25, 0.75], midpoint: 0.5 },
      { interpolation: "STEP" as const, outputs: [0.25, 0.75], midpoint: 0.25 },
      { interpolation: "CUBICSPLINE" as const, outputs: [0, 0.25, 0.5, -0.25, 0.75, 0], midpoint: 0.6875 }
    ];
    for (const fixture of fixtures) {
      const asset = await new GLTFLoader().load({ url: pointerFixtureUrl({
        pointer, times: [0, 2], interpolation: fixture.interpolation, outputs: fixture.outputs, materialName: "Paint.Finish"
      }) }, new LoadContext());
      const track = asset.animations[0]?.tracks[0];
      expect(track?.target).toBe(`material:Paint.Finish.${path}`);
      expect(track?.valueType).toBe("scalar");
      expect(track?.sample(0)).toBeCloseTo(0.25, 6);
      expect(track?.sample(1)).toBeCloseTo(fixture.midpoint, 6);
      expect(track?.sample(2)).toBeCloseTo(0.75, 6);
    }
  });

  it("retains both components of a texture-transform scale track", async () => {
    const pointer = "/materials/0/normalTexture/extensions/KHR_texture_transform/scale";
    const asset = await new GLTFLoader().load({ url: pointerFixtureUrl({ pointer, outputType: "VEC2", outputs: [1, 1, 2, 3] }) }, new LoadContext());
    const track = asset.animations[0]?.tracks[0];
    expect(track?.valueType).toBe("number-array");
    expect(track?.sample(0.5)).toEqual([1.5, 2]);
  });

  it.each([
    { pointer: "/cameras/0/perspective/yfov", materialName: "TestMat" },
    { pointer: "/materials/0/normalTexture/scale/", materialName: "TestMat" },
    { pointer: "/materials/0/normalTexture/scale", materialName: " " }
  ])("reports unsupported pointer shapes or material identity while retaining the asset", async ({ pointer, materialName }) => {
    const asset = await new GLTFLoader().load({ url: pointerFixtureUrl({ pointer, materialName }) }, new LoadContext());
    expect(asset.animations[0]?.tracks).toEqual([]);
    expect(asset.loaderDiagnostics.unsupportedFeatures).toContain(`animation-pointer-unsupported:${pointer}`);
  });

  it("retains a supported track with a missing map for runtime binding diagnostics", async () => {
    const pointer = "/materials/0/normalTexture/scale";
    const asset = await new GLTFLoader().load({ url: pointerFixtureUrl({ pointer, withTextures: false }) }, new LoadContext());
    expect(asset.materials[0]?.normalTexture).toBeUndefined();
    expect(asset.animations[0]?.tracks[0]).toMatchObject({ target: "material:TestMat.normalTexture.scale", valueType: "scalar" });
  });

  it.each([
    { inputType: "VEC2" as const, times: [0, 0, 1, 0], error: /requires a SCALAR input accessor/ },
    { outputType: "VEC2" as const, outputs: [0.25, 0, 0.75, 0], error: /requires a SCALAR output accessor/ },
    { outputs: [0.25, Number.NaN], error: /requires finite scalar values and tangents/ },
    { times: [0, 0], error: /strictly increasing input times/ },
    { times: [0, Number.NaN], error: /strictly increasing input times/ },
    { interpolation: "CUBICSPLINE" as const, outputs: [0, 0.25, Number.NaN, -0.25, 0.75, 0], error: /requires finite scalar values and tangents/ },
    { interpolation: "CUBICSPLINE" as const, outputs: [0.25, 0.75], error: /CUBICSPLINE output count must be three times input count/ }
  ])("rejects malformed scalar texture-control animation data", async (fixture) => {
    const { error, ...options } = fixture;
    for (const pointer of ["/materials/0/normalTexture/scale", "/materials/0/occlusionTexture/strength"]) {
      const url = pointerFixtureUrl({ pointer, ...options });
      await expect(new GLTFLoader().load({ url }, new LoadContext())).rejects.toThrow(error);
    }
  });
});

/**
 * Minimal GLB assembled in the test so loader, accessor decoding, and clip
 * sampling are exercised together without a browser or external assets.
 */
function pointerFixtureUrl(options: {
  readonly pointer?: string;
  readonly times?: readonly number[];
  readonly outputs?: readonly number[];
  readonly inputType?: "SCALAR" | "VEC2";
  readonly outputType?: "SCALAR" | "VEC2";
  readonly interpolation?: "LINEAR" | "STEP" | "CUBICSPLINE";
  readonly materialName?: string;
  readonly withTextures?: boolean;
} = {}): string {
  const times = new Float32Array(options.times ?? [0, 1]);
  const outputs = new Float32Array(options.outputs ?? [0.5, 2]);
  const inputType = options.inputType ?? "SCALAR";
  const outputType = options.outputType ?? "SCALAR";
  const inputWidth = inputType === "VEC2" ? 2 : 1;
  const outputWidth = outputType === "VEC2" ? 2 : 1;
  const pointer = options.pointer ?? "/materials/0/emissiveStrength";
  const transform = pointer.includes("/extensions/KHR_texture_transform/");
  const binary = new Uint8Array(times.byteLength + outputs.byteLength);
  binary.set(new Uint8Array(times.buffer), 0);
  binary.set(new Uint8Array(outputs.buffer), times.byteLength);

  const jsonText = JSON.stringify({
    asset: { version: "2.0" },
    extensionsUsed: ["KHR_animation_pointer", ...(transform ? ["KHR_texture_transform"] : [])],
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: "Arm" }],
    images: [{ uri: "data:image/png;base64,AQ==" }],
    textures: [{ source: 0 }],
    materials: [{ name: options.materialName ?? "TestMat", ...(options.withTextures === false ? {} : {
      normalTexture: { index: 0, ...(transform ? { extensions: { KHR_texture_transform: { scale: [1, 1] } } } : {}) },
      occlusionTexture: { index: 0 }
    }) }],
    animations: [
      {
        name: "glow",
        samplers: [{ input: 0, output: 1, interpolation: options.interpolation }],
        channels: [
          {
            sampler: 0,
            target: {
              path: "pointer",
              extensions: { KHR_animation_pointer: { pointer } }
            }
          }
        ]
      }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: times.length / inputWidth, type: inputType },
      { bufferView: 1, componentType: 5126, count: outputs.length / outputWidth, type: outputType }
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: times.byteLength },
      { buffer: 0, byteOffset: times.byteLength, byteLength: outputs.byteLength }
    ],
    buffers: [{ byteLength: binary.byteLength }]
  });
  const jsonBytes = new TextEncoder().encode(jsonText);
  const jsonPaddedLength = (jsonBytes.byteLength + 3) & ~3;
  const jsonPadded = new Uint8Array(jsonPaddedLength).fill(0x20);
  jsonPadded.set(jsonBytes);

  const totalLength = 12 + 8 + jsonPaddedLength + 8 + binary.byteLength;
  const glb = new Uint8Array(totalLength);
  const view = new DataView(glb.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, jsonPaddedLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  glb.set(jsonPadded, 20);
  const binHeader = 20 + jsonPaddedLength;
  view.setUint32(binHeader, binary.byteLength, true);
  view.setUint32(binHeader + 4, 0x004e4942, true);
  glb.set(binary, binHeader + 8);

  let binaryString = "";
  for (const byte of glb) binaryString += String.fromCharCode(byte);
  return `data:model/gltf-binary;base64,${btoa(binaryString)}`;
}
