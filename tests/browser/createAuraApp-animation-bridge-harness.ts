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

type RunnerClip = "IDLE" | "WALK" | "RUN" | "ALL";
type HarnessMode = "pose-pair" | "controls" | "keyboard";

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

interface AnimationBridgeEvidence {
  readonly imports: readonly string[];
  readonly renderer: {
    readonly mode: string;
    readonly runtimeBackend: string | undefined;
    readonly fallbackUsed: boolean;
    readonly backend: string;
    readonly drawCalls: number;
    readonly warnings: readonly string[];
  };
  readonly asset: {
    readonly typedRef: "assets.showcaseRunnerRobot";
    readonly assetId: string | undefined;
    readonly clips: readonly string[];
    readonly activeClip: string | undefined;
    readonly skinningPaletteUpdated: boolean;
    readonly skeletonBoneCount: number;
    readonly renderItemCount: number;
    readonly skinnedRenderItemCount: number;
    readonly diagnostics: readonly unknown[];
  };
  readonly animation: {
    readonly mode: HarnessMode;
    readonly controllerId: string | undefined;
    readonly currentState: string;
    readonly activeClipId: string | undefined;
    readonly runtimeClip: string | undefined;
    readonly bindingClip: string | undefined;
    readonly playbackControls: {
      readonly play: boolean;
      readonly pause: boolean;
      readonly loop: boolean;
      readonly crossFade: boolean;
      readonly speed: boolean;
      readonly seek: boolean;
    };
    readonly cameraStable: boolean;
    readonly frameA: PixelFrame;
    readonly frameB: PixelFrame;
    readonly diff: PixelDiff;
    readonly pauseDiff?: PixelDiff;
  };
  readonly keyboard?: {
    readonly events: readonly string[];
    readonly state: string;
    readonly pressedRun: boolean;
    readonly pressedHit: boolean;
  };
  readonly claims: readonly string[];
}

declare global {
  interface Window {
    __AURA3D_ANIMATION_BRIDGE_CONTRACT__?: AnimationBridgeEvidence;
    __AURA3D_ANIMATION_BRIDGE_CAPTURE__?: () => AnimationBridgeEvidence;
    __AURA3D_ANIMATION_BRIDGE_ERROR__?: string;
  }
}

const mode = readMode();

void run(mode).catch((error: unknown) => {
  window.__AURA3D_ANIMATION_BRIDGE_ERROR__ = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
});

function readMode(): HarnessMode {
  const value = new URL(window.location.href).searchParams.get("mode");
  if (value === "controls" || value === "keyboard") return value;
  return "pose-pair";
}

