// @ts-nocheck
import { createGLTFSceneAnimationMixer, loadV6GLTFRenderPipeline } from "@galileo3d/assets";
import { G3DRenderer } from "@galileo3d/engine/v9";
import { computePerspectiveCameraFrame, Geometry, PBRMaterial } from "@galileo3d/rendering";
import { DirectionalLight, composeMat4, multiplyMat4 } from "@galileo3d/scene";
import { createAdditiveLayerController, createMaskedAdditiveClips } from "/apps/v8-skinning-additive/src/additiveLayers.ts";
import * as THREE from "three";
import { GLTFLoader } from "/node_modules/three/examples/jsm/loaders/GLTFLoader.js";

declare global {
  interface Window {
    __V9_SKINNING_ADDITIVE_PARITY__?: SkinningAdditiveParityResult;
  }
}

export {};

type SkinningAdditiveParityResult = SkinningAdditiveParityReady | SkinningAdditiveParityError;

interface SkinningAdditiveParityReady {
  readonly status: "ready";
  readonly schema: "g3d-v9-skinning-additive-parity/v1";
  readonly purpose: "same-asset Robot Expressive G3D masked additive layer vs actual Three.js additive AnimationMixer action";
  readonly generatedInBrowserAt: string;
  readonly asset: typeof ASSET;
  readonly layer: typeof LAYER;
  readonly g3d: {
    readonly renderer: { readonly drawCalls: number; readonly triangles: number };
    readonly animation: {
      readonly baseClip: string;
      readonly additiveClip: string;
      readonly maskedClip: string;
      readonly maskedTrackCount: number;
      readonly tracksApplied: number;
      readonly skinningPalettesUpdated: number;
      readonly sampledAtSeconds: number;
    };
    readonly pixels: PixelStats;
  };
  readonly threejs: {
    readonly loader: { readonly actualGLTFLoader: true; readonly actualThreeRenderer: true; readonly actualAnimationMixer: true; readonly actualAdditiveBlendMode: true };
    readonly animation: {
      readonly baseClip: string;
      readonly additiveClip: string;
      readonly maskedTrackCount: number;
      readonly clipCount: number;
      readonly skinnedMeshCount: number;
      readonly sampledAtSeconds: number;
    };
    readonly renderer: { readonly drawCalls: number; readonly triangles: number };
    readonly pixels: PixelStats;
  };
  readonly diff: DiffStats;
  readonly assertions: {
    readonly sameAssetUrl: boolean;
    readonly sameBaseClip: boolean;
    readonly sameAdditiveClip: boolean;
    readonly maskHasTracks: boolean;
    readonly actualThreeGLTFLoader: boolean;
    readonly actualThreeRenderer: boolean;
    readonly actualThreeAnimationMixer: boolean;
    readonly actualThreeAdditiveBlendMode: boolean;
    readonly g3dAppliedTracksAndSkinning: boolean;
    readonly screenshotsNonBlank: boolean;
    readonly fakeEqualityClaimed: false;
  };
  readonly dataUrls: { readonly g3d: string; readonly threejs: string; readonly sideBySide: string };
  readonly humanNotes: readonly string[];
}

interface SkinningAdditiveParityError {
  readonly status: "error";
  readonly schema: "g3d-v9-skinning-additive-parity/v1";
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
  url: "/fixtures/v8/assets/character/robot-expressive.glb",
  width: 1280,
  height: 720
} as const;
const LAYER = { baseClip: "Walking", additiveClip: "Wave", maskName: "upper body", weight: 0.65 } as const;
const SAMPLE_SECONDS = 1.22;
const FRAME_BOUNDS = { min: [-0.9, -0.12, -0.9], max: [0.9, 2.15, 0.9] } as const;
const CAMERA_FRAME = {
  yawRadians: -0.4,
  pitchRadians: -0.08,
  paddingRatio: 0.1,
  fovYRadians: 0.54,
  nearPadding: 0.16,
  farPadding: 2.2
} as const;
const UPPER_BODY_PREFIXES = ["Head", "Neck", "Body", "Shoulder", "UpperArm", "LowerArm", "Middle", "Thumb", "Index"] as const;

void run();

