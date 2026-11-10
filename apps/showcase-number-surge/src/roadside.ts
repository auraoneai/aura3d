/**
 * Number Surge roadside dressing (presentation only): Meshy synthwave palms lining the elevated highway, giant neon
 * numeral-7 monuments standing on the grid floor and dark dice tumbling in the air beside the road.
 *
 * Every piece stays outside the road (|x| >= 7.5, road half-width 3.7) and scrolls with the road at 1x on a fixed
 * cycle, growing in at the far end and out past the camera. Like `scenery.ts` it is a pure function of the shown
 * scroll distance and time: no simulation state, no gameplay random stream. Pieces are never hidden; outside their
 * window they are parked at scale 0.001.
 */
import { model, type AuraApp, type scene } from "@aura3d/engine";
import { assets } from "./aura-model-assets";
import { SCENERY } from "./scenery";

type Scene = ReturnType<typeof scene>;
type NodeHandle = ReturnType<AuraApp["nodes"]["require"]>;
type Kind = "nsNeonPalm" | "nsPinkPalm" | "nsNumeralSeven" | "nsFloatingDice";

export interface RoadsidePiece {
  readonly id: string;
  readonly kind: Kind;
  readonly side: -1 | 1;
  readonly x: number;
  /** Base height: fitted models are grounded on their lowest point. */
  readonly y: number;
  readonly z0: number;
  readonly height: number;
  readonly yaw: number;
  readonly tint: readonly { color: string; colorMode: "multiply"; emissive: string; emissiveIntensity: number }[];
}

export const ROADSIDE_SPAN = 180;
const NEAR = 10;
const FAR = NEAR - ROADSIDE_SPAN;

const neon = (color: string, emissive: string, emissiveIntensity: number) =>
  [{ color, colorMode: "multiply" as const, emissive, emissiveIntensity }];
const CYAN_PALM = neon("#a8f6ff", "#3ef2ff", 0.32);
const PINK_PALM = neon("#ffb8f0", "#ff4fd8", 0.34);
const MAGENTA_SEVEN = neon("#ffc4f2", "#ff4fd8", 0.55);
const CYAN_SEVEN = neon("#bff8ff", "#3ef2ff", 0.5);
const DICE = neon("#ffffff", "#3a1f72", 0.22);

const palm = (i: number, kind: "nsNeonPalm" | "nsPinkPalm", side: -1 | 1): RoadsidePiece => ({
  id: `roadside-palm-${i}`, kind, side,
  x: 10.5 + ((i * 3) % 4) * 0.6,
  y: SCENERY.floorY,
  z0: i * 30,
  height: 15 + ((i * 5) % 3) * 0.8,
  yaw: i * 1.7,
  tint: kind === "nsNeonPalm" ? CYAN_PALM : PINK_PALM
});

/** Six palms (one every 30 m, alternating sides), two numeral sevens, three dice. */
export const ROADSIDE: readonly RoadsidePiece[] = [
  palm(0, "nsNeonPalm", -1), palm(1, "nsPinkPalm", 1), palm(2, "nsPinkPalm", -1),
  palm(3, "nsNeonPalm", 1), palm(4, "nsNeonPalm", -1), palm(5, "nsPinkPalm", 1),
  { id: "roadside-seven-0", kind: "nsNumeralSeven", side: -1, x: 20, y: SCENERY.floorY, z0: 45, height: 18, yaw: 0.42, tint: MAGENTA_SEVEN },
  { id: "roadside-seven-1", kind: "nsNumeralSeven", side: 1, x: 20, y: SCENERY.floorY, z0: 135, height: 18, yaw: -0.42, tint: CYAN_SEVEN },
  { id: "roadside-dice-0", kind: "nsFloatingDice", side: 1, x: 7.8, y: 8.2, z0: 18, height: 1.6, yaw: 0.3, tint: DICE },
  { id: "roadside-dice-1", kind: "nsFloatingDice", side: -1, x: 8.2, y: 9.0, z0: 78, height: 1.6, yaw: 2.1, tint: DICE },
  { id: "roadside-dice-2", kind: "nsFloatingDice", side: 1, x: 8.6, y: 8.6, z0: 138, height: 1.6, yaw: 4.0, tint: DICE }
];

const smooth = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/** Pose at road speed: z cycles through [FAR, NEAR), grows in over the far 30 m and out over the last 8 m. */
export function roadsidePose(p: RoadsidePiece, travelled: number, time: number) {
  const z = ((((p.z0 + travelled) % ROADSIDE_SPAN) + ROADSIDE_SPAN) % ROADSIDE_SPAN) + FAR;
  const fade = smooth((z - FAR) / 30) * smooth((NEAR - z) / 8);
  const dice = p.kind === "nsFloatingDice";
  const y = dice ? p.y + Math.sin(time * 0.9 + p.z0) * 0.45 : p.y;
  const yaw = dice ? p.yaw + time * 0.35 : p.yaw;
  const roll = dice ? Math.sin(time * 0.5 + p.z0) * 0.35 : 0;
  return { x: p.side * p.x, y, z, yaw, roll, scale: Math.max(0.001, fade) };
}

export function addRoadside(builder: Scene): { bind(node: (id: string) => NodeHandle): { update(travelled: number, time: number): void } } {
  for (const p of ROADSIDE) {
    builder.add(model(assets[p.kind], {
      name: p.id, targetHeight: p.height, role: "setDressing", castShadow: false, receiveShadow: false, materialOverrides: p.tint
    }).runtime({ id: p.id }));
  }
  return {
    bind(node) {
      for (const p of ROADSIDE) node(p.id);
      return {
        update(travelled, time) {
          for (const p of ROADSIDE) {
            const pose = roadsidePose(p, travelled, time);
            node(p.id).setPosition(pose.x, pose.y, pose.z).setRotation(0, pose.yaw, pose.roll).setScale(pose.scale);
          }
        }
      };
    }
  };
}
