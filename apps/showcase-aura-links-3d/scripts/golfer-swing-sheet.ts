/**
 * Swing verification tool (offline, no browser): solves the swing at 12 phase samples for the Meshy golfer and for the original
 * athlete, prints the joint read-outs (elbow flexion, shoulder elevation, shoulder / hip turn, arm side, shaft) and renders stick-figure
 * contact sheets (face-on, down-the-line and the in-game 3/4 camera behind-right of the player) as PNG via sharp.
 *
 * Run (from the repo root): pnpm exec tsx apps/showcase-aura-links-3d/scripts/golfer-swing-sheet.ts <label> [outDir]
* Output: <outDir>/<label>-{meshy,old}-{front,dtl,game,keys}.png and <label>-metrics.txt (default outDir tests/reports/golfer-swing).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { meshyProfile } from "../src/game/golferRetarget";
import { poseJoints, swingMetrics, type PoseJoints } from "../src/game/swingAnalysis";
import {
  BALL_SHOT, SKELETON_ATHLETE, evaluateSwing, makeRoot, solveSwing, toModel, useSkeleton, vAdd, vDot, vScale, vSub,
  type SkeletonProfile, type SwingPosePhase, type V3
} from "../src/game/swingMath";

export const SAMPLES: ReadonlyArray<readonly [string, SwingPosePhase, number]> = [
  ["address", "address", 0], ["back .33", "backswing", 0.33], ["back .66", "backswing", 0.66], ["top", "top", 0],
  ["down .3", "downswing", 0.3], ["down .65", "downswing", 0.65], ["down .85", "downswing", 0.85], ["impact", "downswing", 1],
  ["thru .2", "follow", 0.2], ["thru .45", "follow", 0.45], ["thru .7", "follow", 0.7], ["finish", "follow", 1]
];

/** camera azimuth (deg, 0 = in front of the golfer looking at him, 90 = from his left side, 180 = behind, 270 = from his right) and pitch */
const VIEWS = { front: { az: 0, pitch: 0 }, dtl: { az: 270, pitch: 0 }, game: { az: 217, pitch: 12 } } as const;

const sharp: any = createRequire(import.meta.url)(
  createRequire(import.meta.url).resolve("sharp", { paths: [process.cwd(), resolve(process.cwd(), "node_modules/.pnpm/node_modules")] })
);

function project(p: V3, az: number, pitch: number): { x: number; y: number; depth: number } {
  const a = (az * Math.PI) / 180, e = (pitch * Math.PI) / 180;
  const c: V3 = [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)];
  const right: V3 = [Math.cos(a), 0, -Math.sin(a)];
  const up: V3 = [c[1] * right[2] - c[2] * right[1], c[2] * right[0] - c[0] * right[2], c[0] * right[1] - c[1] * right[0]];
  return { x: vDot(p, right), y: vDot(p, up), depth: vDot(p, c) };
}

let CELL_W = 230, CELL_H = 330, PX = 112;

function cellSvg(j: PoseJoints, ball: V3, label: string, az: number, pitch: number, ox: number): string {
  const centre = project([0.0, 0, 0], az, pitch);
  const P = (p: V3) => { const q = project(p, az, pitch); return { x: ox + CELL_W / 2 + (q.x - centre.x) * PX, y: CELL_H - 40 - (q.y - centre.y) * PX, d: q.depth }; };
  type Seg = { a: V3; b: V3; col: string; w: number };
  const segs: Seg[] = [
    { a: j.hips, b: j.spine, col: "#9aa", w: 7 }, { a: j.spine, b: j.chest, col: "#9aa", w: 7 }, { a: j.chest, b: j.neck, col: "#9aa", w: 5 },
    { a: j.shoulderL, b: j.shoulderR, col: "#e8e8e8", w: 5 }, { a: j.hipJointL, b: j.hipJointR, col: "#777", w: 5 },
    { a: j.shoulderL, b: j.elbowL, col: "#38bdf8", w: 5 }, { a: j.elbowL, b: j.palmL, col: "#7dd3fc", w: 4 },
    { a: j.shoulderR, b: j.elbowR, col: "#f43f5e", w: 5 }, { a: j.elbowR, b: j.palmR, col: "#fb7185", w: 4 },
    { a: j.hipJointL, b: j.kneeL, col: "#3b82f6", w: 5 }, { a: j.kneeL, b: j.ankleL, col: "#60a5fa", w: 4 },
    { a: j.hipJointR, b: j.kneeR, col: "#ef4444", w: 5 }, { a: j.kneeR, b: j.ankleR, col: "#f87171", w: 4 },
    { a: j.grip, b: j.clubHead, col: "#facc15", w: 3 }
  ];
  const ground = [P([-1, 0, 0]), P([1, 0, 0])];
  const body = segs.map((s) => ({ ...s, pa: P(s.a), pb: P(s.b) })).sort((a, b) => (a.pa.d + a.pb.d) - (b.pa.d + b.pb.d));
  const head = P(j.head);
  const ballP = P(ball);
  const club = P(j.clubHead);
  return [
    `<rect x="${ox}" y="0" width="${CELL_W}" height="${CELL_H}" fill="#101418" stroke="#222"/>`,
    `<line x1="${ground[0]!.x}" y1="${ground[0]!.y}" x2="${ground[1]!.x}" y2="${ground[1]!.y}" stroke="#355" stroke-width="2"/>`,
    ...body.map((s) => `<line x1="${s.pa.x.toFixed(1)}" y1="${s.pa.y.toFixed(1)}" x2="${s.pb.x.toFixed(1)}" y2="${s.pb.y.toFixed(1)}" stroke="${s.col}" stroke-width="${s.w}" stroke-linecap="round"/>`),
    `<circle cx="${head.x.toFixed(1)}" cy="${head.y.toFixed(1)}" r="${(0.095 * PX).toFixed(1)}" fill="none" stroke="#ddd" stroke-width="3"/>`,
    `<circle cx="${club.x.toFixed(1)}" cy="${club.y.toFixed(1)}" r="6" fill="#facc15"/>`,
    `<circle cx="${ballP.x.toFixed(1)}" cy="${ballP.y.toFixed(1)}" r="4" fill="#fff"/>`,
    `<text x="${ox + 8}" y="18" fill="#cde" font-family="Helvetica,Arial,sans-serif" font-size="14">${label}</text>`
  ].join("");
}

