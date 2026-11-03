import type { RenderDevice } from "./RenderDevice";
import type { DepthClipRange, DepthConvention, DepthMode } from "./DepthConvention";
import { webgl2DeviceHost } from "./webgl2/Counters";
import type { WebGL2DeviceHost } from "./webgl2/DeviceHost";
import { reserveTextureBudget } from "./textures/TextureBudget";

export type VolumeDimensions = readonly [number, number, number];
export type VolumePlane = readonly [number, number, number, number];
export type VolumeColor = readonly [number, number, number, number];
export type VolumeSamples = Float32Array | Int8Array | Uint8Array | Int16Array | Uint16Array;

export interface VolumeTransferStop {
  /** Scalar value in the input data's units. */
  readonly value: number;
  /** Linear, unpremultiplied RGBA, with each component in [0, 1]. */
  readonly color: VolumeColor;
}

export interface ScalarVolumeData {
  /** X changes fastest, then Y, then Z. */
  readonly dimensions: VolumeDimensions;
  readonly data: VolumeSamples;
}

export interface VolumeRendererOptions extends ScalarVolumeData {
  /** Defaults to the finite min/max of the data. */
  readonly domain?: readonly [number, number];
  readonly transfer?: readonly VolumeTransferStop[];
  /** Samples per ray. Opacity is corrected for the resulting step length. */
  readonly sampleCount?: number;
  /** Plane (a,b,c,d) keeps local positions where ax + by + cz + d >= 0. */
  readonly clipPlanes?: readonly VolumePlane[];
  /** Per-renderer allocation limit. The default is 16,777,216 scalar samples. */
  readonly maxVoxels?: number;
  /** Nonnegative multiplier of volume opacity, default 1. */
  readonly density?: number;
}

export type VolumeRenderMode =
  | { readonly type: "raymarch" }
  | { readonly type: "slice"; readonly axis: "x" | "y" | "z"; readonly position: number };

/**
 * Frame depth convention the volume composites into. Reversed frames may use a
 * zero-to-one projection (WebGL2 clip control); logarithmic frames need the
 * camera near/far and projection kind used by the frame's programs.
 */
export interface VolumeDepthConvention {
  readonly mode: DepthMode;
  readonly clipRange: DepthClipRange;
  readonly logRange?: { readonly near: number; readonly far: number; readonly kind?: "perspective" | "orthographic" };
}

export interface VolumeDrawOptions {
  /**
   * World-to-clip transform, column-major, in the frame depth convention's
   * clip range (WebGL's [-1, 1] unless a reversed frame uses zero-to-one).
   */
  readonly viewProjectionMatrix: ArrayLike<number>;
  /** Maps the local unit cube to world space, column-major. Defaults to identity. */
  readonly modelMatrix?: ArrayLike<number>;
  /**
   * A separate, sampleable copy of opaque depth in framebuffer pixel coordinates.
   * It must have the same dimensions as the active framebuffer, and must not be
   * attached to that framebuffer. Without it only the entry depth is depth-tested,
   * so opaque geometry intersecting the volume cannot occlude interior samples.
   */
  readonly sceneDepth?: WebGLTexture | null;
  readonly mode?: VolumeRenderMode;
  /**
   * Depth convention of the active frame. Defaults to the owning device's
   * active convention, or standard depth for a context-only renderer. The
   * entry ray, opaque-depth clip, depth test and fragment depth all follow it.
   */
  readonly depth?: VolumeDepthConvention;
}

interface ResolvedVolumeDepth {
  readonly mode: 0 | 1 | 2;
  readonly zeroToOne: boolean;
  readonly logRange: readonly [number, number];
  readonly orthographic: boolean;
}

function resolveVolumeDepth(depth: VolumeDepthConvention | DepthConvention | undefined): ResolvedVolumeDepth {
  const mode = depth?.mode ?? "standard";
  const clipRange = depth?.clipRange ?? "minus-one-to-one";
  if (mode !== "standard" && mode !== "reversed" && mode !== "logarithmic") throw new RangeError("VolumeRenderer: unsupported depth mode.");
  if (clipRange !== "minus-one-to-one" && !(clipRange === "zero-to-one" && mode === "reversed")) {
    throw new RangeError("VolumeRenderer: only reversed depth may use a zero-to-one clip range.");
  }
  if (mode !== "logarithmic") return { mode: mode === "reversed" ? 1 : 0, zeroToOne: clipRange === "zero-to-one", logRange: [1, 2], orthographic: false };
  const range = depth?.logRange;
  if (!range || !(range.near > 0) || !Number.isFinite(range.far) || !(range.far > range.near) || (range.kind !== "perspective" && range.kind !== "orthographic")) {
    throw new RangeError("VolumeRenderer: logarithmic depth requires finite 0 < near < far and the projection kind.");
  }
  return { mode: 2, zeroToOne: false, logRange: [range.near, range.far], orthographic: range.kind === "orthographic" };
}

export interface VolumeRendererDiagnostics {
  readonly backend: "webgl2";
  readonly dimensions: VolumeDimensions;
  readonly voxelCount: number;
  /** Estimated owned texture bytes, including device staging and retirement; excludes driver overhead. */
  readonly gpuBytes: number;
  readonly retainedCpuBytes: number;
  readonly sampleCount: number;
  readonly disposed: boolean;
  readonly contextLost: boolean;
}

/** Retains a device-backed volume generation while a prepared frame is active. */
export interface VolumeFrameLease {
  /** Throws when the captured volume, context or device is no longer current. */
  assertCurrent(): void;
  /** Idempotently releases this frame's references. */
  release(): void;
}

const MAX_PLANES = 8;
const MAX_SAMPLES = 512;
const MAX_VOXELS = 67_108_864;
const DEFAULT_MAX_VOXELS = 16_777_216;
const TRANSFER_SIZE = 256;
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

interface Resources {
  readonly program: WebGLProgram;
  readonly vao: WebGLVertexArrayObject;
  readonly volume: WebGLTexture;
  readonly transfer: WebGLTexture;
  readonly fallbackDepth: WebGLTexture;
}

interface DeviceTextureAllocation {
  readonly bytes: number;
  readonly generation: number;
  readonly releaseBudget: () => void;
  handle: WebGLTexture | null;
  refs: number;
  active: boolean;
  queued: boolean;
  released: boolean;
}

interface DeferredProgramResources {
  readonly generation: number;
  program: WebGLProgram | null;
  vao: WebGLVertexArrayObject | null;
}

/**
 * An opt-in WebGL2 scalar-volume pass. The renderer owns a CPU copy and its GPU
 * resources; the calling renderer owns the context, target, viewport and depth
 * copy. All touched GL state is restored, including texture units and samplers.
 * It recreates its resources after context restoration and must be disposed by
 * the owner. Creation and texture updates consume and report an existing WebGL
 * error before making changes. WebGPU is not supported here; standard,
 * reversed (either clip range) and logarithmic frame depth are.
 */
