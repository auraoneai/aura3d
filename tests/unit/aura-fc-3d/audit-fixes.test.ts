import { describe, expect, it } from "vitest";
import { aiDifficulty, createSim, penaltyLoftDeg, shotOnTarget, TEAMMATE_DIFFICULTY, GOAL_HALF_W, GOAL_H, PITCH_HX, PITCH_HZ, BALL_R } from "../../../apps/showcase-aura-fc-3d/src/game/sim";
import type { MatchConfig, PlayerState, SimEvent, UserInputFrame } from "../../../apps/showcase-aura-fc-3d/src/game/types";
import { buildFcScene, GOAL_NET_GLB_MAX, VENUE_LOOKS } from "../../../apps/showcase-aura-fc-3d/src/game/scene";
import { TEAM_KITS } from "../../../apps/showcase-aura-fc-3d/src/game/rig";
import { HUD_KIT_COLORS } from "../../../apps/showcase-aura-fc-3d/src/game/hud";
import { fitCameraToAspect, horizontalCoverage } from "../../../apps/showcase-aura-fc-3d/src/game/camera";
import { athleteAnimation } from "../../../apps/showcase-aura-fc-3d/src/game/locomotion";
import { assets } from "../../../apps/showcase-aura-fc-3d/src/aura-assets-v2";

/** Lane G09 regression tests for the 2026-10-29 audit rows (docs/audits/sections/game-09-aura-fc-3d.md). */
const IDLE: UserInputFrame = {
  move: [0, 0], sprint: false, passShort: false, passDriven: false, shootHeld: false, shootReleased: false,
  skillStepover: false, skillChop: false, switchPlayer: false, pause: false
};
const DT = 1 / 60;
const CPU: MatchConfig = { mode: "quick", venue: "munich", homeClub: "aurora", awayClub: "iron", userTeam: null, difficulty: 0.65, goldenGoal: false, shootoutOnTie: false };
const seedOf = (i: number) => (i * 2654435761) >>> 0;

function cpuMatch(venue: MatchConfig["venue"], seed: number) {
  const sim = createSim();
  sim.setAutopilot(true);
  sim.startMatch({ ...CPU, venue, seed: seedOf(seed) });
  for (let i = 0; i < 200 * 60 && sim.state.phase !== "ended"; i++) sim.step(DT, IDLE);
  return sim.state;
}

function flat(seed: string) {
  const j = JSON.parse(JSON.stringify(buildFcScene(seed as MatchConfig["venue"])));
  const out: any[] = [];
  const walk = (n: any) => { out.push(n); for (const c of n.children ?? []) walk(c); };
  (j.nodes as any[]).forEach(walk);
  return { scene: j, nodes: out };
}

describe("FC-01 Touch Lab never throws when the ball leaves play", () => {
  for (const [name, place] of [
    ["over the touchline", (b: any) => { b.x = 5; b.z = PITCH_HZ + 0.5; b.vx = 0; b.vz = 3; b.mode = "loose"; }],
    ["over the goal line", (b: any) => { b.x = PITCH_HX + 0.5; b.z = 9; b.vx = 3; b.vz = 0; b.mode = "loose"; }],
    ["into the goal", (b: any) => { b.x = PITCH_HX - 1; b.z = 0; b.y = 0.5; b.vx = 14; b.vz = 0; b.vy = 0; b.mode = "flight"; b.lastShot = "shot"; }]
  ] as const) {
    it(name, () => {
      const sim = createSim();
      sim.startMatch({ ...CPU, userTeam: 0 });
      sim.spawnLab("touch");
      place(sim.state.ball);
      expect(() => { for (let i = 0; i < 300; i++) sim.step(DT, IDLE); }).not.toThrow();
      expect(sim.state.phase).toBe("live");
      expect(sim.state.score).toEqual([0, 0]);
      // a fresh ball is back on the pitch
      expect(Math.abs(sim.state.ball.x)).toBeLessThanOrEqual(PITCH_HX + 0.3);
    });
  }
});

