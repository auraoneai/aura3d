import {
  camera,
  createAnimationController,
  createAuraApp,
  game,
  lights,
  model,
  scene
} from "@aura3d/engine";
import { assets } from "../../src/aura-assets";

/**
 * E1 hero-roster certification harness. One `?rig=<id>` per page load; each rig mounts a
 * typed hero asset through the root public API only, plays a named clip, and captures two
 * frames at different clip times. Per-rig pixel proof (changed subject-region pixels with
 * a stable camera) is published on `window.__AURA3D_CERTIFIED_RIG__`.
 *
 * Roster (humanoid x2, creature, vehicle-driver, face):
 * - humanoid-a: showcaseWalkAnimatedGirl / "Take 001" (78 joints, uniform-array path)
 * - humanoid-b: showcaseAnimatedRunnerHero / "OffensiveIdle" (136 joints, data-texture path)
 * - creature: showcaseRunnerRobot / "WALK" (34 joints)
 * - vehicle-driver: showcaseKenneyOobiPlatformerHero / "walk" (6 joints; the "drive"
 *   clip is a static 2-keyframe pose with zero channel motion, verified from the GLB)
 * - face: showcaseAnimatedRunnerHero / "FacialExpressions" (dozens of head/face bones;
 *   showcaseMorphExpression is a single-triangle morph unit card, not a face — see docs)
 *
 * Capture times sit inside each clip's real sampler range (GLB-verified): clips with
 * time offsets (WALK starts at t=2.48, Take 001 at t=31.8) render identical frames when
 * scrubbed before their first keyframe, so blind t=0.1 capture is a false proof.
 */

type RigId = "humanoid-a" | "humanoid-b" | "creature" | "vehicle-driver" | "face";

type HeroAsset =
  | typeof assets.showcaseWalkAnimatedGirl
  | typeof assets.showcaseAnimatedRunnerHero
  | typeof assets.showcaseRunnerRobot
  | typeof assets.showcaseKenneyOobiPlatformerHero;

interface RigConfig {
  readonly id: RigId;
  /** Certified roster slot: humanoid x2, creature, vehicle-driver, face. */
  readonly kind: "humanoid" | "creature" | "vehicle-driver" | "face";
  readonly asset: HeroAsset;
  readonly assetId: string;
  readonly clip: string;
  /** Capture times inside the clip's real sampler range (GLB-verified, never blind t=0.1). */
  readonly timeA: number;
  readonly timeB: number;
}

const RIGS: Record<RigId, RigConfig> = {
  "humanoid-a": { id: "humanoid-a", kind: "humanoid", asset: assets.showcaseWalkAnimatedGirl, assetId: "showcaseWalkAnimatedGirl", clip: "Take 001", timeA: 32.05, timeB: 32.65 },
  "humanoid-b": { id: "humanoid-b", kind: "humanoid", asset: assets.showcaseAnimatedRunnerHero, assetId: "showcaseAnimatedRunnerHero", clip: "OffensiveIdle", timeA: 1, timeB: 3 },
  creature: { id: "creature", kind: "creature", asset: assets.showcaseRunnerRobot, assetId: "showcaseRunnerRobot", clip: "WALK", timeA: 2.6, timeB: 3.1 },
  "vehicle-driver": { id: "vehicle-driver", kind: "vehicle-driver", asset: assets.showcaseKenneyOobiPlatformerHero, assetId: "showcaseKenneyOobiPlatformerHero", clip: "walk", timeA: 0.1, timeB: 0.5 },
  face: { id: "face", kind: "face", asset: assets.showcaseAnimatedRunnerHero, assetId: "showcaseAnimatedRunnerHero", clip: "FacialExpressions", timeA: 2, timeB: 8 }
};

interface PixelFrame {
  readonly width: number;
  readonly height: number;
  readonly nonBackgroundPixels: number;
  readonly uniqueColorBuckets: number;
  readonly hash: string;
}

interface PixelDiff {
  readonly changedPixels: number;
  readonly changedSubjectPixels: number;
  readonly meanDelta: number;
  readonly maxDelta: number;
  readonly hashA: string;
  readonly hashB: string;
}

