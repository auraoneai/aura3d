/**
 * Procedural multi-material `@aura3d/engine` model & locomotion layer (`art/proceduralModels.ts`).
 *
 * Zero external `.glb` files are loaded: mounts the articulated Bellkeeper Wanderer (`hero`),
 * highland cottages, belfry & bronze sanctuary bell, flora batches, standing stones, letters,
 * kite/wisp, and clinker skiff directly on `@aura3d/engine`.
 */
import { createAnimationController, type AuraApp, type scene } from "@aura3d/engine";
import { createLocomotion } from "@aura3d/engine/game";

type Scene = ReturnType<typeof scene>;
import { hasModel } from "./model-assets";
import { CLIP_SECONDS, HERO_GAITS, STRIDE_SPEED, type Gait } from "./locomotion";
import type { Scenery } from "./scenery";
import {
  applyBellkeeperRigPose,
  blendBellkeeperRigPoses,
  mountProceduralAnimatedActors,
  mountProceduralStaticScenery,
  sampleBellkeeperRigPose,
  type BellkeeperRigPose
} from "./art/proceduralModels";

export interface ModelSet {
  letter: boolean;
  bell: boolean;
  bellModel?: boolean;
  cottage: boolean;
  trees: boolean;
  hero: boolean;
  wisp: boolean;
  kite?: boolean;
  boat: boolean;
  stones: boolean;
  shrubs: boolean;
}

/**
 * Canonical belfry bounds and yoke pivot so the sculpted bronze sanctuary bell hangs on the mortised oak
 * crossbeam of `createBellShrineBelfryNode` and swings cleanly about `z`.
 */
export const BELLTOWER_FILE_BOUNDS = { min: [-0.576689, -0.951994, -0.531289], max: [0.575231, 0.950971, 0.52925] } as const;
export const BELL_PIVOT_IN_FILE = [0.002974, 0.621514, 0.190564] as const;
export const BELLTOWER_HEIGHT = 4.6;
export function bellModelPose(tower: { x: number; y: number; z: number; h?: number }): { position: [number, number, number]; scale: number } {
  const b = BELLTOWER_FILE_BOUNDS;
  const scale = (tower.h ?? BELLTOWER_HEIGHT) / (b.max[1] - b.min[1]);
  const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
  return {
    position: [tower.x + scale * (BELL_PIVOT_IN_FILE[0] - cx), tower.y + scale * (BELL_PIVOT_IN_FILE[1] - b.min[1]), tower.z + scale * (BELL_PIVOT_IN_FILE[2] - cz)],
    scale
  };
}

/** WW47-A1 kite: height of the placed kite (m), and where it flies relative to the traveller (downwind, up). */
export const KITE_HEIGHT = 1.5;
export const KITE_FLIGHT = { downwind: 4.6, up: 5.2, hand: [0.35, 1.55, 0.1] as const, towardViewDeg: 25 } as const;

export function availableModels(): ModelSet {
  return {
    letter: hasModel("letter"),
    bell: hasModel("belltower"),
    bellModel: hasModel("bell"),
    cottage: hasModel("cottage"),
    trees: hasModel("pine") && hasModel("oak"),
    hero: hasModel("hero"),
    wisp: hasModel("wisp"),
    kite: hasModel("kite"),
    boat: hasModel("boat"),
    stones: hasModel("stones"),
    shrubs: hasModel("shrub")
  };
}

/**
 * Static dressing: procedural multi-material Highland cottages, stone-and-timber belfry + resonant bronze bell,
 * windmill, packhorse bridge, wayside shrine, dry-stone walls, rune cairns, brass/glass lanterns, and wind-bent flora.
 */
export function addStaticModels(builder: Scene, sc: Scenery, set: ModelSet, shadows = false, _painted = false): void {
  const castShadow = shadows, receiveShadow = shadows;
  mountProceduralStaticScenery(builder, sc, set, castShadow, receiveShadow, bellModelPose);
}

