import type { AuraApp, AuraBackend, AuraCreateAppRendererOptions, AuraSceneSnapshot, AuraScreenshot, WebGLSceneRenderer } from "../nodes/types.js";
import { formatDiagnosticError } from "../sanitizeDiagnostics.js";
import { resizeOffscreenCanvas, workerCanvasBackingSize, type OffscreenCanvasSize } from "./canvas.js";
import { createWorkerFrameScheduler, type WorkerScheduledFrame } from "./workerFrameLoop.js";
import { createWorkerKeyEventBuffer, createWorkerPointerEventBuffer } from "./workerProtocol.js";
import type { AuraWorkerEndpoint, AuraWorkerFrameResult, AuraWorkerHostEndpoint, AuraWorkerInput, AuraWorkerNodePatchOp, AuraWorkerPointer, AuraWorkerPointerEvent, AuraWorkerRenderFlags, AuraWorkerRequest, AuraWorkerResponse, AuraWorkerScreenshotPayload } from "./workerProtocol.js";
import { applyWorkerNodePatch, type AuraWorkerAppCall } from "./workerPatch.js";
import { bindWorkerAtmosphere, type WorkerAtmosphereBinding } from "./workerAtmosphere.js";
import { createWorkerEffectsReplayer } from "./workerEffects.js";
import type { AuraRuntimeNodeRegistry } from "../nodes/types.js";
import type { AuraAssetsOption } from "../../contracts/assets.js";
import { snapshotAuraAssetsOption } from "./assetsOptionSnapshot.js";
import { Texture, type TexturePixelData } from "@aura3d/rendering";
import { TextureHandle, auraTextureRefTexture } from "../nodes/texture.js";
import type { AuraTextureRef } from "../nodes/types.js";
import type { AuraAssetErrorEvent, AuraAssetProgressEvent } from "../nodes/types/runtime.js";
import { BatchedMeshState, batchedStateFor, registerBatchedState, type BatchedMeshStateSnapshot } from "../nodes/batchedState.js";

import { AuraWorkerError } from "./workerError.js";

export { AuraWorkerError } from "./workerError.js";

export interface AuraWorkerRendererOptions {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  /** A dedicated module worker whose entry calls installWorkerRenderer. Ownership passes to this handle. */
  readonly worker: AuraWorkerHostEndpoint;
  /** DOM world-label, accessible-text and diagnostics overlays are unavailable in a worker. */
  readonly scene: AuraSceneSnapshot;
  /** Transfer scene-owned buffers to the worker with init; these become detached on success.
   * CPU-backed 2D color texture handles are copied as bounded snapshots, not transferred:
   * later host changes require `setScene` to send a fresh snapshot. Recreated
   * handles receive worker-local IDs; repeated references share one handle.
   * At most 32 MiB of texture snapshots may be in flight per worker handle. */
  readonly sceneTransfer?: Transferable[];
  readonly renderer?: AuraCreateAppRendererOptions;
  /** Quality-rebuild flags and animation mixer the worker renderer resolves (the host app's options). */
  readonly flags?: AuraWorkerRenderFlags;
  /** Asset/decoder options, including an explicit same-origin codec base when supplied. */
  readonly assets?: AuraAssetsOption;
  readonly size?: OffscreenCanvasSize;
  readonly autoStart?: boolean;
  readonly resize?: boolean;
  readonly measureSize?: () => OffscreenCanvasSize;
  /** Install resize, pointer, keyboard and page-visibility forwarding for an HTML canvas. Default true. */
  readonly bridgeEvents?: boolean;
  readonly onDevice?: (state: "lost" | "restored") => void;
  readonly onBackend?: (backend: AuraBackend) => void;
  /** @internal Prepare a host-owned mirror before a worker-local replacement commits. */
  readonly prepareLocalScene?: (scene: AuraSceneSnapshot, revision: number, backend: AuraBackend, textures: ReadonlySet<TextureHandle>) => () => void;
  readonly onFrame?: (frame: AuraWorkerFrameResult) => void;
  readonly onCaptureFrame?: (frame: AuraWorkerFrameResult) => void;
  readonly onError?: (error: AuraWorkerError) => void;
  readonly onInput?: (input: AuraWorkerInput) => void;
  /** 5.4: asset progress of the worker renderer (the `createAuraApp` `onAssetProgress` event, sanitized in the worker). */
  readonly onAssetProgress?: (event: AuraAssetProgressEvent) => void;
  /** 5.4: asset load failures of the worker renderer; `error` is rebuilt on the host from the sanitized message. */
  readonly onAssetError?: (event: AuraAssetErrorEvent) => void;
  /** Maximum wait for worker teardown before terminating it. Default 5000 ms. */
  readonly disposeTimeoutMs?: number;
}

export interface AuraWorkerRenderer {
  readonly ready: Promise<void>;
  readonly backend: AuraBackend | undefined;
  setScene(scene: AuraSceneSnapshot, options?: {
    readonly signal?: AbortSignal;
    readonly transfer?: Transferable[];
    /** @internal Root scene revision synchronization. */
    readonly onCommit?: (revision: number | undefined) => void;
  }): Promise<void>;
  setInput(input: AuraWorkerInput): Promise<void>;
  flushInput(): Promise<void>;
  /**
   * K1: send batched node/camera changes; they apply between worker frames. Optional in the type (added in 5.3.0, a
   * minor release: existing implementations of this interface stay valid); every renderer the engine creates has it.
   */
  patch?(ops: readonly AuraWorkerNodePatchOp[]): Promise<void>;
  resize(size: OffscreenCanvasSize): Promise<void>;
  setVisible(visible: boolean): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  /** Recreate the renderer and its scene resources after device loss. */
  recover(): Promise<void>;
  step(deltaSeconds: number, time?: number): Promise<AuraWorkerFrameResult>;
  screenshotAsync(): Promise<AuraScreenshot>;
  /**
   * Request teardown and terminate the worker. Resolves only after the worker
   * acknowledges cleanup. Cleanup or transport failures reject; if the
   * acknowledgement times out the worker is force-terminated (listeners and
   * pending requests are still released) and the promise rejects with code
   * `dispose-timeout`. Repeated calls share the same pending or settled result.
   */
  dispose(): Promise<void>;
  disposeStrict(): Promise<void>;
}

/** A pre-transfer capability check; an unsupported canvas can still be used by a fallback. */
export function supportsWorkerRendering(canvas: HTMLCanvasElement | OffscreenCanvas): boolean {
  if (!canvas || typeof canvas !== "object") return false;
  if (typeof (canvas as HTMLCanvasElement).transferControlToOffscreen === "function") return true;
  return typeof OffscreenCanvas !== "undefined" && canvas instanceof OffscreenCanvas;
}

const transferredCanvases = new WeakSet<object>();
const canvasTransferAttempts = new WeakSet<object>();
const MAX_PENDING_REQUESTS = 128;

export function workerCanvasTransferAttempted(canvas: HTMLCanvasElement | OffscreenCanvas): boolean {
  return canvasTransferAttempts.has(canvas);
}

/** Raw direct-module URL; bundled applications should use createWorkerRendererWorker instead. */
export function workerRendererUrl(): URL {
  return new URL("./render.worker.js", import.meta.url);
}

/** Choose the explicit fallback before transferring ownership. */
export function createWorkerRendererOrFallback<T>(options: AuraWorkerRendererOptions, fallback: () => T): { readonly kind: "worker"; readonly renderer: AuraWorkerRenderer } | { readonly kind: "fallback"; readonly renderer: T } {
  if (!supportsWorkerRendering(options.canvas)) {
    options.worker.terminate();
    return { kind: "fallback", renderer: fallback() };
  }
  return { kind: "worker", renderer: createWorkerRenderer(options) };
}

