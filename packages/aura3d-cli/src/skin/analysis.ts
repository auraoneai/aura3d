/**
 * `assets validate --skin`: poses a rigged GLB through the clips it ships and reports the defects that tore the Aura FC athletes:
 * stretched triangles (the "sails" at the hips), thin long flaps, bad or distant skin weights, limb meshes that are not in the
 * pose the skeleton assumes (modelled mid-stride and bound to a straight skeleton) and joint ranges no limb can reach.
 */
import {
  buildHierarchy, clipDuration, forward, jointBindPositions, localPose, loadSkins, qconj, qmul, skinnedPositions, vdist, vdot, vlen, vsub,
  type GlbData, type GltfAnimation, type Hierarchy, type Quat, type SkinInfo, type SkinnedPrimitive, type Vec3, type WorldPose
} from "./gltf.js";

export const SKIN_STRETCH = "SKIN_STRETCH";
export const SKIN_FLAP = "SKIN_FLAP";
export const SKIN_WEIGHT_SUM = "SKIN_WEIGHT_SUM";
export const SKIN_WEIGHT_DISTANT = "SKIN_WEIGHT_DISTANT";
export const SKIN_BIND_MISMATCH = "SKIN_BIND_MISMATCH";
export const SKIN_JOINT_RANGE = "SKIN_JOINT_RANGE";
export const SKIN_NO_SKIN = "SKIN_NO_SKIN";
export type SkinCode = typeof SKIN_STRETCH | typeof SKIN_FLAP | typeof SKIN_WEIGHT_SUM | typeof SKIN_WEIGHT_DISTANT | typeof SKIN_BIND_MISMATCH | typeof SKIN_JOINT_RANGE | typeof SKIN_NO_SKIN;

export interface SkinThresholds {
  /** A triangle whose worst edge grows past this multiple of its rest length is counted (default 1.6). */
  readonly stretchLimit: number;
  /** A single triangle past this multiple always fails (default 2.5); between the two limits up to `stretchAllowTriangles` (or 0.1% of the triangles) only warn. */
  readonly stretchHardLimit: number;
  readonly stretchAllowTriangles: number;
  /** Longest-edge floor of a flap, as a fraction of the model height (default 0.14). */
  readonly flapEdgeFraction: number;
  /** Area / longest-edge^2 below which a triangle is "thin" (equilateral is 0.43; default 0.08). */
  readonly flapThin: number;
  /** A limb bone whose vertices sit this far off its axis, as a fraction of the bone length, is a bind mismatch (default 0.34). */
  readonly bindOffsetRatio: number;
  /** Vertices with total weight outside 1 +- this fail (default 0.02). */
  readonly weightSumTolerance: number;
  /** An influence >= `distantMinWeight` on a bone farther than this fraction of the model height is "distant" (default 0.5). */
  readonly distantFraction: number;
  readonly distantMinWeight: number;
  /** Humanoid joint ranges in degrees. */
  readonly hipFlexMin: number;
  readonly hipFlexMax: number;
  readonly hipAbductionMax: number;
  readonly kneeMax: number;
  readonly thighTwistMax: number;
}

export const DEFAULT_SKIN_THRESHOLDS: SkinThresholds = {
  stretchLimit: 1.6,
  stretchHardLimit: 2.5,
  stretchAllowTriangles: 2,
  flapEdgeFraction: 0.14,
  flapThin: 0.08,
  bindOffsetRatio: 0.34,
  weightSumTolerance: 0.02,
  distantFraction: 0.5,
  distantMinWeight: 0.15,
  hipFlexMin: -70,
  hipFlexMax: 120,
  hipAbductionMax: 75,
  kneeMax: 155,
  thighTwistMax: 60
};

export interface SkinAnalysisOptions {
  /** Clip names to pose (default: every animation in the file). */
  readonly clips?: readonly string[];
  /** Poses sampled per clip (default 10). */
  readonly samples?: number;
  readonly thresholds?: Partial<SkinThresholds>;
  /** Codes reported as warnings instead of failures (default: SKIN_BIND_MISMATCH and SKIN_WEIGHT_DISTANT; their effect shows up as SKIN_STRETCH). */
  readonly warnOnly?: readonly SkinCode[];
  /** Report every code as a failure. */
  readonly strict?: boolean;
  /** Skip the check for materials matching this pattern (e.g. a rigid prop sharing the skin). */
  readonly ignoreMaterials?: RegExp;
}

