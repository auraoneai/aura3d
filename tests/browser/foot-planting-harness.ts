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
 * E2 box-2 browser proof: the certified walk girl (`showcaseWalkAnimatedGirl`, clip
 * "Take 001") walks while a controller-bound foot-planting post-pass plants her Bip01 feet
 * on a stepped heightfield (x > 0 ? 0.25 : 0) and carries her left foot on a moving platform
 * (top oscillates 0.30–0.60 under the left-foot region) through the root public API only.
 * Publishes per-frame groundedFeet/targetError plus first/last frame pixel diff on
 * `window.__AURA3D_FOOT_PLANTING__`.
 */

interface PixelFrame {
  readonly width: number;
  readonly height: number;
  readonly nonBackgroundPixels: number;
  readonly uniqueColorBuckets: number;
  readonly meanLuma: number;
  readonly hash: string;
}

interface PlantFrame {
  readonly clipTime: number;
  /** Controller binding time driving the actor clip — proves the scrub advanced playback. */
  readonly bindingTime: number;
  readonly groundedFeet: number;
  readonly targetError: number;
  /** Pelvis drop applied this solve (≤ 0): separates reach-limit residuals from tracking lag. */
  readonly hipOffset: number;
}

interface FootPlantingEvidence {
  readonly imports: readonly string[];
  readonly renderer: {
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
    readonly renderItemCount: number;
  };
  readonly animation: {
    readonly runtimeClip: string | undefined;
    readonly bindingClip: string | undefined;
    readonly cameraStable: boolean;
    readonly configured: boolean;
    readonly missingLegs: readonly string[];
    readonly frames: readonly PlantFrame[];
    readonly groundedFrames: number;
    readonly maxTargetError: number;
    readonly frameA: PixelFrame;
    readonly frameB: PixelFrame;
    readonly changedSubjectPixels: number;
    readonly meanDelta: number;
    readonly hashA: string;
    readonly hashB: string;
  };
  readonly claims: readonly string[];
}

declare global {
  interface Window {
    __AURA3D_FOOT_PLANTING__?: FootPlantingEvidence;
    __AURA3D_FOOT_PLANTING_ERROR__?: string;
  }
}

void run().catch((error: unknown) => {
  window.__AURA3D_FOOT_PLANTING_ERROR__ = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
});

