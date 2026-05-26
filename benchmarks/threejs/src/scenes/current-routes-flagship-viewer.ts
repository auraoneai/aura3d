// @ts-nocheck
import * as THREE from "three";
import { GLTFLoader } from "/node_modules/three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "/node_modules/three/examples/jsm/loaders/RGBELoader.js";
import type { CurrentFlagshipViewerSceneConfig } from "../../../aura3d/src/scenes/current-routes-flagship-viewer.js";

export interface CurrentThreeFlagshipCamera {
  readonly cameraPosition: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly fovYRadians: number;
}

export interface CurrentThreeFlagshipBounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export interface CurrentThreeFlagshipRenderResult {
  readonly engine: "threejs";
  readonly status: "ready";
  readonly renderer: {
    readonly actualThreeRenderer: true;
    readonly threeRevision: string;
    readonly drawCalls: number;
    readonly triangles: number;
    readonly geometries: number;
    readonly textures: number;
  };
  readonly asset: {
    readonly id: string;
    readonly uri: string;
    readonly meshCount: number;
    readonly materialCount: number;
  };
  readonly environment: {
    readonly id: string;
    readonly uri: string;
    readonly pmremGenerator: true;
  };
  readonly camera: CurrentThreeFlagshipCamera;
  readonly pixels: {
    readonly nonBlackPixels: number;
    readonly uniqueColorBuckets: number;
    readonly averageLuma: number;
    readonly maxLuma: number;
  };
  readonly dataUrl: string;
}

export async function renderThreeFlagshipViewer(options: {
  readonly canvas: HTMLCanvasElement;
  readonly scene: CurrentFlagshipViewerSceneConfig;
  readonly camera: CurrentThreeFlagshipCamera;
  readonly bounds: CurrentThreeFlagshipBounds;
}): Promise<CurrentThreeFlagshipRenderResult> {
  const { canvas, scene, camera: cameraSpec, bounds } = options;
  canvas.width = scene.width;
  canvas.height = scene.height;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(scene.width, scene.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = scene.render.exposure;
  if (!(renderer instanceof THREE.WebGLRenderer)) {
    throw new Error("Three.js parity requires an actual THREE.WebGLRenderer.");
  }

  const pmrem = new THREE.PMREMGenerator(renderer);
  const hdrTexture = await loadHdr(absoluteUrl(scene.hdrUri));
  hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
  const environment = pmrem.fromEquirectangular(hdrTexture).texture;
  const threeScene = new THREE.Scene();
  threeScene.background = new THREE.Color(0x11161d);
  threeScene.environment = environment;
  threeScene.environmentIntensity = scene.render.specularIntensity;
  threeScene.add(new THREE.HemisphereLight(0xd7e2ff, 0x242018, 0.78));
  const key = new THREE.DirectionalLight(0xffead4, 2.7);
  key.position.set(3.2, 4.8, 3.4);
  key.castShadow = true;
  threeScene.add(key);
  addReferenceStage(threeScene, bounds);

  const gltf = await loadGltf(absoluteUrl(scene.assetUri));
  const model = gltf.scene;
  model.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  threeScene.add(model);

  const camera = new THREE.PerspectiveCamera(
    cameraSpec.fovYRadians * 180 / Math.PI,
    scene.width / scene.height,
    0.01,
    1000
  );
  camera.position.set(cameraSpec.cameraPosition[0], cameraSpec.cameraPosition[1], cameraSpec.cameraPosition[2]);
  camera.lookAt(cameraSpec.target[0], cameraSpec.target[1], cameraSpec.target[2]);
  renderer.render(threeScene, camera);
  const pixels = readRendererPixels(renderer, scene.width, scene.height);
  const dataUrl = pixelsToDataUrl(pixels, scene.width, scene.height, true);
  const pixelStats = analyzePixels(pixels);
  const meshStats = countMeshesAndMaterials(model);
  const result: CurrentThreeFlagshipRenderResult = {
    engine: "threejs",
    status: "ready",
    renderer: {
      actualThreeRenderer: true,
      threeRevision: THREE.REVISION,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures
    },
    asset: {
      id: scene.assetId,
      uri: scene.assetUri,
      meshCount: meshStats.meshCount,
      materialCount: meshStats.materialCount
    },
    environment: {
      id: scene.hdrId,
      uri: scene.hdrUri,
      pmremGenerator: true
    },
    camera: cameraSpec,
    pixels: pixelStats,
    dataUrl
  };
  renderer.dispose();
  pmrem.dispose();
  hdrTexture.dispose();
  environment.dispose();
  return result;
}

function addReferenceStage(scene: THREE.Scene, bounds: CurrentThreeFlagshipBounds): void {
  const width = Math.max(0.2, bounds.max[0] - bounds.min[0]);
  const height = Math.max(0.2, bounds.max[1] - bounds.min[1]);
  const depth = Math.max(0.2, bounds.max[2] - bounds.min[2]);
  const radius = Math.max(width, height, depth, 1);
  const centerX = (bounds.min[0] + bounds.max[0]) / 2;
  const centerY = (bounds.min[1] + bounds.max[1]) / 2;
  const centerZ = (bounds.min[2] + bounds.max[2]) / 2;
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(radius * 2.8, radius * 0.035, radius * 2.4),
    new THREE.MeshStandardMaterial({ color: 0x353941, roughness: 0.82, metalness: 0.02 })
  );
  floor.position.set(centerX, bounds.min[1] - radius * 0.055, centerZ + radius * 0.08);
  floor.receiveShadow = true;
  const backdrop = new THREE.Mesh(
    new THREE.BoxGeometry(radius * 2.8, radius * 1.75, radius * 0.035),
    new THREE.MeshStandardMaterial({ color: 0x2d3238, roughness: 0.72, metalness: 0.0 })
  );
  backdrop.position.set(centerX, centerY + height * 0.58, bounds.min[2] - depth * 0.34);
  scene.add(floor, backdrop);
}

