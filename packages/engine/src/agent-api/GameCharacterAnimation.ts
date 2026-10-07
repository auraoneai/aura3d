/**
 * Lane 06 (PRD-06 T0.9a) — clip-map validation for character-driven games.
 *
 * A clip map binds each gameplay state (idle, walk, dash, …) to a real embedded
 * GLB clip on the mounted actor. `validateClipMap` is the contract both lane
 * fixtures and templates call before trusting a map: every required state must
 * be mapped, every mapped clip must exist on the asset, and every declared
 * stand-in surfaces exactly one `FIGHTER_CLIP_STAND_IN` warning so coverage
 * debt stays visible instead of silently passing.
 */

/** One map entry: the embedded clip name, and whether it is a declared stand-in. */
export interface AuraClipMapEntry {
  readonly clip: string;
  readonly standIn?: true;
}

export interface AuraClipMapMissingEntry {
  readonly state: string;
  readonly clip?: string;
}

export interface AuraClipMapValidationReport {
  readonly ok: boolean;
  /** States with no map entry, or mapped to a clip absent from the asset. */
  readonly missing: readonly AuraClipMapMissingEntry[];
  /** One entry per declared `standIn: true`, emitted in map order. */
  readonly standIns: readonly { readonly state: string; readonly clip: string }[];
  readonly diagnostics: readonly string[];
}

export interface AuraClipMapValidationOptions<State extends string> {
  /** Clip names the asset actually embeds (e.g. manifest `metadata.animations`). */
  readonly availableClips: Iterable<string>;
  /** Every gameplay state that must resolve to a clip. */
  readonly requiredStates: readonly State[];
  /** Label for diagnostics (fighter id / asset key). */
  readonly label?: string;
}

/**
 * Error thrown by `validateClipMap` when a required state is unmapped or a
 * mapped clip is absent from the asset. `code` is `FIGHTER_CLIP_MISSING` and
 * `missing` carries the full list (spec T0.9a: "throws FIGHTER_CLIP_MISSING
 * with the list").
 */
export class AuraClipMapMissingError extends Error {
  readonly code = "FIGHTER_CLIP_MISSING";
  readonly missing: readonly AuraClipMapMissingEntry[];
  constructor(missing: readonly AuraClipMapMissingEntry[], label?: string) {
    const rendered = missing
      .map((entry) => (entry.clip ? `${entry.state}→"${entry.clip}"` : entry.state))
      .join(", ");
    super(`FIGHTER_CLIP_MISSING${label ? ` (${label})` : ""}: ${rendered}`);
    this.name = "AuraClipMapMissingError";
    this.missing = missing;
  }
}

/**
 * Validate one fighter's clip map against its asset's embedded clips.
 *
 * - Every `requiredStates` entry must be mapped (unmapped states fail).
 * - Every mapped clip must appear in `availableClips` (absent clips fail).
 * - Each `standIn: true` emits exactly one `FIGHTER_CLIP_STAND_IN` warning and
 *   is counted in the returned report; stand-ins never count as coverage.
 *
 * Throws `AuraClipMapMissingError` when `missing` is non-empty; otherwise
 * returns the report.
 */
export function validateClipMap<State extends string>(
  map: Partial<Record<State, AuraClipMapEntry | string>>,
  options: AuraClipMapValidationOptions<State>
): AuraClipMapValidationReport {
  const available = new Set(options.availableClips);
  const missing: AuraClipMapMissingEntry[] = [];
  const standIns: { readonly state: string; readonly clip: string }[] = [];
  const diagnostics: string[] = [];

  for (const state of options.requiredStates) {
    const raw = map[state];
    const entry: AuraClipMapEntry | undefined =
      typeof raw === "string" ? { clip: raw } : raw;
    if (!entry) {
      missing.push({ state });
      diagnostics.push(`${options.label ?? "fighter"} has no clip mapped for state "${state}".`);
      continue;
    }
    if (!available.has(entry.clip)) {
      missing.push({ state, clip: entry.clip });
      diagnostics.push(`${options.label ?? "fighter"} maps "${state}" to absent clip "${entry.clip}".`);
      continue;
    }
    if (entry.standIn === true) {
      standIns.push({ state, clip: entry.clip });
      const warning = `FIGHTER_CLIP_STAND_IN: ${options.label ?? "fighter"} state "${state}" stands in with "${entry.clip}".`;
      diagnostics.push(warning);
      console.warn(warning);
    }
  }

  if (missing.length > 0) {
    throw new AuraClipMapMissingError(missing, options.label);
  }
  return { ok: true, missing, standIns, diagnostics };
}

