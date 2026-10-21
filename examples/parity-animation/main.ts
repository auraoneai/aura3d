import {
  camera,
  characters,
  cloneSkinned,
  createAuraApp,
  lights,
  looks,
  material,
  primitives,
  scene
} from "@aura3d/engine";
import { attachRootRenderSource } from "@aura3d/engine/production-runtime";
import type { TypedGLBActor } from "@aura3d/engine/production-runtime";

/**
 * Lane L8 acceptance lab (three.js parity SA-01..06 / SM-03).
 *
 * Exercises `characters.clone` — the `SkeletonUtils.clone` analogue — on the
 * mixamo soldier GLB: ten clones share one `GLTFSharedTextureCache` lease so
 * decoded+uploaded texture entries stay flat from 1 → 10 clones, while every
 * clone owns an independent scene graph, skeleton and `GLTFSceneAnimationRuntime`
 * (each `playClip` writes only that clone's bone nodes).
 *
 * Evidence published on `window.__AURA3D_PARITY_ANIMATION__`:
 *  - `sharedTextureEntries`: cache size after the first clone and after the
 *    ninth extra clone joins the same cache (must be equal = flat bytes);
 *  - `sharedTextureRefCount`: 1 → 10 lease pins;
 *  - `boneWorldTranslations`: world-space translation of the probe joint per
 *    clone after `playClip(clip, phase_i)` with staggered phases — proof the
 *    mixers are independent (translations differ across clones);
 *  - `drawCalls`/`litPixels` from one rendered frame submitted through the
 *    production root render-source bridge.
 */

const SOLDIER_URL = "/fixtures/threejs-parity/assets/character/soldier.glb";
const PROBE_JOINT = "mixamorig:LeftForeArm";
const CLONE_COUNT = 10;

interface ParityAnimationLabState {
  readonly id: "parity-animation";
  readonly status: "loading" | "ready" | "error";
  readonly backend?: string;
  readonly cloneCount?: number;
  readonly clipName?: string;
  readonly clipPhases?: readonly number[];
  readonly sharedTextureEntries?: { readonly afterOne: number; readonly afterTen: number };
  readonly sharedTextureRefCount?: { readonly afterOne: number; readonly afterTen: number };
  readonly jointName?: string;
  readonly boneWorldTranslations?: readonly (readonly [number, number, number])[];
  readonly distinctBoneTranslations?: number;
  readonly drawCalls?: number;
  readonly litPixels?: number;
  readonly actorIds?: readonly string[];
  readonly clipsAvailable?: readonly string[];
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_PARITY_ANIMATION__?: ParityAnimationLabState;
  }
}

const publish = (patch: Partial<ParityAnimationLabState>): void => {
  window.__AURA3D_PARITY_ANIMATION__ = {
    ...(window.__AURA3D_PARITY_ANIMATION__ ?? { id: "parity-animation", status: "loading" }),
    ...patch
  };
};

const translation = (x: number, y: number, z: number): readonly number[] => [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  x, y, z, 1
];

