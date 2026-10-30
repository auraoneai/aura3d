/**
 * GU47 TT-C1: broadcast camera v2 (eye [0, 15.5, 33.5], aim [0, 0, -1.5], 26 degrees, aspect-aware) with a damped +-0.6 m
 * pan; `?cam=classic` and `?look=original` keep the 4.6.1 camera. Presentation only: the pan reads the drawn ball x.
 */
import { describe, expect, it } from "vitest";
import {
  CAMERA_CLASSIC, CAMERA_PAN_LIMIT, CAMERA_V2, cameraFovForAspect, cameraRigFor, dampPan, panGoal, panLimitFor, panPose, projectWorldPoint, type CameraPose
} from "../../../examples/aura-slam/view/camera";
import { COURT_X, COURT_Z } from "../../../examples/aura-slam/view/constants";

/** Independent look-at + perspective model for any pose. */
function referenceProject(w: number, h: number, fovDeg: number, pose: CameraPose, p: readonly [number, number, number]): { x: number; y: number; visible: boolean } {
  const sub = (a: readonly number[], b: readonly number[]) => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
  const norm = (a: number[]) => { const l = Math.hypot(a[0]!, a[1]!, a[2]!); return [a[0]! / l, a[1]! / l, a[2]! / l]; };
  const cross = (a: number[], b: number[]) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
  const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  const z = norm(sub(pose.eye, pose.target));
  const x = norm(cross([0, 1, 0], z));
  const y = cross(z, x);
  const d = sub(p, pose.eye);
  const vx = dot(d, x), vy = dot(d, y), vz = dot(d, z);
  const aspect = Math.max(0.2, w / Math.max(1, h));
  const f = 1 / Math.tan((fovDeg * Math.PI) / 360);
  const ndcX = (vx * f) / aspect / -vz;
  const ndcY = (vy * f) / -vz;
  return { x: (ndcX + 1) * 0.5 * w, y: (1 - ndcY) * 0.5 * h, visible: vz < -0.1 && Math.abs(ndcX) <= 1.05 && Math.abs(ndcY) <= 1.05 };
}

/** Athlete box corners (feet to head, racket reach) at a sim position (x across, y along the court). */
const athleteBox = (simX: number, simY: number): [number, number, number][] => {
  const cx = simX * COURT_X, cz = simY * COURT_Z;
  const out: [number, number, number][] = [];
  for (const dx of [-0.7, 0.7]) for (const y of [0, 2.05]) out.push([cx + dx, y, cz]);
  return out;
};

const VIEWPORTS = [[1280, 720], [1920, 1080], [390, 844], [390, 600], [844, 390]] as const;

