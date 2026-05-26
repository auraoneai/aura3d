// @ts-nocheck
import {
  DEFAULT_GLTF_STUDIO_PREVIEW_ENVIRONMENT_LIGHTING,
  createGLTFSceneAnimationRuntime,
  loadV6GLTFRenderPipeline
} from "@aura3d/assets";
import { A3DRenderer } from "@aura3d/engine/advanced-runtime";
import { Geometry, PBRMaterial, computePerspectiveCameraFrame } from "@aura3d/rendering";
import { DirectionalLight, composeMat4, multiplyMat4 } from "@aura3d/scene";
import * as THREE from "three";
import { GLTFLoader } from "/node_modules/three/examples/jsm/loaders/GLTFLoader.js";

declare global {
  interface Window {
    __V9_ANIMATION_WALK_PARITY__?: AnimationWalkParityResult;
  }
}

export {};

type AnimationWalkParityResult = AnimationWalkParityReady | AnimationWalkParityError;

interface AnimationWalkParityReady {
  readonly status: "ready";
  readonly schema: "a3d-threejs-parity-animation-walk-parity/v1";
  readonly purpose: "same-asset Soldier Walk clip A3D imported animation runtime vs actual Three.js AnimationMixer";
  readonly generatedInBrowserAt: string;
  readonly asset: typeof ASSET;
  readonly a3d: {
    readonly renderer: { readonly drawCalls: number; readonly triangles: number };
    readonly animation: { readonly clipName: string; readonly sampledAtSeconds: number; readonly tracksApplied: number; readonly skinningPalettesUpdated: number };
    readonly pixels: PixelStats;
  };
  readonly threejs: {
    readonly loader: { readonly actualGLTFLoader: true; readonly actualThreeRenderer: true; readonly actualAnimationMixer: true };
    readonly animation: { readonly clipName: string; readonly sampledAtSeconds: number; readonly skinnedMeshCount: number; readonly clipCount: number };
    readonly renderer: { readonly drawCalls: number; readonly triangles: number };
    readonly pixels: PixelStats;
  };
  readonly diff: DiffStats;
  readonly assertions: {
    readonly sameAssetUrl: boolean;
    readonly sameWalkClip: boolean;
    readonly actualThreeGLTFLoader: boolean;
    readonly actualThreeRenderer: boolean;
    readonly actualThreeAnimationMixer: boolean;
    readonly a3dAppliedTracksAndSkinning: boolean;
    readonly screenshotsNonBlank: boolean;
    readonly fakeEqualityClaimed: false;
  };
  readonly dataUrls: { readonly a3d: string; readonly threejs: string; readonly sideBySide: string };
}

interface AnimationWalkParityError {
  readonly status: "error";
  readonly schema: "a3d-threejs-parity-animation-walk-parity/v1";
  readonly generatedInBrowserAt: string;
  readonly error: string;
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
  id: "soldier",
  name: "Soldier Walk",
  url: "/fixtures/threejs-parity/assets/character/soldier.glb",
  width: 720,
  height: 480
} as const;
const SAMPLE_SECONDS = 0.92;
const FRAME_BOUNDS = { min: [-1.35, -0.08, -0.72], max: [1.35, 2.05, 0.72] } as const;
const CAMERA_FRAME = {
  yawRadians: Math.PI,
  pitchRadians: -0.18,
  paddingRatio: 0.09,
  fovYRadians: 0.72,
  nearPadding: 0.16,
  farPadding: 2.4
} as const;
const PLACEMENT = composeMat4([0, 0, 0], [0, 0, 0, 1], [0.78, 0.78, 0.78]);

void run();

