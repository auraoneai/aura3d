/**
 * Humanoid role mapping, driver and canonical clips (moved from apps/showcase-port-shared/idol/humanoid.ts, which now
 * re-exports this module; the games import it unchanged). Used by `aura3d animation import` to retarget clips onto any
 * rigged humanoid GLB, including Idol's unnamed `bone_N` rigs.
 *
 * Idol humanoid driver — drive a rigged Idol GLB (unnamed bones `bone_0..N`) from a game's own code-built joint pose.
 *
 * Idol (`speridlabs/idol/max`, `rig: true`) ships a 28–34 bone skeleton in a T-pose with no bone names. Games here already
 * animate their athletes in code: every frame they compute per-joint local rotations for a procedural rig whose rest pose
 * is "standing, arms hanging straight down, legs straight down, facing +Z, +Y up, character's left = +X". This module maps
 * the Idol bones to humanoid roles by hierarchy and rest positions, then turns that same per-joint pose into an
 * `AnimationPose` for `handle.setAnimationPose(...)` on the `model(assets.<key>)` node — so gameplay animation is
 * unchanged and only the body that renders it is new.
 *
 * API (dependency-free; runs in the browser, in vitest and under plain `node`):
 *   parseGlbJson(bytes)                -> glTF JSON chunk of a .glb
 *   readIdolSkeleton(gltf)             -> IdolSkeleton (joint names, parents, rest local TRS, fixed parent-chain transform)
 *   mapHumanoid(skeleton, opts?)       -> HumanoidMap (role -> bone name, spine/neck chains, diagnostics)
 *   createHumanoidDriver(skeleton, o?) -> { map, pose(input) } ; pose() returns `{ bones, mode: "replace" }` with
 *                                         object-form `{x,y,z,w}` / `{x,y,z}` transforms (tuples do not survive the
 *                                         runtime handle's pose clone; see HumanoidBonePose)
 *   driver.modelPositions / palmPoints -> model-space joint and palm-centre positions for a pose (prop anchoring)
 *   loadIdolHumanoid(url, o?)          -> Promise<HumanoidDriver>, cached per URL (fetch + the three calls above)
 *   eulerZYX(x, y, z)                  -> quaternion for the engine's `setRotation(x, y, z)` ("ZYX" = Rz·Ry·Rx)
 *
 * Input pose (`HumanoidPoseInput`): `rotations[role]` = LOCAL rotation of that joint relative to its parent joint, in the
 * canonical rest frame above; source hierarchy is hips → spine → chest → neck → head, chest → {l,r}Shoulder → UpperArm →
 * LowerArm → Hand, hips → {l,r}UpperLeg → LowerLeg → Foot. Omitted roles are identity (a rig with only a "chest" joint
 * just omits spine). `hipsOffset` is the hips displacement from rest in units of rest hip height (FC: offset / 0.96).
 *
 * Retargeting rule per mapped bone: world = G_src · A · R_rest, where G_src is the source joint's accumulated rotation,
 * R_rest the Idol bone's rest world rotation and A the shortest-arc turn that points the Idol limb straight down (arms
 * and legs only — the T-pose arms become hanging arms; torso, neck, head and feet keep Idol's natural rest posture).
 * The source torso rotation (spine·chest) is spread evenly over Idol's spine chain, neck·head over its neck chain.
 * Clavicles take `shoulderDrop` (default 0.3) of their arm's A so the lowered shoulders do not bunch up.
 * Unmapped bones (clavicles without a source, fingers, toes, head ends) follow their parent at their rest local rotation.
 */

export type Vec3 = readonly [number, number, number];
/** Quaternion `[x, y, z, w]` (glTF / engine order). */
export type Quat = readonly [number, number, number, number];

export const HUMANOID_ROLES = [
  "hips", "spine", "chest", "neck", "head",
  "leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand",
  "rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand",
  "leftUpperLeg", "leftLowerLeg", "leftFoot",
  "rightUpperLeg", "rightLowerLeg", "rightFoot"
] as const;
export type HumanoidRole = (typeof HUMANOID_ROLES)[number];

export interface IdolBone {
  readonly name: string;
  /** Index into `bones` of the parent joint, or -1 when the parent is not a joint. */
  readonly parent: number;
  readonly t: Vec3;
  readonly r: Quat;
  readonly s: Vec3;
}

export interface IdolSkeleton {
  readonly bones: readonly IdolBone[];
  /** World transform of the (non-joint) parent chain above each root joint, keyed by bone index. */
  readonly rootParents: Readonly<Record<number, { readonly t: Vec3; readonly r: Quat; readonly s: number }>>;
}

export interface HumanoidMap {
  readonly roles: Partial<Record<HumanoidRole, string>>;
  /** Idol bones from the first spine bone up to the bone the arms hang from (inclusive). */
  readonly spineChain: readonly string[];
  /** Idol bones above the arm branch up to and including the head bone. */
  readonly neckChain: readonly string[];
  /** Rest height of the hips joint above the lowest joint, in model units. */
  readonly hipHeight: number;
  readonly missing: readonly HumanoidRole[];
  readonly ok: boolean;
}

export interface HumanoidPoseInput {
  readonly rotations: Partial<Record<HumanoidRole, Quat>>;
  /** Hips displacement from rest, in units of rest hip height, in the canonical frame (+Y up, +Z forward). */
  readonly hipsOffset?: Vec3;
  /**
   * Optional model-space palm targets (e.g. a held ball's anchor from the procedural rig). The arm is bent and swung
   * with two-bone IK (bend plane taken from the posed arm) so the drawn palm lands on the target when it is in reach;
   * Idol arm proportions differ from the procedural rig's, so the same joint angles alone miss by 10-20 cm.
   */
  readonly handTargets?: { readonly left?: Vec3; readonly right?: Vec3 };
}

/**
 * One bone's local transform in OBJECT form. The runtime handle clones poses with object spread
 * (`{ ...transform.rotation }`), which turns a tuple into `{ 0, 1, 2, 3 }` and makes the glTF runtime reject the whole
 * pose (every body then renders its bind T-pose); `{ x, y, z, w }` survives the clone.
 */