export class VolumeRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly device?: RenderDevice;
  private readonly host?: WebGL2DeviceHost;
  private readonly maxVoxels: number;
  private samples: Float32Array = new Float32Array(0);
  private dimensions: VolumeDimensions = [0, 0, 0];
  private domain: readonly [number, number] = [0, 1];
  private autoDomain = true;
  private autoTransfer = true;
  private stops: readonly VolumeTransferStop[] = [];
  private planes: readonly VolumePlane[] = [];
  private sampleCount = 128;
  private density = 1;
  private resources: Resources | null = null;
  private disposed = false;
  private restoreError: unknown = null;
  private updating = false;
  private creatingResources = 0;
  private constructing = true;
  private contextGeneration = 0;
  private stateRevision = 0;
  private frameLeases = 0;
  private activeDraws = 0;
  private readonly deviceAllocations = new Set<DeviceTextureAllocation>();
  private readonly allocationsByHandle = new Map<WebGLTexture, DeviceTextureAllocation>();
  private unregisterDeviceOwner?: () => void;
  private unsubscribeDeviceLost?: () => void;
  private unsubscribeDeviceRestored?: () => void;
  private deferredProgramResources: DeferredProgramResources[] = [];
  private readonly pendingTextureDeletions = new Map<WebGLTexture, number>();
  private readonly eventTarget: EventTarget | null;
  private readonly lostListener: EventListener;
  private readonly restoredListener: EventListener;

  /** Obtain the renderer-owned WebGL2 context without creating another context. */
  static fromDevice(device: RenderDevice, options: VolumeRendererOptions): VolumeRenderer {
    if (device.disposed) throw new Error("VolumeRenderer: render device is disposed.");
    if (device.contextLost) throw new Error("VolumeRenderer: render device context is lost.");
    if (device.kind !== "webgl2") {
      throw new Error(`VolumeRenderer: backend '${device.kind}' is unsupported; WebGL2 is required.`);
    }
    const host = webgl2DeviceHost(device);
    if (!host) throw new Error("VolumeRenderer: WebGL2 device does not expose its registered context.");
    const renderer = new VolumeRenderer(host.gl, options, device);
    return renderer;
  }

  /**
   * Await the disposed device's native texture owners and verified retirements.
   * This can remain pending when GPU completion cannot be established.
   */
  static whenDeviceRetirementsDrained(device: RenderDevice): Promise<void> {
    if (!device.disposed) return Promise.reject(new Error("VolumeRenderer: device must be disposed before awaiting retirement."));
    const host = webgl2DeviceHost(device);
    if (device.kind !== "webgl2" || !host || host.device !== device
      || typeof host.textureRegistry?.onNativeRetirementsDrained !== "function") {
      return Promise.reject(new Error("VolumeRenderer: a matching registered WebGL2 device host is required."));
    }
    return new Promise<void>((resolve, reject) => {
      try { host.textureRegistry.onNativeRetirementsDrained(resolve); } catch (error) { reject(error); }
    });
  }

  constructor(gl: WebGL2RenderingContext, options: VolumeRendererOptions, device?: RenderDevice) {
    if (!gl || typeof gl.texImage3D !== "function" || typeof gl.createVertexArray !== "function") {
      throw new Error("VolumeRenderer: a WebGL2 context is required.");
    }
    this.gl = gl;
    this.device = device;
    this.maxVoxels = positiveInteger(options.maxVoxels ?? DEFAULT_MAX_VOXELS, MAX_VOXELS, "maxVoxels");
    if (device) {
      const host = webgl2DeviceHost(device);
      if (device.kind !== "webgl2" || !host || host.gl !== gl || host.device !== device
        || typeof host.textureRegistry?.registerNativeTextureOwner !== "function"
        || typeof host.textureRegistry?.retireNativeTexturesAfterStack !== "function"
        || typeof host.lifecycle?.onDeviceLost !== "function" || typeof host.lifecycle?.onDeviceRestored !== "function") {
        throw new Error("VolumeRenderer: a matching registered WebGL2 device host is required.");
      }
      this.host = host;
    }
    this.eventTarget = typeof gl.canvas?.addEventListener === "function" ? gl.canvas : null;
    this.lostListener = (event: Event) => {
      event.preventDefault();
      this.handleContextLost();
    };
    this.restoredListener = () => this.handleContextRestored();
    const generation = this.contextGeneration;
    try {
      if (this.host) {
        this.unsubscribeDeviceLost = this.host.lifecycle.onDeviceLost(() => this.handleContextLost());
        this.unsubscribeDeviceRestored = this.host.lifecycle.onDeviceRestored(() => this.handleContextRestored());
        this.unregisterDeviceOwner = this.host.textureRegistry.registerNativeTextureOwner(() => this.dispose());
      } else {
        this.eventTarget?.addEventListener("webglcontextlost", this.lostListener);
        this.eventTarget?.addEventListener("webglcontextrestored", this.restoredListener);
      }
      this.assertAlive();
      this.dimensions = validateDimensions(options.dimensions, options.data.length, this.maxVoxels, gl);
      this.samples = copySamples(options.data);
      this.autoDomain = options.domain === undefined;
      this.domain = options.domain ? validateDomain(options.domain) : sampleDomain(this.samples);
      this.autoTransfer = options.transfer === undefined;
      this.stops = validateStops(options.transfer ?? defaultStops(this.domain));
      this.planes = validatePlanes(options.clipPlanes ?? []);
      this.sampleCount = positiveInteger(options.sampleCount ?? 128, MAX_SAMPLES, "sampleCount");
      this.density = validateDensity(options.density ?? 1);
      this.assertAlive();
      if (generation !== this.contextGeneration) throw new Error("VolumeRenderer: context changed during construction.");
      this.resources = this.createResources();
    } catch (error) {
      this.disposed = true;
      if (!this.host) {
        this.eventTarget?.removeEventListener("webglcontextlost", this.lostListener);
        this.eventTarget?.removeEventListener("webglcontextrestored", this.restoredListener);
      }
      throw error;
    } finally {
      this.constructing = false;
      this.finishDeviceOwner();
    }
  }

  /** Tests owner identity only; use assertUsableForDevice before drawing. */
  belongsToDevice(device: RenderDevice): boolean {
    return this.device === device && this.host?.device === device;
  }

  /** Validate owner and the current native generation without performing GL work. */
  assertUsableForDevice(device: RenderDevice): void {
    if (!this.belongsToDevice(device)) throw new Error("VolumeRenderer: renderer belongs to a different device or a raw context.");
    this.assertAlive();
    if (!this.resources) throw new Error("VolumeRenderer: device resources are unavailable.");
  }

  /** Retain the exact physical textures used by a prepared device frame. */
  acquireFrameLease(device: RenderDevice): VolumeFrameLease {
    if (!this.belongsToDevice(device)) throw new Error("VolumeRenderer: renderer belongs to a different device or a raw context.");
    this.assertAlive();
    const resources = this.requireResources();
    this.assertUsableForDevice(device);
    const generation = this.contextGeneration;
    const revision = this.stateRevision;
    const allocations = [resources.volume, resources.transfer, resources.fallbackDepth].map((handle) => {
      const allocation = this.allocationsByHandle.get(handle);
      if (!allocation || allocation.released || allocation.generation !== generation) {
        throw new Error("VolumeRenderer: device texture allocation is unavailable.");
      }
      return allocation;
    });
    for (const allocation of allocations) allocation.refs++;
    this.frameLeases++;
    let released = false;
    return {
      assertCurrent: () => {
        if (released || this.contextGeneration !== generation || this.stateRevision !== revision || this.resources !== resources) {
          throw new Error("VolumeRenderer: frame lease is no longer current.");
        }
        this.assertUsableForDevice(device);
      },
      release: () => {
        if (released) return;
        released = true;
        this.frameLeases--;
        const failures: unknown[] = [];
        for (const allocation of allocations) {
          allocation.refs--;
          if (!allocation.active) try { this.retireDeviceAllocation(allocation); } catch (error) { failures.push(error); }
        }
        try { this.finishDeviceOwner(); } catch (error) { failures.push(error); }
        if (failures.length) throw new AggregateError(failures, "VolumeRenderer: frame lease release failed.");
      }
    };
  }

  /**
   * Replace the scalar field; the input remains owned by the caller. The old and
   * replacement scalar textures coexist during upload, bounded individually by
   * maxVoxels. A WebGL error check consumes and reports any existing GL error.
   */
  updateData(volume: ScalarVolumeData): void {
    this.withUpdate(() => {
      const dimensions = validateDimensions(volume.dimensions, volume.data.length, this.maxVoxels, this.gl);
      const samples = copySamples(volume.data);
      const nextDomain = this.autoDomain ? sampleDomain(samples) : this.domain;
      const nextStops = this.autoTransfer && this.autoDomain ? defaultStops(nextDomain) : this.stops;
      this.replaceTextures({ dimensions, samples }, this.autoDomain ? { domain: nextDomain, stops: nextStops } : null, () => {
        this.dimensions = dimensions;
        this.samples = samples;
        this.domain = nextDomain;
        this.stops = nextStops;
      });
    });
  }

  /** Replace transfer stops in data units; no caller-owned arrays are retained. */
  updateTransferFunction(stops: readonly VolumeTransferStop[]): void {
    this.withUpdate(() => {
      const checked = validateStops(stops);
      this.replaceTextures(null, { domain: this.domain, stops: checked }, () => {
        this.stops = checked;
        this.autoTransfer = false;
      });
    });
  }

  /** Set a fixed scalar domain; pass undefined to derive it from current data. */
  setDomain(domain?: readonly [number, number]): void {
    this.withUpdate(() => {
      const next = domain ? validateDomain(domain) : sampleDomain(this.samples);
      const nextStops = this.autoTransfer ? defaultStops(next) : this.stops;
      this.replaceTextures(null, { domain: next, stops: nextStops }, () => {
        this.autoDomain = domain === undefined;
        this.domain = next;
        this.stops = nextStops;
      });
    });
  }

  setClipPlanes(planes: readonly VolumePlane[]): void {
    this.assertAlive();
    this.planes = validatePlanes(planes);
    this.stateRevision++;
  }

  setSampleCount(count: number): void {
    this.assertAlive();
    this.sampleCount = positiveInteger(count, MAX_SAMPLES, "sampleCount");
    this.stateRevision++;
  }

  setDensity(density: number): void {
    this.assertAlive();
    this.density = validateDensity(density);
    this.stateRevision++;
  }

  /** Draw into the currently bound framebuffer and viewport, without clearing it. */
  draw(options: VolumeDrawOptions): void {
    this.assertAlive();
    const mvp = multiplyMatrices(matrix(options.viewProjectionMatrix), matrix(options.modelMatrix ?? IDENTITY));
    const inverse = invertMatrix(mvp);
    const mode = options.mode ?? { type: "raymarch" };
    if (mode.type !== "raymarch" && mode.type !== "slice") throw new RangeError("VolumeRenderer: invalid render mode.");
    const depth = resolveVolumeDepth(options.depth ?? this.device?.getDepthConvention?.());
    let axis = 0;
    let position = 0;
    if (mode.type === "slice") {
      axis = mode.axis === "x" ? 0 : mode.axis === "y" ? 1 : mode.axis === "z" ? 2 : -1;
      if (axis < 0 || !Number.isFinite(mode.position) || mode.position < 0 || mode.position > 1) {
        throw new RangeError("VolumeRenderer: slice axis and position in [0, 1] are required.");
      }
      position = mode.position;
    }
    const r = this.requireResources();
    const generation = this.contextGeneration;
    const revision = this.stateRevision;
    const gl = this.gl;
    if (this.host) this.activeDraws++;
    try {
      const depthRange = gl.getParameter(gl.DEPTH_RANGE) as Float32Array;
      if (!depthRange || !Number.isFinite(depthRange[0]) || !Number.isFinite(depthRange[1]) || depthRange[1] <= depthRange[0]) {
        throw new Error("VolumeRenderer: a finite increasing WebGL depth range is required.");
      }
      const packedPlanes = new Float32Array(MAX_PLANES * 4);
      this.planes.forEach((plane, i) => packedPlanes.set(plane, i * 4));
      if (this.host) {
        this.assertUpdateCurrent(r, generation);
        if (revision !== this.stateRevision) throw new Error("VolumeRenderer: state changed during draw.");
      }
      withDrawState(gl, () => {
        if (this.host) {
          this.assertUpdateCurrent(r, generation);
          if (revision !== this.stateRevision) throw new Error("VolumeRenderer: state changed during draw.");
        }
        gl.useProgram(r.program);
        gl.bindVertexArray(r.vao);
        gl.enable(gl.BLEND);
        gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
        gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.enable(gl.DEPTH_TEST);
        // Reversed depth stores nearer surfaces as larger values.
        gl.depthFunc(depth.mode === 1 ? gl.GEQUAL : gl.LEQUAL);
        gl.depthMask(false);
        gl.disable(gl.CULL_FACE);
        gl.colorMask(true, true, true, true);
        bindTexture(gl, 0, gl.TEXTURE_3D, r.volume);
        bindTexture(gl, 1, gl.TEXTURE_2D, r.transfer);
        bindTexture(gl, 2, gl.TEXTURE_2D, options.sceneDepth ?? r.fallbackDepth);
        const location = (name: string) => gl.getUniformLocation(r.program, name);
        gl.uniformMatrix4fv(location("u_mvp"), false, mvp);
        gl.uniformMatrix4fv(location("u_inverseMvp"), false, inverse);
        gl.uniform3iv(location("u_dimensions"), new Int32Array(this.dimensions));
        gl.uniform2fv(location("u_domain"), new Float32Array(this.domain));
        gl.uniform2fv(location("u_depthRange"), depthRange);
        gl.uniform1i(location("u_volume"), 0);
        gl.uniform1i(location("u_transfer"), 1);
        gl.uniform1i(location("u_depth"), 2);
        gl.uniform1i(location("u_hasDepth"), options.sceneDepth ? 1 : 0);
        gl.uniform1i(location("u_steps"), this.sampleCount);
        gl.uniform1f(location("u_density"), this.density);
        gl.uniform1i(location("u_planeCount"), this.planes.length);
        gl.uniform4fv(location("u_planes[0]"), packedPlanes);
        gl.uniform1i(location("u_sliceAxis"), mode.type === "slice" ? axis : -1);
        gl.uniform1f(location("u_slicePosition"), position);
        gl.uniform1i(location("u_depthMode"), depth.mode);
        gl.uniform1i(location("u_clipZeroToOne"), depth.zeroToOne ? 1 : 0);
        gl.uniform2fv(location("u_logRange"), new Float32Array(depth.logRange));
        gl.uniform1i(location("u_logOrthographic"), depth.orthographic ? 1 : 0);
        if (this.host) {
          this.assertUpdateCurrent(r, generation);
          if (revision !== this.stateRevision) throw new Error("VolumeRenderer: state changed during draw.");
        }
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        if (this.host) this.host.counters.drawCalls++;
      });
    } finally {
      if (this.host) {
        try { this.host.stateCache.invalidate(); }
        finally { this.activeDraws--; this.finishDeviceOwner(); }
      }
    }
  }

  getDiagnostics(): VolumeRendererDiagnostics {
    const contextLost = this.isContextLost();
    const pendingBytes = contextLost ? 0 : [...this.pendingTextureDeletions.values()].reduce((sum, bytes) => sum + bytes, 0);
    const deviceBytes = contextLost ? 0 : [...this.deviceAllocations].reduce((sum, allocation) => sum + (allocation.released ? 0 : allocation.bytes), 0);
    return {
      backend: "webgl2", dimensions: [...this.dimensions], voxelCount: this.samples.length,
      gpuBytes: this.host ? deviceBytes : (this.resources && !contextLost ? this.samples.byteLength + TRANSFER_SIZE * 4 + 1 : 0) + pendingBytes,
      retainedCpuBytes: this.samples.byteLength, sampleCount: this.sampleCount,
      disposed: this.disposed, contextLost
    };
  }

  dispose(): void {
    if (this.disposed) {
      if (this.host) this.finishDeviceOwner();
      else this.flushTextureDeletions();
      return;
    }
    this.disposed = true;
    this.eventTarget?.removeEventListener("webglcontextrestored", this.restoredListener);
    const resources = this.resources;
    const volumeBytes = this.samples.byteLength;
    this.resources = null;
    this.samples = new Float32Array(0);
    this.stops = [];
    this.planes = [];
    const failures: unknown[] = [];
    if (this.host) {
      this.unsubscribeDeviceRestored?.();
      this.unsubscribeDeviceRestored = undefined;
      if (this.isContextLost()) {
        for (const allocation of [...this.deviceAllocations]) this.releaseDeviceAllocation(allocation);
      } else if (resources) {
        this.deferredProgramResources.push({ generation: this.contextGeneration, program: resources.program, vao: resources.vao });
        for (const handle of [resources.volume, resources.transfer, resources.fallbackDepth]) {
          const allocation = this.allocationsByHandle.get(handle);
          if (allocation) {
            allocation.active = false;
            try { this.retireDeviceAllocation(allocation); } catch (error) { failures.push(error); }
          }
        }
      }
      try { this.finishDeviceOwner(); } catch (error) { failures.push(error); }
      if (failures.length) throw new AggregateError(failures, "VolumeRenderer: resource disposal failed.");
      return;
    }
    if (resources && !this.isContextLost()) {
      try { this.gl.deleteProgram(resources.program); } catch (error) { failures.push(error); }
      try { this.gl.deleteVertexArray(resources.vao); } catch (error) { failures.push(error); }
      this.pendingTextureDeletions.set(resources.volume, volumeBytes);
      this.pendingTextureDeletions.set(resources.transfer, TRANSFER_SIZE * 4);
      this.pendingTextureDeletions.set(resources.fallbackDepth, 1);
    }
    try { this.flushTextureDeletions(); } catch (error) { failures.push(error); }
    if (failures.length) throw new AggregateError(failures, "VolumeRenderer: resource disposal failed.");
  }

  private handleContextLost(): void {
    this.contextGeneration++;
    this.resources = null;
    this.pendingTextureDeletions.clear();
    this.deferredProgramResources = [];
    for (const allocation of [...this.deviceAllocations]) this.releaseDeviceAllocation(allocation);
    if (!this.host && this.disposed && !this.updating && this.creatingResources === 0) {
      this.eventTarget?.removeEventListener("webglcontextlost", this.lostListener);
    }
  }

  private handleContextRestored(): void {
    if (this.disposed || this.constructing) return;
    try {
      this.flushDeviceRetirements();
      this.flushTextureDeletions();
      this.assertAlive();
      if (!this.resources) this.resources = this.createResources();
      this.restoreError = null;
    } catch (error) {
      this.restoreError = error;
    }
  }

  private validateDeviceDimensions(dimensions: VolumeDimensions): void {
    if (!this.host) return;
    const policy = this.host.textureBudgetPolicy;
    const max = policy?.maxDimension ?? policy?.maxTextureSize;
    if (max !== undefined && (!Number.isSafeInteger(max) || max < 1)) throw new Error("VolumeRenderer: invalid device texture dimension limit.");
    if (max !== undefined && Math.max(...dimensions, TRANSFER_SIZE) > max) {
      throw new Error("VolumeRenderer: device texture dimension budget exceeded.");
    }
  }

  private reserveDeviceAllocations(bytes: readonly number[]): DeviceTextureAllocation[] {
    if (!this.host || !this.device) return [];
    const policy = this.host.textureBudgetPolicy;
    const allocations: DeviceTextureAllocation[] = [];
    try {
      for (const size of bytes) {
        const allocation: DeviceTextureAllocation = {
          bytes: size, generation: this.contextGeneration,
          releaseBudget: reserveTextureBudget(size, policy?.maxBytes ?? policy?.textureBudgetBytes, this.device),
          handle: null, refs: 0, active: false, queued: false, released: false
        };
        this.deviceAllocations.add(allocation);
        allocations.push(allocation);
      }
      return allocations;
    } catch (error) {
      for (const allocation of allocations) this.releaseDeviceAllocation(allocation);
      throw error;
    }
  }

  private bindDeviceAllocation(allocation: DeviceTextureAllocation | undefined, handle: WebGLTexture | null): void {
    if (!allocation || !handle) return;
    allocation.handle = handle;
    if (!allocation.released && allocation.generation === this.contextGeneration) this.allocationsByHandle.set(handle, allocation);
  }

  private releaseDeviceAllocation(allocation: DeviceTextureAllocation): void {
    if (allocation.released) return;
    allocation.released = true;
    this.deviceAllocations.delete(allocation);
    if (allocation.handle && this.allocationsByHandle.get(allocation.handle) === allocation) this.allocationsByHandle.delete(allocation.handle);
    allocation.releaseBudget();
  }

  private retireDeviceAllocation(allocation: DeviceTextureAllocation): void {
    allocation.active = false;
    if (allocation.released || allocation.queued || allocation.refs > 0) return;
    if (!allocation.handle || allocation.generation !== this.contextGeneration || this.isContextLost()) {
      this.releaseDeviceAllocation(allocation);
      return;
    }
    if (!this.host) throw new Error("VolumeRenderer: device texture retirement host is unavailable.");
    allocation.queued = true;
    try {
      void this.host.textureRegistry.retireNativeTexturesAfterStack([allocation.handle], () => this.releaseDeviceAllocation(allocation));
    } catch (error) {
      allocation.queued = false;
      throw error;
    }
  }

  private flushDeviceRetirements(): void {
    if (!this.host) return;
    const failures: unknown[] = [];
    for (const allocation of [...this.deviceAllocations]) {
      if (!allocation.active && !allocation.queued && allocation.refs === 0) {
        try { this.retireDeviceAllocation(allocation); } catch (error) { failures.push(error); }
      }
    }
    if (failures.length) throw new AggregateError(failures, "VolumeRenderer: device texture retirement failed.");
  }

  private finishDeviceOwner(): void {
    if (!this.host || !this.disposed || this.constructing || this.updating || this.creatingResources || this.frameLeases || this.activeDraws) return;
    const failures: unknown[] = [];
    for (const allocation of [...this.deviceAllocations]) {
      if (!allocation.active && !allocation.queued) {
        try { this.retireDeviceAllocation(allocation); } catch (error) { failures.push(error); }
      }
    }
    const remaining: DeferredProgramResources[] = [];
    for (const entry of this.deferredProgramResources) {
      if (entry.generation !== this.contextGeneration || this.isContextLost()) continue;
      if (entry.program) try { this.gl.deleteProgram(entry.program); entry.program = null; } catch (error) { failures.push(error); }
      if (entry.vao) try { this.gl.deleteVertexArray(entry.vao); entry.vao = null; } catch (error) { failures.push(error); }
      if (entry.program || entry.vao) remaining.push(entry);
    }
    this.deferredProgramResources = remaining;
    if (failures.length) throw new AggregateError(failures, "VolumeRenderer: device resource retirement failed.");
    if ([...this.deviceAllocations].some((allocation) => !allocation.queued && !allocation.released) || remaining.length) return;
    this.unregisterDeviceOwner?.();
    this.unregisterDeviceOwner = undefined;
    this.unsubscribeDeviceLost?.();
    this.unsubscribeDeviceLost = undefined;
    this.unsubscribeDeviceRestored?.();
    this.unsubscribeDeviceRestored = undefined;
  }

  private withUpdate(operation: () => void): void {
    this.assertAlive();
    if (this.updating || this.creatingResources) throw new Error("VolumeRenderer: a texture update or resource creation is already in progress.");
    this.updating = true;
    try {
      // Failed deletions are retried before allocating again, keeping the number
      // of outstanding staged textures bounded if cleanup repeatedly fails.
      this.flushDeviceRetirements();
      this.flushTextureDeletions();
      this.assertAlive();
      operation();
    } finally {
      this.updating = false;
      if (this.host) {
        try { this.host.stateCache.invalidate(); }
        finally { this.finishDeviceOwner(); }
      } else if (this.disposed && this.creatingResources === 0 && this.pendingTextureDeletions.size === 0) {
        this.eventTarget?.removeEventListener("webglcontextlost", this.lostListener);
      }
    }
  }

  private replaceTextures(
    volume: { readonly dimensions: VolumeDimensions; readonly samples: Float32Array } | null,
    transfer: { readonly domain: readonly [number, number]; readonly stops: readonly VolumeTransferStop[] } | null,
    commit: () => void
  ): void {
    const gl = this.gl;
    const generation = this.contextGeneration;
    const resources = this.requireResources();
    const previousVolumeBytes = this.samples.byteLength;
    this.assertUpdateCurrent(resources, generation);
    assertNoGlError(gl, "before texture update");
    this.validateDeviceDimensions(volume?.dimensions ?? this.dimensions);
    const allocations = this.reserveDeviceAllocations([
      ...(volume ? [volume.samples.byteLength] : []), ...(transfer ? [TRANSFER_SIZE * 4] : [])
    ]);
    let index = 0;
    const volumeAllocation = volume ? allocations[index++] : undefined;
    const transferAllocation = transfer ? allocations[index++] : undefined;
    let newVolume: WebGLTexture | null = null;
    let newTransfer: WebGLTexture | null = null;
    let volumeGeneration = generation;
    let transferGeneration = generation;
    try {
      withTextureState(gl, () => {
        this.assertUpdateCurrent(resources, generation);
        if (volume) {
          newVolume = gl.createTexture();
          this.bindDeviceAllocation(volumeAllocation, newVolume);
          volumeGeneration = this.contextGeneration;
          if (!newVolume) throw new Error("VolumeRenderer: volume texture allocation failed.");
          this.assertUpdateCurrent(resources, generation);
          bindTexture(gl, 0, gl.TEXTURE_3D, newVolume);
          textureParameters(gl, gl.TEXTURE_3D, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
          this.assertUpdateCurrent(resources, generation);
          uploadVolume(gl, volume.dimensions, volume.samples);
          this.assertUpdateCurrent(resources, generation);
        }
        if (transfer) {
          newTransfer = gl.createTexture();
          this.bindDeviceAllocation(transferAllocation, newTransfer);
          transferGeneration = this.contextGeneration;
          if (!newTransfer) throw new Error("VolumeRenderer: transfer texture allocation failed.");
          this.assertUpdateCurrent(resources, generation);
          bindTexture(gl, 1, gl.TEXTURE_2D, newTransfer);
          textureParameters(gl, gl.TEXTURE_2D, gl.LINEAR);
          this.assertUpdateCurrent(resources, generation);
          uploadTransfer(gl, transfer.domain, transfer.stops);
          this.assertUpdateCurrent(resources, generation);
        }
      });
      assertNoGlError(gl, "during texture update");
      this.assertUpdateCurrent(resources, generation);
      this.resources = { ...resources, volume: newVolume ?? resources.volume, transfer: newTransfer ?? resources.transfer };
      commit();
      if (volumeAllocation) volumeAllocation.active = true;
      if (transferAllocation) transferAllocation.active = true;
      this.stateRevision++;
    } catch (error) {
      if (this.host) {
        const failures: unknown[] = [];
        for (const allocation of allocations) {
          try { this.retireDeviceAllocation(allocation); } catch (cleanup) { failures.push(cleanup); }
        }
        if (failures.length) throw new AggregateError([error, ...failures], "VolumeRenderer: texture update and cleanup failed.");
        throw error;
      }
      if (!this.isContextLost()) {
        if (newVolume && volumeGeneration === this.contextGeneration) this.pendingTextureDeletions.set(newVolume, volume?.samples.byteLength ?? 0);
        if (newTransfer && transferGeneration === this.contextGeneration) this.pendingTextureDeletions.set(newTransfer, TRANSFER_SIZE * 4);
        try { this.flushTextureDeletions(); }
        catch (cleanup) { throw new AggregateError([error, cleanup], "VolumeRenderer: texture update and cleanup failed."); }
      }
      throw error;
    }

    // The new CPU data and GPU handles are now committed. A cleanup failure is
    // reported explicitly as post-commit and retried before the next update.
    if (this.host) {
      const failures: unknown[] = [];
      for (const handle of [newVolume ? resources.volume : null, newTransfer ? resources.transfer : null]) {
        if (!handle) continue;
        const allocation = this.allocationsByHandle.get(handle);
        if (!allocation) continue;
        allocation.active = false;
        try { this.retireDeviceAllocation(allocation); } catch (cleanup) { failures.push(cleanup); }
      }
      if (failures.length) throw new AggregateError(failures, "VolumeRenderer: texture update committed, but old texture cleanup failed.");
      return;
    }
    if (generation === this.contextGeneration && !this.isContextLost()) {
      if (newVolume) this.pendingTextureDeletions.set(resources.volume, previousVolumeBytes);
      if (newTransfer) this.pendingTextureDeletions.set(resources.transfer, TRANSFER_SIZE * 4);
      try { this.flushTextureDeletions(); }
      catch (cleanup) { throw new AggregateError([cleanup], "VolumeRenderer: texture update committed, but old texture cleanup failed."); }
    }
  }

  private assertUpdateCurrent(resources: Resources, generation: number): void {
    this.assertAlive();
    if (generation !== this.contextGeneration || this.resources !== resources) {
      throw new Error("VolumeRenderer: context or resources changed during texture update.");
    }
  }

  private flushTextureDeletions(): void {
    if (this.isContextLost()) {
      this.pendingTextureDeletions.clear();
      if (this.disposed && !this.updating && this.creatingResources === 0) this.eventTarget?.removeEventListener("webglcontextlost", this.lostListener);
      return;
    }
    const failures: unknown[] = [];
    for (const [texture, bytes] of [...this.pendingTextureDeletions]) {
      if (!this.pendingTextureDeletions.has(texture)) continue;
      if (this.isContextLost()) {
        this.pendingTextureDeletions.clear();
        break;
      }
      const generation = this.contextGeneration;
      this.pendingTextureDeletions.delete(texture);
      try { this.gl.deleteTexture(texture); }
      catch (error) {
        if (generation === this.contextGeneration && !this.isContextLost()) this.pendingTextureDeletions.set(texture, bytes);
        failures.push(error);
      }
    }
    if (this.disposed && !this.updating && this.creatingResources === 0 && this.pendingTextureDeletions.size === 0) {
      this.eventTarget?.removeEventListener("webglcontextlost", this.lostListener);
    }
    if (failures.length) throw new AggregateError(failures, "VolumeRenderer: texture cleanup failed.");
  }

  private isContextLost(): boolean {
    return this.device?.contextLost === true || (typeof this.gl.isContextLost === "function" && this.gl.isContextLost());
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error("VolumeRenderer: renderer is disposed.");
    if (this.device?.disposed) throw new Error("VolumeRenderer: render device is disposed.");
    if (this.isContextLost()) throw new Error("VolumeRenderer: WebGL2 context is lost.");
    // The context probe can synchronously trigger a host callback in embedded
    // or instrumented contexts; do not resume on a newly disposed owner.
    if (this.disposed) throw new Error("VolumeRenderer: renderer is disposed.");
    if (this.device?.disposed) throw new Error("VolumeRenderer: render device is disposed.");
  }

  private requireResources(): Resources {
    // A caller-provided value or GL callback can dispose the renderer after an
    // operation's initial check. Never recreate resources after that disposal.
    this.assertAlive();
    if (!this.resources) {
      if (this.creatingResources) throw new Error("VolumeRenderer: resource creation is already in progress.");
      this.flushDeviceRetirements();
      this.flushTextureDeletions();
      this.assertAlive();
      if (this.resources) return this.resources;
      try {
        this.resources = this.createResources();
        this.restoreError = null;
      } catch (error) {
        this.restoreError = error;
      }
    }
    if (!this.resources) throw new Error(`VolumeRenderer: resource restoration failed: ${String(this.restoreError)}`);
    return this.resources;
  }

  private createResources(): Resources {
    const gl = this.gl;
    const generation = this.contextGeneration;
    const volumeBytes = this.samples.byteLength;
    this.creatingResources++;
    const assertCurrent = () => {
      this.assertAlive();
      if (generation !== this.contextGeneration) throw new Error("VolumeRenderer: context changed during resource creation.");
    };
    let program: WebGLProgram | null = null;
    let vao: WebGLVertexArrayObject | null = null;
    let volume: WebGLTexture | null = null;
    let transfer: WebGLTexture | null = null;
    let fallbackDepth: WebGLTexture | null = null;
    let allocations: DeviceTextureAllocation[] = [];
    try {
      assertCurrent();
      assertNoGlError(gl, "before resource creation");
      this.validateDeviceDimensions(this.dimensions);
      allocations = this.reserveDeviceAllocations([volumeBytes, TRANSFER_SIZE * 4, 1]);
      assertCurrent();
      program = createProgram(gl);
      assertCurrent();
      vao = gl.createVertexArray();
      assertCurrent();
      volume = gl.createTexture();
      this.bindDeviceAllocation(allocations[0], volume);
      assertCurrent();
      transfer = gl.createTexture();
      this.bindDeviceAllocation(allocations[1], transfer);
      assertCurrent();
      fallbackDepth = gl.createTexture();
      this.bindDeviceAllocation(allocations[2], fallbackDepth);
      assertCurrent();
      if (!vao || !volume || !transfer || !fallbackDepth) throw new Error("VolumeRenderer: WebGL resource allocation failed.");
      withTextureState(gl, () => {
        assertCurrent();
        bindTexture(gl, 0, gl.TEXTURE_3D, volume!);
        textureParameters(gl, gl.TEXTURE_3D, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
        uploadVolume(gl, this.dimensions, this.samples);
        assertCurrent();
        bindTexture(gl, 1, gl.TEXTURE_2D, transfer!);
        textureParameters(gl, gl.TEXTURE_2D, gl.LINEAR);
        uploadTransfer(gl, this.domain, this.stops);
        assertCurrent();
        bindTexture(gl, 2, gl.TEXTURE_2D, fallbackDepth!);
        textureParameters(gl, gl.TEXTURE_2D, gl.NEAREST);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([255]));
        assertCurrent();
      });
      assertNoGlError(gl, "during resource creation");
      assertCurrent();
      for (const allocation of allocations) allocation.active = true;
      return { program, vao, volume, transfer, fallbackDepth };
    } catch (error) {
      const failures: unknown[] = [];
      // Context loss already releases the old generation; never delete its
      // invalid handles through a subsequently restored context.
      if (generation === this.contextGeneration && !this.isContextLost()) {
        if (program) try { gl.deleteProgram(program); } catch (cleanup) { failures.push(cleanup); }
        if (vao) try { gl.deleteVertexArray(vao); } catch (cleanup) { failures.push(cleanup); }
        if (!this.host) {
          if (volume) this.pendingTextureDeletions.set(volume, volumeBytes);
          if (transfer) this.pendingTextureDeletions.set(transfer, TRANSFER_SIZE * 4);
          if (fallbackDepth) this.pendingTextureDeletions.set(fallbackDepth, 1);
          try { this.flushTextureDeletions(); } catch (cleanup) { failures.push(cleanup); }
        }
      }
      if (this.host) for (const allocation of allocations) {
        try { this.retireDeviceAllocation(allocation); } catch (cleanup) { failures.push(cleanup); }
      }
      if (failures.length) throw new AggregateError([error, ...failures], "VolumeRenderer: resource creation and cleanup failed.");
      throw error;
    } finally {
      this.creatingResources--;
      if (this.host) {
        try { this.host.stateCache.invalidate(); }
        finally { this.finishDeviceOwner(); }
      } else if (this.disposed && !this.updating && this.creatingResources === 0 && this.pendingTextureDeletions.size === 0) {
        this.eventTarget?.removeEventListener("webglcontextlost", this.lostListener);
      }
    }
  }
}