export function createWorkerRenderer(options: AuraWorkerRendererOptions): AuraWorkerRenderer {
  const { canvas, worker } = options;
  if (!supportsWorkerRendering(canvas)) throw new AuraWorkerError("OffscreenCanvas transfer is unavailable; use a main-thread renderer.", "unsupported");
  if (transferredCanvases.has(canvas)) throw new AuraWorkerError("Canvas ownership has already been transferred.", "already-transferred");
  if (!worker || typeof worker.postMessage !== "function" || typeof worker.terminate !== "function" || typeof worker.addEventListener !== "function" || typeof worker.removeEventListener !== "function") {
    throw new AuraWorkerError("A dedicated worker endpoint is required.", "invalid-worker");
  }
  const timeoutMs = options.disposeTimeoutMs ?? 5000;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0 || timeoutMs > 2_147_483_647) throw new RangeError("disposeTimeoutMs must be within the timer range.");
  // Validate and capture before transferring canvas ownership to the worker.
  const assetOptions = snapshotAuraAssetsOption(options.assets);
  validateScene(options.scene);
  const size = options.size ?? options.measureSize?.() ?? measureWorkerCanvas(canvas);
  workerCanvasBackingSize(size);
  if (options.sceneTransfer?.includes(canvas as Transferable)) throw new AuraWorkerError("The canvas is transferred automatically; do not include it in sceneTransfer.", "invalid-transfer");
  if (options.sceneTransfer && new Set(options.sceneTransfer).size !== options.sceneTransfer.length) {
    throw new AuraWorkerError("Each scene transferable may only appear once.", "invalid-transfer");
  }
  // Count snapshots until their original worker operation settles, not merely
  // until a caller aborts: queued worker messages can still retain the bytes.
  let inFlightTextureBytes = 0;
  // Raised to two copies of the initial scene once it is measured, so a texture-heavy app can replace its scene.
  let inFlightLimit = Number.POSITIVE_INFINITY;
  const makeTextureReservation = () => {
    let held = 0;
    return {
      reserve(size: number): void {
        if (inFlightTextureBytes + size > inFlightLimit) {
          throw new AuraWorkerError("Worker texture snapshot budget is full; wait for an in-flight scene request to finish.", "worker-texture-budget", "recoverable");
        }
        held += size;
        inFlightTextureBytes += size;
      },
      release(): void { inFlightTextureBytes -= held; held = 0; }
    };
  };
  const initialReservation = makeTextureReservation();
  let initialScene: AuraSceneSnapshot;
  // Fail before transferring the canvas for non-cloneable scene/options.
  // Transfer-only resources (such as MessagePort) must be masked for this
  // non-destructive dry run; the original objects are sent in the real post.
  try {
    initialScene = snapshotTransferableScene(options.scene, options.sceneTransfer ?? [], initialReservation.reserve);
    inFlightLimit = Math.max(MAX_IN_FLIGHT_WORKER_TEXTURE_BYTES, 2 * inFlightTextureBytes);
    if (typeof structuredClone === "function") structuredClone(maskTransferables({ scene: initialScene, renderer: options.renderer, assets: assetOptions }, options.sceneTransfer ?? []));
  } catch (error) { initialReservation.release(); throw error; }

  let sequence = 0;
  let closed = false;
  let activeBackend: AuraBackend | undefined;
  let activeSceneRevision = 0;
  let disposing: Promise<void> | undefined;
  let strictDisposing: Promise<void> | undefined;
  let disposalFailure: Error | undefined;
  let strictDisposalFailure: Error | undefined;
  let flushHostInput = (): Promise<void> => Promise.resolve();
  const cleanups: (() => void)[] = [];
  let localProposal: { revision: number; backend: AuraBackend; commit: () => void; textures: Set<TextureHandle> } | undefined;
  const releaseLocalProposal = (): void => {
    const proposal = localProposal;
    localProposal = undefined;
    if (!proposal) return;
    for (const handle of proposal.textures) {
      try { handle.dispose(); } catch { strictDisposalFailure ??= new AuraWorkerError("Worker scene mirror cleanup failed.", "worker-cleanup-failed"); }
    }
  };
  cleanups.push(releaseLocalProposal);
  const pending = new Map<number, { resolve: (value: Extract<AuraWorkerResponse, { type: "result" }>) => void; reject: (error: Error) => void; cleanup: () => void }>();
  // Aborted callers are removed from `pending`, but their original messages
  // can still be queued or mounting in the worker until the worker responds.
  const outstanding = new Set<number>();
  const textureReservations = new Map<number, () => void>();
  const releaseTextureReservation = (id: number): void => {
    const release = textureReservations.get(id);
    textureReservations.delete(id);
    release?.();
  };
  const failAll = (error: Error): void => {
    for (const request of pending.values()) { request.cleanup(); request.reject(error); }
    pending.clear();
  };
  const finish = (): void => {
    if (closed) return;
    closed = true;
    activeBackend = undefined;
    for (const cleanup of cleanups.splice(0)) { try { cleanup(); } catch { strictDisposalFailure ??= new AuraWorkerError("Worker host cleanup failed.", "worker-cleanup-failed"); /* release every owned resource */ } }
    try { worker.removeEventListener("message", onMessage); } catch { strictDisposalFailure ??= new AuraWorkerError("Worker listener cleanup failed.", "worker-cleanup-failed"); /* endpoint may already be gone */ }
    try { worker.removeEventListener("error", onWorkerError); } catch { strictDisposalFailure ??= new AuraWorkerError("Worker listener cleanup failed.", "worker-cleanup-failed"); /* endpoint may already be gone */ }
    try { worker.removeEventListener("messageerror", onWorkerError); } catch { strictDisposalFailure ??= new AuraWorkerError("Worker listener cleanup failed.", "worker-cleanup-failed"); /* endpoint may already be gone */ }
    failAll(new AuraWorkerError("Worker renderer was disposed.", "disposed"));
    try { worker.terminate(); } catch { strictDisposalFailure ??= new AuraWorkerError("Worker termination failed.", "worker-termination-failed"); /* endpoint may already be gone */ }
    outstanding.clear();
    initialReservation.release();
    for (const id of textureReservations.keys()) releaseTextureReservation(id);
  };
  const onMessage = (event: MessageEvent<AuraWorkerResponse>): void => {
    if (closed) return;
    const message = event.data;
    if (!message || typeof message !== "object") return;
    if (message.type === "device") {
      if (!disposing) {
        if (message.backend !== undefined) activeBackend = message.backend;
        options.onDevice?.(message.state);
      }
      return;
    }
    if (message.type === "backend") {
      if (!disposing) { activeBackend = message.backend; options.onBackend?.(message.backend); }
      return;
    }
    if (message.type === "scene-proposal") {
      if (disposing) return;
      let error: { code: string; message: string } | undefined;
      let created: Set<TextureHandle> | undefined;
      try {
        if (!options.prepareLocalScene || localProposal || !Number.isSafeInteger(message.revision) || message.revision < 1) {
          throw new AuraWorkerError("Unexpected worker-local scene proposal.", "invalid-scene-sync");
        }
        validateScene(message.scene);
        const hydrated = rehydrateWorkerScene(message.scene, new Set());
        created = hydrated.created;
        const commit = options.prepareLocalScene(hydrated.scene, message.revision, message.backend, created);
        if (disposing || closed) {
          for (const handle of created) {
            try { handle.dispose(); } catch { strictDisposalFailure ??= new AuraWorkerError("Worker scene mirror cleanup failed.", "worker-cleanup-failed"); }
          }
          return;
        }
        localProposal = { revision: message.revision, backend: message.backend, commit, textures: created };
        created = undefined;
      } catch (cause) {
        if (created) for (const handle of created) {
          try { handle.dispose(); } catch { strictDisposalFailure ??= new AuraWorkerError("Worker scene mirror cleanup failed.", "worker-cleanup-failed"); }
        }
        if (disposing || closed) return;
        const actual = asWorkerError(cause, "recoverable");
        error = { code: actual.code, message: actual.message };
      }
      try { worker.postMessage({ type: "scene-ack", id: ++sequence, revision: message.revision, ...(error ? { error } : {}) }); }
      catch {
        const failure = new AuraWorkerError("Could not acknowledge a worker-local scene.", "scene-sync-failed");
        try { if (!disposing) options.onError?.(failure); } finally { failAll(failure); finish(); }
      }
      return;
    }
    if (message.type === "scene-abort") {
      if (localProposal?.revision === message.revision) releaseLocalProposal();
      return;
    }
    if (message.type === "scene-commit") {
      if (disposing) return;
      const proposal = localProposal;
      if (!proposal || proposal.revision !== message.revision) {
        const failure = new AuraWorkerError("Worker committed an unknown scene proposal.", "invalid-scene-sync");
        try { options.onError?.(failure); } finally { failAll(failure); finish(); }
        return;
      }
      localProposal = undefined;
      try {
        activeBackend = proposal.backend;
        proposal.commit();
        activeSceneRevision = Math.max(activeSceneRevision, proposal.revision);
      } catch {
        for (const handle of proposal.textures) {
          try { handle.dispose(); } catch { strictDisposalFailure ??= new AuraWorkerError("Worker scene mirror cleanup failed.", "worker-cleanup-failed"); }
        }
        const failure = new AuraWorkerError("Could not publish a worker-local scene.", "scene-sync-failed");
        try { if (!disposing) options.onError?.(failure); } finally { failAll(failure); finish(); }
      }
      return;
    }
    if (message.type === "presented") { if (!disposing) options.onFrame?.(message.result); return; }
    if (message.type === "capture-presented") { if (!disposing) options.onCaptureFrame?.(message.result); return; }
    if (message.type === "asset-progress") { if (!disposing) { try { options.onAssetProgress?.(message.event); } catch { /* listener failure never fails the renderer */ } } return; }
    if (message.type === "asset-error") {
      if (!disposing) {
        const { url, assetId, message: text } = message.event;
        try { options.onAssetError?.({ ...(url !== undefined ? { url } : {}), ...(assetId !== undefined ? { assetId } : {}), error: new Error(text), message: text }); } catch { /* listener failure never fails the renderer */ }
      }
      return;
    }
    if (message.type !== "result" && message.type !== "error") return;
    if (message.backend !== undefined && (message.type === "result" || message.severity === "recoverable")) activeBackend = message.backend;
    outstanding.delete(message.id);
    releaseTextureReservation(message.id);
    const entry = pending.get(message.id);
    if (message.type === "error") {
      const error = new AuraWorkerError(message.message, message.code, message.severity);
      try {
        if (entry) { pending.delete(message.id); entry.cleanup(); entry.reject(error); }
        else if (message.id === 0 && !disposing) options.onError?.(error);
      } finally {
        if (message.severity === "terminal") {
          if (disposing) disposalFailure ??= error;
          // An automatic frame failure can precede the response to a manual
          // request. Preserve the actual error for all pending callers.
          failAll(error);
          finish();
        }
      }
      return;
    }
    if (entry) { pending.delete(message.id); entry.cleanup(); entry.resolve(message); }
  };
  const onWorkerError = (): void => {
    const error = new AuraWorkerError("Worker renderer terminated or could not deserialize a message.", "worker-failure");
    if (disposing) disposalFailure ??= error;
    failAll(error);
    try { if (!disposing) options.onError?.(error); } finally { finish(); }
  };
  let offscreen: OffscreenCanvas;
  try {
    // Listener setup may fail on an invalid endpoint. Do it before canvas
    // ownership is transferred, and release partial setup if anything fails.
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onWorkerError);
    worker.addEventListener("messageerror", onWorkerError);
    canvasTransferAttempts.add(canvas);
    offscreen = typeof (canvas as HTMLCanvasElement).transferControlToOffscreen === "function"
      ? (canvas as HTMLCanvasElement).transferControlToOffscreen()
      : canvas as OffscreenCanvas;
    transferredCanvases.add(canvas);
    transferredCanvases.add(offscreen);
  } catch (error) {
    finish();
    throw error;
  }

  const send = (message: WorkerRequestWithoutId, transfer: Transferable[] = [], signal?: AbortSignal, releaseReservation?: () => void): Promise<Extract<AuraWorkerResponse, { type: "result" }>> => {
    if (closed || (disposing && message.type !== "dispose")) { releaseReservation?.(); return Promise.reject(new AuraWorkerError("Worker renderer is disposed.", "disposed")); }
    if (signal?.aborted) { releaseReservation?.(); return Promise.reject(new AuraWorkerError("Worker request cancelled.", "cancelled", "recoverable")); }
    if (message.type !== "dispose" && outstanding.size >= MAX_PENDING_REQUESTS) { releaseReservation?.(); return Promise.reject(new AuraWorkerError("Worker request queue is full.", "queue-full", "recoverable")); }
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const abort = (): void => {
        const entry = pending.get(id);
        if (!entry) return;
        pending.delete(id); entry.cleanup();
        reject(new AuraWorkerError("Worker request cancelled.", "cancelled", "recoverable"));
        try { worker.postMessage({ type: "cancel", id: ++sequence, targetId: id }); } catch { /* worker already gone */ }
      };
      const cleanup = (): void => signal?.removeEventListener("abort", abort);
      pending.set(id, { resolve, reject, cleanup });
      if (message.type !== "dispose") outstanding.add(id);
      if (releaseReservation) textureReservations.set(id, releaseReservation);
      try {
        signal?.addEventListener("abort", abort, { once: true });
        if (!pending.has(id)) { outstanding.delete(id); releaseTextureReservation(id); return; }
        worker.postMessage({ ...message, id } as AuraWorkerRequest, transfer);
      }
      catch (error) {
        pending.delete(id); outstanding.delete(id); cleanup(); releaseTextureReservation(id);
        const actual = error instanceof Error ? error : new Error(formatDiagnosticError(error));
        // A structured-clone/transfer failure does not post the replacement,
        // so the worker still owns its previous scene. Other transport errors
        // do not establish that the worker is usable and remain terminal.
        if (message.type === "scene" && actual.name === "DataCloneError" && !closed && !disposing) {
          reject(new AuraWorkerError(actual.message, "invalid-transfer", "recoverable"));
        } else reject(actual);
      }
    });
  };
  const rendererGlobals = collectWorkerRendererGlobals();
  const ready = send({ type: "init", canvas: offscreen, scene: initialScene, renderer: options.renderer, assets: assetOptions, size, autoStart: options.autoStart !== false,
    ...(options.flags ? { flags: options.flags } : {}),
    ...(options.prepareLocalScene ? { syncLocalScenes: true } : {}),
    ...(options.onAssetProgress || options.onAssetError ? { assetEvents: true } : {}),
    ...(rendererGlobals ? { globals: rendererGlobals } : {}) }, [offscreen, ...(options.sceneTransfer ?? [])], undefined, initialReservation.release).then((response) => {
    if (options.prepareLocalScene && (response.syncLocalScenes !== true || response.sceneRevision !== 1)) {
      throw new AuraWorkerError("Worker does not support synchronized local scene replacement.", "scene-sync-unsupported");
    }
    if (options.prepareLocalScene) activeSceneRevision = Math.max(activeSceneRevision, 1);
  });
  void ready.catch(() => finish());
  const api: AuraWorkerRenderer = {
    ready,
    get backend() { return activeBackend; },
    setScene(scene, requestOptions) {
      if (closed || disposing) return Promise.reject(new AuraWorkerError("Worker renderer is disposed.", "disposed"));
      if (requestOptions?.signal?.aborted) return Promise.reject(cancelled());
      if (outstanding.size >= MAX_PENDING_REQUESTS) return Promise.reject(new AuraWorkerError("Worker request queue is full.", "queue-full", "recoverable"));
      const reservation = makeTextureReservation();
      try {
        validateScene(scene);
        const transfer = requestOptions?.transfer ?? [];
        if (new Set(transfer).size !== transfer.length) throw new AuraWorkerError("Each scene transferable may only appear once.", "invalid-transfer");
        const snapshot = snapshotTransferableScene(scene, transfer, reservation.reserve);
        if (typeof structuredClone === "function") structuredClone(maskTransferables(snapshot, transfer));
        const previousRevision = activeSceneRevision;
        return send({ type: "scene", scene: snapshot }, requestOptions?.transfer, requestOptions?.signal, reservation.release).then((response) => {
          if (options.prepareLocalScene && (!Number.isSafeInteger(response.sceneRevision) || response.sceneRevision! <= previousRevision)) {
            const failure = new AuraWorkerError("Worker did not report a newer mounted scene revision.", "invalid-scene-sync");
            failAll(failure);
            finish();
            throw failure;
          }
          if (response.sceneRevision !== undefined) activeSceneRevision = Math.max(activeSceneRevision, response.sceneRevision);
          if (!closed && !disposing) requestOptions?.onCommit?.(response.sceneRevision);
        });
      } catch (error) {
        reservation.release();
        // Preflight happens before any scene message is posted. Even a
        // non-AuraWorkerError from structuredClone leaves the old owner intact.
        const actual = asWorkerError(error);
        return Promise.reject(new AuraWorkerError(actual.message, actual.code, "recoverable"));
      }
    },
    setInput(input) {
      if (!closed && !disposing && options.onInput) {
        try { options.onInput(structuredClone(input)); }
        catch (error) {
          // The observer may synchronously dispose the handle before throwing.
          // Its failure never changes ownership of the worker renderer.
          if (!closed && !disposing) {
            const actual = asWorkerError(error);
            try { options.onError?.(new AuraWorkerError(actual.message, actual.code, "recoverable")); } catch {}
          }
        }
      }
      return send({ type: "input", input }).then(() => undefined);
    },
    flushInput: () => flushHostInput(),
    patch: (ops) => ops.length === 0 ? Promise.resolve() : send({ type: "patch", ops }).then(() => undefined),
    resize(next) {
      try { workerCanvasBackingSize(next); } catch (error) { return Promise.reject(error); }
      return send({ type: "resize", size: next }).then(() => undefined);
    },
    setVisible: (visible) => send({ type: "visibility", visible }).then(() => undefined),
    pause: () => send({ type: "pause" }).then(() => undefined),
    resume: () => send({ type: "resume" }).then(() => undefined),
    recover: () => send({ type: "recover" }).then(() => undefined),
    step: (deltaSeconds, time) => send({ type: "frame", deltaSeconds, time }).then(({ result }) => {
      if (!result) throw new AuraWorkerError("Worker returned no frame result.", "invalid-response");
      return result;
    }),
    screenshotAsync: () => send({ type: "screenshot" }).then(async ({ screenshot }) => {
      if (!screenshot || !screenshot.blob || screenshot.blob.type !== "image/png" || typeof screenshot.blob.arrayBuffer !== "function"
        || !Number.isSafeInteger(screenshot.width) || screenshot.width < 1 || !Number.isSafeInteger(screenshot.height) || screenshot.height < 1) {
        throw new AuraWorkerError("Worker returned an invalid screenshot.", "invalid-response");
      }
      const bytes = new Uint8Array(await screenshot.blob.arrayBuffer());
      if (closed || disposing) throw new AuraWorkerError("Worker renderer is disposed.", "disposed");
      const chunks: string[] = [];
      for (let i = 0; i < bytes.length; i += 0x8000) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 0x8000)));
      return { mimeType: "image/png" as const, dataUrl: `data:image/png;base64,${btoa(chunks.join(""))}`, width: screenshot.width, height: screenshot.height };
    }),
    dispose() {
      if (disposing) return disposing;
      if (closed) return Promise.resolve();
      // Publish the shared result before cleanup: releasing a host event can
      // synchronously reenter disposal or deliver a worker failure.
      let resolveDisposal!: () => void;
      let rejectDisposal!: (error: unknown) => void;
      disposing = new Promise<void>((resolve, reject) => { resolveDisposal = resolve; rejectDisposal = reject; });
      // Stop forwarding events immediately; in-flight requests are rejected on final teardown.
      for (const cleanup of cleanups.splice(0)) { try { cleanup(); } catch { strictDisposalFailure ??= new AuraWorkerError("Worker host cleanup failed.", "worker-cleanup-failed"); /* release remaining listeners */ } }
      let settled = false;
      const settle = (error?: unknown): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        finish();
        if (error === undefined) resolveDisposal(); else rejectDisposal(error);
      };
      // 5.0: forced termination after a timeout is not a clean teardown. The
      // worker is still terminated and its listeners released, but dispose()
      // rejects with the same dispose-timeout error disposeStrict() reports.
      const timer = setTimeout(() => {
        const timeout = new AuraWorkerError("Worker teardown was not acknowledged before termination.", "dispose-timeout");
        strictDisposalFailure ??= timeout;
        settle(timeout);
      }, timeoutMs);
      void send({ type: "dispose" }).then(
        () => settle(disposalFailure),
        (error: unknown) => settle(disposalFailure ?? error)
      );
      return disposing;
    },
    disposeStrict() {
      if (!strictDisposing) strictDisposing = api.dispose().then(() => { if (strictDisposalFailure) throw strictDisposalFailure; });
      return strictDisposing;
    }
  };
  if (options.bridgeEvents !== false && typeof (canvas as HTMLCanvasElement).getBoundingClientRect === "function") {
    try { flushHostInput = installHostEvents(canvas as HTMLCanvasElement, api, cleanups, options); }
    catch (error) { finish(); throw error; }
  }
  return api;
}

export interface AuraWorkerRendererMountContext {
  /** A snapshot of the worker owner's asset configuration. */
  readonly assets?: AuraAssetsOption;
  /** Current mount cancellation and its fixed authentication generation. */
  readonly request: { readonly signal: AbortSignal; readonly securityContext?: string };
}

type WorkerRendererFactory = (canvas: OffscreenCanvas, scene: AuraSceneSnapshot, options: AuraCreateAppRendererOptions | undefined, signal: AbortSignal, context?: AuraWorkerRendererMountContext) => Promise<WebGLSceneRenderer>;

export interface AuraWorkerRuntimeOptions {
  /**
   * Override for custom devices or browser-shaped source tests. The default
   * compiles Aura3D scenes. Custom renderers own their asset acquisitions and
   * must apply the supplied mount request generation and cancellation to them.
   */
  readonly createRenderer?: WorkerRendererFactory;
  /** Runs inside the worker before each frame. Return a distinct snapshot to replace the read-only current scene. */
  readonly onFrame?: (frame: WorkerScheduledFrame<AuraWorkerInput>, scene: AuraSceneSnapshot) => AuraSceneSnapshot | void | Promise<AuraSceneSnapshot | void>;
}

type WorkerRequestWithoutId = AuraWorkerRequest extends infer Request
  ? Request extends { id: number } ? Omit<Request, "id"> : never
  : never;

