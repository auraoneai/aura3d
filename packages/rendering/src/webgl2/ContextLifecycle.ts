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
    this.host.samplers.activeTextureUnitIndex = -1;
    this.host.samplers.textureUnitBindings.clear();
    this.host.stateCache.invalidate();
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.host.stateCache.bindFramebuffer(this.host.gl.FRAMEBUFFER, this.host.activeRenderTarget?.framebuffer ?? null, () => this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, this.host.activeRenderTarget?.framebuffer ?? null));
    this.host.stateCache.viewport(0, 0, width, height, () => this.host.gl.viewport(0, 0, width, height));
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

  clearRenderTarget(color: readonly [number, number, number, number]): void {
    this.assertFrame();
    this.host.gl.clearColor(color[0], color[1], color[2], color[3]);
    this.host.stateCache.depthMask(true, () => this.host.gl.depthMask(true));
    this.host.gl.clearDepth(1);
    this.host.gl.clear(this.host.gl.COLOR_BUFFER_BIT | this.host.gl.DEPTH_BUFFER_BIT);
    if (this.host.activeRenderTarget?.sampleCount && this.host.activeRenderTarget.sampleCount > 1) this.host.activeRenderTarget.needsResolve = true;
  }

  endFrame(): void {
    this.assertFrame();
    this.frameActive = false;
    this.lastError = this.readError();
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
