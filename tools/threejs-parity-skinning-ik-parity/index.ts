// @ts-nocheck
import { createGLTFSceneAnimationRuntime, loadV6GLTFRenderPipeline } from "@aura3d/assets";
import { A3DRenderer } from "@aura3d/engine/advanced-runtime";
import { computePerspectiveCameraFrame, Geometry, PBRMaterial } from "@aura3d/rendering";
import { DirectionalLight, composeMat4, multiplyMat4 } from "@aura3d/scene";
import * as THREE from "three";
import { GLTFLoader } from "/node_modules/three/examples/jsm/loaders/GLTFLoader.js";

declare global {
  interface Window {
    __V9_SKINNING_IK_PARITY__?: SkinningIkParityResult;
  }
}

export {};

type SkinningIkParityResult = SkinningIkParityReady | SkinningIkParityError;

interface SkinningIkParityReady {
  readonly status: "ready";
  readonly schema: "a3d-threejs-parity-skinning-ik-parity/v1";
  readonly purpose: "same-asset Robot Expressive A3D imported skeleton IK vs Three.js loaded bone IK reference";
  readonly generatedInBrowserAt: string;
  readonly asset: typeof ASSET;
  readonly ik: typeof IK;
  readonly a3d: {
    readonly renderer: { readonly drawCalls: number; readonly triangles: number };
    readonly animation: { readonly baseClip: string; readonly tracksApplied: number; readonly skinningPalettesUpdated: number };
    readonly solution: IkSolutionStats;
    readonly pixels: PixelStats;
  };
  readonly threejs: {
    readonly loader: { readonly actualGLTFLoader: true; readonly actualThreeRenderer: true; readonly actualAnimationMixer: true; readonly actualBoneTransforms: true };
    readonly animation: { readonly baseClip: string; readonly clipCount: number; readonly skinnedMeshCount: number };
    readonly solution: IkSolutionStats;
    readonly renderer: { readonly drawCalls: number; readonly triangles: number };
    readonly pixels: PixelStats;
  };
  readonly diff: DiffStats;
  readonly assertions: {
    readonly sameAssetUrl: boolean;
    readonly sameBaseClip: boolean;
    readonly actualThreeGLTFLoader: boolean;
    readonly actualThreeRenderer: boolean;
    readonly actualThreeAnimationMixer: boolean;
    readonly actualThreeBoneTransforms: boolean;
    readonly a3dAppliedTracksAndSkinning: boolean;
    readonly endpointsNearTarget: boolean;
    readonly screenshotsNonBlank: boolean;
    readonly fakeEqualityClaimed: false;
  };
  readonly dataUrls: { readonly a3d: string; readonly threejs: string; readonly sideBySide: string };
}

interface SkinningIkParityError {
  readonly status: "error";
  readonly schema: "a3d-threejs-parity-skinning-ik-parity/v1";
  readonly generatedInBrowserAt: string;
  readonly error: string;
}

