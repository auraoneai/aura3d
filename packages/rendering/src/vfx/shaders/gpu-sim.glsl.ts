// PRD-07 P5-T1 — §8.3 GPU particle sim (WebGL2 ping-pong, GLSL ES 3.00).
// Two single-target rgba32f passes per step until C-01/RenderTarget MRT lands
// (§6.2.3): pass A writes the pos+age texture, pass B writes vel+seed. Both
// read u_prevPos/u_prevVel and run the identical integration so A and B stay
// in lockstep. One texel per particle; index = y * u_stateWidth + x.

export const PRD07_GPU_SIM_MARKER = "a3d_prd07_gpu_sim";

const VERT = `
// ${PRD07_GPU_SIM_MARKER} vertex
in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const COMMON = `
// ${PRD07_GPU_SIM_MARKER} shared
precision highp float;
uniform sampler2D u_prevPos;      // xyz = position, w = age
uniform sampler2D u_prevVel;      // xyz = velocity, w = seed
uniform float u_stateWidth;
uniform float u_capacity;
uniform float u_emitHead;         // ring head (texel index)
uniform float u_emitCount;        // texels to (re)emit this step
uniform float u_frame;
uniform float u_seed;
uniform float u_dt;
uniform float u_time;
uniform vec3 u_gravity;
uniform vec3 u_wind;
uniform float u_drag;
uniform float u_noiseFreq;
uniform float u_noiseScroll;
uniform float u_noiseStrength;
uniform float u_groundPlane;
uniform float u_bounce;
uniform float u_lifeLoss;
uniform float u_useHeightfield;
uniform sampler2D u_heightfield;
uniform float u_heightUvScale;
uniform float u_heightMax;
uniform float u_lifetimeMax;
uniform vec3 u_emitOrigin;
uniform vec3 u_emitDirection;
uniform float u_emitSpread;
uniform vec2 u_emitSpeed;
uniform float u_emitDisc;         // spawn-disc radius (matches CpuEmitter 0.05)

// uint hash → [0,1) — identical to the TS mirror (mulberry32-style round).
uint a3dHash(uint x) {
  x += 0x6d2b79f5u;
  uint t = (x ^ (x >> 15u)) * (1u | x);
  t = (t + ((t ^ (t >> 7u)) * (61u | t))) ^ t;
  return (t ^ (t >> 14u));
}
float a3dRand01(uint h) {
  return float(h) * (1.0 / 4294967296.0);
}
vec3 a3dRand3(uint h) {
  return vec3(
    a3dRand01(a3dHash(h)),
    a3dRand01(a3dHash(h ^ 0x9e3779b9u)),
    a3dRand01(a3dHash(h ^ 0x85ebca6bu))
  );
}

// true when index is inside the ring slice [head, head+count) mod capacity.
bool a3dInRing(int index, int head, int count, int capacity) {
  int m = index - head;
  if (m < 0) m += capacity;
  return m >= 0 && m < count;
}

// 3D value noise (lattice hash + smoothstep trilinear). CPU mirror in
// ParticleGpuSim.ts (a3dValueNoise) — keep constants identical.
float a3dLattice(ivec3 c) {
  // int lattice coords → uint hash (uint(float) of negatives is UB — keep int).
  return a3dRand01(a3dHash(uint(c.x * 3 ^ c.y * 7 ^ c.z * 13)));
}
float a3dValueNoise(vec3 p) {
  ivec3 ip = ivec3(floor(p));
  vec3 fp = fract(p);
  vec3 u = fp * fp * (3.0 - 2.0 * fp);
  float n000 = a3dLattice(ip);
  float n100 = a3dLattice(ip + ivec3(1, 0, 0));
  float n010 = a3dLattice(ip + ivec3(0, 1, 0));
  float n110 = a3dLattice(ip + ivec3(1, 1, 0));
  float n001 = a3dLattice(ip + ivec3(0, 0, 1));
  float n101 = a3dLattice(ip + ivec3(1, 0, 1));
  float n011 = a3dLattice(ip + ivec3(0, 1, 1));
  float n111 = a3dLattice(ip + ivec3(1, 1, 1));
  float nx00 = mix(n000, n100, u.x);
  float nx10 = mix(n010, n110, u.x);
  float nx01 = mix(n001, n101, u.x);
  float nx11 = mix(n011, n111, u.x);
  return mix(mix(nx00, nx10, u.y), mix(nx01, nx11, u.y), u.z) * 2.0 - 1.0;
}

