import assert from "node:assert/strict";
import { test } from "vitest";
import { Ray, Vector3 } from "@galileo3d/math";
import { DirectionalLight, OrthographicCamera, PerspectiveCamera, PointLight, Scene, SpotLight } from "@galileo3d/scene";
import {
  AssetLoadError,
  AssetManager,
  GLTFLoader,
  ImportPipeline,
  ImportPipelineError,
  MaterialLoader,
  SceneLoader,
  ShaderLoader,
  WorkerAssetJobs,
  createGLTFRenderResources,
  createMeshOptimizationStage,
  createTextureMipGenerationStage,
  generateTextureMipChain,
  optimizeIndexedMesh,
  type AssetLoadProgress,
  type AssetLoader,
  type GLTFAsset,
  type GLTFDracoDecoder,
  type GLTFMeshoptDecoder
} from "@galileo3d/assets";
import { DEFAULT_PBR_ENVIRONMENT_INTENSITY, InstancedPBRMaterial, InstancedUnlitMaterial, PBRMaterial, TextureBinding, UnlitMaterial } from "@galileo3d/rendering";
import { InputSnapshot, InteractionSystem, pickingRayFromCamera } from "@galileo3d/input";
import { AudioListener, SceneAudioBridge } from "@galileo3d/audio";
import { CommandHistory, DeleteNodeCommand, PickingService, TranslateGizmo, type Command } from "@galileo3d/editor-runtime";

test("workstream5 asset manager releases dependencies through dependency graph", async () => {
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

test("workstream5 asset manager shares duplicate in-flight loads and cached results", async () => {
  let loads = 0;
  const loader: AssetLoader<{ readonly url: string }> = {
    type: "text",
    canLoad: (request) => request.type === "text",
    async load(request) {
      loads += 1;
      await Promise.resolve();
      return { url: request.url };
    }
  };
  const assets = new AssetManager({ baseUrl: "https://cdn.example/assets/" });
  assets.register(loader);

  const [first, second] = await Promise.all([
    assets.load("hero.txt", { type: "text" }),
    assets.load("hero.txt", { type: "text" })
  ]);
  const cached = await assets.load("hero.txt", { type: "text" });

  assert.equal(first, second);
  assert.equal(first, cached);
  assert.equal(loads, 1);
  assert.equal(first.refCount, 3);
  assert.equal(first.url, "https://cdn.example/assets/hero.txt");

  await assets.release(first);
  await assets.release(second);
  await assets.release(cached);
});

test("workstream5 asset manager reports typed dependency-chain load errors", async () => {
  const parent: AssetLoader<string> = {
    type: "parent",
    canLoad: (request) => request.url.endsWith(".parent"),
    dependencies: () => ["missing.leaf"],
    load: () => "parent"
  };
  const leaf: AssetLoader<string> = {
    type: "leaf",
    canLoad: (request) => request.url.endsWith(".leaf"),
    load: () => {
      throw new Error("missing dependency bytes");
    }
  };
  const assets = new AssetManager();
  assets.register(parent);
  assets.register(leaf);

  await assert.rejects(
    () => assets.load("root.parent", { type: "parent" }),
    (error: unknown) => {
      assert.ok(error instanceof AssetLoadError);
      assert.equal(error.url, "missing.leaf");
      assert.deepEqual(error.dependencyChain, ["root.parent", "missing.leaf"]);
      assert.match(String(error.cause), /missing dependency bytes/);
      return true;
    }
  );
});

test("workstream5 asset manager releases loaded dependencies when a composite asset fails", async () => {
  const disposed: string[] = [];
  const leaf: AssetLoader<{ readonly url: string }> = {
    type: "leaf",
    canLoad: (request) => request.url.endsWith(".leaf"),
    load: (request) => ({ url: request.url }),
    dispose: (value) => {
      disposed.push(value.url);
    }
  };
  const parent: AssetLoader<string> = {
    type: "parent",
    canLoad: (request) => request.url.endsWith(".parent"),
    dependencies: () => ["first.leaf", "second.leaf"],
    load: () => {
      throw new Error("parent decode failed");
    }
  };
  const assets = new AssetManager();
  assets.register(leaf);
  assets.register(parent);

  await assert.rejects(
    () => assets.load("root.parent", { type: "parent" }),
    (error: unknown) => {
      assert.ok(error instanceof AssetLoadError);
      assert.equal(error.url, "root.parent");
      assert.match(String(error.cause), /parent decode failed/);
      return true;
    }
  );

  assert.deepEqual(disposed.sort(), ["first.leaf", "second.leaf"]);
  assert.deepEqual(assets.cache.keys(), []);
});

test("workstream5 asset manager retries transient loader failures without caching failed handles", async () => {
  let attempts = 0;
  const loader: AssetLoader<{ readonly attempt: number }> = {
    type: "text",
    canLoad: (request) => request.type === "text",
    load: () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error(`transient-${attempts}`);
      }
      return { attempt: attempts };
    }
  };
  const assets = new AssetManager({ retries: 2 });
  assets.register(loader);

  const handle = await assets.load<{ readonly attempt: number }>("retry.txt", { type: "text" });

  assert.equal(handle.value.attempt, 3);
  assert.equal(attempts, 3);
  assert.deepEqual(assets.cache.keys(), ["text:retry.txt"]);

  await assets.release(handle);
});

test("workstream5 asset manager keeps failed loads retryable and respects in-flight caller cancellation", async () => {
  let attempts = 0;
  const loader: AssetLoader<{ readonly url: string; readonly attempt: number }> = {
    type: "text",
    canLoad: (request) => request.type === "text",
    async load(request) {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("first request failed");
      }
      await Promise.resolve();
      return { url: request.url, attempt: attempts };
    }
  };
  const assets = new AssetManager();
  assets.register(loader);

  await assert.rejects(
    () => assets.load("recover.txt", { type: "text" }),
    (error: unknown) => {
      assert.ok(error instanceof AssetLoadError);
      assert.match(String(error.cause), /first request failed/);
      return true;
    }
  );

  const recovered = await assets.load<{ readonly url: string; readonly attempt: number }>("recover.txt", { type: "text" });
  assert.equal(recovered.value.attempt, 2);
  await assets.release(recovered);

  let resolveShared!: (value: { readonly url: string; readonly attempt: number }) => void;
  const sharedLoader: AssetLoader<{ readonly url: string; readonly attempt: number }> = {
    type: "shared",
    canLoad: (request) => request.type === "shared",
    load: (request) =>
      new Promise((resolve) => {
        resolveShared = () => resolve({ url: request.url, attempt: 1 });
      })
  };
  const sharedAssets = new AssetManager();
  sharedAssets.register(sharedLoader);
  const controller = new AbortController();
  const first = sharedAssets.load<{ readonly url: string; readonly attempt: number }>("shared.txt", { type: "shared" });
  const second = sharedAssets.load<{ readonly url: string; readonly attempt: number }>("shared.txt", {
    type: "shared",
    signal: controller.signal
  });

  controller.abort("cancel second waiter");

  await assert.rejects(
    () => second,
    (error: unknown) => {
      assert.ok(error instanceof AssetLoadError);
      assert.equal(error.url, "shared.txt");
      assert.match(String(error.cause), /cancel second waiter/);
      return true;
    }
  );

  resolveShared({ url: "shared.txt", attempt: 1 });
  const firstHandle = await first;
  assert.equal(firstHandle.value.url, "shared.txt");

  const cached = await sharedAssets.load("shared.txt", { type: "shared" });
  assert.equal(cached, firstHandle);
  assert.equal(firstHandle.refCount, 2);
  await sharedAssets.release(firstHandle);
  await sharedAssets.release(cached);
});

test("workstream5 GLTFLoader loads triangle mesh and creates scene renderable", async () => {
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

  assert.equal(asset.meshes[0]?.geometry.vertexCount, 3);
  assert.equal(asset.meshes[0]?.positions.length, 3);
  assert.deepEqual(asset.meshes[0]?.indices, [0, 1, 2]);
  assert.equal(asset.createScene().collectRenderables().length, 1);
});

test("workstream5 GLTFLoader marks released glTF assets disposed and blocks stale scene access", async () => {
  const buffer = Buffer.alloc(36);
  new Float32Array(buffer.buffer, buffer.byteOffset, 9).set([-0.5, -0.5, 0, 0.5, -0.5, 0, 0, 0.5, 0]);
  const gltf = {
    asset: { version: "2.0" },
    buffers: [{ uri: `data:application/octet-stream;base64,${buffer.toString("base64")}`, byteLength: buffer.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: buffer.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }],
    meshes: [{ name: "lifecycle-triangle", primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ name: "lifecycle-node", mesh: 0 }],
    scenes: [{ nodes: [0] }]
  };
  const assets = new AssetManager();
  assets.register(new GLTFLoader());

  const handle = await assets.load<GLTFAsset>(`data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`, { type: "gltf" });
  const asset = handle.value;

  assert.equal(asset.disposed, false);
  assert.equal(asset.createScene().collectRenderables().length, 1);

  await assets.release(handle);

  assert.equal(asset.disposed, true);
  assert.throws(() => asset.createScene(), /has been disposed/);
  assert.throws(() => asset.toJSON(), /has been disposed/);
  assert.throws(() => handle.value, /has been disposed/);
});

test("workstream5 GLTFLoader imports POINTS primitives into render-resource point topology", async () => {
  const buffer = Buffer.alloc(36);
  new Float32Array(buffer.buffer, buffer.byteOffset, 9).set([-0.75, -0.5, 0, 0, 0.5, 0, 0.75, -0.5, 0]);
  const gltf = {
    asset: { version: "2.0" },
    buffers: [{ uri: `data:application/octet-stream;base64,${buffer.toString("base64")}`, byteLength: 36 }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }],
    materials: [{ name: "point-material", extensions: { KHR_materials_unlit: {} } }],
    meshes: [{ name: "point-cloud", primitives: [{ attributes: { POSITION: 0 }, material: 0, mode: 0 }] }],
    nodes: [{ name: "points", mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0
  };

  const asset = await new GLTFLoader().load(
    { url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}` },
    { throwIfAborted: () => undefined } as never
  );
  const resources = await createGLTFRenderResources(asset);
  const geometry = resources.geometryLibrary.get("point-cloud");

  assert.equal(asset.meshes[0]?.topology, "points");
  assert.equal(asset.meshes[0]?.geometry.vertexCount, 3);
  assert.equal(asset.meshes[0]?.indices, undefined);
  assert.equal(asset.createScene().collectRenderables()[0]?.renderable.geometry, "point-cloud");
  assert.equal(geometry?.topology, "points");
  assert.equal(geometry?.vertexBuffer.vertexCount, 3);
  assert.deepEqual(resources.bounds, { min: [-0.75, -0.5, 0], max: [0.75, 0.5, 0] });
  const frame = resources.createCameraFrame({ width: 16, height: 9 }, { paddingRatio: 0.1 });
  assert.deepEqual(frame.center.map((value) => Number(value.toFixed(3))), [0, 0, 0]);
  assert.equal(frame.aspect, 16 / 9);
  assert.ok(frame.cameraPosition[2] > 1);
  assert.ok(frame.far > frame.near);

  resources.dispose();
});

test("workstream5 GLTFLoader imports EXT_mesh_gpu_instancing into scene renderables", async () => {
  const positions = floatBytes([-0.5, -0.5, 0, 0.5, -0.5, 0, 0, 0.5, 0]);
  const translations = floatBytes([-0.25, 0, 0, 0.25, 0, 0]);
  const binary = Buffer.concat([positions, translations]);
  const gltf = {
    asset: { version: "2.0" },
    extensionsRequired: ["EXT_mesh_gpu_instancing"],
    buffers: [{ uri: `data:application/octet-stream;base64,${binary.toString("base64")}`, byteLength: binary.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: translations.byteLength }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 1, componentType: 5126, count: 2, type: "VEC3" }
    ],
    materials: [{ name: "instanced-material", extensions: { KHR_materials_unlit: {} } }],
    meshes: [{ name: "instanced-triangle", primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    nodes: [{
      name: "instanced-node",
      mesh: 0,
      extensions: { EXT_mesh_gpu_instancing: { attributes: { TRANSLATION: 1 } } }
    }],
    scenes: [{ nodes: [0] }],
    scene: 0
  };

  const asset = await new GLTFLoader().load(
    { url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}` },
    { throwIfAborted: () => undefined } as never
  );
  const renderable = asset.createScene().collectRenderables()[0]?.renderable;
  const resources = await createGLTFRenderResources(asset);

  assert.ok(renderable?.instanceTransforms instanceof Float32Array);
  assert.equal(renderable.instanceTransforms.length, 32);
  assert.deepEqual(Array.from(renderable.instanceTransforms.slice(12, 16)), [-0.25, 0, 0, 1]);
  assert.deepEqual(Array.from(renderable.instanceTransforms.slice(28, 32)), [0.25, 0, 0, 1]);
  assert.ok(resources.materialLibrary.get("instanced-material") instanceof InstancedUnlitMaterial);
  resources.dispose();

  const defaultMaterialGltf = JSON.parse(JSON.stringify(gltf)) as { materials?: unknown; meshes: Array<{ primitives: Array<{ material?: number }> }> };
  delete defaultMaterialGltf.materials;
  delete defaultMaterialGltf.meshes[0]!.primitives[0]!.material;
  const defaultMaterialAsset = await new GLTFLoader().load(
    { url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(defaultMaterialGltf))}` },
    { throwIfAborted: () => undefined } as never
  );
  const defaultMaterialResources = await createGLTFRenderResources(defaultMaterialAsset);
  const defaultInstancedMaterial = defaultMaterialResources.materialLibrary.get("default-material");
  assert.ok(defaultInstancedMaterial instanceof InstancedPBRMaterial);
  assert.equal(defaultInstancedMaterial?.getParameter("u_metallic"), 0);
  assert.equal(defaultInstancedMaterial?.getParameter("u_roughness"), 1);
  assert.equal(defaultInstancedMaterial?.getParameter("u_environmentIntensity"), DEFAULT_PBR_ENVIRONMENT_INTENSITY);
  defaultMaterialResources.dispose();

  const mismatched = structuredClone(gltf) as typeof gltf & { accessors: Array<Record<string, unknown>> };
  mismatched.accessors.push({ bufferView: 1, componentType: 5126, count: 1, type: "VEC3" });
  (mismatched.nodes[0]!.extensions.EXT_mesh_gpu_instancing.attributes as Record<string, number>).SCALE = 2;
  await assert.rejects(
    () => new GLTFLoader().load(
      { url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(mismatched))}` },
      { throwIfAborted: () => undefined } as never
    ),
    /EXT_mesh_gpu_instancing SCALE count must match instance count/
  );
});

test("workstream5 GLTFLoader preserves all primitives for a multi-primitive glTF mesh node", async () => {
  const buffer = Buffer.alloc(72);
  new Float32Array(buffer.buffer, buffer.byteOffset, 18).set([
    -1, -1, 0,
    0, -1, 0,
    -0.5, 0, 0,
    0, 0, 0,
    1, 0, 0,
    0.5, 1, 0
  ]);
  const gltf = {
    asset: { version: "2.0" },
    buffers: [{ uri: `data:application/octet-stream;base64,${buffer.toString("base64")}`, byteLength: buffer.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 36 }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" }
    ],
    materials: [{ name: "left-mat" }, { name: "right-mat" }],
    meshes: [
      {
        name: "two-part-mesh",
        primitives: [
          { attributes: { POSITION: 0 }, material: 0 },
          { attributes: { POSITION: 1 }, material: 1 }
        ]
      }
    ],
    nodes: [{ name: "multi-primitive-node", mesh: 0, translation: [3, 0, 0] }],
    scenes: [{ nodes: [0] }],
    scene: 0
  };
  const asset = await new GLTFLoader().load(
    { url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}` },
    { throwIfAborted: () => undefined } as never
  );
  const scene = asset.createScene();
  const renderables = scene.collectRenderables();
  const parent = scene.findByName("multi-primitive-node")[0];

  assert.deepEqual(asset.meshes.map((mesh) => mesh.name), ["two-part-mesh-primitive-0", "two-part-mesh-primitive-1"]);
  assert.deepEqual(asset.meshes.map((mesh) => mesh.sourceMeshIndex), [0, 0]);
  assert.deepEqual(asset.meshes.map((mesh) => mesh.primitiveIndex), [0, 1]);
  assert.equal(renderables.length, 2);
  assert.equal(parent?.children.length, 2);
  assert.deepEqual(renderables.map((entry) => entry.renderable.geometry).sort(), ["two-part-mesh-primitive-0", "two-part-mesh-primitive-1"]);
  assert.deepEqual(renderables.map((entry) => entry.renderable.material).sort(), ["left-mat", "right-mat"]);
  assert.deepEqual(parent?.transform.position, [3, 0, 0]);
  assert.equal(asset.toJSON().meshes[1]?.primitiveIndex, 1);

  const missingMesh = structuredClone(gltf) as typeof gltf;
  missingMesh.nodes[0]!.mesh = 9;
  const missingAsset = await new GLTFLoader().load(
    { url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(missingMesh))}` },
    { throwIfAborted: () => undefined } as never
  );
  assert.throws(() => missingAsset.createScene(), /missing mesh 9/);
});

test("workstream5 GLTFLoader preserves and selects named glTF scenes", async () => {
  const positions = floatBytes([-1, 0, 0, 1, 0, 0, 0, 1, 0]);
  const gltf = {
    asset: { version: "2.0" },
    buffers: [{ uri: `data:application/octet-stream;base64,${positions.toString("base64")}`, byteLength: positions.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }],
    materials: [{ name: "left-material" }, { name: "right-material" }],
    meshes: [
      { name: "left-mesh", primitives: [{ attributes: { POSITION: 0 }, material: 0 }] },
      { name: "right-mesh", primitives: [{ attributes: { POSITION: 0 }, material: 1 }] }
    ],
    nodes: [
      { name: "left-node", mesh: 0 },
      { name: "right-node", mesh: 1 }
    ],
    scenes: [
      { name: "left-scene", nodes: [0] },
      { name: "right-scene", nodes: [1] }
    ],
    scene: 1
  };
  const asset = await new GLTFLoader().load(
    { url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}` },
    { throwIfAborted: () => undefined } as never
  );

  assert.equal(asset.defaultScene, 1);
  assert.deepEqual(asset.scenes, [
    { name: "left-scene", nodeIndices: [0] },
    { name: "right-scene", nodeIndices: [1] }
  ]);
  assert.equal(asset.createScene().collectRenderables()[0]?.renderable.material, "right-material");
  assert.equal(asset.createScene({ sceneIndex: 0 }).collectRenderables()[0]?.renderable.material, "left-material");
  assert.equal(asset.createScene({ sceneName: "right-scene" }).collectRenderables()[0]?.renderable.material, "right-material");
  assert.deepEqual(asset.toJSON().scenes, [
    { name: "left-scene", nodeIndices: [0] },
    { name: "right-scene", nodeIndices: [1] }
  ]);
  assert.equal(asset.toJSON().defaultScene, 1);

  const resources = await createGLTFRenderResources(asset, { sceneName: "left-scene" });
  assert.equal(resources.scene.collectRenderables()[0]?.renderable.material, "left-material");

  assert.throws(() => asset.createScene({ sceneName: "missing-scene" }), /scene named missing-scene is not defined/);
  assert.throws(() => asset.createScene({ sceneIndex: 9 }), /scene 9 is missing/);
  assert.throws(() => asset.createScene({ sceneIndex: 0, sceneName: "left-scene" }), /cannot specify both/);
});

test("workstream5 GLTFLoader distinguishes default materials from explicit material references", async () => {
  const buffer = floatBytes([-1, 0, 0, 1, 0, 0, 0, 1, 0]);
  const base = {
    asset: { version: "2.0" },
    buffers: [{ uri: `data:application/octet-stream;base64,${buffer.toString("base64")}`, byteLength: buffer.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: buffer.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }],
    materials: [{ name: "authored-material" }],
    meshes: [{ name: "default-material-triangle", primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ name: "default-material-node", mesh: 0 }],
    scenes: [{ nodes: [0] }]
  };
  const asset = await new GLTFLoader().load(
    { url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(base))}` },
    { throwIfAborted: () => undefined } as never
  );

  assert.equal(asset.meshes[0]?.material, "default-material");
  assert.equal(asset.meshes[0]?.materialIndex, undefined);
  assert.equal(asset.createScene().collectRenderables()[0]?.renderable.material, "default-material");
  const resources = await createGLTFRenderResources(asset);
  assert.ok(resources.materialLibrary.has("authored-material"));
  assert.ok(resources.materialLibrary.has("default-material"));
  const defaultMaterial = resources.materialLibrary.get("default-material");
  assert.equal(defaultMaterial?.getParameter("u_metallic"), 0);
  assert.equal(defaultMaterial?.getParameter("u_roughness"), 1);
  assert.equal(defaultMaterial?.getParameter("u_environmentIntensity"), DEFAULT_PBR_ENVIRONMENT_INTENSITY);
  resources.dispose();

  const invalid = structuredClone(base) as typeof base;
  (invalid.meshes[0]!.primitives[0]! as { material?: number }).material = 9;
  await assert.rejects(
    () => new GLTFLoader().load(
      { url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(invalid))}` },
      { throwIfAborted: () => undefined } as never
    ),
    /references missing material 9/
  );
});

test("workstream5 GLTFLoader preserves and validates KHR_materials_variants metadata", async () => {
  const buffer = floatBytes([-1, 0, 0, 1, 0, 0, 0, 1, 0]);
  const gltf = {
    asset: { version: "2.0" },
    extensionsUsed: ["KHR_materials_variants"],
    extensionsRequired: ["KHR_materials_variants"],
    extensions: {
      KHR_materials_variants: {
        variants: [{ name: "red" }, { name: "blue" }]
      }
    },
    buffers: [{ uri: `data:application/octet-stream;base64,${buffer.toString("base64")}`, byteLength: buffer.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: buffer.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }],
    materials: [{ name: "base" }, { name: "red-material" }, { name: "blue-material" }],
    meshes: [
      {
        name: "variant-triangle",
        primitives: [
          {
            attributes: { POSITION: 0 },
            material: 0,
            extensions: {
              KHR_materials_variants: {
                mappings: [
                  { material: 1, variants: [0] },
                  { material: 2, variants: [1] }
                ]
              }
            }
          }
        ]
      }
    ],
    nodes: [{ name: "variant-node", mesh: 0 }],
    scenes: [{ nodes: [0] }]
  };
  const asset = await new GLTFLoader().load(
    { url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}` },
    { throwIfAborted: () => undefined } as never
  );

  assert.deepEqual(asset.materialVariants, [{ name: "red" }, { name: "blue" }]);
  assert.deepEqual(asset.meshes[0]?.materialVariants, [
    { variantIndex: 0, variant: "red", materialIndex: 1, material: "red-material" },
    { variantIndex: 1, variant: "blue", materialIndex: 2, material: "blue-material" }
  ]);
  assert.deepEqual(asset.toJSON().materialVariants, [{ name: "red" }, { name: "blue" }]);
  assert.equal(asset.toJSON().meshes[0]?.materialVariants[1]?.material, "blue-material");
  assert.equal(asset.createScene().collectRenderables()[0]?.renderable.material, "base");
  assert.equal(asset.createScene({ materialVariant: "red" }).collectRenderables()[0]?.renderable.material, "red-material");
  assert.equal(asset.createScene({ materialVariant: "blue" }).collectRenderables()[0]?.renderable.material, "blue-material");
  assert.throws(() => asset.createScene({ materialVariant: "green" }), /material variant green is not defined/);
  const blueResources = await createGLTFRenderResources(asset, { materialVariant: "blue" });
  assert.equal(blueResources.scene.collectRenderables()[0]?.renderable.material, "blue-material");
  assert.deepEqual(blueResources.renderableBindings[0]?.materialVariants, [
    { variantIndex: 0, variant: "red", materialIndex: 1, material: "red-material" },
    { variantIndex: 1, variant: "blue", materialIndex: 2, material: "blue-material" }
  ]);
  const blueTargets = blueResources.collectMaterialOverrideTargets({ variant: "blue" });
  assert.equal(blueTargets.length, 1);
  assert.equal(blueTargets[0]?.nodeName, "variant-node");
  assert.equal(blueTargets[0]?.materialKey, "blue-material");
  assert.equal(blueTargets[0]?.sourceMaterialName, "blue-material");
  assert.equal(blueTargets[0]?.material, blueResources.materialLibrary.get("blue-material"));
  assert.equal(blueResources.collectMaterialOverrideTargets({ variant: "red" }).length, 1);
  assert.equal(blueResources.collectMaterialOverrideTargets({ variant: "green" }).length, 0);
  blueResources.dispose();
  await assert.rejects(
    () => createGLTFRenderResources(asset, { materialVariant: "green" }),
    /material variant green is not defined/
  );

  const invalidMaterial = structuredClone(gltf) as typeof gltf;
  invalidMaterial.meshes[0]!.primitives[0]!.extensions.KHR_materials_variants.mappings[0]!.material = 9;
  await assert.rejects(
    () => new GLTFLoader().load(
      { url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(invalidMaterial))}` },
      { throwIfAborted: () => undefined } as never
    ),
    /KHR_materials_variants mapping 0 references missing material 9/
  );

  const invalidVariant = structuredClone(gltf) as typeof gltf;
  invalidVariant.meshes[0]!.primitives[0]!.extensions.KHR_materials_variants.mappings[0]!.variants = [4];
  await assert.rejects(
    () => new GLTFLoader().load(
      { url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(invalidVariant))}` },
      { throwIfAborted: () => undefined } as never
    ),
    /KHR_materials_variants mapping 0 references missing variant 4/
  );
});

