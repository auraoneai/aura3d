import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createFixedStepLoop } from "../../../packages/engine/src/qa/fixedStepLoop";
import { runMotionGate } from "../../../packages/game/src/motion/index";
import { aimError } from "../../../apps/showcase-aura-hoops-3d/src/shotPhysics";
import {
  CPU_DUNK_RATE, GREEN_QUALITY, PERFECT_QUALITY, SIM_STEP, advanceMeter, blendPose, canBlockRelease, clearTarget, contrastRatio,
  decayRimShake, deadBallPossession, dunkRejectChance, isCleared, isDeadBall, makeCosmeticRng, matchDifficulty, meterQuality,
  releaseRead, separate, squadAimSkill, teamKits, tourNeedsReset, type Pose
} from "../../../apps/showcase-aura-hoops-3d/src/rules";

const MAIN = readFileSync(path.resolve(__dirname, "../../../apps/showcase-aura-hoops-3d/src/main.ts"), "utf8");
const HTML = readFileSync(path.resolve(__dirname, "../../../apps/showcase-aura-hoops-3d/index.html"), "utf8");
const RIM: [number, number, number] = [0, 3.05, 0];
const ARC_R = 6.75;
// the meter the route opens from 8.6 m, uncontested, PRO
const G = { g0: 0.72 - 0.0712, g1: 0.72 + 0.0712, perfect: 0.72 };

const lcg = (seed: number) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; }; };
/** Make rate for a release quality at the check spot (the ball is a make when the aim error is inside the clear opening). */
function makeRate(quality: number, n = 4000): number {
  const rand = lcg(7);
  let made = 0;
  for (let i = 0; i < n; i++) { const e = aimError(quality, 8.6, 0, 0.06, rand); if (Math.hypot(e.dx, e.dz) < 0.118) made++; }
  return made / n;
}

