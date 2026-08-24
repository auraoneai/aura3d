/**
 * Siege Golf course definitions - nine authored holes with escalating joint
 * usage (PRD SG-07).
 *
 * A hole is data only: tee, aim, fairway bounds, cups (sensor zones), pins
 * (knock-down targets) and structure specs. structures.ts turns a definition
 * into physics bodies/constraints plus matching scene-node descriptors, so the
 * same data drives headless determinism tests and the browser route.
 *
 * Coordinate convention: the ball travels toward -Z. The tee sits near z = 0;
 * targets sit at negative z. X is across the fairway.
 */

export interface CupSpec {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  /** Sensor zone radius; a fallen pin counts as sunk when its center rests inside. */
  readonly radius: number;
}

export interface PinSpec {
  readonly id: string;
  /** Base position of the standing pin on the felt. */
  readonly x: number;
  readonly z: number;
  /** Yaw of the standing plank in radians. */
  readonly heading?: number | undefined;
  /** Optional authored center height for tower-crown pins; omitted = ground pedestal. */
  readonly elevation?: number | undefined;
}

export type StructureSpec =
  | { readonly kind: "crateStack"; readonly id: string; readonly x: number; readonly z: number; readonly count: number; readonly size: number }
  | { readonly kind: "crate"; readonly id: string; readonly x: number; readonly y: number; readonly z: number; readonly size: number }
  | { readonly kind: "barrel"; readonly id: string; readonly x: number; readonly z: number; readonly height: number }
  | { readonly kind: "gate"; readonly id: string; readonly x: number; readonly z: number; readonly span: number; readonly postHeight: number }
  | { readonly kind: "hingedPanel"; readonly id: string; readonly x: number; readonly z: number; readonly span: number; readonly limits: readonly [number, number] }
  | { readonly kind: "pendulum"; readonly id: string; readonly x: number; readonly z: number; readonly drop: number }
  | { readonly kind: "springPad"; readonly id: string; readonly x: number; readonly z: number; readonly stiffness: number; readonly padHeight: number }
  | { readonly kind: "ramp"; readonly id: string; readonly x: number; readonly z: number; readonly width: number; readonly length: number; readonly rise: number };

export interface HoleDefinition {
  readonly id: string;
  readonly name: string;
  readonly par: number;
  readonly blurb: string;
  /** Ball start on the felt. */
  readonly tee: readonly [number, number];
  /** Initial aim direction (x, z), normalized in shot.ts. */
  readonly aim: readonly [number, number];
  readonly halfWidth: number;
  /** Fairway extends from z = +2 behind the tee to z = -halfLength. */
  readonly halfLength: number;
  readonly cups: readonly CupSpec[];
  readonly pins: readonly PinSpec[];
  readonly structures: readonly StructureSpec[];
}

/**
 * Nine holes, escalating joint usage per the PRD:
 * 1 free stacks -> 2 fixed joints -> 3 hinge -> 4 free barrels/ramp ->
 * 5 spring -> 6 hinge pendulum -> 7 tall stack + hinges -> 8 two hinges ->
 * 9 finale mixing every mechanic.
 */