function cpuShootouts(n: number) {
  const tally = [{ taken: 0, scored: 0 }, { taken: 0, scored: 0 }];
  const ends: { taken: number[]; scores: number[] }[] = [];
  for (let i = 0; i < n; i++) {
    const sim = createSim();
    sim.setAutopilot(true);
    sim.startMatch({ ...CPU, shootoutOnTie: true, seed: seedOf(i + 1) });
    const s = sim.state;
    s.half = 2; s.clock = 89.99; s.score = [0, 0];
    for (let k = 0; k < 600 && s.phase !== "shootout"; k++) sim.step(DT, IDLE);
    for (let k = 0; k < 60 * 200 && s.phase === "shootout"; k++) {
      for (const e of sim.step(DT, IDLE)) {
        if (e.type === "pen-goal" || e.type === "pen-save" || e.type === "pen-miss") {
          tally[e.team!].taken++;
          if (e.type === "pen-goal") tally[e.team!].scored++;
        }
      }
    }
    ends.push({ taken: [...s.shootout!.taken], scores: [...s.shootout!.scores] });
  }
  return { tally, ends };
}

describe("FC-02 / FC-03 shootouts", () => {
  const { tally, ends } = cpuShootouts(100);

  it("both sides convert at similar rates over 100 CPU shootouts (home was 98%, away 33%)", () => {
    const home = tally[0].scored / tally[0].taken, away = tally[1].scored / tally[1].taken;
    console.log("FC_SHOOTOUT", JSON.stringify({ home: +home.toFixed(3), away: +away.toFixed(3), tally }));
    expect(Math.abs(home - away)).toBeLessThan(0.1);
    expect(home).toBeGreaterThan(0.5);
    expect(home).toBeLessThan(0.9);
  });

  it("sudden death always lets the away side reply (equal kicks once past five each)", () => {
    for (const e of ends) {
      if (e.taken[0] > 5 || e.taken[1] > 5) expect(e.taken[0]).toBe(e.taken[1]);
      expect(e.scores[0]).not.toBe(e.scores[1]);
    }
  });

  it("the HUD ledger log records each kick in order", () => {
    const sim = createSim();
    sim.setAutopilot(true);
    sim.startMatch({ ...CPU, shootoutOnTie: true, seed: seedOf(7) });
    const s = sim.state;
    s.half = 2; s.clock = 89.99;
    const seq: [number, string][] = [];
    for (let k = 0; k < 600 && s.phase !== "shootout"; k++) sim.step(DT, IDLE);
    for (let k = 0; k < 60 * 200 && s.phase === "shootout"; k++) {
      for (const e of sim.step(DT, IDLE)) if (e.type.startsWith("pen-") && e.type !== "penalty") seq.push([e.team!, e.type === "pen-goal" ? "in" : "out"]);
    }
    expect(s.shootout!.log[0]).toEqual(seq.filter(([t]) => t === 0).map(([, r]) => r));
    expect(s.shootout!.log[1]).toEqual(seq.filter(([t]) => t === 1).map(([, r]) => r));
  });
});

