/**
 * CameraController — the live C-22 `app.camera` (PRD-08 §6.2/§6.4/§6.5).
 *
 * Owns the active rig (default: `static` at the scene's camera spec via
 * `rigs.fromSpec`), rig blends, an ordered layer stack (built-ins: lookAt,
 * punch, fovKick, trauma), channel ramps (setFov/setRoll), sequences, the
 * presented pose and the evidence record. `update(realDt, timeMs)` runs once
 * per frame — after interpolation, before render (§6.1).
 */
import type { AuraVec3 } from "../index.js";
import type {
  AuraCameraController,
  AuraCameraEvidence,
  AuraCameraLayer,
  AuraCameraPose,
  AuraCameraProbe,
  AuraCameraRig,
  AuraCameraRigContext,
  AuraCameraRigFactories,
  AuraCameraSequence,
  AuraCameraSequencePlayback,
  AuraCameraSubject,
  AuraEaseName
} from "../../contracts/camera.js";
import { stubCameraRigFactories } from "../../contracts/camera.js";
import {
  lookAtMat4,
  multiplyMat4,
  orthographicMat4,
  perspectiveMat4,
  rollUpVector,
  type Vec3
} from "@aura3d/scene/math";
import { springDamp } from "./Spring.js";
import { ease } from "./ease.js";
import {
  createFovKickLayer,
  createLookAtLayer,
  createPunchLayer,
  createTraumaLayer,
  type AuraLookAtLayer
} from "./layers/index.js";
import { createFromSpecRig, staticRig, DEFAULT_POSE, type LegacyCameraSpec, type LegacySpecRigDeps } from "./rigs/fromSpec.js";

export interface AuraCameraControllerDeps {
  /** Full subject resolution (runtime handle + scene-node fallback). Default: none. */
  readonly resolveSubject?: (ref: string | object) => AuraCameraSubject | undefined;
  /** Camera collision probe; default never hits. */
  readonly probe?: AuraCameraProbe;
  /** Viewport aspect (w/h); default 16/9. */
  readonly aspect?: () => number;
  /** Write-through hook: extension presents each pose to the camera node. */
  readonly applyPose?: (pose: AuraCameraPose) => void;
  /** C-14 hook: `app.cutCamera()` → resetTemporalHistory("camera-cut"). */
  readonly onCut?: () => void;
  /** Reduced-motion source; default false. */
  readonly reducedMotion?: () => boolean;
  /** Initial pose / spec the controller starts on (static or fromSpec). */
  readonly initial?: { readonly pose?: Partial<AuraCameraPose>; readonly spec?: LegacyCameraSpec };
  /** LegacySpecRig deps used when `initial.spec` is set (and by `spec()`). */
  readonly specDeps?: LegacySpecRigDeps;
}

interface RampState {
  target: number;
  halflife: number;
}

interface BlendState {
  fromPose: AuraCameraPose;
  toRig: AuraCameraRig;
  t: number;
  duration: number;
  easeFn: (t: number) => number;
}

interface SequenceState {
  sequence: AuraCameraSequence;
  elapsed: number;
  shotIndex: number;
  returnRig: AuraCameraRig;
  skipped: boolean;
  resolve: () => void;
  done: Promise<void>;
}

const NO_HIT_PROBE: AuraCameraProbe = {
  sphereCast: () => ({ hit: false, distance: Number.POSITIVE_INFINITY }),
  occluders: () => []
};

function mixV(a: AuraVec3, b: AuraVec3, t: number): AuraVec3 {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  ];
}

function mixPose(a: AuraCameraPose, b: AuraCameraPose, t: number): AuraCameraPose {
  return {
    position: mixV(a.position, b.position, t),
    target: mixV(a.target, b.target, t),
    up: mixV(a.up, b.up, t),
    roll: a.roll + (b.roll - a.roll) * t,
    fov: a.fov + (b.fov - a.fov) * t,
    near: a.near + (b.near - a.near) * t,
    far: a.far + (b.far - a.far) * t,
    orthographicSize:
      a.orthographicSize === undefined && b.orthographicSize === undefined
        ? undefined
        : (a.orthographicSize ?? b.orthographicSize ?? 0) +
          ((b.orthographicSize ?? a.orthographicSize ?? 0) - (a.orthographicSize ?? b.orthographicSize ?? 0)) * t
  };
}