export const SIEGE_GOLF_HOLES: readonly HoleDefinition[] = [
  {
    id: "hole-01-open-fairway",
    name: "Open Fairway",
    par: 2,
    blurb: "A free-standing crate stack guards the first pin. No joints yet - just mass.",
    tee: [0, 3.2],
    aim: [0, -1],
    halfWidth: 3.1,
    halfLength: 12,
    cups: [{ id: "cup-a", x: 0, z: -8.4, radius: 0.85 }],
    pins: [{ id: "pin-a", x: 0, z: -7.6, heading: Math.PI / 2 }],
    structures: [
      { kind: "crateStack", id: "stack-a", x: 0, z: -4.6, count: 2, size: 0.62 }
    ]
  },
  {
    id: "hole-02-gate-crash",
    name: "Gate Crash",
    par: 2,
    blurb: "A fixed-joint timber gate spans the lane. Break through the span or thread the gap.",
    tee: [-0.4, 3.2],
    aim: [0.06, -1],
    halfWidth: 3.1,
    halfLength: 12.5,
    cups: [{ id: "cup-a", x: 0.4, z: -8.9, radius: 0.85 }],
    pins: [{ id: "pin-a", x: 0.4, z: -8.1, heading: Math.PI / 2 }],
    structures: [
      { kind: "gate", id: "gate-a", x: -0.2, z: -5.2, span: 2.6, postHeight: 1.15 }
    ]
  },
  {
    id: "hole-03-flip-panel",
    name: "Flip Panel",
    par: 3,
    blurb: "First hinge: a weighted panel stands across the lane until you topple it aside.",
    tee: [0.2, 3.4],
    aim: [-0.03, -1],
    halfWidth: 3.2,
    halfLength: 13,
    cups: [{ id: "cup-a", x: -0.2, z: -9.2, radius: 0.9 }],
    pins: [{ id: "pin-a", x: -0.2, z: -8.3, heading: Math.PI / 2 }],
    structures: [
      { kind: "hingedPanel", id: "panel-a", x: -0.2, z: -6.4, span: 2.4, limits: [-Math.PI / 2.2, Math.PI / 2.2] },
      { kind: "crate", id: "guard-a", x: 1.35, z: -7.4, y: 0.31, size: 0.62 }
    ]
  },
  {
    id: "hole-04-barrel-alley",
    name: "Barrel Alley",
    par: 3,
    blurb: "Barrels crowd the green and a ramp feeds them in. Bank the shot or clear a lane.",
    tee: [0, 3.2],
    aim: [0.05, -1],
    halfWidth: 3.3,
    halfLength: 13,
    cups: [{ id: "cup-a", x: 0.9, z: -9.4, radius: 0.9 }],
    pins: [{ id: "pin-a", x: 0.9, z: -8.5, heading: Math.PI / 2 }],
    structures: [
      { kind: "barrel", id: "barrel-a", x: -0.55, z: -6.2, height: 0.92 },
      { kind: "barrel", id: "barrel-b", x: -0.05, z: -7.3, height: 0.92 },
      { kind: "barrel", id: "barrel-c", x: 0.45, z: -6.4, height: 0.92 },
      { kind: "ramp", id: "ramp-a", x: -1.7, z: -4.9, width: 1.1, length: 2.6, rise: 0.42 }
    ]
  },
  {
    id: "hole-05-springboard",
    name: "Springboard",
    par: 3,
    blurb: "A spring-joint bounce pad is the only way over the front wall. Charge full and trust it.",
    tee: [-1.1, 3.2],
    aim: [0.16, -1],
    halfWidth: 3.3,
    halfLength: 14,
    cups: [{ id: "cup-a", x: 0.7, z: -10.6, radius: 0.95 }],
    pins: [{ id: "pin-a", x: 0.7, z: -9.6, heading: Math.PI / 2 }],
    structures: [
      { kind: "gate", id: "wall-a", x: -0.4, z: -6.8, span: 4.4, postHeight: 1.35 },
      { kind: "springPad", id: "pad-a", x: -1.1, z: -4.9, stiffness: 0.34, padHeight: 0.34 }
    ]
  },
  {
    id: "hole-06-pendulum-pass",
    name: "Pendulum Pass",
    par: 4,
    blurb: "A hinged pendulum sweeps the lane. Read its swing, then send the ball through behind it.",
    tee: [0, 3.4],
    aim: [0, -1],
    halfWidth: 3.4,
    halfLength: 14,
    cups: [{ id: "cup-a", x: 0, z: -10.2, radius: 0.9 }],
    pins: [{ id: "pin-a", x: 0, z: -9.3, heading: Math.PI / 2 }],
    structures: [
      { kind: "pendulum", id: "swing-a", x: 0, z: -6.6, drop: 1.5 },
      { kind: "crateStack", id: "stack-a", x: -1.6, z: -8.2, count: 1, size: 0.62 }
    ]
  },
  {
    id: "hole-07-tower-topple",
    name: "Tower Topple",
    par: 4,
    blurb: "The pin crowns a three-crate tower on hinge shelves. Drop the crown into its cup.",
    tee: [0.3, 3.4],
    aim: [-0.05, -1],
    halfWidth: 3.3,
    halfLength: 14,
    cups: [{ id: "cup-a", x: 0.7, z: -7.6, radius: 1.05 }],
    pins: [{ id: "pin-a", x: 0.1, z: -8.9, heading: Math.PI / 2, elevation: 2.55 }],
    structures: [
      { kind: "crateStack", id: "tower-a", x: 0.1, z: -8.9, count: 3, size: 0.66 },
      { kind: "hingedPanel", id: "panel-a", x: 1.5, z: -6.8, span: 2.0, limits: [-Math.PI / 2.4, Math.PI / 2.4] }
    ]
  },
  {
    id: "hole-08-double-flip",
    name: "Double Flip",
    par: 5,
    blurb: "Two hinged panels stagger the lane with a barrel rolling between them. Thread both flips.",
    tee: [-0.6, 3.4],
    aim: [0.08, -1],
    halfWidth: 3.5,
    halfLength: 15,
    cups: [{ id: "cup-a", x: 0.6, z: -11.2, radius: 1.2 }],
    pins: [{ id: "pin-a", x: 0.6, z: -10.3, heading: Math.PI / 2 }],
    structures: [
      { kind: "hingedPanel", id: "panel-a", x: -0.6, z: -6.2, span: 2.2, limits: [-Math.PI / 2.2, Math.PI / 2.2] },
      { kind: "hingedPanel", id: "panel-b", x: 0.6, z: -8.4, span: 2.2, limits: [-Math.PI / 2.2, Math.PI / 2.2] },
      { kind: "barrel", id: "barrel-a", x: 0, z: -7.3, height: 0.92 },
      { kind: "springPad", id: "pad-a", x: 1.9, z: -9.6, stiffness: 0.3, padHeight: 0.3 }
    ]
  },
  {
    id: "hole-09-wrecking-green",
    name: "Wrecking Green",
    par: 5,
    blurb: "Finale: tower, pendulum, spring pad and two cups. Everything you have learned, at once.",
    tee: [0, 3.6],
    aim: [0, -1],
    halfWidth: 3.6,
    halfLength: 15.5,
    cups: [
      { id: "cup-a", x: -1.0, z: -6.8, radius: 1.05 },
      { id: "cup-b", x: 1.45, z: -8.8, radius: 1.0 }
    ],
    pins: [
      { id: "pin-a", x: -1.4, z: -8.0, heading: Math.PI / 2, elevation: 1.85 },
      { id: "pin-b", x: 1.45, z: -8.0, heading: Math.PI / 2 }
    ],
    structures: [
      { kind: "pendulum", id: "swing-a", x: 0, z: -6.2, drop: 1.4 },
      { kind: "crateStack", id: "tower-a", x: -1.4, z: -8.0, count: 2, size: 0.64 },
      { kind: "springPad", id: "pad-a", x: 2.65, z: -7.0, stiffness: 0.36, padHeight: 0.32 },
      { kind: "barrel", id: "barrel-a", x: 1.45, z: -6.7, height: 0.92 }
    ]
  }
];

export function holeCount(): number {
  return SIEGE_GOLF_HOLES.length;
}
