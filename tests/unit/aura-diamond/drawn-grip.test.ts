import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACTOR_FIT,
  BATTER_YAW,
  FIT_GROUND_N,
  RIG,
  buildContactConfig,
  qAxis,
  qMul,
  qToEulerZYX,
  rotY,
  sampleBatterTarget,
  solveBatterPose,
  type PoseSolve,
  type Quat,
  type Vec3
} from "../../../apps/showcase-aura-diamond-3d/src/batter-pose";
import { loadHandMesh } from "../../browser/diamond-skin-measure";

/**
 * The grip against the DRAWN hand: the repository's athlete GLB is skinned on the CPU from the solved bone transforms (the engine's own
 * palette formula) and the centroid of the hand's vertices is compared with the bat axis. This is what the screen shows, whichever way the
 * mesh is bound; the bone-only metric in batter-grip.test.ts cannot see a mesh that is bound away from its joints.
 */

type M = number[];
const I = (): M => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const mul = (a: M, b: M): M => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r]! * b[c * 4 + k]!; o[c * 4 + r] = s; } return o; };
const fromTQ = (t: Vec3, q: Quat): M => { const [x, y, z, w] = q; const m = I(); m[0] = 1 - 2 * (y * y + z * z); m[1] = 2 * (x * y + z * w); m[2] = 2 * (x * z - y * w); m[4] = 2 * (x * y - z * w); m[5] = 1 - 2 * (x * x + z * z); m[6] = 2 * (y * z + x * w); m[8] = 2 * (x * z + y * w); m[9] = 2 * (y * z - x * w); m[10] = 1 - 2 * (x * x + y * y); m[12] = t[0]; m[13] = t[1]; m[14] = t[2]; return m; };
const apply = (m: M, v: Vec3): Vec3 => [m[0]! * v[0] + m[4]! * v[1] + m[8]! * v[2] + m[12]!, m[1]! * v[0] + m[5]! * v[1] + m[9]! * v[2] + m[13]!, m[2]! * v[0] + m[6]! * v[1] + m[10]! * v[2] + m[14]!];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);

