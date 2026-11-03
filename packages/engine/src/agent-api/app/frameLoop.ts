// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraLabelNode, AuraSceneSnapshot, AuraFrameInfo, AuraRuntimeNodeRegistry, AuraCreateAppOptions, WebGLRenderController } from "../nodes/types.js";
import { createParentFit } from "./parentFit.js";
import { bindLazyFrameDiagnostics, deviceFrameCounters, rethrowShaderFailure, type MutableDiagnostics } from "../diagnostics.js";
import { AuraRuntimeError } from "./errors.js";
import { DeferredFrameResources, getRootPerformanceBaseSize, getRootPerformanceQuality, getRootRenderSource, hasRootRenderableContent, resolveRootRenderTime, setRootPerformanceQuality } from "../RootRuntimeSupport.js";
import { collectAuraSceneEvidence } from "../sceneEvidence.js";
import { collectLabelTelemetry, summarizeTextBuckets } from "../LabelTelemetry.js";
import { createProductionSceneRenderer } from "./mountRenderer.js";
import { applyRenderPathToCanvas, directPathVetoReasons, resolveAppRenderPath, takeDecodedDirectPathBlockers, wantsPreservedDrawingBuffer } from "./renderPath.js";
import { appTierMaxPixelRatio, currentDevicePixelRatio, minimumBackingSize, resolveAppPixelRatio } from "./pixelRatio.js";
import { resolveMountQuality } from "../compiler/renderer.js";
import { devicePixelRatioSafe, markTiming, performanceNow } from "../platform.js";
import { groups } from "../nodes/groups.js";
import { declaresWebGLContent, productionRenderErrorMessage } from "../compiler/observations.js";
import { normalizeCreateAppRendererOptions } from "./rendererOptions.js";
import { qrFlagsWithAnimationMixer, resolveQrFlags } from "../../contracts/flags.js";
import { snapshotAuraAssetsOption } from "../../contracts/assets.js";
import type { QrFlags } from "@aura3d/rendering/contracts";
import { resolveCameraFrame } from "../compiler/camera.js";
import { updateRouteDiagnostics } from "./routeState.js";
import { worldLabelsFromSnapshot, createSceneLabelLayer, createSceneLabelOcclusionTest } from "../compiler/labels.js";
import { authoredBackingResize, canvasContentBox, noteEngineCanvasSize, ownSizedCanvasAxes, refreshOwnSizedAxes } from "./canvas.js";
import { setAdvancedLightingInvalidator } from "./advancedLightingState.js";
import type { Prd07MountAuthority } from "../vfx/bridge.js";
import { isPrd07DeviceLeaseBusy } from "@aura3d/rendering";
import { RenderDeviceError } from "@aura3d/rendering";

function frameSetupCleanupFailure(error: unknown, failures: readonly unknown[]): RenderDeviceError {
  const failure = new RenderDeviceError(
    "WEBGPU_OWNERSHIP_CLEANUP_FAILED: Renderer mount failed and WebGPU cleanup could not be confirmed",
    "WEBGPU_OWNERSHIP_CLEANUP_FAILED"
  );
  failure.cause = new AggregateError([error, ...failures], "Renderer mount and cleanup failed", { cause: error });
  return failure;
}

