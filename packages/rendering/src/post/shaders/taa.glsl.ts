/**
 * Temporal resolve in the output/history grid. The current raster, velocity,
 * depth and reactive inputs may have a different (render) resolution. Motion
 * is current-minus-previous UV in an unjittered coordinate system. Resolve
 * samples the current raster at output UV + jitter and history at output UV -
 * motion; the caller owns and resets the matching color and depth histories.
 *
 * A valid expected previous linear depth may be supplied in velocity.a. When
 * absent, velocity.b (current linear depth) is a conservative approximation
 * and the renderer must report that limitation. Reactive=1 or disocclusion
 * discards history. History is neighborhood-clipped in YCoCg. Scene alpha is
 * taken from the current frame to avoid persisting stale transparent coverage.
 * The separate spatial-upscale shader does not accumulate temporal history.
 */

const HEADER = `#version 300 es
precision highp float;
`;

export const TAA_RESOLVE_GLSL = /* glsl */ `${HEADER}
uniform highp sampler2D u_current;
uniform highp sampler2D u_history;
uniform highp sampler2D u_velocityDilate; // rg = motion, b = current linear depth, a = optional expected previous linear depth
uniform highp sampler2D u_linZPrev;
uniform highp sampler2D u_reactive;
uniform bool u_hasReactive;
uniform bool u_hasHistory;
uniform bool u_hasExpectedDepth;
uniform float u_depthNear; // signed near plane; sky/uncovered uses the 3e38 sentinel
uniform vec2 u_jitterUv; // raster offset, in current texture UV coordinates
uniform vec2 u_previousJitterUv; // previous depth remains on the jittered raster grid
uniform float u_feedbackMin;
uniform float u_feedbackMax;
uniform float u_varianceGamma;
out vec4 o_color;

vec4 cubicWeights(float f) {
  float f2 = f * f, f3 = f2 * f;
  return vec4(-0.5*f + f2 - 0.5*f3, 1.0 - 2.5*f2 + 1.5*f3, 0.5*f + 2.0*f2 - 1.5*f3, -0.5*f2 + 0.5*f3);
}

// Four-point separable cubic interpolation of the previous color. All fetches
// are bounded explicitly; this keeps behavior independent of sampler state.
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

// Current raster reconstruction works for both a matching output grid and a
// higher-resolution history grid; at aligned texel centers it is an exact copy.
vec4 currentAt(vec2 uv) {
  ivec2 size = textureSize(u_current, 0);
  vec2 p = uv * vec2(size) - 0.5;
  ivec2 base = ivec2(floor(p));
  vec2 f = fract(p);
  vec4 a = texelFetch(u_current, clamp(base, ivec2(0), size - 1), 0);
  vec4 b = texelFetch(u_current, clamp(base + ivec2(1, 0), ivec2(0), size - 1), 0);
  vec4 c = texelFetch(u_current, clamp(base + ivec2(0, 1), ivec2(0), size - 1), 0);
  vec4 d = texelFetch(u_current, clamp(base + ivec2(1, 1), ivec2(0), size - 1), 0);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

vec3 rgbToYCoCg(vec3 c) { return vec3(c.r * 0.25 + c.g * 0.5 + c.b * 0.25, c.r * 0.5 - c.b * 0.5, -c.r * 0.25 + c.g * 0.5 - c.b * 0.25); }
vec3 ycocgToRgb(vec3 c) { return vec3(c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
bool validDepth(float z) { return z >= u_depthNear && z < 3.0e38; }

void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  ivec2 outputSize = textureSize(u_history, 0);
  ivec2 currentSize = textureSize(u_current, 0);
  vec2 uv = (vec2(pixel) + 0.5) / vec2(outputSize);
  vec2 currentUv = uv + u_jitterUv;
  ivec2 currentPixel = clamp(ivec2(floor(currentUv * vec2(currentSize))), ivec2(0), currentSize - 1);
  ivec2 velocitySize = textureSize(u_velocityDilate, 0);
  ivec2 velocityPixel = clamp(ivec2(floor(currentUv * vec2(velocitySize))), ivec2(0), velocitySize - 1);
  vec4 velTex = texelFetch(u_velocityDilate, velocityPixel, 0);
  vec2 velocity = velTex.rg;
  vec2 uvPrev = uv - velocity;
  vec4 current = currentAt(currentUv);

  // Reject malformed/extreme vectors before converting reprojected UV to
  // integer texel coordinates; no such vector can land on prior history.
  if (!u_hasHistory || any(notEqual(velocity, velocity)) || any(greaterThan(abs(velocity), vec2(2.0)))) {
    o_color = current;
    return;
  }

  vec3 mu = vec3(0.0), m2 = vec3(0.0);
  float wsum = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 tap = texelFetch(u_current, clamp(currentPixel + ivec2(x, y), ivec2(0), currentSize - 1), 0).rgb;
    float w = 1.0 / (1.0 + max(luma(tap), 0.0));
    vec3 yc = rgbToYCoCg(tap);
    mu += yc * w;
    m2 += yc * yc * w;
    wsum += w;
  }
  mu /= wsum;
  vec3 sigma = sqrt(max(m2 / wsum - mu * mu, vec3(0.0)));

  float motionPx = length(velocity * vec2(outputSize));
  // Direct fetch for static history prevents repeated reconstruction drift.
  vec4 history = motionPx < 1e-3
    ? texelFetch(u_history, clamp(pixel, ivec2(0), outputSize - 1), 0)
    : historyAt(uvPrev);
  float motionFactor = clamp(motionPx / 2.0, 0.0, 1.0);
  float gamma = mix(0.5, max(u_varianceGamma, 0.0), (1.0 - motionFactor) * (1.0 - motionFactor));
  vec3 historyRgb = ycocgToRgb(clamp(rgbToYCoCg(history.rgb), mu - gamma * sigma, mu + gamma * sigma));

  bool outOfBounds = any(lessThan(uvPrev, vec2(0.0))) || any(greaterThanEqual(uvPrev, vec2(1.0)));
  float expectedZ = u_hasExpectedDepth ? velTex.a : velTex.b;
  ivec2 zSize = textureSize(u_linZPrev, 0);
  vec2 previousDepthUv = uvPrev + u_previousJitterUv;
  bool depthOutOfBounds = any(lessThan(previousDepthUv, vec2(0.0))) || any(greaterThanEqual(previousDepthUv, vec2(1.0)));
  ivec2 prevPixel = ivec2(floor(previousDepthUv * vec2(zSize)));
  float nearestError = 3.0e38;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    float z = texelFetch(u_linZPrev, clamp(prevPixel + ivec2(x, y), ivec2(0), zSize - 1), 0).r;
    if (validDepth(z)) nearestError = min(nearestError, abs(z - expectedZ));
  }
  bool disoccluded = depthOutOfBounds || !validDepth(expectedZ) || nearestError > max(0.001, 0.1 * max(expectedZ - u_depthNear, 0.0));

  ivec2 reactiveSize = textureSize(u_reactive, 0);
  ivec2 reactivePixel = clamp(ivec2(floor(currentUv * vec2(reactiveSize))), ivec2(0), reactiveSize - 1);
  float reactive = u_hasReactive ? texelFetch(u_reactive, reactivePixel, 0).r
    : (abs(luma(current.rgb) - luma(history.rgb)) > 0.5 ? 1.0 : 0.0);
  // Values above one are indirect-light tags, not opacity. A changed tag is
  // not a coverage change, though switching representations is reactive.
  bool currentTagged = current.a > 1.0, historyTagged = history.a > 1.0;
  float coverageChange = currentTagged && historyTagged ? 0.0
    : (currentTagged != historyTagged ? 1.0 : clamp(abs(current.a - history.a) * 4.0, 0.0, 1.0));
  reactive = max(clamp(reactive, 0.0, 1.0), coverageChange);
  float feedback = mix(u_feedbackMin, u_feedbackMax, 1.0 - motionFactor) * (1.0 - reactive);
  if (outOfBounds || disoccluded) feedback = 0.0;
  o_color = vec4(mix(current.rgb, historyRgb, clamp(feedback, 0.0, 1.0)), current.a);
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
  vec4 sum = vec4(0.0);
  float wsum = 0.0;
  ivec2 rSize = ivec2(u_renderSize);
  for (int y = -1; y <= 1; y += 1) for (int x = -1; x <= 1; x += 1) {
    float w = blackmanHarris(float(x) - f.x) * blackmanHarris(float(y) - f.y);
    sum += texelFetch(u_resolved, clamp(base + ivec2(x, y), ivec2(0), rSize - 1), 0) * w;
    wsum += w;
  }
  o_color = sum / max(wsum, 1e-6);
}
`;