export interface SkinFinding {
  readonly code: SkinCode;
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly primitive?: string;
  readonly detail?: Record<string, unknown>;
}
export interface SkinPrimitiveReport {
  readonly mesh: number;
  readonly primitive: number;
  readonly material: string;
  readonly vertices: number;
  readonly triangles: number;
  readonly maxStretch: number;
  readonly trianglesOverLimit: number;
  readonly flaps: number;
  readonly maxFlapEdge: number;
  readonly weightSumBad: number;
  readonly weightDistant: number;
}
export interface SkinMaterialReport { readonly triangles: number; readonly maxStretch: number; readonly trianglesOverLimit: number; readonly flaps: number }
export interface BindMismatchBone { readonly bone: string; readonly vertices: number; readonly offset: number; readonly boneLength: number; readonly ratio: number }
export interface JointRangeRow { readonly hipFlexMin: number; readonly hipFlexMax: number; readonly hipAbductionMax: number; readonly kneeMax: number; readonly kneeForwardFrames: number; readonly thighTwistMax: number }
export interface SkinReport {
  readonly ok: boolean;
  readonly skinned: boolean;
  readonly modelHeight: number;
  readonly clips: readonly string[];
  readonly samplesPerClip: number;
  readonly thresholds: SkinThresholds;
  readonly skins: readonly { readonly index: number; readonly jointCount: number; readonly primitives: readonly SkinPrimitiveReport[] }[];
  readonly materials: Readonly<Record<string, SkinMaterialReport>>;
  readonly bindMismatch: readonly BindMismatchBone[];
  readonly jointRanges: Readonly<Record<string, JointRangeRow>> | null;
  readonly findings: readonly SkinFinding[];
  readonly failures: readonly string[];
  readonly warnings: readonly string[];
  readonly reasonCodes: readonly SkinCode[];
  readonly messages: readonly string[];
}

const DEG = 180 / Math.PI;
/** Trunk and root bones: their vertex cloud is wide and not a limb, so the axis-offset test does not apply. */
const TRUNK_BONE = /spine|chest|hips|pelvis|neck|head|shoulder|clavicle|root|armature|jaw|eye|tongue|hair|breast|skirt|cape|tail/i;
const round = (n: number, d = 3): number => Math.round(n * 10 ** d) / 10 ** d;

function triArea(a: Vec3, b: Vec3, c: Vec3): number {
  const u = vsub(b, a), v = vsub(c, a);
  return 0.5 * Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
}

/** Worst posed/rest edge stretch of every triangle over the sampled poses, per primitive, plus thin-flap data. */
export function samplePoses(glb: GlbData, hierarchy: Hierarchy, clips: readonly GltfAnimation[], samples: number): { poses: WorldPose[]; clipOfPose: string[] } {
  const poses: WorldPose[] = [];
  const clipOfPose: string[] = [];
  for (const anim of clips) {
    const dur = clipDuration(glb, anim);
    for (let s = 0; s < samples; s += 1) {
      poses.push(forward(localPose(glb, anim, (dur * s) / samples, hierarchy), hierarchy));
      clipOfPose.push(anim.name ?? "clip");
    }
  }
  return { poses, clipOfPose };
}

