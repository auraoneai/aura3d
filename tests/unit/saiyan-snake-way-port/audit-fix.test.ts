import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { qaHookGlobalName } from "../../../packages/engine/src/qa/hooks";
import { createRunInput, classifySwipe } from "../../../examples/saiyan-snake-way-port/input";
import { createRenderGuard, RENDER_FAIL_LIMIT } from "../../../examples/saiyan-snake-way-port/renderGuard";
import {
  DAYS_BONUS_PER_DAY, DROWSE_WARN, daysStatusLabel, drowseCue, finalScore, gapAhead, gustCue, onboardingPrompt
} from "../../../examples/saiyan-snake-way-port/hud";
import { STEP, createRun, qaSnapshot, roadGapAt, snapshot, stepRun } from "../../../examples/saiyan-snake-way-port/sim";
import { ENV_INTENSITY, buildWorld, environmentIntensity } from "../../../examples/saiyan-snake-way-port/world";

/** Audit lane G17 (docs/audits/lanes/g17.md): one block per fixed row. */
const read = (path: string): string => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

describe("C2 / RH-07: QA hook name", () => {
  const main = read("examples/saiyan-snake-way-port/main.ts");
  const name = /export const QA_HOOK_NAME = "([^"]+)"/.exec(main)?.[1];

  it("main.ts installs the hooks under the game's own name", () => {
    expect(name).toBe("serpentine-sky-run");
    expect(main).toMatch(/installQaHooks\(QA_HOOK_NAME,/);
    expect(qaHookGlobalName(name!)).toBe("__AURA_SERPENTINE_SKY_RUN__");
  });

  it("every browser spec that drives this game uses that global", () => {
    const global = qaHookGlobalName(name!);
    const dir = new URL("../../../tests/browser/", import.meta.url);
    const specs = readdirSync(dir).filter((f) => f.endsWith(".spec.ts")).map((f) => [f, readFileSync(new URL(f, dir), "utf8")] as const)
      .filter(([, text]) => text.includes("saiyan-snake-way-port") || /SERPENTINE_SKY_RUN|SAIYAN_SNAKE_WAY/.test(text));
    expect(specs.length).toBeGreaterThan(6);
    // shadow-banding.spec.ts is a shared spec owned by another lane (handoff in the lane report)
    for (const [file, text] of specs.filter(([f]) => f !== "shadow-banding.spec.ts")) {
      expect(text, file).not.toMatch(/__AURA_SAIYAN_SNAKE_WAY/);
      expect(text, file).toContain(global);
    }
  });

  it("sends errors through the reporter installQaHooks returns, and keeps runtime strings free of the old id", () => {
    expect(main).toMatch(/qa\.reportError\(/);
    expect(main).not.toMatch(/window\.__AURA_[A-Z_]+_ERROR__\s*=/);
    for (const file of ["main.ts", "world.ts"]) {
      const code = read(`examples/saiyan-snake-way-port/${file}`).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
      expect(code.replace(/\.\/assets\/|examples\/saiyan-snake-way-port/g, ""), file).not.toMatch(/saiyan/i);
    }
  });
});

describe("C1: one failed frame does not end the session", () => {
  it("skips isolated failures and recovers on the next good frame", () => {
    const guard = createRenderGuard();
    const err = new Error("RenderDeviceError 0x502 [WEBGL_LDR_POSTPROCESS_FAILED]");
    expect(guard.fail(err)).toBe("skip");
    guard.ok();
    for (let i = 0; i < 100; i++) { expect(guard.fail(err)).toBe("skip"); guard.ok(); }
    expect(guard.failed).toBe(false);
    expect(guard.total).toBe(101);
    expect(guard.lastError).toContain("0x502");
  });
  it("gives up after the limit of failures in a row", () => {
    const guard = createRenderGuard();
    for (let i = 1; i < RENDER_FAIL_LIMIT; i++) expect(guard.fail("x")).toBe("skip");
    expect(guard.fail("x")).toBe("fatal");
    expect(guard.failed).toBe(true);
  });
  it("gives up at once when the context is lost", () => {
    const guard = createRenderGuard();
    guard.contextLost();
    expect(guard.failed).toBe(true);
    expect(guard.fail("x")).toBe("fatal");
  });
  it("main.ts latches only on a fatal verdict", () => {
    const main = read("examples/saiyan-snake-way-port/main.ts");
    expect(main).toMatch(/if \(guard\.fail\(error\) === "fatal"\) reportError\(error\)/);
    expect(main).toMatch(/webglcontextlost/);
  });
});

