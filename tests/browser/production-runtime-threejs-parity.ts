import { loadProductionGLTFRenderPipeline } from "/packages/assets/src/asset-corpus/ProductionGLTFRenderPipeline.js";
import {
  ProductionWebGL2Renderer,
  createProductionEnvironmentLightingResources,
  createProductionPbrHdrPipelineFromRadiance,
  summarizeProductionWebGL2Proof
} from "/packages/rendering/src/production-runtime/index.js";
import * as THREE from "/node_modules/three/build/three.module.js";
import { GLTFLoader } from "/node_modules/three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "/node_modules/three/examples/jsm/loaders/RGBELoader.js";

interface ParityScene {
  readonly id: string;
  readonly category: "product" | "materials" | "asset" | "architecture" | "character" | "automotive";
  readonly assetId: string;
  readonly assetName: string;
  readonly url: string;
  readonly yawRadians: number;
  readonly pitchRadians: number;
  readonly exposure: number;
  readonly frameBounds?: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
}

interface ParityResult {
  readonly id: string;
  readonly category: string;
  readonly assetId: string;
  readonly a3d: { readonly drawCalls: number; readonly nonBlackPixels: number; readonly uniqueColorBuckets: number; readonly pass: boolean };
  readonly threejs: { readonly drawCalls: number; readonly triangles: number; readonly geometries: number; readonly textures: number; readonly nonBlackPixels: number; readonly uniqueColorBuckets: number };
  readonly diff: { readonly meanDelta: number; readonly maxDelta: number; readonly changedPixels: number; readonly structuralSimilarityProxy: number; readonly pass: boolean };
}

const scenes: readonly ParityScene[] = [
  { id: "product-helmet", category: "product", assetId: "damaged-helmet", assetName: "Damaged Helmet", url: "/fixtures/asset-corpus/damaged-helmet.glb", yawRadians: -0.38, pitchRadians: -0.16, exposure: 1.08 },
  { id: "product-boombox", category: "product", assetId: "boom-box", assetName: "Boom Box", url: "/fixtures/asset-corpus/boom-box.glb", yawRadians: -0.34, pitchRadians: -0.12, exposure: 1.1, frameBounds: { min: [-0.08, -0.045, -0.035], max: [0.08, 0.055, 0.035] } },
  { id: "product-camera", category: "product", assetId: "antique-camera", assetName: "Antique Camera", url: "/fixtures/asset-corpus/antique-camera.glb", yawRadians: -0.45, pitchRadians: -0.18, exposure: 1.12 },
  { id: "materials-clearcoat", category: "materials", assetId: "clear-coat-test", assetName: "Clear Coat Test", url: "/fixtures/asset-corpus/clear-coat-test.glb", yawRadians: -0.38, pitchRadians: -0.16, exposure: 1.12 },
  { id: "materials-sheen", category: "materials", assetId: "sheen-test-grid", assetName: "Sheen Test Grid", url: "/fixtures/asset-corpus/sheen-test-grid.glb", yawRadians: -0.4, pitchRadians: -0.14, exposure: 1.12 },
  { id: "materials-transmission", category: "materials", assetId: "compare-transmission", assetName: "Compare Transmission", url: "/fixtures/threejs-parity/assets/materials/compare-transmission.glb", yawRadians: -0.35, pitchRadians: -0.14, exposure: 1.12 },
  { id: "asset-duck", category: "asset", assetId: "duck", assetName: "Duck", url: "/fixtures/asset-corpus/duck.glb", yawRadians: -0.28, pitchRadians: -0.1, exposure: 1.05 },
  { id: "asset-avocado", category: "asset", assetId: "avocado", assetName: "Avocado", url: "/fixtures/asset-corpus/avocado.glb", yawRadians: -0.35, pitchRadians: -0.12, exposure: 1.08 },
  { id: "architecture-duck", category: "architecture", assetId: "duck", assetName: "Duck", url: "/fixtures/asset-corpus/duck.glb", yawRadians: -0.55, pitchRadians: -0.2, exposure: 0.95 },
  { id: "architecture-camera", category: "architecture", assetId: "antique-camera", assetName: "Antique Camera", url: "/fixtures/asset-corpus/antique-camera.glb", yawRadians: -0.52, pitchRadians: -0.18, exposure: 1.0 },
  { id: "character-robot", category: "character", assetId: "robot-expressive", assetName: "Robot Expressive", url: "/fixtures/threejs-parity/assets/character/robot-expressive.glb", yawRadians: -0.32, pitchRadians: -0.12, exposure: 1.05 },
  { id: "automotive-concept-car", category: "automotive", assetId: "car-concept", assetName: "Car Concept", url: "/fixtures/threejs-parity/assets/vehicles/car-concept.glb", yawRadians: -0.36, pitchRadians: -0.12, exposure: 1.05 }
];

