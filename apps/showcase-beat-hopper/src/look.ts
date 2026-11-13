/**
 * Beat Hopper look table (§6.3): night neon with an equalizer skyline. Every palette value the world, HUD and
 * effects read lives here so the identity is unit-testable and distinct from Splat and its siblings.
 */
import { hexToLinear, sunDirection, type Rgb, type SkyStop } from "../../../examples/shared/runner-kit/index";

export interface BeatLook {
  readonly id: string;
  readonly background: string;
  readonly skyStops: readonly SkyStop[];
  readonly sun: Rgb;
  readonly road: string;
  readonly roadLine: string;
  readonly rail: string;
  readonly player: string;
  readonly playerDuck: string;
  readonly gap: string;
  readonly block: string;
  readonly bar: string;
  readonly wall: string;
  readonly orb: string;
  readonly laneLine: string;
  readonly skyline: readonly string[];
  readonly perfect: string;
  readonly good: string;
  readonly miss: string;
  readonly gold: string;
  /** Whole-world beat pulse: emissive gain at the beat instant, decaying over the beat. */
  readonly pulseGain: number;
  /** PERFECT ring: start radius, growth per second, life seconds. */
  readonly ring: { readonly radius: number; readonly growth: number; readonly life: number };
  readonly hudInk: string;
  readonly hudPaper: string;
}

export const LOOK: BeatLook = {
  id: "beat-hopper",
  background: "#08061a",
  skyStops: [
    { t: 0, hex: "#040512" },
    { t: 0.44, hex: "#0d0924" },
    { t: 0.72, hex: "#1b103d" },
    { t: 0.90, hex: "#35165e" },
    { t: 1, hex: "#8c1e62" }
  ],
  sun: sunDirection(24, -30),
  road: "#0e1020",
  roadLine: "#00f2ff",
  rail: "#ff2e88",
  player: "#00f2ff",
  playerDuck: "#38f6d4",
  gap: "#070814",
  block: "#ffbe2e",
  bar: "#ff3d9a",
  wall: "#ff3b5c",
  orb: "#00f2ff",
  laneLine: "#8b5cf6",
  skyline: ["#0d1228", "#121836", "#18143d", "#0b1022"],
  perfect: "#ffbe2e",
  good: "#38f6d4",
  miss: "#ff4d6d",
  gold: "#ffbe2e",
  pulseGain: 0.42,
  ring: { radius: 0.7, growth: 5.2, life: 0.55 },
  hudInk: "#f4f0ff",
  hudPaper: "#120926"
};

export const linear = (hex: string): Rgb => hexToLinear(hex);

/** Beat pulse envelope: 1 exactly on the beat, decaying to 0 before the next one (presentation only). */
export function beatPulse(t: number, beatSeconds: number): number {
  const phase = ((t / beatSeconds) % 1 + 1) % 1;
  return Math.pow(1 - phase, 2.2);
}

/** Normalised QA pixel crops (chase camera keeps sky, road, player and obstacles in stable bands). */
export const QA_CROPS = {
  sky: { x: 0.3, y: 0.02, w: 0.4, h: 0.16 },
  road: { x: 0.35, y: 0.78, w: 0.3, h: 0.16 },
  player: { x: 0.42, y: 0.52, w: 0.16, h: 0.2 },
  entity: { x: 0.3, y: 0.4, w: 0.4, h: 0.2 }
} as const;