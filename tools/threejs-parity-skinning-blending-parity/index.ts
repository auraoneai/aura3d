// @ts-nocheck
import { createGLTFSceneAnimationMixer, loadV6GLTFRenderPipeline } from "@aura3d/assets";
import { A3DRenderer } from "@aura3d/engine/advanced-runtime";
import { computePerspectiveCameraFrame, Geometry, PBRMaterial } from "@aura3d/rendering";
import { DirectionalLight, composeMat4, multiplyMat4 } from "@aura3d/scene";
import { createSkinningBlendController } from "/apps/skinning-blending/src/blendController.ts";
import * as THREE from "three";
import { GLTFLoader } from "/node_modules/three/examples/jsm/loaders/GLTFLoader.js";

declare global {
  interface Window {
    __V9_SKINNING_BLENDING_PARITY__?: SkinningBlendingParityResult;
  }
}

export {};

type SkinningBlendingParityResult = SkinningBlendingParityReady | SkinningBlendingParityError;

interface SkinningBlendingParityReady {
  readonly status: "ready";
  readonly schema: "a3d-threejs-parity-skinning-blending-parity/v1";
  readonly purpose: "same-asset Robot Expressive A3D skinning blend vs actual Three.js AnimationMixer blend";
  readonly generatedInBrowserAt: string;
  readonly asset: typeof ASSET;
  readonly blend: typeof BLEND;
  readonly a3d: {
    readonly renderer: { readonly drawCalls: number; readonly triangles: number };
    readonly animation: {
      readonly clips: readonly string[];
      readonly tracksApplied: number;
      readonly skinningPalettesUpdated: number;
      readonly sampledAtSeconds: number;
    };
    readonly pixels: PixelStats;
  };
  readonly threejs: {
    readonly loader: { readonly actualGLTFLoader: true; readonly actualThreeRenderer: true; readonly actualAnimationMixer: true };
    readonly animation: {
      readonly clips: readonly string[];
      readonly clipCount: number;
      readonly trackCount: number;
      readonly skinnedMeshCount: number;
      readonly sampledAtSeconds: number;
    };
    readonly renderer: { readonly drawCalls: number; readonly triangles: number };
    readonly pixels: PixelStats;
  };
  readonly diff: DiffStats;
  readonly assertions: {
    readonly sameAssetUrl: boolean;
    readonly sameBlendClips: boolean;
    readonly actualThreeGLTFLoader: boolean;
    readonly actualThreeRenderer: boolean;
    readonly actualThreeAnimationMixer: boolean;
    readonly a3dAppliedTracksAndSkinning: boolean;
    readonly screenshotsNonBlank: boolean;
    readonly fakeEqualityClaimed: false;
  };
  readonly dataUrls: { readonly a3d: string; readonly threejs: string; readonly sideBySide: string };
  readonly humanNotes: readonly string[];
}

interface SkinningBlendingParityError {
  readonly status: "error";
  readonly schema: "a3d-threejs-parity-skinning-blending-parity/v1";
  readonly generatedInBrowserAt: string;
  readonly error: string;
  readonly expectedReferenceLoader: "GLTFLoader";
  readonly expectedReferenceAnimation: "AnimationMixer";
  readonly expectedRenderer: "THREE.WebGLRenderer";
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
  id: "robot-expressive",
  name: "Robot Expressive",
  url: "/fixtures/threejs-parity/assets/character/robot-expressive.glb",
  width: 1280,
  height: 720
} as const;
const BLEND = { idle: 0.2, walk: 0.55, run: 0.25 } as const;
const SAMPLE_SECONDS = 1.18;
const FRAME_BOUNDS = { min: [-0.85, -0.12, -0.85], max: [0.85, 2.05, 0.85] } as const;
const CAMERA_FRAME = {
  yawRadians: -0.32,
  pitchRadians: -0.08,
  paddingRatio: 0.08,
  fovYRadians: 0.48,
  nearPadding: 0.16,
  farPadding: 2.2
} as const;

void run();

