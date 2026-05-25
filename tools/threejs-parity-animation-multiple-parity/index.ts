// @ts-nocheck
import {
  DEFAULT_GLTF_STUDIO_PREVIEW_ENVIRONMENT_LIGHTING,
  createGLTFSceneAnimationRuntime,
  loadV6GLTFRenderPipeline
} from "@galileo3d/assets";
import { G3DRenderer } from "@galileo3d/engine/advanced-runtime";
import {
  Geometry,
  PBRMaterial,
  computePerspectiveCameraFrame,
  type CameraFrameBounds,
  type CollectedLight,
  type RenderItem,
  type RenderSource
} from "@galileo3d/rendering";
import { DirectionalLight, composeMat4, multiplyMat4, type Mat4 } from "@galileo3d/scene";
import { sampleAgentPoses, spawnAgents, type AgentPose } from "/apps/animation-multiple/src/agentSpawner.ts";
import * as THREE from "three";
import { GLTFLoader } from "/node_modules/three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "/node_modules/three/examples/jsm/utils/SkeletonUtils.js";

declare global {
  interface Window {
    __V9_ANIMATION_MULTIPLE_PARITY__?: AnimationMultipleParityResult;
  }
}

export {};

type LoadedPipeline = Awaited<ReturnType<typeof loadV6GLTFRenderPipeline>>;
type AnimationMultipleParityResult = AnimationMultipleParityReady | AnimationMultipleParityError;

interface AnimationMultipleParityReady {
  readonly status: "ready";
  readonly schema: "g3d-threejs-parity-animation-multiple-parity/v1";
  readonly purpose: "same-asset multi-clip G3D clone sampler vs actual Three.js AnimationMixer baseline";
  readonly generatedInBrowserAt: string;
  readonly asset: typeof ASSET;
  readonly g3d: {
    readonly renderer: { readonly drawCalls: number };
    readonly animation: {
      readonly cloneCount: number;
      readonly clipNames: readonly string[];
      readonly skinningPalettesUpdated: number;
      readonly sampledAtSeconds: number;
    };
    readonly pixels: PixelStats;
  };
  readonly threejs: {
    readonly loader: { readonly actualGLTFLoader: true; readonly actualThreeRenderer: true; readonly actualAnimationMixer: true; readonly actualSkeletonUtilsClone: true };
    readonly animation: {
      readonly cloneCount: number;
      readonly mixerCount: number;
      readonly clipNames: readonly string[];
      readonly skinnedMeshCount: number;
      readonly sampledAtSeconds: number;
    };
    readonly renderer: { readonly drawCalls: number; readonly triangles: number };
    readonly pixels: PixelStats;
  };
  readonly diff: DiffStats;
  readonly assertions: {
    readonly sameAssetUrl: boolean;
    readonly sameClips: boolean;
    readonly sameCloneCount: boolean;
    readonly actualThreeGLTFLoader: boolean;
    readonly actualThreeRenderer: boolean;
    readonly actualThreeAnimationMixer: boolean;
    readonly actualThreeSkeletonClone: boolean;
    readonly g3dCloneSamplerUpdatedSkinning: boolean;
    readonly screenshotsNonBlank: boolean;
    readonly fakeEqualityClaimed: false;
  };
  readonly dataUrls: {
    readonly g3d: string;
    readonly threejs: string;
    readonly sideBySide: string;
  };
  readonly humanNotes: readonly string[];
}

interface AnimationMultipleParityError {
  readonly status: "error";
  readonly schema: "g3d-threejs-parity-animation-multiple-parity/v1";
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
  id: "soldier",
  name: "Soldier Multi-Clip Skinned Character",
  url: "/fixtures/threejs-parity/assets/character/soldier.glb",
  width: 720,
  height: 480
} as const;

const SAMPLE_SECONDS = 0.92;
const FRAME_BOUNDS: CameraFrameBounds = { min: [-2.45, -0.08, -0.65], max: [2.45, 2.05, 0.65] };
const CAMERA_FRAME = {
  yawRadians: Math.PI,
  pitchRadians: -0.2,
  paddingRatio: 0.08,
  fovYRadians: 0.72,
  nearPadding: 0.16,
  farPadding: 2.4
} as const;
const STATE = { count: 3, speed: 1, spread: 1, paused: false } as const;

void run();

