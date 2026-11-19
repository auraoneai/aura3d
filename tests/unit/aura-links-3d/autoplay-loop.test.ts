/**
 * `?autoplay=1` (aliases `?autopilot=1`, `?demo=1`) plays Aura Links hands-free forever: the autopilot plans every shot
 * with the live sim, the swing meter is pressed on the plan, holes advance, and after the card the next round starts on
 * the next course. main.ts is DOM/engine-bound, so this drives the same pieces it wires together (game/autoplayLoop.ts
 * decides when, game/autopilot.ts plans, the real swing meter, launchBall/stepBall with the drawn trees and the pin,
 * the stroke / pickup rules) through main.ts's phase timers, for many simulated minutes.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COURSES, COURSE_ORDER, buildHoleTerrain } from "../../../apps/showcase-aura-links-3d/src/game/courses";
import { AUTOPLAY_TIMING, autoplayAction, autoplayRequested, nextAutoplayCourse } from "../../../apps/showcase-aura-links-3d/src/game/autoplayLoop";
import { clubForShot, planShot, type ShotPlan } from "../../../apps/showcase-aura-links-3d/src/game/autopilot";
import { pickupScore, shouldPickUp } from "../../../apps/showcase-aura-links-3d/src/game/flow";
import { ACC_DEAD_ZONE, createSwingMeter, launchBall, liePenalty, makeRng, rollWind, stepBall } from "../../../apps/showcase-aura-links-3d/src/game/sim";
import { courseTreeSpots, treeColliders, visibleTreeColliders } from "../../../apps/showcase-aura-links-3d/src/game/treeSpots";
import type { BallState, CourseId, HoleTerrain, LieKind, PinObstacle, ShotEnv, TreeObstacle, Vec3 } from "../../../apps/showcase-aura-links-3d/src/game/types";

/** main.ts timings (seconds): SWING_TIMING, the between / card pauses, the 120 Hz ball step */
const SWING = { backswingS: 0.92, topHoldMinS: 0.14, topHoldMaxS: 2.6, downswingS: 0.3, puttBackS: 0.5, puttDownS: 0.28 };
const BETWEEN_REST_S = 0.85, BETWEEN_PENALTY_S = 1.1, CARD_S = 2.4, BALL_DT = 1 / 120, DT = 1 / 30;

type Phase = "menu" | "address" | "swing" | "flight" | "between" | "card" | "roundover";

