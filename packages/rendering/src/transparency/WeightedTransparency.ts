import { Geometry } from "../Geometry";
import { DEFAULT_RENDER_STATE, type RenderState } from "../Material";
import type { RenderCommandState, RenderDevice, RenderTarget, UniformValue } from "../RenderDevice";
import { RenderPipeline } from "../RenderPipeline";
import { Sampler } from "../Sampler";
import { ShaderModule } from "../ShaderModule";
import { Texture } from "../Texture";
import { TextureBinding } from "../TextureBinding";
import { VertexBuffer } from "../VertexBuffer";
import { VertexFormat } from "../VertexFormat";

/** Weighted blended transparency approximates intersecting surfaces. It is not
 * refraction, and cannot reproduce an explicit ordering or arbitrary blends. */
export type WeightedTransparencyPhase = "accumulation" | "revealage";
export type WeightedTransparencyViewId = string | number | object;
export type WeightedTransparencyDepth = "standard" | "reversed" | "logarithmic";
export interface WeightedTransparencyRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface WeightedTransparencyView extends WeightedTransparencyRect { readonly scissor?: WeightedTransparencyRect | null }

/** Each flag must describe the complete active path, not just format allocation. */
export interface WeightedTransparencySupport {
  /** RGBA16F render attachments, sampling and additive/multiplicative blending. */
  readonly floatBlend: boolean;
  /** The opaque depth attachment can be sampled in the geometry shader. */
  readonly depthTexture: boolean;
  /** Every submitted material has both weighted output variants on this device. */
  readonly shaderVariants: boolean;
}

export interface WeightedTransparencyBindings {
  /** Merge into each material's state, retaining its cull, winding and scissor. */
  readonly state: Pick<RenderState, "blend" | "blendMode" | "depthTest" | "depthWrite" | "alphaToCoverage" | "colorWrite">;
  readonly depth: TextureBinding;
  readonly depthOrigin: readonly [number, number];
  readonly reversedDepth: 0 | 1;
}

export interface WeightedTransparencyRequest<T> {
  readonly viewId: WeightedTransparencyViewId;
  /** Full attachment size in pixels; the optional view uses the same coordinates. */
  readonly width: number;
  readonly height: number;
  readonly view?: WeightedTransparencyView;
  /** Current scene target to composite into; null means the default framebuffer. */
  readonly sceneTarget: RenderTarget | null;
  /** Resolved, sampleable opaque depth from the same view and attachment size. */
  readonly opaqueDepth: Texture | null;
  readonly depthConvention: WeightedTransparencyDepth;
  readonly sampleCount: number;
  /** Conservative upper bound on fragments reaching one pixel across the group.
   * The total submitted primitive count is a safe (though loose) bound for
   * single-sample triangles, lines, and points. */
  readonly maxFragmentsPerPixel: number;
  /** Bump when the underlying device/context is recreated. */
  readonly deviceGeneration?: string | number;
  readonly support: WeightedTransparencySupport;
  readonly items: readonly T[];
  /** Set for transmission, non-alpha/custom blend, depth writes, stencil,
   * polygon offset, color masks, explicit ordering, or any other state whose
   * semantics would change. Fallback covers the whole group to preserve order. */
  readonly ineligibleReason?: string;
  /** Submits each item using the requested program variant and bindings.
   * The class has already bound the target. Color input must be linear scene
   * light. Set u_a3dTransparencyInputPremultiplied per shader output. */
  readonly drawWeighted: (phase: WeightedTransparencyPhase, items: readonly T[], bindings: WeightedTransparencyBindings) => void;
  /** Draw the entire group in the renderer's normal stable sorted order. */
  readonly drawSorted: (items: readonly T[], reason: string) => void;
}

export type WeightedTransparencyResult =
  | { readonly mode: "weighted"; readonly accumulation: RenderTarget; readonly revealage: RenderTarget }
  | { readonly mode: "sorted"; readonly reason: string };

