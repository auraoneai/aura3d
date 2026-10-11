/**
 * PRD-08 harness scenarios, part 2 — chase framing (S6), orbit collision
 * (S8), closed rail (S11) and bicycle drift (S12). Same rules as
 * scenarios-feel.ts: public app surface + scripted clock in, plain JSON out.
 */
import { createSpline } from "@aura3d/engine/lanes";
import { cam, dist, drain, pump, type ScenarioContext } from "./scenarios-feel";
import type { HarnessVehicleInput } from "./scenes";

/** Clip-space y/w of a world point under a column-major VP. */
function ndcY(vp: readonly number[], p: readonly number[]): number {
  const y = vp[1]! * p[0]! + vp[5]! * p[1]! + vp[9]! * p[2]! + vp[13]!;
  const w = vp[3]! * p[0]! + vp[7]! * p[1]! + vp[11]! * p[2]! + vp[15]!;
  return y / w;
}

/**
 * S6 (chase scene): `rigs.chase` on the 20 u/s subject, look-ahead off,
 * speed-aware distance base 4 + 0.1·v (→ 6 at 20 u/s). Per presented frame:
 * eye-to-subject distance and the subject centre's NDC y.
 */
export function chaseFraming({ pipeline: p, app }: ScenarioContext, o: { seconds: number; legacy?: boolean }) {
  const c = cam(app);
  const rig = o.legacy
    ? c.rigs.fromSpec!({ mode: "follow", targetNode: "hero", distance: 6, smoothing: 0.045 })
    : c.rigs.chase!({
        target: "hero",
        height: 0,
        lookHeight: 0,
        distance: { base: 4, perSpeed: 0.1, max: 8 },
        fov: 50,
        lookAhead: { seconds: 0, max: 0 },
        bank: { gain: 0, maxDeg: 0, halflife: 0.1 }
      });
  c.use(rig);
  drain(p);
  pump(p, 1000 / 60, Math.round(o.seconds * 60));
  const r = drain(p);
  // Measured against the PRESENTED (interpolated) subject — the transform
  // the camera reads and the frame shows (§6.1).
  return {
    expectedDistance: 6,
    t: r.map((_, i) => (i + 1) / 60),
    distance: r.map((x) => dist(x.camera.position, x.positions[0]!)),
    subjectNdcY: r.map((x) => ndcY(x.viewProjection, x.positions[0]!))
  };
}

/**
 * S8 (wall scene): scripted 30 s orbit (two turns) around [0, 0.5, 0] at
 * r = 8, pitch 8°, through a box wall straddling the circle. Counts presented
 * frames whose eye is inside the wall's AABB.
 */
export function orbitWall({ pipeline: p, app }: ScenarioContext, o: { collision: boolean; seconds: number }) {
  const c = cam(app);
  const rig = c.rigs.orbit!({ target: [0, 0.5, 0], distance: 8, yaw: 0, pitch: 8, collision: o.collision }) as {
    setAngles(yaw: number, pitch: number): void;
  };
  c.use(rig);
  const wall = (app.nodes.get("wall") as { bounds(): { min: readonly number[]; max: readonly number[] } } | undefined)?.bounds();
  if (!wall) throw new Error("wall node missing (scene=wall)");
  const inside = (q: readonly number[]) =>
    q[0]! > wall.min[0]! && q[0]! < wall.max[0]! && q[1]! > wall.min[1]! && q[1]! < wall.max[1]! && q[2]! > wall.min[2]! && q[2]! < wall.max[2]!;
  const n = Math.round(o.seconds * 60);
  let insideFrames = 0;
  let minEyeRadius = Number.POSITIVE_INFINITY;
  const samples: number[][] = [];
  for (let i = 0; i < n; i += 1) {
    rig.setAngles((i / n) * 720, 8);
    p.tick!(1000 / 60);
    const eye = c.presented().position;
    if (inside(eye)) insideFrames += 1;
    minEyeRadius = Math.min(minEyeRadius, Math.hypot(eye[0]!, eye[2]!));
    if (i % 30 === 0) samples.push([eye[0]!, eye[1]!, eye[2]!]);
  }
  drain(p);
  return { frames: n, insideFrames, minEyeRadius, samples, wall: { min: [...wall.min], max: [...wall.max] } };
}