export interface HumanoidBonePose {
  readonly rotation: { readonly x: number; readonly y: number; readonly z: number; readonly w: number };
  readonly position?: { readonly x: number; readonly y: number; readonly z: number };
}

/** Structurally an engine `AnimationPose` (`handle.setAnimationPose(pose)`). */
export interface HumanoidAnimationPose {
  readonly bones: Record<string, HumanoidBonePose>;
  readonly mode: "replace";
}

export interface HumanoidDriverOptions {
  /** Which model-space axis the character faces. Generator output (normalised) faces +Z (default); raw Idol faces +X. */
  readonly facing?: "+z" | "-z" | "+x" | "-x";
  /**
   * Share (0..1) of the T-pose -> hanging-arm turn the clavicle bones take (default 0.3), so lowered arms hang from a
   * dropped shoulder instead of bunching the deltoid. Arm directions are unaffected (they are solved in world space).
   */
  readonly shoulderDrop?: number;
  /**
   * Explicit role -> bone-name assignments that override the automatic mapping (`aura3d animation import --map`).
   * Spine and neck chains are re-derived from the overridden hips/spine/chest/neck/head bones.
   */
  readonly roles?: Partial<Record<HumanoidRole, string>>;
  /** Largest forearm twist about its own axis relative to the upper arm, degrees (default 75; candy-wrapper guard). */
  readonly maxForearmTwistDeg?: number;
  /** Largest hand twist about its own axis relative to the forearm, degrees (default 60). */
  readonly maxWristTwistDeg?: number;
}

/** Split `q` into swing * twist about unit `axis` and clamp the twist angle to +-`max` radians. */
export function clampTwist(q: Quat, axis: Vec3, max: number): Quat {
  const d = q[0] * axis[0] + q[1] * axis[1] + q[2] * axis[2];
  let tw: Quat = [axis[0] * d, axis[1] * d, axis[2] * d, q[3]];
  const n = Math.hypot(tw[0], tw[1], tw[2], tw[3]);
  if (n < 1e-9) return q;
  tw = [tw[0] / n, tw[1] / n, tw[2] / n, tw[3] / n];
  if (tw[3] < 0) tw = [-tw[0], -tw[1], -tw[2], -tw[3]];
  const angle = 2 * Math.atan2(Math.hypot(tw[0], tw[1], tw[2]), tw[3]);
  if (angle <= max) return q;
  const swing = quatMul(q, quatInv(tw));
  const sign = (tw[0] * axis[0] + tw[1] * axis[1] + tw[2] * axis[2]) >= 0 ? 1 : -1;
  return quatNorm(quatMul(swing, quatAxisAngle([axis[0] * sign, axis[1] * sign, axis[2] * sign], max)));
}

export interface HumanoidDriver {
  readonly map: HumanoidMap;
  readonly skeleton: IdolSkeleton;
  /** Bone transforms for one frame. Every joint gets a rotation; the hips also get a position. */
  pose(input: HumanoidPoseInput): HumanoidAnimationPose;
  /** Model-space joint positions for a pose (debug, tests, foot-plant checks). */
  modelPositions(input: HumanoidPoseInput): Record<string, Vec3>;
  /**
   * Model-space palm centres for a pose: 60% of the way from each wrist (hand bone) to the mean of its child (finger)
   * joints. Use these, not the procedural rig's palm, to anchor held props (balls) to the hand that is drawn.
   */
  palmPoints(input: HumanoidPoseInput): { readonly left: Vec3; readonly right: Vec3 };
}

/* ------------------------------------------------------------------ */
/*  Quaternion helpers                                                 */
/* ------------------------------------------------------------------ */

export const QUAT_IDENTITY: Quat = [0, 0, 0, 1];

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

/** The engine's `setRotation(x, y, z)` ("ZYX" = Rz·Ry·Rx: X applied first). */
export function eulerZYX(x: number, y: number, z: number): Quat {
  return quatMul(quatMul(quatAxisAngle([0, 0, 1], z), quatAxisAngle([0, 1, 0], y)), quatAxisAngle([1, 0, 0], x));
}

/** `q` raised to `t` (slerp from identity). */
export function quatPow(q: Quat, t: number): Quat {
  const w = Math.max(-1, Math.min(1, q[3] < 0 ? -q[3] : q[3]));
  const sign = q[3] < 0 ? -1 : 1;
  const half = Math.acos(w);
  const s = Math.sin(half);
  if (s < 1e-6) return QUAT_IDENTITY;
  return quatAxisAngle([q[0] * sign / s, q[1] * sign / s, q[2] * sign / s], 2 * half * t);
}

/** Shortest-arc rotation turning unit direction `from` onto unit direction `to`. */
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

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function norm(a: Vec3): Vec3 {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

/* ------------------------------------------------------------------ */
/*  GLB / skeleton reading                                             */
/* ------------------------------------------------------------------ */

interface GltfNode {
  readonly name?: string;
  readonly children?: readonly number[];
  readonly translation?: readonly number[];
  readonly rotation?: readonly number[];
  readonly scale?: readonly number[];
  readonly matrix?: readonly number[];
}
export interface GltfJsonLike {
  readonly nodes?: readonly GltfNode[];
  readonly skins?: readonly { readonly joints: readonly number[] }[];
}

/** The JSON chunk of a binary glTF. */
export function parseGlbJson(bytes: ArrayBuffer | Uint8Array): GltfJsonLike {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error("parseGlbJson: not a GLB (bad magic)");
  const chunkLen = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== 0x4e4f534a) throw new Error("parseGlbJson: first chunk is not JSON");
  return JSON.parse(new TextDecoder().decode(u8.subarray(20, 20 + chunkLen))) as GltfJsonLike;
}

const vec3Of = (v: readonly number[] | undefined, d: Vec3): Vec3 => (v && v.length >= 3 ? [v[0]!, v[1]!, v[2]!] : d);
const quatOf = (v: readonly number[] | undefined): Quat => (v && v.length >= 4 ? quatNorm([v[0]!, v[1]!, v[2]!, v[3]!]) : QUAT_IDENTITY);

