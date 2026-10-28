// PR 0b-2 carve-out (CONTRACTS.md §3.3) — verbatim move from WebGL2Device.ts; 0 changed logic lines.

import { RenderDeviceError } from "../RenderDevice";
import type { WebGL2DeviceHost } from "./DeviceHost";

export interface WebGL2TextureUnit0Snapshot {
  readonly activeTexture: GLenum;
  readonly texture2d: WebGLTexture | null;
  readonly sampler: WebGLSampler | null;
}

export interface WebGL2TextureUnitBindingSnapshot {
  readonly texture2d: WebGLTexture | null;
  readonly sampler: WebGLSampler | null;
}

interface ViewRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export class WebGL2ContextLifecycle {
  constructor(readonly host: WebGL2DeviceHost, readonly canvas: HTMLCanvasElement | OffscreenCanvas) {
    if ("addEventListener" in canvas) {
      this.contextLostListener = ((event: Event) => {
        event.preventDefault();
        this.host.contextLost = true;
        this.lastError = "CONTEXT_LOST";
        this.frameActive = false;
        // WS-2.6: notify subscribers. Errors in a listener must not prevent the others from running,
        // nor leave the device in a half-notified state during an already-degraded condition.
        for (const listener of [...this.deviceLostListeners]) {
          try {
            listener();
          } catch {
            // A listener that throws is the listener's problem; the device stays consistent.
          }
        }
      }) as EventListener;
      this.contextRestoredListener = (() => {
        this.host.contextLost = false;
        this.lastError = null;
        this.framesEnded = 0;
        // PRD 11 Phase 5: registered restore hooks (GPU object invalidation,
        // C-29 ResourceRegistry.rebuild, C-02 precompile) must resolve BEFORE
        // onDeviceRestored listeners fire (C-29 semantics). With no hooks the
        // notification stays synchronous and byte-identical to the carve-out.
        const hooks = [...this.restoredHooks];
        if (hooks.length === 0) {
          this.notifyRestoredListeners();
          return;
        }
        const notify = (): void => this.notifyRestoredListeners();
        void (async () => {
          for (const hook of hooks) {
            try {
              await hook();
            } catch {
              // A failed hook must not starve the restore notification; the
              // resource owners report their own failures via rebuild stats.
            }
          }
        })().then(notify, notify);
      }) as EventListener;
      canvas.addEventListener("webglcontextlost", this.contextLostListener);
      canvas.addEventListener("webglcontextrestored", this.contextRestoredListener);
    }
  }

  readonly contextLostListener?: EventListener;

  readonly contextRestoredListener?: EventListener;

  readonly deviceLostListeners = new Set<() => void>();

  readonly deviceRestoredListeners = new Set<() => void>();

  /** Phase 5: hooks resolved before `deviceRestoredListeners` notify (§6.9). */
  readonly restoredHooks = new Set<() => Promise<void> | void>();

  frameActive = false;

  lastError: string | null = null;

  viewportHeight = 0;

  viewportWidth = 0;

  onDeviceLost(listener: () => void): () => void {
    this.deviceLostListeners.add(listener);
    return () => this.deviceLostListeners.delete(listener);
  }

  onDeviceRestored(listener: () => void): () => void {
    this.deviceRestoredListeners.add(listener);
    return () => this.deviceRestoredListeners.delete(listener);
  }

  /** Register a restore hook; it must resolve before restored listeners fire. */
  onRestoredHook(hook: () => Promise<void> | void): () => void {
    this.restoredHooks.add(hook);
    return () => this.restoredHooks.delete(hook);
  }

  private notifyRestoredListeners(): void {
    for (const listener of [...this.deviceRestoredListeners]) {
      try {
        listener();
      } catch {
        // A listener that throws is the listener's problem; the device stays consistent.
      }
    }
  }

  isDeviceLost(): boolean {
    return this.host.contextLost;
  }

  /** SC-01: viewport/scissor override and the render target it was set on (override applies only while that target is bound). */
  private viewportOverride: ViewRect | null = null;
  private scissorOverride: ViewRect | null = null;
  private scissorTestOn = false;
  private viewStateTarget: unknown = null;
  /** XR: framebuffer frames draw into instead of the canvas (null = the canvas), with its pixel size. */
  private externalFramebuffer: WebGLFramebuffer | null = null;
  private externalSize: { readonly width: number; readonly height: number } | null = null;
  /** XR: viewport that survives `beginFrame` and the post/present passes; scoped to the default (canvas/external) framebuffer. */
  private persistentViewportRect: ViewRect | null = null;

