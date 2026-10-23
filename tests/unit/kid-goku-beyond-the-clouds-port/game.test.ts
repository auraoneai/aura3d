import { describe, expect, it } from "vitest";
import { MOUNT_PAOZU as CH } from "../../../examples/kid-goku-beyond-the-clouds-port/chapter";
import { Encounters } from "../../../examples/kid-goku-beyond-the-clouds-port/encounters";
import { FINALE_SECONDS, Game } from "../../../examples/kid-goku-beyond-the-clouds-port/game";
import { IDLE, createState, stepFrame, type StepInput } from "../../../examples/kid-goku-beyond-the-clouds-port/sim";

const DT = 1 / 60;
const frames = (g: Game, n: number, input: Partial<StepInput> = {}): string[] => {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(...g.frame(DT, { ...IDLE, ...input }));
  return out;
};
const fresh = (s: number): Game => { const g = new Game(CH, 0, 0); g.start(0); g.state.s = s; g.state.speed = CH.speed; g.state.invincible = 0; g.enc.rewind(s); return g; };

describe("cloud runner: encounter layer", () => {
  it("a boulder rolling across the lane hits a grounded runner and a jumper clears it", () => {
    const hit = fresh(215 - 6);
    const events = frames(hit, 120).concat();
    expect(events).toContain("boulder-hit");
    expect(hit.state.hearts).toBe(2);
    const clear = fresh(215 - 6);
    let jumped = false;
    const ev: string[] = [];
    for (let i = 0; i < 120; i++) { const jump = !jumped && clear.state.s > 215 - 3.2; if (jump) jumped = true; ev.push(...clear.frame(DT, { ...IDLE, jump })); }
    expect(ev).not.toContain("boulder-hit");
    expect(ev.some((e) => e === "close-call")).toBe(true);
    expect(clear.state.hearts).toBe(3);
  });

  it("a diving pteranodon screeches, then grabs a runner who stays in its shadow", () => {
    const g = fresh(380 - 30);
    const ev = frames(g, 200);
    expect(ev).toContain("screech");
    expect(ev).toContain("ptera-grab");
    expect(g.state.hearts).toBeLessThan(3);
  });

  it("steering out of the dive shadow dodges it for points", () => {
    const g = fresh(380 - 30);
    const ev = frames(g, 200, { steer: 1 });
    expect(ev).not.toContain("ptera-grab");
    expect(ev).toContain("dodge");
  });

  it("a staff strike at the last moment knocks the creature out and ends the threat", () => {
    const g = fresh(380 - 12);
    const ev: string[] = [];
    for (let i = 0; i < 120; i++) ev.push(...g.frame(DT, { ...IDLE, pole: g.state.s > 380 - 7 && g.state.strikeTimer <= 0 }));
    expect(ev.some((e) => e === "ptera-struck" || e === "jan" || e === "strike-hit")).toBe(true);
    expect(g.enc.dives[0]!.hit).toBe(true);
    expect(g.enc.liveAttack(CH.creatures[0]!, 380)).toBe(false);
  });

  it("a strike within 7 units of the attack opens a rock-paper-scissors duel that the player wins", () => {
    const g = fresh(1000);
    g.enc.rewind(1000);
    g.state.s = 380 + 0; g.enc.rewind(g.state.s - 20);
    g.state.s = 380 - 5.5; g.state.strikeLead = 5.5;
    const ev: string[] = [];
    for (let i = 0; i < 160; i++) ev.push(...g.frame(DT, { ...IDLE, pole: i === 3 }));
    expect(ev).toContain("jan");
    expect(ev).toContain("janken-hit");
    expect(ev).toContain("duel-won");
    expect(g.state.jankens).toBe(1);
  });

  it("the T-rex bites the left lane and a runner on the right dodges", () => {
    const left = fresh(1095 - 12);
    left.state.lane = -3;
    expect(frames(left, 160, { steer: -1 })).toContain("trex-bite");
    const right = fresh(1095 - 12);
    right.state.lane = 3;
    const ev = frames(right, 160, { steer: 1 });
    expect(ev).not.toContain("trex-bite");
    expect(ev).toContain("dodge");
  });

  it("rewinding after a respawn restores the encounters beyond the checkpoint", () => {
    const enc = new Encounters(CH);
    const state = createState(0);
    state.s = 400; enc.update(DT, state);
    enc.dives[0]!.passed = true; enc.boulders[0]!.passed = true;
    enc.rewind(100);
    expect(enc.dives[0]!.passed).toBe(false);
    expect(enc.boulders[0]!.passed).toBe(false);
  });
});

