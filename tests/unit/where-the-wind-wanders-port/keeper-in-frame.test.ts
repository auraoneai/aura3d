/**
 * Owner GPU QA (2026-11-18, 390x844 portrait autoplay): the keeper walked out of the narrow frame and the results card
 * showed only the jetty lantern and the mast. The follow and voyage cameras are re-run here frame by frame (the same
 * easing, clearance and ground lift as world.ts) along the autoplay route and the voyage, and the keeper is projected
 * through a perspective camera at 390/844 and 1280/720: she must stay inside the frustum with a margin, read at
 * >= 15% of the frame height, and sit roughly centred.
 */
import { describe, expect, it } from "vitest";
import { createAutopilot } from "../../../examples/where-the-wind-wanders-port/autopilot";
import { CLEARANCE_CHEST, VOYAGE_SAIL_KEEP_OUT, canopyObstacles, clearedFollowPose, aimForLift, crownClearance, raiseLensKeepingDistance, followCameraClearance, liftLensOverGround, sailObstacles, structureObstacles, voyageLens } from "../../../examples/where-the-wind-wanders-port/camera-clearance";
import { FOLLOW_ZOOM, FOLLOW_ZOOM_Y } from "../../../examples/where-the-wind-wanders-port/camera-seq";
import { buildSceneColliders } from "../../../examples/where-the-wind-wanders-port/colliders";
import { buildScenery } from "../../../examples/where-the-wind-wanders-port/scenery";
import { CAMERA_OFFSET, VIRTUAL_STEP_MS, createState, stepFrame } from "../../../examples/where-the-wind-wanders-port/sim";
import { SEA_LEVEL, terrainHeight } from "../../../examples/where-the-wind-wanders-port/terrain";
import { LANDSCAPE_FOLLOW_RATE, PORTRAIT_FOLLOW_RATE, followFraming, followTargetFor, voyageFraming } from "../../../examples/where-the-wind-wanders-port/world";

type V = [number, number, number];
const sc = buildScenery(4242, { bell: true, cottage: true, trees: true, stones: true, shrubs: true });
const rails = buildSceneColliders(sc, { modelSet: true, stones: true, idol: true }).rails;
const followFixed = [...structureObstacles(), ...sailObstacles(sc.windmillHub)];
const crowns = canopyObstacles(sc.canopies);
const voyageObstacles = [...structureObstacles(), ...sailObstacles(sc.windmillHub, VOYAGE_SAIL_KEEP_OUT)];
const portraitVoyageObstacles = [...voyageObstacles, ...canopyObstacles(sc.canopies)];
const KEEPER_HEIGHT = 1.9;

/** NDC of `p` for a camera at `eye` looking at `target` (up +y), vertical fov in degrees. */
function project(p: V, eye: V, target: V, fovDeg: number, aspect: number): { x: number; y: number; depth: number } {
  const f = norm([target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]]);
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const d: V = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]];
  const depth = dot(d, f);
  const t = Math.tan((fovDeg * Math.PI) / 360);
  return { x: dot(d, r) / (depth * t * aspect), y: dot(d, u) / (depth * t), depth };
}
const dot = (a: V, b: V): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V): V => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function expectFramed(feet: V, eye: V, target: V, fov: number, aspect: number, label: string): void {
  const head: V = [feet[0], feet[1] + KEEPER_HEIGHT, feet[2]];
  const chest: V = [feet[0], feet[1] + 1.3, feet[2]];
  const pf = project(feet, eye, target, fov, aspect), ph = project(head, eye, target, fov, aspect), pc = project(chest, eye, target, fov, aspect);
  expect(pc.depth, `${label}: in front of the lens`).toBeGreaterThan(1);
  for (const [n, q] of [["feet", pf], ["head", ph]] as const) {
    expect(Math.abs(q.x), `${label}: ${n} x ${q.x.toFixed(2)}`).toBeLessThan(0.85);
    expect(Math.abs(q.y), `${label}: ${n} y ${q.y.toFixed(2)}`).toBeLessThan(0.92);
  }
  expect(Math.abs(pc.x), `${label}: centred-ish`).toBeLessThan(0.6);
  expect((ph.y - pf.y) / 2, `${label}: height share`).toBeGreaterThanOrEqual(0.15);
}

const ASPECTS = [["portrait 390x844", 390 / 844], ["landscape 1280x720", 1280 / 720]] as const;