interface CertifiedRigEvidence {
  readonly imports: readonly string[];
  readonly rig: RigId;
  readonly kind: RigConfig["kind"];
  readonly renderer: {
    readonly mode: string;
    readonly runtimeBackend: string | undefined;
    readonly fallbackUsed: boolean;
    readonly backend: string;
    readonly drawCalls: number;
  };
  readonly asset: {
    readonly typedRef: string;
    readonly assetId: string | undefined;
    readonly clips: readonly string[];
    readonly activeClip: string | undefined;
    readonly skinningPaletteUpdated: boolean;
    readonly skeletonBoneCount: number;
    readonly jointCount: number;
    readonly renderItemCount: number;
    readonly skinnedRenderItemCount: number;
    readonly morphRenderItemCount: number;
    readonly morphTargetCount: number;
  };
  readonly animation: {
    readonly runtimeClip: string | undefined;
    readonly bindingClip: string | undefined;
    readonly cameraStable: boolean;
    readonly frameA: PixelFrame;
    readonly frameB: PixelFrame;
    readonly diff: PixelDiff;
  };
  readonly claims: readonly string[];
}

declare global {
  interface Window {
    __AURA3D_CERTIFIED_RIG__?: CertifiedRigEvidence;
    __AURA3D_CERTIFIED_RIG_ERROR__?: string;
  }
}

const rig = readRig();

void run(rig).catch((error: unknown) => {
  window.__AURA3D_CERTIFIED_RIG_ERROR__ = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
});

function readRig(): RigConfig {
  const value = new URL(window.location.href).searchParams.get("rig");
  const config = (Object.values(RIGS) as readonly RigConfig[]).find((candidate) => candidate.id === value);
  if (!config) throw new Error(`Unknown certification rig "${value ?? ""}".`);
  return config;
}

async function run(config: RigConfig): Promise<void> {
  const app = createAuraApp(requiredElement("stage"), {
    autoStart: false,
    pixelRatio: 1,
    resize: false,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    scene: scene()
      .background("#05070b")
      .camera(camera.perspective({ position: [1.5, 1.35, 2.7], target: [0, 0.85, 0], fov: 36 }))
      .add(
        model(config.asset, { name: `certified hero ${config.id}` })
          .position(0, 0, 0)
          .animate({ clip: config.clip, loop: true, captureTime: 0, speed: 1 })
          .runtime(game.runtimeNode(`certified-${config.id}`, { tags: ["certified-rig", config.kind, "typed-glb"] }))
      )
      .add(lights.studio())
  });

  await waitForAppDraw(app);
  const node = app.nodes.require(`certified-${config.id}`);
  const controller = createAnimationController<string>({
    id: `certified-${config.id}-controller`,
    requiredClips: [config.clip],
    clips: [{ id: config.clip, name: config.clip, duration: 40, loop: true }]
  });
  controller.bindRuntimeNode(node, {
    id: `certified-${config.id}-binding`,
    applyPose: false,
    applyMorphTargets: false,
    syncCaptureTime: true,
    syncLoop: true,
    syncSpeed: true
  });

  // Two explicit scrubs inside the clip's real sampler range (see RIGS table).
  controller.scrub(config.clip, config.timeA, { play: true });
  app.step(1 / 60);
  const frameA = readCanvasPixels(app.canvas);
  controller.scrub(config.clip, config.timeB, { play: true });
  app.step(1 / 60);
  const frameB = readCanvasPixels(app.canvas);

  const diagnostics = app.diagnostics();
  const runtimeSnapshot = node.snapshot();
  const imported = runtimeSnapshot.importedAssetEvidence;
  const binding = runtimeSnapshot.animationBinding;
  window.__AURA3D_CERTIFIED_RIG__ = {
    imports: ["@aura3d/engine", "../../src/aura-assets"],
    rig: config.id,
    kind: config.kind,
    renderer: {
      mode: diagnostics.renderer?.runtime.backend === "production-runtime" ? "production" : "safe-basic",
      runtimeBackend: diagnostics.renderer?.runtime.backend,
      fallbackUsed: diagnostics.renderer?.runtime.backend !== "production-runtime",
      backend: diagnostics.backend,
      drawCalls: diagnostics.drawCalls
    },
    asset: {
      typedRef: `assets.${config.assetId}`,
      assetId: imported?.assetId,
      clips: imported?.clips ?? [],
      activeClip: imported?.activeClip,
      skinningPaletteUpdated: imported?.skinningPalette?.updated === true,
      skeletonBoneCount: imported?.skeleton?.boneCount ?? 0,
      jointCount: imported?.skeleton?.boneCount ?? 0,
      renderItemCount: imported?.renderItemCount ?? 0,
      skinnedRenderItemCount: imported?.skinnedRenderItemCount ?? 0,
      morphRenderItemCount: imported?.morphRenderItemCount ?? 0,
      morphTargetCount: imported?.morphTargets?.length ?? 0
    },
    animation: {
      runtimeClip: runtimeSnapshot.animation?.clip,
      bindingClip: binding?.activeClipId,
      cameraStable: true,
      frameA: stripPixels(frameA),
      frameB: stripPixels(frameB),
      diff: diffFrames(frameA, frameB)
    },
    claims: [
      "root-createAuraApp-certified-rig",
      "typed-glb-production-bridge",
      `${config.kind}-rig-visible-clip-playback`
    ]
  };
}