/* ------------------------------------------------------------------------ */
/* T4.2 (PRD-06 §7.1) — `characterAnimation(controller, node, spec)`: binds a  */
/* locomotion controller (ArcadeCharacterController / FightingCharacter-      */
/* Controller from @aura3d/physics, or the procedural LocomotionController    */
/* from @aura3d/animation) to a runtime node's GLB clip set: a 1-D (speed) or */
/* 2-D (velocity-local) blend tree on one shared sync-group phase, airborne   */
/* states with a landing blend, masked-layer one-shot actions, optional foot  */
/* IK + look-at constraints, and per-actor dt via C-23                        */
/* (rawDt * app.time.scale * handle.timeScale — both stub 1 until prd08       */
/* wires `app.time`; the app-scale provider installs the same way             */
/* `setActorAnimationAppTimeScale` does in compiler/animation.ts).            */
/*                                                                          */
/* The binding publishes `clipSamples` onto `node.setAnimationBinding` every  */
/* update — the CCR-06-5 field `dispatchActorAnimation` already reads under   */
/* `A3D_QR_ANIMATION` → `actor.animation.applyClips`. Layer/mask/sync live in */
/* the sample entries; the clip set is resolved via                          */
/* `animation.resolveAnimationClips()` when the node exposes it.             */
/* ------------------------------------------------------------------------ */

import type { AuraBoneMaskSpec, AuraRootMotionSpec } from "../contracts/animation.js";
import type { FootIkConstraintSpec } from "../../../animation/src/FootIk.js";
import type { LookAtConstraintSpec } from "../../../animation/src/pose/LookAtConstraint.js";

/** Normalized controller state the binding consumes each frame. */
export interface AuraCharacterControllerSnapshot {
  /** Horizontal speed in m/s (for `param: "speed"`). */
  readonly speed: number;
  /** World velocity (for `param: "velocity2d"`); [x, y, z]. */
  readonly velocity?: readonly [number, number, number];
  /** Feet on ground; drives the airborne state machine. */
  readonly grounded: boolean;
  /** A jump/fall edge started this frame (controller-reported). */
  readonly jumped?: boolean;
  /** Turn rate in rad/s for `turnInPlace` (optional; ~0 when absent). */
  readonly turnRate?: number;
  /** Free-form controller state label (e.g. "walk" / "jump" / "fast-fall"). */
  readonly state?: string;
}

/** Structural controller union — physics + animation controllers all read. */
export interface AuraCharacterControllerLike {
  readonly snapshot?: () => Readonly<Record<string, unknown>>;
  readonly state?: Readonly<Record<string, unknown>>;
}

export interface AuraLocomotionClipEntry {
  /** Embedded clip name on the actor's GLB. */
  readonly clip: string;
  /** Control point: a speed (m/s) for `param:"speed"`, or an [x,z] local-velocity point for `param:"velocity2d"`. */
  readonly at: number | readonly [number, number];
  /** Clip duration in seconds — used to keep the sync group's normalized phase shared; resolved from the actor when omitted. */
  readonly duration?: number;
}

