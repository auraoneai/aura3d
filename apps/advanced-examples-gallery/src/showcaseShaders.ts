import {
  Material,
  createDefaultShaderLibrary,
  type ShaderLibrary
} from "@aura3d/rendering";

const GALLERY_WATER_SHADER = "a3d-gallery/animated-water";
const GALLERY_WATER_MARKER = "@aura3d-gallery-shader:animated-water-external-parity";

export interface GalleryWaterMaterialOptions {
  readonly name: string;
  readonly deepColor: readonly [number, number, number, number];
  readonly shallowColor: readonly [number, number, number, number];
  readonly highlightColor: readonly [number, number, number, number];
  readonly foamColor?: readonly [number, number, number, number];
  readonly foamGain?: number;
  readonly foamThreshold?: number;
  readonly foamSharpness?: number;
  readonly choppiness?: number;
  readonly specularIntensity?: number;
  readonly depthContrast?: number;
  readonly normalDetailScale?: number;
  readonly fresnelSkyTintStrength?: number;
  readonly reflectedHorizonBandStrength?: number;
  readonly opacity?: number;
}

export interface GalleryWaterFrameControls {
  readonly foamGain?: number;
  readonly foamThreshold?: number;
  readonly foamSharpness?: number;
  readonly choppiness?: number;
  readonly specularIntensity?: number;
  readonly depthContrast?: number;
  readonly normalDetailScale?: number;
  readonly fresnelSkyTintStrength?: number;
  readonly reflectedHorizonBandStrength?: number;
}

export interface GalleryWaterFrameParameters {
  readonly waveStrength: number;
  readonly rippleStrength: number;
  readonly surfaceRoughness: number;
  readonly foamGain: number;
  readonly foamThreshold: number;
  readonly foamSharpness: number;
  readonly choppiness: number;
  readonly specularIntensity: number;
  readonly depthContrast: number;
  readonly normalDetailScale: number;
  readonly fresnelSkyTintStrength: number;
  readonly reflectedHorizonBandStrength: number;
}

export class GalleryWaterMaterial extends Material {
  constructor(options: GalleryWaterMaterialOptions) {
    super({
      name: options.name,
      shaderKey: GALLERY_WATER_SHADER,
      renderState: {
        blend: true,
        depthWrite: false,
        cullMode: "none"
      },
      parameters: {
        u_modelViewProjection: identityMatrix(),
        u_modelMatrix: identityMatrix(),
        u_normalMatrix: identityMatrix(),
        u_time: 0,
        u_waveStrength: 1,
        u_rippleStrength: 0,
        u_surfaceRoughness: 0.22,
        u_deepColor: options.deepColor,
        u_shallowColor: options.shallowColor,
        u_highlightColor: options.highlightColor,
        u_foamColor: options.foamColor ?? [0.86, 0.96, 1, 1],
        u_foamGain: options.foamGain ?? 1.08,
        u_foamThreshold: options.foamThreshold ?? 0.32,
        u_foamSharpness: options.foamSharpness ?? 2.1,
        u_choppiness: options.choppiness ?? 0.78,
        u_specularIntensity: options.specularIntensity ?? 0.92,
        u_depthContrast: options.depthContrast ?? 1,
        u_normalDetailScale: options.normalDetailScale ?? 0.78,
        u_fresnelSkyTintStrength: options.fresnelSkyTintStrength ?? 0.42,
        u_reflectedHorizonBandStrength: options.reflectedHorizonBandStrength ?? 0.28,
        u_opacity: options.opacity ?? 0.86
      },
      requiredAttributes: ["a_position", "a_normal"],
      uniformSchema: [
        { name: "u_modelViewProjection", kind: "mat4" },
        { name: "u_modelMatrix", kind: "mat4" },
        { name: "u_normalMatrix", kind: "mat4" },
        { name: "u_time", kind: "float" },
        { name: "u_waveStrength", kind: "float" },
        { name: "u_rippleStrength", kind: "float" },
        { name: "u_surfaceRoughness", kind: "float" },
        { name: "u_deepColor", kind: "vec4" },
        { name: "u_shallowColor", kind: "vec4" },
        { name: "u_highlightColor", kind: "vec4" },
        { name: "u_foamColor", kind: "vec4" },
        { name: "u_foamGain", kind: "float" },
        { name: "u_foamThreshold", kind: "float" },
        { name: "u_foamSharpness", kind: "float" },
        { name: "u_choppiness", kind: "float" },
        { name: "u_specularIntensity", kind: "float" },
        { name: "u_depthContrast", kind: "float" },
        { name: "u_normalDetailScale", kind: "float" },
        { name: "u_fresnelSkyTintStrength", kind: "float" },
        { name: "u_reflectedHorizonBandStrength", kind: "float" },
        { name: "u_opacity", kind: "float" }
      ]
    });
  }

