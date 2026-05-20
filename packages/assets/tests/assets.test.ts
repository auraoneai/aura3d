import assert from "node:assert/strict";
import test from "node:test";
import { AssetManager, GLTFLoader, OBJLoader, type AssetLoader } from "../src/index";

test("AssetManager shares duplicate in-flight loads and releases cached handles", async () => {
  let loads = 0;
  let disposes = 0;
  const loader: AssetLoader<{ readonly text: string }> = {
    type: "text",
    canLoad: () => true,
    async load(request) {
      loads += 1;
      await Promise.resolve();
      return { text: request.url };
    },
    dispose() {
      disposes += 1;
    }
  };

  const assets = new AssetManager({ baseUrl: "https://example.test/assets/" });
  assets.register(loader);

  const [a, b] = await Promise.all([assets.load("hero.txt", { type: "text" }), assets.load("hero.txt", { type: "text" })]);
  assert.equal(a, b);
  assert.equal(loads, 1);
  assert.equal(a.refCount, 2);

  await assets.release(a);
  assert.equal(disposes, 0);
  await assets.release(b);
  assert.equal(disposes, 1);
  assert.throws(() => a.value, /disposed/);
});

test("AssetManager retries after failed load instead of poisoning cache", async () => {
  let attempts = 0;
  const loader: AssetLoader<string> = {
    type: "text",
    canLoad: () => true,
    load() {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("boom");
      }
      return "ok";
    }
  };

  const assets = new AssetManager();
  assets.register(loader);

  await assert.rejects(() => assets.load("retry.txt", { type: "text" }), /Failed to load asset/);
  const handle = await assets.load<string>("retry.txt", { type: "text" });
  assert.equal(handle.value, "ok");
  assert.equal(attempts, 2);
});

test("AssetManager releases dependencies through the dependency graph", async () => {
  const disposed: string[] = [];
  const leaf: AssetLoader<string> = {
    type: "leaf",
    canLoad: (request) => request.url.endsWith(".leaf"),
    load: (request) => request.url,
    dispose: (value) => {
      disposed.push(value);
    }
  };
  const parent: AssetLoader<string> = {
    type: "parent",
    canLoad: (request) => request.url.endsWith(".parent"),
    dependencies: () => ["child.leaf"],
    load: (request) => request.url,
    dispose: (value) => {
      disposed.push(value);
    }
  };
  const assets = new AssetManager();
  assets.register(leaf);
  assets.register(parent);

  const handle = await assets.load("root.parent", { type: "parent" });
  await assets.release(handle);

  assert.deepEqual(disposed.sort(), ["child.leaf", "root.parent"]);
});

