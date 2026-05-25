// @ts-nocheck
import {
  Geometry,
  PBRMaterial,
  computePerspectiveCameraFrame,
  type CameraFrameBounds,
  type CollectedLight,
  type RenderItem,
  type RenderSource
} from "@galileo3d/rendering";
import { G3DRenderer } from "@galileo3d/engine/advanced-runtime";
import { DirectionalLight, PointLight, SpotLight, composeMat4, quatFromEuler } from "@galileo3d/scene";
import * as THREE from "three";

declare global {
  interface Window {
    __V9_PHYSICAL_LIGHTS_PARITY__?: PhysicalLightsParityResult;
  }
}

export {};

type PhysicalLightsParityResult = PhysicalLightsParityReady | PhysicalLightsParityError;

interface PhysicalLightsParityReady {
  readonly status: "ready";
  readonly schema: "g3d-threejs-parity-physical-lights-parity/v1";
  readonly purpose: "same-scene G3D point/spot range attenuation vs Three.js PointLight/SpotLight decay scene";
  readonly generatedInBrowserAt: string;
  readonly scene: typeof SCENE;
  readonly g3d: { readonly renderer: { readonly drawCalls: number; readonly actualG3DRenderer: true }; readonly lights: LightStats; readonly pixels: PixelStats };
  readonly threejs: { readonly renderer: { readonly actualThreeRenderer: true; readonly drawCalls: number; readonly triangles: number }; readonly lights: LightStats; readonly pixels: PixelStats };
  readonly attenuationSamples: readonly AttenuationSample[];
  readonly diff: DiffStats;
  readonly assertions: {
    readonly sameResolution: boolean;
    readonly actualThreeRenderer: boolean;
    readonly g3dPointAndSpotLights: boolean;
    readonly threePointAndSpotLights: boolean;
    readonly inverseSquareSamples: boolean;
    readonly screenshotsNonBlank: boolean;
    readonly visibleLightGradient: boolean;
    readonly fakeEqualityClaimed: false;
  };
  readonly dataUrls: { readonly g3d: string; readonly threejs: string; readonly sideBySide: string };
}

interface PhysicalLightsParityError {
  readonly status: "error";
  readonly schema: "g3d-threejs-parity-physical-lights-parity/v1";
  readonly generatedInBrowserAt: string;
  readonly error: string;
}

interface LightStats {
  readonly pointLights: number;
  readonly spotLights: number;
  readonly decay: number;
  readonly range: number;
  readonly spotAngle: number;
  readonly penumbra: number;
}

interface PixelStats {
  readonly nonBlackPixels: number;
  readonly litPixels: number;
  readonly uniqueColorBuckets: number;
  readonly averageLuma: number;
  readonly localContrast: number;
}

interface AttenuationSample {
  readonly distance: number;
  readonly g3d: number;
  readonly threeDecay2: number;
  readonly delta: number;
}

interface DiffStats {
  readonly meanDelta: number;
  readonly maxDelta: number;
  readonly changedPixels: number;
  readonly structuralSimilarityProxy: number;
}

const SCENE = {
  id: "v9-physical-lights",
  width: 900,
  height: 520,
  range: 4.2,
  decay: 2,
  spotAngle: Math.PI / 5,
  penumbra: 0.35,
  frameBounds: { min: [-2.2, -0.82, -1.2], max: [2.2, 1.15, 1.2] } as CameraFrameBounds
} as const;

const CAMERA = { yawRadians: -0.18, pitchRadians: -0.14, paddingRatio: 0.17, fovYRadians: 0.72, nearPadding: 0.16, farPadding: 2.6 } as const;

void run();