const aura = readFileSync(resolve(process.cwd(), "apps/showcase-aura-diamond-3d/src/aura-assets.route.ts"), "utf8");
const glbUrl = /"diamondAthlete":\s*\{[^}]*?url:\s*"([^"]+)"/s.exec(aura)![1]!;
const glbPath = resolve(process.cwd(), "public", glbUrl.replace(/^\//, ""));
const glbBytes = readFileSync(glbPath);
const glbJson = JSON.parse(glbBytes.subarray(20, 20 + glbBytes.readUInt32LE(12)).toString());
const mesh = loadHandMesh(glbPath);
const bindT: Record<string, Vec3> = {};
for (const n of glbJson.nodes) if (n.name) bindT[n.name] = (n.translation ?? [0, 0, 0]) as Vec3;
const parent: Record<string, string | null> = { Root: null, Hips: "Root", Spine: "Hips", Chest: "Spine", Head: "Chest", LeftUpperArm: "Chest", LeftForearm: "LeftUpperArm", RightUpperArm: "Chest", RightForearm: "RightUpperArm", LeftUpperLeg: "Hips", LeftLowerLeg: "LeftUpperLeg", LeftFoot: "LeftLowerLeg", RightUpperLeg: "Hips", RightLowerLeg: "RightUpperLeg", RightFoot: "RightLowerLeg" };

function worldMats(bones: PoseSolve["bones"]): Record<string, M> {
  const out: Record<string, M> = {};
  const b = bones as unknown as Record<string, { position?: Vec3; rotation?: Quat }>;
  const get = (n: string): M => {
    if (out[n]) return out[n]!;
    const p = parent[n];
    const local = fromTQ(b[n]?.position ?? bindT[n]!, b[n]?.rotation ?? ([0, 0, 0, 1] as Quat));
    out[n] = p ? mul(get(p), local) : local;
    return out[n]!;
  };
  for (const n of mesh.jointNames) get(n);
  return out;
}

function drawnCentroid(side: "Right" | "Left", W: Record<string, M>): Vec3 {
  const pts = mesh.hands[side];
  const acc: Vec3 = [0, 0, 0];
  for (const p of pts) {
    const o: Vec3 = [0, 0, 0];
    for (let c = 0; c < 4; c++) {
      const w = p.w[c]!;
      if (!w) continue;
      const q = apply(W[mesh.jointNames[p.j[c]!]!]!, apply(mesh.ibm[p.j[c]!]!, p.v));
      o[0] += w * q[0];
      o[1] += w * q[1];
      o[2] += w * q[2];
    }
    acc[0] += o[0];
    acc[1] += o[1];
    acc[2] += o[2];
  }
  return [acc[0] / pts.length, acc[1] / pts.length, acc[2] / pts.length];
}

const BP: Vec3 = [-0.82, 0, 0.28];
const toActor = (p: Vec3): Vec3 => { const l = rotY(-BATTER_YAW, sub(p, BP)); return [l[0] / ACTOR_FIT - FIT_GROUND_N[0], l[1] / ACTOR_FIT - FIT_GROUND_N[1], l[2] / ACTOR_FIT - FIT_GROUND_N[2]]; };

interface Row { phase: string; right: number; left: number; rightAlong: number; leftAlong: number }
function sweep(): Row[] {
  const rows: Row[] = [];
  const phaseOf = (t: number, active: boolean, recover: number): string => (!active ? "stance" : t < 0.26 ? "load" : t < 0.4 ? "stride" : t < 0.56 ? "contact" : recover > 0 ? "recover" : "follow-through");
  const measure = (pose: PoseSolve, phase: string): void => {
    const W = worldMats(pose.bones);
    const knob = apply(W.RightForearm!, RIG.palmR as Vec3);
    const dir = pose.batDir;
    const axis = (p: Vec3): [number, number] => { const r = sub(p, knob); const cr: Vec3 = [r[1] * dir[2] - r[2] * dir[1], r[2] * dir[0] - r[0] * dir[2], r[0] * dir[1] - r[1] * dir[0]]; return [len(cr), r[0] * dir[0] + r[1] * dir[1] + r[2] * dir[2]]; };
    const [rd, ra] = axis(drawnCentroid("Right", W));
    const [ld, la] = axis(drawnCentroid("Left", W));
    rows.push({ phase, right: rd, left: ld, rightAlong: ra, leftAlong: la });
  };
  let tau = 0, tauL = 0, gamma = 0;
  const run = (target: ReturnType<typeof sampleBatterTarget>, phase: string): void => {
    let pose!: PoseSolve;
    for (let i = 0; i < 3; i++) { pose = solveBatterPose(target.K, target.D, target.phi, target.hip, target.pole, tau, tauL, gamma); tau = pose.tau; tauL = pose.tauL; gamma = pose.gamma; }
    measure(pose, phase);
  };
  for (let now = 0; now < 6; now += 0.5) run(sampleBatterTarget({ active: false, t: 0, recover: 0, contact: null }, now), "stance");
  for (const x of [-0.1, 0.18, 0.3]) for (const y of [0.8, 1.06, 1.4]) {
    const ba = toActor([x, y, 0.32]);
    const hipY = -Math.max(0.03, Math.min(0.18, (0.121 - ba[1]) * 0.9 + 0.03));
    const contact = buildContactConfig(ba, hipY);
    tau = 0; tauL = 0; gamma = 0;
    for (let t = 0; t <= 1.0001; t += 0.05) run(sampleBatterTarget({ active: true, t, recover: 0, contact }, 0), phaseOf(t, true, 0));
    for (let r = 0.1; r <= 1.0001; r += 0.15) run(sampleBatterTarget({ active: true, t: 1, recover: r, contact }, 0), "recover");
  }
  return rows;
}

describe("drawn-hand grip (CPU-skinned hand vertices vs the bat axis)", () => {
  const rows = sweep();
  const phases = ["stance", "load", "stride", "contact", "follow-through", "recover"];
  const worst = (phase: string): { right: number; left: number } => {
    const r = rows.filter((x) => x.phase === phase);
    return { right: Math.max(...r.map((x) => x.right)), left: Math.max(...r.map((x) => x.left)) };
  };
  it("reports the per-phase table", () => {
    const table = phases.map((phase) => ({ phase, samples: rows.filter((x) => x.phase === phase).length, worstRightCm: Number((worst(phase).right * 100).toFixed(1)), worstLeftCm: Number((worst(phase).left * 100).toFixed(1)) }));
    if (process.env.DIAMOND_GRIP_REPORT) {
      mkdirSync(process.env.DIAMOND_GRIP_REPORT, { recursive: true });
      writeFileSync(`${process.env.DIAMOND_GRIP_REPORT}/drawn-grip.json`, JSON.stringify({ glb: glbUrl, table }, null, 1));
    }
    expect(table.length).toBe(phases.length);
  });
  it("keeps both drawn palms within 6 cm of the handle in every phase (8 cm in the follow-through tail)", () => {
    for (const phase of phases) {
      const w = worst(phase);
      const limit = phase === "follow-through" || phase === "recover" ? 0.08 : 0.06;
      expect(w.right, `${phase} right drawn palm to bat axis`).toBeLessThanOrEqual(limit);
      expect(w.left, `${phase} left drawn palm to bat axis`).toBeLessThanOrEqual(limit);
    }
  });
  it("keeps the drawn palms on the knob end of the bat (within 12 cm along the bat, top hand above the bottom hand)", () => {
    for (const r of rows) {
      expect(Math.abs(r.rightAlong)).toBeLessThanOrEqual(0.12);
      expect(r.leftAlong).toBeGreaterThanOrEqual(-0.02);
      expect(r.leftAlong).toBeLessThanOrEqual(0.2);
    }
  });
  it("sets the node rotation in the engine's ZYX order (Rz·Ry·Rx reproduces the quaternion)", () => {
    const q = qMul(qAxis([0, 1, 0], 2.4), qMul(qAxis([1, 0, 0], 0.7), qAxis([0, 0, 1], -1.1)));
    const [a, b, c] = qToEulerZYX(q);
    const back = qMul(qAxis([0, 0, 1], c), qMul(qAxis([0, 1, 0], b), qAxis([1, 0, 0], a)));
    const dot = Math.abs(q[0] * back[0] + q[1] * back[1] + q[2] * back[2] + q[3] * back[3]);
    expect(dot).toBeGreaterThan(0.99999);
  });
});