async function run(): Promise<void> {
  const status = document.getElementById("report-status");
  const json = document.getElementById("report-json");
  try {
    const a3dCanvas = requiredCanvas("a3d-animation-walk", ASSET.width, ASSET.height);
    const threeCanvas = requiredCanvas("threejs-animation-walk", ASSET.width, ASSET.height);
    const sideBySideCanvas = requiredCanvas("side-by-side", ASSET.width * 2, ASSET.height + 60);
    if (status) status.textContent = "rendering A3D Soldier Walk";
    const a3d = await renderA3D(a3dCanvas);
    if (status) status.textContent = "rendering Three.js Soldier Walk reference";
    const threejs = await renderThree(threeCanvas, a3d.clipName);
    const [a3dPixels, threePixels] = await Promise.all([dataUrlToPixels(a3d.dataUrl), dataUrlToPixels(threejs.dataUrl)]);
    const diff = computeDiff(a3dPixels, threePixels);
    const sideBySide = await drawSideBySide(sideBySideCanvas, a3d.dataUrl, threejs.dataUrl, diff);
    const a3dStats = analyzeImageData(a3dPixels);
    const threeStats = analyzeImageData(threePixels);
    const ready: AnimationWalkParityReady = {
      status: "ready",
      schema: "a3d-threejs-parity-animation-walk-parity/v1",
      purpose: "same-asset Soldier Walk clip A3D imported animation runtime vs actual Three.js AnimationMixer",
      generatedInBrowserAt: new Date().toISOString(),
      asset: ASSET,
      a3d: {
        renderer: { drawCalls: a3d.drawCalls, triangles: a3d.triangles },
        animation: { clipName: a3d.clipName, sampledAtSeconds: SAMPLE_SECONDS, tracksApplied: a3d.tracksApplied, skinningPalettesUpdated: a3d.skinningPalettesUpdated },
        pixels: a3dStats
      },
      threejs: {
        loader: {
          actualGLTFLoader: threejs.actualGLTFLoader,
          actualThreeRenderer: threejs.actualThreeRenderer,
          actualAnimationMixer: threejs.actualAnimationMixer
        },
        animation: { clipName: threejs.clipName, sampledAtSeconds: SAMPLE_SECONDS, skinnedMeshCount: threejs.skinnedMeshCount, clipCount: threejs.clipCount },
        renderer: { drawCalls: threejs.drawCalls, triangles: threejs.triangles },
        pixels: threeStats
      },
      diff,
      assertions: {
        sameAssetUrl: true,
        sameWalkClip: /^walk$/i.test(a3d.clipName) && a3d.clipName === threejs.clipName,
        actualThreeGLTFLoader: threejs.actualGLTFLoader,
        actualThreeRenderer: threejs.actualThreeRenderer,
        actualThreeAnimationMixer: threejs.actualAnimationMixer,
        a3dAppliedTracksAndSkinning: a3d.tracksApplied > 0 && a3d.skinningPalettesUpdated > 0,
        screenshotsNonBlank: a3dStats.nonBlackPixels > 45_000 && threeStats.nonBlackPixels > 45_000,
        fakeEqualityClaimed: false
      },
      dataUrls: { a3d: a3d.dataUrl, threejs: threejs.dataUrl, sideBySide }
    };
    window.__V9_ANIMATION_WALK_PARITY__ = ready;
    if (status) status.textContent = "ready";
    if (json) json.textContent = JSON.stringify(stripDataUrls(ready), null, 2);
  } catch (error) {
    const failure: AnimationWalkParityError = {
      status: "error",
      schema: "a3d-threejs-parity-animation-walk-parity/v1",
      generatedInBrowserAt: new Date().toISOString(),
      error: error instanceof Error ? error.stack ?? error.message : String(error)
    };
    window.__V9_ANIMATION_WALK_PARITY__ = failure;
    if (status) status.textContent = "error";
    if (json) json.textContent = JSON.stringify(failure, null, 2);
  }
}

