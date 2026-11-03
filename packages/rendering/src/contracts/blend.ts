/** Draw state shared by the WebGL2 and native GPU backends. */
import type { RenderCommandState } from "../RenderDevice";

/** `constant` is component-wise (including the alpha component). */
export type BlendFactor = "zero" | "one" | "src-color" | "one-minus-src-color" | "src-alpha" | "one-minus-src-alpha" | "dst-color" | "one-minus-dst-color" | "dst-alpha" | "one-minus-dst-alpha" | "constant" | "one-minus-constant" | "src-alpha-saturated";
export type BlendEquation = "add" | "subtract" | "reverse-subtract" | "min" | "max";
export interface BlendComponent { readonly equation: BlendEquation; readonly src: BlendFactor; readonly dst: BlendFactor; }
export type BlendMode = "opaque" | "alpha" | "premultiplied" | "additive" | "multiply" | { readonly kind: "custom"; readonly color: BlendComponent; readonly alpha: BlendComponent };
export type DepthCompare = "never" | "less" | "equal" | "less-equal" | "greater" | "not-equal" | "greater-equal" | "always";
export type AuraBlendMode = "opaque" | "alpha" | "premultiplied" | "additive" | "multiply";

const NAMED_BLEND_COMPONENTS: Readonly<Record<Exclude<AuraBlendMode, "opaque">, { readonly color: BlendComponent; readonly alpha: BlendComponent }>> = {
  alpha: { color: { equation: "add", src: "src-alpha", dst: "one-minus-src-alpha" }, alpha: { equation: "add", src: "one", dst: "one-minus-src-alpha" } },
  premultiplied: { color: { equation: "add", src: "one", dst: "one-minus-src-alpha" }, alpha: { equation: "add", src: "one", dst: "one-minus-src-alpha" } },
  additive: { color: { equation: "add", src: "src-alpha", dst: "one" }, alpha: { equation: "add", src: "one", dst: "one" } },
  multiply: { color: { equation: "add", src: "dst-color", dst: "one-minus-src-alpha" }, alpha: { equation: "add", src: "one", dst: "one" } }
};
const FACTORS: readonly BlendFactor[] = ["zero", "one", "src-color", "one-minus-src-color", "src-alpha", "one-minus-src-alpha", "dst-color", "one-minus-dst-color", "dst-alpha", "one-minus-dst-alpha", "constant", "one-minus-constant", "src-alpha-saturated"];
const EQUATIONS: readonly BlendEquation[] = ["add", "subtract", "reverse-subtract", "min", "max"];
const COMPARES: readonly DepthCompare[] = ["never", "less", "equal", "less-equal", "greater", "not-equal", "greater-equal", "always"];
const STENCIL_OPS = ["keep", "zero", "replace", "increment", "decrement", "invert", "increment-wrap", "decrement-wrap"] as const;

/** `blendMode` wins over the legacy boolean. Named modes resolve to a component pair. */
export function resolveBlendMode(state: Pick<RenderCommandState, "blend" | "blendMode">): Exclude<BlendMode, string> | "opaque" {
  const mode = state.blendMode ?? (state.blend ? "alpha" : "opaque");
  if (mode === "opaque") return "opaque";
  if (typeof mode === "string") {
    const pair = NAMED_BLEND_COMPONENTS[mode as Exclude<AuraBlendMode, "opaque">];
    if (!pair) throw new RangeError(`Unsupported blend mode: ${mode}`);
    return { kind: "custom", color: pair.color, alpha: pair.alpha };
  }
  if (!mode || mode.kind !== "custom" || !mode.color || !mode.alpha) throw new RangeError("Invalid custom blend mode.");
  return { kind: "custom", color: mode.color, alpha: mode.alpha };
}

function uint32(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError(`${name} must be an unsigned 32-bit integer.`);
}

