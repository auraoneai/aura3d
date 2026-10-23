import {
  WebXRSessionController,
  type A3DXRFrameLike,
  type A3DXRSessionLike,
  type A3DXRSystemLike,
  type A3DXRWebGLLayerLike,
  type WebXRFrameSample
} from "@aura3d/input";
import type {
  AuraXRDeviceBridge,
  AuraXREnterResult,
  AuraXREventMap,
  AuraXREventName,
  AuraXRMode,
  AuraXRRuntime,
  AuraXRSessionInit
} from "./types.js";
import { resolveXRView, setXRViewCamera } from "./xrViewOverride.js";

export interface AuraXRLayerInit {
  readonly antialias?: boolean;
  readonly alpha?: boolean;
  readonly depth?: boolean;
  readonly stencil?: boolean;
  readonly framebufferScaleFactor?: number;
}

export type AuraXRLayerConstructor = new (session: A3DXRSessionLike, gl: unknown, init?: AuraXRLayerInit) => A3DXRWebGLLayerLike;

export interface AuraXRRuntimeOptions {
  /** Key for the per-eye camera override; the app canvas. Must match what the renderer is given. */
  readonly key: object;
  readonly xr?: A3DXRSystemLike;
  /** The WebGL2 context the renderer draws with. */
  readonly getGL: () => { makeXRCompatible?(): Promise<void> } | undefined;
  readonly layerConstructor?: AuraXRLayerConstructor;
  readonly layerOptions?: AuraXRLayerInit;
  readonly getDevice: () => AuraXRDeviceBridge | undefined;
  /** Render the current scene once, synchronously, with the installed eye. `timeSeconds` is the app clock. */
  readonly renderFrame: (timeSeconds: number) => void;
  /** Stop/resume the window `requestAnimationFrame` loop while XR drives frames. */
  readonly pauseLoop?: () => void;
  readonly resumeLoop?: () => void;
  /** App runtime clock in seconds; XR frames continue from it and write it back. */
  readonly getTime?: () => number;
  readonly setTime?: (seconds: number) => void;
  readonly depthRange?: () => { readonly near?: number; readonly far?: number };
  readonly canvasSize?: () => { readonly width: number; readonly height: number };
}

