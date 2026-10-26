/**
 * `assets repair-skin --rebuild-limbs`: rebuilds the legs of a humanoid athlete in the straight pose its skeleton assumes.
 *
 * Generalised from the Aura FC fix. A mesh modelled mid-stride (knee bent, thigh swung forward, thigh surface made of a few huge
 * triangles) but bound to a straight skeleton rotates the limbs about joints 10 to 20 cm off the limb, and the shorts and thighs tear
 * into shards. This removes the leg geometry from the skin, shorts and socks meshes, straightens the boots (least-height search),
 * and builds thigh and shin skin tubes, thigh shorts tubes, a pelvis skirt and ankle socks around the real bone axes with smooth
 * hip / knee / ankle weights. Absolute lengths scale with the rig (the FC rig's hip joint sits at 0.8996 m). Only opt in for a
 * recognised humanoid; anything else gets guidance from `repair-skin`.
 */
import { GlbEditor } from "./glbEdit.js";
import { findHumanoidLegs } from "./analysis.js";
import { buildHierarchy, forward, loadSkins, localPose, qalign, qmul, qrot, readAccessor, type GlbData, type Quat, type SkinInfo, type SkinnedPrimitive, type Vec3 } from "./gltf.js";

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): Vec3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const smooth = (a: number, b: number, x: number): number => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** FC reference proportions (metres at hip height 0.8996). */
const FC_HIP_JOINT_Y = 0.8996;
const FC = {
  ringSegments: 24, ringStep: 0.025, hipTop: 0.99, hipBlendBottom: 0.7, kneeHalf: 0.14, ankleTop: 0.31, ankleBottom: 0.15,
  hemY: 0.62, sockTop: 0.34, sockBottom: 0.09, skirtTop: 1.075, skirtBottom: 0.8, armCut: 0.97, bootTop: 0.45,
  thighHip: 0.084, thighKnee: 0.058, calf: 0.054, ankle: 0.034, shortsExtra: 0.014, skirtRz: 0.112, skirtRxExtra: 0.105
};

export interface RebuildLimbsOptions {
  /** Material-name patterns per role (default: skin /skin/, shorts /short/, socks /sock/, boots /dark|boot|shoe/). */
  readonly materials?: { readonly skin?: RegExp; readonly shorts?: RegExp; readonly socks?: RegExp; readonly boots?: RegExp };
  /** Name of the pelvis joint (default: /^(mixamorig:?)?hips$/i). */
  readonly hips?: RegExp;
}
export interface RebuildLimbsReport {
  readonly scale: number;
  readonly primitives: readonly { readonly material: string; readonly vertices: number; readonly triangles: number; readonly removedTriangles: number; readonly addedTriangles: number }[];
  readonly bootHeights: Readonly<Record<string, number>>;
}

export class RebuildLimbsUnsupported extends Error {}

type Weighted = [number, number][];
interface NewVert { p: Vec3; w: Weighted }