/** Joint table of the first skin plus the fixed transform chain above each root joint (e.g. the generator's `auraRoot`). */
export function readIdolSkeleton(gltf: GltfJsonLike): IdolSkeleton {
  const nodes = gltf.nodes ?? [];
  const joints = gltf.skins?.[0]?.joints;
  if (!joints || joints.length === 0) throw new Error("readIdolSkeleton: the GLB has no skin");
  const nodeParent = new Map<number, number>();
  nodes.forEach((n, i) => n.children?.forEach((c) => nodeParent.set(c, i)));
  const jointIndex = new Map<number, number>();
  joints.forEach((n, i) => jointIndex.set(n, i));
  const bones: IdolBone[] = joints.map((n) => {
    const node = nodes[n] ?? {};
    if (node.matrix) throw new Error(`readIdolSkeleton: joint ${node.name ?? n} uses a matrix transform (unsupported)`);
    const p = nodeParent.get(n);
    return {
      name: node.name ?? `node_${n}`,
      parent: p !== undefined && jointIndex.has(p) ? jointIndex.get(p)! : -1,
      t: vec3Of(node.translation, [0, 0, 0]),
      r: quatOf(node.rotation),
      s: vec3Of(node.scale, [1, 1, 1])
    };
  });
  const rootParents: Record<number, { t: Vec3; r: Quat; s: number }> = {};
  bones.forEach((b, i) => {
    if (b.parent !== -1) return;
    // Compose the non-joint ancestors (root first). Uniform scale assumed (the generator only writes uniform scale).
    const chain: GltfNode[] = [];
    for (let p = nodeParent.get(joints[i]!); p !== undefined; p = nodeParent.get(p)) chain.unshift(nodes[p] ?? {});
    let w = { t: [0, 0, 0] as Vec3, r: QUAT_IDENTITY, s: 1 };
    for (const n of chain) {
      if (n.matrix) throw new Error("readIdolSkeleton: matrix transforms above the skeleton are unsupported");
      w = compose(w, { t: vec3Of(n.translation, [0, 0, 0]), r: quatOf(n.rotation), s: vec3Of(n.scale, [1, 1, 1])[0] });
    }
    rootParents[i] = w;
  });
  return { bones, rootParents };
}

interface Xf { readonly t: Vec3; readonly r: Quat; readonly s: number }
function compose(parent: Xf, local: Xf): Xf {
  return { t: add(parent.t, scale(rotateVec(parent.r, local.t), parent.s)), r: quatMul(parent.r, local.r), s: parent.s * local.s };
}

function restWorld(sk: IdolSkeleton): Xf[] {
  const out: Xf[] = new Array(sk.bones.length);
  const visit = (i: number): Xf => {
    if (out[i]) return out[i]!;
    const b = sk.bones[i]!;
    const parent = b.parent === -1 ? sk.rootParents[i] ?? { t: [0, 0, 0] as Vec3, r: QUAT_IDENTITY, s: 1 } : visit(b.parent);
    return (out[i] = compose(parent, { t: b.t, r: b.r, s: b.s[0] }));
  };
  sk.bones.forEach((_, i) => visit(i));
  return out;
}

const FACING_YAW: Readonly<Record<string, number>> = { "+z": 0, "+x": Math.PI / 2, "-z": Math.PI, "-x": -Math.PI / 2 };

/* ------------------------------------------------------------------ */
/*  Mapping                                                            */
/* ------------------------------------------------------------------ */

interface MapInternal extends HumanoidMap {
  readonly index: Partial<Record<HumanoidRole, number>>;
  readonly spineIdx: readonly number[];
  readonly neckIdx: readonly number[];
}

