// Rebuilds the arms of a Meshy athlete GLB (run after rebuild-legs.mjs) in the straight pose the skeleton assumes, and stands the
// torso and head upright. The mesh is modelled mid-stride: the spine is bent forward ~30 degrees and the arms are bound bent, so
// every clip rotated the shoulders and elbows about joints far from the limbs and tore the sleeves into fragments.
//   1. a per-height shear removes the forward lean of the torso, neck and head (rigid enough: shifts of a few cm over 0.5 m)
//   2. the old arm geometry (sleeves, forearm skin, hands, gloves) is removed
//   3. new sleeve, upper-arm, forearm and hand tubes follow the real shoulder -> elbow -> wrist axes with smooth shoulder,
//      elbow weights; sleeves are kit-coloured and continuous with the torso, hands are skin (striker) or gloves (keeper)
//   node tools/aura-fc/rebuild-arms.mjs <in.glb> <out.glb> [--long-sleeves]
import { readGlb, writeGlb, localPose, forward } from "./glb.mjs";
import { loadSkinnedMesh } from "./skin.mjs";
import { compact } from "./bridge-cut.mjs";

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function rebuildArms(glb, { torsoTube = false, taperRoot = false, capRadius = 0.1, palms = null, longSleeves = false, capSleeves = false, ringSegments = 20, ringStep = 0.025, elbowHalf = 0.1, shoulderBlend = [-0.05, 0.16] } = {}) {
  const rest = forward(glb, localPose(glb, null, 0));
  const skinJoints = glb.json.skins[0].joints;
  const jointIndex = new Map(skinJoints.map((j, i) => [rest.names[j], i]));
  const JI = (n) => jointIndex.get(n);
  const P = (n) => rest.pos[rest.id(n)];
  const midX = (P("LeftUpperLeg")[0] + P("RightUpperLeg")[0]) / 2;
  const prims = glb.json.meshes[0].primitives;
  const matName = (i) => glb.json.materials[prims[i].material]?.name?.split("-").pop();
  const meshes = prims.map((_, i) => loadSkinnedMesh(glb, i));
  const byMat = Object.fromEntries(prims.map((_, i) => [matName(i), i]));
  const domName = (m, v) => { let b = 0, bj = 0; for (let k = 0; k < 4; k++) if (m.weights[v][k] > b) { b = m.weights[v][k]; bj = m.joints[v][k]; } return m.jointNames[bj]; };
  const isArm = (n) => /Arm|arm/.test(n);
  const armWeight = (m, v) => { let w = 0; for (let k = 0; k < 4; k++) if (isArm(m.jointNames[m.joints[v][k]])) w += m.weights[v][k]; return w; };

  // ---- 1. upright torso, neck and head: a per-height shear moves the cluster centres of the bones that own the body onto the skeleton axis ----
  // largest connected piece of the kit mesh = the torso (the right glove and cuff are detached pieces)
  const kitMesh = meshes[byMat.kit];
  const torsoVerts = (() => {
    const wid = new Map(); const w = (v) => { const k = kitMesh.pos[v].map((x) => Math.round(x * 500)).join(","); if (!wid.has(k)) wid.set(k, wid.size); return wid.get(k); };
    const par = []; const f = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
    const ids = []; for (let t = 0; t < kitMesh.indices.length; t += 3) ids.push([kitMesh.indices[t], kitMesh.indices[t + 1], kitMesh.indices[t + 2]]);
    ids.forEach((tri) => tri.forEach((v) => { const i = w(v); while (par.length <= i) par.push(par.length); }));
    for (const tri of ids) { const a = f(w(tri[0])); for (const v of tri.slice(1)) { const b = f(w(v)); if (a !== b) par[b] = a; } }
    const sizes = new Map(); for (const tri of ids) { const c = f(w(tri[0])); sizes.set(c, (sizes.get(c) ?? 0) + 1); }
    const main = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const set = new Set(); for (const tri of ids) if (f(w(tri[0])) === main) tri.forEach((v) => set.add(v));
    return set;
  })();
  const clusterCentre = (mats, names) => {
    const pts = [];
    for (const mat of mats) { const m = meshes[byMat[mat]]; for (let v = 0; v < m.pos.length; v++) if (names.includes(domName(m, v)) && Math.abs(m.pos[v][0] - midX) < 0.18 && (mat !== "kit" || torsoVerts.has(v))) pts.push(m.pos[v]); }
    if (pts.length < 20) return null;
    const zs = pts.map((p) => p[2]).sort((a, b) => a - b);
    return [pts.reduce((a, p) => a + p[1], 0) / pts.length, (zs[Math.floor(zs.length * 0.1)] + zs[Math.floor(zs.length * 0.9)]) / 2];
  };
  const anchors = [clusterCentre(["kit"], ["Hips"]), clusterCentre(["kit"], ["Spine"]), clusterCentre(["kit"], ["Chest"]), clusterCentre(["skin", "dark"], ["Head"])].filter(Boolean).sort((a, b) => a[0] - b[0]);
  const z0 = P("Hips")[2];
  const centreAt = (y) => {
    if (y <= anchors[0][0]) return anchors[0][1];
    for (let i = 0; i < anchors.length - 1; i++) if (y <= anchors[i + 1][0]) { const t = (y - anchors[i][0]) / (anchors[i + 1][0] - anchors[i][0]); return anchors[i][1] + (anchors[i + 1][1] - anchors[i][1]) * t; }
    return anchors.at(-1)[1];
  };
  const shear = (y) => (centreAt(y) - z0) * smooth(1.0, 1.1, y);   // 0 below the waist, the full lean above 1.1 m

  // ---- 2. arm axes in the straight skeleton ----
  const arm = {};
  for (const side of ["Left", "Right"]) {
    const S = P(`${side}UpperArm`), E = P(`${side}Forearm`);
    const dir = unit(sub(E, S));
    const upperLen = len(sub(E, S));
    const W = add(E, mul(dir, upperLen * 1.02));
    arm[side] = { S, E, W, dir, upperLen };
  }

  // ---- 3. tubes ----
  const newVerts = { skin: [], kit: [] };
  const newTris = { skin: [], kit: [] };
  const wset = (pairs) => { const top = pairs.filter(([, w]) => w > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4); const s = top.reduce((a, [, w]) => a + w, 0) || 1; return top.map(([j, w]) => [j, w / s]); };
  const addAxisTube = (target, A, B, radiusAt, weightsAt, { flat = 1, capEnd = false, capStart = false } = {}) => {
    const verts = newVerts[target], tris = newTris[target];
    const base = verts.length;
    const d = unit(sub(B, A));
    let u = unit(cross(d, [0, 0, 1])); if (len(cross(d, [0, 0, 1])) < 1e-4) u = [1, 0, 0];
    const v = unit(cross(d, u));
    const L = len(sub(B, A));
    const n = Math.max(2, Math.ceil(L / ringStep));
    const N = ringSegments;
    for (let i = 0; i <= n; i++) {
      const t = i / n, c = add(A, mul(sub(B, A), t));
      const r = radiusAt(t * L);
      const w = wset(weightsAt(t * L));
      for (let k = 0; k < N; k++) { const a = (k / N) * Math.PI * 2; const p = add(c, add(mul(u, Math.cos(a) * r * flat), mul(v, Math.sin(a) * r))); verts.push({ p, w }); }
    }
    // winding: u x v == d, so radial x tangent == d and (a, b, c) with c on the next ring has an outward normal (the old (a, c, b) order was inside out)
    for (let i = 0; i < n; i++) for (let k = 0; k < N; k++) {
      const a = base + i * N + k, b = base + i * N + ((k + 1) % N), c = base + (i + 1) * N + k, e = base + (i + 1) * N + ((k + 1) % N);
      tris.push([a, b, c], [b, e, c]);
    }
    const cap = (ring, at, flip) => {
      const ci = verts.length; verts.push({ p: at, w: wset(weightsAt(ring === 0 ? 0 : L)) });
      for (let k = 0; k < N; k++) { const a = base + ring * N + k, b = base + ring * N + ((k + 1) % N); tris.push(flip ? [ci, b, a] : [ci, a, b]); }
    };
    if (capEnd) cap(n, B, false);
    if (capStart) cap(0, A, true);
    return { dir: d, L };
  };

  const addSphere = (target, c, r, w, scale = [1, 1, 1]) => {
    const verts = newVerts[target], tris = newTris[target];
    const base = verts.length; const N = ringSegments, M = 10;
    for (let i = 0; i <= M; i++) { const th = (i / M) * Math.PI; for (let k = 0; k < N; k++) { const a = (k / N) * Math.PI * 2; verts.push({ p: add(c, [Math.sin(th) * Math.cos(a) * r * scale[0], Math.cos(th) * r * scale[1], Math.sin(th) * Math.sin(a) * r * scale[2]]), w: wset(w) }); } }
    for (let i = 0; i < M; i++) for (let k = 0; k < N; k++) {
      const a = base + i * N + k, b = base + i * N + ((k + 1) % N), cc = base + (i + 1) * N + k, d = base + (i + 1) * N + ((k + 1) % N);
      tris.push([a, b, cc], [b, d, cc]);
    }
  };
  // the cap must move like the torso shell around the shoulder: average the shell's own weights there (Spine and Chest mix when the spine bends)
  const shoulderWeights = (S) => {
    const m = kitMesh; const acc = new Map(); let n = 0;
    for (const v of torsoVerts) {
      const p = [m.pos[v][0], m.pos[v][1], m.pos[v][2] - shear(m.pos[v][1])];
      if (len(sub(p, S)) > 0.14 || armWeight(m, v) > 0.2) continue;
      n++; for (let k = 0; k < 4; k++) if (m.weights[v][k] > 0) { const j = m.joints[v][k]; acc.set(j, (acc.get(j) ?? 0) + m.weights[v][k]); }
    }
    if (!n) return [[JI("Chest"), 1]];
    return [...acc.entries()].map(([j, w]) => [j, w / n]);
  };
  const sh0 = shoulderBlend[0], sh1 = shoulderBlend[1];
  const weightsArm = (side, S, dirv, upperLen) => (s) => {          // s = distance along the arm from the shoulder joint (m)
    const chest = JI("Chest"), up = JI(`${side}UpperArm`), fore = JI(`${side}Forearm`);
    const wChest = 1 - smooth(sh0, sh1, s);
    const foreT = smooth(upperLen - elbowHalf, upperLen + elbowHalf, s);
    return [[chest, wChest], [up, (1 - wChest) * (1 - foreT)], [fore, (1 - wChest) * foreT]];
  };
  const skinR = (s, upperLen) => { // upper arm 0.047 -> 0.038 at the elbow, forearm 0.04 -> 0.028 at the wrist
    if (s <= upperLen) return 0.049 - 0.011 * Math.max(0, s) / upperLen + (s < 0 ? 0 : 0);
    const t = (s - upperLen) / upperLen; return 0.04 - 0.012 * Math.pow(Math.min(1, t), 0.9);
  };
  for (const side of ["Left", "Right"]) {
    const { S, E, W, dir, upperLen } = arm[side];
    const A = sub(S, mul(dir, 0.06));
    const wf = weightsArm(side, S, dir, upperLen);
    const sOff = (s) => s - 0.06; // distances in the tube are measured from A
    // the root of each arm tube sits inside the torso and tapers to a point so no open rim shows above the shoulder
    const taper = (s) => (taperRoot ? 0.2 + 0.8 * smooth(0, 0.075, s) : 1);
    // skin: upper arm and forearm (from inside the torso to the wrist). With `palms` the forearm follows the shoulder -> elbow -> palm path
    // of the rigs whose games solve the hand onto a calibrated palm point in forearm bone space (the palm is not on the bone axis).
    const palm = palms?.[side] ?? null;
    let Wd = W, hdir = dir;
    if (palm) {
      const f = unit(sub(palm, E));
      Wd = sub(palm, mul(f, 0.05)); hdir = f;
      addAxisTube("skin", A, E, (s) => skinR(sOff(s), upperLen) * taper(s), (s) => wf(sOff(s)), { flat: 1 });
      addAxisTube("skin", E, Wd, (s) => skinR(upperLen + s * (upperLen / len(sub(Wd, E))), upperLen), (s) => wf(upperLen + s), { flat: 1 });
    } else addAxisTube("skin", A, W, (s) => skinR(sOff(s), upperLen) * taper(s), (s) => wf(sOff(s)), { flat: 1 });
    // sleeves: kit
    const sleeveEnd = longSleeves ? W : add(S, mul(dir, upperLen * 0.45));
    addAxisTube("kit", A, sleeveEnd, (s) => (longSleeves ? skinR(sOff(s), upperLen) + 0.016 : 0.066 - 0.012 * (sOff(s) / (upperLen * 0.45))) * taper(s), (s) => wf(sOff(s)), { flat: 1, capEnd: capSleeves });
    // shoulder cap: closes the armhole left in the torso when the arm swings (kit, follows the chest)
    if (capRadius > 0) addSphere("kit", add(add(S, mul(dir, -0.01)), [0, 0.005, -0.025]), capRadius, shoulderWeights(S), [0.72, 0.85, 0.78]);
    // hand: mitten (skin for the outfield kit, kit-coloured glove for the keeper) with a thumb
    const H = add(Wd, mul(hdir, 0.1));
    const wHand = () => [[JI(`${side}Forearm`), 1]];
    const handTarget = longSleeves ? "kit" : "skin";
    addAxisTube(handTarget, Wd, H, (s) => { const t = s / 0.1; return 0.03 + 0.016 * Math.sin(Math.PI * Math.min(1, t * 0.9)) - 0.012 * t * t; }, wHand, { flat: 0.55, capEnd: true });
    const thumbA = add(Wd, mul(hdir, 0.03));
    const thumbB = add(thumbA, add(mul(unit([0, 0, 1]), 0.045), mul(hdir, 0.012)));
    addAxisTube(handTarget, thumbA, thumbB, (s) => 0.014 - 0.004 * (s / 0.05), wHand, { flat: 1, capEnd: true });
  }

  // ---- 3b. optional clean torso: the old shell is ragged where the arms were bound (holes show the inside), so it is replaced by a tube
  // measured from the shell (half width and depth per height) on the straight skeleton axis, closed into the neck with a shoulder slope ----
  if (torsoTube) {
    const hipsJ = JI("Hips"), spineJ = JI("Spine"), chestJ = JI("Chest");
    const own = [...torsoVerts].filter((v) => /^(Hips|Spine|Chest)$/.test(domName(kitMesh, v)));
    const ys = own.map((v) => kitMesh.pos[v][1]);
    const yLo = Math.min(...ys), yHi = Math.max(...ys);
    const bands = [];
    for (let y = yLo; y <= yHi + 1e-6; y += 0.03) {
      const pts = own.map((v) => kitMesh.pos[v]).filter((p) => Math.abs(p[1] - y) < 0.025 && Math.abs(p[0] - midX) < 0.3);
      if (pts.length < 12) continue;
      const xs = pts.map((p) => Math.abs(p[0] - midX)).sort((a, b) => a - b), zs = pts.map((p) => p[2]).sort((a, b) => a - b);
      bands.push({ y, rx: xs[Math.floor(xs.length * 0.93)], rz: (zs[Math.floor(zs.length * 0.97)] - zs[Math.floor(zs.length * 0.03)]) / 2 });
    }
    const sb = bands.map((b, i) => { const a = bands[Math.max(0, i - 1)], c = bands[Math.min(bands.length - 1, i + 1)]; return { y: b.y, rx: Math.min(0.205, (a.rx + 2 * b.rx + c.rx) / 4), rz: (a.rz + 2 * b.rz + c.rz) / 4 }; });
    const headY = P("Head")[1];
    while (sb.length > 3 && sb[sb.length - 1].y > headY - 0.08) sb.pop();   // the collar closes just under the chin
    const top = sb[sb.length - 1];
    for (const [dy, f, rzN] of [[0.026, 0.85, 0.1], [0.052, 0.6, 0.085], [0.078, 0.4, 0.065]]) sb.push({ y: top.y + dy, rx: Math.min(top.rx, Math.max(0.075, top.rx * f)), rz: Math.min(top.rz, rzN) });
    const NSEG = 28, z0 = P("Hips")[2];
    const base = newVerts.kit.length;
    sb.forEach((r) => {
      const wH = 1 - smooth(0.95, 1.2, r.y), wC = smooth(1.2, 1.4, r.y), wS = 1 - wH - wC;
      for (let k = 0; k < NSEG; k++) { const a = (k / NSEG) * Math.PI * 2; newVerts.kit.push({ p: [midX + Math.cos(a) * r.rx, r.y, z0 + Math.sin(a) * r.rz], w: wset([[hipsJ, wH], [spineJ, wS], [chestJ, wC]]) }); }
    });
    for (let i = 0; i < sb.length - 1; i++) for (let k = 0; k < NSEG; k++) {
      const a = base + i * NSEG + k, b = base + i * NSEG + ((k + 1) % NSEG), c = base + (i + 1) * NSEG + k, d = base + (i + 1) * NSEG + ((k + 1) % NSEG);
      newTris.kit.push([a, c, b], [b, c, d]);
    }
    // close the collar so no dark inside shows between it and the neck
    const last = sb.length - 1, ci = newVerts.kit.length, topR = sb[last];
    newVerts.kit.push({ p: [midX, topR.y, z0], w: wset([[chestJ, 1]]) });
    for (let k = 0; k < NSEG; k++) newTris.kit.push([ci, base + last * NSEG + ((k + 1) % NSEG), base + last * NSEG + k]);
  }

  // ---- 4. rebuild the primitives ----
  const json = JSON.parse(JSON.stringify(glb.json));
  let bin = Buffer.from(glb.bin);
  const push = (arr, componentType, type, count, bytes, extra = {}) => {
    const pad = (4 - (bin.length % 4)) % 4; if (pad) bin = Buffer.concat([bin, Buffer.alloc(pad)]);
    const off = bin.length; const buf = Buffer.alloc(arr.length * bytes);
    arr.forEach((val, i) => { if (componentType === 5126) buf.writeFloatLE(val, i * 4); else if (componentType === 5123) buf.writeUInt16LE(val, i * 2); else buf.writeUInt32LE(val, i * 4); });
    bin = Buffer.concat([bin, buf]);
    json.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: buf.length, ...(extra.target ? { target: extra.target } : {}) });
    json.accessors.push({ bufferView: json.bufferViews.length - 1, componentType, count, type, ...(extra.min ? { min: extra.min, max: extra.max } : {}) });
    return json.accessors.length - 1;
  };
  const report = {};
  json.meshes[0].primitives.forEach((prim, pi) => {
    const mat = matName(pi);
    if (!["kit", "skin", "dark", "eyes"].includes(mat)) return;
    const m = meshes[pi];
    const dom = Array.from({ length: m.pos.length }, (_, v) => domName(m, v));
    const upperBody = (p) => p[1] > 1.0;
    const positions = m.pos.map((p, v) => (upperBody(p) && !isArm(dom[v]) && !/Leg|Foot/.test(dom[v]) && Math.abs(p[0] - midX) < 0.3 ? [p[0], p[1], p[2] - shear(p[1])] : p));
    const keep = [];
    for (let t = 0; t < m.indices.length; t += 3) {
      const ids = [m.indices[t], m.indices[t + 1], m.indices[t + 2]];
      const c = [0, 1, 2].map((a) => (m.pos[ids[0]][a] + m.pos[ids[1]][a] + m.pos[ids[2]][a]) / 3);
      let drop = false;
      if (mat === "kit" || mat === "skin") {
        const armOwned = ids.some((v) => isArm(dom[v]) || armWeight(m, v) > 0.3);
        const outside = Math.abs(c[0] - midX) > 0.215 && c[1] > 0.88 && c[1] < 1.62;
        if (armOwned || outside) drop = true;
        // needles left along the old armhole: long thin triangles in the shoulder band (a dropped needle leaves no hole, the cap and sleeve cover the socket)
        if (!drop && mat === "kit" && c[1] > 1.36 && c[1] < 1.6 && Math.abs(c[0] - midX) > 0.08) {
          const e = [0, 1, 2].map((k) => len(sub(m.pos[ids[k]], m.pos[ids[(k + 1) % 3]])));
          const L = Math.max(...e);
          const area = len(cross(sub(m.pos[ids[1]], m.pos[ids[0]]), sub(m.pos[ids[2]], m.pos[ids[0]]))) / 2;
          if (L > 0.05 && area / (L * L) < 0.15) drop = true;
        }
      }
      if (!drop) keep.push(ids);
    }
    let kept = keep;
    if (mat === "kit" && torsoTube) kept = [];
    else if (mat === "kit") {
      // the torso is the largest connected piece; detached cuffs and gloves that belonged to the old arms go
      const wid = new Map(); const w = (v) => { const k = m.pos[v].map((x) => Math.round(x * 500)).join(","); if (!wid.has(k)) wid.set(k, wid.size); return wid.get(k); };
      const par = []; const f = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
      for (const ids of keep) ids.forEach((v) => { const i = w(v); while (par.length <= i) par.push(par.length); });
      for (const ids of keep) { const a = f(w(ids[0])); for (const v of ids.slice(1)) { const b = f(w(v)); if (a !== b) par[b] = a; } }
      const sizes = new Map(); for (const ids of keep) { const c = f(w(ids[0])); sizes.set(c, (sizes.get(c) ?? 0) + 1); }
      const main = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0][0];
      kept = keep.filter((ids) => f(w(ids[0])) === main);
    }
    const remap = new Map(); const outP = [], outJ = [], outW = [];
    const useOld = (v) => {
      if (!remap.has(v)) {
        remap.set(v, outP.length); outP.push(positions[v]);
        const pairs = []; for (let k = 0; k < 4; k++) if (m.weights[v][k] > 0) pairs.push([m.joints[v][k], m.weights[v][k]]);
        outJ.push(pairs.map((q) => q[0])); outW.push(pairs.map((q) => q[1]));
      }
      return remap.get(v);
    };
    const tris = kept.map((ids) => ids.map(useOld));
    if (newVerts[mat]) {
      const base = outP.length;
      newVerts[mat].forEach((nv) => { outP.push(nv.p); outJ.push(nv.w.map((q) => q[0])); outW.push(nv.w.map((q) => q[1])); });
      newTris[mat].forEach((t) => tris.push(t.map((i) => i + base)));
    }
    const nV = outP.length;
    const nrm = outP.map(() => [0, 0, 0]);
    for (const [a, b, c] of tris) {
      const u = sub(outP[b], outP[a]), w = sub(outP[c], outP[a]); const fn = cross(u, w);
      for (const v of [a, b, c]) { nrm[v][0] += fn[0]; nrm[v][1] += fn[1]; nrm[v][2] += fn[2]; }
    }
    const mins = [1e9, 1e9, 1e9], maxs = [-1e9, -1e9, -1e9];
    outP.forEach((p) => { for (let a = 0; a < 3; a++) { mins[a] = Math.min(mins[a], p[a]); maxs[a] = Math.max(maxs[a], p[a]); } });
    const J = [], W = [];
    for (let v = 0; v < nV; v++) for (let k = 0; k < 4; k++) { J.push(outJ[v][k] ?? 0); W.push(outW[v][k] ?? 0); }
    prim.attributes.POSITION = push(outP.flat(), 5126, "VEC3", nV, 4, { target: 34962, min: mins, max: maxs });
    prim.attributes.NORMAL = push(nrm.map(unit).flat(), 5126, "VEC3", nV, 4, { target: 34962 });
    prim.attributes.JOINTS_0 = push(J, 5123, "VEC4", nV, 2, { target: 34962 });
    prim.attributes.WEIGHTS_0 = push(W, 5126, "VEC4", nV, 4, { target: 34962 });
    prim.indices = push(tris.flat(), 5125, "SCALAR", tris.length * 3, 4, { target: 34963 });
    report[mat] = { vertices: nV, triangles: tris.length, removedOld: m.indices.length / 3 - kept.length, added: newTris[mat]?.length ?? 0 };
  });
  json.buffers[0].byteLength = bin.length;
  return { glb: compact({ json, bin }), report, lean: anchors.map((a) => [+a[0].toFixed(3), +a[1].toFixed(3)]) };
}

if (process.argv[1]?.endsWith("rebuild-arms.mjs") && process.argv[3]) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
  const r = rebuildArms(readGlb(process.argv[2]), { longSleeves: process.argv.includes("--long-sleeves"), taperRoot: process.argv.includes("--taper"), torsoTube: process.argv.includes("--torso-tube"), capSleeves: process.argv.includes("--cap-sleeves"), capRadius: Number(arg("--cap-radius", "0.1")) });
  console.log(JSON.stringify({ report: r.report, lean: r.lean, ...writeGlb(process.argv[3], r.glb) }));
}
