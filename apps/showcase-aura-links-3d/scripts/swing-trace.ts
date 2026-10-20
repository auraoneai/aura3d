/**
 * Offline calibration + acceptance trace for the Aura Links swing solver.
 * Pure import of swingMath.ts — no engine. Run: pnpm exec tsx scripts/swing-trace.ts
 */
import {
  BALL_SHOT, CLUB_REACH, evaluateSwing, makeRoot, solveSwing, toShot,
  UPPER_ARM_LEN, FOREARM_PALM_LEN, GRIP_SPAN, vDist, vSub, vScale, vAdd,
  clubAttachOffsets, type V3
} from "../src/game/swingMath";

const root = makeRoot(0); // flat lie: stance ground == ball ground
const ARM_MAX = UPPER_ARM_LEN + FOREARM_PALM_LEN;

const sample = (phase: Parameters<typeof evaluateSwing>[0], t: number) =>
  solveSwing(evaluateSwing(phase, t), root);

console.log(`arm max reach ${ARM_MAX.toFixed(3)}  palm len ${FOREARM_PALM_LEN.toFixed(3)}`);

// ---- phase sweep ----------------------------------------------------------
type Row = { label: string; t: number; headY: number; headZ: number; minArcY: number; dist: number; reachR: number; reachL: number; wrist: number; handL: number };
const rows: Row[] = [];
const sweep = (label: string, phase: "backswing" | "downswing" | "follow", steps: number) => {
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const s = sample(phase, t);
    // left palm distance from the shaft line through grip along dir
    const rel = vSub(s.leftPalm, s.grip);
    const along = rel[0] * s.shaftDir[0] + rel[1] * s.shaftDir[1] + rel[2] * s.shaftDir[2];
    const perp = Math.sqrt(Math.max(0, vDist(rel, [0, 0, 0]) ** 2 - along ** 2));
    rows.push({
      label, t,
      headY: s.clubHead[1], headZ: s.clubHead[2],
      minArcY: s.clubHead[1],
      dist: vDist(s.clubHead, BALL_SHOT),
      reachR: s.reachR, reachL: s.reachL, wrist: s.wristError,
      handL: perp
    });
  }
};
sweep("back", "backswing", 20);
sweep("down", "downswing", 20);
sweep("thru", "follow", 20);

// ---- key frames -----------------------------------------------------------
const keyFrames: Array<[string, Parameters<typeof evaluateSwing>[0], number]> = [
  ["ADDR   ", "address", 0],
  ["TAKE   ", "backswing", 0.5],
  ["TOP    ", "top", 0],
  ["LAG    ", "downswing", 0.5],
  ["IMPACT ", "downswing", 1],
  ["THRU   ", "follow", 0.5],
  ["FINISH ", "follow", 1]
];
console.log("\n-- keys ----------------------------------------------------------------");
for (const [label, phase, t] of keyFrames) {
  const s = sample(phase, t);
  const rel = vSub(s.leftPalm, s.grip);
  const along = rel[0] * s.shaftDir[0] + rel[1] * s.shaftDir[1] + rel[2] * s.shaftDir[2];
  const perp = Math.sqrt(Math.max(0, vDist(rel, [0, 0, 0]) ** 2 - along ** 2));
  console.log(
    `${label} head=(${s.clubHead.map((v) => v.toFixed(2)).join(",")}) grip=(${s.grip.map((v) => v.toFixed(2)).join(",")})` +
    ` shR=(${s.shoulderRShot.map((v) => v.toFixed(2)).join(",")}) distBall=${vDist(s.clubHead, BALL_SHOT).toFixed(3)}` +
    ` reachR=${s.reachR.toFixed(3)} reachL=${s.reachL.toFixed(3)} wristErr=${s.wristError.toFixed(3)} LpalmOffShaft=${perp.toFixed(3)} Lalong=${along.toFixed(3)}`
  );
}