async function run(): Promise<void> {
  const status = document.getElementById("report-status");
  const json = document.getElementById("report-json");
  try {
    const g3dCanvas = requiredCanvas("g3d-skinning-additive", ASSET.width, ASSET.height);
    const threeCanvas = requiredCanvas("threejs-skinning-additive", ASSET.width, ASSET.height);
    const sideBySideCanvas = requiredCanvas("side-by-side", ASSET.width * 2, ASSET.height + 60);
    if (status) status.textContent = "rendering G3D additive skinning";
    const g3d = await renderG3D(g3dCanvas);
    if (status) status.textContent = "rendering actual Three.js additive reference";
    const threejs = await renderThree(threeCanvas, g3d.baseClip, g3d.additiveClip);
    const [g3dPixels, threePixels] = await Promise.all([dataUrlToPixels(g3d.dataUrl), dataUrlToPixels(threejs.dataUrl)]);
    const diff = computeDiff(g3dPixels, threePixels);
    const sideBySide = await drawSideBySide(sideBySideCanvas, g3d.dataUrl, threejs.dataUrl, diff);
    const g3dStats = analyzeImageData(g3dPixels);
    const threeStats = analyzeImageData(threePixels);
    const ready: SkinningAdditiveParityReady = {
      status: "ready",
      schema: "g3d-v9-skinning-additive-parity/v1",
      purpose: "same-asset Robot Expressive G3D masked additive layer vs actual Three.js additive AnimationMixer action",
      generatedInBrowserAt: new Date().toISOString(),
      asset: ASSET,
      layer: LAYER,
      g3d: {
        renderer: { drawCalls: g3d.drawCalls, triangles: g3d.triangles },
        animation: {
          baseClip: g3d.baseClip,
          additiveClip: g3d.additiveClip,
          maskedClip: g3d.maskedClip,
          maskedTrackCount: g3d.maskedTrackCount,
          tracksApplied: g3d.tracksApplied,
          skinningPalettesUpdated: g3d.skinningPalettesUpdated,
          sampledAtSeconds: SAMPLE_SECONDS
        },
        pixels: g3dStats
      },
      threejs: {
        loader: {
          actualGLTFLoader: threejs.actualGLTFLoader,
          actualThreeRenderer: threejs.actualThreeRenderer,
          actualAnimationMixer: threejs.actualAnimationMixer,
          actualAdditiveBlendMode: threejs.actualAdditiveBlendMode
        },
        animation: {
          baseClip: threejs.baseClip,
          additiveClip: threejs.additiveClip,
          maskedTrackCount: threejs.maskedTrackCount,
          clipCount: threejs.clipCount,
          skinnedMeshCount: threejs.skinnedMeshCount,
          sampledAtSeconds: SAMPLE_SECONDS
        },
        renderer: { drawCalls: threejs.drawCalls, triangles: threejs.triangles },
        pixels: threeStats
      },
      diff,
      assertions: {
        sameAssetUrl: true,
        sameBaseClip: g3d.baseClip === threejs.baseClip,
        sameAdditiveClip: g3d.additiveClip === threejs.additiveClip,
        maskHasTracks: g3d.maskedTrackCount > 0 && threejs.maskedTrackCount > 0,
        actualThreeGLTFLoader: threejs.actualGLTFLoader,
        actualThreeRenderer: threejs.actualThreeRenderer,
        actualThreeAnimationMixer: threejs.actualAnimationMixer,
        actualThreeAdditiveBlendMode: threejs.actualAdditiveBlendMode,
        g3dAppliedTracksAndSkinning: g3d.tracksApplied > 0 && g3d.skinningPalettesUpdated > 0,
        screenshotsNonBlank: g3dStats.nonBlackPixels > 45_000 && threeStats.nonBlackPixels > 45_000,
        fakeEqualityClaimed: false
      },
      dataUrls: { g3d: g3d.dataUrl, threejs: threejs.dataUrl, sideBySide },
      humanNotes: [
        `Mean RGB delta is ${diff.meanDelta}; structural similarity proxy is ${diff.structuralSimilarityProxy}.`,
        "This is a bounded Walking + Wave upper-body additive proof against actual Three.js additive AnimationMixer behavior.",
        "It is not a blanket claim for every additive clip, retargeted skeleton, IK rig, transition graph, or mask authoring workflow."
      ]
    };
    window.__V9_SKINNING_ADDITIVE_PARITY__ = ready;
    if (status) status.textContent = "ready";
    if (json) json.textContent = JSON.stringify(stripDataUrls(ready), null, 2);
  } catch (error) {
    const failure: SkinningAdditiveParityError = {
      status: "error",
      schema: "g3d-v9-skinning-additive-parity/v1",
      generatedInBrowserAt: new Date().toISOString(),
      error: error instanceof Error ? error.stack ?? error.message : String(error),
      expectedReferenceLoader: "GLTFLoader",
      expectedReferenceAnimation: "AnimationMixer",
      expectedRenderer: "THREE.WebGLRenderer"
    };
    window.__V9_SKINNING_ADDITIVE_PARITY__ = failure;
    if (status) status.textContent = "error";
    if (json) json.textContent = JSON.stringify(failure, null, 2);
  }
}

