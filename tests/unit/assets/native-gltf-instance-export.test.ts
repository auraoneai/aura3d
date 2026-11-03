import { describe, expect, it, vi } from "vitest";
import { NodeIO } from "@gltf-transform/core";
import { EXTMeshGPUInstancing, type InstancedMesh as GLTFTransformInstancedMesh } from "@gltf-transform/extensions";
import { exportGLTF, exportOBJ, sceneFromGLTFAsset, type AuraExportScene } from "@aura3d/assets/exporters";
import { GLTFLoader } from "../../../packages/assets/src/GLTFLoader";
import { createGLTFRenderResources } from "../../../packages/assets/src/GLTFRenderResources";
import { LoadContext } from "../../../packages/assets/src/LoadContext";

const fixture = (): AuraExportScene => ({
  metersPerUnit: 1,
  upAxis: "Y",
  nodes: [
    { name: "Parent", translation: [10, 20, 30], scale: [2, 3, 4], children: [1] },
    { name: "Instances", mesh: 0, translation: [1, 2, 3] }
  ],
  roots: [0],
  meshes: [{
    name: "triangle",
    primitives: [{
      attributes: { POSITION: { itemSize: 3, values: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]) } },
      material: 0
    }]
  }],
  materials: [{ name: "material", baseColor: [0.5, 0.75, 1, 1] }]
});

const matrices = new Float32Array([
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, -1, 4, 1,
  0, 2, 0, 0, -3, 0, 0, 0, 0, 0, -4, 0, -1, 5, 3, 1
]);

const rgba = new Float32Array([1, 0, 0, 1, 0, 0.5, 1, 0.5]);

function glb(data: Blob | Uint8Array): { doc: any; bin: Uint8Array } {
  if (!(data instanceof Uint8Array)) throw new Error("Expected byte output");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  expect(view.getUint32(0, true)).toBe(0x46546c67);
  expect(view.getUint32(8, true)).toBe(data.length);
  const length = view.getUint32(12, true);
  const doc = JSON.parse(new TextDecoder().decode(data.subarray(20, 20 + length)));
  const binHeader = 20 + length;
  expect(view.getUint32(binHeader + 4, true)).toBe(0x004e4942);
  return { doc, bin: data.subarray(binHeader + 8, binHeader + 8 + view.getUint32(binHeader, true)) };
}

function accessor(file: ReturnType<typeof glb>, index: number): number[][] {
  const descriptor = file.doc.accessors[index], bufferView = file.doc.bufferViews[descriptor.bufferView];
  expect(descriptor.componentType).toBe(5126);
  const width = descriptor.type === "VEC4" ? 4 : 3;
  const view = new DataView(file.bin.buffer, file.bin.byteOffset, file.bin.byteLength);
  return Array.from({ length: descriptor.count }, (_, row) =>
    Array.from({ length: width }, (_, column) =>
      view.getFloat32((bufferView.byteOffset ?? 0) + (descriptor.byteOffset ?? 0) + row * (bufferView.byteStride ?? width * 4) + column * 4, true)
    )
  );
}

function url(data: Blob | Uint8Array): string {
  if (!(data instanceof Uint8Array)) throw new Error("Expected byte output");
  return `data:model/gltf-binary;base64,${Buffer.from(data).toString("base64")}`;
}

async function loadedFixture() {
  const loader = new GLTFLoader();
  const asset = await loader.load({ url: url(exportGLTF(fixture(), { binary: true }).data) }, new LoadContext());
  const scene = asset.createScene();
  const node = scene.findByName("Instances")[0]!;
  node.renderable!.instanceTransforms = new Float32Array(matrices);
  return { loader, asset, scene, node };
}

function floats(values: readonly number[]): Buffer {
  const bytes = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => bytes.writeFloatLE(value, index * 4));
  return bytes;
}