  setFrame(
    timeSeconds: number,
    waveStrength: number,
    rippleStrength: number,
    surfaceRoughness = 0.22,
    controls: GalleryWaterFrameControls = {}
  ): void {
    const frame = resolveGalleryWaterFrameParameters(waveStrength, rippleStrength, surfaceRoughness, controls);
    this.setParameter("u_time", timeSeconds);
    this.setParameter("u_waveStrength", frame.waveStrength);
    this.setParameter("u_rippleStrength", frame.rippleStrength);
    this.setParameter("u_surfaceRoughness", frame.surfaceRoughness);
    this.setParameter("u_foamGain", frame.foamGain);
    this.setParameter("u_foamThreshold", frame.foamThreshold);
    this.setParameter("u_foamSharpness", frame.foamSharpness);
    this.setParameter("u_choppiness", frame.choppiness);
    this.setParameter("u_specularIntensity", frame.specularIntensity);
    this.setParameter("u_depthContrast", frame.depthContrast);
    this.setParameter("u_normalDetailScale", frame.normalDetailScale);
    this.setParameter("u_fresnelSkyTintStrength", frame.fresnelSkyTintStrength);
    this.setParameter("u_reflectedHorizonBandStrength", frame.reflectedHorizonBandStrength);
  }
}

export function resolveGalleryWaterFrameParameters(
  waveStrength: number,
  rippleStrength: number,
  surfaceRoughness = 0.22,
  controls: GalleryWaterFrameControls = {}
): GalleryWaterFrameParameters {
  const roughness = clampNumber(finiteOr(surfaceRoughness, 0.22), 0, 1);
  const wave = Math.max(0, finiteOr(waveStrength, 0));
  const ripple = Math.max(0, finiteOr(rippleStrength, 0));
  return {
    waveStrength: wave,
    rippleStrength: ripple,
    surfaceRoughness: roughness,
    foamGain: clampNumber(
      finiteOr(controls.foamGain, 0.76 + wave * 0.14 + ripple * 0.42 + roughness * 0.55),
      0.45,
      2.6
    ),
    foamThreshold: clampNumber(
      finiteOr(controls.foamThreshold, 0.24 + roughness * 0.2 - Math.min(ripple, 1.2) * 0.035),
      0.12,
      0.62
    ),
    foamSharpness: clampNumber(
      finiteOr(controls.foamSharpness, 1.55 + roughness * 2.15 + Math.min(ripple, 1.4) * 0.48),
      1.2,
      4.6
    ),
    choppiness: clampNumber(
      finiteOr(controls.choppiness, 0.48 + wave * 0.16 + roughness * 1.2),
      0.25,
      2.5
    ),
    specularIntensity: clampNumber(
      finiteOr(controls.specularIntensity, 0.55 + (1 - roughness) * 0.62 + wave * 0.08),
      0.25,
      1.65
    ),
    depthContrast: clampNumber(
      finiteOr(controls.depthContrast, 0.86 + roughness * 0.34 + wave * 0.05),
      0.5,
      1.6
    ),
    normalDetailScale: clampNumber(
      finiteOr(controls.normalDetailScale, 0.42 + wave * 0.14 + roughness * 1.25),
      0.35,
      1.9
    ),
    fresnelSkyTintStrength: clampNumber(
      finiteOr(controls.fresnelSkyTintStrength, 0.18 + (1 - roughness) * 0.34 + wave * 0.035),
      0.12,
      0.72
    ),
    reflectedHorizonBandStrength: clampNumber(
      finiteOr(controls.reflectedHorizonBandStrength, 0.14 + (1 - roughness) * 0.24 + ripple * 0.035),
      0.08,
      0.48
    )
  };
}