function validateResolvedBlend(blend: Exclude<BlendMode, string> | "opaque"): void {
  if (blend === "opaque") return;
  for (const [name, component] of [["color", blend.color], ["alpha", blend.alpha]] as const) {
    if (!EQUATIONS.includes(component.equation) || !FACTORS.includes(component.src) || !FACTORS.includes(component.dst)) throw new RangeError(`Invalid ${name} blend component.`);
    if (component.dst === "src-alpha-saturated" || (name === "alpha" && component.src === "src-alpha-saturated")) throw new RangeError("src-alpha-saturated is supported only as the color source factor.");
  }
}

/** Call after validation to decide whether a backend needs independent state. */
export function hasAttachmentRenderOverrides(state: RenderCommandState): boolean {
  return state.colorAttachments?.some((entry) => entry !== undefined && (entry.colorWrite !== undefined || entry.blendMode !== undefined)) ?? false;
}

/** Validate values before a backend mutates state or submits a draw. */
export function validateRenderCommandState(state: RenderCommandState, colorAttachmentCount?: number): void {
  for (const key of ["depthTest", "depthWrite", "blend"] as const) {
    if (typeof state[key] !== "boolean") throw new TypeError(`Render state ${key} must be boolean.`);
  }
  if (!["none", "back", "front"].includes(state.cullMode)) throw new RangeError("Invalid cull mode.");
  if (!COMPARES.includes(state.depthCompare) || (state.depthCompareV2 !== undefined && !COMPARES.includes(state.depthCompareV2))) throw new RangeError("Invalid depth comparison.");
  if (state.frontFace !== undefined && state.frontFace !== "ccw" && state.frontFace !== "cw") throw new RangeError("Invalid front face winding.");
  if (state.blendedDepthWrite !== undefined && state.blendedDepthWrite !== "allow") throw new RangeError("Invalid blended depth-write policy.");
  if (state.alphaToCoverage !== undefined && typeof state.alphaToCoverage !== "boolean") throw new TypeError("alphaToCoverage must be boolean.");
  if (state.sampleMask !== undefined) uint32(state.sampleMask, "sampleMask");
  if (state.colorWrite !== undefined && (state.colorWrite.length !== 4 || !state.colorWrite.every((value) => typeof value === "boolean"))) throw new TypeError("colorWrite must contain four booleans.");
  if (state.blendConstant !== undefined && (state.blendConstant.length !== 4 || !state.blendConstant.every((value) => Number.isFinite(value) && value >= 0 && value <= 1))) throw new RangeError("blendConstant must contain four finite values in [0, 1].");
  if (state.scissor && (![state.scissor.x, state.scissor.y, state.scissor.width, state.scissor.height].every(Number.isInteger) || state.scissor.width < 0 || state.scissor.height < 0)) throw new RangeError("Scissor must contain integer coordinates and non-negative dimensions.");
  if (state.polygonOffset && (![state.polygonOffset.factor, state.polygonOffset.units, state.polygonOffset.clamp ?? 0].every(Number.isFinite))) throw new RangeError("Polygon offset values must be finite.");
  if (state.stencil) {
    const stencil = state.stencil;
    if (stencil.compare !== undefined && !COMPARES.includes(stencil.compare)) throw new RangeError("Invalid stencil comparison.");
    for (const op of [stencil.fail, stencil.depthFail, stencil.depthPass]) if (op !== undefined && !STENCIL_OPS.includes(op)) throw new RangeError("Invalid stencil operation.");
    for (const [name, value] of [["reference", stencil.reference], ["readMask", stencil.readMask], ["writeMask", stencil.writeMask]] as const) if (value !== undefined) uint32(value, `Stencil ${name}`);
  }
  validateResolvedBlend(resolveBlendMode(state));
  if (colorAttachmentCount !== undefined && (!Number.isSafeInteger(colorAttachmentCount) || colorAttachmentCount < 0)) throw new RangeError("Color attachment count must be a non-negative safe integer.");
  const attachments = state.colorAttachments;
  if (attachments !== undefined) {
    if (!Array.isArray(attachments)) throw new TypeError("colorAttachments must be an array.");
    // The actual device limit is checked by its backend. This bound also keeps
    // validation and cache-key construction bounded when no device is known.
    if (attachments.length > 64 || (colorAttachmentCount !== undefined && attachments.length > colorAttachmentCount)) throw new RangeError("Color attachment state exceeds the available attachment count.");
    for (let index = 0; index < attachments.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(attachments, index)) throw new TypeError("colorAttachments must not contain sparse slots; use undefined for inherited state.");
      const entry = attachments[index];
      if (entry === undefined) continue;
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) throw new TypeError(`Color attachment state ${index} must be an object or undefined.`);
      if (Object.keys(entry).some((key) => key !== "colorWrite" && key !== "blendMode")) throw new TypeError(`Color attachment state ${index} has an unsupported field.`);
      if (entry.colorWrite !== undefined && (!Array.isArray(entry.colorWrite) || entry.colorWrite.length !== 4 ||
          ![0, 1, 2, 3].every((component) => Object.prototype.hasOwnProperty.call(entry.colorWrite, component) && typeof entry.colorWrite![component] === "boolean"))) {
        throw new TypeError(`Color attachment state ${index} colorWrite must contain four booleans.`);
      }
      if (entry.blendMode !== undefined) {
        if (entry.blendMode === null) throw new TypeError(`Color attachment state ${index} blendMode cannot be null.`);
        validateResolvedBlend(resolveBlendMode({ blend: false, blendMode: entry.blendMode }));
      }
    }
  }
}