/** a headless Quick Play session with autoplay on */
function session(startPhase: Phase = "address", startCourse: CourseId = "stAuroras") {
  let courseId = startCourse;
  let course = COURSES[courseId];
  let holeIndex = 0;
  let terrain: HoleTerrain = buildHoleTerrain(course, course.holes[0]!);
  let trees = courseTreeSpots(course, course.holes[0]!, terrain);
  let colliders = treeColliders(terrain, trees, course.dressing.theme, "idol");
  let wind = rollWind(course, makeRng(1));
  let pin: PinObstacle = { x: terrain.cup[0], z: terrain.cup[2], y0: terrain.cup[1], height: 3.1, radius: 0.013 };
  const st = {
    phase: startPhase as Phase, simTime: 0, phaseEnteredAt: 0, lastPhase: "" as string, until: 0,
    strokes: 0, ballPos: [0, 0, 0] as Vec3, prevPos: [0, 0, 0] as Vec3, ball: null as BallState | null,
    plan: null as ShotPlan | null, swingAt: 0, committedAt: -1, lie: "tee" as LieKind, env: null as ShotEnv | null,
    totalStrokes: 0, holesDone: 0, roundsDone: 0, coursesPlayed: [startCourse] as CourseId[], holed: 0, scores: [] as number[]
  };
  const meter = createSwingMeter({ deadZone: ACC_DEAD_ZONE });

  const startHole = (i: number) => {
    holeIndex = i;
    const hole = course.holes[i]!;
    terrain = buildHoleTerrain(course, hole);
    trees = courseTreeSpots(course, hole, terrain);
    colliders = treeColliders(terrain, trees, course.dressing.theme, "idol");
    pin = { x: terrain.cup[0], z: terrain.cup[2], y0: terrain.cup[1], height: 3.1, radius: 0.013 };
    wind = rollWind(course, makeRng(7 + i));
    st.strokes = 0;
    st.ballPos = [terrain.tee[0], terrain.tee[1] + 0.05, terrain.tee[2]];
    st.prevPos = st.ballPos;
    st.ball = null;
    st.phase = "address";
  };
  const startRound = () => startHole(0);
  const toCard = (score: number) => {
    st.scores.push(score);
    st.holesDone += 1;
    st.phase = "card";
    st.until = st.simTime + CARD_S;
  };
  const visible = (yaw: number): TreeObstacle[] => visibleTreeColliders(colliders, trees, [st.ballPos[0], st.ballPos[2]], yaw);
  const pickUp = () => {
    if (!shouldPickUp(st.strokes, course.holes[holeIndex]!.par)) return false;
    toCard(pickupScore(course.holes[holeIndex]!.par));
    return true;
  };
  if (startPhase === "address") startRound();

  function tick() {
    st.simTime += DT;
    if (st.phase !== st.lastPhase) { st.lastPhase = st.phase; st.phaseEnteredAt = st.simTime; }
    const act = autoplayAction({ enabled: true, still: false, phase: st.phase, simTime: st.simTime, phaseEnteredAt: st.phaseEnteredAt, lastManualInputAt: -10 });
    if (act === "swing") {
      st.lie = st.strokes === 0 ? "tee" : terrain.zone(st.ballPos[0], st.ballPos[2]);
      if (st.lie === "water" || st.lie === "oob") st.lie = "rough";
      const yaw0 = Math.atan2(terrain.cup[0] - st.ballPos[0], terrain.cup[2] - st.ballPos[2]);
      st.plan = planShot({ terrain, gravity: course.gravity, airDensity: course.airDensity, wind, ballPos: st.ballPos, lie: st.lie, obstacles: visible(yaw0), pin });
      meter.reset();
      meter.press();
      st.phase = "swing";
      st.swingAt = st.simTime;
      st.committedAt = -1;
    } else if (act === "next-round") {
      st.roundsDone += 1;
      courseId = nextAutoplayCourse(COURSE_ORDER, courseId);
      course = COURSES[courseId];
      st.coursesPlayed.push(courseId);
      startRound();
    } else if (act === "leave-menu") {
      startRound();
    } else if (act === "settle-ball" && st.ball) {
      st.ballPos = st.ball.pos;
      st.phase = "between";
      st.until = st.simTime + BETWEEN_REST_S;
    }

    if (st.phase === "swing" && st.plan) {
      // the autopilot presses the meter on the planned power and at the centre of the needle (main.ts)
      const s = meter.tick(DT);
      if (st.committedAt < 0) {
        if (s.phase === "committed") st.committedAt = st.simTime;
        else if (s.phase === "power" && s.meter >= st.plan.power) meter.press();
        else if (s.phase === "accuracy" && Math.abs(s.meter) <= meter.deadZone() * 0.5 && meter.press().phase === "committed") st.committedAt = st.simTime;
      }
      const putt = st.plan.club === "putter";
      const top = st.swingAt + (putt ? SWING.puttBackS : SWING.backswingS);
      const release = st.committedAt >= 0 ? Math.max(top + SWING.topHoldMinS, st.committedAt) : top + SWING.topHoldMaxS;
      if (st.simTime >= release + (putt ? SWING.puttDownS : SWING.downswingS)) {
        // impact: the planned shot launches (accuracy 0, spin 0), a stroke is counted
        st.strokes += 1;
        st.totalStrokes += 1;
        const club = clubForShot(st.plan.club, terrain.cupDistance(st.ballPos[0], st.ballPos[2]));
        const obstacles = visible(st.plan.aimYaw);
        const launchEnv: ShotEnv = { terrain, gravity: course.gravity, airDensity: course.airDensity, wind, lie: st.lie, liePenalty: liePenalty(st.lie), obstacles, pin };
        st.ball = { ...launchBall({ club, power: st.plan.power, accuracy: 0, spin: 0, aimYaw: st.plan.aimYaw }, launchEnv), pos: st.ballPos };
        st.env = { ...launchEnv, lie: club.putter ? "green" : "fairway", liePenalty: 1 };
        st.prevPos = st.ballPos;
        st.phase = "flight";
      }
    } else if (st.phase === "flight" && st.ball && st.env) {
      for (let k = 0; k < Math.round(DT / BALL_DT) && st.phase === "flight"; k++) {
        const { ball, events } = stepBall(st.ball, st.env, BALL_DT);
        st.ball = ball;
        for (const ev of events) {
          if (ev.kind === "holed") { st.holed += 1; toCard(st.strokes); break; }
          if (ev.kind === "water" || ev.kind === "oob") {
            st.strokes += 1; st.totalStrokes += 1;
            st.ballPos = st.prevPos;
            if (!pickUp()) { st.phase = "between"; st.until = st.simTime + BETWEEN_PENALTY_S; }
            break;
          }
          if (ev.kind === "rest") {
            st.ballPos = [ev.pos[0], ev.pos[1], ev.pos[2]];
            if (!pickUp()) { st.phase = "between"; st.until = st.simTime + BETWEEN_REST_S; }
            break;
          }
        }
      }
    } else if (st.phase === "between" && st.simTime > st.until) {
      st.ball = null;
      st.phase = "address";
    } else if (st.phase === "card" && st.simTime > st.until) {
      if (holeIndex + 1 >= 9) st.phase = "roundover";
      else startHole(holeIndex + 1);
    }
  }
  return { st, tick, get holeIndex() { return holeIndex; }, get courseId() { return courseId; } };
}

