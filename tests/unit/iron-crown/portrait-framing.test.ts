/**
 * IRON CROWN portrait framing (owner, 2026-11-18: "390x844 Neo-Tokyo: the camera sits too close to a fighter") and the
 * Neo-Tokyo floor steam ("drifts over the fighters' feet").
 *
 * Framing: for every venue, both fighters' whole bodies (feet to head, with strike reach) project inside the HUD-safe
 * rectangle of a 390x844 frame across a fight (every separation the combat bounds allow, at the walls and in the middle,
 * standing and airborne, the largest fighter), through the same chain main.ts runs: the engine fighting rig, the fight
 * lens (`fightCameraFrame`) and the portrait dolly (`fitDollyFactor`). The cinematic shots (intro close-ups, K.O. orbit,
 * win shot) keep their subject whole inside the letterbox. The pair still fills the frame (not a tiny far shot).
 *
 * Steam: every light cone near the fighters ends above head height, so no glow pools on the floor at their feet.
 */
import { describe, expect, it } from "vitest";
import { camera } from "@aura3d/engine";
import {
  cinematicPortraitSafe,
  cinematicShot,
  dollyEye,
  FIGHT_LENS,
  fightCameraFrame,
  FIGHTER_FRAME_HEIGHT,
  fitDollyFactor,
  INTRO_SHOTS,
  KO_ORBIT,
  PORTRAIT_FIGHT_DOLLY,
  PORTRAIT_SAFE_FRAME,
  portraitFightBase,
  portraitKeepsShot,
  projectNdc,
  shotSubjects,
  subjectsInFrame,
  type FrameSubject
} from "../../../apps/showcase-iron-crown/src/game/cinematics";
import { FIGHTERS } from "../../../apps/showcase-iron-crown/src/game/fighters";
import { ATMOSPHERE_FLOOR_CLEAR_Y, backRimPose, LETTERBOX_BAR, lightConeMinY, STAGE_LOOKS } from "../../../apps/showcase-iron-crown/src/game/look";
import { STAGES } from "../../../apps/showcase-iron-crown/src/game/stages";

type V3 = [number, number, number];

const PORTRAIT = 390 / 844;
const MIN_SEPARATION = 1.45; // main.ts MIN_FIGHTER_SEPARATION (push-box)
const BIGGEST = Math.max(...FIGHTERS.map((f) => f.scale));
const SMALLEST = Math.min(...FIGHTERS.map((f) => f.scale));

/** The presented fight pose for two feet positions on a portrait viewport, as main.ts composes it. */
function fightPose(p1: V3, p2: V3, scale: number, aspect = PORTRAIT) {
  const rig = camera.rigs.fighting({ fighters: ["player", "rival"], minDistance: 4.9, maxDistance: 7.0, fov: FIGHT_LENS.fov });
  const h = FIGHTER_FRAME_HEIGHT * scale;
  const subject = (p: V3) => ({ position: p, bounds: { min: [p[0] - 0.35, p[1], p[2] - 0.25] as V3, max: [p[0] + 0.35, p[1] + h, p[2] + 0.25] as V3 } });
  const previous = { position: [0, 1.6, 5.6] as V3, target: [0, 0.86, 0] as V3, up: [0, 1, 0] as V3, roll: 0, fov: FIGHT_LENS.fov, near: 0.1, far: 400 };
  const ctx = { subject: (id: string) => subject(id === "player" ? p1 : p2), aspect, dt: 1 / 60, previous, time: 0 };
  const pose = (rig as { update(c: unknown): { position: V3; target: V3 } }).update(ctx);
  const framed = fightCameraFrame({
    baseEye: [pose.position[0], pose.position[1] + FIGHT_LENS.lift, pose.position[2] - 0.12],
    baseTarget: pose.target,
    p1,
    p2,
    aspect
  });
  const subjects: FrameSubject[] = [
    { position: p1, height: h },
    { position: p2, height: h }
  ];
  const base = portraitFightBase(framed);
  const k = fitDollyFactor(base.eye, base.target, framed.fov, aspect, subjects, PORTRAIT_FIGHT_DOLLY);
  return { eye: dollyEye(base.eye, base.target, k), target: base.target, fov: framed.fov, subjects, k };
}

