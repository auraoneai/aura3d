import type { AuraApp, AuraAppTarget, AuraBackend, AuraCreateAppOptions, AuraFrameCallback, AuraFrameInfo, AuraSceneSnapshot } from "../nodes/types.js";
import type { AuraReadinessOptions, AuraReadyOutcome, AuraRenderTermination } from "../nodes/types/runtime.js";
import { createGameInput } from "../GameRuntimeCore.js";
import { createShaderFailureStore } from "@aura3d/rendering";
import { analyzeProductionBridgeEligibility } from "../compiler/observations.js";
import { createInitialDiagnostics, snapshotDiagnostics, validateSceneAssets } from "../diagnostics.js";
import { groups } from "../nodes/groups.js";
import { normalizeSceneSnapshot } from "../sceneMath.js";
import { formatDiagnosticError, sanitizeDiagnosticText } from "../sanitizeDiagnostics.js";
import { applyWorkerCanvasCssDefaults, forwardAuthoredCanvasSize, isOffscreenCanvas, resolveCanvas, workerCanvasBackingSize } from "./canvas.js";
import { registerAuraApp, unregisterAuraApp } from "./liveApps.js";
import { computeRuntimeAlpha } from "./frameAlpha.js";
import { AURA_APP_CANVAS } from "./screenshot.js";
import { normalizeCreateAppRendererOptions, resolveBackendOptions, resolveDrawingPathOptions } from "./rendererOptions.js";
import { AuraWorkerError, createWorkerRenderer, measureWorkerCanvas, supportsWorkerRendering, validateWorkerSceneGroups, workerCanvasTransferAttempted } from "./workerRuntime.js";
import type { AuraWorkerFrameResult, AuraWorkerHostEndpoint, AuraWorkerInput, AuraWorkerRenderFlags } from "./workerProtocol.js";
import { createWorkerNodeMirror, type AuraWorkerNodeMirror } from "./workerNodes.js";
import { qrFlagsWithAnimationMixer, resolveQrFlags } from "../../contracts/flags.js";
import { appExtensionsAll } from "../../contracts/app.js";
import { collectGameRuntimeEvidence } from "../GameEvidence.js";
import { watchReadyStall } from "./readyStallWarning.js";

/** App extensions that only need app.onFrame, app.nodes and app.scene, so they run on the host of a worker app. */
const WORKER_HOST_EXTENSIONS = new Set(["camera", "time"]);

type ReadyBackend = "webgl2" | "webgpu";

function deferredOutcome() {
  let resolve!: (value: AuraReadyOutcome) => void;
  let settled = false;
  const promise = new Promise<AuraReadyOutcome>((done) => { resolve = done; });
  return {
    promise,
    settle(value: AuraReadyOutcome) {
      if (!settled) { settled = true; resolve(value); }
    }
  };
}

function mountOutcome() {
  const renderer = deferredOutcome();
  const firstFrame = deferredOutcome();
  return {
    renderer, firstFrame,
    settle(value: AuraReadyOutcome) { renderer.settle(value); firstFrame.settle(value); }
  };
}

function waitForOutcome(result: Promise<AuraReadyOutcome>, signal?: AbortSignal): Promise<AuraReadyOutcome> {
  if (!signal) return result;
  if (signal.aborted) return Promise.resolve({ state: "cancelled" });
  return new Promise((resolve) => {
    const abort = () => { signal.removeEventListener("abort", abort); resolve({ state: "cancelled" }); };
    signal.addEventListener("abort", abort, { once: true });
    void result.then((value) => { signal.removeEventListener("abort", abort); resolve(value); });
    if (signal.aborted) abort();
  });
}

function unsupported(field: string, alternative: string): never {
  throw new AuraWorkerError(`${field} is unavailable for a worker-backed app. ${alternative}`, "worker-unsupported");
}

function validateWorkerOptions(options: AuraCreateAppOptions): void {
  const worker = options.worker;
  if (worker && typeof worker === "object" && typeof worker.createWorker !== "function" && worker.fallback === "main-thread") {
    // A shared lab fragment can carry only the fallback half; honor it.
    throw new AuraWorkerError("worker.createWorker is missing, so the app runs on the main thread.", "worker-unsupported");
  }
  if (!worker || typeof worker !== "object" || typeof worker.createWorker !== "function") {
    throw new AuraWorkerError("worker.createWorker must return a dedicated render worker.", "invalid-worker-option");
  }
  if (worker.fallback !== undefined && worker.fallback !== "error" && worker.fallback !== "main-thread") {
    throw new AuraWorkerError("worker.fallback must be 'error' or 'main-thread'.", "invalid-worker-option");
  }
  if (worker.disposeTimeoutMs !== undefined && (!Number.isFinite(worker.disposeTimeoutMs) || worker.disposeTimeoutMs < 0 || worker.disposeTimeoutMs > 2_147_483_647)) {
    throw new AuraWorkerError("worker.disposeTimeoutMs must be within the timer range.", "invalid-worker-option");
  }
  // qualityRebuild flags and the animation mixer are mirrored to the worker
  // renderer; camera runs host-side (K3); onAssetProgress/onAssetError are
  // forwarded from the worker (5.4). The rest stays main-thread only.
  const unsupportedOptions = [
    "physics", "performanceQuality", "quality", "preserveDrawingBuffer",
    "lighting", "formatRegistry", "accessibility", "strict",
    "onDegradation", "compat", "loop"
  ] as const;
  for (const key of unsupportedOptions) {
    if (options[key] !== undefined) unsupported(`options.${key}`, "Use the main-thread renderer for this option.");
  }
  const diagnosticsOption = options.diagnostics as unknown;
  const overlayRequested = diagnosticsOption === true || (typeof diagnosticsOption === "object" && diagnosticsOption !== null
    && ((diagnosticsOption as { overlay?: unknown }).overlay !== false || (diagnosticsOption as { performancePanel?: unknown }).performancePanel === true));
  if (diagnosticsOption !== undefined && diagnosticsOption !== false && overlayRequested) {
    unsupported("options.diagnostics overlay", "Read app.diagnostics() instead.");
  }
  if (options.frameMode !== undefined && options.frameMode !== "async") {
    unsupported("options.frameMode", 'Use frameMode: "async" for worker rendering.');
  }
  if (normalizeCreateAppRendererOptions(options.renderer).mode !== "production") {
    unsupported("options.renderer.mode", "Use the production renderer.");
  }
  resolveBackendOptions(options.renderer);
  resolveDrawingPathOptions(options.renderer);
}