export const S11_RAIL: readonly [number, number, number][] = [
  [6, 0.5, 0],
  [4.2, 1.0, 4.2],
  [0, 1.5, 6],
  [-4.2, 0.8, 4.2],
  [-6, 1.2, 0],
  [-3, 0.6, -4]
];

/**
 * S11: `rigs.rail` closed 6-point loop (12 s lap) mounted on app.camera; one
 * lap of presented eye positions at 60 Hz (+1 frame to cross the seam).
 */
export function railLap({ pipeline: p, app }: ScenarioContext, o: { lap: number; ease?: string }) {
  const c = cam(app);
  c.use(c.rigs.rail!({ points: S11_RAIL, duration: o.lap, loop: "loop", lookAt: [0, 0.5, 0], ...(o.ease ? { ease: o.ease } : {}) }));
  pump(p, 1000 / 60, 1);
  drain(p);
  const frames = Math.round(o.lap * 60);
  pump(p, 1000 / 60, frames + 1);
  const r = drain(p);
  const speeds = r.slice(1).map((x, i) => dist(x.camera.position, r[i]!.camera.position) * 60);
  return {
    railLength: createSpline(S11_RAIL, { closed: true, samples: 1024 }).totalLength,
    speeds,
    lapGap: dist(r[frames]!.camera.position, r[0]!.camera.position)
  };
}

/**
 * S12 (drift scene): the vehicle-drift.test.ts script through the presented
 * loop — accelerate to 15 u/s, full steer + handbrake 0.35 s, release with
 * steer held (until 0.6 s of |slip| > 0.2 rad ∧ drifting, max 1.5 s), then
 * counter-steer −0.5 for up to 1.5 s. Telemetry is sampled per presented
 * frame; `maxMotionSlip` is the slip measured from the node's own motion.
 */
export function driftScript({ pipeline: p }: ScenarioContext) {
  const input = p.vehicleInput as HarnessVehicleInput | undefined;
  if (!input) throw new Error("drift scenario needs scene=drift");
  const set = (next: HarnessVehicleInput) => {
    for (const k of Object.keys(input) as (keyof HarnessVehicleInput)[]) delete input[k];
    Object.assign(input, next);
  };
  const frame = () => {
    p.tick!(1000 / 60);
    const r = p.records.at(-1)!;
    return { speed: Number(r.telemetry!.speed), slip: Number(r.telemetry!.slipAngle), drifting: r.telemetry!.drifting === true };
  };
  set({ throttle: 1 });
  let s = frame();
  let accelFrames = 1;
  while (s.speed < 15 && accelFrames < 60 * 20) {
    s = frame();
    accelFrames += 1;
  }
  const topSpeed = s.speed;
  set({ steer: 1, handbrake: true });
  for (let i = 0; i < Math.round(0.35 * 60); i += 1) frame();
  set({ steer: 1, throttle: 0.15 });
  let sustained = 0;
  let maxAbsSlip = 0;
  for (let i = 0; i < 60 * 1.5 && sustained < 36; i += 1) {
    s = frame();
    maxAbsSlip = Math.max(maxAbsSlip, Math.abs(s.slip));
    if (Math.abs(s.slip) > 0.2 && s.drifting) sustained += 1;
  }
  set({ steer: -0.5 });
  let settledIn = -1;
  for (let i = 0; i < 60 * 1.5; i += 1) {
    s = frame();
    if (Math.abs(s.slip) < 0.05) {
      settledIn = (i + 1) / 60;
      break;
    }
  }
  const r = drain(p);
  // Slip from the node's presented motion (per substep, see scenes.ts drift).
  const maxMotionSlip = Math.max(0, ...r.map((x) => Math.abs(Number(x.telemetry!.motionSlip))));
  return { topSpeed, accelFrames, sustainedFrames: sustained, maxAbsSlip, settledIn, maxMotionSlip, frames: r.length };
}
