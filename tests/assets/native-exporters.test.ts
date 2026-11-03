import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync, inflateSync } from "node:zlib";
import { read as readKTX2, write as writeKTX2 } from "ktx-parse";
import * as exporterEntry from "@aura3d/assets/exporters";
import "../../packages/aura3d-cli/src/commands/assets/index";
import { cliCommandFor } from "../../packages/aura3d-cli/src/contracts/commands";
import { exportGLTF } from "../../packages/assets/src/exporters/GLTFExporter";
import { exportOBJ } from "../../packages/assets/src/exporters/OBJExporter";
import { exportPLY } from "../../packages/assets/src/exporters/PLYExporter";
import { exportSTL } from "../../packages/assets/src/exporters/STLExporter";
import { exportUSDZ } from "../../packages/assets/src/exporters/USDZExporter";
import { createDracoEncoder, exportDRACO, type AuraDracoEncoder, type AuraDracoEncoderModule } from "../../packages/assets/src/exporters/DRACOExporter";
import { exportEXR } from "../../packages/assets/src/exporters/EXRExporter";
import { parseEXR } from "../../packages/assets/src/EXRLoader";
import { exportKTX2 } from "../../packages/assets/src/exporters/KTX2Exporter";
import { sceneFromGLTFAsset, transformNormal, validateScene, type AuraExportAttribute, type AuraExportScene } from "../../packages/assets/src/exporters/ExportContext";
import { GLTFLoader } from "../../packages/assets/src/GLTFLoader";
import { LoadContext } from "../../packages/assets/src/LoadContext";
import { createDracoDecoder, type GLTFDracoDecoderModule } from "../../packages/assets/src/GLTFCompressionDecoders";
import { transcodeKTX2BasisTexture } from "../../packages/assets/src/KTX2BasisTextureTranscoder";
import { parseIndependentUSDA, readIndependentGLTF, readIndependentUSDZ, transformPoint, usdWorldMatrix } from "../support/independent-interchange-readers";

const decoder = new TextDecoder();
// Independently generated 1x1 red RGBA PNG (Aura3D test fixture, CC0-1.0),
// 70 bytes, SHA-256 4ff6ab670a58c14270e034e2090d9a432caa263a14e0a25785386b0c12f880b5.
// Authored in this test from PNG signature, IHDR, zlib IDAT and CRC chunks.
const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==", "base64"));
const bytes = (value: Blob | Uint8Array): Uint8Array => {
  if (!(value instanceof Uint8Array)) throw new Error("Expected a byte result");
  return value;
};

// Independently authored geometry with a reflected, non-uniform parent transform,
// a textured material and a separate indexed line primitive.
function sampleScene(): AuraExportScene {
  return {
    metersPerUnit: 1, upAxis: "Y", uvOrigin: "top-left",
    metadata: { author: "Aura3D test", license: "CC0" },
    nodes: [
      { name: "Parent", translation: [4, 5, 6], scale: [-2, 3, 1], children: [1, 2, 3, 4] },
      { name: "Part", mesh: 0, skin: 0 },
      { name: "Joint" },
      { name: "Camera", camera: 0 },
      { name: "Light", light: 0 }
    ],
    roots: [0],
    meshes: [{ name: "triangle-and-edge", weights: [0], primitives: [
      {
        attributes: {
          POSITION: { values: new Float32Array([-1, 0, 0, 1, 0, 0, 0, 1, 0]), itemSize: 3 },
          NORMAL: { values: new Int8Array([127, 127, 0, 127, 127, 0, 127, 127, 0]), itemSize: 3, normalized: true },
          TEXCOORD_0: { values: new Uint8Array([0, 0, 255, 0, 127, 255]), itemSize: 2, normalized: true },
          JOINTS_0: { values: new Uint8Array(12), itemSize: 4 },
          WEIGHTS_0: { values: new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0]), itemSize: 4, normalized: true }
        },
        indices: new Uint16Array([0, 1, 2]), material: 0,
        targets: [{ POSITION: { values: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), itemSize: 3 } }]
      },
      { attributes: { POSITION: { values: new Float32Array([0, 0, 0, 1, 1, 0]), itemSize: 3 }, JOINTS_0: { values: new Uint8Array(8), itemSize: 4 }, WEIGHTS_0: { values: new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0]), itemSize: 4, normalized: true } }, indices: new Uint16Array([1, 0]), mode: "lines", targets: [{ POSITION: { values: new Float32Array(6), itemSize: 3 } }] }
    ] }],
    materials: [{ name: "cloth", baseColor: [0.5, 0.25, 0.75, 1], metallic: 0.3, roughness: 0.6, baseColorTexture: "tex.png" }],
    dependencies: [{ name: "tex.png", mimeType: "image/png", data: png }],
    cameras: [{ name: "camera", type: "perspective", perspective: { yfov: 1, znear: 0.1, zfar: 100 } }],
    lights: [{ name: "lamp", type: "point", color: [1, 0.5, 0.25], intensity: 8 }],
    skins: [{ name: "skin", joints: [2], inverseBindMatrices: { values: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), itemSize: 16 } }],
    animations: [{ name: "move", channels: [{ node: 1, path: "translation", times: { values: new Float32Array([0, 1]), itemSize: 1 }, values: { values: new Float32Array([0, 0, 0, 0, 1, 0]), itemSize: 3 }, interpolation: "LINEAR" }] }]
  };
}

interface GLB { json: Record<string, any>; binary: Uint8Array }
function readGLB(buffer: Uint8Array): GLB {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  expect(view.getUint32(0, true)).toBe(0x46546c67);
  expect(view.getUint32(4, true)).toBe(2);
  expect(view.getUint32(8, true)).toBe(buffer.length);
  const jsonLength = view.getUint32(12, true);
  expect(view.getUint32(16, true)).toBe(0x4e4f534a);
  const json = JSON.parse(decoder.decode(buffer.subarray(20, 20 + jsonLength)));
  const binaryHeader = 20 + jsonLength;
  expect(view.getUint32(binaryHeader + 4, true)).toBe(0x004e4942);
  const binary = buffer.subarray(binaryHeader + 8, binaryHeader + 8 + view.getUint32(binaryHeader, true));
  expect(binaryHeader + 8 + binary.length).toBe(buffer.length);
  return { json, binary };
}
function readAccessor(file: GLB, index: number): number[][] {
  const accessor = file.json.accessors[index];
  const view = file.json.bufferViews[accessor.bufferView];
  const width = ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 } as Record<string, number>)[accessor.type]!;
  const component = ({ 5120: [1, "getInt8"], 5121: [1, "getUint8"], 5122: [2, "getInt16"], 5123: [2, "getUint16"], 5125: [4, "getUint32"], 5126: [4, "getFloat32"] } as Record<number, [number, string]>)[accessor.componentType]!;
  const data = new DataView(file.binary.buffer, file.binary.byteOffset, file.binary.byteLength);
  return Array.from({ length: accessor.count }, (_, row) => Array.from({ length: width }, (_, col) => {
    const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + row * (view.byteStride ?? width * component[0]) + col * component[0];
    const get = (data as unknown as Record<string, (at: number, little: boolean) => number>)[component[1]]!;
    return get.call(data, offset, true);
  }));
}
function codes(warnings: readonly { code: string }[]): string[] { return warnings.map((warning) => warning.code); }

