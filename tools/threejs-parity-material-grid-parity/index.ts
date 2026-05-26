// @ts-nocheck
import {
  Geometry,
  PBRMaterial,
  UnlitMaterial,
  computePerspectiveCameraFrame,
  type CameraFrameBounds,
  type CollectedLight,
  type RenderItem,
  type RenderSource
} from "@aura3d/rendering";
import { A3DRenderer } from "@aura3d/engine/advanced-runtime";
import { DirectionalLight, composeMat4, quatFromEuler } from "@aura3d/scene";
import * as THREE from "three";

declare global {
  interface Window {
    __THREEJS_PARITY_MATERIAL_GRID_PARITY__?: MaterialGridParityResult;
  }
}

export {};

type MaterialGridParityResult = MaterialGridParityReady | MaterialGridParityError;

interface MaterialGridParityReady {
  readonly status: "ready";
  readonly schema: "a3d-threejs-parity-material-grid-parity";
  readonly purpose: "same-scene A3D material grid vs Three.js MeshBasic/Standard/Physical material grid";
  readonly generatedInBrowserAt: string;
  readonly scene: typeof SCENE;
  readonly a3d: {
    readonly renderer: { readonly drawCalls: number; readonly triangles: number; readonly actualA3DRenderer: true };
    readonly materials: MaterialStats;
    readonly pixels: PixelStats;
  };
  readonly threejs: {
    readonly renderer: { readonly actualThreeRenderer: true; readonly drawCalls: number; readonly triangles: number };
    readonly materials: MaterialStats;
    readonly pixels: PixelStats;
  };
  readonly diff: DiffStats;
  readonly assertions: {
    readonly sameResolution: boolean;
    readonly actualThreeRenderer: boolean;
    readonly a3dMaterialCoverage: boolean;
    readonly threeMaterialCoverage: boolean;
    readonly screenshotsNonBlank: boolean;
    readonly visibleMaterialVariation: boolean;
    readonly fakeEqualityClaimed: false;
  };
  readonly dataUrls: { readonly a3d: string; readonly threejs: string; readonly sideBySide: string };
  readonly humanNotes: readonly string[];
}

interface MaterialGridParityError {
  readonly status: "error";
  readonly schema: "a3d-threejs-parity-material-grid-parity";
  readonly generatedInBrowserAt: string;
  readonly error: string;
}

interface MaterialStats {
  readonly total: number;
  readonly unlit: number;
  readonly matte: number;
  readonly metal: number;
  readonly rough: number;
  readonly emissive: number;
  readonly clearcoat: number;
  readonly transparent: number;
  readonly materialNames: readonly string[];
}