test("GLTFLoader loads a triangle fixture into geometry and scene data", async () => {
  const buffer = Buffer.alloc(44);
  new Float32Array(buffer.buffer, buffer.byteOffset, 9).set([-0.5, -0.5, 0, 0.5, -0.5, 0, 0, 0.5, 0]);
  new Uint16Array(buffer.buffer, buffer.byteOffset + 36, 3).set([0, 1, 2]);
  const gltf = {
    asset: { version: "2.0" },
    buffers: [{ uri: `data:application/octet-stream;base64,${buffer.toString("base64")}`, byteLength: 44 }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 6 }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" }
    ],
    materials: [{ name: "mat" }],
    meshes: [{ name: "tri", primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    nodes: [{ name: "triangle", mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0
  };
  const url = `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
  const asset = await new GLTFLoader().load({ url }, { throwIfAborted: () => undefined } as never);

  assert.equal(asset.meshes.length, 1);
  assert.equal(asset.meshes[0]?.geometry.vertexCount, 3);
  assert.equal(asset.meshes[0]?.positions.length, 3);
  assert.deepEqual(asset.meshes[0]?.indices, [0, 1, 2]);
  assert.equal(asset.createScene().collectRenderables().length, 1);
});

test("GLTFLoader loads a binary GLB fixture with a BIN chunk", async () => {
  const binary = Buffer.alloc(44);
  new Float32Array(binary.buffer, binary.byteOffset, 9).set([-1, 0, 0, 1, 0, 0, 0, 1, 0]);
  new Uint16Array(binary.buffer, binary.byteOffset + 36, 3).set([0, 1, 2]);
  const gltf = {
    asset: { version: "2.0" },
    buffers: [{ byteLength: 44 }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 6 }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" }
    ],
    meshes: [{ name: "glb-triangle", primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    nodes: [{ name: "glb-node", mesh: 0 }],
    scenes: [{ nodes: [0] }]
  };
  const url = `data:model/gltf-binary;base64,${createGLB(gltf, binary).toString("base64")}`;

  const asset = await new GLTFLoader().load({ url }, { throwIfAborted: () => undefined } as never);

  assert.equal(asset.meshes[0]?.name, "glb-triangle");
  assert.equal(asset.meshes[0]?.geometry.indexCount, 3);
  assert.deepEqual(asset.meshes[0]?.positions[2], [0, 1, 0]);
  assert.equal(asset.createScene().findByName("glb-node").length, 1);
});

test("OBJLoader parses bounded geometry into the glTF render-resource path", async () => {
  const obj = [
    "v -0.5 -0.5 0",
    "v 0.5 -0.5 0",
    "v 0.5 0.5 0",
    "v -0.5 0.5 0",
    "vt 0 0",
    "vt 1 0",
    "vt 1 1",
    "vt 0 1",
    "f 1/1 2/2 3/3 4/4"
  ].join("\n");
  const url = `data:text/plain,${encodeURIComponent(obj)}`;
  const asset = await new OBJLoader().load({ url, type: "obj" }, { throwIfAborted: () => undefined } as never);

  assert.equal(asset.url, url);
  assert.equal(asset.meshes.length, 1);
  assert.equal(asset.meshes[0]?.geometry.vertexCount, 6);
  assert.equal(asset.meshes[0]?.geometry.indexCount, 6);
  assert.equal(asset.meshes[0]?.texcoords.length, 6);
  assert.equal(asset.meshes[0]?.normals.length, 6);
  assert.deepEqual(asset.meshes[0]?.geometry.bounds.min, [-0.5, -0.5, 0]);
  assert.deepEqual(asset.meshes[0]?.geometry.bounds.max, [0.5, 0.5, 0]);
  assert(asset.loaderDiagnostics.features.includes("obj-native-import"));
  assert(asset.loaderDiagnostics.features.includes("obj-generated-normals"));
  assert.equal(asset.createScene().collectRenderables().length, 1);
});

test("OBJLoader preserves mtllib/usemtl material groups through glTF primitives", async () => {
  const obj = [
    "mtllib sample.mtl",
    "v -0.5 -0.5 0",
    "v 0.5 -0.5 0",
    "v 0.5 0.5 0",
    "v -0.5 0.5 0",
    "usemtl amber",
    "f 1 2 3",
    "usemtl blue",
    "f 1 3 4"
  ].join("\n");
  const mtl = [
    "newmtl amber",
    "Kd 1.0 0.62 0.14",
    "Ns 64",
    "newmtl blue",
    "Kd 0.1 0.35 0.9",
    "d 0.75"
  ].join("\n");
  const url = `data:text/plain,${encodeURIComponent(obj)}`;
  const request = { url, type: "obj", materialLibraries: { "sample.mtl": mtl } };
  const asset = await new OBJLoader().load(request, { throwIfAborted: () => undefined } as never);

  assert.equal(asset.materials.length, 2);
  assert.deepEqual(asset.materials.map((material) => material.name), ["amber", "blue"]);
  assert.deepEqual(asset.materials[0]?.baseColorFactor, [1, 0.62, 0.14, 1]);
  assert.deepEqual(asset.materials[1]?.baseColorFactor, [0.1, 0.35, 0.9, 0.75]);
  assert.equal(asset.materials[1]?.alphaMode, "BLEND");
  assert.equal(asset.meshes.length, 2);
  assert.deepEqual(asset.meshes.map((mesh) => mesh.material), ["amber", "blue"]);
  assert(asset.loaderDiagnostics.features.includes("obj-mtllib"));
  assert(asset.loaderDiagnostics.features.includes("obj-multi-material"));
  assert.equal(asset.createScene().collectRenderables().length, 2);
});

test("GLTFLoader extracts material texture metadata and embedded image bytes from GLB", async () => {
  const meshBytes = Buffer.alloc(68);
  new Float32Array(meshBytes.buffer, meshBytes.byteOffset, 9).set([-1, 0, 0, 1, 0, 0, 0, 1, 0]);
  new Uint16Array(meshBytes.buffer, meshBytes.byteOffset + 36, 3).set([0, 1, 2]);
  new Float32Array(meshBytes.buffer, meshBytes.byteOffset + 44, 6).set([0, 0, 1, 0, 0.5, 1]);
  const imageBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const binary = Buffer.concat([meshBytes, imageBytes]);
  const gltf = {
    asset: { version: "2.0" },
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 6 },
      { buffer: 0, byteOffset: 44, byteLength: 24 },
      { buffer: 0, byteOffset: 68, byteLength: imageBytes.byteLength }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" },
      { bufferView: 2, componentType: 5126, count: 3, type: "VEC2" }
    ],
    images: [{ name: "embedded-base-color", bufferView: 3, mimeType: "image/png" }],
    samplers: [{ name: "linear-repeat", magFilter: 9729, minFilter: 9729, wrapS: 10497, wrapT: 10497 }],
    textures: [{ name: "base-color-texture", source: 0, sampler: 0 }],
    materials: [
      {
        name: "pbr-material",
        pbrMetallicRoughness: {
          baseColorFactor: [0.25, 0.5, 0.75, 1],
          baseColorTexture: { index: 0, texCoord: 1 },
          metallicFactor: 0.2,
          roughnessFactor: 0.8
        },
        doubleSided: true
      }
    ],
    meshes: [{ name: "textured-triangle", primitives: [{ attributes: { POSITION: 0, TEXCOORD_1: 2 }, indices: 1, material: 0 }] }],
    nodes: [{ name: "textured-node", mesh: 0 }],
    scenes: [{ nodes: [0] }]
  };
  const url = `data:model/gltf-binary;base64,${createGLB(gltf, binary).toString("base64")}`;

  const asset = await new GLTFLoader().load({ url }, { throwIfAborted: () => undefined } as never);

  assert.equal(asset.images[0]?.mimeType, "image/png");
  assert.deepEqual([...new Uint8Array(asset.images[0]?.data ?? new ArrayBuffer(0))], [...imageBytes]);
  assert.deepEqual(asset.materials[0]?.baseColorTexture, { texture: 0, image: 0, texCoord: 1 });
  assert.equal(asset.meshes[0]?.material, "pbr-material");
});

test("GLTFLoader rejects missing material texture references", async () => {
  const buffer = Buffer.alloc(36);
  new Float32Array(buffer.buffer, buffer.byteOffset, 9).set([-1, 0, 0, 1, 0, 0, 0, 1, 0]);
  const gltf = {
    asset: { version: "2.0" },
    buffers: [{ uri: `data:application/octet-stream;base64,${buffer.toString("base64")}`, byteLength: 36 }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 4 } } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }]
  };
  const url = `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;

  await assert.rejects(
    () => new GLTFLoader().load({ url }, { throwIfAborted: () => undefined } as never),
    /baseColorTexture references missing texture 4/
  );
});

function createGLB(json: unknown, binary: Buffer): Buffer {
  const jsonBytes = pad4(Buffer.from(JSON.stringify(json), "utf8"), 0x20);
  const binaryBytes = pad4(binary, 0);
  const totalLength = 12 + 8 + jsonBytes.byteLength + 8 + binaryBytes.byteLength;
  const glb = Buffer.alloc(totalLength);
  let offset = 0;
  glb.writeUInt32LE(0x46546c67, offset);
  offset += 4;
  glb.writeUInt32LE(2, offset);
  offset += 4;
  glb.writeUInt32LE(totalLength, offset);
  offset += 4;
  glb.writeUInt32LE(jsonBytes.byteLength, offset);
  offset += 4;
  glb.writeUInt32LE(0x4e4f534a, offset);
  offset += 4;
  jsonBytes.copy(glb, offset);
  offset += jsonBytes.byteLength;
  glb.writeUInt32LE(binaryBytes.byteLength, offset);
  offset += 4;
  glb.writeUInt32LE(0x004e4942, offset);
  offset += 4;
  binaryBytes.copy(glb, offset);
  return glb;
}

function pad4(buffer: Buffer, fill: number): Buffer {
  const remainder = buffer.byteLength % 4;
  if (remainder === 0) return buffer;
  return Buffer.concat([buffer, Buffer.alloc(4 - remainder, fill)]);
}
