import { AuraRuntimeError } from "../compiler/errors.js";
import type { AuraCustomPostPass, AuraPostPassOrder } from "../../contracts/post.js";
import { postEffectBuilders } from "./effects.post.js";

/** GU47 E-E: which edges the toon pass inks. */
export type AuraToonInkSource = "color" | "depth" | "both";

export interface AuraToonOptions {
  readonly name?: string;
  /** Luma steps (>= 2). Default 5. */
  readonly bands?: number;
  /** 0 keeps the smooth image, 1 is fully banded. Default 0.75. */
  readonly bandMix?: number;
  /** Outline strength 0..1; 0 disables the Sobel outline. Default 0.75. */
  readonly outline?: number;
  /** Outline colour, linear RGB 0..1. Default [0.05, 0.09, 0.11]. */
  readonly ink?: readonly [number, number, number];
  /** Sobel magnitude where the outline starts and where it is fully on. Defaults 0.26 and 0.6. */
  readonly edgeStart?: number;
  readonly edgeEnd?: number;
  /** Render-target size in device px; sets `u_texel`. Update on resize with `toonTexel`. */
  readonly size?: readonly [number, number];
  readonly order?: AuraPostPassOrder;
  /**
   * GU47 E-E: edge source for the ink. `"color"` (default) is the luma Sobel on the image; `"depth"` inks
   * linear-depth silhouettes (inverse-depth Laplacian, so flat ground and creases stay clean); `"both"` inks either.
   * Depth comes from the post chain's linear depth (`u_depthLinear`); while it is not bound the pass keeps colour ink.
   * The v2 chain binds it at the HDR slots (`order: "before-tonemap"`, `"after-bloom"`, ...); the `after-tonemap` tail
   * does not bind depth yet (lane E-C handoff), so a depth toon there inks colour edges without a fade.
   */
  readonly inkSource?: AuraToonInkSource;
  /**
   * GU47 E-E: view distance in metres where the ink reaches zero; full strength up to half of it. Absent = no fade.
   * Needs bound depth like `inkSource: "depth"`.
   */
  readonly fadeDistance?: number;
  /** GU47 E-E: ink colour "#rrggbb" (wins over `ink`); display sRGB on the after-tonemap slot, linearised on earlier slots. */
  readonly inkColor?: string;
}

export const TOON_FRAGMENT = /* glsl */ `
uniform vec2 u_texel;
uniform float u_bands;
uniform float u_band_mix;
uniform float u_outline;
uniform vec3 u_ink;
uniform vec2 u_edge;
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
void main() {
  vec4 c = texture(u_color, v_uv);
  float l = lum(c.rgb);
  float banded = floor(l * u_bands + 0.5) / u_bands;
  float target = mix(l, banded, u_band_mix);
  vec3 col = c.rgb * (target / max(l, 0.02));
  float tl = lum(texture(u_color, v_uv + u_texel * vec2(-1.0, 1.0)).rgb);
  float t = lum(texture(u_color, v_uv + u_texel * vec2(0.0, 1.0)).rgb);
  float tr = lum(texture(u_color, v_uv + u_texel * vec2(1.0, 1.0)).rgb);
  float lf = lum(texture(u_color, v_uv + u_texel * vec2(-1.0, 0.0)).rgb);
  float rt = lum(texture(u_color, v_uv + u_texel * vec2(1.0, 0.0)).rgb);
  float bl = lum(texture(u_color, v_uv + u_texel * vec2(-1.0, -1.0)).rgb);
  float b = lum(texture(u_color, v_uv + u_texel * vec2(0.0, -1.0)).rgb);
  float br = lum(texture(u_color, v_uv + u_texel * vec2(1.0, -1.0)).rgb);
  float gx = (tr + 2.0 * rt + br) - (tl + 2.0 * lf + bl);
  float gy = (tl + 2.0 * t + tr) - (bl + 2.0 * b + br);
  float edge = smoothstep(u_edge.x, u_edge.y, sqrt(gx * gx + gy * gy));
  outColor = vec4(mix(col, u_ink, edge * u_outline), c.a);
}`;