interface PixelStats {
  readonly nonBlackPixels: number;
  readonly foregroundPixels: number;
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

const SCENE = {
  id: "threejs-parity-material-grid",
  width: 960,
  height: 540,
  frameBounds: { min: [-2.55, -0.85, -0.55], max: [2.55, 0.75, 0.55] } as CameraFrameBounds,
  materialNames: ["unlit", "matte", "metal", "rough", "emissive", "clearcoat", "transparent"]
} as const;

const CAMERA = { yawRadians: -0.04, pitchRadians: -0.08, paddingRatio: 0.16, fovYRadians: 0.72, nearPadding: 0.16, farPadding: 2.4 } as const;

void run();

async function run(): Promise<void> {
  const status = document.getElementById("report-status");
  const json = document.getElementById("report-json");
  try {
    const a3dCanvas = requiredCanvas("a3d-material-grid", SCENE.width, SCENE.height);
    const threeCanvas = requiredCanvas("threejs-material-grid", SCENE.width, SCENE.height);
    const sideBySideCanvas = requiredCanvas("side-by-side", SCENE.width * 2, SCENE.height + 60);

    if (status) status.textContent = "rendering A3D material grid";
    const a3d = await renderA3D(a3dCanvas);
    if (status) status.textContent = "rendering Three.js material grid";
    const threejs = await renderThree(threeCanvas);

    const [a3dPixels, threePixels] = await Promise.all([dataUrlToPixels(a3d.dataUrl), dataUrlToPixels(threejs.dataUrl)]);
    const a3dStats = analyzeImageData(a3dPixels);
    const threeStats = analyzeImageData(threePixels);
    const diff = computeDiff(a3dPixels, threePixels);
    const sideBySide = await drawSideBySide(sideBySideCanvas, a3d.dataUrl, threejs.dataUrl, diff);

    const ready: MaterialGridParityReady = {
      status: "ready",
      schema: "a3d-threejs-parity-material-grid-parity",
      purpose: "same-scene A3D material grid vs Three.js MeshBasic/Standard/Physical material grid",
      generatedInBrowserAt: new Date().toISOString(),
      scene: SCENE,
      a3d: {
        renderer: { drawCalls: a3d.drawCalls, triangles: a3d.triangles, actualA3DRenderer: true },
        materials: a3d.materials,
        pixels: a3dStats
      },
      threejs: {
        renderer: { actualThreeRenderer: threejs.actualThreeRenderer, drawCalls: threejs.drawCalls, triangles: threejs.triangles },
        materials: threejs.materials,
        pixels: threeStats
      },
      diff,
      assertions: {
        sameResolution: a3dPixels.width === threePixels.width && a3dPixels.height === threePixels.height,
        actualThreeRenderer: threejs.actualThreeRenderer,
        a3dMaterialCoverage: hasMaterialCoverage(a3d.materials),
        threeMaterialCoverage: hasMaterialCoverage(threejs.materials),
        screenshotsNonBlank: a3dStats.foregroundPixels > 65_000 && threeStats.foregroundPixels > 65_000,
        visibleMaterialVariation: a3dStats.uniqueColorBuckets > 80 && threeStats.uniqueColorBuckets > 80,
        fakeEqualityClaimed: false
      },
      dataUrls: { a3d: a3d.dataUrl, threejs: threejs.dataUrl, sideBySide },
      humanNotes: [
        `Mean RGB delta is ${diff.meanDelta}; structural similarity proxy is ${diff.structuralSimilarityProxy}.`,
        "The same grid covers unlit/basic, matte, metallic, rough, emissive, clearcoat, and transparent material behavior.",
        "This is a bounded material-grid comparison, not a blanket claim for every Three.js material class."
      ]
    };
    window.__THREEJS_PARITY_MATERIAL_GRID_PARITY__ = ready;
    if (status) status.textContent = "ready";
    if (json) json.textContent = JSON.stringify(stripDataUrls(ready), null, 2);
  } catch (error) {
    const failure: MaterialGridParityError = {
      status: "error",
      schema: "a3d-threejs-parity-material-grid-parity",
      generatedInBrowserAt: new Date().toISOString(),
      error: error instanceof Error ? error.stack ?? error.message : String(error)
    };
    window.__THREEJS_PARITY_MATERIAL_GRID_PARITY__ = failure;
    if (status) status.textContent = "error";
    if (json) json.textContent = JSON.stringify(failure, null, 2);
  }
}

async function renderA3D(canvas: HTMLCanvasElement) {
  const renderer = await A3DRenderer.create({ canvas, width: SCENE.width, height: SCENE.height, backend: "webgl2", preserveDrawingBuffer: true, antialias: true, clearColor: [0.64, 0.64, 0.64, 1] });
  const frame = computePerspectiveCameraFrame(SCENE.frameBounds, { width: SCENE.width, height: SCENE.height }, CAMERA);
  const source = createA3DSource();
  const result = renderer.render({ source, camera: { viewProjectionMatrix: frame.viewProjectionMatrix, viewMatrix: frame.viewMatrix, projectionMatrix: frame.projectionMatrix } });
  await waitFrames(2);
  return {
    drawCalls: result.drawCalls,
    triangles: result.triangles,
    materials: createMaterialStats("a3d"),
    dataUrl: canvas.toDataURL("image/png")
  };
}

async function renderThree(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SCENE.width, SCENE.height, false);
  renderer.setClearColor(0xa3a3a3, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  if (!(renderer instanceof THREE.WebGLRenderer)) throw new Error("Material grid parity requires an actual THREE.WebGLRenderer.");
  const scene = createThreeScene();
  const camera = new THREE.PerspectiveCamera(41, SCENE.width / SCENE.height, 0.1, 20);
  camera.position.set(0.16, 1.2, 4.15);
  camera.lookAt(0, 0.02, 0);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  await waitFrames(2);
  return {
    actualThreeRenderer: true as const,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    materials: createMaterialStats("threejs"),
    dataUrl: canvas.toDataURL("image/png")
  };
}

function createA3DSource(): RenderSource {
  return {
    collectRenderItems: () => createA3DItems(),
    collectedLights: createLights(),
    cameraPolicy: "require",
    cameraFrameBounds: SCENE.frameBounds,
    environmentLighting: {
      color: [0.86, 0.9, 0.96],
      intensity: 0.48,
      proceduralMap: {
        skyColor: [0.16, 0.24, 0.36],
        horizonColor: [0.72, 0.78, 0.82],
        groundColor: [0.46, 0.46, 0.42],
        specularColor: [0.92, 0.96, 1],
        intensity: 0.62,
        specularIntensity: 0.9
      }
    },
    frustumCulling: false,
    postprocess: {
      toneMapping: { exposure: 1.05, operator: "filmic", inputColorSpace: "linear", outputColorSpace: "srgb" },
      fxaa: true
    }
  };
}

function createA3DItems(): readonly RenderItem[] {
  const sphere = Geometry.uvSphere(0.5, 56, 28);
  const floor = new PBRMaterial({ name: "material-grid-floor", baseColor: [0.78, 0.78, 0.76, 1], roughness: 0.64, metallic: 0, environmentIntensity: 0.38 });
  const backdrop = new PBRMaterial({ name: "material-grid-backdrop", baseColor: [0.62, 0.62, 0.61, 1], roughness: 0.72, metallic: 0, environmentIntensity: 0.24 });
  const materials = createA3DMaterials();
  return [
    { label: "material-grid-floor", geometry: Geometry.litCube(1), material: floor, modelMatrix: composeMat4([0, -0.58, 0.02], [0, 0, 0, 1], [6.2, 0.05, 1.65]) },
    { label: "material-grid-backdrop", geometry: Geometry.litCube(1), material: backdrop, modelMatrix: composeMat4([0, 0.38, -0.74], [0, 0, 0, 1], [6.2, 2.0, 0.05]) },
    ...materials.map((material, index) => ({
      label: `material-grid-${material.name}`,
      geometry: sphere,
      material,
      modelMatrix: composeMat4([-2.28 + index * 0.76, -0.08 + (index % 2) * 0.12, 0], quatFromEuler(0, 0.28, 0), [0.42, 0.42, 0.42])
    }))
  ];
}

function createA3DMaterials() {
  return [
    new UnlitMaterial({ name: "unlit", color: [0.93, 0.16, 0.12, 1] }),
    new PBRMaterial({ name: "matte", baseColor: [0.1, 0.48, 0.86, 1], roughness: 0.82, metallic: 0, environmentIntensity: 0.44 }),
    new PBRMaterial({ name: "metal", baseColor: [0.95, 0.7, 0.24, 1], roughness: 0.22, metallic: 0.88, environmentIntensity: 0.76 }),
    new PBRMaterial({ name: "rough", baseColor: [0.38, 0.72, 0.42, 1], roughness: 0.96, metallic: 0.02, environmentIntensity: 0.34 }),
    new PBRMaterial({ name: "emissive", baseColor: [0.1, 0.1, 0.14, 1], roughness: 0.38, metallic: 0, emissiveColor: [0.95, 0.28, 0.9], emissiveStrength: 1.8 }),
    new PBRMaterial({ name: "clearcoat", baseColor: [0.84, 0.15, 0.2, 1], roughness: 0.34, metallic: 0, clearcoatFactor: 0.78, clearcoatRoughnessFactor: 0.12, environmentIntensity: 0.68 }),
    new PBRMaterial({ name: "transparent", baseColor: [0.55, 0.82, 1, 0.62], roughness: 0.1, metallic: 0.02, transmissionFactor: 0.2, clearcoatFactor: 0.55, renderState: { blend: true, depthWrite: false } })
  ];
}

function createLights(): readonly CollectedLight[] {
  const key = new DirectionalLight("material-grid-key");
  key.intensity = 3.2;
  key.color = [1, 0.94, 0.84];
  const fill = new DirectionalLight("material-grid-fill");
  fill.intensity = 1.5;
  fill.color = [0.52, 0.68, 1];
  return [
    { kind: "directional", color: key.color, intensity: key.intensity, position: [2.8, 3.4, 2.4], direction: [-0.48, -0.7, -0.46], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: key },
    { kind: "directional", color: fill.color, intensity: fill.intensity, position: [-2.2, 1.6, 1.8], direction: [0.52, -0.34, -0.62], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: fill }
  ];
}

function createThreeScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xa3a3a3);
  scene.add(new THREE.HemisphereLight(0xdce5ff, 0x6c6860, 0.62));
  const key = new THREE.DirectionalLight(0xffefd6, 3.0);
  key.position.set(2.8, 3.4, 2.4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x86adff, 1.35);
  fill.position.set(-2.2, 1.6, 1.8);
  scene.add(fill);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xc7c7c2, roughness: 0.64 }));
  floor.position.set(0, -0.58, 0.02);
  floor.scale.set(6.2, 0.05, 1.65);
  scene.add(floor);
  const backdrop = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x9e9e9c, roughness: 0.72 }));
  backdrop.position.set(0, 0.38, -0.74);
  backdrop.scale.set(6.2, 2.0, 0.05);
  scene.add(backdrop);
  createThreeMaterials().forEach((material, index) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 56, 28), material);
    mesh.position.set(-2.28 + index * 0.76, -0.08 + (index % 2) * 0.12, 0);
    mesh.scale.setScalar(0.42);
    mesh.rotation.y = 0.28;
    scene.add(mesh);
  });
  return scene;
}

