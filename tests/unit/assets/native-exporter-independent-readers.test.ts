import { describe, expect, it } from "vitest";
import { exportGLTF } from "../../../packages/assets/src/exporters/GLTFExporter";
import { exportOBJ } from "../../../packages/assets/src/exporters/OBJExporter";
import { exportPLY } from "../../../packages/assets/src/exporters/PLYExporter";
import { exportSTL } from "../../../packages/assets/src/exporters/STLExporter";
import { exportUSDZ } from "../../../packages/assets/src/exporters/USDZExporter";
import { exportDRACO } from "../../../packages/assets/src/exporters/DRACOExporter";
import { sceneFromGLTFAsset, validateScene, type AuraExportScene } from "../../../packages/assets/src/exporters/ExportContext";
import { GLTFLoader } from "../../../packages/assets/src/GLTFLoader";
import { LoadContext } from "../../../packages/assets/src/LoadContext";
import {
  parseIndependentUSDA, readIndependentGLTF, readIndependentPLY, readIndependentUSDZ, transformPoint, usdWorldMatrix,
  type USDPrim, type USDValue
} from "../../support/independent-interchange-readers";

/*
 * Every assertion below reads exporter output through readers authored in
 * tests/support from the format specifications. Aura3D's own loaders appear
 * only to produce the *input* runtime snapshot, never to verify output.
 */

const decoder = new TextDecoder();
const bytes = (value: Blob | Uint8Array): Uint8Array => {
  if (!(value instanceof Uint8Array)) throw new Error("Expected a byte result");
  return value;
};
const glbUrl = (data: Blob | Uint8Array): string => `data:model/gltf-binary;base64,${Buffer.from(bytes(data)).toString("base64")}`;
const codes = (warnings: readonly { code: string }[]): string[] => warnings.map((warning) => warning.code);
// Independently generated 1x1 red RGBA PNG (CC0-1.0, authored for Aura3D tests).
const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==", "base64"));

function closeRows(actual: readonly (readonly number[])[], expected: readonly (readonly number[])[], digits = 5): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((row, i) => { expect(row).toHaveLength(expected[i]!.length); row.forEach((value, j) => expect(value).toBeCloseTo(expected[i]![j]!, digits)); });
}

// Independently authored geometry with a reflected, non-uniform parent transform,
// a textured material, a skin, a morph target, an indexed line primitive,
// a camera, a light and a translation animation.
function richScene(): AuraExportScene {
  return {
    metersPerUnit: 1, upAxis: "Y", uvOrigin: "top-left",
    metadata: { author: "Aura3D test", license: "CC0" },
    nodes: [
      { name: "Parent", translation: [4, 5, 6], scale: [-2, 3, 1], children: [1, 2, 3, 4] },
      { name: "Part", mesh: 0, skin: 0 },
      { name: "Joint", rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2] },
      { name: "Camera", camera: 0 },
      { name: "Light", light: 0 }
    ],
    roots: [0],
    meshes: [{ name: "triangle-and-edge", weights: [0.25], primitives: [
      {
        attributes: {
          POSITION: { values: new Float32Array([-1, 0, 0, 1, 0, 0, 0, 1, 0]), itemSize: 3 },
          NORMAL: { values: new Int8Array([0, 0, 127, 0, 0, 127, 0, 0, 127]), itemSize: 3, normalized: true },
          TEXCOORD_0: { values: new Uint8Array([0, 0, 255, 0, 127, 255]), itemSize: 2, normalized: true },
          JOINTS_0: { values: new Uint8Array(12), itemSize: 4 },
          WEIGHTS_0: { values: new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0]), itemSize: 4, normalized: true }
        },
        indices: new Uint16Array([0, 1, 2]), material: 0,
        targets: [{ POSITION: { values: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), itemSize: 3 } }]
      },
      { attributes: { POSITION: { values: new Float32Array([0, 0, 0, 1, 1, 0]), itemSize: 3 }, JOINTS_0: { values: new Uint8Array(8), itemSize: 4 }, WEIGHTS_0: { values: new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0]), itemSize: 4, normalized: true } }, indices: new Uint16Array([1, 0]), mode: "lines", targets: [{ POSITION: { values: new Float32Array(6), itemSize: 3 } }] }
    ] }],
    materials: [{ name: "cloth", baseColor: [0.5, 0.25, 0.75, 1], metallic: 0.3, roughness: 0.6, baseColorTexture: "tex.png", doubleSided: true }],
    dependencies: [{ name: "tex.png", mimeType: "image/png", data: png }],
    cameras: [{ name: "camera", type: "perspective", perspective: { yfov: 1, znear: 0.1, zfar: 100 } }],
    lights: [{ name: "lamp", type: "point", color: [1, 0.5, 0.25], intensity: 8 }],
    skins: [{ name: "skin", joints: [2], inverseBindMatrices: { values: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), itemSize: 16 } }],
    animations: [{ name: "move", channels: [
      { node: 1, path: "translation", times: { values: new Float32Array([0, 1]), itemSize: 1 }, values: { values: new Float32Array([0, 0, 0, 0, 1, 0]), itemSize: 3 }, interpolation: "LINEAR" },
      { node: 1, path: "weights", times: { values: new Float32Array([0, 1]), itemSize: 1 }, values: { values: new Float32Array([0.25, 1]), itemSize: 1 }, interpolation: "STEP" }
    ] }]
  };
}