/** Install a single renderer owner in a dedicated worker. Call the returned function to dispose the endpoint. */
export function installWorkerRenderer(endpoint: AuraWorkerEndpoint<AuraWorkerRequest, AuraWorkerResponse>, options: AuraWorkerRuntimeOptions = {}): () => Promise<void> {
  let canvas: OffscreenCanvas | undefined;
  let scene: AuraSceneSnapshot | undefined;
  let rendererOptions: AuraCreateAppRendererOptions | undefined;
  let assetOptions: AuraAssetsOption | undefined;
  let renderFlags: AuraWorkerRenderFlags | undefined;
  let renderer: WebGLSceneRenderer | undefined;
  let sceneTextures = new Set<TextureHandle>();
  let subscriptions: (() => void)[] = [];
  let closing = false;
  let lastId = 0;
  let tail: Promise<void> = Promise.resolve();
  let lastFrame: AuraWorkerFrameResult | undefined;
  let runRequested = false;
  let reportedDeviceLost = false;
  let syncLocalScenes = false;
  let assetEvents = false;
  // 5.4: textured-material status, read every TEXTURED_SAMPLE_FRAMES presented frames (the diagnostics report is not
  // cheap) and forwarded only when it changed. A new renderer starts over.
  let texturedRenderer: object | undefined;
  let texturedSignature: string | undefined;
  let texturedFrames = 0;
  const sampleTexturedMaterials = (current: object): AuraWorkerFrameResult["texturedMaterials"] => {
    if (current !== texturedRenderer) { texturedRenderer = current; texturedSignature = undefined; texturedFrames = 0; }
    if (texturedFrames++ % TEXTURED_SAMPLE_FRAMES !== 0) return undefined;
    let rows: AuraWorkerFrameResult["texturedMaterials"];
    try { rows = (current as { diagnostics?: { runtime?: { texturedMaterials?: AuraWorkerFrameResult["texturedMaterials"] } } }).diagnostics?.runtime?.texturedMaterials; }
    catch { return undefined; }
    if (!Array.isArray(rows)) return undefined;
    const signature = rows.map((row) => `${row.nodeName}\u0000${row.levelName}\u0000${row.status}\u0000${row.pixelBacked}`).join("\u0001");
    if (signature === texturedSignature) return undefined;
    texturedSignature = signature;
    return rows.map(({ pendingMs: _pending, ...row }) => ({ ...row, slots: [...row.slots], warnings: [...row.warnings] }));
  };
  // 5.4 app calls (setOutput, post.setEffect/setEffectEnabled): merged state, re-applied after a remount.
  let appOutput: Record<string, unknown> | undefined;
  let postBridge: typeof import("../postBridge.js") | undefined;
  let outputBridge: typeof import("../../lanes/prd01/outputSurface.js") | undefined;
  let flagsModule: typeof import("../../contracts/flags.js") | undefined;
  let postSurface: import("../../contracts/post.js").AuraPostSurface | undefined;
  const postPassReleases = new Map<number, () => void>();
  // 5.4 `app.atmosphere` calls: the live worker atmospheres (one per mounted renderer) and the merged state that a
  // new mount replays without a transition (a remount rebuilds the atmosphere).
  const liveAtmospheres = new Set<WorkerAtmosphereBinding>();
  const effectsReplayer = createWorkerEffectsReplayer();
  // 5.4 `app.lighting`: one PRD-02 lighting runtime per mounted renderer (keyed by its runtime node registry, as the
  // main-thread extension is keyed by app.nodes); the environment state is replayed on a new mount.
  type WorkerLighting = { setEnvironmentIntensity(v: number): void; setEnvironmentRotation(r: number): void; setEnvironment(t: unknown, o?: unknown): void; updateProbe(n: string): Promise<void>; rebakeIrradiance(n?: string): Promise<void>; dispose(): void };
  const liveLightings = new Set<WorkerLighting>();
  const lightingState: { intensity?: number; rotation?: number; environment?: readonly unknown[] } = {};
  const replayLighting = (lighting: WorkerLighting): void => {
    if (lightingState.environment) lighting.setEnvironment(lightingState.environment[0], { ...(lightingState.environment[1] as object | undefined), crossfadeSeconds: 0 });
    if (lightingState.intensity !== undefined) lighting.setEnvironmentIntensity(lightingState.intensity);
    if (lightingState.rotation !== undefined) lighting.setEnvironmentRotation(lightingState.rotation);
  };
  const applyLightingCall = (call: AuraWorkerAppCall, args: readonly unknown[]): void => {
    if (call === "lighting.setEnvironmentIntensity") lightingState.intensity = args[0] as number;
    else if (call === "lighting.setEnvironmentRotation") lightingState.rotation = args[0] as number;
    else if (call === "lighting.setEnvironment") {
      lightingState.environment = [...args];
      // A swap with its own intensity / yaw supersedes the earlier separate calls.
      const opts = args[1] as { intensity?: number; rotationDeg?: number } | undefined;
      if (opts?.intensity !== undefined) lightingState.intensity = opts.intensity;
      if (opts?.rotationDeg !== undefined) lightingState.rotation = (opts.rotationDeg * Math.PI) / 180;
    }
    const method = call.slice("lighting.".length) as "setEnvironmentIntensity" | "setEnvironmentRotation" | "setEnvironment" | "updateProbe" | "rebakeIrradiance";
    let failure: unknown;
    for (const lighting of liveLightings) {
      try { void (lighting[method] as (...values: unknown[]) => unknown)(...args); } catch (error) { failure ??= error; }
    }
    if (failure !== undefined) throw failure;
  };
  const detachEffects = new Map<WorkerAtmosphereBinding, () => void>();
  const atmosphereState: { fog?: readonly unknown[]; sky?: Record<string, unknown>; wetness?: number } = {};
  const replayAtmosphere = (binding: WorkerAtmosphereBinding): void => {
    const controls = binding.controls;
    if (atmosphereState.fog) controls.setFog(atmosphereState.fog[0] as Parameters<typeof controls.setFog>[0], { ...(atmosphereState.fog[1] as object | undefined), transitionSeconds: 0 } as Parameters<typeof controls.setFog>[1]);
    if (atmosphereState.sky) controls.setSky(atmosphereState.sky as Parameters<typeof controls.setSky>[0], { transitionSeconds: 0 });
    if (atmosphereState.wetness !== undefined) controls.setWetness(atmosphereState.wetness, { transitionSeconds: 0 });
  };
  let sceneRevision = 0;
  // Failed proposals must not reuse an ID: a late acknowledgement may still
  // be in flight when the next frame proposes another scene.
  let sceneSequence = 0;
  let localAck: { revision: number; resolve: () => void; reject: (error: Error) => void } | undefined;
  const pointerEvents = createWorkerPointerEventBuffer();
  const keyEvents = createWorkerKeyEventBuffer();
  const lifetime = new AbortController();
  const controllers = new Map<number, AbortController>();
  const send = (message: AuraWorkerResponse): void => {
    if (closing) return;
    if (message.type === "device") {
      reportedDeviceLost = message.state === "lost";
      const backend = message.state === "restored" ? renderer?.backend : undefined;
      endpoint.postMessage(backend ? { ...message, backend } : message);
    } else {
      endpoint.postMessage(message);
    }
  };
  const proposeLocalScene = async (value: AuraSceneSnapshot, revision: number, backend: AuraBackend): Promise<{ verify: () => void; commit: () => void }> => {
    const snapshot = snapshotLocalScene(value);
    await new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let settled = false;
      const abort = () => settle(cancelled());
      const settle = (error?: Error) => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        lifetime.signal.removeEventListener("abort", abort);
        localAck = undefined;
        if (error) reject(error); else resolve();
      };
      if (closing || lifetime.signal.aborted) { reject(cancelled()); return; }
      lifetime.signal.addEventListener("abort", abort, { once: true });
      localAck = { revision, resolve: () => settle(), reject: (error) => settle(error) };
      try {
        timer = setTimeout(() => settle(new AuraWorkerError("Worker-local scene synchronization timed out.", "scene-sync-timeout", "recoverable")), 5000);
        send({ type: "scene-proposal", id: 0, revision, scene: snapshot, backend });
      }
      catch { settle(new AuraWorkerError("Could not send a worker-local scene snapshot.", "scene-sync-failed", "recoverable")); }
    });
    return {
      verify() {
        if (!equalLocalSnapshots(snapshot, snapshotLocalScene(value))) {
          throw new AuraWorkerError("Worker-local scene changed while its snapshot was being synchronized.", "scene-sync-conflict", "recoverable");
        }
      },
      commit() {
        try { send({ type: "scene-commit", id: 0, revision }); }
        catch { throw new AuraWorkerError("Could not publish a worker-local scene.", "scene-sync-failed"); }
        sceneRevision = revision;
      }
    };
  };
  const disposeRenderer = async (): Promise<void> => {
    const failures: unknown[] = [];
    for (const unsubscribe of subscriptions.splice(0)) { try { unsubscribe(); } catch (error) { failures.push(error); } }
    const old = renderer; renderer = undefined;
    try { old?.dispose(); } catch (error) { failures.push(error); }
    try { await old?.whenDisposed?.(); } catch (error) { failures.push(error); }
    if (failures.length) throw new AggregateError(failures, "Worker renderer cleanup failed.");
  };
  const createRenderer: WorkerRendererFactory = options.createRenderer ?? (async (target, next, configuration, signal, context) => {
    const [{ createProductionRuntimeSceneRenderer }, { analyzeProductionBridgeEligibility }, { groups }, { normalizeCreateAppRendererOptions }, { resolveQrFlags, qrFlagsWithAnimationMixer }, actorAnimation, actorFlags, colorPolicy, shaderFailures, { createAuraRuntimeNodeRegistry }] = await Promise.all([
      import("../compiler/renderer.js"), import("../compiler/observations.js"), import("../nodes/groups.js"), import("./rendererOptions.js"),
      import("../../contracts/flags.js"), import("./actorAnimationHandle.js"), import("../../production-runtime/actor/extensions.js"),
      import("../compiler/color.js"), import("../lazy/renderingLazy.js"), import("./runtimeNodes.js")
    ]);
    // Node-handle extensions whose calls host patches replay (prd09 instance
    // transforms, used by game FX pools); lanes are not loaded in the worker.
    const [{ nodeHandleExtensionFor, registerNodeHandleExtension }, { instanceTransformsExtension }] = await Promise.all([
      import("../../contracts/runtimeNodes.js"), import("../nodes/game/instanceTransforms.js")
    ]);
    if (!nodeHandleExtensionFor("setInstanceTransforms")) registerNodeHandleExtension(instanceTransformsExtension);
    if (signal.aborted) throw cancelled();
    // Keep the scene admission checks applied by the DOM mount wrapper; GPU
    // ownership and asset cancellation are passed directly to the compiler.
    const selection = normalizeCreateAppRendererOptions(configuration);
    if (selection.mode !== "production") throw new AuraWorkerError(`Renderer mode "${selection.mode}" is unavailable. Use the production renderer.`, "backend-fallback");
    const eligibility = analyzeProductionBridgeEligibility(groups.flatten(next.nodes));
    if (!eligibility.eligible) throw new AuraWorkerError(`Aura3D production renderer rejected this scene: ${eligibility.reasons.join("; ")}`, "backend-fallback");
    // The compiler uses this canvas for its backing dimensions, context and
    // per-canvas state; the worker does not mount DOM overlays.
    const owner = {};
    // The host app's qualityRebuild flags and animation mixer (absent: the defaults, as before).
    const flags = qrFlagsWithAnimationMixer(resolveQrFlags({ ...(renderFlags?.qualityRebuild === undefined ? {} : { options: renderFlags.qualityRebuild }), ...(renderFlags?.url === undefined ? {} : { url: renderFlags.url }) }), renderFlags?.animationMixer);
    // K1: the registry node patches write through, read by the renderer every frame.
    // Node-handle extensions replayed from host patches read the app's scene (prd09 setInstanceTransforms).
    const runtimeNodes = createAuraRuntimeNodeRegistry(next, { flags, app: { scene: next } as unknown as AuraApp }) as AuraRuntimeNodeRegistry & { dispose?: () => void };
    const animation = actorAnimation.createActorAnimationContext(flags);
    actorAnimation.bindActorAnimationContext(owner, animation);
    actorFlags.setTypedGLBActorQrFlags(flags, owner);
    const releaseColor = colorPolicy.setPrd01ColorParsing(flags.on("A3D_QR_CORE") ? { strict: flags.on("A3D_QR_STRICT") } : null, owner);
    const failureStore = shaderFailures.createShaderFailureStore();
    shaderFailures.bindShaderFailureStore(owner, failureStore);
    shaderFailures.setShaderFailureMode(configuration?.shaderFailures, failureStore);
    // 5.4: the host app's onAssetProgress/onAssetError. Model and texture requests find the channel through the runtime
    // owner (as on the main thread); events are sanitized by the scope before they are posted.
    const assetEventChannel = assetEvents ? await import("../assetEvents.js") : undefined;
    if (assetEventChannel) {
      assetEventChannel.bindAppAssetEventScope(owner, assetEventChannel.createAppAssetEventScope({
        onAssetProgress: (event) => send({ type: "asset-progress", id: 0, event: { ...event } }),
        onAssetError: (event) => send({ type: "asset-error", id: 0, event: {
          ...(event.url !== undefined ? { url: event.url } : {}), ...(event.assetId !== undefined ? { assetId: event.assetId } : {}),
          message: event.message ?? "Asset load failed."
        } })
      }));
    }
    let cleaned = false;
    // PRD-07: the main-thread app's atmosphere extension (live fog/sky state the compiler reads under A3D_QR_VFX_FOG).
    let atmosphere: WorkerAtmosphereBinding | null = null;
    let lighting: WorkerLighting | null = null;
    const cleanup = (): void => {
      if (cleaned) return;
      cleaned = true;
      if (lighting) { liveLightings.delete(lighting); try { lighting.dispose(); } catch { /* lighting cleanup is best effort */ } }
      if (atmosphere) { liveAtmospheres.delete(atmosphere); detachEffects.get(atmosphere)?.(); detachEffects.delete(atmosphere); }
      try { atmosphere?.dispose(); } catch { /* atmosphere cleanup is best effort */ }
      assetEventChannel?.unbindAppAssetEventScope(owner);
      actorFlags.clearTypedGLBActorQrFlags(owner);
      releaseColor();
      actorAnimation.disposeActorAnimationContext(animation);
      try { runtimeNodes.dispose?.(); } catch { /* registry cleanup is best effort */ }
    };
    try {
      // PRD-03: the main-thread `prd03.post` extension records the app's flags and output options per canvas; the
      // compiler reads them (post v2 chain on/off, exposure, operator). Record them for this worker canvas too.
      const { recordAuthoredPostContext } = await import("../postBridge.js");
      recordAuthoredPostContext({ flags, options: { renderer: configuration } }, { canvas: target } as unknown as Parameters<typeof recordAuthoredPostContext>[1]);
      atmosphere = await bindWorkerAtmosphere(target, owner, next, runtimeNodes, flags);
      if (atmosphere) {
        liveAtmospheres.add(atmosphere);
        replayAtmosphere(atmosphere);
        if (atmosphere.effects) detachEffects.set(atmosphere, effectsReplayer.attach(atmosphere.effects));
      }
      const mounted = await createProductionRuntimeSceneRenderer(target, next, configuration, runtimeNodes, flags, undefined, undefined, {
        runtimeOwner: owner,
        ownRenderInputCache: true,
        ...(atmosphere ? { getPrd07MountAuthority: () => atmosphere?.mountAuthority() } : {}),
        request: context?.request ?? { signal },
        assetOptions: context?.assets
      });
      if (atmosphere) {
        const binding = atmosphere;
        const render = mounted.render.bind(mounted);
        mounted.render = (time: number) => { binding.tick(time); return render(time); };
        if (mounted.renderAsync) {
          const renderAsync = mounted.renderAsync.bind(mounted);
          mounted.renderAsync = (time: number) => { binding.tick(time); return renderAsync(time); };
        }
      }
      const dispose = mounted.dispose.bind(mounted);
      let released = false;
      mounted.dispose = () => {
        if (released) return;
        released = true;
        try { dispose(); } finally { cleanup(); }
      };
      if (signal.aborted) { mounted.dispose(); await mounted.whenDisposed?.(); throw cancelled(); }
      // PRD-02 `app.lighting` (real under A3D_QR_LIGHTING, as the main-thread extension).
      if (flags.on("A3D_QR_LIGHTING")) {
        const { Prd02LightingRuntime } = await import("../../lanes/prd02.js");
        lighting = new Prd02LightingRuntime(flags, runtimeNodes, { scene: next, nodes: runtimeNodes as unknown as { add(node: unknown): unknown } } as ConstructorParameters<typeof Prd02LightingRuntime>[2]) as unknown as WorkerLighting;
        liveLightings.add(lighting);
        replayLighting(lighting);
      }
      workerRendererNodes.set(mounted, runtimeNodes);
      return mounted;
    } catch (error) {
      cleanup();
      throw error;
    }
  });
  // Loaded on the first app call only, so plain node patches and mounts never wait for them.
  const loadAppBridges = async (): Promise<void> => {
    if (!postBridge || !outputBridge || !flagsModule) [postBridge, outputBridge, flagsModule] = await Promise.all([import("../postBridge.js"), import("../../lanes/prd01/outputSurface.js"), import("../../contracts/flags.js")]);
  };
  const applyOutput = (): void => {
    const live = (renderer as { auraRenderer?: { setOutput?: (output: unknown) => void; outputPathActive?: boolean } } | undefined)?.auraRenderer;
    if (!appOutput || !outputBridge || !live?.setOutput || live.outputPathActive === false) return;
    live.setOutput(outputBridge.toRendererOutput(appOutput));
  };
  const applyAtmosphereCall = (call: AuraWorkerAppCall, args: readonly unknown[]): void => {
    if (call === "atmosphere.setFog") {
      const spec = args[0];
      if (spec !== null && (typeof spec !== "object" || Array.isArray(spec))) throw new Error("app.atmosphere.setFog() expects a fog spec or null.");
      atmosphereState.fog = [...args];
    } else if (call === "atmosphere.setSky") {
      const spec = args[0];
      if (!spec || typeof spec !== "object" || Array.isArray(spec)) throw new Error("app.atmosphere.setSky() expects a sky spec object.");
      atmosphereState.sky = { ...atmosphereState.sky, ...(spec as Record<string, unknown>) };
    } else {
      if (typeof args[0] !== "number" || !Number.isFinite(args[0])) throw new Error("app.atmosphere.setWetness() expects a finite number.");
      atmosphereState.wetness = args[0];
    }
    for (const binding of liveAtmospheres) {
      const controls = binding.controls as unknown as Record<string, (...values: unknown[]) => void>;
      controls[call.slice("atmosphere.".length)]!(...args);
    }
  };
  const applyAppCall = (call: AuraWorkerAppCall, args: readonly unknown[]): void => {
    if (!canvas) throw new AuraWorkerError("Initialize the worker before calling app members.", "not-initialized", "recoverable");
    if (call.startsWith("atmosphere.")) { applyAtmosphereCall(call, args); return; }
    if (call.startsWith("effects.")) { effectsReplayer.apply(call, args); return; }
    if (call.startsWith("lighting.")) { applyLightingCall(call, args); return; }
    if (!postBridge || !outputBridge || !flagsModule) throw new AuraWorkerError(`app.${call}() needs the worker's post and output modules.`, "not-initialized", "recoverable");
    if (call === "setOutput") {
      const patch = args[0];
      if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("app.setOutput() expects an output options object.");
      appOutput = { ...appOutput, ...(patch as Record<string, unknown>) };
      postBridge.updateAuthoredPostOutput({ canvas } as unknown as AuraApp, patch as Record<string, unknown>);
      applyOutput();
      return;
    }
    // One post surface per worker canvas (the main-thread app has one per app): its runtime overrides are the store the
    // compiler reads for this canvas, and custom passes register under its scope. Same flags as the worker renderer.
    if (!postSurface) {
      const flags = flagsModule!.qrFlagsWithAnimationMixer(flagsModule!.resolveQrFlags({ ...(renderFlags?.qualityRebuild === undefined ? {} : { options: renderFlags.qualityRebuild }), ...(renderFlags?.url === undefined ? {} : { url: renderFlags.url }) }), renderFlags?.animationMixer);
      postSurface = new postBridge.Prd03PostSurface(flags, canvas as unknown as ConstructorParameters<typeof postBridge.Prd03PostSurface>[1]);
    }
    switch (call) {
      case "post.setEffect": postSurface.setEffect(args[0] as string, args[1] as Record<string, number | string | boolean | number[]>); break;
      case "post.setEffectEnabled": postSurface.setEffectEnabled(args[0] as string, args[1] as boolean); break;
      case "post.setQualityTier": postSurface.setQualityTier(args[0] as Parameters<NonNullable<typeof postSurface>["setQualityTier"]>[0]); break;
      case "post.setPassUniform": postSurface.setPassUniform?.(args[0] as string, args[1] as string, args[2] as number | readonly number[]); break;
      case "post.addPostPass": {
        const token = args[0] as number;
        postPassReleases.get(token)?.();
        postPassReleases.set(token, postSurface.addPostPass(args[1] as Parameters<NonNullable<typeof postSurface>["addPostPass"]>[0]));
        break;
      }
      case "post.removePostPass": {
        const token = args[0] as number;
        const release = postPassReleases.get(token);
        postPassReleases.delete(token);
        release?.();
        break;
      }
    }
  };
  type SceneCommit = { verify: () => void; commit: () => void };
  const mount = async (next: AuraSceneSnapshot, signal: AbortSignal, beforeCommit?: (value: AuraSceneSnapshot, backend: AuraBackend) => Promise<SceneCommit>): Promise<void> => {
    if (!canvas) throw new AuraWorkerError("Initialize the worker before setting a scene.", "not-initialized");
    validateScene(next);
    if (hasWorkerBatchedStates(next)) {
      // The batched handler, geometry resolver and node seeder register on import (the page loads them with the engine entry).
      await import("../nodes/batched.js");
      next = registerWorkerBatchedStates(next);
    }
    const hydrated = rehydrateWorkerScene(next, sceneTextures);
    if (closing || signal.aborted) { for (const handle of hydrated.created) handle.dispose(); throw cancelled(); }
    const target = canvas;
    const previousScene = renderer ? scene : undefined;
    const attach = async (mounted: WebGLSceneRenderer, value: AuraSceneSnapshot): Promise<void> => {
      renderer = mounted;
      scene = value;
      try {
        // A remounted renderer starts from the scene's output; replay the host's setOutput calls.
        applyOutput();
        if (mounted.onDeviceLost) subscriptions.push(mounted.onDeviceLost(() => {
          if (closing || renderer !== mounted) return;
          scheduler.pause();
          send({ type: "device", id: 0, state: "lost" });
        }));
        if (mounted.onDeviceRestored) subscriptions.push(mounted.onDeviceRestored(() => {
          if (closing || renderer !== mounted) return;
          if (mounted.deviceLost?.()) return;
          mounted.resetTemporalHistory?.("device-restored");
          send({ type: "device", id: 0, state: "restored" });
          if (runRequested && !scheduler.status().terminal) scheduler.resume();
        }));
      } catch (error) {
        // A listener subscription can fail after mounting. Retire that owner
        // before the outer replacement path attempts to restore the old scene.
        try { await disposeRenderer(); } catch { /* retain the subscription failure */ }
        throw error;
      }
    };
    // Retain previous texture snapshots while the old renderer is retired:
    // a failed replacement may need them to rebuild its former scene. Keep
    // the existing cleanup-failure behavior without attempting a remount.
    try { await disposeRenderer(); }
    catch (error) { for (const handle of hydrated.created) handle.dispose(); throw error; }
    let committed = false;
    let attached = false;
    try {
      const mounted = await createRenderer(target, hydrated.scene, rendererOptions, signal, {
        assets: snapshotAuraAssetsOption(assetOptions),
        request: {
          signal,
          ...(assetOptions?.securityContext === undefined ? {} : { securityContext: assetOptions.securityContext })
        }
      });
      if (closing || signal.aborted) { mounted.dispose(); await mounted.whenDisposed?.(); throw cancelled(); }
      await attach(mounted, hydrated.scene);
      attached = true;
      const transaction = beforeCommit ? await beforeCommit(hydrated.scene, mounted.backend) : undefined;
      if (closing || signal.aborted) throw cancelled();
      transaction?.verify();
      // Publish in the same turn as the final verification, before any
      // promise continuation can mutate the candidate behind the snapshot.
      if (transaction) { transaction.commit(); committed = true; }
      try {
        for (const handle of sceneTextures) if (!hydrated.retained.has(handle)) handle.dispose();
      } catch (error) {
        // Some previous resources may already be retired; rollback would no
        // longer be truthful. Keep every remaining owner for strict teardown.
        sceneTextures = new Set([...sceneTextures, ...hydrated.created, ...hydrated.retained]);
        committed = true;
        throw error;
      }
      sceneTextures = new Set([...hydrated.retained, ...hydrated.created]);
      committed = true;
    } catch (error) {
      if (committed) {
        try { await disposeRenderer(); }
        catch (cleanupError) { throw new AggregateError([error, cleanupError], "Worker committed scene cleanup failed."); }
        throw error;
      }
      if (attached) {
        try { await disposeRenderer(); }
        catch (cleanupError) { throw new AggregateError([error, cleanupError], "Worker scene replacement cleanup failed."); }
      }
      if (previousScene && !closing) {
        try {
          const restored = await createRenderer(target, previousScene, rendererOptions, lifetime.signal, {
            assets: snapshotAuraAssetsOption(assetOptions),
            request: {
              signal: lifetime.signal,
              ...(assetOptions?.securityContext === undefined ? {} : { securityContext: assetOptions.securityContext })
            }
          });
          if (closing || lifetime.signal.aborted) { restored.dispose(); await restored.whenDisposed?.(); throw cancelled(); }
          await attach(restored, previousScene);
        } catch (restoreError) {
          if (closing) throw cancelled();
          throw new AuraWorkerError(`Scene replacement failed and the previous scene could not be restored: ${asWorkerError(restoreError).message}`, "scene-restore-failed");
        }
      }
      throw error;
    } finally {
      if (!committed) for (const handle of hydrated.created) handle.dispose();
    }
  };
  const remount = async (next: AuraSceneSnapshot, signal: AbortSignal, beforeCommit?: (value: AuraSceneSnapshot, backend: AuraBackend) => Promise<SceneCommit>): Promise<void> => {
    const previous = scene;
    try {
      await mount(next, signal, beforeCommit);
    } catch (error) {
      // Only downgrade a replacement failure when the old scene really still
      // owns a renderer (either preflight failed or rollback succeeded).
      if (!closing && previous && renderer && scene === previous) {
        if (signal.aborted || knownWorkerError(error)?.code === "cancelled") throw cancelled();
        const actual = asWorkerError(error);
        throw new AuraWorkerError(actual.message, actual.code, "recoverable");
      }
      throw error;
    }
  };
  const reportCurrentDeviceState = (): void => {
    const lost = renderer?.deviceLost?.();
    if (lost !== undefined && lost !== reportedDeviceLost) {
      send({ type: "device", id: 0, state: lost ? "lost" : "restored" });
    }
  };
  const classifyFrameError = (error: unknown): "recoverable" | "terminal" =>
    knownWorkerError(error)?.severity ?? (renderer?.deviceLost?.() ? "recoverable" : "terminal");
  const scheduler = createWorkerFrameScheduler<AuraWorkerInput>({
    applyResize(size) {
      if (!canvas) throw new AuraWorkerError("Worker renderer is not initialized.", "not-initialized");
      const backing = resizeOffscreenCanvas(canvas, size);
      renderer?.resize?.(backing.width, backing.height);
    },
    resetHistory: (reason) => renderer?.resetTemporalHistory?.(reason),
    classifyError: classifyFrameError,
    onError(error, severity) {
      const actual = asWorkerError(error, severity);
      // A restored scene can come back on a different backend. The host must
      // learn the active owner before accepting its next frame.
      const backend = severity === "recoverable" ? renderer?.backend : undefined;
      send({ type: "error", id: 0, message: actual.message, code: actual.code, severity, ...(backend ? { backend } : {}) });
    },
    async onFrame(frame) {
      if (!canvas || !scene || !renderer) throw new AuraWorkerError("Worker renderer is not initialized.", "not-initialized");
      if (renderer.deviceLost?.()) throw new AuraWorkerError("Renderer device is lost; wait for restoration.", "device-lost", "recoverable");
      const suspended = (): boolean => closing || (frame.source === "automatic" && (!scheduler.status().visible || !scheduler.status().running));
      // The scheduler keeps the newest snapshot. Pointer transitions instead
      // accumulate until a frame actually starts and are delivered only once.
      const batch = pointerEvents.drain();
      const keyBatch = keyEvents.drain();
      const input = frame.input && (batch.pointerEvents.length > 0 || batch.pointerEventsOverflow || keyBatch.keyEvents.length > 0 || keyBatch.keyEventsOverflow)
        ? { ...frame.input,
            ...(batch.pointerEvents.length > 0 || batch.pointerEventsOverflow ? batch : {}),
            ...(keyBatch.keyEvents.length > 0 || keyBatch.keyEventsOverflow ? keyBatch : {}) }
        : frame.input;
      const next = await options.onFrame?.({ ...frame, input }, scene);
      if (suspended()) return;
      if (next && next !== scene) {
        const previousBackend = renderer.backend;
        let proposedRevision: number | undefined;
        let replacement = next;
        if (syncLocalScenes) {
          // Reject unsupported values before retiring the current renderer.
          validateLocalSceneValues(next);
          // The worker and host must mount the same value snapshot, while
          // retained texture handles remain local to the worker.
          replacement = cloneLocalScene(next);
          preflightLocalScene(replacement);
          if (!Number.isSafeInteger(sceneSequence + 1)) throw new AuraWorkerError("Worker scene revision is exhausted.", "invalid-scene-sync");
          proposedRevision = ++sceneSequence;
        }
        try {
          await remount(replacement, lifetime.signal, proposedRevision === undefined ? undefined
            : (value, backend) => proposeLocalScene(value, proposedRevision!, backend));
        }
        catch (error) {
          if (proposedRevision !== undefined && !closing) {
            try { send({ type: "scene-abort", id: 0, revision: proposedRevision }); }
            catch (transportError) {
              try { await disposeRenderer(); }
              catch (cleanupError) { throw new AggregateError([error, transportError, cleanupError], "Worker scene synchronization and cleanup failed."); }
              throw new AggregateError([error, transportError], "Worker scene synchronization failed.");
            }
          }
          if (!closing && knownWorkerError(error)?.severity === "recoverable") reportCurrentDeviceState();
          throw error;
        }
        if (proposedRevision === undefined && renderer && renderer.backend !== previousBackend) send({ type: "backend", id: 0, backend: renderer.backend });
      }
      if (suspended()) return;
      if (!renderer) throw new AuraWorkerError("Worker renderer is not initialized.", "not-initialized");
      if (renderer.deviceLost?.()) throw new AuraWorkerError("Renderer device is lost; wait for restoration.", "device-lost", "recoverable");
      const drawCalls = renderer.renderAsync ? await renderer.renderAsync(frame.time) : renderer.render(frame.time);
      if (suspended()) return;
      if (renderer.deviceLost?.()) throw new AuraWorkerError("Renderer device is lost; wait for restoration.", "device-lost", "recoverable");
      const texturedMaterials = sampleTexturedMaterials(renderer);
      lastFrame = { backend: renderer.backend, drawCalls, width: canvas.width, height: canvas.height, time: frame.time, deltaSeconds: frame.deltaSeconds, source: frame.source, presentedAt: workerNow(), ...(texturedMaterials ? { texturedMaterials } : {}) };
      if (frame.source === "automatic") send({ type: "presented", id: 0, result: lastFrame });
    }
  });
  let stopPromise: Promise<void> | undefined;
  const stop = (): Promise<void> => {
    if (stopPromise) return stopPromise;
    let resolveStop!: () => void;
    let rejectStop!: (error: unknown) => void;
    // Install the shared promise before abort listeners can reenter stop().
    stopPromise = new Promise<void>((resolve, reject) => { resolveStop = resolve; rejectStop = reject; });
    void (async () => {
      const failures: unknown[] = [];
      if (!closing) {
        closing = true;
        try { endpoint.removeEventListener("message", onMessage); } catch (error) { failures.push(error); }
        try { lifetime.abort(); } catch (error) { failures.push(error); }
        for (const controller of controllers.values()) {
          try { controller.abort(); } catch (error) { failures.push(error); }
        }
      }
      try { await scheduler.dispose(); } catch (error) { failures.push(error); }
      try { await tail; } catch (error) { failures.push(error); }
      try { await disposeRenderer(); } catch (error) { failures.push(error); }
      for (const handle of sceneTextures) { try { handle.dispose(); } catch (error) { failures.push(error); } }
      sceneTextures.clear();
      if (failures.length === 1) throw failures[0];
      if (failures.length > 1) throw new AggregateError(failures, "Worker renderer shutdown failed.");
    })().then(resolveStop, rejectStop);
    return stopPromise;
  };
  const onMessage = (event: MessageEvent<AuraWorkerRequest>): void => {
    const message = event.data;
    if (!message || typeof message !== "object" || !Number.isSafeInteger(message.id) || message.id <= lastId) {
      if (!closing) send({ type: "error", id: Number.isSafeInteger(message?.id) ? message.id : 0, message: "Worker request IDs must increase monotonically.", code: "invalid-request-id", severity: "terminal" });
      return;
    }
    lastId = message.id;
    if (message.type === "scene-ack") {
      const pending = localAck;
      if (pending?.revision === message.revision) {
        if (message.error) pending.reject(new AuraWorkerError(message.error.message, message.error.code, "recoverable"));
        else pending.resolve();
      }
      return;
    }
    if (message.type === "cancel") {
      controllers.get(message.targetId)?.abort();
      send({ type: "result", id: message.id });
      return;
    }
    if (message.type === "dispose") {
      void stop().then(() => endpoint.postMessage({ type: "result", id: message.id }), (error: unknown) => {
        const actual = asWorkerError(error);
        endpoint.postMessage({ type: "error", id: message.id, message: actual.message, code: actual.code, severity: actual.severity });
      });
      return;
    }
    if (closing) return;
    if (controllers.size >= MAX_PENDING_REQUESTS) {
      send({ type: "error", id: message.id, message: "Worker request queue is full.", code: "queue-full", severity: "recoverable" });
      return;
    }
    const controller = new AbortController();
    controllers.set(message.id, controller);
    const operation = tail.then(async () => {
      if (closing || controller.signal.aborted) throw cancelled();
      let result: AuraWorkerFrameResult | undefined;
      let screenshot: AuraWorkerScreenshotPayload | undefined;
      switch (message.type) {
        case "init":
          if (canvas) throw new AuraWorkerError("Canvas ownership was already initialized.", "already-initialized");
          // Direct protocol users do not pass through the host-side preflight.
          assetOptions = snapshotAuraAssetsOption(message.assets);
          renderFlags = message.flags;
          canvas = message.canvas; rendererOptions = message.renderer; runRequested = message.autoStart;
          syncLocalScenes = message.syncLocalScenes === true;
          assetEvents = message.assetEvents === true;
          installWorkerRendererGlobals(message.globals);
          resizeOffscreenCanvas(canvas, message.size);
          await mount(message.scene, controller.signal);
          sceneRevision = sceneSequence = 1;
          if (runRequested) scheduler.start();
          break;
        case "scene": {
          const wasRunning = scheduler.status().running;
          let canResume = true;
          scheduler.pause();
          try {
            await scheduler.whenIdle();
            // Cancellation can arrive while an already-submitted frame drains.
            // Do not retire the current renderer if replacement never began.
            if (closing || controller.signal.aborted) throw cancelled();
            if (syncLocalScenes && !Number.isSafeInteger(sceneSequence + 1)) throw new AuraWorkerError("Worker scene revision is exhausted.", "invalid-scene-sync");
            await remount(message.scene, controller.signal);
            if (syncLocalScenes) sceneRevision = ++sceneSequence;
          }
          catch (error) {
            const actual = knownWorkerError(error);
            canResume = actual?.severity === "recoverable" && !!renderer;
            if (canResume && actual?.code !== "cancelled") {
              // The replacement error may itself say "device-lost" even if
              // the restored owner is healthy. Report its actual state as a
              // device event rather than inferring it from that error code.
              reportCurrentDeviceState();
            }
            throw error;
          }
          finally { if (canResume && wasRunning && runRequested && !closing && renderer && !renderer.deviceLost?.() && !scheduler.status().terminal) scheduler.resume(); }
          break;
        }
        case "patch":
          // Serialize with automatic frames so a batch never lands inside an
          // asynchronous submission; the next frame sees all of it.
          if (Array.isArray(message.ops) && message.ops.some((op) => op && typeof op === "object" && "app" in op)) await loadAppBridges();
          await scheduler.runExclusive(() => {
            const current = renderer;
            const nodes = current ? workerRendererNodes.get(current) ?? (current as { runtimeNodes?: AuraRuntimeNodeRegistry }).runtimeNodes : undefined;
            // 5.4: textures in call arguments (setMaterial) arrive as snapshots or ids of textures the worker holds.
            const { args: ops, created } = Array.isArray(message.ops) ? hydrateWorkerPatchArgs(message.ops, sceneTextures) : { args: message.ops, created: new Set<TextureHandle>() };
            if (created.size) sceneTextures = new Set([...sceneTextures, ...created]);
            applyWorkerNodePatch(nodes, scene, ops, (id) => findWorkerCanvasTexture(sceneTextures, id), applyAppCall);
          });
          break;
        case "input": {
          const { pointerEvents: events, pointerEventsOverflow, keyEvents: keySamples, keyEventsOverflow, ...snapshot } = message.input;
          scheduler.setInput(snapshot);
          pointerEvents.append(events ?? [], pointerEventsOverflow);
          keyEvents.append(keySamples ?? [], keyEventsOverflow);
          break;
        }
        case "resize":
          // Validate before storing a hidden resize; otherwise an invalid
          // request is acknowledged and only fails terminally at the next
          // manual frame or visibility resume, replacing a valid pending size.
          try { workerCanvasBackingSize(message.size); }
          catch (error) { throw new AuraWorkerError(asWorkerError(error).message, "invalid-resize", "recoverable"); }
          await scheduler.resize(message.size);
          break;
        case "visibility": scheduler.setVisible(message.visible); break;
        case "pause":
          runRequested = false;
          scheduler.pause();
          await scheduler.whenIdle();
          break;
        case "resume":
          if (!renderer) throw new AuraWorkerError("Worker renderer is not initialized.", "not-initialized");
          runRequested = true;
          if (!renderer.deviceLost?.()) scheduler.resume();
          break;
        case "screenshot":
          screenshot = await scheduler.runExclusive(async () => {
            if (!canvas || !renderer) throw new AuraWorkerError("Worker renderer is not initialized.", "not-initialized");
            if (renderer.deviceLost?.()) throw new AuraWorkerError("Renderer device is lost; wait for restoration.", "device-lost", "recoverable");
            if (typeof canvas.convertToBlob !== "function") throw new AuraWorkerError("OffscreenCanvas PNG capture is unavailable.", "screenshot-unavailable", "recoverable");
            const time = lastFrame?.time ?? 0;
            const drawCalls = renderer.renderAsync ? await renderer.renderAsync(time) : renderer.render(time);
            if (closing || controller.signal.aborted) throw cancelled();
            if (renderer.deviceLost?.()) throw new AuraWorkerError("Renderer device was lost while capturing.", "device-lost", "recoverable");
            const width = canvas.width;
            const height = canvas.height;
            send({ type: "capture-presented", id: 0, result: { backend: renderer.backend, drawCalls, width, height, time } });
            let blob: Blob;
            try { blob = await canvas.convertToBlob({ type: "image/png" }); }
            catch { throw new AuraWorkerError("OffscreenCanvas PNG capture failed.", "screenshot-failed", "recoverable"); }
            if (closing || controller.signal.aborted) throw cancelled();
            if (renderer.deviceLost?.()) throw new AuraWorkerError("Renderer device was lost while capturing.", "device-lost", "recoverable");
            if (!blob || blob.type !== "image/png") throw new AuraWorkerError("OffscreenCanvas did not return PNG data.", "screenshot-failed", "recoverable");
            return { blob, width, height };
          });
          break;
        case "recover": {
          if (!scene) throw new AuraWorkerError("Worker renderer is not initialized.", "not-initialized");
          const wasRunning = scheduler.status().running;
          scheduler.pause();
          await scheduler.whenIdle();
          if (closing || controller.signal.aborted) {
            // Recovery has not started; keep the old device and restore only
            // the scheduler state that this request actually paused.
            if (wasRunning && !closing && renderer && !scheduler.status().terminal) scheduler.resume();
            throw cancelled();
          }
          try {
            await remount(scene, controller.signal);
          } catch (error) {
            // mount restores the previous scene after a failed replacement. A
            // usable restored owner can keep running and retry recovery later.
            const restored = renderer as WebGLSceneRenderer | undefined;
            if (restored && !closing && knownWorkerError(error)?.severity === "recoverable") {
              if (!restored.deviceLost?.()) {
                restored.resetTemporalHistory?.("device-restored");
                send({ type: "device", id: 0, state: "restored" });
                if (runRequested && !scheduler.status().terminal) scheduler.resume();
              }
            }
            throw error;
          }
          if ((renderer as WebGLSceneRenderer | undefined)?.deviceLost?.()) throw new AuraWorkerError("Renderer device is still lost after recovery.", "device-lost", "recoverable");
          (renderer as WebGLSceneRenderer | undefined)?.resetTemporalHistory?.("device-restored");
          if (runRequested && !closing && !scheduler.status().terminal) scheduler.resume();
          send({ type: "device", id: 0, state: "restored" });
          break;
        }
        case "frame":
          if (!Number.isFinite(message.deltaSeconds) || message.deltaSeconds < 0 || (message.time !== undefined && !Number.isFinite(message.time))) {
            throw new AuraWorkerError("Manual frame delta and time must be finite, with a nonnegative delta.", "invalid-frame", "recoverable");
          }
          await scheduler.step(message.deltaSeconds, message.time); result = lastFrame; break;
        default: throw new AuraWorkerError("Unknown worker renderer message.", "unknown-message");
      }
      if (controller.signal.aborted || closing) throw cancelled();
      const backend = message.type === "init" || message.type === "scene" || message.type === "recover"
        ? (renderer as WebGLSceneRenderer | undefined)?.backend : undefined;
      send({ type: "result", id: message.id, result, ...(screenshot ? { screenshot } : {}), ...(backend ? { backend } : {}),
        ...(syncLocalScenes && message.type === "init" ? { syncLocalScenes: true as const } : {}),
        ...(syncLocalScenes && (message.type === "init" || message.type === "scene") ? { sceneRevision } : {}) });
    }).catch((error: unknown) => {
      const actual = asWorkerError(error, classifyFrameError(error));
      const backend = actual.severity === "recoverable" && (message.type === "scene" || message.type === "recover")
        ? (renderer as WebGLSceneRenderer | undefined)?.backend : undefined;
      send({ type: "error", id: message.id, message: actual.message, code: actual.code, severity: actual.severity, ...(backend ? { backend } : {}) });
    }).finally(() => { controllers.delete(message.id); });
    tail = operation;
  };
  endpoint.addEventListener("message", onMessage);
  return stop;
}