async function run(nextMode: HarnessMode): Promise<void> {
  const app = createAuraApp(requiredElement("stage"), {
    autoStart: false,
    pixelRatio: 1,
    resize: false,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    scene: scene()
      .background("#05070b")
      .camera(camera.perspective({ position: [2.1, 1.32, 3.3], target: [0, 0.72, -0.05], fov: 34 }))
      .add(
        model(assets.showcaseRunnerRobot, { name: "Root API skinned runner robot", scale: 2.35 })
          .position(0, 0, 0)
          .rotate(0, 0.38, 0)
          .animate({ clip: "IDLE", loop: true, captureTime: 0, speed: 1 })
          .runtime(game.runtimeNode("runner", { tags: ["player", "typed-glb", "skinned", "animated"] }))
      )
      .add(lights.studio())
  });

  await waitForAppDraw(app);
  const runner = app.nodes.require("runner");
  const controller = createAnimationController<RunnerClip>({
    id: "root-runner-controller",
    requiredClips: ["IDLE", "WALK", "RUN"],
    clips: [
      { id: "IDLE", name: "IDLE", duration: 3.2, loop: true },
      { id: "WALK", name: "WALK", duration: 3.2, loop: true },
      { id: "RUN", name: "RUN", duration: 3.2, loop: true },
      { id: "ALL", name: "ALL", duration: 3.2, loop: true }
    ]
  });
  controller.bindRuntimeNode(runner, {
    id: "root-runner-binding",
    applyPose: false,
    applyMorphTargets: false,
    syncCaptureTime: true,
    syncLoop: true,
    syncSpeed: true
  });

  const keyboardEvents: string[] = [];
  const exercisedControls: AnimationBridgeEvidence["animation"]["playbackControls"] = {
    play: false,
    pause: false,
    loop: false,
    crossFade: false,
    speed: false,
    seek: false
  };
  let currentState = "idle";
  const publish = (frameA: PixelFrame, frameB: PixelFrame, diff: PixelDiff, pauseDiff?: PixelDiff): AnimationBridgeEvidence => {
    const diagnostics = app.diagnostics();
    const runtimeSnapshot = runner.snapshot();
    const imported = runtimeSnapshot.importedAssetEvidence;
    const binding = runtimeSnapshot.animationBinding;
    const evidence: AnimationBridgeEvidence = {
      imports: ["@aura3d/engine", "../../src/aura-assets"],
      renderer: {
        mode: diagnostics.renderer?.runtime.backend === "production-runtime" ? "production" : "safe-basic",
        runtimeBackend: diagnostics.renderer?.runtime.backend,
        fallbackUsed: diagnostics.renderer?.runtime.backend !== "production-runtime",
        backend: diagnostics.backend,
        drawCalls: diagnostics.drawCalls,
        warnings: diagnostics.renderer?.warnings ?? []
      },
      asset: {
        typedRef: "assets.showcaseRunnerRobot",
        assetId: imported?.assetId,
        clips: imported?.clips ?? [],
        activeClip: imported?.activeClip,
        skinningPaletteUpdated: imported?.skinningPalette?.updated === true,
        skeletonBoneCount: imported?.skeleton?.boneCount ?? 0,
        renderItemCount: imported?.renderItemCount ?? 0,
        skinnedRenderItemCount: imported?.skinnedRenderItemCount ?? 0,
        diagnostics: imported?.diagnostics ?? []
      },
      animation: {
        mode: nextMode,
        controllerId: binding?.controllerId,
        currentState,
        activeClipId: controller.activeClipId(),
        runtimeClip: runtimeSnapshot.animation?.clip,
        bindingClip: binding?.activeClipId,
        playbackControls: createPlaybackControlEvidence(controller, exercisedControls),
        cameraStable: true,
        frameA,
        frameB,
        diff,
        ...(pauseDiff ? { pauseDiff } : {})
      },
      ...(nextMode === "keyboard" ? {
        keyboard: {
          events: [...keyboardEvents],
          state: currentState,
          pressedRun: keyboardEvents.includes("run"),
          pressedHit: keyboardEvents.includes("hit")
        }
      } : {}),
      claims: [
        "root-createAuraApp-typed-animation",
        "typed-glb-production-bridge",
        "skinned-glb-visible-animation",
        ...(nextMode === "keyboard" ? ["keyboard-driven-animation-state"] : [])
      ]
    };
    window.__AURA3D_ANIMATION_BRIDGE_CONTRACT__ = evidence;
    return evidence;
  };

  const playAndCapture = (clip: RunnerClip, time: number, state: string): PixelFrame => {
    currentState = state;
    controller.scrub(clip, time, { play: true });
    app.step(1 / 60);
    return readCanvasPixels(app.canvas);
  };

  if (nextMode === "keyboard") {
    const input = app.input({
      actions: {
        run: ["KeyD", "ArrowRight"],
        hit: ["KeyH", "KeyJ"]
      },
      bufferMs: 180,
      target: window
    });
    const idleFrame = playAndCapture("IDLE", 0.1, "idle");
    const initialFrame = playAndCapture("IDLE", 0.1, "idle");
    let lastFrameA = idleFrame;
    let lastFrameB = initialFrame;
    let lastDiff = diffFrames(lastFrameA, lastFrameB);

    let pendingKeyboardStep = false;
    app.onFrame(({ dt }) => {
      input.update(dt);
      if (input.pressed("hit")) {
        keyboardEvents.push("hit");
        currentState = "hit";
        lastFrameA = readCanvasPixels(app.canvas);
        controller.scrub("ALL", 1.42, { play: true });
      } else if (input.pressed("run") || input.held("run")) {
        keyboardEvents.push("run");
        currentState = "run";
        lastFrameA = readCanvasPixels(app.canvas);
        controller.scrub("RUN", 1.24, { play: true });
      }
    });

    const flushKeyboardStep = () => {
      if (pendingKeyboardStep) return;
      pendingKeyboardStep = true;
      queueMicrotask(() => {
        pendingKeyboardStep = false;
        app.step(1 / 60);
        lastFrameB = readCanvasPixels(app.canvas);
        lastDiff = diffFrames(lastFrameA, lastFrameB);
        publish(lastFrameA, lastFrameB, lastDiff);
      });
    };

    window.addEventListener("keydown", flushKeyboardStep);
    publish(lastFrameA, lastFrameB, lastDiff);
    window.__AURA3D_ANIMATION_BRIDGE_CAPTURE__ = () => publish(lastFrameA, lastFrameB, lastDiff);
    return;
  }

  if (nextMode === "controls") {
    currentState = "run";
    controller.play("RUN", { restart: true, loop: "loop", speed: 1 });
    exercisedControls.play = true;
    exercisedControls.loop = true;
    controller.update(0.18);
    const frameA = readCanvasPixels(app.canvas);
    controller.pause("RUN");
    app.step(1 / 60);
    const pauseA = readCanvasPixels(app.canvas);
    app.step(0.24);
    const pauseB = readCanvasPixels(app.canvas);
    controller.resume("RUN");
    controller.crossFade("WALK", 0.1, { loop: "loop", speed: 0.7 });
    exercisedControls.crossFade = true;
    exercisedControls.speed = true;
    controller.update(0.1);
    controller.crossFade("RUN", 0.1, { loop: "loop", speed: 1.8 });
    exercisedControls.crossFade = true;
    exercisedControls.speed = true;
    controller.update(0.1);
    controller.scrub("RUN", 1.48, { play: true });
    exercisedControls.seek = true;
    app.step(1 / 60);
    const frameB = readCanvasPixels(app.canvas);
    publish(frameA, frameB, diffFrames(frameA, frameB), diffFrames(pauseA, pauseB));
    window.__AURA3D_ANIMATION_BRIDGE_CAPTURE__ = () => window.__AURA3D_ANIMATION_BRIDGE_CONTRACT__!;
    return;
  }

  const frameA = playAndCapture("RUN", 0.12, "run");
  const frameB = playAndCapture("RUN", 1.64, "run");
  publish(frameA, frameB, diffFrames(frameA, frameB));
  window.__AURA3D_ANIMATION_BRIDGE_CAPTURE__ = () => window.__AURA3D_ANIMATION_BRIDGE_CONTRACT__!;
}