/** Exact identity for all fixed pipeline fields. Dynamic scissor, blend constant and stencil reference are excluded. */
export function renderPipelineStateKey(state: RenderCommandState): string {
  validateRenderCommandState(state);
  const stencil = state.stencil;
  return JSON.stringify({
    depthTest: state.depthTest, depthWrite: state.depthWrite, depthCompare: state.depthCompareV2 ?? state.depthCompare,
    cullMode: state.cullMode, frontFace: state.frontFace ?? "ccw", blend: resolveBlendMode(state),
    colorWrite: state.colorWrite ?? [true, true, true, true],
    ...(state.colorAttachments === undefined ? {} : { colorAttachments: state.colorAttachments.map((entry) => entry === undefined ? null : {
      colorWrite: entry.colorWrite ?? null,
      blend: entry.blendMode === undefined ? null : resolveBlendMode({ blend: false, blendMode: entry.blendMode })
    }) }),
    alphaToCoverage: state.alphaToCoverage ?? false,
    sampleMask: state.sampleMask ?? 0xffffffff, polygonOffset: state.polygonOffset ?? null,
    stencil: stencil ? { compare: stencil.compare ?? "always", readMask: stencil.readMask ?? 0xffffffff, writeMask: stencil.writeMask ?? 0xffffffff, fail: stencil.fail ?? "keep", depthFail: stencil.depthFail ?? "keep", depthPass: stencil.depthPass ?? "keep" } : null
  });
}

/** Exact identity including dynamic state; suitable for deciding whether draws can be merged. */
export function renderStateSignature(state: RenderCommandState): string {
  return JSON.stringify([renderPipelineStateKey(state), state.scissor ?? null, state.blendConstant ?? [0, 0, 0, 0], state.stencil?.reference ?? 0]);
}

/** Legacy compact diagnostic key. Use renderStateSignature for equality or pipeline cache identity. */
export function renderStateKey(state: RenderCommandState): number {
  // Preserve the original scissor-independent API; a 32-bit hash cannot prove equality.
  const text = JSON.stringify([renderPipelineStateKey(state), state.blendConstant ?? [0, 0, 0, 0], state.stencil?.reference ?? 0]);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return hash >>> 0;
}
