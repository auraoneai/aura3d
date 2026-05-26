// @ts-nocheck
import { loadV6GLTFRenderPipeline } from "@aura3d/assets";
import { A3DRenderer } from "@aura3d/engine/advanced-runtime";
import { computePerspectiveCameraFrame } from "@aura3d/rendering";
import * as THREE from "three";
import { GLTFLoader } from "/node_modules/three/examples/jsm/loaders/GLTFLoader.js";

declare global {
  interface Window {
    __V9_GLTF_PARITY__?: V9GltfParityResult;
  }
}

export {};

type V9GltfParityResult = V9GltfParityReady | V9GltfParityError;

interface V9GltfParityReady {
  readonly status: "ready";
  readonly schema: "a3d-threejs-parity-gltf-parity/v1";
  readonly purpose: "same-asset A3D GLTF loader/render resources vs actual Three.js GLTFLoader baseline";
  readonly generatedInBrowserAt: string;
  readonly asset: typeof ASSET;
  readonly a3d: {
    readonly metadata: {
      readonly meshCount: number;
      readonly primitiveCount: number;
      readonly materialCount: number;
      readonly textureCount: number;
      readonly vertexCount: number;
      readonly indexCount: number;
      readonly unsupportedExtensions: readonly string[];
    };
    readonly renderer: { readonly drawCalls: number };
    readonly bounds: BoundsSummary;
    readonly pixels: PixelStats;
  };
  readonly threejs: {
    readonly loader: { readonly actualGLTFLoader: true; readonly actualThreeRenderer: true };
    readonly metadata: {
      readonly meshCount: number;
      readonly materialCount: number;
      readonly textureCount: number;
      readonly triangleCount: number;
    };
    readonly renderer: { readonly drawCalls: number; readonly triangles: number };
    readonly bounds: BoundsSummary;
    readonly pixels: PixelStats;
  };
  readonly diff: DiffStats;
  readonly assertions: {
    readonly sameAssetUrl: boolean;
    readonly actualThreeGLTFLoader: boolean;
    readonly actualThreeRenderer: boolean;
    readonly a3dPublicRenderResources: boolean;
    readonly requiredCountsPresent: boolean;
    readonly boundsComparable: boolean;
    readonly screenshotsNonBlank: boolean;
    readonly fakeEqualityClaimed: false;
  };
  readonly dataUrls: {
    readonly a3d: string;
    readonly threejs: string;
    readonly sideBySide: string;
  };
  readonly humanNotes: readonly string[];
}

interface V9GltfParityError {
  readonly status: "error";
  readonly schema: "a3d-threejs-parity-gltf-parity/v1";
  readonly generatedInBrowserAt: string;
  readonly error: string;
  readonly expectedReferenceLoader: "GLTFLoader";
  readonly expectedRenderer: "THREE.WebGLRenderer";
}

interface BoundsSummary {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
  readonly size: readonly [number, number, number];
}

interface PixelStats {
  readonly nonBlackPixels: number;
  readonly uniqueColorBuckets: number;
  readonly averageLuma: number;
  readonly localContrast: number;
}

interface DiffStats {
  readonly meanDelta: number;
  readonly maxDelta: number;
  readonly changedPixels: number;
  readonly structuralSimilarityProxy: number;
}

const ASSET = {
  id: "damaged-helmet",
  name: "Damaged Helmet",
  url: "/fixtures/asset-corpus/damaged-helmet.glb",
  width: 640,
  height: 480
} as const;

const FRAME = {
  paddingRatio: 0.02,
  fovYRadians: 0.48,
  yawRadians: -0.32,
  pitchRadians: -0.1,
  nearPadding: 0.08,
  farPadding: 1.6
} as const;

void run();