describe("FC-04 slide tackles", () => {
  function slideSetup(held: boolean) {
    const sim = createSim();
    sim.startMatch({ ...CPU, userTeam: 0 });
    const s = sim.state;
    s.phase = "live";
    const gk = s.players.find((p) => p.id === "a-gk")!;
    const me = s.players.find((p) => p.id === "h-fw")! as PlayerState & { slideWon: boolean };
    for (const p of s.players) if (p !== gk && p !== me) { p.x = -20; p.z = (p.team ? 1 : -1) * 15; }
    gk.x = 25; gk.z = 0; gk.holdT = 5;
    me.x = 23.6; me.z = 0;
    const b = s.ball;
    b.ownerId = gk.id; b.mode = held ? "held" : "dribble"; b.x = gk.x - 0.4; b.z = 0;
    return { sim, s, gk, me };
  }
  it("never steals from a keeper holding the ball in his hands", () => {
    const { sim, s, gk } = slideSetup(true);
    const events: SimEvent[] = [];
    const slide = { ...IDLE, move: [1, 0] as [number, number], skillChop: true };
    for (let i = 0; i < 40; i++) events.push(...sim.step(DT, i === 0 ? slide : IDLE));
    expect(events.filter((e) => e.label === "slide tackle wins it")).toHaveLength(0);
    expect(s.ball.ownerId === gk.id || s.ball.mode !== "loose").toBe(true);
  });
  it("one slide dispossesses at most once, and a tackle is never counted as a save", () => {
    const { sim, s } = slideSetup(false);
    const events: SimEvent[] = [];
    const slide = { ...IDLE, move: [1, 0] as [number, number], skillChop: true };
    const saves0 = s.saves[1];
    for (let i = 0; i < 40; i++) events.push(...sim.step(DT, i === 0 ? slide : IDLE));
    expect(events.filter((e) => e.label === "slide tackle wins it").length).toBeLessThanOrEqual(1);
    expect(s.saves[1]).toBe(saves0);
  });
  it("CPU matches: tackle wins and saves stay in proportion to play (was 1194 wins / 486 saves for 73 shots)", () => {
    let tackles = 0, saves = 0, shots = 0;
    for (let m = 0; m < 6; m++) {
      const sim = createSim();
      sim.setAutopilot(true);
      sim.startMatch({ ...CPU, seed: seedOf(m + 1) });
      for (let i = 0; i < 200 * 60 && sim.state.phase !== "ended"; i++) {
        for (const e of sim.step(DT, IDLE)) {
          if (e.label === "slide tackle wins it") tackles++;
          if (e.type === "save") saves++;
          if (e.type === "shot") shots++;
        }
      }
    }
    expect(saves).toBeLessThanOrEqual(shots);
    expect(tackles).toBeLessThan(shots * 3);
  });
});

describe("FC-05 goal net is scaled once", () => {
  it("net GLB renders at the goal-frame size (7.6 x 2.85 x 2.6 m), not 35 m", () => {
    const { nodes } = flat("munich");
    const net = nodes.find((n) => n.name === "fc-goal-mesh-1");
    const b = assets.fcSoccerGoalNetMeshy.bounds as readonly number[];
    const fit = net.targetMaxDimension / Math.max(...b);
    expect(net.targetMaxDimension).toBe(GOAL_NET_GLB_MAX);
    const size = [b[0] * net.scale[0] * fit, b[1] * net.scale[1] * fit, b[2] * net.scale[2] * fit];
    expect(size[0]).toBeCloseTo(GOAL_HALF_W * 2, 1);
    expect(size[1]).toBeCloseTo(GOAL_H, 1);
    expect(size[2]).toBeCloseTo(2.6, 1);
  });
});

describe("FC-07 HUD kit colours", () => {
  it("HUD chips use the shirts the players wear", () => {
    expect(HUD_KIT_COLORS).toEqual([TEAM_KITS[0].shirt, TEAM_KITS[1].shirt]);
  });
});

describe("FC-08 Studio celebration reaches the scorer", () => {
  it("the user's scorer performs the chosen celebration clip", () => {
    const sim = createSim();
    sim.setUserCelebration(0);   // knee slide
    sim.startMatch({ ...CPU, userTeam: 0 });
    const s = sim.state;
    s.phase = "live";
    const fw = s.players.find((p) => p.id === "h-fw")!;
    for (const p of s.players) if (p.isKeeper) { p.x = -PITCH_HX + 1; p.z = p.team ? 4 : -4; }
    const b = s.ball;
    b.x = PITCH_HX - 1; b.z = 0; b.y = 0.4; b.vx = 15; b.vy = 0; b.vz = 0; b.mode = "flight"; b.lastShot = "shot"; b.lastToucherId = fw.id; b.kickerId = fw.id; b.freeT = 0;
    for (let i = 0; i < 20 && s.phase === "live"; i++) sim.step(DT, IDLE);
    expect(s.phase).toBe("goal");
    expect(fw.celebrateKind).toBe(0);
    expect(athleteAnimation({ ...fw, celebrateT: 2 }, 0, 1, "Ready").anim.clip).toBe("Attack");
    expect(athleteAnimation({ ...fw, celebrateT: 2, celebrateKind: 2 }, 0, 1, "Ready").anim.clip).toBe("Jump_Loop");
  });
});