/** Horizontal NDC span of both fighters (their standing bodies, no reach margin). */
function pairWidthShare(eye: V3, target: V3, fov: number, subjects: readonly FrameSubject[]): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of subjects) {
    for (const dx of [-0.35, 0.35]) {
      const n = projectNdc(eye, target, fov, PORTRAIT, [s.position[0] + dx, s.position[1] + s.height / 2, s.position[2]]);
      if (!n) return 0;
      lo = Math.min(lo, n[0]);
      hi = Math.max(hi, n[0]);
    }
  }
  return (hi - lo) / 2;
}

describe("iron-crown portrait framing (390x844, every venue)", () => {
  for (const stage of STAGES) {
    it(`${stage.id}: both fighters whole inside the HUD-safe frame at every separation, wall and jump`, () => {
      const { minX, maxX } = stage.bounds;
      expect(maxX - minX).toBeGreaterThan(MIN_SEPARATION);
      let samples = 0;
      for (const scale of [SMALLEST, BIGGEST]) {
        for (let sep = MIN_SEPARATION; sep <= maxX - minX + 1e-6; sep += 0.35) {
          // Pair midpoints from one wall to the other.
          for (let mid = minX + sep / 2; mid <= maxX - sep / 2 + 1e-6; mid += Math.max(0.25, (maxX - minX - sep) / 6 || 1)) {
            for (const jump of [0, 1.4]) {
              const p1: V3 = [mid - sep / 2, jump, 0];
              const p2: V3 = [mid + sep / 2, 0, 0];
              const pose = fightPose(p1, p2, scale);
              expect(subjectsInFrame(pose.eye, pose.target, pose.fov, PORTRAIT, pose.subjects, PORTRAIT_SAFE_FRAME), `${stage.id} sep ${sep.toFixed(2)} mid ${mid.toFixed(2)} jump ${jump} scale ${scale}`).toBe(true);
              samples += 1;
            }
          }
        }
      }
      expect(samples).toBeGreaterThan(20);
    });
  }

  it("keeps the pair large: at the opening distance they span at least 45% of the portrait width", () => {
    const pose = fightPose([-2.2, 0, 0], [2.2, 0, 0], 1);
    expect(pairWidthShare(pose.eye, pose.target, pose.fov, pose.subjects)).toBeGreaterThanOrEqual(0.45);
    // The pair sits in the lower-middle of the tall frame (feet below the frame's centre line), the venue above them.
    const feet = projectNdc(pose.eye, pose.target, pose.fov, PORTRAIT, [-2.2, 0, 0])!;
    expect(feet[1]).toBeLessThan(-0.2);
    const close = fightPose([-0.75, 0, 0], [0.75, 0, 0], 1);
    expect(pairWidthShare(close.eye, close.target, close.fov, close.subjects)).toBeGreaterThanOrEqual(0.3);
  });

  it("cinematic shots keep their subject whole inside the letterbox on portrait", () => {
    const safe = cinematicPortraitSafe(LETTERBOX_BAR);
    const h = FIGHTER_FRAME_HEIGHT * BIGGEST;
    for (const [p1x, p2x] of [[-2.2, 2.2], [-0.8, 0.8], [-4, -2.5]] as const) {
      const p1: FrameSubject = { position: [p1x, 0, 0], height: h };
      const p2: FrameSubject = { position: [p2x, 0, 0], height: h };
      const cases = [
        { phase: "intro" as const, t: 0 },
        { phase: "intro" as const, t: INTRO_SHOTS.p1 + 0.1 },
        { phase: "intro" as const, t: INTRO_SHOTS.p2 + 0.1 },
        ...[0, 0.6, 1.2, 1.7].map((t) => ({ phase: "ko" as const, t })),
        { phase: "boutEnd" as const, t: 0 }
      ];
      for (const c of cases) {
        const shot = cinematicShot({ phase: c.phase, t: c.t, p1: p1.position, p2: p2.position, winner: c.phase === "boutEnd" ? p2.position : null, reducedMotion: false })!;
        // The single-fighter close-ups hand portrait to the fight lens (the pair test above covers it).
        if (!portraitKeepsShot(shot.name)) {
          expect(shot.name).toMatch(/closeup/);
          continue;
        }
        const subjects = shotSubjects(shot.name, p1, p2, c.phase === "boutEnd" ? p2 : null);
        // As authored, the close-ups, the orbit and the win shot crop a fighter on 390x844 (the owner's report).
        const k = fitDollyFactor(shot.position, shot.target, shot.fov, PORTRAIT, subjects, { minK: 1, maxK: 4, safe, keepHeight: true });
        expect(k, `${shot.name}`).toBeLessThan(4);
        const eye = dollyEye(shot.position, shot.target, k, true);
        expect(subjectsInFrame(eye, shot.target, shot.fov, PORTRAIT, subjects, safe), `${shot.name} ${p1x}`).toBe(true);
        // The lens never goes under the floor (the low win shot dollied along its line did, on 390x844).
        expect(eye[1], `${shot.name} eye height`).toBeGreaterThan(0.5);
      }
    }
    const ko = cinematicShot({ phase: "ko", t: 0, p1: [-2.2, 0, 0], p2: [2.2, 0, 0], winner: null, reducedMotion: false })!;
    expect(subjectsInFrame(ko.position, ko.target, ko.fov, PORTRAIT, [
      { position: [-2.2, 0, 0], height: h },
      { position: [2.2, 0, 0], height: h }
    ], safe)).toBe(false);
    expect(KO_ORBIT.radius).toBeGreaterThan(0);
  });
});

