// Wonder World animation director (PRD 04 B07).
//
// Maps every gesture request to either a clip (only when the actor's model is
// loaded, rigged and MODEL_INFO lists that exact clip) or procedural motion
// (hop, squash-stretch, wag, bob, float, ...), adds the talking pulse while a
// line plays (a soft squash/bob, never lip sync), and returns each actor to
// idle when a gesture ends. Pure and deterministic: time only advances through
// update(dt); the stage turns the drained clip commands into engine calls and
// adds pose(id) to each node's transform.
//
// Clip priority for a rigged actor: travelling (walk/run/hop clip) > active
// gesture clip > talk clip (while its line plays and nothing else is active)
// > idle clip. Clips always play looped; the director switches them back when a
// gesture's nominal time is over, so a short clip never freezes on its last frame.
//
// Reduced motion halves procedural gestures, leaves out spins and idle loops,
// and keeps the talking pulse (at half strength). Song motions use the calm
// variant of their gesture (`calmGesture`); beats bring their own
// `reducedMotionStage`.

import type { Gesture, MoveStyle } from "../types.js";
import { SHARED_GESTURES } from "../characters/character-registry.js";
import {
  NEUTRAL_POSE,
  addPose,
  clamp01,
  dampPose,
  envelope,
  gestureMotion,
  phaseOf,
  proc,
  reducedMotionSpec,
  sampleGestureMotion,
  talkPulse,
  type GestureMotionSpec,
  type PoseOffset
} from "../scenes/motion.js";

/** What the director needs to animate a node. CharacterProfile satisfies it; props use propAnimationProfile. */
export interface AnimationProfile {
  gestureClip(gesture: Gesture): string | null;
  locomotionClip(style: MoveStyle): string | null;
  idleClip(): string | null;
  talkClip(): string | null;
  procedural(gesture: Gesture): GestureMotionSpec;
  idleMotion(): GestureMotionSpec | null;
  readonly talkStrength: number;
}

/** A glow halo fades in and out over this long (never switched on or off at once, reduced motion included). */
const HALO_FADE_SEC = 0.6;

/** Nominal play time of a gesture when a clip plays it (clips loop; the director switches back after this). */
export const GESTURE_CLIP_SECONDS: Readonly<Record<Gesture, number>> = {
  idle: 0,
  wave: 2.0,
  talk: 2.0,
  point: 1.5,
  happy: 1.6,
  cheer: 1.8,
  dance: 3.0,
  hop: 1.0,
  nod: 1.2,
  look: 2.4,
  sleep: 3.0,
  eat: 2.0,
  wake: 2.2,
  sway: 2.6,
  mirror: 2.4,
  pickUp: 1.8,
  shrug: 1.6,
  wag: 1.2,
  sniff: 1.4,
  bark: 0.6,
  sit: 1.0,
  clap: 2.0,
  stomp: 1.8,
  freeze: 1.2,
  peek: 1.6,
  hide: 1.0,
  float: 2.6,
  glow: 2.0,
  blink: 0.4,
  bow: 1.4,
  surprise: 0.8,
  wait: 1.0
};

/**
 * The calm variant of a gesture, played instead of it by song motions in reduced motion (07 B20; PRD 02
 * section 4 "Low-motion": no secondary bouncing, the semantic action stays). The bouncy gestures map to the
 * calm ones the stories' own `reducedMotionStage` choose most (dance to sway, happy and hop to nod); a cheer
 * becomes a soft clap. Every other gesture is calm already and plays as itself, so the variant of a variant
 * is itself.
 */
export const CALM_GESTURES: Readonly<Partial<Record<Gesture, Gesture>>> = {
  hop: "nod",
  happy: "nod",
  cheer: "clap",
  dance: "sway"
};

export function calmGesture(gesture: Gesture): Gesture {
  return CALM_GESTURES[gesture] ?? gesture;
}

export interface GesturePlan {
  readonly gesture: Gesture;
  /** The clip that plays it, or null for procedural motion. */
  readonly clip: string | null;
  /** Procedural motion when no clip plays it. */
  readonly motion: GestureMotionSpec | null;
  /** Play time when not looping. */
  readonly durationSec: number;
  /** Keep the end pose until the next gesture (procedural hide, sit, sleep). */
  readonly hold: boolean;
  /** Soft glow halo while it plays. */
  readonly halo: boolean;
  /** No idle breathing while it plays (freeze). */
  readonly still: boolean;
}

/** Decides how a gesture plays. Pure. */
export function planGesture(profile: AnimationProfile, gesture: Gesture, canPlayClips: boolean): GesturePlan {
  const spec = profile.procedural(gesture);
  if (gesture === "idle") {
    return { gesture, clip: canPlayClips ? profile.idleClip() : null, motion: null, durationSec: 0, hold: false, halo: false, still: false };
  }
  const clip = canPlayClips ? profile.gestureClip(gesture) : null;
  return {
    gesture,
    clip,
    motion: clip ? null : spec,
    durationSec: clip ? GESTURE_CLIP_SECONDS[gesture] : spec.durationSec,
    hold: clip ? false : spec.hold === true,
    halo: spec.halo === true,
    still: spec.still === true
  };
}