export interface AuraCharacterAnimationSpec {
  readonly locomotion: {
    readonly param: "speed" | "velocity2d";
    readonly clips: readonly AuraLocomotionClipEntry[];
    /** Shared normalized-phase group name (default "locomotion"). */
    readonly syncGroup?: string;
    /** Weight EMA time constant in seconds (default 0 = no smoothing). */
    readonly smoothing?: number;
  };
  readonly airborne?: {
    /** One-shot played once on the grounded→airborne edge. */
    readonly jumpStart?: string;
    /** Loop while airborne (default: hold locomotion weights). */
    readonly fall?: string;
    /** One-shot on landing; blended over `landBlend` seconds back into locomotion. */
    readonly land?: string;
    /** Landing blend seconds (default 0.12). */
    readonly landBlend?: number;
  };
  readonly turnInPlace?: {
    readonly left?: string;
    readonly right?: string;
    /** |turnRate| above this (deg/s) engages the turn clip (default 60). */
    readonly thresholdDeg?: number;
  };
  /** Masked-layer actions triggered by name through `binding.trigger`. */
  readonly actions?: Readonly<Record<string, {
    readonly clip: string;
    readonly layer?: string;
    readonly mask?: AuraBoneMaskSpec;
    readonly transition?: "crossfade" | "inertialize";
    /** Weight ramp-in seconds (default 0.08). */
    readonly blendIn?: number;
    /** Weight ramp-out seconds before the clip ends (default 0.15). */
    readonly blendOut?: number;
    /** Clip duration — resolved from the actor when omitted. */
    readonly duration?: number;
  }>>;
  readonly footIk?: boolean | FootIkConstraintSpec;
  readonly lookAt?: false | LookAtConstraintSpec;
  readonly rootMotion?: false | AuraRootMotionSpec;
}

export interface AuraCharacterAnimationWeight {
  readonly clip: string;
  readonly weight: number;
  readonly layer?: string;
  readonly syncGroup?: string;
}

export interface AuraCharacterAnimationSnapshot {
  readonly speed: number;
  readonly smoothedSpeed: number;
  readonly grounded: boolean;
  /** "ground" | "jump-start" | "fall" | "land". */
  readonly airborneState: "ground" | "jump-start" | "fall" | "land";
  readonly weights: readonly AuraCharacterAnimationWeight[];
  readonly activeAction?: string;
  /** Max pairwise normalized-phase difference inside the sync group (0–1). */
  readonly syncError: number;
  readonly sharedPhase: number;
}

export interface AuraCharacterAnimationBinding {
  trigger(action: string): void;
  snapshot(): AuraCharacterAnimationSnapshot;
  /**
   * Advance the binding. `dt` is the caller's raw frame dt in seconds — the
   * binding scales it per C-23 (`app.time.scale * handle.timeScale`).
   */
  update(dt: number): void;
  dispose(): void;
}

/** Optional duration source: the node's `animation` api resolving clip info. */
interface AnimationHandleLike {
  readonly animation?: {
    readonly resolveAnimationClips?: () => Promise<readonly { readonly clip?: string; readonly name?: string; readonly duration: number }[]>;
    readonly ik?: { readonly add: (spec: unknown) => void; readonly clear: () => void };
    readonly springBones?: { readonly add: (spec: unknown) => void; readonly clear: () => void };
  };
  readonly setAnimationBinding?: (binding: unknown) => unknown;
  readonly timeScale?: number;
}

/* C-23 app-time-scale provider — installed by the game/app seam the same way
 * `setActorAnimationAppTimeScale` is for the compile path (defaults 1). */
let characterAnimationAppTimeScale: (() => number) | undefined;
export function setCharacterAnimationAppTimeScale(provider: (() => number) | undefined): void {
  characterAnimationAppTimeScale = provider;
}

function readControllerSnapshot(controller: AuraCharacterControllerLike): AuraCharacterControllerSnapshot {
  const raw = typeof controller.snapshot === "function" ? controller.snapshot() : (controller.state ?? {});
  const velocity = (raw as { readonly velocity?: readonly [number, number, number] }).velocity;
  const speed = typeof (raw as { readonly speed?: unknown }).speed === "number"
    ? (raw as { readonly speed: number }).speed
    : velocity !== undefined ? Math.hypot(velocity[0], velocity[2]) : 0;
  return {
    speed,
    velocity,
    grounded: (raw as { readonly grounded?: boolean }).grounded ?? true,
    jumped: (raw as { readonly jumpedThisFrame?: boolean }).jumpedThisFrame ?? (raw as { readonly jumped?: boolean }).jumped ?? false,
    turnRate: (raw as { readonly turnRate?: number }).turnRate ?? 0,
    state: (raw as { readonly state?: string }).state
  };
}