/**
 * GU47 E-E: the toon fragment with depth-aware ink, used only when `inkSource` is `"depth"`/`"both"` or
 * `fadeDistance` is set (every other option set keeps {@link TOON_FRAGMENT}). Reads the C-13 built-in
 * `u_depthLinear` (view-space metres, 0 where no depth is bound):
 * - colour edge: the same luma Sobel as `TOON_FRAGMENT`;
 * - depth edge: `max(|wL + wR - 2wC|, |wT + wB - 2wC|) / wC` on inverse depth `w = 1 / z`, which is zero on any
 *   plane, so ground at grazing angles and box creases stay clean while silhouettes fire on both sides;
 * - `u_ink_mix` weights the two (colour, depth); without bound depth the depth weight moves onto colour;
 * - `u_fade` (start, end) in metres scales the ink to zero by `end` (0 disables), so the sky is never inked.
 */
export const TOON_INK_FRAGMENT = /* glsl */ `
uniform vec2 u_texel;
uniform float u_bands;
uniform float u_band_mix;
uniform float u_outline;
uniform vec3 u_ink;
uniform vec2 u_edge;
uniform vec2 u_ink_mix;
uniform vec2 u_depth_edge;
uniform vec2 u_fade;
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float viewZ(ivec2 p) {
  ivec2 size = textureSize(u_depthLinear, 0);
  return texelFetch(u_depthLinear, clamp(p, ivec2(0), size - ivec2(1)), 0).r;
}
float invZ(float z) { return 1.0 / max(z, 0.0001); }
void main() {
  vec4 c = texture(u_color, v_uv);
  float l = lum(c.rgb);
  float banded = floor(l * u_bands + 0.5) / u_bands;
  float target = mix(l, banded, u_band_mix);
  vec3 col = c.rgb * (target / max(l, 0.02));
  float tl = lum(texture(u_color, v_uv + u_texel * vec2(-1.0, 1.0)).rgb);
  float t = lum(texture(u_color, v_uv + u_texel * vec2(0.0, 1.0)).rgb);
  float tr = lum(texture(u_color, v_uv + u_texel * vec2(1.0, 1.0)).rgb);
  float lf = lum(texture(u_color, v_uv + u_texel * vec2(-1.0, 0.0)).rgb);
  float rt = lum(texture(u_color, v_uv + u_texel * vec2(1.0, 0.0)).rgb);
  float bl = lum(texture(u_color, v_uv + u_texel * vec2(-1.0, -1.0)).rgb);
  float b = lum(texture(u_color, v_uv + u_texel * vec2(0.0, -1.0)).rgb);
  float br = lum(texture(u_color, v_uv + u_texel * vec2(1.0, -1.0)).rgb);
  float gx = (tr + 2.0 * rt + br) - (tl + 2.0 * lf + bl);
  float gy = (tl + 2.0 * t + tr) - (bl + 2.0 * b + br);
  float edgeColor = smoothstep(u_edge.x, u_edge.y, sqrt(gx * gx + gy * gy));
  ivec2 p = ivec2(v_uv * vec2(textureSize(u_depthLinear, 0)));
  float zc = viewZ(p);
  bool hasDepth = zc > 0.0;
  float edgeDepth = 0.0;
  if (hasDepth) {
    float wc = invZ(zc);
    float wl = invZ(viewZ(p + ivec2(-1, 0)));
    float wr = invZ(viewZ(p + ivec2(1, 0)));
    float wt = invZ(viewZ(p + ivec2(0, 1)));
    float wb = invZ(viewZ(p + ivec2(0, -1)));
    float lap = max(abs(wl + wr - 2.0 * wc), abs(wt + wb - 2.0 * wc)) / wc;
    edgeDepth = smoothstep(u_depth_edge.x, u_depth_edge.y, lap);
  }
  vec2 mixWeights = hasDepth ? u_ink_mix : vec2(max(u_ink_mix.x, u_ink_mix.y), 0.0);
  float edge = max(edgeColor * mixWeights.x, edgeDepth * mixWeights.y);
  float fade = hasDepth && u_fade.y > 0.0 ? 1.0 - smoothstep(u_fade.x, u_fade.y, zc) : 1.0;
  outColor = vec4(mix(col, u_ink, edge * u_outline * fade), c.a);
}`;

/** Relative inverse-depth Laplacian where depth ink starts and where it is fully on (`u_depth_edge`). */
export const TOON_DEPTH_EDGE_DEFAULT: readonly [number, number] = [0.04, 0.12];

/** `u_texel` value for a render target of `width` x `height` device px; pass it to `app.post.setPassUniform(name, "u_texel", ...)` on resize. */
export function toonTexel(width: number, height: number): number[] {
  return [1 / Math.max(1, width), 1 / Math.max(1, height)];
}