test("workstream5 GLTFLoader rejects malformed mesh primitive descriptors", async () => {
  const buffer = floatBytes([-1, 0, 0, 1, 0, 0, 0, 1, 0]);
  const base = {
    asset: { version: "2.0" },
    buffers: [{ uri: `data:application/octet-stream;base64,${buffer.toString("base64")}`, byteLength: buffer.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: buffer.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }],
    meshes: [{ name: "descriptor-triangle", primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ name: "descriptor-node", mesh: 0 }],
    scenes: [{ nodes: [0] }]
  };
  type MutablePrimitiveGLTF = typeof base & {
    meshes: [{
      primitives?: unknown;
    }];
  };
  const cases: readonly [string, (gltf: MutablePrimitiveGLTF) => void, RegExp][] = [
    ["missing primitives", (gltf) => { delete gltf.meshes[0]!.primitives; }, /primitives must be a non-empty array/],
    ["empty primitives", (gltf) => { gltf.meshes[0]!.primitives = []; }, /primitives must be a non-empty array/],
    ["missing attributes", (gltf) => { (gltf.meshes[0]!.primitives as Array<Record<string, unknown>>)[0] = {}; }, /attributes must be an object/],
    ["array attributes", (gltf) => { (gltf.meshes[0]!.primitives as Array<Record<string, unknown>>)[0] = { attributes: [] }; }, /attributes must be an object/],
    ["negative position accessor", (gltf) => { (gltf.meshes[0]!.primitives as Array<{ attributes: { POSITION: number } }>)[0]!.attributes.POSITION = -1; }, /attribute POSITION accessor/],
    ["fractional normal accessor", (gltf) => { (gltf.meshes[0]!.primitives as Array<{ attributes: { POSITION: number; NORMAL?: number } }>)[0]!.attributes.NORMAL = 0.5; }, /attribute NORMAL accessor/],
    ["fractional indices accessor", (gltf) => { (gltf.meshes[0]!.primitives as Array<{ indices?: number }>)[0]!.indices = 0.5; }, /indices accessor/],
    ["fractional mode", (gltf) => { (gltf.meshes[0]!.primitives as Array<{ mode?: number }>)[0]!.mode = 4.5; }, /mode must be a non-negative integer/]
  ];

  for (const [name, mutate, message] of cases) {
    const gltf = structuredClone(base) as MutablePrimitiveGLTF;
    mutate(gltf);
    await assert.rejects(
      () => new GLTFLoader().load(
        { url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}` },
        { throwIfAborted: () => undefined } as never
      ),
      message,
      name
    );
  }
});

test("workstream5 GLTFLoader respects glTF primitive modes for points, lines, and expanded triangle fans", async () => {
  const buffer = Buffer.alloc(84);
  new Float32Array(buffer.buffer, buffer.byteOffset, 21).set([
    0, 0, 0,
    1, 0, 0,
    1, 1, 0,
    -1, -1, 0,
    1, -1, 0,
    1, 1, 0,
    -1, 1, 0
  ]);
  const gltf = {
    asset: { version: "2.0" },
    buffers: [{ uri: `data:application/octet-stream;base64,${buffer.toString("base64")}`, byteLength: buffer.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 48 }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 1, componentType: 5126, count: 4, type: "VEC3" }
    ],
    meshes: [
      { name: "line-strip", primitives: [{ attributes: { POSITION: 0 }, mode: 3 }] },
      { name: "triangle-fan", primitives: [{ attributes: { POSITION: 1 }, mode: 6 }] }
    ],
    nodes: [{ mesh: 0 }, { mesh: 1 }],
    scenes: [{ nodes: [0, 1] }]
  };
  const asset = await new GLTFLoader().load(
    { url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}` },
    { throwIfAborted: () => undefined } as never
  );
  const resources = await createGLTFRenderResources(asset);

  assert.equal(asset.meshes[0]?.topology, "lines");
  assert.deepEqual(asset.meshes[0]?.indices, [0, 1, 1, 2]);
  assert.equal(asset.meshes[1]?.topology, "triangles");
  assert.deepEqual(asset.meshes[1]?.indices, [0, 1, 2, 0, 2, 3]);
  assert.equal(resources.geometryLibrary.get("line-strip")?.topology, "lines");
  assert.equal(resources.geometryLibrary.get("triangle-fan")?.indexBuffer?.count, 6);
  resources.dispose();

  const pointsGltf = structuredClone(gltf) as typeof gltf;
  pointsGltf.meshes[0]!.primitives[0]!.mode = 0;
  const pointsAsset = await new GLTFLoader().load(
    { url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(pointsGltf))}` },
    { throwIfAborted: () => undefined } as never
  );
  const pointResources = await createGLTFRenderResources(pointsAsset);

  assert.equal(pointsAsset.meshes[0]?.topology, "points");
  assert.equal(pointsAsset.meshes[0]?.indices, undefined);
  assert.equal(pointResources.geometryLibrary.get("line-strip")?.topology, "points");
  pointResources.dispose();
});

test("workstream5 GLTFLoader preserves glTF tangents through render resources", async () => {
  const buffer = Buffer.alloc(144);
  new Float32Array(buffer.buffer, buffer.byteOffset, 9).set([-0.5, -0.5, 0, 0.5, -0.5, 0, 0, 0.5, 0]);
  new Float32Array(buffer.buffer, buffer.byteOffset + 36, 9).set([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  new Float32Array(buffer.buffer, buffer.byteOffset + 72, 6).set([0, 0, 1, 0, 0.5, 1]);
  new Float32Array(buffer.buffer, buffer.byteOffset + 96, 12).set([1, 0, 0, 1, 0, 1, 0, -1, -1, 0, 0, 1]);
  const gltf = {
    asset: { version: "2.0" },
    buffers: [{ uri: `data:application/octet-stream;base64,${buffer.toString("base64")}`, byteLength: buffer.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 36 },
      { buffer: 0, byteOffset: 72, byteLength: 24 },
      { buffer: 0, byteOffset: 96, byteLength: 48 }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 2, componentType: 5126, count: 3, type: "VEC2" },
      { bufferView: 3, componentType: 5126, count: 3, type: "VEC4" }
    ],
    meshes: [{ name: "tangent-triangle", primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2, TANGENT: 3 } }] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }]
  };
  const asset = await new GLTFLoader().load(
    { url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}` },
    { throwIfAborted: () => undefined } as never
  );
  const resources = await createGLTFRenderResources(asset);
  const geometry = resources.geometryLibrary.get("tangent-triangle");

  assert.deepEqual(asset.meshes[0]?.tangents[1], [0, 1, 0, -1]);
  assert.deepEqual(geometry?.vertexBuffer.getAttribute(1, "tangent"), [0, 1, 0, -1]);
  assert.deepEqual(asset.toJSON().meshes[0]?.tangents[2], [-1, 0, 0, 1]);
  resources.dispose();

  const invalid = structuredClone(gltf) as typeof gltf;
  invalid.accessors[3]!.count = 2;
  await assert.rejects(
    () => new GLTFLoader().load(
      { url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(invalid))}` },
      { throwIfAborted: () => undefined } as never
    ),
    /TANGENT count mismatch/
  );
});

test("workstream5 GLTFLoader preserves glTF vertex colors through render resources", async () => {
  const buffer = Buffer.alloc(108);
  new Float32Array(buffer.buffer, buffer.byteOffset, 9).set([-0.5, -0.5, 0, 0.5, -0.5, 0, 0, 0.5, 0]);
  new Float32Array(buffer.buffer, buffer.byteOffset + 36, 12).set([1, 0, 0, 1, 0, 1, 0, 0.75, 0, 0, 1, 0.5]);
  new Float32Array(buffer.buffer, buffer.byteOffset + 84, 6).set([0, 0, 1, 0, 0.5, 1]);
  const gltf = {
    asset: { version: "2.0" },
    buffers: [{ uri: `data:application/octet-stream;base64,${buffer.toString("base64")}`, byteLength: buffer.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 48 },
      { buffer: 0, byteOffset: 84, byteLength: 24 }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC4" },
      { bufferView: 2, componentType: 5126, count: 3, type: "VEC2" }
    ],
    meshes: [{ name: "colored-triangle", primitives: [{ attributes: { POSITION: 0, COLOR_0: 1, TEXCOORD_0: 2 } }] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }]
  };
  const asset = await new GLTFLoader().load(
    { url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}` },
    { throwIfAborted: () => undefined } as never
  );
  const resources = await createGLTFRenderResources(asset);
  const geometry = resources.geometryLibrary.get("colored-triangle");

  assert.deepEqual(asset.meshes[0]?.colors[1], [0, 1, 0, 0.75]);
  assert.equal(geometry?.vertexBuffer.format.hasAttribute("color"), true);
  assert.deepEqual(geometry?.vertexBuffer.getAttribute(2, "color"), [0, 0, 1, 0.5]);
  assert.deepEqual(asset.toJSON().meshes[0]?.colors[0], [1, 0, 0, 1]);
  resources.dispose();

  const invalid = structuredClone(gltf) as typeof gltf;
  invalid.accessors[1]!.count = 2;
  await assert.rejects(
    () => new GLTFLoader().load(
      { url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(invalid))}` },
      { throwIfAborted: () => undefined } as never
    ),
    /COLOR_0 count mismatch/
  );
});

test("workstream5 glTF render resources apply alpha and double-sided material state", async () => {
  const positionBytes = floatBytes([-1, 0, 0, 1, 0, 0, 0, 1, 0]);
  const gltf = {
    asset: { version: "2.0" },
    buffers: [{ uri: `data:application/octet-stream;base64,${positionBytes.toString("base64")}`, byteLength: positionBytes.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positionBytes.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }],
    materials: [
      { name: "transparent-double-sided", alphaMode: "BLEND", doubleSided: true },
      { name: "masked-front", alphaMode: "MASK", alphaCutoff: 0.35 },
      { name: "transmissive-volume", extensions: { KHR_materials_transmission: { transmissionFactor: 1 }, KHR_materials_volume: { thicknessFactor: 1, attenuationDistance: 1 } } }
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }]
  };

  const asset = await new GLTFLoader().load(
    { url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}` },
    { throwIfAborted: () => undefined } as never
  );
  const resources = await createGLTFRenderResources(asset);
  const transparent = resources.materialLibrary.get("transparent-double-sided");
  const masked = resources.materialLibrary.get("masked-front");
  const transmissive = resources.materialLibrary.get("transmissive-volume");

  assert.deepEqual(transparent?.renderState, {
    depthTest: true,
    depthWrite: false,
    cullMode: "none",
    blend: true,
    depthCompare: "less-equal",
    colorWrite: [true, true, true, true],
    scissor: null,
    stencil: null,
    polygonOffset: null
  });
  assert.equal(transparent?.getParameter("u_alphaCutoff"), 0);
  assert.deepEqual(masked?.renderState, {
    depthTest: true,
    depthWrite: true,
    cullMode: "back",
    blend: false,
    depthCompare: "less-equal",
    colorWrite: [true, true, true, true],
    scissor: null,
    stencil: null,
    polygonOffset: null
  });
  assert.equal(masked?.getParameter("u_alphaCutoff"), 0.35);
  assert.deepEqual(transmissive?.renderState, {
    depthTest: true,
    depthWrite: false,
    cullMode: "back",
    blend: true,
    depthCompare: "less-equal",
    colorWrite: [true, true, true, true],
    scissor: null,
    stencil: null,
    polygonOffset: null
  });

  resources.dispose();
});

test("workstream5 GLTFLoader applies glTF node matrix transforms and validates matrix/TRS exclusivity", async () => {
  const gltf = {
    asset: { version: "2.0" },
    nodes: [
      {
        name: "matrix-node",
        matrix: [
          1, 0, 0, 0,
          0, 1, 0, 0,
          0, 0, 1, 0,
          4, 5, 6, 1
        ]
      }
    ],
    scenes: [{ nodes: [0] }],
    scene: 0
  };
  const url = `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
  const asset = await new GLTFLoader().load({ url }, { throwIfAborted: () => undefined } as never);
  const node = asset.createScene().findByName("matrix-node")[0];

  assert.deepEqual(node?.transform.position, [4, 5, 6]);

  const mixed = {
    asset: { version: "2.0" },
    nodes: [{ name: "mixed-node", matrix: new Array(16).fill(0).map((_, index) => (index % 5 === 0 ? 1 : 0)), translation: [1, 2, 3] }],
    scenes: [{ nodes: [0] }]
  };
  const mixedUrl = `data:model/gltf+json,${encodeURIComponent(JSON.stringify(mixed))}`;
  const mixedAsset = await new GLTFLoader().load({ url: mixedUrl }, { throwIfAborted: () => undefined } as never);
  assert.throws(() => mixedAsset.createScene(), /cannot combine matrix/);

  const invalid = {
    asset: { version: "2.0" },
    nodes: [{ name: "invalid-node", matrix: [1, 0, 0] }],
    scenes: [{ nodes: [0] }]
  };
  const invalidUrl = `data:model/gltf+json,${encodeURIComponent(JSON.stringify(invalid))}`;
  const invalidAsset = await new GLTFLoader().load({ url: invalidUrl }, { throwIfAborted: () => undefined } as never);
  assert.throws(() => invalidAsset.createScene(), /matrix must contain 16 finite values/);
});

test("workstream5 GLTFLoader rejects malformed glTF scene node graphs", async () => {
  const base = {
    asset: { version: "2.0" },
    nodes: [{ name: "root", children: [1] }, { name: "child" }, { name: "sibling" }],
    scenes: [{ nodes: [0, 2] }],
    scene: 0
  };
  const cases: readonly [string, typeof base, RegExp][] = [
    ["missing child", { ...base, nodes: [{ name: "root", children: [9] }] }, /node 0 references missing child node 9/],
    ["duplicate parent", { ...base, nodes: [{ name: "a", children: [2] }, { name: "b", children: [2] }, { name: "c" }] }, /node 2 has multiple parents/],
    ["cycle", { ...base, nodes: [{ name: "loop", children: [0] }] }, /node graph contains a cycle at node 0/],
    ["missing active scene", { ...base, scene: 4 }, /scene 4 is missing/]
  ];

  for (const [name, gltf, message] of cases) {
    const asset = await new GLTFLoader().load(
      { url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}` },
      { throwIfAborted: () => undefined } as never
    );
    assert.throws(() => asset.createScene(), message, name);
  }
});

test("workstream5 GLTFLoader imports KHR_lights_punctual into runtime scene lights", async () => {
  const gltf = {
    asset: { version: "2.0" },
    extensionsRequired: ["KHR_lights_punctual"],
    extensions: {
      KHR_lights_punctual: {
        lights: [
          { name: "sun", type: "directional", color: [1, 0.9, 0.8], intensity: 2.5 },
          { name: "lamp", type: "point", color: [0.4, 0.5, 1], intensity: 10, range: 7 },
          {
            name: "cone",
            type: "spot",
            color: [0.2, 1, 0.4],
            intensity: 3,
            range: 12,
            spot: { innerConeAngle: 0.25, outerConeAngle: 0.5 }
          }
        ]
      }
    },
    nodes: [
      { name: "sun-node", extensions: { KHR_lights_punctual: { light: 0 } } },
      { name: "lamp-node", translation: [1, 2, 3], extensions: { KHR_lights_punctual: { light: 1 } } },
      { name: "spot-node", extensions: { KHR_lights_punctual: { light: 2 } } }
    ],
    scenes: [{ nodes: [0, 1, 2] }],
    scene: 0
  };
  const url = `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
  const asset = await new GLTFLoader().load({ url }, { throwIfAborted: () => undefined } as never);
  const scene = asset.createScene();
  const lights = scene.collectLights();

  assert.equal(asset.lights.length, 3);
  assert.equal(lights.length, 3);
  assert.ok(lights[0] instanceof DirectionalLight);
  assert.ok(lights[1] instanceof PointLight);
  assert.ok(lights[2] instanceof SpotLight);
  assert.deepEqual(lights[0]?.color, [1, 0.9, 0.8]);
  assert.equal(lights[0]?.intensity, 2.5);
  assert.deepEqual(lights[1]?.transform.position, [1, 2, 3]);
  assert.equal((lights[1] as PointLight).range, 7);
  assert.equal((lights[2] as SpotLight).range, 12);
  assert.equal((lights[2] as SpotLight).angle, 0.5);
  assert.equal((lights[2] as SpotLight).penumbra, 0.5);
  assert.equal(asset.toJSON().lights[2]?.spot?.outerConeAngle, 0.5);

  const invalidMissing = structuredClone(gltf) as typeof gltf;
  invalidMissing.nodes[0]!.extensions!.KHR_lights_punctual.light = 9;
  const invalidMissingAsset = await new GLTFLoader().load(
    { url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(invalidMissing))}` },
    { throwIfAborted: () => undefined } as never
  );
  assert.throws(() => invalidMissingAsset.createScene(), /missing punctual light 9/);

  const invalidCone = structuredClone(gltf) as typeof gltf;
  invalidCone.extensions.KHR_lights_punctual.lights[2]!.spot = { innerConeAngle: 0.6, outerConeAngle: 0.5 };
  await assert.rejects(
    () => new GLTFLoader().load(
      { url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(invalidCone))}` },
      { throwIfAborted: () => undefined } as never
    ),
    /innerConeAngle/
  );
});

test("workstream5 GLTFLoader imports glTF perspective and orthographic cameras into scene cameras", async () => {
  const gltf = {
    asset: { version: "2.0" },
    cameras: [
      { name: "shot-perspective", type: "perspective", perspective: { yfov: 0.75, aspectRatio: 1.5, znear: 0.1, zfar: 250 } },
      { name: "plan-orthographic", type: "orthographic", orthographic: { xmag: 8, ymag: 4, znear: 0.25, zfar: 120 } }
    ],
    nodes: [
      { name: "shot-node", camera: 0, translation: [2, 3, 4] },
      { name: "plan-node", camera: 1 }
    ],
    scenes: [{ nodes: [0, 1] }],
    scene: 0
  };
  const asset = await new GLTFLoader().load(
    { url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}` },
    { throwIfAborted: () => undefined } as never
  );
  const scene = asset.createScene();
  const cameras = scene.collectCameras();

  assert.equal(asset.cameras.length, 2);
  assert.equal(cameras.length, 2);
  assert.ok(cameras[0] instanceof PerspectiveCamera);
  assert.ok(cameras[1] instanceof OrthographicCamera);
  assert.equal((cameras[0] as PerspectiveCamera).fovYRadians, 0.75);
  assert.equal((cameras[0] as PerspectiveCamera).aspect, 1.5);
  assert.equal((cameras[0] as PerspectiveCamera).near, 0.1);
  assert.equal((cameras[0] as PerspectiveCamera).far, 250);
  assert.deepEqual(cameras[0]?.transform.position, [2, 3, 4]);
  assert.equal((cameras[1] as OrthographicCamera).left, -4);
  assert.equal((cameras[1] as OrthographicCamera).right, 4);
  assert.equal((cameras[1] as OrthographicCamera).bottom, -2);
  assert.equal((cameras[1] as OrthographicCamera).top, 2);
  assert.equal((cameras[1] as OrthographicCamera).near, 0.25);
  assert.equal((cameras[1] as OrthographicCamera).far, 120);
  assert.equal(asset.toJSON().cameras[0]?.perspective?.zfar, 250);

  const missing = structuredClone(gltf) as typeof gltf;
  missing.nodes[0]!.camera = 9;
  const missingAsset = await new GLTFLoader().load(
    { url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(missing))}` },
    { throwIfAborted: () => undefined } as never
  );
  assert.throws(() => missingAsset.createScene(), /missing camera 9/);

  const invalid = structuredClone(gltf) as typeof gltf;
  invalid.cameras[0]!.perspective!.zfar = 0.01;
  await assert.rejects(
    () => new GLTFLoader().load(
      { url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(invalid))}` },
      { throwIfAborted: () => undefined } as never
    ),
    /zfar must be greater/
  );
});

