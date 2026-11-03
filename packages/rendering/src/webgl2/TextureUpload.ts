// PR 0b-2 carve-out (CONTRACTS.md §3.3) — verbatim move from WebGL2Device.ts.
// C-18 (PRD-06 T0.10a): `Texture.revision`-aware re-upload — dynamic textures
// allocate once via `texStorage2D` and refresh via `texSubImage2D`/`texSubImage3D`
// (`uploadTextureRevision`). All other paths are unchanged.

import { RenderDeviceError } from "../RenderDevice";
import { Texture, bytesPerPixel, compressedTextureByteLength, currentTextureDisposeEpoch, getRenderTargetTextureOwner, isCompressedTextureFormat, isFloatColorTextureFormat, type TextureCubeFace, type TextureMipLevel, type TexturePixelData, type TextureUpdateRegion } from "../Texture";
import { WEBGL_CUBE_FACES } from "../WebGL2Device";
import { applyTextureBudget, beginTextureBudgetResize, DEFAULT_TEXTURE_BUDGET_POLICY, releaseTextureBudget, reserveTextureBudget, retireTextureBudget, setTextureBudgetResidentBytes, TextureBudgetExceededError } from "../textures/TextureBudget";
import { resolveCompressedTextureFormatSlot } from "../contracts/textureFormats";
import { rendererQrFlags } from "../renderer/FrameGraph";
import type { WebGL2DeviceHost } from "./DeviceHost";
import { cubeFaceTarget, resolveCompressedTextureFormatReal, rgba8TextureInternalFormat, textureStorageInternalFormat, textureUploadFormat } from "./TextureFormats";

type TextureUploadMode = "compressed" | "cube" | "depth-render-target" | "fallback" | "rgba8" | "rgba16f" | "rgba32f" | "r32f";

interface NativeRetirement {
  readonly handles: readonly WebGLTexture[];
  readonly release: () => void;
  readonly resolve: () => void;
  sync?: WebGLSync;
  timer?: ReturnType<typeof setTimeout>;
  finishing?: boolean;
}

interface NativeTextureOwner {
  readonly onDeviceDispose: () => void;
  notified: boolean;
}

export class WebGL2TextureRegistry {
  constructor(readonly host: WebGL2DeviceHost) {}

  fallbackCubeTexture: WebGLTexture | null = null;

  fallbackTexture: WebGLTexture | null = null;

  fallbackArrayTexture: WebGLTexture | null = null;

  fallback3DTexture: WebGLTexture | null = null;

  textureUploadModes = new Map<Texture, TextureUploadMode>();

  textures = new Map<Texture, WebGLTexture>();

  /** Streamed logical identities are independent of the ordinary upload map. */
  private readonly streamedTextures = new WeakMap<Texture, { readonly generation: number; readonly handle: WebGLTexture; readonly colorSpace: Texture["colorSpace"]; readonly revision: number }>();
  private streamedGeneration = 0;
  private readonly fallbackCharges = new Map<WebGLTexture, () => void>();
  private readonly shadowFallbacks = new Map<string, WebGLTexture>();
  private readonly retirements = new Set<NativeRetirement>();
  private readonly retirementDrainedListeners = new Set<() => void>();
  private readonly nativeTextureOwners = new Set<NativeTextureOwner>();
  /** Changes only when native texture names are invalidated by a real loss. */
  private nativeLossEpoch = 0;
  /** Ordinary uploads subscribe independently per device; render targets own their own lifetime. */
  private readonly textureDisposalSubscriptions = new Map<Texture, () => void>();

  /**
   * Keep native names and their charges until submitted work has completed.
   * Failure to create or wait for a fence retains the charge until context
   * loss; each retirement proceeds independently of all others.
   */
  retireNativeTextures(handles: readonly WebGLTexture[], release: () => void): Promise<void> {
    return this.beginNativeRetirement(handles, release, false);
  }

  /**
   * Register immediately, but fence after the current synchronous draw stack.
   * The release callback must be idempotent and owns the allocation's charge.
   */
  retireNativeTexturesAfterStack(handles: readonly WebGLTexture[], release: () => void): Promise<void> {
    return this.beginNativeRetirement(handles, release, true);
  }

  /**
   * A native texture owner can outlive device disposal while a frame or upload
   * stack still holds its resources. It unregisters only after every remaining
   * retirement has been registered (or a real context loss invalidated them).
   */
  registerNativeTextureOwner(onDeviceDispose: () => void): () => void {
    this.host.lifecycle.assertAlive();
    if (typeof onDeviceDispose !== "function") throw new TypeError("A native texture owner requires a device-disposal callback.");
    if (this.nativeContextLost()) throw new RenderDeviceError("Render context is lost", "CONTEXT_LOST");
    // The context check may run caller-controlled code and reenter disposal.
    this.host.lifecycle.assertAlive();
    const owner: NativeTextureOwner = { onDeviceDispose, notified: false };
    this.nativeTextureOwners.add(owner);
    return () => {
      if (!this.nativeTextureOwners.delete(owner)) return;
      this.notifyNativeRetirementsDrained();
    };
  }

  /** Close owners once, preserving the other notifications if one throws. */
  disposeNativeTextureOwners(): void {
    const failures: unknown[] = [];
    for (const owner of [...this.nativeTextureOwners]) {
      if (!this.nativeTextureOwners.has(owner) || owner.notified) continue;
      owner.notified = true;
      try { owner.onDeviceDispose(); } catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failures, "Native texture owner disposal failed.");
  }

  private beginNativeRetirement(handles: readonly WebGLTexture[], release: () => void, afterStack: boolean): Promise<void> {
    let resolve!: () => void;
    const completion = new Promise<void>((done) => { resolve = done; });
    const retirement: NativeRetirement = { handles: [...handles], release, resolve };
    this.retirements.add(retirement);
    const gl = this.host.gl;
    const lossEpoch = this.nativeLossEpoch;
    const stillCurrent = (): boolean => {
      if (!this.retirements.has(retirement)) return false;
      if (lossEpoch !== this.nativeLossEpoch) {
        // Only a real context loss changes this epoch; those names are gone.
        this.finishRetirement(retirement);
        return false;
      }
      if (this.nativeContextLost()) {
        this.invalidateNativeRetirements();
        return false;
      }
      // The loss query may itself have caused a loss/restoration callback.
      return this.retirements.has(retirement) && lossEpoch === this.nativeLossEpoch;
    };
    const start = (): void => {
      try {
        if (!stillCurrent()) return;
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        // A native call may synchronously dispatch loss and even restoration.
        // Never use the returned old-generation sync on the restored context.
        if (!stillCurrent()) return;
        if (!sync) return;
        retirement.sync = sync;
        gl.flush();
        if (!stillCurrent()) return;
        const poll = (): void => {
          retirement.timer = undefined;
          try {
            if (!stillCurrent()) return;
            const status = gl.clientWaitSync(sync, 0, 0);
            if (!stillCurrent()) return;
            if ((typeof gl.ALREADY_SIGNALED === "number" && status === gl.ALREADY_SIGNALED) || (typeof gl.CONDITION_SATISFIED === "number" && status === gl.CONDITION_SATISFIED)) {
              for (const handle of retirement.handles) {
                gl.deleteTexture(handle);
                if (!stillCurrent()) return;
              }
              gl.deleteSync(sync);
              retirement.sync = undefined;
              if (!stillCurrent()) return;
              if (typeof this.host.lifecycle.readError === "function" && this.host.lifecycle.readError()) return;
              if (!stillCurrent()) return;
              this.finishRetirement(retirement);
            } else if (typeof gl.TIMEOUT_EXPIRED === "number" && status === gl.TIMEOUT_EXPIRED) {
              retirement.timer = setTimeout(poll, 8);
              (retirement.timer as unknown as { unref?: () => void }).unref?.();
            }
            // WAIT_FAILED and unknown statuses prove nothing; retain the charge.
          } catch { /* An uncertain wait or deletion retains the charge. */ }
        };
        retirement.timer = setTimeout(poll, 0);
        (retirement.timer as unknown as { unref?: () => void }).unref?.();
      } catch { /* A missing or failed fence is not evidence of reclamation. */ }
    };
    try {
      // Do not wait for the microtask to notice an already-lost context.
      if (!stillCurrent()) return completion;
    } catch {
      // An unavailable loss query is not evidence that native work finished.
      return completion;
    }
    // Register synchronously so teardown waits for the pending fence, but put
    // the GL fence after any draw currently binding this texture on the stack.
    if (afterStack) void Promise.resolve().then(start).catch(() => {});
    else start();
    return completion;
  }

  onNativeRetirementsDrained(listener: () => void): void {
    if (this.retirements.size === 0 && this.nativeTextureOwners.size === 0) listener();
    else this.retirementDrainedListeners.add(listener);
  }

  private notifyNativeRetirementsDrained(): void {
    if (this.retirements.size !== 0 || this.nativeTextureOwners.size !== 0) return;
    const listeners = [...this.retirementDrainedListeners];
    this.retirementDrainedListeners.clear();
    for (const listener of listeners) listener();
  }

  private nativeContextLost(): boolean {
    return this.host.contextLost || (typeof this.host.lifecycle.isDeviceLost === "function" && this.host.lifecycle.isDeviceLost());
  }