async function loadGltf(url: string): Promise<{ readonly scene: THREE.Object3D }> {
  return await new Promise((resolve, reject) => {
    new GLTFLoader().load(url, resolve, undefined, reject);
  });
}

async function loadHdr(url: string): Promise<THREE.Texture> {
  return await new Promise((resolve, reject) => {
    new RGBELoader().load(url, resolve, undefined, reject);
  });
}

function readRendererPixels(renderer: THREE.WebGLRenderer, width: number, height: number): Uint8ClampedArray {
  const gl = renderer.getContext();
  gl.finish();
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return new Uint8ClampedArray(pixels);
}

function analyzePixels(pixels: Uint8ClampedArray): CurrentThreeFlagshipRenderResult["pixels"] {
  let nonBlackPixels = 0;
  let lumaTotal = 0;
  let maxLuma = 0;
  const buckets = new Set<number>();
  for (let offset = 0; offset + 3 < pixels.length; offset += 4) {
    const red = pixels[offset] ?? 0;
    const green = pixels[offset + 1] ?? 0;
    const blue = pixels[offset + 2] ?? 0;
    if (red + green + blue > 12) nonBlackPixels += 1;
    const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    lumaTotal += luma;
    maxLuma = Math.max(maxLuma, luma);
    buckets.add(((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4));
  }
  return {
    nonBlackPixels,
    uniqueColorBuckets: buckets.size,
    averageLuma: pixels.length > 0 ? lumaTotal / (pixels.length / 4) : 0,
    maxLuma
  };
}

function countMeshesAndMaterials(object: THREE.Object3D): { readonly meshCount: number; readonly materialCount: number } {
  let meshCount = 0;
  const materials = new Set<THREE.Material>();
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    meshCount += 1;
    const material = mesh.material;
    if (Array.isArray(material)) {
      for (const entry of material) materials.add(entry);
    } else if (material) {
      materials.add(material);
    }
  });
  return { meshCount, materialCount: materials.size };
}

function pixelsToDataUrl(pixels: Uint8ClampedArray, width: number, height: number, flipY: boolean): string {
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const context = output.getContext("2d");
  if (!context) throw new Error("Unable to create Three.js capture canvas.");
  const image = context.createImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    const sourceY = flipY ? height - 1 - y : y;
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = (sourceY * width + x) * 4;
      const targetOffset = (y * width + x) * 4;
      image.data[targetOffset] = pixels[sourceOffset] ?? 0;
      image.data[targetOffset + 1] = pixels[sourceOffset + 1] ?? 0;
      image.data[targetOffset + 2] = pixels[sourceOffset + 2] ?? 0;
      image.data[targetOffset + 3] = pixels[sourceOffset + 3] ?? 255;
    }
  }
  context.putImageData(image, 0, 0);
  return output.toDataURL("image/png");
}

function absoluteUrl(path: string): string {
  return new URL(path, globalThis.location?.origin ?? "http://localhost").toString();
}
