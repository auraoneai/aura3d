/**
 * `lights_legacy` chunk (PRD-01 §8.4) — default `fragment:lights` body helpers.
 *
 * Reads today's packed `u_lightData[96]` (6 vec4s per light:
 * colorIntensity, positionRange, directionKind, spotShadowLayer, areaRight,
 * areaUp; kind = directionKind.w: 0 dir, 1 point, 2 spot, >2.5 rect) so the
 * generator is complete with every other lane's stub. Attenuation is the
 * three.js r155+ `getDistanceAttenuation(d, cutoff, decay = 2)` — the legacy
 * `max(d², 1)` coupling is removed inside this chunk only.
 * The clustered path keeps `u_clusterLightData`/`u_clusterLightIndices`
 * under `#ifdef LIGHTS_CLUSTERED`. Shadow gates (`spotShadowLayer.z`) are
 * lane 02's C-11 — the default body does not sample shadows.
 */

export const LIGHTS_LEGACY_CHUNK_GLSL = /* glsl */ `
uniform vec4 u_lightData[96];
uniform float u_lightCount;
#ifdef LIGHTS_CLUSTERED
uniform sampler2D u_clusterLightData;
uniform sampler2D u_clusterLightIndices;
uniform vec2 u_clusterGridSize;
uniform vec2 u_clusterViewportSize;
#endif

// three.js r155+ physically based falloff: (1 - (d/cutoff)^4)^2 / pow(d, decay).
float a3dGetDistanceAttenuation(float distanceToLight, float cutoffDistance, float decayExponent) {
  float distanceFalloff = 1.0 / max(pow(distanceToLight, decayExponent), 0.01);
  if (cutoffDistance > 0.0) {
    float falloff = clamp(1.0 - pow(distanceToLight / cutoffDistance, 4.0), 0.0, 1.0);
    distanceFalloff *= falloff * falloff;
  }
  return distanceFalloff;
}

// Decode one packed light: returns radiance reaching worldPos, out L = direction to light.
vec3 a3dLegacyLightRadiance(int baseIndex, vec3 worldPos, out vec3 L) {
  vec4 colorIntensity = u_lightData[baseIndex];
  vec4 positionRange = u_lightData[baseIndex + 1];
  vec4 directionKind = u_lightData[baseIndex + 2];
  vec4 spotShadowLayer = u_lightData[baseIndex + 3];
  float kind = directionKind.w;
  if (kind < 0.5) {
    // directional: directionKind.xyz = light->world direction
    L = -directionKind.xyz;
    return colorIntensity.rgb * colorIntensity.a;
  }
  vec3 toLight = positionRange.xyz - worldPos;
  float distanceToLight = max(length(toLight), 0.0001);
  L = toLight / distanceToLight;
  float attenuation = a3dGetDistanceAttenuation(distanceToLight, positionRange.w, 2.0);
  if (kind > 1.5) {
    // spot: cone from packed angles (x outer radians, y penumbra fraction)
    vec3 lightToFragment = normalize(worldPos - positionRange.xyz);
    float cone = dot(normalize(directionKind.xyz), lightToFragment);
    float outer = cos(spotShadowLayer.x);
    float inner = cos(spotShadowLayer.x * max(1.0 - spotShadowLayer.y, 0.001));
    attenuation *= smoothstep(outer, inner, cone);
  }
  return colorIntensity.rgb * colorIntensity.a * attenuation;
}

#ifdef LIGHTS_CLUSTERED
// Clustered lookup for >8 lights: same packing from the cluster textures.
int a3dClusterIndex(vec2 fragCoord) {
  ivec2 clusterTile = clamp(
    ivec2(floor(fragCoord / max(u_clusterViewportSize / u_clusterGridSize, vec2(1.0)))),
    ivec2(0), ivec2(u_clusterGridSize) - ivec2(1)
  );
  return clusterTile.y * int(u_clusterGridSize.x) + clusterTile.x;
}
vec3 a3dClusteredLightRadiance(int lightIndex, vec3 worldPos, out vec3 L) {
  vec4 colorIntensity = texelFetch(u_clusterLightData, ivec2(0, lightIndex), 0);
  vec4 positionRange = texelFetch(u_clusterLightData, ivec2(1, lightIndex), 0);
  vec4 directionKind = texelFetch(u_clusterLightData, ivec2(2, lightIndex), 0);
  vec4 spotShadowLayer = texelFetch(u_clusterLightData, ivec2(3, lightIndex), 0);
  float kind = directionKind.w;
  if (kind < 0.5) {
    L = -directionKind.xyz;
    return colorIntensity.rgb * colorIntensity.a;
  }
  vec3 toLight = positionRange.xyz - worldPos;
  float distanceToLight = max(length(toLight), 0.0001);
  L = toLight / distanceToLight;
  float attenuation = a3dGetDistanceAttenuation(distanceToLight, positionRange.w, 2.0);
  if (kind > 1.5) {
    vec3 lightToFragment = normalize(worldPos - positionRange.xyz);
    float cone = dot(normalize(directionKind.xyz), lightToFragment);
    float outer = cos(spotShadowLayer.x);
    float inner = cos(spotShadowLayer.x * max(1.0 - spotShadowLayer.y, 0.001));
    attenuation *= smoothstep(outer, inner, cone);
  }
  return colorIntensity.rgb * colorIntensity.a * attenuation;
}
#endif
`;
