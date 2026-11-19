/**
 * 5.7.0: the canonical humanoid clip player and pose helpers are public on `@aura3d/engine/animation`
 * (packages/animation/src/smpl/animator.ts, humanoid.ts). The games' apps/showcase-port-shared/idol/{motion,humanoid}.ts
 * are now thin re-exports. The golden block copies the pre-5.7.0 game implementation verbatim as the reference and
 * requires exactly equal output for a fixed clip set and request sequence.
 */
import { describe, expect, it } from "vitest";
import * as pub from "@aura3d/engine/animation";
import {
  ARM_ROLES,
  HUMANOID_ROLES,
  QUAT_IDENTITY,
  blendHumanoidPoses,
  createHumanoidAnimator,
  createMotionAnimator,
  encodeHumanoidClip,
  eulerZYX,
  humanoidAirTime,
  humanoidClipGroundSpeed,
  humanoidEventTime,
  humanoidLocomotionRate,
  humanoidLocomotionTime,
  layerHumanoidPose,
  mirrorHumanoidPose,
  quatAxisAngle,
  quatFromTo,
  quatInv,
  quatMul,
  quatNorm,
  quatPow,
  quatSlerp,
  rotateVec,
  sampleHumanoidClip,
  type HumanoidClip,
  type HumanoidMotionRequest,
  type HumanoidPoseInput,
  type HumanoidRole,
  type Quat,
  type Vec3
} from "@aura3d/engine/animation";
import * as gameHumanoid from "../../../apps/showcase-port-shared/idol/humanoid";
import * as gameMotion from "../../../apps/showcase-port-shared/idol/motion";
import { MOTION_CLIPS } from "../../../apps/showcase-aura-hoops-3d/src/motion.generated";

/* ------------------------------------------------------------------ */
/*  Reference: the game implementation before 5.7.0, copied verbatim   */
/* ------------------------------------------------------------------ */

