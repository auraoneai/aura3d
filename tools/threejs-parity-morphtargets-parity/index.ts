// @ts-nocheck
import { createGLTFSceneAnimationRuntime, loadV6GLTFRenderPipeline } from "@galileo3d/assets";
import { G3DRenderer } from "@galileo3d/engine/advanced-runtime";
import { Geometry, PBRMaterial, computePerspectiveCameraFrame } from "@galileo3d/rendering";
import { DirectionalLight, composeMat4, multiplyMat4 } from "@galileo3d/scene";
import * as THREE from "three";
import { GLTFLoader } from "/node_modules/three/examples/jsm/loaders/GLTFLoader.js";

declare global {
  interface Window {
    __V9_MORPHTARGETS_PARITY__?: MorphTargetsParityResult;
  }
}

export {};

type MorphTargetsParityResult = MorphTargetsParityReady | MorphTargetsParityError;

interface MorphTargetsParityReady {
  readonly status: "ready";
  readonly schema: "g3d-threejs-parity-morphtargets-parity/v1";
  readonly purpose: "same-asset Robot Expressive manual head morph weights vs actual Three.js morphTargetInfluences";
  readonly generatedInBrowserAt: string;
  readonly asset: typeof ASSET;
  readonly morph: typeof MORPH;
  readonly g3d: {
    readonly renderer: { readonly drawCalls: number; readonly triangles: number };
    readonly animation: { readonly bodyClip: string; readonly tracksApplied: number; readonly morphWeightTracksApplied: number; readonly skinningPalettesUpdated: number };
    readonly pixels: PixelStats;
  };
  readonly threejs: {
    readonly loader: { readonly actualGLTFLoader: true; readonly actualThreeRenderer: true; readonly actualAnimationMixer: true; readonly actualMorphTargetInfluences: true };
    readonly animation: { readonly bodyClip: string; readonly clipCount: number; readonly morphMeshCount: number; readonly morphTargetCount: number; readonly skinnedMeshCount: number };
    readonly renderer: { readonly drawCalls: number; readonly triangles: number };
    readonly pixels: PixelStats;
  };
  readonly diff: DiffStats;
  readonly assertions: {
    readonly sameAssetUrl: boolean;
    readonly sameBodyClip: boolean;
    readonly actualThreeGLTFLoader: boolean;
    readonly actualThreeRenderer: boolean;
    readonly actualThreeAnimationMixer: boolean;
    readonly actualThreeMorphTargetInfluences: boolean;
    readonly g3dAppliedMorphWeights: boolean;
    readonly screenshotsNonBlank: boolean;
    readonly fakeEqualityClaimed: false;
  };
  readonly dataUrls: { readonly g3d: string; readonly threejs: string; readonly sideBySide: string };
}

interface MorphTargetsParityError {
  readonly status: "error";
  readonly schema: "g3d-threejs-parity-morphtargets-parity/v1";
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
  id: "robot-expressive",
  name: "Robot Expressive Morph Targets",
  url: "/fixtures/threejs-parity/assets/character/robot-expressive.glb",
  width: 720,
  height: 480
} as const;
const MORPH = {
  target: "Head.weights",
  labels: ["Angry", "Surprised", "Sad"] as const,
  weights: [0.68, 0.32, 0.18] as const
} as const;
const SAMPLE_SECONDS = 0.78;
const FRAME_BOUNDS = { min: [-1.6, 0.65, -1.2], max: [1.6, 3.35, 1.2] } as const;
const CAMERA_FRAME = {
  yawRadians: -0.28,
  pitchRadians: 0.04,
  paddingRatio: 0.1,
  fovYRadians: 0.62,
  nearPadding: 0.16,
  farPadding: 2.0
} as const;
const PLACEMENT = composeMat4([0, 0, 0], [0, 0.04, 0, 0.9992], [1, 1, 1]);

void run();