export function triangleStretch(skin: SkinInfo, prim: SkinnedPrimitive, poses: readonly WorldPose[], flapEdge: number, flapThin: number, flapOutlier = 2.5): { worst: Float32Array; flap: Uint8Array; flapEdgeMax: number } {
  const nTri = Math.floor(prim.indices.length / 3);
  const worst = new Float32Array(nTri);
  const flap = new Uint8Array(nTri);
  let flapEdgeMax = 0;
  const rest = prim.pos;
  const restLen = (a: number, b: number): number => Math.max(vdist(rest[a] as Vec3, rest[b] as Vec3), 0.004);
  const restEdges: number[][] = [];
  for (let t = 0; t < nTri; t += 1) {
    const a = prim.indices[t * 3] ?? 0, b = prim.indices[t * 3 + 1] ?? 0, c = prim.indices[t * 3 + 2] ?? 0;
    restEdges.push([restLen(a, b), restLen(b, c), restLen(c, a)]);
  }
  // A flap is a thin triangle much longer than the mesh's normal triangles (long thin strips that tile a sleeve or trouser leg are not).
  const sortedEdges = restEdges.map((e) => Math.max(...e)).sort((a, b) => a - b);
  const p95 = sortedEdges[Math.floor(sortedEdges.length * 0.95)] ?? 0;
  const flapFloor = Math.max(flapEdge, flapOutlier * p95);
  for (const pose of poses) {
    const out = skinnedPositions(skin, prim, pose);
    for (let t = 0; t < nTri; t += 1) {
      const a = prim.indices[t * 3] ?? 0, b = prim.indices[t * 3 + 1] ?? 0, c = prim.indices[t * 3 + 2] ?? 0;
      const pa = out[a] as Vec3, pb = out[b] as Vec3, pc = out[c] as Vec3;
      const e0 = vdist(pa, pb), e1 = vdist(pb, pc), e2 = vdist(pc, pa);
      const re = restEdges[t] as number[];
      const r = Math.max(e0 / (re[0] as number), e1 / (re[1] as number), e2 / (re[2] as number));
      if (r > (worst[t] as number)) worst[t] = r;
      const longest = Math.max(e0, e1, e2);
      if (longest > flapFloor && triArea(pa, pb, pc) / (longest * longest) < flapThin) {
        flap[t] = 1;
        if (longest > flapEdgeMax) flapEdgeMax = longest;
      }
    }
  }
  return { worst, flap, flapEdgeMax };
}

function modelHeight(skins: readonly SkinInfo[]): number {
  let lo = Infinity, hi = -Infinity;
  for (const skin of skins) for (const prim of skin.primitives) for (const p of prim.pos) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); }
  return Number.isFinite(lo) && hi > lo ? hi - lo : 1;
}

function dominantJoint(prim: SkinnedPrimitive, v: number): { joint: number; weight: number } {
  let best = 0, joint = 0;
  const w = prim.weights[v] ?? [], j = prim.joints[v] ?? [];
  for (let k = 0; k < 4; k += 1) if ((w[k] ?? 0) > best) { best = w[k] ?? 0; joint = j[k] ?? 0; }
  return { joint, weight: best };
}

/** Distance from a point to a segment. */
function segmentDistance(p: Vec3, a: Vec3, b: Vec3): number {
  const ab = vsub(b, a);
  const l2 = vdot(ab, ab);
  if (l2 < 1e-12) return vdist(p, a);
  const t = Math.max(0, Math.min(1, vdot(vsub(p, a), ab) / l2));
  return vdist(p, [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t]);
}

const LEG_NAMES: { up: RegExp; low: RegExp; foot: RegExp }[] = [
  { up: /^(mixamorig:?)?left(upper)?(up)?(leg|thigh)$/i, low: /^(mixamorig:?)?left(lower)?(leg|shin|calf)$/i, foot: /^(mixamorig:?)?left(foot|ankle)$/i },
  { up: /^(mixamorig:?)?right(upper)?(up)?(leg|thigh)$/i, low: /^(mixamorig:?)?right(lower)?(leg|shin|calf)$/i, foot: /^(mixamorig:?)?right(foot|ankle)$/i }
];

export interface HumanoidLegs { readonly up: number; readonly knee: number; readonly foot: number }
/** Recognises Meshy/Mixamo/VRM-style leg bone names; returns null when the rig is not a recognised humanoid. */
export function findHumanoidLegs(hierarchy: Hierarchy): HumanoidLegs[] | null {
  const legs: HumanoidLegs[] = [];
  for (const spec of LEG_NAMES) {
    const names = hierarchy.names;
    const up = names.findIndex((n) => spec.up.test(n) && /up|thigh/i.test(n));
    const foot = names.findIndex((n) => spec.foot.test(n));
    if (up < 0 || foot < 0) return null;
    let knee = -1;
    for (let i = 0; i < names.length; i += 1) {
      if (!spec.low.test(names[i] as string) || i === up) continue;
      if (hierarchy.parent[i] === up) { knee = i; break; }
    }
    if (knee < 0) return null;
    legs.push({ up, knee, foot });
  }
  return legs;
}