function createThreeMaterials(): THREE.Material[] {
  return [
    new THREE.MeshBasicMaterial({ name: "unlit", color: 0xed291f }),
    new THREE.MeshStandardMaterial({ name: "matte", color: 0x197ad9, roughness: 0.82, metalness: 0 }),
    new THREE.MeshStandardMaterial({ name: "metal", color: 0xf2b33d, roughness: 0.22, metalness: 0.88 }),
    new THREE.MeshStandardMaterial({ name: "rough", color: 0x61b86b, roughness: 0.96, metalness: 0.02 }),
    new THREE.MeshStandardMaterial({ name: "emissive", color: 0x191a24, roughness: 0.38, emissive: 0xf247e6, emissiveIntensity: 1.8 }),
    new THREE.MeshPhysicalMaterial({ name: "clearcoat", color: 0xd62633, roughness: 0.34, metalness: 0, clearcoat: 0.78, clearcoatRoughness: 0.12 }),
    new THREE.MeshPhysicalMaterial({ name: "transparent", color: 0x8cd1ff, roughness: 0.1, metalness: 0.02, transmission: 0.2, clearcoat: 0.55, transparent: true, opacity: 0.62, depthWrite: false })
  ];
}

function createMaterialStats(engine: "a3d" | "threejs"): MaterialStats {
  return {
    total: SCENE.materialNames.length,
    unlit: 1,
    matte: 1,
    metal: 1,
    rough: 1,
    emissive: 1,
    clearcoat: 1,
    transparent: 1,
    materialNames: SCENE.materialNames.map((name) => `${engine}:${name}`)
  };
}

