import {
  camera,
  createAuraApp,
  defineAuraAssets,
  game,
  lights,
  model,
  scene
} from "@aura3d/engine";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const VIEWPORT = { width: 1440, height: 900, dpr: 1 } as const;
const CAMERA = { position: [0, 1.25, 6.2] as const, target: [0, 1, 0] as const, fov: 36, near: 0.1, far: 100 } as const;
const LIGHTING = { background: "#05070b", ambient: 0.35, keyPosition: [8, 14, 10] as const, keyIntensity: 2.6, keyColor: "#fff4e6" } as const;
const POSES = {
  before: { seconds: 0.2, morphWeight: 0 },
  after: { seconds: 1.2, morphWeight: 1 }
} as const;
const ASSETS = {
  skinnedCharacter: {
    id: "showcaseAnimatedRunnerHero",
    url: "/aura-assets/showcaseAnimatedRunnerHero.9ff4ea51.glb",
    sha256: "9ff4ea5196df2f58c9f63ff6d8608f084808a84b2ad992237a8a530b8b18899f",
    bounds: [199.856, 199.701, 199.028] as const,
    sizeBytes: 16_354_836,
    clip: "OffensiveIdle"
  },
  morphExpression: {
    id: "showcaseMorphExpression",
    url: "/aura-assets/showcaseMorphExpression.7617880e.gltf",
    sha256: "7617880e389ad59912ac1efaced7d127e50372aaeb3b1ab8dceefe4bdca39474",
    bounds: [1.1, 1.25, 0.25] as const,
    sizeBytes: 2_853,
    target: "target-0",
    runtimeTarget: "morph-expression-morph-1"
  }
} as const;
const auraAssets = defineAuraAssets({
  showcaseAnimatedRunnerHero: { type: "model", format: "glb", url: ASSETS.skinnedCharacter.url, hash: `sha256-${ASSETS.skinnedCharacter.sha256}`, bounds: ASSETS.skinnedCharacter.bounds, sizeBytes: ASSETS.skinnedCharacter.sizeBytes },
  showcaseMorphExpression: { type: "model", format: "gltf", url: ASSETS.morphExpression.url, hash: `sha256-${ASSETS.morphExpression.sha256}`, bounds: ASSETS.morphExpression.bounds, sizeBytes: ASSETS.morphExpression.sizeBytes }
});

declare global {
  interface Window {
    __AURA_THREE_HEAD_TO_HEAD_SKINNED_MORPH__?: any;
    __AURA_THREE_HEAD_TO_HEAD_SKINNED_MORPH_ERROR__?: string;
  }
}

const runtime: Record<string, any> = {
  ready: false,
  workload: "skinned-morph-animation",
  viewport: VIEWPORT,
  contract: { camera: CAMERA, lighting: LIGHTING, poses: POSES },
  assets: ASSETS,
  aura: null,
  three: null,
  stages: { aura: "starting", three: "starting" },
  interaction: { applied: false }
};
const publish = () => {
  runtime.ready = Boolean(runtime.aura && runtime.three);
  window.__AURA_THREE_HEAD_TO_HEAD_SKINNED_MORPH__ = structuredClone(runtime);
};
publish();