function mapInternal(sk: IdolSkeleton, opts: HumanoidDriverOptions = {}): MapInternal {
  const world = restWorld(sk);
  const pos = world.map((w) => w.t);
  const kids: number[][] = sk.bones.map(() => []);
  sk.bones.forEach((b, i) => { if (b.parent >= 0) kids[b.parent]!.push(i); });
  const facing = quatAxisAngle([0, 1, 0], FACING_YAW[opts.facing ?? "+z"] ?? 0);
  const left = rotateVec(facing, [1, 0, 0]);
  const lat = (i: number) => dot(pos[i]!, left);
  const subtree = (i: number): number[] => [i, ...kids[i]!.flatMap(subtree)];
  const maxY = (i: number) => Math.max(...subtree(i).map((j) => pos[j]![1]));
  const minY = (i: number) => Math.min(...subtree(i).map((j) => pos[j]![1]));

  const roots = sk.bones.map((b, i) => (b.parent === -1 ? i : -1)).filter((i) => i >= 0);
  let hips = roots.sort((a, b) => subtree(b).length - subtree(a).length)[0] ?? 0;
  while (kids[hips]!.length === 1) hips = kids[hips]![0]!;

  const index: Partial<Record<HumanoidRole, number>> = { hips };
  const hk = [...kids[hips]!];
  const spineStart = hk.sort((a, b) => maxY(b) - maxY(a))[0];
  const legRoots = kids[hips]!.filter((k) => k !== spineStart).sort((a, b) => minY(a) - minY(b)).slice(0, 2);
  const legs = legRoots.sort((a, b) => lat(b) - lat(a)); // [left, right]

  // Spine/neck/head: always continue into the child whose subtree reaches highest (the head tops a T-pose).
  const upChain: number[] = [];
  for (let c = spineStart; c !== undefined; c = [...kids[c]!].sort((a, b) => maxY(b) - maxY(a))[0]) upChain.push(c);
  const branches: { at: number; root: number; reach: number }[] = [];
  upChain.forEach((b, at) => kids[b]!.filter((k) => !upChain.includes(k)).forEach((root) => {
    const reach = subtree(root).reduce((m, j) => (Math.abs(lat(j)) > Math.abs(m) ? lat(j) : m), 0);
    branches.push({ at, root, reach });
  }));
  const lArm = branches.filter((b) => b.reach > 0).sort((a, b) => b.reach - a.reach)[0];
  const rArm = branches.filter((b) => b.reach < 0).sort((a, b) => a.reach - b.reach)[0];
  const chestAt = Math.max(lArm?.at ?? -1, rArm?.at ?? -1);
  const spineIdx = chestAt >= 0 ? upChain.slice(0, chestAt + 1) : upChain.slice(0, Math.max(1, upChain.length - 2));
  const neckIdx = upChain.slice(spineIdx.length);
  if (spineIdx.length) { index.spine = spineIdx[0]; index.chest = spineIdx[spineIdx.length - 1]; }
  if (neckIdx.length >= 2) { index.neck = neckIdx[0]; index.head = neckIdx[1]; }
  else if (neckIdx.length === 1) index.head = neckIdx[0];

  // Limb chains: follow the child reaching furthest along `score`, then pick the two longest consecutive segments.
  const chainFrom = (root: number, score: (j: number) => number): number[] => {
    const out: number[] = [];
    for (let c: number | undefined = root; c !== undefined; c = [...kids[c]!].sort((a, b) => Math.max(...subtree(b).map(score)) - Math.max(...subtree(a).map(score)))[0]) out.push(c);
    return out;
  };
  const limb = (chain: number[]): [number, number, number, number] | undefined => {
    let best = -1, at = -1;
    for (let i = 0; i + 2 < chain.length; i++) {
      const s = len(sub(pos[chain[i + 1]!]!, pos[chain[i]!]!)) + len(sub(pos[chain[i + 2]!]!, pos[chain[i + 1]!]!));
      if (s > best) { best = s; at = i; }
    }
    return at < 0 ? undefined : [at > 0 ? chain[at - 1]! : -1, chain[at]!, chain[at + 1]!, chain[at + 2]!];
  };
  const arm = (side: "left" | "right", br: typeof lArm) => {
    if (!br) return;
    const sgn = side === "left" ? 1 : -1;
    const l = limb(chainFrom(br.root, (j) => sgn * lat(j)));
    if (!l) return;
    if (l[0] >= 0) index[`${side}Shoulder`] = l[0];
    index[`${side}UpperArm`] = l[1]; index[`${side}LowerArm`] = l[2]; index[`${side}Hand`] = l[3];
  };
  arm("left", lArm); arm("right", rArm);
  const leg = (side: "left" | "right", root: number | undefined) => {
    if (root === undefined) return;
    const l = limb(chainFrom(root, (j) => -pos[j]![1]));
    if (!l) return;
    index[`${side}UpperLeg`] = l[1]; index[`${side}LowerLeg`] = l[2]; index[`${side}Foot`] = l[3];
  };
  leg("left", legs[0]); leg("right", legs[1]);

  let spineOut = spineIdx, neckOut = neckIdx;
  if (opts.roles && Object.keys(opts.roles).length) {
    const byName = new Map(sk.bones.map((b, i) => [b.name, i] as const));
    for (const [role, bone] of Object.entries(opts.roles) as [HumanoidRole, string | undefined][]) {
      if (bone === undefined) continue;
      if (!(HUMANOID_ROLES as readonly string[]).includes(role)) throw new Error(`mapHumanoid: unknown role "${role}" in the role map (roles: ${HUMANOID_ROLES.join(", ")})`);
      const i = byName.get(bone);
      if (i === undefined) throw new Error(`mapHumanoid: role map names bone "${bone}" for ${role}, but the skeleton has no joint with that name`);
      index[role] = i;
    }
    // Path from `to` down to `from` (inclusive) when `from` is an ancestor of `to`.
    const path = (from: number, to: number): number[] | undefined => {
      const out: number[] = [];
      for (let c = to; c >= 0; c = sk.bones[c]!.parent) { out.unshift(c); if (c === from) return out; }
      return undefined;
    };
    const o = opts.roles;
    if ((o.spine || o.chest || o.hips) && index.spine !== undefined && index.chest !== undefined) {
      const p = path(index.spine, index.chest);
      if (!p) throw new Error("mapHumanoid: the mapped spine bone is not an ancestor of the mapped chest bone");
      spineOut = p;
    }
    if ((o.chest || o.neck || o.head) && index.chest !== undefined && index.head !== undefined) {
      const p = path(index.chest, index.head);
      if (!p) throw new Error("mapHumanoid: the mapped chest bone is not an ancestor of the mapped head bone");
      neckOut = p.slice(1);
      if (!o.neck) { if (neckOut.length >= 2) index.neck = neckOut[0]; else delete index.neck; }
    }
  }

  const required: HumanoidRole[] = ["hips", "chest", "head", "leftUpperArm", "leftLowerArm", "rightUpperArm", "rightLowerArm",
    "leftUpperLeg", "leftLowerLeg", "leftFoot", "rightUpperLeg", "rightLowerLeg", "rightFoot"];
  const missing = required.filter((r) => index[r] === undefined);
  const roles: Partial<Record<HumanoidRole, string>> = {};
  for (const [r, i] of Object.entries(index)) roles[r as HumanoidRole] = sk.bones[i!]!.name;
  const lowest = Math.min(...pos.map((p) => p[1]));
  const hipsAt = index.hips ?? hips;
  return {
    roles, index, spineIdx: spineOut, neckIdx: neckOut,
    spineChain: spineOut.map((i) => sk.bones[i]!.name),
    neckChain: neckOut.map((i) => sk.bones[i]!.name),
    hipHeight: pos[hipsAt]![1] - lowest,
    missing, ok: missing.length === 0
  };
}

/** Map Idol bones to humanoid roles by hierarchy and rest positions. */
export function mapHumanoid(skeleton: IdolSkeleton, opts: HumanoidDriverOptions = {}): HumanoidMap {
  const { index: _i, spineIdx: _s, neckIdx: _n, ...map } = mapInternal(skeleton, opts);
  return map;
}

/* ------------------------------------------------------------------ */
/*  Driver                                                             */
/* ------------------------------------------------------------------ */

