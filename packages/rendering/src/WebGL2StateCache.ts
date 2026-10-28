export interface WebGL2StateCacheDescriptor {
  readonly label: string;
  readonly backend?: "webgl2";
  readonly detail?: string;
}

export interface WebGL2StateCacheStats {
  readonly issued: number;
  readonly skipped: number;
  readonly byOperation: Readonly<Record<string, { readonly issued: number; readonly skipped: number }>>;
}

export interface WebGL2StateCacheSnapshot {
  readonly program: unknown;
  readonly vertexArray: unknown;
  readonly arrayBuffer: unknown;
  readonly elementArrayBuffer: unknown;
  readonly framebuffer: unknown;
  readonly viewport: readonly [number, number, number, number] | null;
  readonly scissor: readonly [number, number, number, number] | null;
  readonly colorMask: readonly [boolean, boolean, boolean, boolean] | null;
  readonly polygonOffset: readonly [number, number] | null;
  readonly stencilFunc: readonly [number, number, number] | null;
  readonly stencilMask: number | null;
  readonly stencilOp: readonly [number, number, number] | null;
  readonly activeTextureUnit: number | null;
  readonly depthMask: boolean | null;
  readonly depthFunc: number | null;
  readonly cullFace: number | null;
  readonly blendFunc: readonly [number, number, number, number] | null;
  readonly blendEquation: readonly [number, number] | null;
  readonly enabled: Readonly<Record<number, boolean>>;
  readonly textures: Readonly<Record<string, unknown>>;
  readonly samplers: Readonly<Record<number, unknown>>;
  readonly stats: WebGL2StateCacheStats;
}

type Operation =
  | "activeTexture"
  | "bindBuffer"
  | "bindFramebuffer"
  | "bindSampler"
  | "bindTexture"
  | "bindVertexArray"
  | "blendFunc"
  | "blendEquation"
  | "colorMask"
  | "cullFace"
  | "depthFunc"
  | "depthMask"
  | "disable"
  | "enable"
  | "polygonOffset"
  | "scissor"
  | "stencilFunc"
  | "stencilMask"
  | "stencilOp"
  | "useProgram"
  | "viewport";

interface OperationStats {
  issued: number;
  skipped: number;
}

export class WebGL2StateCache {
  readonly backend = "webgl2" as const;
  private currentProgram: unknown = UNSET;
  private currentVertexArray: unknown = UNSET;
  private currentArrayBuffer: unknown = UNSET;
  private currentElementArrayBuffer: unknown = UNSET;
  private currentFramebuffer: unknown = UNSET;
  private currentViewport: readonly [number, number, number, number] | null = null;
  private currentScissor: readonly [number, number, number, number] | null = null;
  private currentColorMask: readonly [boolean, boolean, boolean, boolean] | null = null;
  private currentPolygonOffset: readonly [number, number] | null = null;
  private currentStencilFunc: readonly [number, number, number] | null = null;
  private currentStencilMask: number | null = null;
  private currentStencilOp: readonly [number, number, number] | null = null;
  private currentActiveTextureUnit: number | null = null;
  private currentDepthMask: boolean | null = null;
  private currentDepthFunc: number | null = null;
  private currentCullFace: number | null = null;
  private currentBlendFunc: readonly [number, number, number, number] | null = null;
  private currentBlendEquation: readonly [number, number] | null = null;
  private readonly enabledCaps = new Map<number, boolean>();
  /** Texture bindings keyed by `(activeUnit + 1) * 0x10000 + target` (no per-call string key). */
  private readonly textureBindings = new Map<number, unknown>();
  /** Buffer / framebuffer targets other than ARRAY, ELEMENT_ARRAY and FRAMEBUFFER, keyed by target. */
  private readonly otherBufferBindings = new Map<number, unknown>();
  private readonly otherFramebufferBindings = new Map<number, unknown>();
  private totalIssued = 0;
  private totalSkipped = 0;
  private readonly samplerBindings = new Map<number, unknown>();
  private readonly operationStats = new Map<Operation, OperationStats>();

  constructor(readonly descriptor: WebGL2StateCacheDescriptor) {}

  /**
   * Other GL state shadows that must be forgotten together with this one (the sampler registry's active-unit and
   * per-unit texture bindings). `invalidate()` is the single entry point: every site that leaves GL state behind calls
   * it, so a dependent registered here can never survive an invalidation with stale entries.
   */
  private readonly dependents: Array<() => void> = [];

