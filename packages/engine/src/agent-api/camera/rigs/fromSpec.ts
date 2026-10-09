/**
 * `rigs.static` + `rigs.fromSpec` (LegacySpecRig) — C-22.
 *
 * `fromSpec` reproduces the pre-controller camera resolution EXACTLY
 * (`resolveCameraTarget`/`resolveCameraEye`/`resolveCameraFrame` at
 * index.ts:10996–11117) so `scene().camera(spec)` content is bit-identical
 * under `A3D_QR_CAMERA` (S4: 40 golden tuples within 1e-6). This is the only
 * smoothing that stays first-order: `halflife = ln2 / (-ln(1-s)·60)` is the
 * identical filter (§6.3), and the rig applies the legacy state machine
 * (snap on first frame / >250 ms gap / same-time reuse) rather than the
 * halflife form so timing edges match too.
 */
import type { AuraVec3 } from "../../index.js";
import type {
  AuraCameraPose,
  AuraCameraRig,
  AuraCameraRigContext
} from "../../../contracts/camera.js";
import { subjectRotationY } from "../subject.js";

/* mix3 duplicated on purpose — importing the barrel (agent-api/index.ts) from
 * a lane module recreates the ESM cycle lane 15 just removed (8337cc9f). */
function mix3(from: AuraVec3, to: AuraVec3, amount: number): AuraVec3 {
  return [
    from[0] + (to[0] - from[0]) * amount,
    from[1] + (to[1] - from[1]) * amount,
    from[2] + (to[2] - from[2]) * amount
  ];
}

/* AuraCameraSpec shape (index.ts:2738) — re-declared here to avoid importing
 * the barrel (lane files must not create module cycles through index.ts). */
export interface LegacyCameraSpec {
  readonly mode?: string;
  readonly position?: AuraVec3;
  readonly target?: AuraVec3;
  readonly offset?: AuraVec3;
  readonly targetOffset?: AuraVec3;
  readonly offsetMode?: "scene" | "target-yaw";
  readonly fov?: number;
  readonly near?: number;
  readonly far?: number;
  readonly distance?: number;
  readonly from?: AuraVec3;
  readonly to?: AuraVec3;
  readonly seconds?: number;
  readonly targetNode?: string;
  readonly easing?: "linear" | "easeInOut";
  readonly captureTime?: number;
  readonly smoothing?: number;
  readonly orthographicSize?: number;
}

export interface LegacyTargetSource {
  readonly position: AuraVec3;
  /** Euler-Y (radians) for `offsetMode: "target-yaw"`. */
  readonly rotationY: number;
}

export interface LegacySpecRigDeps {
  /**
   * Runtime-node target resolution (registry path). Returns the target's
   * position and Euler-Y, or undefined when no runtime node resolves — the
   * scene-node fallback then runs, exactly like legacy. Default: resolve via
   * `ctx.subject(spec.targetNode)`.
   */
  runtimeTarget?: (ctx: AuraCameraRigContext) => LegacyTargetSource | undefined;
  /**
   * Scene-node fallback (model/primitive by name, asset id, or runtime id —
   * position only; offsetMode rotation does not apply here).
   */
  sceneTarget?: (ctx: AuraCameraRigContext) => AuraVec3 | undefined;
}

const DEFAULT_TARGET: AuraVec3 = [0, 0.7, 0];

function rotateVec3BySceneYaw(vector: AuraVec3, yaw: number): AuraVec3 {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return [
    vector[0] * cos + vector[2] * sin,
    vector[1],
    -vector[0] * sin + vector[2] * cos
  ];
}

function applyCameraOffset(spec: LegacyCameraSpec, offset: AuraVec3, rotationY?: number): AuraVec3 {
  if (spec.offsetMode !== "target-yaw" || rotationY === undefined) return offset;
  return rotateVec3BySceneYaw(offset, rotationY);
}

function add3(l: AuraVec3, r: AuraVec3): AuraVec3 {
  return [l[0] + r[0], l[1] + r[1], l[2] + r[2]];
}

/** resolveCameraTarget — runtime target, then scene-node, then spec.target. */
function resolveTarget(spec: LegacyCameraSpec, ctx: AuraCameraRigContext, deps: LegacySpecRigDeps): AuraVec3 {
  const runtime = deps.runtimeTarget?.(ctx);
  if (runtime) {
    const off = spec.targetOffset ? applyCameraOffset(spec, spec.targetOffset, runtime.rotationY) : ([0, 0, 0] as const);
    return add3(runtime.position, off);
  }
  if (spec.mode === "follow" && spec.targetNode) {
    const scene = deps.sceneTarget?.(ctx);
    if (scene) {
      const off = spec.targetOffset ?? ([0, 0, 0] as const);
      return add3(scene, off);
    }
  }
  return spec.target ?? DEFAULT_TARGET;
}