describe("FC-09 portrait camera", () => {
  it("the broadcast rig covers at least 20 m of pitch at 390x844", () => {
    const eye: [number, number, number] = [0, 9.5, 20], target: [number, number, number] = [0, 0.9, -1];
    const before = horizontalCoverage(eye, target, 38, 390 / 844);
    const fit = fitCameraToAspect(eye, target, 38, 390 / 844);
    const after = horizontalCoverage(fit.eye, target, fit.fov, 390 / 844);
    console.log("FC_CAMERA", JSON.stringify({ beforeMetres: +before.toFixed(1), afterMetres: +after.toFixed(1), fov: +fit.fov.toFixed(1) }));
    expect(before).toBeLessThan(8);
    expect(after).toBeGreaterThanOrEqual(20);
    // landscape is unchanged
    expect(fitCameraToAspect(eye, target, 38, 16 / 9)).toEqual({ eye, fov: 38 });
  });
});

describe("FC-10 Favela goals", () => {
  it("end walls leave the goal mouth open", () => {
    const { nodes } = flat("favela");
    for (const w of nodes.filter((n) => /^cage-(w|e)-/.test(n.name))) {
      const zMin = w.position[2] - w.size[2] / 2, zMax = w.position[2] + w.size[2] / 2;
      expect(zMax <= -GOAL_HALF_W || zMin >= GOAL_HALF_W).toBe(true);
    }
  });
  it("a slow shot into the Favela goal counts", () => {
    const sim = createSim();
    sim.startMatch({ ...CPU, venue: "favela", userTeam: 0 });
    const s = sim.state;
    s.phase = "live";
    for (const p of s.players) { p.x = 0; p.z = (p.team ? 1 : -1) * 12; }
    const b = s.ball;
    b.x = PITCH_HX - 3; b.z = 1; b.y = BALL_R; b.vx = 6; b.vy = 0; b.vz = 0; b.mode = "loose"; b.lastShot = "shot"; b.freeT = 0;
    for (let i = 0; i < 120 && s.phase === "live"; i++) sim.step(DT, IDLE);
    expect(s.score).toEqual([1, 0]);
  });
  it("CPU Favela matches score goals", () => {
    let goals = 0;
    for (let m = 0; m < 6; m++) { const st = cpuMatch("favela", 101 + m); goals += st.score[0] + st.score[1]; }
    expect(goals).toBeGreaterThanOrEqual(6);
  });
});

describe("FC-11 sprint and auto-run", () => {
  it("without Shift the user's player does not sprint, and with no input he stands (assist off)", () => {
    const sim = createSim();
    sim.startMatch({ ...CPU, userTeam: 0 });
    const s = sim.state;
    s.phase = "live";
    const me = s.players.find((p) => p.id === s.controlledId)!;
    // ball dead at the far end, nobody on it: the controlled player stays the controlled player
    const b = s.ball;
    b.ownerId = null; b.mode = "dead"; b.x = -25; b.z = 15;
    const x0 = me.x;
    for (let i = 0; i < 60; i++) sim.step(DT, IDLE);
    expect(Math.abs(me.x - x0)).toBeLessThan(0.3);
    const run = { ...IDLE, move: [1, 0] as [number, number] };
    for (let i = 0; i < 90; i++) sim.step(DT, run);
    expect(me.speed).toBeLessThan(5.0);
    expect(me.stamina).toBeGreaterThan(0.99);
    const sprint = { ...run, sprint: true };
    for (let i = 0; i < 90; i++) sim.step(DT, sprint);
    expect(me.speed).toBeGreaterThan(6);
    expect(me.stamina).toBeLessThan(0.9);
  });
});

