/**
 * Native presentation for the Aura3D OutputPass. The scene texture is linear
 * sRGB; tone mapping and the optional light-falloff vignette occur before the
 * output-primary transform and transfer function. This module deliberately
 * shares the GLSL pass's variant inputs and portable draw bindings. Preserved
 * alpha requires associated scene-linear RGB and opacity in the alpha channel;
 * opaque output instead retains the legacy RGB/background-coverage contract.
 */
import type { NativeShaderStages, PortableShaderBinding } from "../RenderDevice";

export interface OutputWgslOptions {
  readonly toneMapping: string;
  readonly backgroundCoverage: boolean;
  readonly overlay: boolean;
  readonly vignette?: boolean;
  readonly fullCoverage?: boolean;
  readonly outputColorSpace?: "srgb" | "display-p3";
  readonly alphaMode?: "opaque" | "straight" | "premultiplied";
  /** Legacy display-space colour grade after the tone curve (`u_gradeA`, `u_gradeB`); mirrors GLSL OUTPUT_COLOR_GRADE. */
  readonly colorGrade?: boolean;
}

/** WebGPU render-target textures have top-left UV origins. */
export const OUTPUT_VERTEX_WGSL = `// a3d.output
/* @aura3d-bindings */
struct OutputVertex {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};
@vertex fn vs_main(@location(0) position: vec3<f32>) -> OutputVertex {
  var output: OutputVertex;
  output.position = vec4<f32>(position, 1.0);
  output.uv = vec2<f32>(position.x * 0.5 + 0.5, 0.5 - position.y * 0.5);
  return output;
}`;

// Explicit rows avoid relying on a language's matrix-constructor ordering.
// These are the independently authored Aura3D curves in the existing output
// contract; inputs are already exposed and outputs are linear display light.
const OUTPUT_TONE_WGSL = `
fn a3dRows(v: vec3<f32>, r0: vec3<f32>, r1: vec3<f32>, r2: vec3<f32>) -> vec3<f32> {
  return vec3<f32>(dot(r0, v), dot(r1, v), dot(r2, v));
}
fn a3dToneNone(c: vec3<f32>) -> vec3<f32> { return c; }
fn a3dToneLinear(c: vec3<f32>) -> vec3<f32> { return clamp(c, vec3<f32>(0.0), vec3<f32>(1.0)); }
fn a3dReinhardChannel(v: f32) -> f32 {
  if (v < 0.0) { return v; }
  return v / (1.0 + v);
}
fn a3dToneReinhard(c: vec3<f32>) -> vec3<f32> {
  return vec3<f32>(a3dReinhardChannel(c.r), a3dReinhardChannel(c.g), a3dReinhardChannel(c.b));
}
fn a3dToneAces(c: vec3<f32>) -> vec3<f32> {
  let working = a3dRows(max(c, vec3<f32>(0.0)) / 0.6,
    vec3<f32>(0.59719, 0.35458, 0.04823),
    vec3<f32>(0.07600, 0.90834, 0.01566),
    vec3<f32>(0.02840, 0.13383, 0.83777));
  let numerator = (working + vec3<f32>(0.0245786)) * working - vec3<f32>(0.000090537);
  let denominator = (0.983729 * working + vec3<f32>(0.432951)) * working + vec3<f32>(0.238081);
  return clamp(a3dRows(numerator / denominator,
    vec3<f32>(1.60475, -0.53108, -0.07367),
    vec3<f32>(-0.10208, 1.10813, -0.00605),
    vec3<f32>(-0.00327, -0.07276, 1.07602)), vec3<f32>(0.0), vec3<f32>(1.0));
}
fn a3dAgxContrast(x: vec3<f32>) -> vec3<f32> {
  return (((((15.5 * x - vec3<f32>(40.14)) * x + vec3<f32>(31.96)) * x - vec3<f32>(6.868)) * x + vec3<f32>(0.4298)) * x + vec3<f32>(0.1191)) * x - vec3<f32>(0.00232);
}
fn a3dToneAgx(c: vec3<f32>) -> vec3<f32> {
  let wide = a3dRows(max(c, vec3<f32>(0.0)),
    vec3<f32>(0.6274, 0.3293, 0.0433), vec3<f32>(0.0691, 0.9195, 0.0113), vec3<f32>(0.0164, 0.0880, 0.8956));
  let inset = a3dRows(wide,
    vec3<f32>(0.856627153315983, 0.0951212405381588, 0.0482516061458583),
    vec3<f32>(0.137318972929847, 0.761241990602591, 0.101439036467562),
    vec3<f32>(0.11189821299995, 0.0767994186031903, 0.811302368396859));
  let logExposure = clamp((log2(max(inset, vec3<f32>(1e-10))) + vec3<f32>(12.47393)) / 16.499999, vec3<f32>(0.0), vec3<f32>(1.0));
  let outset = a3dRows(a3dAgxContrast(logExposure),
    vec3<f32>(1.1271005818144368, -0.11060664309660323, -0.016493938717834573),
    vec3<f32>(-0.1413297634984383, 1.157823702216272, -0.016493938717834257),
    vec3<f32>(-0.14132976349843826, -0.11060664309660294, 1.2519364065950405));
  let display = pow(max(outset, vec3<f32>(0.0)), vec3<f32>(2.2));
  return clamp(a3dRows(display,
    vec3<f32>(1.6605, -0.5876, -0.0728), vec3<f32>(-0.1246, 1.1329, -0.0083), vec3<f32>(-0.0182, -0.1006, 1.1187)), vec3<f32>(0.0), vec3<f32>(1.0));
}
fn a3dToneCineon(c: vec3<f32>) -> vec3<f32> {
  let x = max(c - vec3<f32>(0.004), vec3<f32>(0.0));
  return pow((x * (6.2 * x + vec3<f32>(0.5))) / (x * (6.2 * x + vec3<f32>(1.7)) + vec3<f32>(0.06)), vec3<f32>(2.2));
}
fn a3dToneNeutral(c: vec3<f32>) -> vec3<f32> {
  let color = max(c, vec3<f32>(0.0));
  let minimum = min(color.r, min(color.g, color.b));
  let offset = select(0.04, minimum * (1.0 - 6.25 * minimum), minimum < 0.08);
  let shifted = color - vec3<f32>(offset);
  let peak = max(shifted.r, max(shifted.g, shifted.b));
  let knee = 0.76;
  if (peak < knee) { return shifted; }
  let shoulder = 1.0 - knee;
  let compressed = 1.0 - shoulder * shoulder / (peak + shoulder - knee);
  let scaled = shifted * (compressed / peak);
  let keepColor = 1.0 / (1.0 + 0.15 * (peak - compressed));
  return vec3<f32>(compressed) + (scaled - vec3<f32>(compressed)) * keepColor;
}`;

