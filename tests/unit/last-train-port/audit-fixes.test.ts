import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DT, SHORT_LEGS, actionDepart, actionDoors, actionKeepRiding, actionNewService, attemptScore, createState, gradeOf, step,
  type RouteData, type SimData, type SimState, type StepInput, type Tables
} from "../../../examples/last-train-port/sim";
import { controllerInput } from "../../../examples/last-train-port/replay";
import { dockForward } from "../../../examples/last-train-port/world";
import { TrainSound } from "../../../examples/last-train-port/audio";

/** Audit 2026-10-29, Lamplight Line rows D-02 to D-06, D-10, D-11, E-03 (sim) and the main.ts / HTML wiring of D-01, D-04, D-12, D-13, E-01, E-02, E-05, E-06. */
const data: SimData = {
  route: JSON.parse(readFileSync("examples/last-train-port/data/route.json", "utf8")) as RouteData,
  tables: JSON.parse(readFileSync("examples/last-train-port/data/tables.json", "utf8")) as Tables
};
const CONTROLLER = { kRoll: 6, kVel: 1.2, deadband: 0.15, pace: "brisk", brakeDecel: 4, brakeMargin: 6 };
const main = readFileSync("examples/last-train-port/main.ts", "utf8");
const world = readFileSync("examples/last-train-port/world.ts", "utf8");
const pages = ["examples/last-train-port/index.html", "apps/showcase-last-train-port/index.html"].map((p) => [p, readFileSync(p, "utf8")] as const);

function until(s: SimState, phase: string): void {
  let n = 0;
  while (s.phase !== phase) {
    step(s, DT, s.phase === "enroute" ? controllerInput(s, data, CONTROLLER) : {}, data);
    if (s.phase === "docked" && phase !== "docked") actionDoors(s);
    if (++n > 200000) throw new Error(`stuck in ${s.phase}`);
  }
}

/** Drive one leg with the capture's controller, from docked to the next docked. */
function leg(s: SimState, input?: (s: SimState) => StepInput): void {
  if (s.phase === "docked") actionDoors(s);
  until("ready");
  actionDepart(s);
  let n = 0;
  while (s.phase !== "enroute") { step(s, DT, {}, data); if (++n > 20000) throw new Error("no depart"); }
  while (s.phase === "enroute") { step(s, DT, input ? input(s) : controllerInput(s, data, CONTROLLER), data); if (++n > 200000) throw new Error("no arrive"); }
  function until(phase: string): void { let g = 0; while (s.phase !== phase) { step(s, DT, {}, data); if (++g > 20000) throw new Error(`stuck in ${s.phase}`); } }
}

function service(s: SimState): void {
  for (let k = 0; k < 6; k++) leg(s);
  until(s, "ready");
}