/**
 * Animated actors: articulated multi-material Bellkeeper Wanderer (`hero`), wax-sealed letters,
 * swallowtail kite or filigree wisp, and clinker rowboat.
 */
export function addAnimatedModels(builder: Scene, set: ModelSet, letterCount: number, shadows = false, _painted = false): void {
  const castShadow = shadows, receiveShadow = shadows;
  mountProceduralAnimatedActors(builder, set, letterCount, castShadow, receiveShadow);
}

/** Seconds over which the measured ground speed is low-passed, and the time a new dominant gait must hold before the pose switches. */
export const SPEED_SMOOTH_SECONDS = 0.05;
export const GAIT_DWELL_SECONDS = 0.08;

export interface HeroDrive {
  x: number;
  z: number;
  airborne: boolean;
  onBoat: boolean;
  time: number;
  windTime?: number;
  gust?: number;
  hopPhase?: string;
  bellRing?: number;
  lookYaw?: number;
  lookPitch?: number;
}

export interface HeroAnimator {
  update(drive: HeroDrive): Gait;
  reset(x: number, z: number, time?: number): void;
  readonly gait: Gait;
  /** Continuous stride phase (0..1) of the moving gaits; it holds when the hero stops. */
  readonly cycle: number;
  /** Low-passed ground speed in world units per second. */
  readonly speed: number;
  /** Clip time (seconds) of the stride phase: where the playing clip is (the engine controller's local time). */
  readonly phaseSeconds: number;
  /** Playback rate of the current gait's clip (ground speed over its planted-foot speed, clamped). */
  readonly rate: number;
  /** Current bounded procedural Bellkeeper rig pose. */
  readonly pose: BellkeeperRigPose;
}

const HERO_CLIPS: readonly Gait[] = ["Idle", "Walk", "Run"];
const CROSSFADE_SECONDS = 0.15;

/**
 * Drives the Bellkeeper Wanderer's walk, run, and idle locomotion with `@aura3d/engine/game` `createLocomotion`
 * and `createAnimationController`, synchronizing both the animation controller playback state and the
 * articulated procedural Bellkeeper joint hierarchy (`art/proceduralModels.ts`).
 */