describe("native interchange exporters", () => {
  it("exports a loaded and edited runtime scene through GLB and reloads it", async () => {
    const source: AuraExportScene = {
      nodes: [{ name: "Parent", children: [1] }, { name: "Part", mesh: 0 }], roots: [0], metersPerUnit: 1, upAxis: "Y",
      meshes: [{ name: "triangle", primitives: [{ attributes: { POSITION: { itemSize: 3, values: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]) } }, material: 0 }] }],
      materials: [{ name: "green", baseColor: [0.1, 0.8, 0.2, 1] }]
    };
    const dataURL = (data: Blob | Uint8Array): string => `data:model/gltf-binary;base64,${Buffer.from(bytes(data)).toString("base64")}`;
    const loader = new GLTFLoader();
    const input = await loader.load({ url: dataURL(exportGLTF(source, { binary: true }).data) }, new LoadContext());
    const live = input.createScene();
    live.findByName("Part")[0]!.transform.setPosition(0.35, 0, 0);
    const result = exportGLTF(sceneFromGLTFAsset(input, live), { binary: true });
    // Verify the exported semantics with the independent spec reader first;
    // the Aura reload below is an additional consumer check, not the oracle.
    const independent = readIndependentGLTF(bytes(result.data));
    const independentPart = independent.findNode("Part");
    expect(independent.nodes[independentPart.parent!]!.name).toBe("Parent");
    expect(independentPart.world[12]).toBeCloseTo(0.35);
    expect(independent.meshes[independentPart.mesh!]!.primitives[0]!.attributes.POSITION!.values).toEqual([[0, 0, 0], [1, 0, 0], [0, 1, 0]]);
    expect(independent.materials[independent.meshes[independentPart.mesh!]!.primitives[0]!.material!]!.pbrMetallicRoughness.baseColorFactor[1]).toBeCloseTo(0.8);
    const output = await loader.load({ url: dataURL(result.data) }, new LoadContext());
    const reloaded = output.createScene();
    reloaded.updateWorldTransforms();
    const part = reloaded.findByName("Part")[0]!;
    expect(part.parent?.name).toBe("Parent");
    expect(part.transform.worldMatrix[12]).toBeCloseTo(0.35);
    expect(output.meshes[0]!.positions).toEqual([[0, 0, 0], [1, 0, 0], [0, 1, 0]]);
    expect(output.materials[0]!.baseColorFactor[1]).toBeCloseTo(0.8);
    expect(codes(result.warnings)).toContain("SOURCE_ATTRIBUTE_ENCODING_LOST");
    const temporaryScene = input.createScene();
    sceneFromGLTFAsset({ ...input, createScene: () => temporaryScene });
    expect(temporaryScene.root.children).toHaveLength(0);
    reloaded.dispose(); live.dispose(); loader.dispose(output); loader.dispose(input);
  });
  it("snapshots edited materials and morph weights per instance", async () => {
    const target = { POSITION: { values: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), itemSize: 3 as const } };
    const source: AuraExportScene = {
      nodes: [{ name: "First", mesh: 0 }, { name: "Second", mesh: 0 }], roots: [0, 1], metersPerUnit: 1, upAxis: "Y",
      meshes: [{ name: "shape", weights: [0], primitives: [{ attributes: { POSITION: { itemSize: 3, values: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]) } }, material: 0, targets: [target] }] }],
      materials: [{ name: "red", baseColor: [1, 0, 0, 1] }, { name: "blue", baseColor: [0, 0, 1, 1] }]
    };
    const url = (data: Blob | Uint8Array): string => `data:model/gltf-binary;base64,${Buffer.from(bytes(data)).toString("base64")}`;
    const loader = new GLTFLoader();
    const input = await loader.load({ url: url(exportGLTF(source, { binary: true }).data) }, new LoadContext());
    const live = input.createScene();
    const first = live.findByName("First")[0]!, second = live.findByName("Second")[0]!;
    (first.renderable as { material: string }).material = "blue";
    first.renderable!.morphWeights[0] = 0.75;
    second.renderable!.morphWeights[0] = 0.25;
    const snapshot = sceneFromGLTFAsset(input, live);
    const file = readGLB(bytes(exportGLTF(snapshot, { binary: true }).data));
    const firstNode = file.json.nodes.find((node: { name: string }) => node.name === "First");
    const secondNode = file.json.nodes.find((node: { name: string }) => node.name === "Second");
    expect(firstNode.weights).toEqual([0.75]);
    expect(secondNode.weights).toEqual([0.25]);
    expect(file.json.meshes[firstNode.mesh].primitives[0].material).toBe(1);
    expect(file.json.meshes[secondNode.mesh].primitives[0].material).toBe(0);
    live.dispose(); loader.dispose(input);
  });
  it("retains skin bindings, joint hierarchy and animation in an imported snapshot", async () => {
    const url = (data: Blob | Uint8Array): string => `data:model/gltf-binary;base64,${Buffer.from(bytes(data)).toString("base64")}`;
    const loader = new GLTFLoader();
    const source = sampleScene();
    const original = source.animations![0]!;
    const animated = { ...source, animations: [{ ...original, channels: [...original.channels, { node: 1, path: "weights" as const, times: { values: new Float32Array([0, 1]), itemSize: 1 as const }, values: { values: new Float32Array([0, 1]), itemSize: 1 as const } }] }] };
    const input = await loader.load({ url: url(exportGLTF(animated, { binary: true }).data) }, new LoadContext());
    const live = input.createScene();
    const snapshot = sceneFromGLTFAsset(input, live);
    const exported = exportGLTF(snapshot, { binary: true });
    const output = await loader.load({ url: url(exported.data) }, new LoadContext());
    expect(output.skins[0]?.jointNames).toEqual(["Joint"]);
    expect(output.animations[0]?.tracks[0]?.target).toBe("Part.translation");
    expect(output.animations[0]?.tracks[0]?.sample(1)).toEqual([0, 1, 0]);
    const weightsTrack = output.animations[0]?.tracks.find((track) => track.target.endsWith(".weights"));
    expect(weightsTrack?.sample(1)).toEqual([1]);
    expect(output.meshes.some((mesh) => mesh.joints.length > 0 && mesh.morphTargets.length > 0)).toBe(true);
    live.dispose(); loader.dispose(output); loader.dispose(input);
  });
  it("omits an animation whose edited target no longer resolves and still exports the scene", async () => {
    const url = (data: Blob | Uint8Array): string => `data:model/gltf-binary;base64,${Buffer.from(bytes(data)).toString("base64")}`;
    const loader = new GLTFLoader();
    const input = await loader.load({ url: url(exportGLTF(sampleScene(), { binary: true }).data) }, new LoadContext());
    const live = input.createScene();
    live.findByName("Part")[0]!.name = "Renamed Part";
    const snapshot = sceneFromGLTFAsset(input, live);
    expect(snapshot.animations).toEqual([]);
    expect(codes(snapshot.sourceWarnings ?? [])).toEqual(expect.arrayContaining(["ANIMATION_TRACK_LOST", "ANIMATION_CLIP_LOST"]));
    const output = await loader.load({ url: url(exportGLTF(snapshot, { binary: true }).data) }, new LoadContext());
    expect(output.animations).toHaveLength(0);
    const reloaded = output.createScene();
    expect(reloaded.findByName("Renamed Part")).toHaveLength(1);
    reloaded.dispose(); live.dispose(); loader.dispose(output); loader.dispose(input);
  });
  it("snapshots material factors and node metadata independently of later edits", async () => {
    const source = sampleScene();
    const nodes = source.nodes.map((node, index) => index === 1 ? { ...node, metadata: { nested: { label: "before" } } } : node);
    const url = (data: Blob | Uint8Array): string => `data:model/gltf-binary;base64,${Buffer.from(bytes(data)).toString("base64")}`;
    const loader = new GLTFLoader();
    const input = await loader.load({ url: url(exportGLTF({ ...source, nodes }, { binary: true }).data) }, new LoadContext());
    const live = input.createScene();
    const snapshot = sceneFromGLTFAsset(input, live);
    (input.materials[0]!.baseColorFactor as unknown as number[])[0] = 0.99;
    const extras = live.findByName("Part")[0]!.userData.gltfExtras as { nested: { label: string } };
    extras.nested.label = "after";
    expect(snapshot.materials?.[0]?.baseColor?.[0]).toBeCloseTo(0.5);
    expect(snapshot.nodes.find((node) => node.name === "Part")?.metadata).toEqual({ nested: { label: "before" } });
    live.dispose(); loader.dispose(input);
  });
  it("reports non-JSON node extras without executing accessors while snapshotting", async () => {
    const url = (data: Blob | Uint8Array): string => `data:model/gltf-binary;base64,${Buffer.from(bytes(data)).toString("base64")}`;
    const loader = new GLTFLoader();
    const input = await loader.load({ url: url(exportGLTF(sampleScene(), { binary: true }).data) }, new LoadContext());
    const live = input.createScene();
    const part = live.findByName("Part")[0]!;
    part.userData.gltfExtras = Object.defineProperty({}, "getter", { enumerable: true, get: () => { throw new Error("must not execute"); } });
    const snapshot = sceneFromGLTFAsset(input, live);
    expect(snapshot.nodes.find((node) => node.name === "Part")?.metadata).toBeUndefined();
    expect(snapshot.sourceWarnings?.some((warning) => warning.code === "RUNTIME_METADATA_LOST" && warning.path?.endsWith(".gltfExtras"))).toBe(true);
    expect(() => exportGLTF(snapshot, { binary: true })).not.toThrow();
    live.dispose(); loader.dispose(input);
  });
  it("writes GLB hierarchy, typed accessors, indexed lines, materials, morphs, rigs, lights and animation", () => {
    const result = exportGLTF(sampleScene(), { binary: true });
    const file = readGLB(bytes(result.data));
    const doc = file.json;
    expect(doc.scenes[0].nodes).toEqual([0]);
    expect(doc.nodes[0].children).toEqual([1, 2, 3, 4]);
    expect(doc.nodes[1].skin).toBe(0);
    expect(doc.skins[0].joints).toEqual([2]);
    expect(doc.cameras[0].perspective.yfov).toBe(1);
    expect(doc.extensions.KHR_lights_punctual.lights[0].intensity).toBe(8);
    expect(doc.materials[0].pbrMetallicRoughness.baseColorFactor).toEqual([0.5, 0.25, 0.75, 1]);
    expect(doc.asset.extras.license).toBe("CC0");
    const triangle = doc.meshes[0].primitives[0];
    expect(readAccessor(file, triangle.attributes.POSITION)).toEqual([[-1, 0, 0], [1, 0, 0], [0, 1, 0]]);
    const normal = doc.accessors[triangle.attributes.NORMAL];
    expect([normal.componentType, normal.normalized]).toEqual([5120, true]);
    expect(readAccessor(file, triangle.attributes.NORMAL)).toEqual([[127, 127, 0], [127, 127, 0], [127, 127, 0]]);
    expect(readAccessor(file, triangle.targets[0].POSITION)).toEqual([[0, 0, 1], [0, 0, 1], [0, 0, 1]]);
    expect(doc.meshes[0].primitives[1].mode).toBe(1);
    expect(readAccessor(file, doc.meshes[0].primitives[1].indices)).toEqual([[1], [0]]);
    expect(doc.animations[0].channels[0].target).toEqual({ node: 1, path: "translation" });
    expect(readAccessor(file, doc.animations[0].samplers[0].output)).toEqual([[0, 0, 0], [0, 1, 0]]);
    expect(doc.images[0].bufferView).toBeTypeOf("number");
    const imageView = doc.bufferViews[doc.images[0].bufferView];
    expect(file.binary.slice(imageView.byteOffset, imageView.byteOffset + imageView.byteLength)).toEqual(png);
  });

  it("preserves core material texture maps and unlit through an asset snapshot", async () => {
    const source = sampleScene();
    const material = { ...source.materials![0]!, baseColorTexture: "tex.png", metallicRoughnessTexture: "tex.png", normalTexture: "tex.png", normalTextureScale: 0.75, occlusionTexture: "tex.png", occlusionStrength: 0.25, emissiveTexture: "tex.png", unlit: true };
    const result = exportGLTF({ ...source, materials: [material] }, { binary: true });
    const file = readGLB(bytes(result.data));
    const written = file.json.materials[0];
    expect(file.json.images).toHaveLength(1);
    expect(file.json.textures).toHaveLength(1);
    expect(written.pbrMetallicRoughness.baseColorTexture.index).toBe(0);
    expect(written.pbrMetallicRoughness.metallicRoughnessTexture.index).toBe(0);
    expect(written.normalTexture).toEqual({ index: 0, scale: 0.75 });
    expect(written.occlusionTexture).toEqual({ index: 0, strength: 0.25 });
    expect(written.emissiveTexture.index).toBe(0);
    expect(written.extensions.KHR_materials_unlit).toEqual({});
    const url = (data: Blob | Uint8Array): string => `data:model/gltf-binary;base64,${Buffer.from(bytes(data)).toString("base64")}`;
    const loader = new GLTFLoader();
    const input = await loader.load({ url: url(result.data) }, new LoadContext());
    const snapshot = sceneFromGLTFAsset(input);
    expect(snapshot.materials?.[0]).toMatchObject({ unlit: true, normalTextureScale: 0.75, occlusionStrength: 0.25 });
    expect(snapshot.materials?.[0]?.metallicRoughnessTexture).toBe(snapshot.materials?.[0]?.normalTexture);
    const second = await loader.load({ url: url(exportGLTF(snapshot, { binary: true }).data) }, new LoadContext());
    expect(second.materials[0]).toMatchObject({ unlit: true, normalTexture: { scale: 0.75 }, occlusionTexture: { strength: 0.25 } });
    loader.dispose(second); loader.dispose(input);
  });

  it("retains independently authored glTF material extensions, texture settings, and sampler distinctions in a runtime snapshot", async () => {
    // The document is authored directly from glTF 2.0 / Khronos extension
    // fields, rather than by the writer under test.
    const values = new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 1, 0,
      0, 0, 1, 0, 0, 1,
      0.2, 0.3, 0.7, 0.3, 0.2, 0.8
    ]);
    const data = Buffer.from(values.buffer).toString("base64");
    const transformed = { index: 1, texCoord: 0, extensions: { KHR_texture_transform: { offset: [0.25, 0.125], scale: [2, 3], rotation: 0.5, texCoord: 1 } } };
    const plain = { index: 0 };
    const extensions = {
      KHR_materials_emissive_strength: { emissiveStrength: 4 },
      KHR_materials_clearcoat: { clearcoatFactor: 0.7, clearcoatTexture: transformed, clearcoatRoughnessFactor: 0.3, clearcoatRoughnessTexture: plain, clearcoatNormalTexture: { ...transformed, scale: 0.75 } },
      KHR_materials_diffuse_roughness: { diffuseRoughnessFactor: 0.2, diffuseRoughnessTexture: transformed },
      EXT_materials_bump: { bumpFactor: 2, bumpTexture: plain },
      KHR_materials_transmission: { transmissionFactor: 0.6, transmissionTexture: transformed },
      KHR_materials_diffuse_transmission: { diffuseTransmissionFactor: 0.4, diffuseTransmissionTexture: plain, diffuseTransmissionColorFactor: [0.8, 0.7, 0.6], diffuseTransmissionColorTexture: transformed },
      KHR_materials_volume: { thicknessFactor: 0.05, thicknessTexture: transformed, attenuationDistance: 2, attenuationColor: [0.9, 0.8, 0.7] },
      KHR_materials_ior: { ior: 1.6 },
      KHR_materials_specular: { specularFactor: 0.65, specularTexture: plain, specularColorFactor: [1.5, 0.8, 0.4], specularColorTexture: transformed },
      KHR_materials_sheen: { sheenColorFactor: [0.2, 0.3, 0.4], sheenColorTexture: transformed, sheenRoughnessFactor: 0.5, sheenRoughnessTexture: plain },
      KHR_materials_anisotropy: { anisotropyStrength: 0.6, anisotropyRotation: 0.2, anisotropyTexture: transformed },
      KHR_materials_iridescence: { iridescenceFactor: 0.9, iridescenceTexture: plain, iridescenceIor: 1.4, iridescenceThicknessMinimum: 120, iridescenceThicknessMaximum: 380, iridescenceThicknessTexture: transformed },
      KHR_materials_dispersion: { dispersion: 0.3 }
    };
    const specGloss = { diffuseFactor: [0.3, 0.4, 0.5, 1], diffuseTexture: transformed, specularFactor: [0.6, 0.7, 0.8], glossinessFactor: 0.7, specularGlossinessTexture: plain };
    const inputDocument = {
      asset: { version: "2.0" },
      extensionsUsed: [...Object.keys(extensions), "KHR_materials_pbrSpecularGlossiness", "KHR_texture_transform"],
      buffers: [{ byteLength: values.byteLength, uri: `data:application/octet-stream;base64,${data}` }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 24 }, { buffer: 0, byteOffset: 60, byteLength: 24 }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }, { bufferView: 1, componentType: 5126, count: 3, type: "VEC2" }, { bufferView: 2, componentType: 5126, count: 3, type: "VEC2" }],
      images: [{ uri: `data:image/png;base64,${Buffer.from(png).toString("base64")}` }],
      samplers: [{ minFilter: 9728, magFilter: 9728, wrapS: 33071, wrapT: 33648 }, { minFilter: 9985, magFilter: 9729, wrapS: 10497, wrapT: 33071 }],
      textures: [{ source: 0, sampler: 0 }, { source: 0, sampler: 1 }],
      materials: [
        { name: "layers", pbrMetallicRoughness: { baseColorTexture: transformed, metallicRoughnessTexture: plain }, normalTexture: { ...plain, scale: 0.8 }, occlusionTexture: { ...transformed, strength: 0.4 }, emissiveTexture: plain, emissiveFactor: [0.2, 0.3, 0.4], extensions },
        { name: "legacy", extensions: { KHR_materials_pbrSpecularGlossiness: specGloss } }
      ],
      meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1, TEXCOORD_1: 2 }, material: 0 }] }],
      nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0
    };
    const url = `data:model/gltf+json;base64,${Buffer.from(JSON.stringify(inputDocument)).toString("base64")}`;
    const loader = new GLTFLoader();
    const input = await loader.load({ url }, new LoadContext());
    const snapshot = sceneFromGLTFAsset(input);
    // Prove the snapshot owns nested material, transform and sampler values.
    (input.materials[0]!.diffuseTransmission!.colorFactor as number[])[0] = 0;
    (input.materials[0]!.baseColorTexture!.transform!.offset as number[])[0] = 99;
    (input.textures[1]!.samplerDescriptor as { magFilter: string }).magFilter = "nearest";
    const result = exportGLTF(snapshot, { binary: true });
    const doc = readGLB(bytes(result.data)).json;
    const written = doc.materials[0], out = written.extensions;
    expect(doc.extensionsUsed).toEqual(expect.arrayContaining([...Object.keys(extensions), "KHR_materials_pbrSpecularGlossiness", "KHR_texture_transform"]));
    expect(doc.images).toHaveLength(1);
    expect(doc.images[0].mimeType).toBe("image/png");
    expect(doc.textures).toHaveLength(2);
    expect(doc.samplers).toHaveLength(2);
    const base = written.pbrMetallicRoughness.baseColorTexture;
    const plainOut = written.pbrMetallicRoughness.metallicRoughnessTexture;
    expect(base).toEqual({ index: base.index, texCoord: 1, extensions: { KHR_texture_transform: { offset: [0.25, 0.125], scale: [2, 3], rotation: 0.5 } } });
    expect(doc.textures[base.index].source).toBe(doc.textures[plainOut.index].source);
    expect(doc.textures[base.index].sampler).not.toBe(doc.textures[plainOut.index].sampler);
    expect(doc.samplers[doc.textures[base.index].sampler]).toEqual({ minFilter: 9985, magFilter: 9729, wrapS: 10497, wrapT: 33071 });
    expect(doc.samplers[doc.textures[plainOut.index].sampler]).toEqual({ minFilter: 9728, magFilter: 9728, wrapS: 33071, wrapT: 33648 });
    expect(written.normalTexture).toEqual({ ...plainOut, scale: 0.8 });
    expect(written.occlusionTexture).toEqual({ ...base, strength: 0.4 });
    expect(written.emissiveTexture).toEqual(plainOut);
    expect(out.KHR_materials_clearcoat).toEqual({ clearcoatFactor: 0.7, clearcoatTexture: base, clearcoatRoughnessFactor: 0.3, clearcoatRoughnessTexture: plainOut, clearcoatNormalTexture: { ...base, scale: 0.75 } });
    expect(out.KHR_materials_diffuse_roughness).toEqual({ diffuseRoughnessFactor: 0.2, diffuseRoughnessTexture: base });
    expect(out.EXT_materials_bump).toEqual({ bumpFactor: 2, bumpTexture: plainOut });
    expect(out.KHR_materials_transmission).toEqual({ transmissionFactor: 0.6, transmissionTexture: base });
    expect(out.KHR_materials_diffuse_transmission).toEqual({ diffuseTransmissionFactor: 0.4, diffuseTransmissionTexture: plainOut, diffuseTransmissionColorFactor: [0.8, 0.7, 0.6], diffuseTransmissionColorTexture: base });
    expect(out.KHR_materials_volume).toEqual({ thicknessFactor: 0.05, thicknessTexture: base, attenuationDistance: 2, attenuationColor: [0.9, 0.8, 0.7] });
    expect(out.KHR_materials_ior).toEqual({ ior: 1.6 });
    expect(out.KHR_materials_specular).toEqual({ specularFactor: 0.65, specularTexture: plainOut, specularColorFactor: [1.5, 0.8, 0.4], specularColorTexture: base });
    expect(out.KHR_materials_sheen).toEqual({ sheenColorFactor: [0.2, 0.3, 0.4], sheenColorTexture: base, sheenRoughnessFactor: 0.5, sheenRoughnessTexture: plainOut });
    expect(out.KHR_materials_anisotropy).toEqual({ anisotropyStrength: 0.6, anisotropyRotation: 0.2, anisotropyTexture: base });
    expect(out.KHR_materials_iridescence).toEqual({ iridescenceFactor: 0.9, iridescenceTexture: plainOut, iridescenceIor: 1.4, iridescenceThicknessMinimum: 120, iridescenceThicknessMaximum: 380, iridescenceThicknessTexture: base });
    expect(out.KHR_materials_dispersion).toEqual({ dispersion: 0.3 });
    expect(out.KHR_materials_emissive_strength).toEqual({ emissiveStrength: 4 });
    expect(doc.materials[1].extensions.KHR_materials_pbrSpecularGlossiness).toEqual({ ...specGloss, diffuseTexture: base, specularGlossinessTexture: plainOut });
    expect(doc.materials[1].extensions.KHR_materials_specular).toBeUndefined();
    expect(codes(result.warnings)).not.toEqual(expect.arrayContaining(["MATERIAL_FEATURE_LOST", "TEXTURE_COORDINATE_LOST", "TEXTURE_SAMPLER_LOST", "UNSUPPORTED_TEXTURE_FORMAT"]));
    expect(exportOBJ(snapshot).warnings.some((warning) => warning.path === "materials[0].gltf" && warning.code === "UNSUPPORTED_PROPERTY")).toBe(true);
    const roundtrip = await loader.load({ url: `data:model/gltf-binary;base64,${Buffer.from(bytes(result.data)).toString("base64")}` }, new LoadContext());
    expect(roundtrip.materials[0]!.clearcoat?.normalTexture).toMatchObject({ texCoord: 1, scale: 0.75, transform: { offset: [0.25, 0.125] } });
    expect(roundtrip.materials[0]!.diffuseRoughness?.factor).toBe(0.2);
    expect(roundtrip.materials[0]!.bump?.factor).toBe(2);
    loader.dispose(roundtrip);
    loader.dispose(input);
  });

  it("converts texture transforms and volume distances with source conventions", () => {
    const source = sampleScene();
    const mesh = source.meshes![0]!;
    const primitive = mesh.primitives[0]!;
    const uv1: AuraExportAttribute = { itemSize: 2, values: [0, 0, 1, 0, 0, 1] };
    const scene: AuraExportScene = {
      ...source, metersPerUnit: 0.01, uvOrigin: "bottom-left",
      meshes: [{ ...mesh, primitives: [{ ...primitive, attributes: { ...primitive.attributes, TEXCOORD_1: uv1 } }, mesh.primitives[1]!] }],
      materials: [{ ...source.materials![0]!, gltf: {
        textures: { baseColorTexture: { texCoord: 1, transform: { offset: [0.25, 0.4], scale: [2, 3], rotation: Math.PI / 2 } } },
        transmission: { factor: 1 }, volume: { thicknessFactor: 2, attenuationDistance: 8 },
        iridescence: { thicknessMinimum: 120, thicknessMaximum: 380 }, dispersion: 0.1
      } }]
    };
    const output = readGLB(bytes(exportGLTF(scene, { binary: true }).data));
    const material = output.json.materials[0];
    const info = material.pbrMetallicRoughness.baseColorTexture;
    expect(info.texCoord).toBe(1);
    const transform = info.extensions.KHR_texture_transform;
    expect(transform.offset[0]).toBeCloseTo(-2.75);
    expect(transform.offset[1]).toBeCloseTo(0.6);
    expect(transform.rotation).toBeCloseTo(-Math.PI / 2);
    expect(transform.scale).toEqual([2, 3]);
    expect(material.extensions.KHR_materials_volume).toEqual({ thicknessFactor: 0.02, attenuationDistance: 0.08 });
    expect(material.extensions.KHR_materials_iridescence).toEqual({ iridescenceThicknessMinimum: 120, iridescenceThicknessMaximum: 380 });
  });

  it("validates extension UV sets, samplers, material exclusions and required dependencies", () => {
    const source = sampleScene();
    const material = source.materials![0]!;
    const withMaterial = (gltf: NonNullable<typeof material.gltf>): AuraExportScene => ({ ...source, materials: [{ ...material, gltf }] });
    expect(() => exportGLTF(withMaterial({ clearcoat: { texture: { name: "tex.png", texCoord: 1 } } }), { binary: true })).toThrow(/TEXCOORD_1/);
    expect(() => exportGLTF(withMaterial({ textures: { baseColorTexture: { sampler: { minFilter: "invalid", magFilter: "linear", addressU: "repeat", addressV: "repeat" } as never } } }))).toThrow(/minFilter/);
    expect(() => exportGLTF(withMaterial({ volume: { thicknessFactor: 1 } }))).toThrow(/requires a transmission/);
    expect(() => exportGLTF(withMaterial({ dispersion: 0.5 }))).toThrow(/requires the volume/);
    expect(() => exportGLTF(withMaterial({ transmission: {}, pbrSpecularGlossiness: {} }))).toThrow(/incompatible/);
    const reversed = JSON.parse(decoder.decode(bytes(exportGLTF(withMaterial({ iridescence: { ior: 4, thicknessMinimum: 500, thicknessMaximum: 200 } })).data)));
    expect(reversed.materials[0].extensions.KHR_materials_iridescence).toEqual({ iridescenceIor: 4, iridescenceThicknessMinimum: 500, iridescenceThicknessMaximum: 200 });
    const missing = exportGLTF(withMaterial({ clearcoat: { texture: { name: "missing.png", texCoord: 1 } } }));
    expect(codes(missing.warnings)).toContain("MISSING_TEXTURE");
    const unsafeOffset = [0, 0];
    let called = false;
    Object.defineProperty(unsafeOffset, "0", { enumerable: true, get: () => { called = true; return 0; } });
    expect(() => exportGLTF(withMaterial({ textures: { baseColorTexture: { transform: { offset: unsafeOffset as [number, number], scale: [1, 1], rotation: 0 } } } }))).toThrow(/numeric data value/);
    expect(called).toBe(false);
  });

  it.each([
    ["webp", "EXT_texture_webp", "UklGRhwAAABXRUJQVlA4TA8AAAAvAAAAAAcQ/Y/+ByKi/wEA"],
    ["avif", "EXT_texture_avif", "AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADrbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAAAAAAAOcGl0bQAAAAAAAQAAAB5pbG9jAAAAAEQAAAEAAQAAAAEAAAETAAAAKgAAAChpaW5mAAAAAAABAAAAGmluZmUCAAAAAAEAAGF2MDFDb2xvcgAAAABqaXBycAAAAEtpcGNvAAAAFGlzcGUAAAAAAAAAAQAAAAEAAAAQcGl4aQAAAAADCAgIAAAADGF2MUOBAAwAAAAAE2NvbHJuY2x4AAEADQAGgAAAABdpcG1hAAAAAAAAAAEAAQQBAoMEAAAAMm1kYXQSAAoIGAAGiAhoNCAyHBTHh4ZlAgggnlAAAABIWtlc1jIgMQsbXgqRN4A="]
  ])("retains a %s-only runtime image through binary and external glTF dependencies", async (format, extension, encoded) => {
    // Separately authored 1x1 opaque red still images.
    const image = Uint8Array.from(Buffer.from(encoded, "base64"));
    const values = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1]);
    const inputDocument = {
      asset: { version: "2.0" },
      extensionsUsed: [extension], extensionsRequired: [extension],
      buffers: [{ byteLength: values.byteLength, uri: `data:application/octet-stream;base64,${Buffer.from(values.buffer).toString("base64")}` }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 24 }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }, { bufferView: 1, componentType: 5126, count: 3, type: "VEC2" }],
      images: [{ uri: `data:image/${format};base64,${encoded}` }],
      textures: [{ extensions: { [extension]: { source: 0 } } }],
      materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, material: 0 }] }],
      nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0
    };
    const loader = new GLTFLoader();
    const url = `data:model/gltf+json;base64,${Buffer.from(JSON.stringify(inputDocument)).toString("base64")}`;
    const input = await loader.load({ url }, new LoadContext());
    const snapshot = sceneFromGLTFAsset(input);
    expect(snapshot.dependencies?.[0]).toMatchObject({ name: `image-0.${format}`, mimeType: `image/${format}`, data: image });
    const withoutMime = sceneFromGLTFAsset({ ...input, images: [{ ...input.images[0]!, uri: "/external-image", mimeType: undefined }] });
    expect(withoutMime.dependencies?.[0]).toMatchObject({ mimeType: `image/${format}`, data: image });
    const result = exportGLTF(snapshot, { binary: true });
    const binary = readGLB(bytes(result.data));
    expect(binary.json.extensionsUsed).toContain(extension);
    expect(binary.json.extensionsRequired).toContain(extension);
    expect(binary.json.textures[0]).toEqual({ extensions: { [extension]: { source: 0 } } });
    expect(binary.json.images[0].mimeType).toBe(`image/${format}`);
    const view = binary.json.bufferViews[binary.json.images[0].bufferView];
    expect(binary.binary.slice(view.byteOffset, view.byteOffset + view.byteLength)).toEqual(image);
    const external = exportGLTF(snapshot, { embedDependencies: false });
    const doc = JSON.parse(decoder.decode(bytes(external.data)));
    expect(doc.images[0].uri).toBe(`image-0.${format}`);
    expect(external.dependencies.find((dependency) => dependency.name === `image-0.${format}`)?.data).toEqual(image);
    const reloaded = await loader.load({ url: `data:model/gltf-binary;base64,${Buffer.from(bytes(result.data)).toString("base64")}` }, new LoadContext());
    expect(reloaded.images[0]?.mimeType).toBe(`image/${format}`);
    loader.dispose(reloaded);
    loader.dispose(input);
  });

  it("preserves conforming ETC1S color and packed data images, including runtime snapshots and external files", async () => {
    // CC0 independently encoded 4x4 fixture; only DFD color interpretation is
    // authored here. No compressed image bytes are changed.
    const input = new Uint8Array(readFileSync(join(process.cwd(), "tests/assets/native-fixtures/ktx2-red-4x4.ktx2")));
    const descriptor = new DataView(input.buffer, input.byteOffset, input.byteLength).getUint32(48, true);
    const color = input.slice(); color[descriptor + 13] = 1; color[descriptor + 14] = 2;
    const linear = input.slice(); linear[descriptor + 13] = 0; linear[descriptor + 14] = 1;
    expect(readKTX2(color).dataFormatDescriptor[0]).toMatchObject({ colorModel: 163, colorPrimaries: 1, transferFunction: 2 });
    const source = sampleScene();
    const colorScene: AuraExportScene = {
      ...source, materials: [{ ...source.materials![0]!, baseColorTexture: "color.ktx2" }],
      dependencies: [{ name: "color.ktx2", mimeType: "image/ktx2", data: color }]
    };
    const output = exportGLTF(colorScene, { binary: true });
    expect(codes(output.warnings)).not.toEqual(expect.arrayContaining(["INVALID_KTX2_DATA", "UNSUPPORTED_KTX2_FORMAT", "KTX2_COLORSPACE_UNSUPPORTED", "KTX2_CHANNELS_UNSUPPORTED"]));
    const glb = readGLB(bytes(output.data));
    expect(glb.json.extensionsUsed).toContain("KHR_texture_basisu");
    expect(glb.json.extensionsRequired).toContain("KHR_texture_basisu");
    expect(glb.json.textures[0]).toEqual({ extensions: { KHR_texture_basisu: { source: 0 } } });
    expect(glb.json.images[0].mimeType).toBe("image/ktx2");
    const view = glb.json.bufferViews[glb.json.images[0].bufferView];
    const exportedImage = glb.binary.slice(view.byteOffset, view.byteOffset + view.byteLength);
    expect(exportedImage).toEqual(color);
    const decoded = await transcodeKTX2BasisTexture(exportedImage, { targetFormat: "rgba8" });
    expect([decoded.width, decoded.height]).toEqual([4, 4]);
    expect(decoded.data).toHaveLength(4 * 4 * 4);
    for (let i = 0; i < decoded.data!.length; i += 4) {
      for (const [channel, expected] of [224, 32, 16, 255].entries()) expect(Math.abs(decoded.data![i + channel]! - expected)).toBeLessThanOrEqual(45);
    }
    const loader = new GLTFLoader();
    const runtime = await loader.load({ url: `data:model/gltf-binary;base64,${Buffer.from(bytes(output.data)).toString("base64")}` }, new LoadContext());
    const snapshot = sceneFromGLTFAsset(runtime);
    expect(snapshot.dependencies?.[0]).toMatchObject({ name: "image-0.ktx2", mimeType: "image/ktx2", data: color });
    const resaved = exportGLTF(snapshot, { binary: true });
    expect(readGLB(bytes(resaved.data)).json.extensionsRequired).toContain("KHR_texture_basisu");
    loader.dispose(runtime);

    const packed: AuraExportScene = {
      ...source, materials: [{ ...source.materials![0]!, baseColorTexture: undefined, metallicRoughnessTexture: "packed.ktx2", occlusionTexture: "packed.ktx2", normalTexture: "packed.ktx2", gltf: { clearcoat: { normalTexture: { name: "packed.ktx2" } }, anisotropy: { texture: { name: "packed.ktx2" } } } }],
      dependencies: [{ name: "packed.ktx2", mimeType: "image/ktx2", data: linear }]
    };
    const external = exportGLTF(packed, { embedDependencies: false });
    const json = JSON.parse(decoder.decode(bytes(external.data)));
    expect(json.extensionsRequired).toContain("KHR_texture_basisu");
    expect(json.images[0]).toMatchObject({ uri: "packed.ktx2", mimeType: "image/ktx2" });
    expect(json.materials[0].pbrMetallicRoughness.metallicRoughnessTexture.index).toBe(json.materials[0].occlusionTexture.index);
    expect(json.materials[0].normalTexture.index).toBe(json.materials[0].extensions.KHR_materials_clearcoat.clearcoatNormalTexture.index);
    expect(json.materials[0].extensions.KHR_materials_anisotropy.anisotropyTexture.index).toBe(0);
    expect(external.dependencies.find((dependency) => dependency.name === "packed.ktx2")?.data).toEqual(linear);
  });

  it("supports ETC1S and UASTC channel layouts and color maps sharing linear alpha", async () => {
    // Independently encoded 4x4 RGBA pixels with the repository's documented
    // Basis encoder. RGB values are (224,32,16); alpha increases per pixel.
    const etcAlpha = Uint8Array.from(Buffer.from("q0tUWCAyMLsNChoKAAAAAAEAAAAEAAAABAAAAAAAAAAAAAAAAQAAAAEAAAABAAAAaAAAADwAAACkAAAAJAAAAMgAAAAAAAAAiAAAAAAAAABQAQAAAAAAAAIAAAAAAAAAAAAAAAAAAAA8AAAAAAAAAAIAOACjAQIAAwMAAAAAAAAAAAAAAAA/AAAAAAAAAAAA/////0AAPw8AAAAAAAAAAP////8fAAAAS1RYd3JpdGVyAEJhc2lzIFVuaXZlcnNhbCAxLjE2AAACAAIALAAAAAkAAAArAAAAAAAAAAAAAAAAAAAAAQAAAAEAAAABAAAAAcAEAAAAAAAAogKYAiAAAAAIw1i2yQOACQAAAAAAAEQBMAMAAAAAAIAMYB0EqFL9BwAAAAAAwUQAAAAAAADyX00AmAAAAAAAAEAYACYABAAAAAAQBwATAAAAAAAACCAAAgQ=", "base64"));
    const uastc = Uint8Array.from(Buffer.from("q0tUWCAyMLsNChoKAAAAAAEAAAAEAAAABAAAAAAAAAAAAAAAAQAAAAEAAAAAAAAAaAAAACwAAACUAAAALAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAABAAAAAAAAAAEAAAAAAAAAAsAAAAAAAAAAIAKACmAQIAAwMAABAAAAAAAAAAAAB/AwAAAAAAAAAA/////x8AAABLVFh3cml0ZXIAQmFzaXMgVW5pdmVyc2FsIDEuMTYAAAQAAAB/fwAAKqAHIKuIRLAQMlR2mLrc/g==", "base64"));
    const uastcZstd = Uint8Array.from(Buffer.from("q0tUWCAyMLsNChoKAAAAAAEAAAAIAAAACAAAAAAAAAAAAAAAAQAAAAEAAAACAAAAaAAAACwAAACUAAAAJAAAAAAAAAAAAAAAAAAAAAAAAAC4AAAAAAAAAEkAAAAAAAAAQAAAAAAAAAAsAAAAAAAAAAIAKACmAQIAAwMAAAAAAAAAAAAAAAB/AwAAAAAAAAAA/////x8AAABLVFh3cml0ZXIAQmFzaXMgVW5pdmVyc2FsIDEuMTYAACi1L/0gQAECACqgA5CqiETQARFUZZmq7f4qIAJQq4hE0BMiZXapu+7/KnADgKuIRD4BEFRlqbr+/yqgAzCqiEQ+ESFVZpm67f4=", "base64"));
    const source = sampleScene();
    const make = (data: Uint8Array, material: NonNullable<AuraExportScene["materials"]>[number]): AuraExportScene => ({
      ...source, materials: [{ ...material, baseColorTexture: undefined }], dependencies: [{ name: "map.ktx2", data, mimeType: "image/ktx2" }]
    });
    const shared = make(etcAlpha, { gltf: { sheen: { colorTexture: { name: "map.ktx2" }, roughnessTexture: { name: "map.ktx2" } }, specular: { colorTexture: { name: "map.ktx2" }, texture: { name: "map.ktx2" } }, diffuseTransmission: { colorTexture: { name: "map.ktx2" }, texture: { name: "map.ktx2" } } } });
    const colorOut = exportGLTF(shared, { binary: true });
    const colorDoc = readGLB(bytes(colorOut.data)).json;
    expect(codes(colorOut.warnings)).not.toContain("KTX2_COLORSPACE_UNSUPPORTED");
    expect(colorDoc.materials[0].extensions.KHR_materials_sheen).toMatchObject({ sheenColorTexture: { index: 0 }, sheenRoughnessTexture: { index: 0 } });
    expect(colorDoc.materials[0].extensions.KHR_materials_specular).toMatchObject({ specularColorTexture: { index: 0 }, specularTexture: { index: 0 } });
    expect(colorDoc.materials[0].extensions.KHR_materials_diffuse_transmission).toMatchObject({ diffuseTransmissionColorTexture: { index: 0 }, diffuseTransmissionTexture: { index: 0 } });
    expect(readKTX2(etcAlpha).dataFormatDescriptor[0]!.samples.map((sample) => sample.channelType & 15)).toEqual([0, 15]);
    const distinctSamplers = make(etcAlpha, { gltf: { sheen: {
      colorTexture: { name: "map.ktx2", sampler: { minFilter: "nearest", magFilter: "nearest", addressU: "repeat", addressV: "repeat" } },
      roughnessTexture: { name: "map.ktx2", sampler: { minFilter: "linear", magFilter: "linear", addressU: "clamp-to-edge", addressV: "repeat" } }
    } } });
    const distinctDoc = readGLB(bytes(exportGLTF(distinctSamplers, { binary: true }).data)).json;
    expect(distinctDoc.images).toHaveLength(1);
    expect(distinctDoc.textures).toHaveLength(2);
    expect(distinctDoc.textures.map((texture: { extensions: { KHR_texture_basisu: { source: number } } }) => texture.extensions.KHR_texture_basisu.source)).toEqual([0, 0]);
    const uastcScene = { ...make(uastc, {}), materials: [{ baseColorTexture: "map.ktx2", alphaMode: "BLEND" as const }] };
    const uastcOut = exportGLTF(uastcScene, { binary: true });
    expect(readGLB(bytes(uastcOut.data)).json.extensionsRequired).toContain("KHR_texture_basisu");
    expect(readKTX2(uastc).dataFormatDescriptor[0]).toMatchObject({ colorModel: 166, samples: [{ channelType: 3 }] });
    const zstdOut = exportGLTF({ ...make(uastcZstd, {}), materials: [{ baseColorTexture: "map.ktx2", alphaMode: "BLEND" }] }, { binary: true });
    const zstdGlb = readGLB(bytes(zstdOut.data));
    expect(zstdGlb.json.extensionsRequired).toContain("KHR_texture_basisu");
    expect(readKTX2(uastcZstd)).toMatchObject({ supercompressionScheme: 2, pixelWidth: 8, pixelHeight: 8 });
    const zstdView = zstdGlb.json.bufferViews[zstdGlb.json.images[0].bufferView];
    const decodedZstd = await transcodeKTX2BasisTexture(zstdGlb.binary.slice(zstdView.byteOffset, zstdView.byteOffset + zstdView.byteLength), { targetFormat: "rgba8" });
    expect([decodedZstd.width, decodedZstd.height, decodedZstd.data?.length]).toEqual([8, 8, 256]);
    expect(Math.abs(decodedZstd.data![0]! - 224)).toBeLessThanOrEqual(45);
    for (const encoded of [
      "q0tUWCAyMLsNChoKAAAAAAEAAAAIAAAACAAAAAAAAAAAAAAAAQAAAAQAAAAAAAAAsAAAACwAAADcAAAAJAAAAAAAAAAAAAAAAAAAAAAAAAAwAQAAAAAAAEAAAAAAAAAAQAAAAAAAAAAgAQAAAAAAABAAAAAAAAAAEAAAAAAAAAAQAQAAAAAAABAAAAAAAAAAEAAAAAAAAAAAAQAAAAAAABAAAAAAAAAAEAAAAAAAAAAsAAAAAAAAAAIAKACmAQIAAwMAABAAAAAAAAAAAAB/AAAAAAAAAAAA/////x8AAABLVFh3cml0ZXIAQmFzaXMgVW5pdmVyc2FsIDEuMTYAABccBOI/4GUAAAAAAAAAAAAXHATiP+BlAAAAAAAAAAAAFxwE4j/gZQAAAAAAAAAAABccBOI/4GUAAAAAAAAAAAAXHATiP+BlAAAAAAAAAAAAFxwE4j/gZQAAAAAAAAAAABccBOI/4GUAAAAAAAAAAAA=",
      "q0tUWCAyMLsNChoKAAAAAAEAAAAIAAAACAAAAAAAAAAAAAAAAQAAAAQAAAABAAAAsAAAACwAAADcAAAAJAAAAAABAAAAAAAAwQAAAAAAAADEAQAAAAAAAAEAAAAAAAAAAAAAAAAAAADDAQAAAAAAAAEAAAAAAAAAAAAAAAAAAADCAQAAAAAAAAEAAAAAAAAAAAAAAAAAAADBAQAAAAAAAAEAAAAAAAAAAAAAAAAAAAAsAAAAAAAAAAIAKACjAQIAAwMAAAAAAAAAAAAAAAA/AAAAAAAAAAAA/////x8AAABLVFh3cml0ZXIAQmFzaXMgVW5pdmVyc2FsIDEuMTYAAAEAAQArAAAABQAAAC0AAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABwAQAAAAAAADCApgSMAAAAADCCuDYA4AJAAAAAAAARAAwAQAAAAAAgCADBAAAAAAAwUQAAAAAAAAS4b9VADABAAAAAACAEAImBAgAAAAAkEwjAEwACAAAAAAgAgEBAQEE"
    ]) {
      const mipmapped = Uint8Array.from(Buffer.from(encoded, "base64"));
      expect(readKTX2(mipmapped).levels).toHaveLength(4);
      const out = exportGLTF({ ...make(mipmapped, {}), materials: [{ baseColorTexture: "map.ktx2" }] }, { binary: true });
      expect(readGLB(bytes(out.data)).json.extensionsRequired).toContain("KHR_texture_basisu");
    }

    // Reinterpret the independently encoded ETC1S color and alpha slices as
    // red and green data channels. Their compressed contents are unchanged.
    const rg = etcAlpha.slice(), dv = new DataView(rg.buffer, rg.byteOffset, rg.byteLength), dfd = dv.getUint32(48, true);
    rg[dfd + 13] = 0; rg[dfd + 14] = 1;
    rg[dfd + 31] = 3; rg[dfd + 47] = 4;
    const rgScene = make(rg, { gltf: { transmission: { texture: { name: "map.ktx2" } }, volume: { thicknessTexture: { name: "map.ktx2" } }, clearcoat: { texture: { name: "map.ktx2" }, roughnessTexture: { name: "map.ktx2" } }, iridescence: { texture: { name: "map.ktx2" }, thicknessTexture: { name: "map.ktx2" } }, diffuseRoughness: { texture: { name: "map.ktx2" } }, bump: { texture: { name: "map.ktx2" } } } });
    const rgOut = exportGLTF(rgScene, { binary: true });
    const rgDoc = readGLB(bytes(rgOut.data)).json;
    expect(rgDoc.extensionsRequired).toContain("KHR_texture_basisu");
    expect(codes(rgOut.warnings)).not.toEqual(expect.arrayContaining(["KTX2_COLORSPACE_UNSUPPORTED", "KTX2_CHANNELS_UNSUPPORTED"]));
    expect(rgDoc.materials[0].extensions.KHR_materials_clearcoat).toMatchObject({ clearcoatTexture: { index: 0 }, clearcoatRoughnessTexture: { index: 0 } });
    expect(rgDoc.materials[0].extensions.KHR_materials_volume.thicknessTexture.index).toBe(0);
    expect(rgDoc.materials[0].extensions.KHR_materials_iridescence).toMatchObject({ iridescenceTexture: { index: 0 }, iridescenceThicknessTexture: { index: 0 } });
    expect(rgDoc.materials[0].extensions.KHR_materials_diffuse_roughness.diffuseRoughnessTexture.index).toBe(0);
    expect(rgDoc.materials[0].extensions.EXT_materials_bump.bumpTexture.index).toBe(0);
    expect(readKTX2(rg).dataFormatDescriptor[0]!.samples.map((sample) => sample.channelType & 15)).toEqual([3, 4]);

    const original = new Uint8Array(readFileSync(join(process.cwd(), "tests/assets/native-fixtures/ktx2-red-4x4.ktx2")));
    const opaqueColor = original.slice(), opaqueDfd = new DataView(opaqueColor.buffer).getUint32(48, true);
    opaqueColor[opaqueDfd + 13] = 1; opaqueColor[opaqueDfd + 14] = 2;
    const implicitAlpha = exportGLTF({ ...make(opaqueColor, {}), materials: [{ baseColorTexture: "map.ktx2", alphaMode: "BLEND" }] }, { binary: true });
    expect(readGLB(bytes(implicitAlpha.data)).json.extensionsRequired).toContain("KHR_texture_basisu");
    const red = original.slice(), redDfd = new DataView(red.buffer).getUint32(48, true);
    red[redDfd + 13] = 0; red[redDfd + 14] = 1; red[redDfd + 31] = 3;
    const redOut = exportGLTF(make(red, { gltf: { transmission: { texture: { name: "map.ktx2" } } } }), { binary: true });
    expect(readGLB(bytes(redOut.data)).json.extensionsRequired).toContain("KHR_texture_basisu");
    expect(readKTX2(red).dataFormatDescriptor[0]!.samples[0]!.channelType & 15).toBe(3);

    const alphaData = etcAlpha.slice(), alphaDfd = new DataView(alphaData.buffer).getUint32(48, true);
    alphaData[alphaDfd + 13] = 0; alphaData[alphaDfd + 14] = 1;
    const alphaOut = exportGLTF(make(alphaData, { gltf: { diffuseTransmission: { texture: { name: "map.ktx2" } }, specular: { texture: { name: "map.ktx2" } }, sheen: { roughnessTexture: { name: "map.ktx2" } } } }), { binary: true });
    const alphaDoc = readGLB(bytes(alphaOut.data)).json;
    expect(alphaDoc.extensionsRequired).toContain("KHR_texture_basisu");
    expect(alphaDoc.materials[0].extensions.KHR_materials_diffuse_transmission.diffuseTransmissionTexture.index).toBe(0);
    expect(alphaDoc.materials[0].extensions.KHR_materials_specular.specularTexture.index).toBe(0);
    expect(alphaDoc.materials[0].extensions.KHR_materials_sheen.sheenRoughnessTexture.index).toBe(0);
    const legacyOut = exportGLTF(make(etcAlpha, { gltf: { pbrSpecularGlossiness: { diffuseTexture: { name: "map.ktx2" }, specularGlossinessTexture: { name: "map.ktx2" } } } }), { binary: true });
    expect(readGLB(bytes(legacyOut.data)).json.extensionsRequired).toContain("KHR_texture_basisu");
  });

  it("reports incompatible or malformed Basis images without referencing them", () => {
    const source = sampleScene();
    const input = new Uint8Array(readFileSync(join(process.cwd(), "tests/assets/native-fixtures/ktx2-red-4x4.ktx2")));
    const dfd = new DataView(input.buffer, input.byteOffset, input.byteLength).getUint32(48, true);
    const color = input.slice(); color[dfd + 13] = 1; color[dfd + 14] = 2;
    const linear = input.slice(); linear[dfd + 13] = 0; linear[dfd + 14] = 1;
    const globalData = Number(new DataView(color.buffer).getBigUint64(64, true));
    const run = (data: Uint8Array, material = { ...source.materials![0]!, baseColorTexture: "map.ktx2" }) => exportGLTF({
      ...source, materials: [material], dependencies: [{ name: "map.ktx2", mimeType: "image/ktx2", data }]
    }, { binary: true });
    const mutate = (at: number, value: number) => { const copy = color.slice(); new DataView(copy.buffer).setUint32(at, value, true); return copy; };
    const malformed: Uint8Array[] = [
      color.subarray(0, 100), // The backing allocation still contains bytes beyond this view.
      mutate(40, 0), // Compressed images cannot declare zero levels.
      mutate(20, 6), // Width must be a multiple of four.
      mutate(28, 1), // Material images must be 2D.
      mutate(48, 80), // DFD overlaps the level index.
      mutate(56, dfd + 4), // Key/value data overlaps the descriptor.
      mutate(88, 0xffffffff), // The first mip length exceeds the input view.
      mutate(64, 0), // An invalid BasisLZ global-data offset.
      mutate(dfd + 28, 0xffffffff), // Invalid sample offset/length.
      mutate(globalData + 4, 0xffffffff), // Codebook lengths exceed global data.
      mutate(globalData + 24, 0xffffffff) // The RGB slice exceeds its mip level.
    ];
    for (const data of malformed) {
      const result = run(data);
      expect(codes(result.warnings)).toEqual(expect.arrayContaining([expect.stringMatching(/^(INVALID_KTX2_DATA|UNSUPPORTED_KTX2_FORMAT)$/)]));
      expect(result.dependencies.find((dependency) => dependency.name === "map.ktx2")?.data).toEqual(data);
      expect(readGLB(bytes(result.data)).json.materials[0].pbrMetallicRoughness.baseColorTexture).toBeUndefined();
    }
    const wrongSpace = run(linear);
    expect(codes(wrongSpace.warnings)).toContain("KTX2_COLORSPACE_UNSUPPORTED");
    const dataOnly = { ...source.materials![0]!, baseColorTexture: undefined, occlusionTexture: "map.ktx2" };
    expect(codes(run(linear, dataOnly).warnings)).toContain("KTX2_CHANNELS_UNSUPPORTED");
    // Reuse the same image and sampler in incompatible RGB color and data
    // bindings; validation must occur even if the first binding was cached.
    const mixed = run(color, { ...source.materials![0]!, baseColorTexture: "map.ktx2", normalTexture: "map.ktx2" });
    const material = readGLB(bytes(mixed.data)).json.materials[0];
    expect(material.pbrMetallicRoughness.baseColorTexture).toBeDefined();
    expect(material.normalTexture).toBeUndefined();
    expect(codes(mixed.warnings)).toContain("KTX2_COLORSPACE_UNSUPPORTED");
    const withMetadata = (orientation: string, swizzle: string): Uint8Array => {
      const container = readKTX2(color);
      container.keyValue.KTXorientation = orientation;
      container.keyValue.KTXswizzle = swizzle;
      return writeKTX2(container);
    };
    const compatibleMetadata = run(withMetadata("rd", "rgba"));
    expect(readGLB(bytes(compatibleMetadata.data)).json.extensionsRequired).toContain("KHR_texture_basisu");
    expect(codes(run(withMetadata("ru", "rgba")).warnings)).toContain("UNSUPPORTED_KTX2_FORMAT");
    expect(codes(run(withMetadata("rd", "bgra")).warnings)).toContain("UNSUPPORTED_KTX2_FORMAT");
    const wrongScheme = color.slice(); new DataView(wrongScheme.buffer).setUint32(44, 2, true);
    expect(codes(run(wrongScheme).warnings)).toContain("UNSUPPORTED_KTX2_FORMAT");
    const unsupportedModel = color.slice(); unsupportedModel[dfd + 12] = 1;
    expect(codes(run(unsupportedModel).warnings)).toContain("UNSUPPORTED_KTX2_FORMAT");
  });

  it("writes external glTF dependencies and converts nonstandard scene conventions", () => {
    const source = { ...sampleScene(), metersPerUnit: 0.01, upAxis: "Z" as const };
    const output = exportGLTF(source, { embedDependencies: false });
    const doc = JSON.parse(decoder.decode(bytes(output.data)));
    expect(doc.asset.version).toBe("2.0");
    expect(output.dependencies.map((dependency) => dependency.name)).toEqual(expect.arrayContaining(["tex.png"]));
    expect(codes(output.warnings)).toContain("HIERARCHY_ADAPTED");
    expect(codes(output.warnings)).not.toEqual(expect.arrayContaining(["UNIT_CONVENTION_DIFFERENCE", "UP_AXIS_DIFFERENCE"]));
  });

  it("converts centimetres, Z-up and bottom-left UVs while retaining indexed data", () => {
    const source = sampleScene();
    const converted: AuraExportScene = { ...source, metersPerUnit: 0.01, upAxis: "Z", uvOrigin: "bottom-left", lights: [{ type: "point", range: 100 }] };
    const file = readGLB(bytes(exportGLTF(converted, { binary: true }).data));
    const rootIndex = file.json.scenes[0].nodes[0];
    const root = file.json.nodes[rootIndex];
    expect(root.matrix).toEqual([1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1]);
    expect(root.children).toEqual([0]);
    expect(file.json.nodes[0].translation).toEqual([0.04, 0.05, 0.06]);
    const primitive = file.json.meshes[0].primitives[0];
    expect(readAccessor(file, primitive.attributes.POSITION)[0]![0]).toBeCloseTo(-0.01);
    expect(readAccessor(file, primitive.targets[0].POSITION)[0]![2]).toBeCloseTo(0.01);
    expect(readAccessor(file, primitive.attributes.TEXCOORD_0)).toEqual([[0, 255], [255, 255], [127, 0]]);
    expect(file.json.accessors[primitive.attributes.TEXCOORD_0]).toMatchObject({ componentType: 5121, normalized: true });
    expect(readAccessor(file, file.json.animations[0].samplers[0].output)[1]![1]).toBeCloseTo(0.01);
    expect(file.json.cameras[0].perspective.znear).toBeCloseTo(0.001);
    expect(file.json.extensions.KHR_lights_punctual.lights[0].range).toBe(1);
    expect(readAccessor(file, file.json.meshes[0].primitives[1].indices)).toEqual([[1], [0]]);
  });
  it("widens reserved glTF primitive-restart index values without changing them", () => {
    for (const [count, index, values, expectedType] of [
      [256, 255, new Uint8Array([255]), 5123],
      [65536, 65535, new Uint16Array([65535]), 5125],
      [256, 255, [255], 5123],
      [65536, 65535, [65535], 5125]
    ] as const) {
      const scene: AuraExportScene = { nodes: [{ mesh: 0 }], roots: [0], metersPerUnit: 1, upAxis: "Y", meshes: [{ primitives: [{
        mode: "points", attributes: { POSITION: { values: new Float32Array(count * 3), itemSize: 3 } }, indices: values
      }] }] };
      const output = exportGLTF(scene, { binary: true });
      const file = readGLB(bytes(output.data));
      const accessor = file.json.meshes[0].primitives[0].indices;
      expect(file.json.accessors[accessor].componentType).toBe(expectedType);
      expect(readAccessor(file, accessor)).toEqual([[index]]);
      if (!Array.isArray(values)) expect(codes(output.warnings)).toContain("INDEX_COMPONENT_WIDENED");
    }
  });
  it("writes quantized morph attributes and weight animation on a matrix node", () => {
    const position = { values: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), itemSize: 3 as const };
    const scene: AuraExportScene = {
      nodes: [{ mesh: 0, matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], weights: [0] }], roots: [0], metersPerUnit: 1, upAxis: "Y", uvOrigin: "bottom-left",
      meshes: [{ primitives: [
        { attributes: { POSITION: position } },
        { attributes: { POSITION: position, TEXCOORD_0: { values: new Float32Array(6), itemSize: 2 }, COLOR_0: { values: new Float32Array(9).fill(1), itemSize: 3 } },
          targets: [{ POSITION: { values: new Uint16Array([1, 2, 3, 4, 5, 6, 7, 8, 9]), itemSize: 3 },
            TEXCOORD_0: { values: new Int8Array([-128, -128, 0, 127, 1, -1]), itemSize: 2, normalized: true },
            COLOR_0: { values: new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8]), itemSize: 3, normalized: true } }] }
      ] }],
      animations: [{ name: "weights", channels: [{ node: 0, path: "weights", times: { values: [0, 1], itemSize: 1 }, values: { values: [0, 1], itemSize: 1 } }] }]
    };
    const output = exportGLTF(scene, { binary: true });
    const file = readGLB(bytes(output.data));
    const target = file.json.meshes[0].primitives[1].targets[0];
    expect(file.json.accessors[target.POSITION].componentType).toBe(5126);
    expect(readAccessor(file, target.POSITION)).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
    expect(file.json.accessors[target.TEXCOORD_0]).toMatchObject({ componentType: 5120, normalized: true });
    expect(readAccessor(file, target.TEXCOORD_0)).toEqual([[-128, 127], [0, -127], [1, 1]]);
    expect(file.json.accessors[target.COLOR_0]).toMatchObject({ componentType: 5121, normalized: true });
    expect(readAccessor(file, target.COLOR_0)).toEqual([[0, 1, 2], [3, 4, 5], [6, 7, 8]]);
    expect(file.json.nodes[0].matrix).toEqual(scene.nodes[0]!.matrix);
    expect(file.json.animations[0].channels[0].target).toEqual({ node: 0, path: "weights" });
    expect(codes(output.warnings)).toContain("ATTRIBUTE_REENCODED");
  });
  it("rejects malformed glTF attribute sets and invalid skin influences", () => {
    const position = { values: [0, 0, 0, 1, 0, 0, 0, 1, 0], itemSize: 3 as const };
    const uv = { values: [0, 0, 0, 0, 0, 0], itemSize: 2 as const };
    const joints = { values: new Uint8Array(12), itemSize: 4 as const };
    const cases: readonly Readonly<Record<string, AuraExportAttribute>>[] = [
      { TEXCOORD_01: uv }, { TEXCOORD_1: uv },
      { TANGENT: { values: [1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1], itemSize: 4 as const } },
      { COLOR_0: { values: [2, 0, 0, 0, 0, 0, 0, 0, 0], itemSize: 3 as const } },
      { JOINTS_0: joints },
      { JOINTS_0: joints, WEIGHTS_0: { values: new Uint8Array(12), itemSize: 4 as const, normalized: true } },
      { JOINTS_0: joints, WEIGHTS_0: { values: [0.5, 0.5, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], itemSize: 4 as const } }
    ];
    for (const attributes of cases) {
      const scene: AuraExportScene = { nodes: [{ mesh: 0 }], roots: [0], meshes: [{ primitives: [{ attributes: { POSITION: position, ...attributes } }] }] };
      expect(() => exportGLTF(scene, { binary: true })).toThrow(/GLTF_INVALID/);
    }
  });
  it("rejects an embedded textured material when its primitive has no texture coordinates", () => {
    const scene: AuraExportScene = {
      nodes: [{ mesh: 0 }], roots: [0], meshes: [{ primitives: [{ attributes: {
        POSITION: { values: [0, 0, 0, 1, 0, 0, 0, 1, 0], itemSize: 3 }
      }, material: 0 }] }],
      materials: [{ baseColorTexture: "tex.png" }], dependencies: [{ name: "tex.png", mimeType: "image/png", data: png }]
    };
    expect(() => exportGLTF(scene, { binary: true })).toThrow(/TEXCOORD_0/);
  });
  it("preserves custom attribute keys and validates exported skin hierarchy", () => {
    const attributes: Record<string, { values: number[]; itemSize: 1 | 3 }> = Object.create(null);
    attributes.POSITION = { values: [0, 0, 0, 1, 0, 0, 0, 1, 0], itemSize: 3 };
    attributes.__proto__ = { values: [1, 2, 3], itemSize: 1 };
    const custom: AuraExportScene = { nodes: [{ mesh: 0 }], roots: [0], meshes: [{ primitives: [{ attributes }] }] };
    const file = readGLB(bytes(exportGLTF(custom, { binary: true }).data));
    const accessor = file.json.meshes[0].primitives[0].attributes.__proto__;
    expect(typeof accessor).toBe("number");
    expect(readAccessor(file, accessor)).toEqual([[1], [2], [3]]);
    expect(() => exportGLTF({ nodes: [{}, {}], roots: [0, 1], skins: [{ joints: [0, 1] }] })).toThrow(/common ancestor/i);
    expect(() => exportGLTF({ nodes: [{ children: [1, 2] }, {}, {}], roots: [0], skins: [{ joints: [1], skeleton: 2 }] })).toThrow(/skeleton.*ancestor/i);
    const geometry = { attributes: {
      POSITION: { values: [0, 0, 0, 1, 0, 0, 0, 1, 0], itemSize: 3 as const },
      JOINTS_0: { values: new Uint8Array(12), itemSize: 4 as const },
      WEIGHTS_0: { values: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], itemSize: 4 as const }
    } };
    expect(() => exportGLTF({ nodes: [{ children: [1] }, { mesh: 0, skin: 0 }, {}], roots: [0], meshes: [{ primitives: [geometry] }], skins: [{ joints: [2] }] })).toThrow(/same scene/i);
  });

  it("writes OBJ world geometry, inverse-transpose normals, indexed edges and an MTL texture", () => {
    const output = exportOBJ(sampleScene());
    const text = decoder.decode(bytes(output.data));
    expect(text).toMatch(/^v 6 5 6$/m);
    expect(text).toMatch(/^v 2 5 6$/m);
    const normals = text.match(/^vn ([^\n]+)$/m)?.[1]?.split(" ").map(Number);
    expect(normals?.[0]).toBeCloseTo(-0.8320502943);
    expect(normals?.[1]).toBeCloseTo(0.5547001962);
    expect(text).toMatch(/^l \d+\/\d+ \d+\/\d+$|^l \d+ \d+$/m);
    const mtl = output.dependencies.find((dependency) => dependency.name.endsWith(".mtl"));
    expect(mtl).toBeDefined();
    expect(decoder.decode(bytes(mtl!.data))).toMatch(/map_Kd tex\.png/);
    expect(bytes(output.dependencies.find((dependency) => dependency.name === "tex.png")!.data)).toEqual(png);
    expect(codes(output.warnings)).toContain("ANIMATIONS_LOST");
  });
  it("reports material maps that OBJ cannot represent and packages compatible extensions", () => {
    const source = sampleScene();
    const material = { ...source.materials![0]!, metallicRoughnessTexture: "tex.png", normalTexture: "tex.png", normalTextureScale: 0.75, occlusionTexture: "tex.png", occlusionStrength: 0.25, emissiveTexture: "tex.png", unlit: true };
    const output = exportOBJ({ ...source, materials: [material] });
    const mtl = decoder.decode(bytes(output.dependencies.find((dependency) => dependency.name.endsWith(".mtl"))!.data));
    expect(mtl).toMatch(/^map_Ke tex\.png$/m);
    expect(mtl).toMatch(/^norm tex\.png$/m);
    expect(output.dependencies.filter((dependency) => dependency.name === "tex.png")).toHaveLength(1);
    for (const property of ["metallicRoughnessTexture", "normalTextureScale", "occlusionTexture", "occlusionStrength", "unlit"]) {
      expect(output.warnings.some((warning) => warning.path?.endsWith(`.${property}`))).toBe(true);
    }
  });

  it.each(["ascii", "binary_little_endian", "binary_big_endian"] as const)("writes %s PLY vertices, faces and indexed edges", (format) => {
    const output = exportPLY(sampleScene(), { format });
    const data = bytes(output.data);
    const text = decoder.decode(data);
    const boundary = text.indexOf("end_header\n") + "end_header\n".length;
    expect(boundary).toBeGreaterThan(0);
    expect(text.slice(0, boundary)).toContain(`format ${format} 1.0`);
    expect(text.slice(0, boundary)).toContain("element vertex 5");
    expect(text.slice(0, boundary)).toContain("element edge 1");
    if (format === "ascii") {
      const rows = text.slice(boundary).trim().split("\n");
      expect(rows[0]!.split(" ").slice(0, 3).map(Number)).toEqual([6, 5, 6]);
      expect(rows[5]).toBe("3 0 2 1");
      expect(rows[6]).toBe("4 3");
    } else {
      const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
      const little = format === "binary_little_endian";
      expect([0, 8, 16].map((offset) => dataView.getFloat64(boundary + offset, little))).toEqual([6, 5, 6]);
      // Layout: 3 position, 3 normal and 2 UV doubles for each of five vertices.
      const face = boundary + 5 * 8 * 8;
      expect(dataView.getUint8(face)).toBe(3);
      expect([1, 5, 9].map((offset) => dataView.getUint32(face + offset, little))).toEqual([0, 2, 1]);
      expect([0, 4].map((offset) => dataView.getUint32(face + 13 + offset, little))).toEqual([4, 3]);
    }
    expect(codes(output.warnings)).toContain("ANIMATIONS_UNSUPPORTED");
  });
  it("reports mixed point topology and out-of-range PLY colors without discarding data", () => {
    const triangle = { attributes: { POSITION: { values: [0, 0, 0, 1, 0, 0, 0, 1, 0], itemSize: 3 as const } } };
    const point = { mode: "points" as const, attributes: { POSITION: { values: [2, 3, 4], itemSize: 3 as const }, COLOR_0: { values: [2, 0.5, -1], itemSize: 3 as const } } };
    const output = exportPLY({ nodes: [{ mesh: 0 }], roots: [0], meshes: [{ primitives: [triangle, point] }] });
    const text = decoder.decode(bytes(output.data));
    expect(text).toMatch(/^2 3 4 2 0\.5 -1$/m);
    expect(codes(output.warnings)).toEqual(expect.arrayContaining(["POINT_TOPOLOGY_AMBIGUOUS", "COLOR_RANGE_NONSTANDARD"]));
  });
  it.each(["ascii", "binary_little_endian", "binary_big_endian"] as const)("preserves a zero PLY normal in %s and reports it", (format) => {
    const source: AuraExportScene = {
      nodes: [{ mesh: 0 }], roots: [0], meshes: [{ primitives: [{ mode: "points", attributes: {
        POSITION: { values: [0, 0, 0], itemSize: 3 }, NORMAL: { values: [0, 0, 0], itemSize: 3 }
      } }] }]
    };
    const output = exportPLY(source, { format });
    const data = bytes(output.data);
    const text = decoder.decode(data);
    const body = text.indexOf("end_header\n") + "end_header\n".length;
    if (format === "ascii") expect(text.slice(body).trim()).toBe("0 0 0 0 0 0");
    else {
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      const little = format === "binary_little_endian";
      expect([24, 32, 40].map((offset) => view.getFloat64(body + offset, little))).toEqual([0, 0, 0]);
    }
    expect(codes(output.warnings)).toContain("ZERO_NORMAL");
  });
  it("preserves reflected face orientation for tiny finite world scales", () => {
    const source: AuraExportScene = {
      nodes: [{ scale: [-1e-300, 1e-300, 1], mesh: 0 }], roots: [0],
      meshes: [{ primitives: [{ attributes: { POSITION: { values: [0, 0, 0, 1, 0, 0, 0, 1, 0], itemSize: 3 } } }] }]
    };
    expect(decoder.decode(bytes(exportOBJ(source).data))).toMatch(/^f 1 3 2$/m);
    expect(decoder.decode(bytes(exportPLY(source).data))).toMatch(/^3 0 2 1$/m);
  });
  it("detects winding reversal with a highly anisotropic sheared transform", () => {
    const source: AuraExportScene = {
      nodes: [{ matrix: [-1, 1, 1, 0, 0, 1e-300, 0, 0, 0, 0, 1e-300, 0, 0, 0, 0, 1], mesh: 0 }], roots: [0],
      meshes: [{ primitives: [{ attributes: { POSITION: { values: [0, 0, 0, 1, 0, 0, 0, 1, 0], itemSize: 3 } } }] }]
    };
    expect(decoder.decode(bytes(exportOBJ(source).data))).toMatch(/^f 1 3 2$/m);
    expect(decoder.decode(bytes(exportPLY(source).data))).toMatch(/^3 0 2 1$/m);
    const stl = decoder.decode(bytes(exportSTL(source, { binary: false }).data));
    const vertices = Array.from(stl.matchAll(/^\s*vertex (.+)$/gm), (match) => match[1]!.split(" ").map(Number));
    expect(vertices).toEqual([[0, 0, 0], [0, 1e-300, 0], [-1, 1, 1]]);
  });
  it("keeps instanced STL solids and OBJ groups distinct when their names match", () => {
    const source: AuraExportScene = {
      nodes: [{ name: "Part", mesh: 0 }, { name: "Part", translation: [2, 0, 0], mesh: 0 }], roots: [0, 1],
      meshes: [{ name: "Shape", primitives: [{ attributes: { POSITION: { values: [0, 0, 0, 1, 0, 0, 0, 1, 0], itemSize: 3 } } }] }]
    };
    const obj = decoder.decode(bytes(exportOBJ(source).data));
    const groups = Array.from(obj.matchAll(/^g (.+)$/gm), (match) => match[1]);
    expect(groups).toHaveLength(2);
    expect(new Set(groups).size).toBe(2);
    const stl = decoder.decode(bytes(exportSTL(source, { binary: false }).data));
    const solids = Array.from(stl.matchAll(/^solid (.+)$/gm), (match) => match[1]);
    expect(solids).toHaveLength(2);
    expect(new Set(solids).size).toBe(2);
    expect(Array.from(stl.matchAll(/^endsolid (.+)$/gm), (match) => match[1])).toEqual(solids);
  });

  it("writes STL facets with reflected winding and reports omitted lines/materials", () => {
    const binary = exportSTL(sampleScene(), { binary: true });
    const data = bytes(binary.data);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    expect(data.length).toBe(134);
    expect(view.getUint32(80, true)).toBe(1);
    expect([84, 88, 92].map((offset) => view.getFloat32(offset, true))).toEqual([0, 0, 1]);
    expect([96, 100, 104].map((offset) => view.getFloat32(offset, true))).toEqual([6, 5, 6]);
    expect([108, 112, 116].map((offset) => view.getFloat32(offset, true))).toEqual([4, 8, 6]);
    expect(codes(binary.warnings)).toEqual(expect.arrayContaining(["TOPOLOGY_LOST", "MATERIALS_LOST"]));
    const ascii = decoder.decode(bytes(exportSTL(sampleScene(), { binary: false }).data));
    expect(ascii).toMatch(/^solid Part/m);
    expect(ascii).toContain("vertex 4 8 6");
    expect(ascii).toMatch(/^endsolid Part/m);
  });
});

