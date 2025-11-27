/**
 * @module ShaderChunks
 * @description Common GLSL and WGSL code chunks for shader composition.
 * Provides reusable shader code snippets for lighting, math, shadows, and more.
 */

import { Logger } from '../../core/Logger';

const logger = Logger.create('ShaderChunks');

/**
 * Shader language type
 */
export enum ShaderLanguage {
  /** GLSL ES 3.0 for WebGL2 */
  GLSL300 = 'glsl300',
  /** WGSL for WebGPU */
  WGSL = 'wgsl'
}

/**
 * Interface for a shader chunk
 */
export interface IShaderChunk {
  /** Chunk name identifier */
  name: string;
  /** GLSL 300 es implementation */
  glsl?: string;
  /** WGSL implementation */
  wgsl?: string;
  /** Dependencies on other chunks */
  dependencies?: string[];
}

/**
 * Collection of common shader code chunks for reuse across shaders.
 * Provides both GLSL 300 es and WGSL versions of each chunk.
 *
 * @example
 * ```typescript
 * // Get a chunk for a specific language
 * const chunk = ShaderChunks.getChunk('common_math', ShaderLanguage.GLSL300);
 *
 * // Register a custom chunk
 * ShaderChunks.registerChunk({
 *   name: 'my_custom_func',
 *   glsl: 'float myFunc(float x) { return x * 2.0; }',
 *   wgsl: 'fn myFunc(x: f32) -> f32 { return x * 2.0; }'
 * });
 * ```
 */
export class ShaderChunks {
  /**
   * Registry of all shader chunks
   */
  private static chunks: Map<string, IShaderChunk> = new Map();

  /**
   * Initialize with default chunks
   */
  private static initialized = false;

  /**
   * Ensures chunks are initialized
   */
  private static ensureInitialized(): void {
    if (!this.initialized) {
      this.registerDefaultChunks();
      this.initialized = true;
    }
  }