interface IkSolutionStats {
  readonly target: readonly [number, number, number];
  readonly end: readonly [number, number, number];
  readonly endDistanceToTarget: number;
  readonly reached: boolean;
  readonly stretched: boolean;
  readonly poleInfluence: number;
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
const IK = {
  joints: ["UpperArm.R", "LowerArm.R", "Palm2.R"] as const,
  target: [0.7, 0.55, 0] as const,
  pole: [-0.2, 1.38, 0.18] as const,
  weight: 1,
  allowStretch: false
} as const;
const SAMPLE_SECONDS = 0.84;
const FRAME_BOUNDS = { min: [-2.6, -0.2, -2], max: [2.6, 5.2, 2] } as const;
const CAMERA_FRAME = {
  yawRadians: -0.36,
  pitchRadians: -0.08,
  paddingRatio: 0.16,
  fovYRadians: 0.68,
  nearPadding: 0.16,
  farPadding: 2.2
} as const;

void run();

async function run(): Promise<void> {
  const status = document.getElementById("report-status");
  const json = document.getElementById("report-json");
  try {
    const a3dCanvas = requiredCanvas("a3d-skinning-ik", ASSET.width, ASSET.height);
    const threeCanvas = requiredCanvas("threejs-skinning-ik", ASSET.width, ASSET.height);
    const sideBySideCanvas = requiredCanvas("side-by-side", ASSET.width * 2, ASSET.height + 60);
    if (status) status.textContent = "rendering A3D imported skeleton IK";
    const a3d = await renderA3D(a3dCanvas);
    if (status) status.textContent = "rendering Three.js loaded bone IK reference";
    const threejs = await renderThree(threeCanvas, a3d.baseClip);
    const [a3dPixels, threePixels] = await Promise.all([dataUrlToPixels(a3d.dataUrl), dataUrlToPixels(threejs.dataUrl)]);
    const diff = computeDiff(a3dPixels, threePixels);
    const sideBySide = await drawSideBySide(sideBySideCanvas, a3d.dataUrl, threejs.dataUrl, diff);
    const a3dStats = analyzeImageData(a3dPixels);
    const threeStats = analyzeImageData(threePixels);
    const ready: SkinningIkParityReady = {
      status: "ready",
      schema: "a3d-threejs-parity-skinning-ik-parity/v1",
      purpose: "same-asset Robot Expressive A3D imported skeleton IK vs Three.js loaded bone IK reference",
      generatedInBrowserAt: new Date().toISOString(),
      asset: ASSET,
      ik: IK,
      a3d: {
        renderer: { drawCalls: a3d.drawCalls, triangles: a3d.triangles },
        animation: { baseClip: a3d.baseClip, tracksApplied: a3d.tracksApplied, skinningPalettesUpdated: a3d.skinningPalettesUpdated },
        solution: a3d.solution,
        pixels: a3dStats
      },
      threejs: {
        loader: {
          actualGLTFLoader: threejs.actualGLTFLoader,
          actualThreeRenderer: threejs.actualThreeRenderer,
          actualAnimationMixer: threejs.actualAnimationMixer,
          actualBoneTransforms: threejs.actualBoneTransforms
        },
        animation: { baseClip: threejs.baseClip, clipCount: threejs.clipCount, skinnedMeshCount: threejs.skinnedMeshCount },
        solution: threejs.solution,
        renderer: { drawCalls: threejs.drawCalls, triangles: threejs.triangles },
        pixels: threeStats
      },
      diff,
      assertions: {
        sameAssetUrl: true,
        sameBaseClip: a3d.baseClip === threejs.baseClip,
        actualThreeGLTFLoader: threejs.actualGLTFLoader,
        actualThreeRenderer: threejs.actualThreeRenderer,
        actualThreeAnimationMixer: threejs.actualAnimationMixer,
        actualThreeBoneTransforms: threejs.actualBoneTransforms,
        a3dAppliedTracksAndSkinning: a3d.tracksApplied > 0 && a3d.skinningPalettesUpdated > 0,
        endpointsNearTarget: a3d.solution.endDistanceToTarget < 0.55 && threejs.solution.endDistanceToTarget < 0.55,
        screenshotsNonBlank: a3dStats.nonBlackPixels > 45_000 && threeStats.nonBlackPixels > 45_000,
        fakeEqualityClaimed: false
      },
      dataUrls: { a3d: a3d.dataUrl, threejs: threejs.dataUrl, sideBySide }
    };
    window.__V9_SKINNING_IK_PARITY__ = ready;
    if (status) status.textContent = "ready";
    if (json) json.textContent = JSON.stringify(stripDataUrls(ready), null, 2);
  } catch (error) {
    const failure: SkinningIkParityError = {
      status: "error",
      schema: "a3d-threejs-parity-skinning-ik-parity/v1",
      generatedInBrowserAt: new Date().toISOString(),
      error: error instanceof Error ? error.stack ?? error.message : String(error)
    };
    window.__V9_SKINNING_IK_PARITY__ = failure;
    if (status) status.textContent = "error";
    if (json) json.textContent = JSON.stringify(failure, null, 2);
  }
}

async function renderA3D(canvas: HTMLCanvasElement) {
  const renderer = await A3DRenderer.create({ canvas, width: ASSET.width, height: ASSET.height, preserveDrawingBuffer: true, clearColor: [0.006, 0.008, 0.012, 1] });
  const pipeline = await loadV6GLTFRenderPipeline({
    url: ASSET.url,
    assetId: "v9-skinning-ik-robot-expressive",
    assetName: "Robot Expressive Imported Skeleton IK Parity",
    width: ASSET.width,
    height: ASSET.height,
    rendererInput: { cameraPolicy: "require", cameraFrameBounds: FRAME_BOUNDS, frame: CAMERA_FRAME, postprocess: false }
  });
  const animationRuntime = createGLTFSceneAnimationRuntime({ scene: pipeline.resources.scene, clips: pipeline.asset.animations, asset: pipeline.asset });
  const baseClip = pipeline.asset.animations.find((clip) => /^idle$/i.test(clip.name)) ?? pipeline.asset.animations[0];
  if (!baseClip) throw new Error("IK parity requires at least one Robot animation clip.");
  const baseApply = animationRuntime.applyClip(baseClip, baseClip.duration > 0 ? SAMPLE_SECONDS % baseClip.duration : 0);
  const ik = animationRuntime.solveImportedSkeletonTwoBoneIK({
    jointNames: IK.joints,
    target: IK.target,
    pole: IK.pole,
    weight: IK.weight,
    allowStretch: IK.allowStretch,
    apply: true
  });
  const frame = computePerspectiveCameraFrame(FRAME_BOUNDS, { width: ASSET.width, height: ASSET.height }, CAMERA_FRAME);
  const placement = composeMat4([0, 0, 0], [0, 0.04, 0, 0.9992], [1, 1, 1]);
  const stage = createA3DStageItems(IK.target);
  const result = renderer.renderFrame({
    source: {
      collectRenderItems: () => [...collectImportedItems(pipeline, placement), ...stage.items],
      collectedLights: createA3DLights(),
      environmentLighting: false,
      cameraPolicy: "require",
      cameraPosition: frame.cameraPosition,
      cameraFrameBounds: FRAME_BOUNDS,
      frustumCulling: false,
      postprocess: false
    },
    camera: { viewProjectionMatrix: frame.viewProjectionMatrix, viewMatrix: frame.viewMatrix, projectionMatrix: frame.projectionMatrix },
    metadata: {
      assetId: "threejs-parity-skinning-ik-parity",
      assetName: "V9 Skinning IK Parity",
      assetUri: "/tools/threejs-parity-skinning-ik-parity/",
      meshCount: pipeline.metadata.meshCount,
      primitiveCount: pipeline.metadata.primitiveCount,
      materialCount: pipeline.metadata.materialCount + stage.materialCount,
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
    baseClip: baseClip.name,
    tracksApplied: baseApply.tracksApplied,
    skinningPalettesUpdated: ik.skinningPalettesUpdated,
    solution: solutionStats(ik.solution),
    drawCalls: result.diagnostics.drawCalls,
    triangles: result.diagnostics.triangles,
    dataUrl: canvas.toDataURL("image/png")
  };
}

async function renderThree(canvas: HTMLCanvasElement, baseClipName: string) {
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
  scene.add(createThreeStage(IK.target));
  scene.add(createThreeLights());
  const robot = gltf.scene;
  robot.quaternion.set(0, 0.04, 0, 0.9992).normalize();
  scene.add(robot);

  let skinnedMeshCount = 0;
  robot.traverse((object) => {
    if ("isSkinnedMesh" in object && object.isSkinnedMesh === true) skinnedMeshCount += 1;
  });
  const baseClip = gltf.animations.find((clip) => clip.name === baseClipName) ?? gltf.animations.find((clip) => /^idle$/i.test(clip.name)) ?? gltf.animations[0];
  if (!baseClip) throw new Error("Three.js IK reference requires at least one animation clip.");
  const mixer = new THREE.AnimationMixer(robot);
  const action = mixer.clipAction(baseClip);
  action.play();
  mixer.setTime(baseClip.duration > 0 ? SAMPLE_SECONDS % baseClip.duration : 0);
  robot.updateMatrixWorld(true);

  const bones = new Map<string, THREE.Bone>();
  robot.traverse((object) => {
    if (object instanceof THREE.Bone) bones.set(object.name, object);
  });
  const root = requireBone(bones, IK.joints[0]);
  const mid = requireBone(bones, IK.joints[1]);
  const end = requireBone(bones, IK.joints[2]);
  const solution = solveThreeTwoBoneIk(root, mid, end, new THREE.Vector3(...IK.target), new THREE.Vector3(...IK.pole), IK.weight, IK.allowStretch);
  setWorldPosition(mid, solution.mid);
  robot.updateMatrixWorld(true);
  setWorldPosition(end, solution.end);
  robot.updateMatrixWorld(true);

  const frame = computePerspectiveCameraFrame(FRAME_BOUNDS, { width: ASSET.width, height: ASSET.height }, CAMERA_FRAME);
  const camera = new THREE.PerspectiveCamera(frame.fovYRadians * 180 / Math.PI, ASSET.width / ASSET.height, frame.near, frame.far);
  camera.position.set(...frame.cameraPosition);
  camera.lookAt(0, 2.5, 0);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  return {
    actualGLTFLoader: loader instanceof GLTFLoader,
    actualThreeRenderer: renderer instanceof THREE.WebGLRenderer,
    actualAnimationMixer: mixer instanceof THREE.AnimationMixer,
    actualBoneTransforms: true,
    baseClip: baseClip.name,
    clipCount: gltf.animations.length,
    skinnedMeshCount,
    solution: solutionStats({
      root: vectorToTuple(solution.root),
      mid: vectorToTuple(solution.mid),
      end: vectorToTuple(solution.end),
      reached: solution.endDistanceToTarget <= 1e-3,
      stretched: solution.stretched,
      endDistanceToTarget: solution.endDistanceToTarget,
      poleInfluence: solution.poleInfluence
    }),
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    dataUrl: canvas.toDataURL("image/png")
  };
}

function solveThreeTwoBoneIk(rootBone: THREE.Bone, midBone: THREE.Bone, endBone: THREE.Bone, target: THREE.Vector3, pole: THREE.Vector3, weight: number, allowStretch: boolean) {
  rootBone.updateMatrixWorld(true);
  midBone.updateMatrixWorld(true);
  endBone.updateMatrixWorld(true);
  const root = new THREE.Vector3().setFromMatrixPosition(rootBone.matrixWorld);
  const mid = new THREE.Vector3().setFromMatrixPosition(midBone.matrixWorld);
  const end = new THREE.Vector3().setFromMatrixPosition(endBone.matrixWorld);
  const upperLength = root.distanceTo(mid);
  const lowerLength = mid.distanceTo(end);
  const targetDelta = target.clone().sub(root);
  const targetDistance = targetDelta.length();
  const maxReach = upperLength + lowerLength;
  const minReach = Math.abs(upperLength - lowerLength) + 1e-5;
  const solveDistance = allowStretch ? targetDistance : clamp(targetDistance, minReach, maxReach - 1e-5);
  const axis = targetDelta.clone().normalize();
  const poleDelta = pole.clone().sub(root);
  const poleDirection = poleDelta.sub(axis.clone().multiplyScalar(poleDelta.dot(axis))).normalize();
  if (poleDirection.length() <= 1e-6) poleDirection.set(0, 1, 0);
  const adjacent = clamp((upperLength * upperLength + solveDistance * solveDistance - lowerLength * lowerLength) / (2 * solveDistance), 0, upperLength);
  const height = Math.sqrt(Math.max(0, upperLength * upperLength - adjacent * adjacent));
  const solvedEnd = root.clone().add(axis.clone().multiplyScalar(solveDistance));
  const solvedMid = root.clone().add(axis.clone().multiplyScalar(adjacent)).add(poleDirection.clone().multiplyScalar(height));
  const solved = {
    root,
    mid: mid.clone().lerp(solvedMid, weight),
    end: end.clone().lerp(solvedEnd, weight),
    stretched: targetDistance > maxReach && allowStretch === true,
    poleInfluence: Math.abs(solvedMid.clone().sub(root).normalize().dot(poleDirection))
  };
  return {
    ...solved,
    endDistanceToTarget: solved.end.distanceTo(target)
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
      label: `v9-ik:${node.name}`,
      geometry,
      material,
      modelMatrix: multiplyMat4(placement, node.transform.worldMatrix),
      ...(renderable.skinning ? { skinning: renderable.skinning } : {}),
      ...(morphTargets && renderable.morphWeights.length > 0 ? { morphTargets, morphWeights: renderable.morphWeights } : {})
    });
  }
  return items;
}

function createA3DStageItems(targetPosition) {
  const cube = Geometry.litCube(1);
  const targetSphere = Geometry.uvSphere(0.09, 16, 8);
  const floor = new PBRMaterial({ name: "v9-ik-floor", baseColor: [0.06, 0.075, 0.09, 1], roughness: 0.42, metallic: 0.04, environmentIntensity: 0.72 });
  const rail = new PBRMaterial({ name: "v9-ik-rail", baseColor: [0.12, 0.28, 0.42, 1], roughness: 0.34, metallic: 0.18, environmentIntensity: 0.8 });
  const target = new PBRMaterial({ name: "v9-ik-target", baseColor: [0.28, 0.95, 0.68, 1], roughness: 0.26, metallic: 0.08, emissiveColor: [0.02, 0.16, 0.08], emissiveStrength: 1.25 });
  return {
    materialCount: 3,
    items: [
      { label: "v9-ik-floor", geometry: cube, material: floor, modelMatrix: composeMat4([0, -0.07, 0], [0, 0, 0, 1], [3.1, 0.04, 2.1]) },
      { label: "v9-ik-left-rail", geometry: cube, material: rail, modelMatrix: composeMat4([-1.18, 0.3, -0.62], [0, 0, 0, 1], [0.06, 0.75, 0.06]) },
      { label: "v9-ik-right-rail", geometry: cube, material: rail, modelMatrix: composeMat4([1.18, 0.3, -0.62], [0, 0, 0, 1], [0.06, 0.75, 0.06]) },
      { label: "v9-ik-target", geometry: targetSphere, material: target, modelMatrix: composeMat4(targetPosition, [0, 0, 0, 1], [1, 1, 1]) }
    ]
  };
}

function createA3DLights() {
  const key = new DirectionalLight("v9-ik-key");
  key.intensity = 4.6;
  key.color = [1, 0.94, 0.82];
  const rim = new DirectionalLight("v9-ik-rim");
  rim.intensity = 2.4;
  rim.color = [0.54, 0.8, 1];
  return [
    { kind: "directional", color: key.color, intensity: key.intensity, position: [2.4, 3.4, 2.2], direction: [-0.42, -0.72, -0.52], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: key },
    { kind: "directional", color: rim.color, intensity: rim.intensity, position: [-2.5, 2.2, -1.6], direction: [0.6, -0.34, 0.72], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: rim }
  ];
}

function createThreeStage(targetPosition) {
  const group = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.04, 2.1), new THREE.MeshStandardMaterial({ color: 0x0f1317, roughness: 0.42, metalness: 0.04 }));
  floor.position.set(0, -0.07, 0);
  group.add(floor);
  for (const x of [-1.18, 1.18]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.75, 0.06), new THREE.MeshStandardMaterial({ color: 0x1f476b, roughness: 0.34, metalness: 0.18 }));
    rail.position.set(x, 0.3, -0.62);
    group.add(rail);
  }
  const target = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 8), new THREE.MeshStandardMaterial({ color: 0x47f2ad, roughness: 0.26, metalness: 0.08, emissive: 0x052814, emissiveIntensity: 1.25 }));
  target.position.set(...targetPosition);
  group.add(target);
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