/* ---- 1-D blend tree: piecewise-linear weights over sorted control points. */
function blend1D(clips: readonly { readonly clip: string; readonly at: number; readonly duration?: number }[], x: number): readonly { clip: string; weight: number }[] {
  const sorted = [...clips].sort((a, b) => a.at - b.at);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  if (x <= first.at) return [{ clip: first.clip, weight: 1 }];
  if (x >= last.at) return [{ clip: last.clip, weight: 1 }];
  let upper = sorted.length - 1;
  for (let i = 0; i < sorted.length; i++) { if (sorted[i]!.at >= x) { upper = i; break; } }
  const lo = sorted[upper - 1]!, hi = sorted[upper]!;
  const span = hi.at - lo.at;
  const whi = span <= 0 ? 1 : (x - lo.at) / span;
  const out: { clip: string; weight: number }[] = [];
  if (whi < 1) out.push({ clip: lo.clip, weight: 1 - whi });
  if (whi > 0) out.push({ clip: hi.clip, weight: whi });
  return out;
}

/* ---- 2-D blend tree: barycentric over the origin-centred angular fan. ---- */
function blend2D(clips: readonly { readonly clip: string; readonly at: readonly [number, number]; readonly duration?: number }[], x: number, z: number): readonly { clip: string; weight: number }[] {
  // Seed the origin with the slowest-magnitude clip if the spec has none.
  const entries = clips.map((c) => ({ clip: c.clip, at: c.at }));
  let idle = entries.find((c) => Math.hypot(c.at[0], c.at[1]) < 1e-6);
  if (!idle) {
    idle = entries.reduce((a, b) => (Math.hypot(a.at[0], a.at[1]) <= Math.hypot(b.at[0], b.at[1]) ? a : b));
  }
  const r = Math.hypot(x, z);
  if (r < 1e-6) return [{ clip: idle.clip, weight: 1 }];
  const others = entries.filter((c) => c !== idle).sort((a, b) => Math.atan2(a.at[1], a.at[0]) - Math.atan2(b.at[1], b.at[0]));
  if (others.length === 0) return [{ clip: idle.clip, weight: 1 }];
  if (others.length === 1) return r <= Math.hypot(others[0]!.at[0], others[0]!.at[1])
    ? [{ clip: idle.clip, weight: 1 - r / Math.hypot(others[0]!.at[0], others[0]!.at[1]) }, { clip: others[0]!.clip, weight: r / Math.hypot(others[0]!.at[0], others[0]!.at[1]) }]
    : [{ clip: others[0]!.clip, weight: 1 }];
  // Angular fan around the origin — find the two neighbours bracketing (x,z).
  const ang = Math.atan2(z, x);
  const toTwoPi = (a: number) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const angles = others.map((c) => toTwoPi(Math.atan2(c.at[1], c.at[0])));
  const target = toTwoPi(ang);
  let i = 0;
  for (; i < others.length; i++) {
    const a0 = angles[i]!, a1 = angles[(i + 1) % others.length]!;
    const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
    const wraps = hi - lo > Math.PI;
    const inside = wraps ? target >= hi || target <= lo : target >= lo && target <= hi;
    if (inside) {
      const c0 = others[i]!, c1 = others[(i + 1) % others.length]!;
      // Barycentric inside triangle (origin, c0, c1), clamped to ≥ 0 for the
      // radial overshoot case (point beyond the outer edge → the two rim clips).
      const [x0, z0] = c0.at, [x1, z1] = c1.at;
      const det = x0 * z1 - x1 * z0;
      let w0 = 0, w1 = 0, wi = 1;
      if (Math.abs(det) > 1e-9) {
        w0 = (x * z1 - x1 * z) / det;
        w1 = (x0 * z - x * z0) / det;
        if (w0 < 0 || w1 < 0 || w0 + w1 > 1) {
          // Beyond the fan edge: project onto the outer edge c0↔c1.
          const ex = x1 - x0, ez = z1 - z0;
          const t = Math.max(0, Math.min(1, ((x - x0) * ex + (z - z0) * ez) / (ex * ex + ez * ez)));
          w0 = 1 - t; w1 = t; wi = 0;
        } else {
          wi = 1 - w0 - w1;
        }
      }
      const out: { clip: string; weight: number }[] = [];
      if (wi > 1e-4) out.push({ clip: idle.clip, weight: wi });
      if (w0 > 1e-4) out.push({ clip: c0.clip, weight: w0 });
      if (w1 > 1e-4) out.push({ clip: c1.clip, weight: w1 });
      return out.length > 0 ? out : [{ clip: idle.clip, weight: 1 }];
    }
  }
  return [{ clip: idle.clip, weight: 1 }];
}