async function run(): Promise<void> {
  const status = document.getElementById("report-status");
  const json = document.getElementById("report-json");
  try {
    const g3dCanvas = requiredCanvas("g3d-animation-multiple", ASSET.width, ASSET.height);
    const threeCanvas = requiredCanvas("threejs-animation-multiple", ASSET.width, ASSET.height);
    const sideBySideCanvas = requiredCanvas("side-by-side", ASSET.width * 2, ASSET.height + 60);
    if (status) status.textContent = "rendering G3D clone sampler";
    const g3d = await renderG3D(g3dCanvas);
    if (status) status.textContent = "rendering actual Three.js AnimationMixer reference";
    const threejs = await renderThree(threeCanvas, g3d.activeClipNames);
    const [g3dPixels, threePixels] = await Promise.all([dataUrlToPixels(g3d.dataUrl), dataUrlToPixels(threejs.dataUrl)]);
    const diff = computeDiff(g3dPixels, threePixels);
    const sideBySide = await drawSideBySide(sideBySideCanvas, g3d.dataUrl, threejs.dataUrl, diff);
    const g3dStats = analyzeImageData(g3dPixels);
    const threeStats = analyzeImageData(threePixels);
    const ready: AnimationMultipleParityReady = {
      status: "ready",
      schema: "g3d-threejs-parity-animation-multiple-parity/v1",
      purpose: "same-asset multi-clip G3D clone sampler vs actual Three.js AnimationMixer baseline",
      generatedInBrowserAt: new Date().toISOString(),
      asset: ASSET,
      g3d: {
        renderer: { drawCalls: g3d.drawCalls },
        animation: {
          cloneCount: g3d.cloneCount,
          clipNames: g3d.activeClipNames,
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
          actualSkeletonUtilsClone: threejs.actualSkeletonUtilsClone
        },
        animation: {
          cloneCount: threejs.cloneCount,
          mixerCount: threejs.mixerCount,
          clipNames: threejs.activeClipNames,
          skinnedMeshCount: threejs.skinnedMeshCount,
          sampledAtSeconds: SAMPLE_SECONDS
        },
        renderer: { drawCalls: threejs.drawCalls, triangles: threejs.triangles },
        pixels: threeStats
      },
      diff,
      assertions: {
        sameAssetUrl: true,
        sameClips: sameStringSet(g3d.activeClipNames, threejs.activeClipNames),
        sameCloneCount: g3d.cloneCount === threejs.cloneCount,
        actualThreeGLTFLoader: threejs.actualGLTFLoader,
        actualThreeRenderer: threejs.actualThreeRenderer,
        actualThreeAnimationMixer: threejs.actualAnimationMixer,
        actualThreeSkeletonClone: threejs.actualSkeletonUtilsClone,
        g3dCloneSamplerUpdatedSkinning: g3d.skinningPalettesUpdated >= g3d.cloneCount,
        screenshotsNonBlank: g3dStats.nonBlackPixels > 45_000 && threeStats.nonBlackPixels > 45_000,
        fakeEqualityClaimed: false
      },
      dataUrls: { g3d: g3d.dataUrl, threejs: threejs.dataUrl, sideBySide },
      humanNotes: [
        `Mean RGB delta is ${diff.meanDelta}; structural similarity proxy is ${diff.structuralSimilarityProxy}.`,
        "This is a bounded imported Soldier clone parity proof for Walk / Run / Idle using actual Three.js AnimationMixer and SkeletonUtils.clone.",
        "It is not a blanket claim for every animation-blending, IK, morph-target, retargeting, or crowd-behavior path."
      ]
    };
    window.__V9_ANIMATION_MULTIPLE_PARITY__ = ready;
    if (status) status.textContent = "ready";
    if (json) json.textContent = JSON.stringify(stripDataUrls(ready), null, 2);
  } catch (error) {
    const failure: AnimationMultipleParityError = {
      status: "error",
      schema: "g3d-threejs-parity-animation-multiple-parity/v1",
      generatedInBrowserAt: new Date().toISOString(),
      error: error instanceof Error ? error.stack ?? error.message : String(error),
      expectedReferenceLoader: "GLTFLoader",
      expectedReferenceAnimation: "AnimationMixer",
      expectedRenderer: "THREE.WebGLRenderer"
    };
    window.__V9_ANIMATION_MULTIPLE_PARITY__ = failure;
    if (status) status.textContent = "error";
    if (json) json.textContent = JSON.stringify(failure, null, 2);
  }
}