function requireBone(bones, name) {
  const bone = bones.get(name) ?? bones.get(name.replace(/\./g, "")) ?? findNormalizedBone(bones, name);
  if (!bone) {
    const available = [...bones.keys()].filter((candidate) => normalizedBoneName(candidate).includes(normalizedBoneName(name).slice(0, 8))).join(", ");
    throw new Error(`Three.js IK reference missing bone ${name}${available ? `; nearby bones: ${available}` : ""}`);
  }
  return bone;
}

function findNormalizedBone(bones, name) {
  const normalized = normalizedBoneName(name);
  for (const [candidateName, bone] of bones) {
    if (normalizedBoneName(candidateName) === normalized) return bone;
  }
  return undefined;
}

function normalizedBoneName(name) {
  return String(name).replace(/[._\-\s]/g, "").toLowerCase();
}

function setWorldPosition(object, position) {
  if (object.parent) {
    object.parent.updateMatrixWorld(true);
    object.position.copy(object.parent.worldToLocal(position.clone()));
  } else {
    object.position.copy(position);
  }
  object.updateMatrixWorld(true);
}

function solutionStats(solution) {
  return {
    target: IK.target,
    end: solution.end,
    endDistanceToTarget: round(solution.endDistanceToTarget),
    reached: solution.reached,
    stretched: solution.stretched,
    poleInfluence: round(solution.poleInfluence)
  };
}

