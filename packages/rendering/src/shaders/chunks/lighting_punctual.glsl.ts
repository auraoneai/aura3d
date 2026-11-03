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
 *   [3] spot: cosOuter, cosInner, decay, shadowIndex; rect: x = twoSided
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

// Inverse-power falloff, bounded at the emitter, with a finite-range window.
float a3dDistanceFalloff(float d, float range, float decay) {
  float distanceToLight = max(d, 0.0);
  float power = decay <= 0.0 ? 1.0 : pow(distanceToLight, decay);
  float inversePower = 1.0 / max(power, 0.01);
  return inversePower * a3d_rangeWindow(distanceToLight, range);
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


// ---- Rectangular area lights.  The LTC tables are supplied by the renderer;
// the diffuse integral below uses the identity transform. Specular LTC still
// requires a material-aware call in the production light loop.
#if defined(A3D_AREA_LTC) && A3D_AREA_LTC
uniform sampler2D u_prd02LtcMInv;
uniform sampler2D u_prd02LtcFresnel;

vec2 a3d_ltcUv(vec3 n, vec3 v, float roughness) {
  float theta = acos(clamp(dot(n, v), 0.0, 1.0)) / 3.14159265;
  return vec2(roughness * roughness, theta) * (63.0 / 64.0) + 0.5 / 64.0;
}

mat3 a3d_ltcMinv(vec2 uv) {
  vec4 t = texture(u_prd02LtcMInv, uv);
  return mat3(vec3(1.0, 0.0, t.y), vec3(0.0, t.z, 0.0), vec3(t.w, 0.0, t.x));
}

// Integrate a spherical polygon in a basis whose z axis is the surface normal.
// Sutherland–Hodgman clipping prevents vertices below the horizon contributing
// negative or inverted solid angle. Up to eight vertices result from clipping.
float a3d_ltcEdgeIntegrate(mat3 Minv, vec3 n, vec3 v, vec3 p,
                           vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  vec3 normal = normalize(n);
  vec3 tangent = v - normal * dot(v, normal);
  if (dot(tangent, tangent) < 1e-8) {
    tangent = cross(abs(normal.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0), normal);
  }
  tangent = normalize(tangent);
  vec3 bitangent = cross(normal, tangent);
  mat3 worldToLocal = transpose(mat3(tangent, bitangent, normal));
  vec3 corners[4];
  corners[0] = Minv * worldToLocal * (c0 - p);
  corners[1] = Minv * worldToLocal * (c1 - p);
  corners[2] = Minv * worldToLocal * (c2 - p);
  corners[3] = Minv * worldToLocal * (c3 - p);
  vec3 clipped[8];
  int count = 0;
  for (int i = 0; i < 4; i++) {
    vec3 a = corners[i];
    vec3 b = corners[(i + 1) % 4];
    bool insideA = a.z > 0.0;
    bool insideB = b.z > 0.0;
    if (insideA) { clipped[count] = a; count++; }
    if (insideA != insideB) {
      float t = a.z / (a.z - b.z);
      clipped[count] = mix(a, b, t);
      count++;
    }
  }
  if (count < 3) return 0.0;
  float sum = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= count) break;
    vec3 a = normalize(clipped[i]);
    vec3 b = normalize(clipped[(i + 1) % count]);
    vec3 edge = cross(a, b);
    float edgeLength = length(edge);
    if (edgeLength > 1e-6) {
      sum += acos(clamp(dot(a, b), -1.0, 1.0)) * edge.z / edgeLength;
    }
  }
  return abs(sum);
}
#endif

// Tensor-product two-point Gauss–Legendre quadrature over the emitter.
// Four samples integrate diffuse intensity with a bounded small-emitter error.
vec3 a3d_rectGaussDiffuse(vec3 center, vec3 right, vec3 up, vec2 halfSize,
                          vec3 luminanceNits, vec3 worldPos, vec3 worldNormal) {
  const float g = 0.5773502691896258;
  vec3 acc = vec3(0.0);
  vec3 emitterNormal = normalize(cross(right, up));
  for (int i = 0; i < 4; i++) {
    vec3 c = center
      + right * (halfSize.x * (i == 0 || i == 3 ? -g : g))
      + up * (halfSize.y * (i < 2 ? -g : g));
    vec3 toLight = c - worldPos;
    float d2 = dot(toLight, toLight);
    vec3 l = toLight * inversesqrt(max(d2, 1e-6));
    float nl = max(dot(worldNormal, l), 0.0);
    float area = halfSize.x * halfSize.y;
    float cosS = max(dot(-l, emitterNormal), 0.0);
    acc += luminanceNits * (nl * area * cosS / max(d2, 1e-6));
  }
  return acc / 3.14159265;
}

vec3 a3d_rectLightDiffuse(int i, vec3 worldPos, vec3 worldNormal, vec3 viewDir, float roughness) {
  vec4 d0 = u_lightData[a3d_lightBase(i) + 0];
  vec4 d2 = u_lightData[a3d_lightBase(i) + 2];
  vec4 d3 = u_lightData[a3d_lightBase(i) + 3];
  vec4 d4 = u_lightData[a3d_lightBase(i) + 4];
  vec4 d5 = u_lightData[a3d_lightBase(i) + 5];
  vec3 center = d0.xyz;
  vec3 right = d4.xyz;
  vec3 up = d5.xyz;
  vec2 halfSize = vec2(d4.w, d5.w) * 0.5;
  float facing = dot(cross(right, up), worldPos - center);
  if (facing <= 0.0 && d3.x < 0.5) return vec3(0.0);
#if defined(A3D_AREA_LTC) && A3D_AREA_LTC
  vec3 c0 = center - right * halfSize.x - up * halfSize.y;
  vec3 c1 = center + right * halfSize.x - up * halfSize.y;
  vec3 c2 = center + right * halfSize.x + up * halfSize.y;
  vec3 c3 = center - right * halfSize.x + up * halfSize.y;
  // Diffuse irradiance = edge integral with the identity transform (the LUT
  // path fits the GGX-specular distribution — specular evaluation arrives
  // with the shading seam; diffuse is exact here).
  float sum = a3d_ltcEdgeIntegrate(mat3(1.0), worldNormal, viewDir, worldPos, c0, c1, c2, c3);
  return d2.rgb * d2.w * (sum / (2.0 * 3.14159265));
#elif defined(A3D_AREA_GAUSS) && A3D_AREA_GAUSS
  return a3d_rectGaussDiffuse(center, right, facing < 0.0 ? -up : up, halfSize, d2.rgb * d2.w, worldPos, worldNormal);
#else
  return vec3(0.0);
#endif
}

`;