describe("the keeper stays in frame along the autoplay walk", () => {
  it.each(ASPECTS)("%s", { timeout: 120_000 }, (label, aspect) => {
    const s = createState();
    const pilot = createAutopilot();
    const dt = VIRTUAL_STEP_MS / 1000;
    const y0 = terrainHeight(s.pos.x, s.pos.z);
    const look = { x: s.pos.x + 2, y: y0 + 1.8, z: s.pos.z - 3.5 };
    let boom = 1, checked = 0, crownRise = 0;
    const framing = followFraming(0, aspect);
    for (let f = 0; f < 120 / dt && !s.complete; f++) {
      stepFrame(s, pilot.next(s, dt), VIRTUAL_STEP_MS, rails);
      const y = terrainHeight(s.pos.x, s.pos.z) + s.hop.height;
      const [tx, ty, tz] = followTargetFor(s.pos.x, y - s.hop.height, s.pos.z, { x: 0, z: 0 }, 0, aspect);
      const k = 1 - Math.exp(-(aspect < 1 ? PORTRAIT_FOLLOW_RATE : LANDSCAPE_FOLLOW_RATE) * dt);
      look.x += (tx - look.x) * k; look.y += (ty - look.y) * k; look.z += (tz - look.z) * k;
      let cp: V = [look.x + CAMERA_OFFSET.x * FOLLOW_ZOOM, look.y + framing.y * FOLLOW_ZOOM_Y, look.z + CAMERA_OFFSET.z * FOLLOW_ZOOM];
      let target: V = [look.x, look.y, look.z];
      const chest: V = [s.pos.x, y + CLEARANCE_CHEST, s.pos.z];
      const crown = crownClearance(chest, cp, crowns);
      const want = Math.min(followCameraClearance(chest, cp, followFixed), crown.frac);
      boom = want <= boom ? want : boom + (want - boom) * (1 - Math.exp(-2.2 * dt));
      if (boom < 0.999) { const c = clearedFollowPose(chest, cp, target, boom); cp = c.position; target = c.target; }
      const preLiftY = cp[1];
      crownRise += (crown.lift - crownRise) * (1 - Math.exp(-(crown.lift > crownRise ? 10 : 2) * dt));
      cp = raiseLensKeepingDistance(chest, cp, crownRise);
      cp = raiseLensKeepingDistance(chest, cp, liftLensOverGround(chest, cp, terrainHeight)[1] - cp[1]);
      cp = liftLensOverGround(chest, cp, terrainHeight);
      target = aimForLift(target, chest, cp[1] - preLiftY);
      if (f > 30 && f % 10 === 0) { expectFramed([s.pos.x, y, s.pos.z], cp, target, framing.fov, aspect, `${label} frame ${f} at (${s.pos.x.toFixed(1)}, ${s.pos.z.toFixed(1)})`); checked++; }
    }
    expect(s.complete).toBe(true);
    expect(checked).toBeGreaterThan(100);
  });
});

describe("the keeper in the boat stays in frame on the voyage (results card)", () => {
  const boat = (e: number) => {
    const u = Math.min(1, Math.max(0, e - 4) / 80), ease = u * u * (3 - 2 * u);
    return { x: sc.boatMoor.x + (-22 - sc.boatMoor.x) * ease + 6 * Math.sin(ease * Math.PI), y: SEA_LEVEL + 0.02, z: sc.boatMoor.z + (-108 - sc.boatMoor.z) * ease };
  };
  it.each(ASPECTS)("%s, autoplay cut to the jetty, first 20 s", (label, aspect) => {
    const v0 = voyageFraming(boat(0), 0, aspect);
    const look = { x: v0.target[0], y: v0.target[1], z: v0.target[2] };
    let eye: V | null = null;
    for (let e = 0; e < 20; e += 0.05) {
      const b = boat(e), vf = voyageFraming(b, e, aspect), a = 1 - Math.exp(-1.5 * 0.05);
      look.x += (vf.target[0] - look.x) * a; look.y += (vf.target[1] - look.y) * a; look.z += (vf.target[2] - look.z) * a;
      const goal = voyageLens([look.x, look.y, look.z], [look.x + vf.offset[0], look.y + vf.offset[1], look.z + vf.offset[2]], aspect < 1 ? portraitVoyageObstacles : voyageObstacles, terrainHeight);
      const ka = 1 - Math.exp(-5 * 0.05);
      eye = eye ? [eye[0] + (goal[0] - eye[0]) * ka, eye[1] + (goal[1] - eye[1]) * ka, eye[2] + (goal[2] - eye[2]) * ka] : goal;
      // the keeper sits in the boat (world.ts: hero at b + (0, 0.55, -0.3)), seated ~1.2 m tall: frame her from the hull
      if (aspect < 1) expectFramed([b.x, b.y + 0.3, b.z - 0.3], eye, [look.x, look.y, look.z], vf.fov, aspect, `${label} voyage e=${e.toFixed(2)}`);
      else {
        const p = project([b.x, b.y + 1.5, b.z - 0.3], eye, [look.x, look.y, look.z], vf.fov, aspect);
        expect(Math.abs(p.x) < 0.9 && Math.abs(p.y) < 0.9 && p.depth > 1, `${label} voyage e=${e.toFixed(2)}`).toBe(true);
      }
    }
  });
});
