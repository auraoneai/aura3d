/**
 * Pass-through (owner QA 2026-11-18): the keeper bumps into the solid scenery she can see instead of walking through it,
 * and nothing solid stands in the walking path. The extra colliders must not change the original's recorded route.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildSceneColliders, type SceneColliders } from "../../../examples/where-the-wind-wanders-port/colliders";
import {
  PATH_HALF_WIDTH, PATH_LANTERNS, SHRINE_R, SHRINE_SPOT, SIGNPOSTS, SIGNPOST_R, VILLAGER_R, VILLAGER_SPOTS, LANTERN_R
} from "../../../examples/where-the-wind-wanders-port/decor-layout";
import { buildScenery } from "../../../examples/where-the-wind-wanders-port/scenery";
import { PLAYER_RADIUS, RAILS, START, createState, runScript, stepFrame, type ScriptSegment, type Vec2 } from "../../../examples/where-the-wind-wanders-port/sim";
import { pathZ } from "../../../examples/where-the-wind-wanders-port/terrain";

const ref = JSON.parse(readFileSync("evidence/crayon-capture/where-the-wind-wanders-reference.json", "utf8")) as {
  script: ScriptSegment[]; steps: number; xs: number[]; zs: number[]; tolerance: { positionUnits: number };
};

const live = buildScenery(4242, { bell: true, cottage: true, trees: true, stones: true, shrubs: true });
const proc = buildScenery(4242, {});
const liveColliders = buildSceneColliders(live, { modelSet: true, stones: true, idol: true });
const procColliders = buildSceneColliders(proc, { modelSet: false, stones: false, idol: false });

/** Walk straight from `from` toward `to` (keys resolved through the camera-relative axes by steering each frame). */
function walkToward(from: Vec2, to: Vec2, rails: SceneColliders["rails"], frames = 120): Vec2 {
  const s = createState();
  s.pos = { ...from };
  // pin the camera behind the keeper so W/A/S/D map onto the analytic axes every frame
  for (let i = 0; i < frames; i++) {
    const dx = to.x - s.pos.x, dz = to.z - s.pos.z;
    if (Math.hypot(dx, dz) < 0.02) break;
    const camDx = s.cam.vx - s.cam.bx, camDz = s.cam.vz - s.cam.bz, len = Math.hypot(camDx, camDz) || 1;
    const right = { x: camDz / len, z: -camDx / len }, up = { x: -right.z, z: right.x };
    // project the wanted direction on the walking axes and hold the dominant key(s)
    const gx = dx * right.x + dz * right.z, gz = dx * up.x + dz * up.z;
    const keys = (Math.abs(gx) > 0.25 * Math.abs(gz) ? (gx > 0 ? "D" : "A") : "") + (Math.abs(gz) > 0.25 * Math.abs(gx) ? (gz > 0 ? "S" : "W") : "");
    stepFrame(s, { keys, act: null }, undefined, rails);
  }
  return s.pos;
}

describe("Bellkeeper pass-through: nothing solid in the walking path", () => {
  const decor: [string, number, number, number][] = [
    ...SIGNPOSTS.map(([x, z]) => ["signpost", x, z, SIGNPOST_R] as [string, number, number, number]),
    ...VILLAGER_SPOTS.map((v) => ["villager", v.x, v.z, VILLAGER_R] as [string, number, number, number]),
    ...PATH_LANTERNS.map(([x, z]) => ["lantern", x, z, LANTERN_R] as [string, number, number, number]),
    ["shrine", SHRINE_SPOT[0], SHRINE_SPOT[1], SHRINE_R]
  ];
  it.each(decor)("%s at (%f, %f) stands clear of the path band", (_k, x, z, r) => {
    expect(Math.abs(z - pathZ(x))).toBeGreaterThanOrEqual(PATH_HALF_WIDTH + r - 1e-6);
  });
  it("no tree trunk, rock or standing stone footprint intersects the path band", () => {
    for (const c of liveColliders.circles) {
      if (c.x < -52 || c.x > 58) continue;
      expect(Math.abs(c.z - pathZ(c.x)), `${c.kind} at ${c.x.toFixed(1)},${c.z.toFixed(1)}`).toBeGreaterThanOrEqual(PATH_HALF_WIDTH + c.r - 1e-6);
    }
  });
});