function validateWorkerScene(snapshot: AuraSceneSnapshot, diagnostics: AuraCreateAppOptions["diagnostics"]): void {
  if (!snapshot || snapshot.schema !== "aura3d-scene-snapshot/1.0" || !Array.isArray(snapshot.nodes)) {
    throw new AuraWorkerError("Worker scene must be an Aura3D scene snapshot.", "invalid-scene");
  }
  validateWorkerSceneGroups(snapshot);
  if (snapshot.physics) unsupported("Scene physics", "Run physics on the main thread.");
  const overlayOff = diagnostics === false || (typeof diagnostics === "object" && diagnostics !== null && (diagnostics as { overlay?: unknown }).overlay === false);
  if (snapshot.diagnostics?.enabled && !overlayOff) {
    unsupported("Scene diagnostics overlay", "Disable the overlay or use the main-thread renderer.");
  }
  const nodes = [...snapshot.nodes];
  while (nodes.length) {
    const node = nodes.pop()!;
    if (node.kind === "group") nodes.push(...node.children);
    if ("physics" in node && node.physics) unsupported("Scene physics", "Run physics on the main thread.");
    if (node.kind === "label") unsupported("DOM labels", "Use a supported worker-rendered scene without DOM overlays.");
  }
  const eligibility = analyzeProductionBridgeEligibility(groups.flatten(snapshot.nodes));
  if (!eligibility.eligible) {
    throw new AuraWorkerError(`Worker renderer rejected this scene: ${eligibility.reasons.join("; ")}`, "backend-fallback", "recoverable");
  }
}

function backendOf(value: AuraBackend | string | undefined): ReadyBackend | undefined {
  return value === "webgl2" || value === "webgpu" ? value : undefined;
}

function errorDetails(error: unknown): Extract<AuraReadyOutcome, { state: "failed" }> {
  const read = (key: string): unknown => {
    if ((typeof error !== "object" || error === null) && typeof error !== "function") return undefined;
    try { return Reflect.get(error, key); } catch { return undefined; }
  };
  const value = read("code");
  const messageValue = read("message");
  const code = typeof value === "string" && /^[\w.-]{1,80}$/.test(value) ? value : "worker-renderer-failed";
  const message = typeof messageValue === "string" ? sanitizeDiagnosticText(messageValue) : formatDiagnosticError(error);
  return { state: "failed", code, message };
}