// ---- acceptance checks ----------------------------------------------------
const impact = sample("downswing", 1);
const top = sample("top", 0);
const addr = sample("address", 0);
const finish = sample("follow", 1);
const all = rows;
const minHeadY = Math.min(...all.map((r) => r.headY));
const minHeadYPhase = all.reduce((a, b) => (b.headY < a.headY ? b : a));
const maxWrist = Math.max(...all.map((r) => r.wrist));
const maxReachR = Math.max(...all.map((r) => r.reachR));
const maxReachL = Math.max(...all.map((r) => r.reachL));
const maxHandLOff = Math.max(...all.map((r) => r.handL));

console.log("\n-- acceptance -----------------------------------------------------------");
console.log(`impact |clubHead - ball|      = ${vDist(impact.clubHead, BALL_SHOT).toFixed(4)} m  (want <= 0.08, exact by construction)`);
console.log(`top clubHead y              = ${top.clubHead[1].toFixed(3)} m  (want > shoulder y ${Math.max(top.shoulderRShot[1], top.shoulderLShot[1]).toFixed(3)} + margin)`);
console.log(`address clubHead y          = ${addr.clubHead[1].toFixed(3)} / ball y ${BALL_SHOT[1].toFixed(3)}`);
console.log(`arc min head y              = ${minHeadY.toFixed(3)} at ${minHeadYPhase.label} t=${minHeadYPhase.t.toFixed(2)} (want == impact key y, never below ground)`);
console.log(`impact head z (crossing)    = ${impact.clubHead[2].toFixed(3)} (ball z ${BALL_SHOT[2].toFixed(3)})`);
console.log(`finish head y (high wrap)   = ${finish.clubHead[1].toFixed(3)} m over lead shoulder z=${finish.clubHead[2].toFixed(2)}`);
console.log(`max wrist error             = ${maxWrist.toFixed(4)} rad (want ~0 — club follows authored dir)`);
console.log(`max right reach             = ${maxReachR.toFixed(3)} (arm max ${ARM_MAX.toFixed(3)})`);
console.log(`max left reach              = ${maxReachL.toFixed(3)} (arm max ${ARM_MAX.toFixed(3)})`);
console.log(`max left-palm off shaft     = ${maxHandLOff.toFixed(3)} m (want <= 0.03 — both hands grip)`);

// ---- attach calibration round-trip ----------------------------------------
// the engine composes world = model × boneWorld × offset; verify that composing
// the calibrated offset back through the address forearm reproduces the club.
const offsets = clubAttachOffsets(addr.rightForearmWorld, addr.rightElbowModel, addr.grip, addr.shaftDir, root);
console.log("\n-- attach offsets (RightForearm bone space) -----------------------------");
for (const o of offsets) {
  console.log(`${o.id.padEnd(18)} pos (${o.position.map((v) => v.toFixed(3)).join(", ")})  rot (${o.rotation.map((v) => v.toFixed(3)).join(", ")})`);
}

// head z sweep around impact for the evidence predicate (downswing tail)
console.log("\n-- impact approach (downswing tail) --------------------------------------");
for (let i = 16; i <= 20; i++) {
  const t = i / 20;
  const s = sample("downswing", t);
  console.log(`t=${t.toFixed(2)} head=(${s.clubHead.map((v) => v.toFixed(3)).join(", ")}) dist=${vDist(s.clubHead, BALL_SHOT).toFixed(3)}`);
}

// ---- putt: impact key at u=0.5 of putt-through ----------------------------
console.log("\n-- putt -------------------------------------------------------------------");
for (const t of [0, 0.25, 0.5, 0.75, 1]) {
  const s = solveSwing(evaluateSwing("putt-through", t), root);
  console.log(`putt u=${t.toFixed(2)} head=(${s.clubHead.map((v) => v.toFixed(3)).join(", ")}) distBall=${vDist(s.clubHead, BALL_SHOT).toFixed(3)} reachR=${s.reachR.toFixed(3)} reachL=${s.reachL.toFixed(3)} wrist=${s.wristError.toFixed(3)}`);
}