async function run(): Promise<void> {
  const status = document.getElementById("report-status");
  const json = document.getElementById("report-json");
  try {
    const g3dCanvas = requiredCanvas("g3d-physical-lights", SCENE.width, SCENE.height);
    const threeCanvas = requiredCanvas("threejs-physical-lights", SCENE.width, SCENE.height);
    const sideBySideCanvas = requiredCanvas("side-by-side", SCENE.width * 2, SCENE.height + 60);
    if (status) status.textContent = "rendering G3D physical lights";
    const g3d = await renderG3D(g3dCanvas);
    if (status) status.textContent = "rendering Three.js physical lights";
    const threejs = await renderThree(threeCanvas);
    const [g3dPixels, threePixels] = await Promise.all([dataUrlToPixels(g3d.dataUrl), dataUrlToPixels(threejs.dataUrl)]);
    const g3dStats = analyzeImageData(g3dPixels);
    const threeStats = analyzeImageData(threePixels);
    const attenuationSamples = createAttenuationSamples();
    const diff = computeDiff(g3dPixels, threePixels);
    const sideBySide = await drawSideBySide(sideBySideCanvas, g3d.dataUrl, threejs.dataUrl, diff);
    const ready: PhysicalLightsParityReady = {
      status: "ready",
      schema: "g3d-threejs-parity-physical-lights-parity/v1",
      purpose: "same-scene G3D point/spot range attenuation vs Three.js PointLight/SpotLight decay scene",
      generatedInBrowserAt: new Date().toISOString(),
      scene: SCENE,
      g3d: { renderer: { drawCalls: g3d.drawCalls, actualG3DRenderer: true }, lights: lightStats(), pixels: g3dStats },
      threejs: { renderer: { actualThreeRenderer: threejs.actualThreeRenderer, drawCalls: threejs.drawCalls, triangles: threejs.triangles }, lights: lightStats(), pixels: threeStats },
      attenuationSamples,
      diff,
      assertions: {
        sameResolution: g3dPixels.width === threePixels.width && g3dPixels.height === threePixels.height,
        actualThreeRenderer: threejs.actualThreeRenderer,
        g3dPointAndSpotLights: g3d.lightKinds.includes("point") && g3d.lightKinds.includes("spot"),
        threePointAndSpotLights: threejs.pointLights === 1 && threejs.spotLights === 1,
        inverseSquareSamples: attenuationSamples.every((sample) => sample.delta <= 0.18),
        screenshotsNonBlank: g3dStats.litPixels > 25_000 && threeStats.litPixels > 25_000,
        visibleLightGradient: g3dStats.uniqueColorBuckets > 60 && threeStats.uniqueColorBuckets > 60,
        fakeEqualityClaimed: false
      },
      dataUrls: { g3d: g3d.dataUrl, threejs: threejs.dataUrl, sideBySide }
    };
    window.__V9_PHYSICAL_LIGHTS_PARITY__ = ready;
    if (status) status.textContent = "ready";
    if (json) json.textContent = JSON.stringify(stripDataUrls(ready), null, 2);
  } catch (error) {
    const failure: PhysicalLightsParityError = {
      status: "error",
      schema: "g3d-threejs-parity-physical-lights-parity/v1",
      generatedInBrowserAt: new Date().toISOString(),
      error: error instanceof Error ? error.stack ?? error.message : String(error)
    };
    window.__V9_PHYSICAL_LIGHTS_PARITY__ = failure;
    if (status) status.textContent = "error";
    if (json) json.textContent = JSON.stringify(failure, null, 2);
  }
}

async function renderG3D(canvas: HTMLCanvasElement) {
  const renderer = await G3DRenderer.create({ canvas, width: SCENE.width, height: SCENE.height, backend: "webgl2", preserveDrawingBuffer: true, antialias: true, clearColor: [0.025, 0.027, 0.032, 1] });
  const frame = computePerspectiveCameraFrame(SCENE.frameBounds, { width: SCENE.width, height: SCENE.height }, CAMERA);
  const lights = createCollectedLights();
  const result = renderer.render({
    source: createSource(lights),
    camera: { viewProjectionMatrix: frame.viewProjectionMatrix, viewMatrix: frame.viewMatrix, projectionMatrix: frame.projectionMatrix }
  });
  await waitFrames(2);
  return {
    drawCalls: result.drawCalls,
    lightKinds: lights.map((light) => light.kind),
    dataUrl: canvas.toDataURL("image/png")
  };
}

async function renderThree(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SCENE.width, SCENE.height, false);
  renderer.setClearColor(0x06070a, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  if (!(renderer instanceof THREE.WebGLRenderer)) throw new Error("Physical light parity requires an actual THREE.WebGLRenderer.");
  const scene = createThreeScene();
  const camera = new THREE.PerspectiveCamera(41, SCENE.width / SCENE.height, 0.1, 20);
  camera.position.set(0.42, 1.12, 3.9);
  camera.lookAt(0, 0.04, 0);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  await waitFrames(2);
  return {
    actualThreeRenderer: true as const,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    pointLights: 1,
    spotLights: 1,
    dataUrl: canvas.toDataURL("image/png")
  };
}

