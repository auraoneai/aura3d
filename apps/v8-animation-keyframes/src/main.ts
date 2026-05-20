import { ASSET_URL, createInitialRuntime, publishRuntime, updateRuntime, type V8AnimationKeyframesRuntime, type V8KeyframeControls } from "./state.js";
import { createV8KeyframeScene, drawFallbackFrame } from "./scene.js";
import { renderKeyframeUi } from "./ui.js";
import { AnimationMotionQualityTracker } from "@galileo3d/animation";

void run();

async function run(): Promise<void> {
  const root = document.getElementById("app");
  const canvas = document.getElementById("viewport");
  if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error("v8-animation-keyframes requires #app and canvas#viewport.");
  }

  const startedAt = performance.now();
  let runtime = createInitialRuntime(startedAt);
  let controls = runtime.controls;
  let clipNames: readonly string[] = [];
  let frameCount = 0;
  let fps = 0;
  let fpsFrames = 0;
  let fpsLast = performance.now();
  let lastPublish = 0;
  let animationTime = 0;
  let lastNow = 0;
  let raf = 0;
  const motionTracker = new AnimationMotionQualityTracker({
    minimumSamples: 6,
    minimumTimeRangeSeconds: 0.12,
    minimumPoseDiversityScore: 0.01
  });

  const setControls = (next: V8KeyframeControls): void => {
    controls = next;
    runtime = updateRuntime(runtime, startedAt, { controls });
    renderKeyframeUi(root, { runtime, clips: clipNames, onControls: setControls });
  };
  const publish = (patch: Partial<V8AnimationKeyframesRuntime>): void => {
    runtime = updateRuntime(runtime, startedAt, patch);
    renderKeyframeUi(root, { runtime, clips: clipNames, onControls: setControls });
  };

  drawFallbackFrame(canvas);
  publishRuntime(runtime);
  renderKeyframeUi(root, { runtime, clips: clipNames, onControls: setControls });

  try {
    publish({ status: "loading", loadingStep: `creating G3D renderer and loading ${ASSET_URL}` });
    const scene = await createV8KeyframeScene(canvas);
    clipNames = scene.clips.map((clip) => clip.name);
    const preferred = scene.clips.find((clip) => clip.name === controls.clipName) ?? scene.clips.find((clip) => /dance|walk/i.test(clip.name)) ?? scene.clips[0];
    controls = { ...controls, clipName: preferred?.name ?? controls.clipName };
    publish({
      status: "ready",
      loadingStep: "asset loaded; first animation frame pending",
      clipName: controls.clipName,
      clipCount: scene.clips.length,
      duration: preferred?.duration ?? 1,
      controls
    });

    const render = (now: number): void => {
      try {
        if (lastNow === 0) lastNow = now;
        const clip = scene.clips.find((item) => item.name === controls.clipName) ?? scene.clips[0]!;
        const delta = Math.min(0.05, Math.max(0, (now - lastNow) / 1000));
        lastNow = now;
        if (controls.playing) {
          animationTime += delta * controls.speed;
          controls = { ...controls, scrub: clip.duration > 0 ? (animationTime % clip.duration) / clip.duration : 0 };
        } else {
          animationTime = controls.scrub * Math.max(clip.duration, 0.0001);
        }
        const frame = scene.render(controls, animationTime);
        const motion = motionTracker.record({
          timeSeconds: animationTime,
          tracksApplied: frame.apply.tracksApplied,
          skinningPalettesUpdated: frame.apply.skinningPalettesUpdated,
          animatedSubjects: 1
        });
        frameCount += 1;
        fpsFrames += 1;
        if (now - fpsLast >= 500) {
          fps = fpsFrames * 1000 / (now - fpsLast);
          fpsFrames = 0;
          fpsLast = now;
        }
        runtime = updateRuntime(runtime, startedAt, {
          status: frameCount === 1 ? "ready" : "running",
          loadingStep: frameCount === 1 ? "first G3D frame rendered" : "sampling keyframes and rendering",
          clipName: clip.name,
          clipCount: scene.clips.length,
          duration: clip.duration,
          animationTime: Number(frame.apply.time.toFixed(3)),
          frameCount,
          drawCalls: frame.drawCalls,
          fps,
          triangles: frame.triangles,
          tracksApplied: frame.apply.tracksApplied,
          skinningPalettesUpdated: frame.apply.skinningPalettesUpdated,
          motionSamples: motion.sampleCount,
          motionTimeRange: motion.timeRangeSeconds,
          poseDiversityScore: motion.poseDiversityScore,
          motionHealthy: motion.healthy,
          controls
        });
        if (frameCount === 1 || now - lastPublish > 250) {
          renderKeyframeUi(root, { runtime, clips: clipNames, onControls: setControls });
          lastPublish = now;
        }
        raf = requestAnimationFrame(render);
      } catch (error) {
        cancelAnimationFrame(raf);
        publish({ status: "error", loadingStep: "animation loop failed", error: formatError(error) });
      }
    };
    raf = requestAnimationFrame(render);
  } catch (error) {
    cancelAnimationFrame(raf);
    publish({
      status: "error",
      loadingStep: `failed before first imported frame while loading ${ASSET_URL}`,
      error: formatError(error)
    });
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}