/** Runtime node registry of each default-mounted worker renderer (K1 patch target). */
const workerRendererNodes = new WeakMap<object, AuraRuntimeNodeRegistry>();

function cancelled(): AuraWorkerError { return new AuraWorkerError("Worker request cancelled.", "cancelled", "recoverable"); }
function knownWorkerError(error: unknown): AuraWorkerError | undefined {
  try {
    if (!(error instanceof AuraWorkerError)) return undefined;
    const { message, code, severity } = error;
    if (typeof message !== "string" || typeof code !== "string" || (severity !== "recoverable" && severity !== "terminal")) return undefined;
    return new AuraWorkerError(message, code, severity);
  } catch {
    return undefined;
  }
}
function asWorkerError(error: unknown, severity: "recoverable" | "terminal" = "terminal"): AuraWorkerError {
  const known = knownWorkerError(error);
  if (known) return known;
  try {
    if (error instanceof Error && typeof error.message === "string") return new AuraWorkerError(error.message, "worker-render", severity);
  } catch { /* Fall back to bounded formatting for hostile thrown values. */ }
  return new AuraWorkerError(formatDiagnosticError(error), "worker-render", severity);
}
function validateScene(scene: AuraSceneSnapshot): void {
  if (!scene || scene.schema !== "aura3d-scene-snapshot/1.0" || !Array.isArray(scene.nodes)) throw new AuraWorkerError("Worker scene must be an Aura3D scene snapshot.", "invalid-scene");
}