describe("iron-crown atmosphere stays off the fighters' feet (Neo-Tokyo floor steam)", () => {
  it("no look-row light cone over the fight lane reaches the floor; Neo-Tokyo's flood shaft stops above head height", () => {
    for (const row of Object.values(STAGE_LOOKS)) {
      for (const shaft of row.shafts) {
        const len = Math.hypot(...shaft.direction) || 1;
        const endX = shaft.position[0] + (shaft.direction[0] / len) * shaft.length;
        const endZ = shaft.position[2] + (shaft.direction[2] / len) * shaft.length;
        // The Crown's throne spot lands on the throne at the back wall (z <= -3.2), centre-stage behind the pair.
        const overLane = Math.abs(endX) > 0.6 && endZ > -4.5;
        if (!overLane) continue;
        expect(lightConeMinY(shaft.position, shaft.direction, shaft.length, shaft.coneAngle), `${row.stage} ${shaft.name}`).toBeGreaterThanOrEqual(ATMOSPHERE_FLOOR_CLEAR_Y);
      }
    }
    const neo = STAGE_LOOKS["neo-tokyo-rooftop"].shafts[0]!;
    // Above the tallest fighter's head (Boulder, 1.85 m x 1.12 = 2.07 m).
    expect(lightConeMinY(neo.position, neo.direction, neo.length, neo.coneAngle)).toBeGreaterThanOrEqual(2.3);
    expect(neo.color).toBe("#ffad5c");
    // The floor's HDRI mirror: the rooftop_night lights reflected as a white cloud at the fighters' feet at 140 deg
    // (real-GPU A/B: environment off removed it; 230 deg leaves the floor in front of the lane clean).
    expect(STAGE_LOOKS["neo-tokyo-rooftop"].environmentRotationDeg).toBe(230);
  });

  it("Neo-Tokyo's back rims stop just past the fighter: no rim light reaches the wet floor in front of the feet", () => {
    // Engine spot range window (Frostbite): (1 - (d / range)^4)^2, zero at and beyond the range.
    const windowAt = (d: number, range: number) => Math.max(0, 1 - (d / range) ** 4) ** 2;
    const rim = STAGE_LOOKS["neo-tokyo-rooftop"].backRim;
    for (const x of [-3, -1, 0, 2.2]) {
      const pose = backRimPose(rim, x);
      const dist = (p: V3) => Math.hypot(p[0] - pose.position[0], p[1] - pose.position[1], p[2] - pose.position[2]);
      // The floor from 1.25 m in front of the fight plane to the camera (where the glare and the pool landed): unlit.
      for (const z of [1.25, 1.83, 3, 4.5]) expect(windowAt(dist([x, 0, z]), rim.distance), `floor z ${z}`).toBe(0);
      // The fighter's back still gets the rim it had at the 9 m range and intensity 18.
      const back: V3 = [x, 1.25, 0.15];
      expect(rim.intensity * windowAt(dist(back), rim.distance)).toBeGreaterThanOrEqual(18 * windowAt(dist(back), 9) * 0.98);
    }
  });
});
