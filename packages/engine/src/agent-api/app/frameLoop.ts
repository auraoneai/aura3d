// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraLabelNode, AuraSceneSnapshot, AuraFrameInfo, AuraRuntimeNodeRegistry, AuraCreateAppOptions, WebGLRenderController } from "../nodes/types.js";
import { createParentFit } from "./parentFit.js";
import { bindLazyFrameDiagnostics, rethrowShaderFailure, type MutableDiagnostics } from "../diagnostics.js";
import { AuraRuntimeError } from "./errors.js";
import { DeferredFrameResources, getRootPerformanceBaseSize, getRootPerformanceQuality, hasRootRenderableContent, resolveRootRenderTime, setRootPerformanceQuality } from "../RootRuntimeSupport.js";
import { animation } from "../nodes/animation.js";
import { camera } from "../nodes/camera.js";
import { collectAuraSceneEvidence } from "../sceneEvidence.js";
import { collectLabelTelemetry, summarizeTextBuckets } from "../LabelTelemetry.js";
import { createProductionSceneRenderer } from "./mountRenderer.js";
import { applyRenderPathToCanvas, directPathVetoReasons, resolveAppRenderPath, takeDecodedDirectPathBlockers, wantsPreservedDrawingBuffer } from "./renderPath.js";
import { appTierMaxPixelRatio, currentDevicePixelRatio, minimumBackingSize, resolveAppPixelRatio } from "./pixelRatio.js";
import { resolveMountQuality } from "../compiler/renderer.js";
import { devicePixelRatioSafe, markTiming, performanceNow } from "../platform.js";
import { groups } from "../nodes/groups.js";
import { declaresWebGLContent, productionRenderErrorMessage } from "../compiler/observations.js";
import { labels } from "../nodes/labels.js";
import { normalizeCreateAppRendererOptions } from "./rendererOptions.js";
import { qrFlagsWithAnimationMixer, resolveQrFlags } from "../../contracts/flags.js";
import type { QrFlags } from "@aura3d/rendering/contracts";
import { renderer } from "../rendererDiagnostics.js";
import { resolveCameraFrame } from "../compiler/camera.js";
import { updateRouteDiagnostics } from "./routeState.js";
import { text3D } from "../nodes/text3d.js";
import { timeline } from "../nodes/timeline.js";
import { worldLabelsFromSnapshot, createSceneLabelLayer, createSceneLabelOcclusionTest } from "../compiler/labels.js";
import { round } from "../GameRuntime.js";
import { authoredBackingResize } from "./canvas.js";

