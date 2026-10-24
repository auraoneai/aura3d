import { AuraRuntimeError } from "../compiler/errors.js";
import type { AuraCustomPostPass, AuraPostPassOrder } from "../../contracts/post.js";
import { postEffectBuilders } from "./effects.post.js";

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

export const toonEffectBuilders = {
  /** Cel pass over the final image: luma banding plus a Sobel outline. Returns a post pass for `app.post.addPostPass(...)`. */
  toon: (options: AuraToonOptions = {}): AuraCustomPostPass => {
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
    return postEffectBuilders.shaderPass({
      name: options.name ?? "toon",
      order: options.order ?? "after-tonemap",
      glsl: TOON_FRAGMENT,
      uniforms: {
        u_texel: toonTexel(size[0], size[1]),
        u_bands: bands,
        u_band_mix: bandMix,
        u_outline: outline,
        u_ink: [...ink],
        u_edge: [edgeStart, edgeEnd]
      }
    });
  }
} as const;