const TONE_FUNCTIONS: Readonly<Record<string, string>> = Object.freeze({
  none: "a3dToneNone", linear: "a3dToneLinear", reinhard: "a3dToneReinhard",
  aces: "a3dToneAces", agx: "a3dToneAgx", neutral: "a3dToneNeutral", cineon: "a3dToneCineon"
});

const OUTPUT_TRANSFER_WGSL = `
fn a3dLinearToSrgb(c: vec3<f32>) -> vec3<f32> {
  return select(c * 12.92, 1.055 * pow(c, vec3<f32>(1.0 / 2.4)) - vec3<f32>(0.055), c >= vec3<f32>(0.0031308));
}
// Source-over stores associated scene-linear light. Tone/transfer need straight light.
fn a3dUnassociateScene(scene: vec4<f32>) -> vec3<f32> {
  if (scene.a <= 0.0) { return vec3<f32>(0.0); }
  return scene.rgb / min(scene.a, 1.0);
}
fn a3dTriangularNoise(p: vec2<f32>) -> f32 {
  let u = fract(52.9829189 * fract(dot(p, vec2<f32>(0.06711056, 0.00583715))));
  if (u < 0.5) { return sqrt(2.0 * u) - 1.0; }
  return 1.0 - sqrt(2.0 - 2.0 * u);
}`;

const OUTPUT_VIGNETTE_WGSL = `
fn a3dLinearVignette(color: vec3<f32>, uv: vec2<f32>) -> vec3<f32> {
  var p = (uv - vec2<f32>(0.5)) * 2.0;
  p.x = p.x * aura.u_vignette.w * aura.u_vignette.z;
  let len = length(p) * aura.u_vignette.x;
  return color * mix(vec3<f32>(1.0), aura.u_vignetteColor, pow(clamp(len, 0.0, 1.0), aura.u_vignette.y));
}`;

const OUTPUT_OVERLAY_WGSL = `
fn a3dSrgbToLinear(c: vec3<f32>) -> vec3<f32> {
  return select(c / 12.92, pow((c + vec3<f32>(0.055)) / 1.055, vec3<f32>(2.4)), c >= vec3<f32>(0.04045));
}
fn a3dApplyOutputOverlay(encoded: vec3<f32>, uv: vec2<f32>) -> vec3<f32> {
  if (aura.u_overlayShape.w < 0.5) { return encoded; }
  var color = a3dSrgbToLinear(encoded);
  color = color + a3dOutputGamut(aura.u_overlayFlash.rgb) * aura.u_overlayFlash.a;
  let d = (uv - vec2<f32>(0.5)) * vec2<f32>(aura.u_overlayShape.z, 1.0);
  let v = smoothstep(aura.u_overlayShape.x, aura.u_overlayShape.x + aura.u_overlayShape.y, length(d));
  color = mix(color, a3dOutputGamut(aura.u_overlayVignette.rgb), v * aura.u_overlayVignette.a);
  color = mix(color, a3dOutputGamut(aura.u_overlayFade.rgb), aura.u_overlayFade.a);
  return a3dLinearToSrgb(clamp(color, vec3<f32>(0.0), vec3<f32>(1.0)));
}`;

