/**
 * Verified canonical solutions for the current nine-hole course.
 *
 * These are player-legal absolute aim angles (the same radians exposed by the
 * mounted shot controller) and powers inside the public mini-golf clamp. They
 * are executable evidence, not a gameplay assist: the browser never applies
 * them automatically and the visual best-solution ghost still records only a
 * player's real inputs and sampled ball poses.
 */
export interface CanonicalSiegeStroke {
  readonly angle: number;
  readonly power: number;
}

export type CanonicalSiegeScenario = "direct" | "fixed-gate" | "collapse" | "bank" | "spring" | "pendulum" | "tower" | "double-hinge" | "final";

export interface CanonicalSiegeSolution {
  readonly holeId: string;
  readonly scenario: CanonicalSiegeScenario;
  readonly strokes: readonly CanonicalSiegeStroke[];
}

export const SIEGE_GOLF_CANONICAL_SOLUTIONS: readonly CanonicalSiegeSolution[] = [
  { holeId: "hole-01-open-fairway", scenario: "direct", strokes: [{ angle: 0, power: 1.9 }] },
  { holeId: "hole-02-gate-crash", scenario: "fixed-gate", strokes: [{ angle: -0.69, power: 1.35 }] },
  { holeId: "hole-03-flip-panel", scenario: "collapse", strokes: [{ angle: 0.56, power: 1.85 }] },
  { holeId: "hole-04-barrel-alley", scenario: "bank", strokes: [{ angle: 0.11, power: 1.75 }] },
  { holeId: "hole-05-springboard", scenario: "spring", strokes: [{ angle: 0.11, power: 1.75 }] },
  { holeId: "hole-06-pendulum-pass", scenario: "pendulum", strokes: [{ angle: -0.49, power: 1.95 }] },
  { holeId: "hole-07-tower-topple", scenario: "tower", strokes: [{ angle: -0.04, power: 1.55 }] },
  { holeId: "hole-08-double-flip", scenario: "double-hinge", strokes: [{ angle: -0.34, power: 2.15 }] },
  {
    holeId: "hole-09-wrecking-green",
    scenario: "final",
    strokes: [
      { angle: -0.65, power: 1.4 },
      { angle: 0.1, power: 1.7 }
    ]
  }
];

export function directionForAbsoluteAngle(angle: number): readonly [number, number] {
  return [Math.sin(angle), -Math.cos(angle)];
}
