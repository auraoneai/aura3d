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
  readonly blendFunc: readonly [number, number] | null;
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
  private currentBlendFunc: readonly [number, number] | null = null;
  private readonly enabledCaps = new Map<number, boolean>();
  private readonly textureBindings = new Map<string, unknown>();
  private readonly samplerBindings = new Map<number, unknown>();
  private readonly operationStats = new Map<Operation, OperationStats>();

  constructor(readonly descriptor: WebGL2StateCacheDescriptor) {}

  invalidate(): void {
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
    this.enabledCaps.clear();
    this.textureBindings.clear();
    this.samplerBindings.clear();
  }

  resetStats(): void {
    this.operationStats.clear();
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
      const key = `buffer:${target}`;
      if (this.textureBindings.get(key) === buffer) return this.skip("bindBuffer");
      this.textureBindings.set(key, buffer);
    }
    return this.issue("bindBuffer", apply);
  }

  bindFramebuffer(target: number, framebuffer: unknown, apply: () => void): boolean {
    const key = `framebuffer:${target}`;
    if (target === FRAMEBUFFER_TARGET) {
      if (this.currentFramebuffer === framebuffer) return this.skip("bindFramebuffer");
      this.currentFramebuffer = framebuffer;
    } else if (this.textureBindings.get(key) === framebuffer) {
      return this.skip("bindFramebuffer");
    } else {
      this.textureBindings.set(key, framebuffer);
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
    const next = [x, y, width, height] as const;
    if (this.currentViewport && tuple4Equals(this.currentViewport, next)) return this.skip("viewport");
    this.currentViewport = next;
    return this.issue("viewport", apply);
  }

  scissor(x: number, y: number, width: number, height: number, apply: () => void): boolean {
    const next = [x, y, width, height] as const;
    if (this.currentScissor && tuple4Equals(this.currentScissor, next)) return this.skip("scissor");
    this.currentScissor = next;
    return this.issue("scissor", apply);
  }

  colorMask(red: boolean, green: boolean, blue: boolean, alpha: boolean, apply: () => void): boolean {
    const next = [red, green, blue, alpha] as const;
    if (this.currentColorMask && boolTuple4Equals(this.currentColorMask, next)) return this.skip("colorMask");
    this.currentColorMask = next;
    return this.issue("colorMask", apply);
  }

  polygonOffset(factor: number, units: number, apply: () => void): boolean {
    const next = [factor, units] as const;
    if (this.currentPolygonOffset && this.currentPolygonOffset[0] === factor && this.currentPolygonOffset[1] === units) return this.skip("polygonOffset");
    this.currentPolygonOffset = next;
    return this.issue("polygonOffset", apply);
  }

  stencilFunc(func: number, reference: number, mask: number, apply: () => void): boolean {
    const next = [func, reference, mask] as const;
    if (this.currentStencilFunc && tuple3Equals(this.currentStencilFunc, next)) return this.skip("stencilFunc");
    this.currentStencilFunc = next;
    return this.issue("stencilFunc", apply);
  }

  stencilMask(mask: number, apply: () => void): boolean {
    if (this.currentStencilMask === mask) return this.skip("stencilMask");
    this.currentStencilMask = mask;
    return this.issue("stencilMask", apply);
  }

  stencilOp(fail: number, depthFail: number, depthPass: number, apply: () => void): boolean {
    const next = [fail, depthFail, depthPass] as const;
    if (this.currentStencilOp && tuple3Equals(this.currentStencilOp, next)) return this.skip("stencilOp");
    this.currentStencilOp = next;
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

  blendFunc(src: number, dst: number, apply: () => void): boolean {
    const next = [src, dst] as const;
    if (this.currentBlendFunc && this.currentBlendFunc[0] === src && this.currentBlendFunc[1] === dst) return this.skip("blendFunc");
    this.currentBlendFunc = next;
    return this.issue("blendFunc", apply);
  }

  activeTexture(unit: number, apply: () => void): boolean {
    if (this.currentActiveTextureUnit === unit) return this.skip("activeTexture");
    this.currentActiveTextureUnit = unit;
    return this.issue("activeTexture", apply);
  }

  bindTexture(target: number, texture: unknown, apply: () => void): boolean {
    const key = `${this.currentActiveTextureUnit ?? -1}:${target}`;
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
      enabled: Object.fromEntries(this.enabledCaps.entries()),
      textures: Object.fromEntries(this.textureBindings.entries()),
      samplers: Object.fromEntries(this.samplerBindings.entries()),
      stats: this.stats()
    };
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
    apply();
    return true;
  }

  private skip(operation: Operation): false {
    this.statsFor(operation).skipped += 1;
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

function tuple4Equals(left: readonly [number, number, number, number], right: readonly [number, number, number, number]): boolean {
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2] && left[3] === right[3];
}

function tuple3Equals(left: readonly [number, number, number], right: readonly [number, number, number]): boolean {
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2];
}

function boolTuple4Equals(left: readonly [boolean, boolean, boolean, boolean], right: readonly [boolean, boolean, boolean, boolean]): boolean {
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2] && left[3] === right[3];
}