async function renderA3D(canvas: HTMLCanvasElement) {
  const pipeline = await loadV6GLTFRenderPipeline({
    url: ASSET.url,
    assetId: "v9-animation-walk-soldier",
    assetName: ASSET.name,
    width: ASSET.width,
    height: ASSET.height,
    rendererInput: {
      cameraPolicy: "require",
      cameraFrameBounds: FRAME_BOUNDS,
      frame: CAMERA_FRAME,
      postprocess: false,
      frustumCulling: false
    }
  });
  const renderer = await A3DRenderer.create({
    canvas,
    width: ASSET.width,
    height: ASSET.height,
    backend: "webgl2",
    preserveDrawingBuffer: true,
    antialias: true,
    clearColor: [0.62, 0.62, 0.62, 1]
  });
  const animationRuntime = createGLTFSceneAnimationRuntime({
    scene: pipeline.resources.scene,
    clips: pipeline.asset.animations,
    asset: pipeline.asset
  });
  const walkClip = pipeline.asset.animations.find((clip) => /^walk$/i.test(clip.name)) ?? pipeline.asset.animations[0];
  if (!walkClip) throw new Error("Animation walk parity requires an imported walk clip.");
  const applyResult = animationRuntime.applyClip(walkClip, walkClip.duration > 0 ? SAMPLE_SECONDS % walkClip.duration : 0);
  const frame = computePerspectiveCameraFrame(FRAME_BOUNDS, { width: ASSET.width, height: ASSET.height }, CAMERA_FRAME);
  const diagnostics = renderer.render({
    source: {
      collectRenderItems: () => [...createA3DStageItems(), ...collectImportedItems(pipeline, PLACEMENT)],
      collectedLights: createA3DLights(),
      environmentLighting: DEFAULT_GLTF_STUDIO_PREVIEW_ENVIRONMENT_LIGHTING,
      cameraPolicy: "require",
      cameraPosition: frame.cameraPosition,
      cameraFrameBounds: FRAME_BOUNDS,
      frustumCulling: false,
      postprocess: false
    },
    camera: { viewProjectionMatrix: frame.viewProjectionMatrix, viewMatrix: frame.viewMatrix, projectionMatrix: frame.projectionMatrix }
  });
  return {
    clipName: walkClip.name,
    tracksApplied: applyResult.tracksApplied,
    skinningPalettesUpdated: applyResult.skinningPalettesUpdated,
    drawCalls: diagnostics.drawCalls,
    triangles: diagnostics.triangles,
    dataUrl: canvas.toDataURL("image/png")
  };
}

function collectImportedItems(pipeline, placement) {
  const items = [];
  pipeline.resources.scene.updateWorldTransforms();
  for (const { node, renderable } of pipeline.resources.scene.collectRenderables()) {
    const geometry = pipeline.resources.geometryLibrary.get(renderable.geometry);
    const material = pipeline.resources.materialLibrary.get(renderable.material);
    if (!geometry || !material) continue;
    const skinning = renderable.skinning
      ? { jointCount: renderable.skinning.jointCount, matrices: new Float32Array(renderable.skinning.matrices) }
      : undefined;
    items.push({
      label: `v9-animation-walk:${node.name}`,
      geometry,
      material,
      modelMatrix: multiplyMat4(placement, node.transform.worldMatrix),
      ...(skinning ? { skinning } : {})
    });
  }
  return items;
}

function createA3DStageItems() {
  const cube = Geometry.litCube(1);
  const shadow = Geometry.cylinder({ radius: 0.5, height: 1, segments: 48, capped: true });
  const floor = new PBRMaterial({ name: "animation-walk-parity-floor", baseColor: [0.73, 0.73, 0.73, 1], roughness: 0.66, metallic: 0, environmentIntensity: 0.25 });
  const contact = new PBRMaterial({ name: "animation-walk-parity-contact", baseColor: [0.42, 0.42, 0.42, 1], roughness: 0.9, metallic: 0, environmentIntensity: 0 });
  return [
    { label: "animation-walk-parity-floor", geometry: cube, material: floor, modelMatrix: composeMat4([0, -0.055, 0], [0, 0, 0, 1], [4.2, 0.035, 3.1]) },
    { label: "animation-walk-parity-contact", geometry: shadow, material: contact, modelMatrix: composeMat4([0, -0.024, 0.14], [0, 0, 0, 1], [1.22, 0.012, 0.58]) }
  ];
}

function createA3DLights() {
  const key = new DirectionalLight("v9-animation-walk-key");
  key.intensity = 5.6;
  key.color = [1, 1, 1];
  const rim = new DirectionalLight("v9-animation-walk-rim");
  rim.intensity = 2.4;
  rim.color = [0.78, 0.82, 0.9];
  return [
    { kind: "directional", color: key.color, intensity: key.intensity, position: [-3, 10, -10], direction: [0.24, -0.78, 0.58], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: key },
    { kind: "directional", color: rim.color, intensity: rim.intensity, position: [3, 4, 4], direction: [-0.46, -0.42, -0.78], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: rim }
  ];
}