test("workstream5 GLTFLoader streams external buffers and reports byte progress through AssetManager", async () => {
  const originalFetch = globalThis.fetch;
  const binary = new Uint8Array(36);
  new Float32Array(binary.buffer, binary.byteOffset, 9).set([-0.5, -0.5, 0, 0.5, -0.5, 0, 0, 0.5, 0]);
  const gltf = {
    asset: { version: "2.0" },
    buffers: [{ uri: "mesh.bin", byteLength: binary.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: binary.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }],
    meshes: [{ name: "streamed", primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ name: "streamed-node", mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0
  };
  const documentBytes = new TextEncoder().encode(JSON.stringify(gltf));
  const progress: AssetLoadProgress[] = [];
  globalThis.fetch = (async (url: string | URL | Request) => {
    const href = String(url);
    if (href.endsWith("scene.gltf")) {
      return new Response(documentBytes.slice(), { headers: { "content-length": String(documentBytes.byteLength) } });
    }
    if (href.endsWith("mesh.bin")) {
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(binary.slice(0, 12));
            controller.enqueue(binary.slice(12));
            controller.close();
          }
        }),
        { headers: { "content-length": String(binary.byteLength) } }
      );
    }
    return new Response(null, { status: 404 });
  }) as typeof fetch;

  try {
    const assets = new AssetManager({ baseUrl: "https://cdn.example/assets/" });
    assets.register(new GLTFLoader());
    const handle = await assets.load<GLTFAsset>("scene.gltf", {
      type: "gltf",
      onProgress: (event) => progress.push(event)
    });

    assert.equal(handle.value.meshes[0]?.positions.length, 3);
    assert.equal(handle.value.createScene().collectRenderables()[0]?.renderable.geometry, "streamed");
    assert.deepEqual(
      progress.filter((event) => event.url.endsWith("mesh.bin")).map((event) => ({
        phase: event.phase,
        loadedBytes: event.loadedBytes,
        totalBytes: event.totalBytes
      })),
      [
        { phase: "buffer", loadedBytes: 12, totalBytes: 36 },
        { phase: "buffer", loadedBytes: 36, totalBytes: 36 },
        { phase: "complete", loadedBytes: 36, totalBytes: 36 }
      ]
    );

    await assets.release(handle);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("workstream5 GLTFLoader applies sparse accessor overlays without silently dropping geometry", async () => {
  const sparseIndices = uint16Bytes([1, 2]);
  const sparseValues = floatBytes([1, 0, 0, 0, 1, 0]);
  const triangleIndices = uint16Bytes([0, 1, 2]);
  const binary = Buffer.concat([sparseIndices, sparseValues, triangleIndices]);
  const gltf = {
    asset: { version: "2.0" },
    buffers: [{ uri: `data:application/octet-stream;base64,${binary.toString("base64")}`, byteLength: binary.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: sparseIndices.byteLength },
      { buffer: 0, byteOffset: sparseIndices.byteLength, byteLength: sparseValues.byteLength },
      { buffer: 0, byteOffset: sparseIndices.byteLength + sparseValues.byteLength, byteLength: triangleIndices.byteLength }
    ],
    accessors: [
      {
        componentType: 5126,
        count: 3,
        type: "VEC3",
        sparse: {
          count: 2,
          indices: { bufferView: 0, componentType: 5123 },
          values: { bufferView: 1 }
        }
      },
      { bufferView: 2, componentType: 5123, count: 3, type: "SCALAR" }
    ],
    meshes: [{ name: "sparse-triangle", primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    nodes: [{ name: "sparse-node", mesh: 0 }],
    scenes: [{ nodes: [0] }]
  };
  const url = `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;

  const asset = await new GLTFLoader().load({ url }, { throwIfAborted: () => undefined } as never);

  assert.deepEqual(asset.meshes[0]?.positions, [[0, 0, 0], [1, 0, 0], [0, 1, 0]]);
  assert.deepEqual(asset.meshes[0]?.geometry.bounds, { min: [0, 0, 0], max: [1, 1, 0] });

  const invalidSparse = structuredClone(gltf) as typeof gltf & {
    accessors: [{ sparse: { indices: { bufferView: number; componentType: number; byteOffset?: number } } }, ...typeof gltf.accessors]
  };
  invalidSparse.accessors[0]!.sparse!.indices = { bufferView: 0, byteOffset: 2, componentType: 5123 };
  const invalidUrl = `data:model/gltf+json,${encodeURIComponent(JSON.stringify(invalidSparse))}`;
  await assert.rejects(() => new GLTFLoader().load({ url: invalidUrl }, { throwIfAborted: () => undefined } as never), /sparse indices.*exceeds/);

  const malformedSparseCases: readonly [string, (copy: typeof gltf) => void, RegExp][] = [
    ["missing sparse indices", (copy) => { delete (copy.accessors[0]!.sparse as Record<string, unknown>).indices; }, /sparse indices must be an object/],
    ["missing sparse values", (copy) => { delete (copy.accessors[0]!.sparse as Record<string, unknown>).values; }, /sparse values must be an object/],
    ["unsupported sparse index component type", (copy) => { copy.accessors[0]!.sparse!.indices.componentType = 5120; }, /sparse indices componentType 5120 is unsupported/],
    ["negative sparse index byteOffset", (copy) => { (copy.accessors[0]!.sparse!.indices as { byteOffset?: number }).byteOffset = -1; }, /sparse indices byteOffset/],
    ["fractional sparse value byteOffset", (copy) => { (copy.accessors[0]!.sparse!.values as { byteOffset?: number }).byteOffset = 0.5; }, /sparse values byteOffset/],
    ["sparse count exceeds accessor count", (copy) => { copy.accessors[0]!.sparse!.count = 4; }, /sparse count exceeds accessor count/]
  ];
  for (const [name, mutate, message] of malformedSparseCases) {
    const copy = structuredClone(gltf) as typeof gltf;
    mutate(copy);
    const malformedUrl = `data:model/gltf+json,${encodeURIComponent(JSON.stringify(copy))}`;
    await assert.rejects(
      () => new GLTFLoader().load({ url: malformedUrl }, { throwIfAborted: () => undefined } as never),
      message,
      name
    );
  }
});

test("workstream5 GLTFLoader rejects malformed accessor and bufferView descriptors", async () => {
  const positionBytes = floatBytes([-1, 0, 0, 1, 0, 0, 0, 1, 0]);
  const base = {
    asset: { version: "2.0" },
    buffers: [{ uri: `data:application/octet-stream;base64,${positionBytes.toString("base64")}`, byteLength: positionBytes.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positionBytes.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }],
    meshes: [{ name: "descriptor-triangle", primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ name: "descriptor-node", mesh: 0 }],
    scenes: [{ nodes: [0] }]
  };
  type MutableGLTF = typeof base & {
    buffers: Array<Record<string, unknown>>;
    accessors: Array<Record<string, unknown>>;
    bufferViews: Array<Record<string, unknown>>;
  };
  const cases: readonly [string, (gltf: MutableGLTF) => void, RegExp][] = [
    ["buffer byteLength mismatch", (gltf) => { gltf.buffers[0]!.byteLength = positionBytes.byteLength + 4; }, /buffer 0 declares 40 bytes but loaded 36/],
    ["unsupported buffer data URI media type", (gltf) => { gltf.buffers[0]!.uri = "data:text/plain;base64,AAAA"; }, /buffer 0 data uri media type/],
    ["malformed buffer data URI base64", (gltf) => { gltf.buffers[0]!.uri = "data:application/octet-stream;base64,@@@="; }, /buffer 0 data uri base64 payload is malformed/],
    ["invalid accessor type", (gltf) => { gltf.accessors[0]!.type = "MAT3"; }, /accessor 0 type MAT3 is unsupported/],
    ["invalid accessor component type", (gltf) => { gltf.accessors[0]!.componentType = 5130; }, /accessor 0 componentType 5130 is unsupported/],
    ["negative accessor byteOffset", (gltf) => { gltf.accessors[0]!.byteOffset = -1; }, /accessor 0 byteOffset/],
    ["negative bufferView byteOffset", (gltf) => { gltf.bufferViews[0]!.byteOffset = -1; }, /bufferView 0 byteOffset/],
    ["unaligned bufferView byteStride", (gltf) => { gltf.bufferViews[0]!.byteStride = 14; }, /bufferView 0 byteStride/],
    ["bufferView overflow", (gltf) => { gltf.bufferViews[0]!.byteOffset = 4; }, /bufferView 0 exceeds buffer/]
  ];

  for (const [name, mutate, message] of cases) {
    const gltf = structuredClone(base) as MutableGLTF;
    mutate(gltf);
    const url = `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
    await assert.rejects(
      () => new GLTFLoader().load({ url }, { throwIfAborted: () => undefined } as never),
      message,
      name
    );
  }
});

test("workstream5 GLTFLoader accepts KHR_mesh_quantization and decodes signed normalized geometry attributes", async () => {
  const positionBytes = int16Bytes([-32767, 0, 0, 32767, 0, 0, 0, 32767, 0]);
  const normalBytes = Buffer.from([-127, 0, 0, 0, 127, 0, 0, 0, 127]);
  const binary = Buffer.concat([positionBytes, normalBytes]);
  const gltf = {
    asset: { version: "2.0" },
    extensionsRequired: ["KHR_mesh_quantization"],
    buffers: [{ uri: `data:application/octet-stream;base64,${binary.toString("base64")}`, byteLength: binary.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionBytes.byteLength },
      { buffer: 0, byteOffset: positionBytes.byteLength, byteLength: normalBytes.byteLength }
    ],
    accessors: [
      { bufferView: 0, componentType: 5122, count: 3, type: "VEC3", normalized: true },
      { bufferView: 1, componentType: 5120, count: 3, type: "VEC3", normalized: true }
    ],
    meshes: [{ name: "signed-components", primitives: [{ attributes: { POSITION: 0, NORMAL: 1 } }] }],
    nodes: [{ name: "signed-node", mesh: 0 }],
    scenes: [{ nodes: [0] }]
  };
  const url = `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;

  const asset = await new GLTFLoader().load({ url }, { throwIfAborted: () => undefined } as never);

  assert.deepEqual(asset.meshes[0]?.positions, [[-1, 0, 0], [1, 0, 0], [0, 1, 0]]);
  assert.deepEqual(asset.meshes[0]?.normals, [[-1, 0, 0], [0, 1, 0], [0, 0, 1]]);
  const resources = await createGLTFRenderResources(asset);
  assert.deepEqual(resources.geometryLibrary.get("signed-components")?.vertexBuffer.getAttribute(0, "position"), [-1, 0, 0]);
  assert.deepEqual(resources.geometryLibrary.get("signed-components")?.vertexBuffer.getAttribute(1, "normal"), [0, 1, 0]);
  resources.dispose();
});

test("workstream5 GLTFLoader rejects quantized core geometry attributes when KHR_mesh_quantization is not declared", async () => {
  const positionBytes = int16Bytes([-32767, 0, 0, 32767, 0, 0, 0, 32767, 0]);
  const gltf = {
    asset: { version: "2.0" },
    buffers: [{ uri: `data:application/octet-stream;base64,${positionBytes.toString("base64")}`, byteLength: positionBytes.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positionBytes.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5122, count: 3, type: "VEC3", normalized: true }],
    meshes: [{ name: "undeclared-quantized", primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ name: "undeclared-quantized-node", mesh: 0 }],
    scenes: [{ nodes: [0] }]
  };
  const url = `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;

  await assert.rejects(
    () => new GLTFLoader().load({ url }, { throwIfAborted: () => undefined } as never),
    /KHR_mesh_quantization/
  );
});

test("workstream5 GLTFLoader decodes EXT_meshopt_compression bufferViews through a production decoder hook", async () => {
  const compressedBytes = Buffer.from([9, 8, 7, 6]);
  const decodedPositions = floatBytes([-0.5, -0.25, 0, 0.5, -0.25, 0, 0, 0.75, 0]);
  const gltf = {
    asset: { version: "2.0" },
    extensionsRequired: ["EXT_meshopt_compression"],
    buffers: [{ uri: `data:application/octet-stream;base64,${compressedBytes.toString("base64")}`, byteLength: compressedBytes.byteLength }],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: 0,
        byteLength: compressedBytes.byteLength,
        extensions: {
          EXT_meshopt_compression: {
            buffer: 0,
            byteOffset: 0,
            byteLength: compressedBytes.byteLength,
            byteStride: 12,
            count: 3,
            mode: "ATTRIBUTES",
            filter: "NONE"
          }
        }
      }
    ],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }],
    meshes: [{ name: "meshopt-triangle", primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ name: "meshopt-node", mesh: 0 }],
    scenes: [{ nodes: [0] }]
  };
  const url = `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
  const decoderCalls: string[] = [];

  const asset = await new GLTFLoader({
    meshoptDecoder: (source, descriptor) => {
      decoderCalls.push(`${descriptor.bufferViewIndex}:${descriptor.mode}:${descriptor.byteStride}:${descriptor.count}:${descriptor.filter}:${[...source].join(",")}`);
      return decodedPositions;
    }
  }).load({ url }, { throwIfAborted: () => undefined } as never);

  assert.deepEqual(decoderCalls, ["0:ATTRIBUTES:12:3:NONE:9,8,7,6"]);
  assert.equal(asset.meshes[0]?.geometry.vertexCount, 3);
  assert.deepEqual(asset.meshes[0]?.positions, [[-0.5, -0.25, 0], [0.5, -0.25, 0], [0, 0.75, 0]]);
  assert.equal(asset.createScene().collectRenderables()[0]?.renderable.geometry, "meshopt-triangle");
});

test("workstream5 GLTFLoader rejects malformed EXT_meshopt_compression descriptors", async () => {
  const compressedBytes = Buffer.from([1, 2, 3, 4]);
  const baseGLTF = {
    asset: { version: "2.0" },
    extensionsRequired: ["EXT_meshopt_compression"],
    buffers: [{ uri: `data:application/octet-stream;base64,${compressedBytes.toString("base64")}`, byteLength: compressedBytes.byteLength }],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: 0,
        byteLength: compressedBytes.byteLength,
        extensions: {
          EXT_meshopt_compression: {
            buffer: 0,
            byteOffset: 0,
            byteLength: compressedBytes.byteLength,
            byteStride: 12,
            count: 3,
            mode: "ATTRIBUTES",
            filter: "NONE"
          }
        }
      }
    ],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }],
    meshes: [{ name: "meshopt-invalid", primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ name: "meshopt-invalid-node", mesh: 0 }],
    scenes: [{ nodes: [0] }]
  };
  const load = (gltf: typeof baseGLTF, decoder?: GLTFMeshoptDecoder) => new GLTFLoader(
    decoder ? { meshoptDecoder: decoder } : {}
  ).load({ url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}` }, { throwIfAborted: () => undefined } as never);

  await assert.rejects(() => load(baseGLTF), /requires a meshoptDecoder/);

  const undeclared = structuredClone(baseGLTF);
  undeclared.extensionsRequired = [];
  await assert.rejects(
    () => load(undeclared, () => floatBytes([0, 0, 0, 0, 0, 0, 0, 0, 0])),
    /extension is not declared/
  );

  const badStride = structuredClone(baseGLTF);
  badStride.bufferViews[0]!.extensions.EXT_meshopt_compression.byteStride = 0;
  await assert.rejects(
    () => load(badStride, () => floatBytes([0, 0, 0, 0, 0, 0, 0, 0, 0])),
    /byteStride must be a positive integer/
  );

  await assert.rejects(
    () => load(baseGLTF, () => new Uint8Array([1, 2, 3])),
    /decoded 3 bytes but expected 36/
  );
});

test("workstream5 GLTFLoader decodes KHR_draco_mesh_compression primitives through a production decoder hook", async () => {
  const compressedBytes = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
  const gltf = {
    asset: { version: "2.0" },
    extensionsRequired: ["KHR_draco_mesh_compression"],
    buffers: [{ uri: `data:application/octet-stream;base64,${compressedBytes.toString("base64")}`, byteLength: compressedBytes.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: compressedBytes.byteLength }],
    accessors: [
      { componentType: 5126, count: 3, type: "VEC3" },
      { componentType: 5126, count: 3, type: "VEC3" }
    ],
    meshes: [
      {
        name: "draco-triangle",
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1 },
            extensions: { KHR_draco_mesh_compression: { bufferView: 0, attributes: { POSITION: 3, NORMAL: 7 } } }
          }
        ]
      }
    ],
    nodes: [{ name: "draco-node", mesh: 0 }],
    scenes: [{ nodes: [0] }]
  };
  const url = `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
  const decoderCalls: string[] = [];

  const asset = await new GLTFLoader({
    dracoDecoder: (source, descriptor) => {
      decoderCalls.push(`${descriptor.meshIndex}:${descriptor.primitiveIndex}:${descriptor.bufferViewIndex}:${descriptor.attributes.POSITION}:${descriptor.attributes.NORMAL}:${[...source].join(",")}`);
      return {
        attributes: {
          POSITION: [[-1, 0, 0], [1, 0, 0], [0, 1, 0]],
          NORMAL: [[0, 0, 1], [0, 0, 1], [0, 0, 1]]
        },
        indices: [0, 1, 2]
      };
    }
  }).load({ url }, { throwIfAborted: () => undefined } as never);

  assert.deepEqual(decoderCalls, ["0:0:0:3:7:222,173,190,239"]);
  assert.deepEqual(asset.meshes[0]?.positions, [[-1, 0, 0], [1, 0, 0], [0, 1, 0]]);
  assert.deepEqual(asset.meshes[0]?.normals, [[0, 0, 1], [0, 0, 1], [0, 0, 1]]);
  assert.deepEqual(asset.meshes[0]?.indices, [0, 1, 2]);
  const resources = await createGLTFRenderResources(asset);
  assert.deepEqual(resources.geometryLibrary.get("draco-triangle")?.vertexBuffer.getAttribute(1, "position"), [1, 0, 0]);
  resources.dispose();
});

test("workstream5 GLTFLoader rejects malformed KHR_draco_mesh_compression descriptors", async () => {
  const compressedBytes = Buffer.from([5, 6, 7, 8]);
  const baseGLTF = {
    asset: { version: "2.0" },
    extensionsRequired: ["KHR_draco_mesh_compression"],
    buffers: [{ uri: `data:application/octet-stream;base64,${compressedBytes.toString("base64")}`, byteLength: compressedBytes.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: compressedBytes.byteLength }],
    accessors: [{ componentType: 5126, count: 3, type: "VEC3" }],
    meshes: [
      {
        name: "bad-draco",
        primitives: [
          {
            attributes: { POSITION: 0 },
            extensions: { KHR_draco_mesh_compression: { bufferView: 0, attributes: { POSITION: 0 } } }
          }
        ]
      }
    ],
    nodes: [{ name: "bad-draco-node", mesh: 0 }],
    scenes: [{ nodes: [0] }]
  };
  const decoder: GLTFDracoDecoder = () => ({
    attributes: { POSITION: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] },
    indices: [0, 1, 2]
  });
  const load = (gltf: typeof baseGLTF, dracoDecoder?: GLTFDracoDecoder) => new GLTFLoader(
    dracoDecoder ? { dracoDecoder } : {}
  ).load({ url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}` }, { throwIfAborted: () => undefined } as never);

  await assert.rejects(() => load(baseGLTF), /requires a dracoDecoder/);

  const undeclared = structuredClone(baseGLTF);
  undeclared.extensionsRequired = [];
  await assert.rejects(() => load(undeclared, decoder), /extension is not declared/);

  const missingPosition = structuredClone(baseGLTF);
  missingPosition.meshes[0]!.primitives[0]!.extensions.KHR_draco_mesh_compression.attributes = {} as typeof baseGLTF.meshes[number]["primitives"][number]["extensions"]["KHR_draco_mesh_compression"]["attributes"];
  await assert.rejects(() => load(missingPosition, decoder), /requires POSITION attribute mapping/);

  await assert.rejects(
    () => load(baseGLTF, () => ({
      attributes: { POSITION: [[0, 0, 0], [1, 0, 0]], NORMAL: [[0, 0, 1], [0, 0, 1]] }
    })),
    /decoded unexpected attribute NORMAL/
  );

  await assert.rejects(
    () => load(baseGLTF, () => ({
      attributes: { POSITION: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] },
      indices: [0, 3, 1]
    })),
    /outside vertex count/
  );
});