/** Root diagnostics flatten group nodes and cannot safely traverse cyclic groups. */
export function validateWorkerSceneGroups(scene: AuraSceneSnapshot): void {
  const active = new Set<object>();
  const complete = new Set<object>();
  const pending: { node: unknown; leave: boolean }[] = Array.from(scene.nodes, (node) => ({ node, leave: false }));
  while (pending.length) {
    const { node, leave } = pending.pop()!;
    if (!node || typeof node !== "object") throw new AuraWorkerError("Worker scene contains an invalid node.", "invalid-scene", "recoverable");
    if (leave) { active.delete(node); complete.add(node); continue; }
    if ((node as { kind?: unknown }).kind !== "group" || complete.has(node)) continue;
    if (active.has(node)) throw new AuraWorkerError("Worker scene groups cannot contain cycles.", "invalid-scene", "recoverable");
    const children = (node as { children?: unknown }).children;
    if (!Array.isArray(children)) throw new AuraWorkerError("Worker scene group children must be an array.", "invalid-scene", "recoverable");
    active.add(node);
    pending.push({ node, leave: true });
    for (const child of children) pending.push({ node: child, leave: false });
  }
}

function maskTransferables(value: unknown, transfer: readonly Transferable[]): unknown {
  const transferSet = new Set<unknown>(transfer);
  const seen = new Map<object, unknown>();
  const copy = (current: unknown): unknown => {
    if (!current || typeof current !== "object") return current;
    if (seen.has(current)) return seen.get(current);
    if (transferSet.has(current)) { const placeholder = {}; seen.set(current, placeholder); return placeholder; }
    if (Array.isArray(current)) {
      const result: unknown[] = new Array(current.length);
      seen.set(current, result);
      for (const key of Object.keys(current)) (result as unknown as Record<string, unknown>)[key] = copy((current as unknown as Record<string, unknown>)[key]);
      return result;
    }
    if (current instanceof Map) {
      const result = new Map<unknown, unknown>(); seen.set(current, result);
      for (const [key, item] of current) result.set(copy(key), copy(item));
      return result;
    }
    if (current instanceof Set) {
      const result = new Set<unknown>(); seen.set(current, result);
      for (const item of current) result.add(copy(item));
      return result;
    }
    // Keep built-ins intact so structuredClone applies its own checks to them.
    if (Object.prototype.toString.call(current) !== "[object Object]") return current;
    const result: Record<string, unknown> = Object.create(null);
    seen.set(current, result);
    for (const key of Object.keys(current)) result[key] = copy((current as Record<string, unknown>)[key]);
    return result;
  };
  return copy(value);
}
const WORKER_TEXTURE_KIND = "aura-worker-cpu-texture/2";
const LEGACY_WORKER_TEXTURE_KIND = "aura-worker-rgba8-texture/1";
/**
 * 5.4: renderer switches a page sets on `globalThis` before creating its app (`__A3D_SHADOW_FIT__ = "current"`, read by the
 * shadow fit; `__A3D_DENSE_SHADOWS__`, `__A3D_SHADOW_TAPS__`, ...). The worker realm has its own global object, so the host
 * copies every `__A3D_*__` own property holding a string, finite number or boolean.
 */
const WORKER_RENDERER_GLOBAL = /^__A3D_[A-Z0-9_]+__$/;
export function collectWorkerRendererGlobals(source: object = globalThis): Record<string, string | number | boolean> | undefined {
  let globals: Record<string, string | number | boolean> | undefined;
  for (const key of Object.getOwnPropertyNames(source)) {
    if (!WORKER_RENDERER_GLOBAL.test(key)) continue;
    let value: unknown;
    try { value = (source as Record<string, unknown>)[key]; } catch { continue; }
    if (typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) (globals ??= {})[key] = value;
  }
  return globals;
}

/** Worker side of {@link collectWorkerRendererGlobals}; a switch the worker already defines is left alone. */
export function installWorkerRendererGlobals(globals: unknown, target: object = globalThis): void {
  if (!globals || typeof globals !== "object") return;
  for (const [key, value] of Object.entries(globals as Record<string, unknown>)) {
    if (!WORKER_RENDERER_GLOBAL.test(key) || Object.hasOwn(target, key)) continue;
    if (typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) (target as Record<string, unknown>)[key] = value;
  }
}

/** 5.5.1: the presentation clock reported with each frame (`AuraWorkerFrameResult.presentedAt`). */
const workerNow = (): number => (typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now());

/** Presented frames between reads of the worker renderer's textured-material status. */
const TEXTURED_SAMPLE_FRAMES = 15;
/** Per texture (every mip level counted). */
const MAX_WORKER_TEXTURE_BYTES = 16 * 1024 * 1024;
/**
 * 5.4: per scene, all textures together. Games that paint their surfaces into canvases send every one of them
 * (Gridlock Courier: 34 canvas textures, about 104 MiB).
 */
const MAX_WORKER_SCENE_TEXTURE_BYTES = 256 * 1024 * 1024;
const MAX_WORKER_TEXTURE_COUNT = 128;
/** Snapshot bytes held by unsettled scene requests: at least this, and at least two copies of the initial scene. */
const MAX_IN_FLIGHT_WORKER_TEXTURE_BYTES = 32 * 1024 * 1024;
type WorkerTextureFormat = "rgba8" | "rgba16f" | "rgba32f" | "r32f";
type WorkerTextureMip = { readonly width: number; readonly height: number; readonly data: TexturePixelData };
type WorkerTextureSnapshot = {
  readonly kind: typeof WORKER_TEXTURE_KIND;
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly format: WorkerTextureFormat;
  /** Preserve both the allocated level count and flat versus supplied-mip upload path. */
  readonly levels: readonly (WorkerTextureMip | null)[];
  readonly suppliedMipCount: number;
  readonly colorSpace: "linear" | "srgb";
  readonly flipY: boolean;
  readonly generateMipmaps: boolean;
  readonly dynamic: boolean;
  readonly usage: readonly ("sampled" | "copy-src" | "copy-dst")[];
  readonly wrapS: AuraTextureRef["wrapS"];
  readonly wrapT: AuraTextureRef["wrapT"];
  readonly repeat: readonly [number, number];
  readonly offset: readonly [number, number];
  readonly center: readonly [number, number];
  readonly rotation: number;
  readonly anisotropy: number;
  readonly minFilter: AuraTextureRef["minFilter"];
  readonly magFilter: AuraTextureRef["magFilter"];
  /**
   * The host texture is a live 2D image source (`texture.canvas`, an image or
   * a bitmap). Level 0 carries its pixels read back on the host; the worker
   * rebuilds a source texture on an OffscreenCanvas, so upload flipY, mips and
   * colour handling match the host, and later host repaints arrive as
   * `texture` patch ops.
   */
  readonly canvasSource?: true;
};

function unsupportedWorkerTexture(detail?: string): AuraWorkerError {
  return new AuraWorkerError(`Live texture handles cannot cross worker realms unless they have bounded CPU-backed 2D color pixels. Use a typed texture asset or create the handle in the worker.${detail ? ` (${detail})` : ""}`, "unsupported-worker-resource", "recoverable");
}

