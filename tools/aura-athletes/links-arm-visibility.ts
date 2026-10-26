/** Per-arm visibility of the posed Links golfer: fraction of each arm's silhouette that is not hidden by the torso, over four views. */
import { buildHierarchy, forward, loadSkins, localPose, readGlbFile, skinnedPositions, type Vec3, type Trs, type SkinInfo, type Hierarchy, type GlbData } from "../../packages/aura3d-cli/src/skin/gltf.ts";
import { evaluateSwing, makeRoot, solveSwing, type SwingPosePhase, type Quat, type SolvedSwing } from "../../apps/showcase-aura-links-3d/src/game/swingMath.ts";

const q4 = (q: Quat): number[] => [q.x, q.y, q.z, q.w];
export type View = "sideA" | "sideB" | "front" | "back";
export const VIEWS: readonly View[] = ["sideA", "sideB", "front", "back"];
const proj = (view: View, p: Vec3): Vec3 => view === "sideA" ? [p[2], p[1], p[0]] : view === "sideB" ? [-p[2], p[1], -p[0]] : view === "front" ? [-p[0], p[1], -p[2]] : [p[0], p[1], p[2]];

export interface GolferModel { glb: GlbData; h: Hierarchy; skin: SkinInfo; armL: number[]; armR: number[] }
export function loadGolfer(glbPath: string): GolferModel {
  const glb = readGlbFile(glbPath);
  const h = buildHierarchy(glb);
  const skin = loadSkins(glb, h)[0]!;
  const jn = (n: string): number => skin.joints.indexOf(h.id(n));
  return { glb, h, skin, armL: [jn("LeftUpperArm"), jn("LeftForearm")], armR: [jn("RightUpperArm"), jn("RightForearm")] };
}

export function poseOf(m: GolferModel, solved: SolvedSwing) {
  const trs: Trs[] = localPose(m.glb, null, 0, m.h);
  for (const [name, q] of Object.entries(solved.bones)) { const n = m.h.id(name); if (n >= 0 && trs[n]) trs[n]!.r = q4(q); }
  trs[m.h.id("Hips")]!.t = [solved.hipsPos[0], solved.hipsPos[1], solved.hipsPos[2]];
  return forward(trs, m.h);
}