const LIMB_CHILD: Partial<Record<HumanoidRole, HumanoidRole>> = {
  leftUpperArm: "leftLowerArm", leftLowerArm: "leftHand", leftHand: "leftHand",
  rightUpperArm: "rightLowerArm", rightLowerArm: "rightHand", rightHand: "rightHand",
  leftUpperLeg: "leftLowerLeg", leftLowerLeg: "leftFoot",
  rightUpperLeg: "rightLowerLeg", rightLowerLeg: "rightFoot"
};

/** Per-limb rest alignment A: shortest arc from each limb's rest direction to straight down (clavicles take `drop`). */
function limbAlignments(skeleton: IdolSkeleton, m: MapInternal, rest: readonly Xf[], shoulderDrop?: number): Map<number, Quat> {
  const bones = skeleton.bones;
  const align = new Map<number, Quat>();
  for (const [role, childRole] of Object.entries(LIMB_CHILD) as [HumanoidRole, HumanoidRole][]) {
    const b = m.index[role];
    if (b === undefined) continue;
    let tip = m.index[childRole];
    if (role === childRole) { // hand: towards its first child, else the forearm direction
      const kid = bones.findIndex((x) => x.parent === b);
      tip = kid >= 0 ? kid : undefined;
    }
    const from = tip !== undefined && tip !== b ? sub(rest[tip]!.t, rest[b]!.t)
      : sub(rest[b]!.t, rest[bones[b]!.parent]!.t);
    align.set(b, quatFromTo(norm(from), [0, -1, 0]));
  }
  const drop = Math.max(0, Math.min(1, shoulderDrop ?? 0.3));
  for (const side of ["left", "right"] as const) {
    const sh = m.index[`${side}Shoulder`], up = m.index[`${side}UpperArm`];
    if (sh !== undefined && up !== undefined && align.has(up)) align.set(sh, quatPow(align.get(up)!, drop));
    // The hand keeps its bind relation to the forearm: aiming it at its first child (often the thumb or a splayed
    // finger) bent every wrist by that bone's angle and, with a twist on top, collapsed the skin into shards.
    const lo = m.index[`${side}LowerArm`], hand = m.index[`${side}Hand`];
    if (lo !== undefined && hand !== undefined && align.has(lo)) align.set(hand, align.get(lo)!);
  }
  return align;
}

