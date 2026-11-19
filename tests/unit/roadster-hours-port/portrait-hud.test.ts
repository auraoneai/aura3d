import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createRun, defaultCareer, stepRun, SIM_STEP } from "../../../examples/roadster-hours-port/sim";
import { DEFAULT_PARAMS, autopilot } from "../../../examples/roadster-hours-port/autopilot";
import { createCameraDirector } from "../../../examples/roadster-hours-port/camera";
import { LEVELS, roadProfile } from "../../../examples/roadster-hours-port/course";
import { lookFor } from "../../../examples/roadster-hours-port/look";
import { HUD_SAFE_PORTRAIT_PX, PORTRAIT_FOV, cameraRun, chaseWant, hudSafeFor, roadPoint } from "../../../examples/roadster-hours-port/world";

type V3 = readonly [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
/** Screen y (pixels from the top) of world point `p` for a camera at `eye` looking at `look` (vertical fov deg). */
function screenY(p: V3, eye: V3, look: V3, fovDeg: number, heightPx: number): number {
  const f = norm(sub(look, eye));
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const d = sub(p, eye);
  const ndcY = dot(d, u) / (dot(d, f) * Math.tan((fovDeg * Math.PI) / 360));
  return ((1 - ndcY) / 2) * heightPx;
}

/**
 * Portrait HUD (390x844 QA, Nov 19): the coach line and the event toast overlapped above the dash, a long act name ran into
 * the route bar, the countdown digit sat on the car, and the pause button touched the score box when its combo chip showed.
 * Live rects were measured on the real GPU (headed Chrome, 390x844, with and without ?touch=1); these tests pin the CSS
 * contract and keep the chase camera's car above the portrait bottom stack.
 */
const PAGES = ["examples/roadster-hours-port/index.html", "apps/showcase-roadster-hours-port/index.html"];
const H = 844;

describe("Saltwind Highway portrait HUD layout", () => {
  it("both pages dock the route bar above the dash and share one line between toast and coach (toast wins)", () => {
    for (const page of PAGES) {
      const html = readFileSync(resolve(page), "utf8");
      // non-touch narrow (inside the narrow media query) and touch: route bar docked at the bottom, not in the top row
      expect(html).toContain("body:not(.touch) #progress { top: auto; bottom: calc(max(14px, env(safe-area-inset-bottom)) + 102px);");
      expect(html).toContain("body.touch #progress { top: auto; bottom: calc(max(14px, env(safe-area-inset-bottom)) + 110px);");
      // toast and coach share a slot; a showing toast hides the coach (toast precedes coach in the DOM for the ~ combinator)
      expect(html).toContain("#toast:not(:empty) ~ #coach { visibility: hidden; }");
      expect(html).toContain("body.touch #toast:not(:empty) ~ #coach { visibility: hidden; }");
      expect(html.indexOf('<div id="toast"')).toBeLessThan(html.indexOf('<div id="coach"'));
      // the countdown sits above the car and the pause button clears the score box's combo chip
      expect(html).toContain("body #count { top: 21%;");
      expect(html).toContain("body.touch #pause-button { top: calc(var(--top-safe) + 74px); }");
    }
  });

  it("the portrait camera keeps the car above the bottom stack on every route (grounded and airborne, 390x844)", () => {
    expect(hudSafeFor(390 / 844, 0).bottomFrac).toBeCloseTo(HUD_SAFE_PORTRAIT_PX / H, 6);
    expect(hudSafeFor(1280 / 720, 0).fovDeg).toBe(58);
    const stackTop = H - HUD_SAFE_PORTRAIT_PX;
    let frames = 0, worst = 0;
    LEVELS.forEach((level, li) => {
      const look = lookFor(level.id, "gu47");
      const row = look.row !== null;
      const o = { offCentre: row ? 0.55 * look.seaSide : 0, eyeDrop: row ? 0.45 : 0, lookLift: row ? -0.65 : 0, chaseBack: row ? 7.8 : 8.5 };
      const career = { ...defaultCareer(), unlocked: LEVELS.length - 1 };
      const run = createRun(li, career);
      const director = createCameraDirector({ eyeRate: 9, lookRate: 12, fovRate: 4 });
      for (let i = 0; i < 120 * 40 && run.phase !== "finished"; i++) {
        stepRun(run, run.phase === "running" ? autopilot(run, DEFAULT_PARAMS) : {}, SIM_STEP, career);
        const cam = director.step(cameraRun(level, run), [], SIM_STEP);
        // on the suction banks the frame rolls with the road and the car stays on it (the HUD-safe pitch is off there)
        if (run.phase !== "running" || Math.abs(roadProfile(level, run.s).bank) >= 0.35 || i % 4) continue;
        frames++;
        const safe = hudSafeFor(390 / 844, cam.fovKick);
        const { eye, look: at } = chaseWant(level, run, cam, row, o, safe);
        const y = screenY(roadPoint(level, run.s - 2.2, run.l, run.h), eye, at, safe.fovDeg, H);
        worst = Math.max(worst, y);
        expect(y, `${level.id} t=${(i * SIM_STEP).toFixed(2)} h=${run.h.toFixed(1)}`).toBeLessThan(stackTop);
      }
    });
    expect(frames).toBeGreaterThan(1000);
    expect(PORTRAIT_FOV).toBe(70);
    console.log("worst portrait car-bottom screen y:", worst.toFixed(1), "stack top", stackTop);
  });
});