interface ZipEntry { name: string; data: Uint8Array; crc: number; offset: number }
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
// Independent stored-ZIP parser: walk local records, verify central-directory
// offsets, method, sizes, CRC and USDZ's alignment constraint.
function readStoredZIP(input: Uint8Array): ZipEntry[] {
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const entries: ZipEntry[] = [];
  let cursor = 0;
  while (view.getUint32(cursor, true) === 0x04034b50) {
    const start = cursor;
    expect(view.getUint16(start + 8, true)).toBe(0);
    expect(view.getUint16(start + 6, true) & 8).toBe(0);
    const crc = view.getUint32(start + 14, true);
    const size = view.getUint32(start + 18, true);
    expect(size).toBe(view.getUint32(start + 22, true));
    const nameLength = view.getUint16(start + 26, true);
    const extraLength = view.getUint16(start + 28, true);
    const name = decoder.decode(input.subarray(start + 30, start + 30 + nameLength));
    const dataOffset = start + 30 + nameLength + extraLength;
    expect(dataOffset % 64).toBe(0);
    const data = input.slice(dataOffset, dataOffset + size);
    expect(crc32(data)).toBe(crc);
    entries.push({ name, data, crc, offset: start });
    cursor = dataOffset + size;
  }
  const centralStart = cursor;
  for (const entry of entries) {
    expect(view.getUint32(cursor, true)).toBe(0x02014b50);
    expect(view.getUint32(cursor + 16, true)).toBe(entry.crc);
    expect(view.getUint32(cursor + 42, true)).toBe(entry.offset);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    expect(decoder.decode(input.subarray(cursor + 46, cursor + 46 + nameLength))).toBe(entry.name);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  expect(view.getUint32(cursor, true)).toBe(0x06054b50);
  expect(view.getUint16(cursor + 10, true)).toBe(entries.length);
  expect(view.getUint32(cursor + 16, true)).toBe(centralStart);
  expect(cursor + 22 + view.getUint16(cursor + 20, true)).toBe(input.length);
  return entries;
}

describe("USDZ and optional geometry encoding", () => {
  it("packages aligned and CRC-correct scene, texture, transforms and animation", () => {
    const output = exportUSDZ(sampleScene());
    const entries = readStoredZIP(bytes(output.data));
    expect(entries.length).toBe(2);
    expect(entries[0]!.name).toMatch(/\.usda$/);
    const stage = decoder.decode(entries[0]!.data);
    expect(stage).toContain("#usda 1.0");
    expect(stage).toContain("metersPerUnit = 1");
    expect(stage).toContain('upAxis = "Y"');
    expect(stage).toContain("faceVertexCounts = [3]");
    expect(stage).toContain("faceVertexIndices = [0, 1, 2]");
    expect(stage).toContain("timeSamples");
    expect(stage).toContain("UsdPreviewSurface");
    expect(stage).toContain('def Camera "Camera_0"');
    expect(stage).toContain('def SphereLight "Light_0"');
    expect(entries[1]!.data).toEqual(png);
    expect(stage).toContain(`@${entries[1]!.name}@`);
    expect(output.dependencies).toEqual([]);
    expect(stage).toContain('def SkelRoot "Scene"');
    expect(stage).toContain('def Skeleton "Rig_1"');
    expect(stage).toContain("primvars:skel:jointIndices");
    expect(stage).toContain("primvars:skel:jointWeights");
    expect(stage).toContain('def BlendShape "Shape_0"');
    expect(codes(output.warnings)).not.toContain("USDZ_SKIN_UNSUPPORTED");
    // Stage semantics through the independent USDA reader, not text matching.
    const parsed = parseIndependentUSDA(decoder.decode(readIndependentUSDZ(bytes(output.data))[0]!.data));
    const mesh = parsed.allPrims().find((prim) => prim.typeName === "Mesh")!;
    const points = (mesh.properties.get("points")!.value as number[][]);
    const world = points.map((point) => transformPoint(usdWorldMatrix(mesh, 0), point));
    [[6, 5, 6], [2, 5, 6], [4, 8, 6]].forEach((expected, i) => expected.forEach((value, j) => expect(world[i]![j]).toBeCloseTo(value)));
    expect(mesh.properties.get("faceVertexIndices")!.value).toEqual([0, 1, 2]);
    const bound = parsed.prim((mesh.properties.get("material:binding")!.value as { path: string }).path);
    expect(bound.typeName).toBe("Material");
  });

  it("retains selectable USD animation clips and reports interpolation approximations", () => {
    const source = sampleScene();
    const step = { ...source.animations![0]!, name: "step", channels: source.animations![0]!.channels.map((channel) => ({ ...channel, interpolation: "STEP" as const })) };
    const cubic = { name: "cubic", channels: [{ node: 1, path: "translation" as const, interpolation: "CUBICSPLINE" as const,
      times: { values: new Float32Array([0, 1]), itemSize: 1 as const },
      values: { values: new Float32Array([0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 2, 0, 0, 0, 0]), itemSize: 3 as const }
    }] };
    const output = exportUSDZ({ ...source, animations: [source.animations![0]!, step, cubic] });
    const stage = decoder.decode(readStoredZIP(bytes(output.data))[0]!.data);
    expect(stage).toContain('variantSet "Animation"');
    expect(stage).toContain('"Clip_0"');
    expect(stage).toContain('"Clip_1"');
    expect(stage).toContain('"Clip_2"');
    expect(stage).toContain("aura3d:animationSource");
    expect(stage).toContain("CUBICSPLINE");
    expect(stage).toContain("0.0625:");
    expect(codes(output.warnings)).toEqual(expect.arrayContaining(["USDZ_ANIMATION_VARIANTS", "USDZ_STEP_APPROXIMATED", "USDZ_CUBIC_APPROXIMATED", "USDZ_LIGHT_INTENSITY_APPROXIMATED"]));
    const spline = exportUSDZ({ ...source, animations: [step, cubic] }, { animationInterpolation: "native-spline" });
    const splineStage = decoder.decode(readStoredZIP(bytes(spline.data))[0]!.data);
    expect(splineStage).toContain(".spline = {");
    expect(splineStage).toContain("post held");
    expect(splineStage).toContain("hermite,");
    expect(splineStage).toContain("post curve (1)");
    expect(codes(spline.warnings)).toContain("USDZ_SPLINE_COMPATIBILITY");
    expect(codes(spline.warnings)).not.toContain("USDZ_CUBIC_APPROXIMATED");
  });
  it("binds USD preview texture maps and reports nonrepresentable shading", () => {
    const source = sampleScene();
    const material = { ...source.materials![0]!, metallicRoughnessTexture: "tex.png", normalTexture: "tex.png", normalTextureScale: 0.75, occlusionTexture: "tex.png", occlusionStrength: 0.25, emissiveTexture: "tex.png", unlit: true };
    const output = exportUSDZ({ ...source, materials: [material] });
    const entries = readStoredZIP(bytes(output.data));
    const stage = decoder.decode(entries[0]!.data);
    for (const slot of ["BaseColorTexture", "MetallicRoughnessTexture", "NormalTexture", "OcclusionTexture", "EmissiveTexture"]) expect(stage).toContain(`def Shader "${slot}"`);
    expect(entries).toHaveLength(2);
    expect(stage).toContain("inputs:scale = (1.5, -1.5, 2, 1)");
    expect(stage).toContain("inputs:bias = (-0.75, 0.75, -1, 0)");
    expect(codes(output.warnings)).toEqual(expect.arrayContaining(["USDZ_UNLIT_UNSUPPORTED", "USDZ_NORMAL_MAP_SCALE_COMPATIBILITY"]));
    expect(codes(output.warnings)).not.toContain("USDZ_NORMAL_SCALE_UNSUPPORTED");
    const compatible = exportUSDZ({ ...source, uvOrigin: "bottom-left", materials: [{ ...material, normalTextureScale: 1 }] });
    expect(codes(compatible.warnings)).not.toContain("USDZ_NORMAL_MAP_SCALE_COMPATIBILITY");
  });
  it("validates USDZ node and animation quaternions while permitting arbitrary cubic tangents", () => {
    expect(() => exportUSDZ({ nodes: [{ rotation: [0, 0, 0, 2] }], roots: [0] })).toThrow(/quaternion/i);
    expect(() => exportUSDZ({ nodes: [{}], roots: [0], uvOrigin: "diagonal" as AuraExportScene["uvOrigin"] })).toThrow(/uvOrigin/i);
    const rotation = {
      node: 0, path: "rotation" as const, interpolation: "CUBICSPLINE" as const,
      times: { values: [0, 1], itemSize: 1 as const },
      values: { values: [10, 0, 0, 0, 0, 0, 0, 1, 0, 5, 0, 0, 0, 0, 10, 0, 0, 0, 1, 0, 5, 0, 0, 0], itemSize: 4 as const }
    };
    const scene: AuraExportScene = { nodes: [{}], roots: [0], animations: [{ name: "spin", channels: [rotation] }] };
    expect(() => exportUSDZ(scene)).not.toThrow();
    const invalid = { ...rotation, values: { ...rotation.values, values: rotation.values.values.map((value, index) => index === 7 ? 2 : value) } };
    expect(() => exportUSDZ({ ...scene, animations: [{ name: "invalid", channels: [invalid] }] })).toThrow(/quaternion/i);
  });
  it("rejects USD float overflow and reports quantized and rounded geometry", () => {
    const position = { values: [0.1, 0, 0, 1, 0, 0, 0, 1, 0], itemSize: 3 as const };
    const scene: AuraExportScene = { nodes: [{ mesh: 0 }], roots: [0], meshes: [{ primitives: [{ attributes: { POSITION: position }, targets: [
      { POSITION: { values: new Uint16Array(9).fill(1), itemSize: 3 } },
      { POSITION: { values: [1e-50, 0, 0, 0, 0, 0, 0, 0, 0], itemSize: 3 } }
    ] }] }] };
    const result = exportUSDZ(scene);
    expect(codes(result.warnings)).toEqual(expect.arrayContaining(["USDZ_QUANTIZATION_EXPANDED", "USDZ_FLOAT_PRECISION"]));
    const oversized = { ...scene, meshes: [{ primitives: [{ attributes: { POSITION: { ...position, values: [1e100, ...position.values.slice(1)] } } }] }] };
    expect(() => exportUSDZ(oversized)).toThrow(/float32 range/i);
  });
  it("reports unavailable USD skin bindings and unsupported morph semantics", () => {
    const source = sampleScene();
    const primitive = source.meshes![0]!.primitives[0]!;
    const incompatible = { ...source, skins: [{ ...source.skins![0]!, joints: [2, 2] }], meshes: [{ ...source.meshes![0]!, primitives: [{ ...primitive, targets: [{ TANGENT: { values: new Float32Array(9), itemSize: 3 as const } }] }] }] };
    const output = exportUSDZ(incompatible);
    expect(codes(output.warnings)).toEqual(expect.arrayContaining(["USDZ_SKIN_JOINTS_UNSUPPORTED", "USDZ_MORPH_ATTRIBUTE_UNSUPPORTED"]));
    const morphOnly = exportUSDZ({ ...incompatible, skins: source.skins });
    expect(codes(morphOnly.warnings)).toContain("USDZ_MORPH_ATTRIBUTE_UNSUPPORTED");
  });
  it("exports ordered USD joints, remapped influences and animated morph weights", () => {
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const source: AuraExportScene = {
      nodes: [{ children: [1, 2] }, { name: "root", children: [3] }, { mesh: 0, skin: 0, weights: [0.4] }, { name: "child", translation: [1, 0, 0] }],
      roots: [0], metersPerUnit: 1, upAxis: "Y",
      skins: [{ joints: [3, 1], inverseBindMatrices: { itemSize: 16, values: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -1, 0, 0, 1, ...identity] } }],
      meshes: [{ primitives: [{ attributes: {
        POSITION: { itemSize: 3, values: [0, 0, 0, 1, 0, 0, 0, 1, 0] },
        JOINTS_0: { itemSize: 4, values: new Uint16Array([0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0]) },
        WEIGHTS_0: { itemSize: 4, values: [0.25, 0.75, 0, 0, 0.5, 0.5, 0, 0, 0, 1, 0, 0] }
      }, targets: [{ POSITION: { itemSize: 3, values: [0, 0, 1, 0, 0, 1, 0, 0, 1] } }] }] }],
      animations: [{ name: "lift", channels: [
        { node: 1, path: "translation", times: { itemSize: 1, values: [0, 1] }, values: { itemSize: 3, values: [0, 0, 0, 0, 1, 0] } },
        { node: 2, path: "weights", times: { itemSize: 1, values: [0, 1] }, values: { itemSize: 1, values: [0.4, 0.8] } }
      ] }]
    };
    const output = exportUSDZ(source);
    const stage = decoder.decode(readStoredZIP(bytes(output.data))[0]!.data);
    expect(stage).toContain('uniform token[] joints = ["Joint_1", "Joint_1/Joint_3"]');
    expect(stage).toContain("int[] primvars:skel:jointIndices = [1, 0, 1, 1");
    expect(stage).toContain("float[] primvars:skel:jointWeights = [0.25, 0.75, 0, 0");
    expect(stage).toContain("1: [(0, 1, 0), (1, 0, 0)]");
    expect(stage).toContain("float[] blendShapeWeights.timeSamples");
    expect(stage).toContain("1: [0.8]");
    expect(stage).toContain("uniform vector3f[] offsets = [(0, 0, 1), (0, 0, 1), (0, 0, 1)]");
    expect(codes(output.warnings)).not.toContain("USDZ_SKIN_ANIMATION_UNSUPPORTED");
  });

  it("uses an explicitly provided real Draco codec and preserves attribute values", async () => {
    const specifier = "draco3d";
    const imported = await import(specifier);
    const factory = (imported.default ?? imported) as {
      createEncoderModule(): Promise<AuraDracoEncoderModule>;
      createDecoderModule(): Promise<GLTFDracoDecoderModule>;
    };
    const [encoderModule, decoderModule] = await Promise.all([factory.createEncoderModule(), factory.createDecoderModule()]);
    const primitive = sampleScene().meshes![0]!.primitives[0]!;
    const output = await exportDRACO(primitive, { encoder: createDracoEncoder(encoderModule) });
    const decoded = await createDracoDecoder(decoderModule)(bytes(output.data), {
      meshIndex: 0, primitiveIndex: 0, bufferViewIndex: 0, attributes: output.attributeIds
    });
    expect(decoded.indices?.length).toBe(3);
    expect(decoded.attributes.POSITION?.map((point) => point.join(",")).sort()).toEqual(["-1,0,0", "0,1,0", "1,0,0"]);
    expect(decoded.attributes.JOINTS_0?.length).toBe(3);
    expect(output.dependencies.some((dependency) => dependency.name.endsWith(".json"))).toBe(true);
    expect(codes(output.warnings)).toEqual(expect.arrayContaining(["DRACO_MATERIAL_OMITTED", "DRACO_MORPH_TARGETS_OMITTED"]));
    const annotated = { ...primitive, futureExtension: true, attributes: { ...primitive.attributes, POSITION: { ...primitive.attributes.POSITION!, unknownEncoding: true } } };
    const annotatedOutput = await exportDRACO(annotated, { encoder: createDracoEncoder(encoderModule) });
    expect(annotatedOutput.warnings.some((warning) => warning.code === "UNSUPPORTED_PROPERTY" && warning.path === "primitive.futureExtension")).toBe(true);
    expect(annotatedOutput.warnings.some((warning) => warning.code === "UNSUPPORTED_PROPERTY" && warning.path === "attributes.POSITION.unknownEncoding")).toBe(true);
    await expect(exportDRACO(primitive)).rejects.toMatchObject({ code: "DRACO_ENCODER_UNAVAILABLE" });
    await expect(exportDRACO({ ...primitive, mode: "lines" }, { encoder: createDracoEncoder(encoderModule) })).rejects.toMatchObject({ code: "DRACO_UNSUPPORTED_TOPOLOGY" });
    const injected = (lossless?: unknown, warnings?: unknown) => ({ encode: () => ({
      data: bytes(output.data), attributeIds: output.attributeIds, ...(lossless === undefined ? {} : { lossless }), ...(warnings === undefined ? {} : { warnings })
    }) }) as unknown as AuraDracoEncoder;
    expect(codes((await exportDRACO(primitive, { encoder: injected() })).warnings)).toContain("DRACO_CODEC_LOSS_UNSPECIFIED");
    expect(codes((await exportDRACO(primitive, { encoder: injected(false) })).warnings)).toContain("DRACO_LOSSY_ENCODING");
    expect(codes((await exportDRACO(primitive, { encoder: injected(true) })).warnings)).not.toEqual(expect.arrayContaining(["DRACO_CODEC_LOSS_UNSPECIFIED", "DRACO_LOSSY_ENCODING"]));
    await expect(exportDRACO(primitive, { encoder: injected("true") })).rejects.toMatchObject({ code: "DRACO_INVALID_ENCODER_OUTPUT" });
    await expect(exportDRACO(primitive, { encoder: injected(true, [{ code: 42 }]) })).rejects.toMatchObject({ code: "DRACO_INVALID_ENCODER_OUTPUT" });
  });
});