test("workstream5 GLTFLoader loads binary GLB buffer chunks", async () => {
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

test("workstream5 GLTFLoader extracts GLB material texture metadata and embedded image bytes", async () => {
  const positionBytes = floatBytes([-1, 0, 0, 1, 0, 0, 0, 1, 0]);
  const indexBytes = uint16Bytes([0, 1, 2]);
  const uv1Bytes = floatBytes([0, 0, 1, 0, 0.5, 1]);
  const uv2Bytes = floatBytes([0.25, 0.5, 0.75, 0.5, 0.5, 0.25]);
  const imageBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const binary = Buffer.concat([positionBytes, indexBytes, uv1Bytes, uv2Bytes, imageBytes]);
  const indexOffset = positionBytes.byteLength;
  const uv1Offset = indexOffset + indexBytes.byteLength;
  const uv2Offset = uv1Offset + uv1Bytes.byteLength;
  const imageOffset = uv2Offset + uv2Bytes.byteLength;
  const gltf = {
    asset: { version: "2.0" },
    extensionsRequired: ["KHR_texture_transform"],
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionBytes.byteLength },
      { buffer: 0, byteOffset: indexOffset, byteLength: indexBytes.byteLength },
      { buffer: 0, byteOffset: uv1Offset, byteLength: uv1Bytes.byteLength },
      { buffer: 0, byteOffset: uv2Offset, byteLength: uv2Bytes.byteLength },
      { buffer: 0, byteOffset: imageOffset, byteLength: imageBytes.byteLength }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" },
      { bufferView: 2, componentType: 5126, count: 3, type: "VEC2" },
      { bufferView: 3, componentType: 5126, count: 3, type: "VEC2" }
    ],
    images: [{ name: "embedded-base-color", bufferView: 4, mimeType: "image/png" }],
    samplers: [{ name: "linear-repeat", magFilter: 9729, minFilter: 9729, wrapS: 10497, wrapT: 10497 }],
    textures: [{ name: "base-color-texture", source: 0, sampler: 0 }],
    materials: [
      {
        name: "pbr-material",
        pbrMetallicRoughness: {
          baseColorFactor: [0.25, 0.5, 0.75, 1],
          baseColorTexture: {
            index: 0,
            texCoord: 1,
            extensions: {
              KHR_texture_transform: { offset: [0.25, 0.5], scale: [2, 3], rotation: 0.5, texCoord: 2 }
            }
          },
          metallicFactor: 0.2,
          roughnessFactor: 0.8
        },
        doubleSided: true
      }
    ],
    meshes: [{ name: "textured-triangle", primitives: [{ attributes: { POSITION: 0, TEXCOORD_1: 2, TEXCOORD_2: 3 }, indices: 1, material: 0 }] }],
    nodes: [{ name: "textured-node", mesh: 0 }],
    scenes: [{ nodes: [0] }]
  };
  const url = `data:model/gltf-binary;base64,${createGLB(gltf, binary).toString("base64")}`;

  const asset = await new GLTFLoader().load({ url }, { throwIfAborted: () => undefined } as never);

  assert.equal(asset.images[0]?.name, "embedded-base-color");
  assert.equal(asset.images[0]?.mimeType, "image/png");
  assert.deepEqual([...new Uint8Array(asset.images[0]?.data ?? new ArrayBuffer(0))], [...imageBytes]);
  assert.equal(asset.textures[0]?.source, 0);
  assert.equal(asset.materials[0]?.name, "pbr-material");
  assert.deepEqual(asset.materials[0]?.baseColorFactor, [0.25, 0.5, 0.75, 1]);
  assert.deepEqual(asset.materials[0]?.baseColorTexture, {
    texture: 0,
    image: 0,
    texCoord: 2,
    transform: { offset: [0.25, 0.5], scale: [2, 3], rotation: 0.5 }
  });
  assert.equal(asset.materials[0]?.metallicFactor, 0.2);
  assert.equal(asset.materials[0]?.roughnessFactor, 0.8);
  assert.equal(asset.materials[0]?.doubleSided, true);
  assert.equal(asset.meshes[0]?.material, "pbr-material");
  assert.deepEqual(asset.meshes[0]?.texcoordSets[2]?.[0], [0.25, 0.5]);
});

test("workstream5 GLTFLoader rejects unsupported embedded image MIME types", async () => {
  const imageBytes = Buffer.from([1, 2, 3, 4]);
  const gltf = {
    asset: { version: "2.0" },
    buffers: [{ uri: `data:application/octet-stream;base64,${imageBytes.toString("base64")}`, byteLength: imageBytes.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: imageBytes.byteLength }],
    images: [{ name: "gif-image", bufferView: 0, mimeType: "image/gif" }]
  };
  const url = `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;

  await assert.rejects(
    () => new GLTFLoader().load({ url }, { throwIfAborted: () => undefined } as never),
    /mimeType/
  );
});

test("workstream5 GLTFLoader rejects unsupported URI image MIME metadata and data URI media types", async () => {
  const invalidImages: readonly [string, Record<string, string>, RegExp][] = [
    ["invalid uri mimeType", { uri: "texture.webp", mimeType: "image/webp" }, /mimeType/],
    ["invalid data uri media type", { uri: "data:image/gif;base64,AAAA" }, /data uri media type/],
    ["malformed data uri", { uri: "data:image/png;base64AAAA" }, /comma separator/]
  ];

  for (const [name, image, message] of invalidImages) {
    const gltf = {
      asset: { version: "2.0" },
      images: [{ name, ...image }]
    };
    const url = `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;

    await assert.rejects(
      () => new GLTFLoader().load({ url }, { throwIfAborted: () => undefined } as never),
      message
    );
  }
});

test("workstream5 GLTFLoader accepts EXT_texture_webp and resolves WebP texture sources into render resources", async () => {
  const gltf = {
    asset: { version: "2.0" },
    extensionsRequired: ["EXT_texture_webp"],
    images: [
      { name: "fallback-png", uri: "data:image/png;base64,AAAA" },
      { name: "preferred-webp", uri: "data:image/webp;base64,AAAA", mimeType: "image/webp" }
    ],
    textures: [
      {
        name: "base-color-webp",
        source: 0,
        extensions: { EXT_texture_webp: { source: 1 } }
      }
    ],
    materials: [
      {
        name: "webp-material",
        pbrMetallicRoughness: { baseColorTexture: { index: 0 } }
      }
    ],
    scenes: [{ nodes: [] }]
  };
  const url = `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;

  const asset = await new GLTFLoader().load({ url }, { throwIfAborted: () => undefined } as never);
  const decodedImages: number[] = [];
  const resources = await createGLTFRenderResources(asset, {
    imageDecoder: (image, imageIndex) => {
      decodedImages.push(imageIndex);
      assert.equal(image.name, "preferred-webp");
      assert.equal(image.mimeType, "image/webp");
      return { width: 1, height: 1, data: new Uint8Array([33, 44, 55, 255]) };
    }
  });
  const binding = resources.materialLibrary.get("webp-material")?.getParameter("u_baseColorTexture");

  assert.equal(asset.textures[0]?.source, 1);
  assert.deepEqual(asset.materials[0]?.baseColorTexture, { texture: 0, image: 1, texCoord: 0 });
  assert.deepEqual(decodedImages, [1]);
  assert.ok(binding instanceof TextureBinding);
  assert.equal(binding.texture?.label, "base-color-webp");
  assert.equal(binding.sampler.minFilter, "linear-mipmap-linear");
  assert.equal(binding.sampler.magFilter, "linear");
  assert.equal(binding.sampler.addressU, "repeat");
  assert.equal(binding.sampler.addressV, "repeat");
  assert.equal(binding.sampler.maxAnisotropy, 8);

  resources.dispose();
});

test("workstream5 GLTFLoader accepts KHR_texture_basisu and routes KTX2 images through render-resource decoding", async () => {
  const gltf = {
    asset: { version: "2.0" },
    extensionsRequired: ["KHR_texture_basisu"],
    images: [
      { name: "fallback-png", uri: "data:image/png;base64,AAAA" },
      { name: "preferred-ktx2", uri: "data:image/ktx2;base64,qrvM3Q==", mimeType: "image/ktx2" }
    ],
    textures: [
      {
        name: "base-color-ktx2",
        source: 0,
        extensions: { KHR_texture_basisu: { source: 1 } }
      }
    ],
    materials: [
      {
        name: "basisu-material",
        pbrMetallicRoughness: { baseColorTexture: { index: 0 } }
      }
    ],
    scenes: [{ nodes: [] }]
  };

  const asset = await new GLTFLoader().load(
    { url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}` },
    { throwIfAborted: () => undefined } as never
  );
  const decodedImages: number[] = [];
  const resources = await createGLTFRenderResources(asset, {
    imageDecoder: (image, imageIndex) => {
      decodedImages.push(imageIndex);
      assert.equal(image.name, "preferred-ktx2");
      assert.equal(image.mimeType, "image/ktx2");
      assert.equal(image.uri, "data:image/ktx2;base64,qrvM3Q==");
      return { width: 1, height: 1, data: new Uint8Array([66, 77, 88, 255]) };
    }
  });
  const binding = resources.materialLibrary.get("basisu-material")?.getParameter("u_baseColorTexture");

  assert.equal(asset.textures[0]?.source, 1);
  assert.deepEqual(asset.materials[0]?.baseColorTexture, { texture: 0, image: 1, texCoord: 0 });
  assert.deepEqual(decodedImages, [1]);
  assert.ok(binding instanceof TextureBinding);
  assert.equal(binding.texture?.label, "base-color-ktx2");
  assert.deepEqual(Array.from(binding.texture?.data ?? []), [66, 77, 88, 255]);

  resources.dispose();
});

test("workstream5 GLTFLoader rejects unsupported sampler enum values", async () => {
  const invalidSamplers: readonly [string, Record<string, number>, RegExp][] = [
    ["invalid min filter", { minFilter: 12345 }, /minFilter/],
    ["invalid mag filter", { magFilter: 9987 }, /magFilter/],
    ["invalid wrapS", { wrapS: 1 }, /wrapS/],
    ["invalid wrapT", { wrapT: 2 }, /wrapT/]
  ];

  for (const [name, sampler, message] of invalidSamplers) {
    const gltf = {
      asset: { version: "2.0" },
      images: [{ uri: "data:image/png;base64,AAAA" }],
      samplers: [{ name, ...sampler }],
      textures: [{ source: 0, sampler: 0 }]
    };
    const url = `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
    await assert.rejects(
      () => new GLTFLoader().load({ url }, { throwIfAborted: () => undefined } as never),
      message
    );
  }
});

test("workstream5 GLTFLoader rejects malformed texture source and sampler references", async () => {
  const invalidTextures: readonly [string, Record<string, unknown>, RegExp][] = [
    ["missing source", { sampler: 0 }, /missing image source undefined/],
    ["negative source", { source: -1 }, /source must be a non-negative integer/],
    ["fractional source", { source: 0.5 }, /source must be a non-negative integer/],
    ["missing image", { source: 4 }, /missing image source 4/],
    ["undeclared webp extension", { source: 0, extensions: { EXT_texture_webp: { source: 0 } } }, /EXT_texture_webp/],
    ["undeclared basisu extension", { source: 0, extensions: { KHR_texture_basisu: { source: 0 } } }, /KHR_texture_basisu/],
    ["negative sampler", { source: 0, sampler: -1 }, /sampler must be a non-negative integer/],
    ["fractional sampler", { source: 0, sampler: 0.5 }, /sampler must be a non-negative integer/],
    ["missing sampler", { source: 0, sampler: 3 }, /missing sampler 3/]
  ];

  for (const [name, texture, message] of invalidTextures) {
    const gltf = {
      asset: { version: "2.0" },
      images: [{ uri: "data:image/png;base64,AAAA" }],
      samplers: [{}],
      textures: [{ name, ...texture }]
    };
    const url = `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
    await assert.rejects(
      () => new GLTFLoader().load({ url }, { throwIfAborted: () => undefined } as never),
      message
    );
  }
});

test("workstream5 GLTFLoader accepts KHR_materials_unlit and creates unlit render resources", async () => {
  const positionBytes = floatBytes([-1, 0, 0, 1, 0, 0, 0, 1, 0]);
  const uvBytes = floatBytes([0, 0, 1, 0, 0.5, 1]);
  const indexBytes = uint16Bytes([0, 1, 2]);
  const imageBytes = Buffer.from([1, 3, 5, 7]);
  const binary = Buffer.concat([positionBytes, uvBytes, indexBytes, imageBytes]);
  const imageOffset = positionBytes.byteLength + uvBytes.byteLength + indexBytes.byteLength;
  const gltf = {
    asset: { version: "2.0" },
    extensionsRequired: ["KHR_materials_unlit"],
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionBytes.byteLength },
      { buffer: 0, byteOffset: positionBytes.byteLength, byteLength: uvBytes.byteLength },
      { buffer: 0, byteOffset: positionBytes.byteLength + uvBytes.byteLength, byteLength: indexBytes.byteLength },
      { buffer: 0, byteOffset: imageOffset, byteLength: imageBytes.byteLength }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC2" },
      { bufferView: 2, componentType: 5123, count: 3, type: "SCALAR" }
    ],
    images: [{ name: "unlit-base-image", bufferView: 3, mimeType: "image/png" }],
    textures: [{ name: "unlit-base-texture", source: 0 }],
    materials: [
      {
        name: "unlit-material",
        extensions: { KHR_materials_unlit: {} },
        pbrMetallicRoughness: {
          baseColorFactor: [0.5, 0.75, 1, 1],
          baseColorTexture: { index: 0 }
        }
      }
    ],
    meshes: [{ name: "unlit-triangle", primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }] }],
    nodes: [{ name: "unlit-node", mesh: 0 }],
    scenes: [{ nodes: [0] }]
  };
  const url = `data:model/gltf-binary;base64,${createGLB(gltf, binary).toString("base64")}`;

  const asset = await new GLTFLoader().load({ url }, { throwIfAborted: () => undefined } as never);
  const resources = await createGLTFRenderResources(asset, {
    imageDecoder: (image) => {
      assert.deepEqual([...new Uint8Array(image.data ?? new ArrayBuffer(0))], [...imageBytes]);
      return { width: 1, height: 1, data: new Uint8Array([200, 180, 160, 255]) };
    }
  });

  assert.equal(asset.materials[0]?.unlit, true);
  assert.equal(resources.materialLibrary.get("unlit-material")?.shaderKey, "galileo3d/textured-unlit");
  const binding = resources.materialLibrary.get("unlit-material")?.getParameter("u_baseColorTexture");
  assert.ok(binding instanceof TextureBinding);
  assert.equal(binding.texture?.label, "unlit-base-texture");
  assert.deepEqual(Array.from(binding.texture?.data ?? []), [200, 180, 160, 255]);
  resources.dispose();
  assert.equal(binding.texture?.disposed, true);
});