export interface AuraCameraControllerImpl extends AuraCameraController {
  /** One camera step per frame: rig → blend → overrides → ramps → layers. */
  update(realDt: number, timeMs: number): AuraCameraPose;
  /** Frame-time subject context, exposed for drivers/tests. */
  makeContext(realDt: number, timeMs: number): AuraCameraRigContext;
  readonly lookAt: AuraLookAtLayer;
  /**
   * `camera.rigs` (C-22): static + fromSpec are real; the other nine factories
   * are the contract stubs until their rig implementations land (phase 3).
   */
  readonly rigs: AuraCameraRigFactories;
  /** View-projection captured at the end of the last `update` (C-5 helper backing). */
  readonly presentedViewProjection: () => readonly number[] | undefined;
}

/**
 * C-5 lane side of Q-15-1: the cached view-projection of `app.camera`'s last
 * presented pose, so the C8 call sites (`resolveCameraFrame`/`createViewProjection`
 * in index.ts) can read one import instead of re-deriving the spec eye. Returns
 * `undefined` on the flag-off stub (no `update` runs there) or pre-first-update.
 */
export function presentedViewProjection(app: { camera?: unknown }): readonly number[] | undefined {
  const c = app.camera as Partial<AuraCameraControllerImpl> | undefined;
  return c?.presentedViewProjection?.();
}