  private finishRetirement(retirement: NativeRetirement): void {
    if (!this.retirements.has(retirement) || retirement.finishing) return;
    retirement.finishing = true;
    if (retirement.timer !== undefined) clearTimeout(retirement.timer);
    retirement.timer = undefined;
    try {
      retirement.release();
    } catch {
      // Keep a failed debit and the device loss listener for a later retry.
      retirement.finishing = false;
      return;
    }
    this.retirements.delete(retirement);
    retirement.finishing = false;
    retirement.resolve();
    this.notifyNativeRetirementsDrained();
  }

  /** Native names are invalid after a real context loss; no GL deletion is required. */
  private invalidateNativeRetirements(): void {
    this.nativeLossEpoch += 1;
    for (const retirement of [...this.retirements]) this.finishRetirement(retirement);
  }

  /**
   * C-18: `Texture.revision` at the last successful upload. A mismatch means
   * `texture.update()` produced new pixels and the handle needs a sub-image
   * upload rather than a rebind.
   */
  private readonly textureUploadRevisions = new WeakMap<Texture, number>();

  /** Storage and source dimensions are context-owned; a Texture may be shared. */
  private readonly sourceSizes = new WeakMap<Texture, readonly [number, number]>();
  private readonly textureColorSpaces = new WeakMap<Texture, Texture["colorSpace"]>();
  private readonly autoMipmaps = new WeakMap<Texture, boolean>();
  private readonly compressedFormats = new WeakMap<Texture, number>();
  private readonly compressedLevels = new WeakMap<Texture, Set<string>>();
  // null denotes a successfully allocated, zero-initialized WebGL base level;
  // absence means its previous contents are not known.
  private readonly uploadedBaseData = new WeakMap<Texture, TexturePixelData | null>();
  private readonly budgetedTextures = new Map<Texture, Texture>();
  private readonly failedCompressedFormats = new Set<string>();

  private reserveFallback(bytes: number): () => void {
    const policy = this.host.textureBudgetPolicy;
    return reserveTextureBudget(bytes, policy?.maxBytes ?? policy?.textureBudgetBytes, this.host.device);
  }

  private allocateFallback(bytes: number): { readonly handle: WebGLTexture; readonly release: () => void } {
    const release = this.reserveFallback(bytes);
    try {
      const handle = this.host.gl.createTexture();
      if (!handle) throw new RenderDeviceError("Failed to allocate WebGL fallback texture", "WEBGL_ALLOCATION_FAILED");
      return { handle, release };
    } catch (error) {
      release();
      throw error;
    }
  }

  private assertFallbackUpload(): void {
    const error = this.host.lifecycle.readError();
    if (error) throw new RenderDeviceError("WebGL fallback texture upload failed", "TEXTURE_UPLOAD_FAILED", { error });
  }

  getFallbackTextureHandle(): WebGLTexture {
    if (this.fallbackTexture) {
      return this.fallbackTexture;
    }
    const { handle, release } = this.allocateFallback(4);
    let submittedStorage = false;
    try {
      this.withUnpackState(() => {
        this.host.stateCache.invalidate();
        this.host.gl.bindTexture(this.host.gl.TEXTURE_2D, handle);
        this.host.gl.texParameteri(this.host.gl.TEXTURE_2D, this.host.gl.TEXTURE_MIN_FILTER, this.host.gl.NEAREST);
        this.host.gl.texParameteri(this.host.gl.TEXTURE_2D, this.host.gl.TEXTURE_MAG_FILTER, this.host.gl.NEAREST);
        this.host.gl.texParameteri(this.host.gl.TEXTURE_2D, this.host.gl.TEXTURE_WRAP_S, this.host.gl.CLAMP_TO_EDGE);
        this.host.gl.texParameteri(this.host.gl.TEXTURE_2D, this.host.gl.TEXTURE_WRAP_T, this.host.gl.CLAMP_TO_EDGE);
        submittedStorage = true;
        this.host.gl.texImage2D(this.host.gl.TEXTURE_2D, 0, this.host.gl.RGBA, 1, 1, 0, this.host.gl.RGBA, this.host.gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
      });
      this.assertFallbackUpload();
    } catch (error) {
      if (submittedStorage) void this.retireNativeTextures([handle], release);
      else { this.host.gl.deleteTexture(handle); release(); }
      throw error;
    }
    this.fallbackCharges.set(handle, release);
    this.fallbackTexture = handle;
    return handle;
  }

  getFallbackCubeTextureHandle(): WebGLTexture {
    if (this.fallbackCubeTexture) {
      return this.fallbackCubeTexture;
    }
    const { handle, release } = this.allocateFallback(24);
    let submittedStorage = false;
    try {
      this.withUnpackState(() => {
        this.host.stateCache.invalidate();
        this.host.gl.bindTexture(this.host.gl.TEXTURE_CUBE_MAP, handle);
        this.host.gl.texParameteri(this.host.gl.TEXTURE_CUBE_MAP, this.host.gl.TEXTURE_MIN_FILTER, this.host.gl.NEAREST);
        this.host.gl.texParameteri(this.host.gl.TEXTURE_CUBE_MAP, this.host.gl.TEXTURE_MAG_FILTER, this.host.gl.NEAREST);
        this.host.gl.texParameteri(this.host.gl.TEXTURE_CUBE_MAP, this.host.gl.TEXTURE_WRAP_S, this.host.gl.CLAMP_TO_EDGE);
        this.host.gl.texParameteri(this.host.gl.TEXTURE_CUBE_MAP, this.host.gl.TEXTURE_WRAP_T, this.host.gl.CLAMP_TO_EDGE);
        this.host.gl.texParameteri(this.host.gl.TEXTURE_CUBE_MAP, this.host.gl.TEXTURE_WRAP_R, this.host.gl.CLAMP_TO_EDGE);
        const pixel = new Uint8Array([255, 255, 255, 255]);
        for (const face of WEBGL_CUBE_FACES) {
          submittedStorage = true;
          this.host.gl.texImage2D(cubeFaceTarget(this.host.gl, face), 0, this.host.gl.RGBA, 1, 1, 0, this.host.gl.RGBA, this.host.gl.UNSIGNED_BYTE, pixel);
        }
      });
      this.assertFallbackUpload();
    } catch (error) {
      if (submittedStorage) void this.retireNativeTextures([handle], release);
      else { this.host.gl.deleteTexture(handle); release(); }
      throw error;
    }
    this.fallbackCharges.set(handle, release);
    this.fallbackCubeTexture = handle;
    return handle;
  }

  /** WebGL texture objects are permanently associated with their first bind target. */
  private createFallbackVolumeHandle(target: GLenum): WebGLTexture {
    const gl = this.host.gl;
    const { handle, release } = this.allocateFallback(4);
    let submittedStorage = false;
    try {
      this.withUnpackState(() => {
        this.host.stateCache.invalidate();
        gl.bindTexture(target, handle);
        gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(target, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
        submittedStorage = true;
        gl.texImage3D(target, 0, gl.RGBA8, 1, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
      });
      this.assertFallbackUpload();
      this.fallbackCharges.set(handle, release);
      return handle;
    } catch (error) {
      if (submittedStorage) void this.retireNativeTextures([handle], release);
      else { gl.deleteTexture(handle); release(); }
      throw error;
    }
  }

  getFallbackArrayTextureHandle(): WebGLTexture {
    return this.fallbackArrayTexture ??= this.createFallbackVolumeHandle(this.host.gl.TEXTURE_2D_ARRAY);
  }

  getFallback3DTextureHandle(): WebGLTexture {
    return this.fallback3DTexture ??= this.createFallbackVolumeHandle(this.host.gl.TEXTURE_3D);
  }

  /** A depth-only, fully initialized fallback for an absent comparison sampler. */
  getFallbackDepthTextureHandle(dimension: "2d" | "cube" | "2d-array", compare: "less-equal" | "greater-equal"): WebGLTexture {
    const key = `${dimension}:${compare}`;
    const existing = this.shadowFallbacks.get(key);
    if (existing) return existing;
    const gl = this.host.gl;
    const target = dimension === "cube" ? gl.TEXTURE_CUBE_MAP : dimension === "2d-array" ? gl.TEXTURE_2D_ARRAY : gl.TEXTURE_2D;
    const { handle, release } = this.allocateFallback(dimension === "cube" ? 12 : 2);
    let framebuffer: WebGLFramebuffer | null = null;
    let submittedStorage = false;
    try {
      const previousDraw = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
      const previousRead = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
      const previousClear = gl.getParameter(gl.DEPTH_CLEAR_VALUE) as number;
      const previousMask = gl.getParameter(gl.DEPTH_WRITEMASK) as boolean;
      const previousScissor = gl.isEnabled(gl.SCISSOR_TEST);
      const previousDiscard = gl.isEnabled(gl.RASTERIZER_DISCARD);
      try {
        framebuffer = gl.createFramebuffer();
        if (!framebuffer) throw new RenderDeviceError("Failed to allocate WebGL depth fallback framebuffer", "WEBGL_ALLOCATION_FAILED");
        this.withUnpackState(() => {
          this.host.stateCache.invalidate();
          gl.bindTexture(target, handle);
          gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
          gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
          gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          if (dimension !== "2d") gl.texParameteri(target, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
          gl.texParameteri(target, gl.TEXTURE_BASE_LEVEL, 0);
          gl.texParameteri(target, gl.TEXTURE_MAX_LEVEL, 0);
          submittedStorage = true;
          if (dimension === "cube") {
            for (const face of WEBGL_CUBE_FACES) gl.texImage2D(cubeFaceTarget(gl, face), 0, gl.DEPTH_COMPONENT16, 1, 1, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_SHORT, null);
          } else if (dimension === "2d-array") {
            gl.texImage3D(target, 0, gl.DEPTH_COMPONENT16, 1, 1, 1, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_SHORT, null);
          } else {
            gl.texImage2D(target, 0, gl.DEPTH_COMPONENT16, 1, 1, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_SHORT, null);
          }
          gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
          gl.drawBuffers([gl.NONE]);
          gl.readBuffer(gl.NONE);
          gl.disable(gl.SCISSOR_TEST);
          gl.disable(gl.RASTERIZER_DISCARD);
          gl.depthMask(true);
          gl.clearDepth(compare === "greater-equal" ? 0 : 1);
          const faces = dimension === "cube" ? WEBGL_CUBE_FACES : [undefined];
          for (const face of faces) {
            if (dimension === "2d-array") gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, handle, 0, 0);
            else gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, face ? cubeFaceTarget(gl, face) : target, handle, 0);
            if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new RenderDeviceError("WebGL depth fallback framebuffer is incomplete", "FRAMEBUFFER_INVALID");
            gl.clear(gl.DEPTH_BUFFER_BIT);
          }
        });
      } finally {
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, previousDraw);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, previousRead);
        gl.depthMask(previousMask);
        gl.clearDepth(previousClear);
        if (previousScissor) gl.enable(gl.SCISSOR_TEST); else gl.disable(gl.SCISSOR_TEST);
        if (previousDiscard) gl.enable(gl.RASTERIZER_DISCARD); else gl.disable(gl.RASTERIZER_DISCARD);
        if (framebuffer) gl.deleteFramebuffer(framebuffer);
        this.host.stateCache.invalidate();
      }
      this.assertFallbackUpload();
      if (this.nativeContextLost()) throw new RenderDeviceError("WebGL context was lost during depth fallback creation", "CONTEXT_LOST");
      this.fallbackCharges.set(handle, release);
      this.shadowFallbacks.set(key, handle);
      return handle;
    } catch (error) {
      if (submittedStorage) void this.retireNativeTextures([handle], release);
      else { gl.deleteTexture(handle); release(); }
      throw error;
    }
  }

