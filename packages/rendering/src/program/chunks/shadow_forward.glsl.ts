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

/**
 * GU47 eint (E-B handoff EB-3): `shadow_local` chunk — PRD-02 local-light (spot / point) shadow tiles on the default
 * forward path. Emitted after `shadow_forward` only when the draw binds local tiles (`features.shadows.localShadows > 0`,
 * `ForwardShadowMapOptions.localShadows`). The forward pass packs each tiled light's first tile + 1 into the unused
 * `right.w` (`u_lightData[i * 6 + 4].w`) and clears its `castsShadow` gate, so `a3dForwardLightShadow` (the sun's
 * map) skips it and `a3dLocalLightShadow` samples its tile instead.
 *
 * The atlas holds the tiles' perspective depth (`shadows/ShadowAtlas.ts`; sampling matrices map world -> tile
 * [0,1]^3, clip w = depth along the tile axis). Biases are in tile texels at the receiver's depth: the receiver moves
 * along its normal, then toward the light (same tile UV, nearer depth) before the hardware 2x2 compare.
 */
export const SHADOW_LOCAL_CHUNK_GLSL = /* glsl */ `
uniform highp sampler2DShadow u_localShadowAtlas;
uniform mat4 u_localShadowMatrices[6];
uniform vec4 u_localShadowRects[6];
uniform vec4 u_localShadowTexelScale[2];
// x strength, y constant bias, z slope bias, w normal offset (bias terms in tile texels)
uniform vec4 u_localShadowParams;
uniform vec2 u_localShadowAtlasTexel;

float a3dLocalShadowTile(int tile, vec3 worldPosition, vec3 normal, vec3 toLight) {
  vec3 n = normalize(normal);
  vec4 axis = u_localShadowMatrices[tile] * vec4(worldPosition, 1.0);
  if (axis.w <= 0.0) return 1.0;
  int scaleRow = tile / 4;
  float texelWorld = axis.w * u_localShadowTexelScale[scaleRow][tile - scaleRow * 4];
  float nDotL = clamp(abs(dot(n, toLight)), 0.0, 1.0);
  float slope = min(sqrt(max(1.0 - nDotL * nDotL, 0.0)) / max(nDotL, 0.05), 8.0);
  vec3 receiver = worldPosition + n * (texelWorld * u_localShadowParams.w);
  vec4 tilePosition = u_localShadowMatrices[tile] * vec4(receiver, 1.0);
  if (tilePosition.w <= 0.0) return 1.0;
  vec3 projected = tilePosition.xyz / tilePosition.w;
  if (projected.x < 0.0 || projected.x > 1.0 || projected.y < 0.0 || projected.y > 1.0 || projected.z > 1.0) return 1.0;
  vec3 biased = receiver + toLight * (texelWorld * (u_localShadowParams.y + u_localShadowParams.z * slope));
  vec4 biasedPosition = u_localShadowMatrices[tile] * vec4(biased, 1.0);
  float reference = clamp(biasedPosition.z / max(biasedPosition.w, 0.0001), 0.0, 1.0);
  vec4 rect = u_localShadowRects[tile];
  vec2 halfTexel = 0.5 * u_localShadowAtlasTexel;
  vec2 uv = clamp(rect.xy + projected.xy * rect.zw, rect.xy + halfTexel, rect.xy + rect.zw - halfTexel);
  float lit = texture(u_localShadowAtlas, vec3(uv, reference));
  return mix(1.0, lit, clamp(u_localShadowParams.x, 0.0, 1.0));
}

// slot = u_lightData[i * 6 + 4].w: 0 = no tile, k + 1 = the light's first tile k (a point light owns k .. k + 5,
// faces +X -X +Y -Y +Z -Z, the order ShadowAtlas plans them).
float a3dLocalLightShadow(float kind, float slot, vec3 lightPosition, vec3 worldPosition, vec3 normal, vec3 toLight) {
  if (slot < 0.5 || kind < 0.5 || kind > 2.5) return 1.0;
  int tile = int(slot + 0.5) - 1;
  if (kind < 1.5) {
    vec3 fromLight = worldPosition - lightPosition;
    vec3 a = abs(fromLight);
    tile += a.x >= a.y && a.x >= a.z ? (fromLight.x >= 0.0 ? 0 : 1) : (a.y >= a.z ? (fromLight.y >= 0.0 ? 2 : 3) : (fromLight.z >= 0.0 ? 4 : 5));
  }
  if (tile < 0 || tile > 5) return 1.0;
  return a3dLocalShadowTile(tile, worldPosition, normal, toLight);
}
`;