async function renderG3D(canvas: HTMLCanvasElement) {
  const pipeline = await loadV6GLTFRenderPipeline({
    url: ASSET.url,
    assetId: "v9-animation-multiple-soldier",
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
  const renderer = await G3DRenderer.create({
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
  const cloneSampler = animationRuntime.createCloneSampler();
  const activeClips = selectAgentClips(pipeline.asset.animations);
  const agents = spawnAgents(3);
  const poses = sampleAgentPoses(agents, STATE, SAMPLE_SECONDS);
  let skinningPalettesUpdated = 0;
  const frame = computePerspectiveCameraFrame(FRAME_BOUNDS, { width: ASSET.width, height: ASSET.height }, CAMERA_FRAME);
  const source: RenderSource = {
    collectRenderItems: () => [
      ...createG3DStageItems(),
      ...collectCrowdItems(pipeline, cloneSampler, activeClips, poses, SAMPLE_SECONDS, (count) => {
        skinningPalettesUpdated += count;
      })
    ],
    collectedLights: createG3DLights(),
    environmentLighting: DEFAULT_GLTF_STUDIO_PREVIEW_ENVIRONMENT_LIGHTING,
    cameraPolicy: "require",
    cameraPosition: frame.cameraPosition,
    cameraFrameBounds: FRAME_BOUNDS,
    frustumCulling: false,
    postprocess: false
  };
  const diagnostics = renderer.render({
    source,
    camera: { viewProjectionMatrix: frame.viewProjectionMatrix, viewMatrix: frame.viewMatrix, projectionMatrix: frame.projectionMatrix }
  });
  return {
    drawCalls: diagnostics.drawCalls,
    cloneCount: poses.length,
    activeClipNames: activeClips.map((clip) => clip.name),
    skinningPalettesUpdated,
    dataUrl: canvas.toDataURL("image/png")
  };
}

function collectCrowdItems(
  pipeline: LoadedPipeline,
  cloneSampler: ReturnType<ReturnType<typeof createGLTFSceneAnimationRuntime>["createCloneSampler"]>,
  clips: readonly LoadedPipeline["asset"]["animations"][number][],
  poses: readonly AgentPose[],
  seconds: number,
  onSkinningPalettesUpdated: (count: number) => void
): readonly RenderItem[] {
  const items: RenderItem[] = [];
  const posesByCloneId = new Map<string, AgentPose>();
  const cloneSamples = poses.map((pose) => {
    const clip = pickAgentClip(clips, pose);
    const speed = clipPlaybackRate(clip, pose);
    const clipTime = clip.duration <= 0 ? pose.agent.offset : (seconds * speed + pose.agent.offset) % clip.duration;
    const cloneId = String(pose.agent.id);
    posesByCloneId.set(cloneId, pose);
    return { cloneId, clipName: clip.name, time: clipTime };
  });
  cloneSampler.sampleClones(cloneSamples, (sample) => {
    const pose = posesByCloneId.get(sample.cloneId);
    if (!pose) return;
    onSkinningPalettesUpdated(sample.applyResult.skinningPalettesUpdated);
    items.push(...collectImportedItems(pipeline, agentPlacement(pose)));
  });
  return items;
}

function selectAgentClips(animations: readonly LoadedPipeline["asset"]["animations"][number][]): readonly LoadedPipeline["asset"]["animations"][number][] {
  const preferred = [/^walk$/i, /^run$/i, /^idle$/i]
    .map((pattern) => animations.find((clip) => pattern.test(clip.name)))
    .filter(Boolean);
  if (preferred.length >= 3) return preferred;
  if (preferred.length > 0) return preferred;
  if (animations.length === 0) throw new Error("Animation multiple parity requires at least one imported animation clip.");
  return [animations[0]];
}

function pickAgentClip(clips: readonly LoadedPipeline["asset"]["animations"][number][], pose: AgentPose): LoadedPipeline["asset"]["animations"][number] {
  const run = clips.find((clip) => /^run$/i.test(clip.name));
  const idle = clips.find((clip) => /^idle$/i.test(clip.name));
  const walk = clips.find((clip) => /^walk$/i.test(clip.name)) ?? clips[0];
  if (idle && pose.agent.id === 1) return idle;
  if (run && pose.agent.id === 2) return run;
  return walk;
}

function clipPlaybackRate(clip: LoadedPipeline["asset"]["animations"][number], pose: AgentPose): number {
  if (/^idle$/i.test(clip.name)) return 0.72;
  if (/^run$/i.test(clip.name)) return 1.62;
  if (/^walk$/i.test(clip.name)) return 0.92;
  return 1 + pose.agent.id * 0.08;
}

function collectImportedItems(pipeline: LoadedPipeline, placement: Mat4): readonly RenderItem[] {
  const items: RenderItem[] = [];
  pipeline.resources.scene.updateWorldTransforms();
  for (const { node, renderable } of pipeline.resources.scene.collectRenderables()) {
    const geometry = pipeline.resources.geometryLibrary.get(renderable.geometry);
    const material = pipeline.resources.materialLibrary.get(renderable.material);
    if (!geometry || !material) continue;
    const skinning = renderable.skinning
      ? { jointCount: renderable.skinning.jointCount, matrices: new Float32Array(renderable.skinning.matrices) }
      : undefined;
    items.push({
      label: `v9-animation-multiple:${node.name}`,
      geometry,
      material,
      modelMatrix: multiplyMat4(placement, node.transform.worldMatrix),
      ...(skinning ? { skinning } : {})
    });
  }
  return items;
}

function agentPlacement(pose: AgentPose): Mat4 {
  const scale = 0.68 * pose.agent.scale;
  return composeMat4([pose.x, pose.y, pose.z], [0, 0, 0, 1], [scale, scale, scale]);
}

function createG3DStageItems(): readonly RenderItem[] {
  const cube = Geometry.litCube(1);
  const shadow = Geometry.cylinder({ radius: 0.5, height: 1, segments: 48, capped: true });
  const floor = new PBRMaterial({ name: "animation-multiple-parity-floor", baseColor: [0.73, 0.73, 0.73, 1], roughness: 0.66, metallic: 0, environmentIntensity: 0.25 });
  const contact = new PBRMaterial({ name: "animation-multiple-parity-contact", baseColor: [0.42, 0.42, 0.42, 1], roughness: 0.9, metallic: 0, environmentIntensity: 0 });
  return [
    { label: "animation-multiple-parity-floor", geometry: cube, material: floor, modelMatrix: composeMat4([0, -0.055, 0], [0, 0, 0, 1], [9, 0.035, 8]) },
    { label: "animation-multiple-contact-idle", geometry: shadow, material: contact, modelMatrix: composeMat4([-1.48, -0.024, 0.16], [0, 0, 0, 1], [1.25, 0.012, 0.62]) },
    { label: "animation-multiple-contact-run", geometry: shadow, material: contact, modelMatrix: composeMat4([0, -0.024, 0.12], [0, 0, 0, 1], [1.35, 0.012, 0.7]) },
    { label: "animation-multiple-contact-walk", geometry: shadow, material: contact, modelMatrix: composeMat4([1.48, -0.024, 0.16], [0, 0, 0, 1], [1.25, 0.012, 0.62]) }
  ];
}

function createG3DLights(): readonly CollectedLight[] {
  const key = new DirectionalLight("v9-animation-multiple-key");
  key.intensity = 5.6;
  key.color = [1, 1, 1];
  const rim = new DirectionalLight("v9-animation-multiple-rim");
  rim.intensity = 2.4;
  rim.color = [0.78, 0.82, 0.9];
  return [
    { kind: "directional", color: key.color, intensity: key.intensity, position: [-3, 10, -10], direction: [0.24, -0.78, 0.58], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: key },
    { kind: "directional", color: rim.color, intensity: rim.intensity, position: [3, 4, 4], direction: [-0.46, -0.42, -0.78], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: rim }
  ];
}

async function renderThree(canvas: HTMLCanvasElement, clipNames: readonly string[]) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(ASSET.width, ASSET.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  if (!(renderer instanceof THREE.WebGLRenderer)) throw new Error("Animation multiple parity requires an actual THREE.WebGLRenderer.");

  const loader = new GLTFLoader();
  if (!(loader instanceof GLTFLoader)) throw new Error("Animation multiple parity requires the actual Three.js GLTFLoader.");
  const gltf = await loader.loadAsync(ASSET.url);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xa0a0a0);
  scene.add(createThreeStage());
  scene.add(createThreeLights());

  const agents = spawnAgents(3);
  const poses = sampleAgentPoses(agents, STATE, SAMPLE_SECONDS);
  const mixers: THREE.AnimationMixer[] = [];
  let skinnedMeshCount = 0;
  const selectedClipNames: string[] = [];
  for (const pose of poses) {
    const clone = cloneSkeleton(gltf.scene);
    if (!(clone instanceof THREE.Object3D)) throw new Error("SkeletonUtils.clone did not return a Three.js Object3D.");
    clone.traverse((object) => {
      if ("isSkinnedMesh" in object && object.isSkinnedMesh === true) skinnedMeshCount += 1;
    });
    const placement = threeAgentPlacement(pose);
    clone.position.copy(placement.position);
    clone.scale.copy(placement.scale);
    const mixer = new THREE.AnimationMixer(clone);
    const clip = pickThreeClip(gltf.animations, clipNames, pose);
    const speed = threeClipPlaybackRate(clip, pose);
    const action = mixer.clipAction(clip);
    action.play();
    mixer.setTime(clip.duration <= 0 ? pose.agent.offset : (SAMPLE_SECONDS * speed + pose.agent.offset) % clip.duration);
    mixers.push(mixer);
    selectedClipNames.push(clip.name);
    scene.add(clone);
  }

  const frame = computePerspectiveCameraFrame(FRAME_BOUNDS, { width: ASSET.width, height: ASSET.height }, CAMERA_FRAME);
  const camera = new THREE.PerspectiveCamera(frame.fovYRadians * 180 / Math.PI, ASSET.width / ASSET.height, frame.near, frame.far);
  camera.position.set(...frame.cameraPosition);
  camera.lookAt(0, 0.985, 0);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  return {
    actualGLTFLoader: true as const,
    actualThreeRenderer: true as const,
    actualAnimationMixer: mixers.every((mixer) => mixer instanceof THREE.AnimationMixer) as true,
    actualSkeletonUtilsClone: true as const,
    cloneCount: poses.length,
    mixerCount: mixers.length,
    activeClipNames: uniqueOrdered(selectedClipNames),
    skinnedMeshCount,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    dataUrl: canvas.toDataURL("image/png")
  };
}

function createThreeStage(): THREE.Object3D {
  const group = new THREE.Group();
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(9, 0.035, 8),
    new THREE.MeshStandardMaterial({ color: 0xb9b9b9, roughness: 0.66, metalness: 0 })
  );
  floor.position.set(0, -0.055, 0);
  group.add(floor);
  const contactMaterial = new THREE.MeshBasicMaterial({ color: 0x686868, transparent: true, opacity: 0.34, depthWrite: false });
  for (const [x, z, sx, sz] of [[-1.48, 0.16, 1.25, 0.62], [0, 0.12, 1.35, 0.7], [1.48, 0.16, 1.25, 0.62]]) {
    const shadow = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.012, 48), contactMaterial);
    shadow.position.set(x, -0.024, z);
    shadow.scale.set(sx, 1, sz);
    group.add(shadow);
  }
  return group;
}