const jointTranslation = (actor: TypedGLBActor, jointName: string): readonly [number, number, number] | undefined => {
  const sceneGraph = actor.pipeline.resources.scene;
  sceneGraph.updateWorldTransforms();
  const node = sceneGraph.findByName(jointName)[0];
  if (!node) return undefined;
  const m = node.transform.worldMatrix;
  return [m[12]!, m[13]!, m[14]!];
};

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>("#stage");
  if (!canvas) throw new Error("parity-animation lab: #stage canvas missing");
  // preserveDrawingBuffer before the app mounts so the rendered frame stays
  // readable for the litPixels evidence (same context is reused by the app).
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true, antialias: false });
  if (!gl) throw new Error("parity-animation lab: WebGL2 unavailable");

  const asset = { url: SOLDIER_URL, type: "model" as const, format: "glb" };
  const viewport = { width: canvas.width, height: canvas.height };

  // 1 clone → the shared cache holds the asset's decoded+uploaded textures once.
  const first = await cloneSkinned(asset, 1, { ...viewport, idPrefix: "soldier" });
  const entriesAfterOne = first.sharedTextures.size;
  const refsAfterOne = first.sharedTextures.refCount;

  // 9 more clones built *through the first actor* join its cache — texture
  // entries must stay flat while the pin count grows to ten.
  const rest = await characters.clone(first.actors[0]!, CLONE_COUNT - 1, { ...viewport, idPrefix: "soldier" });
  const actors = [...first.actors, ...rest.actors];
  const entriesAfterTen = rest.sharedTextures.size;
  const refsAfterTen = rest.sharedTextures.refCount;

  const clipsAvailable = actors[0]!.evidence.clips;
  const clipName = clipsAvailable.includes("Run") ? "Run" : clipsAvailable[0];
  if (!clipName) throw new Error("parity-animation lab: soldier.glb exposes no animation clips");

  // Independent mixers: stagger the sample phase across the run cycle so every
  // clone lands a different pose of the same clip.
  const clipPhases = actors.map((_, index) => (index * 0.07) % 0.7);
  actors.forEach((actor, index) => actor.playClip(clipName, clipPhases[index]!));

  const jointName = actors[0]!.animation.skeletonJointNames().includes(PROBE_JOINT)
    ? PROBE_JOINT
    : actors[0]!.animation.skeletonJointNames()[0];
  if (!jointName) throw new Error("parity-animation lab: actor exposes no skeleton joints");

  const boneWorldTranslations = actors.map((actor) => {
    const t = jointTranslation(actor, jointName);
    if (!t) throw new Error(`parity-animation lab: joint "${jointName}" missing in clone ${actor.id}`);
    return t;
  });
  const distinctBoneTranslations = new Set(boneWorldTranslations.map((t) => t.map((v) => v.toFixed(4)).join(","))).size;

  // One rendered frame: the app's scene supplies camera+lights; the root
  // render-source bridge submits every clone's skinned items, each offset in a
  // row so the frame actually rasterizes ten characters.
  const detach = attachRootRenderSource(canvas, {
    source: {
      collectRenderItems: () => actors.flatMap((actor, index) =>
        actor.collectRenderItems({ modelMatrix: translation((index - (CLONE_COUNT - 1) / 2) * 1.35, 0, 0) })
      )
    }
  });
  try {
    const app = createAuraApp(canvas, {
      autoStart: false,
      resize: false,
      pixelRatio: 1,
      renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
      scene: scene()
        .background("#060a12")
        .camera(camera.perspective({ position: [0, 2.2, 10.5], target: [0, 1, 0], fov: 42 }))
        .add(looks.preset("outdoor-day"))
        .add(lights.directional({ position: [5, 8, 6], intensity: 2.4, color: "#ffe9c4" }))
        .add(lights.directional({ position: [-4, 4, -3], intensity: 1.0, color: "#9cc7ff" }))
        .add(primitives.box({ name: "floor", position: [0, -0.05, 0], scale: [16, 0.1, 8], material: material.pbr({ color: "#1a2433", roughness: 0.9 }) }))
    });
    try {
      await app.ready();
      await app.stepAsync(1 / 60);
      const diagnostics = app.diagnostics();
      const width = canvas.width;
      const height = canvas.height;
      const pixels = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let litPixels = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i]! + pixels[i + 1]! + pixels[i + 2]! > 24) litPixels += 1;
      }
      publish({
        status: "ready",
        backend: diagnostics.renderer?.runtime.backend,
        cloneCount: actors.length,
        clipName,
        clipPhases,
        sharedTextureEntries: { afterOne: entriesAfterOne, afterTen: entriesAfterTen },
        sharedTextureRefCount: { afterOne: refsAfterOne, afterTen: refsAfterTen },
        jointName,
        boneWorldTranslations,
        distinctBoneTranslations,
        drawCalls: diagnostics.drawCalls,
        litPixels,
        actorIds: actors.map((actor) => actor.id),
        clipsAvailable
      });
    } finally {
      await app.disposeAsync();
    }
  } finally {
    detach();
  }
}

publish({ status: "loading" });
void boot().catch((error) => {
  publish({ status: "error", error: error instanceof Error ? error.stack ?? error.message : String(error) });
});