function authoredColorDocument(
  colorBytes: Buffer,
  colorAccessor: Record<string, unknown>,
  options: { translation?: boolean; colorStride?: number } = {}
): any {
  const positions = floats([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const translations = floats([2, -1, 4, -1, 5, 3]);
  const binary = Buffer.concat([positions, translations, colorBytes]);
  return {
    asset: { version: "2.0" },
    extensionsUsed: ["EXT_mesh_gpu_instancing"],
    extensionsRequired: ["EXT_mesh_gpu_instancing"],
    buffers: [{ uri: `data:application/octet-stream;base64,${binary.toString("base64")}`, byteLength: binary.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.length },
      { buffer: 0, byteOffset: positions.length, byteLength: translations.length },
      { buffer: 0, byteOffset: positions.length + translations.length, byteLength: colorBytes.length, ...(options.colorStride ? { byteStride: options.colorStride } : {}) }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 1, componentType: 5126, count: 2, type: "VEC3" },
      { bufferView: 2, count: 2, ...colorAccessor }
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ name: "authored", mesh: 0, extensions: { EXT_mesh_gpu_instancing: { attributes: { ...(options.translation === false ? {} : { TRANSLATION: 1 }), _COLOR_0: 2 } } } }],
    scenes: [{ nodes: [0] }],
    scene: 0
  };
}

function documentUrl(document: unknown): string {
  return `data:model/gltf+json;base64,${Buffer.from(JSON.stringify(document)).toString("base64")}`;
}