/** visible fraction per arm per view (arm pixels that win the depth test / arm pixels with the arm alone) */
export function armVisibility(m: GolferModel, solved: SolvedSwing, px = 256): Record<"L" | "R", Record<View, number>> {
  const pose = poseOf(m, solved);
  const all = m.skin.primitives.map((p) => skinnedPositions(m.skin, p, pose));
  const dominant = (prim: (typeof m.skin.primitives)[number], v: number): number => { let b = 0, j = -1; const w = prim.weights[v] ?? [], jj = prim.joints[v] ?? []; for (let k = 0; k < 4; k += 1) if ((w[k] ?? 0) > b) { b = w[k] ?? 0; j = jj[k] ?? 0; } return j; };
  const out: Record<"L" | "R", Record<View, number>> = { L: { sideA: 0, sideB: 0, front: 0, back: 0 }, R: { sideA: 0, sideB: 0, front: 0, back: 0 } };
  const scale = (px * 0.42) / 1.0, ox = px * 0.5, oy = px * 0.9;
  for (const view of VIEWS) {
    const W = px;
    const full = new Float32Array(W * W).fill(-1e9);
    const fullId = new Int8Array(W * W).fill(0); // 0 none, 1 left arm, 2 right arm, 3 other
    const armOnly = { L: new Uint8Array(W * W), R: new Uint8Array(W * W) };
    m.skin.primitives.forEach((prim, pi) => {
      const pp = all[pi]!.map((v) => proj(view, v));
      for (let t0 = 0; t0 < prim.indices.length; t0 += 3) {
        const ia = prim.indices[t0]!, ib = prim.indices[t0 + 1]!, ic = prim.indices[t0 + 2]!;
        const d = dominant(prim, ia);
        const id = m.armL.includes(d) ? 1 : m.armR.includes(d) ? 2 : 3;
        const P = [pp[ia]!, pp[ib]!, pp[ic]!].map((v) => [ox + v[0] * scale, oy - v[1] * scale, v[2]]);
        const minx = Math.max(0, Math.floor(Math.min(P[0]![0]!, P[1]![0]!, P[2]![0]!))), maxx = Math.min(W - 1, Math.ceil(Math.max(P[0]![0]!, P[1]![0]!, P[2]![0]!)));
        const miny = Math.max(0, Math.floor(Math.min(P[0]![1]!, P[1]![1]!, P[2]![1]!))), maxy = Math.min(W - 1, Math.ceil(Math.max(P[0]![1]!, P[1]![1]!, P[2]![1]!)));
        const den = (P[1]![1]! - P[2]![1]!) * (P[0]![0]! - P[2]![0]!) + (P[2]![0]! - P[1]![0]!) * (P[0]![1]! - P[2]![1]!);
        if (Math.abs(den) < 1e-9) continue;
        for (let y = miny; y <= maxy; y += 1) for (let x = minx; x <= maxx; x += 1) {
          const l1 = ((P[1]![1]! - P[2]![1]!) * (x - P[2]![0]!) + (P[2]![0]! - P[1]![0]!) * (y - P[2]![1]!)) / den;
          const l2 = ((P[2]![1]! - P[0]![1]!) * (x - P[2]![0]!) + (P[0]![0]! - P[2]![0]!) * (y - P[2]![1]!)) / den;
          const l3 = 1 - l1 - l2;
          if (l1 < 0 || l2 < 0 || l3 < 0) continue;
          const z = l1 * P[0]![2]! + l2 * P[1]![2]! + l3 * P[2]![2]!;
          const i = y * W + x;
          if (id === 1) armOnly.L[i] = 1; else if (id === 2) armOnly.R[i] = 1;
          if (z > full[i]!) { full[i] = z; fullId[i] = id; }
        }
      }
    });
    let aL = 0, aR = 0, vL = 0, vR = 0;
    for (let i = 0; i < W * W; i += 1) { if (armOnly.L[i]) { aL += 1; if (fullId[i] === 1) vL += 1; } if (armOnly.R[i]) { aR += 1; if (fullId[i] === 2) vR += 1; } }
    out.L[view] = aL ? vL / aL : 0;
    out.R[view] = aR ? vR / aR : 0;
  }
  return out;
}

export function sweepVisibility(glbPath: string, phases: readonly SwingPosePhase[], steps: number, px = 256) {
  const m = loadGolfer(glbPath);
  const root = makeRoot(0);
  const rows: { phase: string; t: number; side: "L" | "R"; best: number; views: Record<View, number> }[] = [];
  for (const phase of phases) for (let s = 0; s <= steps; s += 1) {
    const t = s / steps;
    const vis = armVisibility(m, solveSwing(evaluateSwing(phase, t), root), px);
    for (const side of ["L", "R"] as const) rows.push({ phase, t, side, best: Math.max(...VIEWS.map((v) => vis[side][v])), views: vis[side] });
  }
  return rows;
}

if (process.argv[1]?.endsWith("links-arm-visibility.ts")) {
  const phases: SwingPosePhase[] = ["address", "backswing", "top", "downswing", "follow", "putt-address", "putt-back", "putt-through"];
  const rows = sweepVisibility("public/aura-assets/linksGolferAthleteClean.b56529b1.glb", phases, 8);
  const worst = [...rows].sort((a, b) => a.best - b.best).slice(0, 12);
  console.log(`frames ${rows.length}; frames where an arm is hidden from every view (best < 0.4): ${rows.filter((r) => r.best < 0.4).length}`);
  for (const r of worst) console.log(`${r.phase.padEnd(13)} t=${r.t.toFixed(2)} ${r.side} best=${r.best.toFixed(2)} sideA=${r.views.sideA.toFixed(2)} sideB=${r.views.sideB.toFixed(2)} front=${r.views.front.toFixed(2)} back=${r.views.back.toFixed(2)}`);
  for (const ph of phases) {
    const rs = rows.filter((r) => r.phase === ph);
    console.log(`${ph.padEnd(13)} L min-best=${Math.min(...rs.filter((r) => r.side === "L").map((r) => r.best)).toFixed(2)} R min-best=${Math.min(...rs.filter((r) => r.side === "R").map((r) => r.best)).toFixed(2)}`);
  }
}
