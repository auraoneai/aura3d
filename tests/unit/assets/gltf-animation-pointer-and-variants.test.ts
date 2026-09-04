import { describe, expect, it } from "vitest";
import {
  GLTFLoader,
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
    const asset = await new GLTFLoader().load({ url: pointerFixtureUrl() }, { throwIfAborted: () => undefined } as never);
    const clip = asset.animations.find((candidate) => candidate.name === "glow");
    expect(clip, "pointer animation clip must survive loading").toBeDefined();
    const track = clip?.tracks.find((candidate) => candidate.target === "material:TestMat.emissiveStrength");
    expect(track, "pointer channel must become a runtime property track").toBeDefined();
    expect(track?.valueType).toBe("scalar");
    expect(track?.sample(0)).toBeCloseTo(0.5, 5);
    expect(track?.sample(1)).toBeCloseTo(2, 5);
  });
});

/**
 * Minimal GLB: one node, one material, one `pointer` animation channel driving
 * `/materials/0/emissiveStrength`. Built by hand so the test exercises the real
 * container + accessor + clip path, not a mock.
 */
function pointerFixtureUrl(): string {
  const times = new Float32Array([0, 1]);
  const outputs = new Float32Array([0.5, 2]);
  const binary = new Uint8Array(times.byteLength + outputs.byteLength);
  binary.set(new Uint8Array(times.buffer), 0);
  binary.set(new Uint8Array(outputs.buffer), times.byteLength);

  const jsonText = JSON.stringify({
    asset: { version: "2.0" },
    extensionsUsed: ["KHR_animation_pointer"],
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: "Arm" }],
    materials: [{ name: "TestMat" }],
    animations: [
      {
        name: "glow",
        samplers: [{ input: 0, output: 1 }],
        channels: [
          {
            sampler: 0,
            target: {
              path: "pointer",
              extensions: { KHR_animation_pointer: { pointer: "/materials/0/emissiveStrength" } }
            }
          }
        ]
      }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 2, type: "SCALAR" },
      { bufferView: 1, componentType: 5126, count: 2, type: "SCALAR" }
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