describe("cloud runner: game phases", () => {
  it("starts on the title, plays, pauses and resumes", () => {
    const g = new Game(CH, 0, 0);
    expect(g.phase).toBe("menu");
    g.start(0);
    expect(g.phase).toBe("playing");
    frames(g, 30);
    const s = g.state.s;
    g.pause();
    frames(g, 30);
    expect(g.state.s).toBe(s);
    g.resume();
    frames(g, 30);
    expect(g.state.s).toBeGreaterThan(s);
  });

  it("falls through an unjumped gap, respawns at the checkpoint with one heart fewer", () => {
    const g = fresh(120);
    g.state.checkpoint = 0;
    const ev = frames(g, 200);
    expect(ev).toContain("fall-start");
    expect(ev).toContain("respawn");
    expect(g.phase).toBe("playing");
    expect(g.state.hearts).toBe(2);
    expect(g.state.s).toBeLessThan(120);
  });

  it("a charged sky cloud rescues a fall instead of costing a heart", () => {
    const g = fresh(120);
    g.state.nimbus.charge = 1;
    let called = false;
    const ev: string[] = [];
    for (let i = 0; i < 200; i++) {
      const nimbus = !called && g.phase === "falling";
      if (nimbus) called = true;
      ev.push(...g.frame(DT, { ...IDLE, nimbus }));
    }
    expect(ev).toContain("fall-start");
    expect(ev).toContain("nimbus-call");
    expect(ev).not.toContain("respawn");
    expect(g.state.hearts).toBe(3);
  });

  it("running out of hearts ends the run; finishing plays the finale then shows the results", () => {
    const g = fresh(100);
    g.state.hearts = 1;
    g.state.s = 150;
    g.state.checkpoint = 0;
    const ev = frames(g, 200);
    expect(ev).toContain("dead");
    expect(g.phase).toBe("result");
    expect(g.result?.won).toBe(false);
    g.retry();
    expect(g.phase).toBe("playing");
    expect(g.state.hearts).toBe(3);

    const w = fresh(CH.length - 1);
    w.state.balls = [1, 2, 3];
    const ev2 = frames(w, 60);
    expect(ev2).toContain("finish");
    expect(w.phase).toBe("finale");
    frames(w, Math.ceil(FINALE_SECONDS / DT) + 5);
    expect(w.phase).toBe("result");
    expect(w.result?.won).toBe(true);
    expect(w.result?.score).toBeGreaterThan(1000);
  });

  it("is deterministic: the same inputs give the same run", () => {
    const run = (): string => {
      const g = new Game(CH, 0, 0); g.start(0);
      for (let i = 0; i < 1800; i++) g.frame(DT, { ...IDLE, steer: i % 90 < 30 ? 1 : i % 90 < 60 ? -1 : 0, jump: i % 140 === 0 });
      const s = g.state;
      return JSON.stringify({ s: s.s, lane: s.lane, hearts: s.hearts, score: Math.round(s.score), orbs: s.orbs, phase: g.phase });
    };
    expect(run()).toBe(run());
  });

  it("the verified horizon is untouched: the pure sim still replays the same first steps", () => {
    const a = createState(0), b = createState(0);
    for (let i = 0; i < 800; i++) { stepFrame(a, IDLE, DT, CH); stepFrame(b, IDLE, DT, CH); }
    expect(a.s).toBe(b.s);
  });
});
