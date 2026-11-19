/**
 * Storm tyrant creature animation (Idol rigged GLB `cdStormTyrantRig`, skeleton + idle/walk clips baked into
 * `rexRigData.ts` by `art/rex-rig-extract.cjs`). Every frame the world hands in how far the tyrant moved and its
 * state, and this module returns an object-form live pose for `setAnimationPose` (works at `app.step(0)`: no engine
 * clip clock):
 *
 * - Walk phase is driven by DISTANCE, through a table of how far the stance foot slides back over the clip, so the
 *   planted foot stays put on the ground at any speed. Faster chases lengthen the stride (leg swing amplified up to
 *   2.25x) before they raise the cadence, so a 10 m beast never scurries.
 * - Idle blends in when it stands, stunned or not; tail sways counter to the hips; the head bobs with the step.
 * - Roar on arrival and on attacks opens the jaw and lifts the head; a hit (stun onset) snaps the head back.
 */
import { REX_RIG } from "./rexRigData";

type Q = [number, number, number, number];
type V3 = [number, number, number];

const qmul = (a: readonly number[], b: readonly number[]): Q => [
  a[3]! * b[0]! + a[0]! * b[3]! + a[1]! * b[2]! - a[2]! * b[1]!,
  a[3]! * b[1]! - a[0]! * b[2]! + a[1]! * b[3]! + a[2]! * b[0]!,
  a[3]! * b[2]! + a[0]! * b[1]! - a[1]! * b[0]! + a[2]! * b[3]!,
  a[3]! * b[3]! - a[0]! * b[0]! - a[1]! * b[1]! - a[2]! * b[2]!
];
const qinv = (q: readonly number[]): Q => [-q[0]!, -q[1]!, -q[2]!, q[3]!];
const qrot = (q: readonly number[], v: readonly number[]): V3 => {
  const [x, y, z, w] = q as Q;
  const ix = w * v[0]! + y * v[2]! - z * v[1]!, iy = w * v[1]! + z * v[0]! - x * v[2]!, iz = w * v[2]! + x * v[1]! - y * v[0]!, iw = -x * v[0]! - y * v[1]! - z * v[2]!;
  return [ix * w - iw * x - iy * z + iz * y, iy * w - iw * y - iz * x + ix * z, iz * w - iw * z - ix * y + iy * x];
};
const qaxis = (axis: readonly number[], angle: number): Q => {
  const l = Math.hypot(axis[0]!, axis[1]!, axis[2]!) || 1, s = Math.sin(angle / 2);
  return [(axis[0]! / l) * s, (axis[1]! / l) * s, (axis[2]! / l) * s, Math.cos(angle / 2)];
};
const slerp = (a: readonly number[], b: readonly number[], t: number): Q => {
  let d = a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]! + a[3]! * b[3]!;
  const s = d < 0 ? -1 : 1;
  d *= s;
  if (d > 0.9995) {
    const o = [0, 1, 2, 3].map((i) => a[i]! + (s * b[i]! - a[i]!) * t);
    const l = Math.hypot(...o);
    return o.map((x) => x / l) as Q;
  }
  const th = Math.acos(d), sa = Math.sin(th);
  return [0, 1, 2, 3].map((i) => (Math.sin((1 - t) * th) * a[i]! + Math.sin(t * th) * s * b[i]!) / sa) as Q;
};
/** Rotation "t" times as far from rest (t > 1 extrapolates the swing). */
const scaleFrom = (rest: readonly number[], q: readonly number[], t: number): Q => {
  const d = qmul(qinv(rest), q);
  const w = Math.max(-1, Math.min(1, d[3]));
  const ang = 2 * Math.acos(Math.abs(w)), sgn = w < 0 ? -1 : 1;
  const sn = Math.sqrt(Math.max(0, 1 - w * w));
  if (sn < 1e-6) return [...rest] as Q;
  return qmul(rest, qaxis([d[0] * sgn, d[1] * sgn, d[2] * sgn], ang * t));
};

