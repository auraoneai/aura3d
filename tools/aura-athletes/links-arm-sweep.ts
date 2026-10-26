/**
 * Offline sweep of the Links golfer's arms: poses the shipped golfer GLB with the game's own swing solve over every
 * phase and time step (and a yaw sweep for the club part placement), skins it on the CPU and measures both arm chains.
 * Run: node_modules/.bin/tsx --tsconfig tsconfig.base.json tools/aura-athletes/links-arm-sweep.ts
 */
import { buildHierarchy, forward, loadSkins, localPose, readGlbFile, skinnedPositions, transformPoint, type Vec3, type Trs } from "../../packages/aura3d-cli/src/skin/gltf.ts";
import {
  evaluateSwing, solveSwing, makeRoot, RIG, UPPER_ARM_LEN, FOREARM_PALM_LEN, type SwingPosePhase, type Quat
} from "../../apps/showcase-aura-links-3d/src/game/swingMath.ts";

export interface ArmSample {
  readonly phase: string;
  readonly t: number;
  readonly side: "L" | "R";
  readonly upperRatio: number;
  readonly foreRatio: number;
  readonly reachRatio: number;
  readonly visibleRatio: number;
  readonly insideTorso: number;
  readonly elbowBehind: number;
  readonly palmGap: number;
}

const dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec3): Vec3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const q4 = (q: Quat): number[] => [q.x, q.y, q.z, q.w];

export function sweepArms(glbPath: string, phases: readonly SwingPosePhase[], steps: number): ArmSample[] {
  const glb = readGlbFile(glbPath);
  const h = buildHierarchy(glb);
  const skins = loadSkins(glb, h);
  const skin = skins[0]!;
  const nameOfJoint = skin.jointNames;
  const id = (n: string): number => h.id(n);
  const joint = (n: string): number => skin.joints.indexOf(id(n));
  const dominantOf = (prim: (typeof skin.primitives)[number], v: number): number => {
    let best = -1, bw = 0;
    const w = prim.weights[v] ?? [], j = prim.joints[v] ?? [];
    for (let k = 0; k < 4; k += 1) if ((w[k] ?? 0) > bw) { bw = w[k] ?? 0; best = j[k] ?? 0; }
    return best;
  };
  const armJoints = { L: [joint("LeftUpperArm"), joint("LeftForearm")], R: [joint("RightUpperArm"), joint("RightForearm")] };
  const torsoJoints = [joint("Hips"), joint("Spine"), joint("Chest")];
  const root = makeRoot(0);
  const rest = forward(localPose(glb, null, 0, h), h);

  const restVisible: Record<"L" | "R", number> = { L: 0, R: 0 };
  const armVerts = (side: "L" | "R") => {
    const out: { prim: (typeof skin.primitives)[number]; v: number }[] = [];
    for (const prim of skin.primitives) for (let v = 0; v < prim.pos.length; v += 1) if (armJoints[side].includes(dominantOf(prim, v))) out.push({ prim, v });
    return out;
  };
  const arms = { L: armVerts("L"), R: armVerts("R") };
  const posedAll = (pose: ReturnType<typeof forward>) => skin.primitives.map((p) => skinnedPositions(skin, p, pose));
  const shoulderRest = { L: rest.pos[id("LeftUpperArm")] as Vec3, R: rest.pos[id("RightUpperArm")] as Vec3 };
  {
    const all = posedAll(rest);
    for (const side of ["L", "R"] as const) {
      let m = 0;
      for (const a of arms[side]) m = Math.max(m, dist(all[skin.primitives.indexOf(a.prim)]![a.v] as Vec3, shoulderRest[side]));
      restVisible[side] = m;
    }
  }

  const samples: ArmSample[] = [];
  for (const phase of phases) {
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps;
      const solved = solveSwing(evaluateSwing(phase, t), root);
      const trs: Trs[] = localPose(glb, null, 0, h);
      for (const [name, q] of Object.entries(solved.bones)) {
        const n = id(name);
        if (n >= 0 && trs[n]) trs[n]!.r = q4(q);
      }
      const hips = id("Hips");
      if (hips >= 0 && trs[hips]) trs[hips]!.t = [solved.hipsPos[0], solved.hipsPos[1], solved.hipsPos[2]];
      const pose = forward(trs, h);
      const all = posedAll(pose);
      // torso cloud
      const torso: Vec3[] = [];
      for (const prim of skin.primitives) {
        const pp = all[skin.primitives.indexOf(prim)]!;
        for (let v = 0; v < prim.pos.length; v += 1) if (torsoJoints.includes(dominantOf(prim, v))) torso.push(pp[v] as Vec3);
      }
      const hipsP = pose.pos[id("Hips")] as Vec3;
      const headP = pose.pos[id("Head")] as Vec3;
      const axis = norm(sub(headP, hipsP));
      const chestW = pose.world[id("Chest")]!;
      const forwardDir = norm([chestW[8] ?? 0, chestW[9] ?? 0, chestW[10] ?? 1]);
      const radialOf = (p: Vec3): { h: number; r: number; az: number } => {
        const rel = sub(p, hipsP);
        const hgt = dot(rel, axis);
        const rad: Vec3 = [rel[0] - axis[0] * hgt, rel[1] - axis[1] * hgt, rel[2] - axis[2] * hgt];
        const side0 = norm([axis[1] * forwardDir[2] - axis[2] * forwardDir[1], axis[2] * forwardDir[0] - axis[0] * forwardDir[2], axis[0] * forwardDir[1] - axis[1] * forwardDir[0]]);
        return { h: hgt, r: Math.hypot(rad[0], rad[1], rad[2]), az: Math.atan2(dot(rad, side0), dot(rad, forwardDir)) };
      };
      const torsoRad = torso.map(radialOf);
      for (const side of ["L", "R"] as const) {
        const upperName = side === "L" ? "LeftUpperArm" : "RightUpperArm";
        const foreName = side === "L" ? "LeftForearm" : "RightForearm";
        const shoulder = pose.pos[id(upperName)] as Vec3;
        const elbow = pose.pos[id(foreName)] as Vec3;
        const palmOff = side === "L" ? RIG.palmL : RIG.palmR;
        const palm = transformPoint(pose.world[id(foreName)]!, [palmOff[0], palmOff[1], palmOff[2]]);
        const upperRatio = dist(shoulder, elbow) / UPPER_ARM_LEN;
        const foreRatio = dist(elbow, palm) / FOREARM_PALM_LEN;
        const reachRatio = dist(shoulder, palm) / (UPPER_ARM_LEN + FOREARM_PALM_LEN);
        let vis = 0, inside = 0;
        for (const a of arms[side]) {
          const p = all[skin.primitives.indexOf(a.prim)]![a.v] as Vec3;
          vis = Math.max(vis, dist(p, shoulder));
          const r = radialOf(p);
          let maxR = 0;
          for (const t0 of torsoRad) if (Math.abs(t0.h - r.h) < 0.03 && Math.abs(Math.atan2(Math.sin(t0.az - r.az), Math.cos(t0.az - r.az))) < 0.5) maxR = Math.max(maxR, t0.r);
          if (maxR > 0 && r.r < 0.85 * maxR) inside += 1;
        }
        const behind = dot(sub(elbow, pose.pos[id("Chest")] as Vec3), forwardDir);
        // the solved palm the game wants (the grip point) versus where the forearm puts the palm
        const wantPalm = side === "L" ? solved.leftPalm : solved.grip;
        samples.push({
          phase, t, side,
          upperRatio, foreRatio, reachRatio,
          visibleRatio: vis / restVisible[side],
          insideTorso: arms[side].length ? inside / arms[side].length : 0,
          elbowBehind: behind,
          palmGap: wantPalm ? 0 : 0
        });
      }
    }
  }
  return samples;
}