namespace Ref {
  const QUAT_IDENTITY: Quat = [0, 0, 0, 1];
  export function quatMul(a: Quat, b: Quat): Quat {
    const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
    return [
      aw * bx + ax * bw + ay * bz - az * by,
      aw * by - ax * bz + ay * bw + az * bx,
      aw * bz + ax * by - ay * bx + az * bw,
      aw * bw - ax * bx - ay * by - az * bz
    ];
  }
  export function quatInv(q: Quat): Quat {
    const n = q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3] || 1;
    return [-q[0] / n, -q[1] / n, -q[2] / n, q[3] / n];
  }
  export function quatNorm(q: Quat): Quat {
    const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
  }
  export function quatAxisAngle(axis: Vec3, angle: number): Quat {
    const l = Math.hypot(axis[0], axis[1], axis[2]) || 1, s = Math.sin(angle / 2) / l;
    return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
  }
  export function rotateVec(q: Quat, v: Vec3): Vec3 {
    const [x, y, z, w] = q;
    const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
    return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
  }
  export function eulerZYX(x: number, y: number, z: number): Quat {
    return quatMul(quatMul(quatAxisAngle([0, 0, 1], z), quatAxisAngle([0, 1, 0], y)), quatAxisAngle([1, 0, 0], x));
  }
  export function quatPow(q: Quat, t: number): Quat {
    const w = Math.max(-1, Math.min(1, q[3] < 0 ? -q[3] : q[3]));
    const sign = q[3] < 0 ? -1 : 1;
    const half = Math.acos(w);
    const s = Math.sin(half);
    if (s < 1e-6) return QUAT_IDENTITY;
    return quatAxisAngle([q[0] * sign / s, q[1] * sign / s, q[2] * sign / s], 2 * half * t);
  }
  const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  function norm(a: Vec3): Vec3 {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  }
  export function quatFromTo(from: Vec3, to: Vec3): Quat {
    const a = norm(from), b = norm(to);
    const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    if (d > 1 - 1e-9) return QUAT_IDENTITY;
    if (d < -1 + 1e-9) {
      const axis = Math.abs(a[0]) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0]);
      return quatAxisAngle(axis, Math.PI);
    }
    const c = cross(a, b);
    return quatNorm([c[0], c[1], c[2], 1 + d]);
  }
  export function quatSlerp(a: Quat, b: Quat, t: number): Quat {
    let [bx, by, bz, bw] = b;
    let d = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
    if (d < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; d = -d; }
    if (d > 0.9995) return quatNorm([a[0] + (bx - a[0]) * t, a[1] + (by - a[1]) * t, a[2] + (bz - a[2]) * t, a[3] + (bw - a[3]) * t]);
    const th = Math.acos(d), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
    return [a[0] * wa + bx * wb, a[1] * wa + by * wb, a[2] * wa + bz * wb, a[3] * wa + bw * wb];
  }
  const MIRROR_ROLE = (r: HumanoidRole): HumanoidRole =>
    (r.startsWith("left") ? `right${r.slice(4)}` : r.startsWith("right") ? `left${r.slice(5)}` : r) as HumanoidRole;
  export function mirrorHumanoidPose(p: HumanoidPoseInput): HumanoidPoseInput {
    const rotations: Partial<Record<HumanoidRole, Quat>> = {};
    for (const [r, q] of Object.entries(p.rotations) as [HumanoidRole, Quat][]) rotations[MIRROR_ROLE(r)] = [q[0], -q[1], -q[2], q[3]];
    const h = p.hipsOffset ?? [0, 0, 0];
    return { ...p, rotations, hipsOffset: [-h[0], h[1], h[2]] };
  }
  export function blendHumanoidPoses(a: HumanoidPoseInput, b: HumanoidPoseInput, w: number): HumanoidPoseInput {
    if (w <= 0) return a;
    if (w >= 1) return b;
    const rotations: Partial<Record<HumanoidRole, Quat>> = {};
    for (const r of HUMANOID_ROLES) {
      const qa = a.rotations[r], qb = b.rotations[r];
      if (qa || qb) rotations[r] = quatSlerp(qa ?? QUAT_IDENTITY, qb ?? QUAT_IDENTITY, w);
    }
    const ha = a.hipsOffset ?? [0, 0, 0], hb = b.hipsOffset ?? [0, 0, 0];
    return { rotations, hipsOffset: [ha[0] + (hb[0] - ha[0]) * w, ha[1] + (hb[1] - ha[1]) * w, ha[2] + (hb[2] - ha[2]) * w], ...(b.handTargets ? { handTargets: b.handTargets } : {}) };
  }
  export function layerHumanoidPose(base: HumanoidPoseInput, top: HumanoidPoseInput, roles: readonly HumanoidRole[]): HumanoidPoseInput {
    const rotations = { ...base.rotations };
    for (const r of roles) if (top.rotations[r]) rotations[r] = top.rotations[r];
    return { ...base, rotations };
  }

  export type MotionRequest<N extends string = string> =
    | { readonly clip: N; readonly time?: number; readonly rate?: number; readonly loop?: boolean; readonly mirror?: boolean; readonly fade?: number }
    | { readonly pose: HumanoidPoseInput; readonly key?: string; readonly fade?: number };
  export interface MotionAnimator<N extends string = string> {
    readonly current: string;
    readonly time: number;
    update(dt: number, req: MotionRequest<N>): HumanoidPoseInput;
  }
  export function createMotionAnimator<N extends string>(clips: Readonly<Record<N, HumanoidClip>>): MotionAnimator<N> {
    let current = "";
    let time = 0;
    let last: HumanoidPoseInput | undefined;
    let from: HumanoidPoseInput | undefined;
    let fadeLeft = 0, fadeLen = 0;
    return {
      get current() { return current; },
      get time() { return time; },
      update(dt, req) {
        const step = Math.max(0, Math.min(0.25, Number.isFinite(dt) ? dt : 0));
        const key = "clip" in req ? `${req.clip}${req.mirror ? "~m" : ""}` : `pose:${req.key ?? "code"}`;
        if (key !== current) {
          from = last;
          fadeLen = fadeLeft = from ? Math.max(0, req.fade ?? 0.18) : 0;
          current = key;
          time = 0;
        } else {
          fadeLeft = Math.max(0, fadeLeft - step);
        }
        let pose: HumanoidPoseInput;
        if ("clip" in req) {
          const clip = clips[req.clip];
          time = req.time !== undefined ? req.time : time + step * (req.rate ?? 1);
          const loop = req.loop ?? Number(clip.meta?.loop ?? 1) === 1;
          pose = sampleHumanoidClip(clip, time, { loop });
          if (req.mirror) pose = mirrorHumanoidPose(pose);
        } else {
          pose = req.pose;
        }
        if (from && fadeLeft > 0 && fadeLen > 0) pose = blendHumanoidPoses(from, pose, 1 - fadeLeft / fadeLen);
        last = pose;
        return pose;
      }
    };
  }
  export function clipGroundSpeed(clip: HumanoidClip, bodyHipHeight: number): number {
    return Number(clip.meta?.groundSpeedHip ?? clip.meta?.stanceSpeedHip ?? 0) * bodyHipHeight;
  }
  export function locomotionTime(clip: HumanoidClip, metres: number, bodyHipHeight: number): number {
    const speed = clipGroundSpeed(clip, bodyHipHeight);
    if (!(speed > 0)) return 0;
    const cycle = speed * clip.duration;
    return (((metres % cycle) + cycle) % cycle) / speed;
  }
  export function locomotionRate(clip: HumanoidClip, groundSpeed: number, bodyHipHeight: number): number {
    const speed = clipGroundSpeed(clip, bodyHipHeight);
    return speed > 0 ? groundSpeed / speed : 1;
  }
  export function eventTime(clip: HumanoidClip, u: number, eventFrac: number, keyField: string, window?: readonly [number, number]): number {
    const [a, b] = window ?? [0, clip.duration];
    const key = Math.max(a, Math.min(b, Number(clip.meta?.[keyField] ?? (a + b) / 2)));
    const x = Math.max(0, Math.min(1, u)), f = Math.max(1e-3, Math.min(1 - 1e-3, eventFrac));
    return x <= f ? a + (key - a) * (x / f) : key + (b - key) * ((x - f) / (1 - f));
  }
  export function airTime(clip: HumanoidClip, y: number, vy: number, g: number, takeoff: number): number {
    const apex = Number(clip.meta?.apexTime ?? clip.duration / 2);
    const v0 = Math.sqrt(Math.max(1e-6, vy * vy - 2 * g * Math.max(0, y)));
    const u = vy >= 0 ? 0.5 * (1 - vy / v0) : 0.5 + 0.5 * Math.min(1, -vy / v0);
    return Math.min(clip.duration, takeoff + (apex - takeoff) * 2 * u);
  }
}

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