  onInvalidate(reset: () => void): void {
    this.dependents.push(reset);
  }

  invalidate(): void {
    for (const reset of this.dependents) reset();
    this.currentProgram = UNSET;
    this.currentVertexArray = UNSET;
    this.currentArrayBuffer = UNSET;
    this.currentElementArrayBuffer = UNSET;
    this.currentFramebuffer = UNSET;
    this.currentViewport = null;
    this.currentScissor = null;
    this.currentColorMask = null;
    this.currentPolygonOffset = null;
    this.currentStencilFunc = null;
    this.currentStencilMask = null;
    this.currentStencilOp = null;
    this.currentActiveTextureUnit = null;
    this.currentDepthMask = null;
    this.currentDepthFunc = null;
    this.currentCullFace = null;
    this.currentBlendFunc = null;
    this.currentBlendEquation = null;
    this.enabledCaps.clear();
    this.textureBindings.clear();
    this.otherBufferBindings.clear();
    this.otherFramebufferBindings.clear();
    this.samplerBindings.clear();
  }

  resetStats(): void {
    this.operationStats.clear();
    this.totalIssued = 0;
    this.totalSkipped = 0;
  }

  useProgram(program: unknown, apply: () => void): boolean {
    if (this.currentProgram === program) return this.skip("useProgram");
    this.currentProgram = program;
    return this.issue("useProgram", apply);
  }

  bindBuffer(target: number, buffer: unknown, apply: () => void): boolean {
    if (target === ARRAY_BUFFER_TARGET) {
      if (this.currentArrayBuffer === buffer) return this.skip("bindBuffer");
      this.currentArrayBuffer = buffer;
    } else if (target === ELEMENT_ARRAY_BUFFER_TARGET) {
      if (this.currentElementArrayBuffer === buffer) return this.skip("bindBuffer");
      this.currentElementArrayBuffer = buffer;
    } else {
      if (this.otherBufferBindings.get(target) === buffer) return this.skip("bindBuffer");
      this.otherBufferBindings.set(target, buffer);
    }
    return this.issue("bindBuffer", apply);
  }

  bindFramebuffer(target: number, framebuffer: unknown, apply: () => void): boolean {
    if (target === FRAMEBUFFER_TARGET) {
      if (this.currentFramebuffer === framebuffer) return this.skip("bindFramebuffer");
      this.currentFramebuffer = framebuffer;
    } else if (this.otherFramebufferBindings.get(target) === framebuffer) {
      return this.skip("bindFramebuffer");
    } else {
      this.otherFramebufferBindings.set(target, framebuffer);
    }
    return this.issue("bindFramebuffer", apply);
  }

  bindVertexArray(vertexArray: unknown, apply: () => void): boolean {
    if (this.currentVertexArray === vertexArray) return this.skip("bindVertexArray");
    this.currentVertexArray = vertexArray;
    this.currentElementArrayBuffer = UNSET;
    return this.issue("bindVertexArray", apply);
  }

  viewport(x: number, y: number, width: number, height: number, apply: () => void): boolean {
    const current = this.currentViewport;
    if (current && current[0] === x && current[1] === y && current[2] === width && current[3] === height) return this.skip("viewport");
    this.currentViewport = [x, y, width, height];
    return this.issue("viewport", apply);
  }

  scissor(x: number, y: number, width: number, height: number, apply: () => void): boolean {
    const current = this.currentScissor;
    if (current && current[0] === x && current[1] === y && current[2] === width && current[3] === height) return this.skip("scissor");
    this.currentScissor = [x, y, width, height];
    return this.issue("scissor", apply);
  }

  colorMask(red: boolean, green: boolean, blue: boolean, alpha: boolean, apply: () => void): boolean {
    const current = this.currentColorMask;
    if (current && current[0] === red && current[1] === green && current[2] === blue && current[3] === alpha) return this.skip("colorMask");
    this.currentColorMask = [red, green, blue, alpha];
    return this.issue("colorMask", apply);
  }