interface EXRHeader { compression: number; width: number; height: number; tableOffset: number }
function readEXRHeader(data: Uint8Array): EXRHeader {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  expect(view.getUint32(0, true)).toBe(20000630);
  expect(view.getUint32(4, true)).toBe(2);
  let cursor = 8;
  const readString = (): string => {
    const start = cursor;
    while (data[cursor] !== 0) { if (++cursor >= data.length) throw new Error("Truncated EXR string"); }
    return decoder.decode(data.subarray(start, cursor++));
  };
  const attrs: Record<string, Uint8Array> = {};
  while (data[cursor] !== 0) {
    const name = readString(); readString();
    const size = view.getUint32(cursor, true); cursor += 4;
    attrs[name] = data.subarray(cursor, cursor + size); cursor += size;
  }
  cursor++;
  const window = new DataView(attrs.dataWindow!.buffer, attrs.dataWindow!.byteOffset, attrs.dataWindow!.byteLength);
  return { compression: attrs.compression![0]!, width: window.getInt32(8, true) - window.getInt32(0, true) + 1, height: window.getInt32(12, true) - window.getInt32(4, true) + 1, tableOffset: cursor };
}
function readEXRChannelNames(data: Uint8Array): string[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let cursor = 8;
  const readString = (): string => {
    const start = cursor;
    while (data[cursor] !== 0) { if (++cursor >= data.length) throw new Error("Truncated EXR string"); }
    return decoder.decode(data.subarray(start, cursor++));
  };
  while (data[cursor] !== 0) {
    const name = readString(); readString();
    const length = view.getUint32(cursor, true); cursor += 4;
    const end = cursor + length;
    if (name === "channels") {
      const names: string[] = [];
      while (cursor < end && data[cursor] !== 0) { names.push(readString()); cursor += 16; }
      if (cursor !== end - 1) throw new Error("Invalid EXR channel list");
      return names;
    }
    cursor = end;
  }
  throw new Error("Missing EXR channels");
}
// Read one single-float-channel scanline. EXR PackBits uses signed run lengths,
// followed by inverse delta prediction and even/odd byte deinterleaving.
function readEXRFloatScanline(data: Uint8Array, header: EXRHeader, row: number): { samples: number[]; compressed: boolean } {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const blockIndex = header.compression === 4 ? Math.floor(row / 32) : row;
  const block = Number(view.getBigUint64(header.tableOffset + blockIndex * 8, true));
  const y = view.getInt32(block, true);
  const length = view.getUint32(block + 4, true);
  const packed = data.subarray(block + 8, block + 8 + length);
  const rawLength = header.width * 4 * (header.compression === 4 ? Math.min(32, header.height - y) : 1);
  let raw: Uint8Array;
  if (length === rawLength || header.compression === 0) raw = packed;
  else if (header.compression === 1) {
    const predicted: number[] = [];
    for (let p = 0; p < packed.length;) {
      const control = (packed[p++]! << 24) >> 24;
      if (control < 0) { for (let i = 0; i < -control; i++) predicted.push(packed[p++]!); }
      else { const value = packed[p++]!; for (let i = 0; i <= control; i++) predicted.push(value); }
    }
    expect(predicted.length).toBe(rawLength);
    for (let i = 1; i < predicted.length; i++) predicted[i] = (predicted[i - 1]! + predicted[i]! - 128) & 255;
    raw = new Uint8Array(rawLength);
    const half = Math.ceil(rawLength / 2);
    for (let i = 0; i < rawLength; i++) raw[i] = predicted[(i & 1) ? half + Math.floor(i / 2) : i / 2]!;
  } else if (header.compression === 4) {
    // Decode the zero-only PIZ subset independently: an empty value bitmap and
    // a two-symbol canonical Huffman stream with a previous-value run marker.
    const piz = new DataView(packed.buffer, packed.byteOffset, packed.byteLength);
    expect(piz.getUint16(0, true)).toBe(8191);
    expect(piz.getUint16(2, true)).toBe(0);
    expect(piz.getUint32(4, true) + 8).toBe(packed.length);
    expect([piz.getUint32(8, true), piz.getUint32(12, true), piz.getUint32(16, true)]).toEqual([0, 1, 2]);
    expect([packed[28], packed[29]]).toEqual([4, 16]);
    const count = piz.getUint32(20, true);
    let offset = 0, words = 0;
    const bit = (): number => { if (offset >= count) throw new Error("Truncated PIZ Huffman stream"); const value = (packed[30 + Math.floor(offset / 8)]! >> (7 - offset % 8)) & 1; offset++; return value; };
    while (offset < count) {
      if (bit() === 0) words++;
      else { if (!words) throw new Error("PIZ run has no previous symbol"); let repetitions = 0; for (let j = 0; j < 8; j++) repetitions = (repetitions << 1) | bit(); words += repetitions; }
      if (words > rawLength / 2) throw new Error("PIZ run exceeds output");
    }
    expect(words).toBe(rawLength / 2);
    raw = new Uint8Array(rawLength);
  } else throw new Error("Unsupported EXR compression");
  const rowOffset = (row - y) * header.width * 4;
  const rawView = new DataView(raw.buffer, raw.byteOffset + rowOffset, header.width * 4);
  return { samples: Array.from({ length: header.width }, (_, i) => rawView.getFloat32(i * 4, true)), compressed: length < rawLength };
}

