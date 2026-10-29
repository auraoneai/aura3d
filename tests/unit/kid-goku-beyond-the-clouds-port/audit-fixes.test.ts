import { describe, expect, it } from "vitest";
import { CUMULUS_RIDGE as CH } from "../../../examples/kid-goku-beyond-the-clouds-port/chapter";
import { DIFFICULTY, Game, withDifficulty } from "../../../examples/kid-goku-beyond-the-clouds-port/game";
import { viewOf, shownOf } from "../../../examples/kid-goku-beyond-the-clouds-port/presentation";
import { IDLE, type StepInput } from "../../../examples/kid-goku-beyond-the-clouds-port/sim";
import { flashOpacity, forInput, hudVisible, retryLabel } from "../../../examples/kid-goku-beyond-the-clouds-port/ui";
import { CULL_RANGE, buildCheckpointFlags, buildLog, sunAnglesOf } from "../../../examples/kid-goku-beyond-the-clouds-port/world";
import { LOOK } from "../../../examples/kid-goku-beyond-the-clouds-port/materials";

/* Rows of docs/audits/sections/game-25-cloud-runner-port.md (CR-*), one block each. */
const DT = 1 / 60;
const frames = (g: Game, n: number, input: Partial<StepInput> = {}): string[] => {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(...g.frame(DT, { ...IDLE, ...input }));
  return out;
};
const placed = (s: number, lane = 0, difficulty: "normal" | "easy" = "normal"): Game => {
  const g = new Game(CH, 0, 0, difficulty);
  g.start(0);
  g.state.s = s; g.state.lane = lane; g.state.speed = g.chapter.speed; g.state.invincible = 0;
  g.enc.rewind(s);
  return g;
};
const runToResult = (g: Game, max = 60 * 30): void => { for (let i = 0; i < max && g.phase !== "result"; i++) g.frame(DT, IDLE); };

describe("CR-1: losing the last heart on a rock or log ends the run", () => {
  it("hearts=1 and the lane-2.6 rock at s=45: the run ends lost and the score stops", () => {
    const g = placed(40, 2.6);
    g.state.hearts = 1;
    const ev = frames(g, 120);
    expect(ev).toContain("hit");
    expect(g.state.dead).toBe(true);
    expect(g.phase).toBe("result");
    expect(g.result?.won).toBe(false);
    expect(ev).toContain("dead");
    const score = g.state.score;
    frames(g, 600);
    expect(g.state.score).toBe(score);
  });
  it("a rock hit with hearts to spare keeps the run going", () => {
    const g = placed(40, 2.6);
    frames(g, 120);
    expect(g.state.hearts).toBe(2);
    expect(g.phase).toBe("playing");
  });
});

describe("CR-2: run again after a win restarts the run", () => {
  it("after a win, retry starts at s=0 with no pearls", () => {
    const g = placed(1950);
    for (const b of CH.balls) g.state.balls.push(b.star);
    runToResult(g);
    expect(g.result?.won).toBe(true);
    expect(g.result?.retryFrom).toBe("start");
    g.retry();
    expect(g.phase).toBe("playing");
    expect(g.state.s).toBe(0);
    expect(g.state.balls).toEqual([]);
  });
  it("after a loss, retry continues from the last checkpoint with the pearls found", () => {
    const g = placed(600);
    g.state.checkpoint = 425; g.state.checkpointIndex = 2; g.state.balls = [1, 2];
    g.state.hearts = 1;
    g.state.s = 40; g.state.lane = 2.6; g.enc.rewind(40);
    frames(g, 120);
    expect(g.result?.won).toBe(false);
    expect(g.result?.retryFrom).toBe("checkpoint");
    g.retry();
    expect(g.state.s).toBe(425);
    expect(g.state.balls).toEqual([1, 2]);
  });
  it("labels the button by outcome", () => {
    expect(retryLabel(true)).toBe("Run again");
    expect(retryLabel(false)).toBe("Continue from checkpoint");
  });
});

