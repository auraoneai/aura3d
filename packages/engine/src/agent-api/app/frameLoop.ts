// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraLabelNode, AuraSceneSnapshot, AuraFrameInfo, AuraRuntimeNodeRegistry, AuraCreateAppOptions, WebGLRenderController } from "../nodes/types.js";
import type { MutableDiagnostics } from "../diagnostics.js";
import { AuraRuntimeError } from "./errors.js";
import { DeferredFrameResources, getRootPerformanceBaseSize, getRootPerformanceQuality, hasRootRenderableContent, resolveRootRenderTime, setRootPerformanceQuality } from "../RootRuntimeSupport.js";
import { animation } from "../nodes/animation.js";
import { camera } from "../nodes/camera.js";
import { collectAuraSceneEvidence } from "../sceneEvidence.js";
import { collectLabelTelemetry, summarizeTextBuckets } from "../LabelTelemetry.js";
import { createProductionSceneRenderer } from "./mountRenderer.js";
import { devicePixelRatioSafe, performanceNow } from "../platform.js";
import { groups } from "../nodes/groups.js";
import { isWebGLRenderableNode, productionRenderErrorMessage } from "../compiler/observations.js";
import { labels } from "../nodes/labels.js";
import { normalizeCreateAppRendererOptions } from "./rendererOptions.js";
import { renderer } from "../rendererDiagnostics.js";
import { resolveCameraFrame } from "../compiler/camera.js";
import { text3D } from "../nodes/text3d.js";
import { timeline } from "../nodes/timeline.js";
import { worldLabelsFromSnapshot, createSceneLabelLayer, createSceneLabelOcclusionTest } from "../compiler/labels.js";
import { round } from "../GameRuntime.js";

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
  pausedRenderTime: () => number = () => 0
): Promise<WebGLRenderController> {
  // Use the same ownership rule as initial mount and setScene. A compatibility
  // source continues supplying arena/fighter geometry when public nodes are
  // temporarily absent (for example the crowd-hidden negative control).
  if (!hasRootRenderableContent(canvas, snapshot.nodes.some(isWebGLRenderableNode))) {
    throw new AuraRuntimeError(
      "missing-asset",
      "Aura3D production rendering requires at least one typed model asset or primitive. Suggested fix: add model(assets.product), primitives.box(), primitives.sphere(), primitives.cylinder(), or primitives.plane()."
      );
  }

  const renderer = await createProductionSceneRenderer(canvas, snapshot, options.renderer, runtimeNodes);
  diagnosticsState.renderer = renderer.diagnostics;
  const sceneWantsFrames = shouldContinuouslyRender(snapshot);
  const labelLayer = createSceneLabelLayer(canvas, snapshot);
  const rendererSelection = normalizeCreateAppRendererOptions(options.renderer);
  const pixelRatio = (typeof options.pixelRatio === "number" ? options.pixelRatio : options.pixelRatio?.max ?? undefined) ?? rendererSelection.profile.pixelRatio ?? devicePixelRatioSafe();
  let disposed = false;
  let animationHandle = 0;
  let lastTime = 0;
  let pendingFrames = 0;
  let frameTail: Promise<void> = Promise.resolve();
  const baseBackingSize = getRootPerformanceBaseSize(canvas);
  let resourcesReleased = false;
  const releaseResources = (): void => {
    if (resourcesReleased) return;
    resourcesReleased = true;
    labelLayer?.dispose();
    renderer.dispose();
  };
  const resizeRenderer = (): void => {
    if (disposed) return;
    if (pendingFrames > 0) { resourceOwner.requestResize(); return; }
    if (options.resize === false) return;
    const parentRect = canvas.parentElement?.getBoundingClientRect();
    const cssWidth = parentRect?.width || canvas.clientWidth || (typeof window !== "undefined" ? window.innerWidth : 960) || 960;
    const cssHeight = parentRect?.height || canvas.clientHeight || (typeof window !== "undefined" ? window.innerHeight : 540) || 540;
    const width = Math.max(1, Math.round(Math.max(320, cssWidth * pixelRatio) * (getRootPerformanceQuality(canvas)?.resolutionScale ?? 1)));
    const height = Math.max(1, Math.round(Math.max(220, cssHeight * pixelRatio) * (getRootPerformanceQuality(canvas)?.resolutionScale ?? 1)));
    if (canvas.width === width && canvas.height === height) return;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    canvas.width = width;
    canvas.height = height;
    renderer.resize?.(width, height);
  };
  const resourceOwner = new DeferredFrameResources(releaseResources, resizeRenderer);
  const resizeObserver = options.resize !== false && typeof ResizeObserver !== "undefined" && canvas.parentElement
    ? new ResizeObserver(resizeRenderer)
    : undefined;
  resizeObserver?.observe(canvas.parentElement!);
  if (options.resize !== false && typeof window !== "undefined") window.addEventListener("resize", resizeRenderer);

  const renderFrame = (time = performanceNow(), submittedDrawCalls?: number, explicit = false) => {
    if (disposed) return;
    const delta = lastTime > 0 ? Math.max(1, time - lastTime) : 16.67;
    lastTime = time;
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
    const drawCalls = submittedDrawCalls ?? renderer.render(renderTime);
    diagnosticsState.backend = renderer.backend;
    diagnosticsState.fps = diagnosticsState.fps || 60;
    diagnosticsState.drawCalls = drawCalls;
    diagnosticsState.renderSize = [canvas.width, canvas.height];
    diagnosticsState.evidence = collectAuraSceneEvidence(snapshot);
    diagnosticsState.renderer = renderer.diagnostics;
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
    // WS-2.6 — forward device-loss subscription from whichever renderer backs this controller.
    onDeviceLost: renderer.onDeviceLost ? (listener: () => void) => renderer.onDeviceLost!(listener) : undefined,
    onDeviceRestored: renderer.onDeviceRestored ? (listener: () => void) => renderer.onDeviceRestored!(listener) : undefined,
    deviceLost: renderer.deviceLost ? () => renderer.deviceLost!() : undefined,
    dispose() {
      disposed = true;
      if (animationHandle && typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(animationHandle);
      resizeObserver?.disconnect();
      if (typeof window !== "undefined") window.removeEventListener("resize", resizeRenderer);
      resourceOwner.dispose();
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