function finiteIn(label: string, value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new AuraRuntimeError("invalid-material-spec", `effects.toon ${label} must be a finite number in [${min}, ${max}], got ${String(value)}`);
  }
  return value;
}

const INK_SOURCES: readonly AuraToonInkSource[] = ["color", "depth", "both"];

/** `u_ink_mix` (colour weight, depth weight) for an ink source. */
export function toonInkMix(inkSource: AuraToonInkSource): [number, number] {
  return inkSource === "depth" ? [0, 1] : inkSource === "both" ? [1, 1] : [1, 0];
}

/** `u_fade` (start, end) in metres for a fade distance: full ink to half the distance, zero at it; [0, 0] = no fade. */
export function toonFadeRange(fadeDistance: number | undefined): [number, number] {
  return fadeDistance === undefined ? [0, 0] : [fadeDistance * 0.5, fadeDistance];
}

function srgbToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** Parses `inkColor` ("#rgb" or "#rrggbb") to 0..1 channels; `linear` converts from sRGB for pre-tonemap slots. */
export function toonInkColor(inkColor: string, linear = false): [number, number, number] {
  const match = typeof inkColor === "string" ? /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(inkColor.trim()) : null;
  if (!match) {
    throw new AuraRuntimeError("invalid-material-spec", `effects.toon inkColor must be "#rgb" or "#rrggbb", got ${String(inkColor)}`);
  }
  const hex = match[1]!.length === 3 ? match[1]!.split("").map((digit) => digit + digit).join("") : match[1]!;
  const rgb = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const out = linear ? rgb.map(srgbToLinear) : rgb;
  return [out[0]!, out[1]!, out[2]!];
}

/** Resolved toon pass inputs: the fragment, its uniforms and whether it reads depth. */
export interface ResolvedToonPass {
  readonly glsl: string;
  readonly uniforms: Readonly<Record<string, number | readonly number[]>>;
  readonly usesDepth: boolean;
  readonly order: AuraPostPassOrder;
}