describe("CR-4: the look sun points along the authored shadow sun", () => {
  it("sunAnglesOf(SUN_POS) is within 3 degrees of the scenery shader's sun direction", () => {
    const a = sunAnglesOf([48, 78, 38]);
    const el = (a.elevationDeg * Math.PI) / 180, az = (a.azimuthDeg * Math.PI) / 180;
    const look = [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
    const l = Math.hypot(...LOOK.sunLight);
    const dot = look[0]! * LOOK.sunLight[0] / l + look[1]! * LOOK.sunLight[1] / l + look[2]! * LOOK.sunLight[2] / l;
    expect((Math.acos(Math.min(1, dot)) * 180) / Math.PI).toBeLessThan(3);
    expect(a.elevationDeg).toBeCloseTo(51.9, 0);
  });
});

describe("CR-5: the finale is a cutscene without the HUD", () => {
  it("hides the in-play HUD in the finale and the menu only", () => {
    expect(hudVisible("finale")).toBe(false);
    expect(hudVisible("menu")).toBe(false);
    for (const p of ["playing", "paused", "falling", "result"] as const) expect(hudVisible(p)).toBe(true);
  });
});

describe("CR-6: the ride log is wood, not rock", () => {
  it("builds a 6.4 m log of radius 1 with bark rings and cut ends", () => {
    const m = buildLog();
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < m.vertexCount; i++) { const x = m.positions[i * 3]!; if (x < min) min = x; if (x > max) max = x; }
    expect(max - min).toBeGreaterThan(6.3);
    expect(max - min).toBeLessThan(6.6);
    const tones = new Set<string>();
    for (let i = 0; i < m.vertexCount; i++) tones.add(m.colors.slice(i * 4, i * 4 + 3).map((c) => c.toFixed(3)).join(","));
    expect(tones.size).toBeGreaterThanOrEqual(3);
  });
});

describe("CR-9: touch players read the on-screen buttons", () => {
  it("rewrites every keyboard hint the sim and encounters write", () => {
    expect(forInput("← → OR A D TO STEER", true)).toBe("TAP ◀ ▶ TO STEER");
    expect(forInput("SPACE", true)).toBe("TAP JUMP");
    expect(forInput("PRESS E", true)).toBe("TAP STAFF");
    expect(forInput("PRESS E NOW · OR STEER AWAY", true)).toBe("TAP STAFF NOW · OR STEER AWAY");
    expect(forInput("STEER RIGHT · OR PRESS E", true)).toBe("STEER RIGHT · OR TAP STAFF");
    expect(forInput("Q · CALL IT NOW", true)).toBe("TAP CLOUD · CALL IT NOW");
    expect(forInput("The sky cloud is ready: press Q!", true)).toBe("The sky cloud is ready: tap cloud!");
    expect(forInput("JUMP IT OR STEER CLEAR", true)).toBe("JUMP IT OR STEER CLEAR");
  });
  it("leaves keyboard text alone", () => {
    expect(forInput("PRESS E", false)).toBe("PRESS E");
    expect(forInput("SPACE", false)).toBe("SPACE");
  });
});

describe("CR-E1: small merged scenery is hidden by distance", () => {
  it("culls flowers first and trees last", () => {
    expect(CULL_RANGE.flowers).toBeLessThan(CULL_RANGE.bushes);
    expect(CULL_RANGE.bushes).toBeLessThanOrEqual(CULL_RANGE.trees);
  });
});

describe("CR-E2: reduced motion softens the full-screen flash", () => {
  it("caps the flash at 0.15 with reduced motion and 0.6 without", () => {
    expect(flashOpacity(0.5, true)).toBe(0.15);
    expect(flashOpacity(0.5, false)).toBe(0.5);
    expect(flashOpacity(0.9, false)).toBe(0.6);
    expect(flashOpacity(undefined, true)).toBe(0);
  });
});

describe("CR-E6: the render view is reused, the game is untouched", () => {
  it("returns the same view object every frame and follows a new state after start()", () => {
    const g = placed(100);
    const a = viewOf(g, { ...shownOf(g), s: 101 });
    const b = viewOf(g, { ...shownOf(g), s: 102 });
    expect(a).toBe(b);
    expect(b.state.s).toBe(102);
    expect(g.state.s).toBe(100);
    g.start(0);
    const c = viewOf(g, shownOf(g));
    expect(c.state.s).toBe(0);
    expect(c.state.hearts).toBe(g.state.hearts);
    expect(c.phase).toBe("playing");
  });
});