/** Deterministic PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const randQuat = (r: () => number): Quat => quatNorm([r() * 2 - 1, r() * 2 - 1, r() * 2 - 1, r() * 2 - 1]);
const randVec = (r: () => number): Vec3 => [r() * 2 - 1, r() * 2 - 1, r() * 2 - 1];

function randPose(r: () => number, roles: readonly HumanoidRole[] = HUMANOID_ROLES): HumanoidPoseInput {
  const rotations: Partial<Record<HumanoidRole, Quat>> = {};
  for (const role of roles) rotations[role] = randQuat(r);
  return { rotations, hipsOffset: [r() * 0.2 - 0.1, r() * 0.2 - 0.1, r() * 0.2 - 0.1] };
}

const expectQuatClose = (a: Quat, b: Quat, digits = 6): void => {
  // q and -q are the same rotation
  const sign = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
  for (let k = 0; k < 4; k++) expect(a[k]!).toBeCloseTo(sign * b[k]!, digits);
};

/** A two-frame clip at 10 fps that turns the hips from identity to `end`, with a hips offset from 0 to `hip`. */
function rampClip(name: string, end: Quat, hip: Vec3, meta?: Record<string, number | string>): HumanoidClip {
  return encodeHumanoidClip(name, 10, ["hips"], [
    { rotations: { hips: QUAT_IDENTITY }, hipsOffset: [0, 0, 0] },
    { rotations: { hips: end }, hipsOffset: hip }
  ], meta);
}

/* ------------------------------------------------------------------ */
/*  Public surface                                                     */
/* ------------------------------------------------------------------ */

