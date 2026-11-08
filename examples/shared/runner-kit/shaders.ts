/**
 * GLSL 300 es for runner-kit `material.custom` surfaces, copied from the Splat Rush port's original-look programs
 * (the carnival/gate-wobble variants stay in Splat). Toon ramp: `mix(0.7, 1.0, smoothstep(0.7 - fw, 0.7 + fw,
 * dot(N, L) * 0.5 + 0.5))` with `fw = fwidth(coord) * 0.5`; effective light strengths 0.55 (hemisphere), 0.65 and
 * 0.25 (directionals). Colours are linear; the engine encodes to sRGB on output.
 */
import { material, type texture } from "@aura3d/engine";
import { hexSrgb, type Rgb } from "./look-utils";
import {
  FLAT_FRAGMENT_WGSL, FLAT_TONE_FRAGMENT_WGSL, FLAT_TONE_VERTEX_WGSL, FLAT_VERTEX_WGSL, SHADOW_FRAGMENT_WGSL, SHADOW_VERTEX_WGSL,
  SKY_VERTEX_WGSL, TOON_TONE_VERTEX_WGSL, TOON_VERTEX_WGSL, gradientSkyFragmentWgsl, toonFragmentWgsl
} from "./shaders-wgsl";

export const TOON_VERTEX = /* glsl */ `
out vec3 vNormal;
out vec3 vWorld;
out vec2 vUv;
void main() {
  vUv = uv;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

const SRGB = /* glsl */ `
vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}`;

/** Same as TOON_VERTEX plus a per-vertex `tone` (linear RGB) for the merged batches (entities, particles, clouds). */
export const TOON_TONE_VERTEX = /* glsl */ `
in vec3 tone;
out vec3 vNormal;
out vec3 vWorld;
out vec2 vUv;
out vec3 vTone;
void main() {
  vUv = uv;
  vTone = tone;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

/**
 * P-01: the toon terms add up to about 1.2 on up-facing surfaces, and with tone mapping off that clips the brightest
 * surfaces to pure white. Values up to the 0.82 shoulder pass unchanged; above it they roll off towards 1 so the
 * brightest surfaces keep their texture and edges.
 */
const SHOULDER = /* glsl */ `
vec3 shoulder(vec3 c) {
  const float k = 0.82;
  vec3 over = max(c - k, vec3(0.0));
  return min(c, vec3(k)) + (1.0 - k) * (1.0 - exp(-over / (1.0 - k)));
}`;

export const toonFragment = (withMap: boolean, withTone = false): string => /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec2 vUv;
${withTone ? "in vec3 vTone;" : ""}
out vec4 outColor;
${SRGB}
${SHOULDER}
float ramp(float d) {
  float c = d * 0.5 + 0.5;
  float fw = fwidth(c) * 0.5;
  return mix(0.7, 1.0, smoothstep(0.7 - fw, 0.7 + fw, c));
}
void main() {
  vec3 N = normalize(vNormal);
  if (dot(N, cameraPosition - vWorld) < 0.0) N = -N;
  vec3 base = baseColor;
${withTone ? "base *= vTone;" : ""}
${withMap ? "base *= srgbToLinear(texture(map, vUv).rgb);" : ""}
  vec3 sky = vec3(1.0);
  vec3 ground = vec3(0.1845, 0.2462, 0.4020); // #7788aa
  vec3 hemi = mix(ground, sky, 0.5 * N.y + 0.5) * 0.55;
  vec3 L1 = normalize(vec3(6.0, 12.0, 6.0));
  vec3 L2 = normalize(vec3(-6.0, 8.0, -6.0));
  vec3 fill = vec3(0.3185, 0.4969, 1.0); // #99bbff
  vec3 lit = hemi + vec3(0.65) * ramp(dot(N, L1)) + fill * 0.25 * ramp(dot(N, L2));
  outColor = vec4(shoulder(base * lit) + emissive, alpha);
}`;

/** Vertical gradient sky dome, evaluated per view direction. `SKY_FRAGMENT` is Splat's day sky; games with their own palette pass stops to `gradientSkyFragment`. */
export const SKY_VERTEX = /* glsl */ `
out vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

/** One gradient stop: `t` runs 0 at the zenith to 1 at the nadir (canvas v), `hex` is an sRGB colour. */
export interface SkyStop {
  readonly t: number;
  readonly hex: string;
}

/** WGSL twin of every fragment `gradientSkyFragment` produced (keyed by the GLSL text), so `skySpec` can pair it. */
const SKY_FRAGMENT_TWINS = new Map<string, string>();

/** The WGSL twin of a `gradientSkyFragment` result (undefined for any other GLSL). */
export const skyFragmentWgslTwin = (fragment: string): string | undefined => SKY_FRAGMENT_TWINS.get(fragment);

export function gradientSkyFragment(stops: readonly SkyStop[]): string {
  const glsl = gradientSkyFragmentGlsl(stops);
  if (!SKY_FRAGMENT_TWINS.has(glsl)) SKY_FRAGMENT_TWINS.set(glsl, gradientSkyFragmentWgsl(stops));
  return glsl;
}

function gradientSkyFragmentGlsl(stops: readonly SkyStop[]): string {
  if (stops.length < 2) throw new Error("runner-kit: a sky gradient needs at least two stops");
  const sorted = [...stops].sort((a, b) => a.t - b.t);
  const col = (i: number): string => {
    const [r, g, b] = hexSrgb(sorted[i]!.hex);
    return `srgbToLinear(vec3(${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)}))`;
  };
  const lines = [`vec3 c = ${col(0)};`];
  for (let i = 1; i < sorted.length; i++) {
    const t0 = sorted[i - 1]!.t, t1 = sorted[i]!.t;
    lines.push(`c = mix(c, ${col(i)}, smoothstep(${t0.toFixed(4)}, ${t1.toFixed(4)}, t));`);
  }
  return /* glsl */ `
in vec3 vWorld;
out vec4 outColor;
${SRGB}
void main() {
  float y = normalize(vWorld - cameraPosition).y;
  float t = clamp(0.5 - y * 0.5, 0.0, 1.0);
  ${lines.join("\n  ")}
  outColor = vec4(c, 1.0);
}`;
}

export const SKY_FRAGMENT = gradientSkyFragment([
  { t: 0, hex: "#1773c0" },
  { t: 0.45, hex: "#3fb0e6" },
  { t: 0.75, hex: "#79cef0" },
  { t: 1, hex: "#a9e0f7" }
]);

/** Unlit white with an alpha uniform: speed streaks and shield bubbles. */
export const FLAT_VERTEX = /* glsl */ `
void main() { gl_Position = modelViewProjectionMatrix * vec4(position, 1.0); }`;

export const FLAT_FRAGMENT = /* glsl */ `
out vec4 outColor;
void main() { outColor = vec4(baseColor, alpha); }`;

/** Flat colour times a per-vertex `tone`: colour symbols and guide rings. */
export const FLAT_TONE_VERTEX = /* glsl */ `
in vec3 tone;
out vec3 vTone;
void main() {
  vTone = tone;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const FLAT_TONE_FRAGMENT = /* glsl */ `
in vec3 vTone;
out vec4 outColor;
void main() { outColor = vec4(baseColor * vTone, alpha); }`;

/** Round contact shadow with a crisp toon edge, drawn over a unit quad's uv. */
export const SHADOW_VERTEX = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const SHADOW_FRAGMENT = /* glsl */ `
in vec2 vUv;
out vec4 outColor;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = alpha * (1.0 - smoothstep(0.86, 1.0, d));
  outColor = vec4(baseColor, a);
}`;

/** Crisp cel strip shadow (walls, gates): a hard-edged band anti-aliased across its width, fading towards its far end. */
export const STRIP_SHADOW_FRAGMENT = /* glsl */ `
in vec2 vUv;
out vec4 outColor;
void main() {
  float across = abs(vUv.x - 0.5) * 2.0;
  float fw = fwidth(across) + 1e-3;
  float a = alpha * (1.0 - smoothstep(0.8 - fw, 0.8 + fw, across)) * (1.0 - 0.3 * vUv.y);
  outColor = vec4(baseColor, a);
}`;

/* ---------------------------------------------------------------- material.custom spec builders */

type TextureHandle = ReturnType<typeof texture.canvas>;
export type CustomSpec = Parameters<typeof material.custom>[0];

export const toonSpec = (base: Rgb, map?: TextureHandle, emissive: Rgb = [0, 0, 0], tone = false): CustomSpec => ({
  glsl: { vertex: tone ? TOON_TONE_VERTEX : TOON_VERTEX, fragment: toonFragment(map !== undefined, tone) },
  wgsl: { vertex: tone ? TOON_TONE_VERTEX_WGSL : TOON_VERTEX_WGSL, fragment: toonFragmentWgsl(map !== undefined, tone) },
  uniforms: {
    baseColor: { type: "color3", value: [...base] },
    emissive: { type: "color3", value: [...emissive] },
    alpha: { type: "f32", value: 1 },
    ...(map ? { map: { type: "texture2d" as const, value: map } } : {})
  },
  side: "double"
});

export const flatSpec = (base: Rgb, alpha: number, tone = false): CustomSpec => ({
  glsl: tone ? { vertex: FLAT_TONE_VERTEX, fragment: FLAT_TONE_FRAGMENT } : { vertex: FLAT_VERTEX, fragment: FLAT_FRAGMENT },
  wgsl: tone ? { vertex: FLAT_TONE_VERTEX_WGSL, fragment: FLAT_TONE_FRAGMENT_WGSL } : { vertex: FLAT_VERTEX_WGSL, fragment: FLAT_FRAGMENT_WGSL },
  uniforms: { baseColor: { type: "color3", value: [...base] }, alpha: { type: "f32", value: alpha } },
  transparent: true,
  depthWrite: false,
  side: "double"
});

export const shadowSpec = (): CustomSpec => ({
  glsl: { vertex: SHADOW_VERTEX, fragment: SHADOW_FRAGMENT },
  wgsl: { vertex: SHADOW_VERTEX_WGSL, fragment: SHADOW_FRAGMENT_WGSL },
  uniforms: { baseColor: { type: "color3", value: [0.02, 0.02, 0.05] }, alpha: { type: "f32", value: 0.3 } },
  transparent: true,
  depthWrite: false,
  side: "double"
});

/**
 * Sky dome spec. A `gradientSkyFragment` result pairs its WGSL twin on its own; any other GLSL fragment needs
 * `wgslFragment` (without one the program has no twin and `?backend=webgpu` falls back to WebGL2).
 */
export const skySpec = (fragment: string = SKY_FRAGMENT, wgslFragment: string | undefined = skyFragmentWgslTwin(fragment)): CustomSpec => ({
  glsl: { vertex: SKY_VERTEX, fragment },
  ...(wgslFragment ? { wgsl: { vertex: SKY_VERTEX_WGSL, fragment: wgslFragment } } : {}),
  side: "double",
  depthWrite: false
});