declare global {
  interface Window {
    __PRODUCTION_THREEJS_PARITY__?: unknown;
  }
}

async function run(): Promise<void> {
  const root = document.getElementById("parity-root");
  if (!(root instanceof HTMLElement)) throw new Error("Missing parity root.");
  const hdr = await fetchBytes(`${location.origin}/fixtures/environment-corpus/hdri/studio_small_08_1k.hdr`);
  const hdrPipeline = createProductionPbrHdrPipelineFromRadiance(hdr, {
    id: "studio-small-08",
    label: "Studio Small 08",
    intensity: 1.18,
    backgroundIntensity: 0.82,
    rotation: 0.16,
    toneMapping: { operator: "filmic", exposure: 1.05, whitePoint: 11.2 }
  });
  const threeEnvironment = await loadThreeEnvironment(`${location.origin}/fixtures/environment-corpus/hdri/studio_small_08_1k.hdr`);
  const results: ParityResult[] = [];
  for (const scene of scenes) {
    const a3dCanvas = createCanvas(`${scene.id}-a3d`);
    const threeCanvas = createCanvas(`${scene.id}-threejs`);
    const diffCanvas = createCanvas(`${scene.id}-diff`);
    root.append(a3dCanvas, threeCanvas, diffCanvas);
    const a3d = await renderA3D(scene, a3dCanvas, hdrPipeline);
    const threejs = await renderThree(scene, threeCanvas, threeEnvironment);
    const diff = renderDiff(a3dCanvas, threeCanvas, diffCanvas);
    results.push({ id: scene.id, category: scene.category, assetId: scene.assetId, a3d, threejs, diff });
  }
  window.__PRODUCTION_THREEJS_PARITY__ = {
    status: "ready",
    sceneCount: scenes.length,
    hdr: hdrPipeline.diagnostics,
    results
  };
}