const BONES = REX_RIG.bones;
const N = BONES.length;
const REST: Q[] = BONES.map((b) => [...b.r] as Q);
const children = (i: number) => BONES.flatMap((b, k) => (b.parent === i ? [k] : []));
const subtree = (i: number): number[] => [i, ...children(i).flatMap(subtree)];

interface ClipTrack { readonly bone: number; readonly times: readonly number[]; readonly quats: readonly number[] }
interface Clip { readonly duration: number; readonly tracks: readonly ClipTrack[]; readonly root: { readonly times: readonly number[]; readonly values: readonly number[] } | null }
const CLIPS = REX_RIG.clips as unknown as Readonly<Record<"idle" | "walk", Clip>>;

function sampleTrack(times: readonly number[], vals: readonly number[], stride: number, t: number): number[] {
  if (t <= times[0]!) return vals.slice(0, stride) as number[];
  const n = times.length;
  if (t >= times[n - 1]!) return vals.slice((n - 1) * stride, n * stride) as number[];
  let k = 0;
  while (times[k + 1]! < t) k++;
  const f = (t - times[k]!) / (times[k + 1]! - times[k]!);
  const a = vals.slice(k * stride, k * stride + stride), b = vals.slice((k + 1) * stride, (k + 2) * stride);
  return stride === 4 ? slerp(a, b, f) : a.map((x, i) => x + (b[i]! - x) * f);
}
/** Local rotations of a clip at a time (bones without a track keep their rest rotation), plus the root translation. */
function sampleClip(name: "idle" | "walk", time: number): { rots: Q[]; root: V3 } {
  const c = CLIPS[name];
  const t = ((time % c.duration) + c.duration) % c.duration;
  const rots = REST.map((q) => [...q] as Q);
  for (const tr of c.tracks) rots[tr.bone] = sampleTrack(tr.times, tr.quats, 4, t) as Q;
  const root = c.root ? (sampleTrack(c.root.times, c.root.values, 3, t) as V3) : ([...BONES[0]!.t] as V3);
  return { rots, root };
}
/** World (skeleton-parent) rotation + position of every bone. */
function fk(rots: readonly Q[], root: V3): { q: Q; p: V3 }[] {
  const W: { q: Q; p: V3 }[] = [];
  for (let i = 0; i < N; i++) {
    const b = BONES[i]!;
    if (b.parent < 0) W[i] = { q: rots[i]!, p: [...root] as V3 };
    else {
      const P = W[b.parent]!, o = qrot(P.q, b.t);
      W[i] = { q: qmul(P.q, rots[i]!), p: [P.p[0] + o[0], P.p[1] + o[1], P.p[2] + o[2]] };
    }
  }
  return W;
}