/** Produce the same bounded, linearly interpolated RGBA8 lookup uploaded to the GPU. */
export function buildVolumeTransferTable(domain: readonly [number, number], stops: readonly VolumeTransferStop[]): Uint8Array {
  const range = validateDomain(domain);
  const checked = validateStops(stops);
  const output = new Uint8Array(TRANSFER_SIZE * 4);
  let upper = 1;
  for (let i = 0; i < TRANSFER_SIZE; i++) {
    const value = range[0] + (range[1] - range[0]) * i / (TRANSFER_SIZE - 1);
    while (upper < checked.length - 1 && value > checked[upper].value) upper++;
    const left = checked[upper - 1];
    const right = checked[upper];
    const t = Math.max(0, Math.min(1, (value - left.value) / (right.value - left.value)));
    for (let channel = 0; channel < 4; channel++) {
      output[i * 4 + channel] = Math.round(255 * (left.color[channel] + (right.color[channel] - left.color[channel]) * t));
    }
  }
  return output;
}

function validateDimensions(dimensions: VolumeDimensions, count: number, max: number, gl: WebGL2RenderingContext): VolumeDimensions {
  if (!Array.isArray(dimensions) || dimensions.length !== 3) throw new RangeError("VolumeRenderer: three dimensions are required.");
  const limit = Number(gl.getParameter(gl.MAX_3D_TEXTURE_SIZE));
  if (!Number.isInteger(limit) || limit < 1) throw new Error("VolumeRenderer: WebGL2 MAX_3D_TEXTURE_SIZE is unavailable.");
  let total = 1;
  for (const value of dimensions) {
    if (!Number.isSafeInteger(value) || value < 1 || value > limit) throw new RangeError("VolumeRenderer: dimensions exceed WebGL2 limits or are invalid.");
    total *= value;
    if (!Number.isSafeInteger(total) || total > max) throw new RangeError("VolumeRenderer: voxel budget exceeded.");
  }
  if (total !== count) throw new RangeError("VolumeRenderer: data length must match the dimensions.");
  return [dimensions[0], dimensions[1], dimensions[2]];
}

