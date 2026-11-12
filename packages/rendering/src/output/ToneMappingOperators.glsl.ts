/**
 * Output presentation shader. Exposure is applied exactly once by the caller;
 * tone curves operate on linear RGB and precede the sRGB transfer function.
 * ACES, AgX, PBR Neutral, Reinhard and Cineon use their published curve
 * equations; the viewing scale is kept for Aura3D's existing output contract.
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

/** Shared ACES transform used by both direct and postprocessed output. */
export const ACES_FILMIC_GLSL = `vec3 a3dToneRows(vec3 v, vec3 r0, vec3 r1, vec3 r2) {
  return vec3(dot(r0, v), dot(r1, v), dot(r2, v));
}
#ifdef OUTPUT_DISPLAY_P3
vec3 a3dSceneSrgbToP3(vec3 c) {
  return a3dToneRows(c,
    vec3(0.8224619687143624, 0.17753803128563794, 0.0),
    vec3(0.03319419885096169, 0.9668058011490385, 0.0),
    vec3(0.01708263072112004, 0.07239744066396342, 0.9105199286149166));
}
vec3 a3dSceneP3ToSrgb(vec3 c) {
  return a3dToneRows(c,
    vec3(1.2249401762805586, -0.2249401762805588, 0.0),
    vec3(-0.04205695470968808, 1.042056954709688, 0.0),
    vec3(-0.019637554590334507, -0.07863604555063227, 1.0982736001409668));
}
#endif
// Hill's published rational approximation, used in the ACES working gamut.
vec3 RRTAndODTFit(vec3 x) {
  vec3 numerator = (x + 0.0245786) * x - 0.000090537;
  vec3 denominator = (0.983729 * x + 0.432951) * x + 0.238081;
  return numerator / denominator;
}
vec3 ACESFilmicToneMapping(vec3 color) {
#ifdef OUTPUT_DISPLAY_P3
  vec3 working = max(a3dToneRows(color / 0.6,
    vec3(0.59719, 0.35458, 0.04823),
    vec3(0.07600, 0.90834, 0.01566),
    vec3(0.02840, 0.13383, 0.83777)), vec3(0.0));
  vec3 fitted = RRTAndODTFit(working);
  return a3dToneRows(fitted,
    vec3(1.60475, -0.53108, -0.07367),
    vec3(-0.10208, 1.10813, -0.00605),
    vec3(-0.00327, -0.07276, 1.07602));
#else
  vec3 working = a3dToneRows(max(color, vec3(0.0)) / 0.6,
    vec3(0.59719, 0.35458, 0.04823),
    vec3(0.07600, 0.90834, 0.01566),
    vec3(0.02840, 0.13383, 0.83777));
  vec3 fitted = RRTAndODTFit(working);
  return clamp(a3dToneRows(fitted,
    vec3(1.60475, -0.53108, -0.07367),
    vec3(-0.10208, 1.10813, -0.00605),
    vec3(-0.00327, -0.07276, 1.07602)), 0.0, 1.0);
#endif
}

`;