describe("humanoid animator public surface (5.7.0)", () => {
  it("exports the player, timing, pose and quaternion helpers from @aura3d/engine/animation", () => {
    for (const name of [
      "createHumanoidAnimator", "createMotionAnimator", "humanoidClipGroundSpeed", "humanoidLocomotionTime", "humanoidLocomotionRate",
      "humanoidEventTime", "humanoidAirTime", "mirrorHumanoidPose", "blendHumanoidPoses", "layerHumanoidPose", "ARM_ROLES",
      "loadIdolHumanoid", "QUAT_IDENTITY", "quatMul", "quatInv", "quatNorm", "quatAxisAngle", "rotateVec", "eulerZYX", "quatPow",
      "quatFromTo", "quatSlerp"
    ]) expect(pub, name).toHaveProperty(name);
    expect(createMotionAnimator).toBe(createHumanoidAnimator);
  });

  it("game shared modules are thin re-exports of the library", () => {
    expect(gameMotion.createMotionAnimator).toBe(createHumanoidAnimator);
    expect(gameMotion.locomotionTime).toBe(humanoidLocomotionTime);
    expect(gameMotion.locomotionRate).toBe(humanoidLocomotionRate);
    expect(gameMotion.clipGroundSpeed).toBe(humanoidClipGroundSpeed);
    expect(gameMotion.eventTime).toBe(humanoidEventTime);
    expect(gameMotion.airTime).toBe(humanoidAirTime);
    expect(gameHumanoid.mirrorHumanoidPose).toBe(mirrorHumanoidPose);
    expect(gameHumanoid.blendHumanoidPoses).toBe(blendHumanoidPoses);
    expect(gameHumanoid.layerHumanoidPose).toBe(layerHumanoidPose);
    expect(gameHumanoid.quatSlerp).toBe(quatSlerp);
    expect(gameHumanoid.ARM_ROLES).toBe(ARM_ROLES);
    expect(gameHumanoid.loadIdolHumanoid).toBe(pub.loadIdolHumanoid);
  });
});

/* ------------------------------------------------------------------ */
/*  Behaviour                                                          */
/* ------------------------------------------------------------------ */

describe("createHumanoidAnimator cross-fade", () => {
  const turn = quatAxisAngle([0, 1, 0], Math.PI / 2);
  const clips = {
    A: rampClip("A", QUAT_IDENTITY, [0, 0, 0], { loop: 1 }),
    B: rampClip("B", turn, [0.1, 0, 0], { loop: 0 })
  };

  it("shows the first source at full weight and blends a source change linearly over `fade` seconds", () => {
    const anim = createHumanoidAnimator(clips);
    const p0 = anim.update(0.05, { clip: "A" });
    expect(anim.current).toBe("A");
    expectQuatClose(p0.rotations.hips!, QUAT_IDENTITY);

    // Switch to B held at its end (clamped, loop 0): target hips ~ turn, hipsOffset x ~ 0.1 (Int16-quantised in the
    // clip, so compare against the decoded target). Fade 0.2 s, dt 0.05 s.
    const target = sampleHumanoidClip(clips.B, clips.B.duration, { loop: false });
    const weights: number[] = [];
    for (let i = 0; i < 6; i++) {
      const p = anim.update(0.05, { clip: "B", time: clips.B.duration, fade: 0.2 });
      weights.push(p.hipsOffset![0] / target.hipsOffset![0]);
      // the rotation is the slerp of identity -> target at the same weight
      expectQuatClose(p.rotations.hips!, quatSlerp(p0.rotations.hips!, target.rotations.hips!, weights[i]!), 9);
    }
    expect(anim.current).toBe("B");
    // first frame of a change: weight 0 (fadeLeft = fadeLen), then 0.25 per 0.05 s, then the target itself
    const expected = [0, 0.25, 0.5, 0.75, 1, 1];
    weights.forEach((w, i) => expect(w).toBeCloseTo(expected[i]!, 3));
  });

  it("restarts the clock on a source change, advances by dt * rate and clamps dt to 0..0.25", () => {
    const anim = createHumanoidAnimator(clips);
    anim.update(0.1, { clip: "A" });
    expect(anim.time).toBeCloseTo(0.1, 12);
    anim.update(0.1, { clip: "A", rate: 2 });
    expect(anim.time).toBeCloseTo(0.3, 12);
    anim.update(5, { clip: "A" });
    expect(anim.time).toBeCloseTo(0.55, 12);
    anim.update(Number.NaN, { clip: "A" });
    expect(anim.time).toBeCloseTo(0.55, 12);
    anim.update(-1, { clip: "A" });
    expect(anim.time).toBeCloseTo(0.55, 12);
    anim.update(0.1, { clip: "A", mirror: true });
    expect(anim.current).toBe("A~m");
    expect(anim.time).toBeCloseTo(0.1, 12);
    anim.update(0.1, { pose: { rotations: {} }, key: "wave" });
    expect(anim.current).toBe("pose:wave");
    expect(anim.time).toBe(0);
  });

  it("a code pose under the same key does not re-fade; fade 0 switches at once", () => {
    const anim = createHumanoidAnimator(clips);
    anim.update(0.016, { clip: "A" });
    const target: HumanoidPoseInput = { rotations: { hips: turn }, hipsOffset: [0.2, 0, 0] };
    const cut = anim.update(0.016, { pose: target, fade: 0 });
    expect(cut).toBe(target);
    expect(anim.update(0.016, { pose: target })).toBe(target);
  });
});

