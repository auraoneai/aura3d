import { describe, expect, it } from "vitest";
import { createAutopilot } from "../../../examples/drift-and-deliver-port/autopilot";
import { BIRD_FOV, setChaseFraming, snapChase, stepChase } from "../../../examples/drift-and-deliver-port/chase";
import { createShift, stepShift } from "../../../examples/drift-and-deliver-port/shift";
import { createCar, stepCar } from "../../../examples/drift-and-deliver-port/sim";
import { buildBlocks, buildBuildings, buildPickups, buildTraffic, buildingSolids } from "../../../examples/drift-and-deliver-port/world";

/** Owner QA (Nov 18): Gridlock's chase is an elevated 3/4 bird's-eye view; the courier is 12-20% of the frame height. */
const FOOT = { halfW: 0.9954000015020373, halfD: 2.14200003592372 };
type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V): V => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };

function carFrame(eye: V, look: V, car: { x: number; z: number; heading: number }) {
  const f = norm(sub(look, eye)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f);
  const t = Math.tan((BIRD_FOV * Math.PI) / 360);
  const s = Math.sin(car.heading), c = Math.cos(car.heading);
  let lo = Infinity, hi = -Infinity;
  for (const lx of [-FOOT.halfW, FOOT.halfW]) for (const lz of [-FOOT.halfD, FOOT.halfD]) for (const y of [0, 2.2]) {
    const p: V = [car.x + c * lx + s * lz, y, car.z - s * lx + c * lz];
    const d = sub(p, eye);
    const ny = dot(d, u) / (dot(d, f) * t); // -1 bottom .. 1 top
    lo = Math.min(lo, ny); hi = Math.max(hi, ny);
  }
  return { height: (hi - lo) / 2, centreFromTop: 0.5 - (hi + lo) / 4, pitch: Math.asin(-f[1]) };
}

describe("Gridlock bird's-eye chase camera", () => {
  it("keeps the courier 12-22% of the frame height in the lower-middle third along 60 s of the autoplay route, 30-45 degrees down", () => {
    setChaseFraming("bird");
    const blocks = buildBlocks();
    const solids = buildingSolids(buildBuildings(blocks));
    const near = (x: number, z: number) => solids.filter((q) => Math.abs(q.x - x) < 30 + q.hw && Math.abs(q.z - z) < 30 + q.hd);
    const car = createCar();
    const cam = snapChase({ x: car.x, z: car.z, y: 0, heading: car.heading, speed: 0, boosting: false, shake: 0 });
    const pilot = createAutopilot();
    const shift = createShift(180);
    const pickups = buildPickups(), traffic = buildTraffic();
    const fr: number[] = [];
    for (let i = 0; i < 60 * 60; i++) {
      stepCar(car, 1 / 60, pilot.step(car, { job: shift.job, pickups, traffic }, 1 / 60), near(car.x, car.z), FOOT);
      stepShift(shift, 1 / 60, car, { combo: 0, collected: 0, total: 1 });
      stepChase(cam, { x: car.x, z: car.z, y: 0, heading: car.heading, speed: car.speed, boosting: car.boosting, shake: 0 }, 1 / 60);
      if (i < 120 || i % 15) continue;
      const m = carFrame(cam.eye as V, cam.look as V, car);
      fr.push(m.height);
      expect(m.centreFromTop).toBeGreaterThan(0.4);
      expect(m.centreFromTop).toBeLessThan(0.9);
      expect(m.pitch).toBeGreaterThan((28 * Math.PI) / 180);
      expect(m.pitch).toBeLessThan((50 * Math.PI) / 180);
    }
    const sorted = [...fr].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    expect(median).toBeGreaterThan(0.12);
    expect(median).toBeLessThan(0.22);
    setChaseFraming("close");
  }, 60_000);
});
