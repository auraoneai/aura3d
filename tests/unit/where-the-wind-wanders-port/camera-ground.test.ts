/**
 * Owner GPU QA (2026-11-18, autoplay ~28 s): at the shore letter the follow lens sat in an oak crown and a flat dark-green
 * blob hid the keeper. The follow camera now pulls in before any tree crown and keeps itself and its sight line above
 * the ground. Checked along the whole autoplay route and at the three letters and the bell, at the steady follow pose.
 */
import { describe, expect, it } from "vitest";
import { createAutopilot } from "../../../examples/where-the-wind-wanders-port/autopilot";
import {
  CLEARANCE_CHEST, LENS_GROUND_MARGIN, SAIL_RADIUS, SIGHT_GROUND_MARGIN, VOYAGE_SAIL_KEEP_OUT, canopyObstacles, clearedFollowPose, crownClearance, raiseLensKeepingDistance, followCameraClearance,
  insideSailSweep, liftLensOverGround, sailObstacles, structureObstacles, voyageLens
} from "../../../examples/where-the-wind-wanders-port/camera-clearance";
import { FOLLOW_ZOOM, FOLLOW_ZOOM_Y } from "../../../examples/where-the-wind-wanders-port/camera-seq";
import { buildSceneColliders } from "../../../examples/where-the-wind-wanders-port/colliders";
import { buildScenery } from "../../../examples/where-the-wind-wanders-port/scenery";
import { SEA_LEVEL } from "../../../examples/where-the-wind-wanders-port/terrain";
import { EPILOGUE_CAMERA_RISE } from "../../../examples/where-the-wind-wanders-port/world";
import { BELL, CAMERA_OFFSET, LETTERS, VIRTUAL_STEP_MS, createState, stepFrame } from "../../../examples/where-the-wind-wanders-port/sim";
import { terrainHeight } from "../../../examples/where-the-wind-wanders-port/terrain";

const sc = buildScenery(4242, { bell: true, cottage: true, trees: true, stones: true, shrubs: true });
const rails = buildSceneColliders(sc, { modelSet: true, stones: true, idol: true }).rails;
const followFixed = [...structureObstacles(), ...sailObstacles(sc.windmillHub)];
const crowns = canopyObstacles(sc.canopies);
const voyageObstacles = [...structureObstacles(), ...sailObstacles(sc.windmillHub, VOYAGE_SAIL_KEEP_OUT)];
const hub = sc.windmillHub;

/** The world's settled follow pose (world.ts): look target, FOLLOW_ZOOM lens, crown/building pull-in, ground lift. */
function followEye(x: number, z: number): { eye: [number, number, number]; chest: [number, number, number] } {
  const y = terrainHeight(x, z);
  const look: [number, number, number] = [x + 2, y + 1.8, z - 3.5];
  const lens: [number, number, number] = [look[0] + CAMERA_OFFSET.x * FOLLOW_ZOOM, look[1] + CAMERA_OFFSET.y * FOLLOW_ZOOM_Y, look[2] + CAMERA_OFFSET.z * FOLLOW_ZOOM];
  const chest: [number, number, number] = [x, y + CLEARANCE_CHEST, z];
  const crown = crownClearance(chest, lens, crowns);
  const frac = Math.min(followCameraClearance(chest, lens, followFixed), crown.frac);
  const cp = frac < 0.999 ? clearedFollowPose(chest, lens, look, frac).position : lens;
  const lifted = raiseLensKeepingDistance(chest, cp, crown.lift);
  return { eye: liftLensOverGround(chest, lifted, terrainHeight), chest };
}

function expectClear(x: number, z: number, label: string): void {
  const { eye, chest } = followEye(x, z);
  expect(eye[1], `${label}: lens above ground`).toBeGreaterThanOrEqual(terrainHeight(eye[0], eye[2]) + LENS_GROUND_MARGIN - 1e-6);
  for (let i = 2; i <= 10; i++) {
    const t = i / 10;
    const px = chest[0] + (eye[0] - chest[0]) * t, pz = chest[2] + (eye[2] - chest[2]) * t, py = chest[1] + (eye[1] - chest[1]) * t;
    expect(py, `${label}: sight line over the ground at t=${t}`).toBeGreaterThanOrEqual(terrainHeight(px, pz) + SIGHT_GROUND_MARGIN - 1e-3);
  }
  expect(insideSailSweep(eye, hub), `${label}: lens inside the sail sweep`).toBe(false);
  for (const c of sc.canopies) {
    const inside = Math.hypot(eye[0] - c.x, eye[2] - c.z) < c.r * 1.3 && eye[1] > c.minY && eye[1] < c.maxY + 0.6;
    expect(inside, `${label}: lens inside the crown at ${c.x.toFixed(1)},${c.z.toFixed(1)}`).toBe(false);
  }
}