const DEG = 180 / Math.PI;

let characterAnimationCounter = 0;

export function characterAnimation(
  controller: AuraCharacterControllerLike,
  node: AnimationHandleLike,
  spec: AuraCharacterAnimationSpec
): AuraCharacterAnimationBinding {
  const syncGroup = spec.locomotion.syncGroup ?? "locomotion";
  const smoothing = spec.locomotion.smoothing ?? 0;
  const controllerId = `characterAnimation-${++characterAnimationCounter}`;
  const durations = new Map<string, number>();
  for (const entry of spec.locomotion.clips) if (entry.duration !== undefined) durations.set(entry.clip, entry.duration);
  for (const action of Object.values(spec.actions ?? {})) if (action.duration !== undefined) durations.set(action.clip, action.duration);

  const handle = node as AnimationHandleLike;
  const animationApi = handle.animation;

  // Clip durations: explicit spec fields win, else the node's resolve pass.
  if (animationApi?.resolveAnimationClips) {
    void animationApi.resolveAnimationClips().then((clips) => {
      for (const clip of clips) {
        const name = clip.clip ?? clip.name;
        if (name !== undefined && !durations.has(name)) durations.set(name, clip.duration);
      }
    }).catch(() => undefined);
  }

  // Constraints registered once at bind (evaluated by the actor's pose pipeline).
  if (spec.footIk !== undefined && spec.footIk !== false && animationApi?.ik) {
    animationApi.ik.add({ kind: "foot-ik", ...(spec.footIk === true ? {} : spec.footIk) });
  }
  if (spec.lookAt !== undefined && spec.lookAt !== false && animationApi?.ik) {
    animationApi.ik.add({ kind: "look-at", ...spec.lookAt });
  }

  interface LayerState {
    clip: string;
    weight: number;
    layer?: string;
    mask?: AuraBoneMaskSpec;
    additive?: boolean;
    /** Local clip clock in seconds. */
    time: number;
    /** For one-shots: remaining live seconds before fade-out. */
    remaining?: number;
    fadeIn?: number;
    fadeOut?: number;
    oneShot?: boolean;
  }

  const layers: LayerState[] = [];
  let grounded = true;
  let airborneState: AuraCharacterAnimationSnapshot["airborneState"] = "ground";
  let landBlendLeft = 0;
  let smoothedSpeed = 0;
  let sharedPhase = 0;          // sync-group normalized phase [0,1)
  let disposed = false;
  let activeAction: string | undefined;
  let turnClip: { clip: string; time: number } | undefined;

  const handleTimeScale = () => {
    const s = handle.timeScale;
    return typeof s === "number" && Number.isFinite(s) ? s : 1;
  };

  function publish(samples: readonly AuraCharacterAnimationWeight[]): void {
    if (disposed || !handle.setAnimationBinding) return;
    handle.setAnimationBinding({
      kind: "aura-runtime-node-animation-binding",
      controllerId,
      clipSamples: samples.map((s) => ({ clipName: s.clip, localTime: clipTime(s.clip), weight: s.weight, layer: s.layer, syncGroup: s.syncGroup, ...(sampleMask(s.clip) !== undefined ? { mask: sampleMask(s.clip) } : {}) })),
      ...(spec.rootMotion ? { rootMotion: spec.rootMotion } : {})
    });
  }
  const maskByClip = new Map<string, AuraBoneMaskSpec>();
  const layerByClip = new Map<string, string>();
  for (const [name, action] of Object.entries(spec.actions ?? {})) {
    if (action.mask) maskByClip.set(action.clip, action.mask);
    layerByClip.set(action.clip, action.layer ?? "actions");
  }
  const sampleMask = (clip: string) => maskByClip.get(clip);
  function clipTime(clip: string): number {
    const duration = durations.get(clip);
    return duration !== undefined && duration > 0 ? sharedPhase * duration : layers.find((l) => l.clip === clip)?.time ?? 0;
  }

  function locomotionWeights(speed: number, velocity?: readonly [number, number, number]): readonly { clip: string; weight: number }[] {
    if (spec.locomotion.param === "velocity2d") {
      const v = velocity ?? [0, 0, 0];
      return blend2D(spec.locomotion.clips as readonly { clip: string; at: readonly [number, number]; duration?: number }[], v[0], v[2]);
    }
    return blend1D(spec.locomotion.clips as readonly { clip: string; at: number; duration?: number }[], speed);
  }

  function update(rawDt: number): void {
    if (disposed) return;
    const dt = rawDt * (characterAnimationAppTimeScale?.() ?? 1) * handleTimeScale();
    const snap = readControllerSnapshot(controller);
    smoothedSpeed = smoothing > 0 ? smoothedSpeed + (snap.speed - smoothedSpeed) * (1 - Math.exp(-dt / smoothing)) : snap.speed;

    /* ---- airborne state machine ------------------------------------------- */
    const wasGrounded = grounded;
    grounded = snap.grounded;
    if (grounded && !wasGrounded) {
      // Landing edge.
      if (spec.airborne?.land) {
        airborneState = "land";
        landBlendLeft = spec.airborne.landBlend ?? 0.12;
        layers.push({ clip: spec.airborne.land, weight: 0, time: 0, remaining: durations.get(spec.airborne.land) ?? 0.4, fadeIn: 0.03, oneShot: true });
      } else {
        airborneState = "ground";
      }
      // Drop the fall/jump-start layers.
      for (const l of layers) if (l.layer === "airborne") l.remaining = Math.min(l.remaining ?? 0.05, 0.05);
    } else if (!grounded && wasGrounded) {
      airborneState = snap.jumped && spec.airborne?.jumpStart ? "jump-start" : "fall";
      if (spec.airborne?.jumpStart && snap.jumped) {
        layers.push({ clip: spec.airborne.jumpStart, weight: 0, layer: "airborne", time: 0, remaining: durations.get(spec.airborne.jumpStart) ?? 0.35, fadeIn: 0.06, oneShot: true });
      }
      if (spec.airborne?.fall) {
        layers.push({ clip: spec.airborne.fall, weight: 0, layer: "airborne", time: 0, fadeIn: 0.15 });
      }
    }
    if (airborneState === "jump-start") airborneState = "fall";
    if (airborneState === "land") {
      landBlendLeft -= dt;
      if (landBlendLeft <= 0) airborneState = "ground";
    }

    /* ---- blend tree -------------------------------------------------------- */
    const loco = grounded || airborneState === "land" ? locomotionWeights(smoothedSpeed, snap.velocity) : [];
    // The sync group's shared normalized phase advances once per frame; every
    // locomotion sample maps phase→time through its own duration, which is
    // what keeps walk/run footfalls aligned (three.js `sync` semantics).
    const phaseRate = loco.reduce((rate, w) => {
      const duration = durations.get(w.clip);
      return rate + w.weight * (duration !== undefined && duration > 0 ? 1 / duration : 1);
    }, 0);
    if (loco.length > 0 && snap.speed > 0.01) sharedPhase = (sharedPhase + dt * Math.max(phaseRate, 1e-6)) % 1;

    // Turn-in-place override: near-zero speed + turn rate above threshold.
    let turn: { clip: string; weight: number } | undefined;
    if (spec.turnInPlace && grounded && smoothedSpeed < 0.1) {
      const threshold = (spec.turnInPlace.thresholdDeg ?? 60) / DEG;
      const rate = snap.turnRate ?? 0;
      const clip = rate > threshold ? spec.turnInPlace.right : rate < -threshold ? spec.turnInPlace.left : undefined;
      if (clip) turn = { clip, weight: Math.min(1, Math.abs(rate) / (threshold * 2)) };
    }
    turnClip = turn ? { clip: turn.clip, time: turnClip?.clip === turn.clip ? turnClip.time + dt : 0 } : undefined;

    /* ---- layer bookkeeping ------------------------------------------------- */
    const published: AuraCharacterAnimationWeight[] = [];
    for (const w of loco) {
      published.push({ clip: w.clip, weight: w.weight, syncGroup });
      const live = layers.find((l) => l.clip === w.clip && !l.layer && !l.oneShot);
      if (live) { live.weight = w.weight; } else layers.push({ clip: w.clip, weight: w.weight, time: 0 });
    }
    if (turn) published.push({ clip: turn.clip, weight: turn.weight, layer: "turn" });
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i];
      l.time += dt;
      const targetW = l.layer === "airborne" ? 1 : l.oneShot ? 1 : 0;
      if (l.oneShot || l.layer !== undefined) {
        const w = Math.min(1, l.time / Math.max(1e-6, l.fadeIn ?? 0.08)) * (l.remaining !== undefined ? Math.max(0, Math.min(1, l.remaining / Math.max(1e-6, l.fadeOut ?? 0.15))) : 1);
        if (w * targetW > 1e-6) {
          published.push({ clip: l.clip, weight: w * targetW, layer: l.layer ?? (l.oneShot ? "oneshot" : undefined) });
        }
        if (l.remaining !== undefined) {
          l.remaining -= dt;
          if (l.remaining <= -0.05) layers.splice(i, 1);
        }
      } else if (!loco.some((w) => w.clip === l.clip)) {
        layers.splice(i, 1);
      }
    }
    publish(published.filter((p) => p.weight > 1e-6));
  }

  function trigger(action: string): void {
    const entry = spec.actions?.[action];
    if (!entry || disposed) return;
    const layer = entry.layer ?? "actions";
    // Replace the layer's current action.
    for (const l of layers) if (l.layer === layer) l.remaining = 0;
    layers.push({
      clip: entry.clip,
      weight: 0,
      layer,
      mask: entry.mask,
      time: 0,
      remaining: entry.duration ?? durations.get(entry.clip) ?? Number.POSITIVE_INFINITY,
      fadeIn: entry.blendIn ?? 0.08,
      fadeOut: entry.blendOut ?? 0.15,
      oneShot: true
    });
    maskByClip.set(entry.clip, entry.mask ?? { include: [] });
    layerByClip.set(entry.clip, layer);
    activeAction = action;
  }

  function snapshot(): AuraCharacterAnimationSnapshot {
    const snap = readControllerSnapshot(controller);
    const locoClips = new Set(spec.locomotion.clips.map((c) => c.clip));
    const active = layers.filter((l) => locoClips.has(l.clip));
    // Published times come from the shared sync-group phase, so per-clip
    // normalised phases are compared on those (time/duration), not on the
    // raw per-clip clock which drifts at rate 1.
    const phases = active.map((l) => {
      const d = durations.get(l.clip);
      return d !== undefined && d > 0 ? (clipTime(l.clip) / d) % 1 : 0;
    });
    const syncError = phases.length > 1 ? Math.max(...phases) - Math.min(...phases) : 0;
    return {
      speed: snap.speed,
      smoothedSpeed,
      grounded,
      airborneState,
      weights: layers.filter((l) => l.weight > 0 || locoClips.has(l.clip)).map((l) => ({ clip: l.clip, weight: l.weight, layer: l.layer, syncGroup: locoClips.has(l.clip) ? syncGroup : undefined })),
      ...(activeAction !== undefined ? { activeAction } : {}),
      syncError: Math.min(syncError, 1 - syncError),
      sharedPhase
    };
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    animationApi?.ik?.clear();
    handle.setAnimationBinding?.(undefined);
  }

  return { trigger, snapshot, update, dispose };
}