  /** Claim an identity before it can enter the normal lazy-upload path. */
  assertCanPrepareStreamedTexture(texture: Texture): void {
    const targetOwner = getRenderTargetTextureOwner(texture);
    if (targetOwner !== undefined) {
      if (targetOwner !== this.host.device) throw new RenderDeviceError("Render-target texture belongs to another device", "FOREIGN_RESOURCE", { label: texture.label });
      throw new RenderDeviceError("Render-target textures cannot be prepared for streaming", "RENDER_TARGET_STREAMING_UNSUPPORTED", { label: texture.label });
    }
    if (this.streamedTextures.get(texture)?.generation === this.streamedGeneration) throw new Error("Texture is already prepared for streaming");
    if (this.textures.has(texture)) throw new Error("Cannot stream a texture after its ordinary WebGL upload");
  }

  prepareStreamedTexture(texture: Texture, fallback: WebGLTexture): void {
    this.assertCanPrepareStreamedTexture(texture);
    this.host.stateCache.invalidate();
    this.streamedTextures.set(texture, { generation: this.streamedGeneration, handle: fallback, colorSpace: texture.colorSpace, revision: texture.revision });
  }

  /** Switch only the device-local lookup, after every potentially failing step. */
  publishStreamedTexture(texture: Texture, handle: WebGLTexture): void {
    const streamed = this.streamedTextures.get(texture);
    if (streamed?.generation !== this.streamedGeneration) throw new Error("Streamed texture has not been prepared");
    this.host.stateCache.invalidate();
    this.streamedTextures.set(texture, { generation: this.streamedGeneration, handle, colorSpace: streamed.colorSpace, revision: streamed.revision });
  }

  unprepareStreamedTexture(texture: Texture, expected: WebGLTexture): void {
    const streamed = this.streamedTextures.get(texture);
    if (streamed?.generation !== this.streamedGeneration || streamed.handle !== expected) throw new Error("Cannot unprepare a texture while a streamed allocation is published");
    this.host.stateCache.invalidate();
    this.streamedTextures.delete(texture);
  }

  /** Release all target-specific fallback textures when the device is disposed. */
  disposeFallbackTextures(): void {
    for (const handle of [this.fallbackTexture, this.fallbackCubeTexture, this.fallbackArrayTexture, this.fallback3DTexture, ...this.shadowFallbacks.values()]) {
      if (!handle) continue;
      const release = this.fallbackCharges.get(handle) ?? (() => {});
      this.fallbackCharges.delete(handle);
      void this.retireNativeTextures([handle], release);
    }
    this.fallbackTexture = null;
    this.fallbackCubeTexture = null;
    this.fallbackArrayTexture = null;
    this.fallback3DTexture = null;
    this.shadowFallbacks.clear();
  }

  /** Drop invalid handles on context restoration; CPU texture data is retained. */
  invalidateTextureHandles(): void {
    if (this.nativeContextLost()) {
      this.invalidateNativeRetirements();
      this.host.samplers?.invalidateOnContextLoss?.();
    }
    this.clearTextureDisposalSubscriptions();
    this.disposeBudgetEntries();
    for (const texture of this.textures.keys()) this.uploadedBaseData.delete(texture);
    this.textures.clear();
    this.textureUploadModes.clear();
    this.failedCompressedFormats.clear();
    for (const release of this.fallbackCharges.values()) release();
    this.fallbackCharges.clear();
    this.streamedGeneration += 1;
    // Lost context objects must not be reused or deleted in the restored context.
    this.fallbackTexture = null;
    this.fallbackCubeTexture = null;
    this.fallbackArrayTexture = null;
    this.fallback3DTexture = null;
    this.shadowFallbacks.clear();
    this.host.stateCache.invalidate();
  }

  getTextureHandle(texture: Texture): WebGLTexture {
    const targetOwner = getRenderTargetTextureOwner(texture);
    if (targetOwner !== undefined && targetOwner !== this.host.device) {
      throw new RenderDeviceError("Render-target texture belongs to another device", "FOREIGN_RESOURCE", { label: texture.label });
    }
    if (texture.disposed) {
      // A rejected bind may be the final interaction with this registry.
      // Retire disposed handles before returning the expected error, rather
      // than keeping the stale allocation until some later successful bind.
      this.releaseDisposedTextureHandles();
      throw new RenderDeviceError("Texture is disposed", "DISPOSED_RESOURCE", { label: texture.label });
    }
    if (targetOwner !== undefined) {
      if (this.nativeContextLost()) throw new RenderDeviceError("WebGL context is lost", "CONTEXT_LOST", { label: texture.label });
      // A depth-only color placeholder and a target invalidated by context
      // loss have no registered sampled storage. Never recreate them as blank
      // CPU textures, even when the original owner is the requesting device.
      const handle = this.textures.get(texture);
      if (!handle) throw new RenderDeviceError("Render-target texture has no live WebGL storage", "INVALID_RENDER_TARGET", { label: texture.label });
      this.releaseDisposedTextureHandles();
      this.assertTextureHandleCurrent(texture, handle);
      return handle;
    }
    this.releaseDisposedTextureHandles();
    const streamed = this.streamedTextures.get(texture);
    if (streamed) {
      if (streamed.generation !== this.streamedGeneration) throw new RenderDeviceError("Streamed texture must be prepared again after context restoration", "CONTEXT_LOST", { label: texture.label });
      if (streamed.colorSpace !== texture.colorSpace) throw new RenderDeviceError("Streamed texture must be prepared again after its color space changes", "UNSUPPORTED_TEXTURE_FORMAT", { label: texture.label });
      if (streamed.revision !== texture.revision) throw new RenderDeviceError("Streamed texture must be prepared again after its content changes", "UNSUPPORTED_TEXTURE_FORMAT", { label: texture.label });
      return streamed.handle;
    }
    let cached = this.textures.get(texture);
    if (cached) {
      // ST-03 (L4): live sources (video) may mark a new frame before the
      // revision comparison runs.
      texture.pollContentRevision?.();
      this.assertTextureHandleCurrent(texture, cached);
      // C-18: `update()` bumped the revision — re-upload in place instead of
      // reallocating a new WebGL texture (E39/T0.10a).
      // A change in colour interpretation changes the native internal format.
      // Immutable storage cannot be redefined, so allocate the new format once.
      const budgetedCopy = this.budgetedTextures.get(texture);
      const replaceStorage = (this.textureColorSpaces.has(texture) && this.textureColorSpaces.get(texture) !== texture.colorSpace)
        || (this.autoMipmaps.has(texture) && this.autoMipmaps.get(texture) !== shouldAutoGenerateMipmaps(texture))
        || (budgetedCopy && budgetedCopy !== texture && this.textureUploadRevisions.get(texture) !== texture.revision)
        // Edited opaque BC1 RGB blocks that WebGL could expose as transparent
        // move to the replacement decoded fallback in new RGBA8 storage.
        || (this.textureUploadModes.get(texture) === "compressed" && texture.format === "bc1-rgb-unorm" && texture.fallbackReplaced
          && this.textureUploadRevisions.get(texture) !== texture.revision && bc1RgbHasTransparentSelectors(texture));
      if (texture.source && (replaceStorage || this.textureUploadRevisions.get(texture) !== texture.revision)) {
        this.preflightSourceUpload(texture);
        this.assertTextureHandleCurrent(texture, cached);
      } else if (targetOwner === undefined && !texture.source && (replaceStorage || this.textureUploadRevisions.get(texture) !== texture.revision)) {
        this.preflightRetainedContent(texture);
        this.assertTextureHandleCurrent(texture, cached);
      }
      if (replaceStorage) {
        this.forgetTextureHandle(texture);
        this.retireBudgetedTexture(texture, cached, true);
        // Retirement can call into host/device code. A reentrant lookup may
        // already have uploaded the replacement, or disposal may have won.
        if (texture.disposed) throw new RenderDeviceError("Texture is disposed", "DISPOSED_RESOURCE", { label: texture.label });
        const replacement = this.textures.get(texture);
        if (replacement) {
          this.assertTextureHandleCurrent(texture, replacement);
          return replacement;
        }
        cached = undefined;
      } else if (this.textureUploadRevisions.get(texture) !== texture.revision) {
        this.withDirtyUpload(texture, () => this.withUnpackState(() => this.uploadTextureRevision(texture, cached!)));
      }
      if (cached) {
        this.assertTextureHandleCurrent(texture, cached);
        return cached;
      }
    }
    if (texture.source) {
      this.preflightSourceUpload(texture);
      this.assertTextureUploadLive(texture);
    } else if (targetOwner === undefined) {
      this.preflightRetainedContent(texture);
      this.assertTextureUploadLive(texture);
    }
    const handle = this.withDirtyUpload(texture, () => this.withUnpackState(() => this.createTextureHandle(texture)));
    // Register after the upload's exception handler has finished: onDispose can
    // invoke its listener immediately, and must not cause a second deletion in
    // that handler if disposal happened while the upload was in progress.
    try {
      this.watchTextureDisposal(texture);
    } catch (error) {
      // Registration itself can fail for an overridden Texture method. Never
      // leave its already-uploaded native name or budget entry unowned.
      this.retireTextureHandle(texture, false);
      throw error;
    }
    this.assertTextureHandleCurrent(texture, handle);
    return handle;
  }