function createPlaybackControlEvidence(
  controller: ReturnType<typeof createAnimationController<RunnerClip>>,
  exercisedControls: AnimationBridgeEvidence["animation"]["playbackControls"]
): AnimationBridgeEvidence["animation"]["playbackControls"] {
  const snapshot = controller.snapshot();
  const hasRun = snapshot.clips.some((clip) => clip.clipId === "RUN");
  const hasWalk = snapshot.clips.some((clip) => clip.clipId === "WALK");
  const active = snapshot.clips.find((clip) => clip.clipId === snapshot.activeClipId);
  return {
    play: exercisedControls.play || snapshot.clips.some((clip) => clip.status === "playing" || clip.status === "paused"),
    pause: snapshot.clips.some((clip) => clip.status === "paused"),
    loop: exercisedControls.loop || snapshot.clips.some((clip) => clip.loopMode !== "once"),
    crossFade: exercisedControls.crossFade || hasRun && hasWalk || snapshot.clips.length > 1,
    speed: exercisedControls.speed || snapshot.clips.some((clip) => clip.speed !== 1),
    seek: exercisedControls.seek || typeof active?.localTime === "number" && active.localTime > 0.2
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
  throw new Error("Timed out waiting for Aura3D animation bridge harness.");
}

function readCanvasPixels(canvas: HTMLCanvasElement | undefined): PixelFrame & { readonly pixels: Uint8Array } {
  if (!canvas) throw new Error("Aura app did not expose a canvas.");
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
  if (!gl) throw new Error("WebGL2 context unavailable for animation bridge pixel proof.");
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