describe("last-train-port audit fixes: simulation", () => {
  it("D-02: Enter after the results starts a free ride that keeps the station and the riders, and the tram can depart", () => {
    const s = createState();
    service(s);
    expect(s.attempt.status).toBe("complete");
    const station = s.leg, aboard = s.trips.length;
    actionKeepRiding(s);
    expect(s.attempt.status).toBe("active");
    expect(s.leg).toBe(station);
    expect(s.trips.length).toBe(aboard);
    actionDepart(s);
    for (let i = 0; i < 600; i++) step(s, DT, { accelerate: true }, data);
    expect(s.phase).toBe("enroute");
    expect(s.speed).toBeGreaterThan(1);
    expect(s.distance).toBeGreaterThan(5);
  });

  it("D-03: each service is scored on its own; the session score is separate", () => {
    const s = createState();
    service(s);
    const first = attemptScore(s.attempt);
    expect(first).toBe(s.attempt.fares + s.attempt.tips + s.attempt.bonuses);
    expect(first).toBe(s.score);
    actionNewService(s);
    service(s);
    const second = attemptScore(s.attempt);
    expect(Math.abs(second - first) / first).toBeLessThan(0.05);
    expect(s.score).toBe(first + second);
  });

  it("D-04: the lost count is tip points dropped on a catch, so it is labelled as tips (main.ts and the toast)", () => {
    expect(main).toContain(`["Tips lost", a.lost]`);
    expect(main).not.toContain("Riders lost");
    expect(main).not.toContain("A rider left unhappy");
    expect(main).toContain("Lurch! Tips lost:");
  });

  it("D-05: a running service is kept unless forced; forced, it restarts at the first station", () => {
    const s = createState();
    leg(s);
    expect(s.leg).toBe(1);
    actionNewService(s);
    expect(s.leg).toBe(1);
    const id = s.attempt.id;
    actionNewService(s, { force: true });
    expect(s.leg).toBe(0);
    expect(s.distance).toBe(0);
    expect(s.attempt.id).toBe(id + 1);
    expect(s.attempt.status).toBe("active");
    expect(main).toMatch(/Press R again to abandon this service/);
  });

  it("D-06: Gold needs comfort >= 90 and no catches, and a clean controller service reaches it", () => {
    expect(gradeOf(96.8, 0)).toBe("Gold");
    expect(gradeOf(89.9, 0)).toBe("Silver");
    expect(gradeOf(95, 1)).toBe("Silver");
    expect(gradeOf(74, 0)).toBe("Bronze");
    expect(gradeOf(99, 0, true)).toBe("Bronze");
    const s = createState();
    service(s);
    expect(s.attempt.catches).toBe(0);
    expect(s.attempt.grade).toBe("Gold");
  });

  it("D-10: the player's ramped brake (level 0.7) slows the tram without the harsh-braking comfort penalty; a full brake still costs comfort", () => {
    const run = (level: number): { comfort: number; speed: number } => {
      const s = createState();
      actionDoors(s);
      let n = 0;
      while (s.phase !== "ready") { step(s, DT, {}, data); if (++n > 20000) throw new Error("stuck"); }
      actionDepart(s);
      while (s.phase !== "enroute") step(s, DT, {}, data);
      while (s.speed < 7) step(s, DT, { accelerate: true }, data);
      const c0 = s.comfort;
      for (let i = 0; i < 30; i++) step(s, DT, { brake: true, brakeLevel: level }, data);
      return { comfort: s.comfort - c0, speed: s.speed };
    };
    const ramp = run(0.7), full = run(1);
    expect(ramp.comfort).toBeGreaterThanOrEqual(0);
    expect(full.comfort).toBeLessThan(-5);
    expect(ramp.speed).toBeLessThan(7);
    expect(main).toMatch(/BRAKE_MAX = 0\.7, BRAKE_RAMP = 0\.4/);
  });

  it("D-11: the docked heading comes from the route, not from the last rendered frame", () => {
    const f = dockForward(data, 2, 0);
    expect(Math.hypot(...f)).toBeCloseTo(1, 6);
    expect(dockForward(data, 2, 0.5)).toEqual(f);
    expect(world).not.toContain("smoothedForward");
  });

  it("E-03: a short service completes after 2 legs", () => {
    const s = createState();
    actionNewService(s, { force: true, goal: SHORT_LEGS });
    leg(s); leg(s);
    until(s, "ready");
    expect(s.attempt.status).toBe("complete");
    expect(s.attempt.ended).toBe("goal");
    expect(s.attempt.legs).toEqual([0, 1]);
  });

  it("E-03: at 0 lanterns the service ends at the next station with the grade capped at Bronze", () => {
    const s = createState();
    actionDoors(s);
    leg(s, () => ({ accelerate: true }));
    expect(s.attempt.lanterns).toBe(0);
    until(s, "ready");
    expect(s.attempt.status).toBe("complete");
    expect(s.attempt.ended).toBe("lanterns");
    expect(s.attempt.grade).toBe("Bronze");
  });
});

