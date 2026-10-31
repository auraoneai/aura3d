/**
 * PRD-03 §8.5 — S4 god rays for the v2 post chain (WebGL2, half-res RGBA16F).
 *
 * Radial light-shaft march replacing the CPU `volumetricLightPixels` path
 * (which cost ~0.5 fps in Deep Recovery):
 *   occlusion src  = (linZ ≥ far·0.999 || luma(hdr) > 4.0) ? hdr.rgb : 0
 *                    + (sky ? light-disk mask smoothstep(r1, r0, |uv − lightUv|) : 0)
 *   march          = samples taps from uv toward lightUv, weight decay^i·weight
 *   output         = accum · color · intensity · offScreenFade
 *   offScreenFade  = saturate(1 − (max(|lightUv−0.5|) − 0.5)·4) · step(0, lightClip.w)
 *
 * The half-res output is added into HDR by the S10 composite. On the v2 path
 * this supersedes `VolumetricFog.ts:105-144` (lane 07, deletion = Q-07-1).
 *
 * GU47 E-C (EC-8): `u_density` is the shaft density (GPU Gems 3 §13): the
 * march covers `density` of the way to the light, so lower values give
 * shorter, tighter shafts. It comes from volumetricFog `godRayDensity`, never
 * from the fog density; 1 (and an unset 0) is the full march used before.
 *
 * GU47 phase 2 (haze wash: drift-and-deliver-port, aura-hoops-3d, last-train,
 * heatsink-port, ninja-runner): the march was an unnormalised sum,
 * Σ weight·decay^i·src with weight = intensity, about 14·intensity² times the
 * emitter radiance at 32 samples, and every sky pixel emitted at full
 * radiance wherever it was. A sunset sky behind a street therefore added
 * several HDR units to every pixel whose ray crossed it: a flat beige/white
 * wash, not shafts. Now:
 *   - emitters are weighted by their distance to the light (aspect-corrected
 *     `1 - smoothstep(0, AURA_GODRAY_EMIT_RADIUS, r)`), so shafts radiate from
 *     the light's neighbourhood instead of from the whole sky;
 *   - the march is the decay-weighted MEAN of the emitters (normalised by
 *     Σ decay^i), so `intensity` is the shaft gain (at most the emitter
 *     radiance times intensity) and `u_weight` no longer multiplies it;
 *   - `u_medium` (the volumetricFog `density`, per metre) scales the shaft by
 *     the medium the view ray crosses, `1 - exp(-medium · depth)`: shafts
 *     thin out in front of near geometry and build with distance. <= 0 keeps
 *     the unscaled shaft.
 */

const HEADER = `#version 300 es
precision highp float;
`;

export const GODRAYS_GLSL = /* glsl */ `${HEADER}
uniform sampler2D u_hdr;             // half-res HDR input
uniform highp sampler2D u_depthHalf; // half-res linear depth (.r)
uniform float u_far;
uniform vec2 u_lightUv;              // projected light position, uv space
uniform float u_lightClipW;          // clip-space w of the projected light
uniform vec3 u_color;                // light shaft tint
uniform float u_intensity;
uniform float u_decay;
uniform float u_weight;
uniform float u_diskOuter;           // r1: disk feather outer radius (uv)
uniform float u_diskInner;           // r0: disk core radius (uv)
uniform float u_density;             // GU47: march fraction toward the light, (0, 1]; <= 0 reads as 1
uniform float u_medium;              // GU47 phase 2: shaft medium per metre (volumetricFog density); <= 0: no depth scaling
out vec4 o_color;

#ifndef AURA_GODRAY_SAMPLES
#define AURA_GODRAY_SAMPLES 32
#endif
// GU47 phase 2: emitter falloff radius around the light, in frame heights.
#ifndef AURA_GODRAY_EMIT_RADIUS
#define AURA_GODRAY_EMIT_RADIUS 0.6
#endif

void main() {
  vec2 uv = gl_FragCoord.xy / vec2(textureSize(u_hdr, 0));
  vec2 dir = u_lightUv - uv;
  float dist = length(dir);
  float density = u_density > 0.0 ? u_density : 1.0;
  vec2 stepUv = dist > 0.0 ? dir * density / float(AURA_GODRAY_SAMPLES) : vec2(0.0);

  // Off-screen / behind-camera fade: step(0, w) zeroes lights behind the eye,
  // the linear ramp fades across 25% uv past the frame edge.
  float offScreen = clamp(1.0 - (max(abs(u_lightUv.x - 0.5), abs(u_lightUv.y - 0.5)) - 0.5) * 4.0, 0.0, 1.0)
                  * step(0.0, u_lightClipW);

  vec2 aspect = vec2(float(textureSize(u_hdr, 0).x) / float(max(textureSize(u_hdr, 0).y, 1)), 1.0);
  float marchWeight = 1.0;
  float weightSum = 0.0;
  vec3 accum = vec3(0.0);
  vec2 sampleUv = uv;
  for (int i = 0; i < AURA_GODRAY_SAMPLES; ++i) {
    sampleUv += stepUv;
    vec4 hdr = textureLod(u_hdr, sampleUv, 0.0);
    float linZ = textureLod(u_depthHalf, sampleUv, 0.0).r;
    bool sky = linZ >= u_far * 0.999;
    float luma = dot(hdr.rgb, vec3(0.2126, 0.7152, 0.0722));
    // Emitters: sky pixels (the "gap" through occluders) or HDR highlights,
    // weighted by their closeness to the light (GU47 phase 2).
    float nearLight = 1.0 - smoothstep(0.0, float(AURA_GODRAY_EMIT_RADIUS), length((sampleUv - u_lightUv) * aspect));
    vec3 src = (sky || luma > 4.0) ? hdr.rgb * nearLight : vec3(0.0);
    // The sun disk emits only where the sky is unoccluded. #1185 multiplied
    // the whole source by the disk mask: with a dim sky that leaves nothing
    // to emit, and the S4-isolated A/B measured S4 on == S4 off (GPU run
    // 38163537496). The original additive disk emitted through occluders.
    if (sky) src += vec3(smoothstep(u_diskOuter, u_diskInner, length(sampleUv - u_lightUv)));
    accum += marchWeight * src;
    weightSum += marchWeight;
    marchWeight *= u_decay;
  }
  vec3 shaft = accum / max(weightSum, 1e-4);
  // Distance-scaled medium: the shaft is the light the view ray picks up on
  // its way through the volume, so near geometry gets little of it.
  float viewZ = min(textureLod(u_depthHalf, uv, 0.0).r, u_far);
  float medium = u_medium > 0.0 ? 1.0 - exp(-u_medium * viewZ) : 1.0;

  o_color = vec4(shaft * u_color * u_intensity * offScreen * medium, 1.0);
}
`;