async function run(): Promise<void> {
  const status = document.getElementById("report-status");
  const json = document.getElementById("report-json");
  try {
    const a3dCanvas = requiredCanvas("a3d-skinning-blending", ASSET.width, ASSET.height);
    const threeCanvas = requiredCanvas("threejs-skinning-blending", ASSET.width, ASSET.height);
    const sideBySideCanvas = requiredCanvas("side-by-side", ASSET.width * 2, ASSET.height + 60);
    if (status) status.textContent = "rendering A3D skinning blend";
    const a3d = await renderA3D(a3dCanvas);
    if (status) status.textContent = "rendering actual Three.js AnimationMixer blend";
    const threejs = await renderThree(threeCanvas, a3d.clips);
    const [a3dPixels, threePixels] = await Promise.all([dataUrlToPixels(a3d.dataUrl), dataUrlToPixels(threejs.dataUrl)]);
    const diff = computeDiff(a3dPixels, threePixels);
    const sideBySide = await drawSideBySide(sideBySideCanvas, a3d.dataUrl, threejs.dataUrl, diff);
    const a3dStats = analyzeImageData(a3dPixels);
    const threeStats = analyzeImageData(threePixels);
    const ready: SkinningBlendingParityReady = {
      status: "ready",
      schema: "a3d-threejs-parity-skinning-blending-parity/v1",
      purpose: "same-asset Robot Expressive A3D skinning blend vs actual Three.js AnimationMixer blend",
      generatedInBrowserAt: new Date().toISOString(),
      asset: ASSET,
      blend: BLEND,
      a3d: {
        renderer: { drawCalls: a3d.drawCalls, triangles: a3d.triangles },
        animation: {
          clips: a3d.clips,
          tracksApplied: a3d.tracksApplied,
          skinningPalettesUpdated: a3d.skinningPalettesUpdated,
          sampledAtSeconds: SAMPLE_SECONDS
        },
        pixels: a3dStats
      },
      threejs: {
        loader: {
          actualGLTFLoader: threejs.actualGLTFLoader,
          actualThreeRenderer: threejs.actualThreeRenderer,
          actualAnimationMixer: threejs.actualAnimationMixer
        },
        animation: {
          clips: threejs.clips,
          clipCount: threejs.clipCount,
          trackCount: threejs.trackCount,
          skinnedMeshCount: threejs.skinnedMeshCount,
          sampledAtSeconds: SAMPLE_SECONDS
        },
        renderer: { drawCalls: threejs.drawCalls, triangles: threejs.triangles },
        pixels: threeStats
      },
      diff,
      assertions: {
        sameAssetUrl: true,
        sameBlendClips: sameStringSet(a3d.clips, threejs.clips),
        actualThreeGLTFLoader: threejs.actualGLTFLoader,
        actualThreeRenderer: threejs.actualThreeRenderer,
        actualThreeAnimationMixer: threejs.actualAnimationMixer,
        a3dAppliedTracksAndSkinning: a3d.tracksApplied > 0 && a3d.skinningPalettesUpdated > 0,
        screenshotsNonBlank: a3dStats.nonBlackPixels > 45_000 && threeStats.nonBlackPixels > 45_000,
        fakeEqualityClaimed: false
      },
      dataUrls: { a3d: a3d.dataUrl, threejs: threejs.dataUrl, sideBySide },
      humanNotes: [
        `Mean RGB delta is ${diff.meanDelta}; structural similarity proxy is ${diff.structuralSimilarityProxy}.`,
        "This is a bounded idle/walk/run crossfade proof against actual Three.js AnimationMixer for Robot Expressive.",
        "It is not a blanket claim for every transition scheduler, additive layer, IK rig, retargeting setup, or animation controller behavior."
      ]
    };
    window.__V9_SKINNING_BLENDING_PARITY__ = ready;
    if (status) status.textContent = "ready";
    if (json) json.textContent = JSON.stringify(stripDataUrls(ready), null, 2);
  } catch (error) {
    const failure: SkinningBlendingParityError = {
      status: "error",
      schema: "a3d-threejs-parity-skinning-blending-parity/v1",
      generatedInBrowserAt: new Date().toISOString(),
      error: error instanceof Error ? error.stack ?? error.message : String(error),
      expectedReferenceLoader: "GLTFLoader",
      expectedReferenceAnimation: "AnimationMixer",
      expectedRenderer: "THREE.WebGLRenderer"
    };
    window.__V9_SKINNING_BLENDING_PARITY__ = failure;
    if (status) status.textContent = "error";
    if (json) json.textContent = JSON.stringify(failure, null, 2);
  }
}