const OUTPUT_COLOR_GRADE_WGSL = `
fn a3dGradeSrgbToLinear(c: vec3<f32>) -> vec3<f32> {
  return select(c / 12.92, pow((c + vec3<f32>(0.055)) / 1.055, vec3<f32>(2.4)), c >= vec3<f32>(0.04045));
}
// Same display-space grade as the GLSL OUTPUT_COLOR_GRADE epilogue (sRGB-encoded grade, decoded before the gamut transform).
fn a3dOutputColorGrade(linearSrgb: vec3<f32>, uv: vec2<f32>) -> vec3<f32> {
  let color = a3dLinearToSrgb(clamp(linearSrgb, vec3<f32>(0.0), vec3<f32>(1.0)));
  let contrast = aura.u_gradeA.x;
  let contrastOffset = 0.5 - 0.5 * contrast;
  let redShift = aura.u_gradeA.y * 0.08 - aura.u_gradeA.z * 0.02;
  let greenShift = aura.u_gradeA.z * 0.06;
  let blueShift = -aura.u_gradeA.y * 0.08 - aura.u_gradeA.z * 0.02;
  let luma = dot(color, vec3<f32>(0.2126, 0.7152, 0.0722));
  var graded = color * contrast + vec3<f32>(contrastOffset + redShift, contrastOffset + greenShift, contrastOffset + blueShift);
  let distanceFromLuma = min(1.0, abs(graded.r - luma) + abs(graded.g - luma) + abs(graded.b - luma));
  let vibranceBoost = select(aura.u_gradeB.x * (1.0 - distanceFromLuma), 0.0, aura.u_gradeB.x == 0.0);
  let saturation = aura.u_gradeA.w + vibranceBoost;
  graded = vec3<f32>(luma) + (graded - vec3<f32>(luma)) * saturation;
  // GLSL v_uv is bottom-up; WebGPU uv is top-down. The radial vignette is symmetric, so either origin gives the same value.
  let centered = uv * 2.0 - vec2<f32>(1.0);
  let vignette = 1.0 - aura.u_gradeB.y * clamp((length(centered) - 0.28) / 1.12, 0.0, 1.0);
  return a3dGradeSrgbToLinear(clamp(graded * vignette, vec3<f32>(0.0), vec3<f32>(1.0)));
}`;

/**
 * Construct a native shader and its group-0 schema for a single OutputPass
 * variant. Resource order is scene sampler/texture followed by coverage when
 * requested. Unknown variants are errors, never an unrelated fallback.
 */