describe("GU47 TT-C1: broadcast camera v2", () => {
  it("is the World Tour camera; ?cam=classic and ?look=original keep the 4.6.1 camera", () => {
    expect(cameraRigFor("")).toBe(CAMERA_V2);
    expect(cameraRigFor("?venue=clay")).toBe(CAMERA_V2);
    expect(cameraRigFor("?cam=classic")).toBe(CAMERA_CLASSIC);
    expect(cameraRigFor("?look=original&venue=moon")).toBe(CAMERA_CLASSIC);
    expect(CAMERA_V2).toMatchObject({ eye: [0, 15.5, 33.5], target: [0, 0, -1.5], fovDeg: 26 });
    expect(CAMERA_CLASSIC).toMatchObject({ eye: [0, 25.5, 37.1], target: [0, 0, 0.7], fovDeg: 15 });
  });

  it("keeps 26 degrees on desktop aspects and widens on portrait canvases until +-7 m at the near baseline fits", () => {
    for (const a of [16 / 9, 16 / 10, 21 / 9]) expect(cameraFovForAspect(a, CAMERA_V2)).toBe(26);
    for (const a of [390 / 844, 390 / 600, 0.75, 1]) {
      const fov = cameraFovForAspect(a, CAMERA_V2);
      expect(fov).toBeGreaterThan(26);
      expect(Math.tan((fov * Math.PI) / 360) * a).toBeGreaterThanOrEqual(CAMERA_V2.minTanHalfHFov - 1e-9);
    }
    // The classic rig's aspect behaviour is unchanged (the default argument).
    expect(cameraFovForAspect(16 / 9)).toBe(15);
  });

  it("both athletes stay in frame in every flow position, at every pan, on desktop and phone canvases", () => {
    let checked = 0;
    for (const [w, h] of VIEWPORTS) {
      const fov = cameraFovForAspect(w / h, CAMERA_V2);
      // The renderer clamps the pan to panLimitFor(aspect): full +-0.6 m on desktop, none where the frame is sized to the athletes.
      const limit = panLimitFor(w / h, CAMERA_V2);
      for (const pan of [-limit, 0, limit]) {
        const pose = panPose(CAMERA_V2, pan);
        // Near athlete from the service line to 1.1 court lengths deep, wide of the doubles alley; far athlete mirrored.
        for (const simX of [-1.2, -0.6, 0, 0.6, 1.2]) for (const simY of [0.5, 0.86, 1.1]) {
          for (const corner of [...athleteBox(simX, simY), ...athleteBox(simX, -simY)]) {
            const p = projectWorldPoint(w, h, ...corner, fov, pose);
            expect(p.visible, `${w}x${h} pan ${pan} at ${corner.join(",")}`).toBe(true);
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it("the far athlete is >= 45 px tall at 1280x720 (both baselines' depth)", () => {
    const fov = cameraFovForAspect(1280 / 720, CAMERA_V2);
    for (const simY of [-0.86, -1.1]) {
      const z = simY * COURT_Z;
      const feet = projectWorldPoint(1280, 720, 0, 0, z, fov, CAMERA_V2);
      const head = projectWorldPoint(1280, 720, 0, 1.8, z, fov, CAMERA_V2);
      expect(feet.y - head.y, `sim y ${simY}`).toBeGreaterThanOrEqual(45);
    }
  });

  it("projectWorldPoint matches an independent look-at model for the panned v2 pose (well within 4 px)", () => {
    let cases = 0;
    for (const [w, h] of VIEWPORTS) {
      const fov = cameraFovForAspect(w / h, CAMERA_V2);
      for (const pan of [-0.6, 0.25, 0.6]) {
        const pose = panPose(CAMERA_V2, pan);
        for (let x = -7; x <= 7; x += 3.5) for (let y = 0; y <= 3; y += 1.5) for (let z = -12; z <= 12; z += 4) {
          const a = projectWorldPoint(w, h, x, y, z, fov, pose);
          const b = referenceProject(w, h, fov, pose, [x, y, z]);
          expect(a.visible).toBe(b.visible);
          if (b.visible) { expect(Math.abs(a.x - b.x)).toBeLessThan(1e-6); expect(Math.abs(a.y - b.y)).toBeLessThan(1e-6); }
          cases += 1;
        }
      }
    }
    expect(cases).toBeGreaterThan(500);
  });

  it("the pan follows the ball a third of the way, clamped to +-0.6 m, damped frame-rate independently", () => {
    expect(panGoal(0)).toBe(0);
    expect(panGoal(1.2)).toBeCloseTo(0.4, 9);
    expect(panGoal(9)).toBe(CAMERA_PAN_LIMIT);
    expect(panGoal(-9)).toBe(-CAMERA_PAN_LIMIT);
    expect(panGoal(Number.NaN)).toBe(0);
    // One 1/30 s step lands where two 1/60 s steps land.
    const one = dampPan(0, 0.6, 1 / 30);
    const two = dampPan(dampPan(0, 0.6, 1 / 60), 0.6, 1 / 60);
    expect(one).toBeCloseTo(two, 9);
    // It converges and never overshoots.
    let pan = 0;
    for (let i = 0; i < 600; i++) { pan = dampPan(pan, 0.6, 1 / 60); expect(pan).toBeLessThanOrEqual(0.6 + 1e-12); }
    expect(pan).toBeCloseTo(0.6, 6);
    // The pose moves eye and aim together.
    expect(panPose(CAMERA_V2, 0.5)).toEqual({ eye: [0.5, 15.5, 33.5], target: [0.5, 0, -1.5] });
  });

  it("desktop aspects get the full +-0.6 m pan; the classic rig never pans", () => {
    expect(panLimitFor(1280 / 720, CAMERA_V2)).toBe(CAMERA_PAN_LIMIT);
    expect(panLimitFor(1920 / 1080, CAMERA_V2)).toBe(CAMERA_PAN_LIMIT);
    expect(panLimitFor(390 / 844, CAMERA_V2)).toBeLessThan(CAMERA_PAN_LIMIT);
    expect(panLimitFor(16 / 9, CAMERA_CLASSIC)).toBe(0);
  });

  it("reduced motion: no pan (the camera holds the v2 pose)", () => {
    expect(dampPan(0.4, 0.6, 1 / 60, true)).toBe(0);
    expect(dampPan(0, 0.6, 1, true)).toBe(0);
  });
});
