import { describe, expect, it } from "vitest";
import { createCaptionQueue } from "../../../examples/where-the-wind-wanders-port/captions";

function harness() {
  const log: string[] = [];
  const q = createCaptionQueue({ show: (t) => log.push(`show:${t}`), hide: () => log.push("hide") });
  const run = (seconds: number, dt = 0.1): void => { for (let t = 0; t < seconds - 1e-9; t += dt) q.tick(Math.min(dt, seconds - t)); };
  return { q, log, run };
}

const INTRO = [{ text: "intro-1", at: 0, seconds: 5 }, { text: "intro-2", at: 5.6, seconds: 5 }, { text: "intro-3", at: 11.2, seconds: 5 }];

describe("captions run on the game clock (audit WW-5, WW-6)", () => {
  it("plays a sequence at its cue times and hides each line after its time", () => {
    const { q, log, run } = harness();
    q.play(INTRO);
    expect(q.current).toBe("intro-1");
    run(5.05);
    expect(q.current).toBeNull();
    run(0.6);
    expect(q.current).toBe("intro-2");
    run(6);
    expect(q.current).toBe("intro-3");
    run(6);
    expect(q.current).toBeNull();
    expect(log).toEqual(["show:intro-1", "hide", "show:intro-2", "hide", "show:intro-3", "hide"]);
  });

  it("a letter picked up at 3.2 s replaces the intro and keeps its 11 s (the intro no longer overwrites it at 5.6 s)", () => {
    const { q, run } = harness();
    q.play(INTRO);
    run(3.2);
    q.say("letter", 11);
    run(5.6);
    expect(q.current).toBe("letter");
    expect(q.pending).toBe(0);
    run(5.5);
    expect(q.current).toBeNull();
  });

  it("nothing advances while the clock is not ticked (pause, title card, hidden tab)", () => {
    const { q, run } = harness();
    q.say("letter", 11);
    run(4);
    // paused for a long time: no ticks
    expect(q.current).toBe("letter");
    run(6.9);
    expect(q.current).toBe("letter");
    run(0.2);
    expect(q.current).toBeNull();
  });

  it("clearing on leaving the epilogue drops the island lines still waiting", () => {
    const { q, log, run } = harness();
    q.play([{ text: "epi-1", at: 0, seconds: 6 }, { text: "epi-2", at: 6.5, seconds: 6 }, { text: "epi-3", at: 13, seconds: 7 }]);
    run(2);
    q.clear();
    run(20);
    expect(q.current).toBeNull();
    expect(log).toEqual(["show:epi-1", "hide"]);
  });

  it("ignores zero and negative ticks", () => {
    const { q } = harness();
    q.say("x", 1);
    q.tick(0);
    q.tick(-5);
    expect(q.current).toBe("x");
  });
});