const NEAREST = new Sampler({ minFilter: "nearest", magFilter: "nearest" });
const ADDITIVE = {
  kind: "custom" as const,
  color: { equation: "add" as const, src: "one" as const, dst: "one" as const },
  alpha: { equation: "add" as const, src: "one" as const, dst: "one" as const }
};
const REVEALAGE = {
  kind: "custom" as const,
  color: { equation: "add" as const, src: "zero" as const, dst: "one-minus-src-alpha" as const },
  alpha: { equation: "add" as const, src: "zero" as const, dst: "one-minus-src-alpha" as const }
};

/** Preserve culling, winding, and clipping state from the item's own pipeline. */
export function weightedTransparencyState(phase: WeightedTransparencyPhase): WeightedTransparencyBindings["state"] {
  return { blend: true, blendMode: phase === "accumulation" ? ADDITIVE : REVEALAGE,
    depthTest: false, depthWrite: false, alphaToCoverage: false, colorWrite: [true, true, true, true] };
}

/** Check each item before drawing; never split an incompatible group around OIT. */
export function weightedTransparencyIneligibility(
  state: RenderCommandState,
  options: { readonly transmission?: boolean; readonly renderOrder?: number; readonly depthConvention: WeightedTransparencyDepth }
): string | undefined {
  if (options.transmission) return "refractive transmission requires sorted rendering";
  if ((options.renderOrder ?? 0) !== 0) return "explicit render order requires sorted rendering";
  const blend = state.blendMode ?? (state.blend ? "alpha" : "opaque");
  if (blend !== "alpha" && blend !== "premultiplied") return "blend mode is not weighted alpha";
  if (!state.depthTest || state.depthWrite) return "weighted transparency requires read-only opaque depth testing";
  if (state.alphaToCoverage) return "alpha-to-coverage requires sorted rendering";
  if (state.stencil || state.polygonOffset) return "stencil and polygon offset require sorted rendering";
  if (state.colorWrite && !state.colorWrite.every(Boolean)) return "partial color writes require sorted rendering";
  const compare = state.depthCompareV2 ?? state.depthCompare;
  if (options.depthConvention === "logarithmic" || compare !== (options.depthConvention === "reversed" ? "greater-equal" : "less-equal")) return "depth comparison is incompatible with weighted transparency";
  return undefined;
}

/** Deliberately bounded weight: standard depth 0 is near, 1 is far. */
export function weightedTransparencyWeight(depth: number, convention: "standard" | "reversed" = "standard"): number {
  if (!Number.isFinite(depth) || depth < 0 || depth > 1) throw new RangeError("Transparency depth must be in [0, 1].");
  if (convention !== "standard" && convention !== "reversed") throw new RangeError("Unknown transparency depth convention.");
  const nearDepth = convention === "reversed" ? 1 - depth : depth;
  return 0.25 + 0.75 * (1 - nearDepth) ** 3;
}

export interface WeightedTransparencyAccumulator { readonly color: readonly [number, number, number]; readonly alpha: number; readonly revealage: number }
export interface WeightedTransparencyFragment { readonly color: readonly [number, number, number]; readonly alpha: number; readonly depth: number; readonly opaqueDepth?: number; readonly premultiplied?: boolean }

/** CPU reference for the shader arithmetic; input/output colors are linear. */
export function accumulateWeightedTransparency(fragments: readonly WeightedTransparencyFragment[], convention: "standard" | "reversed" = "standard"): WeightedTransparencyAccumulator {
  let r = 0, g = 0, b = 0, alpha = 0, revealage = 1;
  for (const fragment of fragments) {
    if (!Number.isFinite(fragment.alpha) || !fragment.color.every(Number.isFinite)) throw new RangeError("Transparency color and alpha must be finite.");
    const a = Math.max(0, Math.min(1, fragment.alpha));
    const weight = weightedTransparencyWeight(fragment.depth, convention);
    if (fragment.opaqueDepth !== undefined) {
      if (!Number.isFinite(fragment.opaqueDepth) || fragment.opaqueDepth < 0 || fragment.opaqueDepth > 1) throw new RangeError("Opaque depth must be in [0, 1].");
      if (convention === "reversed" ? fragment.depth < fragment.opaqueDepth : fragment.depth > fragment.opaqueDepth) continue;
    }
    const straight = (c: number): number => Math.max(-32, Math.min(32, fragment.premultiplied && a > 0 ? c / a : c));
    r += straight(fragment.color[0]) * a * weight;
    g += straight(fragment.color[1]) * a * weight;
    b += straight(fragment.color[2]) * a * weight;
    alpha += a * weight;
    revealage *= 1 - a;
  }
  return { color: [r, g, b], alpha, revealage };
}