export function createWorkerRootApp(
  target: AuraAppTarget,
  options: AuraCreateAppOptions
): { readonly kind: "worker"; readonly app: AuraApp } | { readonly kind: "fallback"; readonly target: AuraAppTarget; readonly reason: string } {
  const workerOptions = options.worker;
  try { validateWorkerOptions(options); }
  catch (error) {
    if ((error as { code?: string })?.code === "worker-unsupported" && workerOptions?.fallback === "main-thread") {
      const details = errorDetails(error);
      return { kind: "fallback", target, reason: `${details.code}: ${details.message}` };
    }
    throw error;
  }
  const canvas = resolveCanvas(target);
  const fallback = (error: unknown) => {
    const details = errorDetails(error);
    if (workerOptions?.fallback !== "main-thread") throw error;
    return { kind: "fallback" as const, target: canvas ?? target, reason: `${details.code}: ${details.message}` };
  };
  if (!canvas || !supportsWorkerRendering(canvas)) {
    return fallback(new AuraWorkerError("Worker rendering requires a transferable canvas.", "worker-unsupported"));
  }
  if (typeof structuredClone !== "function") {
    return fallback(new AuraWorkerError("Worker rendering requires structuredClone.", "worker-unsupported"));
  }
  if (!isOffscreenCanvas(canvas) && typeof (canvas as HTMLCanvasElement).style === "object") applyWorkerCanvasCssDefaults(canvas as HTMLCanvasElement);

  const snapshot = normalizeSceneSnapshot(options.scene);
  try { validateWorkerScene(snapshot, options.diagnostics); }
  catch (error) { return fallback(error); }
  const rendererOptions = options.output === undefined
    ? options.renderer
    : { ...options.renderer, output: { ...options.renderer?.output, ...options.output } };
  normalizeCreateAppRendererOptions(rendererOptions);
  let diagnostics = createInitialDiagnostics(snapshot, rendererOptions);
  validateSceneAssets(snapshot, diagnostics.assets);
  const shaderFailures = createShaderFailureStore();
  const ratio = typeof options.pixelRatio === "number" ? options.pixelRatio : options.pixelRatio?.max;
  const measureSize = () => {
    if (options.resize === false) return { width: canvas.width, height: canvas.height, pixelRatio: 1 };
    const measured = measureWorkerCanvas(canvas);
    return { ...measured, pixelRatio: ratio ?? measured.pixelRatio };
  };
  try { workerCanvasBackingSize(measureSize()); }
  catch (error) { return fallback(error); }

  // Same flag resolution as the main-thread app (options first, then URL), so
  // the worker compiles the scene the main thread would have compiled.
  const qualityRebuild = options.qualityRebuild;
  const flagUrl = qualityRebuild?.allowUrlFlags === false || typeof location === "undefined" ? undefined : location.href;
  const hostFlags = qrFlagsWithAnimationMixer(resolveQrFlags({ options: qualityRebuild?.flags, url: flagUrl }), options.animation?.mixer);
  const renderFlags: AuraWorkerRenderFlags | undefined = qualityRebuild?.flags !== undefined || options.animation?.mixer !== undefined || flagUrl !== undefined
    ? {
        ...(qualityRebuild?.flags !== undefined ? { qualityRebuild: structuredClone(qualityRebuild.flags) } : {}),
        ...(options.animation?.mixer ? { animationMixer: options.animation.mixer } : {}),
        ...(flagUrl !== undefined ? { url: flagUrl } : {})
      }
    : undefined;

  let rawWorker: AuraWorkerHostEndpoint | undefined;
  try {
    rawWorker = workerOptions!.createWorker() as unknown as AuraWorkerHostEndpoint;
    if (!rawWorker || typeof rawWorker.postMessage !== "function" || typeof rawWorker.terminate !== "function"
      || typeof rawWorker.addEventListener !== "function" || typeof rawWorker.removeEventListener !== "function") {
      throw new AuraWorkerError("A dedicated worker endpoint is required.", "invalid-worker");
    }
  } catch (error) {
    try { rawWorker?.terminate?.(); } catch {}
    return fallback(error);
  }
  const ownedWorker = rawWorker;
  let terminated = false;
  const endpoint = {
    postMessage: ownedWorker.postMessage.bind(ownedWorker),
    addEventListener: ownedWorker.addEventListener.bind(ownedWorker),
    removeEventListener: ownedWorker.removeEventListener.bind(ownedWorker),
    terminate() { if (!terminated) { terminated = true; ownedWorker.terminate(); } }
  } as AuraWorkerHostEndpoint;

  let currentScene = snapshot;
  let mountedScene = snapshot;
  let mountedDiagnostics = diagnostics;
  let mountedSceneRevision = 1;
  let disposed = false;
  let paused = options.autoStart === false;
  let frame = 0;
  let time = 0;
  let alpha = 0;
  let backend: AuraBackend = "headless";
  let lost = false;
  let revision = 1;
  let sceneSerial = 0;
  let mountPending = true;
  let mounting = true;
  let failure: Extract<AuraReadyOutcome, { state: "failed" }> | undefined;
  let readiness = mountOutcome();
  let restoredAfterRecoveryFailure = false;
  let termination: AuraRenderTermination | undefined;
  let shutdown: Promise<void> | undefined;
  let pendingSteps = 0;
  let pendingCaptures = 0;
  let inputSnapshot: Pick<AuraWorkerInput, "pointers" | "keys" | "timestamp"> = { pointers: [], keys: [], timestamp: 0 };
  const inputs = new Set<ReturnType<typeof createGameInput>>();
  const lostListeners = new Set<() => void>();
  const restoredListeners = new Set<() => void>();
  const terminationListeners = new Set<(event: AuraRenderTermination) => void>();
  const cleanupFailures: unknown[] = [];

  const appendError = (message: string): void => {
    if (diagnostics.errors.length >= 128) diagnostics.errors.splice(0, diagnostics.errors.length - 127);
    diagnostics.errors.push(message);
  };
  const publishTermination = (event: AuraRenderTermination, remember: boolean) => {
    if (remember) termination = event;
    for (const listener of [...terminationListeners]) {
      if (disposed && event.state !== "disposed") break;
      if (terminationListeners.has(listener)) {
        try { listener(event); } catch (error) { appendError(formatDiagnosticError(error)); }
      }
    }
  };
  const reportFailure = (error: unknown, terminal = true) => {
    if (disposed) return;
    const actual = errorDetails(error);
    appendError(actual.message);
    if (terminal) {
      failure = actual;
      mounting = false;
      readiness.settle(actual);
      publishTermination({ ...actual, revision }, true);
    }
  };
  const present = (result: AuraWorkerFrameResult, advanceRuntime = true) => {
    if (disposed || mounting || lost || failure) return;
    const actual = backendOf(result?.backend);
    if (!result || typeof result !== "object" || !actual || backendOf(backend) !== actual
      || !Number.isFinite(result.drawCalls) || result.drawCalls < 0
      || !Number.isSafeInteger(result.width) || result.width < 1
      || !Number.isSafeInteger(result.height) || result.height < 1
      || !Number.isFinite(result.time)
      || (result.deltaSeconds !== undefined && (!Number.isFinite(result.deltaSeconds) || result.deltaSeconds < 0))) {
      reportFailure(new AuraWorkerError("Worker returned an invalid or mismatched frame result.", "invalid-response"));
      return;
    }
    if (restoredAfterRecoveryFailure) {
      // The failed recovery stays observable until the restored owner actually
      // presents; subsequent readiness then describes that usable owner.
      restoredAfterRecoveryFailure = false;
      readiness = mountOutcome();
      readiness.renderer.settle({ state: "ready", stage: "renderer", backend: actual });
    }
    if (advanceRuntime) {
      frame += 1;
      time += result.deltaSeconds ?? 0;
      alpha = computeRuntimeAlpha(result.deltaSeconds ?? 0, 1 / 60);
    }
    diagnostics.backend = actual;
    diagnostics.drawCalls = result.drawCalls;
    diagnostics.renderSize = [result.width, result.height];
    readiness.firstFrame.settle({ state: "ready", stage: "first-frame", backend: actual });
  };
  const onDevice = (state: "lost" | "restored") => {
    if (disposed) return;
    if (state === "lost") {
      if (lost) return;
      restoredAfterRecoveryFailure = false;
      lost = true;
      mounting = mountPending;
      failure = { state: "failed", code: "device-lost", message: "The worker rendering device is lost." };
      readiness.settle(failure);
      publishTermination({ state: "device-lost", revision }, true);
      for (const listener of [...lostListeners]) {
        if (disposed) break;
        if (lostListeners.has(listener)) {
          try { listener(); } catch (error) { appendError(formatDiagnosticError(error)); }
        }
      }
      return;
    }
    if (!lost) return;
    restoredAfterRecoveryFailure = false;
    lost = false;
    failure = undefined;
    termination = undefined;
    revision += 1;
    readiness = mountOutcome();
    const actual = backendOf(worker?.backend ?? backend);
    if (actual) {
      backend = actual;
      diagnostics.backend = actual;
    }
    mounting = mountPending || !actual;
    if (!mounting && actual) readiness.renderer.settle({ state: "ready", stage: "renderer", backend: actual });
    for (const listener of [...restoredListeners]) {
      if (disposed) break;
      if (restoredListeners.has(listener)) {
        try { listener(); } catch (error) { appendError(formatDiagnosticError(error)); }
      }
    }
  };
  const syncWorkerBackend = (value: AuraBackend | undefined, deviceLost = false): void => {
    if (disposed) return;
    const actual = backendOf(value);
    if (!actual || actual === backendOf(backend)) return;
    backend = actual;
    diagnostics.backend = actual;
    if (!deviceLost && !mounting && !lost && !failure && !restoredAfterRecoveryFailure) {
      // A different renderer owns the scene; old first-frame waiters must not
      // be resolved by a frame from that new owner.
      readiness.settle({ state: "superseded" });
      revision += 1;
      readiness = mountOutcome();
      readiness.renderer.settle({ state: "ready", stage: "renderer", backend: actual });
    }
  };

  let worker: ReturnType<typeof createWorkerRenderer>;
  try {
    worker = createWorkerRenderer({
      canvas, worker: endpoint, scene: snapshot, renderer: rendererOptions, assets: options.assets, ...(renderFlags ? { flags: renderFlags } : {}),
      autoStart: options.autoStart, resize: options.resize, size: measureSize(), measureSize,
      disposeTimeoutMs: workerOptions?.disposeTimeoutMs,
      onFrame: present, onCaptureFrame: (result) => present(result, false), onDevice, onBackend: syncWorkerBackend,
      prepareLocalScene: (nextScene, sceneVersion, nextBackend, textures) => {
        // This runs while the worker can still roll back its candidate. Do
        // not expose the mirror until its separate commit message arrives.
        if (sceneVersion <= mountedSceneRevision) throw new AuraWorkerError("Worker proposed a stale scene revision.", "invalid-scene-sync", "recoverable");
        validateWorkerScene(nextScene, options.diagnostics);
        const nextDiagnostics = createInitialDiagnostics(nextScene, rendererOptions);
        validateSceneAssets(nextScene, nextDiagnostics.assets);
        const actual = backendOf(nextBackend);
        if (!actual) throw new AuraWorkerError("Worker reported an invalid scene backend.", "invalid-scene-sync", "recoverable");
        return () => {
          if (disposed) {
            for (const handle of textures) { try { handle.dispose(); } catch (error) { cleanupFailures.push(error); } }
            return;
          }
          if (sceneVersion <= mountedSceneRevision) throw new AuraWorkerError("Worker committed a stale scene revision.", "invalid-scene-sync");
          // Published mirrors are ordinary host-side scene handles. Callers
          // may retain them across later replacements; never retire them on
          // the worker's behalf.
          mountedSceneRevision = sceneVersion;
          mountedScene = nextScene;
          mountedDiagnostics = nextDiagnostics;
          backend = actual;
          mountedDiagnostics.backend = actual;
          diagnostics.backend = actual;
          if (!mountPending) {
            currentScene = mountedScene;
            diagnostics = mountedDiagnostics;
            if (!mounting && !lost && !failure && !restoredAfterRecoveryFailure) {
              readiness.settle({ state: "superseded" });
              revision += 1;
              readiness = mountOutcome();
              readiness.renderer.settle({ state: "ready", stage: "renderer", backend: actual });
            }
          }
        };
      },
      onError: (error) => {
        if (disposed) return;
        const deviceLost = error.code === "device-lost" && error.severity === "recoverable";
        if (error.severity === "recoverable") syncWorkerBackend(worker?.backend, deviceLost);
        if (deviceLost) onDevice("lost");
        else reportFailure(error, error.severity === "terminal");
      },
      ...(options.onAssetProgress ? { onAssetProgress: options.onAssetProgress } : {}),
      ...(options.onAssetError ? { onAssetError: options.onAssetError } : {}),
      onInput: (input) => {
        if (!disposed) inputSnapshot = { pointers: input.pointers.map((pointer) => ({ ...pointer })), keys: [...input.keys], timestamp: input.timestamp };
      }
    });
  } catch (error) {
    try { endpoint?.terminate?.(); } catch {}
    if (!workerCanvasTransferAttempted(canvas)) return fallback(error);
    throw error;
  }
  // `resize: false`: the author sizes the backing store by assigning canvas.width/height, as on the main thread
  // (authoredBackingResize). The transferred page canvas would throw on those writes; forward them to the worker.
  const releaseAuthoredSize = options.resize === false && !isOffscreenCanvas(canvas) && workerCanvasTransferAttempted(canvas)
    ? forwardAuthoredCanvasSize(canvas as HTMLCanvasElement, (size) => {
        if (disposed) return;
        void worker.resize({ ...size, pixelRatio: 1 }).catch((error: unknown) => {
          if (!disposed && (error as AuraWorkerError)?.code !== "disposed") appendError(errorDetails(error).message);
        });
      })
    : undefined;

  const markReady = (serial: number) => {
    if (disposed || serial !== sceneSerial) return;
    const actual = backendOf(worker.backend);
    if (!actual) {
      reportFailure(new AuraWorkerError("Worker did not report an active rendering backend.", "invalid-response"));
      return;
    }
    backend = actual;
    currentScene = mountedScene;
    diagnostics = mountedDiagnostics;
    diagnostics.backend = actual;
    mountPending = false;
    if (lost) return;
    mounting = false;
    failure = undefined;
    readiness.renderer.settle({ state: "ready", stage: "renderer", backend: actual });
  };
  const initial = worker.ready.then(
    () => markReady(0),
    (error: unknown) => { if (!disposed && sceneSerial === 0) { mountPending = false; reportFailure(error); } }
  );
  let tail: Promise<void> = initial;
  const enqueue = <T>(operation: () => Promise<T>, detectDeviceLoss = true): Promise<T> => {
    const result = tail.then(async () => {
      if (disposed) throw new AuraWorkerError("Worker app is disposed.", "disposed");
      return operation();
    }).catch((error: unknown) => {
      if (!disposed && error instanceof AuraWorkerError) {
        if (detectDeviceLoss && error.code === "device-lost" && error.severity === "recoverable") onDevice("lost");
        else if (error.severity === "terminal" && !failure) reportFailure(error);
      }
      throw error;
    });
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
  const requireRenderer = () => {
    if (disposed) throw new AuraWorkerError("Worker app is disposed.", "disposed");
    if (failure) throw new AuraWorkerError(failure.message, failure.code, lost ? "recoverable" : "terminal");
    if (mounting || !backendOf(backend)) throw new AuraWorkerError("Worker renderer is not ready.", "not-initialized");
  };
  const control = (operation: () => Promise<void>) => {
    void enqueue(operation).catch((error: unknown) => reportFailure(error, (error as AuraWorkerError)?.severity !== "recoverable"));
  };

  // ── K1: host mirror + patch queue ─────────────────────────────────────────
  let mirror: AuraWorkerNodeMirror = createWorkerNodeMirror(snapshot, hostFlags);
  let sentCamera = JSON.stringify(snapshot.camera ?? null);
  /** Queue the mirror's ops (and a changed camera spec) as one patch message, in call order. */
  // Backpressure: while a patch is in flight, host frames keep coalescing
  // into the mirror queue instead of posting (a slow worker would otherwise
  // fill its request queue). Explicit steps force a flush so their frame
  // always sees every change.
  let patchesInFlight = 0;
  // A scene replacement is posted through the request queue, so it can still
  // be waiting there when new-scene ops are recorded. Those ops are held until
  // the replacement settles; posted earlier they would land on the old
  // registry (and be lost with it, or fail on unknown ids).
  let sceneReplacementsPending = 0;
  const flushPatches = (force = false): Promise<void> | undefined => {
    if (disposed) return undefined;
    const camera = JSON.stringify(mirror.scene.camera ?? null);
    if (camera !== sentCamera) { sentCamera = camera; mirror.setCamera(mirror.scene.camera); }
    if (mirror.pending === 0 || sceneReplacementsPending > 0 || (!force && patchesInFlight > 0)) return undefined;
    const ops = mirror.drain();
    // Posted now (not when the queue reaches it) so ops always precede any
    // later scene replacement; earlier replacements are awaited above.
    // createWorkerRenderer always provides patch (optional only in the public interface type).
    const sent = worker.patch!(ops);
    patchesInFlight += 1;
    // Ops that coalesced while this patch was in flight go out as soon as it
    // returns, so the last changes arrive even when no further frame runs
    // (a paused game, a removed frame callback).
    void sent.finally(() => { patchesInFlight -= 1; if (patchesInFlight === 0) flushPatches(); }).catch(() => undefined);
    void sent.catch((error: unknown) => {
      if (disposed) return;
      if ((error as AuraWorkerError)?.code === "disposed" || (error as AuraWorkerError)?.code === "cancelled") return;
      appendError(errorDetails(error).message);
    });
    return sent;
  };

  // ── K2: host-side frame callbacks (game logic, camera rigs) ──────────────
  const frameCallbacks = new Set<AuraFrameCallback>();
  let logicFrame = 0;
  let logicTime = 0;
  const runCallbacks = (dt: number, source: AuraFrameInfo["source"]): void => {
    logicFrame += 1;
    logicTime += dt;
    const info: AuraFrameInfo = { dt, fixedDt: 1 / 60, time: logicTime, frame: logicFrame, alpha: 1, paused, source, substep: 1, substeps: 1 };
    for (const callback of [...frameCallbacks]) {
      if (!frameCallbacks.has(callback)) continue;
      callback(info);
    }
  };
  // A synchronous app.step() presents through at most one in-flight manual
  // worker frame; further steps coalesce into the next one.
  let presentInFlight = false;
  let presentQueuedDt: number | undefined;
  const requestPresent = (dt: number): void => {
    if (presentInFlight) { presentQueuedDt = (presentQueuedDt ?? 0) + dt; return; }
    presentInFlight = true;
    flushPatches(true);
    void enqueue(async () => {
      requireRenderer();
      await worker.flushInput();
      const result = await worker.step(dt, (time + dt) * 1000);
      present(result);
    }).catch((error: unknown) => {
      if (!disposed && (error as AuraWorkerError)?.severity === "recoverable") appendError(errorDetails(error).message);
    }).finally(() => {
      presentInFlight = false;
      const next = presentQueuedDt;
      presentQueuedDt = undefined;
      if (next !== undefined && !disposed) requestPresent(next);
    });
  };
  // Host loop for apps that own their automatic loop: rAF → callbacks → patch.
  // The worker presents on its own clock; the host never waits for it.
  let hostLoopHandle: number | undefined;
  let hostLoopLast: number | undefined;
  const hostLoopWanted = (): boolean => !disposed && !paused && options.autoStart !== false
    && frameCallbacks.size > 0 && typeof requestAnimationFrame === "function";
  const hostLoopTick = (now: number): void => {
    hostLoopHandle = undefined;
    if (!hostLoopWanted()) { hostLoopLast = undefined; return; }
    const dt = hostLoopLast === undefined ? 1 / 60 : Math.min(0.1, Math.max(0, (now - hostLoopLast) / 1000));
    hostLoopLast = now;
    try { runCallbacks(dt, "raf"); }
    catch (error) { appendError(errorDetails(error).message); }
    flushPatches();
    scheduleHostLoop();
  };
  const scheduleHostLoop = (): void => {
    if (hostLoopHandle === undefined && hostLoopWanted()) hostLoopHandle = requestAnimationFrame(hostLoopTick);
  };
  const stopHostLoop = (): void => {
    if (hostLoopHandle !== undefined && typeof cancelAnimationFrame === "function") cancelAnimationFrame(hostLoopHandle);
    hostLoopHandle = undefined;
    hostLoopLast = undefined;
  };
  const canvasCssSize = (): { width: number; height: number } => {
    const rect = typeof (canvas as HTMLCanvasElement).getBoundingClientRect === "function" ? (canvas as HTMLCanvasElement).getBoundingClientRect() : undefined;
    const width = rect?.width || (canvas as HTMLCanvasElement).clientWidth || diagnostics.renderSize?.[0] || canvas.width;
    const height = rect?.height || (canvas as HTMLCanvasElement).clientHeight || diagnostics.renderSize?.[1] || canvas.height;
    return { width, height };
  };

  const app: AuraApp = {
    canvas,
    execution: { requested: "worker", active: "worker" },
    get scene() { return currentScene; },
    get backend() { return backend; },
    get nodes() { return mirror.nodes; },
    get physics(): never { return unsupported("app.physics", "Use a main-thread app for physics."); },
    get compute(): never { return unsupported("app.compute", "Use a main-thread app for compute."); },
    get runtime() { return { paused, frame, time, fixedDt: 1 / 60, alpha }; },
    setScene(next) {
      if (disposed) throw new AuraWorkerError("Worker app is disposed.", "disposed");
      if (lost) throw new AuraWorkerError("Worker device is lost; recover it before replacing the scene.", "device-lost", "recoverable");
      if (pendingSteps || pendingCaptures) throw new AuraWorkerError("Wait for stepAsync() and screenshotAsync() before replacing the scene.", "worker-busy", "recoverable");
      const nextSnapshot = normalizeSceneSnapshot(next);
      validateWorkerScene(nextSnapshot, options.diagnostics);
      const nextDiagnostics = createInitialDiagnostics(nextSnapshot, rendererOptions);
      validateSceneAssets(nextSnapshot, nextDiagnostics.assets);
      restoredAfterRecoveryFailure = false;
      readiness.settle({ state: "superseded" });
      const previousRevision = revision;
      revision += 1;
      sceneSerial += 1;
      const serial = sceneSerial;
      readiness = mountOutcome();
      mountPending = true;
      mounting = true;
      failure = undefined;
      termination = undefined;
      // app.scene keeps the mounted snapshot until the worker acknowledges the
      // replacement (onCommit, then markReady publish it); a rejected or
      // superseded request never becomes visible as the current scene.
      diagnostics = nextDiagnostics;
      diagnostics.backend = backend;
      // Queued ops target the old scene; the worker drops its registry with it.
      mirror.dispose();
      mirror = createWorkerNodeMirror(nextSnapshot, hostFlags);
      sentCamera = JSON.stringify(nextSnapshot.camera ?? null);
      publishTermination({ state: "superseded", revision: previousRevision }, false);
      sceneReplacementsPending += 1;
      // Release held ops inside the queued operation, so they are posted
      // before any later queued request (a stepAsync frame) starts.
      const releaseHeldPatches = () => { sceneReplacementsPending -= 1; if (sceneReplacementsPending === 0) flushPatches(); };
      void enqueue(async () => {
       try {
        if (serial !== sceneSerial) return;
        try {
          await worker.setScene(nextSnapshot, {
            onCommit(sceneVersion) {
              if (sceneVersion === undefined || sceneVersion <= mountedSceneRevision) return;
              mountedSceneRevision = sceneVersion;
              mountedScene = nextSnapshot;
              mountedDiagnostics = nextDiagnostics;
              if (!disposed && serial === sceneSerial) currentScene = nextSnapshot;
            }
          });
        } catch (error) {
          // A device-lost error can describe the rejected candidate, not the
          // restored owner; its actual state arrives through device events.
          if (!(error instanceof AuraWorkerError) || error.severity !== "recoverable") throw error;
          if (disposed || serial !== sceneSerial) return;
          mountPending = false;
          currentScene = mountedScene;
          diagnostics = mountedDiagnostics;
          reportFailure(error, false);
          // Existing waiters must learn that the requested replacement failed;
          // the restored renderer gets a fresh, usable readiness generation.
          readiness.settle(errorDetails(error));
          if (!lost && !failure) {
            revision += 1;
            readiness = mountOutcome();
            markReady(serial);
          }
          return;
        }
        // A superseded request can still have reached the worker. Its versioned
        // commit above remains the rollback owner unless a newer local commit
        // has already arrived.
        markReady(serial);
       } finally { releaseHeldPatches(); }
      }).catch((error: unknown) => {
        if (!disposed && serial === sceneSerial) { mountPending = false; if (!failure) reportFailure(error); }
      });
    },
    setPerformanceQuality(): never { return unsupported("app.setPerformanceQuality", "Select renderer options before creating the worker."); },
    // Callbacks run on the main thread; node changes they make reach the
    // worker as one patch per frame.
    onFrame(callback) {
      if (disposed) return () => {};
      frameCallbacks.add(callback);
      scheduleHostLoop();
      return () => { frameCallbacks.delete(callback); };
    },
    offFrame(callback) { frameCallbacks.delete(callback); },
    input(inputOptions) {
      if (disposed) throw new AuraWorkerError("Worker app is disposed.", "disposed");
      const controller = createGameInput(inputOptions);
      inputs.add(controller);
      return controller;
    },
    workerInput() { return structuredClone(inputSnapshot); },
    pause() { if (!disposed && !paused) { paused = true; stopHostLoop(); control(() => worker.pause()); } },
    resume() { if (!disposed && paused) { paused = false; control(() => worker.resume()); scheduleHostLoop(); } },
    ready() { return watchReadyStall(readiness.renderer.promise.then(() => undefined)); },
    readiness(readinessOptions: AuraReadinessOptions = {}) {
      if (disposed) return Promise.resolve({ state: "disposed" });
      if (readinessOptions.signal?.aborted) return Promise.resolve({ state: "cancelled" });
      if (failure) return Promise.resolve(failure);
      return waitForOutcome(readinessOptions.stage === "first-frame" ? readiness.firstFrame.promise : readiness.renderer.promise, readinessOptions.signal);
    },
    async readyStrict(readinessOptions = {}) {
      const outcome = await app.readiness(readinessOptions);
      if (outcome.state === "ready") return outcome;
      const error = new Error(outcome.state === "failed" ? outcome.message : `Aura3D readiness ${outcome.state}.`);
      error.name = outcome.state === "cancelled" ? "AbortError" : "AuraReadinessError";
      Object.assign(error, { code: outcome.state === "failed" ? outcome.code : outcome.state });
      throw error;
    },
    onRenderTermination(listener) {
      if (disposed) return () => {};
      terminationListeners.add(listener);
      return () => { terminationListeners.delete(listener); };
    },
    renderTermination: () => termination,
    onDeviceLost(listener) {
      if (!disposed) lostListeners.add(listener);
      return () => { lostListeners.delete(listener); };
    },
    onDeviceRestored(listener) {
      if (!disposed) restoredListeners.add(listener);
      return () => { restoredListeners.delete(listener); };
    },
    deviceLost: () => lost,
    recoverWorker() {
      // The worker reports the restored owner's device state independently
      // of the error raised by a failed recovery candidate.
      return enqueue(async () => {
        if (!lost) return;
        const serial = sceneSerial;
        mountPending = true;
        try {
          await worker.recover();
          markReady(serial);
        } catch (error) {
          if (!disposed && serial === sceneSerial) {
            mountPending = false;
            if (!lost && !failure) {
              if (error instanceof AuraWorkerError && error.severity === "recoverable") {
                const actual = backendOf(worker.backend);
                if (!actual) {
                  reportFailure(new AuraWorkerError("Worker did not report an active rendering backend.", "invalid-response"));
                  throw error;
                }
                backend = actual;
                diagnostics.backend = actual;
                // The recovery attempt failed, but its previous renderer was
                // restored. Keep the failed outcome observable without
                // terminating that usable renderer.
                reportFailure(error, false);
                mounting = false;
                readiness.settle(errorDetails(error));
                restoredAfterRecoveryFailure = true;
              } else reportFailure(error);
            }
          }
          throw error;
        }
      }, false);
    },
    /** Run frame callbacks on the host and send their changes; nothing is presented. */
    advance(dt = 1 / 60) {
      if (!Number.isFinite(dt) || dt < 0) throw new RangeError("advance requires a finite non-negative delta.");
      if (disposed) throw new AuraWorkerError("Worker app is disposed.", "disposed");
      runCallbacks(dt, "manual");
      flushPatches(true);
    },
    /**
     * Run frame callbacks synchronously, then present asynchronously: a
     * running worker presents on its own clock; a paused one gets one manual
     * frame (steps issued while it is in flight coalesce).
     */
    step(dt = 1 / 60) {
      if (!Number.isFinite(dt) || dt < 0) throw new RangeError("step requires a finite non-negative delta.");
      if (disposed) throw new AuraWorkerError("Worker app is disposed.", "disposed");
      runCallbacks(dt, "manual");
      // Coalesce like the host loop; a manual present below flushes first.
      flushPatches();
      if (paused && !mounting && !failure && !lost) requestPresent(dt);
    },
    stepAsync(dt = 1 / 60) {
      if (!Number.isFinite(dt) || dt < 0) return Promise.reject(new RangeError("stepAsync requires a finite non-negative delta."));
      if (disposed) return Promise.reject(new AuraWorkerError("Worker app is disposed.", "disposed"));
      pendingSteps += 1;
      flushPatches(true);
      return enqueue(async () => {
        requireRenderer();
        await worker.flushInput();
        requireRenderer();
        const result = await worker.step(dt, (time + dt) * 1000);
        present(result);
        requireRenderer();
      }).finally(() => { pendingSteps -= 1; });
    },
    diagnostics: () => snapshotDiagnostics(diagnostics, shaderFailures),
    // Runtime and node evidence come from the host mirror; render evidence stays in the worker.
    evidence(evidenceOptions = {}) {
      return collectGameRuntimeEvidence({ runtime: app.runtime, nodes: mirror.registry }, evidenceOptions);
    },
    /** K3: nearest node under a canvas CSS-pixel point, from the host mirror (no worker round trip). */
    pick(x, y, pickOptions) {
      if (disposed) return undefined;
      return mirror.pick(x, y, canvasCssSize(), { time: time * 1000, ...pickOptions });
    },
    viewProjection() {
      const size = canvasCssSize();
      return mirror.viewProjection(size.width / Math.max(1, size.height), time * 1000);
    },
    screenshot(): never { return unsupported("app.screenshot", "Use await app.screenshotAsync() for worker rendering."); },
    screenshotAsync() {
      if (disposed) return Promise.reject(new AuraWorkerError("Worker app is disposed.", "disposed"));
      pendingCaptures += 1;
      return enqueue(async () => {
        requireRenderer();
        const capture = await worker.screenshotAsync();
        requireRenderer();
        const actual = backendOf(backend)!;
        diagnostics.renderSize = [capture.width, capture.height];
        readiness.firstFrame.settle({ state: "ready", stage: "first-frame", backend: actual });
        return capture;
      }).finally(() => { pendingCaptures -= 1; });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopHostLoop();
      releaseAuthoredSize?.();
      frameCallbacks.clear();
      for (const release of extensionDisposers.splice(0)) { try { release(); } catch (error) { cleanupFailures.push(error); } }
      mirror.dispose();
      readiness.settle({ state: "disposed" });
      publishTermination({ state: "disposed", revision }, true);
      for (const controller of inputs) { try { controller.dispose(); } catch (error) { cleanupFailures.push(error); } }
      inputs.clear();
      lostListeners.clear();
      restoredListeners.clear();
      terminationListeners.clear();
      unregisterAuraApp(app);
      shutdown = worker.disposeStrict().then(
        () => { if (cleanupFailures.length) throw new AggregateError(cleanupFailures, "Worker app input cleanup failed."); },
        (error: unknown) => {
          if (cleanupFailures.length) throw new AggregateError([error, ...cleanupFailures], "Worker app cleanup failed.");
          throw error;
        }
      );
      void shutdown.catch((error: unknown) => { appendError(errorDetails(error).message); });
    },
    async disposeAsync() {
      app.dispose();
      await shutdown;
    }
  };
  // K3: camera (and time) extensions only need app.onFrame/nodes/scene, which
  // a worker app now provides host-side; the camera spec they write reaches
  // the worker through flushPatches.
  const extensionDisposers: (() => void)[] = [];
  for (const ext of appExtensionsAll()) {
    if (!WORKER_HOST_EXTENSIONS.has(ext.member)) continue;
    try {
      const value = ext.create(app, { flags: hostFlags, options });
      (app as unknown as Record<string, unknown>)[ext.member] = value;
      if (ext.dispose) { const disposeExt = ext.dispose; extensionDisposers.push(() => disposeExt(value)); }
    } catch (error) {
      appendError(`Worker app extension ${ext.member} unavailable: ${errorDetails(error).message}`);
    }
  }
  registerAuraApp(app);
  Object.defineProperty(app, AURA_APP_CANVAS, { value: canvas, enumerable: false });
  return { kind: "worker", app };
}
