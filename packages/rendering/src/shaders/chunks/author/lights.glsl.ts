/**
 * GU47 E-D (PRD §3.1) `#include <a3d_lights>`: direct lighting for `material.custom` fragment shaders.
 *
 * `a3dDirect(N, V, albedo, roughness)` sums every direct light the built-in lit programs see: the packed direct lights
 * (`u_lightCount` / `u_lightData`, the same `LightUniforms.pack` layout and order: up to 16, ranked by contribution when a
 * scene has more) or, when the scene runs clustered forward lighting, this fragment's cluster list (`u_cluster*`). Each
 * light gets the built-in attenuation (range window, inverse-square, spot cone); the shadow-casting directional light is
 * darkened by `a3dSunShadow` (1 when the scene has no shadow map). The BRDF is GGX specular (correlated Smith visibility,
 * Schlick Fresnel with a dielectric F0 of 0.04) plus Lambert diffuse, with the built-ins' `albedo / pi * radiance * N·L`
 * convention, so a custom surface lit this way sits next to a built-in PBR one at the same exposure. Rect-area lights are
 * skipped. The 4-argument form reconstructs the world position from `gl_FragCoord` (`a3dFragWorldPosition`, exact for
 * any author vertex displacement); the 5-argument form takes the author's own world position.
 * The forward pass binds every uniform here only when the program declares it.
 */
export const A3D_LIGHTS_GLSL = /* glsl */ `
#include <a3d_shadow>
uniform float u_lightCount;
uniform vec4 u_lightData[96];
uniform float u_clusteredLightEnabled;
uniform vec2 u_clusterGridSize;
uniform vec2 u_clusterViewportSize;
uniform sampler2D u_clusterLightData;
uniform sampler2D u_clusterLightIndices;

vec3 a3dDirectLight(vec3 N, vec3 V, vec3 L, vec3 radiance, vec3 albedo, float roughness) {
  vec3 n = N / max(length(N), 1e-4);
  vec3 v = V / max(length(V), 1e-4);
  vec3 l = L / max(length(L), 1e-4);
  float nDotL = clamp(dot(n, l), 0.0, 1.0);
  vec3 halfVector = v + l;
  vec3 h = halfVector / max(length(halfVector), 1e-4);
  float nDotV = clamp(dot(n, v), 1e-4, 1.0);
  float nDotH = clamp(dot(n, h), 0.0, 1.0);
  float vDotH = clamp(dot(v, h), 0.0, 1.0);
  float alpha = max(clamp(roughness, 0.0, 1.0) * clamp(roughness, 0.0, 1.0), 0.002);
  float alpha2 = alpha * alpha;
  float denom = nDotH * nDotH * (alpha2 - 1.0) + 1.0;
  float distribution = alpha2 / max(3.14159265 * denom * denom, 1e-6);
  float lambdaV = nDotL * sqrt(max(nDotV * nDotV * (1.0 - alpha2) + alpha2, 0.0));
  float lambdaL = nDotV * sqrt(max(nDotL * nDotL * (1.0 - alpha2) + alpha2, 0.0));
  float visibility = 0.5 / max(lambdaV + lambdaL, 1e-5);
  float edge = 1.0 - vDotH;
  float edge2 = edge * edge;
  float fresnel = 0.04 + 0.96 * edge2 * edge2 * edge;
  vec3 diffuse = albedo * (1.0 - fresnel) * 0.31830989;
  return (diffuse + vec3(distribution * visibility * fresnel)) * radiance * nDotL;
}

vec3 a3dDirect(vec3 N, vec3 V, vec3 albedo, float roughness, vec3 worldPos) {
  vec3 total = vec3(0.0);
  bool clustered = u_clusteredLightEnabled > 0.5;
  int clusterIndex = 0;
  int count = min(int(u_lightCount), 16);
  if (clustered) {
    vec2 grid = max(u_clusterGridSize, vec2(1.0));
    ivec2 tile = clamp(ivec2(floor(gl_FragCoord.xy / max(u_clusterViewportSize / grid, vec2(1.0)))), ivec2(0), ivec2(grid) - ivec2(1));
    clusterIndex = tile.y * int(grid.x) + tile.x;
    count = min(int(texelFetch(u_clusterLightIndices, ivec2(0, clusterIndex), 0).g), 64);
  }
  for (int i = 0; i < 64; ++i) {
    if (i >= count) break;
    int lightIndex = clustered ? int(texelFetch(u_clusterLightIndices, ivec2(i, clusterIndex), 0).r) : i;
    vec4 colorIntensity;
    vec4 positionRange;
    vec4 directionKind;
    vec4 spotShadow;
    if (clustered) {
      colorIntensity = texelFetch(u_clusterLightData, ivec2(0, lightIndex), 0);
      positionRange = texelFetch(u_clusterLightData, ivec2(1, lightIndex), 0);
      directionKind = texelFetch(u_clusterLightData, ivec2(2, lightIndex), 0);
      spotShadow = texelFetch(u_clusterLightData, ivec2(3, lightIndex), 0);
    } else {
      int base = lightIndex * 6;
      colorIntensity = u_lightData[base];
      positionRange = u_lightData[base + 1];
      directionKind = u_lightData[base + 2];
      spotShadow = u_lightData[base + 3];
    }
    float kind = directionKind.w;
    if (kind > 2.5) continue;
    vec3 lightDirection = -directionKind.xyz;
    float attenuation = 1.0;
    if (kind > 0.5) {
      vec3 toLight = positionRange.xyz - worldPos;
      float distanceToLight = length(toLight);
      lightDirection = distanceToLight > 0.0001 ? toLight / distanceToLight : -directionKind.xyz;
      // Built-in window: range <= 0 is infinite, else (1 - (d / range)^4)^2, then inverse-square.
      float ratio = distanceToLight / max(positionRange.w, 0.0001);
      float ratio2 = ratio * ratio;
      float rangeFalloff = positionRange.w <= 0.0 ? 1.0 : clamp(1.0 - ratio2 * ratio2, 0.0, 1.0);
      rangeFalloff *= rangeFalloff;
      attenuation = rangeFalloff / max(distanceToLight * distanceToLight, 1.0);
    }
    if (kind > 1.5) {
      vec3 fromLight = worldPos - positionRange.xyz;
      vec3 axis = directionKind.xyz / max(length(directionKind.xyz), 1e-4);
      float cone = dot(axis, fromLight / max(length(fromLight), 1e-4));
      float outer = cos(spotShadow.x);
      float inner = cos(spotShadow.x * max(1.0 - spotShadow.y, 0.001));
      attenuation *= smoothstep(outer, inner, cone);
    }
    if (kind < 0.5 && spotShadow.z > 0.5) attenuation *= a3dSunShadow(worldPos, N, lightDirection);
    total += a3dDirectLight(N, V, lightDirection, colorIntensity.rgb * colorIntensity.a * attenuation, albedo, roughness);
  }
  return total;
}

vec3 a3dDirect(vec3 N, vec3 V, vec3 albedo, float roughness) {
  return a3dDirect(N, V, albedo, roughness, a3dFragWorldPosition());
}
`;