/** Premultiplied source that is composited over the existing scene. */
export function resolveWeightedTransparency(accum: WeightedTransparencyAccumulator): readonly [number, number, number, number] {
  if (![...accum.color, accum.alpha, accum.revealage].every(Number.isFinite) || accum.alpha < 0) throw new RangeError("Invalid weighted accumulation.");
  const opacity = 1 - Math.max(0, Math.min(1, accum.revealage));
  if (accum.alpha === 0 || opacity <= 0) return [0, 0, 0, 0];
  return [accum.color[0] / accum.alpha * opacity, accum.color[1] / accum.alpha * opacity, accum.color[2] / accum.alpha * opacity, opacity];
}

const VERTEX = `#version 300 es
// a3d-weighted-transparency
layout(location=0) in vec3 a_position;
void main() { gl_Position = vec4(a_position, 1.0); }`;
const CLEAR_FRAGMENT = `#version 300 es
// a3d-weighted-transparency
precision highp float;
uniform vec4 u_clear;
out vec4 outColor;
void main() { outColor = u_clear; }`;
const COMPOSITE_FRAGMENT = `#version 300 es
// a3d-weighted-transparency
precision highp float;
uniform sampler2D u_accumulation;
uniform sampler2D u_revealage;
uniform vec2 u_inverseSize;
out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy * u_inverseSize;
  vec4 sum = texture(u_accumulation, uv);
  float opacity = 1.0 - clamp(texture(u_revealage, uv).r, 0.0, 1.0);
  outColor = sum.a > 0.0 ? vec4((sum.rgb / sum.a) * opacity, opacity) : vec4(0.0);
}`;
const WGSL_VERTEX = `// a3d-weighted-transparency
/* @aura3d-bindings */
@vertex fn main(@location(0) position: vec3<f32>) -> @builtin(position) vec4<f32> { return vec4<f32>(position, 1.0); }`;
const WGSL_CLEAR = `// a3d-weighted-transparency
/* @aura3d-bindings */
@fragment fn main() -> @location(0) vec4<f32> { return aura.u_clear; }`;
const WGSL_COMPOSITE = `// a3d-weighted-transparency
/* @aura3d-bindings */
@fragment fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let uv = position.xy * aura.u_inverseSize;
  let sum = textureSampleLevel(u_accumulationTexture, u_accumulationSampler, uv, 0.0);
  let opacity = 1.0 - clamp(textureSampleLevel(u_revealageTexture, u_revealageSampler, uv, 0.0).r, 0.0, 1.0);
  if (sum.a <= 0.0) { return vec4<f32>(0.0); }
  return vec4<f32>((sum.rgb / sum.a) * opacity, opacity);
}`;

interface Targets { readonly width: number; readonly height: number; readonly generation: string | number | undefined; readonly accumulation: RenderTarget; readonly revealage: RenderTarget }

/** Per-device resources, explicitly keyed by view and retired on resize/loss. */
export class WeightedTransparency {
  private readonly views = new Map<WeightedTransparencyViewId, Targets>();
  private readonly clearModule = new ShaderModule({ label: "weighted-transparency-clear", marker: "a3d-weighted-transparency", vertex: VERTEX, fragment: CLEAR_FRAGMENT,
    portableBindings: [{ name: "u_clear", kind: "vec4" }], webgpu: { vertex: WGSL_VERTEX, fragment: WGSL_CLEAR } });
  private readonly compositeModule = new ShaderModule({ label: "weighted-transparency-composite", marker: "a3d-weighted-transparency", vertex: VERTEX, fragment: COMPOSITE_FRAGMENT,
    portableBindings: [{ name: "u_inverseSize", kind: "vec2" }, { name: "u_accumulation", kind: "texture2d" }, { name: "u_revealage", kind: "texture2d" }],
    webgpu: { vertex: WGSL_VERTEX, fragment: WGSL_COMPOSITE } });
  private geometry?: Geometry;
  private clearPipeline?: RenderPipeline;
  private compositePipeline?: RenderPipeline;
  private observedGeneration?: string | number;
  private generationObserved = false;
  private executing = false;
  public disposed = false;