describe("HDR and texture export", () => {
  const source = {
    attachments: [
      { name: "preview", width: 128, height: 2, layers: [{ name: "", channels: [{ name: "R", type: "float" as const, data: new Float32Array(256).fill(1) }] }] },
      { name: "color", width: 128, height: 2, layers: [
        { name: "unused", channels: [{ name: "R", type: "float" as const, data: new Float32Array(256).fill(0.5) }] },
        { name: "beauty", channels: [{ name: "R", type: "float" as const, data: Float32Array.from({ length: 256 }, (_, index) => index % 128 === 0 ? 12345.5 : 0) }] }
      ] }
    ]
  };
  it("orders EXR channel names by UTF-8 bytes and rejects malformed Unicode", () => {
    const channels = ["\u{10000}", "\uE000"].map((name) => ({ name, type: "float" as const, data: new Float32Array([1]) }));
    const image = { attachments: [{ name: "color", width: 1, height: 1, layers: [{ name: "", channels }] }] };
    const codec = { supported: true, encodeBlock: () => { throw new Error("must not invoke an ignored PIZ encoder"); } };
    const output = exportEXR(image, { attachment: "color", layer: "", compression: "rle", pizEncoder: codec });
    expect(readEXRChannelNames(bytes(output.data))).toEqual(["\uE000", "\u{10000}"]);
    expect(codes(output.warnings)).toContain("EXR_PIZ_ENCODER_IGNORED");
    const invalid = { attachments: [{ ...image.attachments[0]!, layers: [{ name: "", channels: [{ ...channels[0]!, name: "\uD800" }] }] }] };
    expect(() => exportEXR(invalid, { attachment: "color", layer: "" })).toThrow(/name/i);
  });
  it("selects an attachment/layer and independently decodes native HDR RLE without clamping", () => {
    const output = exportEXR(source, { attachment: "color", layer: "beauty", compression: "rle" });
    const data = bytes(output.data);
    const header = readEXRHeader(data);
    expect(header).toMatchObject({ compression: 1, width: 128, height: 2 });
    for (let row = 0; row < 2; row++) {
      const decoded = readEXRFloatScanline(data, header, row);
      expect(decoded.compressed).toBe(true);
      expect(decoded.samples).toEqual([12345.5, ...new Array(127).fill(0)]);
    }
    expect(codes(output.warnings)).toEqual(expect.arrayContaining(["EXR_ATTACHMENT_OMITTED", "EXR_LAYER_OMITTED"]));
    const annotatedSource = { ...source, futureImageData: true };
    const annotated = exportEXR(annotatedSource, { attachment: "color", layer: "beauty", compression: "rle" });
    expect(annotated.warnings.some((warning) => warning.code === "EXR_UNSUPPORTED_PROPERTY" && warning.path === "source.futureImageData")).toBe(true);
    const manyFields = Object.fromEntries(Array.from({ length: 300 }, (_, index) => [`unsupported${index}`, index]));
    const hostile = Object.defineProperty({ ...source, ...manyFields }, "unusedGetter", { enumerable: true, get: () => { throw new Error("unexpected getter evaluation"); } });
    const bounded = exportEXR(hostile, { attachment: "color", layer: "beauty", compression: "rle" });
    expect(bounded.warnings.length).toBeLessThanOrEqual(128);
    expect(codes(bounded.warnings)).toContain("EXR_DIAGNOSTICS_TRUNCATED");
    expect(() => exportEXR(source, { attachment: "color", layer: "missing" })).toThrow(/Layer/);
    expect(() => exportEXR(source, { attachment: "color", layer: "beauty", maxBytes: 10 })).toThrow(/memory|allocation/i);
  });
  it("stores small PIZ blocks losslessly and emits independently decodable compressed zero blocks", () => {
    const small = { attachments: [{ name: "color", width: 3, height: 1, layers: [{ name: "", channels: [{ name: "R", type: "float" as const, data: new Float32Array([12345.5, 0.5, -1.5]) }] }] }] };
    const output = exportEXR(small, { attachment: "color", layer: "", compression: "piz" });
    const data = bytes(output.data);
    const header = readEXRHeader(data);
    expect(header.compression).toBe(4);
    expect(readEXRFloatScanline(data, header, 0).samples).toEqual([12345.5, 0.5, -1.5]);
    expect(codes(output.warnings)).toContain("EXR_PIZ_BLOCKS_STORED");
    const zeroSource = { attachments: [{ name: "color", width: 128, height: 32, layers: [{ name: "", channels: [{ name: "R", type: "float" as const, data: new Float32Array(4096) }] }] }] };
    const zero = bytes(exportEXR(zeroSource, { attachment: "color", layer: "", compression: "piz" }).data);
    const zeroHeader = readEXRHeader(zero);
    const zeroView = new DataView(zero.buffer, zero.byteOffset, zero.byteLength);
    const block = Number(zeroView.getBigUint64(zeroHeader.tableOffset, true));
    expect(zeroHeader.compression).toBe(4);
    expect(zeroView.getInt32(block, true)).toBe(0);
    expect(zeroView.getUint32(block + 4, true)).toBeLessThan(128 * 32 * 4);
    expect(readEXRFloatScanline(zero, zeroHeader, 31)).toEqual({ samples: new Array(128).fill(0), compressed: true });
  });
  it("round-trips nonzero HDR PIZ blocks through a separate decoder", async () => {
    const red = Float32Array.from({ length: 128 * 33 }, (_, index) => Math.floor((index % 128) / 3) * 0.25 + 1000.5);
    const texture = { attachments: [{ name: "color", width: 128, height: 33, layers: [{ name: "", channels: [{ name: "R", type: "float" as const, data: red }] }] }] };
    const result = exportEXR(texture, { attachment: "color", layer: "", compression: "piz" });
    const data = bytes(result.data);
    const header = readEXRHeader(data);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const firstBlock = Number(view.getBigUint64(header.tableOffset, true));
    expect(view.getUint32(firstBlock + 4, true)).toBeLessThan(128 * 32 * 4);
    const decoded = await parseEXR(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer, { type: "float", outputFormat: "r" });
    expect([decoded.width, decoded.height]).toEqual([128, 33]);
    expect(Array.from(decoded.data)).toEqual(Array.from(red));
  });
  it("round-trips a wide PIZ alphabet with mixed float and half channels", async () => {
    const width = 1024, height = 32, count = width * height;
    const red = Float32Array.from({ length: count }, (_, index) => Math.floor((index % width) / 4) * 0.25 + 1000.5);
    const green = Uint16Array.from({ length: count }, (_, index) => index % 2048);
    const blue = Uint16Array.from({ length: count }, (_, index) => index);
    const result = exportEXR({ attachments: [{ name: "color", width, height, layers: [{ name: "", channels: [
      { name: "R", type: "float", data: red }, { name: "G", type: "half", data: green }, { name: "B", type: "half", data: blue }
    ] }] }] }, { attachment: "color", layer: "", compression: "piz" });
    const data = bytes(result.data), header = readEXRHeader(data);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const block = Number(view.getBigUint64(header.tableOffset, true));
    expect(view.getUint32(block + 4, true)).toBeLessThan(count * 8);
    const decoded = await parseEXR(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer, { type: "half" });
    expect([decoded.width, decoded.height]).toEqual([width, height]);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) expect(decoded.data[((height - 1 - y) * width + x) * 4 + 2]).toBe(blue[y * width + x]);
  });
  it("writes typed KTX2 levels and metadata and rejects missing encoders", async () => {
    const base = Uint8Array.from({ length: 64 }, (_, index) => index);
    const mip = Uint8Array.from({ length: 16 }, (_, index) => 255 - index);
    const texture = { width: 4, height: 4, format: "rgba8unorm" as const, levels: [{ data: base }, { data: mip }], orientation: "rd" as const, metadata: { author: "Aura3D" } };
    const output = await exportKTX2(texture);
    const parsed = readKTX2(bytes(output.data));
    expect(parsed.vkFormat).toBe(37);
    expect([parsed.pixelWidth, parsed.pixelHeight, parsed.levels.length]).toEqual([4, 4, 2]);
    expect(parsed.levels[0]!.levelData).toEqual(base);
    expect(parsed.levels[1]!.levelData).toEqual(mip);
    expect(parsed.keyValue.KTXorientation).toBe("rd");
    const futureLevel = { data: base, futureMipData: true };
    const annotatedTexture = { ...texture, futureTextureData: true, levels: [futureLevel, { data: mip }] };
    const annotated = await exportKTX2(annotatedTexture);
    expect(annotated.warnings.some((warning) => warning.code === "UNSUPPORTED_PROPERTY" && warning.path === "texture.futureTextureData")).toBe(true);
    expect(annotated.warnings.some((warning) => warning.code === "UNSUPPORTED_PROPERTY" && warning.path === "levels[0].futureMipData")).toBe(true);
    await expect(exportKTX2(texture, { encoding: "basis-uastc" })).rejects.toMatchObject({ code: "KTX2_ENCODER_UNAVAILABLE" });
    await expect(exportKTX2({ ...texture, levels: [{ data: new Uint8Array(3) }] })).rejects.toMatchObject({ code: "KTX2_LEVEL_SIZE" });
  });
  it("rejects malformed and overlapping KTX2 codec results before returning bytes", async () => {
    const texture = { width: 1, height: 1, format: "r8unorm" as const, levels: [{ data: new Uint8Array([123]) }] };
    const raw = bytes((await exportKTX2(texture)).data);
    const codec = (data: Uint8Array, result: Record<string, unknown> = {}) => ({
      name: "test codec", supports: () => true, encode: () => ({ data, ...result })
    });
    const overlap = raw.slice();
    const overlapView = new DataView(overlap.buffer, overlap.byteOffset, overlap.byteLength);
    overlapView.setUint32(44, 2, true);
    overlapView.setBigUint64(80, BigInt(overlapView.getUint32(48, true)), true);
    await expect(exportKTX2(texture, { encoding: "zstd", encoder: codec(overlap, { lossless: true }) })).rejects.toMatchObject({ code: "KTX2_ENCODER_RESULT" });
    const malformed = raw.slice();
    const malformedView = new DataView(malformed.buffer, malformed.byteOffset, malformed.byteLength);
    malformedView.setUint32(44, 2, true);
    malformedView.setUint32(malformedView.getUint32(48, true), 1, true);
    await expect(exportKTX2(texture, { encoding: "zstd", encoder: codec(malformed) })).rejects.toMatchObject({ code: "KTX2_ENCODER_RESULT" });
    await expect(exportKTX2(texture, { encoding: "zstd", encoder: codec(raw, { lossless: "true" }) as never })).rejects.toMatchObject({ code: "KTX2_ENCODER_RESULT" });
    await expect(exportKTX2(texture, { encoding: "zstd", encoder: codec(raw, { warnings: [{ code: 42 }] }) as never })).rejects.toMatchObject({ code: "KTX2_ENCODER_RESULT" });
  });
  it("round-trips an explicitly supplied zlib KTX2 encoder through an independent parser", async () => {
    const pixels = new Uint8Array(4 * 4 * 4).fill(128);
    const texture = { width: 4, height: 4, format: "rgba8unorm" as const, levels: [{ data: pixels }], orientation: "rd" as const };
    const raw = bytes((await exportKTX2(texture)).data);
    const encoder = {
      name: "node zlib", supports: () => true,
      encode: () => {
        const result = raw.slice();
        const view = new DataView(result.buffer, result.byteOffset, result.byteLength);
        const offset = Number(view.getBigUint64(80, true));
        const compressed = deflateSync(pixels);
        view.setUint32(44, 3, true);
        view.setBigUint64(88, BigInt(compressed.length), true);
        view.setBigUint64(96, BigInt(pixels.length), true);
        result.set(compressed, offset);
        return { data: result.slice(0, offset + compressed.length), lossless: true };
      }
    };
    const result = await exportKTX2(texture, { encoding: "zlib", encoder });
    const parsed = readKTX2(bytes(result.data));
    expect(parsed.supercompressionScheme).toBe(3);
    expect(inflateSync(parsed.levels[0]!.levelData)).toEqual(Buffer.from(pixels));
    expect(codes(result.warnings)).not.toContain("KTX2_CODEC_LOSS_UNSPECIFIED");
  });
});

