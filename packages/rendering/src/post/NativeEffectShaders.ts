import type { Texture } from "../Texture";

/** Ordered display-space effects. Texture inputs are borrowed, never disposed by the post chain. */
export type NativePostEffect =
  | { readonly kind: "pixelation"; readonly size: number }
  | { readonly kind: "halftone" | "dot-screen"; readonly size: number; readonly angle: number; readonly strength: number }
  | { readonly kind: "glitch"; readonly intensity: number; readonly seed: number }
  | { readonly kind: "transition"; readonly texture: Texture; readonly progress: number }
  | { readonly kind: "lens-dirt"; readonly texture: Texture; readonly intensity: number }
  | { readonly kind: "mask"; readonly texture: Texture; readonly invert: boolean; readonly opacity: number }
  | { readonly kind: "clear-mask" }
  | { readonly kind: "afterimage"; readonly decay: number };

/** Reject malformed effects before acquiring a target or sampling an unrelated texture. */
export function validateNativePostEffect(effect: NativePostEffect): void {
  const finite = (v: number, field: string, min: number, max: number): void => {
    if (!Number.isFinite(v) || v < min || v > max) throw new Error(`POSTPROCESS_FIELD_INVALID:${effect.kind}:${field}`);
  };
  switch (effect.kind) {
    case "pixelation": finite(effect.size, "size", 1, 4096); break;
    case "halftone": case "dot-screen":
      finite(effect.size, "size", 1, 4096); finite(effect.angle, "angle", -1e6, 1e6); finite(effect.strength, "strength", 0, 1); break;
    case "glitch": finite(effect.intensity, "intensity", 0, 1); finite(effect.seed, "seed", -1e6, 1e6); break;
    case "transition": finite(effect.progress, "progress", 0, 1); break;
    case "lens-dirt": finite(effect.intensity, "intensity", 0, 1); break;
    case "mask": finite(effect.opacity, "opacity", 0, 1); if (typeof effect.invert !== "boolean") throw new Error("POSTPROCESS_FIELD_INVALID:mask:invert"); break;
    case "afterimage": finite(effect.decay, "decay", 0, 1); break;
    case "clear-mask": return;
    default: throw new Error(`POSTPROCESS_EFFECT_UNSUPPORTED:${String((effect as { kind?: unknown }).kind)}`);
  }
  if ("texture" in effect && (!effect.texture || effect.texture.disposed || effect.texture.dimension !== "2d")) {
    throw new Error(`POSTPROCESS_INPUT_UNAVAILABLE:${effect.kind}:texture`);
  }
}

/** Independent fullscreen display effect. Mask red selects effect coverage; alpha remains scene alpha. */
export const NATIVE_EFFECT_GLSL = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_color;
uniform sampler2D u_aux;
uniform sampler2D u_mask;
uniform vec2 u_resolution;
uniform int u_kind;
uniform float u_size;
uniform float u_angle;
uniform float u_strength;
uniform float u_intensity;
uniform float u_seed;
uniform float u_frame;
uniform float u_progress;
uniform float u_decay;
uniform int u_hasHistory;
uniform int u_hasMask;
uniform int u_invertMask;
uniform float u_maskOpacity;
in vec2 v_uv;
out vec4 outColor;

vec2 bounded(vec2 uv) {
  vec2 halfPixel = 0.5 / u_resolution;
  return clamp(uv, halfPixel, vec2(1.0) - halfPixel);
}
float random1(float x) { return fract(sin(x * 12.9898 + u_seed * 78.233) * 43758.5453); }
void main() {
  vec4 original = texture(u_color, v_uv);
  vec4 result = original;
  if (u_kind == 1) {
    vec2 p = (floor(v_uv * u_resolution / u_size) + 0.5) * u_size;
    result = texture(u_color, bounded(p / u_resolution));
  } else if (u_kind == 2 || u_kind == 3) {
    float c = cos(u_angle), s = sin(u_angle);
    vec2 p = (v_uv - 0.5) * u_resolution;
    vec2 rotated = vec2(c * p.x - s * p.y, s * p.x + c * p.y) / u_size;
    vec2 cell = fract(rotated) - 0.5;
    float luma = dot(original.rgb, vec3(0.2126, 0.7152, 0.0722));
    float radius = 0.5 * sqrt(clamp(1.0 - luma, 0.0, 1.0));
    float ink = 1.0 - smoothstep(radius - 0.04, radius + 0.04, length(cell));
    vec3 dots = u_kind == 2 ? vec3(1.0 - ink) : original.rgb * (1.0 - ink);
    result.rgb = mix(original.rgb, dots, u_strength);
  } else if (u_kind == 4) {
    float row = floor(v_uv.y * 32.0);
    float n = random1(row + floor(u_frame * 0.25) * 37.0);
    float shift = (n - 0.5) * 0.16 * u_intensity * step(0.7, n);
    vec2 uv = bounded(v_uv + vec2(shift, 0.0));
    vec4 shifted = texture(u_color, uv);
    result = vec4(shifted.rgb, original.a);
  } else if (u_kind == 5) {
    result = mix(original, texture(u_aux, v_uv), u_progress);
  } else if (u_kind == 6) {
    vec3 dirt = texture(u_aux, v_uv).rgb;
    float light = max(max(original.r, original.g), original.b);
    result.rgb = original.rgb + dirt * light * u_intensity;
  } else if (u_kind == 7 && u_hasHistory != 0) {
    vec4 old = texture(u_aux, v_uv);
    float oldAlpha = old.a * u_decay;
    float alpha = max(original.a, oldAlpha);
    vec3 premul = max(original.rgb * original.a, old.rgb * oldAlpha);
    result = vec4(alpha > 0.0 ? premul / alpha : vec3(0.0), alpha);
  }
  if (u_hasMask != 0) {
    float m = texture(u_mask, v_uv).r;
    if (u_invertMask != 0) m = 1.0 - m;
    result = mix(original, result, clamp(m * u_maskOpacity, 0.0, 1.0));
  }
  outColor = result;
}`;