export function createOutputWgsl(options: OutputWgslOptions): {
  readonly webgpu: NativeShaderStages;
  readonly portableBindings: readonly PortableShaderBinding[];
} {
  if (!options || typeof options !== "object") throw new Error("OUTPUT_VARIANT_UNSUPPORTED:options");
  if (!Object.prototype.hasOwnProperty.call(TONE_FUNCTIONS, options.toneMapping)) {
    throw new Error(`OUTPUT_TONE_MAPPING_UNSUPPORTED:${String(options.toneMapping)}`);
  }
  const outputColorSpace = options.outputColorSpace === undefined ? "srgb" : options.outputColorSpace;
  const alphaMode = options.alphaMode === undefined ? "opaque" : options.alphaMode;
  if (outputColorSpace !== "srgb" && outputColorSpace !== "display-p3") {
    throw new Error(`OUTPUT_COLOR_SPACE_UNSUPPORTED:${String(outputColorSpace)}`);
  }
  if (alphaMode !== "opaque" && alphaMode !== "straight" && alphaMode !== "premultiplied") {
    throw new Error(`OUTPUT_ALPHA_MODE_UNSUPPORTED:${String(alphaMode)}`);
  }
  for (const [name, value] of Object.entries({
    backgroundCoverage: options.backgroundCoverage, overlay: options.overlay,
    vignette: options.vignette === undefined ? false : options.vignette,
    fullCoverage: options.fullCoverage === undefined ? false : options.fullCoverage,
    colorGrade: options.colorGrade === undefined ? false : options.colorGrade
  })) {
    if (typeof value !== "boolean") throw new Error(`OUTPUT_VARIANT_UNSUPPORTED:${name}`);
  }
  const portableBindings: PortableShaderBinding[] = [
    { name: "u_scene", kind: "texture2d", required: true },
    ...(options.backgroundCoverage ? [{ name: "u_coverage", kind: "texture2d" as const, required: true }] : []),
    { name: "u_exposure", kind: "float" },
    { name: "u_dither", kind: "float" },
    { name: "u_outputHeight", kind: "float" },
    ...(options.vignette ? [{ name: "u_vignette", kind: "vec4" as const }, { name: "u_vignetteColor", kind: "vec3" as const }] : []),
    ...(options.colorGrade ? [{ name: "u_gradeA", kind: "vec4" as const }, { name: "u_gradeB", kind: "vec4" as const }] : []),
    ...(options.overlay ? [
      { name: "u_overlayFlash", kind: "vec4" as const }, { name: "u_overlayVignette", kind: "vec4" as const },
      { name: "u_overlayShape", kind: "vec4" as const }, { name: "u_overlayFade", kind: "vec4" as const }
    ] : [])
  ];
  const gamut = outputColorSpace === "display-p3"
    ? `return a3dRows(linearSrgb,
    vec3<f32>(0.8224619687143624, 0.17753803128563794, 0.0),
    vec3<f32>(0.03319419885096169, 0.9668058011490385, 0.0),
    vec3<f32>(0.01708263072112004, 0.07239744066396342, 0.9105199286149166));`
    : "return linearSrgb;";
  const coverage = options.backgroundCoverage
    ? "textureSampleLevel(u_coverageTexture, u_coverageSampler, uv, 0.0).r"
    : options.fullCoverage || alphaMode !== "opaque" ? "1.0" : "clamp(scene.a, 0.0, 1.0)";
  const fragment = `// a3d.output
/* @aura3d-bindings */
${OUTPUT_TONE_WGSL}
${OUTPUT_TRANSFER_WGSL}
fn a3dOutputGamut(linearSrgb: vec3<f32>) -> vec3<f32> { ${gamut} }
${options.vignette ? OUTPUT_VIGNETTE_WGSL : ""}
${options.overlay ? OUTPUT_OVERLAY_WGSL : ""}${options.colorGrade ? `\n${OUTPUT_COLOR_GRADE_WGSL}` : ""}
@fragment fn fs_main(@location(0) uv: vec2<f32>, @builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  var scene = textureSampleLevel(u_sceneTexture, u_sceneSampler, uv, 0.0);
  // Exponent bits set in any component identify NaN or infinity, including alpha.
  let sceneBits = bitcast<vec4<u32>>(scene);
  if (any((sceneBits & vec4<u32>(0x7f800000u)) == vec4<u32>(0x7f800000u))) { scene = vec4<f32>(0.0); }
  ${alphaMode !== "opaque" ? `var hdr = a3dUnassociateScene(scene);
  // Division by an extremely small nonzero alpha can overflow even finite input.
  let hdrBits = bitcast<vec3<u32>>(hdr);
  if (any((hdrBits & vec3<u32>(0x7f800000u)) == vec3<u32>(0x7f800000u))) { hdr = vec3<f32>(0.0); }` : "var hdr = scene.rgb;"}
  ${options.vignette ? "hdr = a3dLinearVignette(hdr, uv);" : ""}
  let coverage = ${coverage};
  // Coverage mixes already-composited light; it cannot independently tone-map foreground and raw background.
  ${options.colorGrade ? "var" : "let"} display = mix(clamp(hdr, vec3<f32>(0.0), vec3<f32>(1.0)), ${TONE_FUNCTIONS[options.toneMapping]}(hdr * aura.u_exposure), coverage);${options.colorGrade ? "\n  display = a3dOutputColorGrade(display, uv);" : ""}
  var encoded = a3dLinearToSrgb(clamp(a3dOutputGamut(display), vec3<f32>(0.0), vec3<f32>(1.0)));
  // Match GLSL's bottom-left gl_FragCoord in the full destination framebuffer,
  // independent of the HDR input's size or a sub-viewport's origin.
  let glPixel = vec2<f32>(position.x, aura.u_outputHeight - position.y);
  if (aura.u_dither > 0.5) { encoded = encoded + vec3<f32>(a3dTriangularNoise(glPixel) / 255.0); }
  ${options.overlay ? "encoded = a3dApplyOutputOverlay(encoded, uv);" : ""}
  ${alphaMode !== "opaque" ? "if (scene.a <= 0.0) { encoded = vec3<f32>(0.0); } else { encoded = clamp(encoded, vec3<f32>(0.0), vec3<f32>(1.0)); }" : ""}
  ${alphaMode === "premultiplied" ? "encoded = encoded * clamp(scene.a, 0.0, 1.0);" : ""}
  return vec4<f32>(encoded, ${alphaMode === "opaque" ? "1.0" : "clamp(scene.a, 0.0, 1.0)"});
}`;
  return { webgpu: { vertex: OUTPUT_VERTEX_WGSL, fragment }, portableBindings };
}