async function run(): Promise<void> {
  const status = document.getElementById("report-status");
  const json = document.getElementById("report-json");
  try {
    const g3dCanvas = requiredCanvas("g3d-morphtargets", ASSET.width, ASSET.height);
    const threeCanvas = requiredCanvas("threejs-morphtargets", ASSET.width, ASSET.height);
    const sideBySideCanvas = requiredCanvas("side-by-side", ASSET.width * 2, ASSET.height + 60);
    if (status) status.textContent = "rendering G3D morph targets";
    const g3d = await renderG3D(g3dCanvas);
    if (status) status.textContent = "rendering Three.js morph target reference";
    const threejs = await renderThree(threeCanvas, g3d.bodyClip);
    const [g3dPixels, threePixels] = await Promise.all([dataUrlToPixels(g3d.dataUrl), dataUrlToPixels(threejs.dataUrl)]);
    const diff = computeDiff(g3dPixels, threePixels);
    const sideBySide = await drawSideBySide(sideBySideCanvas, g3d.dataUrl, threejs.dataUrl, diff);
    const g3dStats = analyzeImageData(g3dPixels);
    const threeStats = analyzeImageData(threePixels);
    const ready: MorphTargetsParityReady = {
      status: "ready",
      schema: "g3d-threejs-parity-morphtargets-parity/v1",
      purpose: "same-asset Robot Expressive manual head morph weights vs actual Three.js morphTargetInfluences",
      generatedInBrowserAt: new Date().toISOString(),
      asset: ASSET,
      morph: MORPH,
      g3d: {
        renderer: { drawCalls: g3d.drawCalls, triangles: g3d.triangles },
        animation: { bodyClip: g3d.bodyClip, tracksApplied: g3d.tracksApplied, morphWeightTracksApplied: g3d.morphWeightTracksApplied, skinningPalettesUpdated: g3d.skinningPalettesUpdated },
        pixels: g3dStats
      },
      threejs: {
        loader: {
          actualGLTFLoader: threejs.actualGLTFLoader,
          actualThreeRenderer: threejs.actualThreeRenderer,
          actualAnimationMixer: threejs.actualAnimationMixer,
          actualMorphTargetInfluences: threejs.actualMorphTargetInfluences
        },
        animation: { bodyClip: threejs.bodyClip, clipCount: threejs.clipCount, morphMeshCount: threejs.morphMeshCount, morphTargetCount: threejs.morphTargetCount, skinnedMeshCount: threejs.skinnedMeshCount },
        renderer: { drawCalls: threejs.drawCalls, triangles: threejs.triangles },
        pixels: threeStats
      },
      diff,
      assertions: {
        sameAssetUrl: true,
        sameBodyClip: g3d.bodyClip === threejs.bodyClip,
        actualThreeGLTFLoader: threejs.actualGLTFLoader,
        actualThreeRenderer: threejs.actualThreeRenderer,
        actualThreeAnimationMixer: threejs.actualAnimationMixer,
        actualThreeMorphTargetInfluences: threejs.actualMorphTargetInfluences,
        g3dAppliedMorphWeights: g3d.morphWeightTracksApplied > 0,
        screenshotsNonBlank: g3dStats.nonBlackPixels > 42_000 && threeStats.nonBlackPixels > 42_000,
        fakeEqualityClaimed: false
      },
      dataUrls: { g3d: g3d.dataUrl, threejs: threejs.dataUrl, sideBySide }
    };
    window.__V9_MORPHTARGETS_PARITY__ = ready;
    if (status) status.textContent = "ready";
    if (json) json.textContent = JSON.stringify(stripDataUrls(ready), null, 2);
  } catch (error) {
    const failure: MorphTargetsParityError = {
      status: "error",
      schema: "g3d-threejs-parity-morphtargets-parity/v1",
      generatedInBrowserAt: new Date().toISOString(),
      error: error instanceof Error ? error.stack ?? error.message : String(error)
    };
    window.__V9_MORPHTARGETS_PARITY__ = failure;
    if (status) status.textContent = "error";
    if (json) json.textContent = JSON.stringify(failure, null, 2);
  }
}