function legAngles(pose: WorldPose, rest: WorldPose, leg: HumanoidLegs): { flex: number; abd: number; knee: number; kneeForward: boolean; twist: number } {
  const unit = (a: Vec3): Vec3 => { const l = vlen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const thigh = unit(vsub(pose.pos[leg.knee] as Vec3, pose.pos[leg.up] as Vec3));
  const shin = unit(vsub(pose.pos[leg.foot] as Vec3, pose.pos[leg.knee] as Vec3));
  const rThigh = unit(vsub(rest.pos[leg.knee] as Vec3, rest.pos[leg.up] as Vec3));
  const flex = (Math.atan2(thigh[2], -thigh[1]) - Math.atan2(rThigh[2], -rThigh[1])) * DEG;
  const abd = (Math.atan2(thigh[0], -thigh[1]) - Math.atan2(rThigh[0], -rThigh[1])) * DEG;
  const knee = Math.acos(Math.max(-1, Math.min(1, vdot(thigh, shin)))) * DEG;
  const shinBack = Math.atan2(shin[2], -shin[1]) - Math.atan2(thigh[2], -thigh[1]);
  const quat = (m: number[]): Quat => {
    const sx = Math.hypot(m[0] ?? 0, m[1] ?? 0, m[2] ?? 0) || 1, sy = Math.hypot(m[4] ?? 0, m[5] ?? 0, m[6] ?? 0) || 1, sz = Math.hypot(m[8] ?? 0, m[9] ?? 0, m[10] ?? 0) || 1;
    const r00 = (m[0] ?? 0) / sx, r10 = (m[1] ?? 0) / sx, r20 = (m[2] ?? 0) / sx, r01 = (m[4] ?? 0) / sy, r11 = (m[5] ?? 0) / sy, r21 = (m[6] ?? 0) / sy, r02 = (m[8] ?? 0) / sz, r12 = (m[9] ?? 0) / sz, r22 = (m[10] ?? 0) / sz;
    const tr = r00 + r11 + r22;
    if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; return [(r21 - r12) / s, (r02 - r20) / s, (r10 - r01) / s, 0.25 * s]; }
    if (r00 > r11 && r00 > r22) { const s = Math.sqrt(1 + r00 - r11 - r22) * 2; return [0.25 * s, (r01 + r10) / s, (r02 + r20) / s, (r21 - r12) / s]; }
    if (r11 > r22) { const s = Math.sqrt(1 + r11 - r00 - r22) * 2; return [(r01 + r10) / s, 0.25 * s, (r12 + r21) / s, (r02 - r20) / s]; }
    const s = Math.sqrt(1 + r22 - r00 - r11) * 2;
    return [(r02 + r20) / s, (r12 + r21) / s, 0.25 * s, (r10 - r01) / s];
  };
  const delta = qmul(quat(pose.world[leg.up] as number[]), qconj(quat(rest.world[leg.up] as number[])));
  const s = vdot([delta[0], delta[1], delta[2]], rThigh);
  let twist = 2 * Math.atan2(s, delta[3]) * DEG;
  if (twist > 180) twist -= 360;
  if (twist < -180) twist += 360;
  return { flex, abd, knee, kneeForward: shinBack > 1e-3 && knee > 3, twist };
}

/** Hip/knee/twist ranges of the humanoid legs per clip (degrees); null when the rig is not a recognised humanoid. */
export function jointRanges(glb: GlbData, hierarchy: Hierarchy, clips: readonly GltfAnimation[], samples = 24): Record<string, JointRangeRow> | null {
  const legs = findHumanoidLegs(hierarchy);
  if (!legs) return null;
  const rest = forward(localPose(glb, null, 0, hierarchy), hierarchy);
  const out: Record<string, JointRangeRow> = {};
  for (const anim of clips) {
    const dur = clipDuration(glb, anim);
    const acc = { hipFlexMin: Infinity, hipFlexMax: -Infinity, hipAbductionMax: 0, kneeMax: 0, kneeForwardFrames: 0, thighTwistMax: 0 };
    for (let s = 0; s < samples; s += 1) {
      const pose = forward(localPose(glb, anim, (dur * s) / samples, hierarchy), hierarchy);
      for (const leg of legs) {
        const a = legAngles(pose, rest, leg);
        acc.hipFlexMin = Math.min(acc.hipFlexMin, a.flex);
        acc.hipFlexMax = Math.max(acc.hipFlexMax, a.flex);
        acc.hipAbductionMax = Math.max(acc.hipAbductionMax, Math.abs(a.abd));
        acc.kneeMax = Math.max(acc.kneeMax, a.knee);
        if (a.kneeForward) acc.kneeForwardFrames += 1;
        acc.thighTwistMax = Math.max(acc.thighTwistMax, Math.abs(a.twist));
      }
    }
    out[anim.name ?? "clip"] = {
      hipFlexMin: round(Number.isFinite(acc.hipFlexMin) ? acc.hipFlexMin : 0, 1), hipFlexMax: round(Number.isFinite(acc.hipFlexMax) ? acc.hipFlexMax : 0, 1),
      hipAbductionMax: round(acc.hipAbductionMax, 1), kneeMax: round(acc.kneeMax, 1), kneeForwardFrames: acc.kneeForwardFrames, thighTwistMax: round(acc.thighTwistMax, 1)
    };
  }
  return out;
}