describe("C6: touch steering during flight", () => {
  const W = 1000;
  it("a held touch on the left or right half holds A or D while flying, until it lifts", () => {
    let flying = true;
    const input = createRunInput({ flying: () => flying });
    input.pointerDown(1, 200, 500, W);
    expect([...input.take().held!]).toEqual(["KeyA"]);
    input.pointerMove(1, 800, 500, W);
    expect([...input.take().held!]).toEqual(["KeyD"]);
    expect(input.pointerUp(1, 800, 500)).toBeNull();
    expect(input.take().held).toEqual([]);
    flying = false;
  });
  it("a vertical drag holds climb or dive", () => {
    const input = createRunInput({ flying: () => true });
    input.pointerDown(1, 700, 500, W);
    input.pointerMove(1, 700, 440, W);
    expect(new Set(input.take().held)).toEqual(new Set(["KeyD", "KeyW"]));
    input.pointerMove(1, 700, 560, W);
    expect(new Set(input.take().held)).toEqual(new Set(["KeyD", "KeyS"]));
  });
  it("the held keys steer the sim's flight", () => {
    const run = (held: string[]) => {
      const S = createRun();
      S.s = 100; S.puff = 10; S.invuln = 11; S.flyX = 0; S.flyY = 6; S.laneX = 0;
      for (let i = 0; i < 30; i++) stepRun(S, { held }, STEP);
      return S;
    };
    const input = createRunInput({ flying: () => true });
    input.pointerDown(1, 900, 500, W);
    input.pointerMove(1, 900, 400, W);
    const steered = run([...input.take().held!]);
    const idle = run([]);
    expect(steered.flyX).toBeGreaterThan(idle.flyX + 5);
    expect(steered.flyY).toBeGreaterThan(idle.flyY + 5);
  });
  it("on the road a touch stays a swipe", () => {
    const input = createRunInput({ flying: () => false });
    input.pointerDown(1, 500, 500, W);
    expect(input.pointerUp(1, 420, 505)).toBe("KeyA");
    expect(input.take()).toEqual({ taps: ["KeyA"], held: [] });
    expect(classifySwipe(40, 2)).toBe("KeyD");
    expect(classifySwipe(0, 40)).toBe("KeyS");
    expect(classifySwipe(3, -3)).toBe("Space");
  });
});

describe("C10: held keys and countdown taps", () => {
  it("blur or a hidden tab drops held keys", () => {
    const input = createRunInput({ flying: () => false });
    input.keyDown("KeyD");
    input.keyDown("ShiftLeft");
    input.clear();
    expect(input.take()).toEqual({ taps: [], held: [] });
  });
  it("game keys pressed during the countdown are dropped", () => {
    let counting = 2;
    const input = createRunInput({ flying: () => false, blocked: () => counting > 0 });
    expect(input.keyDown("Space")).toBe(false);
    input.tap("KeyE");
    input.pointerDown(1, 10, 10, 100);
    expect(input.pointerUp(1, 60, 10)).toBeNull();
    counting = 0;
    expect(input.take()).toEqual({ taps: [], held: [] });
    expect(input.keyDown("Space")).toBe(true);
    expect(input.take().taps).toEqual(["Space"]);
  });
  it("main.ts clears input on blur and visibilitychange", () => {
    const main = read("examples/saiyan-snake-way-port/main.ts");
    expect(main).toMatch(/addEventListener\("blur", \(\) => input\.clear\(\)\)/);
    expect(main).toMatch(/visibilitychange[\s\S]{0,120}input\.clear\(\)/);
  });
});

describe("C4: drowse and wind cues", () => {
  it("the drowse fade grows with the sim's drowse and warns at half", () => {
    expect(drowseCue({ drowse: 0, phase: "run" })).toEqual({ fade: 0, meter: 0, warn: false });
    expect(drowseCue({ drowse: DROWSE_WARN, phase: "run" }).warn).toBe(true);
    expect(drowseCue({ drowse: 0.9, phase: "run" }).fade).toBeGreaterThan(drowseCue({ drowse: 0.5, phase: "run" }).fade);
    expect(drowseCue({ drowse: 0.9, phase: "fall" }).fade).toBe(0);
  });
  it("a gust shows only while the sim pushes", () => {
    expect(gustCue({ wind: 0, time: 1, phase: "run" })).toBeNull();
    const S = { wind: 1, time: 1, phase: "run" };
    const g = Math.sin(0.9) * Math.sin(2.3 + 1.1);
    expect(gustCue(S)?.dir).toBe(g < 0 ? -1 : 1);
  });
});