function copySamples(data: VolumeSamples): Float32Array {
  if (!(data instanceof Float32Array || data instanceof Int8Array || data instanceof Uint8Array || data instanceof Int16Array || data instanceof Uint16Array)) {
    throw new TypeError("VolumeRenderer: data must be Float32Array, Int8Array, Uint8Array, Int16Array or Uint16Array.");
  }
  // All supported integer samples, including negative values, are exactly
  // representable in the float32 texture used by the volume shader.
  const copy = new Float32Array(data);
  for (const value of copy) if (!Number.isFinite(value)) throw new RangeError("VolumeRenderer: scalar samples must be finite.");
  return copy;
}

function sampleDomain(data: Float32Array): readonly [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const value of data) { min = Math.min(min, value); max = Math.max(max, value); }
  // Place a constant field inside the domain rather than at transparent zero.
  if (min === max) {
    const delta = Math.max(1, Math.abs(min) * 1e-6);
    const lower = min - delta;
    const upper = max + delta;
    if (!Number.isFinite(Math.fround(lower))) return [min, upper];
    if (!Number.isFinite(Math.fround(upper))) return [lower, max];
    return [lower, upper];
  }
  return [min, max];
}

function validateDomain(domain: readonly [number, number]): readonly [number, number] {
  if (domain.length !== 2 || !Number.isFinite(Math.fround(domain[0])) || !Number.isFinite(Math.fround(domain[1]))
    || !(Math.fround(domain[1]) > Math.fround(domain[0]))) {
    throw new RangeError("VolumeRenderer: domain requires two strictly increasing finite float32 values.");
  }
  return [domain[0], domain[1]];
}

