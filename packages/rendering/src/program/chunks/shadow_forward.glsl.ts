/**
 * `shadow_forward` chunk — directional/spot shadow-map receive for the
 * generated forward program (#1225).
 *
 * The generated program (A3D_QR_CORE, default-on since #1238) replaced the
 * legacy `aura3d/pbr-direct` shader for allow-listed materials, but its
 * `fragment:lights` loop never sampled a shadow map: `forward/Lighting.ts`
 * only binds `u_shadowMap*` when the program reflects them, so the bridged
 * prd02 cascade (and the flag-off legacy map) was dropped and every capture
 * was byte-identical to its no-shadows control.
 *
 * This chunk declares the legacy forward uniforms and the legacy
 * `a3dForwardShadowFactor`, text-identical to ShaderLibraryCore.ts (a unit
 * test pins the two), so the bound map is sampled exactly like the legacy
 * shader does. Emitted only when the draw has a shadow map
 * (`features.shadows.cascades > 0`). Point-light cube shadows stay legacy-only.
 *
 * `u_shadowMapNormalBias` (world units, three.js `shadow.normalBias`) offsets
 * the receiver along its normal before the lookup; 0 keeps the legacy result.
 */

import { CONTACT_SHADOW_MASK_GLSL } from "../../shaders/chunks/contact_shadow_mask.glsl";

export const SHADOW_FORWARD_FACTOR_GLSL = /* glsl */ `float a3dForwardShadowFactor(vec3 worldPosition, vec3 normal, vec3 lightDirection) {
  if (u_shadowMapEnabled < 0.5) return 1.0;
  vec4 lightPosition = u_shadowMapMatrix * vec4(worldPosition, 1.0);
  vec3 projected = lightPosition.xyz / max(lightPosition.w, 0.0001);
  vec2 uv = projected.xy * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 1.0;
  vec3 receiverNormal = normalize(normal);
  vec3 receiverLightDirection = lightDirection / max(length(lightDirection), 0.0001);
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
}`;

export const SHADOW_FORWARD_CHUNK_GLSL = /* glsl */ `
${CONTACT_SHADOW_MASK_GLSL}
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

${SHADOW_FORWARD_FACTOR_GLSL}

// Legacy gate (ShaderLibraryCore light loop): spotShadowLayer.z marks the
// shadow-casting light; directional (kind 0) and spot (kind 2) sample the
// forward map, point (kind 1) and rect (> 2.5, packed z = 0) do not.
float a3dForwardLightShadow(float kind, float castsShadow, vec3 worldPosition, vec3 normal, vec3 lightDirection) {
  if (castsShadow < 0.5 || (kind > 0.5 && kind < 1.5) || kind > 2.5) return 1.0;
  vec3 offsetPosition = worldPosition + normalize(normal) * u_shadowMapNormalBias;
  // WP-4: the contact-shadow mask rides the shadow-casting directional light's visibility only (kind 0).
  return a3dForwardShadowFactor(offsetPosition, normal, lightDirection) * a3dContactShadowMaskFactor(kind);
}
`;