  constructor(private readonly device: RenderDevice) {}

  /** Prepare owned targets and fullscreen programs before changing frame ordering. */
  prepare(viewId: WeightedTransparencyViewId, width: number, height: number, generation?: string | number): boolean {
    if (this.disposed || this.executing || this.device.disposed || this.device.contextLost
      || !Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1) return false;
    try {
      if (this.generationObserved && generation !== this.observedGeneration) {
        this.releaseAllViews();
        this.releaseDrawResources();
      }
      this.observedGeneration = generation;
      this.generationObserved = true;
      this.ensureTargets(viewId, width, height, generation);
      this.ensurePipelines();
      return !this.device.disposed && !this.device.contextLost;
    } catch {
      this.releaseView(viewId);
      return false;
    }
  }

  execute<T>(request: WeightedTransparencyRequest<T>): WeightedTransparencyResult {
    if (this.disposed) throw new Error("Weighted transparency is disposed.");
    if (this.executing) throw new Error("Weighted transparency execution is already active.");
    validateRequest(request);
    const device = this.device;
    if (device.contextLost || device.disposed) {
      this.releaseAllViews();
      this.releaseDrawResources();
      this.generationObserved = false;
      throw new Error("Weighted transparency device is unavailable.");
    }
    const previous = device.getRenderTarget?.();
    const reason = fallbackReason(request, device, previous);
    if (reason) {
      request.drawSorted(request.items, reason);
      return { mode: "sorted", reason };
    }
    if (this.generationObserved && request.deviceGeneration !== this.observedGeneration) {
      this.releaseAllViews();
      this.releaseDrawResources();
    }
    this.observedGeneration = request.deviceGeneration;
    this.generationObserved = true;
    let targets: Targets;
    try {
      targets = this.ensureTargets(request.viewId, request.width, request.height, request.deviceGeneration);
      this.ensurePipelines();
    } catch (error) {
      this.releaseView(request.viewId);
      if (device.contextLost || device.disposed) throw error;
      device.setRenderTarget(request.sceneTarget);
      this.setView(request.view ?? { x: 0, y: 0, width: request.width, height: request.height });
      const cause = error instanceof Error ? error.message : String(error);
      const why = `weighted target or pipeline unavailable: ${cause}`;
      request.drawSorted(request.items, why);
      return { mode: "sorted", reason: why };
    }
    const view = request.view ?? { x: 0, y: 0, width: request.width, height: request.height };
    const depth = new TextureBinding({ name: "u_a3dOpaqueDepth", texture: request.opaqueDepth!, sampler: NEAREST, required: true });
    this.executing = true;
    try {
      for (const phase of ["accumulation", "revealage"] as const) {
        const target = targets[phase];
        device.setRenderTarget(target);
        // A draw, rather than gl.clear*, makes initialization independent of
        // inherited color masks and clears only this owned color attachment.
        this.setView({ x: 0, y: 0, width: request.width, height: request.height, scissor: null });
        this.drawFullscreen(this.clearPipeline!, new Map([["u_clear", phase === "accumulation" ? [0, 0, 0, 0] : [1, 1, 1, 1]]]));
        this.setView(view);
        request.drawWeighted(phase, request.items, { state: weightedTransparencyState(phase), depth, depthOrigin: [0, 0], reversedDepth: request.depthConvention === "reversed" ? 1 : 0 });
        if (device.getRenderTarget!() !== target) throw new Error("Weighted draw callback changed the render target.");
      }
      device.setRenderTarget(request.sceneTarget);
      this.setView(view);
      const uniforms = new Map<string, UniformValue>([
        ["u_inverseSize", [1 / request.width, 1 / request.height]],
        ["u_accumulation", new TextureBinding({ name: "u_accumulation", texture: targets.accumulation.colorTexture, sampler: NEAREST, required: true })],
        ["u_revealage", new TextureBinding({ name: "u_revealage", texture: targets.revealage.colorTexture, sampler: NEAREST, required: true })]
      ]);
      this.drawFullscreen(this.compositePipeline!, uniforms);
    } finally {
      this.executing = false;
      if (!device.disposed && !device.contextLost) {
        device.setRenderTarget(request.sceneTarget);
        this.setView(view);
      } else {
        this.releaseAllViews();
        this.releaseDrawResources();
        this.generationObserved = false;
      }
    }
    return { mode: "weighted", accumulation: targets.accumulation, revealage: targets.revealage };
  }

