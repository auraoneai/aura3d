// Rebuilds the lower body of a Meshy athlete GLB in the straight pose the skeleton and every clip assume.
// The Meshy mesh is modelled mid-stride (knee bent, thigh swung forward, thigh surface made of a few huge triangles) and bound
// to a straight skeleton, so clips rotate the legs about joints 10 to 20 cm from the limbs. This removes the leg geometry from the
// skin and shorts meshes, straightens the boots and socks, and builds new thigh/shin tubes (skin), thigh tubes and a pelvis skirt
// (shorts) around the real bone axes with smooth weights (Hips -> thigh -> shin -> foot).
//   node tools/aura-fc/rebuild-legs.mjs <in.glb> <out.glb>
import { readGlb, writeGlb, localPose, forward, qalign, qmul, qrot } from "./glb.mjs";
import { loadSkinnedMesh } from "./skin.mjs";
import { compact } from "./bridge-cut.mjs";

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const OPTS = {
  ringSegments: 24,
  ringStep: 0.025,
  hipTop: 0.99,        // top of the leg tubes, inside the waistband
  hipBlendBottom: 0.7,  // below this the thigh follows only its own bone
  kneeHalf: 0.14,
  ankleTop: 0.31,
  ankleBottom: 0.15,
  hemY: 0.62,
  sockTop: 0.34,
  sockBottom: 0.09,
  skirtTop: 1.075,
  skirtBottom: 0.8
};