test("workstream5 GLTFLoader accepts KHR_materials_emissive_strength and preserves HDR intensity", async () => {
  const gltf = {
    asset: { version: "2.0" },
    extensionsRequired: ["KHR_materials_emissive_strength"],
    materials: [
      {
        name: "emissive-strength-material",
        emissiveFactor: [0.2, 0.4, 0.6],
        extensions: {
          KHR_materials_emissive_strength: { emissiveStrength: 4.5 }
        }
      }
    ],
    scenes: [{ nodes: [] }]
  };
  const url = `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;

  const asset = await new GLTFLoader().load({ url }, { throwIfAborted: () => undefined } as never);
  const resources = await createGLTFRenderResources(asset);
  const material = resources.materialLibrary.get("emissive-strength-material");

  assert.equal(asset.materials[0]?.emissiveStrength, 4.5);
  assert.deepEqual(asset.materials[0]?.emissiveFactor, [0.2, 0.4, 0.6]);
  assert.equal(material?.shaderKey, "galileo3d/pbr-direct");
  assert.deepEqual(material?.getParameter("u_emissiveColor"), [0.2, 0.4, 0.6]);
  assert.equal(material?.getParameter("u_emissiveStrength"), 4.5);

  const invalid = {
    asset: { version: "2.0" },
    extensionsRequired: ["KHR_materials_emissive_strength"],
    materials: [
      {
        name: "invalid-emissive-strength",
        extensions: {
          KHR_materials_emissive_strength: { emissiveStrength: -1 }
        }
      }
    ]
  };
  const invalidUrl = `data:model/gltf+json,${encodeURIComponent(JSON.stringify(invalid))}`;
  await assert.rejects(
    () => new GLTFLoader().load({ url: invalidUrl }, { throwIfAborted: () => undefined } as never),
    /emissiveStrength/
  );
});

test("workstream5 GLTFLoader preserves advanced glTF PBR material extensions and runtime texture bindings", async () => {
  const gltf = {
    asset: { version: "2.0" },
    extensionsRequired: [
      "KHR_materials_clearcoat",
      "KHR_materials_transmission",
      "KHR_materials_diffuse_transmission",
      "KHR_materials_volume",
      "KHR_materials_ior",
      "KHR_materials_specular",
      "KHR_materials_sheen",
      "KHR_materials_anisotropy",
      "KHR_materials_iridescence",
      "KHR_materials_dispersion",
      "KHR_texture_transform"
    ],
    images: [
      { name: "clearcoat", uri: "data:image/png;base64,AA==" },
      { name: "clearcoat-roughness", uri: "data:image/png;base64,AQ==" },
      { name: "clearcoat-normal", uri: "data:image/png;base64,Ag==" },
      { name: "transmission", uri: "data:image/png;base64,Aw==" },
      { name: "volume-thickness", uri: "data:image/png;base64,BA==" },
      { name: "specular", uri: "data:image/png;base64,BQ==" },
      { name: "specular-color", uri: "data:image/png;base64,Bg==" },
      { name: "sheen-color", uri: "data:image/png;base64,Bw==" },
      { name: "sheen-roughness", uri: "data:image/png;base64,CA==" },
      { name: "anisotropy", uri: "data:image/png;base64,CQ==" },
      { name: "iridescence", uri: "data:image/png;base64,Cg==" },
      { name: "iridescence-thickness", uri: "data:image/png;base64,Cw==" },
      { name: "diffuse-transmission", uri: "data:image/png;base64,DA==" },
      { name: "diffuse-transmission-color", uri: "data:image/png;base64,DQ==" }
    ],
    samplers: [{ magFilter: 9728, minFilter: 9986, wrapS: 33648, wrapT: 33071 }],
    textures: [
      { name: "clearcoat-texture", source: 0, sampler: 0 },
      { name: "clearcoat-roughness-texture", source: 1, sampler: 0 },
      { name: "clearcoat-normal-texture", source: 2, sampler: 0 },
      { name: "transmission-texture", source: 3, sampler: 0 },
      { name: "volume-thickness-texture", source: 4, sampler: 0 },
      { name: "specular-texture", source: 5, sampler: 0 },
      { name: "specular-color-texture", source: 6, sampler: 0 },
      { name: "sheen-color-texture", source: 7, sampler: 0 },
      { name: "sheen-roughness-texture", source: 8, sampler: 0 },
      { name: "anisotropy-texture", source: 9, sampler: 0 },
      { name: "iridescence-texture", source: 10, sampler: 0 },
      { name: "iridescence-thickness-texture", source: 11, sampler: 0 },
      { name: "diffuse-transmission-texture", source: 12, sampler: 0 },
      { name: "diffuse-transmission-color-texture", source: 13, sampler: 0 }
    ],
    materials: [
      {
        name: "advanced-pbr",
        extensions: {
          KHR_materials_clearcoat: {
            clearcoatFactor: 0.7,
            clearcoatTexture: {
              index: 0,
              extensions: { KHR_texture_transform: { offset: [0.1, 0.2], scale: [2, 2], rotation: 0.25 } }
            },
            clearcoatRoughnessFactor: 0.3,
            clearcoatRoughnessTexture: {
              index: 1,
              extensions: { KHR_texture_transform: { offset: [0.21, 0.22], scale: [1.3, 1.4], rotation: 0.23 } }
            },
            clearcoatNormalTexture: {
              index: 2,
              scale: 0.4,
              extensions: { KHR_texture_transform: { offset: [0.31, 0.32], scale: [1.5, 1.6], rotation: 0.33 } }
            }
          },
          KHR_materials_transmission: {
            transmissionFactor: 0.6,
            transmissionTexture: {
              index: 3,
              extensions: { KHR_texture_transform: { offset: [0.41, 0.42], scale: [1.7, 1.8], rotation: 0.43 } }
            }
          },
          KHR_materials_diffuse_transmission: {
            diffuseTransmissionFactor: 0.45,
            diffuseTransmissionTexture: {
              index: 12,
              extensions: { KHR_texture_transform: { offset: [0.14, 0.15], scale: [1.15, 1.25], rotation: 0.16 } }
            },
            diffuseTransmissionColorFactor: [0.8, 0.7, 0.6],
            diffuseTransmissionColorTexture: {
              index: 13,
              extensions: { KHR_texture_transform: { offset: [0.24, 0.25], scale: [1.35, 1.45], rotation: 0.26 } }
            }
          },
          KHR_materials_volume: {
            thicknessFactor: 0.35,
            thicknessTexture: {
              index: 4,
              extensions: { KHR_texture_transform: { offset: [0.44, 0.45], scale: [1.45, 1.55], rotation: 0.46 } }
            },
            attenuationDistance: 5,
            attenuationColor: [0.7, 0.8, 0.9]
          },
          KHR_materials_ior: { ior: 1.45 },
          KHR_materials_specular: {
            specularFactor: 0.8,
            specularTexture: {
              index: 5,
              extensions: { KHR_texture_transform: { offset: [0.51, 0.52], scale: [1.9, 2], rotation: 0.53 } }
            },
            specularColorFactor: [2.5, 1.2, 0.7],
            specularColorTexture: {
              index: 6,
              extensions: { KHR_texture_transform: { offset: [0.61, 0.62], scale: [2.1, 2.2], rotation: 0.63 } }
            }
          },
          KHR_materials_sheen: {
            sheenColorFactor: [0.2, 0.3, 0.4],
            sheenColorTexture: {
              index: 7,
              extensions: { KHR_texture_transform: { offset: [0.71, 0.72], scale: [2.3, 2.4], rotation: 0.73 } }
            },
            sheenRoughnessFactor: 0.55,
            sheenRoughnessTexture: {
              index: 8,
              extensions: { KHR_texture_transform: { offset: [0.81, 0.82], scale: [2.5, 2.6], rotation: 0.83 } }
            }
          },
          KHR_materials_anisotropy: {
            anisotropyStrength: 0.65,
            anisotropyRotation: 1.25,
            anisotropyTexture: {
              index: 9,
              extensions: { KHR_texture_transform: { offset: [0.91, 0.92], scale: [2.7, 2.8], rotation: 0.93 } }
            }
          },
          KHR_materials_iridescence: {
            iridescenceFactor: 0.75,
            iridescenceTexture: {
              index: 10,
              extensions: { KHR_texture_transform: { offset: [1.01, 1.02], scale: [2.9, 3], rotation: 1.03 } }
            },
            iridescenceIor: 1.4,
            iridescenceThicknessMinimum: 150,
            iridescenceThicknessMaximum: 650,
            iridescenceThicknessTexture: {
              index: 11,
              extensions: { KHR_texture_transform: { offset: [1.11, 1.12], scale: [3.1, 3.2], rotation: 1.13 } }
            }
          },
          KHR_materials_dispersion: {
            dispersion: 9
          }
        }
      }
    ],
    scenes: [{ nodes: [] }]
  };
  const url = `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;

  const asset = await new GLTFLoader().load({ url }, { throwIfAborted: () => undefined } as never);
  const resources = await createGLTFRenderResources(asset, {
    imageDecoder: (_image, imageIndex) => ({
      width: 1,
      height: 1,
      data: new Uint8Array([imageIndex, imageIndex + 1, imageIndex + 2, 255])
    })
  });
  const materialAsset = asset.materials[0];
  const material = resources.materialLibrary.get("advanced-pbr");
  const clearcoatBinding = material?.getParameter("u_clearcoatTexture");
  const clearcoatRoughnessBinding = material?.getParameter("u_clearcoatRoughnessTexture");
  const clearcoatNormalBinding = material?.getParameter("u_clearcoatNormalTexture");
  const transmissionBinding = material?.getParameter("u_transmissionTexture");
  const diffuseTransmissionBinding = material?.getParameter("u_diffuseTransmissionTexture");
  const diffuseTransmissionColorBinding = material?.getParameter("u_diffuseTransmissionColorTexture");
  const volumeThicknessBinding = material?.getParameter("u_volumeThicknessTexture");
  const specularBinding = material?.getParameter("u_specularTexture");
  const specularColorBinding = material?.getParameter("u_specularColorTexture");
  const sheenColorBinding = material?.getParameter("u_sheenColorTexture");
  const sheenRoughnessBinding = material?.getParameter("u_sheenRoughnessTexture");
  const anisotropyBinding = material?.getParameter("u_anisotropyTexture");
  const iridescenceBinding = material?.getParameter("u_iridescenceTexture");
  const iridescenceThicknessBinding = material?.getParameter("u_iridescenceThicknessTexture");

  assert.equal(materialAsset?.clearcoat?.factor, 0.7);
  assert.equal(materialAsset?.clearcoat?.roughnessFactor, 0.3);
  assert.equal(materialAsset?.clearcoat?.normalTexture?.scale, 0.4);
  assert.equal(materialAsset?.transmission?.factor, 0.6);
  assert.equal(materialAsset?.diffuseTransmission?.factor, 0.45);
  assert.deepEqual(materialAsset?.diffuseTransmission?.colorFactor, [0.8, 0.7, 0.6]);
  assert.equal(materialAsset?.volume?.thicknessFactor, 0.35);
  assert.equal(materialAsset?.volume?.attenuationDistance, 5);
  assert.deepEqual(materialAsset?.volume?.attenuationColor, [0.7, 0.8, 0.9]);
  assert.equal(materialAsset?.ior, 1.45);
  assert.equal(materialAsset?.specular?.factor, 0.8);
  assert.deepEqual(materialAsset?.specular?.colorFactor, [2.5, 1.2, 0.7]);
  assert.deepEqual(materialAsset?.sheen?.colorFactor, [0.2, 0.3, 0.4]);
  assert.equal(materialAsset?.sheen?.roughnessFactor, 0.55);
  assert.equal(materialAsset?.anisotropy?.strength, 0.65);
  assert.equal(materialAsset?.anisotropy?.rotation, 1.25);
  assert.equal(materialAsset?.iridescence?.factor, 0.75);
  assert.equal(materialAsset?.iridescence?.ior, 1.4);
  assert.equal(materialAsset?.iridescence?.thicknessMinimum, 150);
  assert.equal(materialAsset?.iridescence?.thicknessMaximum, 650);
  assert.equal(materialAsset?.dispersion, 9);
  assert.equal(material?.getParameter("u_clearcoatFactor"), 0.7);
  assert.equal(material?.getParameter("u_clearcoatRoughnessFactor"), 0.3);
  assert.equal(material?.getParameter("u_clearcoatNormalScale"), 0.4);
  assert.equal(material?.getParameter("u_transmissionFactor"), 0.6);
  assert.equal(material?.getParameter("u_diffuseTransmissionFactor"), 0.45);
  assert.deepEqual(material?.getParameter("u_diffuseTransmissionColorFactor"), [0.8, 0.7, 0.6]);
  assert.equal(material?.getParameter("u_volumeThicknessFactor"), 0.35);
  assert.equal(material?.getParameter("u_volumeAttenuationDistance"), 5);
  assert.deepEqual(material?.getParameter("u_volumeAttenuationColor"), [0.7, 0.8, 0.9]);
  assert.equal(material?.getParameter("u_ior"), 1.45);
  assert.deepEqual(material?.getParameter("u_specularColorFactor"), [2.5, 1.2, 0.7]);
  assert.deepEqual(material?.getParameter("u_sheenColorFactor"), [0.2, 0.3, 0.4]);
  assert.equal(material?.getParameter("u_sheenRoughnessFactor"), 0.55);
  assert.equal(material?.getParameter("u_anisotropyStrength"), 0.65);
  assert.equal(material?.getParameter("u_anisotropyRotation"), 1.25);
  assert.equal(material?.getParameter("u_iridescenceFactor"), 0.75);
  assert.equal(material?.getParameter("u_iridescenceIor"), 1.4);
  assert.equal(material?.getParameter("u_iridescenceThicknessMinimum"), 150);
  assert.equal(material?.getParameter("u_iridescenceThicknessMaximum"), 650);
  assert.equal(material?.getParameter("u_dispersion"), 9);
  assert.ok(clearcoatBinding instanceof TextureBinding);
  assert.ok(clearcoatRoughnessBinding instanceof TextureBinding);
  assert.ok(clearcoatNormalBinding instanceof TextureBinding);
  assert.ok(transmissionBinding instanceof TextureBinding);
  assert.ok(diffuseTransmissionBinding instanceof TextureBinding);
  assert.ok(diffuseTransmissionColorBinding instanceof TextureBinding);
  assert.ok(volumeThicknessBinding instanceof TextureBinding);
  assert.ok(specularBinding instanceof TextureBinding);
  assert.ok(specularColorBinding instanceof TextureBinding);
  assert.ok(sheenColorBinding instanceof TextureBinding);
  assert.ok(sheenRoughnessBinding instanceof TextureBinding);
  assert.ok(anisotropyBinding instanceof TextureBinding);
  assert.ok(iridescenceBinding instanceof TextureBinding);
  assert.ok(iridescenceThicknessBinding instanceof TextureBinding);
  assert.equal(clearcoatBinding.texture?.label, "clearcoat-texture");
  assert.equal(clearcoatBinding.texture?.colorSpace, "linear");
  assert.deepEqual(clearcoatBinding.offset, [0.1, 0.2]);
  assert.deepEqual(clearcoatBinding.scale, [2, 2]);
  assert.equal(clearcoatBinding.rotation, 0.25);
  assert.deepEqual(material?.getParameter("u_clearcoatRoughnessTextureOffset"), [0.21, 0.22]);
  assert.deepEqual(material?.getParameter("u_clearcoatRoughnessTextureScale"), [1.3, 1.4]);
  assert.equal(material?.getParameter("u_clearcoatRoughnessTextureRotation"), 0.23);
  assert.deepEqual(material?.getParameter("u_clearcoatNormalTextureOffset"), [0.31, 0.32]);
  assert.deepEqual(material?.getParameter("u_clearcoatNormalTextureScale"), [1.5, 1.6]);
  assert.equal(material?.getParameter("u_clearcoatNormalTextureRotation"), 0.33);
  assert.deepEqual(material?.getParameter("u_transmissionTextureOffset"), [0.41, 0.42]);
  assert.deepEqual(material?.getParameter("u_transmissionTextureScale"), [1.7, 1.8]);
  assert.equal(material?.getParameter("u_transmissionTextureRotation"), 0.43);
  assert.equal(diffuseTransmissionBinding.texture?.label, "diffuse-transmission-texture");
  assert.equal(diffuseTransmissionBinding.texture?.colorSpace, "linear");
  assert.deepEqual(material?.getParameter("u_diffuseTransmissionTextureOffset"), [0.14, 0.15]);
  assert.deepEqual(material?.getParameter("u_diffuseTransmissionTextureScale"), [1.15, 1.25]);
  assert.equal(material?.getParameter("u_diffuseTransmissionTextureRotation"), 0.16);
  assert.equal(diffuseTransmissionColorBinding.texture?.label, "diffuse-transmission-color-texture");
  assert.equal(diffuseTransmissionColorBinding.texture?.colorSpace, "srgb");
  assert.deepEqual(material?.getParameter("u_diffuseTransmissionColorTextureOffset"), [0.24, 0.25]);
  assert.deepEqual(material?.getParameter("u_diffuseTransmissionColorTextureScale"), [1.35, 1.45]);
  assert.equal(material?.getParameter("u_diffuseTransmissionColorTextureRotation"), 0.26);
  assert.equal(volumeThicknessBinding.texture?.label, "volume-thickness-texture");
  assert.equal(volumeThicknessBinding.texture?.colorSpace, "linear");
  assert.deepEqual(material?.getParameter("u_volumeThicknessTextureOffset"), [0.44, 0.45]);
  assert.deepEqual(material?.getParameter("u_volumeThicknessTextureScale"), [1.45, 1.55]);
  assert.equal(material?.getParameter("u_volumeThicknessTextureRotation"), 0.46);
  assert.deepEqual(material?.getParameter("u_specularTextureOffset"), [0.51, 0.52]);
  assert.deepEqual(material?.getParameter("u_specularTextureScale"), [1.9, 2]);
  assert.equal(material?.getParameter("u_specularTextureRotation"), 0.53);
  assert.equal(specularColorBinding.texture?.colorSpace, "srgb");
  assert.deepEqual(material?.getParameter("u_specularColorTextureOffset"), [0.61, 0.62]);
  assert.deepEqual(material?.getParameter("u_specularColorTextureScale"), [2.1, 2.2]);
  assert.equal(material?.getParameter("u_specularColorTextureRotation"), 0.63);
  assert.equal(sheenColorBinding.texture?.colorSpace, "srgb");
  assert.deepEqual(material?.getParameter("u_sheenColorTextureOffset"), [0.71, 0.72]);
  assert.deepEqual(material?.getParameter("u_sheenColorTextureScale"), [2.3, 2.4]);
  assert.equal(material?.getParameter("u_sheenColorTextureRotation"), 0.73);
  assert.deepEqual(material?.getParameter("u_sheenRoughnessTextureOffset"), [0.81, 0.82]);
  assert.deepEqual(material?.getParameter("u_sheenRoughnessTextureScale"), [2.5, 2.6]);
  assert.equal(material?.getParameter("u_sheenRoughnessTextureRotation"), 0.83);
  assert.equal(anisotropyBinding.texture?.label, "anisotropy-texture");
  assert.equal(anisotropyBinding.texture?.colorSpace, "linear");
  assert.deepEqual(material?.getParameter("u_anisotropyTextureOffset"), [0.91, 0.92]);
  assert.deepEqual(material?.getParameter("u_anisotropyTextureScale"), [2.7, 2.8]);
  assert.equal(material?.getParameter("u_anisotropyTextureRotation"), 0.93);
  assert.equal(iridescenceBinding.texture?.label, "iridescence-texture");
  assert.equal(iridescenceBinding.texture?.colorSpace, "linear");
  assert.deepEqual(material?.getParameter("u_iridescenceTextureOffset"), [1.01, 1.02]);
  assert.deepEqual(material?.getParameter("u_iridescenceTextureScale"), [2.9, 3]);
  assert.equal(material?.getParameter("u_iridescenceTextureRotation"), 1.03);
  assert.equal(iridescenceThicknessBinding.texture?.label, "iridescence-thickness-texture");
  assert.equal(iridescenceThicknessBinding.texture?.colorSpace, "linear");
  assert.deepEqual(material?.getParameter("u_iridescenceThicknessTextureOffset"), [1.11, 1.12]);
  assert.deepEqual(material?.getParameter("u_iridescenceThicknessTextureScale"), [3.1, 3.2]);
  assert.equal(material?.getParameter("u_iridescenceThicknessTextureRotation"), 1.13);

  const serialized = asset.toJSON();
  assert.equal(serialized.materials[0]?.clearcoat?.factor, 0.7);
  assert.equal(serialized.materials[0]?.transmission?.factor, 0.6);
  assert.equal(serialized.materials[0]?.diffuseTransmission?.factor, 0.45);
  assert.deepEqual(serialized.materials[0]?.diffuseTransmission?.colorFactor, [0.8, 0.7, 0.6]);
  assert.equal(serialized.materials[0]?.volume?.thicknessFactor, 0.35);
  assert.deepEqual(serialized.materials[0]?.volume?.attenuationColor, [0.7, 0.8, 0.9]);
  assert.equal(serialized.materials[0]?.ior, 1.45);
  assert.deepEqual(serialized.materials[0]?.specular?.colorFactor, [2.5, 1.2, 0.7]);
  assert.deepEqual(serialized.materials[0]?.sheen?.colorFactor, [0.2, 0.3, 0.4]);
  assert.equal(serialized.materials[0]?.anisotropy?.strength, 0.65);
  assert.equal(serialized.materials[0]?.iridescence?.factor, 0.75);
  assert.equal(serialized.materials[0]?.iridescence?.thicknessMaximum, 650);
  assert.equal(serialized.materials[0]?.dispersion, 9);

  resources.dispose();
  assert.equal(clearcoatBinding.texture?.disposed, true);
});

test("workstream5 GLTFLoader imports KHR_materials_pbrSpecularGlossiness into PBR render resources", async () => {
  const gltf = {
    asset: { version: "2.0" },
    extensionsRequired: ["KHR_materials_pbrSpecularGlossiness", "KHR_texture_transform"],
    images: [
      { name: "diffuse", uri: "data:image/png;base64,AA==" },
      { name: "spec-gloss", uri: "data:image/png;base64,AQ==" }
    ],
    textures: [
      { name: "diffuse-texture", source: 0 },
      { name: "spec-gloss-texture", source: 1 }
    ],
    materials: [
      {
        name: "spec-gloss-material",
        pbrMetallicRoughness: {
          baseColorFactor: [0, 0, 0, 1],
          metallicFactor: 1,
          roughnessFactor: 1
        },
        extensions: {
          KHR_materials_pbrSpecularGlossiness: {
            diffuseFactor: [0.2, 0.3, 0.4, 0.8],
            diffuseTexture: {
              index: 0,
              extensions: { KHR_texture_transform: { offset: [0.12, 0.13], scale: [1.2, 1.3], rotation: 0.14 } }
            },
            specularFactor: [0.9, 0.8, 0.7],
            glossinessFactor: 0.65,
            specularGlossinessTexture: {
              index: 1,
              extensions: { KHR_texture_transform: { offset: [0.22, 0.23], scale: [1.4, 1.5], rotation: 0.24 } }
            }
          }
        }
      }
    ],
    scenes: [{ nodes: [] }]
  };

  const asset = await new GLTFLoader().load(
    { url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}` },
    { throwIfAborted: () => undefined } as never
  );
  const resources = await createGLTFRenderResources(asset, {
    imageDecoder: (_image, imageIndex) => ({
      width: 1,
      height: 1,
      data: new Uint8Array([imageIndex * 20, imageIndex * 20 + 10, imageIndex * 20 + 20, 255])
    })
  });
  const materialAsset = asset.materials[0];
  const material = resources.materialLibrary.get("spec-gloss-material");
  const baseColorBinding = material?.getParameter("u_baseColorTexture");
  const specularColorBinding = material?.getParameter("u_specularColorTexture");

  assert.deepEqual(materialAsset?.pbrSpecularGlossiness?.diffuseFactor, [0.2, 0.3, 0.4, 0.8]);
  assert.deepEqual(materialAsset?.pbrSpecularGlossiness?.specularFactor, [0.9, 0.8, 0.7]);
  assert.equal(materialAsset?.pbrSpecularGlossiness?.glossinessFactor, 0.65);
  assert.deepEqual(materialAsset?.baseColorFactor, [0.2, 0.3, 0.4, 0.8]);
  assert.equal(materialAsset?.metallicFactor, 0);
  assert.equal(materialAsset?.roughnessFactor, 0.35);
  assert.deepEqual(materialAsset?.specular?.colorFactor, [0.9, 0.8, 0.7]);
  assert.equal(material?.getParameter("u_metallic"), 0);
  assert.equal(material?.getParameter("u_roughness"), 0.35);
  assert.deepEqual(material?.getParameter("u_baseColor"), [0.2, 0.3, 0.4, 0.8]);
  assert.deepEqual(material?.getParameter("u_specularColorFactor"), [0.9, 0.8, 0.7]);
  assert.ok(baseColorBinding instanceof TextureBinding);
  assert.ok(specularColorBinding instanceof TextureBinding);
  assert.equal(baseColorBinding.texture?.label, "diffuse-texture");
  assert.equal(baseColorBinding.texture?.colorSpace, "srgb");
  assert.deepEqual(material?.getParameter("u_baseColorTextureOffset"), [0.12, 0.13]);
  assert.deepEqual(material?.getParameter("u_baseColorTextureScale"), [1.2, 1.3]);
  assert.equal(material?.getParameter("u_baseColorTextureRotation"), 0.14);
  assert.equal(specularColorBinding.texture?.label, "spec-gloss-texture");
  assert.equal(specularColorBinding.texture?.colorSpace, "srgb");
  assert.deepEqual(material?.getParameter("u_specularColorTextureOffset"), [0.22, 0.23]);
  assert.deepEqual(material?.getParameter("u_specularColorTextureScale"), [1.4, 1.5]);
  assert.equal(material?.getParameter("u_specularColorTextureRotation"), 0.24);
  assert.deepEqual(asset.toJSON().materials[0]?.pbrSpecularGlossiness?.diffuseFactor, [0.2, 0.3, 0.4, 0.8]);

  resources.dispose();
  assert.equal(baseColorBinding.texture?.disposed, true);
});

test("workstream5 GLTFLoader rejects invalid advanced glTF material extension values", async () => {
  const invalidMaterials: readonly [string, Record<string, unknown>, RegExp][] = [
    [
      "clearcoat factor outside unit range",
      { extensions: { KHR_materials_clearcoat: { clearcoatFactor: 1.5 } } },
      /KHR_materials_clearcoat\.clearcoatFactor/
    ],
    [
      "transmission factor outside unit range",
      { extensions: { KHR_materials_transmission: { transmissionFactor: -0.1 } } },
      /KHR_materials_transmission\.transmissionFactor/
    ],
    [
      "diffuse transmission factor outside unit range",
      { extensions: { KHR_materials_diffuse_transmission: { diffuseTransmissionFactor: 1.1 } } },
      /KHR_materials_diffuse_transmission\.diffuseTransmissionFactor/
    ],
    [
      "diffuse transmission color outside unit range",
      { extensions: { KHR_materials_diffuse_transmission: { diffuseTransmissionColorFactor: [1, -0.1, 1] } } },
      /KHR_materials_diffuse_transmission\.diffuseTransmissionColorFactor/
    ],
    [
      "diffuse transmission combined with unlit",
      { extensions: { KHR_materials_diffuse_transmission: {}, KHR_materials_unlit: {} } },
      /KHR_materials_diffuse_transmission must not be combined with KHR_materials_unlit/
    ],
    [
      "diffuse transmission combined with specular-glossiness",
      { extensions: { KHR_materials_diffuse_transmission: {}, KHR_materials_pbrSpecularGlossiness: {} } },
      /KHR_materials_diffuse_transmission must not be combined with KHR_materials_pbrSpecularGlossiness/
    ],
    [
      "volume thickness outside non-negative range",
      { extensions: { KHR_materials_volume: { thicknessFactor: -0.1 } } },
      /KHR_materials_volume\.thicknessFactor/
    ],
    [
      "volume attenuation distance outside positive range",
      { extensions: { KHR_materials_volume: { attenuationDistance: 0 } } },
      /KHR_materials_volume\.attenuationDistance/
    ],
    [
      "ior below physical lower bound",
      { extensions: { KHR_materials_ior: { ior: 0.9 } } },
      /KHR_materials_ior\.ior/
    ],
    [
      "specular color contains a negative channel",
      { extensions: { KHR_materials_specular: { specularColorFactor: [1, -0.1, 1] } } },
      /KHR_materials_specular\.specularColorFactor/
    ],
    [
      "sheen roughness outside unit range",
      { extensions: { KHR_materials_sheen: { sheenRoughnessFactor: 2 } } },
      /KHR_materials_sheen\.sheenRoughnessFactor/
    ],
    [
      "anisotropy strength outside unit range",
      { extensions: { KHR_materials_anisotropy: { anisotropyStrength: 1.1 } } },
      /KHR_materials_anisotropy\.anisotropyStrength/
    ],
    [
      "anisotropy rotation not finite",
      { extensions: { KHR_materials_anisotropy: { anisotropyRotation: "bad" } } },
      /KHR_materials_anisotropy\.anisotropyRotation/
    ],
    [
      "iridescence factor outside unit range",
      { extensions: { KHR_materials_iridescence: { iridescenceFactor: 1.1 } } },
      /KHR_materials_iridescence\.iridescenceFactor/
    ],
    [
      "iridescence ior outside physical range",
      { extensions: { KHR_materials_iridescence: { iridescenceIor: 3.1 } } },
      /KHR_materials_iridescence\.iridescenceIor/
    ],
    [
      "iridescence thickness range inverted",
      { extensions: { KHR_materials_iridescence: { iridescenceThicknessMinimum: 700, iridescenceThicknessMaximum: 100 } } },
      /KHR_materials_iridescence\.iridescenceThicknessMaximum/
    ],
    [
      "dispersion outside non-negative range",
      { extensions: { KHR_materials_dispersion: { dispersion: -0.1 } } },
      /KHR_materials_dispersion\.dispersion/
    ],
    [
      "specular-glossiness diffuse factor outside unit range",
      { extensions: { KHR_materials_pbrSpecularGlossiness: { diffuseFactor: [1, 0, 0, 1.2] } } },
      /KHR_materials_pbrSpecularGlossiness\.diffuseFactor/
    ],
    [
      "specular-glossiness specular factor outside unit range",
      { extensions: { KHR_materials_pbrSpecularGlossiness: { specularFactor: [1, -0.1, 1] } } },
      /KHR_materials_pbrSpecularGlossiness\.specularFactor/
    ],
    [
      "specular-glossiness glossiness factor outside unit range",
      { extensions: { KHR_materials_pbrSpecularGlossiness: { glossinessFactor: 1.2 } } },
      /KHR_materials_pbrSpecularGlossiness\.glossinessFactor/
    ]
  ];

  for (const [name, material, message] of invalidMaterials) {
    const gltf = {
      asset: { version: "2.0" },
      extensionsRequired: [
        "KHR_materials_clearcoat",
        "KHR_materials_transmission",
        "KHR_materials_diffuse_transmission",
        "KHR_materials_volume",
        "KHR_materials_ior",
        "KHR_materials_specular",
        "KHR_materials_sheen",
        "KHR_materials_anisotropy",
        "KHR_materials_iridescence",
        "KHR_materials_dispersion",
        "KHR_materials_pbrSpecularGlossiness"
      ],
      materials: [{ name, ...material }]
    };
    const url = `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
    await assert.rejects(
      () => new GLTFLoader().load({ url }, { throwIfAborted: () => undefined } as never),
      message
    );
  }
});