export function createCameraController(deps: AuraCameraControllerDeps = {}): AuraCameraControllerImpl {
  const initialPose: AuraCameraPose = {
    ...DEFAULT_POSE,
    ...(deps.initial?.pose ?? {}),
    ...(deps.initial?.spec
      ? { fov: deps.initial.spec.fov ?? DEFAULT_POSE.fov, near: deps.initial.spec.near ?? DEFAULT_POSE.near, far: deps.initial.spec.far ?? DEFAULT_POSE.far }
      : {})
  };

  let activeRig: AuraCameraRig = deps.initial?.spec
    ? createFromSpecRig(deps.initial.spec, deps.specDeps)
    : staticRig(initialPose);
  let presented: AuraCameraPose = initialPose;
  let previous: AuraCameraPose = initialPose;
  let presentedVp: readonly number[] | undefined;
  let overrides: Partial<AuraCameraPose> = {};
  const ramps = new Map<"fov" | "roll", RampState & { value: number }>();
  let blend: BlendState | undefined;
  let sequence: SequenceState | undefined;
  let cutThisFrame = false;
  let timeMs = 0;
  let frameDt = 1 / 60;

  const lookAt = createLookAtLayer();
  const punch = createPunchLayer();
  const fovKick = createFovKickLayer();
  const trauma = createTraumaLayer();

  // Canonical layer order (§6.1): lookAt → punch/fovKick → trauma → customs.
  const stack: { layer: AuraCameraLayer; order: number }[] = [
    { layer: lookAt, order: -30 },
    { layer: punch, order: -20 },
    { layer: fovKick, order: -15 },
    { layer: trauma, order: -10 }
  ];

  /** Per-frame subject cache + finite-difference velocity (springed, §7.1). */
  const velocities = new Map<object | string, { pos: AuraVec3; vel: AuraVec3; t: number }>();
  let frameSubjectCache = new Map<string | object, AuraCameraSubject | undefined>();

  const resolveSubject = (ref: string | object): AuraCameraSubject | undefined => {
    if (frameSubjectCache.has(ref)) return frameSubjectCache.get(ref);
    const base = deps.resolveSubject?.(ref);
    let subject = base;
    if (base) {
      const key = ref;
      const tracked = velocities.get(key);
      let vel: AuraVec3 = [0, 0, 0];
      if (tracked && timeMs > tracked.t) {
        const inst = scaleV(subV(base.position, tracked.pos), 1 / Math.max((timeMs - tracked.t) / 1000, 1e-6));
        vel = [
          springDamp(tracked.vel[0], inst[0], 0.05, frameDt),
          springDamp(tracked.vel[1], inst[1], 0.05, frameDt),
          springDamp(tracked.vel[2], inst[2], 0.05, frameDt)
        ];
      } else if (tracked) {
        vel = tracked.vel;
      }
      velocities.set(key, { pos: base.position, vel, t: timeMs });
      subject = { ...base, velocity: vel };
    }
    frameSubjectCache.set(ref, subject);
    return subject;
  };

  const subV = (a: AuraVec3, b: AuraVec3): AuraVec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const scaleV = (a: AuraVec3, s: number): AuraVec3 => [a[0] * s, a[1] * s, a[2] * s];

  function viewProjection(pose: AuraCameraPose, aspect: number): number[] {
    const forward: AuraVec3 = [
      pose.target[0] - pose.position[0],
      pose.target[1] - pose.position[1],
      pose.target[2] - pose.position[2]
    ];
    // scene/math Vec3 is a mutable tuple — widen the readonly AuraVec3s.
    const mut = (v: AuraVec3): Vec3 => [v[0], v[1], v[2]];
    const up = rollUpVector(mut(normalize3(forward)), mut(pose.up), pose.roll);
    const view = lookAtMat4(mut(pose.position), mut(pose.target), up);
    const proj =
      pose.orthographicSize !== undefined
        ? orthographicMat4(
            -pose.orthographicSize * aspect,
            pose.orthographicSize * aspect,
            -pose.orthographicSize,
            pose.orthographicSize,
            pose.near,
            pose.far
          )
        : perspectiveMat4((pose.fov * Math.PI) / 180, aspect, pose.near, pose.far);
    return Array.from(multiplyMat4(proj, view));
  }
  function normalize3(v: AuraVec3): AuraVec3 {
    const l = Math.hypot(v[0], v[1], v[2]);
    return l <= 1e-9 ? [0, 0, 1] : [v[0] / l, v[1] / l, v[2] / l];
  }

  function switchRig(rig: AuraCameraRig, o?: { blend?: number; ease?: AuraEaseName }): void {
    const blendSeconds = o?.blend ?? 0;
    if (blendSeconds <= 0) {
      activeRig = rig;
      rig.reset?.(presented);
      blend = undefined;
      return;
    }
    blend = {
      fromPose: presented,
      toRig: rig,
      t: 0,
      duration: blendSeconds,
      easeFn: ease[o?.ease ?? "inOutQuad"]
    };
    activeRig = rig;
  }

  function advanceSequence(dt: number): void {
    const seq = sequence;
    if (!seq || seq.skipped) return;
    seq.elapsed += dt;
    let acc = 0;
    let idx = -1;
    for (let i = 0; i < seq.sequence.shots.length; i += 1) {
      acc += seq.sequence.shots[i].duration;
      if (seq.elapsed < acc) {
        idx = i;
        break;
      }
    }
    if (idx < 0) {
      // sequence finished
      if (seq.sequence.onEnd === "return") {
        switchRig(seq.returnRig);
      }
      seq.resolve();
      sequence = undefined;
      return;
    }
    if (idx !== seq.shotIndex) {
      seq.shotIndex = idx;
      const shot = seq.sequence.shots[idx];
      switchRig(shot.rig, { blend: shot.blendIn ?? 0 });
    }
  }

  const rigs: AuraCameraRigFactories = {
    ...stubCameraRigFactories,
    static: (pose) => staticRig(pose, "static"),
    fromSpec: (spec) => createFromSpecRig(spec as LegacyCameraSpec, deps.specDeps)
  };

  const controller: AuraCameraControllerImpl = {
    lookAt,
    rigs,
    shake: trauma,
    punch,
    fovKick,

    presented: () => presented,
    get rig() {
      return activeRig;
    },

    makeContext(realDt, nowMs) {
      frameSubjectCache = new Map();
      return {
        dt: realDt,
        time: nowMs,
        aspect: deps.aspect?.() ?? 16 / 9,
        previous,
        subject: resolveSubject,
        probe: deps.probe ?? NO_HIT_PROBE
      };
    },

    update(realDt, nowMs) {
      cutThisFrame = false; // evidence flag is per-update, reset each frame
      frameDt = Math.max(realDt, 1e-6);
      timeMs = nowMs;
      const ctx = controller.makeContext(realDt, nowMs);
      advanceSequence(realDt);

      let pose = activeRig.update(ctx);
      if (blend) {
        blend.t += realDt;
        const w = blend.easeFn(Math.min(1, blend.t / blend.duration));
        pose = mixPose(blend.fromPose, pose, w);
        if (blend.t >= blend.duration) blend = undefined;
      }
      if (Object.keys(overrides).length > 0) pose = { ...pose, ...overrides };
      for (const [key, ramp] of ramps) {
        const current = key === "fov" ? pose.fov : pose.roll;
        const next = springDamp(current, ramp.target, ramp.halflife, realDt);
        pose = { ...pose, [key]: next };
        ramp.value = next;
      }
      const reducedMotion = deps.reducedMotion?.() ?? false;
      for (const entry of [...stack].sort((a, b) => a.order - b.order)) {
        pose = entry.layer.apply(pose, { dt: realDt, reducedMotion });
      }
      previous = presented;
      presented = pose;
      presentedVp = viewProjection(pose, deps.aspect?.() ?? 16 / 9);
      deps.applyPose?.(pose);
      return pose;
    },

    setPose(p, o) {
      overrides = { ...overrides, ...p };
      if (o?.cut) controller.cut();
    },

    setFov(fov, o) {
      if (o?.halflife === undefined || o.halflife <= 0) {
        overrides = { ...overrides, fov };
        ramps.delete("fov");
      } else {
        ramps.set("fov", { target: fov, halflife: o.halflife, value: presented.fov });
      }
    },

    setRoll(roll, o) {
      if (o?.halflife === undefined || o.halflife <= 0) {
        overrides = { ...overrides, roll };
        ramps.delete("roll");
      } else {
        ramps.set("roll", { target: roll, halflife: o.halflife, value: presented.roll });
      }
    },

    use(rig, o) {
      overrides = {};
      switchRig(rig, o);
    },

    addLayer(layer, order = 0) {
      stack.push({ layer, order });
      return () => {
        const i = stack.findIndex((e) => e.layer === layer);
        if (i >= 0) stack.splice(i, 1);
      };
    },

    play(seq) {
      let resolve: () => void = () => {};
      const done = new Promise<void>((r) => {
        resolve = r;
      });
      const state: SequenceState = {
        sequence: seq,
        elapsed: 0,
        shotIndex: -1,
        returnRig: activeRig,
        skipped: false,
        resolve,
        done
      };
      sequence = state;
      return {
        get progress() {
          const total = seq.shots.reduce((s, sh) => s + sh.duration, 0);
          return total <= 0 ? 1 : Math.min(1, state.elapsed / total);
        },
        skip() {
          state.skipped = true;
          if (seq.onEnd === "return") switchRig(state.returnRig);
          resolve();
          sequence = undefined;
        },
        done
      };
    },

    cut() {
      activeRig.reset?.();
      blend = undefined;
      for (const ramp of ramps.values()) ramp.halflife = Math.min(ramp.halflife, 1e-4);
      cutThisFrame = true;
      deps.onCut?.();
    },

    presentedViewProjection: () => presentedVp,

    evidence() {
      const aspect = deps.aspect?.() ?? 16 / 9;
      const record: AuraCameraEvidence = {
        kind: "aura-camera-presented",
        rig: activeRig.id,
        pose: presented,
        viewProjection: viewProjection(presented, aspect),
        layers: stack.map((e) => ({ id: e.layer.id, energy: e.layer.energy?.() ?? 0 })),
        cutThisFrame
      };
      return record;
    }
  };

  return controller;
}