describe("last-train-port audit fixes: page and wiring", () => {
  it.each(pages)("D-01: %s has a four-button touch bar shown on coarse pointers, each at least 44 px", (_p, html) => {
    for (const code of ["KeyA", "KeyD", "Space", "KeyW"]) expect(html).toContain(`data-code="${code}"`);
    expect(html).toMatch(/@media \(pointer: coarse\) \{\s*\.touch \{ display: flex; \}/);
    expect(html).toMatch(/\.touch button \{ min-width: 64px; min-height: 56px;/);
    expect(html).toMatch(/touch-action: none/);
    expect(html).toContain('id="res-keep"');
    expect(html).toContain('id="res-new"');
  });

  it("D-01: touch buttons feed press/release with pointer capture and release on up, cancel and lost capture", () => {
    expect(main).toMatch(/btn\.setPointerCapture\(e\.pointerId\)/);
    for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) expect(main).toContain(`btn.addEventListener("${ev}", up)`);
  });

  it("D-12: the audio context is suspended while the tab is hidden", () => {
    expect(main).toMatch(/visibilitychange[\s\S]{0,120}sound\.setHidden\(document\.visibilityState === "hidden"\)/);
  });

  it("D-12: TrainSound.setHidden suspends a running context and resumes it, and unlock does not resume while hidden", async () => {
    const calls: string[] = [];
    const ctx = { state: "running", async suspend() { calls.push("suspend"); this.state = "suspended"; }, async resume() { calls.push("resume"); this.state = "running"; } };
    const sound = new TrainSound();
    (sound as unknown as { ctx: typeof ctx }).ctx = ctx;
    await sound.setHidden(true);
    expect(ctx.state).toBe("suspended");
    await sound.unlock();
    expect(ctx.state).toBe("suspended");
    await sound.setHidden(false);
    expect(ctx.state).toBe("running");
    expect(calls).toEqual(["suspend", "resume"]);
    expect(sound.status()).toEqual({ context: "running", muted: false, hidden: false });
  });

  it("D-13: no deprecated renderer options and no bloom radius", () => {
    expect(main).not.toMatch(/mode: "production"|fallback: "safe-basic"|qualityProfile/);
    expect(main).toContain(`quality: "auto"`);
    expect(world).not.toMatch(/radius: 0\.55/);
  });

  it("D-08: the AO node is opt-in (?fx=ao) while the engine drops the pass", () => {
    expect(world).toContain(`if (FX.has("ao")) b.add(effects.ambientOcclusion`);
  });

  it.each(pages)("E-01: %s shows a lean meter, the streak and the lanterns", (_p, html) => {
    for (const id of ["lean", "lean-dot", "lean-crit", "streak", "lanterns"]) expect(html).toContain(`id="${id}"`);
  });

  it("E-02: pixel ratio is min(devicePixelRatio, 1.5)", () => {
    expect(main).toMatch(/Math\.min\(typeof devicePixelRatio === "number" \? devicePixelRatio : 1, 1\.5\)/);
    expect(main).not.toMatch(/const dpr = 1;/);
  });

  it("E-04: the riders list is rebuilt only when its key changes; clear weather skips the rain and snow uploads", () => {
    expect(main).toMatch(/if \(key === ridersKey\) return;/);
    expect(world).toMatch(/const uploadWeather = weatherOn \|\| weatherWasOn;/);
  });

  it("E-05: temperament has a glyph and a word; reduced motion stills the camera; U toggles a large HUD", () => {
    expect(main).toContain("TEMPERAMENT_GLYPH[t.temperament]");
    expect(main).toContain("TEMPERAMENT_LABEL[t.temperament]");
    expect(main).toContain("prefers-reduced-motion: reduce");
    expect(world).toMatch(/const sway = still \? 0/);
    expect(main).toContain(`code === "KeyU"`);
  });

  it("E-06: narrow screens show 4 riders and a next-stop line; mute is saved", () => {
    expect(main).toMatch(/const limit = narrow \? 4 : rows\.length;/);
    expect(main).toContain("alighting</div>");
    expect(main).toContain("writeStore(MUTE_KEY");
  });
});