function defaultStops(domain: readonly [number, number]): readonly VolumeTransferStop[] {
  return [{ value: domain[0], color: [0, 0, 0, 0] }, { value: domain[1], color: [1, 1, 1, 0.05] }];
}

function validateStops(stops: readonly VolumeTransferStop[]): readonly VolumeTransferStop[] {
  if (!Array.isArray(stops) || stops.length < 2 || stops.length > 4096) throw new RangeError("VolumeRenderer: transfer requires 2 to 4096 stops.");
  let previous = -Infinity;
  return stops.map((stop: VolumeTransferStop) => {
    if (!stop || !Number.isFinite(Math.fround(stop.value)) || stop.value <= previous || !Array.isArray(stop.color) || stop.color.length !== 4
      || stop.color.some((channel: number) => !Number.isFinite(channel) || channel < 0 || channel > 1)) {
      throw new RangeError("VolumeRenderer: transfer stops must be ordered, finite, and use RGBA in [0, 1].");
    }
    previous = stop.value;
    return { value: stop.value, color: [...stop.color] as [number, number, number, number] };
  });
}

function validatePlanes(planes: readonly VolumePlane[]): readonly VolumePlane[] {
  if (!Array.isArray(planes) || planes.length > MAX_PLANES) throw new RangeError("VolumeRenderer: at most 8 clip planes are supported.");
  return planes.map((plane) => {
    if (!Array.isArray(plane) || plane.length !== 4 || plane.some((n) => !Number.isFinite(n)) || (plane[0] === 0 && plane[1] === 0 && plane[2] === 0)) {
      throw new RangeError("VolumeRenderer: clip planes require finite nonzero normals.");
    }
    return [...plane] as [number, number, number, number];
  });
}