describe("Aura Hoops shot meter (C3, C4)", () => {
  it("an early tap is an early miss, not the old automatic 0.94", () => {
    const q = meterQuality(0.2, G.g0, G.g1, G.perfect);
    expect(q).toBe(0);
    expect(releaseRead(0.2, q, G.perfect)).toBe("early");
    expect(makeRate(q)).toBeLessThan(0.05);
    expect(makeRate(0.94)).toBeGreaterThan(0.9); // what every tap used to get
  });

  it("holding past the end stops the needle at 1 (late brick); it never wraps back to a free tap", () => {
    let t = 0;
    for (let i = 0; i < 200; i++) t = advanceMeter(t, 1 / 60);
    expect(t).toBe(1);
    const q = meterQuality(t, G.g0, G.g1, G.perfect);
    expect(q).toBe(0);
    expect(releaseRead(t, q, G.perfect)).toBe("late");
  });

  it("a release on the mark is perfect, inside the window is green, and the quality falls off both ways", () => {
    expect(meterQuality(0.72, G.g0, G.g1, G.perfect)).toBe(1);
    expect(releaseRead(0.72, 1, G.perfect)).toBe("perfect");
    const inWindow = meterQuality(0.735, G.g0, G.g1, G.perfect);
    expect(inWindow).toBeGreaterThan(GREEN_QUALITY);
    expect(inWindow).toBeLessThan(PERFECT_QUALITY);
    expect(meterQuality(0.7, G.g0, G.g1, G.perfect)).toBeCloseTo(meterQuality(0.74, G.g0, G.g1, G.perfect), 9);
    expect(meterQuality(0.66, G.g0, G.g1, G.perfect)).toBeLessThan(inWindow);
    expect(makeRate(1)).toBeGreaterThan(makeRate(meterQuality(0.66, G.g0, G.g1, G.perfect)));
  });

  it("only a perfect release is unblockable", () => {
    expect(canBlockRelease(0.95)).toBe(true);
    expect(canBlockRelease(PERFECT_QUALITY + 0.001)).toBe(false);
  });

  it("the route releases at the needle's real position and the check press cannot also open the meter", () => {
    expect(MAIN).not.toMatch(/inputCtl\.buffered\(/);
    expect(MAIN).not.toMatch(/tapRelease = true/);
    expect(MAIN).toMatch(/releaseShot\(me, meterQuality\(sm\.t, sm\.g0, sm\.g1, sm\.perfect\), sm\.t\)/);
    expect(MAIN).toMatch(/game_\.time - game_\.liveSince >= CHECK_SHOT_GUARD/);
    expect(MAIN).toMatch(/canBlockRelease\(quality\)/);
  });
});

describe("Aura Hoops dead balls (C5)", () => {
  it("a loose ball only dies after its own loose timer, whatever the last flight lasted", () => {
    expect(isDeadBall({ state: "loose", flightT: 9, looseT: 0.1, x: 0, z: 5 })).toBe(false);
    expect(isDeadBall({ state: "loose", flightT: 0, looseT: 4.1, x: 0, z: 5 })).toBe(true);
    expect(isDeadBall({ state: "flight", flightT: 4.1, looseT: 0, x: 0, z: 5 })).toBe(true);
    expect(isDeadBall({ state: "held", flightT: 9, looseT: 9, x: 0, z: 5 })).toBe(false);
    expect(isDeadBall({ state: "loose", flightT: 0, looseT: 0, x: 30, z: 5 })).toBe(true);
  });

  it("the team that touched it last loses it", () => {
    expect(deadBallPossession("home")).toBe("away");
    expect(deadBallPossession("away")).toBe("home");
  });

  it("every ball state change resets the timers, and dead balls go against the last touch, never the scorer", () => {
    expect(MAIN).toMatch(/enterCheck\(deadBallPossession\(ball\.lastTouch\)\)/);
    expect(MAIN).not.toMatch(/ball\.flightT > 4 \|\|/);
    // startDunk, the steal and grabs reset flightT; a made basket is never a dead ball
    expect(MAIN).toMatch(/state: "dunk" as BallState[^\n]*flightT: 0/);
    expect(MAIN).toMatch(/ball\.flightT = 0; ball\.looseT = 0; ball\.lastTouch = def\.team/);
    expect(MAIN).toMatch(/!ball\.scored && \(game_\.phase === "live" \|\| game_\.phase === "shot"\) && isDeadBall\(ball\)/);
  });
});

describe("Aura Hoops take-back (C6)", () => {
  it("the clear target is past the arc and isCleared agrees", () => {
    for (const [x, z] of [[0, 1], [2, 2], [-3, 4], [0.1, 0.1]] as const) {
      const [cx, cz] = clearTarget(x, z, RIM, ARC_R);
      expect(isCleared(cx, cz, RIM, ARC_R)).toBe(true);
    }
    expect(isCleared(0, 3, RIM, ARC_R)).toBe(false);
  });

  it("the CPU clears before it can shoot or dunk, and the player is stopped with a prompt", () => {
    expect(MAIN).toMatch(/if \(game_\.mustClear\) \{\n\s+a\.aiPlan = "clear";/);
    expect(MAIN).toMatch(/TAKE IT BACK — PAST THE ARC FIRST/);
    expect(MAIN).toMatch(/game_\.jamFull && !game_\.mustClear/);
  });
});

describe("Aura Hoops dunks (C7)", () => {
  it("a close defender can reject a dunk, a far or stumbling one cannot, and a timed jump contests harder", () => {
    const base = { defenderDistance: 0.6, defenderAirborne: false, defenderStumbling: false, dunk: 7, defense: 7, contestScale: 1 };
    expect(dunkRejectChance(base)).toBeGreaterThan(0.1);
    expect(dunkRejectChance({ ...base, defenderAirborne: true })).toBeGreaterThan(dunkRejectChance(base));
    expect(dunkRejectChance({ ...base, defenderDistance: 1.5 })).toBe(0);
    expect(dunkRejectChance({ ...base, defenderStumbling: true })).toBe(0);
    expect(dunkRejectChance({ ...base, dunk: 9, defense: 5 })).toBeLessThan(dunkRejectChance({ ...base, dunk: 5, defense: 9 }));
  });

  it("the CPU dunk rate climbs with difficulty", () => {
    expect(CPU_DUNK_RATE.playground).toBeLessThan(CPU_DUNK_RATE.pro);
    expect(CPU_DUNK_RATE.pro).toBeLessThan(CPU_DUNK_RATE.legend);
    expect(MAIN).toMatch(/a\.dunkIntent = rng\(\) < CPU_DUNK_RATE\[game_\.diff\]/);
    expect(MAIN).toMatch(/rejectDunk\(a, def\)/);
  });
});

describe("Aura Hoops difficulty and tour (C13)", () => {
  it("only Street Tour climbs the ladder; other modes use the player's pick", () => {
    expect(matchDifficulty("tour", 4, "playground")).toBe("legend");
    expect(matchDifficulty("quick", 4, "pro")).toBe("pro");
    expect(matchDifficulty("blacktop", 3, "playground")).toBe("playground");
  });

  it("a finished tour restarts from either the R key or the menu card", () => {
    expect(tourNeedsReset({ active: true, champion: true, eliminated: false })).toBe(true);
    expect(tourNeedsReset({ active: true, champion: false, eliminated: true })).toBe(true);
    expect(tourNeedsReset({ active: false, champion: false, eliminated: false })).toBe(true);
    expect(tourNeedsReset({ active: true, champion: false, eliminated: false })).toBe(false);
    expect(MAIN).toMatch(/if \(mode === "tour" && tourNeedsReset\(game_\.tour\)\)/);
    expect(MAIN).toMatch(/game_\.diff = matchDifficulty\(mode, game_\.tour\.round, game_\.userDiff\)/);
  });
});

describe("Aura Hoops squads and kits (C8, C9)", () => {
  const SQUADS = [
    { color: "#ff7a1a", alt: "#1a1206" }, { color: "#ffd257", alt: "#20180a" }, { color: "#39d7ff", alt: "#06222b" }, { color: "#66e37f", alt: "#0a220e" },
    { color: "#e26bff", alt: "#220a2b" }, { color: "#7dfcff", alt: "#06222b" }, { color: "#ff3b5c", alt: "#2b0710" }, { color: "#f2f0e2", alt: "#23211a" }
  ];
  it("every home/away pairing gets jerseys that differ in brightness, not only hue (2:1 or more)", () => {
    for (const h of SQUADS) for (const a of SQUADS) {
      if (h === a) continue;
      const k = teamKits(h, a);
      expect(contrastRatio(k.home.jersey, k.away.jersey), `${h.color} vs ${a.color}`).toBeGreaterThanOrEqual(2);
    }
  });

  it("the shooting stat moves aim skill", () => {
    expect(squadAimSkill({ shoot: 9, speed: 7, dunk: 7, defense: 7 })).toBeGreaterThan(squadAimSkill({ shoot: 5, speed: 7, dunk: 7, defense: 7 }));
    expect(squadAimSkill({ shoot: 7, speed: 7, dunk: 7, defense: 7 })).toBeCloseTo(0.06, 9);
  });

  it("athletes wear per-team kits on region materials, rings differ in shape, and APPLY FIT reaches the materials", () => {
    expect(MAIN).toMatch(/assets\.hoopsAthleteBigKit : assets\.hoopsAthleteGuardKit/);
    expect(MAIN).toMatch(/target: RegExp, color: string/);
    expect(MAIN).toMatch(/team === "away" \? \{ params: \{ tubularSegments: 4 \} \}/);
    expect(MAIN).toMatch(/game_\.appliedFit = \{ \.\.\.game_\.fit \};\n\s+rebuildScene\(\);/);
    expect(MAIN).toMatch(/id="squad-row"|squad-row/);
    expect(HTML).toMatch(/id="squad-row"/);
  });
});

describe("Aura Hoops separation (C17)", () => {
  it("pushes overlapping bodies to the minimum distance and leaves a pinned dunker in place", () => {
    const bodies = [{ x: 0, z: 0 }, { x: 0.1, z: 0 }, { x: 0.05, z: 0.1, pinned: true }];
    for (let i = 0; i < 6; i++) separate(bodies);
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
      expect(Math.hypot(bodies[i]!.x - bodies[j]!.x, bodies[i]!.z - bodies[j]!.z)).toBeGreaterThan(0.5);
    }
    expect(bodies[2]).toMatchObject({ x: 0.05, z: 0.1 });
  });
});

describe("Aura Hoops render and determinism (C19)", () => {
  it("rim shake clamps at 0 and uses its own RNG", () => {
    expect(decayRimShake(0.01, 1)).toBe(0);
    const a = makeCosmeticRng(1), b = makeCosmeticRng(1);
    expect(a()).toBe(b());
    expect(MAIN).toMatch(/\(fxRng\(\) - 0\.5\) \* rimShake/);
    expect(MAIN).not.toMatch(/\(rng\(\) - 0\.5\) \* rimShake/);
  });

  it("the sim runs on createFixedStepLoop at 1/60 and draws between steps", () => {
    expect(SIM_STEP).toBeCloseTo(1 / 60, 12);
    expect(MAIN).toMatch(/createFixedStepLoop\(\{/);
    expect(MAIN).toMatch(/render: \(\) => present\(simLoop\.alpha\)/);
  });

  // The route's presenter is blendPose between the last two steps; the gate drives a runner through the same loop shape.
  const gate = (hz: number, interpolate: boolean) => {
    let prev: Pose = { x: 0, y: 0, z: 0, yaw: 0 }, cur: Pose = { x: 0, y: 0, z: 0, yaw: 0 };
    let x = 0, yaw = 0;
    return runMotionGate({
      displayHz: hz, seconds: 3, warmupSeconds: 0.25,
      step: (dt) => { x += 4.6 * dt; yaw += 0.6 * dt; },
      afterStep: () => { prev = cur; cur = { x, y: 0, z: 0, yaw }; },
      drawn: (alpha) => { const p = interpolate ? blendPose(prev, cur, alpha) : cur; return [p.x, p.yaw]; }
    });
  };
  it("motion gate: drawing the latest step stalls at 120/144 Hz; the blend advances every frame at 60, 120 and 144 Hz", () => {
    expect(gate(144, false).stillFraction).toBeGreaterThan(0.4);
    for (const hz of [60, 120, 144]) {
      const r = gate(hz, true);
      expect(r.stillFrames, `${hz} Hz`).toBe(0);
      expect(r.passed, `${hz} Hz ${r.failures.join(",")}`).toBe(true);
    }
  });

  it("a teleport (check reset) snaps instead of sliding across the court", () => {
    const p = blendPose({ x: 0, y: 0, z: 0, yaw: 0 }, { x: 6, y: 0, z: 0, yaw: 0 }, 0.5);
    expect(p.x).toBe(6);
    const loop = createFixedStepLoop({ step: () => undefined, schedule: () => 0, cancel: () => undefined, maxCatchUpSteps: 3, maxFrameSeconds: 0.05 });
    expect(loop.tick(1000)).toBe(3); // a long software-GL frame is still capped at 0.05 s of game time
  });
});

describe("Aura Hoops menu, prompt, trail, a11y (C14, C15, C16, C18)", () => {
  it("the menu pauses the sim, is inert when closed, closes into the pending mode, and pauses on visibilitychange", () => {
    expect(MAIN).toMatch(/if \(menuIsOpen\(\)\) \{[\s\S]{0,200}return;/);
    expect(MAIN).toMatch(/toggleAttribute\("inert", !open\)/);
    expect(MAIN).toMatch(/if \(!open && autoStart && game_\.phase === "menu"\)/);
    expect(MAIN).toMatch(/addEventListener\("visibilitychange"/);
    expect(HTML).toMatch(/id="menu-overlay"[^>]*inert/);
  });
  it("enterLive hides the check prompt; every shot, pass, dunk and check clears the trail", () => {
    expect(MAIN).toMatch(/promptEl\?\.classList\.remove\("show"\);\n\s+game_\.promptT = 0;/);
    expect((MAIN.match(/trailHist\.length = 0;/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });
  it("HUD text is 11 px or larger, there is a mute and a rematch button, and the jam flash honours reduced flash", () => {
    expect(HTML).not.toMatch(/font-size: (8|9|10)px/);
    expect(HTML).toMatch(/id="tb-mute"/);
    expect(HTML).toMatch(/id="res-rematch"/);
    expect(HTML).toMatch(/aria-live="polite"/);
    expect(MAIN).toMatch(/function flashJam\(alpha = 0\.85\): void \{ if \(!reducedFlash\)/);
    expect(MAIN).not.toMatch(/R TO REMATCH/);
  });
  it("touch controls are not hidden by the page and have a move stick", () => {
    expect(HTML).not.toMatch(/\.touch-controls \{\s*display: none;/);
    expect(HTML).toMatch(/\.a3g-touch \{\s*position: fixed;/);
    expect(HTML).toMatch(/id="touch-stick"/);
    // without HudKit on the page the hide rule must live here, or desktop shows the buttons
    expect(HTML).toMatch(/\.a3g-touch\.a3g-hidden \{\s*display: none;/);
  });
});