describe("FC-12 difficulty", () => {
  it("no floor for the opponent; user teammates play at a fixed level", () => {
    expect(aiDifficulty(0, 1, 0.5)).toBe(0.5);
    expect(aiDifficulty(0, 1, 0.92)).toBe(0.92);
    expect(aiDifficulty(0, 0, 0.92)).toBe(TEAMMATE_DIFFICULTY);
    expect(aiDifficulty(null, 0, 0.5)).toBe(0.5);
  });
});

describe("FC-13 penalty miss model", () => {
  it("loft solver crosses the line at the aimed height", () => {
    for (const h of [0.3, 1.2, 2.4]) {
      const deg = penaltyLoftDeg(20, 7, h);
      const a = (deg * Math.PI) / 180;
      const y = BALL_R + 7 * Math.tan(a) - (9.81 * 49) / (2 * 400 * Math.cos(a) ** 2);
      expect(y).toBeCloseTo(h, 2);
    }
  });
  it("weak penalties aimed at the corners sometimes miss the frame (base build: 30/30 on target)", () => {
    let misses = 0, onFrame = 0;
    for (let i = 0; i < 40; i++) {
      const sim = createSim();
      sim.startMatch({ ...CPU, userTeam: 0, seed: seedOf(i + 1) });
      sim.spawnLab("shootout");
      const s = sim.state;
      for (let k = 0; k < 70; k++) sim.step(DT, IDLE);
      const aim = { ...IDLE, move: [0.6, -1] as [number, number] };
      for (let k = 0; k < 70; k++) sim.step(DT, aim);
      for (let k = 0; k < 10; k++) sim.step(DT, { ...IDLE, shootHeld: true });
      sim.step(DT, { ...IDLE, shootReleased: true });
      let res = "";
      for (let k = 0; k < 400 && !res; k++) for (const e of sim.step(DT, IDLE)) if (e.type === "pen-miss") res = "miss"; else if (e.type === "pen-goal" || e.type === "pen-save") res = "frame";
      if (res === "miss") misses++; else if (res === "frame") onFrame++;
      void s;
    }
    console.log("FC_PEN_MISS", JSON.stringify({ misses, onFrame }));
    expect(misses).toBeGreaterThan(0);
    expect(onFrame).toBeGreaterThan(misses);
  });
});

describe("FC-14 golden goal", () => {
  it("play is held with the clock at 0 during the banner, and the kickoff alternates", () => {
    const sim = createSim();
    sim.setAutopilot(true);
    sim.startMatch({ ...CPU, goldenGoal: true, seed: seedOf(3) });
    const s = sim.state;
    s.half = 2; s.clock = 89.99; s.score = [1, 1]; s.phase = "live";
    const phase = (): string => s.phase;
    for (let i = 0; i < 5 && phase() !== "extratime"; i++) sim.step(DT, IDLE);
    expect(s.phase).toBe("extratime");
    const pos = s.players.map((p) => [p.x, p.z]);
    for (let i = 0; i < 120; i++) sim.step(DT, IDLE);
    expect(s.clock).toBe(0);
    expect(s.score).toEqual([1, 1]);
    s.players.forEach((p, i) => expect(Math.hypot(p.x - pos[i]![0]!, p.z - pos[i]![1]!)).toBeLessThan(0.5));
    for (let i = 0; i < 60 && phase() === "extratime"; i++) sim.step(DT, IDLE);
    expect(phase() === "kickoff" || phase() === "live").toBe(true);
  });
});