async function createAura(): Promise<(pose: keyof typeof POSES) => Promise<void>> {
  const canvas = requiredCanvas("aura");
  const app = createAuraApp(canvas, {
    autoStart: false,
    resize: false,
    pixelRatio: 1,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    scene: scene()
      .background(LIGHTING.background)
      .camera(camera.perspective({ position: CAMERA.position, target: CAMERA.target, fov: CAMERA.fov }))
      .add(lights.ambient({ intensity: LIGHTING.ambient, color: "#ffffff" }))
      .add(lights.directional({ position: LIGHTING.keyPosition, intensity: LIGHTING.keyIntensity, color: LIGHTING.keyColor }))
      .add(model(auraAssets.showcaseAnimatedRunnerHero, { name: "frozen skinned character", scaleMode: "fit", targetHeight: 2, castShadow: false, receiveShadow: false })
        .position(-1.25, 0, 0)
        .animate({ clip: ASSETS.skinnedCharacter.clip, loop: true, captureTime: POSES.before.seconds, speed: 1 })
        .runtime(game.runtimeNode("skinned-character", { tags: ["typed-glb", "skinned", "animated"] })))
      .add(model(auraAssets.showcaseMorphExpression, { name: "frozen morph expression", scaleMode: "fit", targetHeight: 1.5, castShadow: false, receiveShadow: false })
        .position(1.35, 0, 0)
        .runtime(game.runtimeNode("morph-expression", { tags: ["typed-gltf", "morph-target"] })))
  });
  await app.ready();
  const runner = app.nodes.require("skinned-character");
  const morph = app.nodes.require("morph-expression");
  return async (pose: keyof typeof POSES) => {
    runtime.stages.aura = `rendering-${pose}`;
    publish();
    const sample = POSES[pose];
    runner.play(ASSETS.skinnedCharacter.clip, { loop: true, captureTime: sample.seconds, speed: 1 });
    morph.setMorphTarget(ASSETS.morphExpression.target, sample.morphWeight);
    app.step(1 / 60);
    await nextPaint();
    const diagnostics = app.diagnostics();
    const runnerEvidence = runner.importedAssetEvidence();
    const morphEvidence = morph.importedAssetEvidence();
    if (diagnostics.errors.length > 0) throw new Error(`Aura skinned/morph render failed: ${diagnostics.errors.join(" | ")}`);
    runtime.aura = {
      publicPackageOnly: true,
      publicApi: "model.animate + runtimeNode.play + runtimeNode.setMorphTarget + createAuraApp",
      backend: diagnostics.backend,
      runtimeBackend: diagnostics.renderer?.runtime.backend,
      fallbackUsed: diagnostics.renderer?.runtime.backend !== "production-runtime",
      warnings: diagnostics.renderer?.warnings ?? [],
      errors: diagnostics.errors,
      drawCalls: diagnostics.drawCalls,
      assetStates: diagnostics.assets.filter((asset) => asset.id === ASSETS.skinnedCharacter.id || asset.id === ASSETS.morphExpression.id),
      clip: runnerEvidence?.activeClip,
      clipCount: runnerEvidence?.clips.length ?? 0,
      skeletonBoneCount: runnerEvidence?.skeleton?.boneCount ?? 0,
      skinningPaletteUpdated: runnerEvidence?.skinningPalette?.updated === true,
      skinnedRenderItemCount: runnerEvidence?.skinnedRenderItemCount ?? 0,
      morphTargets: morphEvidence?.morphTargets ?? [],
      manifestToRuntimeMorphTarget: { manifest: ASSETS.morphExpression.target, runtime: ASSETS.morphExpression.runtimeTarget },
      activeMorphTargets: morphEvidence?.activeMorphTargets ?? {},
      missingMorphTargets: morphEvidence?.missingMorphTargets ?? [],
      morphRenderItemCount: morphEvidence?.morphRenderItemCount ?? 0,
      sampleSeconds: sample.seconds,
      pixelHash: hashString(canvas.toDataURL("image/png"))
    };
    runtime.stages.aura = `rendered-${pose}`;
    publish();
  };
}

