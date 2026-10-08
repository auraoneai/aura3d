/**
 * PRD-03 §8.6 — S5 temporal anti-aliasing resolve (WebGL2).
 *
 * Per the PRD: reproject history by the closest-depth 3×3 velocity
 * (velocityDilate pass), fetch history through the 5-tap Catmull-Rom kernel
 * ported verbatim from the legacy `taaProgram` accumulation path, clip the
 * reconstructed history against the current 3×3 neighborhood in YCoCg with
 * `μ ± γσ` (clip, not clamp — box sides move with the distribution), a
 * motion-dependent `γ = mix(0.5, varianceGamma, (1 − motionFactor)²)`, a
 * depth disocclusion test `|prevLinZ − expectedZ| > 0.1·z → weight 0`, a
 * feedback weight `mix(feedbackMin, feedbackMax, 1 − saturate(|v|·size/2px))`
 * with the reactive mask biasing feedback to 0.5, and a Karis-weighted HDR
 * resolve so >1.0 history cannot streak.
 *
 * `TAA_RESOLVE_GLSL` runs at render resolution writing the new history.
 * `TAA_UPSCALE_GLSL` (§8.6 TAAU, when pipeline.renderScale < 1) then
 * reconstructs that resolved frame at display resolution with a 9-tap
 * Blackman-Harris kernel — a single-pass EASU-style upsample.
 */

const HEADER = `#version 300 es
precision highp float;
`;

export const TAA_RESOLVE_GLSL = /* glsl */ `${HEADER}
uniform highp sampler2D u_current;        // jittered HDR current frame
uniform highp sampler2D u_history;        // last resolved frame
uniform highp sampler2D u_velocityDilate; // vec4(vx, vy, linZCurr, _)
uniform highp sampler2D u_linZPrev;       // last frame's linear depth (.r)
uniform sampler2D u_reactive;             // C-14 reactive mask (or 1×1 zero)
uniform bool u_hasReactive;
uniform bool u_hasHistory;
uniform float u_feedbackMin;
uniform float u_feedbackMax;
uniform float u_varianceGamma;
out vec4 o_color;

vec4 cubicWeights(float f) {
  float f2 = f * f, f3 = f2 * f;
  return vec4(-0.5*f + f2 - 0.5*f3, 1.0 - 2.5*f2 + 1.5*f3, 0.5*f + 2.0*f2 - 1.5*f3, -0.5*f2 + 0.5*f3);
}

// §8.6: Catmull-Rom history fetch (ported from the legacy accumulation path).
vec4 historyAt(vec2 uv) {
  ivec2 size = textureSize(u_history, 0);
  vec2 position = uv * vec2(size) - 0.5;
  ivec2 base = ivec2(floor(position));
  vec4 wx = cubicWeights(fract(position.x)), wy = cubicWeights(fract(position.y));
  vec4 result = vec4(0.0);
  for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) {
    result += texelFetch(u_history, clamp(base + ivec2(x - 1, y - 1), ivec2(0), size - 1), 0) * wx[x] * wy[y];
  }
  return result;
}

vec3 rgbToYCoCg(vec3 c) { return vec3(c.r * 0.25 + c.g * 0.5 + c.b * 0.25, c.r * 0.5 - c.b * 0.5, -c.r * 0.25 + c.g * 0.5 - c.b * 0.25); }
vec3 ycocgToRgb(vec3 c) { return vec3(c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  ivec2 size = textureSize(u_current, 0);
  vec2 uv = (vec2(pixel) + 0.5) / vec2(size);

  vec4 velTex = texelFetch(u_velocityDilate, pixel, 0);
  vec2 velocity = velTex.rg;
  vec2 uvPrev = uv - velocity;

  // Current pixel + Karis-weighted 3×3 neighborhood stats in YCoCg.
  vec3 current = texelFetch(u_current, pixel, 0).rgb;
  vec3 mu = vec3(0.0), m2 = vec3(0.0);
  float wsum = 0.0;
  for (int y = -1; y <= 1; y += 1) for (int x = -1; x <= 1; x += 1) {
    vec3 tap = texelFetch(u_current, clamp(pixel + ivec2(x, y), ivec2(0), size - 1), 0).rgb;
    // Karis weight tames HDR fireflies inside the clip box.
    float w = 1.0 / (1.0 + luma(tap));
    vec3 yc = rgbToYCoCg(tap);
    mu += yc * w;
    m2 += yc * yc * w;
    wsum += w;
  }
  mu /= wsum;
  vec3 sigma = sqrt(max(m2 / wsum - mu * mu, vec3(0.0)));

  if (!u_hasHistory) {
    o_color = vec4(current, 1.0);
    return;
  }

  vec3 history = historyAt(uvPrev).rgb;
  vec3 historyYc = rgbToYCoCg(history);

  // Motion-scaled variance: fast pixels trust the box more (γ→0.5).
  float motionPx = length(velocity * vec2(size));
  float motionFactor = clamp(motionPx / 2.0, 0.0, 1.0);
  float gamma = mix(0.5, u_varianceGamma, (1.0 - motionFactor) * (1.0 - motionFactor));
  vec3 lo = mu - gamma * sigma;
  vec3 hi = mu + gamma * sigma;
  historyYc = clamp(historyYc, lo, hi);
  history = ycocgToRgb(historyYc);

  // Disocclusion: |prevLinZ − expectedZ| > 0.1·z → drop history.
  bool outOfBounds = any(lessThan(uvPrev, vec2(0.0))) || any(greaterThanEqual(uvPrev, vec2(1.0)));
  float zCurr = velTex.b;
  float zPrev = texture(u_linZPrev, clamp(uvPrev, vec2(0.0), vec2(1.0))).r;
  bool disoccluded = abs(zPrev - zCurr) > 0.1 * zCurr;

  // Reactive mask (C-14) overrides accumulation; absent the attachment, a
  // luminance delta between current and reprojected history is the proxy.
  float reactive = texture(u_reactive, uv).r;
  if (!u_hasReactive) {
    reactive = abs(luma(current) - luma(history)) > 0.5 ? 1.0 : 0.0;
  }

  float feedback = mix(u_feedbackMin, u_feedbackMax, 1.0 - clamp(motionPx / 2.0, 0.0, 1.0));
  feedback = mix(feedback, 0.5, clamp(reactive, 0.0, 1.0));
  if (outOfBounds || disoccluded) feedback = 0.0;

  vec3 resolved = mix(current, history, feedback);
  o_color = vec4(max(resolved, vec3(0.0)), 1.0);
}
`;