export const TONE_MAPPING_OPERATORS_GLSL = `// Independent Aura3D display transforms, paired with post/ToneOperators.ts.
${ACES_FILMIC_GLSL}
vec3 NoneToneMapping(vec3 color) { return color; }
vec3 LinearToneMapping(vec3 color) {
#ifdef OUTPUT_DISPLAY_P3
  return a3dSceneP3ToSrgb(clamp(a3dSceneSrgbToP3(color), 0.0, 1.0));
#else
  return clamp(color, 0.0, 1.0);
#endif
}
// Preserve out-of-gamut negatives for the destination-primary transform;
// gamut clipping happens afterward. Avoid the x = -1 singularity.
float a3dReinhardChannel(float value) {
  return value >= 0.0 ? value / (1.0 + value) : value;
}
vec3 ReinhardToneMapping(vec3 color) {
#ifdef OUTPUT_DISPLAY_P3
  vec3 p3 = a3dSceneSrgbToP3(color);
  return a3dSceneP3ToSrgb(vec3(a3dReinhardChannel(p3.r), a3dReinhardChannel(p3.g), a3dReinhardChannel(p3.b)));
#else
  return vec3(a3dReinhardChannel(color.r), a3dReinhardChannel(color.g), a3dReinhardChannel(color.b));
#endif
}

// AgX log window and sixth-degree contrast approximation.
vec3 a3dAgxContrast(vec3 x) {
  return (((((15.5*x - 40.14)*x + 31.96)*x - 6.868)*x + 0.4298)*x + 0.1191)*x - 0.00232;
}
vec3 AgXToneMapping(vec3 color) {
#ifdef OUTPUT_DISPLAY_P3
  vec3 p3 = max(a3dSceneSrgbToP3(color), vec3(0.0));
  vec3 inset = a3dToneRows(p3,
    vec3(0.856627153315983, 0.0951212405381588, 0.0482516061458583),
    vec3(0.137318972929847, 0.761241990602591, 0.101439036467562),
    vec3(0.11189821299995, 0.0767994186031903, 0.811302368396859));
  vec3 logExposure = clamp((log2(max(inset, vec3(1e-10))) + 12.47393) / 16.499999, 0.0, 1.0);
  vec3 graded = a3dAgxContrast(logExposure);
  vec3 outset = a3dToneRows(graded,
    vec3(1.1271005818144368, -0.11060664309660323, -0.016493938717834573),
    vec3(-0.1413297634984383, 1.157823702216272, -0.016493938717834257),
    vec3(-0.14132976349843826, -0.11060664309660294, 1.2519364065950405));
  return a3dSceneP3ToSrgb(clamp(pow(max(outset, vec3(0.0)), vec3(2.2)), 0.0, 1.0));
#else
  vec3 wide = a3dToneRows(max(color, vec3(0.0)),
    vec3(0.6274, 0.3293, 0.0433), vec3(0.0691, 0.9195, 0.0113), vec3(0.0164, 0.0880, 0.8956));
  vec3 inset = a3dToneRows(wide,
    vec3(0.856627153315983, 0.0951212405381588, 0.0482516061458583),
    vec3(0.137318972929847, 0.761241990602591, 0.101439036467562),
    vec3(0.11189821299995, 0.0767994186031903, 0.811302368396859));
  vec3 logExposure = clamp((log2(max(inset, vec3(1e-10))) + 12.47393) / 16.499999, 0.0, 1.0);
  vec3 graded = a3dAgxContrast(logExposure);
  vec3 outset = a3dToneRows(graded,
    vec3(1.1271005818144368, -0.11060664309660323, -0.016493938717834573),
    vec3(-0.1413297634984383, 1.157823702216272, -0.016493938717834257),
    vec3(-0.14132976349843826, -0.11060664309660294, 1.2519364065950405));
  vec3 display = pow(max(outset, vec3(0.0)), vec3(2.2));
  return clamp(a3dToneRows(display,
    vec3(1.6605, -0.5876, -0.0728), vec3(-0.1246, 1.1329, -0.0083), vec3(-0.0182, -0.1006, 1.1187)), 0.0, 1.0);
#endif
}

// Filmic Cineon fit, with its inverse display gamma returning linear light.
vec3 CineonToneMapping(vec3 color) {
  vec3 x = max(color - 0.004, vec3(0.0));
  return pow((x * (6.2 * x + 0.5)) / (x * (6.2 * x + 1.7) + 0.06), vec3(2.2));
}

// Khronos PBR Neutral's dark offset and highlight shoulder.
vec3 NeutralToneMapping(vec3 color) {
#ifdef OUTPUT_DISPLAY_P3
  vec3 p3 = max(a3dSceneSrgbToP3(color), vec3(0.0));
  float minimum = min(p3.r, min(p3.g, p3.b));
  float offset = minimum < 0.08 ? minimum * (1.0 - 6.25 * minimum) : 0.04;
  vec3 shifted = p3 - offset;
  float peak = max(shifted.r, max(shifted.g, shifted.b));
  float knee = 0.76;
  if (peak < knee) return a3dSceneP3ToSrgb(shifted);
  float shoulder = 1.0 - knee;
  float compressed = 1.0 - shoulder * shoulder / (peak + shoulder - knee);
  vec3 scaled = shifted * (compressed / peak);
  float keepColor = 1.0 / (1.0 + 0.15 * (peak - compressed));
  return a3dSceneP3ToSrgb(vec3(compressed) + (scaled - vec3(compressed)) * keepColor);
#else
  color = max(color, vec3(0.0));
  float minimum = min(color.r, min(color.g, color.b));
  float offset = minimum < 0.08 ? minimum * (1.0 - 6.25 * minimum) : 0.04;
  vec3 shifted = color - offset;
  float peak = max(shifted.r, max(shifted.g, shifted.b));
  float knee = 0.76;
  if (peak < knee) return shifted;
  float shoulder = 1.0 - knee;
  float compressed = 1.0 - shoulder * shoulder / (peak + shoulder - knee);
  vec3 scaled = shifted * (compressed / peak);
  float keepColor = 1.0 / (1.0 + 0.15 * (peak - compressed));
  return vec3(compressed) + (scaled - vec3(compressed)) * keepColor;
#endif
}
`;

