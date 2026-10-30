/**
 * WW47-P3: the gouache paper pass. After tonemapping, a fixed paper fibre and pigment granulation modulate the frame by
 * about 4%, weighted to the midtones (deep shadows and the sun disc stay clean), so flat painted surfaces read as paint on
 * paper. Screen-anchored on purpose: paper does not move with the camera. Off on Low and under `?look=original`.
 */
import { effects } from "@aura3d/engine";

export const PAPER_STRENGTH = 0.04;

export const PAPER_GLSL = /* glsl */ `uniform float u_paper;
uniform vec2 u_paperScale;
float paperHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float paperNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(paperHash(i), paperHash(i + vec2(1.0, 0.0)), f.x), mix(paperHash(i + vec2(0.0, 1.0)), paperHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec4 c = texture(u_color, v_uv);
  vec2 p = v_uv * u_paperScale;
  // fibre: long thin streaks at a slight angle; granulation: fine pigment pooling
  float fibre = paperNoise(vec2(p.x * 0.35 + p.y * 0.08, p.y * 2.6)) - 0.5;
  float grain = paperNoise(p * 1.7) * 0.6 + paperNoise(p * 4.3) * 0.4 - 0.5;
  float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  float mid = smoothstep(0.04, 0.3, l) * (1.0 - smoothstep(0.75, 0.98, l));
  float k = 1.0 + u_paper * mid * (fibre * 0.9 + grain * 1.3);
  outColor = vec4(c.rgb * k, c.a);
}`;

export function paperPass(width: number, height: number) {
  return effects.shaderPass({
    name: "wind-gouache-paper",
    order: "after-tonemap",
    glsl: PAPER_GLSL,
    uniforms: { u_paper: PAPER_STRENGTH, u_paperScale: [width / 3, height / 3] }
  });
}