function positiveInteger(value: number, maximum: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new RangeError(`VolumeRenderer: ${name} must be an integer from 1 to ${maximum}.`);
  return value;
}

function validateDensity(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000) throw new RangeError("VolumeRenderer: density must be finite and in [0, 1000000].");
  return value;
}

function matrix(value: ArrayLike<number>): Float32Array {
  if (!value || value.length !== 16) throw new RangeError("VolumeRenderer: matrices must contain 16 finite numbers.");
  const result = new Float32Array(16);
  for (let i = 0; i < 16; i++) {
    result[i] = value[i];
    if (!Number.isFinite(result[i])) throw new RangeError("VolumeRenderer: matrices must contain 16 finite numbers.");
  }
  return result;
}

function multiplyMatrices(a: Float32Array, b: Float32Array): Float32Array {
  const result = new Float32Array(16);
  for (let column = 0; column < 4; column++) for (let row = 0; row < 4; row++) {
    let sum = 0;
    for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[column * 4 + k];
    result[column * 4 + row] = sum;
  }
  return result;
}

function invertMatrix(input: Float32Array): Float32Array {
  const rows = Array.from({ length: 4 }, (_, row) => Array.from({ length: 8 }, (_, col) => col < 4 ? input[col * 4 + row] : Number(col - 4 === row)));
  for (let col = 0; col < 4; col++) {
    let pivot = col;
    for (let row = col + 1; row < 4; row++) if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row;
    if (!Number.isFinite(rows[pivot][col]) || Math.abs(rows[pivot][col]) < 1e-15) throw new RangeError("VolumeRenderer: view-projection/model matrix must be invertible.");
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    const scale = rows[col][col];
    for (let j = 0; j < 8; j++) rows[col][j] /= scale;
    for (let row = 0; row < 4; row++) if (row !== col) {
      const factor = rows[row][col];
      for (let j = 0; j < 8; j++) rows[row][j] -= factor * rows[col][j];
    }
  }
  const result = new Float32Array(16);
  for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
    result[col * 4 + row] = rows[row][col + 4];
    if (!Number.isFinite(result[col * 4 + row])) throw new RangeError("VolumeRenderer: inverse matrix is not finite.");
  }
  return result;
}

function uploadVolume(gl: WebGL2RenderingContext, dimensions: VolumeDimensions, samples: Float32Array): void {
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.R32F, dimensions[0], dimensions[1], dimensions[2], 0, gl.RED, gl.FLOAT, samples);
}

function uploadTransfer(gl: WebGL2RenderingContext, domain: readonly [number, number], stops: readonly VolumeTransferStop[]): void {
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, TRANSFER_SIZE, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, buildVolumeTransferTable(domain, stops));
}

