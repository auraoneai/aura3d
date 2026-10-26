/**
 * `assets repair-skin --refit-skeleton`: moves the skeleton onto the mesh instead of the mesh onto the skeleton.
 *
 * An auto-rigged character whose mesh was modelled in one pose (a guard holding a rifle, a hound mid-stride) but bound to a template
 * skeleton rotates every limb about a joint that is 10 to 30 cm off the limb, and the bridging triangles stretch into sails. This finds
 * each joint where the mesh actually bends (the seam between the two segments the joint separates), re-orients the bones along the
 * mesh's limbs, recomputes the inverse bind matrices so the mesh does not move at rest, and re-targets every clip by world-space
 * delta so the shipped animations keep their motion about the corrected joints. The authored pose of the mesh becomes the rest pose.
 */
import { findHumanoidLegs } from "./analysis.js";
import { GlbEditor } from "./glbEdit.js";
import { buildHierarchy, clipDuration, forward, loadSkins, localPose, mat4Mul, qalign, qconj, qmul, qnorm, qrot, readAccessor, restTrs, type GlbData, type GltfAnimation, type Mat4, type Quat, type Trs, type Vec3 } from "./gltf.js";

export class RefitUnsupported extends Error {}

export interface RefitSkeletonOptions {
  /** Seam edges a joint needs before its position is taken from the mesh (default 6). */
  readonly minSeamEdges?: number;
  /** Frames per second of the re-baked clips (default 30). */
  readonly fps?: number;
}
export interface RefitSkeletonReport {
  readonly moved: readonly { readonly joint: string; readonly offset: number; readonly seamEdges: number }[];
  readonly fallback: readonly string[];
  readonly clips: number;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const ID: Quat = [0, 0, 0, 1];

function worldRotations(trs: readonly Trs[], parent: readonly number[]): Quat[] {
  const out = new Array<Quat | undefined>(trs.length).fill(undefined);
  const visit = (i: number): Quat => {
    const known = out[i];
    if (known) return known;
    const p = parent[i] ?? -1;
    const local = qnorm((trs[i]?.r ?? ID) as Quat);
    const q = p < 0 ? local : qnorm(qmul(visit(p), local));
    out[i] = q;
    return q;
  };
  for (let i = 0; i < trs.length; i += 1) visit(i);
  return out as Quat[];
}

/** Inverse of a rigid (rotation + translation) column-major matrix. */
function rigidInverse(q: Quat, t: Vec3): Mat4 {
  const rt = qconj(q);
  const x = qrot(rt, [1, 0, 0]), y = qrot(rt, [0, 1, 0]), z = qrot(rt, [0, 0, 1]);
  const o = qrot(rt, [-t[0], -t[1], -t[2]]);
  return [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, o[0], o[1], o[2], 1];
}

export function refitSkeleton(glb: GlbData, options: RefitSkeletonOptions = {}): { glb: GlbData; report: RefitSkeletonReport } {
  const hierarchy = buildHierarchy(glb);
  const skins = loadSkins(glb, hierarchy);
  const skin = skins[0];
  if (!skin) throw new RefitUnsupported("No skinned mesh to refit.");
  const skinJson = glb.json.skins?.[skin.index];
  if (!skinJson) throw new RefitUnsupported("Skin definition missing.");
  const nodes = hierarchy.nodes;
  for (const node of nodes) {
    const s = restTrs(node).s;
    if (Math.abs((s[0] ?? 1) - 1) > 1e-3 || Math.abs((s[1] ?? 1) - 1) > 1e-3 || Math.abs((s[2] ?? 1) - 1) > 1e-3) throw new RefitUnsupported("Scaled nodes are not supported by --refit-skeleton: apply the scale to the skeleton first.");
  }
  const jointNodes = skin.joints;
  const jointOf = new Map(jointNodes.map((n, k) => [n, k]));
  const restLocal = nodes.map(restTrs);
  const restWorld = forward(restLocal, hierarchy);
  const restRot = worldRotations(restLocal, hierarchy.parent);
  const P = (n: number): Vec3 => restWorld.pos[n] as Vec3;
  const minSeam = options.minSeamEdges ?? 6;
  const fps = options.fps ?? 30;

  // dominant joint per vertex, seams between a joint and its skeleton parent
  const seamSum = new Map<number, Vec3>();
  const seamCount = new Map<number, number>();
  let height = 0;
  {
    let lo = Infinity, hi = -Infinity;
    for (const prim of skin.primitives) for (const p of prim.pos) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); }
    height = hi > lo ? hi - lo : 1;
  }
  for (const prim of skin.primitives) {
    const dom = prim.pos.map((_, v) => {
      let best = -1, bw = -1;
      const w = prim.weights[v] ?? [], j = prim.joints[v] ?? [];
      for (let k = 0; k < 4; k += 1) if ((w[k] ?? 0) > bw) { bw = w[k] ?? 0; best = j[k] ?? 0; }
      return jointNodes[best] ?? -1;
    });
    for (let t = 0; t + 2 < prim.indices.length; t += 3) {
      for (let e = 0; e < 3; e += 1) {
        const a = prim.indices[t + e] as number, b = prim.indices[t + ((e + 1) % 3)] as number;
        const da = dom[a] as number, db = dom[b] as number;
        if (da === db || da < 0 || db < 0) continue;
        const child = hierarchy.parent[db] === da ? db : hierarchy.parent[da] === db ? da : -1;
        if (child < 0) continue;
        const pa = prim.pos[a] as Vec3, pb = prim.pos[b] as Vec3;
        const mid: Vec3 = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2];
        seamSum.set(child, add(seamSum.get(child) ?? [0, 0, 0], mid));
        seamCount.set(child, (seamCount.get(child) ?? 0) + 1);
      }
    }
  }

  // new joint positions, parents first
  const N = new Map<number, Vec3>();
  const moved: { joint: string; offset: number; seamEdges: number }[] = [];
  const fallback: string[] = [];
  const order = [...jointNodes].sort((a, b) => depth(a) - depth(b));
  function depth(n: number): number { let d = 0; let p = hierarchy.parent[n] ?? -1; while (p >= 0) { d += 1; p = hierarchy.parent[p] ?? -1; } return d; }
  for (const n of order) {
    const count = seamCount.get(n) ?? 0;
    const parentNode = hierarchy.parent[n] ?? -1;
    const parentShift: Vec3 = parentNode >= 0 && N.has(parentNode) ? sub(N.get(parentNode) as Vec3, P(parentNode)) : [0, 0, 0];
    let at: Vec3 | null = null;
    if (count >= minSeam) {
      const s = seamSum.get(n) as Vec3;
      const c: Vec3 = [s[0] / count, s[1] / count, s[2] / count];
      if (len(sub(c, P(n))) <= 0.4 * height) at = c;
    }
    if (at) moved.push({ joint: hierarchy.names[n] ?? `node${n}`, offset: Number(len(sub(at, P(n))).toFixed(3)), seamEdges: count });
    else { at = add(P(n), parentShift); fallback.push(hierarchy.names[n] ?? `node${n}`); }
    N.set(n, at);
  }
  // pelvis pivots between the two hip joints
  const hipsNode = jointNodes.find((n) => /^(mixamorig:?)?hips$/i.test(hierarchy.names[n] ?? ""));
  const legUps = jointNodes.filter((n) => /upper(leg)|upleg|thigh/i.test(hierarchy.names[n] ?? ""));
  if (hipsNode !== undefined && legUps.length === 2) {
    const a = N.get(legUps[0] as number) as Vec3, b = N.get(legUps[1] as number) as Vec3;
    const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    if (len(sub(mid, P(hipsNode))) <= 0.4 * height) N.set(hipsNode, mid);
  }

  // a knee never bends forward: keep it a little in front of the hip-ankle line (model forward is +Z)
  for (const leg of findHumanoidLegs(hierarchy) ?? []) {
    const hip = N.get(leg.up), kn = N.get(leg.knee), an = N.get(leg.foot);
    if (!hip || !kn || !an) continue;
    const line = sub(an, hip);
    const l2 = line[0] * line[0] + line[1] * line[1] + line[2] * line[2];
    if (l2 < 1e-9) continue;
    const t = Math.max(0, Math.min(1, ((kn[0] - hip[0]) * line[0] + (kn[1] - hip[1]) * line[1] + (kn[2] - hip[2]) * line[2]) / l2));
    const proj: Vec3 = [hip[0] + line[0] * t, hip[1] + line[1] * t, hip[2] + line[2] * t];
    const minForward = 0.03 * Math.sqrt(l2);
    if (kn[2] - proj[2] < minForward) N.set(leg.knee, [kn[0], kn[1], proj[2] + minForward]);
  }

  // new world rotations: align each bone with the direction to its main child
  const childrenOf = (n: number): number[] => (nodes[n]?.children ?? []).filter((c) => jointOf.has(c));
  const mainChild = (n: number): number | undefined => {
    const kids = childrenOf(n);
    if (kids.length === 0) return undefined;
    if (kids.length === 1) return kids[0];
    const torso = kids.find((c) => /spine|chest|head|neck/i.test(hierarchy.names[c] ?? ""));
    if (torso !== undefined) return torso;
    return [...kids].sort((a, b) => len(sub(P(b), P(n))) - len(sub(P(a), P(n))))[0];
  };
  const delta = new Map<number, Quat>();
  for (const n of order) {
    const c = mainChild(n);
    const parentNode = hierarchy.parent[n] ?? -1;
    if (c === undefined) { delta.set(n, delta.get(parentNode) ?? ID); continue; }
    const d0 = sub(P(c), P(n)), d1 = sub(N.get(c) as Vec3, N.get(n) as Vec3);
    delta.set(n, len(d0) > 1e-6 && len(d1) > 1e-6 ? qalign([d0[0] / len(d0), d0[1] / len(d0), d0[2] / len(d0)], [d1[0] / len(d1), d1[1] / len(d1), d1[2] / len(d1)]) : ID);
  }
  const newRot = new Map<number, Quat>();
  for (const n of order) newRot.set(n, qnorm(qmul(delta.get(n) as Quat, restRot[n] as Quat)));

  // rewrite node TRS (parents first)
  const editor = new GlbEditor(glb);
  const worldPosNew = new Map<number, Vec3>();
  const worldRotNew = new Map<number, Quat>();
  const nodePosNew = (n: number): Vec3 => (N.get(n) ?? worldPosNew.get(n) ?? P(n));
  const nodeRotNew = (n: number): Quat => (newRot.get(n) ?? worldRotNew.get(n) ?? (restRot[n] as Quat));
  for (const n of order) {
    const parentNode = hierarchy.parent[n] ?? -1;
    const pRot = parentNode >= 0 ? nodeRotNew(parentNode) : ID;
    const pPos = parentNode >= 0 ? nodePosNew(parentNode) : ([0, 0, 0] as Vec3);
    const local = editor.json.nodes[n] as { translation?: number[]; rotation?: number[]; scale?: number[]; matrix?: number[] };
    delete local.matrix;
    local.rotation = qnorm(qmul(qconj(pRot), newRot.get(n) as Quat));
    local.translation = qrot(qconj(pRot), sub(N.get(n) as Vec3, pPos));
    if (!local.scale) local.scale = [1, 1, 1];
  }

  // inverse bind matrices: the rest joint matrix must stay what it was
  const ibmOld = skin.ibm;
  const ibm: number[] = [];
  jointNodes.forEach((n, k) => {
    const oldWorld = restWorld.world[n] as Mat4;
    const inv = rigidInverse(newRot.get(n) as Quat, N.get(n) as Vec3);
    const m = mat4Mul(inv, mat4Mul(oldWorld, ibmOld[k] as Mat4));
    ibm.push(...m);
  });
  const ibmAccessor = editor.addAccessor(ibm, 5126, "MAT4", undefined);
  (editor.json.skins?.[skin.index] as { inverseBindMatrices?: number }).inverseBindMatrices = ibmAccessor;
  void skinJson;

  // re-target every clip by world-space delta, baked at a fixed rate
  const animations = glb.json.animations ?? [];
  const outAnims: GltfAnimation[] = [];
  for (const anim of animations) {
    const dur = Math.max(clipDuration(glb, anim), 1 / fps);
    const frames = Math.max(2, Math.round(dur * fps) + 1);
    const times: number[] = [];
    for (let f = 0; f < frames; f += 1) times.push(Math.min(dur, f / fps));
    const translated = new Set<number>();
    for (const ch of anim.channels) if (ch.target.path === "translation" && ch.target.node !== undefined && jointOf.has(ch.target.node)) translated.add(ch.target.node);
    const rot = new Map<number, number[]>(), pos = new Map<number, number[]>();
    for (const n of jointNodes) { rot.set(n, []); if (translated.has(n)) pos.set(n, []); }
    for (const t of times) {
      const trs = localPose(glb, anim, t, hierarchy);
      const world = forward(trs, hierarchy);
      const oldRot = worldRotations(trs, hierarchy.parent);
      const newW = new Map<number, Quat>();
      const newP = new Map<number, Vec3>();
      for (const n of order) {
        const d = qmul(oldRot[n] as Quat, qconj(restRot[n] as Quat));
        const wq = qnorm(qmul(d, newRot.get(n) as Quat));
        newW.set(n, wq);
        const parentNode = hierarchy.parent[n] ?? -1;
        const parentW: Quat = parentNode >= 0 ? (newW.get(parentNode) ?? (oldRot[parentNode] as Quat)) : ID;
        const lq = qnorm(qmul(qconj(parentW), wq));
        (rot.get(n) as number[]).push(lq[0], lq[1], lq[2], lq[3]);
        const delta = sub(world.pos[n] as Vec3, P(n));
        const wp: Vec3 = add(N.get(n) as Vec3, delta);
        newP.set(n, wp);
        if (translated.has(n)) {
          const parentPos: Vec3 = parentNode >= 0 ? (newP.get(parentNode) ?? (world.pos[parentNode] as Vec3)) : [0, 0, 0];
          const lt = qrot(qconj(parentW), sub(wp, parentPos));
          (pos.get(n) as number[]).push(lt[0], lt[1], lt[2]);
        }
      }
    }
    const samplers: GltfAnimation["samplers"] = [];
    const channels: GltfAnimation["channels"] = [];
    // keep channels that do not drive a joint
    for (const ch of anim.channels) {
      if (ch.target.node !== undefined && jointOf.has(ch.target.node) && (ch.target.path === "rotation" || ch.target.path === "translation")) continue;
      const old = anim.samplers[ch.sampler];
      if (!old) continue;
      samplers.push({ input: old.input, output: old.output, ...(old.interpolation ? { interpolation: old.interpolation } : {}) });
      channels.push({ sampler: samplers.length - 1, target: { ...ch.target } });
    }
    const timeAccessor = editor.addAccessor(times, 5126, "SCALAR", undefined);
    const acc = editor.json.accessors[timeAccessor] as { min?: number[]; max?: number[] };
    acc.min = [times[0] as number]; acc.max = [times[times.length - 1] as number];
    for (const n of jointNodes) {
      const r = editor.addAccessor(rot.get(n) as number[], 5126, "VEC4", undefined);
      samplers.push({ input: timeAccessor, output: r, interpolation: "LINEAR" });
      channels.push({ sampler: samplers.length - 1, target: { node: n, path: "rotation" } });
      if (translated.has(n)) {
        const p = editor.addAccessor(pos.get(n) as number[], 5126, "VEC3", undefined);
        samplers.push({ input: timeAccessor, output: p, interpolation: "LINEAR" });
        channels.push({ sampler: samplers.length - 1, target: { node: n, path: "translation" } });
      }
    }
    outAnims.push({ ...(anim.name ? { name: anim.name } : {}), samplers, channels });
  }
  editor.json.animations = outAnims;
  void readAccessor;
  return { glb: editor.finish(), report: { moved, fallback, clips: outAnims.length } };
}