describe("pose helpers", () => {
  it("mirrorHumanoidPose swaps sides, reflects rotations and hips, and is an involution", () => {
    const r = rng(7);
    const pose = { ...randPose(r), handTargets: { left: [0.1, 1, 0.2] as Vec3 } };
    const m = mirrorHumanoidPose(pose);
    expect(m.rotations.rightUpperArm).toEqual([pose.rotations.leftUpperArm![0], -pose.rotations.leftUpperArm![1], -pose.rotations.leftUpperArm![2], pose.rotations.leftUpperArm![3]]);
    expect(m.rotations.leftFoot).toEqual([pose.rotations.rightFoot![0], -pose.rotations.rightFoot![1], -pose.rotations.rightFoot![2], pose.rotations.rightFoot![3]]);
    expect(m.hipsOffset).toEqual([-pose.hipsOffset![0], pose.hipsOffset![1], pose.hipsOffset![2]]);
    expect(m.handTargets).toBe(pose.handTargets);
    expect(mirrorHumanoidPose(m)).toEqual(pose);

    // geometric symmetry: a left arm raised out to +X mirrors to the right arm raised out to -X
    const raise = quatAxisAngle([0, 0, 1], Math.PI / 2); // down (-Y) -> +X
    const down: Vec3 = [0, -1, 0];
    const mirrored = mirrorHumanoidPose({ rotations: { leftUpperArm: raise } });
    const outL = rotateVec(raise, down), outR = rotateVec(mirrored.rotations.rightUpperArm!, down);
    expect(outL[0]).toBeCloseTo(1, 9);
    expect(outR[0]).toBeCloseTo(-outL[0], 9);
    expect(outR[1]).toBeCloseTo(outL[1], 9);
    expect(outR[2]).toBeCloseTo(outL[2], 9);
    expect(mirrored.rotations.leftUpperArm).toBeUndefined();
  });

  it("layerHumanoidPose takes only the listed roles from the top pose", () => {
    const r = rng(11);
    const base = randPose(r), top = { ...randPose(r, [...ARM_ROLES, "head"]), hipsOffset: [9, 9, 9] as Vec3 };
    const out = layerHumanoidPose(base, top, ARM_ROLES);
    for (const role of HUMANOID_ROLES) {
      expect(out.rotations[role], role).toBe((ARM_ROLES as readonly string[]).includes(role) ? top.rotations[role] : base.rotations[role]);
    }
    expect(out.hipsOffset).toBe(base.hipsOffset);
    // a role the top pose does not set keeps the base rotation
    const partial = layerHumanoidPose(base, { rotations: { leftHand: QUAT_IDENTITY } }, ARM_ROLES);
    expect(partial.rotations.leftHand).toBe(QUAT_IDENTITY);
    expect(partial.rotations.rightHand).toBe(base.rotations.rightHand);
    expect(ARM_ROLES).toHaveLength(8);
  });

  it("blendHumanoidPoses returns the endpoints by identity and blends roles missing on one side against identity", () => {
    const r = rng(3);
    const a = randPose(r), b = { rotations: { head: randQuat(r) }, handTargets: { right: [0, 1, 0] as Vec3 } };
    expect(blendHumanoidPoses(a, b, 0)).toBe(a);
    expect(blendHumanoidPoses(a, b, 1)).toBe(b);
    const mid = blendHumanoidPoses(a, b, 0.5);
    expectQuatClose(mid.rotations.hips!, quatSlerp(a.rotations.hips!, QUAT_IDENTITY, 0.5));
    expectQuatClose(mid.rotations.head!, quatSlerp(a.rotations.head!, b.rotations.head, 0.5));
    expect(mid.handTargets).toBe(b.handTargets);
    expect(mid.hipsOffset![1]).toBeCloseTo(a.hipsOffset![1] / 2, 12);
  });
});