function textureParameters(gl: WebGL2RenderingContext, target: number, filter: number): void {
  gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

function bindTexture(gl: WebGL2RenderingContext, unit: number, target: number, texture: WebGLTexture): void {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(target, texture);
  gl.bindSampler(unit, null);
}

function assertNoGlError(gl: WebGL2RenderingContext, phase: string): void {
  // Small GL-shaped test doubles need not implement the error queue. Real
  // WebGL2 contexts always expose it; an existing error is reported rather than
  // incorrectly attributing it to the texture operation that follows.
  if (typeof gl.getError !== "function") return;
  const error = gl.getError();
  if (error !== gl.NO_ERROR) throw new Error(`VolumeRenderer: WebGL error 0x${error.toString(16)} ${phase}.`);
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const compile = (kind: number, source: string): WebGLShader => {
    const shader = gl.createShader(kind);
    if (!shader) throw new Error("VolumeRenderer: shader allocation failed.");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader) ?? "unknown error";
      gl.deleteShader(shader);
      throw new Error(`VolumeRenderer: shader compilation failed: ${message}`);
    }
    return shader;
  };
  const vertex = compile(gl.VERTEX_SHADER, VOLUME_VERTEX_SHADER);
  let fragment: WebGLShader | null = null;
  let program: WebGLProgram | null = null;
  try {
    fragment = compile(gl.FRAGMENT_SHADER, VOLUME_FRAGMENT_SHADER);
    program = gl.createProgram();
    if (!program) throw new Error("VolumeRenderer: program allocation failed.");
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`VolumeRenderer: program link failed: ${gl.getProgramInfoLog(program) ?? "unknown error"}`);
    return program;
  } catch (error) {
    if (program) gl.deleteProgram(program);
    throw error;
  } finally {
    gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
  }
}

interface TextureState {
  readonly active: number;
  readonly units: readonly { readonly texture2d: WebGLTexture | null; readonly texture3d: WebGLTexture | null; readonly sampler: WebGLSampler | null }[];
  readonly unpackBuffer: WebGLBuffer | null;
  readonly unpack: readonly number[];
}

function captureTextureState(gl: WebGL2RenderingContext): TextureState {
  const active = gl.getParameter(gl.ACTIVE_TEXTURE) as number;
  const units = [];
  const unpackParameters = [gl.UNPACK_ALIGNMENT, gl.UNPACK_ROW_LENGTH, gl.UNPACK_IMAGE_HEIGHT, gl.UNPACK_SKIP_PIXELS,
    gl.UNPACK_SKIP_ROWS, gl.UNPACK_SKIP_IMAGES, gl.UNPACK_FLIP_Y_WEBGL, gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, gl.UNPACK_COLORSPACE_CONVERSION_WEBGL];
  let unpack: number[] | null = null;
  let unpackBuffer: WebGLBuffer | null = null;
  let unpackCaptured = false;
  try {
    for (let i = 0; i < 3; i++) {
      gl.activeTexture(gl.TEXTURE0 + i);
      units.push({ texture2d: gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null,
        texture3d: gl.getParameter(gl.TEXTURE_BINDING_3D) as WebGLTexture | null,
        sampler: gl.getParameter(gl.SAMPLER_BINDING) as WebGLSampler | null });
    }
    unpack = unpackParameters.map((parameter) => Number(gl.getParameter(parameter)));
    unpackBuffer = gl.getParameter(gl.PIXEL_UNPACK_BUFFER_BINDING) as WebGLBuffer | null;
    unpackCaptured = true;
    gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
    unpackParameters.forEach((parameter, i) => gl.pixelStorei(parameter, i === 0 ? 1 : 0));
    return { active, units, unpackBuffer, unpack };
  } catch (error) {
    const failures: unknown[] = [error];
    try { gl.activeTexture(active); } catch (restoreError) { failures.push(restoreError); }
    if (unpackCaptured && unpack) {
      unpackParameters.forEach((parameter, i) => {
        try { gl.pixelStorei(parameter, unpack![i]); } catch (restoreError) { failures.push(restoreError); }
      });
      try { gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, unpackBuffer); } catch (restoreError) { failures.push(restoreError); }
    }
    if (failures.length > 1) throw new AggregateError(failures, "VolumeRenderer: texture state capture and restoration failed.");
    throw error;
  }
}

function restoreTextureState(gl: WebGL2RenderingContext, state: TextureState): void {
  const failures: unknown[] = [];
  for (let i = 0; i < state.units.length; i++) {
    try { gl.activeTexture(gl.TEXTURE0 + i); } catch (error) { failures.push(error); continue; }
    try { gl.bindTexture(gl.TEXTURE_2D, state.units[i].texture2d); } catch (error) { failures.push(error); }
    try { gl.bindTexture(gl.TEXTURE_3D, state.units[i].texture3d); } catch (error) { failures.push(error); }
    try { gl.bindSampler(i, state.units[i].sampler); } catch (error) { failures.push(error); }
  }
  try { gl.activeTexture(state.active); } catch (error) { failures.push(error); }
  const unpackParameters = [gl.UNPACK_ALIGNMENT, gl.UNPACK_ROW_LENGTH, gl.UNPACK_IMAGE_HEIGHT, gl.UNPACK_SKIP_PIXELS,
    gl.UNPACK_SKIP_ROWS, gl.UNPACK_SKIP_IMAGES, gl.UNPACK_FLIP_Y_WEBGL, gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, gl.UNPACK_COLORSPACE_CONVERSION_WEBGL];
  unpackParameters.forEach((parameter, i) => {
    try { gl.pixelStorei(parameter, state.unpack[i]); } catch (error) { failures.push(error); }
  });
  try { gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, state.unpackBuffer); } catch (error) { failures.push(error); }
  if (failures.length === 1) throw failures[0];
  if (failures.length) throw new AggregateError(failures, "VolumeRenderer: texture state restoration failed.");
}

function withTextureState(gl: WebGL2RenderingContext, operation: () => void): void {
  const state = captureTextureState(gl);
  try { operation(); }
  catch (error) {
    try { restoreTextureState(gl, state); }
    catch (restoreError) { throw new AggregateError([error, restoreError], "VolumeRenderer: texture operation and state restoration failed."); }
    throw error;
  }
  restoreTextureState(gl, state);
}