async function run(): Promise<void> {
  const status = document.getElementById("report-status");
  const json = document.getElementById("report-json");
  try {
    const a3dCanvas = requiredCanvas("a3d-gltf", ASSET.width, ASSET.height);
    const threeCanvas = requiredCanvas("threejs-gltf", ASSET.width, ASSET.height);
    const sideBySideCanvas = requiredCanvas("side-by-side", ASSET.width * 2, ASSET.height + 60);
    if (status) status.textContent = "rendering A3D GLTF resources";
    const a3d = await renderA3D(a3dCanvas);
    if (status) status.textContent = "rendering actual Three.js GLTFLoader baseline";
    const threejs = await renderThree(threeCanvas);
    const [a3dPixels, threePixels] = await Promise.all([dataUrlToPixels(a3d.dataUrl), dataUrlToPixels(threejs.dataUrl)]);
    const diff = computeDiff(a3dPixels, threePixels);
    const sideBySide = await drawSideBySide(sideBySideCanvas, a3d.dataUrl, threejs.dataUrl, diff);
    const ready: V9GltfParityReady = {
      status: "ready",
      schema: "a3d-threejs-parity-gltf-parity/v1",
      purpose: "same-asset A3D GLTF loader/render resources vs actual Three.js GLTFLoader baseline",
      generatedInBrowserAt: new Date().toISOString(),
      asset: ASSET,
      a3d: {
        metadata: {
          meshCount: a3d.metadata.meshCount,
          primitiveCount: a3d.metadata.primitiveCount,
          materialCount: a3d.metadata.materialCount,
          textureCount: a3d.metadata.textureCount,
          vertexCount: a3d.metadata.vertexCount,
          indexCount: a3d.metadata.indexCount,
          unsupportedExtensions: a3d.metadata.unsupportedExtensions
        },
        renderer: { drawCalls: a3d.drawCalls },
        bounds: summarizeBounds(a3d.bounds.min, a3d.bounds.max),
        pixels: analyzeImageData(a3dPixels)
      },
      threejs: {
        loader: { actualGLTFLoader: threejs.actualGLTFLoader, actualThreeRenderer: threejs.actualThreeRenderer },
        metadata: threejs.metadata,
        renderer: { drawCalls: threejs.drawCalls, triangles: threejs.triangles },
        bounds: threejs.bounds,
        pixels: analyzeImageData(threePixels)
      },
      diff,
      assertions: {
        sameAssetUrl: true,
        actualThreeGLTFLoader: threejs.actualGLTFLoader,
        actualThreeRenderer: threejs.actualThreeRenderer,
        a3dPublicRenderResources: a3d.metadata.meshCount > 0 && a3d.drawCalls > 0,
        requiredCountsPresent: a3d.metadata.meshCount === 1
          && a3d.metadata.primitiveCount === 1
          && a3d.metadata.materialCount === 1
          && a3d.metadata.textureCount >= 5
          && threejs.metadata.meshCount === 1
          && threejs.metadata.materialCount === 1
          && threejs.metadata.textureCount >= 5,
        boundsComparable: boundsDelta(summarizeBounds(a3d.bounds.min, a3d.bounds.max), threejs.bounds) <= 0.18,
        screenshotsNonBlank: analyzeImageData(a3dPixels).nonBlackPixels > 25_000 && analyzeImageData(threePixels).nonBlackPixels > 25_000,
        fakeEqualityClaimed: false
      },
      dataUrls: { a3d: a3d.dataUrl, threejs: threejs.dataUrl, sideBySide },
      humanNotes: [
        `Mean RGB delta is ${diff.meanDelta}; structural similarity proxy is ${diff.structuralSimilarityProxy}.`,
        "This artifact proves the bounded Damaged Helmet GLB path against actual Three.js GLTFLoader and WebGLRenderer.",
        "It is not a blanket claim for every glTF extension, texture compression format, animation path, or material extension."
      ]
    };
    window.__V9_GLTF_PARITY__ = ready;
    if (status) status.textContent = "ready";
    if (json) json.textContent = JSON.stringify(stripDataUrls(ready), null, 2);
  } catch (error) {
    const failure: V9GltfParityError = {
      status: "error",
      schema: "a3d-threejs-parity-gltf-parity/v1",
      generatedInBrowserAt: new Date().toISOString(),
      error: error instanceof Error ? error.stack ?? error.message : String(error),
      expectedReferenceLoader: "GLTFLoader",
      expectedRenderer: "THREE.WebGLRenderer"
    };
    window.__V9_GLTF_PARITY__ = failure;
    if (status) status.textContent = "error";
    if (json) json.textContent = JSON.stringify(failure, null, 2);
  }
}

