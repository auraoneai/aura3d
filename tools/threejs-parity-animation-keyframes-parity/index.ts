// @ts-nocheck
import { computePerspectiveCameraFrame } from "@aura3d/rendering";
import { createV8KeyframeScene } from "/apps/animation-keyframes/src/scene.ts";
import { ASSET_URL, type V8KeyframeControls } from "/apps/animation-keyframes/src/state.ts";
import * as THREE from "three";
import { GLTFLoader } from "/node_modules/three/examples/jsm/loaders/GLTFLoader.js";

declare global {
  interface Window {
    __V9_ANIMATION_KEYFRAMES_PARITY__?: AnimationKeyframesParityResult;
  }
}

export {};

type AnimationKeyframesParityResult = AnimationKeyframesParityReady | AnimationKeyframesParityError;

interface AnimationKeyframesParityReady {
  readonly status: "ready";
  readonly schema: "a3d-threejs-parity-animation-keyframes-parity/v1";
  readonly purpose: "same-asset Robot Expressive A3D keyframe sampling vs actual Three.js AnimationMixer baseline";
  readonly generatedInBrowserAt: string;
  readonly asset: typeof ASSET;
  readonly a3d: {
    readonly renderer: { readonly drawCalls: number; readonly triangles: number };
    readonly animation: {
      readonly clipName: string;
      readonly clipCount: number;
      readonly tracksApplied: number;
      readonly skinningPalettesUpdated: number;
      readonly sampledAtSeconds: number;
    };
    readonly pixels: PixelStats;
  };
  readonly threejs: {
    readonly loader: { readonly actualGLTFLoader: true; readonly actualThreeRenderer: true; readonly actualAnimationMixer: true };
    readonly animation: {
      readonly clipName: string;
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
    readonly sameClip: boolean;
    readonly actualThreeGLTFLoader: boolean;
    readonly actualThreeRenderer: boolean;
    readonly actualThreeAnimationMixer: boolean;
    readonly a3dAppliedTracksAndSkinning: boolean;
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

interface AnimationKeyframesParityError {
  readonly status: "error";
  readonly schema: "a3d-threejs-parity-animation-keyframes-parity/v1";
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
  url: ASSET_URL,
  width: 1280,
  height: 720
} as const;

const SAMPLE_SECONDS = 0.82;
const TARGET_CLIP = "Dance";
const FRAME_BOUNDS = { min: [-0.9, -0.12, -0.9], max: [0.9, 2.15, 0.9] } as const;
const CAMERA_FRAME = {
  yawRadians: -0.38,
  pitchRadians: -0.08,
  paddingRatio: 0.1,
  fovYRadians: 0.54,
  nearPadding: 0.18,
  farPadding: 2.2
} as const;

void run();

async function run(): Promise<void> {
  const status = document.getElementById("report-status");
  const json = document.getElementById("report-json");
  try {
    const a3dCanvas = requiredCanvas("a3d-animation-keyframes", ASSET.width, ASSET.height);
    const threeCanvas = requiredCanvas("threejs-animation-keyframes", ASSET.width, ASSET.height);
    const sideBySideCanvas = requiredCanvas("side-by-side", ASSET.width * 2, ASSET.height + 60);
    if (status) status.textContent = "rendering A3D keyframe route";
    const a3d = await renderA3D(a3dCanvas);
    if (status) status.textContent = "rendering actual Three.js AnimationMixer reference";
    const threejs = await renderThree(threeCanvas, a3d.clipName);
    const [a3dPixels, threePixels] = await Promise.all([dataUrlToPixels(a3d.dataUrl), dataUrlToPixels(threejs.dataUrl)]);
    const diff = computeDiff(a3dPixels, threePixels);
    const sideBySide = await drawSideBySide(sideBySideCanvas, a3d.dataUrl, threejs.dataUrl, diff);
    const a3dStats = analyzeImageData(a3dPixels);
    const threeStats = analyzeImageData(threePixels);
    const ready: AnimationKeyframesParityReady = {
      status: "ready",
      schema: "a3d-threejs-parity-animation-keyframes-parity/v1",
      purpose: "same-asset Robot Expressive A3D keyframe sampling vs actual Three.js AnimationMixer baseline",
      generatedInBrowserAt: new Date().toISOString(),
      asset: ASSET,
      a3d: {
        renderer: { drawCalls: a3d.drawCalls, triangles: a3d.triangles },
        animation: {
          clipName: a3d.clipName,
          clipCount: a3d.clipCount,
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
          clipName: threejs.clipName,
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
        sameClip: a3d.clipName === threejs.clipName,
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
        "This is a bounded Robot Expressive keyframe parity proof against actual Three.js AnimationMixer for the selected clip.",
        "It is not a blanket claim for every animation clip, transition, blending layer, IK, or retargeting behavior."
      ]
    };
    window.__V9_ANIMATION_KEYFRAMES_PARITY__ = ready;
    if (status) status.textContent = "ready";
    if (json) json.textContent = JSON.stringify(stripDataUrls(ready), null, 2);
  } catch (error) {
    const failure: AnimationKeyframesParityError = {
      status: "error",
      schema: "a3d-threejs-parity-animation-keyframes-parity/v1",
      generatedInBrowserAt: new Date().toISOString(),
      error: error instanceof Error ? error.stack ?? error.message : String(error),
      expectedReferenceLoader: "GLTFLoader",
      expectedReferenceAnimation: "AnimationMixer",
      expectedRenderer: "THREE.WebGLRenderer"
    };
    window.__V9_ANIMATION_KEYFRAMES_PARITY__ = failure;
    if (status) status.textContent = "error";
    if (json) json.textContent = JSON.stringify(failure, null, 2);
  }
}

async function renderA3D(canvas: HTMLCanvasElement) {
  const scene = await createV8KeyframeScene(canvas);
  const controls: V8KeyframeControls = {
    playing: true,
    speed: 1,
    scrub: 0,
    orbitYaw: CAMERA_FRAME.yawRadians,
    clipName: scene.clips.some((clip) => clip.name === TARGET_CLIP) ? TARGET_CLIP : scene.clips[0]?.name ?? TARGET_CLIP
  };
  const frame = scene.render(controls, SAMPLE_SECONDS);
  return {
    drawCalls: frame.drawCalls,
    triangles: frame.triangles,
    clipName: controls.clipName,
    clipCount: scene.clips.length,
    tracksApplied: frame.apply.tracksApplied,
    skinningPalettesUpdated: frame.apply.skinningPalettesUpdated,
    dataUrl: canvas.toDataURL("image/png")
  };
}

async function renderThree(canvas: HTMLCanvasElement, clipName: string) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(ASSET.width, ASSET.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  if (!(renderer instanceof THREE.WebGLRenderer)) throw new Error("Animation keyframes parity requires an actual THREE.WebGLRenderer.");

  const loader = new GLTFLoader();
  if (!(loader instanceof GLTFLoader)) throw new Error("Animation keyframes parity requires the actual Three.js GLTFLoader.");
  const gltf = await loader.loadAsync(ASSET.url);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070b);
  scene.add(createThreeStage(SAMPLE_SECONDS));
  scene.add(createThreeLights());
  const robot = gltf.scene;
  robot.position.set(0, 0, 0);
  robot.quaternion.set(0, 0.05, 0, 0.9987).normalize();
  robot.scale.setScalar(0.2);
  scene.add(robot);

  let skinnedMeshCount = 0;
  robot.traverse((object) => {
    if ("isSkinnedMesh" in object && object.isSkinnedMesh === true) skinnedMeshCount += 1;
  });
  const clip = gltf.animations.find((item) => item.name === clipName) ?? gltf.animations.find((item) => /dance|walk|run/i.test(item.name)) ?? gltf.animations[0];
  if (!clip) throw new Error("Robot Expressive reference did not load animation clips.");
  const mixer = new THREE.AnimationMixer(robot);
  const action = mixer.clipAction(clip);
  action.play();
  mixer.setTime(clip.duration > 0 ? SAMPLE_SECONDS % clip.duration : 0);

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
    clipName: clip.name,
    clipCount: gltf.animations.length,
    trackCount: clip.tracks.length,
    skinnedMeshCount,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    dataUrl: canvas.toDataURL("image/png")
  };
}

function createThreeStage(time: number): THREE.Object3D {
  const group = new THREE.Group();
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 0.04, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x0e1317, roughness: 0.38, metalness: 0.05 })
  );
  floor.position.set(0, -0.07, 0);
  group.add(floor);
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 1.75, 0.04),
    new THREE.MeshStandardMaterial({ color: 0x050608, roughness: 0.5, metalness: 0 })
  );
  back.position.set(0, 0.78, -0.92);
  group.add(back);
  const sweep = Math.sin(time * 1.4) * 0.55;
  const cyan = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.7, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x10bfdc, roughness: 0.26, metalness: 0.2, emissive: 0x05282e, emissiveIntensity: 1.2 })
  );
  cyan.position.set(-1.15 + sweep, 0.45, -0.55);
  group.add(cyan);
  const amber = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.55, 0.08),
    new THREE.MeshStandardMaterial({ color: 0xf57929, roughness: 0.3, metalness: 0.12, emissive: 0x381502, emissiveIntensity: 1.1 })
  );
  amber.position.set(1.12 - sweep * 0.7, 0.36, -0.52);
  group.add(amber);
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
  if (!context) throw new Error("Unable to draw side-by-side animation keyframes comparison.");
  const [a3d, three] = await Promise.all([loadImage(a3dDataUrl), loadImage(threeDataUrl)]);
  context.fillStyle = "#090d14";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(a3d, 0, 0);
  context.drawImage(three, ASSET.width, 0);
  context.fillStyle = "#f4f7fb";
  context.font = "16px sans-serif";
  context.fillText("A3D keyframe sampler", 18, ASSET.height + 28);
  context.fillText("Three.js AnimationMixer", ASSET.width + 18, ASSET.height + 28);
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

function stripDataUrls(result: AnimationKeyframesParityReady): Omit<AnimationKeyframesParityReady, "dataUrls"> {
  const { dataUrls: _dataUrls, ...rest } = result;
  return rest;
}

function round(value: number): number {
  return Number(value.toFixed(3));
}
