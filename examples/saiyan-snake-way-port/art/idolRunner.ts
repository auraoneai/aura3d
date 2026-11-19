/**
 * Idol wow pass: the rigged Idol runner driven by the game's own pose code.
 *
 * `poseHero` (hero.ts) gives every body segment a rotation in the runner frame (x right, y up, -z forward). The Idol GLB
 * faces +Z, so a segment rotation `R` becomes `Y R Y` in model space (`Y` = half turn about +Y). Each humanoid slot found by
 * art/extract-idol-rig.mjs gets the world rotation `D · restWorld`, where `D` is the segment rotation times the turn that
 * takes the rig's T-pose bone direction onto the procedural figure's rest direction (limbs hang down, spine points up).
 * Bones without a slot (clavicles, hands, feet, fingers, toes) keep their rest rotation relative to their parent. The
 * result is written as local rotations with `applyRetargetedPose`. Presentation only: the simulation never reads it.
 */
import type { HeroPartPose, M3, V3 } from "../hero";

export type Quat = [number, number, number, number];

export interface IdolRigBone {
  readonly name: string;
  /** Index of the parent joint in `bones` (parents come first), or -1 for the skeleton root. */
  readonly parent: number;
  readonly restLocal: readonly number[];
  /** Rest rotation in GLB scene space (+Z forward, +Y up). */
  readonly restWorld: readonly number[];
}

export interface IdolRig {
  readonly key: string;
  readonly bones: readonly IdolRigBone[];
  readonly rootParentWorld: readonly number[];
  readonly slots: {
    readonly hips: number; readonly spine: readonly number[]; readonly neck: number; readonly head: number;
    readonly upperL: number; readonly foreL: number; readonly upperR: number; readonly foreR: number;
    readonly thighL: number; readonly shinL: number; readonly thighR: number; readonly shinR: number;
  };
  /** T-pose bone directions in scene space for the limb slots. */
  readonly restDir: Readonly<Record<"upperL" | "foreL" | "upperR" | "foreR" | "thighL" | "shinL" | "thighR" | "shinR", readonly number[]>>;
  readonly hips: { readonly restTranslation: readonly number[]; readonly parentLinearInv: readonly number[]; readonly restHeight: number };
}

export const qmul = (a: readonly number[], b: readonly number[]): Quat => [
  a[3]! * b[0]! + a[0]! * b[3]! + a[1]! * b[2]! - a[2]! * b[1]!,
  a[3]! * b[1]! - a[0]! * b[2]! + a[1]! * b[3]! + a[2]! * b[0]!,
  a[3]! * b[2]! + a[0]! * b[1]! - a[1]! * b[0]! + a[2]! * b[3]!,
  a[3]! * b[3]! - a[0]! * b[0]! - a[1]! * b[1]! - a[2]! * b[2]!
];
export const qconj = (q: readonly number[]): Quat => [-q[0]!, -q[1]!, -q[2]!, q[3]!];
const qnorm = (q: Quat): Quat => { const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / n, q[1] / n, q[2] / n, q[3] / n]; };

/** Quaternion of a column-major rotation matrix (hero.ts M3). */
export function quatFromM3(m: M3): Quat {
  const m00 = m[0], m10 = m[1], m20 = m[2], m01 = m[3], m11 = m[4], m21 = m[5], m02 = m[6], m12 = m[7], m22 = m[8];
  const tr = m00 + m11 + m22;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; return qnorm([(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s]); }
  if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; return qnorm([0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]); }
  if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; return qnorm([(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s]); }
  const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
  return qnorm([(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s]);
}