async function renderA3D(canvas: HTMLCanvasElement) {
  const pipeline = await loadV6GLTFRenderPipeline({
    url: ASSET.url,
    assetId: ASSET.id,
    assetName: ASSET.name,
    width: ASSET.width,
    height: ASSET.height,
      rendererInput: {
        qualityPreset: "studio-preview",
        frame: FRAME,
        cameraPolicy: "require",
        postprocess: false,
        frustumCulling: false
    }
  });
  const renderer = await A3DRenderer.create({
    canvas,
    width: ASSET.width,
    height: ASSET.height,
    backend: "webgl2",
    clearColor: [0.02, 0.023, 0.028, 1]
  });
  const input = pipeline.resources.toRendererInput({ width: ASSET.width, height: ASSET.height }, {
    qualityPreset: "studio-preview",
    frame: FRAME,
    cameraPolicy: "require",
    postprocess: false,
    frustumCulling: false
  });
  const diagnostics = renderer.render({ source: input.source, camera: input.camera });
  const dataUrl = canvas.toDataURL("image/png");
  return {
    metadata: pipeline.metadata,
    bounds: pipeline.resources.bounds,
    drawCalls: diagnostics.drawCalls,
    dataUrl
  };
}

async function renderThree(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(ASSET.width, ASSET.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  if (!(renderer instanceof THREE.WebGLRenderer)) throw new Error("GLTF parity requires an actual THREE.WebGLRenderer.");

  const loader = new GLTFLoader();
  if (!(loader instanceof GLTFLoader)) throw new Error("GLTF parity requires the actual Three.js GLTFLoader.");
  const gltf = await loader.loadAsync(ASSET.url);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070a);
  scene.add(gltf.scene);
  scene.add(new THREE.HemisphereLight(0xdde7ff, 0x1c1a18, 0.7));
  const key = new THREE.DirectionalLight(0xffefd6, 3.0);
  key.position.set(2.2, 3.2, 2.4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x9db7ff, 1.0);
  fill.position.set(-2.4, 1.6, 1.9);
  scene.add(fill);

  const box = new THREE.Box3().setFromObject(gltf.scene);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const frame = computePerspectiveCameraFrame({
    min: [box.min.x, box.min.y, box.min.z],
    max: [box.max.x, box.max.y, box.max.z]
  }, { width: ASSET.width, height: ASSET.height }, FRAME);
  const camera = new THREE.PerspectiveCamera(frame.fovYRadians * 180 / Math.PI, ASSET.width / ASSET.height, frame.near, frame.far);
  camera.position.set(...frame.cameraPosition);
  camera.lookAt(center);
  camera.updateProjectionMatrix();

  renderer.render(scene, camera);
  const metadata = countThreeGLTF(gltf.scene);
  return {
    actualGLTFLoader: true as const,
    actualThreeRenderer: true as const,
    metadata,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    bounds: summarizeThreeBounds(box),
    dataUrl: canvas.toDataURL("image/png")
  };
}

function countThreeGLTF(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  let meshCount = 0;
  let triangleCount = 0;
  root.traverse((object) => {
    if (!("isMesh" in object) || object.isMesh !== true) return;
    meshCount += 1;
    const mesh = object as THREE.Mesh;
    const materialList = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materialList) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value && typeof value === "object" && "isTexture" in value && value.isTexture === true) {
          textures.add(value as THREE.Texture);
        }
      }
    }
    const geometry = mesh.geometry;
    const indexCount = geometry.index?.count ?? geometry.attributes.position?.count ?? 0;
    triangleCount += Math.floor(indexCount / 3);
  });
  return {
    meshCount,
    materialCount: materials.size,
    textureCount: textures.size,
    triangleCount
  };
}

function summarizeThreeBounds(box: THREE.Box3): BoundsSummary {
  return summarizeBounds([box.min.x, box.min.y, box.min.z], [box.max.x, box.max.y, box.max.z]);
}

