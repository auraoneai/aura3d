/**
 * Lamplight Line rigged figures (owner rule: every human is rigged and animated). The motorman and the four rider temperaments
 * are rigged Idol GLBs (`rig: true`, T-pose) whose bones are driven every frame from code through
 * `apps/showcase-port-shared/idol/humanoid.ts` (`createHumanoidDriver` -> object-form quaternion `setAnimationPose`):
 * - motorman: stands at the controller; the right hand works the controller with the tram's acceleration (throttle notch),
 *   the left hand eases the brake handle in when it slows, the head checks ahead and glances along the platform;
 * - riders: seated on the bench (hips and knees bent by code, hands on the lap), the torso swaying against the tram's
 *   acceleration, with deterministic idle shifts and head turns per seat (sleepers nod, sightseers look out of the window).
 * Render only: reads the sim's speed and the presentation clock; never writes the sim.
 */
import { model, type AuraNodeBuilder, type AuraSceneNode } from "@aura3d/engine";
import { IDOL_ASSETS } from "../../apps/showcase-last-train-port/src/idol-assets";
import {
  eulerZYX,
  loadIdolHumanoid,
  quatMul,
  type HumanoidAnimationPose,
  type HumanoidDriver,
  type HumanoidPoseInput,
  type Quat
} from "@aura3d/engine/animation";
import type { RiderKind } from "./art/proceduralModels";

type ModelRef = Parameters<typeof model>[0];

export const FIGURE_KEYS = ["llMotorman", "llPaxEasy", "llPaxSightseer", "llPaxRushed", "llPaxSleeper"] as const;
export type FigureKey = (typeof FIGURE_KEYS)[number];
export const RIDER_FIGURE: Readonly<Record<RiderKind, FigureKey>> = { easy: "llPaxEasy", sightseer: "llPaxSightseer", rushed: "llPaxRushed", sleeper: "llPaxSleeper" };

/** `<key>.idol.json` normalized.sceneScale: rigged Idol GLBs are ~1 m tall and unscaled in the file. */
export const FIGURE_SCENE_SCALE: Readonly<Record<FigureKey, number>> = { llMotorman: 1.778, llPaxEasy: 1.75, llPaxSightseer: 1.749, llPaxRushed: 1.747, llPaxSleeper: 1.75 };

const REFS = IDOL_ASSETS as unknown as Readonly<Record<string, (ModelRef & { readonly url?: string }) | undefined>>;
/** True when the figure's rigged GLB is admitted (a figure falls back to its procedural build otherwise). */
export const figureReady = (key: FigureKey): boolean => REFS[key] !== undefined;

/**
 * Runtime id of the posed model node. Rigged figures are TOP-LEVEL model nodes (a rigged runtime node nested in a moving
 * group renders in world space, ignoring the parent), so the node that is posed is the node the runtime places.
 */
export const figureBodyId = (name: string): string => name;

/** A rigged figure: one top-level scaled model node `name`, placed (feet at its origin) and posed by the runtime every frame. */
export function buildRiggedFigure(name: string, key: FigureKey, castShadow: boolean): AuraNodeBuilder<AuraSceneNode> {
  const s = FIGURE_SCENE_SCALE[key];
  return model(REFS[key]!, { name, scaleMode: "world", scale: [s, s, s], position: [0, -400, 0], castShadow, receiveShadow: false }).runtime({ id: name }) as unknown as AuraNodeBuilder<AuraSceneNode>;
}

/* ---- skeleton drivers (one per GLB, read from the same URL the model node fetches) ---- */

const drivers = new Map<FigureKey, HumanoidDriver>();
const pending = new Set<FigureKey>();

/** The figure's driver once its skeleton has been read; undefined until then (the runtime keeps the figure hidden). */
export function figureDriver(key: FigureKey): HumanoidDriver | undefined {
  const ready = drivers.get(key);
  if (ready || pending.has(key) || typeof fetch !== "function") return ready;
  const url = REFS[key]?.url;
  if (!url) return undefined;
  pending.add(key);
  loadIdolHumanoid(url).then((d) => { drivers.set(key, d); }, (e: unknown) => { pending.delete(key); console.warn(`[lamplight] idol skeleton ${key}`, e); });
  return undefined;
}

/** Loads every figure skeleton up front (boot awaits this before warmPrograms so no figure starts hidden). */
export function preloadFigureDrivers(): Promise<void> {
  return Promise.all(FIGURE_KEYS.filter((k) => REFS[k]?.url).map((key) => loadIdolHumanoid(REFS[key]!.url!).then((d) => { drivers.set(key, d); }, (e: unknown) => {
    console.warn(`[lamplight] idol skeleton ${key}`, e);
  }))).then(() => undefined);
}

/** Tests (and tools) inject skeletons read from the GLB files. */
export function registerFigureDriver(key: FigureKey, driver: HumanoidDriver): void {
  drivers.set(key, driver);
}

/* ---- poses (canonical humanoid frame: +Z forward, +Y up, the figure's left = +X; negative X rotation swings a limb forward) ---- */

const rx = (a: number): Quat => eulerZYX(a, 0, 0);
const xyz = (x: number, y: number, z: number): Quat => eulerZYX(x, y, z);
const frac = (v: number): number => v - Math.floor(v);
/** Smooth 0..1..0 bump that fires for `width` s once every `period` s (deterministic idle shifts). */
function bump(t: number, period: number, width: number, phase: number): number {
  const u = frac(t / period + phase) * period;
  if (u > width) return 0;
  const k = u / width;
  return Math.sin(Math.PI * k) ** 2;
}

export interface MotormanInput {
  /** Presentation clock (s). */
  readonly t: number;
  /** Smoothed acceleration (m/s^2): > 0 throttle notched up, < 0 braking. */
  readonly accel: number;
  readonly speed: number;
}