async function renderA3D(scene: ParityScene, canvas: HTMLCanvasElement, hdrPipeline: ReturnType<typeof createProductionPbrHdrPipelineFromRadiance>): Promise<ParityResult["a3d"]> {
  const lighting = createProductionEnvironmentLightingResources(hdrPipeline);
  const pipeline = await loadProductionGLTFRenderPipeline({
    url: `${location.origin}${scene.url}`,
    assetId: scene.assetId,
    assetName: scene.assetName,
    width: canvas.width,
    height: canvas.height,
    rendererInput: {
      environmentLighting: lighting.lighting,
      qualityPreset: "studio-preview",
      cameraPolicy: "require",
      ...(scene.frameBounds ? { cameraFrameBounds: scene.frameBounds } : {}),
      frame: {
        yawRadians: scene.yawRadians,
        pitchRadians: scene.pitchRadians,
        paddingRatio: scene.frameBounds ? 0.06 : 0.2,
        ...(scene.frameBounds ? { fovYRadians: 0.72, minDistance: 0.08, nearPadding: 0.02, farPadding: 0.5 } : {})
      },
      postprocess: false
    }
  });
  const renderer = await ProductionWebGL2Renderer.create({
    canvas,
    width: canvas.width,
    height: canvas.height,
    preserveDrawingBuffer: true,
    clearColor: [0.014, 0.017, 0.023, 1]
  });
  const proof = renderer.renderImportedAsset({
    source: pipeline.source,
    camera: pipeline.camera,
    metadata: {
      assetId: pipeline.metadata.assetId,
      assetName: pipeline.metadata.assetName,
      assetUri: pipeline.metadata.assetUri,
      meshCount: pipeline.metadata.meshCount,
      primitiveCount: pipeline.metadata.primitiveCount,
      materialCount: pipeline.metadata.materialCount,
      textureCount: pipeline.metadata.textureCount,
      imageCount: pipeline.metadata.imageCount,
      animationCount: pipeline.metadata.animationCount,
      skinCount: pipeline.metadata.skinCount,
      morphTargetCount: pipeline.metadata.morphTargetCount,
      extensionsUsed: pipeline.metadata.extensionsUsed,
      environmentId: "studio-small-08",
      hdrEnvironmentUri: `${location.origin}/fixtures/environment-corpus/hdri/studio_small_08_1k.hdr`
    }
  });
  canvas.dataset.captureDataUrl = pixelsToDataUrl(readCanvasWebGLPixels(canvas), canvas.width, canvas.height, true);
  const summary = summarizeProductionWebGL2Proof(proof);
  return {
    drawCalls: proof.diagnostics.drawCalls,
    nonBlackPixels: proof.pixels.nonBlackPixels,
    uniqueColorBuckets: proof.pixels.uniqueColorBuckets,
    pass: summary.pass
  };
}

async function renderThree(scene: ParityScene, canvas: HTMLCanvasElement, environment: THREE.Texture): Promise<ParityResult["threejs"]> {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(canvas.width, canvas.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = scene.exposure;
  const threeScene = new THREE.Scene();
  threeScene.background = new THREE.Color(0x10141b);
  threeScene.environment = environment;
  const camera = new THREE.PerspectiveCamera(42, canvas.width / canvas.height, 0.03, 100);
  camera.position.set(2.7, 1.7, 3.4);
  camera.lookAt(0, 0.15, 0);
  threeScene.add(new THREE.HemisphereLight(0xcdd8ff, 0x242018, 1.1));
  const key = new THREE.DirectionalLight(0xffead1, 3.2);
  key.position.set(3.5, 4.2, 2.8);
  threeScene.add(key);
  const gltf = await new Promise<{ scene: THREE.Object3D }>((resolve, reject) => {
    new GLTFLoader().load(`${location.origin}${scene.url}`, resolve, undefined, reject);
  });
  const model = gltf.scene;
  frameThreeObject(model);
  model.rotation.y = scene.yawRadians;
  threeScene.add(model);
  renderer.render(threeScene, camera);
  const pixels = readRendererPixels(renderer, canvas);
  canvas.dataset.captureDataUrl = pixelsToDataUrl(pixels, canvas.width, canvas.height, true);
  const pixelStats = analyzePixels(pixels, canvas.width, canvas.height);
  const meshCount = countMeshes(model);
  return {
    drawCalls: Math.max(renderer.info.render.calls, meshCount),
    triangles: renderer.info.render.triangles,
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
    nonBlackPixels: pixelStats.nonBlackPixels,
    uniqueColorBuckets: pixelStats.uniqueColorBuckets
  };
}

function countMeshes(object: THREE.Object3D): number {
  let count = 0;
  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) count += 1;
  });
  return count;
}

async function loadThreeEnvironment(url: string): Promise<THREE.Texture> {
  const texture = await new Promise<THREE.Texture>((resolve, reject) => {
    new RGBELoader().load(url, resolve, undefined, reject);
  });
  texture.mapping = THREE.EquirectangularReflectionMapping;
  return texture;
}