  private withDirtyUpload<T>(texture: Texture, upload: () => T): T {
    const restore = texture.beginUploadAttempt();
    try {
      return upload();
    } catch (error) {
      restore();
      throw error;
    }
  }

  private createTextureHandle(original: Texture): WebGLTexture {
    const gl = this.host.gl;
    // The admitted texture can be a downscaled copy. Disposal of the logical
    // source still invalidates every remaining upload into that copy.
    const assertLive = (): void => this.assertTextureUploadLive(original);
    let texture: Texture | undefined;
    let handle: WebGLTexture | null = null;
    let submittedStorage = false;
    let uploadedBase: TexturePixelData | null | undefined;
    const uploadRevision = original.revision;
    const pendingRegion = original.pendingUpdateRegion;
    const uploadColorSpace = original.colorSpace;
    const uploadAutoMipmaps = shouldAutoGenerateMipmaps(original);
    try {
      assertLive();
      texture = applyTextureBudget(original, this.host.textureBudgetPolicy ?? DEFAULT_TEXTURE_BUDGET_POLICY, this.host.device);
      this.budgetedTextures.set(original, texture);
      assertLive();
      handle = gl.createTexture();
      if (!handle) throw new RenderDeviceError("Failed to allocate WebGL texture", "WEBGL_ALLOCATION_FAILED", { label: original.label });
      assertLive();
      this.host.stateCache.invalidate();
      assertLive();
      const target = textureTarget(gl, texture);
      gl.bindTexture(target, handle);
      assertLive();

      if (isCompressedTextureFormat(texture.format)) {
        const flags = rendererQrFlags(this.host.device);
        const slot = resolveCompressedTextureFormatSlot();
        // WebGL permits RGB DXT1 to be implemented as RGBA DXT1. In blocks
        // using its transparent selector, that would change opaque alpha to
        // zero, so only upload those blocks through the decoded fallback.
        // https://registry.khronos.org/webgl/extensions/WEBGL_compressed_texture_s3tc/
        const needsOpaqueFallback = texture.format === "bc1-rgb-unorm" && bc1RgbHasTransparentSelectors(texture);
        const formatKey = `${texture.format}:${texture.colorSpace}`;
        const internalFormat = needsOpaqueFallback || this.failedCompressedFormats.has(formatKey) ? null : texture.format === "bc1-rgb-unorm"
          ? resolveCompressedTextureFormatReal(texture.format, texture.colorSpace, gl)
          : slot.provided && flags.on("A3D_QR_ASSETS")
          ? slot.get(flags)(texture.format, texture.colorSpace, gl)
          : resolveCompressedTextureFormatReal(texture.format, texture.colorSpace, gl);
        assertLive();
        if (internalFormat !== null) {
          submittedStorage = true;
          this.uploadCompressedTexture(texture, internalFormat, assertLive);
          const uploadError = this.host.lifecycle.readError();
          assertLive();
          if (!uploadError) {
            this.compressedFormats.set(original, internalFormat);
            const levels = new Set<string>();
            for (const face of texture.dimension === "cube" ? WEBGL_CUBE_FACES : [undefined]) {
              for (let level = 0; level < texture.mipLevelCount; level += 1) {
                levels.add(`${face ?? "texture"}:${level}`);
              }
            }
            this.compressedLevels.set(original, levels);
            this.finishTextureUpload(original, handle, "compressed", uploadRevision, pendingRegion, uploadColorSpace, uploadAutoMipmaps);
            return handle;
          }
          // Mutable compressed storage may already exist. Retire its exact
          // charge behind a fence and separately admit the decoded fallback.
          // Remember the failed native representation so a budget-limited
          // retry can use the fallback instead of repeatedly failing it.
          this.failedCompressedFormats.add(formatKey);
          this.retireBudgetedTexture(original, handle);
          handle = null;
          submittedStorage = false;
          assertLive();
          texture = applyTextureBudget(original, this.host.textureBudgetPolicy ?? DEFAULT_TEXTURE_BUDGET_POLICY, this.host.device);
          this.budgetedTextures.set(original, texture);
          assertLive();
          handle = gl.createTexture();
          if (!handle) throw new RenderDeviceError("Failed to allocate WebGL texture fallback", "WEBGL_ALLOCATION_FAILED", { label: original.label });
          assertLive();
          gl.bindTexture(target, handle);
          assertLive();
        }
        // A budget-selected copy may retain a decoded chain invalidated on the
        // original texture. Do not revive that stale fallback during downscale.
        const fallbackLevels = original.fallbackTextureLevels.length === 0 ? [] : completeUploadLevels(texture.fallbackTextureLevels);
        assertLive();
        if (fallbackLevels.length === 0 || texture.dimension === "cube") {
          throw new RenderDeviceError(needsOpaqueFallback
            ? "Opaque BC1 RGB blocks need RGBA8 fallback data because WebGL may expose transparent alpha"
            : "Compressed texture format is not supported and no RGBA8 fallback data was provided", "COMPRESSED_TEXTURE_UNSUPPORTED", { label: texture.label, format: texture.format, needsOpaqueFallback });
        }
        setTextureBudgetResidentBytes(original, fallbackLevels.reduce((sum, level) => sum + level.data.byteLength, 0), this.host.device);
        submittedStorage = true;
        this.uploadRgba8FallbackTexture(texture, fallbackLevels, assertLive);
        this.finishTextureUpload(original, handle, "fallback", uploadRevision, pendingRegion, uploadColorSpace, uploadAutoMipmaps);
        return handle;
      }

      if (texture.dimension === "cube") {
        submittedStorage = true;
        this.uploadCubeTexture(texture, handle, assertLive);
        this.finishTextureUpload(original, handle, "cube", uploadRevision, pendingRegion, uploadColorSpace, uploadAutoMipmaps);
        return handle;
      }
      if (texture.format === "depth24") {
        throw new RenderDeviceError("Depth textures cannot be uploaded to WebGL2 color samplers", "UNSUPPORTED_TEXTURE_FORMAT", { label: texture.label, format: texture.format });
      }
      if (texture.source) {
        const size = sourceDimensions(texture);
        assertLive();
        setTextureBudgetResidentBytes(original, sourceByteLength(size, texture.generateMipmaps), this.host.device);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, Number(texture.flipY));
        assertLive();
        submittedStorage = true;
        gl.texImage2D(gl.TEXTURE_2D, 0, rgba8TextureInternalFormat(gl, texture), gl.RGBA, gl.UNSIGNED_BYTE, texture.source);
        assertLive();
        this.sourceSizes.set(original, size);
        this.configureSourceMips(texture, assertLive);
      } else if (texture.dimension === "2d-array" || texture.dimension === "3d") {
        const format = textureUploadFormat(gl, texture);
        const depth = texture.dimension === "3d" ? texture.depth : texture.layers;
        submittedStorage = true;
        gl.texStorage3D(target, texture.mipLevelCount, textureStorageInternalFormat(gl, texture), texture.width, texture.height, depth);
        assertLive();
        for (let level = 0; level < texture.mipLevelCount; level += 1) {
          assertLive();
          const data = texture.getMipLevel(level);
          if (level === 0 && texture.dimension === "2d-array" && !data) uploadedBase = null;
          assertLive();
          if (data) this.uploadVolumeLevel(texture, level, data, format, assertLive);
        }
        this.setLevelRange(target, texture.mipLevelCount, assertLive);
        gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        assertLive();
        gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        assertLive();
      } else if (texture.mipLevels.length > 0 || texture.mipLevelCount > 1) {
        const format = textureUploadFormat(gl, texture);
        submittedStorage = true;
        for (let level = 0; level < texture.mipLevelCount; level += 1) {
          assertLive();
          const width = mipExtent(texture.width, level);
          const height = mipExtent(texture.height, level);
          const data = texture.getMipLevel(level);
          if (level === 0 && !data) uploadedBase = null;
          assertLive();
          gl.texImage2D(target, level, format.internalFormat, width, height, 0, format.format, format.type, data ? texturePixelUploadData(data.data, texture.format) : null);
          assertLive();
        }
        this.setLevelRange(target, texture.mipLevelCount, assertLive);
      } else if (texture.dynamic) {
        const format = textureUploadFormat(gl, texture);
        const generateMipmaps = shouldGenerateDataMipmaps(texture);
        const levelCount = generateMipmaps ? fullMipCount(texture.width, texture.height) : 1;
        setTextureBudgetResidentBytes(original, mipByteLength(texture.width, texture.height, bytesPerPixel(texture.format), generateMipmaps), this.host.device);
        submittedStorage = true;
        gl.texStorage2D(target, levelCount, textureStorageInternalFormat(gl, texture), texture.width, texture.height);
        assertLive();
        const data = texture.getMipLevel(0)?.data ?? null;
        if (data === null) uploadedBase = null;
        assertLive();
        const storageError = this.host.lifecycle.readError();
        assertLive();
        if (storageError) {
          throw new RenderDeviceError("WebGL texture upload failed", "TEXTURE_UPLOAD_FAILED", { label: original.label, error: storageError });
        }
        if (data) {
          gl.texSubImage2D(target, 0, 0, 0, texture.width, texture.height, format.format, format.type, texturePixelUploadData(data, texture.format));
          assertLive();
        }
        this.setLevelRange(target, levelCount, assertLive);
        if (generateMipmaps) { gl.generateMipmap(target); assertLive(); }
        gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        assertLive();
        gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        assertLive();
      } else {
        const format = textureUploadFormat(gl, texture);
        const data = texture.getMipLevel(0)?.data ?? null;
        if (data === null) uploadedBase = null;
        assertLive();
        submittedStorage = true;
        gl.texImage2D(target, 0, format.internalFormat, texture.width, texture.height, 0, format.format, format.type, data ? texturePixelUploadData(data, texture.format) : null);
        assertLive();
        if (isFloatColorTextureFormat(texture.format)) {
          this.setLevelRange(target, 1, assertLive);
          gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
          assertLive();
          gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
          assertLive();
        } else if (texture.generateMipmaps) this.configureDataMips(texture, assertLive);
        else this.setLevelRange(target, 1, assertLive);
      }
      this.finishTextureUpload(original, handle, texture.format, uploadRevision, pendingRegion, uploadColorSpace, uploadAutoMipmaps, uploadedBase);
      return handle;
    } catch (error) {
      if (handle && this.textures.get(original) === handle) this.forgetTextureHandle(original);
      if (handle && submittedStorage && this.budgetedTextures.has(original)) this.retireBudgetedTexture(original, handle);
      else {
        if (handle) gl.deleteTexture(handle);
        this.releaseBudgetedTexture(original);
      }
      if (original.disposed && !(error instanceof RenderDeviceError && error.code === "DISPOSED_RESOURCE")) this.assertTextureUploadLive(original);
      throw error;
    }
  }

  private finishTextureUpload(original: Texture, handle: WebGLTexture, mode: TextureUploadMode, revision: number, pendingRegion: TextureUpdateRegion | null, colorSpace: Texture["colorSpace"], autoMipmaps: boolean | undefined, uploadedBase?: TexturePixelData | null): void {
    this.assertTextureUploadLive(original);
    this.assertUploadSucceeded(original);
    this.assertTextureUploadLive(original);
    this.textureUploadModes.set(original, mode);
    this.textures.set(original, handle);
    this.textureColorSpaces.set(original, colorSpace);
    if (autoMipmaps !== undefined) this.autoMipmaps.set(original, autoMipmaps);
    this.recordTextureUploaded(original, revision, pendingRegion, uploadedBase);
    this.assertTextureUploadLive(original);
  }

  private preflightSourceUpload(texture: Texture): void {
    const source = texture.source;
    if (!source) return;
    if (texture.mipLevelCount !== 1) {
      throw new RenderDeviceError("Source-backed textures cannot supply explicit mip storage", "UNSUPPORTED_TEXTURE_FORMAT", { label: texture.label, mipLevelCount: texture.mipLevelCount });
    }
    const size = sourceDimensions(texture);
    const maxDimension = this.host.textureBudgetPolicy?.maxDimension ?? this.host.textureBudgetPolicy?.maxTextureSize;
    if (maxDimension !== undefined && Math.max(...size) > maxDimension) {
      throw new TextureBudgetExceededError("Texture source dimensions exceed the requested texture budget.");
    }
    if (!Number.isSafeInteger(sourceByteLength(size, texture.generateMipmaps))) {
      throw new RenderDeviceError("Texture source dimensions exceed safe byte accounting", "UNSUPPORTED_TEXTURE_FORMAT", { label: texture.label, width: size[0], height: size[1] });
    }
    const imageBitmap = Object.prototype.toString.call(source) === "[object ImageBitmap]"
      || (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap);
    if (imageBitmap && texture.flipY) {
      throw new RenderDeviceError("ImageBitmap flipY cannot be applied during WebGL upload; orient the source when creating it", "UNSUPPORTED_TEXTURE_FORMAT", { label: texture.label });
    }
  }

  private preflightRetainedContent(texture: Texture): void {
    if (texture.format === "depth24") return;
    if (isFloatColorTextureFormat(texture.format) && texture.colorSpace !== "linear") {
      throw new RenderDeviceError("Floating-point texture uploads must use linear colorSpace", "UNSUPPORTED_TEXTURE_FORMAT", { label: texture.label, format: texture.format });
    }
    const faces = texture.dimension === "cube" ? WEBGL_CUBE_FACES : [undefined];
    for (const face of faces) {
      for (let level = 0; level < texture.mipLevelCount; level += 1) {
        const mip = texture.getMipLevel(level, face);
        this.assertTextureUploadLive(texture);
        if (!mip) continue;
        const width = mipExtent(texture.width, level);
        const height = mipExtent(texture.height, level);
        const depth = texture.dimension === "3d" ? mipExtent(texture.depth, level) : 1;
        const planes = texture.dimension === "2d-array" ? texture.layers : depth;
        const bytes = isCompressedTextureFormat(texture.format)
          ? compressedTextureByteLength(width, height, texture.format) * planes
          : width * height * planes * bytesPerPixel(texture.format);
        const data = mip.data;
        const validType = isCompressedTextureFormat(texture.format) ? data instanceof Uint8Array
          : texture.format === "rgba8" ? data instanceof Uint8Array || data instanceof Uint8ClampedArray
          : texture.format === "rgba16f" ? data instanceof Uint16Array
          : data instanceof Float32Array;
        if (!Number.isSafeInteger(bytes) || mip.width !== width || mip.height !== height
          || (mip.depth !== undefined && (texture.dimension !== "3d" || mip.depth !== depth))
          || !validType || data.byteLength !== bytes) {
          throw new RenderDeviceError("Retained texture pixel data has invalid dimensions, type, or byte length", "UNSUPPORTED_TEXTURE_FORMAT", {
            label: texture.label, level, face, expectedBytes: bytes, actualBytes: data.byteLength
          });
        }
      }
    }
  }

  private assertUploadSucceeded(texture: Texture): void {
    const error = this.host.lifecycle.readError();
    this.assertTextureUploadLive(texture);
    if (error) throw new RenderDeviceError("WebGL texture upload failed", "TEXTURE_UPLOAD_FAILED", { label: texture.label, error });
  }

  private setLevelRange(target: number, count: number, assertLive: () => void): void {
    const gl = this.host.gl;
    assertLive();
    gl.texParameteri(target, gl.TEXTURE_BASE_LEVEL, 0);
    assertLive();
    gl.texParameteri(target, gl.TEXTURE_MAX_LEVEL, count - 1);
    assertLive();
  }

  private configureSourceMips(texture: Texture, assertLive: () => void): void {
    const gl = this.host.gl;
    assertLive();
    if (texture.generateMipmaps) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 1000);
      assertLive();
      gl.generateMipmap(gl.TEXTURE_2D);
      assertLive();
    } else this.setLevelRange(gl.TEXTURE_2D, 1, assertLive);
  }

  private configureDataMips(texture: Texture, assertLive: () => void): void {
    const gl = this.host.gl;
    const target = textureTarget(gl, texture);
    const levels = shouldGenerateDataMipmaps(texture) ? fullMipCount(texture.width, texture.height) : 1;
    this.setLevelRange(target, levels, assertLive);
    if (levels > 1) { gl.generateMipmap(target); assertLive(); }
  }

  private uploadVolumeLevel(texture: Texture, level: number, mip: TextureMipLevel, format: { readonly format: number; readonly type: number }, assertLive: () => void): void {
    const gl = this.host.gl;
    const target = textureTarget(gl, texture);
    const depth = texture.dimension === "3d" ? mipExtent(texture.depth, level) : texture.layers;
    if (texture.dimension === "2d-array") {
      // Keep individual layer writes for compatibility with existing callers.
      const layerElements = mip.width * mip.height * bytesPerPixel(texture.format) / mip.data.BYTES_PER_ELEMENT;
      for (let layer = 0; layer < depth; layer += 1) {
        assertLive();
        const data = mip.data.subarray(layer * layerElements, (layer + 1) * layerElements) as TexturePixelData;
        gl.texSubImage3D(target, level, 0, 0, layer, mip.width, mip.height, 1, format.format, format.type, texturePixelUploadData(data, texture.format));
        assertLive();
      }
    } else {
      assertLive();
      gl.texSubImage3D(target, level, 0, 0, 0, mip.width, mip.height, depth, format.format, format.type, texturePixelUploadData(mip.data, texture.format));
      assertLive();
    }
  }

  private uploadCompressedTexture(texture: Texture, internalFormat: number, assertLive: () => void): void {
    const gl = this.host.gl;
    const target = textureTarget(gl, texture);
    const faces = texture.dimension === "cube" ? WEBGL_CUBE_FACES : [undefined];
    for (const face of faces) {
      const faceTarget = face ? cubeFaceTarget(gl, face) : target;
      for (let level = 0; level < texture.mipLevelCount; level += 1) {
        assertLive();
        const mip = texture.getMipLevel(level, face);
        assertLive();
        const width = mipExtent(texture.width, level);
        const height = mipExtent(texture.height, level);
        const data = mip?.data ?? new Uint8Array(compressedTextureByteLength(width, height, texture.format as Parameters<typeof compressedTextureByteLength>[2]) * (texture.dimension === "2d-array" ? texture.layers : 1));
        if (texture.dimension === "2d-array") {
          gl.compressedTexImage3D(target, level, internalFormat, width, height, texture.layers, 0, data);
        } else {
          gl.compressedTexImage2D(faceTarget, level, internalFormat, width, height, 0, data);
        }
        assertLive();
      }
    }
    this.setLevelRange(target, texture.mipLevelCount, assertLive);
    if (texture.dimension === "cube") {
      gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      assertLive();
      gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      assertLive();
      gl.texParameteri(target, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
      assertLive();
    }
  }

  /** WebGL unpack settings belong to the context, not to this texture. */
  withUnpackState<T>(upload: () => T): T {
    const gl = this.host.gl;
    const settings: readonly (readonly [number, number | boolean])[] = [
      [gl.UNPACK_FLIP_Y_WEBGL, false],
      [gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false],
      [gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE],
      [gl.UNPACK_ALIGNMENT, 4],
      [gl.UNPACK_ROW_LENGTH, 0],
      [gl.UNPACK_IMAGE_HEIGHT, 0],
      [gl.UNPACK_SKIP_PIXELS, 0],
      [gl.UNPACK_SKIP_ROWS, 0],
      [gl.UNPACK_SKIP_IMAGES, 0]
    ];
    // Some source-test mocks provide only the WebGL1 enums.
    const saved = settings.filter(([name]) => typeof name === "number")
      .map(([name, value]) => [name, gl.getParameter(name) as number | boolean, value] as const);
    const hasUnpackBuffer = typeof gl.PIXEL_UNPACK_BUFFER === "number" && typeof gl.PIXEL_UNPACK_BUFFER_BINDING === "number" && typeof gl.bindBuffer === "function";
    const unpackBuffer = hasUnpackBuffer ? gl.getParameter(gl.PIXEL_UNPACK_BUFFER_BINDING) as WebGLBuffer | null : null;
    try {
      if (hasUnpackBuffer) gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
      for (const [name, , value] of saved) gl.pixelStorei(name, Number(value));
      return upload();
    } finally {
      for (const [name, value] of saved) gl.pixelStorei(name, Number(value));
      if (hasUnpackBuffer) gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, unpackBuffer);
    }
  }

  /** Bring this context up to date without consuming another context's edits. */
  private uploadTextureRevision(texture: Texture, handle: WebGLTexture): void {
    const gl = this.host.gl;
    const assertLive = (): void => this.assertTextureHandleCurrent(texture, handle);
    assertLive();
    const mode = this.textureUploadModes.get(texture);
    const previousRevision = this.textureUploadRevisions.get(texture) ?? -1;
    const uploadRevision = texture.revision;
    const pendingRegion = texture.pendingUpdateRegion;
    const uploadedBase = !texture.source && !isCompressedTextureFormat(texture.format)
      && texture.format !== "depth24" && (texture.dimension === "2d" || texture.dimension === "2d-array")
      ? texture.getMipLevel(0)?.data : undefined;
    assertLive();
    if (mode === "depth-render-target") {
      this.recordTextureUploaded(texture, uploadRevision, pendingRegion);
      return;
    }
    if (mode === "fallback") {
      // A compressed content edit invalidates the decoded copy; only a
      // replacement supplied for the current content (or an unchanged valid
      // fallback after a metadata edit) can be uploaded into this storage.
      const fallbackLevels = texture.fallbackTextureLevels.length === 0 ? [] : completeUploadLevels(texture.fallbackTextureLevels);
      if (fallbackLevels.length === 0) {
        throw new RenderDeviceError("Cannot update a compressed texture while using its uncompressed fallback without replacement fallback levels", "COMPRESSED_TEXTURE_UNSUPPORTED", { label: texture.label, format: texture.format });
      }
      setTextureBudgetResidentBytes(texture, fallbackLevels.reduce((sum, level) => sum + level.data.byteLength, 0), this.host.device);
      this.host.stateCache.invalidate();
      assertLive();
      gl.bindTexture(textureTarget(gl, texture), handle);
      assertLive();
      this.uploadRgba8FallbackTexture(texture, fallbackLevels, assertLive);
      this.assertUploadSucceeded(texture);
      assertLive();
      this.recordTextureUploaded(texture, uploadRevision, pendingRegion);
      return;
    }
    this.host.stateCache.invalidate();
    assertLive();
    const target = textureTarget(gl, texture);
    gl.bindTexture(target, handle);
    assertLive();
    if (texture.source) {
      const size = sourceDimensions(texture);
      assertLive();
      const oldSize = this.sourceSizes.get(texture);
      const resize = oldSize && (oldSize[0] !== size[0] || oldSize[1] !== size[1])
        ? beginTextureBudgetResize(texture, sourceByteLength(size, texture.generateMipmaps), this.host.device)
        : undefined;
      let redefined = false;
      try {
        if (!resize) setTextureBudgetResidentBytes(texture, sourceByteLength(size, texture.generateMipmaps), this.host.device);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, Number(texture.flipY));
        assertLive();
        if (oldSize && oldSize[0] === size[0] && oldSize[1] === size[1]) {
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, texture.source);
        } else {
          redefined = true;
          gl.texImage2D(gl.TEXTURE_2D, 0, rgba8TextureInternalFormat(gl, texture), gl.RGBA, gl.UNSIGNED_BYTE, texture.source);
        }
        assertLive();
        this.configureSourceMips(texture, assertLive);
        this.assertUploadSucceeded(texture);
        assertLive();
        this.sourceSizes.set(texture, size);
        if (resize) void this.retireNativeTextures([], resize.commit());
      } catch (error) {
        if (resize && redefined) {
          const releaseOldStorage = resize.commit();
          if (this.textures.get(texture) === handle) this.retireTextureHandle(texture, false, true);
          void this.retireNativeTextures([], releaseOldStorage);
        } else if (resize) {
          void this.retireNativeTextures([], resize.rollback());
        }
        throw error;
      }
    } else if (mode === "compressed") {
      const internalFormat = this.compressedFormats.get(texture);
      if (internalFormat === undefined) throw new RenderDeviceError("Missing compressed texture format", "UNSUPPORTED_TEXTURE_FORMAT", { label: texture.label });
      if (texture.format === "bc1-rgb-unorm" && bc1RgbHasTransparentSelectors(texture)) {
        throw new RenderDeviceError("Updated opaque BC1 RGB blocks require a fresh decoded RGBA8 fallback", "COMPRESSED_TEXTURE_UNSUPPORTED", { label: texture.label, format: texture.format });
      }
      const faces = texture.dimension === "cube" ? WEBGL_CUBE_FACES : [undefined];
      const fullRefresh = requiresFullMipRefresh(texture, faces, previousRevision, uploadRevision);
      for (const face of faces) {
        for (let level = 0; level < texture.mipLevelCount; level += 1) {
          assertLive();
          if (!fullRefresh && texture.getMipRevision(level, face) <= previousRevision) continue;
          const mip = texture.getMipLevel(level, face);
          assertLive();
          if (mip) this.uploadCompressedRevision(texture, level, face, mip, internalFormat, assertLive);
        }
      }
    } else if (pendingRegion && uploadRevision === previousRevision + 1 && (texture.dimension === "2d" || texture.dimension === "2d-array")
      && this.uploadRetainedRegion(texture, pendingRegion, assertLive)) {
      if (texture.dimension === "2d" && texture.mipLevels.length === 0 && texture.mipLevelCount === 1 && !isFloatColorTextureFormat(texture.format)) {
        this.configureDataMips(texture, assertLive);
      }
    } else if (texture.dimension === "cube" || texture.mipLevels.length > 0 || texture.mipLevelCount > 1 || texture.dimension === "3d") {
      const format = textureUploadFormat(gl, texture);
      const faces = texture.dimension === "cube" ? WEBGL_CUBE_FACES : [undefined];
      const fullRefresh = requiresFullMipRefresh(texture, faces, previousRevision, uploadRevision);
      for (const face of faces) {
        for (let level = 0; level < texture.mipLevelCount; level += 1) {
          assertLive();
          if (!fullRefresh && texture.getMipRevision(level, face) <= previousRevision) continue;
          const mip = texture.getMipLevel(level, face);
          assertLive();
          if (!mip) continue;
          if (texture.dimension === "3d" || texture.dimension === "2d-array") {
            this.uploadVolumeLevel(texture, level, mip, format, assertLive);
          } else {
            const faceTarget = face ? cubeFaceTarget(gl, face) : target;
            gl.texSubImage2D(faceTarget, level, 0, 0, mip.width, mip.height, format.format, format.type, texturePixelUploadData(mip.data, texture.format));
            assertLive();
          }
        }
      }
    } else {
      const format = textureUploadFormat(gl, texture);
      const data = texture.getMipLevel(0)?.data;
      assertLive();
      if (data && texture.dimension === "2d-array") {
        const mip = texture.getMipLevel(0);
        assertLive();
        if (mip) this.uploadVolumeLevel(texture, 0, mip, format, assertLive);
      } else if (data) {
        gl.texSubImage2D(target, 0, 0, 0, texture.width, texture.height, format.format, format.type, texturePixelUploadData(data, texture.format));
        assertLive();
        if (!isFloatColorTextureFormat(texture.format)) this.configureDataMips(texture, assertLive);
      }
    }
    assertLive();
    if (!texture.source) this.assertUploadSucceeded(texture);
    assertLive();
    this.recordTextureUploaded(texture, uploadRevision, pendingRegion, uploadedBase);
  }

  private uploadRetainedRegion(texture: Texture, region: TextureUpdateRegion, assertLive: () => void): boolean {
    const retained = retainedTextureRegion(texture, region, this.uploadedBaseData.get(texture));
    assertLive();
    if (!retained) return false;
    const gl = this.host.gl;
    const target = textureTarget(gl, texture);
    const format = textureUploadFormat(gl, texture);
    if (texture.dimension === "2d-array") {
      const layerElements = retained.data.length / retained.layers;
      for (let layer = 0; layer < retained.layers; layer += 1) {
        assertLive();
        const data = retained.data.subarray(layer * layerElements, (layer + 1) * layerElements) as TexturePixelData;
        gl.texSubImage3D(target, 0, retained.x, retained.y, retained.firstLayer + layer, retained.width, retained.height, 1, format.format, format.type, texturePixelUploadData(data, texture.format));
        assertLive();
      }
    } else {
      gl.texSubImage2D(target, 0, retained.x, retained.y, retained.width, retained.height, format.format, format.type, texturePixelUploadData(retained.data, texture.format));
      assertLive();
    }
    return true;
  }

  private uploadCompressedRevision(texture: Texture, level: number, face: TextureCubeFace | undefined, mip: TextureMipLevel, internalFormat: number, assertLive: () => void): void {
    const gl = this.host.gl;
    const target = face ? cubeFaceTarget(gl, face) : textureTarget(gl, texture);
    const key = `${face ?? "texture"}:${level}`;
    const initialized = this.compressedLevels.get(texture) ?? new Set<string>();
    if (texture.dimension === "2d-array") {
      if (initialized.has(key)) gl.compressedTexSubImage3D(target, level, 0, 0, 0, mip.width, mip.height, texture.layers, internalFormat, mip.data);
      else gl.compressedTexImage3D(target, level, internalFormat, mip.width, mip.height, texture.layers, 0, mip.data);
    } else if (initialized.has(key)) {
      gl.compressedTexSubImage2D(target, level, 0, 0, mip.width, mip.height, internalFormat, mip.data);
    } else {
      gl.compressedTexImage2D(target, level, internalFormat, mip.width, mip.height, 0, mip.data);
    }
    assertLive();
    initialized.add(key);
    this.compressedLevels.set(texture, initialized);
  }

  private recordTextureUploaded(texture: Texture, revision: number, pendingRegion: TextureUpdateRegion | null, uploadedBase?: TexturePixelData | null): void {
    this.textureUploadRevisions.set(texture, revision);
    if (!texture.source && !isCompressedTextureFormat(texture.format)
      && texture.format !== "depth24" && (texture.dimension === "2d" || texture.dimension === "2d-array")
      && this.budgetedTextures.get(texture) === texture) {
      const data = uploadedBase !== undefined ? uploadedBase : (texture.revision === revision ? texture.getMipLevel(0)?.data : undefined);
      if (data !== undefined) this.uploadedBaseData.set(texture, data);
      else this.uploadedBaseData.delete(texture);
    } else {
      this.uploadedBaseData.delete(texture);
    }
    if (texture.revision === revision) {
      texture.pendingUpdateRegion = null;
      texture.needsUpdate = false;
    } else if (texture.pendingUpdateRegion === pendingRegion) {
      texture.pendingUpdateRegion = null;
    }
  }

  uploadCubeTexture(texture: Texture, handle: WebGLTexture, assertLive: () => void = () => this.assertTextureUploadLive(texture)): void {
    const gl = this.host.gl;
    assertLive();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, handle);
    assertLive();
    const format = textureUploadFormat(gl, texture);
    for (const face of WEBGL_CUBE_FACES) {
      for (let level = 0; level < texture.mipLevelCount; level += 1) {
        assertLive();
        const mip = texture.getMipLevel(level, face);
        assertLive();
        gl.texImage2D(cubeFaceTarget(gl, face), level, format.internalFormat, mipExtent(texture.width, level), mipExtent(texture.height, level), 0, format.format, format.type, mip ? texturePixelUploadData(mip.data, texture.format) : null);
        assertLive();
      }
    }
    this.setLevelRange(gl.TEXTURE_CUBE_MAP, texture.mipLevelCount, assertLive);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    assertLive();
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    assertLive();
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    assertLive();
  }

  uploadRgba8FallbackTexture(texture: Texture, fallbackLevels: readonly { readonly width: number; readonly height: number; readonly data: TexturePixelData }[], assertLive: () => void = () => this.assertTextureUploadLive(texture)): void {
    const gl = this.host.gl;
    const target = textureTarget(gl, texture);
    const internalFormat = texture.dimension === "2d-array" && texture.colorSpace === "linear" ? gl.RGBA8 : rgba8TextureInternalFormat(gl, texture);
    for (const [levelIndex, level] of fallbackLevels.entries()) {
      assertLive();
      if (texture.dimension === "2d-array") gl.texImage3D(target, levelIndex, internalFormat, level.width, level.height, texture.layers, 0, gl.RGBA, gl.UNSIGNED_BYTE, texturePixelUploadData(level.data, "rgba8"));
      else gl.texImage2D(target, levelIndex, internalFormat, level.width, level.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, texturePixelUploadData(level.data, "rgba8"));
      assertLive();
    }
    this.setLevelRange(target, fallbackLevels.length, assertLive);
  }

  private assertTextureUploadLive(texture: Texture): void {
    if (texture.disposed) throw new RenderDeviceError("Texture was disposed during upload", "DISPOSED_RESOURCE", { label: texture.label });
  }

  private releaseBudgetedTexture(texture: Texture): void {
    const budgeted = this.budgetedTextures.get(texture);
    this.budgetedTextures.delete(texture);
    releaseTextureBudget(texture, this.host.device);
    if (budgeted && budgeted !== texture) budgeted.dispose();
  }

  private retireBudgetedTexture(texture: Texture, handle: WebGLTexture, afterStack = false): void {
    const budgeted = this.budgetedTextures.get(texture);
    this.budgetedTextures.delete(texture);
    const release = retireTextureBudget(texture, this.host.device);
    if (budgeted && budgeted !== texture) budgeted.dispose();
    if (afterStack) void this.retireNativeTexturesAfterStack([handle], release);
    else void this.retireNativeTextures([handle], release);
  }

  private assertTextureHandleCurrent(texture: Texture, handle: WebGLTexture): void {
    if (texture.disposed) throw new RenderDeviceError("Texture is disposed", "DISPOSED_RESOURCE", { label: texture.label });
    if (this.textures.get(texture) !== handle) {
      throw new RenderDeviceError("Texture storage changed during upload or polling", "INVALID_RESOURCE", { label: texture.label });
    }
  }

  private watchTextureDisposal(texture: Texture): void {
    if (this.textureDisposalSubscriptions.has(texture)) return;
    let fired = false;
    const unsubscribe = texture.onDispose(() => {
      fired = true;
      this.retireTextureHandle(texture, true, true);
    });
    // onDispose invokes its listener synchronously when already disposed.
    if (fired) unsubscribe();
    else this.textureDisposalSubscriptions.set(texture, unsubscribe);
  }

  private unwatchTextureDisposal(texture: Texture): void {
    const unsubscribe = this.textureDisposalSubscriptions.get(texture);
    this.textureDisposalSubscriptions.delete(texture);
    try { unsubscribe?.(); } catch { /* Do not strand the native allocation. */ }
  }

  private clearTextureDisposalSubscriptions(): void {
    const subscriptions = [...this.textureDisposalSubscriptions.values()];
    this.textureDisposalSubscriptions.clear();
    for (const unsubscribe of subscriptions) {
      try { unsubscribe(); } catch { /* Continue releasing other device subscriptions. */ }
    }
  }

  /** Remove registry state before any disposal or GL callback can reenter it. */
  private forgetTextureHandle(texture: Texture): WebGLTexture | undefined {
    const handle = this.textures.get(texture);
    this.textures.delete(texture);
    this.textureUploadModes.delete(texture);
    this.textureUploadRevisions.delete(texture);
    this.sourceSizes.delete(texture);
    this.textureColorSpaces.delete(texture);
    this.autoMipmaps.delete(texture);
    this.compressedFormats.delete(texture);
    this.compressedLevels.delete(texture);
    this.uploadedBaseData.delete(texture);
    this.unwatchTextureDisposal(texture);
    return handle;
  }

  private retireTextureHandle(texture: Texture, countReleased: boolean, afterStack = false): void {
    const handle = this.forgetTextureHandle(texture);
    if (!handle) return;
    if (countReleased) this.host.counters.releasedTextureHandles += 1;
    if (this.budgetedTextures.has(texture)) this.retireBudgetedTexture(texture, handle, afterStack);
    else if (afterStack) void this.retireNativeTexturesAfterStack([handle], () => {});
    else void this.retireNativeTextures([handle], () => {});
  }

  /** Release ledger entries during device teardown; the device deletes GL handles. */
  disposeBudgetEntries(): void {
    for (const texture of [...this.budgetedTextures.keys()]) this.releaseBudgetedTexture(texture);
  }

  /** Detach normal identities synchronously; GPU deletion and debit await fences. */
  disposeTextureHandles(): void {
    for (const texture of [...this.textures.keys()]) this.retireTextureHandle(texture, false);
    this.clearTextureDisposalSubscriptions();
  }

  /** `currentTextureDisposeEpoch()` at the last full sweep (-1 = never swept). */
  private sweptDisposeEpoch = -1;

  releaseDisposedTextureHandles(): void {
    // Nothing was disposed since the last sweep: no handle can be stale.
    const epoch = currentTextureDisposeEpoch();
    if (epoch === this.sweptDisposeEpoch) return;
    this.sweptDisposeEpoch = epoch;
    for (const texture of [...this.textures.keys()]) {
      if (texture.disposed) this.retireTextureHandle(texture, true);
    }
  }
}