describe("C5: days left pay out at the tail", () => {
  it("adds a days bonus only when the runner reached the tail", () => {
    expect(finalScore({ score: 1000.4, days: 200.2, phase: "leap" })).toEqual({ score: 1000, daysLeft: 200.2, daysBonus: 200 * DAYS_BONUS_PER_DAY, total: 1000 + 200 * DAYS_BONUS_PER_DAY });
    expect(finalScore({ score: 1000, days: 300, phase: "fall" }).daysBonus).toBe(0);
  });
  it("the stamp toast no longer promises a checkpoint", () => {
    expect(read("examples/saiyan-snake-way-port/sim.ts")).not.toMatch(/checkpoint"\)/);
  });
});

describe("C12: gap telegraph and onboarding", () => {
  it("warns before the first missing plate, about 1.5 s ahead", () => {
    let first = -1;
    for (let s = 0; s < 2000; s++) if (roadGapAt(s)) { first = s; break; }
    expect(first).toBeGreaterThan(0);
    const speed = 40;
    expect(gapAhead({ s: first - speed * 1.4, speed, phase: "run", puff: 0 })).not.toBeNull();
    expect(gapAhead({ s: first - speed * 3, speed, phase: "run", puff: 0 })).toBeNull();
    expect(gapAhead({ s: first - 10, speed, phase: "run", puff: 5 })).toBeNull();
  });
  it("shows each prompt once, in order", () => {
    const S = { s: 0, ki: 0.35, canFly: false, phase: "run", puff: 0, auraRung: 0 };
    expect(onboardingPrompt(S, new Set(), null, false)?.id).toBe("lanes");
    expect(onboardingPrompt(S, new Set(["lanes"]), null, false)?.id).toBe("jump");
    expect(onboardingPrompt(S, new Set(["lanes", "jump"]), 20, true)?.text).toMatch(/TAP TO JUMP/);
    expect(onboardingPrompt({ ...S, s: 200, ki: 0.8 }, new Set(["lanes", "jump", "gap"]), null, false)?.id).toBe("surge");
  });
});

describe("P-1 and P-2", () => {
  it("the QA state drops the dead lane field; the reference snapshot keeps it", () => {
    const S = createRun();
    S.laneTarget = 1;
    expect(snapshot(S, 0)).toHaveProperty("lane", 0);
    const qa = qaSnapshot(S, 0);
    expect(qa).not.toHaveProperty("lane");
    expect(qa).toHaveProperty("laneTarget", 1);
  });
  it("the days status reads as separate words", () => {
    expect(daysStatusLabel(365, true)).toBe("Days left: 365 days. Run active.");
    const html = read("examples/saiyan-snake-way-port/index.html");
    expect(html).toMatch(/id="days-card" role="status" aria-label="Days left: 365 days\. Run active\."/);
  });
});

describe("C9: labels, reduced motion and mute", () => {
  const html = read("examples/saiyan-snake-way-port/index.html");
  const app = read("apps/showcase-serpentine-sky-run-port/index.html");
  it("labels the meters and offers an on-screen mute button in both pages", () => {
    for (const page of [html, app]) {
      expect(page).toMatch(/>SPARK</);
      expect(page).toMatch(/>STRAIN</);
      expect(page).toMatch(/id="mute-btn"[^>]*aria-pressed/);
    }
  });
  it("main.ts honours prefers-reduced-motion and saves the mute state", () => {
    const main = read("examples/saiyan-snake-way-port/main.ts");
    expect(main).toMatch(/prefers-reduced-motion: reduce/);
    expect(main).toMatch(/setReducedMotion/);
    expect(main).toMatch(/saveValue\(MUTE_KEY/);
  });
});

describe("C3 / LIGHT-01: neutral environment", () => {
  it("the scene authors environments.neutral at the calibrated intensity", () => {
    const nodes = (buildWorld().scene as unknown as { toJSON(): { nodes: { kind: string; environment?: string; intensity?: number }[] } }).toJSON().nodes;
    const env = nodes.filter((n) => n.kind === "environment");
    expect(env).toHaveLength(1);
    expect(env[0]!.environment).toBe("neutral");
    expect(env[0]!.intensity).toBe(ENV_INTENSITY);
    expect(nodes.some((n) => n.kind === "light" && (n as { light?: string }).light === "hemisphere")).toBe(true);
  });
  it("?env= overrides the intensity for calibration and ignores bad values", () => {
    expect(environmentIntensity("?env=0.6")).toBe(0.6);
    expect(environmentIntensity("?env=-1")).toBe(ENV_INTENSITY);
    expect(environmentIntensity("?env=abc")).toBe(ENV_INTENSITY);
    expect(environmentIntensity("")).toBe(ENV_INTENSITY);
  });
});

describe("C8: pooled slots write visibility only on change", () => {
  it("a second update of the same state writes no visibility", () => {
    const world = buildWorld();
    const writes = new Map<string, number>();
    const handle = (id: string) => {
      const h: Record<string, unknown> = {};
      const self = () => h;
      Object.assign(h, {
        setPosition: self, setRotation: self, setScale: self, setUniform: self,
        setVisible: () => { writes.set(id, (writes.get(id) ?? 0) + 1); return h; }
      });
      return h;
    };
    const app = { camera: { setPose: vi.fn() }, nodes: { require: (id: string) => handle(id) } };
    const runtime = world.bind(app as never);
    const S = createRun();
    for (let i = 0; i < 120; i++) stepRun(S, {}, STEP);
    runtime.update(S, STEP, 1, 16 / 9);
    const first = runtime.visibilityWrites;
    runtime.update(S, STEP, 1 + STEP, 16 / 9);
    expect(first).toBeGreaterThan(200);
    expect(runtime.visibilityWrites).toBeLessThan(20);
  });
});