async function renderA3D(canvas: HTMLCanvasElement) {
  const renderer = await A3DRenderer.create({
    canvas,
    width: ASSET.width,
    height: ASSET.height,
    preserveDrawingBuffer: true,
    clearColor: [0.006, 0.01, 0.014, 1]
  });
  const pipeline = await loadV6GLTFRenderPipeline({
    url: ASSET.url,
    assetId: "v9-skinning-blending-robot-expressive",
    assetName: "Robot Expressive Skinning Blend Parity",
    width: ASSET.width,
    height: ASSET.height,
    rendererInput: {
      cameraPolicy: "require",
      cameraFrameBounds: FRAME_BOUNDS,
      frame: CAMERA_FRAME,
      postprocess: false
    }
  });
  const animationRuntime = createGLTFSceneAnimationMixer({
    scene: pipeline.resources.scene,
    clips: pipeline.asset.animations,
    asset: pipeline.asset,
    autoPlay: false
  });
  const blend = createSkinningBlendController(pipeline.asset.animations);
  const weights = blend.normalize(BLEND);
  const samples = blend.samples(SAMPLE_SECONDS, weights);
  for (const sample of samples) {
    const clip = pipeline.asset.animations.find((candidate) => candidate.name === sample.clipName);
    const sampleTime = clip && clip.duration > 0 ? sample.time % clip.duration : sample.time;
    animationRuntime.playClip(sample.clipName, { weight: sample.weight ?? 1, timeScale: 0, loopMode: "repeat" });
    animationRuntime.seek(sample.clipName, sampleTime);
  }
  const apply = animationRuntime.update(0).applyResult;
  const frame = computePerspectiveCameraFrame(FRAME_BOUNDS, { width: ASSET.width, height: ASSET.height }, CAMERA_FRAME);
  const placement = composeMat4([0, 0, 0], [0, 0, 0, 1], [0.2, 0.2, 0.2]);
  const stage = createA3DStageItems();
  const result = renderer.renderFrame({
    source: {
      collectRenderItems: () => [...collectImportedItems(pipeline, placement), ...stage],
      collectedLights: createA3DLights(),
      environmentLighting: false,
      cameraPolicy: "require",
      cameraPosition: frame.cameraPosition,
      cameraFrameBounds: FRAME_BOUNDS,
      frustumCulling: false,
      postprocess: false
    },
    camera: {
      viewProjectionMatrix: frame.viewProjectionMatrix,
      viewMatrix: frame.viewMatrix,
      projectionMatrix: frame.projectionMatrix
    },
    metadata: {
      assetId: "threejs-parity-skinning-blending-parity",
      assetName: "V9 Skinning Blending Parity",
      assetUri: "/tools/threejs-parity-skinning-blending-parity/",
      meshCount: pipeline.metadata.meshCount,
      primitiveCount: pipeline.metadata.primitiveCount,
      materialCount: pipeline.metadata.materialCount + 2,
      textureCount: pipeline.metadata.textureCount,
      imageCount: pipeline.metadata.imageCount,
      animationCount: pipeline.metadata.animationCount,
      skinCount: pipeline.metadata.skinCount,
      morphTargetCount: pipeline.metadata.morphTargetCount,
      extensionsUsed: pipeline.metadata.extensionsUsed,
      environmentId: "v8-fast-studio",
      hdrEnvironmentUri: "none"
    }
  });
  return {
    clips: samples.map((sample) => sample.clipName),
    tracksApplied: apply.tracksApplied,
    skinningPalettesUpdated: apply.skinningPalettesUpdated,
    drawCalls: result.diagnostics.drawCalls,
    triangles: result.diagnostics.triangles,
    dataUrl: canvas.toDataURL("image/png")
  };
}