export async function startProductionRender(
  canvas: HTMLCanvasElement,
  snapshot: AuraSceneSnapshot,
  diagnosticsState: MutableDiagnostics,
  options: AuraCreateAppOptions,
  overlay?: { update(): void },
  beforeRender?: (dt: number, source: AuraFrameInfo["source"]) => void,
  isPaused: () => boolean = () => false,
  runtimeNodes?: AuraRuntimeNodeRegistry,
  /**
   * Extra reason to keep rendering, beyond what the scene declares.
   *
   * See {@link shouldContinuouslyRender}: scene-declared motion cannot know about a
   * simulation or a frame callback the route drives itself.
   */
  requiresFrames: () => boolean = () => false,
  /**
   * Render clock to use while paused, in milliseconds.
   *
   * Supplied by the app so a paused scene renders at its own simulated time rather than at
   * wall-clock time. Without it, `pause()` froze the simulation but not time-driven rendering.
   */
  pausedRenderTime: () => number = () => 0,
  /** T0-28: the app's flags, resolved once in `createAuraApp`; absent → resolved here (legacy callers). */
  appQrFlags?: QrFlags,
  /** True when a newer `setScene()` or `dispose()` superseded this mount while awaiting asset/renderer setup. */
  isCancelled: () => boolean = () => false
): Promise<WebGLRenderController> {
  // Use the same ownership rule as initial mount and setScene. A compatibility
  // source continues supplying arena/fighter geometry when public nodes are
  // temporarily absent (for example the crowd-hidden negative control).
  if (!hasRootRenderableContent(canvas, declaresWebGLContent(snapshot.nodes))) {
    throw new AuraRuntimeError(
      "missing-asset",
      "Aura3D production rendering requires at least one typed model asset or primitive. Suggested fix: add model(assets.product), primitives.box(), primitives.sphere(), primitives.cylinder(), or primitives.plane()."
      );
  }

  const qrFlags = appQrFlags ?? qrFlagsWithAnimationMixer(
    resolveQrFlags({
      options: options.qualityRebuild?.flags,
      // Same C-38 source chain as createAuraApp: URL `?a3d-qr=` applies unless
      // the app opted out — otherwise a re-mount resolved flag-off and the
      // compiled-scene gate silently diverged from the flags the app started
      // with (e.g. `?a3d-qr=compiler` dead after any scene swap).
      url: options.qualityRebuild?.allowUrlFlags === false
        ? undefined
        : typeof location !== "undefined" ? location.href : undefined
    }),
    options.animation?.mixer
  );
  // beat-three.js L-P1: decided per mount (setScene re-mounts re-decide). `direct` pins the
  // HDR-target route off for this renderer only; the app's own flags are untouched.
  // RP-01/RP-03: reasons found after an earlier mount on this canvas (a custom post pass) keep it off the direct path.
  let renderPath = resolveAppRenderPath(snapshot, options, qrFlags, { extraBlockers: directPathVetoReasons(canvas) });
  diagnosticsState.renderPath = renderPath.report;
  pushWarnings(diagnosticsState, renderPath.warnings);
  applyRenderPathToCanvas(canvas, renderPath);
  const mountRenderer = () => createProductionSceneRenderer(
    canvas,
    snapshot,
    options.renderer,
    runtimeNodes,
    renderPath.flags,
    { strict: options.strict, onDegradation: options.onDegradation },
    { preserveDrawingBuffer: wantsPreservedDrawingBuffer(options) }
  );
  let renderer = await mountRenderer();
  /*
   * RP-01: the direct-path decision reads the authored snapshot, which cannot show a GLB's own BLEND or transmission materials.
   * The mount records them once the GLBs are decoded; if there are any, mount again on the HDR target before the first frame,
   * so the blended or refracted surfaces are composited in linear space as on the HDR path.
   */
  const decoded = renderPath.direct && !isCancelled() ? takeDecodedDirectPathBlockers(canvas) : [];
  if (decoded.length > 0) {
    renderer.dispose();
    renderPath = resolveAppRenderPath(snapshot, options, qrFlags, { extraBlockers: [...directPathVetoReasons(canvas), ...decoded] });
    diagnosticsState.renderPath = renderPath.report;
    pushWarnings(diagnosticsState, [`DIRECT_PATH_REDECIDED: ${decoded.join("; ")}; mounted on the HDR target instead of the direct path.`]);
    applyRenderPathToCanvas(canvas, renderPath);
    renderer = await mountRenderer();
  }
  if (isCancelled()) {
    renderer.dispose();
    return {
      update() { /* cancelled mount */ },
      render() { /* cancelled mount */ },
      setPerformanceQuality() { /* cancelled mount */ },
      diagnostics: () => undefined,
      renderAsync: () => Promise.resolve(),
      busy: () => false,
      whenIdle: () => Promise.resolve(),
      resetTemporalHistory() { /* cancelled mount */ },
      pause() { /* cancelled mount */ },
      resume() { /* cancelled mount */ },
      dispose() { /* already disposed */ }
    };
  }
  diagnosticsState.renderer = renderer.diagnostics;
  const sceneWantsFrames = shouldContinuouslyRender(snapshot);
  const labelLayer = createSceneLabelLayer(canvas, snapshot);
  const rendererSelection = normalizeCreateAppRendererOptions(options.renderer);
  // PRD-01 §6.9 (Q-15-1): same resolver as createAuraApp; under A3D_QR_CORE it
  // is re-evaluated on every resize (devicePixelRatio can change) with a 1×1 minimum.
  const coreDpr = qrFlags.on("A3D_QR_CORE");
  const backingMinimum = minimumBackingSize(coreDpr);
  const tierMaxPixelRatio = appTierMaxPixelRatio(resolveMountQuality(options.renderer).tier);
  const resolvePixelRatio = (): number => resolveAppPixelRatio({
    flagOn: coreDpr,
    option: options.pixelRatio,
    profilePixelRatio: rendererSelection.profile.pixelRatio,
    maxPixelRatio: tierMaxPixelRatio,
    devicePixelRatio: currentDevicePixelRatio(),
    legacyDevicePixelRatio: devicePixelRatioSafe
  });
  const legacyPixelRatio = coreDpr ? 0 : resolvePixelRatio();
  let disposed = false;
  let animationHandle = 0;
  let lastTime = 0;
  // ENG-FPS: measured over the presented rAF frames of the last second, not a 60 placeholder.
  const frameRate = createFrameRateMeter();
  let pendingFrames = 0;
  let frameTail: Promise<void> = Promise.resolve();
  const lazyFrameDiagnostics = bindLazyFrameDiagnostics(diagnosticsState, {
    renderer: () => renderer.diagnostics,
    evidence: () => collectAuraSceneEvidence(snapshot),
    busy: () => pendingFrames > 0
  });
  const baseBackingSize = getRootPerformanceBaseSize(canvas);
  let syncedWidth = canvas.width;
  let syncedHeight = canvas.height;
  let resourcesReleased = false;
  const releaseResources = (): void => {
    if (resourcesReleased) return;
    resourcesReleased = true;
    lazyFrameDiagnostics.freeze();
    labelLayer?.dispose();
    renderer.dispose();
  };
  const parentFit = createParentFit(canvas);
  const resizeRenderer = (): void => {
    if (disposed) return;
    if (pendingFrames > 0) { resourceOwner.requestResize(); return; }
    if (options.resize === false) return;
    const { cssWidth, cssHeight } = parentFit.measure(
      (typeof window !== "undefined" ? window.innerWidth : 960) || 960,
      (typeof window !== "undefined" ? window.innerHeight : 540) || 540
    );
    const pixelRatio = coreDpr ? resolvePixelRatio() : legacyPixelRatio;
    const width = Math.max(1, Math.round(Math.max(backingMinimum.width, cssWidth * pixelRatio) * (getRootPerformanceQuality(canvas)?.resolutionScale ?? 1)));
    const height = Math.max(1, Math.round(Math.max(backingMinimum.height, cssHeight * pixelRatio) * (getRootPerformanceQuality(canvas)?.resolutionScale ?? 1)));
    if (canvas.width === width && canvas.height === height) return;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    canvas.width = width;
    canvas.height = height;
    renderer.resize?.(width, height);
    syncedWidth = width; syncedHeight = height;
    // A parent whose size follows the canvas (auto-height body with a HUD beside it) would grow the canvas on every resize.
    if (parentFit.settle()) resizeRenderer();
  };
  const resourceOwner = new DeferredFrameResources(releaseResources, resizeRenderer);
  const resizeObserver = options.resize !== false && typeof ResizeObserver !== "undefined" && canvas.parentElement
    ? new ResizeObserver(resizeRenderer)
    : undefined;
  resizeObserver?.observe(canvas.parentElement!);
  if (options.resize !== false && typeof window !== "undefined") window.addEventListener("resize", resizeRenderer);

  let firstFrameEndMarked = false;
  const renderFrame = (time = performanceNow(), submittedDrawCalls?: number, explicit = false) => {
    if (disposed) return;
    // T0-12: first real frame — closes the mount-timing window the bench
    // harness reads from payload.extra.mountTiming.
    if (lastTime === 0) markTiming("a3d:mount:first-renderFrame");
    const delta = lastTime > 0 ? Math.max(1, time - lastTime) : 16.67;
    lastTime = time;
    // Explicit renders (`app.step()` loops, which most games drive themselves) are sampled on the wall clock, since `time` is then
    // simulated time; the meter counts one frame per task, so several steps inside one rAF callback count once.
    frameRate.sample(explicit ? performanceNow() : time);
    if (!explicit && !isPaused()) beforeRender?.(delta / 1000, "raf");
    /*
     * A paused app must not keep advancing time-driven rendering.
     *
     * `isPaused()` gated the simulation callback but not the render clock, so `pause()` stopped
     * gameplay while particle emitters, animated materials and anything else keyed to elapsed time
     * carried on. Measured on the particle lab: with the app paused *and* settled to a fixed frame,
     * two screenshots taken 500 ms apart in the **same page load** still differed across 20.6% of the
     * vortex region. The frame was never actually held, so no capture of it could be reproducible.
     *
     * While paused, render is pinned to the time of the last simulated frame. `app.step()` advances
     * `runtimeTime` and renders explicitly, so stepping still produces new frames — what stops is
     * time passing on its own.
     */
    const renderTime = resolveRootRenderTime(time, explicit, isPaused, pausedRenderTime);
    // The authored-size check allocates its `synced` argument; nothing to do (and nothing to allocate) while the canvas still matches.
    if (submittedDrawCalls === undefined && (canvas.width !== syncedWidth || canvas.height !== syncedHeight)) {
      const authored = authoredBackingResize(options.resize !== false, canvas, { width: syncedWidth, height: syncedHeight });
      if (authored) {
        renderer.resize?.(authored.width, authored.height);
        syncedWidth = authored.width; syncedHeight = authored.height;
      }
    }
    let drawCalls: number;
    try {
      drawCalls = submittedDrawCalls ?? renderer.render(renderTime);
    } catch (error) {
      rethrowShaderFailure(error);
    }
    diagnosticsState.backend = renderer.backend;
    diagnosticsState.fps = frameRate.fps();
    diagnosticsState.drawCalls = drawCalls;
    // Same size as last frame: keep the existing tuple instead of allocating a new one every frame.
    const previousSize = diagnosticsState.renderSize;
    if (previousSize === undefined || previousSize[0] !== canvas.width || previousSize[1] !== canvas.height) {
      diagnosticsState.renderSize = [canvas.width, canvas.height];
    }
    // Recomputed on first read, not per frame (see bindLazyFrameDiagnostics).
    lazyFrameDiagnostics.invalidate();
    updateRouteDiagnostics(diagnosticsState);
    if (labelLayer) {
      // Reproject every frame against the renderer's own camera so labels track
      // their anchors while the camera moves.
      labelLayer.setLabels(worldLabelsFromSnapshot(snapshot, runtimeNodes));
      /*
       * WS-2.7 — rebuilt per frame, because both the camera and any runtime-driven node can move. The
       * cost is one bounding box per renderable node, which is negligible beside the render itself, and
       * caching it would silently stop occluding as soon as anything moved.
       */
      labelLayer.setOcclusionTest(createSceneLabelOcclusionTest(
        snapshot,
        resolveCameraFrame(snapshot, snapshot.camera, renderTime, runtimeNodes).eye,
        runtimeNodes
      ));
      labelLayer.update(renderer.viewProjection(renderTime));
      diagnosticsState.labels = labelLayer.snapshot();
      const labelNodes = groups.flatten(snapshot.nodes).filter((node): node is AuraLabelNode => node.kind === "label");
      diagnosticsState.labelTelemetry = collectLabelTelemetry(labelNodes, diagnosticsState.labels);
      diagnosticsState.textBuckets = summarizeTextBuckets({
        accessibleDom: labelNodes.filter((node) => node.label === "hud").length,
        worldAnchoredPlaced: diagnosticsState.labels.filter((label) => label.visible).length,
        sdfTexts: groups.flatten(snapshot.nodes).filter((node) =>
          node.kind === "primitive" && node.text3D?.backend === "sdf").length
      });
    }
    overlay?.update();
    if (lastTime !== 0 && !firstFrameEndMarked) { firstFrameEndMarked = true; markTiming("a3d:mount:first-renderFrame:end"); }
    if (!explicit && !isPaused() && (sceneWantsFrames || requiresFrames()) && options.autoStart !== false && typeof requestAnimationFrame !== "undefined") {
      animationHandle = requestAnimationFrame(scheduleFrame);
    }
  };

  const submitAsync = (clock: () => number, automatic = false): Promise<void> => {
    if (disposed) return Promise.reject(new Error("Aura3D renderer is disposed."));
    if (!renderer.renderAsync) return Promise.reject(new Error("Aura3D asynchronous submission requires the production renderer."));
    pendingFrames += 1;
    const submitted = resourceOwner.run(() => frameTail.then(async () => {
      if (disposed) throw new Error("Aura3D renderer is disposed.");
      const time = clock();
      if (automatic) {
        const delta = lastTime > 0 ? Math.max(1, time - lastTime) : 16.67;
        lastTime = time;
        if (!isPaused()) beforeRender?.(delta / 1000, "raf");
      }
      // User frame callbacks can dispose the app. Do not submit a new frame after
      // that callback; pending ownership still defers cleanup until this settles.
      if (disposed) throw new Error("Aura3D renderer is disposed.");
      const renderTime = resolveRootRenderTime(time, !automatic, isPaused, pausedRenderTime);
      const drawCalls = await renderer.renderAsync!(renderTime);
      if (!disposed) {
        const previousLastTime = lastTime;
        renderFrame(renderTime, drawCalls, true);
        lastTime = previousLastTime;
      }
    }).finally(() => { pendingFrames -= 1; }));
    frameTail = submitted.catch(() => undefined);
    return submitted;
  };
  const scheduleFrame = (time: number): void => {
    animationHandle = 0;
    if (disposed) return;
    if (options.frameMode === "async") {
      void submitAsync(() => time, true).then(() => {
        if (!disposed && !isPaused() && (sceneWantsFrames || requiresFrames()) && options.autoStart !== false && typeof requestAnimationFrame !== "undefined") {
          animationHandle = requestAnimationFrame(scheduleFrame);
        }
      }).catch((error: unknown) => {
        diagnosticsState.errors.push(productionRenderErrorMessage(error));
        overlay?.update();
      });
    } else if (pendingFrames > 0) {
      // A manual async frame owns the resources. Retry without advancing simulation.
      // A pause cancels automatic retries; the explicit owner completes independently.
      if (!isPaused()) animationHandle = requestAnimationFrame(scheduleFrame);
    } else renderFrame(time);
  };
  try {
    if (options.frameMode === "async") {
      await submitAsync(() => performanceNow(), true);
      if (!isPaused() && (sceneWantsFrames || requiresFrames()) && options.autoStart !== false && typeof requestAnimationFrame !== "undefined") {
        animationHandle = requestAnimationFrame(scheduleFrame);
      }
    } else renderFrame();
  } catch (error) {
    // A failed first submission has no returned controller to dispose its resources.
    disposed = true;
    resizeObserver?.disconnect();
    if (typeof window !== "undefined") window.removeEventListener("resize", resizeRenderer);
    releaseResources();
    throw error;
  }

  return {
    update(time) {
      if (disposed) throw new Error("Aura3D renderer is disposed.");
      if (pendingFrames > 0) throw new Error("Aura3D async frame is pending; await it before advancing renderer state.");
      renderer.update?.(time);
    },
    render(time = performanceNow()) {
      /*
       * Preserve `lastTime` across an explicit render.
       *
       * `renderFrame` records `lastTime` to derive its own delta and to drive `beforeRender`. When
       * `app.step()` renders at *simulated* time for reproducibility, leaving `lastTime` on the
       * simulated clock means the first live frame after `resume()` computes its delta against a
       * different clock — a visible jump. Same defect the canvas2d path had; fixed identically so
       * the two render paths cannot disagree about what `step` does.
       */
      if (pendingFrames > 0) throw new Error("Aura3D async frame is pending; await it before synchronous rendering.");
      const previousLastTime = lastTime;
      renderFrame(time, undefined, true);
      lastTime = previousLastTime;
    },
    setPerformanceQuality(settings) {
      if (disposed || pendingFrames > 0) throw new Error("PERFORMANCE_QUALITY_BUSY: await the active frame before changing quality.");
      setRootPerformanceQuality(canvas, settings);
      if (options.resize !== false) resizeRenderer();
      else {
        const width = Math.max(1, Math.round(baseBackingSize.width * settings.resolutionScale));
        const height = Math.max(1, Math.round(baseBackingSize.height * settings.resolutionScale));
        canvas.width = width; canvas.height = height;
        renderer.resize?.(width, height);
        syncedWidth = width; syncedHeight = height;
      }
      renderer.resetTemporalHistory?.("performance-quality");
    },
    diagnostics: () => disposed || pendingFrames > 0 ? undefined : renderer.diagnostics,
    renderAsync: (clock) => submitAsync(clock),
    busy: () => pendingFrames > 0,
    whenIdle: () => frameTail,
    resetTemporalHistory(reason) {
      // Reset after the active submission, before the next one can consume history.
      if (pendingFrames > 0) frameTail = frameTail.then(() => { if (!disposed) renderer.resetTemporalHistory?.(reason); });
      else renderer.resetTemporalHistory?.(reason);
    },
    pause() {
      if (animationHandle && typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(animationHandle);
      animationHandle = 0;
    },
    resume() {
      if (disposed || animationHandle || options.autoStart === false || typeof requestAnimationFrame === "undefined") return;
      if (sceneWantsFrames || requiresFrames()) animationHandle = requestAnimationFrame(scheduleFrame);
    },
    // threejs-parity L7/SR-07: forward the backing renderer's program warm-up.
    precompile: renderer.precompile ? (time?: number) => renderer.precompile!(time) : undefined,
    // WS-2.6 — forward device-loss subscription from whichever renderer backs this controller.
    onDeviceLost: renderer.onDeviceLost ? (listener: () => void) => renderer.onDeviceLost!(listener) : undefined,
    onDeviceRestored: renderer.onDeviceRestored ? (listener: () => void) => renderer.onDeviceRestored!(listener) : undefined,
    deviceLost: renderer.deviceLost ? () => renderer.deviceLost!() : undefined,
    // PRD-01 C-05 seam (Q-15-1): createAuraApp hangs this on
    // app[Symbol.for("a3d.prd01.renderer")] so app.setOutput / setOutputOverlay
    // reach the live lane Renderer. Without it setOutput only queued (#1083 GPU:
    // tone mapping + exposure never applied).
    get auraRenderer() { return renderer.auraRenderer; },
    dispose() {
      disposed = true;
      if (animationHandle && typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(animationHandle);
      resizeObserver?.disconnect();
      if (typeof window !== "undefined") window.removeEventListener("resize", resizeRenderer);
      resourceOwner.dispose();
    }
  };
}

function pushWarnings(state: MutableDiagnostics, warnings: readonly string[]): void {
  for (const warning of warnings) if (!state.warnings.includes(warning)) state.warnings.push(warning);
}

export interface FrameRateMeter {
  /** Record one presented frame at `time` (ms, the rAF timestamp). */
  sample(time: number): void;
  /** Frames per second over the window, to 0.1; 0 until two frames were sampled. */
  fps(): number;
}

/**
 * ENG-FPS: frame rate averaged over the presented frames of the last `windowMs` (default 1 s). `diagnostics().fps` used to be the constant
 * 60 on the WebGL path (`fps || 60`) and `1000 / delta` of the single last frame on the canvas path, so it read 60 while a
 * measured rAF loop ran at 0.4-0.85 fps. The window keeps the newest frame older than `windowMs` as well, so a loop slower than
 * one frame per window still reports its real rate (two frames 2.5 s apart: 0.4).
 */
export function createFrameRateMeter(windowMs = 1000): FrameRateMeter {
  const times: number[] = [];
  // A canvas is presented once per task, so renders issued in the same task (a loop of `app.step()` calls) are one frame.
  let sampledThisTask = false;
  return {
    sample(time) {
      if (!Number.isFinite(time) || sampledThisTask) return;
      if (times.length > 0 && time <= times[times.length - 1]!) return;
      sampledThisTask = true;
      queueMicrotask(() => { sampledThisTask = false; });
      times.push(time);
      // Drop frames older than the window, keeping one before it so the span always covers at least one interval.
      while (times.length > 2 && time - times[1]! >= windowMs) times.shift();
    },
    fps() {
      if (times.length < 2) return 0;
      const span = times[times.length - 1]! - times[0]!;
      return span > 0 ? Math.round(((times.length - 1) * 1000 / span) * 10) / 10 : 0;
    }
  };
}

/**
 * Whether the *scene* declares something that changes over time.
 *
 * Deliberately conservative: a fully static scene should render once and stop rather than
 * burn a core redrawing an identical frame.
 *
 * It is not sufficient on its own, and that was a real defect. This predicate can only see
 * what the scene *declares* — a looping timeline, a moving camera, an animated or mutable
 * node. It cannot see a physics simulation or a frame callback the route drives itself. So
 * an app whose only motion came from `app.physics.step()` inside `app.onFrame()` rendered
 * exactly **one** frame and froze: measured `frames: 1` with no console error, in a
 * clean-room project where every crate should have been falling. Callers therefore combine
 * this with their own `requiresFrames()`.
 */
function shouldContinuouslyRender(snapshot: AuraSceneSnapshot): boolean {
  if (snapshot.timeline?.mode === "loop") return true;
  if (snapshot.camera.mode === "dolly" || snapshot.camera.mode === "follow" || snapshot.camera.mode === "path" || snapshot.camera.mode === "flythrough") return true;
  return snapshot.nodes.some((node) => {
    if ("runtime" in node && node.runtime?.mutable !== false) return true;
    if ((node.kind === "model" || node.kind === "primitive") && node.animation) return true;
    if (node.kind !== "effect") return false;
    return node.effect === "particles" || node.effect === "rain";
  });
}
