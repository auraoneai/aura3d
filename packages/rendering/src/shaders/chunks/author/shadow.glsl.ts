/**
 * GU47 E-D (PRD §3.1) `a3d_scene`: the scene built-ins a `material.custom` shader may read, each bound by the forward pass
 * only when the program declares it (`ForwardPass.ts` `applyCustomShaderFrameUniforms` / `applyCustomShaderLightingUniforms`):
 *   - `u_a3dSunDirection`: unit direction from the surface toward the sun (the shadow-casting directional light, else the
 *     first directional light; straight up when the scene has none).
 *   - `u_a3dSunColor` (linear rgb) and `u_a3dSunIntensity`: that light's colour and intensity (0 when there is none).
 *   - `u_a3dHemiSky` / `u_a3dHemiGround`: the authored hemisphere light pair (linear rgb, premultiplied by intensity; 0 when none).
 *   - `u_a3dFogColor` / `u_a3dFogDensity`: the scene fog colour and an exp2 density (a linear fog gets the density that
 *     reaches 98% at `far`; 0 when the scene has no fog or the material opts out).
 * `#include <a3d_shadow>`, `<a3d_lights>` and `<a3d_ibl>` include it; the adapter expands each author chunk once per stage.
 */
export const A3D_SCENE_GLSL = /* glsl */ `
uniform vec3 u_a3dSunDirection;
uniform vec3 u_a3dSunColor;
uniform float u_a3dSunIntensity;
uniform vec3 u_a3dHemiSky;
uniform vec3 u_a3dHemiGround;
uniform vec3 u_a3dFogColor;
uniform float u_a3dFogDensity;

vec3 a3dSunRadiance() {
  return u_a3dSunColor * max(u_a3dSunIntensity, 0.0);
}

vec3 a3dHemiLight(vec3 n) {
  float up = clamp(n.y / max(length(n), 1e-4) * 0.5 + 0.5, 0.0, 1.0);
  return mix(u_a3dHemiGround, u_a3dHemiSky, up);
}

vec3 a3dSceneFog(vec3 color, float viewDistance) {
  float x = max(u_a3dFogDensity, 0.0) * max(viewDistance, 0.0);
  return mix(color, u_a3dFogColor, 1.0 - exp(-x * x));
}
`;

/**
 * `a3d_shadow`: sun-shadow receive for `material.custom` fragment shaders.
 *
 * The forward pass binds the key light's shadow map (cascade picked per draw, bias / slope bias / normal bias / PCF kernel
 * from the light's `shadow` options) to any program that declares the `u_shadowMap*` uniforms below. This chunk declares them
 * and wraps the same lookup the built-in lit programs use, so a custom surface is darkened by exactly the same shadow.
 * `a3dSunShadow` returns 1 in light and `1 - strength * occlusion` in shadow; it returns 1 when the scene has no shadow map.
 * `u_a3dSunDirection` (from `a3d_scene`) is bound to the direction from the surface toward the shadow-casting directional light.
 * GU47 E-D: `a3dFragWorldPosition()` reconstructs this fragment's world position from `gl_FragCoord` and the bound
 * `u_a3dInverseViewProjection` (exact for any author vertex displacement; no varying needed).
 */
export const A3D_SHADOW_GLSL = /* glsl */ `
#include <a3d_scene>
uniform mat4 u_a3dInverseViewProjection;
uniform sampler2D u_shadowMapTexture;
uniform float u_shadowMapEnabled;
uniform mat4 u_shadowMapMatrix;
uniform float u_shadowMapStrength;
uniform float u_shadowMapBias;
uniform float u_shadowMapSlopeBias;
uniform vec2 u_shadowMapTexelSize;
uniform float u_shadowPcfSampleCount;
uniform vec4 u_shadowPcfSamples[32];
uniform float u_shadowMapNormalBias;

float a3dSunShadow(vec3 worldPosition, vec3 normal, vec3 toLight) {
  if (u_shadowMapEnabled < 0.5) return 1.0;
  vec3 receiverNormal = normal / max(length(normal), 0.0001);
  vec3 receiverLightDirection = toLight / max(length(toLight), 0.0001);
  vec4 lightPosition = u_shadowMapMatrix * vec4(worldPosition + receiverNormal * u_shadowMapNormalBias, 1.0);
  vec3 projected = lightPosition.xyz / max(lightPosition.w, 0.0001);
  vec2 uv = projected.xy * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 1.0;
  float normalDotLight = clamp(abs(dot(receiverNormal, receiverLightDirection)), 0.0, 1.0);
  float slopeTangent = min(sqrt(max(1.0 - normalDotLight * normalDotLight, 0.0)) / max(normalDotLight, 0.05), 8.0);
  float slopeTexelBias = slopeTangent * u_shadowMapSlopeBias * max(u_shadowMapTexelSize.x, u_shadowMapTexelSize.y);
  float projectedDepth = clamp(projected.z * 0.5 + 0.5, 0.0, 1.0);
  float shadowed = 0.0;
  float totalWeight = 0.0;
  int sampleCount = clamp(int(u_shadowPcfSampleCount), 1, 32);
  for (int i = 0; i < 32; ++i) {
    if (i >= sampleCount) break;
    vec4 sampleData = u_shadowPcfSamples[i];
    float weight = max(sampleData.z, 0.0);
    vec2 offset = sampleData.xy * u_shadowMapTexelSize;
    float storedDepth = texture(u_shadowMapTexture, uv + offset).r;
    float sampleTexelDistance = max(1.0, length(sampleData.xy));
    float receiverDepth = projectedDepth - u_shadowMapBias - slopeTexelBias * sampleTexelDistance;
    shadowed += (receiverDepth > storedDepth ? 1.0 : 0.0) * weight;
    totalWeight += weight;
  }
  float occlusion = totalWeight > 0.0 ? shadowed / totalWeight : 0.0;
  return mix(1.0, 1.0 - occlusion, clamp(u_shadowMapStrength, 0.0, 1.0));
}

float a3dSunShadowAuto(vec3 worldPosition, vec3 normal) {
  return a3dSunShadow(worldPosition, normal, u_a3dSunDirection);
}

vec3 a3dFragWorldPosition() {
  vec2 ndc = gl_FragCoord.xy / max(u_resolution, vec2(1.0)) * 2.0 - 1.0;
  vec4 world = u_a3dInverseViewProjection * vec4(ndc, gl_FragCoord.z * 2.0 - 1.0, 1.0);
  float w = abs(world.w) > 1e-8 ? world.w : 1e-8;
  return world.xyz / w;
}
`;