/** App-owned hooks; internal direct frame-loop callers may omit them. */
interface Prd07AppMountHooks {
  readonly getPrd07MountAuthority?: () => Prd07MountAuthority | null | undefined;
  readonly subscribePrd07Atmosphere?: (listener: () => void) => () => void;
}

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
  isCancelled: () => boolean = () => false,
  /** Mount lifecycle milestones; only a real, still-owned GPU submission is a first frame. */
  readiness?: {
    onRendererReady(backend: "webgl2" | "webgpu", controller: WebGLRenderController): void;
    onFirstFrame(backend: "webgl2" | "webgpu"): void;
    onFirstFrameFailed?(error: unknown): void;
    /** Reports a genuine current-mount frame failure even after a blank first frame. */
    onTerminalFrameFailure?(error: unknown): void;
    /** Reports loss observed by a frame before a device event has arrived. */
    onDeviceLossDetected?(): void;
  },
  mountSignal?: AbortSignal,
  /** Unique app owner; legacy direct callers default to the canvas. */
  runtimeOwner?: object,
  prd07?: Prd07AppMountHooks
): Promise<WebGLRenderController> {
  const assetOptions = snapshotAuraAssetsOption(options.assets);
  // Use the same ownership rule as initial mount and setScene. A compatibility
  // source continues supplying arena/fighter geometry when public nodes are
  // temporarily absent (for example the crowd-hidden negative control).
  if (!hasRootRenderableContent(canvas, declaresWebGLContent(snapshot.nodes), runtimeOwner ?? canvas)) {
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
    {
      preserveDrawingBuffer: wantsPreservedDrawingBuffer(options),
      ...(options.output !== undefined || options.renderer?.output !== undefined
        ? { output: { ...options.renderer?.output, ...options.output } }
        : {})
    },
    {
      runtimeOwner,
      request: {
        ...(assetOptions?.securityContext === undefined ? {} : { securityContext: assetOptions.securityContext }),
        signal: mountSignal
      },
      assetOptions,
      formatRegistry: options.formatRegistry,
      ...(prd07?.getPrd07MountAuthority ? { getPrd07MountAuthority: prd07.getPrd07MountAuthority } : {})
    }
  );
  let renderer = await mountRenderer();
  let rawRetirement: "not-started" | "pending" | "done" = "not-started";
  let controllerOwnsCleanup = false;
  try {
  /*
   * RP-01: the direct-path decision reads the authored snapshot, which cannot show a GLB's own BLEND or transmission materials.
   * The mount records them once the GLBs are decoded; if there are any, mount again on the HDR target before the first frame,
   * so the blended or refracted surfaces are composited in linear space as on the HDR path.
   */
  const decoded = renderPath.direct && !isCancelled() ? takeDecodedDirectPathBlockers(canvas) : [];
  if (decoded.length > 0) {
    rawRetirement = "pending";
    renderer.dispose();
    await renderer.whenDisposed?.();
    rawRetirement = "done";
    renderPath = resolveAppRenderPath(snapshot, options, qrFlags, { extraBlockers: [...directPathVetoReasons(canvas), ...decoded] });
    diagnosticsState.renderPath = renderPath.report;
    pushWarnings(diagnosticsState, [`DIRECT_PATH_REDECIDED: ${decoded.join("; ")}; mounted on the HDR target instead of the direct path.`]);
    applyRenderPathToCanvas(canvas, renderPath);
    renderer = await mountRenderer();
    rawRetirement = "not-started";
  }
  const cancelledController = (): WebGLRenderController => ({
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
    });
  if (isCancelled()) {
    rawRetirement = "pending";
    renderer.dispose();
    await renderer.whenDisposed?.();
    rawRetirement = "done";
    return cancelledController();
  }
  const backend = renderer.backend === "webgl2" || renderer.backend === "webgpu" ? renderer.backend : undefined;
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
  let pageHidden = typeof document !== "undefined" && document.hidden;
  // ENG-FPS: measured over the presented rAF frames of the last second, not a 60 placeholder.
  const frameRate = createFrameRateMeter();
  let pendingFrames = 0;
  let activeSynchronousFrames = 0;
  let disposeAfterSynchronousFrames = false;
  let frameInvalidated = false;
  let frameTail: Promise<void> = Promise.resolve();
  const lazyFrameDiagnostics = bindLazyFrameDiagnostics(diagnosticsState, {
    renderer: () => renderer.diagnostics,
    evidence: () => collectAuraSceneEvidence(snapshot),
    busy: () => pendingFrames > 0,
    // GU47 E-D (ED-7): the lane Renderer's device counters (the same triangle counter as `app.info.render.triangles`).
    deviceCounters: () => deviceFrameCounters(renderer.auraRenderer)
  });
  const baseBackingSize = getRootPerformanceBaseSize(canvas);
  let syncedWidth = canvas.width;
  let syncedHeight = canvas.height;
  type CleanupFailure = { readonly error: unknown };
  interface RendererRetirement {
    readonly completion: Promise<CleanupFailure | undefined>;
    readonly synchronousFailures: unknown[];
    pending: boolean;
    failure?: CleanupFailure;
  }
  let initialResourceReleaseStarted = false;
  let releasingResources = false;
  let disposingController = false;
  let disposingRenderer = false;
  const resourceReleaseFailures: unknown[] = [];
  let firstRendererFailure: CleanupFailure | undefined;
  let rendererRetirement: RendererRetirement | undefined;
  let queuedRendererRetry: Promise<RendererRetirement> | undefined;
  let resolveFirstRetirement!: (retirement: RendererRetirement) => void;
  const firstRetirement = new Promise<RendererRetirement>((resolve) => { resolveFirstRetirement = resolve; });
  const cleanupError = (failures: readonly unknown[], message: string): unknown =>
    failures.length === 1 ? failures[0] : new AggregateError(failures, message, { cause: failures[0] });
  const appendFailure = (failures: unknown[], error: unknown): void => {
    if (!failures.some((failure) => Object.is(failure, error))) failures.push(error);
  };
  const startRendererRetirement = (): RendererRetirement => {
    let resolveCompletion!: (failure: CleanupFailure | undefined) => void;
    const retirement: RendererRetirement = {
      completion: new Promise<CleanupFailure | undefined>((resolve) => { resolveCompletion = resolve; }),
      synchronousFailures: [],
      pending: true
    };
    // Publish before calling user-provided cleanup: it can reenter dispose() or
    // whenIdle(), and the latter must wait for this very retirement.
    if (!rendererRetirement) resolveFirstRetirement(retirement);
    rendererRetirement = retirement;
    const rememberSynchronousFailure = (error: unknown): void => {
      retirement.synchronousFailures.push(error);
      firstRendererFailure ??= { error };
    };
    const finish = (asynchronousFailure?: CleanupFailure): void => {
      const failures = [...retirement.synchronousFailures];
      if (asynchronousFailure) appendFailure(failures, asynchronousFailure.error);
      if (failures.length) {
        firstRendererFailure ??= { error: failures[0] };
        const reported = [firstRendererFailure.error];
        for (const error of failures) appendFailure(reported, error);
        retirement.failure = { error: cleanupError(reported, "Renderer retirement failed") };
      } else {
        // A completed retry discharges only renderer custody. Unrelated
        // diagnostics/label failures remain visible to whenIdle().
        firstRendererFailure = undefined;
      }
      retirement.pending = false;
      resolveCompletion(retirement.failure);
    };
    disposingRenderer = true;
    try {
      try { renderer.dispose(); } catch (error) { rememberSynchronousFailure(error); }
      let retirementPromise: Promise<void> | undefined;
      try { retirementPromise = renderer.whenDisposed?.(); } catch (error) { rememberSynchronousFailure(error); }
      if (retirementPromise) {
        void Promise.resolve(retirementPromise).then(() => finish(), (error: unknown) => finish({ error }));
      } else finish();
    } finally {
      disposingRenderer = false;
    }
    return retirement;
  };
  const currentRendererRetirement = (): Promise<RendererRetirement> =>
    queuedRendererRetry ?? (rendererRetirement ? Promise.resolve(rendererRetirement) : firstRetirement);
  const releaseResources = (): void => {
    if (initialResourceReleaseStarted) return;
    initialResourceReleaseStarted = true;
    releasingResources = true;
    try {
      try { lazyFrameDiagnostics.freeze(); } catch (error) { resourceReleaseFailures.push(error); }
      try { labelLayer?.dispose(); } catch (error) { resourceReleaseFailures.push(error); }
      // The deferred owner can release from a frame's finally block. Record
      // failures instead of replacing that frame's original result.
      startRendererRetirement();
    } finally {
      releasingResources = false;
    }
  };
  const ownAxes = ownSizedCanvasAxes(canvas);
  const parentFit = options.resize === false ? undefined : createParentFit(canvas, {
    get width() { return ownAxes.width; },
    get height() { return ownAxes.height; },
    box: () => canvasContentBox(canvas)
  });
  const resizeRenderer = (): void => {
    if (disposed || !parentFit) return;
    if (pendingFrames > 0) { resourceOwner.requestResize(); return; }
    refreshOwnSizedAxes(canvas);
    const { cssWidth, cssHeight, ownWidth, ownHeight } = parentFit.measure(
      (typeof window !== "undefined" ? window.innerWidth : 960) || 960,
      (typeof window !== "undefined" ? window.innerHeight : 540) || 540
    );
    const pixelRatio = coreDpr ? resolvePixelRatio() : legacyPixelRatio;
    const width = Math.max(1, Math.round(Math.max(backingMinimum.width, cssWidth * pixelRatio) * (getRootPerformanceQuality(canvas)?.resolutionScale ?? 1)));
    const height = Math.max(1, Math.round(Math.max(backingMinimum.height, cssHeight * pixelRatio) * (getRootPerformanceQuality(canvas)?.resolutionScale ?? 1)));
    if (canvas.width === width && canvas.height === height) return;
    // top-tennis C2: an axis the page's CSS sizes (smaller than the parent) keeps that CSS; only the backing store follows it.
    if (!ownWidth) canvas.style.width = `${cssWidth}px`;
    if (!ownHeight) canvas.style.height = `${cssHeight}px`;
    noteEngineCanvasSize(canvas);
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
  // A CSS-sized canvas can change size without its parent moving (a media query changes the reserved bands).
  resizeObserver?.observe(canvas as unknown as Element);
  if (options.resize !== false && typeof window !== "undefined") window.addEventListener("resize", resizeRenderer);

  const resetHistory = (reason: string): void => {
    if (disposed) return;
    if (pendingFrames > 0) frameTail = frameTail.then(() => { if (!disposed) renderer.resetTemporalHistory?.(reason); });
    else renderer.resetTemporalHistory?.(reason);
  };
  const canSchedule = (): boolean => !disposed && !pageHidden && !isPaused() && options.autoStart !== false && typeof requestAnimationFrame !== "undefined";
  const onVisibilityChange = (): void => {
    if (disposed || typeof document === "undefined") return;
    const hidden = document.hidden;
    if (hidden === pageHidden) return;
    pageHidden = hidden;
    lastTime = 0;
    if (hidden) {
      if (animationHandle && typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(animationHandle);
      animationHandle = 0;
    } else {
      // Re-read layout and DPR, including changes made while the page was hidden.
      resizeRenderer();
      resetHistory("visibility-resume");
      // A single refresh also presents a static scene after a hidden resize.
      if (canSchedule() && !animationHandle) animationHandle = requestAnimationFrame(scheduleFrame);
    }
  };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibilityChange);

  let firstFrameEndMarked = false;
  let firstPresentationReported = false;
  let firstFrameFailureReported = false;
  let firstSubmissionStarted = false;
  let deviceLossReported = false;
  const reportDetectedDeviceLoss = (): void => {
    if (deviceLossReported || !firstSubmissionStarted || disposed || isCancelled()) return;
    deviceLossReported = true;
    try { readiness?.onDeviceLossDetected?.(); } catch { /* lifecycle observers cannot mask rendering */ }
  };
  const reportFirstFrameFailure = (error: unknown): void => {
    if (!firstSubmissionStarted || disposed || isCancelled() || firstPresentationReported || firstFrameFailureReported) return;
    firstFrameFailureReported = true;
    try { readiness?.onFirstFrameFailed?.(error); } catch { /* do not mask the submission failure */ }
  };
  const reportFrameFailure = (error: unknown): void => {
    if (!firstSubmissionStarted || disposed || isCancelled()) return;
    // A device loss has its own scoped lifecycle event. Do not misclassify its
    // submission rejection as a renderer failure, or mask the original error if
    // an injected device's loss predicate itself throws.
    try { if (renderer.deviceLost?.()) { reportDetectedDeviceLoss(); return; } } catch { /* retain the original failure */ }
    // Preserve the existing one-shot first-frame outcome, but do not use it as
    // the lifetime signal: a submitted blank frame can precede a later failure.
    reportFirstFrameFailure(error);
    if (disposed || isCancelled()) return;
    // A first-frame observer can synchronously trigger loss or replace the mount.
    try { if (renderer.deviceLost?.()) { reportDetectedDeviceLoss(); return; } } catch { /* retain the original failure */ }
    try { readiness?.onTerminalFrameFailure?.(error); } catch { /* do not mask the submission failure */ }
  };
  const renderFrameBody = (time = performanceNow(), submittedDrawCalls?: number, explicit = false, submittedPresented = submittedDrawCalls !== undefined) => {
    if (disposed || isCancelled()) return;
    // T0-12: first real frame — closes the mount-timing window the bench
    // harness reads from payload.extra.mountTiming.
    if (lastTime === 0) markTiming("a3d:mount:first-renderFrame");
    // Automatic simulation cannot consume an unbounded wall-clock gap after a stall.
    const delta = lastTime > 0 ? Math.min(100, Math.max(1, time - lastTime)) : 16.67;
    lastTime = time;
    // Explicit renders (`app.step()` loops, which most games drive themselves) are sampled on the wall clock, since `time` is then
    // simulated time; the meter counts one frame per task, so several steps inside one rAF callback count once.
    frameRate.sample(explicit ? performanceNow() : time);
    if (!explicit && !pageHidden && !isPaused()) beforeRender?.(delta / 1000, "raf");
    // An onFrame callback can call `setScene()` or `dispose()`, which disposes this controller and its renderer. Submitting the
    // frame after that drew released materials ("Material a3d-production-sdf-text-label is disposed", g10 handoff, Aura Links
    // hole changes). The async path has the same check; the new mount presents its own first frame.
    if (disposed) return;
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
    let presented = submittedDrawCalls === undefined ? !renderer.deviceLost?.() : submittedPresented;
    if (!presented) {
      reportDetectedDeviceLoss();
      if (disposed || isCancelled()) return;
    }
    try {
      // top-tennis C8: while the WebGL context is lost nothing can be presented; skip the frame instead of throwing, keep the
      // loop alive, and let the app's onDeviceRestored handler remount (the documented recovery contract).
      if (submittedDrawCalls === undefined && renderer.deviceLost?.()) {
        reportDetectedDeviceLoss();
        drawCalls = 0;
        presented = false;
      } else {
        drawCalls = submittedDrawCalls ?? renderer.render(renderTime);
      }
    } catch (error) {
      // A loss in the middle of a frame (the context goes before the webglcontextlost event arrives) is not a render failure.
      if (renderer.deviceLost?.()) { reportDetectedDeviceLoss(); drawCalls = 0; presented = false; }
      else rethrowShaderFailure(error);
    }
    if (presented && !disposed && !isCancelled()) {
      // Loss can begin after submission returns and before the native event is
      // delivered, including on frames after the first one was reported.
      if (renderer.deviceLost?.()) reportDetectedDeviceLoss();
      else if (!firstPresentationReported && !firstFrameFailureReported && backend) {
        firstPresentationReported = true;
        readiness?.onFirstFrame(backend);
      }
    }
    if (disposed || isCancelled()) return;
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
    if (!explicit && canSchedule() && !animationHandle && (frameInvalidated || sceneWantsFrames || requiresFrames())) {
      animationHandle = requestAnimationFrame(scheduleFrame);
    }
  };
  const renderFrame = (time?: number, submittedDrawCalls?: number, explicit?: boolean, submittedPresented?: boolean): void => {
    activeSynchronousFrames += 1;
    try {
      renderFrameBody(time, submittedDrawCalls, explicit, submittedPresented);
    } finally {
      activeSynchronousFrames -= 1;
      if (activeSynchronousFrames === 0 && disposeAfterSynchronousFrames) {
        disposeAfterSynchronousFrames = false;
        resourceOwner.dispose();
      }
    }
  };

  const submitAsync = (clock: () => number, automatic = false): Promise<void> => {
    if (disposed) return Promise.reject(new Error("Aura3D renderer is disposed."));
    if (!renderer.renderAsync) return Promise.reject(new Error("Aura3D asynchronous submission requires the production renderer."));
    pendingFrames += 1;
    const submitted = resourceOwner.run(() => frameTail.then(async () => {
      if (disposed) throw new Error("Aura3D renderer is disposed.");
      if (automatic && pageHidden) return;
      const time = clock();
      if (automatic) {
        const delta = lastTime > 0 ? Math.min(100, Math.max(1, time - lastTime)) : 16.67;
        lastTime = time;
        if (!isPaused()) beforeRender?.(delta / 1000, "raf");
      }
      // User frame callbacks can dispose the app. Do not submit a new frame after
      // that callback; pending ownership still defers cleanup until this settles.
      if (disposed) throw new Error("Aura3D renderer is disposed.");
      const renderTime = resolveRootRenderTime(time, !automatic, isPaused, pausedRenderTime);
      let presented = !renderer.deviceLost?.();
      if (!presented) {
        reportDetectedDeviceLoss();
        if (disposed || isCancelled()) return;
      }
      const drawCalls = !presented ? 0 : await renderer.renderAsync!(renderTime).catch((error: unknown) => {
        if (renderer.deviceLost?.()) { reportDetectedDeviceLoss(); presented = false; return 0; }
        throw error;
      });
      if (!disposed) {
        const previousLastTime = lastTime;
        renderFrame(renderTime, drawCalls, true, presented);
        lastTime = previousLastTime;
      }
    }).finally(() => {
      pendingFrames -= 1;
      // Coalesce invalidations that arrived while a frame owned the renderer;
      // do not enqueue a second draw until the first one has settled.
      if (pendingFrames === 0 && canSchedule() && !animationHandle && (frameInvalidated || sceneWantsFrames || requiresFrames())) {
        animationHandle = requestAnimationFrame(scheduleFrame);
      }
    }));
    frameTail = submitted.catch(() => undefined);
    return submitted;
  };
  const scheduleFrame = (time: number): void => {
    animationHandle = 0;
    if (disposed || pageHidden || isPaused()) return;
    if (pendingFrames > 0) return;
    if (options.frameMode === "async") {
      frameInvalidated = false;
      void submitAsync(() => time, true).then(() => {
        if (canSchedule() && !animationHandle && (frameInvalidated || sceneWantsFrames || requiresFrames())) {
          animationHandle = requestAnimationFrame(scheduleFrame);
        }
      }).catch((error: unknown) => {
        if (!disposed) {
          reportFrameFailure(error);
          if (!disposed) { recordFrameError(diagnosticsState, error); overlay?.update(); }
        }
      });
    } else {
      frameInvalidated = false;
      try { renderFrame(time); } catch (error) {
        if (!disposed) {
          if (isPrd07DeviceLeaseBusy(error)) {
            // A peer sharing this canvas is still submitting. Skip this
            // automatic frame and retry instead of terminating this app.
            frameInvalidated = true;
            if (canSchedule() && !animationHandle) animationHandle = requestAnimationFrame(scheduleFrame);
          } else {
            reportFrameFailure(error);
            if (!disposed) { recordFrameError(diagnosticsState, error); overlay?.update(); }
          }
        }
      }
    }
  };
  let unregisterAtmosphereInvalidator: (() => void) | undefined;
  let unregisterLightingInvalidator: (() => void) | undefined;
  let unregisterResourceInvalidator: (() => void) | undefined;
  const controller: WebGLRenderController = {
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
      try { renderFrame(time, undefined, true); } catch (error) {
        if (!isPrd07DeviceLeaseBusy(error)) reportFrameFailure(error);
        throw error;
      }
      finally { lastTime = previousLastTime; }
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
    renderAsync: (clock) => submitAsync(clock).catch((error: unknown) => {
      if (!isPrd07DeviceLeaseBusy(error)) reportFrameFailure(error);
      throw error;
    }),
    busy: () => pendingFrames > 0,
    whenIdle: async () => {
      // Snapshot the requested attempt before awaiting a frame or another
      // cleanup. A later retry must not erase this waiter's original failure.
      const retirement = currentRendererRetirement();
      await frameTail;
      if (disposed) {
        const rendererFailure = await (await retirement).completion;
        const failures = [...resourceReleaseFailures];
        if (rendererFailure) failures.push(rendererFailure.error);
        if (failures.length) throw cleanupError(failures, "Renderer retirement failed");
      }
    },
    invalidate() {
      if (disposed) return;
      frameInvalidated = true;
      if (canSchedule() && !animationHandle) animationHandle = requestAnimationFrame(scheduleFrame);
    },
    resetTemporalHistory(reason) {
      // Reset after the active submission, before the next one can consume history.
      resetHistory(reason);
    },
    pause() {
      if (animationHandle && typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(animationHandle);
      animationHandle = 0;
      lastTime = 0;
    },
    resume() {
      if (!canSchedule() || animationHandle) return;
      lastTime = 0;
      resetHistory("resume");
      if (frameInvalidated || sceneWantsFrames || requiresFrames()) animationHandle = requestAnimationFrame(scheduleFrame);
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
      if (disposingController || releasingResources || disposingRenderer) return;
      if (disposed) {
        const previous = rendererRetirement;
        // The first release is still waiting for an in-flight frame, or an
        // asynchronous retirement has not failed. Never overlap either one.
        if (!previous || queuedRendererRetry || (!previous.failure && !previous.synchronousFailures.length)) return;
        if (previous.pending) {
          // A synchronous failure can coexist with asynchronous retirement.
          // Coalesce retries until that retirement has actually settled.
          queuedRendererRetry = previous.completion.then(() => {
            queuedRendererRetry = undefined;
            return startRendererRetirement();
          });
          return;
        }
        disposingController = true;
        try {
          const retry = startRendererRetirement();
          if (retry.synchronousFailures.length) {
            const failures: unknown[] = [];
            if (firstRendererFailure) appendFailure(failures, firstRendererFailure.error);
            for (const error of retry.synchronousFailures) appendFailure(failures, error);
            throw cleanupError(failures, "Renderer retirement failed");
          }
        } finally {
          disposingController = false;
        }
        return;
      }
      disposed = true;
      disposingController = true;
      const failures: unknown[] = [];
      const cleanup = (fn: (() => void) | undefined): void => {
        if (!fn) return;
        try { fn(); } catch (error) { failures.push(error); }
      };
      try {
        cleanup(unregisterLightingInvalidator);
        cleanup(unregisterResourceInvalidator);
        cleanup(unregisterAtmosphereInvalidator);
        if (animationHandle && typeof cancelAnimationFrame !== "undefined") cleanup(() => cancelAnimationFrame(animationHandle));
        cleanup(() => resizeObserver?.disconnect());
        if (typeof window !== "undefined") cleanup(() => window.removeEventListener("resize", resizeRenderer));
        if (typeof document !== "undefined") cleanup(() => document.removeEventListener("visibilitychange", onVisibilityChange));
        if (activeSynchronousFrames > 0) disposeAfterSynchronousFrames = true;
        else cleanup(() => resourceOwner.dispose());
        const resourceFailures = [...resourceReleaseFailures, ...(rendererRetirement?.synchronousFailures ?? [])];
        if (resourceFailures.length) failures.push(cleanupError(resourceFailures, "Renderer resource cleanup failed"));
        if (failures.length) throw cleanupError(failures, "Renderer controller cleanup failed");
      } finally {
        disposingController = false;
      }
    }
  };
  controllerOwnsCleanup = true;
  try {
    unregisterLightingInvalidator = runtimeNodes && controller.invalidate
      ? setAdvancedLightingInvalidator(runtimeNodes, () => controller.invalidate?.()) : undefined;
    unregisterResourceInvalidator = renderer.onResourceChange?.(() => controller.invalidate?.());
    // App mounts subscribe through their owner, never through a canvas-global
    // source which could belong to a different app sharing that canvas.
    if (prd07?.subscribePrd07Atmosphere) {
      unregisterAtmosphereInvalidator = prd07.subscribePrd07Atmosphere(() => controller.invalidate?.());
    } else {
      // Preserve the existing standalone frame-loop compatibility path.
      const source = getRootRenderSource(canvas, runtimeOwner ?? canvas)?.source as
        | { readonly atmosphere?: { onRenderChange?(listener: () => void): () => void } | null }
        | undefined;
      unregisterAtmosphereInvalidator = source?.atmosphere?.onRenderChange?.(() => controller.invalidate?.());
    }
    // Publish the controller before the first submission can stall. Callers may
    // subscribe to device events and dispose it while the first frame is pending.
    if (backend) readiness?.onRendererReady(backend, controller);
    if (disposed || isCancelled()) {
      controller.dispose();
      await controller.whenIdle?.();
      return cancelledController();
    }
    firstSubmissionStarted = true;
    if (options.frameMode === "async") {
      await submitAsync(() => performanceNow(), true);
      if (canSchedule() && (sceneWantsFrames || requiresFrames())) {
        animationHandle = requestAnimationFrame(scheduleFrame);
      }
    } else {
      try { renderFrame(); }
      catch (error) {
        if (!isPrd07DeviceLeaseBusy(error) || !renderer.renderAsync) throw error;
        // The synchronous first attempt already ran the simulation callback.
        // Await a queued presentation without advancing it a second time.
        await submitAsync(() => performanceNow());
      }
    }
  } catch (error) {
    reportFrameFailure(error);
    const failures: unknown[] = [error];
    try { controller.dispose(); } catch (cleanupFailure) { failures.push(cleanupFailure); }
    try { await controller.whenIdle?.(); } catch (cleanupFailure) {
      if (!failures.some(failure => failure === cleanupFailure
        || (failure instanceof AggregateError && failure.errors.includes(cleanupFailure)))) failures.push(cleanupFailure);
    }
    if (failures.length > 1) {
      if (backend === "webgpu") throw frameSetupCleanupFailure(error, failures.slice(1));
      throw new AggregateError(failures, "Renderer mount and cleanup failed", { cause: error });
    }
    throw error;
  }
  return controller;
  } catch (error) {
    if (controllerOwnsCleanup || renderer.backend !== "webgpu" || rawRetirement === "done") throw error;
    // Setup before the controller is published can have installed callbacks or
    // labels. Retire the renderer if possible, but quarantine this canvas
    // because those partially installed owners have no complete receipt.
    const failures: unknown[] = [new Error("Frame-loop setup did not complete")];
    if (rawRetirement === "not-started") {
      try { renderer.dispose(); await renderer.whenDisposed?.(); } catch (cleanupError) { failures.push(cleanupError); }
    }
    throw frameSetupCleanupFailure(error, failures);
  }
}

function pushWarnings(state: MutableDiagnostics, warnings: readonly string[]): void {
  for (const warning of warnings) if (!state.warnings.includes(warning)) state.warnings.push(warning);
}

function recordFrameError(state: MutableDiagnostics, error: unknown): void {
  // productionRenderErrorMessage redacts credentials; bound and deduplicate history.
  const message = `RENDER_FRAME_TERMINAL: ${productionRenderErrorMessage(error)}`;
  if (state.errors.includes(message)) return;
  while (state.errors.length >= 128) state.errors.shift();
  state.errors.push(message);
}

export { createWorkerFrameScheduler, type WorkerFrameFailureKind, type WorkerScheduledFrame, type WorkerFrameSchedulerOptions, type WorkerFrameScheduler } from "./workerFrameLoop.js";

export interface FrameRateMeter {
  /** Record one presented frame at `time` (ms, the rAF timestamp). */
  sample(time: number): void;
  /** Frames per second over the window, to 0.01; 0 until two frames were sampled. */
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
      // Two decimals, so a software-GL loop at one frame every 20 s reads 0.05, not 0.
      return span > 0 ? Math.round(((times.length - 1) * 1000 / span) * 100) / 100 : 0;
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
  if (snapshot.camera.mode === "orbit" && snapshot.camera.autoRotate && snapshot.camera.captureTime === undefined) return true;
  if (snapshot.camera.mode === "dolly" || snapshot.camera.mode === "follow" || snapshot.camera.mode === "path" || snapshot.camera.mode === "flythrough") return true;
  return snapshot.nodes.some((node) => {
    if ("runtime" in node && node.runtime?.mutable !== false) return true;
    if ((node.kind === "model" || node.kind === "primitive") && node.animation) return true;
    if (node.kind !== "effect") return false;
    return node.effect === "particles" || node.effect === "rain";
  });
}
