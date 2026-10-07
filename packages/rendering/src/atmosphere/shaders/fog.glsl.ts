// PRD-07 P4-T2 — `a3d_prd07_fog` chunk source (§8.4, C-21 FOG_CHUNK).
// Uniform-block variant: PRD 07 programs include this chunk and bind the
// u_fog* uniforms packed by HeightFog.packV2 (rendering side, CPU mirror in
// HeightFog.ts). Modes: 0 off, 1 height, 2 exp, 3 exp2, 4 linear,
// 5 absorption, 6 legacy-parity.
//
// Mode-6 slot aliasing (parity rule, §6.6): while forward geometry is on the
// legacy path this chunk evaluates a3dEnvironmentFogFactor verbatim, reading
// the packLegacy layout written into the same uniforms:
//   u_fogA = (legacyDensity, heightFalloff, heightReference, legacyMode)
//   u_fogB = (near, far, maxOpacity, 0)
// so sky/VFX/geometry never seam.

export const PRD07_FOG_CHUNK_GLSL = `
#ifndef A3D_PRD07_FOG_CHUNK
#define A3D_PRD07_FOG_CHUNK
#ifndef A3D_MAX_FOG_VOLUMES
#define A3D_MAX_FOG_VOLUMES 8
#endif
uniform vec4 u_fogA;   // σ_d, σ_h, b, h0 — mode 6: density, heightFalloff, heightReference, legacyMode
uniform vec4 u_fogB;   // start, maxOpacity, sunInscatter, anisotropy g — mode 6: near, far, maxOpacity, 0
uniform vec3 u_fogColor; uniform vec3 u_fogAbsorption; uniform float u_fogMode;  // 0 off,1 height,2 exp,3 exp2,4 linear,5 absorption,6 legacy-parity
uniform float u_fogNear; uniform float u_fogFar;                               // linear (mode 4) + legacy-parity distances
uniform vec4 u_fogVolumes[2 * A3D_MAX_FOG_VOLUMES];             // centre.xyz+shape, halfSize.xyz+density
#ifndef A3D_PRD07_FOG_ENV_UNIFORMS
#define A3D_PRD07_FOG_ENV_UNIFORMS
uniform vec3 u_cameraPosition;
uniform vec3 u_sunDirection;
uniform vec3 u_sunColor;
#endif

float a3dHeightFogTau(vec3 c, vec3 v, float d) {
  float dd = max(d - u_fogB.x, 0.0);
  float tau = u_fogA.x * dd;
  float k = u_fogA.z * v.y * dd;
  float line = abs(k) < 1e-4 ? 1.0 : (1.0 - exp(-k)) / k;
  tau += u_fogA.y * exp(-u_fogA.z * (c.y - u_fogA.w)) * dd * line;
  return tau;
}

float a3dFogVolumesTau(vec3 c, vec3 v, float d) {
  float tau = 0.0;
  for (int i = 0; i < A3D_MAX_FOG_VOLUMES; i++) {
    vec4 a = u_fogVolumes[i * 2];
    vec4 b = u_fogVolumes[i * 2 + 1];
    if (b.w <= 0.0) continue;
    vec3 lo = a.xyz - b.xyz;
    vec3 hi = a.xyz + b.xyz;
    float t0 = 0.0;
    float t1 = d;
    bool hit = true;
    for (int axis = 0; axis < 3; axis++) {
      float o = c[axis] - a.xyz[axis];
      float dv = v[axis];
      float half_ = b.xyz[axis];
      if (abs(dv) < 1e-9) {
        if (abs(o) > half_) { hit = false; }
        continue;
      }
      float ta = (-half_ - o) / dv;
      float tb = (half_ - o) / dv;
      t0 = max(t0, min(ta, tb));
      t1 = min(t1, max(ta, tb));
    }
    if (a.w > 0.5) {
      // ellipsoid → unit-sphere quadratic
      vec3 os = (c - a.xyz) / max(b.xyz, vec3(1e-9));
      vec3 vs = v / max(b.xyz, vec3(1e-9));
      float qa = dot(vs, vs);
      if (qa < 1e-12) { hit = false; }
      float qb = dot(os, vs);
      float qc = dot(os, os) - 1.0;
      float qd = qb * qb - qa * qc;
      if (qd < 0.0 || !hit) { hit = false; }
      else {
        float qr = sqrt(qd);
        t0 = max((-qb - qr) / qa, 0.0);
        t1 = min((-qb + qr) / qa, d);
      }
    } else {
      t0 = max(t0, 0.0);
      t1 = min(t1, d);
    }
    if (hit && t1 > t0) tau += (t1 - t0) * b.w;
  }
  return tau;
}

float a3dLegacyFogFactor(vec3 worldPosition) {
  // u_fogMode == 6.0 — verbatim a3dEnvironmentFogFactor over the aliased slots.
  float distanceToCamera = length(u_cameraPosition - worldPosition);
  float factor = 0.0;
  float legacyMode = u_fogA.w;
  if (legacyMode < 1.5) {
    factor = (distanceToCamera - u_fogB.x) / max(u_fogB.y - u_fogB.x, 0.000001);
  } else if (legacyMode < 2.5) {
    factor = 1.0 - exp(-max(u_fogA.x, 0.0) * distanceToCamera);
  } else {
    float scaledDensity = max(u_fogA.x, 0.0) * distanceToCamera;
    factor = 1.0 - exp(-(scaledDensity * scaledDensity));
  }
  float heightMultiplier = u_fogA.y > 0.0
    ? exp(-max(0.0, worldPosition.y - u_fogA.z) * u_fogA.y)
    : 1.0;
  return clamp(factor * heightMultiplier, 0.0, 1.0) * clamp(u_fogB.z, 0.0, 1.0);
}

float a3dFogAmount(vec3 worldPos) {
  if (u_fogMode == 6.0) return a3dLegacyFogFactor(worldPos);
  vec3 r = worldPos - u_cameraPosition; float d = length(r); vec3 v = r / max(d, 1e-5);
  float tau = (u_fogMode == 1.0) ? a3dHeightFogTau(u_cameraPosition, v, d)
            : (u_fogMode == 2.0) ? u_fogA.x * d
            : (u_fogMode == 3.0) ? (u_fogA.x * d) * (u_fogA.x * d) : 0.0;
  tau += a3dFogVolumesTau(u_cameraPosition, v, d);
  float f = (u_fogMode == 4.0) ? clamp((d - u_fogNear) / (u_fogFar - u_fogNear), 0.0, 1.0) : 1.0 - exp(-tau);
  return min(f, u_fogB.y);
}

vec3 a3dFogInscatter(vec3 v) {
  float g = u_fogB.w; float mu = dot(v, u_sunDirection);
  float hg = (1.0 - g * g) / (12.5663706 * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
  return u_fogColor + u_sunColor * hg * u_fogB.z;
}

vec3 a3dApplyFog(vec3 color, vec3 worldPos) {                  // stable entry point (PRD 10)
  if (u_fogMode == 0.0) return color;
  vec3 r = worldPos - u_cameraPosition; vec3 v = normalize(r);
  if (u_fogMode == 5.0) { vec3 T = exp(-u_fogAbsorption * length(r)); return color * T + u_fogColor * (1.0 - T); }
#if defined(FOG_VOLUMETRIC)
  vec4 s = a3dSampleFroxel(worldPos);                          // rgb inscatter, a transmittance
  color = color * s.a + s.rgb;                                 // near part from the volume
#endif
  float f = a3dFogAmount(worldPos);
  // Mode 6 (legacy parity): the legacy formula has no sun inscatter — u_fogB.z
  // is maxOpacity, NOT sunInscatter. Blend to the plain fog colour.
  vec3 fogged = (u_fogMode == 6.0) ? u_fogColor : a3dFogInscatter(v);
  return mix(color, fogged, f);
}
#endif // A3D_PRD07_FOG_CHUNK
`;

export const PRD07_FOG_SHADER_MARKER = "a3d_prd07_fog_v2";