  /**
   * Register all default chunks
   */
  private static registerDefaultChunks(): void {
    // Math constants and utilities
    this.registerChunk({
      name: 'common_math',
      glsl: `
// Mathematical constants
const float PI = 3.14159265359;
const float TWO_PI = 6.28318530718;
const float HALF_PI = 1.57079632679;
const float INV_PI = 0.31830988618;
const float EPSILON = 1e-6;

// Utility functions
float saturate(float x) {
  return clamp(x, 0.0, 1.0);
}

vec2 saturate(vec2 x) {
  return clamp(x, 0.0, 1.0);
}

vec3 saturate(vec3 x) {
  return clamp(x, 0.0, 1.0);
}

vec4 saturate(vec4 x) {
  return clamp(x, 0.0, 1.0);
}

float square(float x) {
  return x * x;
}

vec2 square(vec2 x) {
  return x * x;
}

vec3 square(vec3 x) {
  return x * x;
}

float pow5(float x) {
  float x2 = x * x;
  return x2 * x2 * x;
}
`,
      wgsl: `
// Mathematical constants
const PI: f32 = 3.14159265359;
const TWO_PI: f32 = 6.28318530718;
const HALF_PI: f32 = 1.57079632679;
const INV_PI: f32 = 0.31830988618;
const EPSILON: f32 = 1e-6;

// Utility functions
fn saturate(x: f32) -> f32 {
  return clamp(x, 0.0, 1.0);
}

fn saturateVec2(x: vec2<f32>) -> vec2<f32> {
  return clamp(x, vec2<f32>(0.0), vec2<f32>(1.0));
}

fn saturateVec3(x: vec3<f32>) -> vec3<f32> {
  return clamp(x, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn saturateVec4(x: vec4<f32>) -> vec4<f32> {
  return clamp(x, vec4<f32>(0.0), vec4<f32>(1.0));
}

fn square(x: f32) -> f32 {
  return x * x;
}

fn squareVec2(x: vec2<f32>) -> vec2<f32> {
  return x * x;
}

fn squareVec3(x: vec3<f32>) -> vec3<f32> {
  return x * x;
}

fn pow5(x: f32) -> f32 {
  let x2 = x * x;
  return x2 * x2 * x;
}
`
    });

    // sRGB conversion
    this.registerChunk({
      name: 'color_srgb',
      glsl: `
// Convert linear RGB to sRGB
vec3 linearToSRGB(vec3 linear) {
  vec3 sRGB_lo = linear * 12.92;
  vec3 sRGB_hi = pow(linear, vec3(1.0 / 2.4)) * 1.055 - 0.055;
  return mix(sRGB_hi, sRGB_lo, step(linear, vec3(0.0031308)));
}

// Convert sRGB to linear RGB
vec3 sRGBToLinear(vec3 srgb) {
  vec3 linear_lo = srgb / 12.92;
  vec3 linear_hi = pow((srgb + 0.055) / 1.055, vec3(2.4));
  return mix(linear_hi, linear_lo, step(srgb, vec3(0.04045)));
}

// Convert linear RGB to sRGB with alpha
vec4 linearToSRGB(vec4 linear) {
  return vec4(linearToSRGB(linear.rgb), linear.a);
}

// Convert sRGB to linear RGB with alpha
vec4 sRGBToLinear(vec4 srgb) {
  return vec4(sRGBToLinear(srgb.rgb), srgb.a);
}
`,
      wgsl: `
// Convert linear RGB to sRGB
fn linearToSRGB(linear: vec3<f32>) -> vec3<f32> {
  let sRGB_lo = linear * 12.92;
  let sRGB_hi = pow(linear, vec3<f32>(1.0 / 2.4)) * 1.055 - 0.055;
  return select(sRGB_hi, sRGB_lo, linear <= vec3<f32>(0.0031308));
}

// Convert sRGB to linear RGB
fn sRGBToLinear(srgb: vec3<f32>) -> vec3<f32> {
  let linear_lo = srgb / 12.92;
  let linear_hi = pow((srgb + 0.055) / 1.055, vec3<f32>(2.4));
  return select(linear_hi, linear_lo, srgb <= vec3<f32>(0.04045));
}

// Convert linear RGB to sRGB with alpha
fn linearToSRGBAlpha(linear: vec4<f32>) -> vec4<f32> {
  return vec4<f32>(linearToSRGB(linear.rgb), linear.a);
}

// Convert sRGB to linear RGB with alpha
fn sRGBToLinearAlpha(srgb: vec4<f32>) -> vec4<f32> {
  return vec4<f32>(sRGBToLinear(srgb.rgb), srgb.a);
}
`,
      dependencies: ['common_math']
    });

    // Depth utilities
    this.registerChunk({
      name: 'depth_utils',
      glsl: `
// Linearize depth from depth buffer (perspective)
float linearizeDepth(float depth, float near, float far) {
  float z = depth * 2.0 - 1.0; // NDC [-1, 1]
  return (2.0 * near * far) / (far + near - z * (far - near));
}

// Calculate view-space Z from depth
float depthToViewZ(float depth, float near, float far) {
  return linearizeDepth(depth, near, far);
}

// Encode depth to RGBA for storage
vec4 encodeDepth(float depth) {
  const vec4 bitShift = vec4(1.0, 255.0, 65025.0, 16581375.0);
  const vec4 bitMask = vec4(1.0 / 255.0, 1.0 / 255.0, 1.0 / 255.0, 0.0);
  vec4 encoded = fract(depth * bitShift);
  encoded -= encoded.xxyz * bitMask;
  return encoded;
}

// Decode depth from RGBA
float decodeDepth(vec4 encoded) {
  const vec4 bitShift = vec4(1.0 / (255.0 * 255.0 * 255.0), 1.0 / (255.0 * 255.0), 1.0 / 255.0, 1.0);
  return dot(encoded, bitShift);
}
`,
      wgsl: `
// Linearize depth from depth buffer (perspective)
fn linearizeDepth(depth: f32, near: f32, far: f32) -> f32 {
  let z = depth * 2.0 - 1.0; // NDC [-1, 1]
  return (2.0 * near * far) / (far + near - z * (far - near));
}

// Calculate view-space Z from depth
fn depthToViewZ(depth: f32, near: f32, far: f32) -> f32 {
  return linearizeDepth(depth, near, far);
}

// Encode depth to RGBA for storage
fn encodeDepth(depth: f32) -> vec4<f32> {
  let bitShift = vec4<f32>(1.0, 255.0, 65025.0, 16581375.0);
  let bitMask = vec4<f32>(1.0 / 255.0, 1.0 / 255.0, 1.0 / 255.0, 0.0);
  var encoded = fract(depth * bitShift);
  encoded -= encoded.xxyz * bitMask;
  return encoded;
}

// Decode depth from RGBA
fn decodeDepth(encoded: vec4<f32>) -> f32 {
  let bitShift = vec4<f32>(1.0 / (255.0 * 255.0 * 255.0), 1.0 / (255.0 * 255.0), 1.0 / 255.0, 1.0);
  return dot(encoded, bitShift);
}
`,
      dependencies: ['common_math']
    });

    // Normal mapping (TBN matrix)
    this.registerChunk({
      name: 'normal_mapping',
      glsl: `
// Calculate TBN matrix from position, normal, and UV
mat3 calculateTBN(vec3 position, vec3 normal, vec2 uv) {
  vec3 dpx = dFdx(position);
  vec3 dpy = dFdy(position);
  vec2 duv_dx = dFdx(uv);
  vec2 duv_dy = dFdy(uv);

  vec3 N = normalize(normal);
  vec3 T = normalize(dpx * duv_dy.t - dpy * duv_dx.t);
  vec3 B = -normalize(cross(N, T));

  return mat3(T, B, N);
}

// Sample normal map and transform to world space
vec3 sampleNormalMap(sampler2D normalMap, vec2 uv, mat3 TBN) {
  vec3 tangentNormal = texture(normalMap, uv).xyz * 2.0 - 1.0;
  return normalize(TBN * tangentNormal);
}

// Perturb normal using height map (parallax)
vec2 parallaxMapping(vec2 uv, vec3 viewDir, sampler2D heightMap, float scale) {
  float height = texture(heightMap, uv).r;
  vec2 offset = viewDir.xy / viewDir.z * (height * scale);
  return uv - offset;
}

// Steep parallax mapping with occlusion
vec2 steepParallaxMapping(vec2 uv, vec3 viewDir, sampler2D heightMap, float scale, int numLayers) {
  float layerDepth = 1.0 / float(numLayers);
  float currentLayerDepth = 0.0;
  vec2 deltaUV = viewDir.xy / viewDir.z * scale / float(numLayers);

  vec2 currentUV = uv;
  float currentDepthMapValue = texture(heightMap, currentUV).r;

  for(int i = 0; i < numLayers && currentLayerDepth < currentDepthMapValue; i++) {
    currentUV -= deltaUV;
    currentDepthMapValue = texture(heightMap, currentUV).r;
    currentLayerDepth += layerDepth;
  }

  return currentUV;
}
`,
      wgsl: `
// Calculate TBN matrix from position, normal, and UV
fn calculateTBN(position: vec3<f32>, normal: vec3<f32>, uv: vec2<f32>) -> mat3x3<f32> {
  let dpx = dpdx(position);
  let dpy = dpdy(position);
  let duv_dx = dpdx(uv);
  let duv_dy = dpdy(uv);

  let N = normalize(normal);
  let T = normalize(dpx * duv_dy.y - dpy * duv_dx.y);
  let B = -normalize(cross(N, T));

  return mat3x3<f32>(T, B, N);
}

// Sample normal map and transform to world space
fn sampleNormalMap(normalMap: texture_2d<f32>, normalSampler: sampler, uv: vec2<f32>, TBN: mat3x3<f32>) -> vec3<f32> {
  let tangentNormal = textureSample(normalMap, normalSampler, uv).xyz * 2.0 - 1.0;
  return normalize(TBN * tangentNormal);
}

// Perturb normal using height map (parallax)
fn parallaxMapping(uv: vec2<f32>, viewDir: vec3<f32>, heightMap: texture_2d<f32>, heightSampler: sampler, scale: f32) -> vec2<f32> {
  let height = textureSample(heightMap, heightSampler, uv).r;
  let offset = viewDir.xy / viewDir.z * (height * scale);
  return uv - offset;
}
`
    });

    // PBR BRDF functions
    this.registerChunk({
      name: 'pbr_brdf',
      glsl: `
// Fresnel-Schlick approximation
vec3 fresnelSchlick(float cosTheta, vec3 F0) {
  return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
}

// Fresnel-Schlick with roughness
vec3 fresnelSchlickRoughness(float cosTheta, vec3 F0, float roughness) {
  return F0 + (max(vec3(1.0 - roughness), F0) - F0) * pow(1.0 - cosTheta, 5.0);
}

// Distribution GGX / Trowbridge-Reitz
float distributionGGX(vec3 N, vec3 H, float roughness) {
  float a = roughness * roughness;
  float a2 = a * a;
  float NdotH = max(dot(N, H), 0.0);
  float NdotH2 = NdotH * NdotH;

  float num = a2;
  float denom = (NdotH2 * (a2 - 1.0) + 1.0);
  denom = PI * denom * denom;

  return num / max(denom, EPSILON);
}

// Geometry Smith with Schlick-GGX
float geometrySchlickGGX(float NdotV, float roughness) {
  float r = (roughness + 1.0);
  float k = (r * r) / 8.0;

  float num = NdotV;
  float denom = NdotV * (1.0 - k) + k;

  return num / max(denom, EPSILON);
}

float geometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
  float NdotV = max(dot(N, V), 0.0);
  float NdotL = max(dot(N, L), 0.0);
  float ggx2 = geometrySchlickGGX(NdotV, roughness);
  float ggx1 = geometrySchlickGGX(NdotL, roughness);

  return ggx1 * ggx2;
}

// Cook-Torrance BRDF
vec3 cookTorranceBRDF(vec3 N, vec3 V, vec3 L, vec3 albedo, float metallic, float roughness) {
  vec3 H = normalize(V + L);

  // Calculate F0 (surface reflection at zero incidence)
  vec3 F0 = vec3(0.04);
  F0 = mix(F0, albedo, metallic);

  // Cook-Torrance BRDF components
  float NDF = distributionGGX(N, H, roughness);
  float G = geometrySmith(N, V, L, roughness);
  vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);

  vec3 numerator = NDF * G * F;
  float denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0);
  vec3 specular = numerator / max(denominator, EPSILON);

  // Energy conservation
  vec3 kS = F;
  vec3 kD = vec3(1.0) - kS;
  kD *= 1.0 - metallic;

  float NdotL = max(dot(N, L), 0.0);
  return (kD * albedo / PI + specular) * NdotL;
}
`,
      wgsl: `
// Fresnel-Schlick approximation
fn fresnelSchlick(cosTheta: f32, F0: vec3<f32>) -> vec3<f32> {
  return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
}

// Fresnel-Schlick with roughness
fn fresnelSchlickRoughness(cosTheta: f32, F0: vec3<f32>, roughness: f32) -> vec3<f32> {
  return F0 + (max(vec3<f32>(1.0 - roughness), F0) - F0) * pow(1.0 - cosTheta, 5.0);
}

// Distribution GGX / Trowbridge-Reitz
fn distributionGGX(N: vec3<f32>, H: vec3<f32>, roughness: f32) -> f32 {
  let a = roughness * roughness;
  let a2 = a * a;
  let NdotH = max(dot(N, H), 0.0);
  let NdotH2 = NdotH * NdotH;

  let num = a2;
  var denom = (NdotH2 * (a2 - 1.0) + 1.0);
  denom = PI * denom * denom;

  return num / max(denom, EPSILON);
}

// Geometry Smith with Schlick-GGX
fn geometrySchlickGGX(NdotV: f32, roughness: f32) -> f32 {
  let r = (roughness + 1.0);
  let k = (r * r) / 8.0;

  let num = NdotV;
  let denom = NdotV * (1.0 - k) + k;

  return num / max(denom, EPSILON);
}

fn geometrySmith(N: vec3<f32>, V: vec3<f32>, L: vec3<f32>, roughness: f32) -> f32 {
  let NdotV = max(dot(N, V), 0.0);
  let NdotL = max(dot(N, L), 0.0);
  let ggx2 = geometrySchlickGGX(NdotV, roughness);
  let ggx1 = geometrySchlickGGX(NdotL, roughness);

  return ggx1 * ggx2;
}

// Cook-Torrance BRDF
fn cookTorranceBRDF(N: vec3<f32>, V: vec3<f32>, L: vec3<f32>, albedo: vec3<f32>, metallic: f32, roughness: f32) -> vec3<f32> {
  let H = normalize(V + L);

  // Calculate F0 (surface reflection at zero incidence)
  var F0 = vec3<f32>(0.04);
  F0 = mix(F0, albedo, metallic);

  // Cook-Torrance BRDF components
  let NDF = distributionGGX(N, H, roughness);
  let G = geometrySmith(N, V, L, roughness);
  let F = fresnelSchlick(max(dot(H, V), 0.0), F0);

  let numerator = NDF * G * F;
  let denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0);
  let specular = numerator / max(denominator, EPSILON);

  // Energy conservation
  let kS = F;
  var kD = vec3<f32>(1.0) - kS;
  kD *= 1.0 - metallic;

  let NdotL = max(dot(N, L), 0.0);
  return (kD * albedo / PI + specular) * NdotL;
}
`,
      dependencies: ['common_math']
    });

    // Lambert and Phong lighting
    this.registerChunk({
      name: 'lighting_basic',
      glsl: `
// Lambert diffuse lighting
float lambertDiffuse(vec3 N, vec3 L) {
  return max(dot(N, L), 0.0);
}

// Phong specular lighting
float phongSpecular(vec3 N, vec3 L, vec3 V, float shininess) {
  vec3 R = reflect(-L, N);
  return pow(max(dot(R, V), 0.0), shininess);
}

// Blinn-Phong specular lighting
float blinnPhongSpecular(vec3 N, vec3 L, vec3 V, float shininess) {
  vec3 H = normalize(L + V);
  return pow(max(dot(N, H), 0.0), shininess);
}

// Half-Lambert (wrapped diffuse for subsurface scattering approximation)
float halfLambert(vec3 N, vec3 L) {
  float NdotL = dot(N, L);
  return NdotL * 0.5 + 0.5;
}

// Oren-Nayar diffuse (rough surfaces)
float orenNayar(vec3 N, vec3 L, vec3 V, float roughness) {
  float NdotL = dot(N, L);
  float NdotV = dot(N, V);

  float angleVN = acos(NdotV);
  float angleLN = acos(NdotL);

  float alpha = max(angleVN, angleLN);
  float beta = min(angleVN, angleLN);
  float gamma = dot(V - N * NdotV, L - N * NdotL);

  float roughnessSq = roughness * roughness;
  float A = 1.0 - 0.5 * (roughnessSq / (roughnessSq + 0.57));
  float B = 0.45 * (roughnessSq / (roughnessSq + 0.09));
  float C = sin(alpha) * tan(beta);

  return max(0.0, NdotL) * (A + B * max(0.0, gamma) * C);
}
`,
      wgsl: `
// Lambert diffuse lighting
fn lambertDiffuse(N: vec3<f32>, L: vec3<f32>) -> f32 {
  return max(dot(N, L), 0.0);
}

// Phong specular lighting
fn phongSpecular(N: vec3<f32>, L: vec3<f32>, V: vec3<f32>, shininess: f32) -> f32 {
  let R = reflect(-L, N);
  return pow(max(dot(R, V), 0.0), shininess);
}

// Blinn-Phong specular lighting
fn blinnPhongSpecular(N: vec3<f32>, L: vec3<f32>, V: vec3<f32>, shininess: f32) -> f32 {
  let H = normalize(L + V);
  return pow(max(dot(N, H), 0.0), shininess);
}

// Half-Lambert (wrapped diffuse for subsurface scattering approximation)
fn halfLambert(N: vec3<f32>, L: vec3<f32>) -> f32 {
  let NdotL = dot(N, L);
  return NdotL * 0.5 + 0.5;
}

// Oren-Nayar diffuse (rough surfaces)
fn orenNayar(N: vec3<f32>, L: vec3<f32>, V: vec3<f32>, roughness: f32) -> f32 {
  let NdotL = dot(N, L);
  let NdotV = dot(N, V);

  let angleVN = acos(NdotV);
  let angleLN = acos(NdotL);

  let alpha = max(angleVN, angleLN);
  let beta = min(angleVN, angleLN);
  let gamma = dot(V - N * NdotV, L - N * NdotL);

  let roughnessSq = roughness * roughness;
  let A = 1.0 - 0.5 * (roughnessSq / (roughnessSq + 0.57));
  let B = 0.45 * (roughnessSq / (roughnessSq + 0.09));
  let C = sin(alpha) * tan(beta);

  return max(0.0, NdotL) * (A + B * max(0.0, gamma) * C);
}
`,
      dependencies: ['common_math']
    });

    // Shadow sampling
    this.registerChunk({
      name: 'shadow_sampling',
      glsl: `
// Hard shadow sampling
float sampleShadowHard(sampler2DShadow shadowMap, vec3 shadowCoord) {
  return texture(shadowMap, shadowCoord);
}

// PCF (Percentage Closer Filtering) shadow sampling
float sampleShadowPCF(sampler2DShadow shadowMap, vec3 shadowCoord, vec2 texelSize, int kernelSize) {
  float shadow = 0.0;
  int samples = 0;

  for(int x = -kernelSize; x <= kernelSize; x++) {
    for(int y = -kernelSize; y <= kernelSize; y++) {
      vec2 offset = vec2(float(x), float(y)) * texelSize;
      shadow += texture(shadowMap, shadowCoord + vec3(offset, 0.0));
      samples++;
    }
  }

  return shadow / float(samples);
}

// Optimized 3x3 PCF
float sampleShadowPCF3x3(sampler2DShadow shadowMap, vec3 shadowCoord, vec2 texelSize) {
  float shadow = 0.0;

  shadow += texture(shadowMap, shadowCoord + vec3(-texelSize.x, -texelSize.y, 0.0));
  shadow += texture(shadowMap, shadowCoord + vec3(0.0, -texelSize.y, 0.0));
  shadow += texture(shadowMap, shadowCoord + vec3(texelSize.x, -texelSize.y, 0.0));
  shadow += texture(shadowMap, shadowCoord + vec3(-texelSize.x, 0.0, 0.0));
  shadow += texture(shadowMap, shadowCoord);
  shadow += texture(shadowMap, shadowCoord + vec3(texelSize.x, 0.0, 0.0));
  shadow += texture(shadowMap, shadowCoord + vec3(-texelSize.x, texelSize.y, 0.0));
  shadow += texture(shadowMap, shadowCoord + vec3(0.0, texelSize.y, 0.0));
  shadow += texture(shadowMap, shadowCoord + vec3(texelSize.x, texelSize.y, 0.0));

  return shadow / 9.0;
}

// VSM (Variance Shadow Mapping) shadow sampling
float sampleShadowVSM(sampler2D shadowMap, vec3 shadowCoord, float minVariance) {
  vec2 moments = texture(shadowMap, shadowCoord.xy).xy;

  float depth = shadowCoord.z;
  float p = step(depth, moments.x);

  float variance = moments.y - (moments.x * moments.x);
  variance = max(variance, minVariance);

  float d = depth - moments.x;
  float pMax = variance / (variance + d * d);

  return max(p, pMax);
}

// Poisson disk sampling for soft shadows
const vec2 poissonDisk[16] = vec2[16](
  vec2(-0.94201624, -0.39906216),
  vec2(0.94558609, -0.76890725),
  vec2(-0.094184101, -0.92938870),
  vec2(0.34495938, 0.29387760),
  vec2(-0.91588581, 0.45771432),
  vec2(-0.81544232, -0.87912464),
  vec2(-0.38277543, 0.27676845),
  vec2(0.97484398, 0.75648379),
  vec2(0.44323325, -0.97511554),
  vec2(0.53742981, -0.47373420),
  vec2(-0.26496911, -0.41893023),
  vec2(0.79197514, 0.19090188),
  vec2(-0.24188840, 0.99706507),
  vec2(-0.81409955, 0.91437590),
  vec2(0.19984126, 0.78641367),
  vec2(0.14383161, -0.14100790)
);

float sampleShadowPoisson(sampler2DShadow shadowMap, vec3 shadowCoord, vec2 texelSize, float radius) {
  float shadow = 0.0;

  for(int i = 0; i < 16; i++) {
    vec2 offset = poissonDisk[i] * texelSize * radius;
    shadow += texture(shadowMap, shadowCoord + vec3(offset, 0.0));
  }

  return shadow / 16.0;
}
`,
      wgsl: `
// Hard shadow sampling
fn sampleShadowHard(shadowMap: texture_depth_2d, shadowSampler: sampler_comparison, shadowCoord: vec3<f32>) -> f32 {
  return textureSampleCompare(shadowMap, shadowSampler, shadowCoord.xy, shadowCoord.z);
}

// PCF shadow sampling (simplified for WGSL)
fn sampleShadowPCF3x3(shadowMap: texture_depth_2d, shadowSampler: sampler_comparison, shadowCoord: vec3<f32>, texelSize: vec2<f32>) -> f32 {
  var shadow: f32 = 0.0;

  shadow += textureSampleCompare(shadowMap, shadowSampler, shadowCoord.xy + vec2<f32>(-texelSize.x, -texelSize.y), shadowCoord.z);
  shadow += textureSampleCompare(shadowMap, shadowSampler, shadowCoord.xy + vec2<f32>(0.0, -texelSize.y), shadowCoord.z);
  shadow += textureSampleCompare(shadowMap, shadowSampler, shadowCoord.xy + vec2<f32>(texelSize.x, -texelSize.y), shadowCoord.z);
  shadow += textureSampleCompare(shadowMap, shadowSampler, shadowCoord.xy + vec2<f32>(-texelSize.x, 0.0), shadowCoord.z);
  shadow += textureSampleCompare(shadowMap, shadowSampler, shadowCoord.xy, shadowCoord.z);
  shadow += textureSampleCompare(shadowMap, shadowSampler, shadowCoord.xy + vec2<f32>(texelSize.x, 0.0), shadowCoord.z);
  shadow += textureSampleCompare(shadowMap, shadowSampler, shadowCoord.xy + vec2<f32>(-texelSize.x, texelSize.y), shadowCoord.z);
  shadow += textureSampleCompare(shadowMap, shadowSampler, shadowCoord.xy + vec2<f32>(0.0, texelSize.y), shadowCoord.z);
  shadow += textureSampleCompare(shadowMap, shadowSampler, shadowCoord.xy + vec2<f32>(texelSize.x, texelSize.y), shadowCoord.z);

  return shadow / 9.0;
}

// VSM shadow sampling
fn sampleShadowVSM(shadowMap: texture_2d<f32>, shadowSampler: sampler, shadowCoord: vec3<f32>, minVariance: f32) -> f32 {
  let moments = textureSample(shadowMap, shadowSampler, shadowCoord.xy).xy;

  let depth = shadowCoord.z;
  let p = select(0.0, 1.0, depth <= moments.x);

  var variance = moments.y - (moments.x * moments.x);
  variance = max(variance, minVariance);

  let d = depth - moments.x;
  let pMax = variance / (variance + d * d);

  return max(p, pMax);
}
`
    });

    // Tonemapping operators
    this.registerChunk({
      name: 'tonemapping',
      glsl: `
// Linear tonemapping (simple exposure)
vec3 tonemapLinear(vec3 color, float exposure) {
  return color * exposure;
}

// Reinhard tonemapping
vec3 tonemapReinhard(vec3 color) {
  return color / (color + vec3(1.0));
}

// Reinhard luminance-based tonemapping
vec3 tonemapReinhardLuminance(vec3 color, float whitePoint) {
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  float toneMappedLuma = luma * (1.0 + luma / (whitePoint * whitePoint)) / (1.0 + luma);
  return color * (toneMappedLuma / luma);
}

// ACES Filmic tonemapping (approximation)
vec3 tonemapACES(vec3 color) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return saturate((color * (a * color + b)) / (color * (c * color + d) + e));
}

// Uncharted 2 tonemapping
vec3 tonemapUncharted2Partial(vec3 x) {
  const float A = 0.15;
  const float B = 0.50;
  const float C = 0.10;
  const float D = 0.20;
  const float E = 0.02;
  const float F = 0.30;
  return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
}

vec3 tonemapUncharted2(vec3 color, float exposureBias) {
  const float W = 11.2;
  color *= exposureBias;
  vec3 curr = tonemapUncharted2Partial(color);
  vec3 whiteScale = 1.0 / tonemapUncharted2Partial(vec3(W));
  return curr * whiteScale;
}

// AMD FidelityFX LPM (approximation)
vec3 tonemapAMD(vec3 color) {
  const vec3 a = vec3(0.2);
  const vec3 b = vec3(0.29);
  const vec3 c = vec3(0.24);
  const vec3 d = vec3(0.62);
  const vec3 e = vec3(0.02);
  return color * (color + a) / (color * (color + b) + c) + d * color + e;
}

// Neutral tonemapping (blend of multiple operators)
vec3 tonemapNeutral(vec3 color) {
  const float startCompression = 0.8;
  const float desaturation = 0.15;

  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;

  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;

  float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;

  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}
`,
      wgsl: `
// Linear tonemapping (simple exposure)
fn tonemapLinear(color: vec3<f32>, exposure: f32) -> vec3<f32> {
  return color * exposure;
}

// Reinhard tonemapping
fn tonemapReinhard(color: vec3<f32>) -> vec3<f32> {
  return color / (color + vec3<f32>(1.0));
}

// Reinhard luminance-based tonemapping
fn tonemapReinhardLuminance(color: vec3<f32>, whitePoint: f32) -> vec3<f32> {
  let luma = dot(color, vec3<f32>(0.2126, 0.7152, 0.0722));
  let toneMappedLuma = luma * (1.0 + luma / (whitePoint * whitePoint)) / (1.0 + luma);
  return color * (toneMappedLuma / luma);
}

// ACES Filmic tonemapping (approximation)
fn tonemapACES(color: vec3<f32>) -> vec3<f32> {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return saturateVec3((color * (a * color + b)) / (color * (c * color + d) + e));
}

// Uncharted 2 tonemapping
fn tonemapUncharted2Partial(x: vec3<f32>) -> vec3<f32> {
  let A = 0.15;
  let B = 0.50;
  let C = 0.10;
  let D = 0.20;
  let E = 0.02;
  let F = 0.30;
  return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
}

fn tonemapUncharted2(color: vec3<f32>, exposureBias: f32) -> vec3<f32> {
  let W = 11.2;
  let colorBiased = color * exposureBias;
  let curr = tonemapUncharted2Partial(colorBiased);
  let whiteScale = 1.0 / tonemapUncharted2Partial(vec3<f32>(W));
  return curr * whiteScale;
}

// ACES tonemapping
fn tonemapAMD(color: vec3<f32>) -> vec3<f32> {
  let a = vec3<f32>(0.2);
  let b = vec3<f32>(0.29);
  let c = vec3<f32>(0.24);
  let d = vec3<f32>(0.62);
  let e = vec3<f32>(0.02);
  return color * (color + a) / (color * (color + b) + c) + d * color + e;
}
`,
      dependencies: ['common_math']
    });
  }