describe("common validation and cancellation", () => {
  it("reports unsupported runtime properties rather than discarding them", () => {
    const source = sampleScene();
    const annotated = {
      ...source, customScene: true,
      nodes: source.nodes.map((node, index) => index ? node : { ...node, customNode: true }),
      meshes: source.meshes!.map((mesh) => ({ ...mesh, customMesh: true, primitives: mesh.primitives.map((primitive, index) => index ? primitive : { ...primitive, customPrimitive: true }) })),
      materials: source.materials!.map((material) => ({ ...material, customMaterial: true }))
    };
    const expected = ["scene.customScene", "nodes[0].customNode", "meshes[0].customMesh", "meshes[0].primitives[0].customPrimitive", "materials[0].customMaterial"];
    for (const run of [exportGLTF, exportOBJ, exportPLY, exportSTL, exportUSDZ]) {
      const warnings = run(annotated).warnings;
      for (const path of expected) expect(warnings.some((warning) => warning.code === "UNSUPPORTED_PROPERTY" && warning.path === path)).toBe(true);
    }
    const fields = Object.fromEntries(Array.from({ length: 300 }, (_, index) => [`future${index}`, index]));
    const hostile = Object.defineProperty({ ...source, ...fields }, "unusedGetter", { enumerable: true, get: () => { throw new Error("unexpected getter evaluation"); } });
    const bounded = exportGLTF(hostile);
    expect(bounded.warnings.length).toBeLessThanOrEqual(257);
    expect(codes(bounded.warnings)).toContain("DIAGNOSTICS_TRUNCATED");
  });
  it("rejects cyclic graphs, out-of-range indices, non-affine matrices and invalid quaternions", () => {
    const source = sampleScene();
    expect(() => validateScene({ ...source, roots: [0], nodes: [{ children: [1] }, { children: [0] }] })).toThrow();
    expect(() => validateScene({ nodes: [{ mesh: 0 }], roots: [0], meshes: [{ primitives: [{ attributes: { POSITION: { values: [0, 0, 0], itemSize: 3 } }, indices: [0, 1, 2] }] }] })).toThrow();
    expect(() => validateScene({ nodes: [{ matrix: [1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }], roots: [0] })).toThrow(/affine/);
    expect(() => validateScene({ nodes: [{ rotation: [0, 0, 0, 0] }], roots: [0] })).toThrow(/quaternion/);
    expect(transformNormal([1e-6, 0, 0, 0, 0, 1e-6, 0, 0, 0, 0, 1e-6, 0, 0, 0, 0, 1], [1, 0, 0])).toEqual([1, 0, 0]);
    expect(transformNormal([1e300, 0, 0, 0, 0, 1e-300, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], [1, 1, 0])).toEqual([0, 1, 0]);
    expect(() => transformNormal([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], [1, 0, 0])).toThrow(/singular/);
  });
  it("rejects already cancelled work before writing any result", async () => {
    const controller = new AbortController(); controller.abort();
    const scene = sampleScene();
    for (const run of [
      () => exportGLTF(scene, { signal: controller.signal }),
      () => exportOBJ(scene, { signal: controller.signal }),
      () => exportPLY(scene, { signal: controller.signal }),
      () => exportSTL(scene, { signal: controller.signal }),
      () => exportUSDZ(scene, { signal: controller.signal }),
      () => exportEXR({ attachments: [] }, { attachment: "", layer: "", signal: controller.signal })
    ]) expect(run).toThrow(/cancel|abort/i);
    await expect(exportDRACO(scene.meshes![0]!.primitives[0]!, { signal: controller.signal })).rejects.toThrow(/cancel|abort/i);
    await expect(exportKTX2({ width: 1, height: 1, format: "r8unorm", levels: [{ data: new Uint8Array(1) }] }, { signal: controller.signal })).rejects.toThrow(/cancel|abort/i);
  });
});

describe("public entrypoint and CLI", () => {
  it("registers assets export and exposes the typed package entrypoint", async () => {
    expect(exporterEntry.exportGLTF).toBe(exportGLTF);
    expect(exporterEntry.sceneFromGLTFAsset).toBe(sceneFromGLTFAsset);
    const command = cliCommandFor("assets export");
    expect(command?.usage).toContain("--format");
    expect(command?.owner).toBe("assets-tooling");
    const root = mkdtempSync(join(tmpdir(), "aura-export-test-"));
    const output: string[] = [], errors: string[] = [];
    const io = { cwd: root, stdout: (line: string) => output.push(line), stderr: (line: string) => errors.push(line) };
    try {
      const source = {
        nodes: [{ mesh: 0 }], roots: [0], metersPerUnit: 1, upAxis: "Y", uvOrigin: "top-left",
        meshes: [{ primitives: [{ attributes: { POSITION: { values: [0, 0, 0, 1, 0, 0, 0, 1, 0], itemSize: 3 } } }] }]
      };
      writeFileSync(join(root, "source.json"), JSON.stringify(source));
      const args = ["--input", "source.json", "--out", "mesh.obj", "--format", "obj", "--json"];
      expect(await command!.run(args, io)).toBe(0);
      const report = JSON.parse(output[0]!);
      expect(report.mimeType).toBe("model/obj");
      expect(report.dependencies.map((dependency: { name: string }) => dependency.name)).toContain("materials.mtl");
      expect(readFileSync(join(root, "mesh.obj"), "utf8")).toMatch(/^f 1 2 3$/m);
      expect(await command!.run(args, io)).toBe(1);
      expect(readFileSync(join(root, "mesh.obj"), "utf8")).toMatch(/^f 1 2 3$/m);
      expect(await command!.run(["--input", "source.json", "--out", "../escape.obj", "--format", "obj", "--json"], io)).toBe(1);
      // An existing dependency must roll back the newly created primary file.
      expect(await command!.run(["--input", "source.json", "--out", "second.obj", "--format", "obj", "--json"], io)).toBe(1);
      expect(existsSync(join(root, "second.obj"))).toBe(false);
      symlinkSync(join(root, "source.json"), join(root, "link.obj"));
      expect(await command!.run(["--input", "source.json", "--out", "link.obj", "--format", "obj", "--json"], io)).toBe(1);
      writeFileSync(join(root, "texture.json"), JSON.stringify({ width: 1, height: 1, format: "r8unorm", levels: [{ data: [128] }] }));
      expect(await command!.run(["--input", "texture.json", "--out", "texture.ktx2", "--format", "ktx2", "--encoding", "none", "--json"], io)).toBe(0);
      expect(readFileSync(join(root, "texture.ktx2")).subarray(0, 4)).toEqual(Buffer.from([0xab, 0x4b, 0x54, 0x58]));
      expect(await command!.run(["--input", "texture.json", "--out", "invalid.ktx2", "--format", "ktx2", "--encoding", "invalid", "--json"], io)).toBe(2);
      expect(JSON.parse(errors[errors.length - 1]!).code).toBe("INVALID_ARGUMENTS");
      expect(await command!.run(["--input", "texture.json", "--out", "compressed.ktx2", "--format", "ktx2", "--encoding", "basis-uastc", "--json"], io)).toBe(1);
      expect(JSON.parse(errors[errors.length - 1]!).code).toBe("KTX2_ENCODER_UNAVAILABLE");
      writeFileSync(join(root, "image.json"), JSON.stringify({ attachments: [{ name: "color", width: 1, height: 1, layers: [{ name: "beauty", channels: [{ name: "R", type: "float", data: [12345.5] }] }] }] }));
      expect(await command!.run(["--input", "image.json", "--out", "image.exr", "--format", "exr", "--attachment", "color", "--layer", "beauty", "--compression", "rle", "--json"], io)).toBe(0);
      expect(readFileSync(join(root, "image.exr")).readUInt32LE(0)).toBe(20000630);
      writeFileSync(join(root, "invalid-utf8.json"), Uint8Array.of(0x7b, 0x80, 0x7d));
      expect(await command!.run(["--input", "invalid-utf8.json", "--out", "bad.obj", "--format", "obj", "--json"], io)).toBe(1);
      expect(JSON.parse(errors[errors.length - 1]!).error).toMatch(/UTF-8/);
      expect(existsSync(join(root, "bad.obj"))).toBe(false);
      expect(errors.length).toBeGreaterThanOrEqual(4);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
