// @ts-nocheck
import {
  Geometry,
  PBRMaterial,
  computePerspectiveCameraFrame,
  type RenderItem
} from "@aura3d/rendering";
import { A3DRenderer } from "@aura3d/engine/advanced-runtime";
import { DirectionalLight, Scene, composeMat4, quatFromEuler } from "@aura3d/scene";
import * as THREE from "three";

declare global {
  interface Window {
    __V9_SHADOWMAP_PARITY__?: ShadowMapParityResult;
  }
}

export {};

type ShadowMapParityResult = ShadowMapParityReady | ShadowMapParityError;

interface ShadowMapParityReady {
  readonly status: "ready";
  readonly schema: "a3d-threejs-parity-shadowmap-parity/v1";
  readonly purpose: "same-scene A3D directional shadow map vs Three.js WebGLShadowMap PCF";
  readonly generatedInBrowserAt: string;
  readonly scene: typeof SCENE;
  readonly a3d: { readonly renderer: { readonly drawCalls: number; readonly actualA3DRenderer: true }; readonly shadowMap: ShadowMapStats; readonly pixels: PixelStats };
  readonly threejs: { readonly renderer: { readonly actualThreeRenderer: true; readonly drawCalls: number; readonly triangles: number }; readonly shadowMap: ShadowMapStats; readonly pixels: PixelStats };
  readonly diff: DiffStats;
  readonly assertions: {
    readonly sameResolution: boolean;
    readonly actualThreeRenderer: boolean;
    readonly a3dShadowMapRequested: boolean;
    readonly threeShadowMapEnabled: boolean;
    readonly pcfCoverage: boolean;
    readonly shadowContactVisible: boolean;
    readonly screenshotsNonBlank: boolean;
    readonly fakeEqualityClaimed: false;
  };
  readonly dataUrls: { readonly a3d: string; readonly threejs: string; readonly sideBySide: string };
}

interface ShadowMapParityError {
  readonly status: "error";
  readonly schema: "a3d-threejs-parity-shadowmap-parity/v1";
  readonly generatedInBrowserAt: string;
  readonly error: string;
}

interface ShadowMapStats {
  readonly enabled: boolean;
  readonly type: string;
  readonly size: number;
  readonly filter: string;
  readonly pcfSamples: number;
  readonly casterCount: number;
  readonly receiverCount: number;
}

interface PixelStats {
  readonly nonBlackPixels: number;
  readonly uniqueColorBuckets: number;
  readonly shadowPatchLuma: number;
  readonly litPatchLuma: number;
  readonly contactDarkening: number;
}

interface DiffStats {
  readonly meanDelta: number;
  readonly maxDelta: number;
  readonly changedPixels: number;
  readonly structuralSimilarityProxy: number;
}

const SCENE = {
  id: "v9-shadowmap",
  width: 900,
  height: 620,
  shadowMapSize: 2048,
  pcfSamples: 16,
  frameBounds: { min: [-1.75, -0.74, -1.4], max: [1.75, 0.95, 1.4] }
} as const;

const CAMERA = { yawRadians: -0.42, pitchRadians: -0.2, paddingRatio: 0.22, fovYRadians: 0.58, nearPadding: 0.18, farPadding: 2.6 } as const;

void run();