export function createHeroAnimator(app: AuraApp): HeroAnimator {
  const hero = app.nodes.require("hero");
  const getJoint = (id: string) => app.nodes.get?.(id);
  const hasProceduralRig = () => Boolean(getJoint("hero-hips"));
  const controller = createAnimationController<Gait>({
    id: "hero-animation",
    clipRegistry: { kind: "aura3d-embedded-glb-animation-registry", clips: HERO_CLIPS.map((id) => ({ id, name: id, duration: CLIP_SECONDS[id], loop: true })) },
    requiredClips: [...HERO_CLIPS],
    suppressRootMotion: true
  });
  const sinkTarget = {
    play(clip: string, opts: Record<string, unknown>) {
      if (!hasProceduralRig() && typeof (hero as { play?: unknown }).play === "function") {
        (hero as { play(c: string, o: Record<string, unknown>): unknown }).play(clip, opts);
      }
      return sinkTarget;
    }
  } as unknown as typeof hero;
  const binding = controller.bindRuntimeNode(sinkTarget, { id: "hero-binding", defaultClipId: "Idle" });
  const loco = createLocomotion({ gaits: HERO_GAITS, minRate: 0.6, maxRate: 1.7 });

  let gait: Gait = "Idle", issued: Gait | "" = "", lastX = 0, lastZ = 0, lastTime = 0, phaseSeconds = 0, primed = false;
  let cycle = 0, candidate: Gait = "Idle", candidateFor = 0, speedSmooth = 0, rate = 1;
  let currentPose: BellkeeperRigPose = sampleBellkeeperRigPose({ gait: "Idle", phaseSeconds: 0 });
  let fadeFromPose: BellkeeperRigPose = currentPose;
  let fadeElapsed = CROSSFADE_SECONDS;
  let fadeDuration = 0;

  return {
    get gait() { return gait; },
    get cycle() { return cycle; },
    get speed() { return speedSmooth; },
    get phaseSeconds() { return phaseSeconds; },
    get rate() { return rate; },
    get pose() { return currentPose; },
    reset(x, z, time) {
      loco.reset();
      gait = "Idle";
      issued = "";
      lastX = x;
      lastZ = z;
      if (time !== undefined) lastTime = time;
      phaseSeconds = 0;
      cycle = 0;
      candidate = "Idle";
      candidateFor = 0;
      speedSmooth = 0;
      rate = 1;
      primed = true;
      currentPose = sampleBellkeeperRigPose({ gait: "Idle", phaseSeconds: 0 });
      fadeFromPose = currentPose;
      fadeElapsed = CROSSFADE_SECONDS;
      fadeDuration = 0;
      if (hasProceduralRig()) applyBellkeeperRigPose(getJoint, currentPose);
    },
    update(drive) {
      const { x, z, airborne, onBoat, time } = drive;
      if (!primed) { lastX = x; lastZ = z; lastTime = time; primed = true; }
      const dt = time - lastTime;
      let clipStep = 0;
      if (dt > 0) {
        const raw = airborne ? STRIDE_SPEED.Run : onBoat ? 0 : Math.hypot(x - lastX, z - lastZ) / dt;
        speedSmooth = airborne || onBoat ? raw : speedSmooth + (raw - speedSmooth) * Math.min(1, dt / SPEED_SMOOTH_SECONDS);
        const frame = loco.update(speedSmooth, dt);
        const dominant = frame.dominant as Gait;
        if (dominant === gait) candidateFor = 0;
        else {
          if (dominant !== candidate) candidateFor = 0;
          candidate = dominant;
          candidateFor += dt;
          if (candidateFor >= GAIT_DWELL_SECONDS) {
            gait = dominant;
            candidateFor = 0;
          }
        }
        rate = frame.rates[gait] ?? 1;
        clipStep = dt * rate;
        if (gait !== "Idle") cycle = (cycle + clipStep / CLIP_SECONDS[gait]) % 1;
        phaseSeconds = gait === "Idle" ? time % CLIP_SECONDS.Idle : cycle * CLIP_SECONDS[gait];
        fadeElapsed = Math.min(CROSSFADE_SECONDS, fadeElapsed + dt);
        lastTime = time;
        lastX = x;
        lastZ = z;
      }
      if (issued !== gait) {
        const d = CLIP_SECONDS[gait];
        const firstIssue = issued === "";
        controller.crossFade(gait, firstIssue ? 0 : CROSSFADE_SECONDS, { loop: true, startTime: (((phaseSeconds - clipStep) % d) + d) % d });
        fadeFromPose = currentPose;
        fadeDuration = firstIssue ? 0 : CROSSFADE_SECONDS;
        fadeElapsed = 0;
        issued = gait;
        if (clipStep === 0) binding.update();
      }
      if (clipStep > 0) controller.update(clipStep);

      const targetPose = sampleBellkeeperRigPose({
        gait,
        phaseSeconds,
        windTime: drive.windTime ?? time,
        gust: drive.gust,
        hopPhase: drive.hopPhase ?? (airborne ? "air" : "idle"),
        onBoat,
        bellRing: drive.bellRing,
        lookYaw: drive.lookYaw,
        lookPitch: drive.lookPitch
      });
      currentPose =
        fadeDuration > 0 && fadeElapsed < fadeDuration
          ? blendBellkeeperRigPoses(fadeFromPose, targetPose, fadeElapsed / fadeDuration)
          : targetPose;
      if (hasProceduralRig()) {
        applyBellkeeperRigPose(getJoint, currentPose);
      }
      return gait;
    }
  };
}