describe("quaternion helpers", () => {
  it("quatSlerp hits both endpoints, takes the short arc and stays unit length", () => {
    const r = rng(19);
    for (let i = 0; i < 200; i++) {
      const a = randQuat(r), b = randQuat(r);
      expectQuatClose(quatSlerp(a, b, 0), a, 9);
      expectQuatClose(quatSlerp(a, b, 1), b, 9);
      const m = quatSlerp(a, b, 0.37);
      expect(Math.hypot(...m)).toBeCloseTo(1, 9);
    }
    // short arc: identity -> -identity is no turn at all
    expectQuatClose(quatSlerp(QUAT_IDENTITY, [0, 0, 0, -1], 0.5), QUAT_IDENTITY, 12);
    // half of a 90 degree turn is 45 degrees
    expectQuatClose(quatSlerp(QUAT_IDENTITY, quatAxisAngle([1, 0, 0], Math.PI / 2), 0.5), quatAxisAngle([1, 0, 0], Math.PI / 4), 12);
  });

  it("quatPow, quatFromTo, quatInv and eulerZYX agree with their definitions", () => {
    const q = quatAxisAngle([0, 1, 0], 1.2);
    expectQuatClose(quatPow(q, 0.5), quatAxisAngle([0, 1, 0], 0.6), 12);
    expectQuatClose(quatPow(QUAT_IDENTITY, 0.5), QUAT_IDENTITY, 12);
    const v = rotateVec(quatFromTo([0, -1, 0], [1, 1, 0]), [0, -1, 0]);
    expect(v[0]).toBeCloseTo(Math.SQRT1_2, 9);
    expect(v[1]).toBeCloseTo(Math.SQRT1_2, 9);
    const opp = rotateVec(quatFromTo([0, 0, 1], [0, 0, -1]), [0, 0, 1]);
    expect(opp[2]).toBeCloseTo(-1, 9);
    expectQuatClose(quatMul(q, quatInv(q)), QUAT_IDENTITY, 12);
    expectQuatClose(eulerZYX(0.3, 0, 0), quatAxisAngle([1, 0, 0], 0.3), 12);
    // X applied first, then Y, then Z
    expectQuatClose(eulerZYX(0.1, 0.2, 0.3), quatMul(quatAxisAngle([0, 0, 1], 0.3), quatMul(quatAxisAngle([0, 1, 0], 0.2), quatAxisAngle([1, 0, 0], 0.1))), 12);
  });
});

/* ------------------------------------------------------------------ */
/*  Golden: identical output to the pre-5.7.0 game implementation      */
/* ------------------------------------------------------------------ */