async function renderG3D(canvas: HTMLCanvasElement) {
  const renderer = await G3DRenderer.create({ canvas, width: ASSET.width, height: ASSET.height, preserveDrawingBuffer: true, clearColor: [0.006, 0.008, 0.012, 1] });
  const pipeline = await loadV6GLTFRenderPipeline({
    url: ASSET.url,
    assetId: "v9-morphtargets-robot",
    assetName: ASSET.name,
    width: ASSET.width,
    height: ASSET.height,
    rendererInput: { cameraPolicy: "require", cameraFrameBounds: FRAME_BOUNDS, frame: CAMERA_FRAME, postprocess: false }
  });
  const animationRuntime = createGLTFSceneAnimationRuntime({ scene: pipeline.resources.scene, clips: pipeline.asset.animations, asset: pipeline.asset });
  const bodyClip = pipeline.asset.animations.find((clip) => /^walking$/i.test(clip.name)) ?? pipeline.asset.animations[0];
  if (!bodyClip) throw new Error("Morph parity requires at least one Robot animation clip.");
  const bodyApply = animationRuntime.applyClip(bodyClip, bodyClip.duration > 0 ? SAMPLE_SECONDS % bodyClip.duration : 0);
  const morphApply = animationRuntime.createMorphTargetController({
    target: MORPH.target,
    labels: MORPH.labels,
    initialWeights: [0, 0, 0]
  }).setWeights(MORPH.weights).apply(SAMPLE_SECONDS, "manual Head.weights morph parity");
  const frame = computePerspectiveCameraFrame(FRAME_BOUNDS, { width: ASSET.width, height: ASSET.height }, CAMERA_FRAME);
  const result = renderer.renderFrame({
    source: {
      collectRenderItems: () => [...collectImportedItems(pipeline, PLACEMENT), ...createG3DStageItems()],
      collectedLights: createG3DLights(),
      environmentLighting: false,
      cameraPolicy: "require",
      cameraPosition: frame.cameraPosition,
      cameraFrameBounds: FRAME_BOUNDS,
      frustumCulling: false,
      postprocess: false
    },
    camera: { viewProjectionMatrix: frame.viewProjectionMatrix, viewMatrix: frame.viewMatrix, projectionMatrix: frame.projectionMatrix },
    metadata: {
      assetId: "threejs-parity-morphtargets-parity",
      assetName: "V9 Morph Targets Parity",
      assetUri: "/tools/threejs-parity-morphtargets-parity/",
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
    bodyClip: bodyClip.name,
    tracksApplied: bodyApply.tracksApplied + morphApply.tracksApplied,
    morphWeightTracksApplied: bodyApply.morphWeightTracksApplied + morphApply.morphWeightTracksApplied,
    skinningPalettesUpdated: Math.max(bodyApply.skinningPalettesUpdated, morphApply.skinningPalettesUpdated),
    drawCalls: result.diagnostics.drawCalls,
    triangles: result.diagnostics.triangles,
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
      label: `v9-morph:${node.name}`,
      geometry,
      material,
      modelMatrix: multiplyMat4(placement, node.transform.worldMatrix),
      ...(renderable.skinning ? { skinning: renderable.skinning } : {}),
      ...(morphTargets && renderable.morphWeights.length > 0 ? { morphTargets, morphWeights: renderable.morphWeights } : {})
    });
  }
  return items;
}

function createG3DStageItems() {
  const cube = Geometry.litCube(1);
  const floor = new PBRMaterial({ name: "morphtargets-floor", baseColor: [0.06, 0.075, 0.09, 1], roughness: 0.42, metallic: 0.04, environmentIntensity: 0.72 });
  const marker = new PBRMaterial({ name: "morphtargets-marker", baseColor: [0.28, 0.95, 0.68, 1], roughness: 0.26, metallic: 0.08, emissiveColor: [0.02, 0.16, 0.08], emissiveStrength: 1.0 });
  return [
    { label: "morphtargets-floor", geometry: cube, material: floor, modelMatrix: composeMat4([0, -0.08, 0], [0, 0, 0, 1], [2.6, 0.035, 1.8]) },
    { label: "morphtargets-weight-marker", geometry: cube, material: marker, modelMatrix: composeMat4([-0.92, 1.7, -0.38], [0, 0, 0, 1], [0.09, 0.65, 0.09]) }
  ];
}

function createG3DLights() {
  const key = new DirectionalLight("v9-morph-key");
  key.intensity = 4.8;
  key.color = [1, 0.94, 0.82];
  const rim = new DirectionalLight("v9-morph-rim");
  rim.intensity = 2.4;
  rim.color = [0.54, 0.8, 1];
  return [
    { kind: "directional", color: key.color, intensity: key.intensity, position: [2.4, 3.4, 2.2], direction: [-0.42, -0.72, -0.52], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: key },
    { kind: "directional", color: rim.color, intensity: rim.intensity, position: [-2.5, 2.2, -1.6], direction: [0.6, -0.34, 0.72], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: rim }
  ];
}

