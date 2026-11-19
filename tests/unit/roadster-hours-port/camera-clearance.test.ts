import { describe, expect, it } from "vitest";
import { createRun, defaultCareer, stepRun, SIM_STEP, type Run } from "../../../examples/roadster-hours-port/sim";
import { DEFAULT_PARAMS, autopilot } from "../../../examples/roadster-hours-port/autopilot";
import { createCameraDirector } from "../../../examples/roadster-hours-port/camera";
import { LEVELS, levelLayout, roadProfile, type Level } from "../../../examples/roadster-hours-port/course";
import { TUBE_RING_END, landmarkPlacements } from "../../../examples/roadster-hours-port/art/landmarks";
import { lookFor } from "../../../examples/roadster-hours-port/look";
import { flankY, VIEW_BANK_MAX, viewBank, roadProfile as drawnProfile, HUD_SAFE_BOTTOM_FRAC, hazardTop, lampOnBank, ventActive, cameraRun, carCentre, chaseWant, gateBarHeight, roadNormal, roadPoint } from "../../../examples/roadster-hours-port/world";

/**
 * Saltwind camera QA (Nov 18): the chase eye dipped under the Sunbreak ramp lip ~19 s into ?autoplay=1 (its height was taken
 * above the ramped surface, which drops by the ramp height where the ramp ends), sat under the Redline inversion (world-up
 * lift on a 135 deg bank) and crossed two relay-gate bars. These sample the real director + chaseWant along every route's
 * autopilot run, and a car driven along and off each roofline-shortcut deck.
 */