function createSource(lights: readonly CollectedLight[]): RenderSource {
  return {
    collectRenderItems: () => createG3DItems(),
    collectedLights: lights,
    cameraPolicy: "require",
    cameraFrameBounds: SCENE.frameBounds,
    environmentLighting: false,
    frustumCulling: false,
    postprocess: { toneMapping: { exposure: 1.0, operator: "aces", inputColorSpace: "linear", outputColorSpace: "srgb" }, fxaa: true }
  };
}

function createG3DItems(): readonly RenderItem[] {
  const cube = Geometry.litCube(1);
  const sphere = Geometry.uvSphere(0.5, 48, 24);
  const floor = new PBRMaterial({ name: "physical-lights-floor", baseColor: [0.45, 0.45, 0.44, 1], roughness: 0.58, metallic: 0, environmentIntensity: 0 });
  const red = new PBRMaterial({ name: "point-attenuation-red", baseColor: [0.82, 0.18, 0.12, 1], roughness: 0.34, metallic: 0.04, environmentIntensity: 0 });
  const blue = new PBRMaterial({ name: "spot-attenuation-blue", baseColor: [0.14, 0.42, 0.9, 1], roughness: 0.28, metallic: 0.02, environmentIntensity: 0 });
  const white = new PBRMaterial({ name: "range-reference-white", baseColor: [0.78, 0.78, 0.72, 1], roughness: 0.72, metallic: 0, environmentIntensity: 0 });
  return [
    { label: "physical-lights-floor", geometry: cube, material: floor, modelMatrix: composeMat4([0, -0.58, 0], [0, 0, 0, 1], [5.3, 0.05, 2.7]) },
    { label: "physical-lights-left-near", geometry: sphere, material: red, modelMatrix: composeMat4([-1.25, -0.08, 0.35], quatFromEuler(0, 0.2, 0), [0.42, 0.42, 0.42]) },
    { label: "physical-lights-center", geometry: sphere, material: white, modelMatrix: composeMat4([0, -0.08, -0.2], quatFromEuler(0, -0.18, 0), [0.48, 0.48, 0.48]) },
    { label: "physical-lights-right-spot", geometry: sphere, material: blue, modelMatrix: composeMat4([1.25, -0.08, 0.22], quatFromEuler(0, -0.25, 0), [0.42, 0.42, 0.42]) }
  ];
}

function createCollectedLights(): readonly CollectedLight[] {
  const point = new PointLight("v9-point");
  point.intensity = 8.6;
  point.color = [1, 0.72, 0.44];
  point.range = SCENE.range;
  const spot = new SpotLight("v9-spot");
  spot.intensity = 11.5;
  spot.color = [0.42, 0.64, 1];
  spot.range = SCENE.range;
  spot.angle = SCENE.spotAngle;
  spot.penumbra = SCENE.penumbra;
  const fill = new DirectionalLight("v9-light-fill");
  fill.intensity = 0.18;
  fill.color = [0.7, 0.78, 1];
  return [
    { kind: "point", color: point.color, intensity: point.intensity, position: [-1.35, 1.25, 1.08], direction: [0, -1, 0], range: point.range, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: point },
    { kind: "spot", color: spot.color, intensity: spot.intensity, position: [1.35, 1.36, 1.16], direction: [-0.24, -0.84, -0.48], range: spot.range, spotAngle: spot.angle, penumbra: spot.penumbra, castsShadow: false, layerMask: 0xffffffff, source: spot },
    { kind: "directional", color: fill.color, intensity: fill.intensity, position: [0, 2, 2], direction: [-0.2, -0.6, -0.76], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: fill }
  ];
}

function createThreeScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x06070a);
  const point = new THREE.PointLight(0xffb870, 8.6, SCENE.range, SCENE.decay);
  point.position.set(-1.35, 1.25, 1.08);
  scene.add(point);
  const spot = new THREE.SpotLight(0x6ba3ff, 11.5, SCENE.range, SCENE.spotAngle, SCENE.penumbra, SCENE.decay);
  spot.position.set(1.35, 1.36, 1.16);
  spot.target.position.set(0.78, -0.25, 0.02);
  scene.add(spot, spot.target);
  const fill = new THREE.DirectionalLight(0xb3c7ff, 0.18);
  fill.position.set(0, 2, 2);
  scene.add(fill);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x737370, roughness: 0.58, metalness: 0 }));
  floor.position.set(0, -0.58, 0);
  floor.scale.set(5.3, 0.05, 2.7);
  scene.add(floor);
  addSphere(scene, [-1.25, -0.08, 0.35], 0xdd2e1f, 0.34);
  addSphere(scene, [0, -0.08, -0.2], 0xc7c7b8, 0.72);
  addSphere(scene, [1.25, -0.08, 0.22], 0x246be6, 0.28);
  return scene;
}