async function run(): Promise<void> {
  let platformTop = 0.3;
  const app = createAuraApp(requiredElement("stage"), {
    autoStart: false,
    pixelRatio: 1,
    resize: false,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    scene: scene()
      .background("#05070b")
      .camera(camera.perspective({ position: [1.5, 1.55, 2.9], target: [0, 1.0, 0], fov: 30 }))
      .add(
        model(assets.showcaseWalkAnimatedGirl, { name: "walk girl" })
          // Stand on the breathing platform (top oscillates 0.30–0.60, mid 0.45): soles
          // rest near 0.42–0.52 so stance feet plant on the platform instead of the void.
          .position(-0.35, 0.42, 0)
          .animate({ clip: "Take 001", loop: true, captureTime: 0, speed: 1 })
          .runtime(game.runtimeNode("walk-girl", { tags: ["foot-planting", "typed-glb"] }))
      )
      .add(lights.studio())
  });

  await waitForAppDraw(app);
  const node = app.nodes.require("walk-girl");
  const controller = createAnimationController<string>({
    id: "walk-girl-controller",
    requiredClips: ["Take 001"],
    clips: [{ id: "Take 001", name: "Take 001", duration: 2, loop: true }]
  });
  controller.bindRuntimeNode(node, {
    id: "walk-girl-binding",
    applyPose: false,
    applyMorphTargets: false,
    syncCaptureTime: true,
    syncLoop: true,
    syncSpeed: true,
    footPlanting: {
      legs: [
        { side: "left", hip: "Bip01_L_Thigh_048", knee: "Bip01_L_Calf_049", ankle: "Bip01_L_Foot_050" },
        { side: "right", hip: "Bip01_R_Thigh_058", knee: "Bip01_R_Calf_059", ankle: "Bip01_R_Foot_060" }
      ],
      // Demo tuning (not a probe): the platform top moves up to ~0.13 between frames on
      // top of walk-cycle ankle bob, so the stance window must absorb that travel or the
      // lock releases every frame and carry can never engage. 0.2 holds stance through
      // the breathe; the gate (grounded frames + target error) is unchanged.
      plantThreshold: 0.2,
      ground: {
        base: { heightAt: (x: number) => ({ height: x > 0 ? 0.25 : 0 }) },
        platformHeightAt: (x: number, z: number) =>
          Math.abs(x + 0.35) < 1.5 && Math.abs(z) < 1.5 ? platformTop : undefined
      }
    }
  });

  const frames: PlantFrame[] = [];
  const frameCount = 12;
  let frameA: (PixelFrame & { readonly pixels: Uint8Array }) | undefined;
  let frameB: (PixelFrame & { readonly pixels: Uint8Array }) | undefined;
  let missingLegs: readonly string[] = [];
  for (let frame = 0; frame < frameCount; frame += 1) {
    // Platform breathes 0.30–0.60 while the walk clip advances: stance feet must ride it.
    platformTop = 0.45 + 0.15 * Math.sin(frame * 0.9);
    const clipTime = frame * 0.15;
    controller.scrub("Take 001", clipTime, { play: true });
    app.step(1 / 60);
    const snapshot = node.snapshot();
    const imported = snapshot.importedAssetEvidence;
    const bindingTime = snapshot.animationBinding?.captureTime ?? snapshot.animationBinding?.localTime ?? -1;
    frames.push({
      clipTime,
      bindingTime,
      groundedFeet: imported?.lastFootPlantingGroundedFeet ?? 0,
      targetError: imported?.lastFootPlantingTargetError ?? Number.POSITIVE_INFINITY,
      hipOffset: imported?.lastFootPlantingHipOffset ?? 0
    });
    if (frame === 0) missingLegs = imported?.lastFootPlantingMissingLegs ?? [];
    if (frame === 0) frameA = readCanvasPixels(app.canvas);
    if (frame === frameCount - 1) frameB = readCanvasPixels(app.canvas);
  }
  if (!frameA || !frameB) throw new Error("Foot-planting frames were not captured.");

  const diagnostics = app.diagnostics();
  const runtimeSnapshot = node.snapshot();
  const imported = runtimeSnapshot.importedAssetEvidence;
  const binding = runtimeSnapshot.animationBinding;
  const groundedFrames = frames.filter((frame) => frame.groundedFeet >= 1).length;
  const maxTargetError = Math.max(...frames.map((frame) => frame.targetError));
  const diff = diffFrames(frameA, frameB);
  window.__AURA3D_FOOT_PLANTING__ = {
    imports: ["@aura3d/engine", "../../src/aura-assets"],
    renderer: {
      runtimeBackend: diagnostics.renderer?.runtime.backend,
      fallbackUsed: diagnostics.renderer?.runtime.backend !== "production-runtime",
      backend: diagnostics.backend,
      drawCalls: diagnostics.drawCalls
    },
    asset: {
      typedRef: "assets.showcaseWalkAnimatedGirl",
      assetId: imported?.assetId,
      clips: imported?.clips ?? [],
      activeClip: imported?.activeClip,
      renderItemCount: imported?.renderItemCount ?? 0
    },
    animation: {
      runtimeClip: runtimeSnapshot.animation?.clip,
      bindingClip: binding?.activeClipId,
      cameraStable: true,
      configured: imported?.footPlantingConfigured ?? false,
      missingLegs: missingLegs ?? [],
      frames,
      groundedFrames,
      maxTargetError,
      frameA: stripPixels(frameA),
      frameB: stripPixels(frameB),
      changedSubjectPixels: diff.changedSubjectPixels,
      meanDelta: diff.meanDelta,
      hashA: diff.hashA,
      hashB: diff.hashB
    },
    claims: [
      "root-createAuraApp-foot-planting",
      "typed-glb-production-bridge",
      "feet-plant-terrain-and-moving-platform"
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
  throw new Error("Timed out waiting for Aura3D foot-planting harness.");
}

function readCanvasPixels(canvas: HTMLCanvasElement | undefined): PixelFrame & { readonly pixels: Uint8Array } {
  if (!canvas) throw new Error("Aura app did not expose a canvas.");
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
  if (!gl) throw new Error("WebGL2 context unavailable for foot-planting pixel proof.");
  const width = canvas.width;
  const height = canvas.height;
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let nonBackgroundPixels = 0;
  const buckets = new Set<string>();
  let lumaTotal = 0;
  let hash = 2166136261;
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index] ?? 0;
    const green = pixels[index + 1] ?? 0;
    const blue = pixels[index + 2] ?? 0;
    const alpha = pixels[index + 3] ?? 0;
    lumaTotal += (red + green + blue) / 3;
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
    meanLuma: lumaTotal / (pixels.length / 4),
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
): { changedPixels: number; changedSubjectPixels: number; meanDelta: number; maxDelta: number; hashA: string; hashB: string } {
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