/** Per bone: how far the centroid of the vertices it dominates sits from the bone's axis, relative to the bone length (bind pose). */
export function bindMismatch(skins: readonly SkinInfo[], hierarchy: Hierarchy, height: number, ratioLimit: number): BindMismatchBone[] {
  const flagged: BindMismatchBone[] = [];
  for (const skin of skins) {
    const bindPos = jointBindPositions(skin);
    const sums = new Map<number, { sum: Vec3; n: number }>();
    for (const prim of skin.primitives) {
      for (let v = 0; v < prim.pos.length; v += 1) {
        const d = dominantJoint(prim, v);
        if (d.weight < 0.6) continue;
        const p = prim.pos[v] as Vec3;
        const entry = sums.get(d.joint) ?? { sum: [0, 0, 0] as Vec3, n: 0 };
        entry.sum[0] += p[0]; entry.sum[1] += p[1]; entry.sum[2] += p[2]; entry.n += 1;
        sums.set(d.joint, entry);
      }
    }
    for (const [jointIndex, { sum, n }] of sums) {
      if (n < 25) continue;
      const node = skin.joints[jointIndex];
      if (node === undefined) continue;
      const childIndex = skin.joints.findIndex((c) => hierarchy.parent[c] === node);
      if (childIndex < 0) continue;
      const a = bindPos[jointIndex] as Vec3, b = bindPos[childIndex] as Vec3;
      const length = vdist(a, b);
      if (length < 0.06 * height) continue;
      if (TRUNK_BONE.test(hierarchy.names[node] ?? "")) continue;
      const centroid: Vec3 = [sum[0] / n, sum[1] / n, sum[2] / n];
      const offset = segmentDistance(centroid, a, b);
      const ratio = offset / length;
      if (ratio > ratioLimit) flagged.push({ bone: hierarchy.names[node] ?? `joint${node}`, vertices: n, offset: round(offset), boneLength: round(length), ratio: round(ratio, 2) });
    }
  }
  return flagged;
}