describe("FC-17 CPU matches produce goals", () => {
  it("24 seeded CPU matches average 2 to 4 goals", () => {
    const per: number[] = [];
    for (let m = 0; m < 24; m++) { const st = cpuMatch("munich", m + 1); per.push(st.score[0] + st.score[1]); }
    const mean = per.reduce((a, b) => a + b, 0) / per.length;
    console.log("FC_GOALS", JSON.stringify({ mean: +mean.toFixed(2), per, nilNil: per.filter((g) => g === 0).length }));
    expect(mean).toBeGreaterThanOrEqual(2);
    expect(mean).toBeLessThanOrEqual(4);
    expect(per.filter((g) => g === 0).length).toBeLessThanOrEqual(6);
  });
});

describe("FC-18 determinism", () => {
  it("the same seed replays the same match", () => {
    const a = cpuMatch("munich", 9), b = cpuMatch("munich", 9);
    expect([a.score, a.kicks, a.shotsOn, a.ball.x]).toEqual([b.score, b.kicks, b.shotsOn, b.ball.x]);
  });
  it("sim and AI draw no unseeded Math.random", async () => {
    const fs = await import("node:fs");
    for (const f of ["sim.ts", "ai.ts", "modes.ts"]) {
      const src = fs.readFileSync(`apps/showcase-aura-fc-3d/src/game/${f}`, "utf8").replace(/rand: \(\) => number = Math\.random/, "");
      expect(src.match(/Math\.random\(\)/g) ?? [], f).toEqual([]);
    }
  });
  it("a 24 m/s strike cannot step past a post (swept test)", () => {
    const sim = createSim();
    sim.startMatch({ ...CPU, userTeam: 0 });
    const s = sim.state;
    s.phase = "live";
    for (const p of s.players) { p.x = 0; p.z = (p.team ? 1 : -1) * 12; }
    const b = s.ball;
    // aimed straight at the near post; one 1/20 s step moves 1.2 m, wider than the 0.76 m post band
    b.x = PITCH_HX - 1.5; b.z = GOAL_HALF_W; b.y = 1; b.vx = 24; b.vy = 0; b.vz = 0; b.mode = "flight"; b.lastShot = "shot"; b.freeT = 1;
    const ev: SimEvent[] = [];
    for (let i = 0; i < 3; i++) ev.push(...sim.step(1 / 20, IDLE));
    expect(ev.some((e) => e.type === "post")).toBe(true);
  });
});

describe("FC-19 / FC-21 dressing and venue looks", () => {
  it("trophy stands on a plinth and the spare ball sits on the grass", () => {
    const { nodes } = flat("munich");
    const plinth = nodes.find((n) => n.name === "fc-trophy-plinth");
    const trophy = nodes.find((n) => n.name === "fc-trophy-case");
    expect(plinth.position[1] + plinth.size[1] / 2).toBeCloseTo(trophy.position[1], 3);
    expect(nodes.find((n) => n.name === "fc-spare-ball").position[1]).toBe(0);
  });
  it("Lagos and Uyuni get their own looks and skies", () => {
    expect(VENUE_LOOKS.lagos.look).toBe("golden-hour");
    expect(VENUE_LOOKS.uyuni.look).toBe("outdoor-day");
    const lagos = flat("lagos"), munich = flat("munich");
    expect(lagos.scene.background).not.toBe(munich.scene.background);
    expect(lagos.nodes.some((n) => /aura-look:golden-hour/.test(n.name ?? ""))).toBe(true);
  });
});

describe("FC-22 shot meter and shots on target", () => {
  it("shotOnTarget counts only paths that cross the frame", () => {
    expect(shotOnTarget({ x: 20, y: 0.3, z: 0, vx: 20, vy: 2, vz: 0 }, PITCH_HX)).toBe(true);
    expect(shotOnTarget({ x: 20, y: 0.3, z: 0, vx: 20, vy: 2, vz: 12 }, PITCH_HX)).toBe(false);
    expect(shotOnTarget({ x: 20, y: 0.3, z: 0, vx: 20, vy: 12, vz: 0 }, PITCH_HX)).toBe(false);
    expect(shotOnTarget({ x: 20, y: 0.3, z: 0, vx: -20, vy: 2, vz: 0 }, PITCH_HX)).toBe(false);
  });
  it("a held charge auto-fires only at full power", () => {
    const sim = createSim();
    sim.startMatch({ ...CPU, userTeam: 0 });
    const s = sim.state;
    s.phase = "live";
    const me = s.players.find((p) => p.id === s.controlledId)!;
    s.ball.ownerId = me.id; s.ball.mode = "dribble";
    let peak = 0;
    for (let i = 0; i < 60 && me.kickT <= 0; i++) { sim.step(DT, { ...IDLE, shootHeld: true }); peak = Math.max(peak, sim.chargeLevel); }
    expect(peak).toBeGreaterThan(0.99);
  });
});