  polygonOffset(factor: number, units: number, apply: () => void): boolean {
    if (this.currentPolygonOffset && this.currentPolygonOffset[0] === factor && this.currentPolygonOffset[1] === units) return this.skip("polygonOffset");
    this.currentPolygonOffset = [factor, units];
    return this.issue("polygonOffset", apply);
  }

  stencilFunc(func: number, reference: number, mask: number, apply: () => void): boolean {
    const current = this.currentStencilFunc;
    if (current && current[0] === func && current[1] === reference && current[2] === mask) return this.skip("stencilFunc");
    this.currentStencilFunc = [func, reference, mask];
    return this.issue("stencilFunc", apply);
  }

  stencilMask(mask: number, apply: () => void): boolean {
    if (this.currentStencilMask === mask) return this.skip("stencilMask");
    this.currentStencilMask = mask;
    return this.issue("stencilMask", apply);
  }

  stencilOp(fail: number, depthFail: number, depthPass: number, apply: () => void): boolean {
    const current = this.currentStencilOp;
    if (current && current[0] === fail && current[1] === depthFail && current[2] === depthPass) return this.skip("stencilOp");
    this.currentStencilOp = [fail, depthFail, depthPass];
    return this.issue("stencilOp", apply);
  }

  setEnabled(capability: number, enabled: boolean, apply: () => void): boolean {
    if (this.enabledCaps.get(capability) === enabled) return this.skip(enabled ? "enable" : "disable");
    this.enabledCaps.set(capability, enabled);
    return this.issue(enabled ? "enable" : "disable", apply);
  }

  depthMask(flag: boolean, apply: () => void): boolean {
    if (this.currentDepthMask === flag) return this.skip("depthMask");
    this.currentDepthMask = flag;
    return this.issue("depthMask", apply);
  }

  depthFunc(func: number, apply: () => void): boolean {
    if (this.currentDepthFunc === func) return this.skip("depthFunc");
    this.currentDepthFunc = func;
    return this.issue("depthFunc", apply);
  }

  cullFace(mode: number, apply: () => void): boolean {
    if (this.currentCullFace === mode) return this.skip("cullFace");
    this.currentCullFace = mode;
    return this.issue("cullFace", apply);
  }

  /** gl.blendFunc(src, dst) — identical factors for color and alpha. */
  blendFunc(src: number, dst: number, apply: () => void): boolean {
    const current = this.currentBlendFunc;
    if (current && current[0] === src && current[1] === dst && current[2] === src && current[3] === dst) return this.skip("blendFunc");
    this.currentBlendFunc = [src, dst, src, dst];
    return this.issue("blendFunc", apply);
  }

  /** gl.blendFuncSeparate(srcRGB, dstRGB, srcAlpha, dstAlpha) — C-04 dedupe. */
  blendFuncSeparate(srcRgb: number, dstRgb: number, srcAlpha: number, dstAlpha: number, apply: () => void): boolean {
    const current = this.currentBlendFunc;
    if (current && current[0] === srcRgb && current[1] === dstRgb && current[2] === srcAlpha && current[3] === dstAlpha) return this.skip("blendFunc");
    this.currentBlendFunc = [srcRgb, dstRgb, srcAlpha, dstAlpha];
    return this.issue("blendFunc", apply);
  }

  /** gl.blendEquationSeparate(modeRGB, modeAlpha) — C-04 dedupe. */
  blendEquation(modeRgb: number, modeAlpha: number, apply: () => void): boolean {
    if (this.currentBlendEquation && this.currentBlendEquation[0] === modeRgb && this.currentBlendEquation[1] === modeAlpha) return this.skip("blendEquation");
    this.currentBlendEquation = [modeRgb, modeAlpha];
    return this.issue("blendEquation", apply);
  }

  /**
   * C-04: true when the cache tracked a blend equation that differs from
   * (modeRgb, modeAlpha). Unknown (never-applied) state reads as `false`, so
   * the legacy blend path never emits blendEquationSeparate on a fresh context
   * where the equation is already FUNC_ADD.
   */
  blendEquationDiffers(modeRgb: number, modeAlpha: number): boolean {
    return this.currentBlendEquation !== null && (this.currentBlendEquation[0] !== modeRgb || this.currentBlendEquation[1] !== modeAlpha);
  }



  activeTexture(unit: number, apply: () => void): boolean {
    if (this.currentActiveTextureUnit === unit) return this.skip("activeTexture");
    this.currentActiveTextureUnit = unit;
    return this.issue("activeTexture", apply);
  }