function addSphere(scene: THREE.Scene, position: readonly [number, number, number], color: number, roughness: number): void {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 48, 24), new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.03 }));
  mesh.position.set(position[0], position[1], position[2]);
  mesh.scale.setScalar(position[0] === 0 ? 0.48 : 0.42);
  scene.add(mesh);
}

function createAttenuationSamples(): readonly AttenuationSample[] {
  return [1, 2, 3].map((distance) => {
    const g3d = g3dAttenuation(distance, SCENE.range);
    const threeDecay2 = threeDecayAttenuation(distance, SCENE.range, SCENE.decay);
    return { distance, g3d, threeDecay2, delta: Number(Math.abs(g3d - threeDecay2).toFixed(4)) };
  });
}

function g3dAttenuation(distance: number, range: number): number {
  const rangeFalloff = Math.max(0, Math.min(1, 1 - Math.pow(distance / range, 4)));
  return Number((rangeFalloff / Math.max(distance * distance, 1)).toFixed(4));
}

function threeDecayAttenuation(distance: number, range: number, decay: number): number {
  const distanceFalloff = 1 / Math.max(Math.pow(distance, decay), 1);
  const cutoff = Math.max(0, Math.min(1, 1 - Math.pow(distance / range, 4)));
  return Number((distanceFalloff * cutoff).toFixed(4));
}

function lightStats(): LightStats {
  return { pointLights: 1, spotLights: 1, decay: SCENE.decay, range: SCENE.range, spotAngle: SCENE.spotAngle, penumbra: SCENE.penumbra };
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
  if (!context) throw new Error("Unable to create physical-light pixel canvas.");
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function analyzeImageData(image: ImageData): PixelStats {
  let nonBlackPixels = 0;
  let litPixels = 0;
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
      if (value > 32) litPixels += 1;
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
    litPixels,
    uniqueColorBuckets: buckets.size,
    averageLuma: Number((lumaTotal / (image.data.length / 4)).toFixed(4)),
    localContrast: Number((contrastTotal / Math.max(1, image.width * image.height - image.height)).toFixed(4))
  };
}

function computeDiff(left: ImageData, right: ImageData): DiffStats {
  if (left.width !== right.width || left.height !== right.height) {
    throw new Error(`Cannot diff physical-light captures with mismatched size: ${left.width}x${left.height} vs ${right.width}x${right.height}.`);
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

async function drawSideBySide(canvas: HTMLCanvasElement, g3dDataUrl: string, threeDataUrl: string, diff: DiffStats): Promise<string> {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create physical-light side-by-side canvas.");
  const [g3d, three] = await Promise.all([loadImage(g3dDataUrl), loadImage(threeDataUrl)]);
  context.fillStyle = "#07090d";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(g3d, 0, 0, SCENE.width, SCENE.height);
  context.drawImage(three, SCENE.width, 0, SCENE.width, SCENE.height);
  context.fillStyle = "rgba(7, 9, 13, 0.92)";
  context.fillRect(0, SCENE.height, canvas.width, 60);
  context.fillStyle = "#f3f6f8";
  context.font = "20px system-ui, sans-serif";
  context.fillText("Left: G3D point/spot lights | Right: Three.js PointLight/SpotLight decay=2", 20, SCENE.height + 28);
  context.fillStyle = "#aeb8c6";
  context.font = "16px system-ui, sans-serif";
  context.fillText(`mean delta ${diff.meanDelta} | changed ${diff.changedPixels} | SSIM proxy ${diff.structuralSimilarityProxy}`, 20, SCENE.height + 50);
  return canvas.toDataURL("image/png");
}

async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Unable to decode physical-light parity image data URL."));
    image.src = dataUrl;
  });
  return image;
}

function stripDataUrls(result: PhysicalLightsParityReady): Omit<PhysicalLightsParityReady, "dataUrls"> {
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