describe("FC-E1 fewer scene nodes", () => {
  it("stripes, lines and wavers are instanced batches", () => {
    const { nodes } = flat("munich");
    expect(nodes.filter((n) => /^fc-stripe-\d/.test(n.name ?? ""))).toHaveLength(0);
    expect(nodes.filter((n) => /^fc-waver-\d/.test(n.name ?? ""))).toHaveLength(0);
    expect(nodes.filter((n) => /^line-(touch|goal|centre|box|six)/.test(n.name ?? ""))).toHaveLength(0);
    expect(nodes.find((n) => n.name === "fc-lines")?.instances?.length).toBe(17);
    console.log("FC_NODES", JSON.stringify({ munich: nodes.length }));
  });
});

describe("FC-16 football sounds", () => {
  it("kick, pass, net and post cues use the route-local football SFX, not the basketball ones", async () => {
    const { readFileSync, existsSync } = await import("node:fs");
    const main = readFileSync("apps/showcase-aura-fc-3d/src/main.ts", "utf8");
    for (const [cue, key] of [["kick", "fcKickSfx"], ["pass", "fcKickSfx"], ["net", "fcNetSfx"], ["post", "fcPostSfx"]] as const) {
      expect(main).toMatch(new RegExp(`${cue}:\\s*\\{ id: "${cue}", asset: assets\\.${key}`));
    }
    expect(main).not.toMatch(/hoopsBoardThudSfx|hoopsSwishSfx|hoopsRimClankSfx/);
    const manifest = readFileSync("apps/showcase-aura-fc-3d/src/aura-assets-v2.ts", "utf8");
    for (const m of manifest.matchAll(/url: "\/aura-assets\/(fc(?:Kick|Net|Post)Sfx\.[0-9a-f]{8}\.wav)"/g)) {
      expect(existsSync(`apps/showcase-aura-fc-3d/public/aura-assets/${m[1]}`)).toBe(true);
    }
  });
});

describe("HUD possession bar layout", () => {
  it("the bar sits in its wrapper's flow, so the bar offset is applied once and the label stays under it", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("apps/showcase-aura-fc-3d/src/game/hud.ts", "utf8");
    const bar = /\.fc-poss \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(bar).toMatch(/position:\s*relative/);
    expect(bar).not.toMatch(/top:/);
  });
});

describe("FC-21 day venues are not washed out", () => {
  it("Lagos and Uyuni run lighter fog, softer bloom and lower exposure than the night venues", () => {
    for (const v of ["lagos", "uyuni"] as const) {
      expect(VENUE_LOOKS[v].fog).toBeLessThan(VENUE_LOOKS.munich.fog);
      expect(VENUE_LOOKS[v].bloom.intensity).toBeLessThan(VENUE_LOOKS.munich.bloom.intensity);
      expect(VENUE_LOOKS[v].bloom.threshold).toBeGreaterThan(VENUE_LOOKS.munich.bloom.threshold);
      expect(VENUE_LOOKS[v].exposureEv).toBeLessThan(0);
      const bloom = flat(v).nodes.find((n) => n.type === "effect" && /bloom/.test(String(n.effect ?? n.kind ?? n.name ?? "")) && n.name !== "look bloom");
      if (bloom) expect(JSON.stringify(bloom)).toContain(String(VENUE_LOOKS[v].bloom.threshold));
    }
  });
});