describe("CR-E9: easy mode, checkpoint markers and records", () => {
  it("easy runs at 0.85x speed with four hearts, and refills cap at four", () => {
    expect(DIFFICULTY.easy).toEqual({ speed: 0.85, hearts: 4 });
    expect(withDifficulty(CH, "normal")).toBe(CH);
    const g = new Game(CH, 0, 0, "easy");
    g.start(0);
    expect(g.chapter.speed).toBeCloseTo(CH.speed * 0.85, 9);
    expect(g.state.hearts).toBe(4);
    frames(g, 60 * 4);
    expect(g.state.speed).toBeLessThan(CH.speed * 0.9);
    const meat = CH.meat[0]!;
    const h = placed(meat.s - 4, meat.lane, "easy");
    h.state.hearts = 3;
    frames(h, 40, { jump: false });
    expect(h.state.hearts).toBeLessThanOrEqual(4);
  });
  it("normal keeps the original's three hearts", () => {
    const g = new Game(CH, 0, 0);
    g.start(0);
    expect(g.state.hearts).toBe(3);
    expect(g.chapter).toBe(CH);
  });
  it("switching difficulty on the title screen rebuilds the idle state", () => {
    const g = new Game(CH, 0, 0);
    g.setDifficulty("easy");
    expect(g.phase).toBe("menu");
    expect(g.state.hearts).toBe(4);
  });
  it("keeps best time and most pearls across runs", () => {
    const g = placed(1950);
    g.state.balls = [1, 2, 3];
    runToResult(g);
    expect(g.result?.newBestTime).toBe(true);
    // the finale hands over the home pearl (star 4), so three found plus one
    expect(g.result?.bestPearls).toBe(4);
    const t = g.bestTime;
    expect(t).toBeGreaterThan(0);
    g.retry();
    g.state.s = 1950; g.state.time = t + 100; g.state.balls = [1]; g.enc.rewind(1950);
    runToResult(g);
    expect(g.result?.newBestTime).toBe(false);
    expect(g.result?.bestTime).toBe(t);
    expect(g.result?.newBestPearls).toBe(false);
    expect(g.result?.bestPearls).toBe(4);
  });
  it("puts a marker at every checkpoint after the start", () => {
    const m = buildCheckpointFlags(CH);
    expect(m.vertexCount).toBeGreaterThan(0);
    const markers = CH.checkpoints.filter((c) => c > 0).length;
    // each marker is one post plus two boxes; the vertex count scales with the checkpoint count
    expect(m.vertexCount % markers).toBe(0);
  });
});

describe("Tests gap: pause asked for during a fall or the finale", () => {
  it("a pause during a fall lands when the run is back on the track, and the run then stays still", () => {
    const g = placed(120);
    g.state.checkpoint = 0;
    for (let i = 0; i < 400 && g.phase !== "falling"; i++) g.frame(DT, IDLE);
    expect(g.phase).toBe("falling");
    g.pause();
    expect(g.phase).toBe("falling");
    for (let i = 0; i < 400 && g.phase === "falling"; i++) g.frame(DT, IDLE);
    expect(g.phase).toBe("paused");
    const s = g.state.s;
    frames(g, 60);
    expect(g.state.s).toBe(s);
    g.resume();
    frames(g, 30);
    expect(g.state.s).toBeGreaterThan(s);
  });
  it("a fresh run clears a queued pause", () => {
    const g = placed(120);
    for (let i = 0; i < 400 && g.phase !== "falling"; i++) g.frame(DT, IDLE);
    g.pause();
    g.start(0);
    frames(g, 30);
    expect(g.phase).toBe("playing");
  });
  it("the finale cutscene is not paused and still ends on the result card", () => {
    const g = placed(1950);
    for (let i = 0; i < 60 * 30 && g.phase !== "finale"; i++) g.frame(DT, IDLE);
    expect(g.phase).toBe("finale");
    g.pause();
    expect(g.phase).toBe("finale");
    runToResult(g);
    expect(g.phase).toBe("result");
    expect(g.result?.won).toBe(true);
  });
});