async function sheet(profile: SkeletonProfile, name: string, outDir: string, label: string): Promise<string> {
  useSkeleton(profile);
  const root = makeRoot(0);
  const ballModel = toModel(root, BALL_SHOT);
  const rows: string[] = [];
  const lines: string[] = [`== ${label} ${name} (${profile.id}) ==`];
  lines.push("sample      elbL elbR  shElL shElR  shTurn hipTurn  X-fac  handsAbvLeadSh  sideL  sideR  shaftEl headClr hipShift palmFace extL extR elbRiseL elbRiseR");
  const joints: Array<{ lab: string; j: PoseJoints }> = [];
  for (const [lab, phase, t] of SAMPLES) {
    const s = solveSwing(evaluateSwing(phase, t), root);
    const m = swingMetrics(s, root);
    joints.push({ lab, j: poseJoints(s, root) });
    const f = (v: number, w = 6, d = 1) => v.toFixed(d).padStart(w);
    lines.push(`${lab.padEnd(10)} ${f(m.elbowFlexL)} ${f(m.elbowFlexR)} ${f(m.shoulderElevL, 6)} ${f(m.shoulderElevR, 5)} ${f(m.shoulderTurn, 7)} ${f(m.hipTurn, 7)} ${f(m.xFactor, 6)} ${f(m.handsAboveLeadShoulder, 12, 3)} ${f(m.sideL, 7, 3)} ${f(m.sideR, 6, 3)} ${f(m.shaftElevation, 7)} ${f(m.headClearance, 7, 3)} ${f(m.hipShift, 8, 3)} ${f(m.palmFacing, 8, 2)} ${f(m.extensionL, 5, 2)} ${f(m.extensionR, 5, 2)} ${f(m.elbowRiseL, 8, 3)} ${f(m.elbowRiseR, 8, 3)}`);
  }
  for (const [vn, v] of Object.entries(VIEWS)) {
    const cells = joints.map((c, i) => cellSvg(c.j, ballModel, `${c.lab}  [${vn}]`, v.az, v.pitch, i * CELL_W));
    const cols = 6;
    // two rows of 6 cells
    const svgRows = [0, 1].map((r) => joints.slice(r * cols, r * cols + cols).map((c, i) => cellSvg(c.j, ballModel, `${c.lab}  [${vn}]`, v.az, v.pitch, i * CELL_W)).join(""));
    void cells;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL_W * cols}" height="${CELL_H * 2}">` +
      `<g>${svgRows[0]}</g><g transform="translate(0 ${CELL_H})">${svgRows[1]}</g></svg>`;
    const file = resolve(outDir, `${label}-${name}-${vn}.png`);
    await sharp(Buffer.from(svg)).png().toFile(file);
    rows.push(file);
  }
  // large key-pose sheet: address, top, impact, finish in the three views (rows)
  const KEYS = ["address", "top", "impact", "finish"];
  const keyJoints = KEYS.map((k) => joints.find((c) => c.lab === k)!);
  const saved = [CELL_W, CELL_H, PX];
  CELL_W = 300; CELL_H = 420; PX = 175;
  const keyRows = Object.entries(VIEWS).map(([vn, v], r) =>
    `<g transform="translate(0 ${r * CELL_H})">${keyJoints.map((c, i) => cellSvg(c.j, ballModel, `${c.lab}  [${vn}]`, v.az, v.pitch, i * CELL_W)).join("")}</g>`);
  const keySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL_W * KEYS.length}" height="${CELL_H * 3}">${keyRows.join("")}</svg>`;
  const keyFile = resolve(outDir, `${label}-${name}-keys.png`);
  await sharp(Buffer.from(keySvg)).png().toFile(keyFile);
  [CELL_W, CELL_H, PX] = saved as [number, number, number];
  rows.push(keyFile);
  lines.push(`sheets: ${rows.join(", ")}`);
  return lines.join("\n");
}

const label = process.argv[2] ?? "run";
const outDir = resolve(process.argv[3] ?? "tests/reports/golfer-swing");
mkdirSync(outDir, { recursive: true });
const text = [await sheet(meshyProfile(), "meshy", outDir, label), await sheet(SKELETON_ATHLETE, "old", outDir, label)].join("\n\n");
useSkeleton(SKELETON_ATHLETE);
writeFileSync(resolve(outDir, `${label}-metrics.txt`), text + "\n");
console.log(text);