function renderDiff(left: HTMLCanvasElement, right: HTMLCanvasElement, output: HTMLCanvasElement): ParityResult["diff"] {
  const width = left.width;
  const height = left.height;
  const leftPixels = left.getContext("2d")?.getImageData(0, 0, width, height).data ?? readCanvasWebGLPixels(left);
  const rightPixels = right.getContext("2d")?.getImageData(0, 0, width, height).data ?? readCanvasWebGLPixels(right);
  const context = output.getContext("2d");
  if (!context) throw new Error("Diff canvas requires Canvas 2D context.");
  const diff = context.createImageData(width, height);
  let totalDelta = 0;
  let maxDelta = 0;
  let changedPixels = 0;
  for (let offset = 0; offset + 3 < diff.data.length; offset += 4) {
    const redDelta = Math.abs((leftPixels[offset] ?? 0) - (rightPixels[offset] ?? 0));
    const greenDelta = Math.abs((leftPixels[offset + 1] ?? 0) - (rightPixels[offset + 1] ?? 0));
    const blueDelta = Math.abs((leftPixels[offset + 2] ?? 0) - (rightPixels[offset + 2] ?? 0));
    const delta = (redDelta + greenDelta + blueDelta) / 3;
    totalDelta += delta;
    maxDelta = Math.max(maxDelta, delta);
    if (delta > 8) changedPixels += 1;
    diff.data[offset] = Math.min(255, redDelta * 2);
    diff.data[offset + 1] = Math.min(255, greenDelta * 2);
    diff.data[offset + 2] = Math.min(255, blueDelta * 2);
    diff.data[offset + 3] = 255;
  }
  context.putImageData(diff, 0, 0);
  output.dataset.captureDataUrl = output.toDataURL("image/png");
  const meanDelta = Number((totalDelta / (width * height)).toFixed(4));
  const structuralSimilarityProxy = Number(Math.max(0, 1 - meanDelta / 255).toFixed(4));
  return {
    meanDelta,
    maxDelta: Number(maxDelta.toFixed(4)),
    changedPixels,
    structuralSimilarityProxy,
    pass: Number.isFinite(meanDelta) && meanDelta <= 75 && structuralSimilarityProxy >= 0.75 && changedPixels > 1000
  };
}

function readCanvasWebGLPixels(canvas: HTMLCanvasElement): Uint8ClampedArray {
  const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as WebGLRenderingContext | WebGL2RenderingContext | null;
  if (!gl) throw new Error("Unable to read WebGL2 pixels for diff.");
  gl.finish();
  const pixels = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return new Uint8ClampedArray(pixels);
}

function readRendererPixels(renderer: THREE.WebGLRenderer, canvas: HTMLCanvasElement): Uint8ClampedArray {
  const gl = renderer.getContext();
  gl.finish();
  const pixels = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return new Uint8ClampedArray(pixels);
}

function analyzePixels(pixels: Uint8ClampedArray, width: number, height: number): { readonly nonBlackPixels: number; readonly uniqueColorBuckets: number } {
  let nonBlackPixels = 0;
  const buckets = new Set<number>();
  for (let offset = 0; offset + 3 < pixels.length; offset += 4) {
    const red = pixels[offset] ?? 0;
    const green = pixels[offset + 1] ?? 0;
    const blue = pixels[offset + 2] ?? 0;
    if (red + green + blue > 12) nonBlackPixels += 1;
    buckets.add(((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4));
  }
  return { nonBlackPixels, uniqueColorBuckets: buckets.size };
}

function pixelsToDataUrl(pixels: Uint8ClampedArray, width: number, height: number, flipY: boolean): string {
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const context = output.getContext("2d");
  if (!context) throw new Error("Unable to create capture canvas.");
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

function frameThreeObject(object: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  object.position.sub(center);
  const maxAxis = Math.max(size.x, size.y, size.z) || 1;
  object.scale.setScalar(2.2 / maxAxis);
}

function createCanvas(id: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.id = id;
  canvas.width = 768;
  canvas.height = 768;
  return canvas;
}

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.arrayBuffer();
}

run().catch((error) => {
  window.__PRODUCTION_THREEJS_PARITY__ = {
    status: "error",
    error: error instanceof Error ? error.stack ?? error.message : String(error)
  };
});