async function renderG3D(canvas: HTMLCanvasElement) {
  const renderer = await G3DRenderer.create({
    canvas,
    width: ASSET.width,
    height: ASSET.height,
    preserveDrawingBuffer: true,
    clearColor: [0.007, 0.009, 0.013, 1]
  });
  const pipeline = await loadV6GLTFRenderPipeline({
    url: ASSET.url,
    assetId: "v9-skinning-additive-robot",
    assetName: "Robot Expressive Additive Parity",
    width: ASSET.width,
    height: ASSET.height,
    rendererInput: {
      cameraPolicy: "require",
      cameraFrameBounds: FRAME_BOUNDS,
      frame: CAMERA_FRAME,
      postprocess: false
    }
  });
  const maskedClips = createMaskedAdditiveClips(pipeline.asset.animations);
  const controller = createAdditiveLayerController([...pipeline.asset.animations, ...maskedClips]);
  const selection = controller.resolve({
    playing: true,
    speed: 1,
    orbitYaw: CAMERA_FRAME.yawRadians,
    baseClip: LAYER.baseClip,
    additiveClip: LAYER.additiveClip,
    maskName: LAYER.maskName,
    layerWeight: LAYER.weight
  });
  const animationRuntime = createGLTFSceneAnimationMixer({
    scene: pipeline.resources.scene,
    clips: [...pipeline.asset.animations, ...maskedClips],
    asset: pipeline.asset,
    autoPlay: false
  });
  const apply = animationRuntime.applyClipSamples([
    { clipName: selection.baseClipName, time: SAMPLE_SECONDS, weight: 1 },
    { clipName: selection.maskedClipName, time: SAMPLE_SECONDS, weight: LAYER.weight, additive: true }
  ]).applyResult;
  const frame = computePerspectiveCameraFrame(FRAME_BOUNDS, { width: ASSET.width, height: ASSET.height }, CAMERA_FRAME);
  const placement = composeMat4([0, 0, 0], [0, 0.04, 0, 0.9992], [0.2, 0.2, 0.2]);
  const stage = createG3DStageItems(LAYER.weight);
  const result = renderer.renderFrame({
    source: {
      collectRenderItems: () => [...collectImportedItems(pipeline, placement), ...stage],
      collectedLights: createG3DLights(),
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
      assetId: "v9-skinning-additive-parity",
      assetName: "V9 Skinning Additive Parity",
      assetUri: "/tools/v9-skinning-additive-parity/",
      meshCount: pipeline.metadata.meshCount,
      primitiveCount: pipeline.metadata.primitiveCount,
      materialCount: pipeline.metadata.materialCount + 3,
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
    baseClip: selection.baseClipName,
    additiveClip: selection.additiveClipName,
    maskedClip: selection.maskedClipName,
    maskedTrackCount: selection.maskedTrackCount,
    tracksApplied: apply.tracksApplied,
    skinningPalettesUpdated: apply.skinningPalettesUpdated,
    drawCalls: result.diagnostics.drawCalls,
    triangles: result.diagnostics.triangles,
    dataUrl: canvas.toDataURL("image/png")
  };
}

async function renderThree(canvas: HTMLCanvasElement, baseClipName: string, additiveClipName: string) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(ASSET.width, ASSET.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  if (!(renderer instanceof THREE.WebGLRenderer)) throw new Error("Skinning additive parity requires an actual THREE.WebGLRenderer.");
  const loader = new GLTFLoader();
  if (!(loader instanceof GLTFLoader)) throw new Error("Skinning additive parity requires the actual Three.js GLTFLoader.");
  const gltf = await loader.loadAsync(ASSET.url);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070b);
  scene.add(createThreeStage(LAYER.weight));
  scene.add(createThreeLights());
  const robot = gltf.scene;
  robot.position.set(0, 0, 0);
  robot.quaternion.set(0, 0.04, 0, 0.9992).normalize();
  robot.scale.setScalar(0.2);
  scene.add(robot);

  let skinnedMeshCount = 0;
  robot.traverse((object) => {
    if ("isSkinnedMesh" in object && object.isSkinnedMesh === true) skinnedMeshCount += 1;
  });
  const baseClip = findThreeClip(gltf.animations, baseClipName, /walk/i);
  const additiveSource = findThreeClip(gltf.animations, additiveClipName, /wave|punch|thumb|yes|no/i);
  const maskedAdditive = new THREE.AnimationClip(
    `${additiveSource.name} [${LAYER.maskName}]`,
    additiveSource.duration,
    additiveSource.tracks.filter((track) => capturesThreeTrack(track.name, UPPER_BODY_PREFIXES)),
    THREE.AdditiveAnimationBlendMode
  );
  if (maskedAdditive.tracks.length === 0) throw new Error("Three.js additive mask did not capture any upper-body tracks.");
  const mixer = new THREE.AnimationMixer(robot);
  const baseAction = mixer.clipAction(baseClip);
  baseAction.enabled = true;
  baseAction.setEffectiveWeight(1);
  baseAction.setLoop(THREE.LoopRepeat, Infinity);
  baseAction.play();
  baseAction.time = baseClip.duration > 0 ? SAMPLE_SECONDS % baseClip.duration : 0;
  const additiveAction = mixer.clipAction(maskedAdditive, robot, THREE.AdditiveAnimationBlendMode);
  additiveAction.enabled = true;
  additiveAction.setEffectiveWeight(LAYER.weight);
  additiveAction.setLoop(THREE.LoopRepeat, Infinity);
  additiveAction.play();
  additiveAction.time = maskedAdditive.duration > 0 ? SAMPLE_SECONDS % maskedAdditive.duration : 0;
  mixer.update(0);

  const frame = computePerspectiveCameraFrame(FRAME_BOUNDS, { width: ASSET.width, height: ASSET.height }, CAMERA_FRAME);
  const camera = new THREE.PerspectiveCamera(frame.fovYRadians * 180 / Math.PI, ASSET.width / ASSET.height, frame.near, frame.far);
  camera.position.set(...frame.cameraPosition);
  camera.lookAt(0, 1.015, 0);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  return {
    actualGLTFLoader: true as const,
    actualThreeRenderer: true as const,
    actualAnimationMixer: mixer instanceof THREE.AnimationMixer,
    actualAdditiveBlendMode: additiveAction.blendMode === THREE.AdditiveAnimationBlendMode,
    baseClip: baseClip.name,
    additiveClip: additiveSource.name,
    maskedTrackCount: maskedAdditive.tracks.length,
    clipCount: gltf.animations.length,
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
      label: `v9-additive:${node.name}`,
      geometry,
      material,
      modelMatrix: multiplyMat4(placement, node.transform.worldMatrix),
      ...(renderable.skinning ? { skinning: renderable.skinning } : {}),
      ...(morphTargets && renderable.morphWeights.length > 0 ? { morphTargets, morphWeights: renderable.morphWeights } : {})
    });
  }
  return items;
}