async function renderThree(canvas: HTMLCanvasElement, clipName: string) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(ASSET.width, ASSET.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(ASSET.url);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xa0a0a0);
  scene.add(createThreeStage());
  scene.add(createThreeLights());
  const soldier = gltf.scene;
  soldier.scale.set(0.78, 0.78, 0.78);
  let skinnedMeshCount = 0;
  soldier.traverse((object) => {
    if ("isSkinnedMesh" in object && object.isSkinnedMesh === true) skinnedMeshCount += 1;
  });
  const walkClip = gltf.animations.find((clip) => clip.name === clipName) ?? gltf.animations.find((clip) => /^walk$/i.test(clip.name)) ?? gltf.animations[0];
  if (!walkClip) throw new Error("Three.js animation walk reference requires an imported walk clip.");
  const mixer = new THREE.AnimationMixer(soldier);
  const action = mixer.clipAction(walkClip);
  action.play();
  mixer.setTime(walkClip.duration > 0 ? SAMPLE_SECONDS % walkClip.duration : 0);
  scene.add(soldier);
  const frame = computePerspectiveCameraFrame(FRAME_BOUNDS, { width: ASSET.width, height: ASSET.height }, CAMERA_FRAME);
  const camera = new THREE.PerspectiveCamera(frame.fovYRadians * 180 / Math.PI, ASSET.width / ASSET.height, frame.near, frame.far);
  camera.position.set(...frame.cameraPosition);
  camera.lookAt(0, 0.985, 0);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  return {
    actualGLTFLoader: loader instanceof GLTFLoader,
    actualThreeRenderer: renderer instanceof THREE.WebGLRenderer,
    actualAnimationMixer: mixer instanceof THREE.AnimationMixer,
    clipName: walkClip.name,
    clipCount: gltf.animations.length,
    skinnedMeshCount,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    dataUrl: canvas.toDataURL("image/png")
  };
}

function createThreeStage() {
  const group = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.035, 3.1), new THREE.MeshStandardMaterial({ color: 0xb9b9b9, roughness: 0.66, metalness: 0 }));
  floor.position.set(0, -0.055, 0);
  group.add(floor);
  const contact = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.012, 48), new THREE.MeshBasicMaterial({ color: 0x686868, transparent: true, opacity: 0.34, depthWrite: false }));
  contact.position.set(0, -0.024, 0.14);
  contact.scale.set(1.22, 1, 0.58);
  group.add(contact);
  return group;
}

function createThreeLights() {
  const group = new THREE.Group();
  const key = new THREE.DirectionalLight(0xffffff, 3.7);
  key.position.set(-3, 10, -10);
  group.add(key);
  const rim = new THREE.DirectionalLight(0xc7d1e5, 1.8);
  rim.position.set(3, 4, 4);
  group.add(rim);
  group.add(new THREE.HemisphereLight(0xd8deea, 0x9b9b9b, 0.9));
  return group;
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
  return { nonBlackPixels, uniqueColorBuckets: buckets.size, averageLuma: round(lumaSum / pixels), localContrast: round(maxLuma - minLuma) };
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
    if (delta > 22) changedPixels += 1;
  }
  const meanDelta = total / (a.width * a.height);
  return { meanDelta: round(meanDelta), maxDelta: round(maxDelta), changedPixels, structuralSimilarityProxy: round(Math.max(0, 1 - meanDelta / 255)) };
}

async function drawSideBySide(canvas: HTMLCanvasElement, a3dDataUrl: string, threeDataUrl: string, diff: DiffStats): Promise<string> {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to draw side-by-side animation walk comparison.");
  const [a3d, three] = await Promise.all([loadImage(a3dDataUrl), loadImage(threeDataUrl)]);
  context.fillStyle = "#f2f3f5";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(a3d, 0, 0);
  context.drawImage(three, ASSET.width, 0);
  context.fillStyle = "#15171c";
  context.font = "16px sans-serif";
  context.fillText("A3D Soldier Walk", 18, ASSET.height + 28);
  context.fillText("Three.js AnimationMixer Walk", ASSET.width + 18, ASSET.height + 28);
  context.fillStyle = "#46515f";
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

function stripDataUrls(result: AnimationWalkParityReady): Omit<AnimationWalkParityReady, "dataUrls"> {
  const { dataUrls: _dataUrls, ...rest } = result;
  return rest;
}

function round(value: number): number {
  return Number(value.toFixed(3));
}
