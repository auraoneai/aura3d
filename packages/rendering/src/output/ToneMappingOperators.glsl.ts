/**
 * `output/ToneMappingOperators.glsl.ts` (PRD-01 §8.6, C-05) — the OutputPass
 * fragment shader source. Operator bodies are three.js r185 ports with the
 * `color *= toneMappingExposure;` line removed (OutputPass applies
 * `hdr * u_exposure` once before the operator). `TONE_MAP` is a `#define`
 * selecting the operator; `BACKGROUND_COVERAGE` mixes to unmapped `clamp(hdr)`
 * outside drawn coverage (§6.5); `OUTPUT_OVERLAY` runs the C-05 juice overlay
 * after encode (Q-01-1 reference GLSL adapted — the uniforms are the C-05
 * `OutputOverlayUniforms`, shape packed as `[inner, softness, aspect, on]`).
 */

export const OUTPUT_VERTEX_GLSL = `#version 300 es
// a3d.output
layout(location = 0) in vec3 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position.xy * 0.5 + 0.5;
  gl_Position = vec4(a_position, 1.0);
}
`;

export const TONE_MAPPING_OPERATORS_GLSL = `// r185 tonemapping_pars_fragment, exposure lines removed (PRD-01 §8.6).
// "none" is a pass-through (still clamped at the OETF); "linear" saturates.
vec3 NoneToneMapping(vec3 color) { return color; }
vec3 LinearToneMapping(vec3 color) { return saturate(color); }

// source: https://www.cs.utah.edu/docs/techreports/2002/pdf/UUCS-02-001.pdf
vec3 ReinhardToneMapping(vec3 color) {
  return saturate( color / ( vec3( 1.0 ) + color ) );
}

// source: https://github.com/selfshadow/ltc_code/blob/master/webgl/shaders/ltc/ltc_blit.fs
vec3 RRTAndODTFit( vec3 v ) {
  vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
  vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
  return a / b;
}

// this implementation of ACES is modified to accommodate a brighter viewing environment.
// the scale factor of 1/0.6 is subjective. see discussion in #19621.
vec3 ACESFilmicToneMapping( vec3 color ) {
  // sRGB => XYZ => D65_2_D60 => AP1 => RRT_SAT
  const mat3 ACESInputMat = mat3(
    vec3( 0.59719, 0.07600, 0.02840 ),
    vec3( 0.35458, 0.90834, 0.13383 ),
    vec3( 0.04823, 0.01566, 0.83777 )
  );
  // ODT_SAT => XYZ => D60_2_D65 => sRGB
  const mat3 ACESOutputMat = mat3(
    vec3(  1.60475, -0.10208, -0.00327 ),
    vec3( -0.53108,  1.10813, -0.07276 ),
    vec3( -0.07367, -0.00605,  1.07602 )
  );
  color /= 0.6; // exposure factor already applied by the caller
  color = ACESInputMat * color;
  color = RRTAndODTFit( color );
  color = ACESOutputMat * color;
  return saturate( color );
}

const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
  vec3( 1.6605, - 0.1246, - 0.0182 ),
  vec3( - 0.5876, 1.1329, - 0.1006 ),
  vec3( - 0.0728, - 0.0083, 1.1187 )
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
  vec3( 0.6274, 0.0691, 0.0164 ),
  vec3( 0.3293, 0.9195, 0.0880 ),
  vec3( 0.0433, 0.0113, 0.8956 )
);

// https://iolite-engine.com/blog_posts/minimal_agx_implementation
vec3 agxDefaultContrastApprox( vec3 x ) {
  vec3 x2 = x * x;
  vec3 x4 = x2 * x2;
  return + 15.5 * x4 * x2
    - 40.14 * x4 * x
    + 31.96 * x4
    - 6.868 * x2 * x
    + 0.4298 * x2
    + 0.1191 * x
    - 0.00232;
}

// AgX Tone Mapping implementation based on Filament, which in turn is based
// on Blender's implementation using rec 2020 primaries.
// Inputs and outputs are encoded as Linear-sRGB.
vec3 AgXToneMapping( vec3 color ) {
  const mat3 AgXInsetMatrix = mat3(
    vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
    vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
    vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
  );
  const mat3 AgXOutsetMatrix = mat3(
    vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
    vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
    vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
  );
  const float AgxMinEv = - 12.47393;
  const float AgxMaxEv = 4.026069;

  color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
  color = AgXInsetMatrix * color;
  color = max( color, 1e-10 );
  color = log2( color );
  color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );
  color = clamp( color, 0.0, 1.0 );
  color = agxDefaultContrastApprox( color );
  color = AgXOutsetMatrix * color;
  color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
  color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
  return clamp( color, 0.0, 1.0 );
}

// Khronos PBR Neutral (r185 body; exposure removed).
vec3 NeutralToneMapping( vec3 color ) {
  const float StartCompression = 0.8 - 0.04;
  const float Desaturation = 0.15;
  float x = min( color.r, min( color.g, color.b ) );
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max( color.r, max( color.g, color.b ) );
  if ( peak < StartCompression ) return color;
  float d = 1. - StartCompression;
  float newPeak = 1. - d * d / ( peak + d - StartCompression );
  color *= newPeak / peak;
  float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
  return mix( color, vec3( newPeak ), g );
}
`;