export function createAdvancedGalleryShaderLibrary(): ShaderLibrary {
  const library = createDefaultShaderLibrary();
  library.register({
    name: GALLERY_WATER_SHADER,
    marker: GALLERY_WATER_MARKER,
    vertex: `#version 300 es
// ${GALLERY_WATER_MARKER}
precision highp float;
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
uniform mat4 u_modelViewProjection;
uniform mat4 u_modelMatrix;
uniform mat4 u_normalMatrix;
uniform float u_time;
uniform float u_waveStrength;
uniform float u_rippleStrength;
uniform float u_surfaceRoughness;
uniform float u_foamGain;
uniform float u_foamThreshold;
uniform float u_foamSharpness;
uniform float u_choppiness;
uniform float u_normalDetailScale;
out vec3 v_worldPosition;
out vec3 v_normal;
out float v_wave;
out float v_foam;
out float v_slope;
out float v_caustic;
out float v_ripple;

float waveField(vec2 p, float t) {
  float rough = clamp(u_surfaceRoughness, 0.0, 1.0);
  float chop = clamp(u_choppiness, 0.0, 2.6);
  float longA = sin(p.x * 0.58 + t * 0.78);
  float longB = sin(dot(p, vec2(0.42, 0.86)) * 0.92 - t * 0.56);
  float cross = sin(dot(p, vec2(-0.74, 0.52)) * 1.34 + t * 0.72);
  float swell = sin(dot(p, vec2(0.22, 0.98)) * 0.31 - t * 0.34) * 0.34;
  float capA = sin(p.x * 2.55 + p.y * 1.72 + t * 1.92) * mix(0.18, 0.34, rough) * chop;
  float capB = sin(dot(p, vec2(-1.9, 2.28)) + t * 2.35) * mix(0.1, 0.24, rough) * chop;
  float capC = sin(dot(p, vec2(2.8, 1.2)) - t * 2.86) * mix(0.06, 0.18, rough) * chop;
  float micro = sin(dot(p, vec2(5.2, -3.7)) + t * 3.8) * rough * 0.055 * chop;
  micro += sin(dot(p, vec2(-7.4, 4.1)) - t * 4.6) * rough * 0.028 * u_normalDetailScale;
  return (swell + longA * 0.46 + longB * 0.31 + cross * 0.16 + capA + capB + capC + micro) * u_waveStrength;
}

float rippleField(vec2 p, float t) {
  float center = length(p);
  float ringA = sin(center * 4.4 - t * 4.6) * exp(-center * 0.12);
  float ringB = sin(length(p - vec2(2.1, -1.35)) * 5.2 - t * 5.1) * exp(-length(p - vec2(2.1, -1.35)) * 0.22);
  float ringC = sin(length(p - vec2(-3.0, 1.8)) * 4.8 - t * 4.15) * exp(-length(p - vec2(-3.0, 1.8)) * 0.18);
  return (ringA * 0.055 + ringB * 0.035 + ringC * 0.026) * u_rippleStrength;
}

float causticField(vec2 p, float t) {
  float bandA = sin(dot(p, vec2(2.7, -1.4)) + t * 0.86);
  float bandB = sin(dot(p, vec2(-1.1, 3.3)) - t * 1.12);
  float bandC = sin(dot(p, vec2(4.9, 2.2)) + t * 1.74);
  float woven = bandA * bandB * 0.5 + bandC * 0.5;
  return smoothstep(0.56, 0.98, woven * 0.5 + 0.5);
}

void main() {
  vec3 local = a_position;
  float wave = waveField(local.xz, u_time);
  float interactive = rippleField(local.xz, u_time);
  local.y += wave * 0.12 + interactive;
  float probe = mix(0.12, 0.065, clamp(u_surfaceRoughness, 0.0, 1.0));
  float dx = waveField(local.xz + vec2(probe, 0.0), u_time) - waveField(local.xz - vec2(probe, 0.0), u_time);
  float dz = waveField(local.xz + vec2(0.0, probe), u_time) - waveField(local.xz - vec2(0.0, probe), u_time);
  float slope = length(vec2(dx, dz)) / max(0.0001, probe * 2.0);
  vec2 microGradient = vec2(
    sin(dot(local.xz, vec2(8.6, -3.1)) + u_time * 3.8),
    sin(dot(local.xz, vec2(-4.8, 7.2)) - u_time * 4.4)
  ) * u_surfaceRoughness * u_normalDetailScale * 0.014;
  vec3 normal = normalize(vec3(
    -dx * (0.8 + u_choppiness * 0.38) + microGradient.x,
    1.0,
    -dz * (0.8 + u_choppiness * 0.38) + microGradient.y
  ));
  float microFoam = smoothstep(0.58, 0.98, sin(dot(local.xz, vec2(3.7, -2.2)) + u_time * 1.7) * 0.5 + 0.5);
  float foamSignal = max(0.0, wave) * 0.58 + slope * 0.42 + abs(interactive) * 2.15 + microFoam * u_surfaceRoughness * 0.08;
  float foamWidth = max(0.035, 0.34 / max(1.0, u_foamSharpness));
  float caustics = causticField(local.xz + normal.xz * 0.75, u_time) * mix(0.42, 0.12, u_surfaceRoughness);
  vec4 world = u_modelMatrix * vec4(local, 1.0);
  v_worldPosition = world.xyz;
  v_normal = normalize((u_normalMatrix * vec4(normalize(mix(a_normal, normal, 0.86)), 0.0)).xyz);
  v_wave = wave;
  v_foam = smoothstep(u_foamThreshold, u_foamThreshold + foamWidth, foamSignal * u_foamGain);
  v_slope = slope;
  v_caustic = caustics;
  v_ripple = abs(interactive);
  gl_Position = u_modelViewProjection * vec4(local, 1.0);
}
`,
    fragment: `#version 300 es
// ${GALLERY_WATER_MARKER}
precision highp float;
uniform vec4 u_deepColor;
uniform vec4 u_shallowColor;
uniform vec4 u_highlightColor;
uniform vec4 u_foamColor;
uniform float u_opacity;
uniform float u_surfaceRoughness;
uniform float u_specularIntensity;
uniform float u_depthContrast;
uniform float u_fresnelSkyTintStrength;
uniform float u_reflectedHorizonBandStrength;
in vec3 v_worldPosition;
in vec3 v_normal;
in float v_wave;
in float v_foam;
in float v_slope;
in float v_caustic;
in float v_ripple;
out vec4 outColor;

void main() {
  vec3 viewDir = normalize(vec3(0.28, 0.55, 0.78));
  vec3 lightDir = normalize(vec3(-0.42, 0.76, 0.38));
  float rough = clamp(u_surfaceRoughness, 0.0, 1.0);
  float facing = clamp(dot(v_normal, viewDir), 0.0, 1.0);
  float fresnel = pow(1.0 - facing, mix(4.2, 2.4, rough));
  float light = clamp(dot(v_normal, lightDir), 0.0, 1.0);
  float depthTint = smoothstep(-0.28, 0.52, (v_wave + v_worldPosition.y * 0.08) * u_depthContrast);
  vec3 base = mix(u_deepColor.rgb, u_shallowColor.rgb, depthTint);
  vec3 absorption = mix(vec3(0.66, 0.9, 0.95), vec3(0.82, 1.03, 1.08), depthTint);
  base *= absorption * mix(0.82, 1.12, depthTint);
  vec3 halfDir = normalize(lightDir + viewDir);
  float gloss = mix(92.0, 18.0, rough);
  float tightSpec = pow(clamp(dot(v_normal, halfDir), 0.0, 1.0), gloss);
  float broadSpec = pow(light, mix(5.5, 2.2, rough)) * mix(0.08, 0.18, rough);
  float sparkle = pow(clamp(dot(reflect(-lightDir, v_normal), viewDir), 0.0, 1.0), mix(124.0, 34.0, rough)) * mix(0.16, 0.05, rough);
  float laneA = smoothstep(0.82, 0.995, sin(v_worldPosition.x * 2.7 + v_worldPosition.z * 0.42 + v_wave * 7.5) * 0.5 + 0.5);
  float laneB = smoothstep(0.86, 0.998, sin(dot(v_worldPosition.xz, vec2(-1.4, 2.2)) - v_wave * 5.8) * 0.5 + 0.5);
  float horizonBand = smoothstep(0.15, 0.98, fresnel + max(0.0, v_normal.z) * 0.32) * (laneA * 0.55 + laneB * 0.35);
  float foamMask = pow(clamp(v_foam, 0.0, 1.0), mix(1.85, 0.82, rough));
  float foamEdge = smoothstep(0.16, 0.92, foamMask + v_slope * rough * 0.06);
  float caustic = v_caustic * mix(0.34, 0.08, rough) * smoothstep(-0.18, 0.55, v_wave + v_slope * 0.05);
  float rippleGlow = smoothstep(0.01, 0.075, v_ripple) * mix(0.22, 0.08, rough);
  vec3 spec = u_highlightColor.rgb * (tightSpec + broadSpec + sparkle) * u_specularIntensity;
  vec3 foam = u_foamColor.rgb * foamEdge * mix(0.18, 0.48, rough);
  vec3 fresnelColor = u_highlightColor.rgb * fresnel * u_fresnelSkyTintStrength;
  vec3 horizonReflection = mix(u_highlightColor.rgb, u_foamColor.rgb, 0.32) * horizonBand * u_reflectedHorizonBandStrength;
  vec3 refractedTint = mix(vec3(0.02, 0.16, 0.24), u_shallowColor.rgb, depthTint) * (0.09 + caustic * 0.08);
  vec3 color = base + spec + foam + fresnelColor + horizonReflection + refractedTint + u_highlightColor.rgb * caustic + u_foamColor.rgb * rippleGlow;
  outColor = vec4(color, clamp(u_opacity + fresnel * 0.055 + foamEdge * 0.025, 0.0, 1.0));
}
`
  });
  return library;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function identityMatrix(): Float32Array {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]);
}