describe("golden: library output equals the old game implementation", () => {
  type Name = keyof typeof MOTION_CLIPS;

  it("animator: fixed clip set and request sequence", () => {
    const r = rng(42);
    const lib = createHumanoidAnimator(MOTION_CLIPS);
    const ref = Ref.createMotionAnimator(MOTION_CLIPS);
    const codePose = randPose(r);
    const script: { readonly frames: number; readonly req: (i: number) => HumanoidMotionRequest<Name> }[] = [
      { frames: 40, req: () => ({ clip: "Idle" }) },
      { frames: 30, req: () => ({ clip: "Run", rate: 1.3 }) },
      { frames: 30, req: (i) => ({ clip: "Walk", time: Ref.locomotionTime(MOTION_CLIPS.Walk, i * 0.03, 0.94) }) },
      { frames: 25, req: () => ({ clip: "Walk", mirror: true, fade: 0.3 }) },
      { frames: 30, req: (i) => ({ clip: "JumpShot", time: Ref.airTime(MOTION_CLIPS.JumpShot, Math.max(0, 1.5 * (i / 30) - 0.5 * 9.8 * (i / 30) ** 2), 4.2 - 9.8 * (i / 30), -9.8, 0.2) }) },
      { frames: 20, req: () => ({ pose: codePose, key: "celebrate" }) },
      { frames: 20, req: (i) => ({ clip: "ChestPass", time: Ref.eventTime(MOTION_CLIPS.ChestPass, i / 20, 0.4, "footRPeakTime") }) },
      { frames: 20, req: () => ({ clip: "Sprint", loop: false, rate: 2, fade: 0 }) },
      { frames: 20, req: () => ({ clip: "Crossover" }) },
      { frames: 10, req: () => ({ clip: "Idle", fade: 0.5 }) }
    ];
    let frames = 0;
    for (const seg of script) {
      for (let i = 0; i < seg.frames; i++) {
        const dt = i % 7 === 3 ? 0.04 : 1 / 60 + (r() - 0.5) * 0.004;
        const req = seg.req(i);
        const a = lib.update(dt, req);
        const b = ref.update(dt, req as Ref.MotionRequest<Name>);
        expect(a, `frame ${frames}`).toEqual(b);
        expect(lib.current).toBe(ref.current);
        expect(lib.time).toBe(ref.time);
        frames++;
      }
    }
    expect(frames).toBe(245);
  });

  it("timing helpers", () => {
    const r = rng(5);
    for (const name of Object.keys(MOTION_CLIPS) as Name[]) {
      const clip = MOTION_CLIPS[name];
      for (let i = 0; i < 25; i++) {
        const hip = 0.6 + r(), m = (r() - 0.3) * 40, speed = r() * 9, u = r() * 1.2 - 0.1, f = r();
        const y = r() * 2, vy = (r() - 0.5) * 10, takeoff = r() * 0.4;
        expect(humanoidClipGroundSpeed(clip, hip)).toBe(Ref.clipGroundSpeed(clip, hip));
        expect(humanoidLocomotionTime(clip, m, hip)).toBe(Ref.locomotionTime(clip, m, hip));
        expect(humanoidLocomotionRate(clip, speed, hip)).toBe(Ref.locomotionRate(clip, speed, hip));
        expect(humanoidEventTime(clip, u, f, "footRPeakTime")).toBe(Ref.eventTime(clip, u, f, "footRPeakTime"));
        expect(humanoidEventTime(clip, u, f, "missingField", [0.1, 0.9])).toBe(Ref.eventTime(clip, u, f, "missingField", [0.1, 0.9]));
        expect(humanoidAirTime(clip, y, vy, -9.8, takeoff)).toBe(Ref.airTime(clip, y, vy, -9.8, takeoff));
      }
    }
  });

  it("quaternion and pose helpers", () => {
    const r = rng(1234);
    for (let i = 0; i < 300; i++) {
      const a = randQuat(r), b = randQuat(r), v = randVec(r), w = randVec(r), t = r() * 1.4 - 0.2;
      const near = quatNorm([a[0] + 1e-4, a[1], a[2], a[3]]);
      expect(quatMul(a, b)).toEqual(Ref.quatMul(a, b));
      expect(quatInv(a)).toEqual(Ref.quatInv(a));
      expect(quatNorm([a[0] * 3, a[1] * 3, a[2] * 3, a[3] * 3])).toEqual(Ref.quatNorm([a[0] * 3, a[1] * 3, a[2] * 3, a[3] * 3]));
      expect(quatAxisAngle(v, t * 7)).toEqual(Ref.quatAxisAngle(v, t * 7));
      expect(rotateVec(a, v)).toEqual(Ref.rotateVec(a, v));
      expect(eulerZYX(v[0] * 3, v[1] * 3, v[2] * 3)).toEqual(Ref.eulerZYX(v[0] * 3, v[1] * 3, v[2] * 3));
      expect(quatPow(a, t)).toEqual(Ref.quatPow(a, t));
      expect(quatFromTo(v, w)).toEqual(Ref.quatFromTo(v, w));
      expect(quatFromTo(v, [-v[0], -v[1], -v[2]])).toEqual(Ref.quatFromTo(v, [-v[0], -v[1], -v[2]]));
      expect(quatSlerp(a, b, t)).toEqual(Ref.quatSlerp(a, b, t));
      expect(quatSlerp(a, near, t)).toEqual(Ref.quatSlerp(a, near, t));
      const pa = randPose(r), pb = randPose(r, ["hips", "spine", "leftHand"]);
      expect(mirrorHumanoidPose(pa)).toEqual(Ref.mirrorHumanoidPose(pa));
      expect(blendHumanoidPoses(pa, pb, t)).toEqual(Ref.blendHumanoidPoses(pa, pb, t));
      expect(layerHumanoidPose(pa, pb, ARM_ROLES)).toEqual(Ref.layerHumanoidPose(pa, pb, ARM_ROLES));
    }
  });
});
