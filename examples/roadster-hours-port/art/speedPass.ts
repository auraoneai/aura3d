/**
 * GU47 RH47-08: depth-masked radial speed streaks. At speed (and harder on nitro) the frame edges smear outward from the
 * screen centre in 6 taps; pixels closer than 14 m (the roadster and the near road under it) are never smeared, so the car
 * stays sharp. `u_streak` 0 (standing, reduced motion, Low tier) makes the chunk a no-op.
 */
export const SPEED_STREAK_GLSL = /* glsl */ `
vec3 rhSpeedStreak(vec2 uv, vec3 base) {
  if (u_streak <= 0.0) return base;
  vec2 dir = uv - vec2(0.5, 0.46);
  float r = length(dir * vec2(1.6, 1.0));
  float edge = smoothstep(0.32, 0.85, r);
  float depth = texture(u_depthLinear, uv).r;
  float keep = smoothstep(14.0, 22.0, depth);
  float w = edge * keep * u_streak;
  if (w <= 0.001) return base;
  vec3 sum = base;
  for (int i = 1; i <= 6; i++) {
    float t = float(i) / 6.0;
    sum += texture(u_color, uv - dir * t * 0.045 * w).rgb;
  }
  return mix(base, sum / 7.0, clamp(w * 1.2, 0.0, 1.0));
}
`;