export function createHumanoidDriver(skeleton: IdolSkeleton, opts: HumanoidDriverOptions = {}): HumanoidDriver {
  const m = mapInternal(skeleton, opts);
  if (!m.ok) throw new Error(`createHumanoidDriver: could not map ${m.missing.join(", ")}`);
  const bones = skeleton.bones;
  const rest = restWorld(skeleton);
  const F = quatAxisAngle([0, 1, 0], FACING_YAW[opts.facing ?? "+z"] ?? 0);
  const Finv = quatInv(F);
  const roleOf = new Map<number, HumanoidRole>();
  for (const [r, i] of Object.entries(m.index)) roleOf.set(i!, r as HumanoidRole);
  const spinePos = new Map(m.spineIdx.map((b, k) => [b, k] as const));
  const neckPos = new Map(m.neckIdx.map((b, k) => [b, k] as const));
  const headAt = m.index.head!;

  const align = limbAlignments(skeleton, m, rest, opts.shoulderDrop);
  // Twist guards: the forearm twists about the elbow->wrist axis, the hand about the axis to its fingers (both in the
  // bone's own frame, i.e. the child offsets), each relative to its bind rotation.
  const twistLimit = new Map<number, { axis: Vec3; max: number }>();
  for (const side of ["left", "right"] as const) {
    const lo = m.index[`${side}LowerArm`], hand = m.index[`${side}Hand`];
    if (lo !== undefined && hand !== undefined) {
      twistLimit.set(lo, { axis: norm(bones[hand]!.t), max: ((opts.maxForearmTwistDeg ?? 75) * Math.PI) / 180 });
      const kids = bones.map((b, i) => (b.parent === hand ? i : -1)).filter((i) => i >= 0);
      const tip = kids.reduce<Vec3>((acc, k) => add(acc, bones[k]!.t), [0, 0, 0]);
      const axis = len(tip) > 1e-6 ? norm(tip) : rotateVec(quatInv(bones[hand]!.r), norm(bones[hand]!.t));
      twistLimit.set(hand, { axis, max: ((opts.maxWristTwistDeg ?? 60) * Math.PI) / 180 });
    }
  }
  const order: number[] = [];
  const seen = new Set<number>();
  const visit = (i: number) => { if (seen.has(i)) return; const p = bones[i]!.parent; if (p >= 0) visit(p); seen.add(i); order.push(i); };
  bones.forEach((_, i) => visit(i));

  const solveBase = (input: HumanoidPoseInput): { world: Quat[]; local: Quat[]; hipsT: Vec3 } => {
    const q = (r: HumanoidRole) => input.rotations[r] ?? QUAT_IDENTITY;
    // Source accumulated rotations in the canonical frame.
    const gHips = q("hips");
    const torso = quatMul(q("spine"), q("chest"));
    const gChest = quatMul(gHips, torso);
    const headRel = quatMul(q("neck"), q("head"));
    const gArm = (s: "left" | "right") => {
      const sh = quatMul(gChest, q(`${s}Shoulder`));
      const up = quatMul(sh, q(`${s}UpperArm`));
      const lo = quatMul(up, q(`${s}LowerArm`));
      return { sh, up, lo, hand: quatMul(lo, q(`${s}Hand`)) };
    };
    const gLeg = (s: "left" | "right") => {
      const up = quatMul(gHips, q(`${s}UpperLeg`));
      const lo = quatMul(up, q(`${s}LowerLeg`));
      return { up, lo, foot: quatMul(lo, q(`${s}Foot`)) };
    };
    const L = gArm("left"), R = gArm("right"), LL = gLeg("left"), RL = gLeg("right");
    const src: Partial<Record<HumanoidRole, Quat>> = {
      hips: gHips,
      leftShoulder: L.sh, leftUpperArm: L.up, leftLowerArm: L.lo, leftHand: L.hand,
      rightShoulder: R.sh, rightUpperArm: R.up, rightLowerArm: R.lo, rightHand: R.hand,
      leftUpperLeg: LL.up, leftLowerLeg: LL.lo, leftFoot: LL.foot,
      rightUpperLeg: RL.up, rightLowerLeg: RL.lo, rightFoot: RL.foot
    };
    const world: Quat[] = new Array(bones.length);
    const local: Quat[] = new Array(bones.length);
    const nSpine = m.spineIdx.length, nNeck = neckPos.get(headAt)! + 1;
    for (const i of order) {
      const b = bones[i]!;
      const parentWorld = b.parent >= 0 ? world[b.parent]! : (skeleton.rootParents[i]?.r ?? QUAT_IDENTITY);
      let g: Quat | undefined;
      const role = roleOf.get(i);
      if (spinePos.has(i)) g = quatMul(gHips, quatPow(torso, (spinePos.get(i)! + 1) / nSpine));
      else if (neckPos.has(i) && neckPos.get(i)! < nNeck) g = quatMul(gChest, quatPow(headRel, (neckPos.get(i)! + 1) / nNeck));
      else if (role && src[role]) g = src[role];
      if (g) {
        const gm = quatMul(quatMul(F, g), Finv);
        const w = quatMul(quatMul(gm, align.get(i) ?? QUAT_IDENTITY), rest[i]!.r);
        let l = quatNorm(quatMul(quatInv(parentWorld), w));
        const lim = twistLimit.get(i);
        if (lim) l = quatNorm(quatMul(b.r, clampTwist(quatMul(quatInv(b.r), l), lim.axis, lim.max)));
        local[i] = l;
        world[i] = lim ? quatNorm(quatMul(parentWorld, l)) : w;
      } else {
        local[i] = b.r;
        world[i] = quatMul(parentWorld, b.r);
      }
    }
    // Hips translation: canonical offset * hip height, into the hips' parent space.
    const off = input.hipsOffset ?? [0, 0, 0];
    const h = m.index.hips!;
    const hb = bones[h]!;
    const pXf: Xf = hb.parent >= 0 ? rest[hb.parent]! : skeleton.rootParents[h] ?? { t: [0, 0, 0], r: QUAT_IDENTITY, s: 1 };
    const dModel = rotateVec(F, scale(off, m.hipHeight));
    const dLocal = scale(rotateVec(quatInv(pXf.r), dModel), 1 / (pXf.s || 1));
    return { world, local, hipsT: add(hb.t, dLocal) };
  };

  const fk = (local: readonly Quat[], hipsT: Vec3): Vec3[] => {
    const xf: Xf[] = new Array(bones.length);
    for (const i of order) {
      const b = bones[i]!;
      const parent = b.parent >= 0 ? xf[b.parent]! : skeleton.rootParents[i] ?? { t: [0, 0, 0], r: QUAT_IDENTITY, s: 1 };
      xf[i] = compose(parent, { t: i === m.index.hips ? hipsT : b.t, r: local[i]!, s: b.s[0] });
    }
    return xf.map((x) => x.t);
  };
  const handKids = (h: number) => bones.map((b, i) => (b.parent === h ? i : -1)).filter((i) => i >= 0);
  const palmAt = (pos: readonly Vec3[], h: number): Vec3 => {
    const kids = handKids(h);
    if (!kids.length) return pos[h]!;
    const tip = scale(kids.reduce<Vec3>((acc, k) => add(acc, pos[k]!), [0, 0, 0]), 1 / kids.length);
    return add(pos[h]!, scale(sub(tip, pos[h]!), 0.6));
  };
  const isUnder = (i: number, root: number): boolean => {
    for (let c = i; c >= 0; c = bones[c]!.parent) if (c === root) return true;
    return false;
  };

  const solve = (input: HumanoidPoseInput): { world: Quat[]; local: Quat[]; hipsT: Vec3 } => {
    const base = solveBase(input);
    const targets = input.handTargets;
    if (!targets || (!targets.left && !targets.right)) return base;
    const { world, local, hipsT } = base;
    for (const side of ["left", "right"] as const) {
      const T = targets[side];
      const u = m.index[`${side}UpperArm`], l = m.index[`${side}LowerArm`], h = m.index[`${side}Hand`];
      if (!T || u === undefined || l === undefined || h === undefined) continue;
      const pos = fk(local, hipsT);
      const S = pos[u]!, E = pos[l]!, P = palmAt(pos, h);
      const a = len(sub(E, S)), b = len(sub(P, E));
      const d = Math.max(Math.abs(a - b) + 1e-4, Math.min(a + b - 1e-4, len(sub(T, S))));
      const se = sub(S, E), pe = sub(P, E);
      const phi = Math.acos(Math.max(-1, Math.min(1, dot(se, pe) / ((len(se) * len(pe)) || 1))));
      const theta = Math.acos(Math.max(-1, Math.min(1, (a * a + b * b - d * d) / (2 * a * b))));
      let n = cross(se, pe);
      if (len(n) < 1e-6) n = cross(se, rotateVec(F, [1, 0, 0]));
      const R1 = quatAxisAngle(norm(n), theta - phi);
      const P1 = add(E, rotateVec(R1, pe));
      const R2 = quatFromTo(norm(sub(P1, S)), norm(sub(T, S)));
      const R21 = quatMul(R2, R1);
      for (let i = 0; i < bones.length; i++) {
        if (i === u) world[i] = quatNorm(quatMul(R2, world[i]!));
        else if (isUnder(i, l)) world[i] = quatNorm(quatMul(R21, world[i]!));
      }
      const pw = (i: number) => (bones[i]!.parent >= 0 ? world[bones[i]!.parent]! : (skeleton.rootParents[i]?.r ?? QUAT_IDENTITY));
      local[u] = quatNorm(quatMul(quatInv(pw(u)), world[u]!));
      local[l] = quatNorm(quatMul(quatInv(pw(l)), world[l]!));
    }
    return { world, local, hipsT };
  };

  return {
    map: mapHumanoid(skeleton, opts),
    skeleton,
    pose(input) {
      const { local, hipsT } = solve(input);
      const out: Record<string, HumanoidBonePose> = {};
      bones.forEach((b, i) => {
        const q = local[i]!;
        const rotation = { x: q[0], y: q[1], z: q[2], w: q[3] };
        out[b.name] = i === m.index.hips ? { rotation, position: { x: hipsT[0], y: hipsT[1], z: hipsT[2] } } : { rotation };
      });
      return { bones: out, mode: "replace" };
    },
    modelPositions(input) {
      return positions(input);
    },
    palmPoints(input) {
      const { local, hipsT } = solve(input);
      const pos = fk(local, hipsT);
      return { left: palmAt(pos, m.index.leftHand!), right: palmAt(pos, m.index.rightHand!) };
    }
  };

  function positions(input: HumanoidPoseInput): Record<string, Vec3> {
    const { local, hipsT } = solve(input);
    const pos = fk(local, hipsT);
    const out: Record<string, Vec3> = {};
    bones.forEach((b, i) => { out[b.name] = pos[i]!; });
    return out;
  }
}

