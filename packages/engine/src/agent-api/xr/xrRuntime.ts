import {
  WebXRSessionController,
  type A3DXRDepthInformationLike,
  type A3DXREventLike,
  type A3DXRFrameLike,
  type A3DXRSessionLike,
  type A3DXRSystemLike,
  type A3DXRViewLike,
  type A3DXRViewportLike,
  type A3DXRWebGLLayerLike,
  type WebXRFrameSample
} from "@aura3d/input";
import type {
  AuraXRDeviceBridge, AuraXREnterResult, AuraXREventMap, AuraXREventName, AuraXRMode,
  AuraXRRuntime, AuraXRSessionInit, AuraXRSessionProvenance
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
export interface AuraXRProjectionLayerLike { fixedFoveation?: number | null }
export interface AuraXRSubImageLike {
  readonly colorTexture: unknown;
  readonly depthStencilTexture?: unknown | null;
  readonly textureWidth: number;
  readonly textureHeight: number;
  readonly viewport: A3DXRViewportLike;
}
export interface AuraXRWebGLBindingLike {
  createProjectionLayer(options?: { readonly textureType?: "texture"; readonly depthFormat?: number }): AuraXRProjectionLayerLike;
  getViewSubImage(layer: AuraXRProjectionLayerLike, view: A3DXRViewLike): AuraXRSubImageLike;
  getDepthInformation?(view: A3DXRViewLike): A3DXRDepthInformationLike | null | undefined;
}
export type AuraXRWebGLBindingConstructor = new (session: A3DXRSessionLike, gl: unknown) => AuraXRWebGLBindingLike;
export interface AuraXRCompositionGL {
  readonly FRAMEBUFFER: number;
  readonly COLOR_ATTACHMENT0: number;
  readonly DEPTH_ATTACHMENT: number;
  readonly DEPTH_COMPONENT24: number;
  readonly TEXTURE_2D: number;
  readonly FRAMEBUFFER_COMPLETE?: number;
  createFramebuffer(): unknown | null;
  deleteFramebuffer(framebuffer: unknown): void;
  bindFramebuffer(target: number, framebuffer: unknown | null): void;
  framebufferTexture2D(target: number, attachment: number, textureTarget: number, texture: unknown | null, level: number): void;
  checkFramebufferStatus?(target: number): number;
}
export interface AuraXRRuntimeOptions {
  readonly key: object;
  readonly xr?: A3DXRSystemLike;
  readonly getGL: () => { makeXRCompatible?(): Promise<void> } | undefined;
  readonly layerConstructor?: AuraXRLayerConstructor;
  readonly bindingConstructor?: AuraXRWebGLBindingConstructor;
  readonly layerOptions?: AuraXRLayerInit;
  readonly getDevice: () => AuraXRDeviceBridge | undefined;
  readonly renderFrame: (timeSeconds: number) => void;
  /** Advance app-owned simulation once per XR frame, before drawing either eye.
   * The first delta is zero; later deltas are clamped to 100 ms. When supplied,
   * getTime reads the resulting app clock and setTime is not called. */
  readonly advanceFrame?: (deltaSeconds: number) => void;
  /** Whether the app and renderer that began this frame still own it. */
  readonly isFrameCurrent?: () => boolean;
  readonly pauseLoop?: () => void;
  readonly resumeLoop?: () => void;
  readonly getTime?: () => number;
  readonly setTime?: (seconds: number) => void;
  readonly depthRange?: () => { readonly near?: number; readonly far?: number };
  readonly canvasSize?: () => { readonly width: number; readonly height: number };
}

type Listener<K extends AuraXREventName> = (payload: AuraXREventMap[K]) => void;
type Presentation =
  | { readonly kind: "base"; readonly layer: A3DXRWebGLLayerLike }
  | { readonly kind: "projection"; readonly layer: AuraXRProjectionLayerLike; readonly binding: AuraXRWebGLBindingLike; readonly gl: AuraXRCompositionGL; readonly framebuffer: unknown };
const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);

