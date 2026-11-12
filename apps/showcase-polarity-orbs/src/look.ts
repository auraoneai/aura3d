/**
 * Polarity Orbs look identity (PRD §6.3): a dual-tone world — warm red half / cool blue half — that shifts dominance
 * when the player flips polarity. Sky gradients blend between a warm dusk and a cool dusk; the signature effects are
 * the flip shockwave ring and the magnet attraction streams.
 */
import { hexToLinear, sunDirection, type Rgb } from "../../../examples/shared/runner-kit/look-utils";
import type { CustomSpec, SkyStop } from "../../../examples/shared/runner-kit/shaders";
import { WGSL_CLIP, wgslStage } from "../../../examples/shared/runner-kit/shaders-wgsl";

export interface PolarityLook {
  readonly id: "polarity-orbs";
  readonly red: string;
  readonly blue: string;
  readonly gold: string;
  readonly mint: string;
  readonly purple: string;
  readonly ink: string;
  readonly paper: string;
  readonly deckWarm: string;
  readonly deckWarmDim: string;
  readonly deckCool: string;
  readonly deckCoolDim: string;
  readonly railWarm: string;
  readonly railCool: string;
  readonly dash: string;
  readonly skyWarm: readonly SkyStop[];
  readonly skyCool: readonly SkyStop[];
  readonly sun: Rgb;
  readonly shockwave: { readonly seconds: number; readonly maxRadius: number; readonly alpha: number };
  readonly magnet: { readonly streams: number; readonly color: string; readonly alpha: number };
  readonly background: string;
}

export const LOOK: PolarityLook = {
  id: "polarity-orbs",
  red: "#ff5468",
  blue: "#38bdf8",
  gold: "#ffd24e",
  mint: "#7ef0c8",
  purple: "#c79bff",
  ink: "#f6f7ff",
  paper: "#121324",
  deckWarm: "#4c2234",
  deckWarmDim: "#24162a",
  deckCool: "#1d3d5e",
  deckCoolDim: "#152038",
  railWarm: "#e85d75",
  railCool: "#48b6f6",
  dash: "#eef4ff",
  skyWarm: [
    { t: 0, hex: "#06081a" },
    { t: 0.28, hex: "#131234" },
    { t: 0.42, hex: "#5a1e44" },
    { t: 0.49, hex: "#ff6658" },
    { t: 0.54, hex: "#b83c5c" },
    { t: 1, hex: "#1a102a" }
  ],
  skyCool: [
    { t: 0, hex: "#050718" },
    { t: 0.28, hex: "#0b173c" },
    { t: 0.42, hex: "#184682" },
    { t: 0.49, hex: "#4ec4ff" },
    { t: 0.54, hex: "#2b68b4" },
    { t: 1, hex: "#0d1636" }
  ],
  sun: sunDirection(38, -142),
  shockwave: { seconds: 0.48, maxRadius: 6.4, alpha: 0.82 },
  magnet: { streams: 12, color: "#c79bff", alpha: 0.78 },
  background: "#0b0d20"
};

/** Linear-RGB palette for batches and uniforms. */
export const LINEAR = {
  red: hexToLinear(LOOK.red),
  blue: hexToLinear(LOOK.blue),
  gold: hexToLinear(LOOK.gold),
  mint: hexToLinear(LOOK.mint),
  purple: hexToLinear(LOOK.purple),
  dash: hexToLinear(LOOK.dash),
  deckWarm: hexToLinear(LOOK.deckWarm),
  deckWarmDim: hexToLinear(LOOK.deckWarmDim),
  deckCool: hexToLinear(LOOK.deckCool),
  deckCoolDim: hexToLinear(LOOK.deckCoolDim),
  railWarm: hexToLinear(LOOK.railWarm),
  railCool: hexToLinear(LOOK.railCool)
} as const;

export const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const SRGB = /* glsl */ `
vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}`;

const stopVec = (stop: SkyStop): string => {
  const v = parseInt(stop.hex.slice(1), 16);
  const r = ((v >> 16) & 255) / 255, g = ((v >> 8) & 255) / 255, b = (v & 255) / 255;
  return `srgbToLinear(vec3(${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)}))`;
};

