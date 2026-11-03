import { describe, expect, it } from "vitest";
import { GLTFLoader } from "../../../packages/assets/src/GLTFLoader";
import { LoadContext } from "../../../packages/assets/src/LoadContext";
import { createTypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor";

type FixtureOptions = {
  readonly pointer: string;
  readonly values: readonly number[];
  readonly outputType?: "SCALAR" | "VEC4";
  readonly required?: boolean;
  readonly inputNormalized?: boolean;
  readonly outputNormalized?: boolean;
  readonly missingExtension?: string;
  readonly targetNode?: number;
};

const materialName = "Paint.body.v2";

function fixtureUrl(options: FixtureOptions): string {
  const chunks = [
    new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    new Float32Array([0, 1]),
    new Float32Array(options.values)
  ];
  let byteOffset = 0;
  const bufferViews = chunks.map((chunk) => {
    const view = { buffer: 0, byteOffset, byteLength: chunk.byteLength };
    byteOffset += chunk.byteLength;
    return view;
  });
  const bytes = new Uint8Array(byteOffset);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(new Uint8Array(chunk.buffer), offset);
    offset += chunk.byteLength;
  }
  const outputType = options.outputType ?? "SCALAR";
  const materialExtensions: Record<string, unknown> = {
    KHR_materials_specular: { specularFactor: 1 },
    KHR_materials_sheen: { sheenColorFactor: [0.5, 0.5, 0.5], sheenRoughnessFactor: 0.1 },
    KHR_materials_iridescence: { iridescenceFactor: 0.2, iridescenceIor: 1.3 }
  };
  if (options.missingExtension) delete materialExtensions[options.missingExtension];
  const doc = {
    asset: { version: "2.0" },
    extensionsUsed: ["KHR_animation_pointer", ...Object.keys(materialExtensions)],
    ...(options.required ? { extensionsRequired: ["KHR_animation_pointer"] } : {}),
    buffers: [{ uri: `data:application/octet-stream;base64,${Buffer.from(bytes).toString("base64")}`, byteLength: bytes.byteLength }],
    bufferViews,
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 2, componentType: 5126, count: 2, type: "SCALAR", normalized: options.inputNormalized },
      { bufferView: 3, componentType: 5126, count: options.values.length / (outputType === "VEC4" ? 4 : 1), type: outputType, normalized: options.outputNormalized }
    ],
    materials: [{
      name: materialName,
      pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0.2, roughnessFactor: 0.5 },
      extensions: materialExtensions
    }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, material: 0 }] }],
    nodes: [{ name: "Triangle", mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
    animations: [{
      name: "motion",
      samplers: [{ input: 2, output: 3 }],
      channels: [{ sampler: 0, target: {
        path: "pointer", ...(options.targetNode === undefined ? {} : { node: options.targetNode }),
        extensions: { KHR_animation_pointer: { pointer: options.pointer } }
      } }]
    }]
  };
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(doc))}`;
}

const load = (options: FixtureOptions) => new GLTFLoader().load({ url: fixtureUrl(options), type: "gltf" }, new LoadContext());

describe("public glTF animation-pointer loading and material playback", () => {
  it.each([false, true] as const)("drives a dotted material name for an optional or required core pointer: required=%s", async (required) => {
    const actor = await createTypedGLBActor({
      id: `core-pointer-${required}`, asset: { url: fixtureUrl({
        pointer: "/materials/0/pbrMetallicRoughness/metallicFactor", values: [0.2, 0.8], required
      }), format: "gltf" }, width: 8, height: 8
    });
    try {
      const result = actor.playClip("motion", 0.5);
      expect(result).toMatchObject({ materialTracksApplied: 1, missingTargets: [], unsupportedTracks: [] });
      expect(actor.pipeline.resources.materialLibrary.get(materialName)?.getParameter("u_metallic")).toBeCloseTo(0.5);
    } finally {
      actor.dispose();
    }
  });

  it("drives a required base-color vector on the real material", async () => {
    const actor = await createTypedGLBActor({
      id: "color-pointer", asset: { url: fixtureUrl({
        pointer: "/materials/0/pbrMetallicRoughness/baseColorFactor",
        values: [1, 1, 1, 1, 0.2, 0.4, 0.6, 0.8], outputType: "VEC4", required: true
      }), format: "gltf" }, width: 8, height: 8
    });
    try {
      expect(actor.playClip("motion", 1)).toMatchObject({ materialTracksApplied: 1, missingTargets: [] });
      const color = actor.pipeline.resources.materialLibrary.get(materialName)?.getParameter("u_baseColorFactor") as readonly number[];
      expect(color).toHaveLength(4);
      for (const [index, expected] of [0.2, 0.4, 0.6, 0.8].entries()) expect(color[index]).toBeCloseTo(expected);
    } finally {
      actor.dispose();
    }
  });

  it.each([
    ["KHR_materials_specular", "specularFactor", "u_specularFactor", 0.6],
    ["KHR_materials_sheen", "sheenRoughnessFactor", "u_sheenRoughnessFactor", 0.4],
    ["KHR_materials_iridescence", "iridescenceFactor", "u_iridescenceFactor", 0.7],
    ["KHR_materials_iridescence", "iridescenceIor", "u_iridescenceIor", 1.7]
  ] as const)("loads and applies required %s/%s through the live actor", async (extension, leaf, parameter, expected) => {
    const pointer = `/materials/0/extensions/${extension}/${leaf}`;
    const actor = await createTypedGLBActor({
      id: `extension-pointer-${leaf}`, asset: { url: fixtureUrl({ pointer, values: [expected, expected], required: true }), format: "gltf" },
      width: 8, height: 8
    });
    try {
      expect(actor.playClip("motion", 1)).toMatchObject({ materialTracksApplied: 1, missingTargets: [], unsupportedTracks: [] });
      expect(actor.pipeline.resources.materialLibrary.get(materialName)?.getParameter(parameter)).toBeCloseTo(expected);
    } finally {
      actor.dispose();
    }
    await expect(load({ pointer, values: [expected, expected], required: true, missingExtension: extension }))
      .rejects.toThrow(/unsupported required animation pointer/);
  });

  it.each([
    "/materials/0/unrecognized/metallicFactor",
    "/materials/0/extensions/VENDOR_unknown/metallicFactor",
    "/materials/0/unrecognized"
  ] as const)("diagnoses an unsupported optional material pointer %s", async (pointer) => {
    const asset = await load({ pointer, values: [0.2, 0.9] });
    expect(asset.loaderDiagnostics.unsupportedFeatures).toContain(`animation-pointer-unsupported:${pointer}`);
    expect(asset.animations[0]?.tracks).toEqual([]);
  });

  it.each([
    [{ inputNormalized: true }, /requires a float SCALAR input accessor/],
    [{ outputNormalized: true }, /requires a float SCALAR output accessor/]
  ] as const)("rejects normalized FLOAT accessors for required pointer data", async (flags, message) => {
    await expect(load({
      pointer: "/materials/0/pbrMetallicRoughness/metallicFactor", values: [0.2, 0.8], required: true, ...flags
    })).rejects.toThrow(message);
  });

  it("rejects a malformed optional pointer with an unrelated target node", async () => {
    await expect(load({
      pointer: "/materials/0/pbrMetallicRoughness/metallicFactor", values: [0.2, 0.8], targetNode: 0
    })).rejects.toThrow(/invalid animation pointer target/);
  });
});