describe("Bellkeeper pass-through: every solid piece blocks the keeper at its drawn footprint", () => {
  it("collects the live (Idol model set) and procedural solids", () => {
    const kinds = new Set(liveColliders.circles.map((c) => c.kind));
    for (const k of ["trunk", "rock", "sign", "villager", "lantern", "shrine", "stone"]) expect(kinds.has(k as never), k).toBe(true);
    expect(liveColliders.circles.filter((c) => c.kind === "trunk").length).toBeGreaterThan(40);
    expect(liveColliders.lines.filter((l) => l.kind === "fence").length).toBe(8);
    expect(liveColliders.lines.filter((l) => l.kind === "parapet").length).toBe(2);
    expect(liveColliders.boxes.filter((b) => b.kind === "wall").length).toBe(2);
    expect(procColliders.circles.filter((c) => c.kind === "trunk").length).toBeGreaterThan(40);
    expect(liveColliders.rails.length).toBe(RAILS.length + liveColliders.circles.length + liveColliders.boxes.length + liveColliders.lines.length);
  });

  it.each([["live", liveColliders], ["procedural", procColliders]] as const)("%s: walking into each solid circle stops at its rim", { timeout: 120_000 }, (_n, col) => {
    for (const c of col.circles) {
      // approach from the side that is open meadow (towards the start), 2.5 m out
      const ang = Math.atan2(START.z - c.z, START.x - c.x);
      const from = { x: c.x + Math.cos(ang) * (c.r + 2.5), z: c.z + Math.sin(ang) * (c.r + 2.5) };
      const end = walkToward(from, { x: c.x, z: c.z }, col.rails);
      expect(Math.hypot(end.x - c.x, end.z - c.z), `${c.kind} at ${c.x.toFixed(1)},${c.z.toFixed(1)}`).toBeGreaterThanOrEqual(c.r + PLAYER_RADIUS * 0.9);
    }
  });

  it("the model-set fence is solid along the full bay (the old sprite rails left 1.4 m gaps between bays)", () => {
    for (const x of [-16, -12, 27, 31]) {
      const z = x < 0 ? -4 : 7;
      const before = walkToward({ x, z: z + 2 }, { x, z: z - 2 }, RAILS);
      expect(before.z, `old rails let her through at x=${x}`).toBeLessThan(z);
      const after = walkToward({ x, z: z + 2 }, { x, z: z - 2 }, liveColliders.rails);
      expect(after.z, `fence at x=${x}`).toBeGreaterThan(z);
    }
  });

  it("the packhorse bridge parapets stop a walk along the stream under the span", () => {
    const end = walkToward({ x: -9, z: -6.6 }, { x: 1, z: -6.6 }, liveColliders.rails, 400);
    expect(end.x).toBeLessThan(-4);
  });

  it("the Idol cottage's corners are solid (the sim circle alone let her clip them)", () => {
    const corner = { x: -4 - 3.2, z: -13 + 3.7 };
    const end = walkToward({ x: corner.x - 1.6, z: corner.z + 1.6 }, corner, liveColliders.rails);
    expect(Math.hypot(end.x - corner.x, end.z - corner.z)).toBeGreaterThan(0.3);
  });
});

describe("Bellkeeper pass-through: the original route is unchanged", () => {
  it("the reference replay with every scene collider still reproduces the original trajectory", () => {
    const { xs, zs } = runScript(ref.script, undefined, liveColliders.rails);
    let worst = 0;
    for (let i = 0; i < ref.steps; i++) worst = Math.max(worst, Math.hypot(xs[i]! - ref.xs[i]!, zs[i]! - ref.zs[i]!));
    expect(worst).toBeLessThanOrEqual(ref.tolerance.positionUnits);
  });
});