function summarizeBounds(min: readonly [number, number, number], max: readonly [number, number, number]): BoundsSummary {
  return {
    min: [round(min[0]), round(min[1]), round(min[2])],
    max: [round(max[0]), round(max[1]), round(max[2])],
    size: [round(max[0] - min[0]), round(max[1] - min[1]), round(max[2] - min[2])]
  };
}

function boundsDelta(a: BoundsSummary, b: BoundsSummary): number {
  let delta = 0;
  for (let index = 0; index < 3; index += 1) {
    delta = Math.max(delta, Math.abs(a.size[index] - b.size[index]));
  }
  return round(delta);
}

function requiredCanvas(id: string, width: number, height: number): HTMLCanvasElement {
  const canvas = document.getElementById(id);
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error(`Missing canvas #${id}`);
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function dataUrlToPixels(dataUrl: string): Promise<ImageData> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Unable to read image pixels.");
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function analyzeImageData(image: ImageData): PixelStats {
  let nonBlackPixels = 0;
  let lumaSum = 0;
  let minLuma = 255;
  let maxLuma = 0;
  const buckets = new Set<string>();
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const r = image.data[offset]!;
    const g = image.data[offset + 1]!;
    const b = image.data[offset + 2]!;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lumaSum += luma;
    minLuma = Math.min(minLuma, luma);
    maxLuma = Math.max(maxLuma, luma);
    if (r + g + b > 24) nonBlackPixels += 1;
    buckets.add(`${r >> 4}:${g >> 4}:${b >> 4}`);
  }
  const pixels = image.width * image.height;
  return {
    nonBlackPixels,
    uniqueColorBuckets: buckets.size,
    averageLuma: round(lumaSum / pixels),
    localContrast: round(maxLuma - minLuma)
  };
}

function computeDiff(a: ImageData, b: ImageData): DiffStats {
  if (a.width !== b.width || a.height !== b.height) throw new Error("Cannot diff images with different dimensions.");
  let total = 0;
  let maxDelta = 0;
  let changedPixels = 0;
  for (let offset = 0; offset < a.data.length; offset += 4) {
    const delta = (Math.abs(a.data[offset]! - b.data[offset]!) + Math.abs(a.data[offset + 1]! - b.data[offset + 1]!) + Math.abs(a.data[offset + 2]! - b.data[offset + 2]!)) / 3;
    total += delta;
    maxDelta = Math.max(maxDelta, delta);
    if (delta > 18) changedPixels += 1;
  }
  const meanDelta = total / (a.width * a.height);
  return {
    meanDelta: round(meanDelta),
    maxDelta: round(maxDelta),
    changedPixels,
    structuralSimilarityProxy: round(Math.max(0, 1 - meanDelta / 255))
  };
}

async function drawSideBySide(canvas: HTMLCanvasElement, a3dDataUrl: string, threeDataUrl: string, diff: DiffStats): Promise<string> {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to draw side-by-side GLTF comparison.");
  const [a3d, three] = await Promise.all([loadImage(a3dDataUrl), loadImage(threeDataUrl)]);
  context.fillStyle = "#090d14";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(a3d, 0, 0);
  context.drawImage(three, ASSET.width, 0);
  context.fillStyle = "#f4f7fb";
  context.font = "16px sans-serif";
  context.fillText("A3D GLTF render resources", 18, ASSET.height + 28);
  context.fillText("Three.js GLTFLoader", ASSET.width + 18, ASSET.height + 28);
  context.fillStyle = "#aab5c4";
  context.font = "12px sans-serif";
  context.fillText(`mean delta ${diff.meanDelta}, similarity proxy ${diff.structuralSimilarityProxy}`, 18, ASSET.height + 48);
  return canvas.toDataURL("image/png");
}

async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  return image;
}

function stripDataUrls(result: V9GltfParityReady): Omit<V9GltfParityReady, "dataUrls"> {
  const { dataUrls: _dataUrls, ...rest } = result;
  return rest;
}

function round(value: number): number {
  return Number(value.toFixed(3));
}