// A hand-authored glTF source with document provenance and two material
// variants mapped onto one primitive (KHR_materials_variants).
function variantSourceUrl(): string {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const base64 = Buffer.from(positions.buffer).toString("base64");
  const source = {
    asset: { version: "2.0", generator: "Independent fixture writer 1.0", copyright: "CC0-1.0 Aura3D test fixture", extras: { fixture: "variants", revision: 3 } },
    extensionsUsed: ["KHR_materials_variants"],
    extensions: { KHR_materials_variants: { variants: [{ name: "summer" }, { name: "winter" }, { name: "unused" }] } },
    buffers: [{ uri: `data:application/octet-stream;base64,${base64}`, byteLength: 36 }],
    bufferViews: [{ buffer: 0, byteLength: 36 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }],
    materials: [
      { name: "default", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] } },
      { name: "warm", pbrMetallicRoughness: { baseColorFactor: [1, 0.5, 0, 1] } },
      { name: "cold", pbrMetallicRoughness: { baseColorFactor: [0, 0.5, 1, 1] } }
    ],
    meshes: [{ name: "Panel", primitives: [{ attributes: { POSITION: 0 }, material: 0, extensions: { KHR_materials_variants: { mappings: [
      { material: 1, variants: [0] }, { material: 2, variants: [1] }
    ] } } }] }],
    nodes: [{ name: "Panel", mesh: 0 }],
    scenes: [{ nodes: [0] }], scene: 0
  };
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(source))}`;
}

describe("independent glTF reader round trips (WP-28)", () => {
  it("reads an edited, loaded runtime scene export without Aura's loader", async () => {
    const source: AuraExportScene = {
      nodes: [{ name: "Parent", translation: [0, 2, 0], children: [1] }, { name: "Part", mesh: 0 }], roots: [0], metersPerUnit: 1, upAxis: "Y",
      meshes: [{ name: "triangle", primitives: [{ attributes: { POSITION: { itemSize: 3, values: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]) } }, material: 0 }] }],
      materials: [{ name: "green", baseColor: [0.1, 0.8, 0.2, 1], roughness: 0.4 }]
    };
    const loader = new GLTFLoader();
    const input = await loader.load({ url: glbUrl(exportGLTF(source, { binary: true }).data) }, new LoadContext());
    const live = input.createScene();
    try {
      live.findByName("Part")[0]!.transform.setPosition(0.35, 0, 0);
      const result = exportGLTF(sceneFromGLTFAsset(input, live), { binary: true });
      const doc = readIndependentGLTF(bytes(result.data));
      const part = doc.findNode("Part");
      expect(doc.nodes[part.parent!]!.name).toBe("Parent");
      closeRows([part.world.slice(12, 15)], [[0.35, 2, 0]]);
      const primitive = doc.meshes[part.mesh!]!.primitives[0]!;
      expect(primitive.mode).toBe(4);
      closeRows(primitive.attributes.POSITION!.values, [[0, 0, 0], [1, 0, 0], [0, 1, 0]]);
      // World-space vertices combine the edited local translation and the parent.
      closeRows(primitive.attributes.POSITION!.values.map((p) => transformPoint(part.world, p)), [[0.35, 2, 0], [1.35, 2, 0], [0.35, 3, 0]]);
      const material = doc.materials[primitive.material!]!;
      expect(material.name).toBe("green");
      closeRows([material.pbrMetallicRoughness.baseColorFactor], [[0.1, 0.8, 0.2, 1]]);
      expect(material.pbrMetallicRoughness.roughnessFactor).toBeCloseTo(0.4);
      expect(doc.asset.generator).toBe("Aura3D");
      expect(codes(result.warnings)).toContain("SOURCE_ATTRIBUTE_ENCODING_LOST");
    } finally { live.dispose(); loader.dispose(input); }
  });

  it("independently decodes typed accessors, hierarchy, skins, morphs, lines, animation, camera, light and images", () => {
    const result = exportGLTF(richScene(), { binary: true });
    const doc = readIndependentGLTF(bytes(result.data));
    const parent = doc.findNode("Parent"), part = doc.findNode("Part"), joint = doc.findNode("Joint");
    expect(doc.sceneRoots).toEqual([parent.index]);
    expect(part.parent).toBe(parent.index);
    // Reflected, non-uniform parent applied to the triangle (no unit conversion).
    const triangle = doc.meshes[part.mesh!]!.primitives.find((primitive) => primitive.mode === 4)!;
    closeRows(triangle.attributes.POSITION!.values.map((p) => transformPoint(part.world, p)), [[6, 5, 6], [2, 5, 6], [4, 8, 6]]);
    // Normalized integer encodings must decode to the authored unit values.
    const normal = triangle.attributes.NORMAL!;
    expect(normal.normalized).toBe(true);
    closeRows(normal.values, [[0, 0, 1], [0, 0, 1], [0, 0, 1]]);
    closeRows(triangle.attributes.TEXCOORD_0!.values, [[0, 0], [1, 0], [127 / 255, 1]]);
    expect(triangle.indices).toEqual([0, 1, 2]);
    closeRows(triangle.attributes.WEIGHTS_0!.values, [[1, 0, 0, 0], [1, 0, 0, 0], [1, 0, 0, 0]]);
    expect(triangle.attributes.JOINTS_0!.raw.flat().every((value) => value === 0)).toBe(true);
    closeRows(triangle.targets[0]!.POSITION!.values, [[0, 0, 1], [0, 0, 1], [0, 0, 1]]);
    const line = doc.meshes[part.mesh!]!.primitives.find((primitive) => primitive.mode === 1)!;
    expect(line.indices).toEqual([1, 0]);
    closeRows(line.attributes.POSITION!.values, [[0, 0, 0], [1, 1, 0]]);
    expect(doc.meshes[part.mesh!]!.weights).toEqual([0.25]);
    // Skin binds the joint node with identity inverse bind matrices.
    const skin = doc.skins[part.skin!]!;
    expect(skin.joints).toEqual([joint.index]);
    closeRows(skin.inverseBindMatrices!, [[1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]]);
    closeRows([joint.local.slice(0, 3)], [[0, 0, -1]]);
    // Animations: LINEAR translation and STEP morph weights on the Part node.
    const channels = doc.animations[0]!.channels;
    const translation = channels.find((channel) => channel.path === "translation")!;
    expect(translation.node).toBe(part.index);
    expect(translation.interpolation).toBe("LINEAR");
    expect(translation.input).toEqual([0, 1]);
    closeRows(translation.output, [[0, 0, 0], [0, 1, 0]]);
    const weights = channels.find((channel) => channel.path === "weights")!;
    expect(weights.interpolation).toBe("STEP");
    closeRows(weights.output, [[0.25], [1]]);
    // Camera, light and the embedded texture image bytes.
    const camera = doc.json.cameras[doc.findNode("Camera").camera!];
    expect(camera.type).toBe("perspective");
    expect(camera.perspective.yfov).toBeCloseTo(1);
    const lightIndex = doc.findNode("Light").extensions.KHR_lights_punctual.light;
    expect(doc.json.extensions.KHR_lights_punctual.lights[lightIndex]).toMatchObject({ type: "point", intensity: 8, color: [1, 0.5, 0.25] });
    expect(doc.extensionsUsed).toContain("KHR_lights_punctual");
    const material = doc.materials[triangle.material!]!;
    expect(material.doubleSided).toBe(true);
    const image = doc.images[doc.json.textures[material.pbrMetallicRoughness.baseColorTexture.index].source]!;
    expect(image.bytes).toEqual(png);
    expect(doc.asset.extras).toEqual({ author: "Aura3D test", license: "CC0" });
  });

  it("reads external .gltf output with dependency resolution", () => {
    const result = exportGLTF(richScene(), { binary: false, embedDependencies: false });
    const files = new Map(result.dependencies.map((dependency) => [dependency.name, bytes(dependency.data)]));
    const doc = readIndependentGLTF(bytes(result.data), (uri) => files.get(decodeURIComponent(uri)));
    const part = doc.findNode("Part");
    closeRows(doc.meshes[part.mesh!]!.primitives[0]!.attributes.POSITION!.values.map((p) => transformPoint(part.world, p)), [[6, 5, 6], [2, 5, 6], [4, 8, 6]]);
    expect(doc.images.some((image) => image.bytes.length === png.length && image.bytes.every((value, i) => value === png[i]))).toBe(true);
  });
});

describe("document provenance and material variants in runtime snapshots (WP-09)", () => {
  it("retains provenance and KHR_materials_variants through load -> snapshot -> glTF, verified independently", async () => {
    const loader = new GLTFLoader();
    const input = await loader.load({ url: variantSourceUrl() }, new LoadContext());
    try {
      const snapshot = sceneFromGLTFAsset(input);
      expect(snapshot.document).toEqual({ generator: "Independent fixture writer 1.0", copyright: "CC0-1.0 Aura3D test fixture", version: "2.0", extras: { fixture: "variants", revision: 3 } });
      expect(snapshot.materialVariants).toEqual(["summer", "winter", "unused"]);
      expect(snapshot.meshes![0]!.primitives[0]!.variants).toEqual([{ material: 1, variants: [0] }, { material: 2, variants: [1] }]);
      expect(codes(snapshot.sourceWarnings ?? [])).not.toContain("MATERIAL_VARIANTS_LOST");
      expect(codes(snapshot.sourceWarnings ?? [])).not.toContain("SOURCE_DOCUMENT_METADATA_UNAVAILABLE");
      expect(() => validateScene(snapshot)).not.toThrow();

      const result = exportGLTF(snapshot, { binary: true });
      expect(codes(result.warnings)).not.toContain("UNSUPPORTED_PROPERTY");
      const doc = readIndependentGLTF(bytes(result.data));
      expect(doc.asset.version).toBe("2.0");
      expect(doc.asset.generator).toBe("Aura3D");
      expect(doc.asset.copyright).toBe("CC0-1.0 Aura3D test fixture");
      expect(doc.asset.extras["aura3d:sourceDocument"]).toEqual({ generator: "Independent fixture writer 1.0", version: "2.0", extras: { fixture: "variants", revision: 3 } });
      expect(doc.extensionsUsed).toContain("KHR_materials_variants");
      expect(doc.extensionsRequired).not.toContain("KHR_materials_variants");
      const names: string[] = doc.json.extensions.KHR_materials_variants.variants.map((variant: { name: string }) => variant.name);
      expect(names).toEqual(["summer", "winter", "unused"]);
      const primitive = doc.meshes[doc.findNode("Panel").mesh!]!.primitives[0]!;
      const materialName = (index: number): string => doc.materials[index]!.name;
      expect(materialName(primitive.material!)).toBe("default");
      const resolved = Object.fromEntries(names.map((name, variantIndex) => {
        const mapping = (primitive.extensions.KHR_materials_variants.mappings as { material: number; variants: number[] }[]).find((entry) => entry.variants.includes(variantIndex));
        return [name, materialName(mapping ? mapping.material : primitive.material!)];
      }));
      expect(resolved).toEqual({ summer: "warm", winter: "cold", unused: "default" });

      // Re-import and re-export keeps the first source provenance instead of nesting it.
      const reloaded = await loader.load({ url: glbUrl(result.data) }, new LoadContext());
      try {
        const second = sceneFromGLTFAsset(reloaded);
        expect(second.document?.generator).toBe("Independent fixture writer 1.0");
        expect(second.document?.copyright).toBe("CC0-1.0 Aura3D test fixture");
        expect(second.document?.extras).toEqual({ fixture: "variants", revision: 3 });
        expect(second.materialVariants).toEqual(["summer", "winter", "unused"]);
        const again = readIndependentGLTF(bytes(exportGLTF(second, { binary: true }).data));
        expect(again.asset.extras["aura3d:sourceDocument"]).toEqual(doc.asset.extras["aura3d:sourceDocument"]);
        // Aura's loader also resolves the variant from the exported file.
        const summer = reloaded.createScene({ materialVariant: "summer" });
        const renderable = summer.findByName("Panel")[0]?.renderable ?? summer.root.children[0]?.renderable ?? summer.root.children[0]?.children[0]?.renderable;
        expect(renderable?.material.split("#aura3d-runtime:")[0]).toBe("warm");
        summer.dispose();
      } finally { loader.dispose(reloaded); }

      // Writers without a representation report structured losses.
      for (const output of [exportOBJ(snapshot), exportPLY(snapshot), exportSTL(snapshot), exportUSDZ(snapshot)]) {
        expect(codes(output.warnings)).toEqual(expect.arrayContaining(["DOCUMENT_PROVENANCE_LOST", "MATERIAL_VARIANTS_LOST"]));
        expect(output.warnings.filter((warning) => warning.code === "UNSUPPORTED_PROPERTY" && /document|[vV]ariants/.test(warning.path ?? ""))).toEqual([]);
      }
      // A stub codec suffices: this checks the loss report, not Draco encoding.
      const draco = await exportDRACO(snapshot.meshes![0]!.primitives[0]!, { encoder: {
        encode: (input) => ({ data: Uint8Array.from([...new TextEncoder().encode("DRACO"), 2, 2, 0, 0, 0, 0]), attributeIds: Object.fromEntries(Object.keys(input.attributes).map((key, id) => [key, id])), lossless: true })
      } });
      expect(codes(draco.warnings)).toContain("MATERIAL_VARIANTS_LOST");
    } finally { loader.dispose(input); }
  });

  it("rejects malformed variant mappings and document fields instead of writing them", () => {
    const base: AuraExportScene = {
      nodes: [{ mesh: 0 }], roots: [0], metersPerUnit: 1, upAxis: "Y",
      materials: [{ name: "a" }, { name: "b" }], materialVariants: ["one"],
      meshes: [{ primitives: [{ attributes: { POSITION: { itemSize: 3, values: [0, 0, 0, 1, 0, 0, 0, 1, 0] } }, material: 0, variants: [{ material: 1, variants: [0] }] }] }]
    };
    expect(() => exportGLTF(base)).not.toThrow();
    const primitive = base.meshes![0]!.primitives[0]!;
    const withVariants = (variants: unknown): AuraExportScene => ({ ...base, meshes: [{ primitives: [{ ...primitive, variants: variants as never }] }] });
    expect(() => exportGLTF(withVariants([{ material: 1, variants: [3] }]))).toThrow(/variants/);
    expect(() => exportGLTF(withVariants([{ material: 9, variants: [0] }]))).toThrow(/material/);
    expect(() => exportGLTF(withVariants([{ material: 1, variants: [0] }, { material: 0, variants: [0] }]))).toThrow(/twice/);
    expect(() => exportGLTF({ ...base, materialVariants: ["one", "one"] })).toThrow(/duplicates/);
    expect(() => exportGLTF({ ...base, materialVariants: undefined })).toThrow(/variants/);
    expect(() => exportGLTF({ ...base, document: { minVersion: "3.0" } })).toThrow(/minVersion/);
    expect(() => validateScene(withVariants([{ material: 1, variants: [4] }]))).toThrow(/invalid index/);
  });
});

function primPath(prim: USDPrim): string { return prim.path; }
function asNumbers(value: USDValue | undefined): number[] {
  if (!Array.isArray(value)) throw new Error("Expected a numeric array");
  return (value as USDValue[]).flat(3) as number[];
}
function tuples(value: USDValue | undefined): number[][] {
  if (!Array.isArray(value)) throw new Error("Expected a tuple array");
  return (value as USDValue[]).map((row) => row as number[]);
}

describe("independent USDZ stage semantics (WP-09)", () => {
  it("loads hierarchy, transforms, geometry, materials, rigging, camera, light and time samples from the package", () => {
    const source = richScene();
    const output = exportUSDZ(source);
    const entries = readIndependentUSDZ(bytes(output.data));
    const stage = parseIndependentUSDA(decoder.decode(entries[0]!.data));
    expect(stage.metadata.metersPerUnit).toBe(1);
    expect(stage.metadata.upAxis).toBe("Y");
    expect(stage.metadata.defaultPrim).toBe(stage.roots[0]!.name);
    const prims = stage.allPrims();
    const bySourceName = (name: string): USDPrim => {
      const matches = prims.filter((prim) => prim.properties.get("aura3d:sourceName")?.value === name && prim.typeName === "Xform");
      expect(matches.map(primPath)).toHaveLength(1);
      return matches[0]!;
    };
    const parent = bySourceName("Parent"), part = bySourceName("Part");
    expect(part.parent).toBe(parent);
    for (const name of ["Joint", "Camera", "Light"]) expect(bySourceName(name).parent).toBe(parent);
    // Triangle mesh: world positions, topology, normals and flipped st.
    const mesh = part.children.find((child) => child.typeName === "Mesh")!;
    const points = tuples(mesh.properties.get("points")!.value);
    closeRows(points.map((p) => transformPoint(usdWorldMatrix(mesh, 0), p)), [[6, 5, 6], [2, 5, 6], [4, 8, 6]]);
    expect(asNumbers(mesh.properties.get("faceVertexCounts")!.value)).toEqual([3]);
    expect(asNumbers(mesh.properties.get("faceVertexIndices")!.value)).toEqual([0, 1, 2]);
    closeRows(tuples(mesh.properties.get("normals")!.value), [[0, 0, 1], [0, 0, 1], [0, 0, 1]]);
    expect(mesh.properties.get("normals")!.metadata.interpolation).toBe("vertex");
    closeRows(tuples(mesh.properties.get("primvars:st")!.value), [[0, 1], [1, 1], [127 / 255, 0]]);
    // Line primitive as linear BasisCurves.
    const curves = part.children.find((child) => child.typeName === "BasisCurves")!;
    expect(curves.properties.get("type")!.value).toBe("linear");
    expect(asNumbers(curves.properties.get("curveVertexCounts")!.value)).toEqual([2]);
    closeRows(tuples(curves.properties.get("points")!.value), [[1, 1, 0], [0, 0, 0]]);
    // Material binding resolves to a UsdPreviewSurface whose texture is a package entry.
    const binding = mesh.properties.get("material:binding")!.value as { path: string };
    const material = stage.prim(binding.path);
    expect(material.typeName).toBe("Material");
    const surfacePath = material.properties.get("outputs:surface")!.connect!.split(".")[0]!;
    const surface = stage.prim(surfacePath);
    expect(surface.properties.get("info:id")!.value).toBe("UsdPreviewSurface");
    expect(surface.properties.get("inputs:metallic")!.value).toBeCloseTo(0.3);
    expect(surface.properties.get("inputs:roughness")!.value).toBeCloseTo(0.6);
    const texture = stage.prim(surface.properties.get("inputs:diffuseColor")!.connect!.split(".")[0]!);
    expect(texture.properties.get("info:id")!.value).toBe("UsdUVTexture");
    const file = (texture.properties.get("inputs:file")!.value as { asset: string }).asset;
    expect(entries.find((entry) => entry.name === file)?.data).toEqual(png);
    closeRows([asNumbers(texture.properties.get("inputs:scale")!.value)], [[0.5, 0.25, 0.75, 1]]);
    // Skinning: skeleton relationship, joints and per-vertex influences.
    const skeleton = stage.prim((mesh.properties.get("skel:skeleton")!.value as { path: string }).path);
    expect(skeleton.typeName).toBe("Skeleton");
    const joints = skeleton.properties.get("joints")!.value as string[];
    expect(joints).toHaveLength(1);
    expect(mesh.properties.get("primvars:skel:jointIndices")!.metadata.elementSize).toBe(4);
    expect(asNumbers(mesh.properties.get("primvars:skel:jointIndices")!.value).every((index) => index < joints.length)).toBe(true);
    expect(asNumbers(mesh.properties.get("primvars:skel:jointWeights")!.value)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
    // Morph target as a BlendShape with authored offsets.
    const shape = stage.prim((mesh.properties.get("skel:blendShapeTargets")!.value as { path: string }[])[0]!.path);
    expect(shape.typeName).toBe("BlendShape");
    closeRows(tuples(shape.properties.get("offsets")!.value), [[0, 0, 1], [0, 0, 1], [0, 0, 1]]);
    // Animated translation of Part: time samples move the world triangle.
    const samples = part.properties.get("xformOp:translate")!.timeSamples!;
    expect([...samples.keys()]).toEqual([0, 1]);
    closeRows(points.map((p) => transformPoint(usdWorldMatrix(mesh, 1), p)), [[6, 8, 6], [2, 8, 6], [4, 11, 6]]);
    // Camera vertical field of view and light colour/intensity.
    const camera = bySourceName("Camera").children[0]!;
    expect(camera.typeName).toBe("Camera");
    const fov = 2 * Math.atan((camera.properties.get("verticalAperture")!.value as number) / 2 / (camera.properties.get("focalLength")!.value as number));
    expect(fov).toBeCloseTo(1, 4);
    closeRows([asNumbers(camera.properties.get("clippingRange")!.value)], [[0.1, 100]]);
    const light = bySourceName("Light").children[0]!;
    expect(light.typeName).toBe("SphereLight");
    closeRows([asNumbers(light.properties.get("inputs:color")!.value)], [[1, 0.5, 0.25]]);
    // Scene metadata is preserved as a JSON custom attribute.
    const root = stage.roots[0]!;
    expect(JSON.parse(root.properties.get("aura3d:metadata")!.value as string)).toEqual({ author: "Aura3D test", license: "CC0" });
  });

  it("selects animation clip variants independently", () => {
    const source = richScene();
    const first = source.animations![0]!;
    const second = { name: "drop", channels: [{ node: 1, path: "translation" as const, interpolation: "LINEAR" as const, times: { values: new Float32Array([0, 2]), itemSize: 1 as const }, values: { values: new Float32Array([0, 0, 0, 0, -2, 0]), itemSize: 3 as const } }] };
    const stage = parseIndependentUSDA(decoder.decode(readIndependentUSDZ(bytes(exportUSDZ({ ...source, animations: [first, second] }).data))[0]!.data));
    const root = stage.roots[0]!;
    const clips = root.variantSets.get("Animation")!;
    expect([...clips.keys()]).toEqual(["Clip_0", "Clip_1"]);
    const findOver = (prims: USDPrim[], name: string): USDPrim | undefined => {
      for (const prim of prims) { if (prim.name === name) return prim; const nested = findOver(prim.children, name); if (nested) return nested; }
      return undefined;
    };
    const dropped = findOver(clips.get("Clip_1")!, "Node_1")!;
    const samples = dropped.properties.get("xformOp:translate")!.timeSamples!;
    expect(samples.size).toBeGreaterThanOrEqual(2);
    const last = [...samples.entries()].sort((a, b) => a[0] - b[0]).at(-1)!;
    closeRows([last[1] as number[]], [[0, -2, 0]]);
  });

  it("rejects malformed packages in the independent reader", () => {
    const valid = bytes(exportUSDZ(richScene()).data);
    const corrupt = valid.slice();
    const entry = readIndependentUSDZ(valid)[0]!;
    corrupt[entry.dataOffset + 10] ^= 1;
    expect(() => readIndependentUSDZ(corrupt)).toThrow(/CRC/);
    expect(() => parseIndependentUSDA("not a layer")).toThrow(/header/);
  });
});

describe("complete independent PLY reader (WP-09)", () => {
  const coloredScene = (): AuraExportScene => ({
    nodes: [{ name: "Root", translation: [1, 0, 0], children: [1] }, { mesh: 0, scale: [2, 2, 2] }], roots: [0], metersPerUnit: 1, upAxis: "Y", uvOrigin: "top-left",
    meshes: [{ primitives: [
      { attributes: {
        POSITION: { itemSize: 3, values: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]) },
        NORMAL: { itemSize: 3, values: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]) },
        TEXCOORD_0: { itemSize: 2, values: new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]) },
        COLOR_0: { itemSize: 4, values: new Float32Array([1, 0, 0, 1, 0, 1, 0, 0.5, 0, 0, 1, 1, 0.25, 0.5, 0.75, 1]) }
      }, indices: new Uint32Array([0, 1, 2, 2, 1, 3]) },
      { mode: "lines", attributes: { POSITION: { itemSize: 3, values: [0, 0, 0, 0, 0, 1] } } }
    ] }]
  });

  it.each(["ascii", "binary_little_endian", "binary_big_endian"] as const)("decodes every %s element, property and comment", (format) => {
    const output = exportPLY(coloredScene(), { format });
    const ply = readIndependentPLY(bytes(output.data));
    expect(ply.format).toBe(format);
    expect(ply.version).toBe("1.0");
    expect(ply.comments.some((comment) => comment.startsWith("Generated by Aura3D"))).toBe(true);
    expect(ply.comments).toContain('aura3d_up_axis "Y"');
    const vertex = ply.element("vertex");
    expect(vertex.properties.map((property) => property.name)).toEqual(["x", "y", "z", "nx", "ny", "nz", "u", "v", "red", "green", "blue", "alpha"]);
    expect(vertex.count).toBe(6);
    // World transform: translate(1,0,0) * scale(2).
    closeRows(vertex.rows.map((row) => [row.x as number, row.y as number, row.z as number]), [[1, 0, 0], [3, 0, 0], [1, 2, 0], [3, 2, 0], [1, 0, 0], [1, 0, 2]]);
    closeRows(vertex.rows.slice(0, 4).map((row) => [row.nx as number, row.ny as number, row.nz as number]), [[0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0, 1]]);
    // UVs keep the declared origin, which is recorded in an Aura3D comment.
    expect(ply.comments).toContain('aura3d_uv_origin "top-left"');
    closeRows(vertex.rows.slice(0, 4).map((row) => [row.u as number, row.v as number]), [[0, 0], [1, 0], [0, 1], [1, 1]]);
    // The line vertices share the layout with reported defaults (zero normal/UV, white).
    closeRows(vertex.rows.slice(4).map((row) => [row.nx, row.ny, row.nz, row.u, row.v, row.red, row.green, row.blue, row.alpha] as number[]), [[0, 0, 0, 0, 0, 1, 1, 1, 1], [0, 0, 0, 0, 0, 1, 1, 1, 1]]);
    expect(output.warnings.filter((warning) => warning.code === "ATTRIBUTE_DEFAULTED")).toHaveLength(3);
    closeRows(vertex.rows.slice(0, 4).map((row) => [row.red as number, row.green as number, row.blue as number, row.alpha as number]), [[1, 0, 0, 1], [0, 1, 0, 0.5], [0, 0, 1, 1], [0.25, 0.5, 0.75, 1]]);
    const faces = ply.element("face");
    expect(faces.properties).toEqual([{ name: "vertex_indices", type: "uint", listCount: "uchar" }]);
    expect(faces.rows.map((row) => row.vertex_indices)).toEqual([[0, 1, 2], [2, 1, 3]]);
    expect(ply.element("edge").rows).toEqual([{ vertex1: 4, vertex2: 5 }]);
  });

  it("produces semantically identical data in all three encodings", () => {
    const decoded = (["ascii", "binary_little_endian", "binary_big_endian"] as const).map((format) => readIndependentPLY(bytes(exportPLY(coloredScene(), { format }).data)).elements.map((element) => element.rows));
    expect(decoded[1]).toEqual(decoded[2]);
    closeRows(decoded[0]![0]!.map((row) => Object.values(row) as number[]), decoded[1]![0]!.map((row) => Object.values(row) as number[]), 12);
    expect(decoded[0]![1]).toEqual(decoded[1]![1]);
  });

  it("rejects truncated or trailing PLY bodies and malformed headers", () => {
    const binary = bytes(exportPLY(coloredScene(), { format: "binary_little_endian" }).data);
    expect(() => readIndependentPLY(binary.subarray(0, binary.length - 1))).toThrow(/truncated/);
    expect(() => readIndependentPLY(Uint8Array.from([...binary, 0]))).toThrow(/trailing/);
    const text = new TextEncoder().encode("ply\nformat ascii 1.0\nelement vertex 1\nproperty float x\nproperty list float uint bad\nend_header\n0 0\n");
    expect(() => readIndependentPLY(text)).toThrow(/list property/);
  });
});