/** A live 2D image source whose pixels the host can read back (canvas, image, bitmap); never a video. */
export function isWorkerReadableImageTexture(texture: Texture): boolean {
  const source = texture.source as unknown as Record<string, unknown> | null;
  if (!source || typeof source !== "object" || texture.dimension !== "2d" || texture.format !== "rgba8") return false;
  if ("currentTime" in source || "videoWidth" in source) return false;
  return texture.mipLevels.length === 0 && texture.mipLevelCount === 1
    && !texture.usage.includes("storage") && !texture.usage.includes("render-attachment")
    && texture.usage.includes("sampled") && texture.usage.includes("copy-dst");
}

let readbackCanvas: { canvas: OffscreenCanvas | HTMLCanvasElement; context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D } | undefined;
/**
 * Read a live image source's current pixels (unpremultiplied RGBA8, top row
 * first). Drawn into a private 2D canvas so the source's own context type is
 * never touched. Undefined when the source cannot be read (tainted, sized
 * differently from its texture, or no 2D canvas in this realm).
 */
export function readWorkerImageTexturePixels(texture: Texture): Uint8ClampedArray | undefined {
  const source = texture.source as unknown as CanvasImageSource & { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number; displayWidth?: number; displayHeight?: number };
  const { width, height } = texture;
  // Intrinsic size, in the order the uploaders read it (an <img> laid out by CSS reports its layout box as width/height).
  const sourceWidth = source.naturalWidth ?? source.displayWidth ?? source.width;
  const sourceHeight = source.naturalHeight ?? source.displayHeight ?? source.height;
  if ((typeof sourceWidth === "number" && sourceWidth !== width) || (typeof sourceHeight === "number" && sourceHeight !== height)) return undefined;
  try {
    if (!readbackCanvas) {
      const canvas = typeof OffscreenCanvas === "function" ? new OffscreenCanvas(width, height)
        : typeof document !== "undefined" ? Object.assign(document.createElement("canvas"), { width, height }) : undefined;
      const context = canvas?.getContext("2d", { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null | undefined;
      if (!canvas || !context) return undefined;
      readbackCanvas = { canvas, context };
    }
    const { canvas, context } = readbackCanvas;
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    context.globalCompositeOperation = "copy";
    context.drawImage(source, 0, 0);
    const pixels = context.getImageData(0, 0, width, height).data;
    return pixels.length === width * height * 4 ? pixels : undefined;
  } catch {
    return undefined;
  }
}

/** Copy the underlying bytes, never numerically convert floating-point samples. */
function copyWorkerPixels(data: TexturePixelData): TexturePixelData {
  const bytes = Uint8Array.from(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  if (data instanceof Uint8ClampedArray) return new Uint8ClampedArray(bytes.buffer);
  if (data instanceof Uint16Array) return new Uint16Array(bytes.buffer);
  if (data instanceof Float32Array) return new Float32Array(bytes.buffer);
  return bytes;
}

/** Copy scene containers while preserving cycles, aliases, built-ins and explicit transferables. */
function mapWorkerScene<T>(value: T, replace: (value: object) => unknown | undefined, transfer: ReadonlySet<unknown> = new Set()): T {
  const seen = new Map<object, unknown>();
  const copy = (current: unknown): unknown => {
    if (!current || typeof current !== "object") return current;
    if (seen.has(current)) return seen.get(current);
    const replacement = replace(current);
    if (replacement !== undefined) { seen.set(current, replacement); return replacement; }
    if (transfer.has(current) || ArrayBuffer.isView(current) || current instanceof ArrayBuffer) return current;
    if (Array.isArray(current)) {
      const result: unknown[] = new Array(current.length);
      seen.set(current, result);
      for (const key of Object.keys(current)) Object.defineProperty(result, key, { value: copy((current as unknown as Record<string, unknown>)[key]), enumerable: true, writable: true, configurable: true });
      return result;
    }
    if (current instanceof Map) {
      const result = new Map<unknown, unknown>(); seen.set(current, result);
      for (const [key, item] of current) result.set(copy(key), copy(item));
      return result;
    }
    if (current instanceof Set) {
      const result = new Set<unknown>(); seen.set(current, result);
      for (const item of current) result.add(copy(item));
      return result;
    }
    if (Object.prototype.toString.call(current) !== "[object Object]") return current;
    const result: Record<string, unknown> = {};
    seen.set(current, result);
    for (const key of Object.keys(current)) Object.defineProperty(result, key, { value: copy((current as Record<string, unknown>)[key]), enumerable: true, writable: true, configurable: true });
    return result;
  };
  return copy(value) as T;
}

/** Key of the batched-state copy a host attaches to `batched` nodes (`instances.mesh`, `batched.mesh`). */
const WORKER_BATCHED_STATE_KEY = "workerBatchedState";

/** Applies `visit` to every scene node (group children included), copying only the paths it changes. */
function mapSceneNodes(scene: AuraSceneSnapshot, visit: (node: AuraSceneSnapshot["nodes"][number]) => AuraSceneSnapshot["nodes"][number]): AuraSceneSnapshot {
  const walk = (nodes: AuraSceneSnapshot["nodes"]): AuraSceneSnapshot["nodes"] => {
    let changed = false;
    const next = nodes.map((node) => {
      let result = visit(node);
      const children = (result as { readonly children?: AuraSceneSnapshot["nodes"] }).children;
      if (result.kind === "group" && Array.isArray(children)) {
        const mapped = walk(children);
        if (mapped !== children) result = { ...result, children: mapped } as typeof result;
      }
      if (result !== node) changed = true;
      return result;
    });
    return changed ? next : nodes;
  };
  const nodes = Array.isArray(scene?.nodes) ? walk(scene.nodes) : scene?.nodes;
  return nodes === scene?.nodes ? scene : { ...scene, nodes };
}

/**
 * 5.4: a `batched` node built by `instances.mesh` / `batched.mesh` names a host-side state (geometry pool, matrices,
 * colours) by `batchedId`; the worker has no such state. Attach a plain-data copy so the worker rebuilds it.
 */
function withWorkerBatchedStates(scene: AuraSceneSnapshot): AuraSceneSnapshot {
  return mapSceneNodes(scene, (node) => {
    if (node.kind !== "batched" || (node as unknown as Record<string, unknown>)[WORKER_BATCHED_STATE_KEY] !== undefined) return node;
    const state = batchedStateFor((node as { readonly batchedId?: string }).batchedId ?? (node as { readonly runtime?: { readonly id?: string } }).runtime?.id);
    if (!state) return node;
    const snapshot = state.toWorkerSnapshot();
    if (!snapshot) throw new AuraWorkerError("A batched node with live Geometry inputs cannot be copied to a render worker.", "worker-unsupported");
    return { ...node, [WORKER_BATCHED_STATE_KEY]: snapshot } as typeof node;
  });
}

/** Worker side of {@link withWorkerBatchedStates}: register the copied states (replacing older ones) and strip the copies. */
function registerWorkerBatchedStates(scene: AuraSceneSnapshot): AuraSceneSnapshot {
  return mapSceneNodes(scene, (node) => {
    const snapshot = (node as unknown as Record<string, unknown>)[WORKER_BATCHED_STATE_KEY] as BatchedMeshStateSnapshot | undefined;
    if (node.kind !== "batched" || snapshot?.kind !== "aura-worker-batched-state") return node;
    const previous = batchedStateFor(snapshot.id);
    registerBatchedState(BatchedMeshState.fromWorkerSnapshot(snapshot));
    previous?.dispose();
    const { [WORKER_BATCHED_STATE_KEY]: _copy, ...rest } = node as unknown as Record<string, unknown>;
    return rest as unknown as typeof node;
  });
}

/** True when a scene carries batched-state copies (the worker then loads the batched handler before compiling). */
function hasWorkerBatchedStates(scene: AuraSceneSnapshot): boolean {
  let found = false;
  mapSceneNodes(scene, (node) => { if ((node as unknown as Record<string, unknown>)[WORKER_BATCHED_STATE_KEY] !== undefined) found = true; return node; });
  return found;
}

/** Snapshot host pixels synchronously; neither the host handle nor its backing crosses realms. */
function snapshotTransferableScene(scene: AuraSceneSnapshot, transfers: readonly Transferable[], reserve: (size: number) => void, copyPixels = true): AuraSceneSnapshot {
  scene = withWorkerBatchedStates(scene);
  const transferSet = new Set<unknown>(transfers);
  const backings = new Set<Texture>();
  let bytes = 0;
  let count = 0;
  return mapWorkerScene(scene, (value) => {
    const kind = (value as { kind?: unknown }).kind;
    if (kind === WORKER_TEXTURE_KIND || kind === LEGACY_WORKER_TEXTURE_KIND) throw unsupportedWorkerTexture();
    if (kind !== "aura-texture-ref") return undefined;
    const ref = value as AuraTextureRef;
    const texture = auraTextureRefTexture(ref);
    if (texture && texture.source && isWorkerReadableImageTexture(texture) && !backings.has(texture)) {
      backings.add(texture);
      const pixels = readWorkerImageTexturePixels(texture);
      if (!pixels) throw unsupportedWorkerTexture(`texture ${ref.id}: its image source cannot be read back`);
      const snapshot: WorkerTextureSnapshot = {
        kind: WORKER_TEXTURE_KIND, id: ref.id, width: texture.width, height: texture.height, format: "rgba8",
        levels: [{ width: texture.width, height: texture.height, data: pixels }], suppliedMipCount: 0,
        colorSpace: texture.colorSpace, flipY: texture.flipY, generateMipmaps: texture.generateMipmaps, dynamic: texture.dynamic,
        usage: [...texture.usage] as WorkerTextureSnapshot["usage"],
        wrapS: ref.wrapS, wrapT: ref.wrapT, repeat: [...ref.repeat], offset: [...ref.offset], center: [...ref.center],
        rotation: ref.rotation, anisotropy: ref.anisotropy, minFilter: ref.minFilter, magFilter: ref.magFilter, canvasSource: true
      };
      const size = validateWorkerTextureSnapshot(snapshot);
      if (++count > MAX_WORKER_TEXTURE_COUNT || (bytes += size) > MAX_WORKER_SCENE_TEXTURE_BYTES) throw unsupportedWorkerTexture(`scene textures exceed ${MAX_WORKER_TEXTURE_COUNT} textures or ${MAX_WORKER_SCENE_TEXTURE_BYTES} bytes at ${ref.id}`);
      reserve(size);
      // The readback is already a private copy.
      return snapshot;
    }
    if (!texture || texture.source || texture.dimension !== "2d"
      || !["rgba8", "rgba16f", "rgba32f", "r32f"].includes(texture.format)
      || !Number.isSafeInteger(texture.width) || texture.width < 1 || !Number.isSafeInteger(texture.height) || texture.height < 1
      || !Number.isSafeInteger(texture.mipLevelCount) || texture.mipLevelCount < 1
      || texture.mipLevelCount > Math.floor(Math.log2(Math.max(texture.width, texture.height))) + 1
      || texture.usage.includes("storage") || texture.usage.includes("render-attachment")
      || !texture.usage.includes("sampled") || !texture.usage.includes("copy-dst")) throw unsupportedWorkerTexture(`texture ${ref.id}: ${texture?.source ? "a shared or unreadable image source" : "not a CPU-backed sampled 2D texture"}`);
    // Two distinct handles can point at one mutable backing. Reconstructing
    // them independently would change their update and disposal semantics.
    if (backings.has(texture)) throw unsupportedWorkerTexture(`texture ${ref.id} shares its backing with another handle`);
    backings.add(texture);
    const levels = Array.from({ length: texture.mipLevelCount }, (_, index) => texture.getMipLevel(index));
    // Older arrays remain observable through the host after an override. Never
    // detach them, any current mip override, or share mutable backing storage.
    const hostArrays = [texture.data, ...texture.mipLevels.map((mip) => mip.data), ...levels.map((mip) => mip?.data ?? null)];
    if (hostArrays.some((array) => array !== null && (transferSet.has(array.buffer)
      || (typeof SharedArrayBuffer !== "undefined" && array.buffer instanceof SharedArrayBuffer)))) throw unsupportedWorkerTexture();
    const snapshot: WorkerTextureSnapshot = {
      kind: WORKER_TEXTURE_KIND, id: ref.id, width: texture.width, height: texture.height,
      format: texture.format as WorkerTextureFormat, levels, suppliedMipCount: texture.mipLevels.length,
      colorSpace: texture.colorSpace, flipY: texture.flipY,
      generateMipmaps: texture.generateMipmaps, dynamic: texture.dynamic,
      usage: [...texture.usage] as WorkerTextureSnapshot["usage"],
      wrapS: ref.wrapS, wrapT: ref.wrapT, repeat: [...ref.repeat], offset: [...ref.offset], center: [...ref.center],
      rotation: ref.rotation, anisotropy: ref.anisotropy, minFilter: ref.minFilter, magFilter: ref.magFilter
    };
    const size = validateWorkerTextureSnapshot(snapshot);
    if (++count > MAX_WORKER_TEXTURE_COUNT || (bytes += size) > MAX_WORKER_SCENE_TEXTURE_BYTES) throw unsupportedWorkerTexture(`scene textures exceed ${MAX_WORKER_TEXTURE_COUNT} textures or ${MAX_WORKER_SCENE_TEXTURE_BYTES} bytes at ${ref.id}`);
    // Reserve the sum of all levels before allocating any snapshot bytes.
    reserve(size);
    return copyPixels
      ? { ...snapshot, levels: levels.map((level) => level && ({ width: level.width, height: level.height, data: copyWorkerPixels(level.data) })) }
      : snapshot;
  }, transferSet);
}

function unsupportedLocalScene(): AuraWorkerError {
  return new AuraWorkerError(
    "Worker-local scene replacement requires cloneable scene data and bounded CPU-backed textures.",
    "unsupported-worker-scene", "recoverable"
  );
}

/** A local replacement must be reproducible without exporting live worker resources. */
function validateLocalSceneValues(scene: AuraSceneSnapshot): void {
  const seen = new Set<object>();
  const visit = (value: unknown): void => {
    if (typeof value === "function" || typeof value === "symbol") throw unsupportedLocalScene();
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (value instanceof TextureHandle) return;
    if (typeof SharedArrayBuffer !== "undefined" && value instanceof SharedArrayBuffer) throw unsupportedLocalScene();
    if (ArrayBuffer.isView(value)) {
      if (typeof SharedArrayBuffer !== "undefined" && value.buffer instanceof SharedArrayBuffer) throw unsupportedLocalScene();
      const name = Object.prototype.toString.call(value).slice(8, -1);
      const intrinsic = (globalThis as unknown as Record<string, { prototype?: object } | undefined>)[name];
      if (!intrinsic || Object.getPrototypeOf(value) !== intrinsic.prototype) throw unsupportedLocalScene();
      return;
    }
    if (value instanceof ArrayBuffer || value instanceof Date) {
      if (Object.getPrototypeOf(value) !== (value instanceof ArrayBuffer ? ArrayBuffer.prototype : Date.prototype) || Reflect.ownKeys(value).length) throw unsupportedLocalScene();
      return;
    }
    if (value instanceof RegExp) {
      if (Object.getPrototypeOf(value) !== RegExp.prototype || value.lastIndex !== 0 || Reflect.ownKeys(value).some((key) => key !== "lastIndex")) throw unsupportedLocalScene();
      return;
    }
    if (value instanceof Map && Object.getPrototypeOf(value) === Map.prototype) {
      if (Reflect.ownKeys(value).length) throw unsupportedLocalScene();
      for (const [key, item] of value) { visit(key); visit(item); }
      return;
    }
    if (value instanceof Set && Object.getPrototypeOf(value) === Set.prototype) {
      if (Reflect.ownKeys(value).length) throw unsupportedLocalScene();
      for (const item of value) visit(item);
      return;
    }
    const prototype = Object.getPrototypeOf(value);
    if (Array.isArray(value) ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) throw unsupportedLocalScene();
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor) throw unsupportedLocalScene();
      if (typeof key === "symbol") throw unsupportedLocalScene();
      if (!descriptor.enumerable) { if (Array.isArray(value) && key === "length") continue; throw unsupportedLocalScene(); }
      if (!("value" in descriptor)) throw unsupportedLocalScene();
      visit(descriptor.value);
    }
  };
  try {
    validateScene(scene);
    visit(scene);
    validateWorkerSceneGroups(scene);
  } catch (error) {
    const actual = knownWorkerError(error);
    if (actual) throw new AuraWorkerError(actual.message, actual.code, "recoverable");
    throw unsupportedLocalScene();
  }
}

function preflightLocalScene(scene: AuraSceneSnapshot): void {
  validateLocalSceneValues(scene);
  try {
    // The projected scene was already structured-cloned. Validate its texture
    // descriptors without copying or sending the worker-owned backing bytes.
    snapshotTransferableScene(scene, [], () => {}, false);
  } catch (error) {
    const actual = knownWorkerError(error);
    if (actual) throw new AuraWorkerError(actual.message, actual.code, "recoverable");
    throw unsupportedLocalScene();
  }
}

function snapshotLocalScene(scene: AuraSceneSnapshot): AuraSceneSnapshot {
  validateLocalSceneValues(scene);
  try {
    if (typeof structuredClone !== "function") throw unsupportedLocalScene();
    return structuredClone(snapshotTransferableScene(scene, [], () => {}));
  } catch (error) {
    const actual = knownWorkerError(error);
    if (actual) throw new AuraWorkerError(actual.message, actual.code, "recoverable");
    throw unsupportedLocalScene();
  }
}

/** Clone scene values without cloning or transferring retained worker texture handles. */
function cloneLocalScene(scene: AuraSceneSnapshot): AuraSceneSnapshot {
  const handles: TextureHandle[] = [];
  const markers: object[] = [];
  try {
    const masked = mapWorkerScene(scene, (value) => {
      if (!(value instanceof TextureHandle)) return undefined;
      const marker = {};
      handles.push(value);
      markers.push(marker);
      return marker;
    });
    // Markers and scene are cloned together so their aliases stay intact;
    // identity, rather than a reserved scene field, identifies each handle.
    const copied = structuredClone({ scene: masked, markers });
    const originals = new Map<object, TextureHandle>(copied.markers.map((marker, index) => [marker, handles[index]!] as const));
    return mapWorkerScene(copied.scene, (value) => originals.get(value));
  } catch {
    throw new AuraWorkerError("Worker-local scene replacement could not be cloned.", "unsupported-worker-scene", "recoverable");
  }
}

/** Compare clone graphs, including aliases and pixel bytes, after the host acknowledges. */
function equalLocalSnapshots(left: unknown, right: unknown): boolean {
  const forward = new Map<object, object>();
  const reverse = new Map<object, object>();
  const equal = (a: unknown, b: unknown): boolean => {
    if (Object.is(a, b)) return true;
    if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
    const matched = forward.get(a);
    if (matched || reverse.has(b)) return matched === b;
    if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
    forward.set(a, b);
    reverse.set(b, a);
    if (a instanceof ArrayBuffer && b instanceof ArrayBuffer) {
      if (a.byteLength !== b.byteLength) return false;
      const x = new Uint8Array(a), y = new Uint8Array(b);
      for (let index = 0; index < x.length; index++) if (x[index] !== y[index]) return false;
      return true;
    }
    if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) {
      return a.byteOffset === b.byteOffset && a.byteLength === b.byteLength && equal(a.buffer, b.buffer);
    }
    if (a instanceof Date && b instanceof Date) return Object.is(a.getTime(), b.getTime());
    if (a instanceof RegExp && b instanceof RegExp) return a.source === b.source && a.flags === b.flags && a.lastIndex === b.lastIndex;
    if (a instanceof Map && b instanceof Map) {
      if (a.size !== b.size) return false;
      const entries = b.entries();
      for (const [key, value] of a) {
        const other = entries.next().value;
        if (!other || !equal(key, other[0]) || !equal(value, other[1])) return false;
      }
      return true;
    }
    if (a instanceof Set && b instanceof Set) {
      if (a.size !== b.size) return false;
      const entries = b.values();
      for (const value of a) if (!equal(value, entries.next().value)) return false;
      return true;
    }
    if (Array.isArray(a) && (!Array.isArray(b) || a.length !== b.length)) return false;
    const keys = Object.keys(a), otherKeys = Object.keys(b);
    if (keys.length !== otherKeys.length) return false;
    return keys.every((key, index) => key === otherKeys[index] && equal(
      (a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]
    ));
  };
  return equal(left, right);
}