export const OUTPUT_FRAGMENT_PROLOGUE_GLSL = `// a3d.output
precision highp float;
uniform sampler2D u_scene;
#ifdef BACKGROUND_COVERAGE
uniform sampler2D u_coverage;
#endif
uniform float u_exposure;
// float, not int: the device uploads numeric uniforms with uniform1f, and
// glUniform1f on an int uniform is GL_INVALID_OPERATION (#1140).
uniform float u_dither;
in vec2 v_uv;
layout(location = 0) out vec4 outColor;
#define saturate( a ) clamp( a, 0.0, 1.0 )
`;

export const OUTPUT_FRAGMENT_EPILOGUE_GLSL = `vec3 a3dLinearToSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(vec3(0.0031308), c)); }
#ifdef OUTPUT_ALPHA_PRESERVE
// Source-over stores premultiplied scene-linear light. Nonlinear tone and
// transfer functions must operate on unassociated light, not on RGB * alpha.
vec3 a3dUnassociateScene(vec4 scene) {
  if (scene.a <= 0.0) return vec3(0.0);
  return scene.rgb / min(scene.a, 1.0);
}
#endif
// The output colour transform follows the scene-linear tone curve. Both
// destinations use the same transfer curve; P3 differs in its primaries.
vec3 a3dOutputGamut(vec3 linearSrgb) {
#ifdef OUTPUT_DISPLAY_P3
  return a3dToneRows(linearSrgb,
    vec3(0.8224619687143624, 0.17753803128563794, 0.0),
    vec3(0.03319419885096169, 0.9668058011490385, 0.0),
    vec3(0.01708263072112004, 0.07239744066396342, 0.9105199286149166));
#else
  return linearSrgb;
#endif
}
// PRD-01 triangular output dither (±1 LSB, §8.4 output step): the inverse triangular CDF of
// interleaved gradient noise (Jimenez 2014). Same TPDF as two summed uniforms,
// but low-discrepancy, so every 16-px row window spans > 1 LSB and banding
// runs break (white sin-hash noise left 25-27 px runs, #1249 GPU).
float a3dTriangularNoise(vec2 p) {
  float u = fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
  return u < 0.5 ? sqrt(2.0 * u) - 1.0 : 1.0 - sqrt(2.0 - 2.0 * u);
}
#ifdef OUTPUT_VIGNETTE
uniform vec4 u_vignette;      // x = intensity, y = smoothness, z = roundness, w = aspect (w/h)
uniform vec3 u_vignetteColor; // linear multiplier at the frame edge
// PostGraph v2: the vignette is a light falloff, so it multiplies linear light before exposure and the tone operator.
vec3 a3dLinearVignette(vec3 color, vec2 uv) {
  vec2 p = (uv - 0.5) * 2.0;
  p.x *= u_vignette.w * u_vignette.z;
  float len = length(p) * u_vignette.x;
  return color * mix(vec3(1.0), u_vignetteColor, pow(clamp(len, 0.0, 1.0), u_vignette.y));
}
#endif
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
  c += a3dOutputGamut(u_overlayFlash.rgb) * u_overlayFlash.a;
  vec2 d = (uv - 0.5) * vec2(u_overlayShape.z, 1.0);
  float v = smoothstep(u_overlayShape.x, u_overlayShape.x + u_overlayShape.y, length(d));
  c = mix(c, a3dOutputGamut(u_overlayVignette.rgb), v * u_overlayVignette.a);
  c = mix(c, a3dOutputGamut(u_overlayFade.rgb), u_overlayFade.a);
  return a3dLinearToSRGB(clamp(c, 0.0, 1.0));
}
#endif
void main() {
  vec4 scene = texture(u_scene, v_uv);
  // A single NaN/Inf texel (some GPUs propagate them where others flush to zero) must not turn the frame black.
  if (any(isnan(scene)) || any(isinf(scene))) scene = vec4(0.0);
#ifdef OUTPUT_ALPHA_PRESERVE
  vec3 hdr = a3dUnassociateScene(scene);
  // Even finite channels may overflow when divided by an extremely small alpha.
  if (any(isnan(hdr)) || any(isinf(hdr))) hdr = vec3(0.0);
#else
  // Opaque output's alpha is a coverage tag and its raw clear can have RGB at alpha zero.
  vec3 hdr = scene.rgb;
#endif
#ifdef OUTPUT_VIGNETTE
  hdr = a3dLinearVignette(hdr, v_uv);
#endif
  // Coverage: drawn content is tone-mapped, the clear colour is not (three
  // r185: the clear is a raw glClear, tone mapping is per material). Without
  // the coverage attachment, HDR alpha carries it — cleared alpha 0, drawn 1.
#ifdef BACKGROUND_COVERAGE
  float a3dCoverage = texture(u_coverage, v_uv).r;
#elif defined(OUTPUT_FULL_COVERAGE) || defined(OUTPUT_ALPHA_PRESERVE)
  // In alpha-preserving output scene.a is opacity, not a coverage mask.
  float a3dCoverage = 1.0;
#else
  float a3dCoverage = clamp(scene.a, 0.0, 1.0);
#endif
  // The legacy opaque coverage mix operates on already-composited RGB. It
  // cannot independently tone-map translucent foreground and a raw background.
  vec3 display = mix(clamp(hdr, 0.0, 1.0), TONE_MAP(hdr * u_exposure), a3dCoverage);
  vec3 encoded = a3dLinearToSRGB(clamp(a3dOutputGamut(display), 0.0, 1.0));
  if (u_dither > 0.5) encoded += a3dTriangularNoise(gl_FragCoord.xy) / 255.0;
#ifdef OUTPUT_OVERLAY
  encoded = a3dApplyOutputOverlay(encoded, v_uv);
#endif
#ifdef OUTPUT_ALPHA_PRESERVE
  // No hidden color in transparent pixels, including after dither/overlay.
  // Clamp before re-association so encoded premultiplied RGB never exceeds alpha.
  if (scene.a <= 0.0) encoded = vec3(0.0);
  else encoded = clamp(encoded, 0.0, 1.0);
#endif
#ifdef OUTPUT_ALPHA_PREMULTIPLIED
  encoded *= clamp(scene.a, 0.0, 1.0);
#endif
#ifdef OUTPUT_ALPHA_PRESERVE
  outColor = vec4(encoded, clamp(scene.a, 0.0, 1.0));
#else
  outColor = vec4(encoded, 1.0);
#endif
}
`;

