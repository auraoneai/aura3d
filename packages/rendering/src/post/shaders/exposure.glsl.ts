/**
 * PRD-03 §8.9 — S8 auto-exposure (GPU only, zero readbacks).
 *
 * Chain: `EXPOSURE_LUMA_LOG_GLSL` writes `log2(max(luma, 1e-5))` into a
 * quarter-res R16F surface (landed as rgba32f in the transitional pool —
 * ≥ spec precision, .r channel) with a centre-weighted or average metering
 * mask; `EXPOSURE_REDUCE_GLSL` box-averages 2× per draw until 1×1;
 * `EXPOSURE_ADAPT_GLSL` integrates toward the target EV in a 1×1 ping-pong:
 *
 *   ev = mix(evPrev, clamp(-avgLog2 + log2(0.18) + comp, minEv, maxEv),
 *            1 - exp(-dt * speed))
 *
 * with `speed` = speedUp when brightening, speedDown when darkening.
 * `EXPOSURE_MUL_GLSL` then multiplies the HDR frame by `exp2(ev)` — the
 * S10-composite `autoExp` factor applied as its own linear-HDR draw on the
 * transitional chain, so the fused OUT still receives its §6.4 exposure.
 */

/** S8 pass 1: log2 luma at 1/4 res; `AURA_EXPOSURE_CENTER_WEIGHTED` masks. */
export const EXPOSURE_LUMA_LOG_GLSL = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_hdr;
uniform vec2 u_texelSize;      // 1 / HDR size
uniform int u_centerWeighted;  // 1 = centre-weighted metering, 0 = average
in vec2 v_uv;
out vec4 outColor;

void main() {
	// One output texel covers a 4×4 block of source texels; average the block.
	vec4 acc = vec4(0.0);
	for (int y = 0; y < 4; y++) {
		for (int x = 0; x < 4; x++) {
			vec2 uv = v_uv + (vec2(float(x), float(y)) - 1.5) * u_texelSize;
			acc.rgb += texture(u_hdr, uv).rgb;
			acc.a += 1.0;
		}
	}
	vec3 c = acc.rgb / max(acc.a, 1.0);
	float luma = max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 1e-5);
	// Centre-weighted: w = 1 - (d^2), clamped — an 18% gray card reads weight 1
	// at frame centre and falls to 0 at the corners.
	vec2 centered = v_uv - 0.5;
	float w = u_centerWeighted == 1 ? max(0.0, 1.0 - dot(centered, centered) * 4.0) : 1.0;
	outColor = vec4(log2(luma) * w, w, 0.0, 1.0);
}
`;

/** S8 reduce: 4-tap box average of the previous mip (weighted sum in .rg). */
export const EXPOSURE_REDUCE_GLSL = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_source;
uniform vec2 u_texelSize;      // 1 / source size
in vec2 v_uv;
out vec4 outColor;

void main() {
	vec4 sum = texture(u_source, v_uv + vec2(-0.5, -0.5) * u_texelSize)
		+ texture(u_source, v_uv + vec2( 0.5, -0.5) * u_texelSize)
		+ texture(u_source, v_uv + vec2(-0.5,  0.5) * u_texelSize)
		+ texture(u_source, v_uv + vec2( 0.5,  0.5) * u_texelSize);
	outColor = sum * 0.25;
}
`;

/**
 * S8 adapt: 1×1 ping-pong. `u_prev` is last frame's EV texel; `u_avg` is the
 * reduced texel (r = Σ log2 luma · w, g = Σ w). `u_hasPrev` boots the first
 * frame straight to target (no transient from an arbitrary 0 start).
 */
export const EXPOSURE_ADAPT_GLSL = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_prev;
uniform sampler2D u_avg;
uniform float u_dt;
uniform float u_speedUp;
uniform float u_speedDown;
uniform float u_minEv;
uniform float u_maxEv;
uniform float u_compensationEv;
uniform int u_hasPrev;
out vec4 outColor;

void main() {
	vec4 avg = texelFetch(u_avg, ivec2(0), 0);
	float avgLog2 = avg.r / max(avg.g, 1e-4);   // Σ(l·w)/Σw — weighted mean
	float target = clamp(-avgLog2 + log2(0.18) + u_compensationEv, u_minEv, u_maxEv);
	float prev = texelFetch(u_prev, ivec2(0), 0).r;
	float speed = target > prev ? u_speedUp : u_speedDown;
	float ev = u_hasPrev == 1 ? mix(prev, target, 1.0 - exp(-u_dt * speed)) : target;
	outColor = vec4(ev, 0.0, 0.0, 1.0);
}
`;

/** S8 apply: `outColor = hdr * exp2(ev)` — the composite's autoExp factor. */
export const EXPOSURE_MUL_GLSL = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_hdr;
uniform sampler2D u_ev;
in vec2 v_uv;
out vec4 outColor;

void main() {
	float ev = texelFetch(u_ev, ivec2(0), 0).r;
	vec4 c = texture(u_hdr, v_uv);
	outColor = vec4(c.rgb * exp2(ev), c.a);
}
`;

/**
 * JS mirror of the adapt step — the unit test proves the shader's `mix`
 * formula and speed selection byte-for-byte against this reference.
 */
export function adaptEv(prev: number, avgLog2: number, options: {
  readonly dt: number; readonly minEv: number; readonly maxEv: number;
  readonly speedUp: number; readonly speedDown: number; readonly compensationEv: number;
  readonly hasPrev: boolean;
}): number {
  const target = Math.min(Math.max(-avgLog2 + Math.log2(0.18) + options.compensationEv, options.minEv), options.maxEv);
  if (!options.hasPrev) return target;
  const speed = target > prev ? options.speedUp : options.speedDown;
  return prev + (target - prev) * (1 - Math.exp(-options.dt * speed));
}