  /**
   * Register a shader chunk
   *
   * @param chunk - The chunk to register
   *
   * @example
   * ```typescript
   * ShaderChunks.registerChunk({
   *   name: 'my_function',
   *   glsl: 'float myFunc(float x) { return x * 2.0; }',
   *   wgsl: 'fn myFunc(x: f32) -> f32 { return x * 2.0; }'
   * });
   * ```
   */
  static registerChunk(chunk: IShaderChunk): void {
    if (this.chunks.has(chunk.name)) {
      logger.warn(`Overwriting existing shader chunk: ${chunk.name}`);
    }
    this.chunks.set(chunk.name, chunk);
  }

  /**
   * Get a shader chunk for a specific language
   *
   * @param name - Chunk name
   * @param language - Target shader language
   * @returns Shader code or undefined if not found
   *
   * @example
   * ```typescript
   * const code = ShaderChunks.getChunk('common_math', ShaderLanguage.GLSL300);
   * ```
   */
  static getChunk(name: string, language: ShaderLanguage): string | undefined {
    this.ensureInitialized();

    const chunk = this.chunks.get(name);
    if (!chunk) {
      logger.warn(`Shader chunk not found: ${name}`);
      return undefined;
    }

    return language === ShaderLanguage.GLSL300 ? chunk.glsl : chunk.wgsl;
  }