/** Validates options and resolves the fragment + uniforms `effects.toon` emits (shared with the CPU mirror). */
export function resolveToonPass(options: AuraToonOptions = {}): ResolvedToonPass {
  const bands = finiteIn("bands", options.bands ?? 5, 2, 64);
  const bandMix = finiteIn("bandMix", options.bandMix ?? 0.75, 0, 1);
  const outline = finiteIn("outline", options.outline ?? 0.75, 0, 1);
  const ink = options.ink ?? [0.05, 0.09, 0.11];
  if (ink.length !== 3) throw new AuraRuntimeError("invalid-material-spec", "effects.toon ink must be [r, g, b]");
  ink.forEach((v) => finiteIn("ink channel", v, 0, 1));
  const edgeStart = finiteIn("edgeStart", options.edgeStart ?? 0.26, 0, 4);
  const edgeEnd = finiteIn("edgeEnd", options.edgeEnd ?? 0.6, 0, 4);
  if (edgeEnd <= edgeStart) throw new AuraRuntimeError("invalid-material-spec", "effects.toon edgeEnd must be greater than edgeStart");
  const size = options.size ?? [1280, 720];
  const order = options.order ?? "after-tonemap";
  const inkSource = options.inkSource ?? "color";
  if (!INK_SOURCES.includes(inkSource)) {
    throw new AuraRuntimeError("invalid-material-spec", `effects.toon inkSource must be "color", "depth" or "both", got ${String(inkSource)}`);
  }
  const fadeDistance = options.fadeDistance === undefined ? undefined : finiteIn("fadeDistance", options.fadeDistance, 0.001, 1e7);
  const inkRgb = options.inkColor === undefined ? [...ink] : toonInkColor(options.inkColor, order !== "after-tonemap");
  const uniforms: Record<string, number | readonly number[]> = {
    u_texel: toonTexel(size[0], size[1]),
    u_bands: bands,
    u_band_mix: bandMix,
    u_outline: outline,
    u_ink: inkRgb,
    u_edge: [edgeStart, edgeEnd]
  };
  const usesDepth = inkSource !== "color" || fadeDistance !== undefined;
  if (!usesDepth) return { glsl: TOON_FRAGMENT, uniforms, usesDepth, order };
  return {
    glsl: TOON_INK_FRAGMENT,
    uniforms: {
      ...uniforms,
      u_ink_mix: toonInkMix(inkSource),
      u_depth_edge: [...TOON_DEPTH_EDGE_DEFAULT],
      u_fade: toonFadeRange(fadeDistance)
    },
    usesDepth,
    order
  };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** One frame for {@link toonInkWeights}: row-major, row 0 at the bottom (GL order). */
export interface ToonInkFrame {
  readonly width: number;
  readonly height: number;
  /** Display luma 0..1 per pixel. */
  readonly luma: ArrayLike<number>;
  /** View-space depth in metres per pixel; absent (or 0) where no depth is bound. */
  readonly viewZ?: ArrayLike<number> | null;
}

/**
 * CPU mirror of the toon ink weight (`edge * outline * fade`, 0..1 per pixel) for the same options
 * `effects.toon` takes: `TOON_FRAGMENT` when the pass does not read depth, `TOON_INK_FRAGMENT` when it does.
 * Neighbours clamp at the frame edge like the shader's clamp-to-edge sampling.
 */
export function toonInkWeights(frame: ToonInkFrame, options: AuraToonOptions = {}): Float32Array {
  const { width, height, luma } = frame;
  const resolved = resolveToonPass(options);
  const u = resolved.uniforms as Record<string, number | readonly number[]>;
  const edge = u.u_edge as readonly number[];
  const outline = u.u_outline as number;
  const inkMix = resolved.usesDepth ? (u.u_ink_mix as readonly number[]) : [1, 0];
  const depthEdge = resolved.usesDepth ? (u.u_depth_edge as readonly number[]) : [0, 1];
  const fadeRange = resolved.usesDepth ? (u.u_fade as readonly number[]) : [0, 0];
  const at = (values: ArrayLike<number>, x: number, y: number): number =>
    values[Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))] ?? 0;
  const out = new Float32Array(width * height);
  const depth = resolved.usesDepth ? frame.viewZ ?? null : null;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const tl = at(luma, x - 1, y + 1), t = at(luma, x, y + 1), tr = at(luma, x + 1, y + 1);
      const lf = at(luma, x - 1, y), rt = at(luma, x + 1, y);
      const bl = at(luma, x - 1, y - 1), b = at(luma, x, y - 1), br = at(luma, x + 1, y - 1);
      const gx = (tr + 2 * rt + br) - (tl + 2 * lf + bl);
      const gy = (tl + 2 * t + tr) - (bl + 2 * b + br);
      const edgeColor = smoothstep(edge[0]!, edge[1]!, Math.sqrt(gx * gx + gy * gy));
      const zc = depth ? at(depth, x, y) : 0;
      const hasDepth = zc > 0;
      let edgeDepth = 0;
      if (hasDepth && depth) {
        const inv = (z: number): number => 1 / Math.max(z, 0.0001);
        const wc = inv(zc);
        const lap = Math.max(
          Math.abs(inv(at(depth, x - 1, y)) + inv(at(depth, x + 1, y)) - 2 * wc),
          Math.abs(inv(at(depth, x, y + 1)) + inv(at(depth, x, y - 1)) - 2 * wc)
        ) / wc;
        edgeDepth = smoothstep(depthEdge[0]!, depthEdge[1]!, lap);
      }
      const weights = hasDepth ? inkMix : [Math.max(inkMix[0]!, inkMix[1]!), 0];
      const edgeValue = Math.max(edgeColor * weights[0]!, edgeDepth * weights[1]!);
      const fade = hasDepth && fadeRange[1]! > 0 ? 1 - smoothstep(fadeRange[0]!, fadeRange[1]!, zc) : 1;
      out[y * width + x] = edgeValue * outline * fade;
    }
  }
  return out;
}

export const toonEffectBuilders = {
  /**
   * Cel pass over the final image: luma banding plus an ink outline. Returns a post pass for `app.post.addPostPass(...)`.
   * GU47 E-E: `inkSource` "depth"/"both" or `fadeDistance` switch to the depth-aware fragment (inputs color + depth);
   * without them the pass is byte-identical to the original Silt cel pass.
   */
  toon: (options: AuraToonOptions = {}): AuraCustomPostPass => {
    const resolved = resolveToonPass(options);
    return postEffectBuilders.shaderPass({
      name: options.name ?? "toon",
      order: resolved.order,
      glsl: resolved.glsl,
      uniforms: resolved.uniforms,
      ...(resolved.usesDepth ? { inputs: ["color", "depth"] as const } : {})
    });
  }
} as const;