describe("public glTF instancing export", () => {
  it("snapshots local matrices and exports required GPU instance transforms that the loader reconstructs", async () => {
    const { loader, asset, scene, node } = await loadedFixture();
    const snapshot = sceneFromGLTFAsset(asset, scene);
    node.renderable!.instanceTransforms![12] = 99;
    const captured = snapshot.nodes.find((entry) => entry.name === "Instances")!;
    expect(Array.from(captured.instances!.transforms)).toEqual(Array.from(matrices));
    expect(snapshot.sourceWarnings?.map((warning) => warning.code)).not.toContain("INSTANCING_LOST");
    const result = exportGLTF(snapshot, { binary: true });
    const file = glb(result.data), out = file.doc.nodes.find((entry: any) => entry.name === "Instances");
    expect(file.doc.extensionsUsed).toContain("EXT_mesh_gpu_instancing");
    expect(file.doc.extensionsRequired).toContain("EXT_mesh_gpu_instancing");
    expect(out.translation).toEqual([1, 2, 3]);
    const attributes = out.extensions.EXT_mesh_gpu_instancing.attributes;
    expect(Object.keys(attributes).sort()).toEqual(["ROTATION", "SCALE", "TRANSLATION"]);
    expect(accessor(file, attributes.TRANSLATION)).toEqual([[2, -1, 4], [-1, 5, 3]]);
    expect(accessor(file, attributes.SCALE)[0]).toEqual([1, 1, 1]);
    const rotations = accessor(file, attributes.ROTATION);
    expect(rotations).toHaveLength(2);
    expect(rotations[1].reduce((sum, value) => sum + value * value, 0)).toBeCloseTo(1, 6);
    const output = await loader.load({ url: url(result.data) }, new LoadContext());
    const reloaded = output.createScene();
    const actual = reloaded.findByName("Instances")[0]!.renderable!.instanceTransforms!;
    expect(actual).toHaveLength(matrices.length);
    for (let i = 0; i < matrices.length; i++) expect(actual[i]).toBeCloseTo(matrices[i]!, 5);
    reloaded.dispose();
    scene.dispose();
    loader.dispose(output);
    loader.dispose(asset);
  });

  it("round-trips snapshot colors through a custom accessor with an explicit interoperability warning", async () => {
    const { loader, asset, scene, node } = await loadedFixture();
    node.renderable!.instanceColors = new Float32Array(rgba);
    const snapshot = sceneFromGLTFAsset(asset, scene);
    node.renderable!.instanceColors[0] = 0;
    const captured = snapshot.nodes.find((entry) => entry.name === "Instances")!;
    expect(Array.from(captured.instances!.colors!)).toEqual(Array.from(rgba));
    expect(snapshot.sourceWarnings).toContainEqual(expect.objectContaining({
      code: "INSTANCE_COLOR_TARGET_UNAVAILABLE",
      message: expect.stringContaining("runtime material's instance-color target")
    }));
    const result = exportGLTF(snapshot, { binary: true });
    expect(result.warnings.map((warning) => warning.code)).not.toContain("INSTANCE_COLOR_LOST");
    expect(result.warnings).toContainEqual(expect.objectContaining({
      code: "INSTANCE_COLOR_INTEROPERABILITY",
      path: expect.stringMatching(/instances\.colors$/),
      message: expect.stringMatching(/custom.*_COLOR_0.*adapter/i)
    }));
    const file = glb(result.data);
    const out = file.doc.nodes.find((entry: any) => entry.name === "Instances");
    const index = out.extensions.EXT_mesh_gpu_instancing.attributes._COLOR_0;
    expect(file.doc.accessors[index]).toMatchObject({ componentType: 5126, count: 2, type: "VEC4" });
    expect(file.doc.accessors[index].normalized).toBeUndefined();
    expect(file.doc.bufferViews[file.doc.accessors[index].bufferView].target).toBe(34962);
    expect(accessor(file, index)).toEqual([[1, 0, 0, 1], [0, 0.5, 1, 0.5]]);
    const output = await loader.load({ url: url(result.data) }, new LoadContext());
    const reloaded = output.createScene();
    const secondScene = output.createScene();
    const renderable = reloaded.findByName("Instances")[0]!.renderable!;
    expect(renderable.instanceTransforms).toHaveLength(32);
    expect(Array.from(renderable.instanceColors!)).toEqual(Array.from(rgba));
    renderable.instanceColors![0] = 0.25;
    expect(Array.from(secondScene.findByName("Instances")[0]!.renderable!.instanceColors!)).toEqual(Array.from(rgba));
    secondScene.dispose();
    reloaded.dispose();
    scene.dispose();
    loader.dispose(output);
    loader.dispose(asset);
  });

  it("exposes the custom instance accessor to an independent glTF reader", async () => {
    const source = fixture();
    const result = exportGLTF({
      ...source,
      nodes: [source.nodes[0]!, { ...source.nodes[1]!, instances: { transforms: matrices, colors: rgba } }]
    }, { binary: true });
    if (!(result.data instanceof Uint8Array)) throw new Error("Expected byte output");
    const document = await new NodeIO().registerExtensions([EXTMeshGPUInstancing]).readBinary(result.data);
    const node = document.getRoot().listNodes().find((entry) => entry.getName() === "Instances")!;
    const instancing = node.getExtension<GLTFTransformInstancedMesh>("EXT_mesh_gpu_instancing")!;
    expect(instancing.listSemantics().sort()).toEqual(["ROTATION", "SCALE", "TRANSLATION", "_COLOR_0"]);
    const color = instancing.getAttribute("_COLOR_0")!;
    expect(color.getElementSize()).toBe(4);
    expect(color.getCount()).toBe(2);
    expect(Array.from(color.getArray()!)).toEqual(Array.from(rgba));
  });

  it("loads independently authored RGB, RGBA, normalized and interleaved custom colors", async () => {
    const words = Buffer.alloc(16);
    [0, 32768, 65535, 16384, 65535, 16384, 0, 65535].forEach((value, index) => words.writeUInt16LE(value, index * 2));
    const cases: Array<{ bytes: Buffer; accessor: Record<string, unknown>; stride?: number; expected: number[] }> = [
      {
        bytes: floats([-0.25, 0.5, 1.5, 0.125, 1.25, -0.5, 0, 0.75]),
        accessor: { componentType: 5126, type: "VEC4" },
        expected: [-0.25, 0.5, 1.5, 0.125, 1.25, -0.5, 0, 0.75]
      },
      {
        bytes: floats([0.125, 0.5, 1, 1, 0.25, 0]),
        accessor: { componentType: 5126, type: "VEC3" },
        expected: [0.125, 0.5, 1, 1, 1, 0.25, 0, 1]
      },
      {
        bytes: Buffer.from([255, 0, 128, 99, 0, 255, 64, 77]),
        accessor: { componentType: 5121, normalized: true, type: "VEC3" },
        stride: 4,
        expected: [1, 0, 128 / 255, 1, 0, 1, 64 / 255, 1]
      },
      {
        bytes: words,
        accessor: { componentType: 5123, normalized: true, type: "VEC4" },
        expected: [0, 32768 / 65535, 1, 16384 / 65535, 1, 16384 / 65535, 0, 1]
      }
    ];
    for (const sample of cases) {
      const loader = new GLTFLoader();
      const document = authoredColorDocument(sample.bytes, sample.accessor, { colorStride: sample.stride });
      const asset = await loader.load({ url: documentUrl(document) }, new LoadContext());
      const scene = asset.createScene();
      const renderable = scene.findByName("authored")[0]!.renderable!;
      expect(Array.from(renderable.instanceColors!)).toEqual(Array.from(new Float32Array(sample.expected)));
      expect(renderable.instanceTransforms).toHaveLength(32);
      expect(Array.from(renderable.instanceTransforms!.slice(12, 15))).toEqual([2, -1, 4]);
      scene.dispose();
      loader.dispose(asset);
    }
  });

  it("uses identity transforms when a custom color is the only instance attribute", async () => {
    const document = authoredColorDocument(
      floats([1, 0, 0, 0, 1, 0]),
      { componentType: 5126, type: "VEC3" },
      { translation: false }
    );
    const loader = new GLTFLoader();
    const asset = await loader.load({ url: documentUrl(document) }, new LoadContext());
    const scene = asset.createScene();
    const renderable = scene.findByName("authored")[0]!.renderable!;
    expect(Array.from(renderable.instanceColors!)).toEqual([1, 0, 0, 1, 0, 1, 0, 1]);
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    expect(Array.from(renderable.instanceTransforms!)).toEqual([...identity, ...identity]);
    scene.dispose();
    loader.dispose(asset);
  });

  it("resolves a sparse independently authored color accessor", async () => {
    const document = authoredColorDocument(Buffer.alloc(0), { componentType: 5126, type: "VEC4" });
    const original = Buffer.from(document.buffers[0].uri.split(",")[1], "base64");
    const indices = Buffer.from([1, 0, 0, 0]);
    const values = floats([0.25, 0.5, 0.75, 1]);
    const combined = Buffer.concat([original, indices, values]);
    document.buffers[0] = { uri: `data:application/octet-stream;base64,${combined.toString("base64")}`, byteLength: combined.length };
    document.bufferViews.push(
      { buffer: 0, byteOffset: original.length, byteLength: 1 },
      { buffer: 0, byteOffset: original.length + indices.length, byteLength: values.length }
    );
    document.accessors[2] = {
      componentType: 5126, type: "VEC4", count: 2,
      sparse: { count: 1, indices: { bufferView: 3, componentType: 5121 }, values: { bufferView: 4 } }
    };
    const loader = new GLTFLoader();
    const asset = await loader.load({ url: documentUrl(document) }, new LoadContext());
    const scene = asset.createScene();
    expect(Array.from(scene.findByName("authored")[0]!.renderable!.instanceColors!)).toEqual([0, 0, 0, 0, 0.25, 0.5, 0.75, 1]);
    scene.dispose();
    loader.dispose(asset);
  });

  it("rejects malformed custom color descriptors, values and unsupported combinations", async () => {
    const validBytes = floats([1, 0, 0, 1, 0, 1, 0, 1]);
    const make = () => authoredColorDocument(validBytes, { componentType: 5126, type: "VEC4" });
    const cases: Array<{ mutate: (document: any) => void; error: RegExp }> = [
      { mutate: (d) => { d.accessors[2].type = "VEC2"; }, error: /_COLOR_0.*VEC3 or VEC4/ },
      { mutate: (d) => { d.accessors[2].componentType = 5121; }, error: /_COLOR_0.*normalized UNSIGNED/ },
      { mutate: (d) => { d.accessors[2].componentType = 5122; d.accessors[2].normalized = true; }, error: /_COLOR_0.*normalized UNSIGNED/ },
      { mutate: (d) => { d.accessors[2].componentType = 5125; }, error: /_COLOR_0.*normalized UNSIGNED/ },
      { mutate: (d) => { d.accessors[2].normalized = true; }, error: /_COLOR_0.*normalized UNSIGNED/ },
      { mutate: (d) => { d.accessors[2].normalized = "true"; }, error: /_COLOR_0.*normalized UNSIGNED/ },
      { mutate: (d) => { d.accessors[2].count = 1; }, error: /_COLOR_0 count must match instance count/ },
      { mutate: (d) => { d.accessors[2].count = 0; }, error: /_COLOR_0 count must be between/ },
      { mutate: (d) => { d.accessors[2].count = 1_000_001; }, error: /_COLOR_0 count must be between 1 and 1000000/ },
      { mutate: (d) => { d.nodes[0].extensions.EXT_mesh_gpu_instancing.attributes._COLOR_0 = 8; }, error: /_COLOR_0 references missing accessor/ },
      { mutate: (d) => { delete d.nodes[0].mesh; }, error: /_COLOR_0 requires a valid mesh/ },
      { mutate: (d) => { d.nodes[0].mesh = 100; }, error: /_COLOR_0 requires a valid mesh/ },
      { mutate: (d) => { d.nodes[0].skin = 0; }, error: /_COLOR_0 cannot be combined with a skin/ },
      { mutate: (d) => { d.nodes[0].extensions.EXT_mesh_gpu_instancing.attributes._UNKNOWN = 2; }, error: /attribute _UNKNOWN is unsupported/ }
    ];
    for (const { mutate, error } of cases) {
      const document = make();
      mutate(document);
      await expect(new GLTFLoader().load({ url: documentUrl(document) }, new LoadContext())).rejects.toThrow(error);
    }
    const nonfinite = authoredColorDocument(floats([1, 0, 0, 1, 0, Number.NaN, 0, 1]), { componentType: 5126, type: "VEC4" });
    await expect(new GLTFLoader().load({ url: documentUrl(nonfinite) }, new LoadContext())).rejects.toThrow(/_COLOR_0 must contain finite values/);
  });

  it("warns on float rounding and rejects out-of-range or excessive instance colors", () => {
    const source = fixture();
    const make = (colors: Float32Array | readonly number[], transforms: Float32Array | readonly number[] = matrices) => ({
      ...source,
      nodes: [source.nodes[0]!, { ...source.nodes[1]!, instances: { transforms, colors } }]
    });
    const rounded = exportGLTF(make([0.1, 0, 0, 1, 0, 1, 0, 1]), { binary: true });
    expect(rounded.warnings).toContainEqual(expect.objectContaining({ code: "ATTRIBUTE_PRECISION_LOSS", path: "nodes[1].instances.colors" }));
    expect(() => exportGLTF(make([Number.MAX_VALUE, 0, 0, 1, 0, 1, 0, 1]))).toThrow(/colors\[0\] cannot be represented as FLOAT/);
    expect(() => exportGLTF(make([Number.MIN_VALUE, 0, 0, 1, 0, 1, 0, 1]))).toThrow(/colors\[0\] cannot be represented as FLOAT/);
    expect(() => exportGLTF(make(rgba), { maxBytes: 100 })).toThrow(/GLTF_SIZE_LIMIT.*instances/);
    const excessiveTransforms = new Proxy<number[]>([], {
      get: (target, key, receiver) => key === "length" ? 16_000_016 : Reflect.get(target, key, receiver)
    });
    expect(() => exportGLTF(make([], excessiveTransforms))).toThrow(/colors exceeds 1000000 instances/);
  });

  it("converts instance translations to metres under a Z-up parent and retains other node extensions", () => {
    const source = fixture();
    const result = exportGLTF({
      ...source,
      metersPerUnit: 0.5,
      upAxis: "Z",
      nodes: [source.nodes[0]!, { ...source.nodes[1]!, light: 0, instances: { transforms: matrices } }],
      lights: [{ type: "point", intensity: 3 }]
    }, { binary: true });
    const file = glb(result.data), node = file.doc.nodes[1];
    expect(node.translation).toEqual([0.5, 1, 1.5]);
    expect(node.extensions.KHR_lights_punctual).toEqual({ light: 0 });
    expect(file.doc.extensionsUsed).toEqual(expect.arrayContaining(["EXT_mesh_gpu_instancing", "KHR_lights_punctual"]));
    expect(file.doc.extensionsRequired).toContain("EXT_mesh_gpu_instancing");
    expect(file.doc.nodes[file.doc.scenes[0].nodes[0]].children).toEqual([0]);
    expect(accessor(file, node.extensions.EXT_mesh_gpu_instancing.attributes.TRANSLATION)).toEqual([[1, -0.5, 2], [-0.5, 2.5, 1.5]]);
    expect(accessor(file, node.extensions.EXT_mesh_gpu_instancing.attributes.SCALE)[0]).toEqual([1, 1, 1]);
  });

  it("writes the same instancing accessors in embedded and external glTF JSON buffers", async () => {
    const source = fixture();
    const input = { ...source, nodes: [source.nodes[0]!, { ...source.nodes[1]!, instances: { transforms: matrices, colors: rgba } }] };
    for (const embedDependencies of [true, false]) {
      const result = exportGLTF(input, { embedDependencies });
      expect(result.mimeType).toBe("model/gltf+json");
      if (!(result.data instanceof Uint8Array)) throw new Error("Expected byte output");
      const doc = JSON.parse(new TextDecoder().decode(result.data));
      const uri: string = doc.buffers[0].uri;
      let bin: Uint8Array;
      if (embedDependencies) {
        expect(uri).toMatch(/^data:application\/octet-stream;base64,/);
        bin = new Uint8Array(Buffer.from(uri.slice(uri.indexOf(",") + 1), "base64"));
        expect(result.dependencies).toHaveLength(0);
      } else {
        expect(uri).toBe("aura3d-buffer.bin");
        expect(result.dependencies).toHaveLength(1);
        const dependency = result.dependencies[0]!;
        expect(dependency.name).toBe(uri);
        if (!(dependency.data instanceof Uint8Array)) throw new Error("Expected byte dependency");
        bin = dependency.data;
      }
      const attributes = doc.nodes[1].extensions.EXT_mesh_gpu_instancing.attributes;
      expect(accessor({ doc, bin }, attributes.TRANSLATION)).toEqual([[2, -1, 4], [-1, 5, 3]]);
      expect(accessor({ doc, bin }, attributes._COLOR_0)).toEqual([[1, 0, 0, 1], [0, 0.5, 1, 0.5]]);
      expect(doc.extensionsRequired).toContain("EXT_mesh_gpu_instancing");
      if (embedDependencies) {
        const loader = new GLTFLoader();
        const dataUrl = `data:model/gltf+json;base64,${Buffer.from(result.data).toString("base64")}`;
        const asset = await loader.load({ url: dataUrl }, new LoadContext());
        const live = asset.createScene();
        expect(live.findByName("Instances")[0]!.renderable!.instanceTransforms).toHaveLength(32);
        expect(Array.from(live.findByName("Instances")[0]!.renderable!.instanceColors!)).toEqual(Array.from(rgba));
        live.dispose();
        loader.dispose(asset);
      }
    }
  });

  it("reloads an external JSON buffer through a mocked transport and retains the colored material binding", async () => {
    const source = fixture();
    const result = exportGLTF({
      ...source,
      nodes: [source.nodes[0]!, { ...source.nodes[1]!, instances: { transforms: matrices, colors: rgba } }]
    }, { embedDependencies: false });
    if (!(result.data instanceof Uint8Array) || !(result.dependencies[0]?.data instanceof Uint8Array)) throw new Error("Expected byte output");
    const documentBytes = result.data;
    const bufferBytes = result.dependencies[0].data;
    const requested: string[] = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const address = String(input);
      requested.push(address);
      if (address === "https://fixture.invalid/scene.gltf") return new Response(Uint8Array.from(documentBytes).buffer, { status: 200 });
      if (address === "https://fixture.invalid/aura3d-buffer.bin") return new Response(Uint8Array.from(bufferBytes).buffer, { status: 200 });
      throw new Error(`Unexpected fetch ${address}`);
    });
    try {
      const loader = new GLTFLoader();
      const asset = await loader.load({ url: "https://fixture.invalid/scene.gltf" }, new LoadContext());
      const resources = await createGLTFRenderResources(asset);
      const renderable = resources.scene.findByName("Instances")[0]!.renderable!;
      expect(Array.from(renderable.instanceColors!)).toEqual(Array.from(rgba));
      expect(resources.materialLibrary.get(renderable.material)?.constructor.name).toBe("InstancedPBRMaterial");
      expect(requested).toEqual(["https://fixture.invalid/scene.gltf", "https://fixture.invalid/aura3d-buffer.bin"]);
      resources.dispose();
      loader.dispose(asset);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("round-trips reflected, half-turn and singular TRS matrices without inventing instances", async () => {
    const source = fixture();
    const transforms = new Float32Array([
      -2, 0, 0, 0, 0, -3, 0, 0, 0, 0, 4, 0, 1, 2, 3, 1,
      1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1,
      -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1,
      0, 0, 0, 0, 0, 2, 0, 0, 0, 0, -3, 0, 4, 5, 6, 1,
      0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 7, 8, 9, 1,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -2, -3, 1
    ]);
    const result = exportGLTF({ ...source, nodes: [source.nodes[0]!, { ...source.nodes[1]!, instances: { transforms } }] }, { binary: true });
    const loader = new GLTFLoader();
    const asset = await loader.load({ url: url(result.data) }, new LoadContext());
    const scene = asset.createScene();
    const actual = scene.findByName("Instances")[0]!.renderable!.instanceTransforms!;
    expect(actual).toHaveLength(transforms.length);
    for (let i = 0; i < transforms.length; i++) expect(actual[i]).toBeCloseTo(transforms[i]!, 5);
    scene.dispose();
    loader.dispose(asset);
  });

  it("resnapshots imported multi-primitive instance nodes through the real loader", async () => {
    const source = fixture();
    const primitive = source.meshes![0]!.primitives[0]!;
    const input = {
      ...source,
      nodes: [source.nodes[0]!, { ...source.nodes[1]!, instances: { transforms: matrices, colors: rgba } }],
      meshes: [{ name: "multiple", primitives: [primitive, primitive] }]
    };
    const loader = new GLTFLoader();
    const asset = await loader.load({ url: url(exportGLTF(input, { binary: true }).data) }, new LoadContext());
    const live = asset.createScene();
    const snapshot = sceneFromGLTFAsset(asset, live);
    expect(snapshot.nodes.filter((node) => node.instances)).toHaveLength(2);
    for (const node of snapshot.nodes.filter((entry) => entry.instances)) expect(Array.from(node.instances!.colors!)).toEqual(Array.from(rgba));
    expect(snapshot.sourceWarnings?.map((warning) => warning.code)).not.toContain("INSTANCING_LOST");
    const saved = exportGLTF(snapshot, { binary: true });
    const reloadedAsset = await loader.load({ url: url(saved.data) }, new LoadContext());
    const reloaded = reloadedAsset.createScene();
    const renderables = reloaded.collectRenderables();
    expect(renderables).toHaveLength(2);
    for (const entry of renderables) {
      const actual = entry.renderable.instanceTransforms!;
      expect(actual).toHaveLength(matrices.length);
      for (let i = 0; i < matrices.length; i++) expect(actual[i]).toBeCloseTo(matrices[i]!, 5);
      expect(Array.from(entry.renderable.instanceColors!)).toEqual(Array.from(rgba));
    }
    reloaded.dispose();
    live.dispose();
    loader.dispose(reloadedAsset);
    loader.dispose(asset);
  });

  it("rejects malformed or non-TRS instance data rather than silently approximating it", () => {
    const source = fixture();
    const make = (transforms: Float32Array | readonly number[], colors?: Float32Array | readonly number[]) => ({
      ...source,
      nodes: [source.nodes[0]!, { ...source.nodes[1]!, instances: { transforms, ...(colors === undefined ? {} : { colors }) } }]
    });
    const shear = new Float32Array(matrices);
    shear[4] = 0.25;
    const perspective = new Float32Array(matrices);
    perspective[3] = 0.25;
    const nonfinite = new Float32Array(matrices);
    nonfinite[12] = NaN;
    expect(() => exportGLTF(make(shear))).toThrow(/GLTF_UNSUPPORTED_INSTANCE_TRANSFORM.*shear/);
    expect(() => exportGLTF(make(perspective))).toThrow(/GLTF_UNSUPPORTED_INSTANCE_TRANSFORM.*affine/);
    expect(() => exportGLTF(make(nonfinite))).toThrow(/GLTF_INVALID_INSTANCING.*finite/);
    expect(() => exportGLTF(make([]))).toThrow(/GLTF_INVALID_INSTANCING.*matrices/);
    expect(() => exportGLTF(make(matrices, [1, 1, 1, 1]))).toThrow(/GLTF_INVALID_INSTANCING.*RGBA/);
    expect(() => exportGLTF(make(matrices, [1, 1, 1, 1, 1, 1, 1, NaN]))).toThrow(/GLTF_INVALID_INSTANCING.*finite/);
    const hostile = Array.from(matrices);
    Object.defineProperty(hostile, "12", { get: () => { throw new Error("getter executed"); } });
    expect(() => exportGLTF(make(hostile))).toThrow(/GLTF_INVALID_INSTANCING.*data value/);
    const hostileColors = [1, 1, 1, 1, 1, 1, 1, 1];
    Object.defineProperty(hostileColors, "3", { get: () => { throw new Error("getter executed"); } });
    expect(() => exportGLTF(make(matrices, hostileColors))).toThrow(/GLTF_INVALID_INSTANCING.*data value/);
    expect(() => exportGLTF({ ...source, nodes: [source.nodes[0]!, { name: "No mesh", instances: { transforms: matrices } }] })).toThrow(/GLTF_INVALID_INSTANCING.*requires a mesh/);
    expect(() => exportGLTF(make(new Float32Array(16 * 4)), { maxBytes: 128 })).toThrow(/GLTF_SIZE_LIMIT.*instances/);
    const abort = new AbortController();
    abort.abort();
    expect(() => exportGLTF(make(matrices), { signal: abort.signal })).toThrow(/cancelled/);
    const tinyShear = new Float32Array(matrices);
    tinyShear[4] = 0.0000005;
    expect(exportGLTF(make(tinyShear)).warnings).toContainEqual(expect.objectContaining({ code: "INSTANCE_TRANSFORM_PRECISION_LOSS" }));
    const skinned: AuraExportScene = {
      ...source,
      nodes: [{ ...source.nodes[0]!, children: [1, 2] }, { ...source.nodes[1]!, skin: 0, instances: { transforms: matrices } }, { name: "Joint" }],
      skins: [{ joints: [2] }]
    };
    expect(() => exportGLTF(skinned)).toThrow(/GLTF_UNSUPPORTED_INSTANCING.*skin/);
  });

  it("reports loss to other exporters instead of treating an uninstanced fallback as equivalent", () => {
    const source = fixture();
    const input = { ...source, nodes: [source.nodes[0]!, { ...source.nodes[1]!, instances: { transforms: matrices } }] };
    const result = exportOBJ(input);
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "UNSUPPORTED_PROPERTY", path: "nodes[1].instances" }));
    const plain = glb(exportGLTF(source, { binary: true }).data).doc;
    expect(plain.extensionsUsed ?? []).not.toContain("EXT_mesh_gpu_instancing");
    expect(plain.extensionsRequired ?? []).not.toContain("EXT_mesh_gpu_instancing");
  });

  it("reports unresolved geometry and orphaned colors when snapshotting", async () => {
    const { loader, asset, scene, node } = await loadedFixture();
    (node.renderable as { geometry: string }).geometry = "missing-geometry";
    node.renderable!.instanceColors = new Float32Array(8).fill(1);
    const missing = sceneFromGLTFAsset(asset, scene);
    expect(missing.sourceWarnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "RENDERABLE_GEOMETRY_UNAVAILABLE" }),
      expect.objectContaining({ code: "INSTANCING_LOST" })
    ]));
    expect(missing.nodes.find((entry) => entry.name === "Instances")!.instances).toBeUndefined();
    node.renderable!.instanceTransforms = undefined;
    const orphan = sceneFromGLTFAsset(asset, scene);
    expect(orphan.sourceWarnings).toContainEqual(expect.objectContaining({ code: "INSTANCE_COLOR_LOST" }));
    scene.dispose();
    loader.dispose(asset);
  });
});