// Curl of the vector noise field F = (N(p), N(p+o1), N(p+o2)), ε = 0.1.
vec3 a3dCurlNoise(vec3 p) {
  const float e = 0.1;
  const vec3 o1 = vec3(31.416, -47.853, 12.793);
  const vec3 o2 = vec3(-233.145, -11.719, 95.637);
  float dFx_dz = (a3dValueNoise(p + vec3(0.0, 0.0, e)) - a3dValueNoise(p - vec3(0.0, 0.0, e))) / (2.0 * e);
  float dFx_dy = (a3dValueNoise(p + vec3(0.0, e, 0.0)) - a3dValueNoise(p - vec3(0.0, e, 0.0))) / (2.0 * e);
  float dFy_dx = (a3dValueNoise(p + o1 + vec3(e, 0.0, 0.0)) - a3dValueNoise(p + o1 - vec3(e, 0.0, 0.0))) / (2.0 * e);
  float dFy_dz = (a3dValueNoise(p + o1 + vec3(0.0, 0.0, e)) - a3dValueNoise(p + o1 - vec3(0.0, 0.0, e))) / (2.0 * e);
  float dFz_dx = (a3dValueNoise(p + o2 + vec3(e, 0.0, 0.0)) - a3dValueNoise(p + o2 - vec3(e, 0.0, 0.0))) / (2.0 * e);
  float dFz_dy = (a3dValueNoise(p + o2 + vec3(0.0, e, 0.0)) - a3dValueNoise(p + o2 - vec3(0.0, e, 0.0))) / (2.0 * e);
  return vec3(dFz_dy - dFy_dz, dFx_dz - dFz_dx, dFy_dx - dFx_dy);
}

float a3dSampleHeight(vec2 xz) {
  return texture(u_heightfield, xz * u_heightUvScale).r * u_heightMax;
}

// Emit slot index (ring): origin disc + cone jitter + speed range.
void a3dEmit(int index, inout vec4 pa, inout vec4 va) {
  uint h = a3dHash(uint(index) ^ uint(u_seed) ^ uint(u_frame) * 0x9e3779b9u);
  float r = a3dRand01(h);
  vec3 jitter = (a3dRand3(h ^ 0x51ed270bu) - 0.5) * 2.0 * u_emitSpread;
  vec3 dir = normalize(u_emitDirection + jitter);
  float theta = a3dRand01(h ^ 0x27d4eb2fu) * 6.283185307;
  pa = vec4(u_emitOrigin + vec3(cos(theta), 0.0, sin(theta)) * u_emitDisc, 0.0);
  va = vec4(dir * mix(u_emitSpeed.x, u_emitSpeed.y, r), a3dRand01(h ^ 0x165667b1u));
}

// §8.3 step — identical math in both passes so pos/vel stay consistent.
void a3dSimStep(ivec2 texel, inout vec4 pa, inout vec4 va) {
  int index = int(float(texel.y) * u_stateWidth + float(texel.x));
  if (a3dInRing(index, int(u_emitHead), int(u_emitCount), int(u_capacity))) {
    a3dEmit(index, pa, va);
  } else if (pa.w < u_lifetimeMax) {
    vec3 acc = u_gravity + u_wind + a3dCurlNoise(pa.xyz * u_noiseFreq + u_time * u_noiseScroll) * u_noiseStrength;
    va.xyz = (va.xyz + acc * u_dt) * exp(-u_drag * u_dt);
    pa.xyz += va.xyz * u_dt;
    pa.w += u_dt;
    float ground = u_useHeightfield > 0.5 ? a3dSampleHeight(pa.xz) : u_groundPlane;
    if (pa.y < ground) {
      pa.y = ground;
      va.y = -va.y * u_bounce;
      va.xz *= 0.7;
      pa.w += u_lifeLoss;
    }
  }
}
`;

const FRAG_POS = `
${COMMON}
layout(location=0) out vec4 o_out;
void main() {
  ivec2 texel = ivec2(gl_FragCoord.xy);
  vec4 pa = texelFetch(u_prevPos, texel, 0);
  vec4 va = texelFetch(u_prevVel, texel, 0);
  a3dSimStep(texel, pa, va);
  o_out = pa;
}
`;

const FRAG_VEL = `
${COMMON}
layout(location=0) out vec4 o_out;
void main() {
  ivec2 texel = ivec2(gl_FragCoord.xy);
  vec4 pa = texelFetch(u_prevPos, texel, 0);
  vec4 va = texelFetch(u_prevVel, texel, 0);
  a3dSimStep(texel, pa, va);
  o_out = va;
}
`;

export function gpuSimVertexSource(): string {
  return `#version 300 es\n${VERT}`;
}

export function gpuSimPositionFragmentSource(): string {
  return `#version 300 es\n${FRAG_POS}`;
}

export function gpuSimVelocityFragmentSource(): string {
  return `#version 300 es\n${FRAG_VEL}`;
}