/** Shortest rotation taking unit vector `a` onto unit vector `b`. */
export function quatFromTo(a: readonly number[], b: readonly number[]): Quat {
  const d = a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  if (d < -0.999999) return [1, 0, 0, 0];
  const c: V3 = [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
  return qnorm([c[0], c[1], c[2], 1 + d]);
}

export function slerp(a: Quat, b: Quat, t: number): Quat {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const bb: Quat = d < 0 ? [-b[0], -b[1], -b[2], -b[3]] : b;
  d = Math.abs(d);
  if (d > 0.9995) return qnorm([a[0] + (bb[0] - a[0]) * t, a[1] + (bb[1] - a[1]) * t, a[2] + (bb[2] - a[2]) * t, a[3] + (bb[3] - a[3]) * t]);
  const th = Math.acos(d), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
  return [a[0] * wa + bb[0] * wb, a[1] * wa + bb[1] * wb, a[2] * wa + bb[2] * wb, a[3] * wa + bb[3] * wb];
}

/** Half turn about +Y: runner frame (-Z forward) <-> GLB model frame (+Z forward). */
const HALF_TURN_Y: Quat = [0, 1, 0, 0];
const toModel = (q: Quat): Quat => qmul(qmul(HALF_TURN_Y, q), HALF_TURN_Y);
const rotate = (q: readonly number[], v: readonly number[]): V3 => {
  const p = qmul(qmul(q, [v[0]!, v[1]!, v[2]!, 0]), qconj(q));
  return [p[0], p[1], p[2]];
};

const DOWN: V3 = [0, -1, 0];
/** The procedural figure's pelvis rest height (hero.ts HIP_Y). */
export const HERO_HIP_Y = 0.94;

export interface IdolPose {
  readonly bones: Record<string, { rotation: Quat; position?: V3 }>;
}

/** Per-rig constants: the limb alignment turns (computed once). */
export function createIdolRetarget(rig: IdolRig): (parts: Readonly<Record<string, HeroPartPose>>) => IdolPose {
  const align = {} as Record<keyof IdolRig["restDir"], Quat>;
  for (const k of Object.keys(rig.restDir) as (keyof IdolRig["restDir"])[]) align[k] = quatFromTo(rig.restDir[k], DOWN);
  const n = rig.bones.length;
  const world: Quat[] = Array.from({ length: n }, () => [0, 0, 0, 1] as Quat);
  const driven: (Quat | null)[] = new Array(n).fill(null);
  const s = rig.slots;
  const out: IdolPose = { bones: {} };
  for (const b of rig.bones) out.bones[b.name] = { rotation: [0, 0, 0, 1] };
  const hipsName = rig.bones[s.hips]!.name;
  const inv = rig.hips.parentLinearInv;
  const hipScale = rig.hips.restHeight / HERO_HIP_Y;
  return (parts) => {
    const seg = (id: string): Quat => toModel(quatFromM3(parts[id]!.m));
    const root = seg("pelvis"), torso = seg("torso"), head = seg("head");
    driven.fill(null);
    driven[s.hips] = root;
    s.spine.forEach((b, i) => { driven[b] = slerp(root, torso, (i + 1) / s.spine.length); });
    if (s.neck !== s.head) driven[s.neck] = slerp(torso, head, 0.5);
    driven[s.head] = head;
    driven[s.upperL] = qmul(seg("upperL"), align.upperL);
    driven[s.foreL] = qmul(seg("foreL"), align.foreL);
    driven[s.upperR] = qmul(seg("upperR"), align.upperR);
    driven[s.foreR] = qmul(seg("foreR"), align.foreR);
    driven[s.thighL] = qmul(seg("thighL"), align.thighL);
    driven[s.shinL] = qmul(seg("shinL"), align.shinL);
    driven[s.thighR] = qmul(seg("thighR"), align.thighR);
    driven[s.shinR] = qmul(seg("shinR"), align.shinR);
    for (let i = 0; i < n; i++) {
      const b = rig.bones[i]!;
      const parentWorld = b.parent >= 0 ? world[b.parent]! : (rig.rootParentWorld as Quat);
      const d = driven[i];
      world[i] = d ? qnorm(qmul(d, b.restWorld)) : qnorm(qmul(parentWorld, b.restLocal));
      out.bones[b.name]!.rotation = qnorm(qmul(qconj(parentWorld), world[i]!));
    }
    // pelvis height (bob, slide crouch, flight lift) relative to the procedural rest, scaled to the rig's hip height
    const p = parts.pelvis!.p;
    const dm = rotate(HALF_TURN_Y, [p[0] * hipScale, (p[1] - HERO_HIP_Y) * hipScale, p[2] * hipScale]);
    const t = rig.hips.restTranslation;
    out.bones[hipsName]!.position = [
      t[0]! + inv[0]! * dm[0] + inv[3]! * dm[1] + inv[6]! * dm[2],
      t[1]! + inv[1]! * dm[0] + inv[4]! * dm[1] + inv[7]! * dm[2],
      t[2]! + inv[2]! * dm[0] + inv[5]! * dm[1] + inv[8]! * dm[2]
    ];
    return out;
  };
}