function vectorToTuple(vector) {
  return [round(vector.x), round(vector.y), round(vector.z)];
}

function requiredCanvas(id, width, height) {
  const canvas = document.getElementById(id);
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error(`Missing canvas #${id}`);
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function dataUrlToPixels(dataUrl) {
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

function analyzeImageData(image) {
  let nonBlackPixels = 0;
  let lumaSum = 0;
  let minLuma = 255;
  let maxLuma = 0;
  const buckets = new Set();
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const r = image.data[offset];
    const g = image.data[offset + 1];
    const b = image.data[offset + 2];
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

function computeDiff(a, b) {
  if (a.width !== b.width || a.height !== b.height) throw new Error("Cannot diff images with different dimensions.");
  let total = 0;
  let maxDelta = 0;
  let changedPixels = 0;
  for (let offset = 0; offset < a.data.length; offset += 4) {
    const delta = (Math.abs(a.data[offset] - b.data[offset]) + Math.abs(a.data[offset + 1] - b.data[offset + 1]) + Math.abs(a.data[offset + 2] - b.data[offset + 2])) / 3;
    total += delta;
    maxDelta = Math.max(maxDelta, delta);
    if (delta > 20) changedPixels += 1;
  }
  const meanDelta = total / (a.width * a.height);
  return { meanDelta: round(meanDelta), maxDelta: round(maxDelta), changedPixels, structuralSimilarityProxy: round(Math.max(0, 1 - meanDelta / 255)) };
}

async function drawSideBySide(canvas, a3dDataUrl, threeDataUrl, diff) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to draw side-by-side skinning IK comparison.");
  const [a3d, three] = await Promise.all([loadImage(a3dDataUrl), loadImage(threeDataUrl)]);
  context.fillStyle = "#090d14";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(a3d, 0, 0);
  context.drawImage(three, ASSET.width, 0);
  context.fillStyle = "#f4f7fb";
  context.font = "16px sans-serif";
  context.fillText("A3D imported skeleton IK", 18, ASSET.height + 28);
  context.fillText("Three.js loaded bone IK reference", ASSET.width + 18, ASSET.height + 28);
  context.fillStyle = "#aab5c4";
  context.font = "12px sans-serif";
  context.fillText(`mean delta ${diff.meanDelta}, similarity proxy ${diff.structuralSimilarityProxy}`, 18, ASSET.height + 48);
  return canvas.toDataURL("image/png");
}

async function loadImage(dataUrl) {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  return image;
}

function stripDataUrls(result) {
  const { dataUrls: _dataUrls, ...rest } = result;
  return rest;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value) {
  return Number(value.toFixed(3));
}
