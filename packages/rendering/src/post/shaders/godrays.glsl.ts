/**
 * PRD-03 §8.5 — S4 god rays for the v2 post chain (WebGL2, half-res RGBA16F).
 *
 * Radial light-shaft march replacing the CPU `volumetricLightPixels` path
 * (which cost ~0.5 fps in Deep Recovery):
 *   occlusion src  = (linZ ≥ far·0.999 || luma(hdr) > 4.0) ? hdr.rgb : 0
 *                    + light-disk mask smoothstep(r1, r0, |uv − lightUv|)
 *   march          = samples taps from uv toward lightUv, weight decay^i·weight
 *   output         = accum · color · intensity · offScreenFade
 *   offScreenFade  = saturate(1 − (max(|lightUv−0.5|) − 0.5)·4) · step(0, lightClip.w)
 *
 * The half-res output is added into HDR by the S10 composite. On the v2 path
 * this supersedes `VolumetricFog.ts:105-144` (lane 07, deletion = Q-07-1).
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
out vec4 o_color;

#ifndef AURA_GODRAY_SAMPLES
#define AURA_GODRAY_SAMPLES 32
#endif

void main() {
  vec2 uv = gl_FragCoord.xy / vec2(textureSize(u_hdr, 0));
  vec2 dir = u_lightUv - uv;
  float dist = length(dir);
  vec2 stepUv = dist > 0.0 ? dir / float(AURA_GODRAY_SAMPLES) : vec2(0.0);

  // Off-screen / behind-camera fade: step(0, w) zeroes lights behind the eye,
  // the linear ramp fades across 25% uv past the frame edge.
  float offScreen = clamp(1.0 - (max(abs(u_lightUv.x - 0.5), abs(u_lightUv.y - 0.5)) - 0.5) * 4.0, 0.0, 1.0)
                  * step(0.0, u_lightClipW);

  float marchWeight = u_weight;
  vec3 accum = vec3(0.0);
  vec2 sampleUv = uv;
  for (int i = 0; i < AURA_GODRAY_SAMPLES; ++i) {
    sampleUv += stepUv;
    vec4 hdr = textureLod(u_hdr, sampleUv, 0.0);
    float linZ = textureLod(u_depthHalf, sampleUv, 0.0).r;
    bool sky = linZ >= u_far * 0.999;
    float luma = dot(hdr.rgb, vec3(0.2126, 0.7152, 0.0722));
    // Emitters: sky pixels (the "gap" through occluders) or HDR highlights.
    vec3 src = (sky || luma > 4.0) ? hdr.rgb : vec3(0.0);
    // The light disk itself is an emitter regardless of coverage.
    src += vec3(smoothstep(u_diskOuter, u_diskInner, length(sampleUv - u_lightUv)));
    accum += marchWeight * src;
    marchWeight *= u_decay;
  }

  o_color = vec4(accum * u_color * u_intensity * offScreen, 1.0);
}
`;