async function createThree(): Promise<(pose: keyof typeof POSES) => void> {
  const canvas = requiredCanvas("three");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(VIEWPORT.dpr);
  renderer.setSize(VIEWPORT.width, VIEWPORT.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  const world = new THREE.Scene();
  world.background = new THREE.Color(LIGHTING.background);
  world.add(new THREE.AmbientLight("#ffffff", LIGHTING.ambient));
  const key = new THREE.DirectionalLight(LIGHTING.keyColor, LIGHTING.keyIntensity);
  key.position.set(...LIGHTING.keyPosition);
  world.add(key);
  const camera = new THREE.PerspectiveCamera(CAMERA.fov, VIEWPORT.width / VIEWPORT.height, CAMERA.near, CAMERA.far);
  camera.position.set(...CAMERA.position);
  camera.lookAt(...CAMERA.target);
  camera.updateMatrixWorld();
  const loader = new GLTFLoader();
  const [runnerGltf, morphGltf] = await Promise.all([loader.loadAsync(ASSETS.skinnedCharacter.url), loader.loadAsync(ASSETS.morphExpression.url)]);
  const runner = runnerGltf.scene;
  const morph = morphGltf.scene;
  fitAndPlace(runner, 2, [-1.25, 0, 0]);
  fitAndPlace(morph, 1.5, [1.35, 0, 0]);
  world.add(runner, morph);
  const clip = THREE.AnimationClip.findByName(runnerGltf.animations, ASSETS.skinnedCharacter.clip);
  if (!clip) throw new Error(`Three.js could not find ${ASSETS.skinnedCharacter.clip}.`);
  const mixer = new THREE.AnimationMixer(runner);
  mixer.clipAction(clip).play();
  const morphMeshes: THREE.Mesh[] = [];
  let skinnedMeshCount = 0;
  let skeletonBoneCount = 0;
  runner.traverse((object) => {
    if (object instanceof THREE.SkinnedMesh) {
      skinnedMeshCount += 1;
      skeletonBoneCount = Math.max(skeletonBoneCount, object.skeleton.bones.length);
    }
  });
  morph.traverse((object) => {
    if (object instanceof THREE.Mesh && object.morphTargetInfluences && object.morphTargetDictionary) morphMeshes.push(object);
  });
  return (pose: keyof typeof POSES) => {
    runtime.stages.three = `rendering-${pose}`;
    publish();
    const sample = POSES[pose];
    mixer.setTime(sample.seconds);
    for (const mesh of morphMeshes) {
      // The frozen fixture has one target but no extras.targetNames, so Three.js
      // exposes an implementation-generated dictionary label. Match Aura's
      // manifest-generated `target-0` to the same first glTF target ordinal.
      const index = threeMorphIndex(mesh);
      if (index !== undefined && mesh.morphTargetInfluences) mesh.morphTargetInfluences[index] = sample.morphWeight;
    }
    world.updateMatrixWorld(true);
    renderer.render(world, camera);
    const pixels = new Uint8Array(VIEWPORT.width * VIEWPORT.height * 4);
    const gl = renderer.getContext();
    gl.readPixels(0, 0, VIEWPORT.width, VIEWPORT.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    runtime.three = {
      revision: THREE.REVISION,
      actualRenderer: renderer instanceof THREE.WebGLRenderer,
      actualGLTFLoader: true,
      actualAnimationMixer: mixer instanceof THREE.AnimationMixer,
      clip: clip.name,
      clipCount: runnerGltf.animations.length,
      skinnedMeshCount,
      skeletonBoneCount,
      morphMeshCount: morphMeshes.length,
      morphTargetCount: morphMeshes.reduce((sum, mesh) => sum + Object.keys(mesh.morphTargetDictionary ?? {}).length, 0),
      morphDictionaryNames: morphMeshes.flatMap((mesh) => Object.keys(mesh.morphTargetDictionary ?? {})),
      morphWeight: readThreeMorphWeight(morphMeshes),
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      sampleSeconds: sample.seconds,
      pixelHash: hash(pixels)
    };
    runtime.stages.three = `rendered-${pose}`;
    publish();
  };
}

let renderAura: ((pose: keyof typeof POSES) => Promise<void>) | undefined;
let renderThree: ((pose: keyof typeof POSES) => void) | undefined;
Promise.all([createAura(), createThree()]).then(async ([aura, three]) => {
  renderAura = aura;
  renderThree = three;
  three("before");
  await aura("before");
}).catch(reportError);
document.getElementById("advance")?.addEventListener("click", () => {
  runtime.interaction = { applied: true, action: "advance-skinned-animation-and-morph", from: POSES.before, to: POSES.after };
  renderThree?.("after");
  void renderAura?.("after").catch(reportError);
});

function fitAndPlace(object: THREE.Object3D, height: number, position: readonly [number, number, number]): void {
  const bounds = new THREE.Box3().setFromObject(object);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const scale = height / Math.max(size.y, 0.0001);
  object.scale.setScalar(scale);
  object.position.set(position[0] - center.x * scale, position[1] - bounds.min.y * scale, position[2] - center.z * scale);
}
function threeMorphIndex(mesh: THREE.Mesh): number | undefined {
  const named = mesh.morphTargetDictionary?.[ASSETS.morphExpression.target];
  if (named !== undefined) return named;
  const first = Object.values(mesh.morphTargetDictionary ?? {})[0];
  return typeof first === "number" ? first : mesh.morphTargetInfluences?.length ? 0 : undefined;
}
function readThreeMorphWeight(meshes: readonly THREE.Mesh[]): number | null {
  const mesh = meshes[0];
  if (!mesh?.morphTargetInfluences) return null;
  const index = threeMorphIndex(mesh);
  return index === undefined ? null : mesh.morphTargetInfluences[index] ?? null;
}
function requiredCanvas(id: string): HTMLCanvasElement { const canvas = document.querySelector<HTMLCanvasElement>(`#${id}`); if (!canvas) throw new Error(`Missing ${id} canvas.`); return canvas; }
function nextPaint(): Promise<void> { return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); }
function hash(bytes: Uint8Array): string { let value = 2166136261; for (const byte of bytes) { value ^= byte; value = Math.imul(value, 16777619) >>> 0; } return value.toString(16).padStart(8, "0"); }
function hashString(value: string): string { return hash(new TextEncoder().encode(value)); }
function reportError(error: unknown): void { window.__AURA_THREE_HEAD_TO_HEAD_SKINNED_MORPH_ERROR__ = error instanceof Error ? error.stack ?? error.message : String(error); }