/* ---- skeleton map, found from the rest pose (no hard-coded indices) ---- */
const REST_W = fk(REST, [...BONES[0]!.t] as V3);
const rootKids = children(0);
const lowestIn = (set: number[]) => set.reduce((a, b) => (REST_W[b]!.p[1] < REST_W[a]!.p[1] ? b : a));
const legRoots = rootKids.filter((k) => REST_W[lowestIn(subtree(k))]!.p[1] < REST_W[0]!.p[1] - 0.3).slice(0, 2);
/** The two feet: the bone above each leg's lowest toe tip. */
export const REX_FEET = legRoots.map((k) => BONES[lowestIn(subtree(k))]!.parent) as [number, number];
const LEG_BONES = new Set(legRoots.flatMap(subtree));
const spineRoot = rootKids.find((k) => REST_W[k]!.p[1] > REST_W[0]!.p[1] + 0.02 && !LEG_BONES.has(k))!;
const SPINE_ROOT = spineRoot;
const highest = subtree(spineRoot).reduce((a, b) => (REST_W[b]!.p[1] > REST_W[a]!.p[1] ? b : a));
// the head: the deepest joint of the spine chain whose children fan out (jaw + crest)
const chainTo = (i: number): number[] => (i === 0 ? [0] : [...chainTo(BONES[i]!.parent), i]);
const headPath = chainTo(highest);
const HEAD = headPath.reduce((h, b) => (children(b).length > 2 ? b : h), headPath[headPath.length - 2]!);
const NECK = BONES[HEAD]!.parent;
/** Jaw: the head's child chain that runs forward and down (lowest end point among the head's children). */
const JAW = children(HEAD).reduce((a, b) => (REST_W[lowestIn(subtree(b))]!.p[1] < REST_W[lowestIn(subtree(a))]!.p[1] ? b : a));
const TAIL = rootKids.filter((k) => !LEG_BONES.has(k) && k !== spineRoot).reduce((a, b) => (subtree(b).length > subtree(a).length ? b : a));
const TAIL_CHAIN = subtree(TAIL);
/** Rig-space facing (toward the head, on the ground plane) and the lateral axis the jaw and head pitch about. */
const fwd0: V3 = [REST_W[HEAD]!.p[0] - REST_W[0]!.p[0], 0, REST_W[HEAD]!.p[2] - REST_W[0]!.p[2]];
const fl = Math.hypot(fwd0[0], fwd0[2]);
const FACING: V3 = [fwd0[0] / fl, 0, fwd0[2] / fl];
const LATERAL: V3 = [FACING[2], 0, -FACING[0]];
export const REX_MAP = { feet: REX_FEET, head: HEAD, neck: NECK, jaw: JAW, tail: TAIL, legRoots };
/** Rest height of the feet: the stance (lower) foot is held at it, so the hips rise and fall with the step. */
const FOOT_Y = Math.min(REST_W[REX_FEET[0]]!.p[1], REST_W[REX_FEET[1]]!.p[1]);
/**
 * Rig-space walking direction: the clip's stance feet slide back along it (it is ~6 degrees off the head direction for
 * this rig). The world turns the model by `REX_WALK_YAW` so this, not the snout, follows the course, or the planted
 * feet would skate sideways.
 */
export const REX_FORWARD: V3 = (() => {
  const dur = CLIPS.walk.duration, acc: V3 = [0, 0, 0];
  let prev: { p: V3 }[] | null = null;
  for (let k = 0; k <= 96; k++) {
    const s = sampleClip("walk", (k / 96) * dur), W = fk(s.rots, s.root);
    if (prev) {
      const f = W[REX_FEET[0]]!.p[1] <= W[REX_FEET[1]]!.p[1] ? REX_FEET[0] : REX_FEET[1];
      acc[0] += prev[f]!.p[0] - W[f]!.p[0];
      acc[2] += prev[f]!.p[2] - W[f]!.p[2];
    }
    prev = W;
  }
  const l = Math.hypot(acc[0], acc[2]) || 1;
  return [acc[0] / l, 0, acc[2] / l];
})();
/** Yaw (radians, atan2(x, z) sense) from the model's facing to its walking direction; world yaw = heading - this. */
export const REX_WALK_YAW = Math.atan2(REX_FORWARD[0], REX_FORWARD[2]) - Math.atan2(FACING[0], FACING[2]);