export function rebuildLegs(glb, opts = {}) {
  const o = { ...OPTS, ...opts };
  const rest = forward(glb, localPose(glb, null, 0));
  const skinJoints = glb.json.skins[0].joints;
  const nodeName = (j) => rest.names[j];
  const jointIndex = new Map(skinJoints.map((j, i) => [nodeName(j), i]));
  const JI = (n) => jointIndex.get(n);
  const P = (n) => rest.pos[rest.id(n)];
  const hipL = P("LeftUpperLeg"), hipR = P("RightUpperLeg"), kneeL = P("LeftLowerLeg"), kneeR = P("RightLowerLeg"), footL = P("LeftFoot"), footR = P("RightFoot");
  const midX = (hipL[0] + hipR[0]) / 2;
  const half = Math.abs(hipL[0] - hipR[0]) / 2;       // hip half span from the bones
  const axisX = { L: midX + half * 0.62, R: midX - half * 0.62 };
  const legName = { L: ["LeftUpperLeg", "LeftLowerLeg", "LeftFoot"], R: ["RightUpperLeg", "RightLowerLeg", "RightFoot"] };
  const kneeY = kneeL[1];
  const footY = footL[1];

  const prims = glb.json.meshes[0].primitives;
  const matName = (i) => glb.json.materials[prims[i].material]?.name?.split("-").pop();
  const meshes = prims.map((_, i) => loadSkinnedMesh(glb, i));
  const byMat = Object.fromEntries(prims.map((_, i) => [matName(i), i]));
  const domName = (m, v) => { let b = 0, bj = 0; for (let k = 0; k < 4; k++) if (m.weights[v][k] > b) { b = m.weights[v][k]; bj = m.joints[v][k]; } return m.jointNames[bj]; };
  const isArm = (n) => /Arm|Forearm/.test(n);
  const isLeg = (n) => /Leg|Foot/.test(n);

  // ---- 1. straighten the boots: the dark mesh's foot points, flattened and placed under the shin axis ----
  const footFix = {};
  for (const side of ["L", "R"]) {
    const sideOf = (n) => (n.startsWith("Left") ? "L" : n.startsWith("Right") ? "R" : null);
    const m = meshes[byMat.dark];
    const bootAll = [];
    for (let v = 0; v < m.pos.length; v++) { const n = domName(m, v); if (sideOf(n) === side && /Leg|Foot/.test(n) && m.pos[v][1] < 0.45) bootAll.push(v); }
    const boot = bootAll.map((v) => m.pos[v]);
    const cen = (pts) => mul(pts.reduce((a, p) => add(a, p), [0, 0, 0]), 1 / pts.length);
    const bc = cen(boot);
    const Mx = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (const p of boot) { const q = sub(p, bc); for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) Mx[a * 3 + b] += q[a] * q[b]; }
    let d = [0.1, 0.3, 0.9];
    for (let i = 0; i < 80; i++) d = unit([Mx[0] * d[0] + Mx[1] * d[1] + Mx[2] * d[2], Mx[3] * d[0] + Mx[4] * d[1] + Mx[5] * d[2], Mx[6] * d[0] + Mx[7] * d[1] + Mx[8] * d[2]]);
    // toe direction: the end of the boot that is wider/lower is the toe; fall back to forward (+z)
    if (d[2] < 0) d = mul(d, -1);
    let R = qalign(d, [0, 0, 1]);
    const spread = (q) => { let lo = 1e9, hi = -1e9; for (const p of boot) { const y = qrot(q, sub(p, bc))[1]; lo = Math.min(lo, y); hi = Math.max(hi, y); } return hi - lo; };
    let best = spread(R), bestR = R;
    for (let pitch = -40; pitch <= 40; pitch += 4) for (let roll = -60; roll <= 60; roll += 4) {
      const qp = [Math.sin((pitch * Math.PI) / 360), 0, 0, Math.cos((pitch * Math.PI) / 360)];
      const qr = [0, 0, Math.sin((roll * Math.PI) / 360), Math.cos((roll * Math.PI) / 360)];
      const q = qmul(qp, qmul(qr, R));
      const h = spread(q);
      if (h < best - 1e-5) { best = h; bestR = q; }
    }
    R = bestR;
    const moved = boot.map((p) => qrot(R, sub(p, bc)));
    let minY = 1e9, minZ = 1e9, maxZ = -1e9; for (const p of moved) { minY = Math.min(minY, p[1]); minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2]); }
    // ankle opening: the top points of the rear third of the boot
    const heel = moved.filter((p) => p[2] < minZ + (maxZ - minZ) * 0.33).sort((a, b) => b[1] - a[1]).slice(0, Math.max(10, Math.floor(moved.length * 0.03)));
    const ankle = cen(heel);
    const target = [axisX[side] - ankle[0], -minY, -ankle[2]];
    footFix[side] = { bootV: new Set(bootAll), apply: (p) => add(qrot(R, sub(p, bc)), target), spread: best, ankleLocal: ankle };
  }

  // ---- 2. new geometry builders ----
  const newVerts = { skin: [], shorts: [], socks: [] };
  const newTris = { skin: [], shorts: [], socks: [] };
  const wset = (pairs) => {
    const top = pairs.filter(([, w]) => w > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const s = top.reduce((a, [, w]) => a + w, 0) || 1;
    return top.map(([j, w]) => [j, w / s]);
  };
  const addTube = (target, rings, weightsAt) => {
    const verts = newVerts[target], tris = newTris[target];
    const base = verts.length;
    const N = o.ringSegments;
    rings.forEach((r, ri) => {
      for (let k = 0; k < N; k++) {
        const a = (k / N) * Math.PI * 2;
        verts.push({ p: [r.cx + Math.cos(a) * r.rx, r.y, r.cz + Math.sin(a) * r.rz], w: wset(weightsAt(r.y)) });
      }
    });
    for (let ri = 0; ri < rings.length - 1; ri++) for (let k = 0; k < N; k++) {
      const a = base + ri * N + k, b = base + ri * N + ((k + 1) % N), c = base + (ri + 1) * N + k, d = base + (ri + 1) * N + ((k + 1) % N);
      tris.push([a, b, c], [b, d, c]);
    }
  };
  const ringsFor = (fn, y0, y1) => { const rings = []; const n = Math.max(2, Math.ceil(Math.abs(y1 - y0) / o.ringStep)); for (let i = 0; i <= n; i++) { const y = y0 + ((y1 - y0) * i) / n; rings.push({ y, ...fn(y) }); } return rings; };

  const weightsLeg = (side) => (y) => {
    const [up, low, foot] = legName[side].map(JI);
    const hips = JI("Hips");
    const wHip = smooth(o.hipBlendBottom, o.hipTop, y) * 0.5;            // 0 at the hem region, 0.5 inside the waistband
    const kneeT = smooth(kneeY - o.kneeHalf, kneeY + o.kneeHalf, y);     // 1 above the knee zone, 0 below
    const ankleT = smooth(o.ankleBottom, o.ankleTop, y);                 // 1 above the ankle zone
    const wUp = (1 - wHip) * kneeT;
    const wLow = (1 - wHip) * (1 - kneeT) * ankleT + 0;
    const wFoot = (1 - wHip) * (1 - kneeT) * (1 - ankleT);
    return [[hips, wHip], [up, wUp], [low, wLow], [foot, wFoot]];
  };
  // radius profiles (metres): thigh 0.082 at the hip tapering to 0.058 at the knee, calf 0.05 then 0.034 at the ankle
  const rSkin = (y) => {
    if (y >= kneeY) { const t = (y - kneeY) / (o.hipTop - kneeY); return 0.058 + (0.084 - 0.058) * Math.pow(t, 0.9); }
    const t = (y - o.ankleBottom) / (kneeY - o.ankleBottom);
    return 0.034 + (0.054 - 0.034) * Math.pow(Math.max(0, t), 0.8) + 0.008 * Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.1) / 0.8)));
  };
  const rShorts = (y) => rSkin(y) + 0.014 + 0.006 * smooth(o.hemY + 0.06, o.hemY, y);
  const cz = 0.0;
  for (const side of ["L", "R"]) {
    const x = axisX[side];
    addTube("skin", ringsFor((y) => ({ cx: x, cz, rx: rSkin(y) * 0.96, rz: rSkin(y) * 1.06 }), o.hipTop, o.ankleBottom), weightsLeg(side));
    addTube("shorts", ringsFor((y) => ({ cx: x, cz, rx: rShorts(y) * 0.96, rz: rShorts(y) * 1.06 }), o.hipTop, o.hemY), weightsLeg(side));
    addTube("socks", ringsFor((y) => ({ cx: x, cz, rx: rSkin(Math.max(y, o.ankleBottom)) * 0.96 + 0.007, rz: rSkin(Math.max(y, o.ankleBottom)) * 1.06 + 0.007 }), o.sockTop, o.sockBottom), weightsLeg(side));
  }
  // pelvis skirt: one elliptical tube round both thighs, weighted to the Hips
  const hips = JI("Hips");
  addTube("shorts", ringsFor(() => ({ cx: midX, cz, rx: half * 0.62 + 0.105, rz: 0.112 }), o.skirtTop, o.skirtBottom), () => [[hips, 1]]);

  // ---- 3. rebuild each primitive: keep the non-leg triangles, append the new tubes, apply the foot fix ----
  const json = JSON.parse(JSON.stringify(glb.json));
  let bin = Buffer.from(glb.bin);
  const push = (arr, componentType, type, count, bytes, extra = {}) => {
    const pad = (4 - (bin.length % 4)) % 4; if (pad) bin = Buffer.concat([bin, Buffer.alloc(pad)]);
    const off = bin.length; const buf = Buffer.alloc(arr.length * bytes);
    arr.forEach((v, i) => { if (componentType === 5126) buf.writeFloatLE(v, i * 4); else if (componentType === 5123) buf.writeUInt16LE(v, i * 2); else buf.writeUInt32LE(v, i * 4); });
    bin = Buffer.concat([bin, buf]);
    json.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: buf.length, ...(extra.target ? { target: extra.target } : {}) });
    json.accessors.push({ bufferView: json.bufferViews.length - 1, componentType, count, type, ...(extra.min ? { min: extra.min, max: extra.max } : {}) });
    return json.accessors.length - 1;
  };
  const report = {};
  json.meshes[0].primitives.forEach((prim, pi) => {
    const m = meshes[pi];
    const mat = matName(pi);
    const dom = Array.from({ length: m.pos.length }, (_, v) => domName(m, v));
    let keepTri = [];
    const centroidY = (t) => (m.pos[m.indices[t]][1] + m.pos[m.indices[t + 1]][1] + m.pos[m.indices[t + 2]][1]) / 3;
    for (let t = 0; t < m.indices.length; t += 3) {
      const ids = [m.indices[t], m.indices[t + 1], m.indices[t + 2]];
      let drop = false;
      if (mat === "socks") drop = true;
      if (mat === "skin" || mat === "shorts") {
        const arm = ids.some((v) => isArm(dom[v]));
        if (!arm && (mat === "shorts" || centroidY(t) < 0.97)) drop = true;
        if (mat === "skin" && ids.every((v) => isLeg(dom[v]))) drop = true;
      }
      if (!drop) keepTri.push(ids);
    }
    // vertex positions: boots/socks straightened
    let positions = m.pos.map((p) => p);
    if (mat === "dark") {
      positions = m.pos.map((p, v) => {
        for (const side of ["L", "R"]) { const f = footFix[side]; if (f.bootV.has(v)) return f.apply(p); }
        return p;
      });
    }
    // gather vertices: old ones referenced by kept triangles, then new tube vertices
    const remap = new Map();
    const outP = [], outJ = [], outW = [];
    const useOld = (v) => {
      if (!remap.has(v)) {
        remap.set(v, outP.length);
        outP.push(positions[v]);
        const pairs = []; for (let k = 0; k < 4; k++) if (m.weights[v][k] > 0) pairs.push([m.joints[v][k], m.weights[v][k]]);
        outJ.push(pairs.map((q) => q[0])); outW.push(pairs.map((q) => q[1]));
      }
      return remap.get(v);
    };
    const tris = keepTri.map((ids) => ids.map(useOld));
    if (newVerts[mat]) {
      const base = outP.length;
      newVerts[mat].forEach((nv) => { outP.push(nv.p); outJ.push(nv.w.map((q) => q[0])); outW.push(nv.w.map((q) => q[1])); });
      newTris[mat].forEach((t) => tris.push(t.map((i) => i + base)));
    }
    const nV = outP.length;
    const nrm = outP.map(() => [0, 0, 0]);
    for (const [a, b, c] of tris) {
      const u = sub(outP[b], outP[a]), w = sub(outP[c], outP[a]);
      const fn = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      for (const v of [a, b, c]) { nrm[v][0] += fn[0]; nrm[v][1] += fn[1]; nrm[v][2] += fn[2]; }
    }
    // keep the authored normals for untouched primitives; recompute for rebuilt ones
    const rebuilt = mat === "skin" || mat === "shorts" || mat === "socks" || mat === "dark";
    const mins = [1e9, 1e9, 1e9], maxs = [-1e9, -1e9, -1e9];
    outP.forEach((p) => { for (let a = 0; a < 3; a++) { mins[a] = Math.min(mins[a], p[a]); maxs[a] = Math.max(maxs[a], p[a]); } });
    const J = [], W = [];
    for (let v = 0; v < nV; v++) { for (let k = 0; k < 4; k++) { J.push(outJ[v][k] ?? 0); W.push(outW[v][k] ?? 0); } }
    if (rebuilt) {
      prim.attributes.POSITION = push(outP.flat(), 5126, "VEC3", nV, 4, { target: 34962, min: mins, max: maxs });
      // authored normals are smooth per vertex; recomputed ones are area weighted
      const n = nrm.map(unit); prim.attributes.NORMAL = push(n.flat(), 5126, "VEC3", nV, 4, { target: 34962 });
      prim.attributes.JOINTS_0 = push(J, 5123, "VEC4", nV, 2, { target: 34962 });
      prim.attributes.WEIGHTS_0 = push(W, 5126, "VEC4", nV, 4, { target: 34962 });
      prim.indices = push(tris.flat(), 5125, "SCALAR", tris.length * 3, 4, { target: 34963 });
    }
    report[mat] = { vertices: nV, triangles: tris.length, removedOld: m.indices.length / 3 - keepTri.length, added: newTris[mat]?.length ?? 0 };
  });
  json.buffers[0].byteLength = bin.length;
  return { glb: compact({ json, bin }), report, feet: Object.fromEntries(Object.entries(footFix).map(([k, f]) => [k, { bootHeight: +f.spread.toFixed(3) }])) };
}

if (process.argv[1]?.endsWith("rebuild-legs.mjs") && process.argv[3]) {
  const r = rebuildLegs(readGlb(process.argv[2]));
  console.log(JSON.stringify({ report: r.report, feet: r.feet, ...writeGlb(process.argv[3], r.glb) }));
}
