/**
 * Polarity Orbs look identity (PRD §6.3): a dual-tone world — warm red half / cool blue half — that shifts dominance
 * when the player flips polarity. Sky gradients blend between a warm dusk and a cool dusk; the signature effects are
 * the flip shockwave ring and the magnet attraction streams.
 */
import { hexToLinear, sunDirection, type Rgb, type SkyStop, type CustomSpec } from "../../../examples/shared/runner-kit/index";

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
  red: "#ff5a4e",
  blue: "#4ea8ff",
  gold: "#ffd24e",
  mint: "#7ef0c8",
  purple: "#c79bff",
  ink: "#fff4ec",
  paper: "#241226",
  deckWarm: "#63303a",
  deckWarmDim: "#3a2030",
  deckCool: "#2f4a6e",
  deckCoolDim: "#232c44",
  railWarm: "#c06a72",
  railCool: "#6a8ac0",
  dash: "#ffe8d8",
  skyWarm: [
    { t: 0, hex: "#2a1230" },
    { t: 0.4, hex: "#6a2a44" },
    { t: 0.72, hex: "#c06a5e" },
    { t: 1, hex: "#e8a08a" }
  ],
  skyCool: [
    { t: 0, hex: "#101a33" },
    { t: 0.4, hex: "#24406a" },
    { t: 0.72, hex: "#5a8ac0" },
    { t: 1, hex: "#9ac0e0" }
  ],
  sun: sunDirection(32, -24),
  shockwave: { seconds: 0.45, maxRadius: 6, alpha: 0.7 },
  magnet: { streams: 12, color: "#c79bff", alpha: 0.5 },
  background: "#241226"
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

const gradientExpr = (stops: readonly SkyStop[]): string => {
  const sorted = [...stops].sort((a, b) => a.t - b.t);
  const lines = [`vec3 c = ${stopVec(sorted[0] as SkyStop)};`];
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1] as SkyStop, b = sorted[i] as SkyStop;
    lines.push(`c = mix(c, ${stopVec(b)}, smoothstep(${a.t.toFixed(4)}, ${b.t.toFixed(4)}, t));`);
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
  ${gradientExpr(LOOK.skyWarm)}
  vec3 warm = c;
  ${gradientExpr(LOOK.skyCool)}
  vec3 cool = c;
  outColor = vec4(mix(warm, cool, uMix), 1.0);
}`;

export const SKY_BLEND_VERTEX = /* glsl */ `
out vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const skyBlendSpec = (): CustomSpec => ({
  glsl: { vertex: SKY_BLEND_VERTEX, fragment: SKY_BLEND_FRAGMENT },
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