function createG3DStageItems(weight: number) {
  const cube = Geometry.litCube(1);
  const floor = new PBRMaterial({ name: "v9-additive-floor", baseColor: [0.065, 0.075, 0.085, 1], roughness: 0.42, metallic: 0.04, environmentIntensity: 0.75 });
  const base = new PBRMaterial({ name: "v9-additive-base-marker", baseColor: [0.18, 0.31, 0.5, 1], roughness: 0.32, metallic: 0.18, environmentIntensity: 0.8 });
  const layer = new PBRMaterial({ name: "v9-additive-layer-marker", baseColor: [0.94, 0.58, 0.14, 1], roughness: 0.28, metallic: 0.1, environmentIntensity: 0.8 });
  return [
    { label: "v9-additive-floor", geometry: cube, material: floor, modelMatrix: composeMat4([0, -0.07, 0], [0, 0, 0, 1], [3.1, 0.04, 2.1]) },
    { label: "v9-additive-base-marker", geometry: cube, material: base, modelMatrix: composeMat4([-1.18, 0.34, -0.62], [0, 0, 0, 1], [0.06, 0.85, 0.06]) },
    { label: "v9-additive-layer-marker", geometry: cube, material: layer, modelMatrix: composeMat4([1.18, 0.18 + weight * 0.38, -0.62], [0, 0, 0, 1], [0.08, 0.32 + weight * 0.55, 0.08]) }
  ];
}