/* ---- distance -> walk phase tables (exact planting for each stride amplification) ---- */
const STEPS = 96;
const walkPose = (time: number, amp: number) => {
  const s = sampleClip("walk", time);
  if (amp !== 1) for (const b of LEG_BONES) s.rots[b] = scaleFrom(REST[b]!, s.rots[b]!, amp);
  return s;
};
const along = (p: readonly number[]) => p[0]! * REX_FORWARD[0] + p[2]! * REX_FORWARD[2];
interface PhaseTable { readonly times: number[]; readonly dist: number[]; readonly cycle: number; readonly yaw: number }
const tables = new Map<number, PhaseTable>();
function phaseTable(amp: number): PhaseTable {
  const hit = tables.get(amp);
  if (hit) return hit;
  const dur = CLIPS.walk.duration;
  const times: number[] = [], dist: number[] = [0];
  let prev: { q: Q; p: V3 }[] | null = null;
  const net: V3 = [0, 0, 0];
  for (let k = 0; k <= STEPS; k++) {
    const t = (k / STEPS) * dur;
    const W = fk(walkPose(t, amp).rots, walkPose(t, amp).root);
    times.push(t);
    if (prev) {
      // the stance foot is the lower one; how far it slid back is how far the body must travel to keep it planted
      const f = W[REX_FEET[0]]!.p[1] <= W[REX_FEET[1]]!.p[1] ? REX_FEET[0] : REX_FEET[1];
      const back = along(prev[f]!.p) - along(W[f]!.p);
      net[0] += prev[f]!.p[0] - W[f]!.p[0];
      net[2] += prev[f]!.p[2] - W[f]!.p[2];
      dist.push(dist[dist.length - 1]! + Math.max(0, back));
    }
    prev = W;
  }
  // the amplified swing walks a few degrees off the unamplified line: turning the skeleton by `yaw` puts it back on it
  const yaw = Math.atan2(REX_FORWARD[0], REX_FORWARD[2]) - Math.atan2(net[0], net[2]);
  const tab = { times, dist, cycle: dist[dist.length - 1]!, yaw };
  tables.set(amp, tab);
  return tab;
}
/** Clip time for a walked distance (rig units) at a stride amplification. */
function timeForDistance(d: number, amp: number): number {
  const tab = phaseTable(amp);
  const x = ((d % tab.cycle) + tab.cycle) % tab.cycle;
  let k = 0;
  while (k < tab.dist.length - 2 && tab.dist[k + 1]! < x) k++;
  const span = tab.dist[k + 1]! - tab.dist[k]!;
  const f = span > 1e-9 ? (x - tab.dist[k]!) / span : 0;
  return tab.times[k]! + (tab.times[k + 1]! - tab.times[k]!) * f;
}
/** Inverse of `timeForDistance` within one cycle: the walked distance at a clip time. */
function distanceForTime(t: number, amp: number): number {
  const tab = phaseTable(amp), dur = CLIPS.walk.duration;
  const x = ((t % dur) + dur) % dur;
  let k = 0;
  while (k < tab.times.length - 2 && tab.times[k + 1]! < x) k++;
  const f = (x - tab.times[k]!) / (tab.times[k + 1]! - tab.times[k]!);
  return tab.dist[k]! + (tab.dist[k + 1]! - tab.dist[k]!) * f;
}
/** Rig-unit distance one walk cycle covers at a stride amplification. */
export const rexCycleDistance = (amp: number): number => phaseTable(amp).cycle;
/** Skeleton yaw (radians) that keeps an amplified stride on the walking line. */
export const rexStrideYaw = (amp: number): number => phaseTable(amp).yaw;

/** Cadence ceiling: a 10 m tyrant tops out near 1.5 strides per second, longer strides carry the extra speed. */
const MAX_HZ = 2.2;
/** Stride amplification steps; capped at 1.4x (F3 GPU QA: 2.25x swung the thighs far enough to tear the hip skin). */
const AMPS = [1, 1.2, 1.4];
/** Hip offset (rig units, ~1 m on the shipped tyrant) the stance-foot lock may hold before it eases back. */
const LOCK_FREE = 0.1;