function validateWorkerTextureSnapshot(value: WorkerTextureSnapshot): number {
  const pair = (item: unknown): boolean => Array.isArray(item) && item.length === 2 && Object.hasOwn(item, 0) && Object.hasOwn(item, 1) && item.every((entry) => typeof entry === "number" && Number.isFinite(entry));
  if (typeof value.id !== "string" || value.id.length === 0 || value.id.length > 256
    || !Number.isSafeInteger(value.width) || value.width < 1 || !Number.isSafeInteger(value.height) || value.height < 1
    || !["rgba8", "rgba16f", "rgba32f", "r32f"].includes(value.format)
    || !Array.isArray(value.levels) || value.levels.length < 1
    || value.levels.length > Math.floor(Math.log2(Math.max(value.width, value.height))) + 1
    || !Number.isSafeInteger(value.suppliedMipCount) || value.suppliedMipCount < 0 || value.suppliedMipCount > value.levels.length
    || (value.dynamic && (value.suppliedMipCount > 0 || value.levels.length !== 1))
    || !["linear", "srgb"].includes(value.colorSpace) || typeof value.flipY !== "boolean" || typeof value.generateMipmaps !== "boolean" || typeof value.dynamic !== "boolean"
    || (value.format === "r32f" && value.colorSpace !== "linear")
    || !Array.isArray(value.usage) || !value.usage.includes("sampled") || !value.usage.includes("copy-dst")
    || value.usage.some((usage) => !["sampled", "copy-src", "copy-dst"].includes(usage)) || new Set(value.usage).size !== value.usage.length
    || !["clamp", "repeat", "mirror"].includes(value.wrapS) || !["clamp", "repeat", "mirror"].includes(value.wrapT)
    || !pair(value.repeat) || !pair(value.offset) || !pair(value.center) || !Number.isFinite(value.rotation)
    || !Number.isFinite(value.anisotropy) || value.anisotropy < 1
    || !["nearest", "linear", "nearest-mipmap-nearest", "linear-mipmap-nearest", "nearest-mipmap-linear", "linear-mipmap-linear"].includes(value.minFilter)
    || !["nearest", "linear"].includes(value.magFilter)
    || (value.canvasSource !== undefined && (value.canvasSource !== true || value.format !== "rgba8" || value.levels.length !== 1 || value.suppliedMipCount !== 0))) throw unsupportedWorkerTexture();
  const bytesPerPixel = value.format === "rgba16f" ? 8 : value.format === "rgba32f" ? 16 : 4;
  let total = 0;
  for (let index = 0; index < value.levels.length; index++) {
    if (!Object.hasOwn(value.levels, index)) throw unsupportedWorkerTexture();
    const level = value.levels[index];
    if (level === null) {
      if (index === 0 || index < value.suppliedMipCount) throw unsupportedWorkerTexture();
      continue;
    }
    if (!level || typeof level !== "object") throw unsupportedWorkerTexture();
    const width = Math.max(1, Math.floor(value.width / 2 ** index));
    const height = Math.max(1, Math.floor(value.height / 2 ** index));
    const size = width * height * bytesPerPixel;
    const data = level.data;
    const typeMatches = value.format === "rgba8" ? data instanceof Uint8Array || data instanceof Uint8ClampedArray
      : value.format === "rgba16f" ? data instanceof Uint16Array : data instanceof Float32Array;
    if (level.width !== width || level.height !== height || ("depth" in level && level.depth !== undefined)
      || !Number.isSafeInteger(size) || size <= 0
      || !typeMatches || data.byteLength !== size || (typeof SharedArrayBuffer !== "undefined" && data.buffer instanceof SharedArrayBuffer)
      || (total += size) > MAX_WORKER_TEXTURE_BYTES) throw unsupportedWorkerTexture();
  }
  return total;
}

/** Worker-side image texture rebuilt from a host canvas snapshot; host repaints write into `write`. */
interface WorkerCanvasTexture {
  readonly hostId: string;
  readonly width: number;
  readonly height: number;
  write(data: Uint8ClampedArray | Uint8Array): void;
}
const workerCanvasTextures = new WeakMap<TextureHandle, WorkerCanvasTexture>();

/** Flip rows (data textures ignore flipY; image uploads apply it). */
function flipRows(data: Uint8ClampedArray | Uint8Array, width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data.length);
  const row = width * 4;
  for (let y = 0; y < height; y++) out.set(data.subarray(y * row, (y + 1) * row), (height - 1 - y) * row);
  return out;
}

function createWorkerCanvasTexture(snapshot: WorkerTextureSnapshot): TextureHandle {
  const { width, height } = snapshot;
  const pixels = snapshot.levels[0]!.data as Uint8ClampedArray | Uint8Array;
  const sampler = { wrapS: snapshot.wrapS, wrapT: snapshot.wrapT, anisotropy: snapshot.anisotropy, minFilter: snapshot.minFilter, magFilter: snapshot.magFilter };
  const common = { width, height, format: "rgba8" as const, colorSpace: snapshot.colorSpace, generateMipmaps: snapshot.generateMipmaps,
    usage: snapshot.usage };
  const canvas = typeof OffscreenCanvas === "function" && typeof ImageData === "function" ? new OffscreenCanvas(width, height) : undefined;
  const context = canvas?.getContext("2d") as OffscreenCanvasRenderingContext2D | null | undefined;
  let backing: Texture;
  let write: (data: Uint8ClampedArray | Uint8Array) => void;
  if (canvas && context) {
    const put = (data: Uint8ClampedArray | Uint8Array): void => {
      context.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
    };
    put(pixels);
    backing = new Texture({ ...common, source: canvas, dynamic: snapshot.dynamic, flipY: snapshot.flipY, label: "worker-canvas-texture" });
    write = (data) => { put(data); backing.markNeedsUpdate(); };
  } else {
    // No 2D canvas in this realm: a dynamic data texture with flipY applied to the rows.
    const orient = (data: Uint8ClampedArray | Uint8Array): Uint8ClampedArray => snapshot.flipY ? flipRows(data, width, height) : new Uint8ClampedArray(data);
    backing = new Texture({ ...common, data: orient(pixels), dynamic: true, label: "worker-canvas-texture" });
    write = (data) => backing.update(orient(data));
  }
  let handle: TextureHandle;
  try { handle = new TextureHandle(backing, sampler); }
  catch (error) { backing.dispose(); throw error; }
  workerCanvasTextures.set(handle, {
    hostId: snapshot.id, width, height,
    write: (data) => {
      if (data.byteLength !== width * height * 4) throw new AuraWorkerError("Worker texture update does not match the texture size.", "invalid-patch", "recoverable");
      write(data);
    }
  });
  return handle;
}

/** Host texture id of every worker handle rebuilt from a host snapshot (canvas and data textures). */
const workerTextureHostIds = new WeakMap<TextureHandle, string>();
/** 5.4 patch args: a texture the worker already holds, named by its host id. */
const WORKER_TEXTURE_ID_KIND = "aura-worker-texture-id";

/** Ids of the texture refs a scene (or patch argument) carries; the worker rebuilds each under the same host id. */
export function collectWorkerTextureIds(value: unknown, into: Set<string> = new Set()): Set<string> {
  mapWorkerScene(value, (current) => {
    if ((current as { kind?: unknown }).kind === "aura-texture-ref") { into.add((current as AuraTextureRef).id); return current; }
    if ((current as { kind?: unknown }).kind === WORKER_TEXTURE_KIND) { into.add((current as WorkerTextureSnapshot).id); return current; }
    return undefined;
  });
  return into;
}

/**
 * 5.4 host side of a node patch whose arguments carry textures (`node.setMaterial(material.standard({ map }))`):
 * a texture the worker already holds becomes an id placeholder; any other one is snapshotted like a scene texture
 * (live canvases read back, data textures copied) and its id is added to `known`.
 */
export function snapshotWorkerPatchArgs<T>(args: T, known: Set<string>): T {
  let textures = false;
  const placeheld = mapWorkerScene(args, (value) => {
    if ((value as { kind?: unknown }).kind !== "aura-texture-ref") return undefined;
    textures = true;
    const id = (value as AuraTextureRef).id;
    // Unknown refs pass through uncopied (their backing is read by the snapshot below).
    return known.has(id) ? { kind: WORKER_TEXTURE_ID_KIND, id } : value;
  });
  if (!textures) return args;
  const snapshotted = snapshotTransferableScene(placeheld as unknown as AuraSceneSnapshot, [], () => undefined) as unknown as T;
  collectWorkerTextureIds(snapshotted, known);
  return snapshotted;
}

/**
 * Worker side of {@link snapshotWorkerPatchArgs}: rebuilds snapshotted textures (returned in `created`; the caller owns
 * them with the scene's textures) and resolves id placeholders to the handles of the mounted scene.
 */
export function hydrateWorkerPatchArgs<T>(args: T, owned: ReadonlySet<TextureHandle>): { readonly args: T; readonly created: Set<TextureHandle> } {
  let textures = false;
  mapWorkerScene(args, (value) => {
    const kind = (value as { kind?: unknown }).kind;
    if (kind === WORKER_TEXTURE_KIND || kind === WORKER_TEXTURE_ID_KIND) textures = true;
    return kind === WORKER_TEXTURE_KIND || kind === WORKER_TEXTURE_ID_KIND ? value : undefined;
  });
  if (!textures) return { args, created: new Set() };
  const hydrated = rehydrateWorkerScene(args as unknown as AuraSceneSnapshot, new Set());
  try {
    const resolved = mapWorkerScene(hydrated.scene as unknown as T, (value) => {
      if ((value as { kind?: unknown }).kind !== WORKER_TEXTURE_ID_KIND) return undefined;
      const id = (value as { id?: unknown }).id;
      for (const handle of [...hydrated.created, ...owned]) {
        if (workerTextureHostIds.get(handle) === id && !handle.texture.disposed) return handle;
      }
      throw new AuraWorkerError(`Worker texture ${String(id)} is not held by the render worker.`, "invalid-patch", "recoverable");
    });
    return { args: resolved, created: hydrated.created };
  } catch (error) {
    for (const handle of hydrated.created) handle.dispose();
    throw error;
  }
}

/** Resolve a host texture id to the worker's canvas texture among the scene's handles. */
export function findWorkerCanvasTexture(handles: Iterable<TextureHandle>, hostId: string): WorkerCanvasTexture | undefined {
  for (const handle of handles) {
    const entry = workerCanvasTextures.get(handle);
    if (entry?.hostId === hostId && !handle.texture.disposed) return entry;
  }
  return undefined;
}