export function analyzeSkin(glb: GlbData, options: SkinAnalysisOptions = {}): SkinReport {
  const thresholds: SkinThresholds = { ...DEFAULT_SKIN_THRESHOLDS, ...options.thresholds };
  const hierarchy = buildHierarchy(glb);
  const allSkins = loadSkins(glb, hierarchy);
  const warnOnly = new Set<SkinCode>(options.strict ? [] : options.warnOnly ?? [SKIN_BIND_MISMATCH, SKIN_WEIGHT_DISTANT]);
  const findings: SkinFinding[] = [];
  const push = (code: SkinCode, message: string, primitive?: string, detail?: Record<string, unknown>): void => {
    findings.push({ code, severity: warnOnly.has(code) ? "warning" : "error", message, ...(primitive ? { primitive } : {}), ...(detail ? { detail } : {}) });
  };
  const skins = allSkins.map((s) => ({ ...s, primitives: s.primitives.filter((p) => !(options.ignoreMaterials?.test(p.materialName))) }));
  const animations = glb.json.animations ?? [];
  const clips = options.clips ? animations.filter((a) => options.clips?.includes(a.name ?? "")) : animations;
  const samples = Math.max(2, options.samples ?? 10);
  const base = { thresholds, samplesPerClip: samples };
  if (skins.length === 0 || skins.every((s) => s.primitives.length === 0)) {
    return {
      ok: true, skinned: false, modelHeight: 0, clips: [], ...base, skins: [], materials: {}, bindMismatch: [], jointRanges: null, findings: [], failures: [], warnings: [],
      reasonCodes: [], messages: ["No skinned mesh: skin check not applicable."]
    };
  }
  const height = modelHeight(skins);
  const flapEdge = thresholds.flapEdgeFraction * height;
  const restPose = forward(localPose(glb, null, 0, hierarchy), hierarchy);
  const bindPositions = new Map(skins.map((s) => [s.index, jointBindPositions(s)]));
  const { poses } = samplePoses(glb, hierarchy, clips, samples);
  const evalPoses = poses.length > 0 ? poses : [restPose];
  const skinReports: { index: number; jointCount: number; primitives: SkinPrimitiveReport[] }[] = [];
  const materials: Record<string, { triangles: number; maxStretch: number; trianglesOverLimit: number; flaps: number }> = {};
  for (const skin of skins) {
    const primReports: SkinPrimitiveReport[] = [];
    for (const prim of skin.primitives) {
      const label = `${prim.materialName} (mesh ${prim.meshIndex} prim ${prim.primitiveIndex})`;
      const { worst, flap, flapEdgeMax } = triangleStretch(skin, prim, evalPoses, flapEdge, thresholds.flapThin);
      let maxStretch = 0, over = 0, flaps = 0;
      for (let t = 0; t < worst.length; t += 1) {
        const w = worst[t] as number;
        if (w > maxStretch) maxStretch = w;
        if (w > thresholds.stretchLimit) over += 1;
        if (flap[t]) flaps += 1;
      }
      // weights
      let weightSumBad = 0, weightDistant = 0;
      const distantLimit = thresholds.distantFraction * height;
      const jointCount = skin.joints.length;
      for (let v = 0; v < prim.pos.length; v += 1) {
        const w = prim.weights[v] ?? [], j = prim.joints[v] ?? [];
        const sum = w.reduce((a, b) => a + b, 0);
        let badIndex = false;
        for (let k = 0; k < 4; k += 1) if ((w[k] ?? 0) > 0 && (j[k] ?? 0) >= jointCount) badIndex = true;
        if (!Number.isFinite(sum) || Math.abs(sum - 1) > thresholds.weightSumTolerance || badIndex) weightSumBad += 1;
        for (let k = 0; k < 4; k += 1) {
          if ((w[k] ?? 0) < thresholds.distantMinWeight) continue;
          const at = (bindPositions.get(skin.index) ?? [])[j[k] ?? 0];
          if (!at) continue;
          if (vdist(prim.pos[v] as Vec3, at) > distantLimit) { weightDistant += 1; break; }
        }
      }
      primReports.push({
        mesh: prim.meshIndex, primitive: prim.primitiveIndex, material: prim.materialName, vertices: prim.pos.length, triangles: worst.length,
        maxStretch: round(maxStretch, 2), trianglesOverLimit: over, flaps, maxFlapEdge: round(flapEdgeMax), weightSumBad, weightDistant
      });
      const m = materials[prim.materialName] ?? { triangles: 0, maxStretch: 0, trianglesOverLimit: 0, flaps: 0 };
      m.triangles += worst.length; m.maxStretch = Math.max(m.maxStretch, round(maxStretch, 2)); m.trianglesOverLimit += over; m.flaps += flaps;
      materials[prim.materialName] = m;
      const allowed = Math.max(thresholds.stretchAllowTriangles, Math.floor(worst.length * 0.001));
      if (over > 0 && (maxStretch > thresholds.stretchHardLimit || over > allowed)) push(SKIN_STRETCH, `${label}: ${over} of ${worst.length} triangles stretch past ${thresholds.stretchLimit}x their rest edges (worst ${round(maxStretch, 2)}x) in the played clips (${SKIN_STRETCH}). Bridging triangles between parts that move independently, or a mesh bound in a different pose than its skeleton. Run assets repair-skin.`, label, { triangles: over, worst: round(maxStretch, 2) });
      if (over > 0 && !(maxStretch > thresholds.stretchHardLimit || over > allowed)) findings.push({ code: SKIN_STRETCH, severity: "warning", message: `${label}: ${over} triangle(s) stretch past ${thresholds.stretchLimit}x (worst ${round(maxStretch, 2)}x), within the allowance of ${allowed} (${SKIN_STRETCH}).`, primitive: label });
      if (flaps > 0) push(SKIN_FLAP, `${label}: ${flaps} thin triangle(s) with a posed edge up to ${round(flapEdgeMax)} m (> ${round(flapEdge)} m): they draw as shards or sails once a limb swings (${SKIN_FLAP}).`, label, { flaps, longestEdge: round(flapEdgeMax) });
      if (weightSumBad > 0) push(SKIN_WEIGHT_SUM, `${label}: ${weightSumBad} vertices have skin weights that do not sum to 1 (+-${thresholds.weightSumTolerance}) or point past the joint list (${SKIN_WEIGHT_SUM}). assets repair-skin --normalize fixes it.`, label, { vertices: weightSumBad });
      if (weightDistant > 0) push(SKIN_WEIGHT_DISTANT, `${label}: ${weightDistant} vertices are influenced (>= ${thresholds.distantMinWeight}) by a bone farther than ${round(distantLimit)} m (${SKIN_WEIGHT_DISTANT}). assets repair-skin --prune-distant removes those influences.`, label, { vertices: weightDistant });
    }
    skinReports.push({ index: skin.index, jointCount: skin.joints.length, primitives: primReports });
  }
  const mismatch = bindMismatch(skins, hierarchy, height, thresholds.bindOffsetRatio);
  if (mismatch.length > 0) {
    push(SKIN_BIND_MISMATCH, `${mismatch.length} bone(s) are not inside the mesh they move: ${mismatch.slice(0, 4).map((b) => `${b.bone} (vertices ${b.offset} m off a ${b.boneLength} m bone)`).join(", ")} (${SKIN_BIND_MISMATCH}). The mesh was modelled in a different pose than the skeleton assumes (typically mid-stride), so every clip rotates the limbs about joints off the limb. Rebuild the limbs in the skeleton's pose (assets repair-skin --rebuild-limbs) or re-rig.`, undefined, { bones: mismatch });
  }
  const ranges = jointRanges(glb, hierarchy, clips);
  if (ranges) {
    for (const [clip, r] of Object.entries(ranges)) {
      const bad: string[] = [];
      if (r.hipFlexMin < thresholds.hipFlexMin || r.hipFlexMax > thresholds.hipFlexMax) bad.push(`hip flexion ${r.hipFlexMin}..${r.hipFlexMax} deg`);
      if (r.hipAbductionMax > thresholds.hipAbductionMax) bad.push(`hip abduction ${r.hipAbductionMax} deg`);
      if (r.kneeMax > thresholds.kneeMax) bad.push(`knee flexion ${r.kneeMax} deg`);
      if (r.kneeForwardFrames > 0) bad.push(`knee bends forward in ${r.kneeForwardFrames} sampled frames`);
      if (r.thighTwistMax > thresholds.thighTwistMax) bad.push(`thigh twist ${r.thighTwistMax} deg`);
      if (bad.length > 0) push(SKIN_JOINT_RANGE, `clip "${clip}": ${bad.join("; ")} (${SKIN_JOINT_RANGE}).`, undefined, { clip, ...r });
    }
  }
  const failures = findings.filter((f) => f.severity === "error").map((f) => f.message);
  const warnings = findings.filter((f) => f.severity === "warning").map((f) => f.message);
  const ok = failures.length === 0;
  const worstMaterial = Object.entries(materials).sort((a, b) => b[1].maxStretch - a[1].maxStretch)[0];
  return {
    ok, skinned: true, modelHeight: round(height), clips: clips.map((c) => c.name ?? "clip"), ...base,
    skins: skinReports, materials, bindMismatch: mismatch, jointRanges: ranges, findings, failures, warnings,
    reasonCodes: [...new Set(findings.map((f) => f.code))],
    messages: ok
      ? [`Skin check passed: ${skinReports.reduce((n, s) => n + s.primitives.reduce((m, p) => m + p.triangles, 0), 0)} triangles over ${clips.length} clip(s); worst stretch ${worstMaterial ? `${worstMaterial[1].maxStretch}x (${worstMaterial[0]})` : "n/a"}.`]
      : failures
  };
}