export interface RexDriveInput {
  /** World metres the tyrant moved since the last frame (signed along its facing). */
  readonly moved: number;
  /** Seconds since the last frame. */
  readonly dt: number;
  /** World metres per rig unit (model scale x node scale). */
  readonly metresPerUnit: number;
  readonly stunned: boolean;
  /** 0..1 lunge / bite build-up and 0..1 tail-swipe build-up from the encounter. */
  readonly lunge: number;
  readonly swipe: number;
  /** Seconds since the tyrant appeared (roar on arrival). */
  readonly sinceAppear: number;
}
export interface RexAnimationPose {
  readonly bones: Record<string, { rotation: { x: number; y: number; z: number; w: number }; position?: { x: number; y: number; z: number } }>;
  readonly mode: "replace";
}
export interface RexDriver {
  step(input: RexDriveInput): RexAnimationPose;
  /** Last frame's diagnostics (tests and QA). */
  readonly state: { distance: number; amp: number; time: number; walk: number; jaw: number; hurt: number };
  /** World-free FK of the last pose (rig space): joint positions by bone index. */
  joints(): V3[];
}

export function createRexDriver(): RexDriver {
  const st = { distance: 0, amp: 1, time: 0, walk: 0, jaw: 0, hurt: 0 };
  let speed = 0, wasStunned = false, hurtT = 9, last: { rots: Q[]; root: V3 } = sampleClip("idle", 0), idleClock = 0;
  // stance-foot lock: the ground-plane hip offset that cancels whatever the clip (or the stride amplification) would let
  // the planted foot slide, carried across foot changes and eased out slowly so it never builds up
  let lockFoot = -1, lockPrev: V3 = [0, 0, 0], strideYaw = 0;
  const lock: V3 = [0, 0, 0];
  return {
    state: st,
    joints: () => fk(last.rots, last.root).map((j) => j.p),
    step(inp) {
      const units = inp.moved / Math.max(1e-6, inp.metresPerUnit);
      const v = inp.dt > 0 ? Math.abs(inp.moved) / inp.dt : 0;
      speed += (v - speed) * Math.min(1, inp.dt * 6);
      // stride first, then cadence
      const cycle1 = rexCycleDistance(1) * inp.metresPerUnit;
      const want = speed / (cycle1 * MAX_HZ);
      // nearest stride amplification, with hysteresis so it does not flicker between two tables
      const nearest = want < 1 ? 1 : AMPS.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a), AMPS[0]!);
      if (nearest !== st.amp && Math.abs(want - st.amp) > 0.16) {
        // a new stride keeps the clip time (the legs stay where they are in the cycle), not the distance
        st.distance = distanceForTime(st.time, nearest);
        st.amp = nearest;
      }
      // distance in the amplified table's units stays continuous: keep the phase fraction when the stride changes
      st.distance += units;
      st.time = timeForDistance(st.distance, st.amp);
      const walkTarget = inp.stunned ? 0 : Math.min(1, speed / 0.6);
      st.walk += (walkTarget - st.walk) * Math.min(1, inp.dt * 5);
      idleClock += inp.dt;
      const walk = walkPose(st.time, st.amp), idle = sampleClip("idle", idleClock);
      const rots = walk.rots.map((q, i) => slerp(idle.rots[i]!, q, st.walk));
      const root: V3 = [0, 1, 2].map((k) => idle.root[k]! + (walk.root[k]! - idle.root[k]!) * st.walk) as V3;
      // hurt: a sharp head snap when the stun lands, easing out over ~0.7 s
      if (inp.stunned && !wasStunned) hurtT = 0;
      wasStunned = inp.stunned;
      hurtT += inp.dt;
      st.hurt = hurtT < 0.7 ? Math.sin(Math.min(1, hurtT / 0.12) * Math.PI * 0.5) * (1 - Math.max(0, hurtT - 0.12) / 0.58) : 0;
      const roar = inp.sinceAppear < 1.6 ? Math.sin(Math.min(1, inp.sinceAppear / 1.6) * Math.PI) : 0;
      st.jaw = Math.min(1, Math.max(roar, inp.lunge * 1.1, inp.swipe * 0.6, st.hurt));
      const phase = (st.time / CLIPS.walk.duration) * Math.PI * 2;
      // overlays in rig space, converted to each bone's local frame through its parent's world rotation
      const W = fk(rots, root);
      const local = (bone: number, axis: V3, angle: number) => {
        const pq = W[BONES[bone]!.parent]!.q;
        const ax = qrot(qinv(pq), axis);
        rots[bone] = qmul(qaxis(ax, angle), rots[bone]!);
      };
      // jaw drops about the lateral axis; head lifts on a roar, snaps back on a hit, bobs with the stride
      local(JAW, LATERAL, 0.55 * st.jaw);
      // (a positive turn about LATERAL pitches forward-pointing bones down: it opens the jaw and lowers the head)
      local(HEAD, LATERAL, -0.22 * roar - 0.35 * st.hurt + 0.18 * inp.lunge + 0.05 * Math.sin(phase * 2) * st.walk);
      local(NECK, LATERAL, 0.12 * inp.lunge - 0.15 * st.hurt);
      // the bite lunge: the torso pitches down-forward over the planted legs (spine chain only, the legs keep their
      // stance) and the tail lifts to balance it
      local(SPINE_ROOT, LATERAL, 0.32 * inp.lunge);
      local(TAIL, LATERAL, 0.18 * inp.lunge);
      if (inp.stunned) local(NECK, LATERAL, 0.22); // dazed: the neck sags
      // tail sways counter to the hips (and whips on a swipe)
      const sway = (-0.1 * Math.sin(phase) * st.walk + 0.45 * inp.swipe) / Math.max(1, TAIL_CHAIN.length - 1);
      for (const b of TAIL_CHAIN.slice(1)) local(b, [0, 1, 0], sway);
      // planted feet: the lower foot is the stance foot; it stays on the ground and only travels back by exactly the
      // distance the body moved, the hips absorbing the clip's residual slide (weight shifts over the planted foot)
      // turn the whole skeleton onto the walking line of the current stride (eased: it is a few degrees at most)
      const yawWant = rexStrideYaw(st.amp) * st.walk;
      strideYaw += Math.max(-0.1 * inp.dt, Math.min(0.1 * inp.dt, yawWant - strideYaw));
      if (strideYaw !== 0) {
        const turn = qaxis([0, 1, 0], strideYaw);
        rots[0] = qmul(turn, rots[0]!);
        const r = qrot(turn, root);
        root[0] = r[0]; root[1] = r[1]; root[2] = r[2];
      }
      const raw = fk(rots, root);
      const foot = raw[REX_FEET[0]]!.p[1] <= raw[REX_FEET[1]]!.p[1] ? REX_FEET[0] : REX_FEET[1];
      const fp = raw[foot]!.p;
      if (foot === lockFoot) {
        lock[0] -= fp[0] - lockPrev[0] + REX_FORWARD[0] * units;
        lock[2] -= fp[2] - lockPrev[2] + REX_FORWARD[2] * units;
      }
      lockFoot = foot;
      lockPrev = [...fp] as V3;
      // only an offset beyond LOCK_FREE eases back (slowly), so a steady walk keeps its feet exactly where they landed
      const ll = Math.hypot(lock[0], lock[2]);
      if (ll > LOCK_FREE) {
        const k = (LOCK_FREE + (ll - LOCK_FREE) * Math.exp(-inp.dt * 0.8)) / ll;
        lock[0] *= k;
        lock[2] *= k;
      }
      root[0] += lock[0];
      root[1] += FOOT_Y - fp[1];
      root[2] += lock[2];
      last = { rots, root };
      const bones: RexAnimationPose["bones"] = {};
      BONES.forEach((b, i) => {
        const q = rots[i]!;
        bones[b.name] = { rotation: { x: q[0], y: q[1], z: q[2], w: q[3] } };
      });
      bones[BONES[0]!.name]!.position = { x: root[0], y: root[1], z: root[2] };
      return { bones, mode: "replace" };
    }
  };
}