test("workstream5 GLTFLoader rejects invalid material scalar, color, and texture-transform data", async () => {
  const invalidMaterials: readonly [string, Record<string, unknown>, RegExp][] = [
    [
      "base color factor outside unit range",
      { pbrMetallicRoughness: { baseColorFactor: [1, 2, 0, 1] } },
      /baseColorFactor/
    ],
    [
      "negative roughness",
      { pbrMetallicRoughness: { roughnessFactor: -0.1 } },
      /roughnessFactor/
    ],
    [
      "emissive factor outside unit range",
      { emissiveFactor: [0, 0.5, 1.2] },
      /emissiveFactor/
    ],
    [
      "alpha cutoff outside unit range",
      { alphaCutoff: 1.5 },
      /alphaCutoff/
    ],
    [
      "invalid alpha mode",
      { alphaMode: "ADD" },
      /alphaMode/
    ],
    [
      "negative normal scale",
      { normalTexture: { index: 0, scale: -1 } },
      /normalTexture\.scale/
    ],
    [
      "occlusion strength outside unit range",
      { occlusionTexture: { index: 0, strength: 2 } },
      /occlusionTexture\.strength/
    ],
    [
      "invalid texture-transform vector",
      {
        pbrMetallicRoughness: {
          baseColorTexture: {
            index: 0,
            extensions: { KHR_texture_transform: { offset: [0.25] } }
          }
        }
      },
      /KHR_texture_transform\.offset/
    ],
    [
      "negative texture coordinate set",
      {
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0, texCoord: -1 }
        }
      },
      /texCoord/
    ],
    [
      "missing texture info index",
      {
        pbrMetallicRoughness: {
          baseColorTexture: { texCoord: 0 }
        }
      },
      /baseColorTexture index must be a non-negative integer/
    ],
    [
      "negative texture info index",
      {
        pbrMetallicRoughness: {
          baseColorTexture: { index: -1 }
        }
      },
      /baseColorTexture index must be a non-negative integer/
    ],
    [
      "fractional texture info index",
      {
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0.5 }
        }
      },
      /baseColorTexture index must be a non-negative integer/
    ]
  ];

  for (const [name, material, message] of invalidMaterials) {
    const gltf = {
      asset: { version: "2.0" },
      extensionsRequired: ["KHR_texture_transform"],
      images: [{ uri: "data:image/png;base64,AAAA" }],
      textures: [{ source: 0 }],
      materials: [{ name, ...material }]
    };
    const url = `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
    await assert.rejects(
      () => new GLTFLoader().load({ url }, { throwIfAborted: () => undefined } as never),
      message
    );
  }
});

test("workstream5 glTF render resources bind material textures, samplers, UV transforms, and geometry", async () => {
  const positionBytes = floatBytes([-1, 0, 0, 1, 0, 0, 0, 1, 0]);
  const uvBytes = floatBytes([0, 0, 1, 0, 0.5, 1]);
  const indexBytes = uint16Bytes([0, 1, 2]);
  const baseColorImageBytes = Buffer.from([1, 2, 3, 4]);
  const normalImageBytes = Buffer.from([5, 6, 7, 8]);
  const metallicRoughnessImageBytes = Buffer.from([9, 10, 11, 12]);
  const occlusionImageBytes = Buffer.from([13, 14, 15, 16]);
  const emissiveImageBytes = Buffer.from([17, 18, 19, 20]);
  const binary = Buffer.concat([positionBytes, uvBytes, indexBytes, baseColorImageBytes, normalImageBytes, metallicRoughnessImageBytes, occlusionImageBytes, emissiveImageBytes]);
  const baseColorImageOffset = positionBytes.byteLength + uvBytes.byteLength + indexBytes.byteLength;
  const normalImageOffset = baseColorImageOffset + baseColorImageBytes.byteLength;
  const metallicRoughnessImageOffset = normalImageOffset + normalImageBytes.byteLength;
  const occlusionImageOffset = metallicRoughnessImageOffset + metallicRoughnessImageBytes.byteLength;
  const emissiveImageOffset = occlusionImageOffset + occlusionImageBytes.byteLength;
  const gltf = {
    asset: { version: "2.0" },
    extensionsRequired: ["KHR_texture_transform"],
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionBytes.byteLength },
      { buffer: 0, byteOffset: positionBytes.byteLength, byteLength: uvBytes.byteLength },
      { buffer: 0, byteOffset: positionBytes.byteLength + uvBytes.byteLength, byteLength: indexBytes.byteLength },
      { buffer: 0, byteOffset: baseColorImageOffset, byteLength: baseColorImageBytes.byteLength },
      { buffer: 0, byteOffset: normalImageOffset, byteLength: normalImageBytes.byteLength },
      { buffer: 0, byteOffset: metallicRoughnessImageOffset, byteLength: metallicRoughnessImageBytes.byteLength },
      { buffer: 0, byteOffset: occlusionImageOffset, byteLength: occlusionImageBytes.byteLength },
      { buffer: 0, byteOffset: emissiveImageOffset, byteLength: emissiveImageBytes.byteLength }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC2" },
      { bufferView: 2, componentType: 5123, count: 3, type: "SCALAR" }
    ],
    images: [
      { name: "embedded-base-color", bufferView: 3, mimeType: "image/png" },
      { name: "embedded-normal", bufferView: 4, mimeType: "image/png" },
      { name: "embedded-metallic-roughness", bufferView: 5, mimeType: "image/png" },
      { name: "embedded-occlusion", bufferView: 6, mimeType: "image/png" },
      { name: "embedded-emissive", bufferView: 7, mimeType: "image/png" }
    ],
    samplers: [{ magFilter: 9728, minFilter: 9986, wrapS: 33648, wrapT: 33071 }],
    textures: [
      { name: "base-color-texture", source: 0, sampler: 0 },
      { name: "normal-texture", source: 1, sampler: 0 },
      { name: "metallic-roughness-texture", source: 2, sampler: 0 },
      { name: "occlusion-texture", source: 3, sampler: 0 },
      { name: "emissive-texture", source: 4, sampler: 0 }
    ],
    materials: [
      {
        name: "textured-material",
        pbrMetallicRoughness: {
          baseColorFactor: [0.25, 0.5, 0.75, 1],
          baseColorTexture: {
            index: 0,
            extensions: {
              KHR_texture_transform: { offset: [0.25, 0.5], scale: [2, 3], rotation: 0.5 }
            }
          },
          metallicRoughnessTexture: {
            index: 2,
            extensions: {
              KHR_texture_transform: { offset: [0.1, 0.2], scale: [1.5, 1.25], rotation: 0.25 }
            }
          },
          metallicFactor: 0.2,
          roughnessFactor: 0.7
        },
        normalTexture: { index: 1, scale: 0.6 },
        occlusionTexture: {
          index: 3,
          strength: 0.45,
          extensions: {
            KHR_texture_transform: { offset: [0.05, 0.15], scale: [0.75, 0.5], rotation: 0.125 }
          }
        },
        emissiveFactor: [0.2, 0.3, 0.4],
        emissiveTexture: { index: 4 }
      }
    ],
    meshes: [{ name: "textured-triangle", primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }] }],
    nodes: [{ name: "textured-node", mesh: 0 }],
    scenes: [{ nodes: [0] }]
  };
  const url = `data:model/gltf-binary;base64,${createGLB(gltf, binary).toString("base64")}`;

  const asset = await new GLTFLoader().load({ url }, { throwIfAborted: () => undefined } as never);
  const resources = await createGLTFRenderResources(asset, {
    imageDecoder: (image, imageIndex) => {
      const expectedSource = [baseColorImageBytes, normalImageBytes, metallicRoughnessImageBytes, occlusionImageBytes, emissiveImageBytes][imageIndex];
      assert.ok(expectedSource);
      assert.deepEqual([...new Uint8Array(image.data ?? new ArrayBuffer(0))], [...expectedSource]);
      const decodedPixels = [
        new Uint8Array([10, 20, 30, 255]),
        new Uint8Array([128, 128, 255, 255]),
        new Uint8Array([255, 179, 64, 255]),
        new Uint8Array([128, 255, 255, 255]),
        new Uint8Array([40, 50, 60, 255])
      ][imageIndex]!;
      return { width: 1, height: 1, data: decodedPixels };
    }
  });

  const geometry = resources.geometryLibrary.get("textured-triangle");
  assert.equal(geometry?.vertexBuffer.format.hasAttribute("uv"), true);
  assert.deepEqual(geometry?.vertexBuffer.getAttribute(2, "uv"), [0.5, 1]);
  assert.deepEqual(Array.from(geometry?.indexBuffer?.data ?? []), [0, 1, 2]);
  assert.equal(resources.scene.collectRenderables()[0]?.renderable.material, "textured-material");

  const material = resources.materialLibrary.get("textured-material");
  assert.equal(material?.shaderKey, "galileo3d/pbr-textured");
  const binding = material?.getParameter("u_baseColorTexture");
  const normalBinding = material?.getParameter("u_normalTexture");
  const metallicRoughnessBinding = material?.getParameter("u_metallicRoughnessTexture");
  const occlusionBinding = material?.getParameter("u_occlusionTexture");
  const emissiveBinding = material?.getParameter("u_emissiveTexture");
  assert.ok(binding instanceof TextureBinding);
  assert.ok(normalBinding instanceof TextureBinding);
  assert.ok(metallicRoughnessBinding instanceof TextureBinding);
  assert.ok(occlusionBinding instanceof TextureBinding);
  assert.ok(emissiveBinding instanceof TextureBinding);
  assert.equal(binding.texture?.label, "base-color-texture");
  assert.equal(normalBinding.texture?.label, "normal-texture");
  assert.equal(metallicRoughnessBinding.texture?.label, "metallic-roughness-texture");
  assert.equal(occlusionBinding.texture?.label, "occlusion-texture");
  assert.equal(emissiveBinding.texture?.label, "emissive-texture");
  assert.equal(binding.texture?.colorSpace, "srgb");
  assert.equal(normalBinding.texture?.colorSpace, "linear");
  assert.equal(metallicRoughnessBinding.texture?.colorSpace, "linear");
  assert.equal(occlusionBinding.texture?.colorSpace, "linear");
  assert.equal(emissiveBinding.texture?.colorSpace, "srgb");
  assert.deepEqual(Array.from(binding.texture?.data ?? []), [10, 20, 30, 255]);
  assert.deepEqual(Array.from(normalBinding.texture?.data ?? []), [128, 128, 255, 255]);
  assert.deepEqual(Array.from(metallicRoughnessBinding.texture?.data ?? []), [255, 179, 64, 255]);
  assert.deepEqual(Array.from(occlusionBinding.texture?.data ?? []), [128, 255, 255, 255]);
  assert.deepEqual(Array.from(emissiveBinding.texture?.data ?? []), [40, 50, 60, 255]);
  assert.equal(binding.sampler.minFilter, "nearest-mipmap-linear");
  assert.equal(binding.sampler.magFilter, "nearest");
  assert.equal(binding.sampler.addressU, "mirror-repeat");
  assert.equal(binding.sampler.addressV, "clamp-to-edge");
  assert.equal(binding.sampler.maxAnisotropy, 8);
  assert.equal(normalBinding.sampler.maxAnisotropy, 8);
  assert.deepEqual(binding.offset, [0.25, 0.5]);
  assert.deepEqual(binding.scale, [2, 3]);
  assert.equal(binding.rotation, 0.5);
  assert.equal(material?.getParameter("u_normalScale"), 0.6);
  assert.deepEqual(metallicRoughnessBinding.offset, [0.1, 0.2]);
  assert.deepEqual(metallicRoughnessBinding.scale, [1.5, 1.25]);
  assert.equal(metallicRoughnessBinding.rotation, 0.25);
  assert.deepEqual(occlusionBinding.offset, [0.05, 0.15]);
  assert.deepEqual(occlusionBinding.scale, [0.75, 0.5]);
  assert.equal(occlusionBinding.rotation, 0.125);
  assert.equal(material?.getParameter("u_occlusionStrength"), 0.45);
  resources.dispose();
  assert.equal(binding.texture?.disposed, true);
  assert.equal(normalBinding.texture?.disposed, true);
  assert.equal(metallicRoughnessBinding.texture?.disposed, true);
  assert.equal(occlusionBinding.texture?.disposed, true);
  assert.equal(emissiveBinding.texture?.disposed, true);
});

test("workstream5 GLTFLoader preserves secondary texcoords and render resources select material texCoord", async () => {
  const positions = floatBytes([-1, 0, 0, 1, 0, 0, 0, 1, 0]);
  const uv0 = floatBytes([0, 0, 1, 0, 0.5, 1]);
  const uv1 = floatBytes([0.2, 0.3, 0.4, 0.6, 0.8, 0.9]);
  const imageBytes = Buffer.from([1, 2, 3, 4]);
  const binary = Buffer.concat([positions, uv0, uv1, imageBytes]);
  const uv0Offset = positions.byteLength;
  const uv1Offset = uv0Offset + uv0.byteLength;
  const imageOffset = uv1Offset + uv1.byteLength;
  const gltf = {
    asset: { version: "2.0" },
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: uv0Offset, byteLength: uv0.byteLength },
      { buffer: 0, byteOffset: uv1Offset, byteLength: uv1.byteLength },
      { buffer: 0, byteOffset: imageOffset, byteLength: imageBytes.byteLength }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC2" },
      { bufferView: 2, componentType: 5126, count: 3, type: "VEC2" }
    ],
    images: [{ name: "base", bufferView: 3, mimeType: "image/png" }],
    textures: [{ name: "base-texture", source: 0 }],
    materials: [
      {
        name: "uv1-material",
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0, texCoord: 1 }
        }
      }
    ],
    meshes: [{ name: "uv1-triangle", primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1, TEXCOORD_1: 2 }, material: 0 }] }]
  };
  const url = `data:model/gltf-binary;base64,${createGLB(gltf, binary).toString("base64")}`;

  const asset = await new GLTFLoader().load({ url }, { throwIfAborted: () => undefined } as never);
  const resources = await createGLTFRenderResources(asset, {
    imageDecoder: () => ({ width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) })
  });

  assert.deepEqual(asset.meshes[0]?.texcoords[2], [0.5, 1]);
  assert.deepEqual(asset.meshes[0]?.texcoordSets[1]?.[2]?.map((value) => Number(value.toFixed(3))), [0.8, 0.9]);
  assert.equal(asset.materials[0]?.baseColorTexture?.texCoord, 1);
  assert.deepEqual(resources.geometryLibrary.get("uv1-triangle")?.vertexBuffer.getAttribute(2, "uv").map((value) => Number(value.toFixed(3))), [0.5, 1]);
  assert.deepEqual(resources.geometryLibrary.get("uv1-triangle")?.vertexBuffer.getAttribute(2, "uv1").map((value) => Number(value.toFixed(3))), [0.8, 0.9]);
  assert.equal(resources.materialLibrary.get("uv1-material")?.getParameter("u_baseColorTextureTexCoord"), 1);
  assert.deepEqual(asset.toJSON().meshes[0]?.texcoordSets[1]?.[2]?.map((value) => Number(value.toFixed(3))), [0.8, 0.9]);
  resources.dispose();
});

test("workstream5 GLTFLoader rejects material texCoord references without matching primitive texcoord set", async () => {
  const positions = floatBytes([-1, 0, 0, 1, 0, 0, 0, 1, 0]);
  const imageBytes = Buffer.from([1, 2, 3, 4]);
  const binary = Buffer.concat([positions, imageBytes]);
  const gltf = {
    asset: { version: "2.0" },
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: imageBytes.byteLength }
    ],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }],
    images: [{ name: "base", bufferView: 1, mimeType: "image/png" }],
    textures: [{ name: "base-texture", source: 0 }],
    materials: [
      {
        name: "missing-uv1",
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0, texCoord: 1 }
        }
      }
    ],
    meshes: [{ name: "triangle", primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }]
  };
  const url = `data:model/gltf-binary;base64,${createGLB(gltf, binary).toString("base64")}`;

  await assert.rejects(
    () => new GLTFLoader().load({ url }, { throwIfAborted: () => undefined } as never),
    /TEXCOORD_1/
  );
});

test("workstream5 glTF render resources synthesize fallback normals and TEXCOORD_0 attributes when material rendering needs them", async () => {
  const positions = floatBytes([-1, 0, 0, 1, 0, 0, 0, 1, 0]);
  const imageBytes = Buffer.from([1, 2, 3, 4]);
  const binary = Buffer.concat([positions, imageBytes]);
  const gltf = {
    asset: { version: "2.0" },
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: imageBytes.byteLength }
    ],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }],
    images: [{ name: "base", bufferView: 1, mimeType: "image/png" }],
    textures: [{ name: "base-texture", source: 0 }],
    materials: [
      {
        name: "missing-uv0-textured-pbr",
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0, texCoord: 0 }
        }
      }
    ],
    meshes: [{ name: "fallback-triangle", primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }]
  };
  const url = `data:model/gltf-binary;base64,${createGLB(gltf, binary).toString("base64")}`;

  const asset = await new GLTFLoader().load({ url }, { throwIfAborted: () => undefined } as never);
  const resources = await createGLTFRenderResources(asset, {
    imageDecoder: () => ({ width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) })
  });
  const geometry = resources.geometryLibrary.get("fallback-triangle");

  assert.equal(geometry?.vertexBuffer.format.hasAttribute("normal"), true);
  assert.equal(geometry?.vertexBuffer.format.hasAttribute("tangent"), true);
  assert.equal(geometry?.vertexBuffer.format.hasAttribute("uv"), true);
  assert.deepEqual(geometry?.vertexBuffer.getAttribute(0, "normal"), [0, 0, 1]);
  assert.deepEqual(geometry?.vertexBuffer.getAttribute(0, "tangent"), [1, 0, 0, 1]);
  assert.deepEqual(geometry?.vertexBuffer.getAttribute(0, "uv"), [0, 0]);
  resources.dispose();
});

test("workstream5 glTF render resources preserve mixed material texcoord sets without silently rebinding UVs", async () => {
  const positions = floatBytes([-1, 0, 0, 1, 0, 0, 0, 1, 0]);
  const uv0 = floatBytes([0, 0, 1, 0, 0.5, 1]);
  const uv1 = floatBytes([0.2, 0.3, 0.4, 0.6, 0.8, 0.9]);
  const baseImageBytes = Buffer.from([1, 2, 3, 4]);
  const normalImageBytes = Buffer.from([5, 6, 7, 8]);
  const binary = Buffer.concat([positions, uv0, uv1, baseImageBytes, normalImageBytes]);
  const uv0Offset = positions.byteLength;
  const uv1Offset = uv0Offset + uv0.byteLength;
  const baseImageOffset = uv1Offset + uv1.byteLength;
  const normalImageOffset = baseImageOffset + baseImageBytes.byteLength;
  const gltf = {
    asset: { version: "2.0" },
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: uv0Offset, byteLength: uv0.byteLength },
      { buffer: 0, byteOffset: uv1Offset, byteLength: uv1.byteLength },
      { buffer: 0, byteOffset: baseImageOffset, byteLength: baseImageBytes.byteLength },
      { buffer: 0, byteOffset: normalImageOffset, byteLength: normalImageBytes.byteLength }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC2" },
      { bufferView: 2, componentType: 5126, count: 3, type: "VEC2" }
    ],
    images: [
      { name: "base", bufferView: 3, mimeType: "image/png" },
      { name: "normal", bufferView: 4, mimeType: "image/png" }
    ],
    textures: [
      { name: "base-texture", source: 0 },
      { name: "normal-texture", source: 1 }
    ],
    materials: [
      {
        name: "mixed-uv-material",
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0, texCoord: 0 }
        },
        normalTexture: { index: 1, texCoord: 1 }
      }
    ],
    meshes: [{ name: "mixed-uv-triangle", primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1, TEXCOORD_1: 2 }, material: 0 }] }]
  };
  const url = `data:model/gltf-binary;base64,${createGLB(gltf, binary).toString("base64")}`;

  const asset = await new GLTFLoader().load({ url }, { throwIfAborted: () => undefined } as never);

  assert.equal(asset.materials[0]?.baseColorTexture?.texCoord, 0);
  assert.equal(asset.materials[0]?.normalTexture?.texCoord, 1);
  const resources = await createGLTFRenderResources(asset, {
    imageDecoder: () => ({ width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) })
  });
  const geometry = resources.geometryLibrary.get("mixed-uv-triangle");
  const material = resources.materialLibrary.get("mixed-uv-material");

  assert.deepEqual(geometry?.vertexBuffer.getAttribute(2, "uv").map((value) => Number(value.toFixed(3))), [0.5, 1]);
  assert.deepEqual(geometry?.vertexBuffer.getAttribute(2, "uv1").map((value) => Number(value.toFixed(3))), [0.8, 0.9]);
  assert.equal(material?.getParameter("u_baseColorTextureTexCoord"), 0);
  assert.equal(material?.getParameter("u_normalTextureTexCoord"), 1);
  resources.dispose();
});

test("workstream5 GLTFLoader imports skinning data and animation channels", async () => {
  const positions = floatBytes([-1, 0, 0, 1, 0, 0, 0, 1, 0]);
  const normals = floatBytes([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const texcoords = floatBytes([0, 0, 1, 0, 0.5, 1]);
  const joints = uint16Bytes([0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0]);
  const weights = floatBytes([0.75, 0.25, 0, 0, 0.1, 0.9, 0, 0, 1, 0, 0, 0]);
  const inverseBindMatrices = floatBytes([
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -1, 0, 0, 1
  ]);
  const times = floatBytes([0, 1]);
  const translations = floatBytes([0, 0, 0, 2, 0, 0]);
  const chunks = [positions, normals, texcoords, joints, weights, inverseBindMatrices, times, translations];
  const offsets: number[] = [];
  let byteOffset = 0;
  for (const chunk of chunks) {
    offsets.push(byteOffset);
    byteOffset += chunk.byteLength;
  }
  const binary = Buffer.concat(chunks);
  const gltf = {
    asset: { version: "2.0" },
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews: chunks.map((chunk, index) => ({ buffer: 0, byteOffset: offsets[index], byteLength: chunk.byteLength })),
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 2, componentType: 5126, count: 3, type: "VEC2" },
      { bufferView: 3, componentType: 5123, count: 3, type: "VEC4" },
      { bufferView: 4, componentType: 5126, count: 3, type: "VEC4" },
      { bufferView: 5, componentType: 5126, count: 2, type: "MAT4" },
      { bufferView: 6, componentType: 5126, count: 2, type: "SCALAR" },
      { bufferView: 7, componentType: 5126, count: 2, type: "VEC3" }
    ],
    meshes: [
      {
        name: "skinned-triangle",
        primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2, JOINTS_0: 3, WEIGHTS_0: 4 } }]
      }
    ],
    nodes: [
      { name: "root-joint", children: [1] },
      { name: "child-joint", translation: [1, 0, 0] },
      { name: "skinned-node", mesh: 0, skin: 0 }
    ],
    skins: [{ name: "armature", skeleton: 0, joints: [0, 1], inverseBindMatrices: 5 }],
    animations: [
      {
        name: "slide",
        samplers: [{ input: 6, output: 7, interpolation: "LINEAR" }],
        channels: [{ sampler: 0, target: { node: 2, path: "translation" } }]
      }
    ],
    scenes: [{ nodes: [0, 2] }]
  };
  const url = `data:model/gltf-binary;base64,${createGLB(gltf, binary).toString("base64")}`;

  const asset = await new GLTFLoader().load({ url }, { throwIfAborted: () => undefined } as never);

  assert.equal(asset.meshes[0]?.skinIndex, 0);
  assert.deepEqual(asset.meshes[0]?.normals[0], [0, 0, 1]);
  assert.deepEqual(asset.meshes[0]?.texcoords[2], [0.5, 1]);
  assert.deepEqual(asset.meshes[0]?.joints[0], [0, 1, 0, 0]);
  assert.ok(Math.abs((asset.meshes[0]?.weights[1]?.[0] ?? 0) - 0.1) < 1e-6);
  assert.ok(Math.abs((asset.meshes[0]?.weights[1]?.[1] ?? 0) - 0.9) < 1e-6);
  assert.equal(asset.skins[0]?.name, "armature");
  assert.deepEqual(asset.skins[0]?.joints, [0, 1]);
  assert.equal(asset.skins[0]?.skeleton.bones[1]?.parentIndex, 0);
  assert.equal(asset.skins[0]?.skeleton.matrixPalette().length, 2);
  assert.equal(asset.animations[0]?.name, "slide");
  assert.equal(asset.animations[0]?.tracks[0]?.target, "skinned-node.translation");
  assert.deepEqual(asset.animations[0]?.tracks[0]?.sample(0.5), [1, 0, 0]);
  const serialized = asset.toJSON();
  assert.equal(serialized.meshes[0]?.name, "skinned-triangle");
  assert.equal(serialized.skins[0]?.bones[1]?.name, "child-joint");
  assert.deepEqual(serialized.animations[0]?.tracks[0]?.keyframes[1]?.value, [2, 0, 0]);
});

test("workstream5 GLTFLoader keeps skinning palette in original glTF joint order", async () => {
  const positions = floatBytes([-1, 0, 0, 1, 0, 0, 0, 1, 0]);
  const joints = uint16Bytes([0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0]);
  const weights = floatBytes([1, 0, 0, 0, 1, 0, 0, 0, 0.5, 0.5, 0, 0]);
  const inverseBindMatrices = floatBytes([
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1
  ]);
  const chunks = [positions, joints, weights, inverseBindMatrices];
  const offsets: number[] = [];
  let byteOffset = 0;
  for (const chunk of chunks) {
    offsets.push(byteOffset);
    byteOffset += chunk.byteLength;
  }
  const binary = Buffer.concat(chunks);
  const gltf = {
    asset: { version: "2.0" },
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews: chunks.map((chunk, index) => ({ buffer: 0, byteOffset: offsets[index], byteLength: chunk.byteLength })),
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 1, componentType: 5123, count: 3, type: "VEC4" },
      { bufferView: 2, componentType: 5126, count: 3, type: "VEC4" },
      { bufferView: 3, componentType: 5126, count: 2, type: "MAT4" }
    ],
    meshes: [{ name: "non-topological-skin-mesh", primitives: [{ attributes: { POSITION: 0, JOINTS_0: 1, WEIGHTS_0: 2 } }] }],
    nodes: [
      { name: "root-joint", children: [1] },
      { name: "child-joint", translation: [1, 0, 0] },
      { name: "skinned-node", mesh: 0, skin: 0 }
    ],
    skins: [{ name: "non-topological-armature", joints: [1, 0], inverseBindMatrices: 3 }],
    scenes: [{ nodes: [0, 2] }]
  };
  const url = `data:model/gltf-binary;base64,${createGLB(gltf, binary).toString("base64")}`;

  const asset = await new GLTFLoader().load({ url }, { throwIfAborted: () => undefined } as never);
  const resources = await createGLTFRenderResources(asset);
  const renderable = resources.scene.collectRenderables()[0]?.renderable;

  assert.deepEqual(asset.skins[0]?.joints, [1, 0]);
  assert.equal(asset.skins[0]?.skeleton.bones[0]?.name, "root-joint");
  assert.equal(asset.skins[0]?.skeleton.bones[1]?.name, "child-joint");
  assert.equal(renderable?.skinning?.jointCount, 2);
  assert.equal(renderable?.skinning?.matrices[12], 1);
  assert.equal(renderable?.skinning?.matrices[28], 0);
  resources.dispose();
});

test("workstream5 GLTFLoader rejects malformed skin descriptors", async () => {
  const matrices = floatBytes([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const base = {
    asset: { version: "2.0" },
    buffers: [{ uri: `data:application/octet-stream;base64,${matrices.toString("base64")}`, byteLength: matrices.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: matrices.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 1, type: "MAT4" }],
    nodes: [{ name: "joint-a" }, { name: "joint-b" }],
    skins: [{ name: "invalid-skin", joints: [0, 1], inverseBindMatrices: 0 }],
    scenes: [{ nodes: [0] }]
  };
  type MutableSkinGLTF = typeof base & {
    skins: Array<{ skeleton?: number; joints: number[]; inverseBindMatrices?: number }>;
  };
  const cases: readonly [string, (gltf: MutableSkinGLTF) => void, RegExp][] = [
    ["duplicate joint", (gltf) => { gltf.skins[0]!.joints = [0, 0]; }, /duplicate joint 0/],
    ["missing skeleton", (gltf) => { gltf.skins[0]!.skeleton = 4; }, /missing skeleton node 4/],
    ["inverse bind count", () => undefined, /inverseBindMatrices count must match joints count/]
  ];

  for (const [name, mutate, message] of cases) {
    const gltf = structuredClone(base) as MutableSkinGLTF;
    mutate(gltf);
    await assert.rejects(
      () => new GLTFLoader().load(
        { url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}` },
        { throwIfAborted: () => undefined } as never
      ),
      message,
      name
    );
  }
});

