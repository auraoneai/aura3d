/**
 * GU47 RH47-07 (Redline): depth-masked heat shimmer. Pixels whose linear view depth (`u_depthLinear`, metres) lies beyond
 * `u_heatStart` wobble by a slow two-octave noise, strongest just above the road horizon; the sky (no depth write, far
 * plane) and the car in the foreground stay still. `u_heatAmount` 0 makes the chunk a no-op (Sunbreak and Halo), and
 * reduced motion freezes the wobble (`u_heatTime` stops advancing, the offset stays).
 */
export const HEAT_SHIMMER_GLSL = /* glsl */ `
float rhHeatNoise(vec2 q) {
  vec2 i = floor(q); vec2 f = fract(q); f = f * f * (3.0 - 2.0 * f);
  float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453);
  float b = fract(sin(dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
  float c = fract(sin(dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
  float d = fract(sin(dot(i + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
vec2 rhHeatOffset(vec2 uv) {
  if (u_heatAmount <= 0.0) return vec2(0.0);
  float depth = texture(u_depthLinear, uv).r;
  float mask = smoothstep(u_heatStart, u_heatStart + 60.0, depth) * (1.0 - smoothstep(2500.0, 3500.0, depth));
  float band = smoothstep(0.25, 0.5, uv.y) * (1.0 - smoothstep(0.55, 0.75, uv.y));
  vec2 q = vec2(uv.x * 38.0, uv.y * 90.0 - u_heatTime * 1.6);
  float n = rhHeatNoise(q) * 0.65 + rhHeatNoise(q * 2.3 + 7.0) * 0.35 - 0.5;
  return vec2(n * 0.0018, n * 0.0032) * mask * band * u_heatAmount;
}
`;