/** resolveCameraEye — mode-specific eye around the resolved target. */
function resolveEye(
  spec: LegacyCameraSpec,
  ctx: AuraCameraRigContext,
  deps: LegacySpecRigDeps,
  timeMs: number
): AuraVec3 {
  const target = resolveTarget(spec, ctx, deps);
  const runtime = deps.runtimeTarget?.(ctx);
  let eye: AuraVec3 = spec.position ?? [0, 1.4, spec.distance ?? 4];
  if (spec.mode === "orbit") {
    const distance = spec.distance ?? 4;
    eye = spec.position ?? [target[0] + distance * 0.62, target[1] + distance * 0.42, target[2] + distance * 0.78];
  }
  if (spec.mode === "follow") {
    const distance = spec.distance ?? 4;
    const offset = spec.offset ? applyCameraOffset(spec, spec.offset, runtime?.rotationY) : undefined;
    eye =
      spec.position ??
      (offset
        ? [target[0] + offset[0], target[1] + offset[1], target[2] + offset[2]]
        : [target[0] - distance * 0.38, target[1] + distance * 0.52, target[2] + distance * 0.82]);
  }
  if (spec.mode === "dolly") {
    const seconds = spec.seconds ?? 6;
    const phase = ((timeMs / 1000) % seconds) / seconds;
    const eased = 0.5 - Math.cos(phase * Math.PI * 2) * 0.5;
    eye = mix3(spec.from ?? [0, 1.4, 5], spec.to ?? [0, 1.2, 3.4], eased);
  }
  if (spec.mode === "path" || spec.mode === "flythrough") {
    const seconds = Math.max(0.001, spec.seconds ?? 6);
    const sourceTime = spec.captureTime !== undefined ? spec.captureTime * 1000 : timeMs;
    const phase = ((sourceTime / 1000) % seconds) / seconds;
    const eased = spec.easing === "linear" ? phase : 0.5 - Math.cos(phase * Math.PI) * 0.5;
    eye = mix3(spec.from ?? [0, 1.4, 5], spec.to ?? [0, 1.2, 3.4], eased);
  }
  return eye;
}

interface SmoothedFrame {
  readonly time: number;
  readonly target: AuraVec3;
  readonly eye: AuraVec3;
}

/**
 * LegacySpecRig — see file header. `ctx.time` is the render-clock in
 * milliseconds (the same units `resolveCameraFrame` consumed).
 */
export class LegacySpecRig implements AuraCameraRig {
  readonly id: string;
  private previous: SmoothedFrame | undefined;

  constructor(
    private readonly spec: LegacyCameraSpec,
    private readonly deps: LegacySpecRigDeps = {}
  ) {
    this.id = "fromSpec";
  }

  /**
   * 08-LOOP: a spec that tracks a subject (`targetNode` or `mode: "follow"`)
   * resamples it every frame — the driver must keep ticking. A pure
   * position/target spec is a fixed pose and may idle out once settled.
   */
  get continuous(): boolean {
    return Boolean(this.spec.targetNode) || this.spec.mode === "follow";
  }

  private depsFor(ctx: AuraCameraRigContext): LegacySpecRigDeps {
    return {
      runtimeTarget:
        this.deps.runtimeTarget ??
        ((c) => {
          const ref = this.spec.targetNode;
          if (!ref) return undefined;
          const subject = c.subject(ref);
          return subject
            ? { position: subject.position, rotationY: subjectRotationY(subject) }
            : undefined;
        }),
      sceneTarget: this.deps.sceneTarget
    };
  }

  update(ctx: AuraCameraRigContext): AuraCameraPose {
    const timeMs = ctx.time;
    const spec = this.spec;
    const deps = this.depsFor(ctx);
    const rawTarget = resolveTarget(spec, ctx, deps);
    const rawEye = resolveEye(spec, ctx, deps, timeMs);
    const smoothing = Math.max(0, Math.min(0.98, spec.smoothing ?? 0));
    // Legacy gate: `!runtimeNodes || mode !== "follow" || smoothing <= 0` skips
    // smoothing. In the rig world a subject resolver always exists (ctx.subject
    // is on the frozen context), so registry-presence is unconditional here.
    const runtimeActive = spec.mode === "follow" && smoothing > 0;

    let target = rawTarget;
    let eye = rawEye;
    if (runtimeActive) {
      const previous = this.previous;
      if (previous && timeMs === previous.time) {
        target = previous.target;
        eye = previous.eye;
      } else if (!previous || timeMs < previous.time || timeMs - previous.time > 250) {
        // first frame / rewind / long gap → snap (legacy behaviour)
      } else {
        const deltaSeconds = (timeMs - previous.time) / 1000;
        const responsePerSecond = -Math.log(1 - smoothing) * 60;
        const amount = 1 - Math.exp(-responsePerSecond * deltaSeconds);
        target = mix3(previous.target, rawTarget, amount);
        eye = mix3(previous.eye, rawEye, amount);
      }
      this.previous = { time: timeMs, target, eye };
    } else {
      this.previous = { time: timeMs, target, eye };
    }

    return {
      position: eye,
      target,
      up: [0, 1, 0],
      roll: 0,
      fov: spec.fov ?? 50,
      near: spec.near ?? 0.1,
      far: spec.far ?? 1000,
      orthographicSize: spec.orthographicSize
    };
  }

  reset(): void {
    this.previous = undefined;
  }
}

export const DEFAULT_POSE: AuraCameraPose = {
  position: [0, 1.6, 5],
  target: [0, 1, 0],
  up: [0, 1, 0],
  roll: 0,
  fov: 50,
  near: 0.1,
  far: 1000
};

/** `rigs.static` — fixed pose; layers still apply to it downstream. */
export function staticRig(pose: Partial<AuraCameraPose> = {}, id = "static"): AuraCameraRig {
  const full: AuraCameraPose = { ...DEFAULT_POSE, ...pose };
  return {
    id,
    update: () => full,
    reset: () => {
      /* static rig keeps its authored pose */
    }
  };
}

export function createFromSpecRig(spec: LegacyCameraSpec, deps: LegacySpecRigDeps = {}): AuraCameraRig {
  return new LegacySpecRig(spec, deps);
}