function createG3DLights() {
  const key = new DirectionalLight("v9-additive-key");
  key.intensity = 4.5;
  key.color = [1, 0.94, 0.82];
  const fill = new DirectionalLight("v9-additive-fill");
  fill.intensity = 2.2;
  fill.color = [0.62, 0.8, 1];
  return [
    { kind: "directional", color: key.color, intensity: key.intensity, position: [2.4, 3.4, 2.2], direction: [-0.42, -0.72, -0.52], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: key },
    { kind: "directional", color: fill.color, intensity: fill.intensity, position: [-2.5, 2.2, -1.6], direction: [0.6, -0.34, 0.72], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: fill }
  ];
}

function createThreeStage(weight: number): THREE.Object3D {
  const group = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.04, 2.1), new THREE.MeshStandardMaterial({ color: 0x111316, roughness: 0.42, metalness: 0.04 }));
  floor.position.set(0, -0.07, 0);
  group.add(floor);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.85, 0.06), new THREE.MeshStandardMaterial({ color: 0x2e4f80, roughness: 0.32, metalness: 0.18 }));
  base.position.set(-1.18, 0.34, -0.62);
  group.add(base);
  const layer = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32 + weight * 0.55, 0.08), new THREE.MeshStandardMaterial({ color: 0xef941f, roughness: 0.28, metalness: 0.1 }));
  layer.position.set(1.18, 0.18 + weight * 0.38, -0.62);
  group.add(layer);
  return group;
}

function createThreeLights(): THREE.Object3D {
  const group = new THREE.Group();
  const key = new THREE.DirectionalLight(0xffefd1, 3.3);
  key.position.set(2.4, 3.4, 2.2);
  group.add(key);
  const fill = new THREE.DirectionalLight(0x9eccff, 1.65);
  fill.position.set(-2.5, 2.2, -1.6);
  group.add(fill);
  group.add(new THREE.HemisphereLight(0xaebfff, 0x10151b, 0.55));
  return group;
}

function findThreeClip(clips: readonly THREE.AnimationClip[], name: string | undefined, fallback: RegExp): THREE.AnimationClip {
  const clip = clips.find((item) => item.name === name) ?? clips.find((item) => fallback.test(item.name)) ?? clips[0];
  if (!clip) throw new Error("Robot Expressive reference did not load animation clips.");
  return clip;
}

function capturesThreeTrack(target: string, prefixes: readonly string[]): boolean {
  const pathIndex = target.lastIndexOf(".");
  const nodeName = pathIndex > 0 ? target.slice(0, pathIndex) : target;
  return prefixes.some((prefix) => nodeName === prefix || nodeName.startsWith(prefix));
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
    if (delta > 20) changedPixels += 1;
  }
  const meanDelta = total / (a.width * a.height);
  return { meanDelta: round(meanDelta), maxDelta: round(maxDelta), changedPixels, structuralSimilarityProxy: round(Math.max(0, 1 - meanDelta / 255)) };
}

async function drawSideBySide(canvas: HTMLCanvasElement, g3dDataUrl: string, threeDataUrl: string, diff: DiffStats): Promise<string> {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to draw side-by-side skinning additive comparison.");
  const [g3d, three] = await Promise.all([loadImage(g3dDataUrl), loadImage(threeDataUrl)]);
  context.fillStyle = "#090d14";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(g3d, 0, 0);
  context.drawImage(three, ASSET.width, 0);
  context.fillStyle = "#f4f7fb";
  context.font = "16px sans-serif";
  context.fillText("G3D masked additive layer", 18, ASSET.height + 28);
  context.fillText("Three.js additive AnimationMixer", ASSET.width + 18, ASSET.height + 28);
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

function stripDataUrls(result: SkinningAdditiveParityReady): Omit<SkinningAdditiveParityReady, "dataUrls"> {
  const { dataUrls: _dataUrls, ...rest } = result;
  return rest;
}

function round(value: number): number {
  return Number(value.toFixed(3));
}