  releaseView(viewId: WeightedTransparencyViewId): void {
    if (this.executing) throw new Error("Cannot release a view during weighted transparency execution.");
    const current = this.views.get(viewId);
    if (!current) return;
    this.views.delete(viewId);
    current.accumulation.dispose();
    current.revealage.dispose();
  }

  releaseAllViews(): void { for (const key of this.views.keys()) this.releaseView(key); }

  dispose(): void {
    if (this.disposed) return;
    if (this.executing) throw new Error("Cannot dispose weighted transparency during execution.");
    this.disposed = true;
    this.releaseAllViews();
    this.releaseDrawResources();
  }

  private ensureTargets(viewId: WeightedTransparencyViewId, width: number, height: number, generation: string | number | undefined): Targets {
    const current = this.views.get(viewId);
    if (current && !current.accumulation.disposed && !current.revealage.disposed && current.width === width && current.height === height && current.generation === generation) return current;
    let accumulation: RenderTarget | undefined;
    let revealage: RenderTarget | undefined;
    try {
      accumulation = this.device.createRenderTarget({ width, height, label: "scene-weighted-transparency-accumulation", format: "rgba16f", depth: false, sampleCount: 1 });
      revealage = this.device.createRenderTarget({ width, height, label: "scene-weighted-transparency-revealage", format: "rgba16f", depth: false, sampleCount: 1 });
    } catch (error) {
      accumulation?.dispose();
      revealage?.dispose();
      throw error;
    }
    this.releaseView(viewId);
    const targets = { width, height, generation, accumulation, revealage };
    this.views.set(viewId, targets);
    return targets;
  }

  private ensurePipelines(): void {
    if (!this.geometry) {
      const vertices = new VertexBuffer(VertexFormat.P3, 3);
      vertices.setAttribute(0, "position", [-1, -1, 0]);
      vertices.setAttribute(1, "position", [3, -1, 0]);
      vertices.setAttribute(2, "position", [-1, 3, 0]);
      this.geometry = new Geometry(vertices, null, "triangles", { min: [-1, -1, 0], max: [3, 3, 0] });
    }
    const clearShader = this.clearModule.compile(this.device);
    const compositeShader = this.compositeModule.compile(this.device);
    const state = { ...DEFAULT_RENDER_STATE, depthTest: false, depthWrite: false, cullMode: "none" as const, blend: false, scissor: null, stencil: null, polygonOffset: null };
    if (!this.clearPipeline || this.clearPipeline.shader !== clearShader) {
      this.clearPipeline?.dispose();
      this.clearPipeline = new RenderPipeline({ label: "weighted-transparency-clear", shader: clearShader, vertexFormat: this.geometry.vertexBuffer.format, renderState: state });
    }
    if (!this.compositePipeline || this.compositePipeline.shader !== compositeShader) {
      this.compositePipeline?.dispose();
      this.compositePipeline = new RenderPipeline({ label: "weighted-transparency-composite", shader: compositeShader, vertexFormat: this.geometry.vertexBuffer.format,
        renderState: { ...state, blend: true, blendMode: "premultiplied" } });
    }
  }

  private drawFullscreen(pipeline: RenderPipeline, uniforms: ReadonlyMap<string, UniformValue>): void {
    const geometry = this.geometry!;
    this.device.draw(pipeline.createDrawCommand({ vertexBuffer: geometry.vertexBuffer.upload(this.device), vertexCount: 3, uniforms }));
  }

  private setView(view: WeightedTransparencyView): void {
    this.device.setViewport!(view.x, view.y, view.width, view.height);
    if (view.scissor) {
      this.device.setScissor!(view.scissor.x, view.scissor.y, view.scissor.width, view.scissor.height);
      this.device.setScissorTest!(true);
    } else this.device.setScissorTest!(false);
  }

