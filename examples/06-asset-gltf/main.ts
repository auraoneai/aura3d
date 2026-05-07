import { AssetManager, createGLTFRenderResources, GLTFLoader } from "@galileo3d/assets";
import { createExample, installExampleStyles, type ExampleMetadata } from "../shared/exampleHarness.js";

const metadata: ExampleMetadata = {
  id: "06-asset-gltf",
  title: "06 Asset glTF",
  purpose: "Load an asset through the public AssetManager while the glTF-specific public loader is pending.",
  acceptance: "A loaded asset descriptor is visible and cache-backed load metadata is exposed.",
};

if (typeof document !== "undefined") {
  installExampleStyles();
  void createExample(metadata, async () => {
    const manager = new AssetManager();
    manager.register(new GLTFLoader());
    const handle = await manager.load(createTriangleGltfDataUri());
    const mesh = handle.value.meshes[0];
    const resources = await createGLTFRenderResources(handle.value);
    const camera = resources.scene.createOrthographicCamera({ name: "asset-camera", left: -1.4, right: 1.4, bottom: -1, top: 1, near: 0.1, far: 20 });
    const light = resources.scene.createLight("directional", "asset-key");
    light.intensity = 1.1;
    resources.scene.root.addChild(camera);
    resources.scene.root.addChild(light);
    for (const { node } of resources.scene.collectRenderables()) {
      node.transform.setPosition(0, 0, -3);
    }

    return {
      renderSource: {
        scene: resources.scene,
        geometryLibrary: resources.geometryLibrary,
        materialLibrary: resources.materialLibrary,
        morphTargetLibrary: resources.morphTargetLibrary,
      },
      metrics: { assetId: handle.id, type: handle.type, meshCount: handle.value.meshes.length, vertexCount: mesh?.positions.length ?? 0, cameras: resources.scene.collectCameras().length, lights: resources.scene.collectLights().length, sceneRenderables: resources.scene.collectRenderables().length, gltfPublicApi: true, webgl2: true },
      async dispose() {
        resources.dispose();
        await manager.release(handle);
      },
    };
  });
}

function createTriangleGltfDataUri(): string {
  const positions = new Float32Array([
    -0.5, -0.5, 0,
    0.5, -0.5, 0,
    0, 0.5, 0,
  ]);
  const normals = new Float32Array([
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
  ]);
  const indices = new Uint16Array([0, 1, 2]);
  const indexOffset = positions.byteLength + normals.byteLength;
  const bytes = new Uint8Array(indexOffset + indices.byteLength);
  bytes.set(new Uint8Array(positions.buffer), 0);
  bytes.set(new Uint8Array(normals.buffer), positions.byteLength);
  bytes.set(new Uint8Array(indices.buffer), indexOffset);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  const bufferUri = `data:application/octet-stream;base64,${btoa(binary)}`;
  const gltf = {
    asset: { version: "2.0" },
    buffers: [{ uri: bufferUri, byteLength: bytes.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: normals.byteLength },
      { buffer: 0, byteOffset: indexOffset, byteLength: indices.byteLength },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.5, -0.5, 0], max: [0.5, 0.5, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: 3, type: "SCALAR" },
    ],
    materials: [{ name: "inline-purple", pbrMetallicRoughness: { baseColorFactor: [0.7, 0.55, 1, 1], roughnessFactor: 0.45, metallicFactor: 0.05 } }],
    meshes: [{ name: "inline-triangle", primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  };
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
}