function createThreeLights(): THREE.Object3D {
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

function threeAgentPlacement(pose: AgentPose): { readonly position: THREE.Vector3; readonly scale: THREE.Vector3 } {
  const scale = 0.68 * pose.agent.scale;
  return {
    position: new THREE.Vector3(pose.x, pose.y, pose.z),
    scale: new THREE.Vector3(scale, scale, scale)
  };
}

function pickThreeClip(clips: readonly THREE.AnimationClip[], preferredClipNames: readonly string[], pose: AgentPose): THREE.AnimationClip {
  const byName = (pattern: RegExp) => clips.find((clip) => pattern.test(clip.name));
  const run = byName(/^run$/i);
  const idle = byName(/^idle$/i);
  const walk = byName(/^walk$/i) ?? clips.find((clip) => preferredClipNames.includes(clip.name)) ?? clips[0];
  if (idle && pose.agent.id === 1) return idle;
  if (run && pose.agent.id === 2) return run;
  return walk;
}

function threeClipPlaybackRate(clip: THREE.AnimationClip, pose: AgentPose): number {
  if (/^idle$/i.test(clip.name)) return 0.72;
  if (/^run$/i.test(clip.name)) return 1.62;
  if (/^walk$/i.test(clip.name)) return 0.92;
  return 1 + pose.agent.id * 0.08;
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
    if (delta > 22) changedPixels += 1;
  }
  const meanDelta = total / (a.width * a.height);
  return {
    meanDelta: round(meanDelta),
    maxDelta: round(maxDelta),
    changedPixels,
    structuralSimilarityProxy: round(Math.max(0, 1 - meanDelta / 255))
  };
}

async function drawSideBySide(canvas: HTMLCanvasElement, g3dDataUrl: string, threeDataUrl: string, diff: DiffStats): Promise<string> {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to draw side-by-side animation comparison.");
  const [g3d, three] = await Promise.all([loadImage(g3dDataUrl), loadImage(threeDataUrl)]);
  context.fillStyle = "#f2f3f5";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(g3d, 0, 0);
  context.drawImage(three, ASSET.width, 0);
  context.fillStyle = "#15171c";
  context.font = "16px sans-serif";
  context.fillText("G3D clone sampler", 18, ASSET.height + 28);
  context.fillText("Three.js AnimationMixer", ASSET.width + 18, ASSET.height + 28);
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

function sameStringSet(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function uniqueOrdered(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function stripDataUrls(result: AnimationMultipleParityReady): Omit<AnimationMultipleParityReady, "dataUrls"> {
  const { dataUrls: _dataUrls, ...rest } = result;
  return rest;
}

function round(value: number): number {
  return Number(value.toFixed(3));
}