/* ------------------------------------------------------------------ */
/*  Mocap source retargeting and baked clips                           */
/* ------------------------------------------------------------------ */

const CANON_PARENT: Readonly<Record<HumanoidRole, HumanoidRole | null>> = {
  hips: null, spine: "hips", chest: "spine", neck: "chest", head: "neck",
  leftShoulder: "chest", leftUpperArm: "leftShoulder", leftLowerArm: "leftUpperArm", leftHand: "leftLowerArm",
  rightShoulder: "chest", rightUpperArm: "rightShoulder", rightLowerArm: "rightUpperArm", rightHand: "rightLowerArm",
  leftUpperLeg: "hips", leftLowerLeg: "leftUpperLeg", leftFoot: "leftLowerLeg",
  rightUpperLeg: "hips", rightLowerLeg: "rightUpperLeg", rightFoot: "rightLowerLeg"
};

/** Canonical-frame world rotations per role -> the per-role LOCAL rotations HumanoidPoseInput takes (missing parents skip up). */
export function globalsToLocals(globals: Partial<Record<HumanoidRole, Quat>>): Partial<Record<HumanoidRole, Quat>> {
  const out: Partial<Record<HumanoidRole, Quat>> = {};
  for (const role of HUMANOID_ROLES) {
    const g = globals[role];
    if (!g) continue;
    let p = CANON_PARENT[role];
    while (p && !globals[p]) p = CANON_PARENT[p];
    out[role] = quatNorm(p ? quatMul(quatInv(globals[p]!), g) : g);
  }
  return out;
}

export interface HumanoidSource {
  readonly map: HumanoidMap;
  /**
   * One frame of a source rig (any humanoid skeleton, e.g. a mocap rig) as a canonical pose. `worldRot[i]` is bone i's
   * model-space world rotation this frame, `hipsPos` the hips world position; both in the source skeleton's model space.
   */
  toCanonical(worldRot: readonly Quat[], hipsPos: Vec3): HumanoidPoseInput;
}

/**
 * Inverse of the driver: reads a source rig's motion into the canonical frame (arms-down rest, facing +Z) with the same
 * role mapping and limb alignment rules, so a clip recorded on one rig plays on every Idol body. The source `skeleton`'s
 * rest must be its bind pose.
 */
export function createHumanoidSource(skeleton: IdolSkeleton, opts: HumanoidDriverOptions = {}): HumanoidSource {
  const m = mapInternal(skeleton, opts);
  if (!m.ok) throw new Error(`createHumanoidSource: could not map ${m.missing.join(", ")}`);
  const rest = restWorld(skeleton);
  const align = limbAlignments(skeleton, m, rest, opts.shoulderDrop);
  const F = quatAxisAngle([0, 1, 0], FACING_YAW[opts.facing ?? "+z"] ?? 0);
  const Finv = quatInv(F);
  const hips = m.index.hips!;
  return {
    map: mapHumanoid(skeleton, opts),
    toCanonical(worldRot, hipsPos) {
      const globals: Partial<Record<HumanoidRole, Quat>> = {};
      for (const [role, i] of Object.entries(m.index) as [HumanoidRole, number][]) {
        const restAligned = quatMul(align.get(i) ?? QUAT_IDENTITY, rest[i]!.r);
        const g = quatMul(worldRot[i]!, quatInv(restAligned));
        globals[role] = quatNorm(quatMul(quatMul(Finv, g), F));
      }
      const d = rotateVec(Finv, sub(hipsPos, rest[hips]!.t));
      return { rotations: globalsToLocals(globals), hipsOffset: scale(d, 1 / (m.hipHeight || 1)) };
    }
  };
}

/** A baked canonical clip: `frames` holds, per frame, one quaternion per `roles` entry followed by the 3 hips-offset values. */
export interface HumanoidClip {
  readonly name: string;
  readonly fps: number;
  readonly duration: number;
  readonly roles: readonly HumanoidRole[];
  readonly frameCount: number;
  /** Int16 little-endian, base64: quaternion components * 32767, hips offset * 8192. */
  readonly data: string;
  /** Free-form timing facts measured at bake time (stance speed, contact time, side, ...). */
  readonly meta?: Readonly<Record<string, number | string>>;
}

interface DecodedClip { readonly clip: HumanoidClip; readonly q: Float32Array; readonly h: Float32Array }
const decoded = new WeakMap<HumanoidClip, DecodedClip>();
function decode(clip: HumanoidClip): DecodedClip {
  let d = decoded.get(clip);
  if (d) return d;
  const bin = Uint8Array.from(atob(clip.data), (c) => c.charCodeAt(0));
  const i16 = new Int16Array(bin.buffer, bin.byteOffset, bin.byteLength / 2);
  const per = clip.roles.length * 4 + 3;
  const q = new Float32Array(clip.frameCount * clip.roles.length * 4), h = new Float32Array(clip.frameCount * 3);
  for (let f = 0; f < clip.frameCount; f++) {
    for (let k = 0; k < clip.roles.length * 4; k++) q[f * clip.roles.length * 4 + k] = i16[f * per + k]! / 32767;
    for (let k = 0; k < 3; k++) h[f * 3 + k] = i16[f * per + clip.roles.length * 4 + k]! / 8192;
  }
  d = { clip, q, h };
  decoded.set(clip, d);
  return d;
}