describe("aura links autoplay loop", () => {
  it("?autoplay=1, ?autopilot=1 and ?demo=1 switch it on; nothing else does", () => {
    expect(autoplayRequested(new URLSearchParams("autoplay=1"))).toBe(true);
    expect(autoplayRequested(new URLSearchParams("autopilot=1"))).toBe(true);
    expect(autoplayRequested(new URLSearchParams("demo=1"))).toBe(true);
    expect(autoplayRequested(new URLSearchParams(""))).toBe(false);
    expect(autoplayRequested(new URLSearchParams("autoplay=0&course=neonBay"))).toBe(false);
  });

  it("acts only when enabled and outside the player's input grace; never in ?still capture", () => {
    const base = { enabled: true, still: false, phase: "address", simTime: 10, phaseEnteredAt: 5, lastManualInputAt: -10 };
    expect(autoplayAction(base)).toBe("swing");
    expect(autoplayAction({ ...base, enabled: false })).toBe("none");
    expect(autoplayAction({ ...base, still: true })).toBe("none");
    expect(autoplayAction({ ...base, lastManualInputAt: 9 })).toBe("none");
    expect(autoplayAction({ ...base, phaseEnteredAt: 9.5 })).toBe("none");
    expect(autoplayAction({ ...base, phase: "menu" })).toBe("leave-menu");
    expect(autoplayAction({ ...base, phase: "roundover" })).toBe("next-round");
    expect(autoplayAction({ ...base, phase: "flight", phaseEnteredAt: 10 - AUTOPLAY_TIMING.flightWatchdogS - 1 })).toBe("settle-ball");
    expect(autoplayAction({ ...base, phase: "flight" })).toBe("none");
    for (const p of ["swing", "between", "card"]) expect(autoplayAction({ ...base, phase: p })).toBe("none");
    expect(nextAutoplayCourse(COURSE_ORDER, COURSE_ORDER[COURSE_ORDER.length - 1]!)).toBe(COURSE_ORDER[0]);
    expect(nextAutoplayCourse(COURSE_ORDER, "stAuroras")).toBe(COURSE_ORDER[1]);
  });

  it("from the menu, play starts within ~3 s with no key press", () => {
    const g = session("menu");
    let firstSwingAt = -1;
    for (let i = 0; i < 30 * 8 && firstSwingAt < 0; i++) {
      g.tick();
      if (g.st.phase === "swing") firstSwingAt = g.st.simTime;
    }
    // menu -> Quick Play after AUTOPLAY_TIMING.menuS, first swing AUTOPLAY_TIMING.addressS later
    expect(firstSwingAt).toBeGreaterThan(0);
    expect(firstSwingAt).toBeLessThan(AUTOPLAY_TIMING.menuS + AUTOPLAY_TIMING.addressS + 0.5);
  });

  it("plays hole after hole and round after round on the next course, never stuck for 5 s", () => {
    const g = session("address");
    let lastProgressAt = 0;
    let lastPhase = g.st.phase;
    let lastPos: Vec3 = g.st.ballPos;
    let worstStall = 0;
    const SECONDS = 1500;
    for (let i = 0; i < SECONDS * 30; i++) {
      g.tick();
      const pos = g.st.ball?.pos ?? g.st.ballPos;
      const moved = Math.hypot(pos[0] - lastPos[0], pos[1] - lastPos[1], pos[2] - lastPos[2]) > 0.01;
      if (g.st.phase !== lastPhase || moved || g.st.phase === "swing") lastProgressAt = g.st.simTime;
      worstStall = Math.max(worstStall, g.st.simTime - lastProgressAt);
      lastPhase = g.st.phase;
      lastPos = pos;
      if (g.st.roundsDone >= 2) break;
    }
    expect(g.st.totalStrokes).toBeGreaterThan(0);
    expect(g.st.holesDone).toBeGreaterThanOrEqual(18);
    // competent: it holes out (no pickups) and averages within a few strokes of par
    expect(g.st.holed).toBe(g.st.holesDone);
    expect(Math.max(...g.st.scores)).toBeLessThanOrEqual(8);
    // the round restarts after the card, on the next course in the order
    expect(g.st.roundsDone).toBeGreaterThanOrEqual(2);
    expect(g.st.coursesPlayed.slice(0, 3)).toEqual(COURSE_ORDER.slice(0, 3));
    expect(worstStall).toBeLessThan(5);
  }, 300_000);

  it("main.ts wires the loop: URL aliases, the O toggle, no flyover in autoplay, next course after the card, menu exit", () => {
    const src = readFileSync("apps/showcase-aura-links-3d/src/main.ts", "utf8");
    expect(src).toMatch(/let autopilot = autoplayRequested\(bootUrlParams\);/);
    expect(src).toMatch(/autoplayAction\(\{ enabled: autopilot, still: isStillMode, phase: state\.phase, simTime, phaseEnteredAt, lastManualInputAt \}\)/);
    expect(src).toMatch(/justPressed\.has\("KeyO"\) && !isStillMode\) toggleAutopilot\(\)/);
    expect(src).toMatch(/!allowed \|\| autopilot \|\|/);
    expect(src).toMatch(/selectCourse\(nextAutoplayCourse\(COURSE_ORDER, state\.courseId\), false\)/);
    expect(src).toMatch(/autoAct === "leave-menu"/);
    expect(src).toMatch(/O AUTO/);
    expect(readFileSync("apps/showcase-aura-links-3d/index.html", "utf8")).toMatch(/AUTOPLAY: <b>O<\/b>/);
  });
});