test("workstream5 GLTFLoader imports CUBICSPLINE animation tangents", async () => {
  const times = floatBytes([0, 1]);
  const translations = floatBytes([
    0, 0, 0,
    0, 0, 0,
    2, 0, 0,
    0, 0, 0,
    1, 0, 0,
    0, 0, 0
  ]);
  const binary = Buffer.concat([times, translations]);
  const gltf = {
    asset: { version: "2.0" },
    buffers: [{ uri: `data:application/octet-stream;base64,${binary.toString("base64")}`, byteLength: binary.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: times.byteLength },
      { buffer: 0, byteOffset: times.byteLength, byteLength: translations.byteLength }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 2, type: "SCALAR" },
      { bufferView: 1, componentType: 5126, count: 6, type: "VEC3" }
    ],
    nodes: [{ name: "spline-node" }],
    animations: [
      {
        name: "eased-slide",
        samplers: [{ input: 0, output: 1, interpolation: "CUBICSPLINE" }],
        channels: [{ sampler: 0, target: { node: 0, path: "translation" } }]
      }
    ],
    scenes: [{ nodes: [0] }]
  };
  const url = `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;

  const asset = await new GLTFLoader().load({ url }, { throwIfAborted: () => undefined } as never);
  const track = asset.animations[0]?.tracks[0];

  assert.equal(track?.target, "spline-node.translation");
  assert.deepEqual(track?.keyframes[0]?.outTangent, [2, 0, 0]);
  assert.deepEqual(track?.sample(0.5), [0.75, 0, 0]);
  assert.deepEqual(asset.toJSON().animations[0]?.tracks[0]?.keyframes[0]?.outTangent, [2, 0, 0]);
});

test("workstream5 GLTFLoader imports multi-target morph weight animation channels", async () => {
  const times = floatBytes([0, 1]);
  const weights = floatBytes([0, 0.2, 0.4, 0.5, 0.7, 0.9]);
  const binary = Buffer.concat([times, weights]);
  const gltf = {
    asset: { version: "2.0" },
    buffers: [{ uri: `data:application/octet-stream;base64,${binary.toString("base64")}`, byteLength: binary.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: times.byteLength },
      { buffer: 0, byteOffset: times.byteLength, byteLength: weights.byteLength }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 2, type: "SCALAR" },
      { bufferView: 1, componentType: 5126, count: 2, type: "VEC3" }
    ],
    nodes: [{ name: "morph-node" }],
    animations: [
      {
        name: "morph-weights",
        samplers: [{ input: 0, output: 1, interpolation: "LINEAR" }],
        channels: [{ sampler: 0, target: { node: 0, path: "weights" } }]
      }
    ],
    scenes: [{ nodes: [0] }]
  };
  const url = `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;

  const asset = await new GLTFLoader().load({ url }, { throwIfAborted: () => undefined } as never);
  const track = asset.animations[0]?.tracks[0];

  assert.equal(track?.target, "morph-node.weights");
  assert.equal(track?.valueType, "number-array");
  assert.deepEqual((track?.sample(0.5) as readonly number[] | undefined)?.map((value) => Number(value.toFixed(3))), [0.25, 0.45, 0.65]);
  assert.deepEqual((asset.toJSON().animations[0]?.tracks[0]?.keyframes[1]?.value as readonly number[] | undefined)?.map((value) => Number(value.toFixed(3))), [0.5, 0.7, 0.9]);
});

test("workstream5 GLTFLoader skips optional KHR_animation_pointer channels without dropping node tracks", async () => {
  const times = floatBytes([0, 1]);
  const translations = floatBytes([0, 0, 0, 2, 0, 0]);
  const colors = floatBytes([1, 0, 0, 1, 0, 1, 0, 1]);
  const binary = Buffer.concat([times, translations, colors]);
  const gltf = {
    asset: { version: "2.0" },
    extensionsUsed: ["KHR_animation_pointer"],
    buffers: [{ uri: `data:application/octet-stream;base64,${binary.toString("base64")}`, byteLength: binary.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: times.byteLength },
      { buffer: 0, byteOffset: times.byteLength, byteLength: translations.byteLength },
      { buffer: 0, byteOffset: times.byteLength + translations.byteLength, byteLength: colors.byteLength }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 2, type: "SCALAR" },
      { bufferView: 1, componentType: 5126, count: 2, type: "VEC3" },
      { bufferView: 2, componentType: 5126, count: 2, type: "VEC4" }
    ],
    materials: [{ name: "animated-material", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] } }],
    nodes: [{ name: "animated-node" }],
    animations: [
      {
        name: "node-and-material",
        samplers: [{ input: 0, output: 1, interpolation: "LINEAR" }, { input: 0, output: 2, interpolation: "LINEAR" }],
        channels: [
          { sampler: 0, target: { node: 0, path: "translation" } },
          {
            sampler: 1,
            target: {
              path: "pointer",
              extensions: { KHR_animation_pointer: { pointer: "/materials/0/pbrMetallicRoughness/baseColorFactor" } }
            }
          }
        ]
      }
    ],
    scenes: [{ nodes: [0] }]
  };

  const asset = await new GLTFLoader().load(
    { url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}` },
    { throwIfAborted: () => undefined } as never
  );

  assert.equal(asset.loaderDiagnostics.unsupportedExtensions.includes("KHR_animation_pointer"), true);
  assert.equal(asset.animations[0]?.tracks.length, 1);
  assert.equal(asset.animations[0]?.tracks[0]?.target, "animated-node.translation");
});

test("workstream5 GLTFLoader rejects unsupported animation interpolation and target paths", async () => {
  const times = floatBytes([0, 1]);
  const translations = floatBytes([0, 0, 0, 2, 0, 0]);
  const binary = Buffer.concat([times, translations]);
  const base = {
    asset: { version: "2.0" },
    buffers: [{ uri: `data:application/octet-stream;base64,${binary.toString("base64")}`, byteLength: binary.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: times.byteLength },
      { buffer: 0, byteOffset: times.byteLength, byteLength: translations.byteLength }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 2, type: "SCALAR" },
      { bufferView: 1, componentType: 5126, count: 2, type: "VEC3" }
    ],
    nodes: [{ name: "animated-node" }],
    animations: [
      {
        name: "invalid-animation",
        samplers: [{ input: 0, output: 1, interpolation: "LINEAR" }],
        channels: [{ sampler: 0, target: { node: 0, path: "translation" } }]
      }
    ],
    scenes: [{ nodes: [0] }]
  };

  const invalidInterpolation = structuredClone(base);
  invalidInterpolation.animations[0]!.samplers[0]!.interpolation = "CATMULLROMSPLINE";
  await assert.rejects(
    () => new GLTFLoader().load(
      { url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(invalidInterpolation))}` },
      { throwIfAborted: () => undefined } as never
    ),
    /interpolation CATMULLROMSPLINE is unsupported/
  );

  const invalidPath = structuredClone(base);
  invalidPath.animations[0]!.channels[0]!.target.path = "color";
  await assert.rejects(
    () => new GLTFLoader().load(
      { url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(invalidPath))}` },
      { throwIfAborted: () => undefined } as never
    ),
    /target path color is unsupported/
  );
});

test("workstream5 GLTFLoader imports morph target geometry and default weights", async () => {
  const positions = floatBytes([-1, 0, 0, 1, 0, 0, 0, 1, 0]);
  const tangents = floatBytes([1, 0, 0, 1, 0, 1, 0, -1, -1, 0, 0, 1]);
  const morphPositions = floatBytes([0, 0, 0.25, 0, 0, 0.5, 0, 0, 1]);
  const morphTangents = floatBytes([0, 0.25, 0, 0.5, 0, 0, 0, -0.25, 0]);
  const morphPositionOffset = positions.byteLength + tangents.byteLength;
  const morphTangentOffset = morphPositionOffset + morphPositions.byteLength;
  const binary = Buffer.concat([positions, tangents, morphPositions, morphTangents]);
  const gltf = {
    asset: { version: "2.0" },
    buffers: [{ uri: `data:application/octet-stream;base64,${binary.toString("base64")}`, byteLength: binary.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: tangents.byteLength },
      { buffer: 0, byteOffset: morphPositionOffset, byteLength: morphPositions.byteLength },
      { buffer: 0, byteOffset: morphTangentOffset, byteLength: morphTangents.byteLength }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC4" },
      { bufferView: 2, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 3, componentType: 5126, count: 3, type: "VEC3" }
    ],
    meshes: [
      {
        name: "morph-triangle",
        weights: [0.5],
        primitives: [{ attributes: { POSITION: 0, TANGENT: 1 }, targets: [{ POSITION: 2, TANGENT: 3 }] }]
      }
    ],
    nodes: [{ name: "morph-node", mesh: 0 }],
    scenes: [{ nodes: [0] }]
  };
  const url = `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;

  const asset = await new GLTFLoader().load({ url }, { throwIfAborted: () => undefined } as never);
  const mesh = asset.meshes[0];

  assert.equal(mesh?.morphTargets.length, 1);
  assert.deepEqual(mesh?.morphTargets[0]?.positions[2], [0, 0, 1]);
  assert.deepEqual(mesh?.morphTargets[0]?.tangents[1], [0.5, 0, 0]);
  assert.deepEqual(mesh?.morphWeights, [0.5]);
  assert.deepEqual(asset.createScene().collectRenderables()[0]?.renderable.morphWeights, [0.5]);
  assert.deepEqual(asset.toJSON().meshes[0]?.morphTargets[0]?.positions[1], [0, 0, 0.5]);
  assert.deepEqual(asset.toJSON().meshes[0]?.morphTargets[0]?.tangents[2], [0, -0.25, 0]);

  const resources = await createGLTFRenderResources(asset);
  assert.deepEqual(resources.morphTargetLibrary.get("morph-triangle")?.[0]?.tangents?.[0], [0, 0.25, 0]);
  resources.dispose();
});