function withDrawState(gl: WebGL2RenderingContext, operation: () => void): void {
  const textures = captureTextureState(gl);
  const program = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null;
  const vao = gl.getParameter(gl.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject | null;
  const blend = gl.isEnabled(gl.BLEND);
  const depth = gl.isEnabled(gl.DEPTH_TEST);
  const cull = gl.isEnabled(gl.CULL_FACE);
  const depthMask = gl.getParameter(gl.DEPTH_WRITEMASK) as boolean;
  const depthFunc = gl.getParameter(gl.DEPTH_FUNC) as number;
  const colorMask = gl.getParameter(gl.COLOR_WRITEMASK) as boolean[];
  const blendSrcRgb = gl.getParameter(gl.BLEND_SRC_RGB) as number;
  const blendDstRgb = gl.getParameter(gl.BLEND_DST_RGB) as number;
  const blendSrcAlpha = gl.getParameter(gl.BLEND_SRC_ALPHA) as number;
  const blendDstAlpha = gl.getParameter(gl.BLEND_DST_ALPHA) as number;
  const blendRgb = gl.getParameter(gl.BLEND_EQUATION_RGB) as number;
  const blendAlpha = gl.getParameter(gl.BLEND_EQUATION_ALPHA) as number;
  try { operation(); } finally {
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    (blend ? gl.enable : gl.disable).call(gl, gl.BLEND);
    (depth ? gl.enable : gl.disable).call(gl, gl.DEPTH_TEST);
    (cull ? gl.enable : gl.disable).call(gl, gl.CULL_FACE);
    gl.depthMask(depthMask);
    gl.depthFunc(depthFunc);
    gl.colorMask(colorMask[0], colorMask[1], colorMask[2], colorMask[3]);
    gl.blendFuncSeparate(blendSrcRgb, blendDstRgb, blendSrcAlpha, blendDstAlpha);
    gl.blendEquationSeparate(blendRgb, blendAlpha);
    restoreTextureState(gl, textures);
  }
}

const VOLUME_VERTEX_SHADER = `#version 300 es
precision highp float;
out vec2 v_ndc;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_ndc = p * 2.0 - 1.0;
  gl_Position = vec4(v_ndc, 0.0, 1.0);
}`;

const VOLUME_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
in vec2 v_ndc;
out vec4 outColor;
uniform mat4 u_mvp;
uniform mat4 u_inverseMvp;
uniform sampler3D u_volume;
uniform sampler2D u_transfer;
uniform sampler2D u_depth;
uniform ivec3 u_dimensions;
uniform vec2 u_domain;
uniform vec2 u_depthRange;
uniform int u_hasDepth;
uniform int u_steps;
uniform float u_density;
uniform int u_planeCount;
uniform vec4 u_planes[8];
uniform int u_sliceAxis;
uniform float u_slicePosition;
uniform int u_depthMode; // 0 standard, 1 reversed, 2 logarithmic
uniform int u_clipZeroToOne;
uniform vec2 u_logRange;
uniform int u_logOrthographic;

// Logarithmic frames store ln(d / near) / ln(far / near); convert to and from
// the standard window depth of the frame's (minus-one-to-one) projection.
float logToStandardWindow(float stored) {
  float n = u_logRange.x; float f = u_logRange.y;
  float d = n * exp(stored * log(f / n));
  return u_logOrthographic != 0 ? (d - n) / (f - n) : f * (d - n) / (d * (f - n));
}
float standardWindowToLog(float window) {
  float n = u_logRange.x; float f = u_logRange.y;
  float d = u_logOrthographic != 0 ? n + window * (f - n) : f * n / max(f - window * (f - n), 1e-30);
  return clamp(log(max(d, n) / n) / log(f / n), 0.0, 1.0);
}

bool allowed(vec3 p) {
  for (int i = 0; i < 8; ++i) {
    if (i >= u_planeCount) break;
    if (dot(u_planes[i], vec4(p, 1.0)) < 0.0) return false;
  }
  return true;
}
bool intersects(vec3 origin, vec3 direction, out float first, out float last) {
  first = 0.0; last = 3e38;
  for (int axis = 0; axis < 3; ++axis) {
    if (abs(direction[axis]) < 1e-8) {
      if (origin[axis] < 0.0 || origin[axis] > 1.0) return false;
    } else {
      float a = (0.0 - origin[axis]) / direction[axis];
      float b = (1.0 - origin[axis]) / direction[axis];
      first = max(first, min(a, b));
      last = min(last, max(a, b));
    }
  }
  return last >= first;
}
// Manual trilinear filtering works for R32F without optional float-linear support.
float scalarAt(vec3 p) {
  vec3 coordinate = clamp(p, 0.0, 1.0) * vec3(u_dimensions - 1);
  ivec3 a = ivec3(floor(coordinate));
  ivec3 b = min(a + ivec3(1), u_dimensions - 1);
  vec3 t = fract(coordinate);
  float c000 = texelFetch(u_volume, ivec3(a.x,a.y,a.z), 0).r;
  float c100 = texelFetch(u_volume, ivec3(b.x,a.y,a.z), 0).r;
  float c010 = texelFetch(u_volume, ivec3(a.x,b.y,a.z), 0).r;
  float c110 = texelFetch(u_volume, ivec3(b.x,b.y,a.z), 0).r;
  float c001 = texelFetch(u_volume, ivec3(a.x,a.y,b.z), 0).r;
  float c101 = texelFetch(u_volume, ivec3(b.x,a.y,b.z), 0).r;
  float c011 = texelFetch(u_volume, ivec3(a.x,b.y,b.z), 0).r;
  float c111 = texelFetch(u_volume, ivec3(b.x,b.y,b.z), 0).r;
  return mix(mix(mix(c000,c100,t.x),mix(c010,c110,t.x),t.y),
             mix(mix(c001,c101,t.x),mix(c011,c111,t.x),t.y),t.z);
}
vec4 colorAt(vec3 p) {
  // Scaling first avoids overflow for domains spanning the finite float range.
  float scale = max(max(abs(u_domain.x), abs(u_domain.y)), 1e-30);
  float value = clamp((scalarAt(p) / scale - u_domain.x / scale) / (u_domain.y / scale - u_domain.x / scale), 0.0, 1.0);
  return texture(u_transfer, vec2((value * 255.0 + 0.5) / 256.0, 0.5));
}
void main() {
  // Near/far clip depth of the frame convention: reversed frames put the near
  // plane at +1 (or 1 in a zero-to-one clip range).
  float lowZ = u_clipZeroToOne != 0 ? 0.0 : -1.0;
  float nearZ = u_depthMode == 1 ? 1.0 : lowZ;
  float farZ = u_depthMode == 1 ? lowZ : 1.0;
  vec4 nearH = u_inverseMvp * vec4(v_ndc, nearZ, 1.0);
  vec4 middleH = u_inverseMvp * vec4(v_ndc, (nearZ + farZ) * 0.5, 1.0);
  if (nearH.w == 0.0 || middleH.w == 0.0) discard;
  vec3 origin = nearH.xyz / nearH.w;
  vec3 delta = middleH.xyz / middleH.w - origin;
  if (!all(lessThanEqual(abs(origin), vec3(3e38))) || !all(lessThanEqual(abs(delta), vec3(3e38)))) discard;
  float largest = max(abs(delta.x), max(abs(delta.y), abs(delta.z)));
  if (!(largest > 0.0)) discard;
  vec3 direction = normalize(delta / largest);
  float first, last;
  if (!intersects(origin, direction, first, last)) discard;
  float ndcLimit = farZ;
  if (u_hasDepth != 0) {
    float stored = texelFetch(u_depth, ivec2(gl_FragCoord.xy), 0).r;
    float window = u_depthMode == 2 ? logToStandardWindow(stored)
      : clamp((stored - u_depthRange.x) / (u_depthRange.y - u_depthRange.x), 0.0, 1.0);
    ndcLimit = u_clipZeroToOne != 0 ? window : window * 2.0 - 1.0;
  }
  // Samples in front of the limit satisfy z <= ndcLimit * w (standard) or
  // z >= ndcLimit * w (reversed). This clips against copied opaque depth or,
  // for clear/no depth, the true far plane without unprojecting an infinite endpoint.
  float side = u_depthMode == 1 ? -1.0 : 1.0;
  vec4 clipOrigin = u_mvp * vec4(origin, 1.0);
  vec4 clipDirection = u_mvp * vec4(direction, 0.0);
  if (!all(lessThanEqual(abs(clipOrigin), vec4(3e38))) || !all(lessThanEqual(abs(clipDirection), vec4(3e38)))) discard;
  float planeOrigin = side * (ndcLimit * clipOrigin.w - clipOrigin.z);
  float planeSlope = side * (ndcLimit * clipDirection.w - clipDirection.z);
  if (planeSlope < 0.0) last = min(last, -planeOrigin / planeSlope);
  else if (planeSlope > 0.0) first = max(first, -planeOrigin / planeSlope);
  else if (planeOrigin < 0.0) discard;
  if (last < first) discard;
  vec4 result = vec4(0.0);
  float hit = -1.0;
  if (u_sliceAxis >= 0) {
    if (abs(direction[u_sliceAxis]) < 1e-8) discard;
    float t = (u_slicePosition - origin[u_sliceAxis]) / direction[u_sliceAxis];
    if (t < first || t > last) discard;
    vec3 point = origin + direction * t;
    if (!allowed(point)) discard;
    vec4 color = colorAt(point);
    if (color.a <= 0.0 || u_density <= 0.0) discard;
    float alpha = 1.0 - pow(max(1.0 - color.a, 0.0), u_density);
    result = vec4(color.rgb * alpha, alpha);
    hit = t;
  } else {
    float stepSize = (last - first) / float(u_steps);
    if (stepSize <= 0.0 || u_density <= 0.0) discard;
    for (int i = 0; i < 512; ++i) {
      if (i >= u_steps || result.a >= 0.995) break;
      float t = first + (float(i) + 0.5) * stepSize;
      vec3 point = origin + direction * t;
      if (!allowed(point)) continue;
      vec4 color = colorAt(point);
      float alpha = 1.0 - pow(max(1.0 - color.a, 0.0), stepSize * 128.0 * u_density);
      if (alpha > 0.0 && hit < 0.0) hit = t;
      result.rgb += (1.0 - result.a) * alpha * color.rgb;
      result.a += (1.0 - result.a) * alpha;
    }
  }
  if (hit < 0.0 || result.a <= 0.0) discard;
  vec4 clip = u_mvp * vec4(origin + direction * hit, 1.0);
  float ndcDepth = u_clipZeroToOne != 0 ? clip.z / clip.w : clip.z / clip.w * 0.5 + 0.5;
  // Logarithmic programs write their encoded depth directly; others map the
  // clip depth through the active depth range.
  gl_FragDepth = u_depthMode == 2 ? standardWindowToLog(clamp(ndcDepth, 0.0, 1.0))
    : clamp(mix(u_depthRange.x, u_depthRange.y, ndcDepth), 0.0, 1.0);
  outColor = result;
}`;