async function renderThree(canvas: HTMLCanvasElement, bodyClipName: string) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(ASSET.width, ASSET.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(ASSET.url);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070b);
  scene.add(createThreeStage());
  scene.add(createThreeLights());
  const robot = gltf.scene;
  robot.quaternion.set(0, 0.04, 0, 0.9992).normalize();
  scene.add(robot);
  const bodyClip = gltf.animations.find((clip) => clip.name === bodyClipName) ?? gltf.animations.find((clip) => /^walking$/i.test(clip.name)) ?? gltf.animations[0];
  if (!bodyClip) throw new Error("Three.js morph target reference requires at least one animation clip.");
  const mixer = new THREE.AnimationMixer(robot);
  mixer.clipAction(bodyClip).play();
  mixer.setTime(bodyClip.duration > 0 ? SAMPLE_SECONDS % bodyClip.duration : 0);
  let morphMeshCount = 0;
  let morphTargetCount = 0;
  let skinnedMeshCount = 0;
  let actualMorphTargetInfluences = false;
  robot.traverse((object) => {
    if ("isSkinnedMesh" in object && object.isSkinnedMesh === true) skinnedMeshCount += 1;
    const influences = object.morphTargetInfluences;
    if (Array.isArray(influences) && influences.length > 0) {
      morphMeshCount += 1;
      morphTargetCount += influences.length;
      for (let index = 0; index < MORPH.weights.length && index < influences.length; index += 1) {
        influences[index] = MORPH.weights[index];
      }
      actualMorphTargetInfluences = true;
    }
  });
  robot.updateMatrixWorld(true);
  const frame = computePerspectiveCameraFrame(FRAME_BOUNDS, { width: ASSET.width, height: ASSET.height }, CAMERA_FRAME);
  const camera = new THREE.PerspectiveCamera(frame.fovYRadians * 180 / Math.PI, ASSET.width / ASSET.height, frame.near, frame.far);
  camera.position.set(...frame.cameraPosition);
  camera.lookAt(0, 2.0, 0);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  return {
    actualGLTFLoader: loader instanceof GLTFLoader,
    actualThreeRenderer: renderer instanceof THREE.WebGLRenderer,
    actualAnimationMixer: mixer instanceof THREE.AnimationMixer,
    actualMorphTargetInfluences,
    bodyClip: bodyClip.name,
    clipCount: gltf.animations.length,
    morphMeshCount,
    morphTargetCount,
    skinnedMeshCount,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    dataUrl: canvas.toDataURL("image/png")
  };
}

function createThreeStage() {
  const group = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.035, 1.8), new THREE.MeshStandardMaterial({ color: 0x0f1317, roughness: 0.42, metalness: 0.04 }));
  floor.position.set(0, -0.08, 0);
  group.add(floor);
  const marker = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.65, 0.09), new THREE.MeshStandardMaterial({ color: 0x47f2ad, roughness: 0.26, metalness: 0.08, emissive: 0x052814, emissiveIntensity: 1.0 }));
  marker.position.set(-0.92, 1.7, -0.38);
  group.add(marker);
  return group;
}

function createThreeLights() {
  const group = new THREE.Group();
  const key = new THREE.DirectionalLight(0xffefd1, 3.4);
  key.position.set(2.4, 3.4, 2.2);
  group.add(key);
  const rim = new THREE.DirectionalLight(0x8accff, 1.8);
  rim.position.set(-2.5, 2.2, -1.6);
  group.add(rim);
  group.add(new THREE.HemisphereLight(0xaebfff, 0x10151b, 0.55));
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

async function drawSideBySide(canvas: HTMLCanvasElement, g3dDataUrl: string, threeDataUrl: string, diff: DiffStats): Promise<string> {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to draw side-by-side morph comparison.");
  const [g3d, three] = await Promise.all([loadImage(g3dDataUrl), loadImage(threeDataUrl)]);
  context.fillStyle = "#090d14";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(g3d, 0, 0);
  context.drawImage(three, ASSET.width, 0);
  context.fillStyle = "#f4f7fb";
  context.font = "16px sans-serif";
  context.fillText("G3D Head.weights morph", 18, ASSET.height + 28);
  context.fillText("Three.js morphTargetInfluences", ASSET.width + 18, ASSET.height + 28);
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

function stripDataUrls(result: MorphTargetsParityReady): Omit<MorphTargetsParityReady, "dataUrls"> {
  const { dataUrls: _dataUrls, ...rest } = result;
  return rest;
}

function round(value: number): number {
  return Number(value.toFixed(3));
}