export const OUTPUT_FRAGMENT_PROLOGUE_GLSL = `// a3d.output
precision highp float;
uniform sampler2D u_scene;
#ifdef BACKGROUND_COVERAGE
uniform sampler2D u_coverage;
#endif
uniform float u_exposure;
uniform int u_dither;
in vec2 v_uv;
layout(location = 0) out vec4 outColor;
#define saturate( a ) clamp( a, 0.0, 1.0 )
`;

export const OUTPUT_FRAGMENT_EPILOGUE_GLSL = `vec3 a3dLinearToSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(vec3(0.0031308), c)); }
float a3dTriangularNoise(vec2 p) { float r = fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  float s = fract(sin(dot(p + 0.37, vec2(39.3468, 11.1351))) * 24634.6345); return r + s - 1.0; }
#ifdef OUTPUT_OVERLAY
uniform vec4 u_overlayFlash;    // rgb = linear color, a = amount 0..1 (additive)
uniform vec4 u_overlayVignette; // rgb = linear color, a = amount 0..1
uniform vec4 u_overlayShape;    // x = inner radius, y = softness, z = aspect (w/h), w = enabled 0/1
uniform vec4 u_overlayFade;     // rgb = linear color, a = amount 0..1 (mix)
vec3 a3dSrgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
// Q-01-1 reference (PRD 09 §8): decode → flash/vignette/fade → encode once.
// Juice amounts are perceptual, applied in display-referred linear.
vec3 a3dApplyOutputOverlay(vec3 encoded, vec2 uv) {
  if (u_overlayShape.w < 0.5) return encoded; // uniform branch; idle is bit-identical
  vec3 c = a3dSrgbToLinear(encoded);
  c += u_overlayFlash.rgb * u_overlayFlash.a;
  vec2 d = (uv - 0.5) * vec2(u_overlayShape.z, 1.0);
  float v = smoothstep(u_overlayShape.x, u_overlayShape.x + u_overlayShape.y, length(d));
  c = mix(c, u_overlayVignette.rgb, v * u_overlayVignette.a);
  c = mix(c, u_overlayFade.rgb, u_overlayFade.a);
  return a3dLinearToSRGB(clamp(c, 0.0, 1.0));
}
#endif
void main() {
  vec3 hdr = texture(u_scene, v_uv).rgb;
  vec3 display = TONE_MAP(hdr * u_exposure);
#ifdef BACKGROUND_COVERAGE
  display = mix(clamp(hdr, 0.0, 1.0), display, texture(u_coverage, v_uv).r);
#endif
  vec3 encoded = a3dLinearToSRGB(clamp(display, 0.0, 1.0));
  if (u_dither == 1) encoded += a3dTriangularNoise(gl_FragCoord.xy) / 255.0;
#ifdef OUTPUT_OVERLAY
  encoded = a3dApplyOutputOverlay(encoded, v_uv);
#endif
  outColor = vec4(encoded, 1.0);
}
`;

export const TONE_MAP_OPERATOR_FUNCTIONS: Readonly<Record<string, string>> = {
  none: "NoneToneMapping",
  linear: "LinearToneMapping",
  reinhard: "ReinhardToneMapping",
  aces: "ACESFilmicToneMapping",
  agx: "AgXToneMapping",
  neutral: "NeutralToneMapping"
};

/** Compose the output fragment for one variant key. */
export function outputFragmentGlsl(options: { toneMapping: string; backgroundCoverage: boolean; overlay: boolean }): string {
  const fn = TONE_MAP_OPERATOR_FUNCTIONS[options.toneMapping] ?? TONE_MAP_OPERATOR_FUNCTIONS["aces"];
  const defines = [
    `#define TONE_MAP(c) ${fn}(c)`,
    ...(options.backgroundCoverage ? ["#define BACKGROUND_COVERAGE"] : []),
    ...(options.overlay ? ["#define OUTPUT_OVERLAY"] : [])
  ];
  return [
    "#version 300 es",
    OUTPUT_FRAGMENT_PROLOGUE_GLSL,
    ...defines,
    TONE_MAPPING_OPERATORS_GLSL,
    OUTPUT_FRAGMENT_EPILOGUE_GLSL
  ].join("\n");
}