const gradientExpr = (stops: readonly SkyStop[], name: string): string => {
  const sorted = [...stops].sort((a, b) => a.t - b.t);
  const lines = [`vec3 ${name} = ${stopVec(sorted[0] as SkyStop)};`];
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1] as SkyStop, b = sorted[i] as SkyStop;
    lines.push(`${name} = mix(${name}, ${stopVec(b)}, smoothstep(${a.t.toFixed(4)}, ${b.t.toFixed(4)}, t));`);
  }
  return lines.join("\n  ");
};

/**
 * Dual-dusk sky: `uMix` 0 = warm (red polarity dominant), 1 = cool (blue dominant). No `uTime`, so the program is
 * static and needs no mutable runtime registration; the world writes `uMix` as the flip blend eases.
 */
export const SKY_BLEND_FRAGMENT = /* glsl */ `
in vec3 vWorld;
out vec4 outColor;
${SRGB}
void main() {
  float y = normalize(vWorld - cameraPosition).y;
  float t = clamp(0.5 - y * 0.5, 0.0, 1.0);
  ${gradientExpr(LOOK.skyWarm, "warm")}
  ${gradientExpr(LOOK.skyCool, "cool")}
  outColor = vec4(mix(warm, cool, uMix), 1.0);
}`;

export const SKY_BLEND_VERTEX = /* glsl */ `
out vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

const wgslStopVec = (stop: SkyStop): string => {
  const [r, g, b] = hexToLinear(stop.hex);
  return `vec3<f32>(${r.toFixed(5)}, ${g.toFixed(5)}, ${b.toFixed(5)})`;
};

const wgslGradientExpr = (stops: readonly SkyStop[], name: string): string => {
  const sorted = [...stops].sort((a, b) => a.t - b.t);
  const lines = [`var ${name} = ${wgslStopVec(sorted[0] as SkyStop)};`];
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1] as SkyStop, b = sorted[i] as SkyStop;
    lines.push(`${name} = mix(${name}, ${wgslStopVec(b)}, smoothstep(${a.t.toFixed(4)}, ${b.t.toFixed(4)}, t));`);
  }
  return lines.join("\n  ");
};

const SKY_BLEND_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct SkyBlendOut {
  @builtin(position) position: vec4<f32>,
  @location(0) vWorld: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>) -> SkyBlendOut {
  var out: SkyBlendOut;
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

const SKY_BLEND_FRAGMENT_WGSL = wgslStage([], /* wgsl */ `
@fragment fn fs_main(@location(0) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let y = normalize(vWorld - aura.u_cameraPosition).y;
  let t = clamp(0.5 - y * 0.5, 0.0, 1.0);
  ${wgslGradientExpr(LOOK.skyWarm, "warm")}
  ${wgslGradientExpr(LOOK.skyCool, "cool")}
  return vec4<f32>(mix(warm, cool, aura.u_uMix), 1.0);
}`);

export const skyBlendSpec = (): CustomSpec => ({
  glsl: { vertex: SKY_BLEND_VERTEX, fragment: SKY_BLEND_FRAGMENT },
  wgsl: { vertex: SKY_BLEND_VERTEX_WGSL, fragment: SKY_BLEND_FRAGMENT_WGSL },
  uniforms: { uMix: { type: "f32", value: 0 } },
  side: "double",
  depthWrite: false
});

/** HUD ink/paper pairs that must clear WCAG AA (tests/unit/polarity-orbs/hud-contrast.test.ts). */
export const HUD_CONTRAST_PAIRS: readonly { readonly name: string; readonly ink: string; readonly paper: string }[] = [
  { name: "score ink on paper", ink: LOOK.ink, paper: LOOK.paper },
  { name: "gold mult on paper", ink: LOOK.gold, paper: LOOK.paper },
  { name: "red polarity on paper", ink: LOOK.red, paper: LOOK.paper },
  { name: "blue polarity on paper", ink: LOOK.blue, paper: LOOK.paper },
  { name: "mint shield badge on paper", ink: LOOK.mint, paper: LOOK.paper },
  { name: "purple magnet badge on paper", ink: LOOK.purple, paper: LOOK.paper },
  { name: "button ink on gold", ink: LOOK.paper, paper: LOOK.gold },
  { name: "wrong popup on paper", ink: "#ff3b30", paper: LOOK.paper }
];