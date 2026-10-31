/**
 * GU47 E-C (EC-6) — S3 screen-space reflections for the v2 post chain
 * (WebGL2, GLSL ES 3.00). Off unless the scene authors
 * `effects.screenSpaceReflections()` (and the tier allows S3: High+).
 *
 * SSR_TRACE_GLSL (half-res RGBA16F, rgb = reflected radiance, a = confidence):
 *   - view position from the S1 linear depth (`.r` = positive view distance)
 *     and the projection's focal terms; the normal from the cross product of
 *     the neighbouring view positions (the forward pass has no G-buffer);
 *   - a linear view-space march along reflect(V, N) of `AURA_SSR_STEPS`
 *     steps over `u_maxDistance` metres; where the ray crosses behind the
 *     depth buffer, 4 binary refinement steps, and a hit is a refined point
 *     behind it by less than `u_thickness` (GU47 phase 2: the unrefined test
 *     missed surfaces thinner than one 0.75 m step);
 *   - the hit colour comes from the previous frame (TAA history, reprojected
 *     through `u_viewToPrevClip` = prevViewProj · inv(view)) when
 *     `u_reproject = 1`, else from this frame's HDR colour;
 *   - confidence = hit · Schlick fresnel (F0 0.04) · screen-edge fade ·
 *     march-distance fade (refined hit distance) · camera-facing fade · roughness gate
 *     (`1 − smoothstep(0.35, 0.5, roughness)`, i.e. nothing above the 0.5
 *     cutoff). Where confidence falls to 0 the composite leaves the forward
 *     result, which already carries the nearest reflection probe's IBL — the
 *     reflection fades to the probe instead of to black.
 *
 * SSR_COMPOSITE_GLSL (full-res): `hdr + reflection · confidence · intensity`.
 *
 * Limit (GU47 phase 2, receipt effects-ssr): the forward pass writes no
 * metalness, F0 or roughness, so the fresnel uses dielectric F0 0.04 and the
 * node's `roughness` frame-wide. A metallic floor (real F0 ~0.3+) reflects
 * several times weaker than its material; the bridge reports
 * `POST_SSR_MATERIAL_INPUTS_UNAVAILABLE` whenever S3 is authored.
 */

const HEADER = `#version 300 es
precision highp float;
`;