  /**
   * Get all chunks with their dependencies resolved
   *
   * @param names - Chunk names to retrieve
   * @param language - Target shader language
   * @returns Combined shader code with dependencies
   *
   * @example
   * ```typescript
   * const code = ShaderChunks.getChunksWithDependencies(
   *   ['pbr_brdf', 'lighting_basic'],
   *   ShaderLanguage.GLSL300
   * );
   * ```
   */
  static getChunksWithDependencies(names: string[], language: ShaderLanguage): string {
    this.ensureInitialized();

    const resolved = new Set<string>();
    const code: string[] = [];

    const resolveChunk = (name: string): void => {
      if (resolved.has(name)) return;

      const chunk = this.chunks.get(name);
      if (!chunk) {
        logger.warn(`Shader chunk not found: ${name}`);
        return;
      }

      // Resolve dependencies first
      if (chunk.dependencies) {
        for (const dep of chunk.dependencies) {
          resolveChunk(dep);
        }
      }

      // Add this chunk
      const chunkCode = language === ShaderLanguage.GLSL300 ? chunk.glsl : chunk.wgsl;
      if (chunkCode) {
        code.push(chunkCode);
        resolved.add(name);
      }
    };

    for (const name of names) {
      resolveChunk(name);
    }

    return code.join('\n\n');
  }

  /**
   * Check if a chunk exists
   *
   * @param name - Chunk name
   * @returns True if chunk exists
   */
  static hasChunk(name: string): boolean {
    this.ensureInitialized();
    return this.chunks.has(name);
  }

  /**
   * Get all registered chunk names
   *
   * @returns Array of chunk names
   */
  static getChunkNames(): string[] {
    this.ensureInitialized();
    return Array.from(this.chunks.keys());
  }

  /**
   * Clear all registered chunks
   */
  static clear(): void {
    this.chunks.clear();
    this.initialized = false;
  }
}