/** Idle loops for props, by asset trait. */
const PROP_IDLE: Readonly<Record<"none" | "breathe" | "sway" | "float" | "flutter", GestureMotionSpec | null>> = {
  none: null,
  breathe: gestureMotion([proc("pulse", 3.0, 0.012)]),
  sway: gestureMotion([proc("rock", 3.2, 0.04)]),
  float: gestureMotion([proc("float", 2.8, 0.06)]),
  flutter: gestureMotion([proc("flap", 0.9, 0.12, 2), proc("float", 2.4, 0.04)])
};

/** A clip-free profile for props and animals: shared gestures, an idle loop by trait, a small talk pulse. */
export function propAnimationProfile(idle: "none" | "breathe" | "sway" | "float" | "flutter", talkStrength = 0.04): AnimationProfile {
  const idleMotion = PROP_IDLE[idle];
  return {
    gestureClip: () => null,
    locomotionClip: () => null,
    idleClip: () => null,
    talkClip: () => null,
    procedural: (gesture) => SHARED_GESTURES[gesture],
    idleMotion: () => idleMotion,
    talkStrength
  };
}

export interface AnimatedNodeConfig {
  readonly id: string;
  readonly profile: AnimationProfile;
  /** The node draws a loaded rigged model (false for stand-ins and unrigged models). */
  readonly canPlayClips: boolean;
  /** The clip the scene already starts on (the builder's `.animate`), so no duplicate command is issued. */
  readonly initialClip?: string | null;
}

export interface ClipCommand {
  readonly actor: string;
  readonly clip: string;
  readonly loop: boolean;
}

export interface AnimationSnapshot {
  readonly gesture: Gesture | null;
  readonly loop: boolean;
  readonly elapsed: number;
  readonly clip: string | null;
  readonly procedural: boolean;
  readonly holding: boolean;
  readonly talking: boolean;
  readonly locomotion: MoveStyle | null;
}

export interface AnimationDirector {
  register(config: AnimatedNodeConfig): void;
  unregister(id: string): void;
  clear(): void;
  has(id: string): boolean;
  /** Starts a gesture. `idle` clears any gesture or held pose. Returns the plan, or null for an unknown id. */
  gesture(id: string, gesture: Gesture, loop: boolean): GesturePlan | null;
  /** Travel clip while a move runs (null when it stops). */
  setLocomotion(id: string, style: MoveStyle | null): void;
  /** The node whose line is playing (or null). */
  setTalking(id: string | null): void;
  talking(): string | null;
  setReducedMotion(on: boolean): void;
  update(dtSeconds: number): void;
  /** Procedural gesture + idle + talk offset for a node at the current time. */
  pose(id: string): PoseOffset;
  /** Glow halo strength 0..1 (soft rise and fall, never flashing). */
  halo(id: string): number;
  /** Clip changes since the last drain, in order. */
  drainClipCommands(): readonly ClipCommand[];
  snapshot(id: string): AnimationSnapshot | null;
  /** Seconds of animation time advanced so far. */
  time(): number;
}

interface NodeRun {
  readonly id: string;
  readonly profile: AnimationProfile;
  readonly canPlayClips: boolean;
  readonly phase: number;
  gesture: Gesture | null;
  loop: boolean;
  elapsed: number;
  plan: GesturePlan | null;
  holding: GestureMotionSpec | null;
  locomotion: MoveStyle | null;
  currentClip: string | null;
}

