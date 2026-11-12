import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  HOOPS_ATHLETE_JOINT_SUFFIXES,
  HOOPS_BIG_HEIGHT,
  HOOPS_GUARD_HEIGHT,
  buildArticulatedHoopsAthleteNode,
  computeHoopsAthleteJointPose
} from "../../../apps/showcase-aura-hoops-3d/src/art/proceduralModels";
import { assets } from "../../../apps/showcase-aura-hoops-3d/src/aura-assets.route";

const ROOT = path.resolve(__dirname, "../../..");
const APP_DIR = path.join(ROOT, "apps/showcase-aura-hoops-3d");
const MAIN = readFileSync(path.join(APP_DIR, "src/main.ts"), "utf8");

function findGlbFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...findGlbFiles(full));
    else if (entry.endsWith(".glb")) out.push(full);
  }
  return out;
}

function collectWorldBoundsAndJoints(
  node: unknown,
  offset: readonly [number, number, number] = [0, 0, 0],
  parentScale: readonly [number, number, number] = [1, 1, 1],
  joints = new Set<string>(),
  materials = new Set<string>()
): { minY: number; maxY: number; joints: Set<string>; materials: Set<string> } {
  const raw = (typeof (node as { toJSON?: unknown })?.toJSON === "function"
    ? (node as { toJSON(): Record<string, unknown> }).toJSON()
    : node) as Record<string, unknown>;
  const pos = (raw.position as readonly [number, number, number] | undefined) ?? [0, 0, 0];
  const sc = (raw.scale as readonly [number, number, number] | undefined) ?? [1, 1, 1];
  const worldScale: readonly [number, number, number] = [
    parentScale[0] * sc[0],
    parentScale[1] * sc[1],
    parentScale[2] * sc[2]
  ];
  const worldPos: readonly [number, number, number] = [
    offset[0] + pos[0] * parentScale[0],
    offset[1] + pos[1] * parentScale[1],
    offset[2] + pos[2] * parentScale[2]
  ];
  if (typeof raw.name === "string") joints.add(raw.name);
  if (raw.material && typeof raw.material === "object") {
    const m = raw.material as Record<string, unknown>;
    materials.add(`${String(m.kind ?? "pbr")}:${String(m.color ?? "")}`);
  }
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const geom = raw.geometry as { positions?: ArrayLike<number> } | undefined;
  if (geom?.positions) {
    for (let i = 0; i < geom.positions.length; i += 3) {
      const x = geom.positions[i]! * worldScale[0] + worldPos[0];
      const y = geom.positions[i + 1]! * worldScale[1] + worldPos[1];
      const z = geom.positions[i + 2]! * worldScale[2] + worldPos[2];
      expect(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)).toBe(true);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  for (const child of (raw.children as unknown[] | undefined) ?? []) {
    const sub = collectWorldBoundsAndJoints(child, worldPos, worldScale, joints, materials);
    if (sub.minY < minY) minY = sub.minY;
    if (sub.maxY > maxY) maxY = sub.maxY;
  }
  return { minY, maxY, joints, materials };
}

describe("Aura Hoops procedural articulated athlete rigs", () => {
  it("ships zero Meshy .glb files or model entries inside showcase-aura-hoops-3d", () => {
    expect(findGlbFiles(APP_DIR)).toEqual([]);
    const modelEntries = Object.entries(assets as Record<string, { type?: string }>).filter(([, v]) => v.type === "model");
    expect(modelEntries).toEqual([]);
  });

  for (const [label, id, big, expectedHeight] of [
    ["guard", "p0", false, HOOPS_GUARD_HEIGHT],
    ["big", "p1", true, HOOPS_BIG_HEIGHT]
  ] as const) {
    it(`${label} (${id}): sculpted multi-material 14-joint rig is grounded at y=0 and hits canonical height`, () => {
      const node = buildArticulatedHoopsAthleteNode(id, {
        kit: { jersey: "#ff7a1a", shorts: "#1a1206", trim: "#ffd257", skin: "#8d5b3e", shoe: "#f2f0e2" },
        big
      });
      const stats = collectWorldBoundsAndJoints(node);
      for (const suffix of HOOPS_ATHLETE_JOINT_SUFFIXES) {
        expect(stats.joints.has(`${id}-${suffix}`), `missing joint ${id}-${suffix}`).toBe(true);
      }
      expect(stats.materials.size).toBeGreaterThanOrEqual(5);
      expect(stats.minY).toBeGreaterThanOrEqual(-0.015);
      expect(stats.minY).toBeLessThanOrEqual(0.008);
      expect(stats.maxY).toBeGreaterThan(expectedHeight * 0.92);
      expect(stats.maxY).toBeLessThan(expectedHeight * 1.08);
    });
  }

  it("drives stateless ZYX Euler poses across stance, pound dribble, sprint, jump-shot, dunk, and contest", () => {
    const base = { id: "p0", x: 0, y: 0, z: 6, yaw: 0, big: false, speed: 0, time: 1.2 };
    const idle = computeHoopsAthleteJointPose({ ...base, clip: "Ready", stanceNow: true });
    const dribble = computeHoopsAthleteJointPose({
      ...base,
      clip: "Ready",
      stanceNow: true,
      dribbleNow: true,
      dribbleCycleT: 0.33
    });
    const sprint = computeHoopsAthleteJointPose({ ...base, clip: "Sprint_Loop", speed: 6.2, time: 0.45 });
    const shoot = computeHoopsAthleteJointPose({ ...base, clip: "Shoot", shooting: true, shotMeterT: 0.65 });
    const dunk = computeHoopsAthleteJointPose({ ...base, clip: "Jump", y: 0.65, dunkT: 0.32, dunkKind: "POWER JAM" });
    const contest = computeHoopsAthleteJointPose({ ...base, clip: "Contest", y: 0.42, jumpT: 0.4 });

    for (const pose of [idle, dribble, sprint, shoot, dunk, contest]) {
      for (const rot of Object.values(pose.rotations)) {
        expect(rot.every(Number.isFinite)).toBe(true);
      }
      expect(pose.palmRWorld.every(Number.isFinite)).toBe(true);
      expect(pose.palmLWorld.every(Number.isFinite)).toBe(true);
    }
    expect(dribble.hipsPos[1]).toBeLessThan(idle.hipsPos[1] - 0.12);
    expect(shoot.palmRWorld[1]).toBeGreaterThan(idle.palmRWorld[1] + 0.45);
    expect(dunk.palmRWorld[1]).toBeGreaterThan(shoot.palmRWorld[1]);
    expect(contest.palmRWorld[1]).toBeGreaterThan(idle.palmRWorld[1] + 0.4);
    expect(Math.abs(sprint.rotations["leg-l"][0] - sprint.rotations["leg-r"][0])).toBeGreaterThan(0.4);
  });

  it("relaxed arms hang nearly straight: hand drop leaves under 10 cm of elbow bend on the 0.555 m arm", () => {
    const drop = Number(/const IDLE_HAND_DROP = ([0-9.]+);/.exec(MAIN)![1]);
    const [l1, l2] = [0.255, 0.3];
    const s = (l1 + l2 + drop) / 2;
    const bend = (2 * Math.sqrt(s * (s - l1) * (s - l2) * (s - drop))) / drop;
    expect(drop).toBeLessThanOrEqual(l1 + l2);
    expect(bend).toBeLessThan(0.1);
    expect(MAIN).toContain("const flare = dribbleNow ? 0.22 : 0.06;");
  });

  it("runs the frame loop behind the library frame error boundary", () => {
    // invariant: source must keep `createFrameErrorBoundary` — one throwing Hoops frame is contained by the library boundary instead of freezing the game loop
    expect(MAIN).toContain("createFrameErrorBoundary");
    expect(MAIN).toMatch(/frameBoundary\.run\(\(\) => \{[\s\S]*frame\(dt\)/);
  });
});