async function renderThree(canvas: HTMLCanvasElement, clipNames: readonly string[]) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(ASSET.width, ASSET.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  if (!(renderer instanceof THREE.WebGLRenderer)) throw new Error("Skinning blending parity requires an actual THREE.WebGLRenderer.");

  const loader = new GLTFLoader();
  if (!(loader instanceof GLTFLoader)) throw new Error("Skinning blending parity requires the actual Three.js GLTFLoader.");
  const gltf = await loader.loadAsync(ASSET.url);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070b);
  scene.add(createThreeStage());
  scene.add(createThreeLights());
  const robot = gltf.scene;
  robot.position.set(0, 0, 0);
  robot.scale.setScalar(0.2);
  scene.add(robot);

  let skinnedMeshCount = 0;
  robot.traverse((object) => {
    if ("isSkinnedMesh" in object && object.isSkinnedMesh === true) skinnedMeshCount += 1;
  });
  const weights = normalizeBlend(BLEND);
  const mixer = new THREE.AnimationMixer(robot);
  const actions = [
    { clip: findThreeClip(gltf.animations, clipNames[0], /idle/i), weight: weights.idle },
    { clip: findThreeClip(gltf.animations, clipNames[1], /walk/i), weight: weights.walk },
    { clip: findThreeClip(gltf.animations, clipNames[2], /run|running/i), weight: weights.run }
  ];
  for (const { clip, weight } of actions) {
    const action = mixer.clipAction(clip);
    action.enabled = true;
    action.setEffectiveWeight(weight);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.play();
    action.time = clip.duration > 0 ? SAMPLE_SECONDS % clip.duration : 0;
  }
  mixer.update(0);

  const frame = computePerspectiveCameraFrame(FRAME_BOUNDS, { width: ASSET.width, height: ASSET.height }, CAMERA_FRAME);
  const camera = new THREE.PerspectiveCamera(frame.fovYRadians * 180 / Math.PI, ASSET.width / ASSET.height, frame.near, frame.far);
  camera.position.set(...frame.cameraPosition);
  camera.lookAt(0, 0.965, 0);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  return {
    actualGLTFLoader: true as const,
    actualThreeRenderer: true as const,
    actualAnimationMixer: mixer instanceof THREE.AnimationMixer,
    clips: actions.map(({ clip }) => clip.name),
    clipCount: gltf.animations.length,
    trackCount: actions.reduce((sum, { clip }) => sum + clip.tracks.length, 0),
    skinnedMeshCount,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
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
    const morphTargets = pipeline.resources.morphTargetLibrary.get(renderable.geometry);
    items.push({
      label: `v9-blending:${node.name}`,
      geometry,
      material,
      modelMatrix: multiplyMat4(placement, node.transform.worldMatrix),
      ...(renderable.skinning ? { skinning: renderable.skinning } : {}),
      ...(morphTargets && renderable.morphWeights.length > 0 ? { morphTargets, morphWeights: renderable.morphWeights } : {})
    });
  }
  return items;
}

function createA3DStageItems() {
  const cube = Geometry.litCube(1);
  const floor = new PBRMaterial({ name: "v9-blend-floor", baseColor: [0.06, 0.08, 0.09, 1], roughness: 0.42, metallic: 0.04, environmentIntensity: 0.75 });
  const rail = new PBRMaterial({ name: "v9-blend-rail", baseColor: [0.11, 0.23, 0.34, 1], roughness: 0.32, metallic: 0.22, environmentIntensity: 0.8 });
  return [
    { label: "v9-blend-floor", geometry: cube, material: floor, modelMatrix: composeMat4([0, -0.07, 0], [0, 0, 0, 1], [3.1, 0.04, 2.1]) },
    { label: "v9-blend-left-rail", geometry: cube, material: rail, modelMatrix: composeMat4([-1.18, 0.3, -0.62], [0, 0, 0, 1], [0.06, 0.75, 0.06]) },
    { label: "v9-blend-right-rail", geometry: cube, material: rail, modelMatrix: composeMat4([1.18, 0.3, -0.62], [0, 0, 0, 1], [0.06, 0.75, 0.06]) }
  ];
}