export function createAnimationDirector(options: { readonly reducedMotion?: boolean } = {}): AnimationDirector {
  const nodes = new Map<string, NodeRun>();
  const commands: ClipCommand[] = [];
  let time = 0;
  let reduced = options.reducedMotion === true;
  let talkingId: string | null = null;

  const desiredClip = (run: NodeRun): string | null => {
    if (!run.canPlayClips) return null;
    if (run.locomotion) {
      const travel = run.profile.locomotionClip(run.locomotion);
      if (travel) return travel;
    }
    if (run.gesture && run.plan?.clip) return run.plan.clip;
    if (talkingId === run.id && (run.gesture === null || run.gesture === "talk")) {
      const talk = run.profile.talkClip();
      if (talk) return talk;
    }
    return run.profile.idleClip();
  };

  const sync = (run: NodeRun | undefined): void => {
    if (!run || !run.canPlayClips) return;
    const clip = desiredClip(run);
    if (clip && clip !== run.currentClip) {
      commands.push({ actor: run.id, clip, loop: true });
      run.currentClip = clip;
    }
  };

  const director: AnimationDirector = {
    register(config) {
      const run: NodeRun = {
        id: config.id,
        profile: config.profile,
        canPlayClips: config.canPlayClips,
        phase: phaseOf(config.id),
        gesture: null,
        loop: false,
        elapsed: 0,
        plan: null,
        holding: null,
        locomotion: null,
        currentClip: config.initialClip ?? null
      };
      nodes.set(config.id, run);
      sync(run);
    },
    unregister(id) {
      nodes.delete(id);
      if (talkingId === id) talkingId = null;
    },
    clear() {
      nodes.clear();
      commands.length = 0;
      talkingId = null;
    },
    has(id) {
      return nodes.has(id);
    },
    gesture(id, gesture, loop) {
      const run = nodes.get(id);
      if (!run) return null;
      const plan = planGesture(run.profile, gesture, run.canPlayClips);
      run.holding = null;
      if (gesture === "idle") {
        run.gesture = null;
        run.plan = null;
        run.loop = false;
        run.elapsed = 0;
      } else {
        run.gesture = gesture;
        run.plan = plan;
        run.loop = loop;
        run.elapsed = 0;
      }
      sync(run);
      return plan;
    },
    setLocomotion(id, style) {
      const run = nodes.get(id);
      if (!run) return;
      run.locomotion = style;
      sync(run);
    },
    setTalking(id) {
      const previous = talkingId;
      talkingId = id;
      if (previous !== null && previous !== id) sync(nodes.get(previous));
      if (id !== null) sync(nodes.get(id));
    },
    talking() {
      return talkingId;
    },
    setReducedMotion(on) {
      reduced = on;
    },
    update(dtSeconds) {
      const dt = Number.isFinite(dtSeconds) ? Math.max(0, dtSeconds) : 0;
      time += dt;
      for (const run of nodes.values()) {
        if (!run.gesture || !run.plan) continue;
        run.elapsed += dt;
        if (!run.loop && run.elapsed >= run.plan.durationSec) {
          if (run.plan.hold && run.plan.motion) run.holding = run.plan.motion;
          run.gesture = null;
          run.plan = null;
          run.elapsed = 0;
          sync(run);
        }
      }
    },
    pose(id) {
      const run = nodes.get(id);
      if (!run) return NEUTRAL_POSE;
      const layers: PoseOffset[] = [];
      let still = false;
      if (run.gesture && run.plan) {
        still = run.plan.still;
        if (run.plan.motion) {
          const g = sampleGestureMotion(reduced ? reducedMotionSpec(run.plan.motion) : run.plan.motion, run.elapsed, run.loop);
          layers.push(reduced ? dampPose(g, 0.5) : g);
        }
      } else if (run.holding) {
        const g = sampleGestureMotion(reduced ? reducedMotionSpec(run.holding) : run.holding, run.holding.durationSec, false);
        layers.push(reduced ? dampPose(g, 0.5) : g);
        still = run.holding.still === true;
      }
      const idle = run.profile.idleMotion();
      if (idle && !reduced && !still && idle.durationSec > 0) {
        layers.push(sampleGestureMotion(idle, time + run.phase * idle.durationSec, true));
      }
      if (talkingId === id) {
        layers.push(talkPulse(time, run.profile.talkStrength * (reduced ? 0.5 : 1)));
      }
      return layers.length === 0 ? NEUTRAL_POSE : addPose(...layers);
    },
    halo(id) {
      const run = nodes.get(id);
      if (!run || !run.gesture || !run.plan || !run.plan.halo) return 0;
      // Every glow fades in and out over HALO_FADE_SEC, so it never switches on or off at once.
      const fadeIn = clamp01(run.elapsed / HALO_FADE_SEC);
      const fadeOut = run.loop ? 1 : clamp01((run.plan.durationSec - run.elapsed) / HALO_FADE_SEC);
      // Reduced motion: a steady glow (no breathing) between the soft fades.
      if (reduced) return 0.8 * Math.min(fadeIn, fadeOut);
      if (run.loop) return (0.75 + 0.25 * Math.sin((2 * Math.PI * run.elapsed) / 2.4)) * fadeIn;
      return envelope(clamp01(run.elapsed / Math.max(0.1, run.plan.durationSec)));
    },
    drainClipCommands() {
      return commands.splice(0, commands.length);
    },
    snapshot(id) {
      const run = nodes.get(id);
      if (!run) return null;
      return {
        gesture: run.gesture,
        loop: run.loop,
        elapsed: run.elapsed,
        clip: run.currentClip,
        procedural: run.plan?.motion !== null && run.plan !== null,
        holding: run.holding !== null,
        talking: talkingId === id,
        locomotion: run.locomotion
      };
    },
    time() {
      return time;
    }
  };
  return director;
}