/** Pack canonical frames into a HumanoidClip (bake tools). */
export function encodeHumanoidClip(name: string, fps: number, roles: readonly HumanoidRole[], frames: readonly HumanoidPoseInput[], meta?: Record<string, number | string>): HumanoidClip {
  const per = roles.length * 4 + 3;
  const i16 = new Int16Array(frames.length * per);
  const q16 = (v: number, k: number) => Math.max(-32767, Math.min(32767, Math.round(v * k)));
  frames.forEach((fr, f) => {
    roles.forEach((r, j) => {
      let q = fr.rotations[r] ?? QUAT_IDENTITY;
      if (q[3] < 0) q = [-q[0], -q[1], -q[2], -q[3]];
      for (let k = 0; k < 4; k++) i16[f * per + j * 4 + k] = q16(q[k]!, 32767);
    });
    const h = fr.hipsOffset ?? [0, 0, 0];
    for (let k = 0; k < 3; k++) i16[f * per + roles.length * 4 + k] = q16(h[k]!, 8192);
  });
  const bytes = new Uint8Array(i16.buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const data = btoa(bin);
  return { name, fps, duration: (frames.length - 1) / fps, roles, frameCount: frames.length, data, ...(meta ? { meta } : {}) };
}

export function quatSlerp(a: Quat, b: Quat, t: number): Quat {
  let [bx, by, bz, bw] = b;
  let d = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (d < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; d = -d; }
  if (d > 0.9995) return quatNorm([a[0] + (bx - a[0]) * t, a[1] + (by - a[1]) * t, a[2] + (bz - a[2]) * t, a[3] + (bw - a[3]) * t]);
  const th = Math.acos(d), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
  return [a[0] * wa + bx * wb, a[1] * wa + by * wb, a[2] * wa + bz * wb, a[3] * wa + bw * wb];
}

/** Sample a baked clip at `time` seconds (looped, or clamped with `loop: false`) as a canonical pose. */
export function sampleHumanoidClip(clip: HumanoidClip, time: number, opts: { readonly loop?: boolean } = {}): HumanoidPoseInput {
  const d = decode(clip);
  const n = clip.frameCount;
  const t = opts.loop === false ? Math.max(0, Math.min(clip.duration, time)) : ((time % clip.duration) + clip.duration) % clip.duration;
  const x = t * clip.fps;
  const f0 = Math.min(n - 1, Math.floor(x)), f1 = Math.min(n - 1, f0 + 1), u = x - f0;
  const R = clip.roles.length;
  const rotations: Partial<Record<HumanoidRole, Quat>> = {};
  clip.roles.forEach((role, j) => {
    const a: Quat = [d.q[(f0 * R + j) * 4]!, d.q[(f0 * R + j) * 4 + 1]!, d.q[(f0 * R + j) * 4 + 2]!, d.q[(f0 * R + j) * 4 + 3]!];
    const b: Quat = [d.q[(f1 * R + j) * 4]!, d.q[(f1 * R + j) * 4 + 1]!, d.q[(f1 * R + j) * 4 + 2]!, d.q[(f1 * R + j) * 4 + 3]!];
    rotations[role] = quatSlerp(a, b, u);
  });
  const h = (k: number) => d.h[f0 * 3 + k]! + (d.h[f1 * 3 + k]! - d.h[f0 * 3 + k]!) * u;
  return { rotations, hipsOffset: [h(0), h(1), h(2)] };
}

const MIRROR_ROLE = (r: HumanoidRole): HumanoidRole =>
  (r.startsWith("left") ? `right${r.slice(4)}` : r.startsWith("right") ? `left${r.slice(5)}` : r) as HumanoidRole;

/** Left-right mirror of a canonical pose (reflect across the body's sagittal plane, swap sides). */
export function mirrorHumanoidPose(p: HumanoidPoseInput): HumanoidPoseInput {
  const rotations: Partial<Record<HumanoidRole, Quat>> = {};
  for (const [r, q] of Object.entries(p.rotations) as [HumanoidRole, Quat][]) rotations[MIRROR_ROLE(r)] = [q[0], -q[1], -q[2], q[3]];
  const h = p.hipsOffset ?? [0, 0, 0];
  return { ...p, rotations, hipsOffset: [-h[0], h[1], h[2]] };
}

/** Blend two canonical poses (cross-fades): per-role slerp, hips lerp; `w` = weight of `b`. */
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

/** `base` with the listed roles taken from `top` (e.g. procedural dribbling arm over mocap legs). */
export function layerHumanoidPose(base: HumanoidPoseInput, top: HumanoidPoseInput, roles: readonly HumanoidRole[]): HumanoidPoseInput {
  const rotations = { ...base.rotations };
  for (const r of roles) if (top.rotations[r]) rotations[r] = top.rotations[r];
  return { ...base, rotations };
}

export const ARM_ROLES: readonly HumanoidRole[] = ["leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand", "rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand"];

/* ------------------------------------------------------------------ */
/*  Runtime loader                                                     */
/* ------------------------------------------------------------------ */

const driverCache = new Map<string, Promise<HumanoidDriver>>();

/** Fetch a rigged Idol GLB once (the browser cache serves the model node's own request) and build its driver. */
export function loadIdolHumanoid(url: string, opts: HumanoidDriverOptions = {}): Promise<HumanoidDriver> {
  const key = `${url}|${opts.facing ?? "+z"}`;
  let p = driverCache.get(key);
  if (!p) {
    p = fetch(url)
      .then((r) => { if (!r.ok) throw new Error(`loadIdolHumanoid: ${url} -> HTTP ${r.status}`); return r.arrayBuffer(); })
      .then((buf) => createHumanoidDriver(readIdolSkeleton(parseGlbJson(buf)), opts));
    p.catch(() => driverCache.delete(key));
    driverCache.set(key, p);
  }
  return p;
}