/** Recreate a worker-local backing and retain old ones used by an onFrame scene. */
function rehydrateWorkerScene(scene: AuraSceneSnapshot, owned: ReadonlySet<TextureHandle>): {
  readonly scene: AuraSceneSnapshot; readonly created: Set<TextureHandle>; readonly retained: Set<TextureHandle>;
} {
  const created = new Set<TextureHandle>();
  const retained = new Set<TextureHandle>();
  let count = 0;
  let bytes = 0;
  try {
    const hydrated = mapWorkerScene(scene, (value) => {
      const kind = (value as { kind?: unknown }).kind;
      if (kind === LEGACY_WORKER_TEXTURE_KIND) throw unsupportedWorkerTexture();
      if (kind === "aura-texture-ref") {
        const ref = value as TextureHandle;
        const backing = auraTextureRefTexture(ref);
        if (!backing) throw unsupportedWorkerTexture();
        if (owned.has(ref)) {
          let length = 0;
          for (let index = 0; index < backing.mipLevelCount; index++) length += backing.getMipLevel(index)?.data.byteLength ?? 0;
          if (++count > MAX_WORKER_TEXTURE_COUNT || (bytes += length) > MAX_WORKER_SCENE_TEXTURE_BYTES) throw unsupportedWorkerTexture();
          retained.add(ref);
        }
        return ref;
      }
      if (kind !== WORKER_TEXTURE_KIND) return undefined;
      const snapshot = value as WorkerTextureSnapshot;
      const length = validateWorkerTextureSnapshot(snapshot);
      if (++count > MAX_WORKER_TEXTURE_COUNT || (bytes += length) > MAX_WORKER_SCENE_TEXTURE_BYTES) throw unsupportedWorkerTexture();
      if (snapshot.canvasSource) {
        const handle = createWorkerCanvasTexture(snapshot);
        created.add(handle);
        workerTextureHostIds.set(handle, snapshot.id);
        handle.repeat = [...snapshot.repeat]; handle.offset = [...snapshot.offset]; handle.center = [...snapshot.center]; handle.rotation = snapshot.rotation;
        return handle;
      }
      const supplied = snapshot.suppliedMipCount;
      const backing = new Texture({ width: snapshot.width, height: snapshot.height, format: snapshot.format,
        ...(supplied ? { mipLevels: snapshot.levels.slice(0, supplied) as WorkerTextureMip[] } : { data: snapshot.levels[0]!.data }),
        mipLevelCount: snapshot.levels.length,
        colorSpace: snapshot.colorSpace, flipY: snapshot.flipY, generateMipmaps: snapshot.generateMipmaps, dynamic: snapshot.dynamic,
        usage: snapshot.usage, label: "worker-texture-snapshot" });
      let handle: TextureHandle;
      try {
        // Overrides beyond the initially supplied chain may be sparse. Restore
        // them through the native update API, then restore generation metadata.
        for (let index = Math.max(1, supplied); index < snapshot.levels.length; index++) {
          const level = snapshot.levels[index];
          if (level) backing.updateMip(index, level.data);
        }
        backing.generateMipmaps = snapshot.generateMipmaps;
        handle = new TextureHandle(backing, { wrapS: snapshot.wrapS, wrapT: snapshot.wrapT, anisotropy: snapshot.anisotropy,
          minFilter: snapshot.minFilter, magFilter: snapshot.magFilter });
      } catch (error) { backing.dispose(); throw error; }
      created.add(handle);
      workerTextureHostIds.set(handle, snapshot.id);
      handle.repeat = [...snapshot.repeat]; handle.offset = [...snapshot.offset]; handle.center = [...snapshot.center]; handle.rotation = snapshot.rotation;
      return handle;
    });
    return { scene: hydrated, created, retained };
  } catch (error) {
    for (const handle of created) handle.dispose();
    throw error;
  }
}
/** Content-box geometry for an untransformed or positively axis-scaled canvas. */
function canvasContentGeometry(canvas: HTMLCanvasElement): {
  readonly left: number; readonly top: number; readonly scaleX: number; readonly scaleY: number;
  readonly contentLeft: number; readonly contentTop: number; readonly width: number; readonly height: number;
} {
  const rect = canvas.getBoundingClientRect();
  const style = typeof getComputedStyle === "function" ? getComputedStyle(canvas) : undefined;
  const px = (value: string | undefined): number => {
    const parsed = Number.parseFloat(value ?? "");
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  };
  const left = px(style?.paddingLeft) + px(style?.borderLeftWidth);
  const right = px(style?.paddingRight) + px(style?.borderRightWidth);
  const top = px(style?.paddingTop) + px(style?.borderTopWidth);
  const bottom = px(style?.paddingBottom) + px(style?.borderBottomWidth);
  const width = Number.parseFloat(style?.width ?? "");
  const height = Number.parseFloat(style?.height ?? "");
  const layoutWidth = Number.isFinite(width) && width > 0
    ? width + (style?.boxSizing === "border-box" ? 0 : left + right)
    : canvas.offsetWidth || rect.width;
  const layoutHeight = Number.isFinite(height) && height > 0
    ? height + (style?.boxSizing === "border-box" ? 0 : top + bottom)
    : canvas.offsetHeight || rect.height;
  return {
    left: rect.left, top: rect.top,
    scaleX: rect.width > 0 && layoutWidth > 0 ? rect.width / layoutWidth : 1,
    scaleY: rect.height > 0 && layoutHeight > 0 ? rect.height / layoutHeight : 1,
    contentLeft: left, contentTop: top,
    width: Math.max(0, layoutWidth - left - right), height: Math.max(0, layoutHeight - top - bottom)
  };
}

export function measureWorkerCanvas(canvas: HTMLCanvasElement | OffscreenCanvas): OffscreenCanvasSize {
  if (typeof (canvas as HTMLCanvasElement).getBoundingClientRect === "function") {
    const content = canvasContentGeometry(canvas as HTMLCanvasElement);
    return { width: content.width || canvas.width || 1, height: content.height || canvas.height || 1, pixelRatio: typeof devicePixelRatio === "number" && devicePixelRatio > 0 ? devicePixelRatio : 1 };
  }
  return { width: canvas.width || 1, height: canvas.height || 1, pixelRatio: 1 };
}

function installHostEvents(canvas: HTMLCanvasElement, api: AuraWorkerRenderer, cleanups: (() => void)[], options: AuraWorkerRendererOptions): () => Promise<void> {
  const pointers = new Map<number, AuraWorkerPointer>();
  const activePointers = new Set<number>();
  // Capture belongs to this bridge, not to the transferred renderer. Retain
  // only successful requests so teardown does not release another listener's
  // capture when the browser rejected ours.
  const capturedPointers = new Set<number>();
  const pointerEvents = createWorkerPointerEventBuffer();
  const keyEvents = createWorkerKeyEventBuffer();
  const keys = new Set<string>();
  let alive = true;
  let queued = false;
  let inputInFlight = false;
  let inputDirty = false;
  let inputVersion = 0;
  let deliveredVersion = 0;
  const inputWaiters = new Set<{ version: number; resolve: () => void; reject: (error: Error) => void }>();
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retryDelay = 50;
  let resizeInFlight = false;
  let latestSize: OffscreenCanvasSize | undefined;
  let resumeAfterResize = false;
  let lastVisibility: boolean | undefined;
  let visibilityVersion = 0;
  let resizeRetryTimer: ReturnType<typeof setTimeout> | undefined;
  let visibilityRetryTimer: ReturnType<typeof setTimeout> | undefined;
  let resizeRetryDelay = 50;
  let visibilityRetryDelay = 50;
  let observer: ResizeObserver | undefined;
  const pageWindow = typeof window === "undefined" ? undefined : window;
  const pageDocument = typeof document === "undefined" ? undefined : document;
  const releaseCaptures = (): void => {
    const owned = [...capturedPointers];
    capturedPointers.clear();
    for (const id of owned) {
      try { canvas.releasePointerCapture?.(id); } catch { /* capture may already have ended */ }
    }
  };
  const report = (error: unknown): void => {
    if (!alive) return;
    try { options.onError?.(asWorkerError(error)); } catch { /* reporting must not stop the bridge */ }
  };
  const now = (): number => typeof performance === "undefined" ? Date.now() : performance.now();
  const publish = (): void => {
    inputDirty = true;
    if (!alive || queued || inputInFlight || retryTimer !== undefined) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (!alive || inputInFlight || !inputDirty) return;
      inputDirty = false;
      inputInFlight = true;
      const version = inputVersion;
      const batch = pointerEvents.drain();
      const keyBatch = keyEvents.drain();
      const input: AuraWorkerInput = {
        pointers: [...pointers.values()], keys: [...keys], timestamp: now(),
        ...(batch.pointerEvents.length || batch.pointerEventsOverflow ? batch : {}),
        ...(keyBatch.keyEvents.length || keyBatch.keyEventsOverflow ? keyBatch : {})
      };
      void api.setInput(input).then(() => {
        retryDelay = 50;
        deliveredVersion = Math.max(deliveredVersion, version);
        for (const waiter of inputWaiters) {
          if (waiter.version <= deliveredVersion) { inputWaiters.delete(waiter); waiter.resolve(); }
        }
      }, (error: unknown) => {
        if (!alive) return;
        // A rejected delivery may have discarded history in either realm.
        // Tell the next successful frame to reconcile with the latest state.
        pointerEvents.markOverflow();
        keyEvents.markOverflow();
        inputDirty = true;
        retryTimer = setTimeout(() => { retryTimer = undefined; if (alive && inputDirty) publish(); }, retryDelay);
        retryDelay = Math.min(1000, retryDelay * 2);
        report(error);
      }).finally(() => { inputInFlight = false; if (inputDirty) publish(); });
    });
  };
  const pointer = (event: PointerEvent): void => {
    if (event.type === "lostpointercapture" && !activePointers.has(event.pointerId)) return;
    const previous = pointers.get(event.pointerId);
    const content = canvasContentGeometry(canvas);
    if (event.type === "pointerdown") {
      activePointers.add(event.pointerId);
      try {
        if (typeof canvas.setPointerCapture === "function") {
          canvas.setPointerCapture(event.pointerId);
          capturedPointers.add(event.pointerId);
        }
      } catch { /* capture is optional */ }
    }
    const ending = event.type === "pointerup" || event.type === "pointercancel" || event.type === "lostpointercapture";
    const useCoordinates = event.type !== "lostpointercapture";
    const sample: AuraWorkerPointer = {
      id: event.pointerId,
      type: event.pointerType || previous?.type || "",
      x: useCoordinates && Number.isFinite(event.clientX) ? (event.clientX - content.left) / content.scaleX - content.contentLeft : previous?.x ?? 0,
      y: useCoordinates && Number.isFinite(event.clientY) ? (event.clientY - content.top) / content.scaleY - content.contentTop : previous?.y ?? 0,
      buttons: ending ? 0 : Number.isFinite(event.buttons) ? event.buttons : previous?.buttons ?? 0,
      pressure: ending ? 0 : Number.isFinite(event.pressure) ? event.pressure : previous?.pressure ?? 0
    };
    if (ending) { pointers.delete(event.pointerId); activePointers.delete(event.pointerId); capturedPointers.delete(event.pointerId); }
    else {
      pointers.set(event.pointerId, sample);
      if (sample.buttons) activePointers.add(event.pointerId);
    }
    const timestamp = Number.isFinite(event.timeStamp) ? event.timeStamp : now();
    const entry: AuraWorkerPointerEvent = event.type === "pointercancel" || event.type === "lostpointercapture"
      ? { phase: "cancel", pointer: sample, timestamp, reason: event.type }
      : { phase: event.type === "pointerdown" ? "down" : event.type === "pointerup" ? "up" : "move", pointer: sample, timestamp };
    pointerEvents.append([entry]);
    inputVersion += 1;
    publish();
  };
  const key = (event: KeyboardEvent): void => {
    if (typeof event.code !== "string" || !event.code) return;
    const phase = event.type === "keydown" ? "down" : "up";
    if (phase === "down") keys.add(event.code); else keys.delete(event.code);
    keyEvents.append([{ phase, code: event.code, timestamp: Number.isFinite(event.timeStamp) ? event.timeStamp : now(), repeat: event.repeat === true }]);
    inputVersion += 1;
    publish();
  };
  const blur = (): void => {
    const timestamp = now();
    for (const id of activePointers) {
      const previous = pointers.get(id);
      if (previous) pointerEvents.append([{ phase: "cancel", pointer: { ...previous, buttons: 0, pressure: 0 }, timestamp, reason: "blur" }]);
    }
    for (const code of keys) keyEvents.append([{ phase: "up", code, timestamp, repeat: false, reason: "blur" }]);
    // Clear active state before releasing: a synchronous lost-capture event
    // must not enqueue a second cancellation for the same pointer.
    pointers.clear(); activePointers.clear(); keys.clear(); releaseCaptures(); inputVersion += 1; publish();
  };
  const queueFull = (error: unknown): boolean => {
    const actual = knownWorkerError(error);
    return actual?.code === "queue-full" && actual.severity === "recoverable";
  };
  const sendVisibility = (visible: boolean, version: number): void => {
    if (!alive || version !== visibilityVersion) return;
    if (visible && (resizeInFlight || latestSize || resizeRetryTimer !== undefined)) {
      // A newer resize can arrive while a previous visibility send is being
      // retried. Do not wake the worker until that measurement is delivered.
      resumeAfterResize = true;
      return;
    }
    void api.setVisible(visible).then(() => {
      if (version === visibilityVersion) visibilityRetryDelay = 50;
    }, (error: unknown) => {
      if (!alive || version !== visibilityVersion) return;
      report(error);
      if (!alive || version !== visibilityVersion || !queueFull(error) || visibilityRetryTimer !== undefined) return;
      visibilityRetryTimer = setTimeout(() => {
        visibilityRetryTimer = undefined;
        sendVisibility(visible, version);
      }, visibilityRetryDelay);
      visibilityRetryDelay = Math.min(1000, visibilityRetryDelay * 2);
    });
  };
  const flushResize = (): void => {
    if (!alive || resizeInFlight || resizeRetryTimer !== undefined) return;
    if (latestSize) {
      const size = latestSize; latestSize = undefined; resizeInFlight = true;
      void api.resize(size).then(() => { resizeRetryDelay = 50; }, (error: unknown) => {
        if (!alive) return;
        report(error);
        if (!alive || !queueFull(error)) return;
        // Keep the newest measurement, retrying with one bounded timer rather
        // than waking the worker with a stale size when its queue is full.
        latestSize ??= size;
        if (resizeRetryTimer === undefined) {
          resizeRetryTimer = setTimeout(() => { resizeRetryTimer = undefined; flushResize(); }, resizeRetryDelay);
          resizeRetryDelay = Math.min(1000, resizeRetryDelay * 2);
        }
      }).finally(() => { resizeInFlight = false; flushResize(); });
    } else if (resumeAfterResize) {
      resumeAfterResize = false;
      sendVisibility(true, visibilityVersion);
    }
  };
  const resize = (): void => {
    if (!alive || options.resize === false) return;
    try {
      const size = options.measureSize?.() ?? measureWorkerCanvas(canvas);
      workerCanvasBackingSize(size);
      latestSize = { width: size.width, height: size.height, pixelRatio: size.pixelRatio };
    } catch (error) {
      // Measurement and bounds failures happen before the worker is touched.
      // Keep its last valid size and allow a later resize to recover.
      report(new AuraWorkerError(asWorkerError(error).message, "invalid-resize", "recoverable"));
    }
    flushResize();
  };
  const visibility = (): void => {
    if (!alive || !pageDocument) return;
    const visible = pageDocument.visibilityState !== "hidden";
    if (visible === lastVisibility) return;
    const resuming = lastVisibility === false && visible;
    lastVisibility = visible;
    visibilityVersion += 1;
    if (visibilityRetryTimer !== undefined) clearTimeout(visibilityRetryTimer);
    visibilityRetryTimer = undefined;
    visibilityRetryDelay = 50;
    if (!visible) {
      // A newer hide cancels a resume still waiting for an earlier resize.
      resumeAfterResize = false;
      sendVisibility(false, visibilityVersion);
    } else if (resuming && options.resize !== false) {
      // Remeasure even if no resize event fired while hidden. Drain any older
      // in-flight resize and the latest measurement before waking the worker.
      resumeAfterResize = true;
      resize();
    } else {
      sendVisibility(true, visibilityVersion);
    }
  };
  // Register cleanup first so a failing listener or observer setup cannot
  // strand a transferred canvas, worker, or partially installed listeners.
  cleanups.push(() => {
    alive = false;
    let cleanupFailed = false;
    const release = (fn: () => void): void => { try { fn(); } catch { cleanupFailed = true; /* release the remaining listeners */ } };
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    if (resizeRetryTimer !== undefined) clearTimeout(resizeRetryTimer);
    if (visibilityRetryTimer !== undefined) clearTimeout(visibilityRetryTimer);
    for (const waiter of inputWaiters) waiter.reject(new AuraWorkerError("Worker renderer is disposed.", "disposed"));
    inputWaiters.clear();
    for (const name of ["pointerdown", "pointermove", "pointerup", "pointercancel", "lostpointercapture"] as const) release(() => canvas.removeEventListener(name, pointer));
    if (pageWindow) {
      release(() => pageWindow.removeEventListener("keydown", key)); release(() => pageWindow.removeEventListener("keyup", key));
      release(() => pageWindow.removeEventListener("blur", blur)); release(() => pageWindow.removeEventListener("resize", resize));
    }
    if (pageDocument) release(() => pageDocument.removeEventListener("visibilitychange", visibility));
    release(() => observer?.disconnect());
    releaseCaptures();
    pointers.clear(); activePointers.clear(); keys.clear();
    if (cleanupFailed) throw new AuraWorkerError("Worker event listener cleanup failed.", "worker-cleanup-failed");
  });
  for (const name of ["pointerdown", "pointermove", "pointerup", "pointercancel", "lostpointercapture"] as const) canvas.addEventListener(name, pointer);
  if (pageWindow) { pageWindow.addEventListener("keydown", key); pageWindow.addEventListener("keyup", key); pageWindow.addEventListener("blur", blur); if (options.resize !== false) pageWindow.addEventListener("resize", resize); }
  if (pageDocument) { pageDocument.addEventListener("visibilitychange", visibility); visibility(); }
  observer = options.resize === false || typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(resize);
  observer?.observe(canvas);
  return () => {
    if (!alive) return Promise.reject(new AuraWorkerError("Worker renderer is disposed.", "disposed"));
    if (deliveredVersion >= inputVersion) return Promise.resolve();
    const version = inputVersion;
    return new Promise<void>((resolve, reject) => { inputWaiters.add({ version, resolve, reject }); });
  };
}