/** Controller notch (0..1) and brake handle (0..1) from the smoothed acceleration. */
export function controllerState(accel: number): { readonly notch: number; readonly brake: number } {
  return { notch: Math.max(0, Math.min(1, accel / 1.6)), brake: Math.max(0, Math.min(1, -accel / 3)) };
}

export function motormanPose(m: MotormanInput): HumanoidPoseInput {
  const { notch, brake } = controllerState(m.accel);
  const breathe = Math.sin(m.t * 1.7) * 0.02;
  // head: mostly ahead, a slow scan, and a glance at the platform side every ~9 s
  const scan = Math.sin(m.t * 0.37) * 0.16 + bump(m.t, 9, 1.6, 0.3) * 0.55;
  const crank = Math.sin(m.t * 2.2) * 0.04 * Math.min(1, m.speed / 6);
  return {
    rotations: {
      chest: xyz(0.05 + breathe + notch * 0.05, 0, 0),
      neck: xyz(-0.02, scan * 0.4, 0),
      head: xyz(0.06 - brake * 0.08, scan * 0.6, 0),
      // right hand on the controller crank: pushes forward and turns with the notch
      rightUpperArm: xyz(-0.5 - notch * 0.35, 0, 0.12),
      rightLowerArm: rx(-1.05 + notch * 0.25 + crank),
      rightHand: xyz(0, notch * 0.5, 0),
      // left hand on the brake handle: pulled in as the brake applies
      leftUpperArm: xyz(-0.48 + brake * 0.25, 0, -0.12),
      leftLowerArm: rx(-1.1 - brake * 0.35),
      leftUpperLeg: rx(0.02 + notch * 0.04),
      rightUpperLeg: rx(-0.03)
    },
    hipsOffset: [0, -0.01 + breathe * 0.2, 0]
  };
}

/** Runtime id of the guard (the motorman's GLB) standing at the rear controller of the double-ended car. */
export const GUARD_ID = "a3g-fx-tram-guard";

/** The guard: hands on the rear controller rail, facing down the saloon, glancing along the riders and out of the side. */
export function tramGuardPose(t: number, speed: number): HumanoidPoseInput {
  const base = motormanPose({ t: t + 3.1, accel: 0, speed });
  const look = Math.sin(t * 0.29 + 1.3) * 0.35 + bump(t, 8, 1.8, 0.6) * -0.7;
  return { ...base, rotations: { ...base.rotations, neck: xyz(0.02, look * 0.4, 0), head: xyz(0.08, look * 0.6, 0), rightLowerArm: rx(-1.2), leftLowerArm: rx(-1.2) } };
}

export interface RiderInput {
  readonly kind: RiderKind;
  readonly seat: number;
  readonly t: number;
  /** Lateral torso sway (rad, about the rider's forward axis) from the tram's acceleration; + leans to the rider's right. */
  readonly sway: number;
  /** Temperament base pitch / nod (seatedRiderPose.pitch) and window gaze (seatedRiderPose.yawOffset). */
  readonly pitch: number;
  readonly gaze: number;
}

/** Seat geometry: thighs forward and level, shins down, hips lowered onto the bench (hip-height units). */
export const SEATED = { thigh: -1.45, knee: 1.42, hipsDrop: -0.47 } as const;

export function seatedRiderInput(r: RiderInput): HumanoidPoseInput {
  const phase = r.seat * 0.137;
  const shift = bump(r.t, 7.5 + (r.seat % 3), 2.2, phase) * (r.seat % 2 ? 1 : -1);
  const glance = bump(r.t, 11 + (r.seat % 4), 1.8, phase + 0.4) * (r.seat % 2 ? 0.7 : -0.7);
  const sleeper = r.kind === "sleeper";
  const rushed = r.kind === "rushed";
  const headPitch = sleeper ? 0.38 + Math.sin(r.t * 1.1 + phase * 9) * 0.06 : 0.02;
  const lap: Quat = rx(-0.38);
  const legSpread = 0.08 + (r.seat % 3) * 0.03;
  return {
    rotations: {
      hips: xyz(0, shift * 0.06, 0),
      spine: xyz(r.pitch * 0.5 + (rushed ? 0.08 : 0), 0, r.sway * 0.5),
      chest: xyz(r.pitch * 0.5, shift * 0.08, r.sway * 0.5),
      neck: xyz(0, (r.gaze + glance) * 0.4, -r.sway * 0.3),
      head: xyz(headPitch, (r.gaze + glance) * 0.6, -r.sway * 0.2),
      leftUpperArm: quatMul(lap, rx(sleeper ? -0.2 : 0)),
      leftLowerArm: rx(sleeper ? -1.5 : rushed ? -1.25 : -0.95),
      rightUpperArm: quatMul(lap, rx(sleeper ? -0.2 : 0)),
      rightLowerArm: rx(sleeper ? -1.5 : rushed ? -1.25 : -0.95 - shift * 0.15),
      leftUpperLeg: xyz(SEATED.thigh, 0, -legSpread),
      leftLowerLeg: rx(SEATED.knee + (rushed ? -0.12 : 0)),
      rightUpperLeg: xyz(SEATED.thigh, 0, legSpread),
      rightLowerLeg: rx(SEATED.knee + (rushed ? -0.12 : shift * 0.08))
    },
    hipsOffset: [0, SEATED.hipsDrop, -0.02]
  };
}

/** One frame's bone pose for a driver (object-form quaternions, mode "replace"). */
export function figurePose(driver: HumanoidDriver, input: HumanoidPoseInput): HumanoidAnimationPose {
  return driver.pose(input);
}
