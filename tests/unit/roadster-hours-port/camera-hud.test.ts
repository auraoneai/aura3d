import { describe, expect, it } from "vitest";
import { createRun, defaultCareer, stepRun, SIM_STEP } from "../../../examples/roadster-hours-port/sim";
import { DEFAULT_PARAMS, autopilot } from "../../../examples/roadster-hours-port/autopilot";
import { createCameraDirector } from "../../../examples/roadster-hours-port/camera";
import { LEVELS } from "../../../examples/roadster-hours-port/course";
import { lookFor } from "../../../examples/roadster-hours-port/look";
import { HUD_SAFE_BOTTOM_FRAC, cameraRun, chaseWant, roadPoint } from "../../../examples/roadster-hours-port/world";

type V3 = readonly [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };

/** Screen y (pixels from the top) of world point `p` for a camera at `eye` looking at `look` (vertical fov deg, height px). */
export function screenY(p: V3, eye: V3, look: V3, fovDeg: number, heightPx: number): number {
  const f = norm(sub(look, eye));
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const d = sub(p, eye);
  const z = dot(d, f), y = dot(d, u);
  const ndcY = y / (z * Math.tan((fovDeg * Math.PI) / 360));
  return ((1 - ndcY) / 2) * heightPx;
}

/** The bottom dash band (index.html `#dash`: 16 px from the bottom, ~101 px tall at 720p): its top edge in pixels. */
const HUD_TOP_720 = 720 - 16 - 101;

describe("Saltwind Highway chase camera keeps the car above the bottom HUD band", () => {
  it("through the recorded autopilot jumps of every GU47 route (720p, 16:9)", () => {
    let airborneFrames = 0, worst = 0;
    LEVELS.forEach((level, li) => {
      const look = lookFor(level.id, "gu47");
      const row = look.row !== null;
      const offCentre = row ? 0.55 * look.seaSide : 0;
      const o = { offCentre, eyeDrop: row ? 0.45 : 0, lookLift: row ? -0.65 : 0, chaseBack: row ? 7.8 : 8.5 };
      const career = { ...defaultCareer(), unlocked: LEVELS.length - 1 };
      const run = createRun(li, career);
      const director = createCameraDirector({ eyeRate: 9, lookRate: 12, fovRate: 4 });
      for (let i = 0; i < 120 * 40 && run.phase !== "finished"; i++) {
        stepRun(run, run.phase === "running" ? autopilot(run, DEFAULT_PARAMS) : {}, SIM_STEP, career);
        const cam = director.step(cameraRun(level, run), [], SIM_STEP);
        // airborne frames (take-off and touchdown instants, h < 0.5 m, frame like the grounded car)
        if (run.phase !== "running" || run.grounded || run.h < 0.5) continue;
        airborneFrames++;
        const fov = 58 + cam.fovKick;
        const { eye, look: at } = chaseWant(level, run, cam, row, o, { fovDeg: fov, bottomFrac: HUD_SAFE_BOTTOM_FRAC });
        // the lowest visible car point: its rear bottom corner (nearest the camera), on the car's lane
        const rear = roadPoint(level, run.s - 2.2, run.l, run.h);
        const y = screenY(rear, eye, at, fov, 720);
        worst = Math.max(worst, y);
        expect(y, `${level.id} t=${(i * SIM_STEP).toFixed(2)} h=${run.h.toFixed(1)}`).toBeLessThan(HUD_TOP_720 - 6);
      }
    });
    expect(airborneFrames).toBeGreaterThan(200);
    console.log("worst airborne car-bottom screen y (720p):", worst.toFixed(1), "HUD top", HUD_TOP_720);
  });
});