  setViewport(x: number, y: number, width: number, height: number, options?: { readonly persistent?: boolean }): void {
    this.assertAlive();
    if (!(width > 0) || !(height > 0)) {
      throw new RenderDeviceError("Viewport dimensions must be positive", "INVALID_VIEWPORT", { width, height });
    }
    if (options?.persistent) {
      this.persistentViewportRect = { x, y, width, height };
    } else {
      this.viewportOverride = { x, y, width, height };
      this.viewStateTarget = this.host.activeRenderTarget ?? null;
    }
    this.applyViewState();
  }

  /** Clears the persistent viewport and any frame-scoped override. */
  resetViewport(): void {
    this.assertAlive();
    this.persistentViewportRect = null;
    this.viewportOverride = null;
    this.applyViewState();
  }

  /** XR: draw into `framebuffer` (an `XRWebGLLayer` framebuffer) instead of the canvas until called with null. */
  setExternalFramebuffer(framebuffer: WebGLFramebuffer | null, width: number, height: number): void {
    this.assertAlive();
    if (framebuffer !== null && (!(width > 0) || !(height > 0))) {
      throw new RenderDeviceError("External framebuffer dimensions must be positive", "INVALID_FRAME_SIZE", { width, height });
    }
    this.externalFramebuffer = framebuffer;
    this.externalSize = framebuffer ? { width, height } : null;
    if (!this.host.activeRenderTarget) {
      this.host.stateCache.bindFramebuffer(this.host.gl.FRAMEBUFFER, framebuffer, () => this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, framebuffer));
      this.applyViewState();
    }
  }

  /** The framebuffer standing in for the canvas: the XR framebuffer when set, else null (the canvas). */
  defaultFramebuffer(): WebGLFramebuffer | null {
    return this.externalFramebuffer;
  }

  /** The persistent viewport for the default framebuffer, or null. */
  persistentViewport(): ViewRect | null {
    return this.persistentViewportRect;
  }

  /** Binds `framebuffer` (null = the default/external framebuffer) and sets the viewport; a persistent viewport wins on the default framebuffer. */
  bindOutput(framebuffer: WebGLFramebuffer | null, width: number, height: number): void {
    const gl = this.host.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer ?? this.externalFramebuffer);
    const persistent = framebuffer === null ? this.persistentViewportRect : null;
    if (persistent) gl.viewport(persistent.x, persistent.y, persistent.width, persistent.height);
    else gl.viewport(0, 0, width, height);
  }

  setScissor(x: number, y: number, width: number, height: number): void {
    this.assertAlive();
    if (width < 0 || height < 0) {
      throw new RenderDeviceError("Scissor dimensions must be non-negative", "INVALID_SCISSOR", { width, height });
    }
    this.scissorOverride = { x, y, width, height };
    this.viewStateTarget = this.host.activeRenderTarget ?? null;
    this.applyViewState();
  }

  setScissorTest(enabled: boolean): void {
    this.assertAlive();
    this.scissorTestOn = enabled;
    this.viewStateTarget = this.host.activeRenderTarget ?? null;
    this.applyViewState();
  }

  /** The device-level scissor rect in force for the bound target, or null when the scissor test is off. */
  effectiveScissor(): ViewRect | null {
    const live = this.viewStateTarget === (this.host.activeRenderTarget ?? null);
    return live && this.scissorTestOn && this.scissorOverride ? this.scissorOverride : null;
  }

  /** Pushes the effective viewport/scissor for the currently bound target to GL (full target when no live override). */
  applyViewState(): void {
    const gl = this.host.gl;
    const active = this.host.activeRenderTarget ?? null;
    const live = this.viewStateTarget === active;
    const fullWidth = active ? active.width : this.externalSize?.width ?? (this.viewportWidth || gl.drawingBufferWidth);
    const fullHeight = active ? active.height : this.externalSize?.height ?? (this.viewportHeight || gl.drawingBufferHeight);
    const persistent = active ? null : this.persistentViewportRect;
    const v = live && this.viewportOverride ? this.viewportOverride : persistent ?? { x: 0, y: 0, width: fullWidth, height: fullHeight };
    this.host.stateCache.viewport(v.x, v.y, v.width, v.height, () => gl.viewport(v.x, v.y, v.width, v.height));
    const scissor = this.effectiveScissor();
    this.host.stateCache.setEnabled(gl.SCISSOR_TEST, scissor !== null, () => {
      if (scissor) gl.enable(gl.SCISSOR_TEST);
      else gl.disable(gl.SCISSOR_TEST);
    });
    if (scissor) this.host.stateCache.scissor(scissor.x, scissor.y, scissor.width, scissor.height, () => gl.scissor(scissor.x, scissor.y, scissor.width, scissor.height));
  }

  beginFrame(width: number, height: number): void {
    this.assertAlive();
    if (this.frameActive) {
      throw new RenderDeviceError("Frame is already active", "FRAME_ALREADY_ACTIVE");
    }
    if (width <= 0 || height <= 0) {
      throw new RenderDeviceError("Frame dimensions must be positive", "INVALID_FRAME_SIZE", { width, height });
    }
    this.frameActive = true;
    this.host.counters.drawCalls = 0;
    this.host.counters.nativeEnvironmentBindings = 0;
    this.host.counters.nativeShadowMapBindings = 0;
    // Default: assume nothing about GL state between frames (other code may share the context) and re-issue it. With
    // `persistGlState` (set by the engine for quality auto / cinematic, which own the canvas) the shadow state carries
    // over: every raw-GL site invalidates it when it leaves the cached state behind, so an untouched cache is still true.
    if (this.host.device?.persistGlState !== true) {
      this.host.samplers.activeTextureUnitIndex = -1;
      this.host.samplers.textureUnitBindings.clear();
      this.host.stateCache.invalidate();
    }
    this.viewportWidth = width;
    this.viewportHeight = height;
    const frameFramebuffer = this.host.activeRenderTarget?.framebuffer ?? this.externalFramebuffer;
    this.host.stateCache.bindFramebuffer(this.host.gl.FRAMEBUFFER, frameFramebuffer, () => this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, frameFramebuffer));
    // The frame-scoped override resets every frame; the persistent viewport (XR) survives it.
    this.viewportOverride = null;
    this.scissorOverride = null;
    this.scissorTestOn = false;
    this.viewStateTarget = null;
    this.applyViewState();
    this.host.stateCache.setEnabled(this.host.gl.DEPTH_TEST, true, () => this.host.gl.enable(this.host.gl.DEPTH_TEST));
    this.host.stateCache.depthFunc(this.host.gl.LEQUAL, () => this.host.gl.depthFunc(this.host.gl.LEQUAL));
  }

  clear(color: readonly [number, number, number, number]): void {
    this.assertFrame();
    this.host.gl.clearColor(color[0], color[1], color[2], color[3]);
    this.host.stateCache.depthMask(true, () => this.host.gl.depthMask(true));
    this.host.gl.clearDepth(1);
    this.host.gl.clear(this.host.gl.COLOR_BUFFER_BIT | this.host.gl.DEPTH_BUFFER_BIT);
    if (this.host.activeRenderTarget?.sampleCount && this.host.activeRenderTarget.sampleCount > 1) this.host.activeRenderTarget.needsResolve = true;
  }

  clearRenderTarget(color: readonly [number, number, number, number], attachment?: number): void {
    this.assertFrame();
    if (attachment !== undefined) {
      // MRT (lane 03 Q-01-2): clear a single draw buffer, leaving depth and the
      // other attachments untouched. Normalized and float formats both take
      // clearBufferfv (normalized formats are floating-point clears).
      this.host.gl.clearBufferfv(this.host.gl.COLOR, attachment, new Float32Array(color));
      return;
    }
    this.host.gl.clearColor(color[0], color[1], color[2], color[3]);
    this.host.stateCache.depthMask(true, () => this.host.gl.depthMask(true));
    this.host.gl.clearDepth(1);
    this.host.gl.clear(this.host.gl.COLOR_BUFFER_BIT | this.host.gl.DEPTH_BUFFER_BIT);
    if (this.host.activeRenderTarget?.sampleCount && this.host.activeRenderTarget.sampleCount > 1) this.host.activeRenderTarget.needsResolve = true;
  }

  endFrame(): void {
    this.assertFrame();
    this.frameActive = false;
    if (this.shouldReadFrameError()) this.lastError = this.readError();
  }

  /** Frames after creation/restore in which the `sampled` mode reads the error every frame. */
  static readonly ERROR_WARMUP_FRAMES = 30;
  /** After warm-up, `sampled` mode reads the error on every Nth frame. */
  static readonly ERROR_SAMPLE_INTERVAL = 60;
  private framesEnded = 0;
  private lastEventSignature = -1;

  /**
   * `gl.getError()` is a synchronous round trip to the GPU process (about 1 ms per frame on the software
   * rasteriser, 0.1 to 0.3 ms on hardware). `frame` and `strict` read it every frame; `sampled` reads it
   * when something that can fail happened (the first frames, a resource or program created or released, a
   * pending error) and otherwise every ERROR_SAMPLE_INTERVAL frames, so a persistent GL fault is still
   * caught within a second at 60 fps.
   */
  private shouldReadFrameError(): boolean {
    this.framesEnded += 1;
    const counters = this.host.counters;
    const signature = this.host.renderTargets.size + this.host.buffers.size + this.host.shaders.size
      + counters.programCompiles + counters.shaderProgramCreateCount + counters.shadowRenderTargetsAllocated + counters.releasedTextureHandles;
    const changed = signature !== this.lastEventSignature;
    this.lastEventSignature = signature;
    if (this.host.errorCheckMode !== "sampled") return true;
    return changed
      || this.lastError !== null
      || this.framesEnded <= WebGL2ContextLifecycle.ERROR_WARMUP_FRAMES
      || this.framesEnded % WebGL2ContextLifecycle.ERROR_SAMPLE_INTERVAL === 0;
  }

  captureTextureUnit0(): WebGL2TextureUnit0Snapshot {
    const activeTexture = this.host.gl.getParameter(this.host.gl.ACTIVE_TEXTURE) as GLenum;
    this.host.gl.activeTexture(this.host.gl.TEXTURE0);
    return {
      activeTexture,
      texture2d: this.host.gl.getParameter(this.host.gl.TEXTURE_BINDING_2D) as WebGLTexture | null,
      sampler: this.host.gl.getParameter(this.host.gl.SAMPLER_BINDING) as WebGLSampler | null
    };
  }

  restoreTextureUnit0(snapshot: WebGL2TextureUnit0Snapshot): void {
    this.host.gl.activeTexture(this.host.gl.TEXTURE0);
    this.host.gl.bindTexture(this.host.gl.TEXTURE_2D, snapshot.texture2d);
    this.host.gl.bindSampler(0, snapshot.sampler);
    this.host.gl.activeTexture(snapshot.activeTexture);
  }

  captureTextureUnitBinding(unit: number): WebGL2TextureUnitBindingSnapshot {
    this.host.gl.activeTexture(this.host.gl.TEXTURE0 + unit);
    return {
      texture2d: this.host.gl.getParameter(this.host.gl.TEXTURE_BINDING_2D) as WebGLTexture | null,
      sampler: this.host.gl.getParameter(this.host.gl.SAMPLER_BINDING) as WebGLSampler | null
    };
  }

  restoreTextureUnitBinding(unit: number, snapshot: WebGL2TextureUnitBindingSnapshot): void {
    this.host.gl.activeTexture(this.host.gl.TEXTURE0 + unit);
    this.host.gl.bindTexture(this.host.gl.TEXTURE_2D, snapshot.texture2d);
    this.host.gl.bindSampler(unit, snapshot.sampler);
  }

  assertAlive(): void {
    if (this.host.disposed) {
      throw new RenderDeviceError("Render device is disposed", "DISPOSED_DEVICE");
    }
    if (this.host.contextLost) {
      throw new RenderDeviceError("Render context is lost", "CONTEXT_LOST");
    }
  }

  assertFrame(): void {
    this.assertAlive();
    if (!this.frameActive) {
      throw new RenderDeviceError("No active frame", "NO_ACTIVE_FRAME");
    }
  }

  readError(): string | null {
    const error = this.host.gl.getError();
    return error === this.host.gl.NO_ERROR ? null : `0x${error.toString(16)}`;
  }
}
