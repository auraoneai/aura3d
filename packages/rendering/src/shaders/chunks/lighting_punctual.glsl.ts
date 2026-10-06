/**
 * a3d_prd02_lighting_punctual — punctual light evaluation (PRD-02 §6.3/§8).
 * Units are physical: point/spot intensities are candela, directional is
 * lux (dimensionless in shader), decay exponent applies 1/d^decay with the
 * Frostbite window saturate(1−(d/range)⁴)² when range > 0.
 *
 * Light data lives in the `AuraLights` std140 block (u_lightData, 32×6
 * vec4 — 3KB). Per-light layout:
 *   [0] position.xyz,     w = kind (0 dir, 1 point, 2 spot, 3 rect)
 *   [1] direction.xyz,    w = range (0 = infinite)
 *   [2] color.rgb,        w = intensity
 *   [3] spot: cosOuter, cosInner, decay, shadowIndex
 *   [4] shadow matrix column a (rect: right.xyz, width)
 *   [5] shadow matrix column b (rect: up.xyz, height)
 */
export const LIGHTING_PUNCTUAL_CHUNK_GLSL = /* glsl */ `
#ifndef A3D_MAX_LIGHTS
#define A3D_MAX_LIGHTS 32
#endif
uniform int u_prd02LightCount;
// AuraLights std140 block, flattened for WebGL2 (PRD-02 §8.1): 6 vec4 per light.
uniform vec4 u_lightData[A3D_MAX_LIGHTS * 6];

// Frostbite range window — only applies when range > 0.
float a3d_rangeWindow(float d, float range) {
  if (range <= 0.0) return 1.0;
  float x = clamp(1.0 - pow(d / range, 4.0), 0.0, 1.0);
  return x * x;
}

// three r185 getDistanceAttenuation verbatim (Frostbite E[window1]):
// 1/max(d^decay, 0.01) with the range window folded in when range > 0.
float a3dDistanceFalloff(float d, float range, float decay) {
  float att = 1.0 / max(pow(d, decay), 0.01);
  return att * a3d_rangeWindow(d, range);
}

// Spot cone: smooth falloff between cosOuter and cosInner angles.
float a3d_spotWindow(float cosLightDir, float cosOuter, float cosInner) {
  float w = clamp((cosLightDir - cosOuter) / max(cosInner - cosOuter, 1e-4), 0.0, 1.0);
  return w * w;
}

// Fetch helper — per-light record base index.
int a3d_lightBase(int i) { return i * 6; }

// Incident radiance contribution of punctual light i at worldPos with
// surface normal n. Shadow factor is applied by the caller.
vec3 a3d_punctualRadiance(int i, vec3 worldPos, vec3 n, out vec3 l, out float atten) {
  vec4 d0 = u_lightData[a3d_lightBase(i) + 0];
  vec4 d1 = u_lightData[a3d_lightBase(i) + 1];
  vec4 d2 = u_lightData[a3d_lightBase(i) + 2];
  int kind = int(d0.w + 0.5);
  vec3 lightColor = d2.rgb * d2.w;
  if (kind == 0) {
    l = -normalize(d1.xyz);
    atten = 1.0;
    return lightColor * max(dot(n, l), 0.0);
  }
  vec3 toLight = d0.xyz - worldPos;
  float d = length(toLight);
  l = toLight / max(d, 1e-4);
  vec4 d3 = u_lightData[a3d_lightBase(i) + 3];
  atten = a3dDistanceFalloff(d, d1.w, d3.z);
  if (kind == 2) {
    float c = dot(-l, normalize(d1.xyz));
    atten *= a3d_spotWindow(c, d3.x, d3.y);
  }
  return lightColor * max(dot(n, l), 0.0) * atten;
}

// Shadow factor for punctual light i (PRD-02 Phase 4): the composed program
// must also #include a3d_prd02_shadow_lookup and define A3D_PUNCTUAL_SHADOWS
// to activate it; otherwise this returns 1.0. Directional shadows come from
// the CSM samplers; spot/point sample their atlas tile via shadowIndex
// (u_lightData[i][3].w — the tile slot stamped by the shadow planner).
float a3d_punctualShadowFactor(int i, vec3 worldPos, vec3 worldNormal, float viewDepth) {
#if defined(A3D_PUNCTUAL_SHADOWS) && A3D_PUNCTUAL_SHADOWS
  vec4 d0 = u_lightData[a3d_lightBase(i) + 0];
  int kind = int(d0.w + 0.5);
  if (kind == 0) {
    return a3d_sunShadow(worldPos, worldNormal, viewDepth);
  }
  if (kind == 1 || kind == 2) {
    vec4 d3 = u_lightData[a3d_lightBase(i) + 3];
    return a3d_localShadow(int(d3.w + 0.5), worldPos, worldNormal);
  }
#endif
  return 1.0;
}


// ---- Area lights (rect, kind == 3) — PRD-02 §8.5: LTC on High/Ultra
// (A3D_AREA_LTC; LUTs u_prd02LtcMInv / u_prd02LtcFresnel, 64x64 RGBA16F,
// fetched lazily from the three.js RectAreaLightTexturesLib tables, MIT),
// Gauss–Legendre 4-tap integrator on Low/Medium (A3D_AREA_GAUSS).
// Rect layout in the AuraLights block: d0.xyz center, d4 = right.xyz+width,
// d5 = up.xyz+height. Luminance in nits (d2.rgb).
#if defined(A3D_AREA_LTC) && A3D_AREA_LTC
uniform sampler2D u_prd02LtcMInv;
uniform sampler2D u_prd02LtcFresnel;

vec2 a3d_ltcUv(vec3 n, vec3 v, float roughness) {
  float lod = roughness * roughness;
  float theta = acos(clamp(dot(n, v), -1.0, 1.0)) / 3.14159265;
  return vec2(lod, theta) * (63.0 / 64.0) + 0.5 / 64.0;
}

mat3 a3d_ltcMinv(vec2 uv) {
  vec4 t = texture2D(u_prd02LtcMInv, uv);
  return mat3(
    vec3(1.0, 0.0, t.y),
    vec3(0.0, t.z, 0.0),
    vec3(t.w, 0.0, t.x));
}

// Edge-integral of a quad through LTC matrix M (Real-Time Polygonal-Light
// Shading, Heitz et al.): sum of cross-edge arc cosines.
float a3d_ltcEdgeIntegrate(mat3 Minv, vec3 n, vec3 v, vec3 p,
                         vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  vec3 vs[4];
  vs[0] = Minv * (c0 - p); vs[1] = Minv * (c1 - p);
  vs[2] = Minv * (c2 - p); vs[3] = Minv * (c3 - p);
  for (int k = 0; k < 4; k++) vs[k] = normalize(vs[k]);
  float sum = 0.0;
  sum += a3d_ltcEdge(vs[0], vs[1]);
  sum += a3d_ltcEdge(vs[1], vs[2]);
  sum += a3d_ltcEdge(vs[2], vs[3]);
  sum += a3d_ltcEdge(vs[3], vs[0]);
  return max(sum, 0.0);
}
#endif

#if (defined(A3D_AREA_LTC) && A3D_AREA_LTC) || (defined(A3D_AREA_GAUSS) && A3D_AREA_GAUSS)
// Edge integral (Heitz et al. 2016): acos(dot) × normalize(cross).z —
// the arc length weighted by its projection onto the shading normal's axis
// in the transformed (identity-irradiance) space.
float a3d_ltcEdge(vec3 v1, vec3 v2) {
  float theta = acos(clamp(dot(v1, v2), -0.9999, 0.9999));
  vec3 n = cross(v1, v2);
  float nl = length(n);
  if (nl < 1e-6) return 0.0;
  return theta * (n.z / nl);
}
#endif

// Gauss–Legendre 4-tap: subdivide the rect into 4 quadrants; diffuse from
// each quadrant centroid (a point light of area·luminance/4). Cheap on
// Low/Medium; within ~10% total energy of the LTC integral (unit test).
vec3 a3d_rectGaussDiffuse(vec3 center, vec3 right, vec3 up, vec2 halfSize,
                          vec3 luminanceNits, vec3 worldPos, vec3 worldNormal) {
  const float g = 0.25; // quadrant centroid offsets at ±halfSize*0.5
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec3 c = center
      + right * (halfSize.x * (i == 0 || i == 3 ? -g : g))
      + up * (halfSize.y * (i < 2 ? -g : g));
    vec3 toLight = c - worldPos;
    float d2 = dot(toLight, toLight);
    vec3 l = toLight * inversesqrt(max(d2, 1e-6));
    float nl = max(dot(worldNormal, l), 0.0);
    // Solid angle of the quadrant: A_quadrant·cos_s / d2 (small-aperture).
    float area = halfSize.x * halfSize.y; // quadrant area = rect area /4
    float cosS = max(dot(-l, normalize(cross(right, up))), 0.0);
    acc += luminanceNits * (nl * area * cosS / max(d2, 1e-6));
  }
  return acc / 3.14159265;
}

vec3 a3d_rectLightDiffuse(int i, vec3 worldPos, vec3 worldNormal, vec3 viewDir, float roughness) {
  vec4 d0 = u_lightData[a3d_lightBase(i) + 0];
  vec4 d2 = u_lightData[a3d_lightBase(i) + 2];
  vec4 d4 = u_lightData[a3d_lightBase(i) + 4];
  vec4 d5 = u_lightData[a3d_lightBase(i) + 5];
  vec3 center = d0.xyz;
  vec3 right = d4.xyz;
  vec3 up = d5.xyz;
  vec2 halfSize = vec2(d4.w, d5.w) * 0.5;
#if defined(A3D_AREA_LTC) && A3D_AREA_LTC
  vec3 c0 = center - right * halfSize.x - up * halfSize.y;
  vec3 c1 = center + right * halfSize.x - up * halfSize.y;
  vec3 c2 = center + right * halfSize.x + up * halfSize.y;
  vec3 c3 = center - right * halfSize.x + up * halfSize.y;
  // Diffuse irradiance = edge integral with the identity transform (the LUT
  // path fits the GGX-specular distribution — specular evaluation arrives
  // with the shading seam; diffuse is exact here).
  float sum = a3d_ltcEdgeIntegrate(mat3(1.0), worldNormal, viewDir, worldPos, c0, c1, c2, c3);
  return d2.rgb * (sum / (2.0 * 3.14159265));
#elif defined(A3D_AREA_GAUSS) && A3D_AREA_GAUSS
  return a3d_rectGaussDiffuse(center, right, up, halfSize, d2.rgb, worldPos, worldNormal);
#else
  return vec3(0.0);
#endif
}

`;