/** Check retained BC1 selectors, including padding (a conservative fallback). */
function bc1RgbHasTransparentSelectors(texture: Texture): boolean {
  const faces = texture.dimension === "cube" ? WEBGL_CUBE_FACES : [undefined];
  for (const face of faces) {
    for (let mip = 0; mip < texture.mipLevelCount; mip += 1) {
      const bytes = texture.getMipLevel(mip, face)?.data;
      if (!(bytes instanceof Uint8Array)) continue;
      for (let offset = 0; offset < bytes.length; offset += 8) {
        const first = bytes[offset]! | bytes[offset + 1]! << 8;
        const second = bytes[offset + 2]! | bytes[offset + 3]! << 8;
        if (first > second) continue;
        for (let i = 4; i < 8; i += 1) {
          const selectors = bytes[offset + i]!;
          if ((selectors & 3) === 3 || (selectors & 12) === 12 || (selectors & 48) === 48 || (selectors & 192) === 192) return true;
        }
      }
    }
  }
  return false;
}

function completeUploadLevels<T extends { readonly width: number; readonly height: number }>(levels: readonly T[]): readonly T[] {
  const uploadLevels: T[] = [];
  for (const level of levels) {
    if (uploadLevels.length === 0) {
      uploadLevels.push(level);
      continue;
    }
    const previous = uploadLevels[uploadLevels.length - 1]!;
    const expectedWidth = Math.max(1, Math.floor(previous.width / 2));
    const expectedHeight = Math.max(1, Math.floor(previous.height / 2));
    if (level.width !== expectedWidth || level.height !== expectedHeight) {
      break;
    }
    uploadLevels.push(level);
  }
  return uploadLevels;
}