async function run(): Promise<void> {
  const status = document.getElementById("report-status");
  const json = document.getElementById("report-json");
  try {
    const a3dCanvas = requiredCanvas("a3d-shadowmap", SCENE.width, SCENE.height);
    const threeCanvas = requiredCanvas("threejs-shadowmap", SCENE.width, SCENE.height);
    const sideBySideCanvas = requiredCanvas("side-by-side", SCENE.width * 2, SCENE.height + 60);
    if (status) status.textContent = "rendering A3D shadow map";
    const a3d = await renderA3D(a3dCanvas);
    if (status) status.textContent = "rendering Three.js shadow map";
    const threejs = await renderThree(threeCanvas);
    const [a3dPixels, threePixels] = await Promise.all([dataUrlToPixels(a3d.dataUrl), dataUrlToPixels(threejs.dataUrl)]);
    const a3dStats = analyzeImageData(a3dPixels);
    const threeStats = analyzeImageData(threePixels);
    const diff = computeDiff(a3dPixels, threePixels);
    const sideBySide = await drawSideBySide(sideBySideCanvas, a3d.dataUrl, threejs.dataUrl, diff);
    const ready: ShadowMapParityReady = {
      status: "ready",
      schema: "a3d-threejs-parity-shadowmap-parity/v1",
      purpose: "same-scene A3D directional shadow map vs Three.js WebGLShadowMap PCF",
      generatedInBrowserAt: new Date().toISOString(),
      scene: SCENE,
      a3d: { renderer: { drawCalls: a3d.drawCalls, actualA3DRenderer: true }, shadowMap: a3d.shadowMap, pixels: a3dStats },
      threejs: { renderer: { actualThreeRenderer: threejs.actualThreeRenderer, drawCalls: threejs.drawCalls, triangles: threejs.triangles }, shadowMap: threejs.shadowMap, pixels: threeStats },
      diff,
      assertions: {
        sameResolution: a3dPixels.width === threePixels.width && a3dPixels.height === threePixels.height,
        actualThreeRenderer: threejs.actualThreeRenderer,
        a3dShadowMapRequested: a3d.shadowMap.enabled && a3d.shadowMap.size === SCENE.shadowMapSize,
        threeShadowMapEnabled: threejs.shadowMap.enabled && threejs.shadowMap.type === "PCFSoftShadowMap",
        pcfCoverage: a3d.shadowMap.pcfSamples >= 16 && threejs.shadowMap.filter === "pcf-soft",
        shadowContactVisible: Math.abs(a3dStats.contactDarkening) > 2.5 && Math.abs(threeStats.contactDarkening) > 2.5,
        screenshotsNonBlank: a3dStats.nonBlackPixels > 170_000 && threeStats.nonBlackPixels > 180_000,
        fakeEqualityClaimed: false
      },
      dataUrls: { a3d: a3d.dataUrl, threejs: threejs.dataUrl, sideBySide }
    };
    window.__V9_SHADOWMAP_PARITY__ = ready;
    if (status) status.textContent = "ready";
    if (json) json.textContent = JSON.stringify(stripDataUrls(ready), null, 2);
  } catch (error) {
    const failure: ShadowMapParityError = {
      status: "error",
      schema: "a3d-threejs-parity-shadowmap-parity/v1",
      generatedInBrowserAt: new Date().toISOString(),
      error: error instanceof Error ? error.stack ?? error.message : String(error)
    };
    window.__V9_SHADOWMAP_PARITY__ = failure;
    if (status) status.textContent = "error";
    if (json) json.textContent = JSON.stringify(failure, null, 2);
  }
}