  private releaseDrawResources(): void {
    this.clearPipeline?.dispose();
    this.compositePipeline?.dispose();
    this.geometry?.dispose();
    this.clearPipeline = undefined;
    this.compositePipeline = undefined;
    this.geometry = undefined;
    this.clearModule.dispose();
    this.compositeModule.dispose();
  }
}

function validateRect(rect: WeightedTransparencyRect, width: number, height: number, allowEmpty: boolean): void {
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isSafeInteger) || rect.x < 0 || rect.y < 0 || rect.width < (allowEmpty ? 0 : 1) || rect.height < (allowEmpty ? 0 : 1) || rect.x + rect.width > width || rect.y + rect.height > height) {
    throw new RangeError("Transparency view/scissor must fit within the attachment.");
  }
}
function validateRequest<T>(request: WeightedTransparencyRequest<T>): void {
  if (!Number.isSafeInteger(request.width) || request.width <= 0 || !Number.isSafeInteger(request.height) || request.height <= 0) throw new RangeError("Transparency dimensions must be positive integers.");
  if (!Number.isSafeInteger(request.sampleCount) || request.sampleCount < 1) throw new RangeError("Transparency sampleCount must be a positive integer.");
  if (!Number.isSafeInteger(request.maxFragmentsPerPixel) || request.maxFragmentsPerPixel < 0) throw new RangeError("Transparency fragment bound must be a nonnegative integer.");
  if (request.depthConvention !== "standard" && request.depthConvention !== "reversed" && request.depthConvention !== "logarithmic") throw new RangeError("Unknown transparency depth convention.");
  if (request.viewId === null || request.viewId === undefined || (typeof request.viewId === "string" && request.viewId.trim() === "") || (typeof request.viewId === "number" && !Number.isFinite(request.viewId))) throw new RangeError("Transparency viewId must identify a view.");
  if (request.deviceGeneration !== undefined && !(typeof request.deviceGeneration === "string" && request.deviceGeneration.trim() !== "") && !(typeof request.deviceGeneration === "number" && Number.isSafeInteger(request.deviceGeneration) && request.deviceGeneration >= 0)) throw new RangeError("Transparency device generation must be a nonempty string or nonnegative integer.");
  if (request.ineligibleReason !== undefined && !request.ineligibleReason.trim()) throw new RangeError("Transparency fallback reason must not be empty.");
  if (request.view) {
    validateRect(request.view, request.width, request.height, false);
    if (request.view.scissor) validateRect(request.view.scissor, request.width, request.height, true);
  }
}
function fallbackReason<T>(request: WeightedTransparencyRequest<T>, device: RenderDevice, previous: RenderTarget | null | undefined): string | undefined {
  if (device.disposed || device.contextLost) return "device unavailable";
  if (!device.getRenderTarget || !device.setViewport || !device.setScissor || !device.setScissorTest) return "device cannot preserve target and view state";
  if (previous !== request.sceneTarget) return "scene target is not currently bound";
  if (request.sceneTarget && (request.sceneTarget.disposed || request.sceneTarget.width !== request.width || request.sceneTarget.height !== request.height)) return "scene target dimensions or lifetime do not match";
  if (request.sampleCount !== 1 || (request.sceneTarget?.sampleCount ?? 1) !== 1) return "multisampled weighted transparency is unsupported";
  if (request.maxFragmentsPerPixel > 1024) return "weighted transparency fragment bound exceeds 1024";
  if (request.depthConvention === "logarithmic") return "logarithmic depth requires a compatible weighted shader";
  if (!request.opaqueDepth || request.opaqueDepth.disposed || request.opaqueDepth.format !== "depth24" || request.opaqueDepth.dimension !== "2d" || request.opaqueDepth.width !== request.width || request.opaqueDepth.height !== request.height) return "matching sampleable opaque depth is required";
  if (request.support?.floatBlend !== true || request.support?.depthTexture !== true || request.support?.shaderVariants !== true) return "weighted blending, depth sampling, or shader variants unavailable";
  if (request.ineligibleReason) return request.ineligibleReason;
  return undefined;
}