type Listener<K extends AuraXREventName> = (payload: AuraXREventMap[K]) => void;

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function createAuraXRRuntime(options: AuraXRRuntimeOptions): AuraXRRuntime {
  const listeners = new Map<AuraXREventName, Set<Listener<AuraXREventName>>>();
  const warned = new Set<string>();
  let controller: WebXRSessionController | null = null;
  let session: A3DXRSessionLike | null = null;
  let layer: A3DXRWebGLLayerLike | null = null;
  let activeMode: AuraXRMode | null = null;
  let endListener: (() => void) | null = null;
  let frameHandle = 0;
  let lastSample: WebXRFrameSample | null = null;
  let firstFrameMs: number | null = null;
  let timeBase = 0;
  let disposed = false;

  const emit = <K extends AuraXREventName>(event: K, payload: AuraXREventMap[K]): void => {
    for (const listener of [...(listeners.get(event) ?? [])]) {
      try {
        (listener as Listener<K>)(payload);
      } catch {
        // A throwing listener must not break the XR frame loop or other listeners.
      }
    }
  };

  const reportError = (code: string, message: string): void => emit("error", { code, message });

  const warnOnce = (code: string, message: string): void => {
    if (warned.has(code)) return;
    warned.add(code);
    reportError(code, message);
  };

  const xrSystem = (): A3DXRSystemLike | undefined =>
    options.xr ?? (globalThis.navigator as (Navigator & { xr?: A3DXRSystemLike }) | undefined)?.xr;

  const releaseDevice = (): void => {
    const size = options.canvasSize?.() ?? { width: 0, height: 0 };
    options.getDevice()?.setExternalFramebuffer?.(null, size.width, size.height);
  };

  const teardown = (): void => {
    const endedSession = session;
    if (!endedSession) return;
    const mode = activeMode!;
    session = null;
    layer = null;
    activeMode = null;
    controller = null;
    if (frameHandle) endedSession.cancelAnimationFrame?.(frameHandle);
    frameHandle = 0;
    if (endListener) endedSession.removeEventListener?.("end", endListener);
    endListener = null;
    setXRViewCamera(options.key, undefined);
    releaseDevice();
    options.resumeLoop?.();
    emit("sessionend", { mode });
  };

  const appTime = (xrMs: number): number => {
    if (firstFrameMs === null) {
      firstFrameMs = xrMs;
      timeBase = options.getTime?.() ?? 0;
    }
    const seconds = timeBase + (xrMs - firstFrameMs) / 1000;
    options.setTime?.(seconds);
    return seconds;
  };

  const onXRFrame = (timeMs: number, frame: A3DXRFrameLike): void => {
    const active = session;
    const activeController = controller;
    const activeLayer = layer;
    if (!active || !activeController || !activeLayer) return;
    frameHandle = active.requestAnimationFrame?.(onXRFrame) ?? 0;
    const sample = activeController.sampleFrame(frame);
    lastSample = sample;
    const referenceSpace = activeController.xrReferenceSpace;
    const views = (referenceSpace ? frame.getViewerPose?.(referenceSpace)?.views : undefined) ?? [];
    let rendered = 0;
    if (views.length > 0) {
      const device = options.getDevice();
      if (!device?.setExternalFramebuffer || !device.setViewport) {
        warnOnce("XR_RENDER_PATH_LOST", "The render device no longer exposes setExternalFramebuffer/setViewport; ending the XR session.");
        void runtime.exit();
        return;
      }
      const framebufferWidth = activeLayer.framebufferWidth ?? 0;
      const framebufferHeight = activeLayer.framebufferHeight ?? 0;
      try {
        device.setExternalFramebuffer(activeLayer.framebuffer, framebufferWidth, framebufferHeight);
        const seconds = appTime(timeMs);
        for (const view of views) {
          const viewport = activeLayer.getViewport?.(view) ?? { x: 0, y: 0, width: framebufferWidth, height: framebufferHeight };
          const camera = resolveXRView(view, { x: viewport.x, y: viewport.y, width: viewport.width, height: viewport.height });
          if (!camera) {
            warnOnce("XR_VIEW_MATRICES_INVALID", "An XRView had missing or non-finite matrices; that eye was skipped.");
            continue;
          }
          device.setViewport(camera.viewport.x, camera.viewport.y, camera.viewport.width, camera.viewport.height);
          setXRViewCamera(options.key, camera);
          options.renderFrame(seconds);
          rendered += 1;
        }
      } catch (error) {
        reportError("XR_RENDER_FAILED", errorMessage(error));
        void runtime.exit();
        return;
      } finally {
        setXRViewCamera(options.key, undefined);
        releaseDevice();
      }
    }
    emit("frame", { time: timeMs, viewCount: rendered, sample });
  };

  const runtime: AuraXRRuntime = {
    get isPresenting() {
      return session !== null;
    },
    get mode() {
      return activeMode;
    },
    get lastSample() {
      return lastSample;
    },
    async isSupported(mode: AuraXRMode = "immersive-vr") {
      const system = xrSystem();
      if (!system) return false;
      if (!system.isSessionSupported) return true;
      try {
        return await system.isSessionSupported(mode);
      } catch {
        return false;
      }
    },
    async enter(mode: AuraXRMode = "immersive-vr", init: AuraXRSessionInit = {}): Promise<AuraXREnterResult> {
      const warnings: string[] = [];
      const fail = (
        reason: NonNullable<AuraXREnterResult["reason"]>,
        message: string
      ): AuraXREnterResult => {
        reportError(`XR_${reason.toUpperCase().replace(/-/g, "_")}`, message);
        return { supported: reason !== "no-webxr" && reason !== "unsupported", started: false, mode, reason, message, warnings };
      };
      if (disposed) return fail("session-failed", "app.xr was disposed.");
      if (session) return { supported: true, started: false, mode, reason: "already-presenting", warnings };
      const system = xrSystem();
      if (!system) return fail("no-webxr", "navigator.xr is not available in this browser.");
      if (!(await runtime.isSupported(mode))) return fail("unsupported", `${mode} is not supported on this device.`);
      const device = options.getDevice();
      if (!device || typeof device.setExternalFramebuffer !== "function" || typeof device.setViewport !== "function") {
        return fail(
          "render-path-unavailable",
          "The render device cannot draw into an XR framebuffer (it needs setExternalFramebuffer and setViewport). No session was started."
        );
      }
      const gl = options.getGL();
      if (!gl) return fail("no-webgl-context", "No WebGL2 context is available to bind an XR layer to.");
      const Layer = options.layerConstructor ?? (globalThis as { XRWebGLLayer?: AuraXRLayerConstructor }).XRWebGLLayer;
      if (!Layer) return fail("no-xr-layer", "XRWebGLLayer is not available in this browser.");

      const next = new WebXRSessionController({
        xr: system,
        mode,
        ...(init.requiredFeatures ? { requiredFeatures: init.requiredFeatures } : {}),
        ...(init.optionalFeatures ? { optionalFeatures: init.optionalFeatures } : {}),
        ...(init.referenceSpace ? { referenceSpace: init.referenceSpace } : {})
      });
      try {
        const started = await next.start();
        if (!started.started || !next.xrSession) return fail("unsupported", `${mode} could not be started.`);
      } catch (error) {
        return fail("session-failed", errorMessage(error));
      }
      const nextSession = next.xrSession;
      let nextLayer: A3DXRWebGLLayerLike;
      try {
        await gl.makeXRCompatible?.();
        nextLayer = new Layer(nextSession, gl, options.layerOptions);
        const depth = options.depthRange?.();
        await nextSession.updateRenderState?.({
          baseLayer: nextLayer,
          ...(depth?.near !== undefined ? { depthNear: depth.near } : {}),
          ...(depth?.far !== undefined ? { depthFar: depth.far } : {})
        });
      } catch (error) {
        await next.end().catch(() => undefined);
        return fail("session-failed", errorMessage(error));
      }
      controller = next;
      session = nextSession;
      layer = nextLayer;
      activeMode = mode;
      firstFrameMs = null;
      endListener = () => teardown();
      nextSession.addEventListener?.("end", endListener);
      options.pauseLoop?.();
      frameHandle = nextSession.requestAnimationFrame?.(onXRFrame) ?? 0;
      emit("sessionstart", { mode });
      return { supported: true, started: true, mode, warnings };
    },
    async exit() {
      const active = controller;
      if (!active) return;
      try {
        await active.end();
      } finally {
        teardown();
      }
    },
    on(event, listener) {
      const set = listeners.get(event) ?? new Set();
      set.add(listener as Listener<AuraXREventName>);
      listeners.set(event, set);
      return () => {
        set.delete(listener as Listener<AuraXREventName>);
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      void runtime.exit().finally(() => listeners.clear());
    }
  };
  return runtime;
}