/** An app owns at most one session, including while permission and graphics setup are pending. */
export function createAuraXRRuntime(options: AuraXRRuntimeOptions): AuraXRRuntime {
  const listeners = new Map<AuraXREventName, Set<Listener<AuraXREventName>>>();
  const warned = new Set<string>();
  let controller: WebXRSessionController | null = null;
  let pending: WebXRSessionController | null = null;
  let session: A3DXRSessionLike | null = null;
  let presentation: Presentation | null = null;
  let depthBinding: AuraXRWebGLBindingLike | null = null;
  let activeMode: AuraXRMode | null = null;
  let activeProvenance: AuraXRSessionProvenance = "navigator";
  let removeNativeListeners: (() => void) | null = null;
  let frameHandle: number | null = null;
  let lastSample: WebXRFrameSample | null = null;
  let firstFrameMs: number | null = null;
  let previousFrameMs: number | null = null;
  let timeBase = 0;
  let disposed = false;
  let entering = false;
  let exiting: Promise<void> | null = null;
  let generation = 0;
  // A native reference-space reset changes the basis of every tracked pose.
  let referenceSpaceEpoch = 0;

  const emit = <K extends AuraXREventName>(event: K, payload: AuraXREventMap[K], current?: () => boolean): void => {
    for (const listener of [...(listeners.get(event) ?? [])]) {
      if (current && !current()) break;
      try { (listener as Listener<K>)(payload); } catch { /* listener isolation */ }
    }
  };
  const reportError = (code: string, message: string): void => emit("error", { code, message });
  const warnOnce = (code: string, message: string): void => {
    if (!warned.has(code)) { warned.add(code); reportError(code, message); }
  };
  const xrSystem = (): A3DXRSystemLike | undefined => options.xr ?? (globalThis.navigator as (Navigator & { xr?: A3DXRSystemLike }) | undefined)?.xr;
  const releaseDevice = (): void => {
    const device = options.getDevice();
    device?.resetViewport?.();
    const size = options.canvasSize?.() ?? { width: 0, height: 0 };
    device?.setExternalFramebuffer?.(null, size.width, size.height);
  };
  const teardown = (expected?: A3DXRSessionLike): void => {
    const ended = session;
    if (!ended || (expected && ended !== expected)) return;
    const mode = activeMode!;
    const oldPresentation = presentation;
    ++referenceSpaceEpoch;
    session = null;
    presentation = null;
    depthBinding = null;
    activeMode = null;
    controller = null;
    lastSample = null;
    if (frameHandle !== null) ended.cancelAnimationFrame?.(frameHandle);
    frameHandle = null;
    removeNativeListeners?.();
    removeNativeListeners = null;
    setXRViewCamera(options.key, undefined);
    releaseDevice();
    if (oldPresentation?.kind === "projection") oldPresentation.gl.deleteFramebuffer(oldPresentation.framebuffer);
    options.resumeLoop?.();
    emit("sessionend", { mode });
  };
  const appTime = (xrMs: number, current: () => boolean): number => {
    if (firstFrameMs === null) {
      const base = options.getTime?.() ?? 0;
      if (!current()) return base;
      firstFrameMs = xrMs;
      timeBase = base;
    }
    const seconds = timeBase + (xrMs - firstFrameMs) / 1000;
    options.setTime?.(seconds);
    return seconds;
  };
  const advanceAppTime = (xrMs: number, current: () => boolean): number => {
    const previous = previousFrameMs;
    if (previous === null) {
      const base = options.getTime?.() ?? 0;
      if (!current()) return base;
      timeBase = base;
    }
    previousFrameMs = xrMs;
    // Like the normal app loop, do not allow a long stall to produce an
    // unbounded simulation step. The first frame has no elapsed interval.
    const delta = previous === null ? 0 : Math.min(0.1, Math.max(0, (xrMs - previous) / 1000));
    options.advanceFrame!(delta);
    if (!current()) return timeBase;
    timeBase = options.getTime?.() ?? timeBase + delta;
    return timeBase;
  };
  const schedule = (active: A3DXRSessionLike): void => {
    frameHandle = active.requestAnimationFrame?.((time, frame) => { if (session === active && !exiting) onXRFrame(time, frame); }) ?? null;
  };
  const onXRFrame = (timeMs: number, frame: A3DXRFrameLike): void => {
    const active = session;
    const activeController = controller;
    const surface = presentation;
    if (!active || !activeController || !surface) return;
    const epoch = referenceSpaceEpoch;
    const ownsFrame = (): boolean => session === active && controller === activeController && !exiting && referenceSpaceEpoch === epoch;
    const frameCurrent = (): boolean => {
      if (!ownsFrame()) return false;
      if (options.isFrameCurrent && !options.isFrameCurrent()) {
        void runtime.exit();
        return false;
      }
      return ownsFrame();
    };
    schedule(active);
    if (!ownsFrame()) return;
    const sample = activeController.sampleFrame(frame, undefined, depthBinding?.getDepthInformation ? (view) => depthBinding?.getDepthInformation?.(view) : undefined);
    if (!ownsFrame()) return;
    lastSample = sample;
    // A simulation frame is independent of the number of eyes (and should
    // still advance if tracking is temporarily lost). The standalone runtime
    // without this hook retains its existing getTime/setTime clock contract.
    let simulationTime: number | undefined;
    if (options.advanceFrame) {
      try {
        simulationTime = advanceAppTime(timeMs, ownsFrame);
        if (!frameCurrent()) return;
      } catch (error) {
        reportError("XR_FRAME_UPDATE_FAILED", errorMessage(error));
        void runtime.exit();
        return;
      }
    }
    const referenceSpace = activeController.xrReferenceSpace;
    let views: readonly A3DXRViewLike[] = [];
    try { views = (referenceSpace ? frame.getViewerPose?.(referenceSpace)?.views : undefined) ?? []; }
    catch { /* tracking was lost during the frame */ }
    if (!frameCurrent()) return;
    let rendered = 0;
    if (views.length > 0) {
      const device = options.getDevice();
      if (!frameCurrent()) return;
      if (!device?.setExternalFramebuffer || !device.setViewport) {
        warnOnce("XR_RENDER_PATH_LOST", "The render device no longer exposes setExternalFramebuffer/setViewport; ending the XR session.");
        void runtime.exit();
        return;
      }
      try {
        const seconds = simulationTime ?? appTime(timeMs, frameCurrent);
        if (!frameCurrent()) return;
        for (const view of views) {
          if (!frameCurrent()) break;
          let viewport: A3DXRViewportLike;
          let framebuffer: unknown;
          let width: number;
          let height: number;
          if (surface.kind === "base") {
            width = surface.layer.framebufferWidth ?? 0;
            height = surface.layer.framebufferHeight ?? 0;
            viewport = surface.layer.getViewport?.(view) ?? { x: 0, y: 0, width, height };
            if (!frameCurrent()) break;
            framebuffer = surface.layer.framebuffer;
          } else {
            const image = surface.binding.getViewSubImage(surface.layer, view);
            if (!frameCurrent()) break;
            viewport = image.viewport;
            width = image.textureWidth;
            height = image.textureHeight;
            framebuffer = surface.framebuffer;
            const gl = surface.gl;
            gl.bindFramebuffer(gl.FRAMEBUFFER, surface.framebuffer);
            if (!frameCurrent()) break;
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, image.colorTexture, 0);
            if (!frameCurrent()) break;
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, image.depthStencilTexture ?? null, 0);
            if (!frameCurrent()) break;
            if (gl.checkFramebufferStatus && gl.FRAMEBUFFER_COMPLETE !== undefined) {
              const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
              if (!frameCurrent()) break;
              if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error("XR projection framebuffer is incomplete.");
            }
          }
          if (!(viewport.width > 0) || !(viewport.height > 0)) continue;
          const camera = resolveXRView(view, viewport);
          if (!camera) { warnOnce("XR_VIEW_MATRICES_INVALID", "An XRView had missing or non-finite matrices; that eye was skipped."); continue; }
          if (!frameCurrent()) break;
          device.setExternalFramebuffer(framebuffer, width, height);
          if (!frameCurrent()) break;
          device.setViewport(camera.viewport.x, camera.viewport.y, camera.viewport.width, camera.viewport.height, { persistent: true });
          if (!frameCurrent()) break;
          setXRViewCamera(options.key, camera);
          options.renderFrame(seconds);
          rendered += 1;
          if (!frameCurrent()) break;
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
    if (frameCurrent()) emit("frame", { time: timeMs, viewCount: rendered, sample, provenance: activeProvenance }, frameCurrent);
  };

  const runtime: AuraXRRuntime = {
    get isPresenting() { return session !== null; },
    get mode() { return activeMode; },
    get lastSample() { return lastSample; },
    async isSupported(mode: AuraXRMode = "immersive-vr") {
      const system = xrSystem();
      if (!system) return false;
      if (!system.isSessionSupported) return true;
      try { return await system.isSessionSupported(mode); } catch { return false; }
    },
    async enter(mode: AuraXRMode = "immersive-vr", init: AuraXRSessionInit = {}): Promise<AuraXREnterResult> {
      const warnings: string[] = [];
      const provenance: AuraXRSessionProvenance = options.xr ? "injected" : "navigator";
      const fail = (reason: NonNullable<AuraXREnterResult["reason"]>, message: string): AuraXREnterResult => {
        if (reason !== "cancelled") reportError(`XR_${reason.toUpperCase().replace(/-/g, "_")}`, message);
        return { supported: reason !== "no-webxr" && reason !== "unsupported", started: false, mode, reason, message, warnings, provenance };
      };
      if (disposed) return fail("session-failed", "app.xr was disposed.");
      if (session || entering || exiting) return { supported: true, started: false, mode, reason: "already-presenting", warnings, provenance };
      if (init.foveation !== undefined && (!Number.isFinite(init.foveation) || init.foveation < 0 || init.foveation > 1)) return fail("session-failed", "XR foveation must be between 0 and 1.");
      const system = xrSystem();
      if (!system) return fail("no-webxr", "navigator.xr is not available in this browser.");
      const myGeneration = ++generation;
      entering = true;
      const current = (): boolean => !disposed && generation === myGeneration;
      const cancelled = (): AuraXREnterResult => fail("cancelled", "The pending XR session was cancelled.");
      let next: WebXRSessionController | null = null;
      let nextPresentation: Presentation | null = null;
      try {
        const supported = await runtime.isSupported(mode);
        if (!current()) return cancelled();
        if (!supported) return fail("unsupported", `${mode} is not supported on this device.`);
        const device = options.getDevice();
        if (!device || typeof device.setExternalFramebuffer !== "function" || typeof device.setViewport !== "function") return fail("render-path-unavailable", "The render device cannot draw into an XR framebuffer (it needs setExternalFramebuffer and setViewport). No session was started.");
        const gl = options.getGL();
        if (!gl) return fail("no-webgl-context", "No WebGL2 context is available to bind an XR layer to.");
        const Layer = options.layerConstructor ?? (globalThis as { XRWebGLLayer?: AuraXRLayerConstructor }).XRWebGLLayer;
        const Binding = options.bindingConstructor ?? (globalThis as { XRWebGLBinding?: AuraXRWebGLBindingConstructor }).XRWebGLBinding;
        if (!Layer && !(init.layers && Binding && isCompositionGL(gl as Partial<AuraXRCompositionGL>))) return fail("no-xr-layer", "No supported XR presentation layer is available in this browser.");
        const optional = [...(init.optionalFeatures ?? [])];
        const includeFeature = (feature: string): void => { if (!init.requiredFeatures?.includes(feature) && !optional.includes(feature)) optional.push(feature); };
        if (init.hitTest) includeFeature("hit-test");
        if (init.lightEstimation) includeFeature("light-estimation");
        if (init.layers) includeFeature("layers");
        if (init.depthSensing) includeFeature("depth-sensing");
        next = new WebXRSessionController({ xr: system, mode, requiredFeatures: init.requiredFeatures, optionalFeatures: optional, referenceSpace: init.referenceSpace, depthSensing: init.depthSensing, leaseOwner: options.key });
        pending = next;
        const started = await next.start();
        if (!current()) return cancelled();
        if (started.busy) return { supported: true, started: false, mode, reason: "already-presenting", warnings, provenance };
        if (!started.started || !next.xrSession) return fail("unsupported", `${mode} could not be started.`);
        warnings.push(...next.warnings);
        const nextSession = next.xrSession;
        if (!nextSession.updateRenderState || !nextSession.requestAnimationFrame) return fail("session-failed", "The XR session cannot present or drive animation frames.");
        await gl.makeXRCompatible?.();
        if (!current() || !next.active) return cancelled();
        let nextDepthBinding: AuraXRWebGLBindingLike | null = null;
        if (init.layers) {
          const compositionGL = gl as Partial<AuraXRCompositionGL>;
          if (Binding && isCompositionGL(compositionGL) && nextSession.updateRenderState) {
            let framebuffer: unknown | null = null;
            try {
              const binding = new Binding(nextSession, gl);
              nextDepthBinding = binding;
              const projectionLayer = binding.createProjectionLayer({ textureType: "texture", depthFormat: compositionGL.DEPTH_COMPONENT24 });
              framebuffer = compositionGL.createFramebuffer();
              if (!framebuffer) throw new Error("WebGL framebuffer allocation failed");
              await nextSession.updateRenderState({ layers: [projectionLayer], ...depthOptions(options.depthRange?.()) });
              if (!current() || !next.active) { compositionGL.deleteFramebuffer(framebuffer); return cancelled(); }
              nextPresentation = { kind: "projection", layer: projectionLayer, binding, gl: compositionGL, framebuffer };
            } catch (error) {
              if (framebuffer) compositionGL.deleteFramebuffer(framebuffer);
              nextDepthBinding = null;
              if (!current() || !next.active) return cancelled();
              warnings.push(`XR layers unavailable; using a base layer: ${errorMessage(error)}`);
            }
          } else warnings.push("XR layers unavailable; using a base layer.");
        }
        if (!nextPresentation) {
          if (!Layer) return fail("no-xr-layer", "XR composition layers failed and no base layer is available.");
          const baseLayer = new Layer(nextSession, gl, options.layerOptions);
          await nextSession.updateRenderState?.({ baseLayer, ...depthOptions(options.depthRange?.()) });
          if (!current() || !next.active) return cancelled();
          nextPresentation = { kind: "base", layer: baseLayer };
        }
        if (init.depthSensing && !nextDepthBinding) {
          if (Binding) {
            try { nextDepthBinding = new Binding(nextSession, gl); }
            catch (error) { warnings.push(`GPU depth sensing unavailable: ${errorMessage(error)}`); }
          }
        }
        let foveationSupported = false;
        if (init.foveation !== undefined) {
          const target = nextPresentation.layer;
          if (typeof target.fixedFoveation === "number" && Number.isFinite(target.fixedFoveation)) {
            try {
              target.fixedFoveation = init.foveation;
              foveationSupported = typeof target.fixedFoveation === "number" && Number.isFinite(target.fixedFoveation);
              if (!foveationSupported) warnings.push("XR fixed foveation could not be set.");
            }
            catch { warnings.push("XR fixed foveation could not be set."); }
          } else warnings.push("XR fixed foveation is unavailable.");
        }
        if (!current() || !next.active) return cancelled();
        controller = next;
        pending = null;
        session = nextSession;
        presentation = nextPresentation;
        depthBinding = nextDepthBinding;
        nextPresentation = null;
        activeMode = mode;
        activeProvenance = provenance;
        firstFrameMs = null;
        previousFrameMs = null;
        ++referenceSpaceEpoch;
        lastSample = null;
        const installedController = next;
        removeNativeListeners = attachEvents(nextSession, next.xrReferenceSpace!, () => teardown(nextSession), (event) => {
          if (session !== nextSession || controller !== installedController) return;
          ++referenceSpaceEpoch;
          lastSample = null;
          setXRViewCamera(options.key, undefined);
          emit("reset", { transform: event?.transform });
        }, emit);
        options.pauseLoop?.();
        if (!current() || session !== nextSession) return cancelled();
        schedule(nextSession);
        if (!current() || session !== nextSession) return cancelled();
        const usedLayers = presentation?.kind === "projection";
        emit("sessionstart", { mode, provenance });
        if (!current() || session !== nextSession) return cancelled();
        const depthUsage = !init.depthSensing ? "not-requested" : nextSession.depthUsage ??
          (nextSession.enabledFeatures ? (Array.from(nextSession.enabledFeatures).includes("depth-sensing") ? "unknown" : "unavailable") : "unknown");
        if (depthUsage === "unavailable") warnings.push("XR depth sensing was not granted by the session.");
        return { supported: true, started: true, mode, warnings, provenance,
          capabilities: { hitTest: next.xrHitTestSource !== null, lightEstimation: next.hasLightProbe, foveation: foveationSupported, layers: usedLayers, depthSensing: depthUsage } };
      } catch (error) {
        if (next && controller === next) {
          const startedSession = session;
          try { await next.end(); } finally { teardown(startedSession ?? undefined); }
        }
        return current() ? fail("session-failed", errorMessage(error)) : cancelled();
      } finally {
        if (nextPresentation?.kind === "projection") nextPresentation.gl.deleteFramebuffer(nextPresentation.framebuffer);
        if (next && controller !== next) await next.end();
        if (pending === next) pending = null;
        if (generation === myGeneration) entering = false;
      }
    },
    exit() {
      ++generation;
      entering = false;
      if (exiting) return exiting;
      const candidate = pending;
      pending = null;
      const active = controller;
      const oldSession = session;
      // Set the barrier before native end can dispatch an event. Repeated
      // exits share it and a new enter waits until the owned session is closed.
      const closing = Promise.resolve().then(async () => {
        if (candidate) await candidate.end();
        if (active) {
          try { await active.end(); } finally { teardown(oldSession ?? undefined); }
        }
      });
      exiting = closing;
      return closing.finally(() => { if (exiting === closing) exiting = null; });
    },
    on(event, listener) {
      const set = listeners.get(event) ?? new Set();
      set.add(listener as Listener<AuraXREventName>);
      listeners.set(event, set);
      return () => { set.delete(listener as Listener<AuraXREventName>); };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      void runtime.exit().finally(() => listeners.clear());
    }
  };
  return runtime;
}

function depthOptions(depth: { readonly near?: number; readonly far?: number } | undefined): { readonly depthNear?: number; readonly depthFar?: number } {
  return { ...(depth?.near !== undefined ? { depthNear: depth.near } : {}), ...(depth?.far !== undefined ? { depthFar: depth.far } : {}) };
}
function isCompositionGL(gl: Partial<AuraXRCompositionGL>): gl is AuraXRCompositionGL {
  return typeof gl.createFramebuffer === "function" && typeof gl.deleteFramebuffer === "function" && typeof gl.bindFramebuffer === "function" &&
    typeof gl.framebufferTexture2D === "function" && typeof gl.FRAMEBUFFER === "number" && typeof gl.COLOR_ATTACHMENT0 === "number" &&
    typeof gl.DEPTH_ATTACHMENT === "number" && typeof gl.DEPTH_COMPONENT24 === "number" && typeof gl.TEXTURE_2D === "number";
}
function attachEvents(
  session: A3DXRSessionLike,
  referenceSpace: NonNullable<WebXRSessionController["xrReferenceSpace"]>,
  onEnd: () => void,
  onReset: (event: A3DXREventLike) => void,
  emit: <K extends AuraXREventName>(event: K, payload: AuraXREventMap[K]) => void
): () => void {
  const removers: (() => void)[] = [];
  const listen = (target: A3DXRSessionLike | typeof referenceSpace, name: string, callback: (event: A3DXREventLike) => void): void => {
    target.addEventListener?.(name, callback);
    removers.push(() => target.removeEventListener?.(name, callback));
  };
  listen(session, "end", onEnd);
  listen(session, "inputsourceschange", (event) => emit("inputsourceschange", { added: Array.from(event?.added ?? []), removed: Array.from(event?.removed ?? []) }));
  listen(session, "visibilitychange", () => emit("visibilitychange", { visibilityState: session.visibilityState ?? "unknown" }));
  for (const name of ["select", "selectstart", "selectend", "squeeze", "squeezestart", "squeezeend"] as const) {
    listen(session, name, (event) => emit(name, { inputSource: event?.inputSource }));
  }
  listen(referenceSpace, "reset", onReset);
  return () => { for (const remove of removers) remove(); };
}
