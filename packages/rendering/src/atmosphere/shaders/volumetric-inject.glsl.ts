// PRD-07 P5-T6 — §8.7 froxel inject (per-slice draw into a 2D tiled atlas).
// Each draw is scissored to one tile; the fragment reconstructs the froxel
// world position from the view ray and slice depth, then writes (L, σ).
// GLSL ES 3.00.

export const PRD07_VOLUMETRIC_MARKER = "a3d_prd07_volumetric";

const VERT = `
// ${PRD07_VOLUMETRIC_MARKER} inject vertex
in vec2 a_pos;
out vec2 v_ndc;
void main() {
  v_ndc = a_pos;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG = `
// ${PRD07_VOLUMETRIC_MARKER} inject fragment
precision highp float;
uniform sampler2D u_noiseTex;    // unused placeholder channel (real 3D noise below)
uniform vec2 u_tileSize;         // tile pixel dims
uniform vec2 u_projTan;          // tanHalfFovX, tanHalfFovY
uniform mat4 u_invView;          // camera world matrix (rotation+translation)
uniform vec3 u_cameraPosition;
uniform float u_near;            // slice near (0.5)
uniform float u_far;             // volumetricFar (64 / 96)
uniform float u_slice;
uniform float u_slices;
uniform float u_jitter;          // Ultra temporal jitter in [0,1)
uniform vec4 u_fogDensity;       // σ_d, σ_h, b, h0 — height fog coefficients
uniform vec4 u_fogVolumes[16];   // centre.xyz+shape, halfSize.xyz+density (≤8)
uniform float u_noiseScale;
uniform float u_noiseSpeed;
uniform float u_noiseStrength;
uniform float u_time;
uniform vec3 u_sunDirection;
uniform vec3 u_sunColor;
uniform float u_anisotropy;      // HG g
uniform vec3 u_ambientColor;
uniform vec4 u_localLights[8];   // ≤4 lights: pos.xyz+intensity, color.rgb packed in second vec4
in vec2 v_ndc;
layout(location=0) out vec4 o_inject;

// --- density terms -------------------------------------------------------
float a3dInjectHeightDensity(vec3 p) {
  return u_fogDensity.y * exp(-u_fogDensity.z * (p.y - u_fogDensity.w)) + u_fogDensity.x;
}

float a3dInjectVolumeDensity(vec3 p) {
  float d = 0.0;
  for (int i = 0; i < 8; i++) {
    vec4 a = u_fogVolumes[i * 2];
    vec4 b = u_fogVolumes[i * 2 + 1];
    if (b.w <= 0.0) continue;
    vec3 q = (p - a.xyz) / max(b.xyz, vec3(1e-9));
    float inside = a.w > 0.5
      ? (1.0 - smoothstep(0.85, 1.0, dot(q, q)))
      : (1.0 - smoothstep(0.85, 1.0, max(max(abs(q.x), abs(q.y)), abs(q.z))));
    d += inside * b.w;
  }
  return d;
}

// 3D value noise — same hash family as the GPU-sim chunk (deterministic).
uint a3dVolHash(uint x) {
  x += 0x6d2b79f5u;
  uint t = (x ^ (x >> 15u)) * (1u | x);
  t = (t + ((t ^ (t >> 7u)) * (61u | t))) ^ t;
  return (t ^ (t >> 14u));
}
float a3dVolRand01(uint h) { return float(h) * (1.0 / 4294967296.0); }
float a3dVolLattice(ivec3 c) { return a3dVolRand01(a3dVolHash(uint(c.x * 3 ^ c.y * 7 ^ c.z * 13))); }
float a3dVolNoise(vec3 p) {
  ivec3 ip = ivec3(floor(p));
  vec3 fp = fract(p);
  vec3 u = fp * fp * (3.0 - 2.0 * fp);
  float n000 = a3dVolLattice(ip);
  float n100 = a3dVolLattice(ip + ivec3(1, 0, 0));
  float n010 = a3dVolLattice(ip + ivec3(0, 1, 0));
  float n110 = a3dVolLattice(ip + ivec3(1, 1, 0));
  float n001 = a3dVolLattice(ip + ivec3(0, 0, 1));
  float n101 = a3dVolLattice(ip + ivec3(1, 0, 1));
  float n011 = a3dVolLattice(ip + ivec3(0, 1, 1));
  float n111 = a3dVolLattice(ip + ivec3(1, 1, 1));
  float nx00 = mix(n000, n100, u.x);
  float nx10 = mix(n010, n110, u.x);
  float nx01 = mix(n001, n101, u.x);
  float nx11 = mix(n011, n111, u.x);
  return mix(mix(nx00, nx10, u.y), mix(nx01, nx11, u.y), u.z);   // [0,1]
}

// Henyey-Greenstein phase.
float a3dHG(float mu, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (12.5663706 * pow(1.0 + g2 - 2.0 * g * mu, 1.5));
}

void main() {
  // Tile-local uv → view ray at slice depth z_k (exponential distribution).
  vec2 uv = gl_FragCoord.xy / u_tileSize - floor(gl_FragCoord.xy / u_tileSize);
  vec2 ndc = uv * 2.0 - 1.0;
  float zk = u_near * pow(u_far / u_near, (u_slice + u_jitter) / u_slices);
  vec3 viewDir = vec3(ndc * u_projTan, -1.0);
  vec3 p = u_cameraPosition + (u_invView * vec4(viewDir * zk, 0.0)).xyz;

  float sigma = a3dInjectHeightDensity(p) + a3dInjectVolumeDensity(p);
  sigma += (a3dVolNoise(p * u_noiseScale + vec3(0.0, 0.0, -u_time * u_noiseSpeed)) * 2.0 - 1.0) * u_noiseStrength;
  sigma = max(sigma, 0.0);

  // Lighting: sun × visibility(stub 1.0) × HG + ambient SH stub + ≤4 locals.
  vec3 v = normalize(p - u_cameraPosition);
  float mu = dot(v, u_sunDirection);
  vec3 L = u_sunColor * a3dHG(mu, u_anisotropy) + u_ambientColor;
  for (int i = 0; i < 4; i++) {
    vec4 la = u_localLights[i * 2];
    vec4 lb = u_localLights[i * 2 + 1];
    if (la.w <= 0.0) continue;
    vec3 toLight = la.xyz - p;
    float d = max(length(toLight), 1e-4);
    L += lb.rgb * (la.w / (d * d)) * a3dHG(dot(v, toLight / d), u_anisotropy);
  }
  o_inject = vec4(L * sigma, sigma);
}
`;

export function volumetricInjectVertexSource(): string {
  return `#version 300 es\n${VERT}`;
}

export function volumetricInjectFragmentSource(): string {
  return `#version 300 es\n${FRAG}`;
}