  bindTexture(target: number, texture: unknown, apply: () => void): boolean {
    const key = ((this.currentActiveTextureUnit ?? -1) + 1) * 0x10000 + target;
    if (this.textureBindings.get(key) === texture) return this.skip("bindTexture");
    this.textureBindings.set(key, texture);
    return this.issue("bindTexture", apply);
  }

  bindSampler(textureUnit: number, sampler: unknown, apply: () => void): boolean {
    if (this.samplerBindings.get(textureUnit) === sampler) return this.skip("bindSampler");
    this.samplerBindings.set(textureUnit, sampler);
    return this.issue("bindSampler", apply);
  }

  snapshot(): WebGL2StateCacheSnapshot {
    return {
      program: this.currentProgram === UNSET ? null : this.currentProgram,
      vertexArray: this.currentVertexArray === UNSET ? null : this.currentVertexArray,
      arrayBuffer: this.currentArrayBuffer === UNSET ? null : this.currentArrayBuffer,
      elementArrayBuffer: this.currentElementArrayBuffer === UNSET ? null : this.currentElementArrayBuffer,
      framebuffer: this.currentFramebuffer === UNSET ? null : this.currentFramebuffer,
      viewport: this.currentViewport,
      scissor: this.currentScissor,
      colorMask: this.currentColorMask,
      polygonOffset: this.currentPolygonOffset,
      stencilFunc: this.currentStencilFunc,
      stencilMask: this.currentStencilMask,
      stencilOp: this.currentStencilOp,
      activeTextureUnit: this.currentActiveTextureUnit,
      depthMask: this.currentDepthMask,
      depthFunc: this.currentDepthFunc,
      cullFace: this.currentCullFace,
      blendFunc: this.currentBlendFunc,
      blendEquation: this.currentBlendEquation,
      enabled: Object.fromEntries(this.enabledCaps.entries()),
      textures: this.textureSnapshot(),
      samplers: Object.fromEntries(this.samplerBindings.entries()),
      stats: this.stats()
    };
  }

  /** Texture/buffer/framebuffer binding shadow in the string-keyed shape the snapshot has always had. */
  private textureSnapshot(): Readonly<Record<string, unknown>> {
    const out: Record<string, unknown> = {};
    for (const [key, texture] of this.textureBindings) out[`${Math.floor(key / 0x10000) - 1}:${key % 0x10000}`] = texture;
    for (const [target, buffer] of this.otherBufferBindings) out[`buffer:${target}`] = buffer;
    for (const [target, framebuffer] of this.otherFramebufferBindings) out[`framebuffer:${target}`] = framebuffer;
    return out;
  }

  /** Total issued/skipped calls, without building the per-operation record `stats()` returns. */
  totals(): { readonly issued: number; readonly skipped: number } {
    return { issued: this.totalIssued, skipped: this.totalSkipped };
  }

  /** Issued count for one operation (0 if never seen), without allocating. */
  issuedCount(operation: string): number {
    return this.operationStats.get(operation as Operation)?.issued ?? 0;
  }

  stats(): WebGL2StateCacheStats {
    let issued = 0;
    let skipped = 0;
    const byOperation: Record<string, OperationStats> = {};
    for (const [operation, stats] of this.operationStats) {
      issued += stats.issued;
      skipped += stats.skipped;
      byOperation[operation] = { ...stats };
    }
    return { issued, skipped, byOperation };
  }

  private issue(operation: Operation, apply: () => void): true {
    this.statsFor(operation).issued += 1;
    this.totalIssued += 1;
    apply();
    return true;
  }

  private skip(operation: Operation): false {
    this.statsFor(operation).skipped += 1;
    this.totalSkipped += 1;
    return false;
  }

  private statsFor(operation: Operation): OperationStats {
    let stats = this.operationStats.get(operation);
    if (!stats) {
      stats = { issued: 0, skipped: 0 };
      this.operationStats.set(operation, stats);
    }
    return stats;
  }
}

const UNSET = Symbol("unset-webgl-state");
const ARRAY_BUFFER_TARGET = 0x8892;
const ELEMENT_ARRAY_BUFFER_TARGET = 0x8893;
const FRAMEBUFFER_TARGET = 0x8d40;