export const TONE_MAP_OPERATOR_FUNCTIONS: Readonly<Record<string, string>> = {
  none: "NoneToneMapping",
  linear: "LinearToneMapping",
  reinhard: "ReinhardToneMapping",
  aces: "ACESFilmicToneMapping",
  agx: "AgXToneMapping",
  neutral: "NeutralToneMapping",
  cineon: "CineonToneMapping"
};

/**
 * Display-space colour grade spliced into the output epilogue by `outputFragmentGlsl` (5.3.0). Kept out of
 * `OUTPUT_FRAGMENT_EPILOGUE_GLSL` so that published constant keeps its 5.2 text (its literal type is public API);
 * both pieces are guarded by `OUTPUT_COLOR_GRADE`, so a shader without that define is unchanged.
 */
const OUTPUT_COLOR_GRADE_FUNCTIONS_GLSL = `vec3 a3dClampClear(vec3 hdr) {
#ifdef OUTPUT_DISPLAY_P3
  return a3dSceneP3ToSrgb(clamp(a3dSceneSrgbToP3(hdr), 0.0, 1.0));
#else
  return clamp(hdr, 0.0, 1.0);
#endif
}
#ifdef OUTPUT_COLOR_GRADE
uniform vec4 u_gradeA; // x = contrast, y = temperature, z = tint, w = saturation
uniform vec4 u_gradeB; // x = vibrance, y = display vignette
vec3 a3dGradeSrgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
// The legacy fused present's colour grade (webgl2/LdrPostprocessShader.ts applyColorGrade). It is authored on
// sRGB-encoded display values, so it runs on the sRGB transfer of the tone-mapped linear-sRGB colour and decodes
// back; the destination gamut transform and final encode follow. On Display-P3, grading operates in Display-P3
// transfer space so wide-gamut colours are never clipped to the sRGB unit cube beforehand.
vec3 a3dOutputColorGrade(vec3 linearSrgb, vec2 uv) {
#ifdef OUTPUT_DISPLAY_P3
  vec3 color = a3dLinearToSRGB(clamp(a3dOutputGamut(linearSrgb), 0.0, 1.0));
#else
  vec3 color = a3dLinearToSRGB(clamp(linearSrgb, 0.0, 1.0));
#endif
  float contrast = u_gradeA.x;
  float contrastOffset = 0.5 - 0.5 * contrast;
  float redShift = u_gradeA.y * 0.08 - u_gradeA.z * 0.02;
  float greenShift = u_gradeA.z * 0.06;
  float blueShift = -u_gradeA.y * 0.08 - u_gradeA.z * 0.02;
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  vec3 graded = color * contrast + vec3(contrastOffset + redShift, contrastOffset + greenShift, contrastOffset + blueShift);
  float distanceFromLuma = min(1.0, abs(graded.r - luma) + abs(graded.g - luma) + abs(graded.b - luma));
  float vibranceBoost = u_gradeB.x == 0.0 ? 0.0 : u_gradeB.x * (1.0 - distanceFromLuma);
  float saturation = u_gradeA.w + vibranceBoost;
  graded = vec3(luma) + (graded - vec3(luma)) * saturation;
  vec2 centered = uv * 2.0 - 1.0;
  float vignette = 1.0 - u_gradeB.y * clamp((length(centered) - 0.28) / 1.12, 0.0, 1.0);
  vec3 linearGraded = a3dGradeSrgbToLinear(clamp(graded * vignette, 0.0, 1.0));
#ifdef OUTPUT_DISPLAY_P3
  return a3dSceneP3ToSrgb(linearGraded);
#else
  return linearGraded;
#endif
}
#endif
`;
const OUTPUT_COLOR_GRADE_CALL_GLSL = `#ifdef OUTPUT_COLOR_GRADE
  display = a3dOutputColorGrade(display, v_uv);
#endif
`;
const OUTPUT_MAIN_ANCHOR = "void main() {\n";
const OUTPUT_CLEAR_CLAMP_ANCHOR = "  vec3 display = mix(clamp(hdr, 0.0, 1.0), TONE_MAP(hdr * u_exposure), a3dCoverage);\n";
const OUTPUT_CLEAR_CLAMP_REPLACEMENT = "  vec3 display = mix(a3dClampClear(hdr), TONE_MAP(hdr * u_exposure), a3dCoverage);\n";
const OUTPUT_ENCODE_ANCHOR = "  vec3 encoded = a3dLinearToSRGB(clamp(a3dOutputGamut(display), 0.0, 1.0));\n";
function spliceOnce(source: string, anchor: string, insert: string): string {
  const index = source.indexOf(anchor);
  if (index < 0 || source.indexOf(anchor, index + 1) >= 0) throw new Error(`Output epilogue anchor must appear exactly once: ${anchor.trim()}`);
  return source.slice(0, index) + insert + source.slice(index);
}
function replaceOnce(source: string, anchor: string, replacement: string): string {
  const index = source.indexOf(anchor);
  if (index < 0 || source.indexOf(anchor, index + 1) >= 0) throw new Error(`Output epilogue anchor must appear exactly once: ${anchor.trim()}`);
  return source.slice(0, index) + replacement + source.slice(index + anchor.length);
}
/** The epilogue `outputFragmentGlsl` emits: the published epilogue plus the guarded colour grade. */
const OUTPUT_FRAGMENT_EPILOGUE_WITH_GRADE_GLSL = spliceOnce(
  replaceOnce(
    spliceOnce(OUTPUT_FRAGMENT_EPILOGUE_GLSL, OUTPUT_MAIN_ANCHOR, OUTPUT_COLOR_GRADE_FUNCTIONS_GLSL),
    OUTPUT_CLEAR_CLAMP_ANCHOR,
    OUTPUT_CLEAR_CLAMP_REPLACEMENT
  ),
  OUTPUT_ENCODE_ANCHOR,
  OUTPUT_COLOR_GRADE_CALL_GLSL
);
/**
 * Compose one output variant. Alpha-preserving variants consume associated
 * scene-linear RGB with opacity in alpha; opaque variants retain the legacy
 * RGB/background-coverage interpretation of the input.
 */