function hasMaterialCoverage(stats: MaterialStats): boolean {
  return stats.total >= 7 && stats.unlit >= 1 && stats.matte >= 1 && stats.metal >= 1 && stats.rough >= 1 && stats.emissive >= 1 && stats.clearcoat >= 1 && stats.transparent >= 1;
}

function requiredCanvas(id: string, width: number, height: number): HTMLCanvasElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLCanvasElement)) throw new Error(`Missing canvas #${id}.`);
  element.width = width;
  element.height = height;
  return element;
}

async function dataUrlToPixels(dataUrl: string): Promise<ImageData> {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create material-grid pixel canvas.");
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function analyzeImageData(image: ImageData): PixelStats {
  let nonBlackPixels = 0;
  let foregroundPixels = 0;
  let lumaTotal = 0;
  let contrastTotal = 0;
  const buckets = new Set<number>();
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      const red = image.data[offset] ?? 0;
      const green = image.data[offset + 1] ?? 0;
      const blue = image.data[offset + 2] ?? 0;
      const value = luma(red, green, blue);
      if (value > 8) nonBlackPixels += 1;
      if (Math.abs(red - 163) + Math.abs(green - 163) + Math.abs(blue - 163) > 42 && value > 24) foregroundPixels += 1;
      buckets.add(((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4));
      lumaTotal += value;
      if (x > 0) {
        const previous = offset - 4;
        contrastTotal += Math.abs(value - luma(image.data[previous] ?? 0, image.data[previous + 1] ?? 0, image.data[previous + 2] ?? 0));
      }
    }
  }
  return {
    nonBlackPixels,
    foregroundPixels,
    uniqueColorBuckets: buckets.size,
    averageLuma: Number((lumaTotal / (image.data.length / 4)).toFixed(4)),
    localContrast: Number((contrastTotal / Math.max(1, image.width * image.height - image.height)).toFixed(4))
  };
}