function texturePixelUploadData(data: TexturePixelData, format: Texture["format"]): ArrayBufferView {
  if (format === "rgba16f" && data instanceof Uint16Array) return data;
  if (format === "rgba32f" && data instanceof Float32Array) return data;
  if (format === "r32f" && data instanceof Float32Array) return data;
  if (format === "rgba8" && (data instanceof Uint8Array || data instanceof Uint8ClampedArray)) return data;
  throw new RenderDeviceError("Texture pixel data type does not match texture format", "UNSUPPORTED_TEXTURE_FORMAT", { format });
}

function requiresFullMipRefresh(texture: Texture, faces: readonly (TextureCubeFace | undefined)[], previousRevision: number, uploadRevision: number): boolean {
  const revisions = new Set<number>();
  for (const face of faces) {
    for (let level = 0; level < texture.mipLevelCount; level += 1) {
      const revision = texture.getMipRevision(level, face);
      if (revision > previousRevision && revision <= uploadRevision) revisions.add(revision);
    }
  }
  return revisions.size !== uploadRevision - previousRevision;
}

function retainedTextureRegion(texture: Texture, region: TextureUpdateRegion, previous: TexturePixelData | null | undefined): {
  readonly data: TexturePixelData; readonly layers: number; readonly firstLayer: number;
  readonly x: number; readonly y: number; readonly width: number; readonly height: number;
} | null {
  const retained = texture.getMipLevel(0)?.data;
  const update = texture.data;
  const { x, y, width, height } = region;
  const firstLayer = region.layer ?? 0;
  if (!retained || previous === undefined || !update || !Number.isInteger(x) || !Number.isInteger(y)
    || !Number.isInteger(width) || !Number.isInteger(height)
    || x < 0 || y < 0 || width <= 0 || height <= 0
    || x + width > texture.width || y + height > texture.height) return null;
  const pixelBytes = bytesPerPixel(texture.format);
  const planeBytes = width * height * pixelBytes;
  const layers = texture.dimension === "2d-array" ? update.byteLength / planeBytes : 1;
  if (!Number.isInteger(layers) || layers < 1 || !Number.isInteger(firstLayer) || firstLayer < 0
    || firstLayer + layers > texture.layers || update.byteLength !== planeBytes * layers
    || (texture.dimension === "2d" && region.layer !== undefined)
    || retained.byteLength !== texture.width * texture.height * texture.layers * pixelBytes
    || (previous !== null && previous.byteLength !== retained.byteLength)) return null;
  const before = previous === null ? null : new Uint8Array(previous.buffer, previous.byteOffset, previous.byteLength);
  const after = new Uint8Array(retained.buffer, retained.byteOffset, retained.byteLength);
  const rowBytes = texture.width * pixelBytes;
  for (let layer = 0; layer < texture.layers; layer += 1) {
    for (let row = 0; row < texture.height; row += 1) {
      const offset = (layer * texture.height + row) * rowBytes;
      const inside = layer >= firstLayer && layer < firstLayer + layers && row >= y && row < y + height;
      const start = inside ? x * pixelBytes : 0;
      const end = inside ? (x + width) * pixelBytes : 0;
      for (let index = 0; index < start; index += 1) if ((before?.[offset + index] ?? 0) !== after[offset + index]) return null;
      for (let index = end; index < rowBytes; index += 1) if ((before?.[offset + index] ?? 0) !== after[offset + index]) return null;
    }
  }
  const components = pixelBytes / retained.BYTES_PER_ELEMENT;
  const rowElements = width * components;
  const result = retained.slice(0, rowElements * height * layers);
  for (let layer = 0; layer < layers; layer += 1) {
    for (let row = 0; row < height; row += 1) {
      const source = (((firstLayer + layer) * texture.height + y + row) * texture.width + x) * components;
      result.set(retained.subarray(source, source + rowElements), (layer * height + row) * rowElements);
    }
  }
  return { data: result, layers, firstLayer, x, y, width, height };
}

