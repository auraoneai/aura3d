/**
 * Legacy WebGL2 LDR postprocess fragment shader, compiled per feature variant.
 *
 * The program used to be one uber-shader that chose tone operator, colour grade, sharpening and FXAA from uniforms. Every
 * `finalColorAt` call inlined the whole tone/grade stack, and the FXAA tail calls it five times (nine with sharpening), so the
 * driver compiled and executed ~25 copies of tone mapping + grade even for a frame that only tone-maps. On a software
 * rasteriser (SwiftShader, 640x360) that single fullscreen draw measured ~600 ms against ~30 ms for the same tone-map
 * written without the dead branches. Defining the feature set at compile time compiles only the paths a frame uses; the
 * arithmetic of each enabled path is unchanged.
 */

export interface LdrProgramVariant {
  readonly toneMapping: boolean;
  /** `toneMappingOperatorId` value (0 clamp, 1 reinhard, 2 aces, 3 filmic, 4 uncharted2, 5 agx, other neutral). */
  readonly operator: number;
  readonly inputSrgb: boolean;
  readonly outputSrgb: boolean;
  readonly grade: boolean;
  /** Sharpening is only meaningful with a grade; callers pass `grade && sharpening > 0`. */
  readonly sharpening: boolean;
  readonly fxaa: boolean;
  /** Linear-light vignette applied to the HDR/linear colour just before the tone operator (only meaningful with `toneMapping`). */
  readonly vignette?: boolean;
}

export function ldrVariantKey(variant: LdrProgramVariant): string {
  const op = variant.toneMapping ? Math.min(6, Math.max(0, Math.floor(variant.operator))) : 0;
  const base = [variant.toneMapping ? 1 : 0, op, variant.inputSrgb ? 1 : 0, variant.outputSrgb ? 1 : 0, variant.grade ? 1 : 0, variant.grade && variant.sharpening ? 1 : 0, variant.fxaa ? 1 : 0].join("");
  return variant.toneMapping && variant.vignette ? `${base}v` : base;
}