type V = readonly [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const framing = (level: Level) => {
  const look = lookFor(level.id, "gu47");
  const row = look.row !== null;
  return { row, o: { offCentre: row ? 0.55 * look.seaSide : 0, eyeDrop: row ? 0.45 : 0, lookLift: row ? -0.65 : 0, chaseBack: row ? 7.8 : 8.5 } };
};

/** Eye position on the road frame at arc `s`: lateral offset and height along the banked road normal. */
function roadFrame(level: Level, s: number, eye: V): { l: number; h: number } {
  const c = roadPoint(level, s, 0, 0);
  const lat = sub(roadPoint(level, s, 1, 0), c);
  const len = Math.hypot(lat[0], lat[1], lat[2]);
  const rel = sub(eye, c);
  return { l: dot(rel, lat) / len, h: dot(rel, roadNormal(level, s)) };
}

/** Distance from (s, l, h) to an axis-aligned road-frame box (0 inside). */
const boxDist = (s: number, l: number, h: number, b: { s0: number; s1: number; l0: number; l1: number; y0: number; y1: number }) =>
  Math.hypot(Math.max(b.s0 - s, s - b.s1, 0), Math.max(b.l0 - l, l - b.l1, 0), Math.max(b.y0 - h, h - b.y1, 0));

describe("Saltwind Highway chase eye stays outside the world geometry", () => {
  it("along every route's autopilot run: above the road and ramps, clear of decks, lineups, traffic and relay-gate bars, no pops", () => {
    const report: string[] = [];
    LEVELS.forEach((level, li) => {
      const { row, o } = framing(level);
      const career = { ...defaultCareer(), unlocked: LEVELS.length - 1 };
      const run = createRun(li, career);
      const director = createCameraDirector({ eyeRate: 9, lookRate: 12, fovRate: 4 });
      const vehicles = levelLayout(level).vehicles;
      const rings = landmarkPlacements("tube-ring", level.length, level.width, -1, 913);
      if (level.id === "halo") expect(Math.max(...rings.map((r) => r.s))).toBeLessThan(TUBE_RING_END);
      let prev: V | null = null, maxPop = 0, minRoad = Infinity, minBox = Infinity, steps = 0;
      for (let i = 0; i < 120 * 120 && run.phase !== "complete"; i++) {
        stepRun(run, run.phase === "running" ? autopilot(run, DEFAULT_PARAMS) : {}, SIM_STEP, career);
        const cam = director.step(cameraRun(level, run), run.events, SIM_STEP);
        if (run.phase !== "running") { prev = null; continue; }
        steps++;
        const { eye, eyeS } = chaseWant(level, run, cam, row, o, { fovDeg: 58 + cam.fovKick, bottomFrac: HUD_SAFE_BOTTOM_FRAC }, run.traffic);
        const at = `${level.id} t=${run.time.toFixed(2)} s=${run.s.toFixed(0)}`;
        if (prev) maxPop = Math.max(maxPop, Math.abs(eye[1] - prev[1]));
        prev = eye;
        const f = roadFrame(level, eyeS, eye);
        // road ribbon (and the ramps it carries): the eye stays on the driving side, well above it
        if (Math.abs(f.l) < level.width + 0.5 && !level.gaps.some(([a, b]) => eyeS > a && eyeS < b)) {
          minRoad = Math.min(minRoad, f.h);
          expect(f.h, `${at} eye ${f.h.toFixed(2)} m above the road`).toBeGreaterThan(1.5);
        }
        // a ramp lip just behind the eye (the ribbon drops into the gap there)
        for (const [, b, h] of level.ramps) if (eyeS > b && eyeS < b + 2) expect(f.h + roadProfile(level, eyeS).ramp, `${at} over the ramp lip`).toBeGreaterThan(h + 0.5);
        for (const sc of level.shortcuts) {
          const d = boxDist(eyeS, f.l, f.h, { s0: sc.start, s1: sc.end, l0: sc.l - 5.5, l1: sc.l + 5.5, y0: sc.height - 0.3, y1: sc.height });
          minBox = Math.min(minBox, d);
          expect(d, `${at} eye near the ${sc.name} deck`).toBeGreaterThan(0.5);
        }
        for (const v of vehicles) if (eyeS > v.s0 - 3 && eyeS < v.s1 + 3) for (const b of v.boxes) {
          const d = boxDist(eyeS, f.l, f.h, b);
          minBox = Math.min(minBox, d);
          expect(d, `${at} eye in lineup ${v.piece}`).toBeGreaterThan(0.5);
        }
        // hazard columns as drawn (a vent's column only while it blows): the eye never enters one
        for (const hz of level.hazards) if (Math.abs(hz.s - eyeS) < 6 && (hz.type !== "vent" || ventActive(run.time, hz.s))) {
          const d = Math.max(Math.hypot(eyeS - hz.s, f.l - hz.l) - hz.r, f.h - hazardTop(hz));
          expect(d, `${at} eye in the ${hz.type} at ${hz.s}`).toBeGreaterThan(0.2);
        }
        for (const car of run.traffic) if (car.active && Math.abs(car.s - eyeS) < 15) for (const b of car.boxes) {
          const d = boxDist(eyeS, f.l, f.h, { s0: b.s0 + car.s, s1: b.s1 + car.s, l0: b.l0 + car.l, l1: b.l1 + car.l, y0: b.y0, y1: b.y1 });
          minBox = Math.min(minBox, d);
          expect(d, `${at} eye in traffic ${car.piece}`).toBeGreaterThan(0.5);
        }
        // Halo maglev-tube rings (top ~15 m over the road): only where the car and the eye pass well under them
        if (level.id === "halo") for (const r of rings) if (Math.abs(run.s - r.s) < 1.5 || Math.abs(eyeS - r.s) < 1.5) {
          expect(run.h + 1.3, `${at} car under ring ${r.s}`).toBeLessThan(10);
          expect(f.h, `${at} eye under ring ${r.s}`).toBeLessThan(11);
        }
        level.gates.forEach((g, gi) => {
          const bar = gateBarHeight(level, gi);
          if (Math.abs(eyeS - g.s) < 1.5) expect(Math.abs(f.h - bar), `${at} eye through relay bar ${gi}`).toBeGreaterThan(1.2);
          // the car itself (wheels to roof, 1.3 m) clears the bar too
          if (Math.abs(run.s - g.s) < 2.5) expect(run.h > bar + 0.6 || run.h + 1.3 < bar - 0.6, `${at} car through relay bar ${gi} (h ${run.h.toFixed(1)})`).toBe(true);
        });
      }
      expect(steps).toBeGreaterThan(120 * 40);
      // no pops: the eye's height moves less than 0.35 m per 1/120 s step (the ramp lip used to drop it 5-7 m in one step)
      expect(maxPop, `${level.id} worst per-step eye height change`).toBeLessThan(0.35);
      report.push(`${level.id}: road clearance >= ${minRoad.toFixed(2)} m, nearest box ${minBox.toFixed(2)} m, worst pop ${maxPop.toFixed(3)} m/step`);
    });
    console.log(report.join("\n"));
  });

  it("over each roofline-shortcut deck: driving its length, rolling off the side and off the end keeps the eye above the deck", () => {
    for (const level of LEVELS) {
      const { row, o } = framing(level);
      for (const sc of level.shortcuts) {
        for (const exit of ["end", "side"] as const) {
          const director = createCameraDirector({ eyeRate: 9, lookRate: 12, fovRate: 4 });
          const car = { s: sc.start - 40, l: 0, h: 0, v: 52, vy: 0, grounded: true, phase: "running" as Run["phase"], boosting: false, nitro: 0 };
          let fell = false;
          for (let i = 0; i < 120 * 8; i++) {
            const dt = SIM_STEP;
            car.s += car.v * dt;
            // climb onto the deck before it starts (thrust), drive on it, then leave by the end or drift off its inner edge
            const onDeckSpan = car.s >= sc.start && car.s <= sc.end;
            if (car.s < sc.start) { car.l += (sc.l - car.l) * Math.min(1, dt * 4); car.h = Math.min(sc.height, car.h + dt * 6); car.grounded = false; }
            else if (exit === "side" && car.s > (sc.start + sc.end) / 2) car.l -= Math.sign(sc.l) * 9 * dt;
            const overDeck = onDeckSpan && Math.abs(car.l - sc.l) < 5.5;
            if (overDeck && car.s >= sc.start) { car.h = sc.height; car.vy = 0; car.grounded = true; }
            else if (car.s >= sc.start) { fell = true; car.grounded = false; car.vy -= 22 * dt; car.h = Math.max(0, car.h + car.vy * dt); if (car.h === 0) { car.vy = 0; car.grounded = true; } }
            const cam = director.step(cameraRun(level, car), [], dt);
            const { eye, eyeS } = chaseWant(level, car, cam, row, o, { fovDeg: 58 + cam.fovKick, bottomFrac: HUD_SAFE_BOTTOM_FRAC });
            const f = roadFrame(level, eyeS, eye);
            const d = boxDist(eyeS, f.l, f.h, { s0: sc.start, s1: sc.end, l0: sc.l - 5.5, l1: sc.l + 5.5, y0: sc.height - 0.3, y1: sc.height });
            expect(d, `${level.id} ${sc.name} ${exit} exit, car s=${car.s.toFixed(0)} l=${car.l.toFixed(1)} h=${car.h.toFixed(1)}: eye l=${f.l.toFixed(1)} h=${f.h.toFixed(1)}`).toBeGreaterThan(0.5);
            if (car.s > sc.end + 40) break;
          }
          expect(fell, `${level.id} ${sc.name}: the car left the deck (${exit})`).toBe(true);
        }
      }
    }
  });

  it("the car rests on the banked road: its centre is lifted along the road normal, never sunk into a suction bank", () => {
    for (const level of LEVELS) for (const [a, b] of level.banks) for (let s = a; s <= b; s += 10) {
      const c = carCentre(level, { s, l: 0, h: 0 }, 0.6);
      const f = roadFrame(level, s, c);
      expect(f.h, `${level.id} s=${s} bank ${roadProfile(level, s).bank.toFixed(2)}`).toBeCloseTo(0.6, 3);
      expect(Math.abs(f.l)).toBeLessThan(1e-6);
    }
  });

  it("keeps street lamps off the suction banks (a world-vertical pole leans across the rolled frame there)", () => {
    for (const level of LEVELS) for (const [a, b] of level.banks) {
      const mid = (a + b) / 2;
      expect(lampOnBank(level, mid)).toBe(true);
      expect(lampOnBank(level, a - 5)).toBe(false);
    }
  });

  it("draws a vent's column exactly while the sim's vent hitbox is live (no driving through a drawn column)", () => {
    const level = LEVELS[1]!;
    const vent = level.hazards.find((h) => h.type === "vent")!;
    const career = { ...defaultCareer(), unlocked: LEVELS.length - 1 };
    let hits = 0, passes = 0;
    for (let k = 0; k < 40; k++) {
      const run = createRun(1, career);
      while (run.phase !== "running") stepRun(run, {}, SIM_STEP, career);
      run.time = k * 0.1; run.s = vent.s - 2; run.l = vent.l; run.h = 0; run.v = 10;
      run.events.length = 0;
      const on = ventActive(run.time + SIM_STEP, vent.s);
      stepRun(run, { throttle: 0, brake: 0, steer: 0, thrust: false, drift: false, nitro: false, roll: 0, spin: 0, flip: 0, recover: false }, SIM_STEP, career);
      const hit = run.events.some((e) => e.type === "impact");
      expect(hit, `t=${(k * 0.1).toFixed(1)} column ${on ? "shown" : "hidden"}`).toBe(on);
      if (hit) hits++; else passes++;
    }
    expect(hits).toBeGreaterThan(5);
    expect(passes).toBeGreaterThan(5);
  });

  it("draws every bank below 90 deg (the road and its canyon walls never fold over the chase eye), the gentle banks as raced", () => {
    for (const level of LEVELS) for (const [a, b, peak] of level.banks) {
      let worst = 0;
      for (let s = a; s <= b; s += 2) worst = Math.max(worst, Math.abs(drawnProfile(level, s).bank));
      expect(worst, level.id).toBeLessThanOrEqual(VIEW_BANK_MAX + 1e-9);
      expect(worst).toBeLessThan(Math.PI / 2 - 0.1);
      if (peak < 1.4) expect(Math.abs(viewBank(peak) - peak), level.id).toBeLessThan(0.07);
    }
    // continuous and monotonic through the knee
    for (let x = 0; x < 3; x += 0.01) expect(viewBank(x + 0.01)).toBeGreaterThan(viewBank(x));
  });

  it("keeps the chase eye above the terrain flanks (no camera inside a canyon wall or embankment, banks included)", () => {
    const report: string[] = [];
    LEVELS.forEach((level, li) => {
      const { row, o } = framing(level);
      const look = lookFor(level.id, "gu47");
      const seed = level.seed;
      const sides: [1 | -1, "sea" | "cliff" | "hills", number][] = [
        [look.seaSide, look.style === "canyon" ? "cliff" : "sea", seed],
        [(-look.seaSide) as 1 | -1, look.style === "coast" ? "hills" : look.style === "skyway" ? "sea" : "cliff", seed + 101]
      ];
      const career = { ...defaultCareer(), unlocked: LEVELS.length - 1 };
      const run = createRun(li, career);
      const director = createCameraDirector({ eyeRate: 9, lookRate: 12, fovRate: 4 });
      let worst = -Infinity;
      for (let i = 0; i < 120 * 120 && run.phase !== "complete"; i++) {
        stepRun(run, run.phase === "running" ? autopilot(run, DEFAULT_PARAMS) : {}, SIM_STEP, career);
        const cam = director.step(cameraRun(level, run), run.events, SIM_STEP);
        if (run.phase !== "running" || i % 4) continue;
        const { eye, eyeS } = chaseWant(level, run, cam, row, o, { fovDeg: 60, bottomFrac: HUD_SAFE_BOTTOM_FRAC }, run.traffic);
        for (const [sign, kind, sd] of sides) {
          // the flank vertex nearest the eye in plan (rows every 1 m, 0.25 m columns out to 40 m from the edge)
          let best = Infinity, ground = 0;
          for (let s = eyeS - 6; s <= eyeS + 6; s += 1) for (let d = 0.35; d <= 40; d += 0.25) {
            const [x, , z] = roadPoint(level, s, sign * (level.width + d), 0);
            const dist = Math.hypot(x - eye[0], z - eye[2]);
            if (dist < best) { best = dist; ground = flankY(level, look, sign, kind, sd, s, d); }
          }
          if (best > 0.6) continue;
          worst = Math.max(worst, ground - eye[1]);
          expect(eye[1] - ground, `${level.id} t=${run.time.toFixed(2)} s=${run.s.toFixed(0)} side ${sign}`).toBeGreaterThan(0.5);
        }
      }
      report.push(`${level.id}: eye vs flank worst ${worst.toFixed(2)} m`);
    });
    console.log(report.join("\n"));
  }, 120_000);
});