function textureTarget(gl: WebGL2RenderingContext, texture: Texture): GLenum {
  if (texture.dimension === "cube") return gl.TEXTURE_CUBE_MAP;
  if (texture.dimension === "2d-array") return gl.TEXTURE_2D_ARRAY;
  if (texture.dimension === "3d") return gl.TEXTURE_3D;
  return gl.TEXTURE_2D;
}

function mipExtent(size: number, level: number): number {
  return Math.max(1, Math.floor(size / 2 ** level));
}

function fullMipCount(width: number, height: number): number {
  return Math.floor(Math.log2(Math.max(width, height))) + 1;
}

function shouldGenerateDataMipmaps(texture: Texture): boolean {
  return texture.format === "rgba8" && texture.generateMipmaps;
}

function shouldAutoGenerateMipmaps(texture: Texture): boolean | undefined {
  if (texture.dimension !== "2d" || texture.mipLevels.length > 0 || texture.mipLevelCount > 1 || isCompressedTextureFormat(texture.format)) return undefined;
  return texture.source ? texture.generateMipmaps : shouldGenerateDataMipmaps(texture);
}

function sourceDimensions(texture: Texture): readonly [number, number] {
  const source = texture.source as unknown as { videoWidth?: number; videoHeight?: number; naturalWidth?: number; naturalHeight?: number; displayWidth?: number; displayHeight?: number; width?: number; height?: number };
  const width = source.videoWidth ?? source.naturalWidth ?? source.displayWidth ?? source.width ?? texture.width;
  const height = source.videoHeight ?? source.naturalHeight ?? source.displayHeight ?? source.height ?? texture.height;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RenderDeviceError("Texture source has no available image dimensions", "UNSUPPORTED_TEXTURE_FORMAT", { label: texture.label, width, height });
  }
  return [width, height];
}

function sourceByteLength(size: readonly [number, number], mipmaps: boolean): number {
  return mipByteLength(size[0], size[1], 4, mipmaps);
}

function mipByteLength(width: number, height: number, pixelBytes: number, mipmaps: boolean): number {
  let total = 0;
  do {
    total += width * height * pixelBytes;
    if (!mipmaps || (width === 1 && height === 1)) break;
    width = Math.max(1, Math.floor(width / 2));
    height = Math.max(1, Math.floor(height / 2));
  } while (true);
  return total;
}