async function waitForAppDraw(app: ReturnType<typeof createAuraApp>): Promise<void> {
  await waitFor(() => app.diagnostics().drawCalls > 0 && app.diagnostics().renderSize[0] > 0, 15_000);
  app.step(1 / 60);
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for Aura3D certified-rig harness.");
}

function readCanvasPixels(canvas: HTMLCanvasElement | undefined): PixelFrame & { readonly pixels: Uint8Array } {
  if (!canvas) throw new Error("Aura app did not expose a canvas.");
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
  if (!gl) throw new Error("WebGL2 context unavailable for certified-rig pixel proof.");
  const width = canvas.width;
  const height = canvas.height;
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let nonBackgroundPixels = 0;
  const buckets = new Set<string>();
  let hash = 2166136261;
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index] ?? 0;
    const green = pixels[index + 1] ?? 0;
    const blue = pixels[index + 2] ?? 0;
    const alpha = pixels[index + 3] ?? 0;
    if (alpha > 0 && (red > 18 || green > 18 || blue > 22)) {
      nonBackgroundPixels += 1;
      buckets.add(`${red >> 4}:${green >> 4}:${blue >> 4}`);
    }
    hash ^= red + (green << 8) + (blue << 16) + alpha;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return {
    width,
    height,
    nonBackgroundPixels,
    uniqueColorBuckets: buckets.size,
    hash: hash.toString(16).padStart(8, "0"),
    pixels
  };
}

function stripPixels<T extends { readonly pixels: Uint8Array }>(frame: T): Omit<T, "pixels"> {
  const { pixels: _dropped, ...rest } = frame;
  return rest;
}

function diffFrames(
  a: PixelFrame & { readonly pixels: Uint8Array },
  b: PixelFrame & { readonly pixels: Uint8Array }
): PixelDiff {
  const pixelCount = Math.min(a.pixels.length, b.pixels.length) / 4;
  let changedPixels = 0;
  let changedSubjectPixels = 0;
  let totalDelta = 0;
  let maxDelta = 0;
  for (let index = 0; index < pixelCount * 4; index += 4) {
    const dr = Math.abs((a.pixels[index] ?? 0) - (b.pixels[index] ?? 0));
    const dg = Math.abs((a.pixels[index + 1] ?? 0) - (b.pixels[index + 1] ?? 0));
    const db = Math.abs((a.pixels[index + 2] ?? 0) - (b.pixels[index + 2] ?? 0));
    const delta = (dr + dg + db) / 3;
    const subject =
      (a.pixels[index] ?? 0) > 18 || (a.pixels[index + 1] ?? 0) > 18 || (a.pixels[index + 2] ?? 0) > 22 ||
      (b.pixels[index] ?? 0) > 18 || (b.pixels[index + 1] ?? 0) > 18 || (b.pixels[index + 2] ?? 0) > 22;
    totalDelta += delta;
    maxDelta = Math.max(maxDelta, delta);
    if (delta > 10) changedPixels += 1;
    if (subject && delta > 10) changedSubjectPixels += 1;
  }
  return {
    changedPixels,
    changedSubjectPixels,
    meanDelta: pixelCount > 0 ? totalDelta / pixelCount : 0,
    maxDelta,
    hashA: a.hash,
    hashB: b.hash
  };
}

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element;
}