/** §8.6 TAAU: 9-tap Blackman-Harris reconstruct of the render-res resolved frame. */
export const TAA_UPSCALE_GLSL = /* glsl */ `${HEADER}
uniform highp sampler2D u_resolved; // render-res TAA output (this frame)
uniform vec2 u_renderSize;          // render resolution (input texel space)
uniform vec2 u_outputSize;          // display resolution (draw target size)
out vec4 o_color;

float blackmanHarris(float x) {
  // N=9 window kernel, |x| ∈ [0, 1.5] inside the 3×3 footprint.
  float ax = abs(x) / 1.5;
  if (ax >= 1.0) return 0.0;
  return 0.35875 + 0.48829 * cos(3.14159265 * ax) + 0.14128 * cos(2.0 * 3.14159265 * ax) + 0.01168 * cos(3.0 * 3.14159265 * ax);
}

void main() {
  // Output pixel → render-res source position.
  vec2 srcPos = (gl_FragCoord.xy / u_outputSize) * u_renderSize - 0.5;
  ivec2 base = ivec2(floor(srcPos));
  vec2 f = srcPos - vec2(base);
  vec3 sum = vec3(0.0);
  float wsum = 0.0;
  ivec2 rSize = ivec2(u_renderSize);
  for (int y = -1; y <= 1; y += 1) for (int x = -1; x <= 1; x += 1) {
    float w = blackmanHarris(float(x) - f.x) * blackmanHarris(float(y) - f.y);
    sum += texelFetch(u_resolved, clamp(base + ivec2(x, y), ivec2(0), rSize - 1), 0).rgb * w;
    wsum += w;
  }
  o_color = vec4(sum / max(wsum, 1e-6), 1.0);
}
`;