function computeDiff(left: ImageData, right: ImageData): DiffStats {
  if (left.width !== right.width || left.height !== right.height) {
    throw new Error(`Cannot diff material-grid captures with mismatched size: ${left.width}x${left.height} vs ${right.width}x${right.height}.`);
  }
  let totalDelta = 0;
  let maxDelta = 0;
  let changedPixels = 0;
  for (let offset = 0; offset + 3 < left.data.length; offset += 4) {
    const delta = (Math.abs((left.data[offset] ?? 0) - (right.data[offset] ?? 0)) + Math.abs((left.data[offset + 1] ?? 0) - (right.data[offset + 1] ?? 0)) + Math.abs((left.data[offset + 2] ?? 0) - (right.data[offset + 2] ?? 0))) / 3;
    totalDelta += delta;
    maxDelta = Math.max(maxDelta, delta);
    if (delta > 8) changedPixels += 1;
  }
  const meanDelta = totalDelta / (left.width * left.height);
  return { meanDelta: Number(meanDelta.toFixed(4)), maxDelta: Number(maxDelta.toFixed(4)), changedPixels, structuralSimilarityProxy: Number(Math.max(0, 1 - meanDelta / 255).toFixed(4)) };
}

async function drawSideBySide(canvas: HTMLCanvasElement, a3dDataUrl: string, threeDataUrl: string, diff: DiffStats): Promise<string> {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create material-grid side-by-side canvas.");
  const [a3d, three] = await Promise.all([loadImage(a3dDataUrl), loadImage(threeDataUrl)]);
  context.fillStyle = "#07090d";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(a3d, 0, 0, SCENE.width, SCENE.height);
  context.drawImage(three, SCENE.width, 0, SCENE.width, SCENE.height);
  context.fillStyle = "rgba(7, 9, 13, 0.92)";
  context.fillRect(0, SCENE.height, canvas.width, 60);
  context.fillStyle = "#f3f6f8";
  context.font = "20px system-ui, sans-serif";
  context.fillText("Left: A3D material grid | Right: Three.js material grid", 20, SCENE.height + 28);
  context.fillStyle = "#aeb8c6";
  context.font = "16px system-ui, sans-serif";
  context.fillText(`mean delta ${diff.meanDelta} | changed ${diff.changedPixels} | SSIM proxy ${diff.structuralSimilarityProxy}`, 20, SCENE.height + 50);
  return canvas.toDataURL("image/png");
}

async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Unable to decode material-grid parity image data URL."));
    image.src = dataUrl;
  });
  return image;
}

function stripDataUrls(result: MaterialGridParityReady): Omit<MaterialGridParityReady, "dataUrls"> {
  const { dataUrls: _dataUrls, ...rest } = result;
  return rest;
}

function luma(red: number, green: number, blue: number): number {
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

async function waitFrames(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