export function summarize(samples: readonly ArmSample[]): { worst: ArmSample[]; flagged: ArmSample[] } {
  const flagged = samples.filter((s) => s.upperRatio < 0.8 || s.upperRatio > 1.05 || s.foreRatio < 0.8 || s.foreRatio > 1.05 || s.visibleRatio < 0.5 || s.insideTorso > 0.6 || s.elbowBehind < -0.12);
  const worst = [...samples].sort((a, b) => a.visibleRatio - b.visibleRatio).slice(0, 8);
  return { worst, flagged };
}

if (process.argv[1] && process.argv[1].endsWith("links-arm-sweep.ts")) {
  const phases: SwingPosePhase[] = ["address", "backswing", "top", "downswing", "follow", "putt-address", "putt-back", "putt-through"];
  const samples = sweepArms("public/aura-assets/linksGolferAthleteClean.b56529b1.glb", phases, 40);
  const { worst, flagged } = summarize(samples);
  const fmt = (s: ArmSample): string => `${s.phase.padEnd(13)} t=${s.t.toFixed(2)} ${s.side} upper=${s.upperRatio.toFixed(2)} fore=${s.foreRatio.toFixed(2)} reach=${s.reachRatio.toFixed(2)} visible=${s.visibleRatio.toFixed(2)} insideTorso=${s.insideTorso.toFixed(2)} elbowBehind=${s.elbowBehind.toFixed(2)}`;
  console.log(`samples ${samples.length}, flagged ${flagged.length}`);
  console.log("lowest visible-length frames:");
  for (const s of worst) console.log("  " + fmt(s));
  const byPhase = new Map<string, ArmSample[]>();
  for (const s of flagged) { const k = `${s.phase}/${s.side}`; byPhase.set(k, [...(byPhase.get(k) ?? []), s]); }
  for (const [k, v] of byPhase) console.log(`flagged ${k}: ${v.length} frames, e.g. ${fmt(v[0]!)}`);
}