export function outputFragmentGlsl(options: {
  toneMapping: string;
  backgroundCoverage: boolean;
  overlay: boolean;
  vignette?: boolean;
  fullCoverage?: boolean;
  outputColorSpace?: "srgb" | "display-p3";
  alphaMode?: "opaque" | "straight" | "premultiplied";
  /** Run the legacy display-space colour grade (`u_gradeA`, `u_gradeB`) after the tone curve. */
  colorGrade?: boolean;
}): string {
  const fn = TONE_MAP_OPERATOR_FUNCTIONS[options.toneMapping] ?? TONE_MAP_OPERATOR_FUNCTIONS["aces"];
  const outputColorSpace = options.outputColorSpace ?? "srgb";
  const alphaMode = options.alphaMode ?? "opaque";
  if (outputColorSpace !== "srgb" && outputColorSpace !== "display-p3") {
    throw new Error(`OUTPUT_COLOR_SPACE_UNSUPPORTED:${String(outputColorSpace)}`);
  }
  if (alphaMode !== "opaque" && alphaMode !== "straight" && alphaMode !== "premultiplied") {
    throw new Error(`OUTPUT_ALPHA_MODE_UNSUPPORTED:${String(alphaMode)}`);
  }
  const defines = [
    `#define TONE_MAP(c) ${fn}(c)`,
    ...(options.backgroundCoverage ? ["#define BACKGROUND_COVERAGE"] : []),
    ...(options.overlay ? ["#define OUTPUT_OVERLAY"] : []),
    ...(options.vignette ? ["#define OUTPUT_VIGNETTE"] : []),
    ...(options.fullCoverage && !options.backgroundCoverage ? ["#define OUTPUT_FULL_COVERAGE"] : []),
    ...(outputColorSpace === "display-p3" ? ["#define OUTPUT_DISPLAY_P3"] : []),
    ...(alphaMode !== "opaque" ? ["#define OUTPUT_ALPHA_PRESERVE"] : []),
    ...(alphaMode === "premultiplied" ? ["#define OUTPUT_ALPHA_PREMULTIPLIED"] : []),
    ...(options.colorGrade ? ["#define OUTPUT_COLOR_GRADE"] : [])
  ];
  return [
    "#version 300 es",
    ...defines,
    OUTPUT_FRAGMENT_PROLOGUE_GLSL,
    TONE_MAPPING_OPERATORS_GLSL,
    OUTPUT_FRAGMENT_EPILOGUE_WITH_GRADE_GLSL
  ].join("\n");
}