describe("Bellkeeper follow camera keeps clear of the ground and tree crowns", () => {
  it("at the three letters and the bell", () => {
    for (const l of LETTERS) for (const [dx, dz] of [[0, 1.6], [1.2, 1.2], [-1.2, 1.2], [0, 2.4]]) expectClear(l.x + dx, l.z + dz, `${l.id} letter`);
    for (const [dx, dz] of [[-2.4, -0.7], [-2, 1], [0, 2.4]]) expectClear(BELL.x + dx, BELL.z + dz, "bell");
  });

  it("the shore letter spot (the GPU defect) lifts or slides the lens clear of the oak crown behind it", () => {
    const chest: [number, number, number] = [31, terrainHeight(31, -13.3) + CLEARANCE_CHEST, -13.3];
    const y = terrainHeight(31, -13.3);
    const lens: [number, number, number] = [33 + CAMERA_OFFSET.x * FOLLOW_ZOOM, y + 1.8 + CAMERA_OFFSET.y * FOLLOW_ZOOM_Y, -16.8 + CAMERA_OFFSET.z * FOLLOW_ZOOM];
    const c = crownClearance(chest, lens, crowns);
    expect(c.lift > 0.2 || c.frac < 0.999).toBe(true);
    expectClear(31, -13.3, "shore letter");
  });

  it("along the whole autoplay route", { timeout: 120_000 }, () => {
    const s = createState();
    const pilot = createAutopilot();
    const dt = VIRTUAL_STEP_MS / 1000;
    let samples = 0;
    for (let f = 0; f < 120 / dt && !s.complete; f++) {
      stepFrame(s, pilot.next(s, dt), VIRTUAL_STEP_MS, rails);
      if (f % 20 === 0) { expectClear(s.pos.x, s.pos.z, `route frame ${f} (${s.pos.x.toFixed(1)}, ${s.pos.z.toFixed(1)})`); samples++; }
    }
    expect(s.complete).toBe(true);
    expect(samples).toBeGreaterThan(50);
  });

  it("the windmill letter: the lens is well outside the sail sweep", () => {
    const mill = LETTERS[1]!;
    for (const [dx, dz] of [[0, 1.6], [1.5, 1.0], [-1.5, 1.0], [0, 2.6]]) {
      const { eye } = followEye(mill.x + dx, mill.z + dz);
      expect(insideSailSweep(eye, hub, 2)).toBe(false);
    }
  });
});

describe("the voyage camera (results / epilogue card) frames the boat, clear of the sails, crowns and ground", () => {
  const boat = (e: number) => {
    const u = Math.min(1, Math.max(0, e - 4) / 80), ease = u * u * (3 - 2 * u);
    return { x: sc.boatMoor.x + (-22 - sc.boatMoor.x) * ease + 6 * Math.sin(ease * Math.PI), y: SEA_LEVEL + 0.02, z: sc.boatMoor.z + (-108 - sc.boatMoor.z) * ease };
  };
  const inFrontOfSails = (p: readonly number[]): boolean =>
    Math.hypot(p[0]! - hub.x, p[1]! - hub.y) < SAIL_RADIUS && p[2]! > hub.z - 1.6 && p[2]! < hub.z + VOYAGE_SAIL_KEEP_OUT - 0.5;
  it.each([["autoplay cut to the jetty", true], ["eased from the bell (normal play)", false]] as const)("%s: 0-40 s", (_n, cut) => {
    const b0 = boat(0);
    const look = cut ? { x: b0.x - 4, y: b0.y + 2.2, z: b0.z - 2 } : { x: 48.6, y: 4, z: 0.8 };
    let prev: number[] | null = null, worstStep = 0;
    for (let e = 0; e < 40; e += 0.05) {
      const b = boat(e), k = Math.min(1, e / 6), a = 1 - Math.exp(-1.5 * 0.05);
      look.x += (b.x - 4 * (1 - k) - look.x) * a; look.y += (b.y + 2.2 - look.y) * a; look.z += (b.z - 2 - look.z) * a;
      const eye = voyageLens([look.x, look.y, look.z], [look.x - 9, look.y + EPILOGUE_CAMERA_RISE, look.z + 14], voyageObstacles, terrainHeight);
      expect(insideSailSweep(eye, hub, 1), `e=${e.toFixed(2)} sweep`).toBe(false);
      expect(inFrontOfSails(eye), `e=${e.toFixed(2)} in front of the sails ${eye.map((v) => v.toFixed(1))}`).toBe(false);
      expect(eye[1]).toBeGreaterThanOrEqual(terrainHeight(eye[0], eye[2]) + LENS_GROUND_MARGIN - 1e-6);
      if (prev && e > 1) worstStep = Math.max(worstStep, Math.hypot(eye[0] - prev[0], eye[1] - prev[1], eye[2] - prev[2]));
      prev = eye;
      // the boat stays in front of the lens (looking down at it, within 30 m)
      expect(Math.hypot(eye[0] - b.x, eye[2] - b.z)).toBeLessThan(30);
    }
    // the cut voyage never snaps (the eased-from-bell start snaps once into the sails' pull-in; world.ts eases that)
    if (cut) expect(worstStep).toBeLessThan(1.2);
  });
});