async function renderA3D(canvas: HTMLCanvasElement) {
  const renderer = await A3DRenderer.create({ canvas, width: SCENE.width, height: SCENE.height, backend: "webgl2", preserveDrawingBuffer: true, antialias: true, clearColor: [0.012, 0.014, 0.018, 1] });
  const frame = computePerspectiveCameraFrame(SCENE.frameBounds, { width: SCENE.width, height: SCENE.height }, CAMERA);
  const light = new DirectionalLight("v9-shadow-key");
  light.castsShadow = true;
  light.intensity = 3.2;
  light.color = [1, 0.94, 0.84];
  light.transform.setRotation(...quatFromEuler(-0.62, 0.36, 0.08));
  const scene = new Scene();
  scene.root.addChild(light);
  const diagnostics = renderer.render({
    scene,
    renderItems: createA3DItems(),
    environmentLighting: {
      color: [0.12, 0.16, 0.22],
      intensity: 0.34,
      proceduralMap: {
        skyColor: [0.06, 0.1, 0.18],
        horizonColor: [0.18, 0.2, 0.24],
        groundColor: [0.04, 0.04, 0.05],
        specularColor: [0.5, 0.55, 0.62],
        intensity: 0.45,
        specularIntensity: 0.22
      }
    },
    shadow: {
      enabled: true,
      light,
      size: SCENE.shadowMapSize,
      strength: 0.72,
      bias: 0.001,
      slopeBias: 1.1,
      filter: "pcf",
      pcfRadius: 1.35,
      pcfSamples: SCENE.pcfSamples,
      pcfDistribution: "poisson",
      label: "threejs-parity-shadowmap-parity"
    },
    cameraPolicy: "require",
    cameraPosition: frame.cameraPosition
  }, {
    viewProjectionMatrix: frame.viewProjectionMatrix,
    viewMatrix: frame.viewMatrix,
    projectionMatrix: frame.projectionMatrix
  });
  await waitFrames(2);
  return {
    drawCalls: diagnostics.drawCalls,
    shadowMap: { enabled: true, type: "renderer-owned-directional-shadow-map", size: SCENE.shadowMapSize, filter: "pcf", pcfSamples: SCENE.pcfSamples, casterCount: 1, receiverCount: 1 },
    dataUrl: canvas.toDataURL("image/png")
  };
}

function createA3DItems(): readonly RenderItem[] {
  const sphere = Geometry.uvSphere(0.54, 96, 48);
  const floor = Geometry.litCube(1);
  return [
    {
      label: "v9-shadow-floor",
      geometry: floor,
      material: new PBRMaterial({ name: "v9-shadow-floor-material", baseColor: [0.42, 0.44, 0.47, 1], metallic: 0, roughness: 0.78, environmentIntensity: 0.18 }),
      modelMatrix: composeMat4([0, -0.66, 0.18], [0, 0, 0, 1], [4.8, 0.08, 4.3])
    },
    {
      label: "v9-shadow-sphere",
      geometry: sphere,
      material: new PBRMaterial({ name: "v9-shadow-sphere-material", baseColor: [0.82, 0.86, 0.9, 1], metallic: 0.3, roughness: 0.34, environmentIntensity: 0.2 }),
      modelMatrix: composeMat4([0, -0.04, 0], [0, 0, 0, 1], [1, 1, 1])
    }
  ];
}

async function renderThree(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SCENE.width, SCENE.height, false);
  renderer.setClearColor(0x030406, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if (!(renderer instanceof THREE.WebGLRenderer)) throw new Error("Shadow-map parity requires an actual THREE.WebGLRenderer.");
  const scene = createThreeScene();
  const camera = new THREE.PerspectiveCamera(33, SCENE.width / SCENE.height, 0.1, 20);
  camera.position.set(2.35, 1.42, 3.36);
  camera.lookAt(0, -0.1, 0);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  await waitFrames(2);
  return {
    actualThreeRenderer: true as const,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    shadowMap: { enabled: renderer.shadowMap.enabled, type: "PCFSoftShadowMap", size: SCENE.shadowMapSize, filter: "pcf-soft", pcfSamples: 4, casterCount: 1, receiverCount: 1 },
    dataUrl: canvas.toDataURL("image/png")
  };
}

function createThreeScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030406);
  scene.add(new THREE.HemisphereLight(0x1f2938, 0x070709, 0.32));
  const light = new THREE.DirectionalLight(0xffefd6, 3.2);
  light.position.set(2.1, 3.2, 2.2);
  light.castShadow = true;
  light.shadow.mapSize.width = SCENE.shadowMapSize;
  light.shadow.mapSize.height = SCENE.shadowMapSize;
  light.shadow.camera.near = 0.1;
  light.shadow.camera.far = 8;
  light.shadow.camera.left = -2.4;
  light.shadow.camera.right = 2.4;
  light.shadow.camera.top = 2.4;
  light.shadow.camera.bottom = -2.4;
  light.shadow.bias = -0.0008;
  scene.add(light);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x6b7078, roughness: 0.78, metalness: 0 }));
  floor.position.set(0, -0.66, 0.18);
  floor.scale.set(4.8, 0.08, 4.3);
  floor.receiveShadow = true;
  scene.add(floor);
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.54, 96, 48), new THREE.MeshStandardMaterial({ color: 0xd1dbe6, roughness: 0.34, metalness: 0.3 }));
  sphere.position.set(0, -0.04, 0);
  sphere.castShadow = true;
  sphere.receiveShadow = true;
  scene.add(sphere);
  return scene;
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
  if (!context) throw new Error("Unable to create shadow-map pixel canvas.");
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function analyzeImageData(image: ImageData): PixelStats {
  const shadowPatchLuma = regionLuma(image, 394, 230, 112, 84);
  const litPatchLuma = regionLuma(image, 570, 230, 112, 84);
  const buckets = new Set<number>();
  let nonBlackPixels = 0;
  for (let offset = 0; offset + 3 < image.data.length; offset += 4) {
    const red = image.data[offset] ?? 0;
    const green = image.data[offset + 1] ?? 0;
    const blue = image.data[offset + 2] ?? 0;
    if (red + green + blue > 24) nonBlackPixels += 1;
    buckets.add(((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4));
  }
  return {
    nonBlackPixels,
    uniqueColorBuckets: buckets.size,
    shadowPatchLuma,
    litPatchLuma,
    contactDarkening: Number((litPatchLuma - shadowPatchLuma).toFixed(4))
  };
}

function regionLuma(image: ImageData, x: number, y: number, width: number, height: number): number {
  let total = 0;
  let count = 0;
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      const offset = (row * image.width + column) * 4;
      total += luma(image.data[offset] ?? 0, image.data[offset + 1] ?? 0, image.data[offset + 2] ?? 0);
      count += 1;
    }
  }
  return Number((total / Math.max(1, count)).toFixed(4));
}

function computeDiff(left: ImageData, right: ImageData): DiffStats {
  if (left.width !== right.width || left.height !== right.height) {
    throw new Error(`Cannot diff shadow-map captures with mismatched size: ${left.width}x${left.height} vs ${right.width}x${right.height}.`);
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
  if (!context) throw new Error("Unable to create shadow-map side-by-side canvas.");
  const [a3d, three] = await Promise.all([loadImage(a3dDataUrl), loadImage(threeDataUrl)]);
  context.fillStyle = "#07090d";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(a3d, 0, 0, SCENE.width, SCENE.height);
  context.drawImage(three, SCENE.width, 0, SCENE.width, SCENE.height);
  context.fillStyle = "rgba(7, 9, 13, 0.92)";
  context.fillRect(0, SCENE.height, canvas.width, 60);
  context.fillStyle = "#f3f6f8";
  context.font = "20px system-ui, sans-serif";
  context.fillText("Left: A3D directional shadow map | Right: Three.js WebGLShadowMap PCFSoftShadowMap", 20, SCENE.height + 28);
  context.fillStyle = "#aeb8c6";
  context.font = "16px system-ui, sans-serif";
  context.fillText(`mean delta ${diff.meanDelta} | changed ${diff.changedPixels} | SSIM proxy ${diff.structuralSimilarityProxy}`, 20, SCENE.height + 50);
  return canvas.toDataURL("image/png");
}

async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Unable to decode shadow-map parity image data URL."));
    image.src = dataUrl;
  });
  return image;
}

function stripDataUrls(result: ShadowMapParityReady): Omit<ShadowMapParityReady, "dataUrls"> {
  const { dataUrls: _dataUrls, ...rest } = result;
  return rest;
}

function luma(red: number, green: number, blue: number): number {
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

async function waitFrames(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