export function rebuildLimbs(glb: GlbData, options: RebuildLimbsOptions = {}): { glb: GlbData; report: RebuildLimbsReport } {
  const hierarchy = buildHierarchy(glb);
  const legs = findHumanoidLegs(hierarchy);
  if (!legs) throw new RebuildLimbsUnsupported("Not a recognised humanoid: --rebuild-limbs needs Left/Right UpperLeg (or UpLeg/Thigh), LowerLeg (or Leg/Shin/Calf) and Foot bones. Rebuild the limbs in your DCC tool, or regenerate/re-rig the model in the pose its skeleton assumes.");
  const skins = loadSkins(glb, hierarchy);
  const skin = skins[0];
  if (!skin) throw new RebuildLimbsUnsupported("No skinned mesh to rebuild.");
  const hipsPattern = options.hips ?? /^(mixamorig:?)?hips$/i;
  const hipsNode = hierarchy.names.findIndex((n) => hipsPattern.test(n));
  if (hipsNode < 0) throw new RebuildLimbsUnsupported("No pelvis bone matching /hips/ found; pass the pelvis joint name pattern.");
  const rest = forward(localPose(glb, null, 0, hierarchy), hierarchy);
  const [legL, legR] = legs as [typeof legs[number], typeof legs[number]];
  const hipY = (rest.pos[legL.up] as Vec3)[1];
  const s = hipY / FC_HIP_JOINT_Y;
  const o = Object.fromEntries(Object.entries(FC).map(([k, v]) => [k, k === "ringSegments" ? v : v * s])) as typeof FC;
  const roles = {
    skin: options.materials?.skin ?? /skin/i,
    shorts: options.materials?.shorts ?? /short/i,
    socks: options.materials?.socks ?? /sock/i,
    boots: options.materials?.boots ?? /dark|boot|shoe/i
  };
  const jointIndex = new Map(skin.joints.map((node, k) => [node, k]));
  const J = (node: number): number => {
    const k = jointIndex.get(node);
    if (k === undefined) throw new RebuildLimbsUnsupported(`Bone ${hierarchy.names[node]} is not a joint of the skin.`);
    return k;
  };
  const P = (node: number): Vec3 => rest.pos[node] as Vec3;
  const hipL = P(legL.up), hipR = P(legR.up), kneeL = P(legL.knee), footL = P(legL.foot);
  const midX = (hipL[0] + hipR[0]) / 2;
  const half = Math.abs(hipL[0] - hipR[0]) / 2;
  const axisX = { L: midX + half * 0.62, R: midX - half * 0.62 };
  const kneeY = kneeL[1];
  void footL;

  // descendant sets per leg, for "which side / is this vertex a leg or arm vertex"
  const descendants = (root: number): Set<number> => {
    const out = new Set<number>([root]);
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < hierarchy.parent.length; i += 1) {
        const p = hierarchy.parent[i] as number;
        if (p >= 0 && out.has(p) && !out.has(i)) { out.add(i); grew = true; }
      }
    }
    return out;
  };
  const legNodes = { L: descendants(legL.up), R: descendants(legR.up) };
  const isArmName = (node: number): boolean => /arm|hand|shoulder|clav|finger|thumb/i.test(hierarchy.names[node] ?? "");
  const nodeOfJoint = (j: number): number => skin.joints[j] as number;
  const dominant = (prim: SkinnedPrimitive, v: number): number => {
    let best = 0, joint = 0;
    const w = prim.weights[v] ?? [], jj = prim.joints[v] ?? [];
    for (let k = 0; k < 4; k += 1) if ((w[k] ?? 0) > best) { best = w[k] ?? 0; joint = jj[k] ?? 0; }
    return nodeOfJoint(joint);
  };
  const isLegNode = (n: number): boolean => legNodes.L.has(n) || legNodes.R.has(n);
  const sideOf = (n: number): "L" | "R" | null => (legNodes.L.has(n) ? "L" : legNodes.R.has(n) ? "R" : null);

  const prims = skin.primitives;
  const roleOf = (p: SkinnedPrimitive): keyof typeof roles | null => (roles.skin.test(p.materialName) ? "skin" : roles.shorts.test(p.materialName) ? "shorts" : roles.socks.test(p.materialName) ? "socks" : roles.boots.test(p.materialName) ? "boots" : null);
  if (!prims.some((p) => roleOf(p) === "skin")) throw new RebuildLimbsUnsupported(`No skin material matched ${roles.skin}; pass --material-map skin=<pattern>.`);

  // 1. straighten the boots
  const footFix: Record<string, { bootV: Set<number>; apply: (p: Vec3) => Vec3; spread: number }> = {};
  const bootPrim = prims.find((p) => roleOf(p) === "boots");
  if (bootPrim) {
    for (const side of ["L", "R"] as const) {
      const bootAll: number[] = [];
      for (let v = 0; v < bootPrim.pos.length; v += 1) {
        const n = dominant(bootPrim, v);
        if (sideOf(n) === side && (bootPrim.pos[v] as Vec3)[1] < o.bootTop) bootAll.push(v);
      }
      if (bootAll.length < 12) continue;
      const boot = bootAll.map((v) => bootPrim.pos[v] as Vec3);
      const cen = (pts: Vec3[]): Vec3 => mul(pts.reduce((a, p) => add(a, p), [0, 0, 0] as Vec3), 1 / pts.length);
      const bc = cen(boot);
      const M = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      for (const p of boot) { const q = sub(p, bc); for (let a = 0; a < 3; a += 1) for (let b = 0; b < 3; b += 1) M[a * 3 + b] = (M[a * 3 + b] as number) + (q[a] as number) * (q[b] as number); }
      let d: Vec3 = [0.1, 0.3, 0.9];
      for (let i = 0; i < 80; i += 1) d = unit([(M[0] as number) * d[0] + (M[1] as number) * d[1] + (M[2] as number) * d[2], (M[3] as number) * d[0] + (M[4] as number) * d[1] + (M[5] as number) * d[2], (M[6] as number) * d[0] + (M[7] as number) * d[1] + (M[8] as number) * d[2]]);
      if (d[2] < 0) d = mul(d, -1);
      let R: Quat = qalign(d, [0, 0, 1]);
      const spread = (q: Quat): number => { let lo = 1e9, hi = -1e9; for (const p of boot) { const y = qrot(q, sub(p, bc))[1]; lo = Math.min(lo, y); hi = Math.max(hi, y); } return hi - lo; };
      let best = spread(R), bestR = R;
      for (let pitch = -40; pitch <= 40; pitch += 4) for (let roll = -60; roll <= 60; roll += 4) {
        const qp: Quat = [Math.sin((pitch * Math.PI) / 360), 0, 0, Math.cos((pitch * Math.PI) / 360)];
        const qr: Quat = [0, 0, Math.sin((roll * Math.PI) / 360), Math.cos((roll * Math.PI) / 360)];
        const q = qmul(qp, qmul(qr, R));
        const h = spread(q);
        if (h < best - 1e-5) { best = h; bestR = q; }
      }
      R = bestR;
      const moved = boot.map((p) => qrot(R, sub(p, bc)));
      let minY = 1e9, minZ = 1e9, maxZ = -1e9;
      for (const p of moved) { minY = Math.min(minY, p[1]); minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2]); }
      const heel = moved.filter((p) => p[2] < minZ + (maxZ - minZ) * 0.33).sort((a, b) => b[1] - a[1]).slice(0, Math.max(10, Math.floor(moved.length * 0.03)));
      const ankle = cen(heel);
      const target: Vec3 = [axisX[side] - ankle[0], -minY, -ankle[2]];
      const frozenR = R;
      footFix[side] = { bootV: new Set(bootAll), apply: (p) => add(qrot(frozenR, sub(p, bc)), target), spread: best };
    }
  }

  // 2. new geometry
  const newVerts: Record<string, NewVert[]> = { skin: [], shorts: [], socks: [] };
  const newTris: Record<string, [number, number, number][]> = { skin: [], shorts: [], socks: [] };
  const wset = (pairs: Weighted): Weighted => {
    const top = pairs.filter(([, w]) => w > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = top.reduce((a, [, w]) => a + w, 0) || 1;
    return top.map(([j, w]) => [j, w / sum]);
  };
  interface Ring { y: number; cx: number; cz: number; rx: number; rz: number }
  const addTube = (target: string, rings: Ring[], weightsAt: (y: number) => Weighted): void => {
    const verts = newVerts[target] as NewVert[], tris = newTris[target] as [number, number, number][];
    const base = verts.length;
    const N = o.ringSegments;
    for (const r of rings) for (let k = 0; k < N; k += 1) {
      const a = (k / N) * Math.PI * 2;
      verts.push({ p: [r.cx + Math.cos(a) * r.rx, r.y, r.cz + Math.sin(a) * r.rz], w: wset(weightsAt(r.y)) });
    }
    for (let ri = 0; ri < rings.length - 1; ri += 1) for (let k = 0; k < N; k += 1) {
      const a = base + ri * N + k, b = base + ri * N + ((k + 1) % N), c = base + (ri + 1) * N + k, d = base + (ri + 1) * N + ((k + 1) % N);
      tris.push([a, b, c], [b, d, c]);
    }
  };
  const ringsFor = (fn: (y: number) => Omit<Ring, "y">, y0: number, y1: number): Ring[] => {
    const rings: Ring[] = [];
    const n = Math.max(2, Math.ceil(Math.abs(y1 - y0) / o.ringStep));
    for (let i = 0; i <= n; i += 1) { const y = y0 + ((y1 - y0) * i) / n; rings.push({ y, ...fn(y) }); }
    return rings;
  };
  const weightsLeg = (leg: typeof legL) => (y: number): Weighted => {
    const wHip = smooth(o.hipBlendBottom, o.hipTop, y) * 0.5;
    const kneeT = smooth(kneeY - o.kneeHalf, kneeY + o.kneeHalf, y);
    const ankleT = smooth(o.ankleBottom, o.ankleTop, y);
    const wUp = (1 - wHip) * kneeT;
    const wLow = (1 - wHip) * (1 - kneeT) * ankleT;
    const wFoot = (1 - wHip) * (1 - kneeT) * (1 - ankleT);
    return [[J(hipsNode), wHip], [J(leg.up), wUp], [J(leg.knee), wLow], [J(leg.foot), wFoot]];
  };
  const rSkin = (y: number): number => {
    if (y >= kneeY) { const t = (y - kneeY) / (o.hipTop - kneeY); return o.thighKnee + (o.thighHip - o.thighKnee) * Math.pow(t, 0.9); }
    const t = (y - o.ankleBottom) / (kneeY - o.ankleBottom);
    return o.ankle + (o.calf - o.ankle) * Math.pow(Math.max(0, t), 0.8) + 0.008 * s * Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.1) / 0.8)));
  };
  const rShorts = (y: number): number => rSkin(y) + o.shortsExtra + 0.006 * s * smooth(o.hemY + 0.06 * s, o.hemY, y);
  for (const side of ["L", "R"] as const) {
    const leg = side === "L" ? legL : legR;
    const x = axisX[side];
    addTube("skin", ringsFor((y) => ({ cx: x, cz: 0, rx: rSkin(y) * 0.96, rz: rSkin(y) * 1.06 }), o.hipTop, o.ankleBottom), weightsLeg(leg));
    addTube("shorts", ringsFor((y) => ({ cx: x, cz: 0, rx: rShorts(y) * 0.96, rz: rShorts(y) * 1.06 }), o.hipTop, o.hemY), weightsLeg(leg));
    addTube("socks", ringsFor((y) => ({ cx: x, cz: 0, rx: rSkin(Math.max(y, o.ankleBottom)) * 0.96 + 0.007 * s, rz: rSkin(Math.max(y, o.ankleBottom)) * 1.06 + 0.007 * s }), o.sockTop, o.sockBottom), weightsLeg(leg));
  }
  addTube("shorts", ringsFor(() => ({ cx: midX, cz: 0, rx: half * 0.62 + o.skirtRxExtra, rz: o.skirtRz }), o.skirtTop, o.skirtBottom), () => [[J(hipsNode), 1]]);

  // 3. rebuild each primitive
  const editor = new GlbEditor(glb);
  const report: { material: string; vertices: number; triangles: number; removedTriangles: number; addedTriangles: number }[] = [];
  for (const prim of prims) {
    const role = roleOf(prim);
    if (!role) continue;
    const primitive = editor.primitive(prim.meshIndex, prim.primitiveIndex);
    const dom = Array.from({ length: prim.pos.length }, (_, v) => dominant(prim, v));
    const keepTri: [number, number, number][] = [];
    const centroidY = (t: number): number => ((prim.pos[prim.indices[t] as number] as Vec3)[1] + (prim.pos[prim.indices[t + 1] as number] as Vec3)[1] + (prim.pos[prim.indices[t + 2] as number] as Vec3)[1]) / 3;
    for (let t = 0; t < prim.indices.length; t += 3) {
      const ids: [number, number, number] = [prim.indices[t] as number, prim.indices[t + 1] as number, prim.indices[t + 2] as number];
      let drop = false;
      if (role === "socks") drop = true;
      if (role === "skin" || role === "shorts") {
        const arm = ids.some((v) => isArmName(dom[v] as number));
        if (!arm && (role === "shorts" || centroidY(t) < o.armCut)) drop = true;
        if (role === "skin" && ids.every((v) => isLegNode(dom[v] as number))) drop = true;
      }
      if (!drop) keepTri.push(ids);
    }
    const positions: Vec3[] = role === "boots"
      ? prim.pos.map((p, v) => { for (const side of ["L", "R"]) { const f = footFix[side]; if (f?.bootV.has(v)) return f.apply(p); } return p; })
      : prim.pos;
    const remap = new Map<number, number>();
    const outP: Vec3[] = [], outJ: number[][] = [], outW: number[][] = [];
    const srcOf: number[] = [];
    const uvAccessor = editor.primitive(prim.meshIndex, prim.primitiveIndex).attributes.TEXCOORD_0;
    const uvRows = uvAccessor !== undefined ? readAccessor(glb, uvAccessor).rows : null;
    const useOld = (v: number): number => {
      let at = remap.get(v);
      if (at === undefined) {
        at = outP.length;
        remap.set(v, at);
        srcOf.push(v);
        outP.push(positions[v] as Vec3);
        const pairs: [number, number][] = [];
        for (let k = 0; k < 4; k += 1) if (((prim.weights[v] ?? [])[k] ?? 0) > 0) pairs.push([(prim.joints[v] as number[])[k] as number, (prim.weights[v] as number[])[k] as number]);
        outJ.push(pairs.map((q) => q[0])); outW.push(pairs.map((q) => q[1]));
      }
      return at;
    };
    const tris: [number, number, number][] = keepTri.map((ids) => ids.map(useOld) as [number, number, number]);
    const nv = newVerts[role];
    if (nv) {
      const base = outP.length;
      nv.forEach((v) => { srcOf.push(-1); outP.push(v.p); outJ.push(v.w.map((q) => q[0])); outW.push(v.w.map((q) => q[1])); });
      for (const t of newTris[role] as [number, number, number][]) tris.push([t[0] + base, t[1] + base, t[2] + base]);
    }
    const nV = outP.length;
    const nrm: Vec3[] = outP.map(() => [0, 0, 0] as Vec3);
    for (const [a, b, c] of tris) {
      const u = sub(outP[b] as Vec3, outP[a] as Vec3), w = sub(outP[c] as Vec3, outP[a] as Vec3);
      const fn: Vec3 = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      for (const v of [a, b, c]) { const n = nrm[v] as Vec3; n[0] += fn[0]; n[1] += fn[1]; n[2] += fn[2]; }
    }
    const flatJ: number[] = [], flatW: number[] = [], flatP: number[] = [], flatN: number[] = [];
    for (let v = 0; v < nV; v += 1) {
      for (let k = 0; k < 4; k += 1) { flatJ.push((outJ[v] as number[])[k] ?? 0); flatW.push((outW[v] as number[])[k] ?? 0); }
      flatP.push(...(outP[v] as Vec3));
      flatN.push(...unit(nrm[v] as Vec3));
    }
    primitive.attributes.POSITION = editor.addAccessor(flatP, 5126, "VEC3", 34962, true);
    primitive.attributes.NORMAL = editor.addAccessor(flatN, 5126, "VEC3", 34962);
    primitive.attributes.JOINTS_0 = editor.addAccessor(flatJ, 5123, "VEC4", 34962);
    primitive.attributes.WEIGHTS_0 = editor.addAccessor(flatW, 5126, "VEC4", 34962);
    // UVs follow the kept vertices (new tube vertices sample the middle of the map); other per-vertex attributes no longer match
    for (const key of Object.keys(primitive.attributes)) if (/^(TEXCOORD_[1-9]|COLOR|TANGENT)/.test(key)) delete primitive.attributes[key];
    if (uvRows) {
      const flatUv: number[] = [];
      for (let v = 0; v < nV; v += 1) { const src = srcOf[v] as number; const row = src >= 0 ? uvRows[src] : undefined; flatUv.push(row?.[0] ?? 0.5, row?.[1] ?? 0.5); }
      primitive.attributes.TEXCOORD_0 = editor.addAccessor(flatUv, 5126, "VEC2", 34962);
    }
    primitive.indices = editor.addAccessor(tris.flat(), 5125, "SCALAR", 34963);
    report.push({ material: prim.materialName, vertices: nV, triangles: tris.length, removedTriangles: prim.indices.length / 3 - keepTri.length, addedTriangles: (newTris[role] ?? []).length });
  }
  return { glb: editor.finish(), report: { scale: Math.round(s * 1000) / 1000, primitives: report, bootHeights: Object.fromEntries(Object.entries(footFix).map(([k, f]) => [k, Math.round(f.spread * 1000) / 1000])) } };
}

export type { SkinInfo };
