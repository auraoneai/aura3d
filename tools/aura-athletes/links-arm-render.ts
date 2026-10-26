/** Offline z-buffered render of the posed Links golfer, arms coloured (left green, right red), for side/front/back views. */
import { writeFileSync, mkdirSync } from "node:fs";
import { buildHierarchy, forward, loadSkins, localPose, readGlbFile, skinnedPositions, type Vec3, type Trs } from "../../packages/aura3d-cli/src/skin/gltf.ts";
import { evaluateSwing, makeRoot, solveSwing, type SwingPosePhase, type Quat } from "../../apps/showcase-aura-links-3d/src/game/swingMath.ts";
import { png } from "./raster.mjs";

const q4 = (q: Quat): number[] => [q.x, q.y, q.z, q.w];
export function renderPose(glbPath: string, phase: SwingPosePhase, t: number, view: "sideA" | "sideB" | "front" | "back", out: string, px = 640): void {
  const glb = readGlbFile(glbPath);
  const h = buildHierarchy(glb);
  const skin = loadSkins(glb, h)[0]!;
  const solved = solveSwing(evaluateSwing(phase, t), makeRoot(0));
  const trs: Trs[] = localPose(glb, null, 0, h);
  for (const [name, q] of Object.entries(solved.bones)) { const n = h.id(name); if (n >= 0) trs[n]!.r = q4(q); }
  const hips = h.id("Hips");
  trs[hips]!.t = [solved.hipsPos[0], solved.hipsPos[1], solved.hipsPos[2]];
  const pose = forward(trs, h);
  const jn = (n: string): number => skin.joints.indexOf(h.id(n));
  const L = [jn("LeftUpperArm"), jn("LeftForearm")], R = [jn("RightUpperArm"), jn("RightForearm")];
  // model faces +Z; sideA looks down -X (screen right = +Z), sideB looks down +X (screen right = -Z), front looks down -Z, back looks down +Z
  const pr = (p: Vec3): Vec3 => view === "sideA" ? [p[2], p[1], p[0]] : view === "sideB" ? [-p[2], p[1], -p[0]] : view === "front" ? [-p[0], p[1], -p[2]] : [p[0], p[1], p[2]];
  const W = px, H = px, img = Buffer.alloc(W * H * 3, 38), depth = new Float32Array(W * H).fill(-1e9);
  const scale = (px * 0.42) / 1.0, ox = px * 0.5, oy = px * 0.9;
  for (const prim of skin.primitives) {
    const pp = skinnedPositions(skin, prim, pose).map(pr);
    const dom = (v: number): number => { let b = 0, j = -1; const w = prim.weights[v] ?? [], jj = prim.joints[v] ?? []; for (let k = 0; k < 4; k += 1) if ((w[k] ?? 0) > b) { b = w[k] ?? 0; j = jj[k] ?? 0; } return j; };
    for (let t0 = 0; t0 < prim.indices.length; t0 += 3) {
      const ia = prim.indices[t0]!, ib = prim.indices[t0 + 1]!, ic = prim.indices[t0 + 2]!;
      const d = dom(ia);
      const col = L.includes(d) ? [60, 200, 90] : R.includes(d) ? [220, 70, 60] : [190, 190, 200];
      const P = [pp[ia]!, pp[ib]!, pp[ic]!].map((v) => [ox + v[0] * scale, oy - v[1] * scale, v[2]]);
      const minx = Math.max(0, Math.floor(Math.min(P[0]![0]!, P[1]![0]!, P[2]![0]!))), maxx = Math.min(W - 1, Math.ceil(Math.max(P[0]![0]!, P[1]![0]!, P[2]![0]!)));
      const miny = Math.max(0, Math.floor(Math.min(P[0]![1]!, P[1]![1]!, P[2]![1]!))), maxy = Math.min(H - 1, Math.ceil(Math.max(P[0]![1]!, P[1]![1]!, P[2]![1]!)));
      const den = (P[1]![1]! - P[2]![1]!) * (P[0]![0]! - P[2]![0]!) + (P[2]![0]! - P[1]![0]!) * (P[0]![1]! - P[2]![1]!);
      if (Math.abs(den) < 1e-9) continue;
      for (let y = miny; y <= maxy; y += 1) for (let x = minx; x <= maxx; x += 1) {
        const l1 = ((P[1]![1]! - P[2]![1]!) * (x - P[2]![0]!) + (P[2]![0]! - P[1]![0]!) * (y - P[2]![1]!)) / den;
        const l2 = ((P[2]![1]! - P[0]![1]!) * (x - P[2]![0]!) + (P[0]![0]! - P[2]![0]!) * (y - P[2]![1]!)) / den;
        const l3 = 1 - l1 - l2;
        if (l1 < 0 || l2 < 0 || l3 < 0) continue;
        const z = l1 * P[0]![2]! + l2 * P[1]![2]! + l3 * P[2]![2]!;
        const i = y * W + x;
        if (z > depth[i]!) { depth[i] = z; img[i * 3] = col[0]!; img[i * 3 + 1] = col[1]!; img[i * 3 + 2] = col[2]!; }
      }
    }
  }
  writeFileSync(out, png(W, H, img));
}

if (process.argv[1]?.endsWith("links-arm-render.ts")) {
  mkdirSync("/tmp/links-arm", { recursive: true });
  const glbPath = "public/aura-assets/linksGolferAthleteClean.b56529b1.glb";
  const jobs: [SwingPosePhase, number][] = [["putt-address", 0], ["address", 0], ["putt-back", 1], ["top", 0], ["follow", 0.5]];
  for (const [ph, t] of jobs) for (const v of ["sideA", "sideB", "front", "back"] as const) renderPose(glbPath, ph, t, v, `/tmp/links-arm/${ph}-${v}.png`);
  console.log("rendered");
}