export const SSR_TRACE_GLSL = /* glsl */ `${HEADER}
uniform sampler2D u_color;           // reflection source: history (u_reproject = 1) or this frame's HDR
uniform highp sampler2D u_linearDepth; // full-res S1 linear depth (.r, metres)
uniform mat4 u_projection;           // this frame's projection
uniform mat4 u_viewToPrevClip;       // prevViewProj · inv(view); used when u_reproject = 1
uniform int u_reproject;
uniform int u_ortho;
uniform float u_far;
uniform float u_maxDistance;         // metres along the reflected ray
uniform float u_thickness;           // metres behind the depth buffer that still count as a hit
uniform float u_roughness;           // surface roughness hint; cutoff 0.5
out vec4 o_color;

#ifndef AURA_SSR_STEPS
#define AURA_SSR_STEPS 24
#endif

float linearDepthAt(vec2 uv) {
  ivec2 size = textureSize(u_linearDepth, 0);
  ivec2 p = clamp(ivec2(uv * vec2(size)), ivec2(0), size - 1);
  return texelFetch(u_linearDepth, p, 0).r;
}

vec3 viewPosition(vec2 uv, float z) {
  vec2 ndc = uv * 2.0 - 1.0;
  if (u_ortho == 1) {
    return vec3((ndc.x - u_projection[3][0]) / u_projection[0][0], (ndc.y - u_projection[3][1]) / u_projection[1][1], -z);
  }
  return vec3(ndc.x * z / u_projection[0][0], ndc.y * z / u_projection[1][1], -z);
}

vec2 projectToUv(vec3 viewPos) {
  vec4 clip = u_projection * vec4(viewPos, 1.0);
  return clip.w != 0.0 ? clip.xy / clip.w * 0.5 + 0.5 : vec2(-1.0);
}

void main() {
  vec2 halfSize = vec2(textureSize(u_linearDepth, 0)) * 0.5;
  vec2 uv = gl_FragCoord.xy / halfSize;
  float z = linearDepthAt(uv);
  if (z <= 0.0 || z >= u_far * 0.999) { o_color = vec4(0.0); return; }
  vec2 texel = 1.0 / vec2(textureSize(u_linearDepth, 0));
  vec3 p = viewPosition(uv, z);
  vec3 px = viewPosition(uv + vec2(texel.x, 0.0), linearDepthAt(uv + vec2(texel.x, 0.0)));
  vec3 py = viewPosition(uv + vec2(0.0, texel.y), linearDepthAt(uv + vec2(0.0, texel.y)));
  vec3 n = normalize(cross(px - p, py - p));
  vec3 v = u_ortho == 1 ? vec3(0.0, 0.0, -1.0) : normalize(p);
  if (dot(n, v) > 0.0) n = -n;
  vec3 r = normalize(reflect(v, n));

  float roughnessGate = 1.0 - smoothstep(0.35, 0.5, u_roughness);
  // Rays heading back toward the camera leave the screen or hit back faces.
  float facing = 1.0 - smoothstep(0.0, 0.6, r.z);
  if (roughnessGate <= 0.0 || facing <= 0.0) { o_color = vec4(0.0); return; }

  float stepLength = u_maxDistance / float(AURA_SSR_STEPS);
  vec3 prev = p;
  vec3 hitPos = p;
  vec2 hitUv = vec2(-1.0);
  float travelled = 0.0;
  bool prevBehind = false;
  for (int i = 1; i <= AURA_SSR_STEPS; ++i) {
    vec3 q = p + r * (stepLength * float(i));
    vec2 quv = projectToUv(q);
    if (quv.x < 0.0 || quv.x > 1.0 || quv.y < 0.0 || quv.y > 1.0) break;
    float sceneZ = linearDepthAt(quv);
    float rayZ = -q.z;
    bool behind = rayZ > sceneZ;
    // A crossing (in front at the last sample, behind now) is refined first and
    // the thickness test applies to the refined point: a step longer than
    // u_thickness (24 steps over 18 m = 0.75 m) otherwise lands inside or past
    // anything thinner than the step and the hit is lost.
    if (behind && !prevBehind) {
      vec3 a = prev;
      vec3 b = q;
      for (int j = 0; j < 4; ++j) {
        vec3 m = 0.5 * (a + b);
        vec2 muv = projectToUv(m);
        if (-m.z > linearDepthAt(muv)) b = m; else a = m;
      }
      vec2 buv = projectToUv(b);
      if (-b.z - linearDepthAt(buv) < u_thickness) {
        hitPos = b;
        hitUv = buv;
        // Refined distance, not the step index: the index quantised the fade into one band per step
        // (drift-and-deliver-port's 60 m / 24-step wet road showed regular stripes; GU47 phase 2).
        travelled = clamp(length(b - p) / u_maxDistance, 0.0, 1.0);
        break;
      }
    }
    prevBehind = behind;
    prev = q;
  }
  if (hitUv.x < 0.0) { o_color = vec4(0.0); return; }

  vec2 sourceUv = hitUv;
  if (u_reproject == 1) {
    vec4 prevClip = u_viewToPrevClip * vec4(hitPos, 1.0);
    sourceUv = prevClip.w > 0.0 ? prevClip.xy / prevClip.w * 0.5 + 0.5 : hitUv;
  }
  vec2 edge = abs(sourceUv * 2.0 - 1.0);
  float edgeFade = 1.0 - smoothstep(0.85, 1.0, max(edge.x, edge.y));
  float distanceFade = 1.0 - travelled * travelled;
  float cosTheta = clamp(dot(-v, n), 0.0, 1.0);
  float fresnel = 0.04 + 0.96 * pow(1.0 - cosTheta, 5.0);
  float confidence = clamp(edgeFade * distanceFade * facing * roughnessGate * fresnel, 0.0, 1.0);
  vec3 radiance = textureLod(u_color, clamp(sourceUv, vec2(0.0), vec2(1.0)), 0.0).rgb;
  o_color = vec4(radiance, confidence);
}
`;

export const SSR_COMPOSITE_GLSL = /* glsl */ `${HEADER}
uniform sampler2D u_color;      // full-res HDR
uniform sampler2D u_reflection; // half-res trace (.a = confidence)
uniform float u_intensity;
out vec4 o_color;

void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  vec4 src = texelFetch(u_color, pixel, 0);
  vec4 refl = texture(u_reflection, (vec2(pixel) + 0.5) / vec2(textureSize(u_color, 0)));
  o_color = vec4(src.rgb + refl.rgb * refl.a * u_intensity, src.a);
}
`;

/** S3 defaults: roughness cutoff 0.5 (gate fades from 0.35), 24 march steps, 0.25 m thickness. */
export const SSR_ROUGHNESS_CUTOFF = 0.5;
export const SSR_DEFAULT_STEPS = 24;
export const SSR_DEFAULT_THICKNESS = 0.25;