test("workstream5 GLTFLoader rejects malformed morph target descriptors and weights", async () => {
  const positions = floatBytes([-1, 0, 0, 1, 0, 0, 0, 1, 0]);
  const morphPositions = floatBytes([0, 0, 0.25, 0, 0, 0.5, 0, 0, 1]);
  const shortMorphPositions = floatBytes([0, 0, 0.25, 0, 0, 0.5]);
  const binary = Buffer.concat([positions, morphPositions, shortMorphPositions]);
  const shortMorphOffset = positions.byteLength + morphPositions.byteLength;
  const base = {
    asset: { version: "2.0" },
    buffers: [{ uri: `data:application/octet-stream;base64,${binary.toString("base64")}`, byteLength: binary.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: morphPositions.byteLength },
      { buffer: 0, byteOffset: shortMorphOffset, byteLength: shortMorphPositions.byteLength }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 2, componentType: 5126, count: 2, type: "VEC3" }
    ],
    meshes: [
      {
        name: "morph-validation",
        weights: [0.5],
        primitives: [{ attributes: { POSITION: 0 }, targets: [{ POSITION: 1 }] }]
      }
    ],
    nodes: [{ name: "morph-validation-node", mesh: 0 }],
    scenes: [{ nodes: [0] }]
  };
  type MutableMorphGLTF = typeof base & {
    meshes: [{
      weights?: unknown;
      primitives: [{ targets?: unknown }];
    }];
  };
  const cases: readonly [string, (gltf: MutableMorphGLTF) => void, RegExp][] = [
    ["targets not array", (gltf) => { gltf.meshes[0]!.primitives[0]!.targets = { POSITION: 1 }; }, /targets must be an array/],
    ["target not object", (gltf) => { gltf.meshes[0]!.primitives[0]!.targets = [null]; }, /morph target 0 must be an object/],
    ["unsupported color target", (gltf) => { gltf.meshes[0]!.primitives[0]!.targets = [{ COLOR_0: 1 }]; }, /attribute COLOR_0 is unsupported/],
    ["negative target accessor", (gltf) => { gltf.meshes[0]!.primitives[0]!.targets = [{ POSITION: -1 }]; }, /POSITION accessor must be a non-negative integer/],
    ["target count mismatch", (gltf) => { gltf.meshes[0]!.primitives[0]!.targets = [{ POSITION: 2 }]; }, /POSITION count mismatch/],
    ["tangent count mismatch", (gltf) => { gltf.meshes[0]!.primitives[0]!.targets = [{ TANGENT: 2 }]; }, /TANGENT count mismatch/],
    ["weights not array", (gltf) => { gltf.meshes[0]!.weights = 0.5; }, /weights must be an array/],
    ["weights count mismatch", (gltf) => { gltf.meshes[0]!.weights = [0.25, 0.75]; }, /weights count must match morph target count/],
    ["non-finite weight", (gltf) => { gltf.meshes[0]!.weights = [Number.POSITIVE_INFINITY]; }, /weights must contain finite numbers/]
  ];

  for (const [name, mutate, message] of cases) {
    const gltf = structuredClone(base) as MutableMorphGLTF;
    mutate(gltf);
    await assert.rejects(
      () => new GLTFLoader().load(
        { url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}` },
        { throwIfAborted: () => undefined } as never
      ),
      message,
      name
    );
  }
});

test("workstream5 GLTFLoader rejects materials that reference missing textures", async () => {
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

test("workstream5 shader and material loaders validate fetched descriptors", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request) => {
    const href = String(url);
    if (href.endsWith("surface.wgsl")) {
      return new Response("@fragment fn main() -> @location(0) vec4f { return vec4f(1.0); }");
    }
    if (href.endsWith("surface.material.json")) {
      return Response.json({
        name: "surface",
        model: "pbr",
        properties: {
          baseColorFactor: [0.1, 0.2, 0.3, 1],
          metallicFactor: 0.25,
          roughnessFactor: 0.65,
          emissiveFactor: [0.02, 0.03, 0.04],
          shader: "surface.wgsl"
        }
      });
    }
    if (href.endsWith("flat.material.json")) {
      return Response.json({
        name: "flat",
        model: "unlit",
        properties: { color: [0.8, 0.7, 0.6, 1] }
      });
    }
    if (href.endsWith("invalid.material.json")) {
      return Response.json({
        name: "invalid",
        model: "pbr",
        properties: { roughnessFactor: 2 }
      });
    }
    return new Response("missing", { status: 404 });
  }) as typeof fetch;

  try {
    const shader = await new ShaderLoader().load({ url: "https://assets.example/surface.wgsl" }, { throwIfAborted: () => undefined } as never);
    const material = await new MaterialLoader().load({ url: "https://assets.example/surface.material.json" }, { throwIfAborted: () => undefined } as never);

    assert.match(shader.source, /@fragment/);
    assert.equal(material.name, "surface");
    assert.equal(material.model, "pbr");
    assert.deepEqual(material.properties.baseColorFactor, [0.1, 0.2, 0.3, 1]);
    const runtimeMaterial = material.createMaterial();
    assert.ok(runtimeMaterial instanceof PBRMaterial);
    assert.deepEqual(runtimeMaterial.getParameter("u_baseColor"), [0.1, 0.2, 0.3, 1]);
    assert.equal(runtimeMaterial.getParameter("u_metallic"), 0.25);
    assert.equal(runtimeMaterial.getParameter("u_roughness"), 0.65);
    assert.deepEqual(runtimeMaterial.getParameter("u_emissiveColor"), [0.02, 0.03, 0.04]);

    const flat = await new MaterialLoader().load({ url: "https://assets.example/flat.material.json" }, { throwIfAborted: () => undefined } as never);
    const flatMaterial = flat.createMaterial();
    assert.ok(flatMaterial instanceof UnlitMaterial);
    assert.deepEqual(flatMaterial.getParameter("u_baseColor"), [0.8, 0.7, 0.6, 1]);

    const invalid = await new MaterialLoader().load({ url: "https://assets.example/invalid.material.json" }, { throwIfAborted: () => undefined } as never);
    assert.throws(() => invalid.createMaterial(), /roughness/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("workstream5 SceneLoader imports hierarchy and animation clips", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    Response.json({
      nodes: [
        {
          name: "animated-root",
          translation: [1, 2, 3],
          children: [{ name: "child", scale: [2, 2, 2] }]
        }
      ],
      animations: [
        {
          name: "move-root",
          duration: 1,
          tracks: [
            {
              target: "animated-root.translation",
              valueType: "vector3",
              keyframes: [
                { time: 0, value: [1, 2, 3] },
                { time: 1, value: [4, 5, 6] }
              ]
            }
          ],
          events: [{ time: 1, name: "arrived" }]
        }
      ]
    })) as typeof fetch;

  try {
    const asset = await new SceneLoader().load({ url: "https://assets.example/level.scene.json" }, { throwIfAborted: () => undefined } as never);
    const [root] = asset.scene.findByName("animated-root");
    const [child] = asset.scene.findByName("child");

    assert.ok(root);
    assert.ok(child);
    assert.deepEqual(root.transform.position, [1, 2, 3]);
    assert.deepEqual(child.transform.scale, [2, 2, 2]);
    assert.equal(asset.animations[0]?.name, "move-root");
    assert.deepEqual(asset.animations[0]?.tracks[0]?.sample(0.5), [2.5, 3.5, 4.5]);
    assert.equal(asset.animations[0]?.events[0]?.name, "arrived");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("workstream5 WorkerAssetJobs delegates to worker and falls back to import pipeline", async () => {
  const workerJobs = new WorkerAssetJobs(new ImportPipeline(), {
    async run(job) {
      return { id: job.id, output: `${job.input}-worker` } as never;
    }
  });

  assert.deepEqual(await workerJobs.run({ id: "compress", url: "hero.ktx2", input: "texture" }), {
    id: "compress",
    output: "texture-worker"
  });

  const pipeline = new ImportPipeline()
    .addStage<string, string>({
      name: "decode",
      run: (input) => `${input}:decoded`
    })
    .addStage<string, { readonly output: string }>({
      name: "optimize",
      run: (input, context) => ({ output: `${context.url}:${input}:optimized` })
    });
  const fallbackJobs = new WorkerAssetJobs(pipeline);

  assert.deepEqual(await fallbackJobs.run<string, { readonly output: string }>({ id: "mesh", url: "mesh.glb", input: "bytes" }), {
    output: "mesh.glb:bytes:decoded:optimized"
  });
});

test("workstream5 WorkerAssetJobs rejects aborts while worker or fallback pipeline is running", async () => {
  const workerController = new AbortController();
  const workerJobs = new WorkerAssetJobs(new ImportPipeline(), {
    run: () => new Promise(() => undefined)
  });
  const workerPromise = workerJobs.run({ id: "compress", url: "hero.ktx2", input: "texture", signal: workerController.signal });

  workerController.abort();

  await assert.rejects(() => workerPromise, /Worker asset job aborted: compress/);

  const pipelineController = new AbortController();
  const pipeline = new ImportPipeline().addStage<string, string>({
    name: "decode",
    run: () => new Promise(() => undefined)
  });
  const fallbackJobs = new WorkerAssetJobs(pipeline);
  const fallbackPromise = fallbackJobs.run({
    id: "mesh",
    url: "mesh.glb",
    input: "bytes",
    signal: pipelineController.signal
  });

  pipelineController.abort();

  await assert.rejects(() => fallbackPromise, /Worker asset job aborted: mesh/);
});

test("workstream5 ImportPipeline reports ordered async stages, skipped stages, and rollbacks", async () => {
  const events: string[] = [];
  const rollbacks: string[] = [];
  const pipeline = new ImportPipeline()
    .addStage<string, string>({
      name: "decode",
      run: async (input) => `${input}:decoded`,
      rollback: (output) => {
        rollbacks.push(output);
      }
    })
    .addStage<string, string>({
      name: "skip-cache-hit",
      canRun: () => false,
      run: () => {
        throw new Error("skipped stage should not run");
      }
    })
    .addStage<string, string>({
      name: "validate",
      run: (input) => {
        throw new Error(`invalid payload ${input}`);
      }
    });

  await assert.rejects(
    () =>
      pipeline.run<string, string>("bytes", {
        url: "asset.glb",
        onProgress: (event) => events.push(`${event.stageName}:${event.status}`)
      }),
    (error: unknown) => {
      assert.ok(error instanceof ImportPipelineError);
      assert.equal(error.url, "asset.glb");
      assert.match(error.message, /invalid payload bytes:decoded/);
      assert.match(String(error.cause), /invalid payload/);
      return true;
    }
  );

  assert.deepEqual(events, [
    "decode:started",
    "decode:completed",
    "skip-cache-hit:skipped",
    "validate:started",
    "decode:rollback-started",
    "decode:rollback-completed"
  ]);
  assert.deepEqual(rollbacks, ["bytes:decoded"]);
});

test("workstream5 ImportPipeline aborts running stages with stage diagnostics", async () => {
  const controller = new AbortController();
  const events: string[] = [];
  const pipeline = new ImportPipeline().addStage<string, string>({
    name: "transcode",
    run: () => new Promise(() => undefined)
  });
  const promise = pipeline.run<string, string>("basis-bytes", {
    url: "texture.ktx2",
    signal: controller.signal,
    onProgress: (event) => events.push(`${event.stageName}:${event.status}`)
  });

  controller.abort("user-cancelled");

  await assert.rejects(
    () => promise,
    (error: unknown) => {
      assert.ok(error instanceof ImportPipelineError);
      assert.equal(error.url, "texture.ktx2");
      assert.equal(error.stageName, "transcode");
      assert.equal(error.cause, "user-cancelled");
      assert.match(error.message, /Import pipeline aborted at stage transcode/);
      return true;
    }
  );
  assert.deepEqual(events, ["transcode:started"]);
});

test("workstream5 mesh optimization removes unused vertices and runs as an import stage", async () => {
  const optimized = optimizeIndexedMesh({
    vertexCount: 5,
    indices: [2, 4, 2, 1],
    attributes: {
      POSITION: [
        [0, 0, 0],
        [1, 0, 0],
        [2, 0, 0],
        [3, 0, 0],
        [4, 0, 0]
      ],
      MATERIAL_ID: [0, 1, 2, 3, 4]
    }
  });

  assert.equal(optimized.vertexCount, 3);
  assert.deepEqual(optimized.indices, [0, 1, 0, 2]);
  assert.deepEqual(optimized.remap, [-1, 2, 0, -1, 1]);
  assert.equal(optimized.removedVertices, 2);
  assert.deepEqual(optimized.attributes.POSITION, [
    [2, 0, 0],
    [4, 0, 0],
    [1, 0, 0]
  ]);
  assert.deepEqual(optimized.attributes.MATERIAL_ID, [2, 4, 1]);

  const pipeline = new ImportPipeline().addStage(createMeshOptimizationStage({ name: "remove-unused-vertices" }));
  const pipelineResult = await pipeline.run<
    Parameters<typeof optimizeIndexedMesh>[0],
    ReturnType<typeof optimizeIndexedMesh>
  >(
    {
      vertexCount: 4,
      indices: [3, 1, 3],
      attributes: { POSITION: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]] }
    },
    { url: "mesh.glb" }
  );
  assert.deepEqual(pipelineResult.indices, [0, 1, 0]);
  assert.equal(pipelineResult.removedVertices, 2);
});

test("workstream5 mesh optimization rejects malformed mesh descriptors", () => {
  assert.throws(
    () => optimizeIndexedMesh({ vertexCount: 2, indices: [0, 2] }),
    /index 1 references invalid vertex 2/
  );
  assert.throws(
    () => optimizeIndexedMesh({ vertexCount: 2, indices: [0], attributes: { POSITION: [[0, 0, 0]] } }),
    /attribute POSITION must contain exactly 2 values/
  );
  assert.throws(
    () => optimizeIndexedMesh({ vertexCount: 1, indices: [0], attributes: { POSITION: [[Number.NaN, 0, 0]] } }),
    /attribute POSITION\[0\]/
  );
});

test("workstream5 texture mip generation builds deterministic RGBA8 levels and runs as an import stage", async () => {
  const source = new Uint8Array([
    255, 0, 0, 255,
    0, 255, 0, 255,
    0, 0, 255, 255,
    255, 255, 255, 255
  ]);
  const mipChain = generateTextureMipChain({ width: 2, height: 2, data: source, colorSpace: "linear" });

  assert.equal(mipChain.width, 2);
  assert.equal(mipChain.height, 2);
  assert.equal(mipChain.colorSpace, "linear");
  assert.equal(mipChain.levels.length, 2);
  assert.notEqual(mipChain.levels[0]?.data, source);
  assert.deepEqual(Array.from(mipChain.levels[1]?.data ?? []), [128, 128, 128, 255]);

  const pipeline = new ImportPipeline().addStage(createTextureMipGenerationStage({ name: "build-mips" }));
  const pipelineResult = await pipeline.run<
    Parameters<typeof generateTextureMipChain>[0],
    ReturnType<typeof generateTextureMipChain>
  >(
    {
      width: 3,
      height: 1,
      data: new Uint8Array([
        10, 20, 30, 255,
        30, 40, 50, 255,
        90, 100, 110, 255
      ])
    },
    { url: "albedo.png" }
  );

  assert.deepEqual(pipelineResult.levels.map((level) => [level.width, level.height]), [[3, 1], [2, 1], [1, 1]]);
  assert.deepEqual(Array.from(pipelineResult.levels[1]?.data ?? []), [
    20, 30, 40, 255,
    90, 100, 110, 255
  ]);
});

test("workstream5 texture mip generation rejects malformed texture descriptors", () => {
  assert.throws(
    () => generateTextureMipChain({ width: 0, height: 1, data: new Uint8Array(0) }),
    /width must be a positive integer/
  );
  assert.throws(
    () => generateTextureMipChain({ width: 1, height: 1, data: new Uint8Array(3) }),
    /width \* height \* 4/
  );
  assert.throws(
    () => generateTextureMipChain({ width: 1, height: 1, data: new Uint8Array(4), colorSpace: "display-p3" as never }),
    /colorSpace/
  );
});

test("workstream5 picking ray and interaction target lifecycle work", () => {
  const scene = new Scene();
  const camera = scene.createPerspectiveCamera({ aspect: 1 });
  scene.root.addChild(camera);
  camera.setViewport({ x: 0, y: 0, width: 100, height: 100 });
  const ray = pickingRayFromCamera(camera, 50, 50);
  assert.ok(ray.direction.equals(new Vector3(0, 0, -1), 1e-6));

  const events: string[] = [];
  const interaction = new InteractionSystem(
    () => new Ray(new Vector3(0, 0, 5), new Vector3(0, 0, -1)),
    () => [{ id: "target", bounds: { min: [-1, -1, 0], max: [1, 1, 1] } }]
  );
  interaction.subscribe((event) => events.push(event.type));
  const down = new InputSnapshot({ pointer: { buttons: new Map([[0, { down: true, pressed: false, released: false }]]) } });
  const hit = interaction.update(down);
  const up = new InputSnapshot({ pointer: { buttons: new Map() }, previousPointerButtons: new Set([0]) });
  interaction.update(up);

  assert.equal(hit?.target.id, "target");
  assert.deepEqual(events, ["hover-enter", "pointer-down", "click"]);
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

function floatBytes(values: readonly number[]): Buffer {
  const buffer = Buffer.alloc(values.length * 4);
  new Float32Array(buffer.buffer, buffer.byteOffset, values.length).set(values);
  return buffer;
}

function uint16Bytes(values: readonly number[]): Buffer {
  const buffer = Buffer.alloc(values.length * 2);
  new Uint16Array(buffer.buffer, buffer.byteOffset, values.length).set(values);
  return buffer;
}

function int16Bytes(values: readonly number[]): Buffer {
  const buffer = Buffer.alloc(values.length * 2);
  new Int16Array(buffer.buffer, buffer.byteOffset, values.length).set(values);
  return buffer;
}

test("workstream5 scene audio bridge syncs listener and spatial source", () => {
  const scene = new Scene();
  const listenerNode = scene.createNode("listener");
  const sourceNode = scene.createNode("source");
  scene.root.addChild(listenerNode);
  scene.root.addChild(sourceNode);
  listenerNode.transform.setPosition(1, 2, 3);
  sourceNode.transform.setPosition(4, 5, 6);
  const listener = new AudioListener();
  const spatial = {
    position: { x: 0, y: 0, z: 0 },
    setPosition(position: { readonly x: number; readonly y: number; readonly z: number }) {
      this.position = { ...position };
    }
  };

  const bridge = new SceneAudioBridge(scene);
  bridge.bindListener(listenerNode, listener);
  bridge.bindSource(sourceNode, spatial as never);
  bridge.update();

  assert.deepEqual(listener.position, { x: 1, y: 2, z: 3 });
  assert.deepEqual(spatial.position, { x: 4, y: 5, z: 6 });
});

test("workstream5 editor picking and translate gizmo route through command history", async () => {
  const scene = new Scene();
  const node = scene.createNode("editable");
  scene.root.addChild(node);
  const picking = new PickingService();
  picking.addTarget({ id: "editable", node, bounds: { min: [-1, -1, -1], max: [1, 1, 1] } });

  const hit = picking.pick(new Ray(new Vector3(0, 0, 5), new Vector3(0, 0, -1)));
  assert.equal(hit?.target.node, node);

  const history = new CommandHistory();
  const gizmo = new TranslateGizmo(history);
  gizmo.setTarget(node);
  await gizmo.drag({ axis: "x", delta: 2 });
  assert.equal(node.transform.position[0], 2);
  await history.undo();
  assert.equal(node.transform.position[0], 0);
});

test("workstream5 editor command transactions roll back partial execution", async () => {
  const history = new CommandHistory();
  const calls: string[] = [];
  const first: Command = {
    name: "first",
    execute() {
      calls.push("first:execute");
    },
    undo() {
      calls.push("first:undo");
    }
  };
  const second: Command = {
    name: "second",
    execute() {
      calls.push("second:execute");
      throw new Error("second failed");
    },
    undo() {
      calls.push("second:undo");
    }
  };

  await assert.rejects(() => history.executeTransaction([first, second]), /second failed/);

  assert.deepEqual(calls, ["first:execute", "second:execute", "first:undo"]);
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, false);
  assert.equal(history.undoDepth, 0);
  assert.equal(history.redoDepth, 0);
});

test("workstream5 editor command transactions undo and redo as one history entry", async () => {
  const history = new CommandHistory();
  const values: string[] = [];
  const createPushCommand = (value: string): Command => ({
    name: `push ${value}`,
    execute() {
      values.push(value);
    },
    undo() {
      const index = values.lastIndexOf(value);
      if (index >= 0) {
        values.splice(index, 1);
      }
    }
  });

  await history.executeTransaction([createPushCommand("a"), createPushCommand("b")]);
  assert.deepEqual(values, ["a", "b"]);
  assert.equal(history.undoDepth, 1);

  await history.undo();
  assert.deepEqual(values, []);
  assert.equal(history.redoDepth, 1);

  await history.redo();
  assert.deepEqual(values, ["a", "b"]);
});

test("workstream5 editor command history keeps entries when undo or redo fail", async () => {
  const undoHistory = new CommandHistory();
  const failingUndo: Command = {
    name: "failing undo",
    execute() {},
    undo() {
      throw new Error("undo failed");
    }
  };
  await undoHistory.execute(failingUndo);
  await assert.rejects(() => undoHistory.undo(), /undo failed/);
  assert.equal(undoHistory.undoDepth, 1);
  assert.equal(undoHistory.redoDepth, 0);

  const redoHistory = new CommandHistory();
  let failRedo = false;
  const failingRedo: Command = {
    name: "failing redo",
    execute() {
      if (failRedo) {
        throw new Error("redo failed");
      }
    },
    undo() {}
  };
  await redoHistory.execute(failingRedo);
  await redoHistory.undo();
  failRedo = true;
  await assert.rejects(() => redoHistory.redo(), /redo failed/);
  assert.equal(redoHistory.undoDepth, 0);
  assert.equal(redoHistory.redoDepth, 1);
});

test("workstream5 editor delete node command restores scene parent and sibling order", async () => {
  const scene = new Scene();
  const parent = scene.createNode("parent");
  const child = scene.createNode("child");
  const sibling = scene.createNode("sibling");
  scene.root.addChild(parent);
  parent.addChild(child);
  parent.addChild(sibling);

  const container = {
    add: (node: typeof child) => parent.addChild(node),
    remove: (node: typeof child) => parent.removeChild(node)
  };
  const history = new CommandHistory();

  await history.execute(new DeleteNodeCommand(container, child));
  assert.equal(child.parent, null);
  assert.deepEqual(parent.children.map((node) => node.name), ["sibling"]);

  await history.undo();
  assert.equal(child.parent, parent);
  assert.deepEqual(parent.children.map((node) => node.name), ["child", "sibling"]);

  await history.redo();
  assert.equal(child.parent, null);
  assert.deepEqual(parent.children.map((node) => node.name), ["sibling"]);
});

test("workstream5 editor delete node command keeps generic container fallback for unparented scene nodes", async () => {
  const scene = new Scene();
  const node = scene.createNode("loose");
  const nodes = [node];
  const container = {
    add: (value: typeof node) => nodes.push(value),
    remove: (value: typeof node) => {
      const index = nodes.indexOf(value);
      if (index >= 0) {
        nodes.splice(index, 1);
      }
    }
  };
  const history = new CommandHistory();

  await history.execute(new DeleteNodeCommand(container, node));
  assert.deepEqual(nodes, []);

  await history.undo();
  assert.deepEqual(nodes, [node]);
});