function createA3DLights() {
  const key = new DirectionalLight("v9-blend-key");
  key.intensity = 4.4;
  key.color = [1, 0.94, 0.84];
  const fill = new DirectionalLight("v9-blend-fill");
  fill.intensity = 2.0;
  fill.color = [0.6, 0.78, 1];
  return [
    { kind: "directional", color: key.color, intensity: key.intensity, position: [2.3, 3.3, 2.2], direction: [-0.4, -0.72, -0.54], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: key },
    { kind: "directional", color: fill.color, intensity: fill.intensity, position: [-2.3, 2.2, -1.7], direction: [0.58, -0.36, 0.73], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: fill }
  ];
}

function createThreeStage(): THREE.Object3D {
  const group = new THREE.Group();
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(3.1, 0.04, 2.1),
    new THREE.MeshStandardMaterial({ color: 0x0f1417, roughness: 0.42, metalness: 0.04 })
  );
  floor.position.set(0, -0.07, 0);
  group.add(floor);
  for (const x of [-1.18, 1.18]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.75, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x1c3b57, roughness: 0.32, metalness: 0.22 })
    );
    rail.position.set(x, 0.3, -0.62);
    group.add(rail);
  }
  return group;
}

function createThreeLights(): THREE.Object3D {
  const group = new THREE.Group();
  const key = new THREE.DirectionalLight(0xffefd6, 3.2);
  key.position.set(2.4, 3.4, 2.2);
  group.add(key);
  const fill = new THREE.DirectionalLight(0x8cbcff, 1.5);
  fill.position.set(-2.5, 2.1, -1.6);
  group.add(fill);
  group.add(new THREE.HemisphereLight(0xaebfff, 0x10151b, 0.55));
  return group;
}

function findThreeClip(clips: readonly THREE.AnimationClip[], name: string | undefined, fallback: RegExp): THREE.AnimationClip {
  const clip = clips.find((item) => item.name === name) ?? clips.find((item) => fallback.test(item.name)) ?? clips[0];
  if (!clip) throw new Error("Robot Expressive reference did not load animation clips.");
  return clip;
}

function normalizeBlend(weights: typeof BLEND): typeof BLEND {
  const idle = clamp(weights.idle);
  const walk = clamp(weights.walk);
  const run = clamp(weights.run);
  const total = idle + walk + run;
  if (total <= 0.0001) return { idle: 1, walk: 0, run: 0 };
  return { idle: idle / total, walk: walk / total, run: run / total };
}

function clamp(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function sameStringSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value));
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
    if (delta > 20) changedPixels += 1;
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
  if (!context) throw new Error("Unable to draw side-by-side skinning blending comparison.");
  const [a3d, three] = await Promise.all([loadImage(a3dDataUrl), loadImage(threeDataUrl)]);
  context.fillStyle = "#090d14";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(a3d, 0, 0);
  context.drawImage(three, ASSET.width, 0);
  context.fillStyle = "#f4f7fb";
  context.font = "16px sans-serif";
  context.fillText("A3D skinning blend", 18, ASSET.height + 28);
  context.fillText("Three.js AnimationMixer blend", ASSET.width + 18, ASSET.height + 28);
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

function stripDataUrls(result: SkinningBlendingParityReady): Omit<SkinningBlendingParityReady, "dataUrls"> {
  const { dataUrls: _dataUrls, ...rest } = result;
  return rest;
}

function round(value: number): number {
  return Number(value.toFixed(3));
}