export function ldrFragmentSource(variant: LdrProgramVariant): string {
  const op = variant.toneMapping ? Math.min(6, Math.max(0, Math.floor(variant.operator))) : 0;
  return `#version 300 es
precision highp float;
#define LDR_TONE ${variant.toneMapping ? 1 : 0}
#define LDR_OP ${op}
#define LDR_IN_SRGB ${variant.inputSrgb ? 1 : 0}
#define LDR_OUT_SRGB ${variant.outputSrgb ? 1 : 0}
#define LDR_GRADE ${variant.grade ? 1 : 0}
#define LDR_SHARPEN ${variant.grade && variant.sharpening ? 1 : 0}
#define LDR_FXAA ${variant.fxaa ? 1 : 0}
#define LDR_VIGNETTE ${variant.toneMapping && variant.vignette ? 1 : 0}
uniform sampler2D u_source;
uniform vec2 u_texelSize;
uniform int u_hasToneMapping;
uniform int u_toneOperator;
uniform int u_inputColorSpace;
uniform int u_outputColorSpace;
uniform float u_exposure;
uniform float u_whitePoint;
uniform float u_gamma;
uniform int u_hasColorGrade;
uniform float u_contrast;
uniform float u_temperature;
uniform float u_tint;
uniform float u_saturation;
uniform float u_vibrance;
uniform float u_vignette;
uniform float u_sharpening;
uniform int u_hasFxaa;
uniform float u_edgeThreshold;
uniform float u_subpixelBlend;
#if LDR_VIGNETTE
uniform float u_vignetteIntensity;
uniform float u_vignetteSmoothness;
uniform float u_vignetteRoundness;
uniform vec3 u_vignetteColor;
#endif
in vec2 v_uv;
out vec4 outColor;

float srgbToLinear(float value) {
  return value <= 0.04045 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4);
}

float linearToSrgb(float value) {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * pow(value, 1.0 / 2.4) - 0.055;
}

vec3 decodeColor(vec3 color) {
#if LDR_IN_SRGB
  return vec3(srgbToLinear(color.r), srgbToLinear(color.g), srgbToLinear(color.b));
#else
  return color;
#endif
}

vec3 encodeColor(vec3 color) {
  vec3 linear = clamp(color, 0.0, 1.0);
#if LDR_OUT_SRGB
  return vec3(linearToSrgb(linear.r), linearToSrgb(linear.g), linearToSrgb(linear.b));
#else
  return linear;
#endif
}

vec3 acesRrtAndOdtFit(vec3 value) {
  vec3 numerator = value * (value + 0.0245786) - 0.000090537;
  vec3 denominator = value * (0.983729 * value + 0.4329510) + 0.238081;
  return numerator / denominator;
}

vec3 acesFilmic(vec3 color) {
  // Match current Three.js ACESFilmicToneMapping. ACES is a coupled RGB
  // transform; a scalar approximation shifts hue and washes saturated colors.
  const mat3 acesInput = mat3(
    vec3(0.59719, 0.07600, 0.02840),
    vec3(0.35458, 0.90834, 0.13383),
    vec3(0.04823, 0.01566, 0.83777)
  );
  const mat3 acesOutput = mat3(
    vec3(1.60475, -0.10208, -0.00327),
    vec3(-0.53108, 1.10813, -0.07276),
    vec3(-0.07367, -0.00605, 1.07602)
  );
  vec3 acesColor = acesInput * (color / 0.6);
  acesColor = acesRrtAndOdtFit(acesColor);
  return clamp(acesOutput * acesColor, 0.0, 1.0);
}

float filmic(float value) {
  float x = max(0.0, value);
  float toe = max(0.0, x - 0.004);
  float curve = (toe * (6.2 * toe + 0.5)) / (toe * (6.2 * toe + 1.7) + 0.06);
  return min(curve, x * 1.08);
}

float uncharted2(float value) {
  float a = 0.15;
  float b = 0.5;
  float c = 0.1;
  float d = 0.2;
  float e = 0.02;
  float f = 0.3;
  float w = 11.2;
  float x = value * 2.0;
  float curve = ((x * (a * x + c * b) + d * e) / (x * (a * x + b) + d * f)) - e / f;
  float wx = w;
  float white = ((wx * (a * wx + c * b) + d * e) / (wx * (a * wx + b) + d * f)) - e / f;
  return clamp(curve / white, 0.0, 1.0);
}

float agx(float value) {
  float x = max(0.0, value);
  float encoded = log2(1.0 + x) / log2(17.0);
  return clamp(encoded * encoded * (3.0 - 2.0 * encoded), 0.0, 1.0);
}

float neutral(float value) {
  float x = max(0.0, value);
  return min(1.0, (x * (1.0 + x / 7.5)) / (1.0 + x));
}

#if LDR_TONE && LDR_OP != 2
float toneMapChannel(float value) {
  float exposed = max(0.0, value * u_exposure) / max(0.0001, u_whitePoint);
#if LDR_OP == 0
  return min(1.0, exposed);
#elif LDR_OP == 1
  return exposed / (1.0 + exposed);
#elif LDR_OP == 3
  return filmic(exposed);
#elif LDR_OP == 4
  return uncharted2(exposed);
#elif LDR_OP == 5
  return agx(exposed);
#else
  return neutral(exposed);
#endif
}
#endif

#if LDR_VIGNETTE
// PostGraph v2: the vignette is a light falloff, so it multiplies the linear colour before the tone operator
// (tone map and encode run once, after every effect). Same radial law as the display-grade vignette.
vec3 vignetteLinear(vec3 color, vec2 uv) {
  vec2 p = (uv - 0.5) * 2.0;
  p.x *= (u_texelSize.y / u_texelSize.x) * u_vignetteRoundness;
  float len = length(p) * u_vignetteIntensity;
  return color * mix(vec3(1.0), u_vignetteColor, pow(clamp(len, 0.0, 1.0), u_vignetteSmoothness));
}
#endif

vec3 applyToneMapping(vec3 color, vec2 uv) {
#if LDR_TONE
  vec3 decoded = decodeColor(color);
#if LDR_VIGNETTE
  decoded = vignetteLinear(decoded, uv);
#endif
#if LDR_OP == 2
  vec3 mapped = acesFilmic(max(vec3(0.0), decoded * u_exposure) / max(0.0001, u_whitePoint));
#else
  vec3 mapped = vec3(toneMapChannel(decoded.r), toneMapChannel(decoded.g), toneMapChannel(decoded.b));
#endif
  return encodeColor(mapped);
#else
  return color;
#endif
}

vec3 applyColorGrade(vec3 color, vec2 uv) {
#if LDR_GRADE
  float contrastOffset = 0.5 - 0.5 * u_contrast;
  float redShift = u_temperature * 0.08 - u_tint * 0.02;
  float greenShift = u_tint * 0.06;
  float blueShift = -u_temperature * 0.08 - u_tint * 0.02;
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  vec3 graded = color * u_contrast + vec3(contrastOffset + redShift, contrastOffset + greenShift, contrastOffset + blueShift);
  float distanceFromLuma = min(1.0, abs(graded.r - luma) + abs(graded.g - luma) + abs(graded.b - luma));
  float vibranceBoost = u_vibrance == 0.0 ? 0.0 : u_vibrance * (1.0 - distanceFromLuma);
  float saturation = u_saturation + vibranceBoost;
  graded = vec3(luma) + (graded - vec3(luma)) * saturation;
  vec2 centered = uv * 2.0 - 1.0;
  float vignette = 1.0 - u_vignette * clamp((length(centered) - 0.28) / 1.12, 0.0, 1.0);
  return clamp(graded * vignette, 0.0, 1.0);
#else
  return color;
#endif
}

vec3 baseColorAt(vec2 uv) {
  vec2 clampedUv = clamp(uv, vec2(0.0), vec2(1.0));
  vec3 color = texture(u_source, clampedUv).rgb;
  return applyColorGrade(applyToneMapping(color, clampedUv), clampedUv);
}

vec3 finalColorAt(vec2 uv) {
  vec3 center = baseColorAt(uv);
#if LDR_SHARPEN
  if (u_sharpening <= 0.0) return center;
  vec3 blur = (
    baseColorAt(uv + vec2(-u_texelSize.x, 0.0)) +
    baseColorAt(uv + vec2(u_texelSize.x, 0.0)) +
    baseColorAt(uv + vec2(0.0, -u_texelSize.y)) +
    baseColorAt(uv + vec2(0.0, u_texelSize.y))
  ) * 0.25;
  return clamp(center + (center - blur) * u_sharpening, 0.0, 1.0);
#else
  return center;
#endif
}

float luma(vec3 color) {
  return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  vec3 center = finalColorAt(v_uv);
  float alpha = texture(u_source, clamp(v_uv, vec2(0.0), vec2(1.0))).a;
#if LDR_FXAA
  vec3 north = finalColorAt(v_uv + vec2(0.0, -u_texelSize.y));
  vec3 south = finalColorAt(v_uv + vec2(0.0, u_texelSize.y));
  vec3 west = finalColorAt(v_uv + vec2(-u_texelSize.x, 0.0));
  vec3 east = finalColorAt(v_uv + vec2(u_texelSize.x, 0.0));
  float centerLuma = luma(center);
  float minLuma = min(centerLuma, min(min(luma(north), luma(south)), min(luma(west), luma(east))));
  float maxLuma = max(centerLuma, max(max(luma(north), luma(south)), max(luma(west), luma(east))));
  if (maxLuma - minLuma < u_edgeThreshold) {
    outColor = vec4(center, alpha);
    return;
  }
  vec3 average = (north + south + west + east) * 0.25;
  outColor = vec4(mix(center, average, clamp(u_subpixelBlend, 0.0, 1.0)), alpha);
#else
  outColor = vec4(center, alpha);
#endif
}
`;
}
