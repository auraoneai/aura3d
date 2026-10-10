import { describe, expect, it } from "vitest";
import { createGame as stubCreateGame } from "../../../../packages/engine/src/contracts/game";
import { GameSessionImpl } from "../../../../packages/game/src/session/GameSession";
import { createAccessibility } from "../../../../packages/game/src/session/accessibility";
import { captureFromUrl } from "../../../../packages/game/src/capture/captureFromUrl";
import { installGameBeacon } from "../../../../packages/game/src/evidence/beacon";
import type { GameBeacon } from "../../../../packages/engine/src/contracts/game";
import { C24_GAME_SLOT } from "../../../../packages/game/src/index";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { StubTimeController } from "../../../../packages/engine/src/contracts/time";

describe("PRD-09 C-24 slot + session impl", () => {
  it("C-24 slot is provided by prd09 under A3D_QR_GAME", () => {
    expect(C24_GAME_SLOT.owner).toBe("prd09");
    expect(C24_GAME_SLOT.flag).toBe("A3D_QR_GAME");
    const off = resolveQrFlags({ env: {} });
    expect(C24_GAME_SLOT.get(off)).toBe(stubCreateGame);
    const on = resolveQrFlags({ env: { A3D_QR: "game" } });
    expect(C24_GAME_SLOT.get(on)).not.toBe(stubCreateGame);
  });

  it("session enforces legal state transitions", () => {
    const s = new GameSessionImpl({ seed: 7 });
    expect(s.state).toBe("booting");
    expect(() => s.transition("playing")).toThrow(/GAME_SESSION_ILLEGAL_TRANSITION:booting->playing/);
    s.transition("loading");
    s.transition("playing");
    s.pause("user");
    expect(s.paused).toBe(true);
    s.resume();
    expect(s.paused).toBe(false);
    s.transition("disposed");
    expect(() => s.transition("playing")).toThrow(/ILLEGAL_TRANSITION/);
  });

  it("pause reasons stack; releasePause only resumes when stack empties", () => {
    const s = new GameSessionImpl({ seed: 0 });
    s.transition("loading");
    s.transition("playing");
    s.pause("user");
    s.pause("visibility");
    s.releasePause("user");
    expect(s.state).toBe("paused");
    s.releasePause("visibility");
    expect(s.state).toBe("playing");
  });

  it("per-actor hitStop freezes on real time while global hitStop scales dt to 0", () => {
    const time = new StubTimeController();
    // Production path (createGame): bind the app's controller; the session advances it.
    const s = new GameSessionImpl({ seed: 0 });
    s.bindTimeController(time);
    s.hitStop(0.05, { actors: ["ball"] });
    expect(s.isFrozen("ball")).toBe(true);
    expect(s.scaledDt(0.016, "ball")).toBe(0);
    expect(s.scaledDt(0.016, "cue")).toBeCloseTo(0.016, 6);
    s.hitStop(0.05);
    expect(s.scaledDt(0.016)).toBe(0);
    s.tick(0.05);
    expect(s.isFrozen("ball")).toBe(false);
    expect(s.isFrozen()).toBe(false);
  });

  it("timeScale delegates to the real C-23 controller incl. slowMo ramp-out", () => {
    const time = new StubTimeController();
    // Production path (createGame): bind the app's controller; the session advances it.
    const s = new GameSessionImpl({ seed: 0 });
    s.bindTimeController(time);
    s.setTimeScale(2.5);
    expect(time.scale).toBe(2.5);
    s.setTimeScale(9);
    expect(time.scale).toBe(4);
    expect(() => s.setTimeScale(Number.NaN)).toThrow(/GAME_TIMESCALE_NAN/);
    s.slowMo(0.2, 100, { ease: "out" });
    expect(time.scale).toBe(0.2);
    s.tick(0.2);
    // slow-mo expired; the ease-out ramp back to 1 is scheduled but not applied yet
    s.tick(0.4);
    expect(time.scale).toBeGreaterThan(0.2);
    s.tick(10);
    expect(time.scale).toBe(1);
  });

  it("setTimeScale rampMs ramps via scaleTo", () => {
    const time = new StubTimeController();
    // Production path (createGame): bind the app's controller; the session advances it.
    const s = new GameSessionImpl({ seed: 0 });
    s.bindTimeController(time);
    s.setTimeScale(0.5, { rampMs: 200 });
    s.tick(0.1);
    expect(time.scale).toBeLessThan(1);
    expect(time.scale).toBeGreaterThan(0.5);
    s.tick(10);
    expect(time.scale).toBe(0.5);
  });

  it("captureFromUrl: ?capture=review resolves play and warns once", () => {
    const warnings: string[] = [];
    const origWarn = console.warn;
    console.warn = (m: unknown) => { warnings.push(String(m)); };
    try {
      const url = new URL("http://x/play?capture=review");
      expect(captureFromUrl(url)).toEqual({ mode: "play" });
      captureFromUrl(url);
      captureFromUrl(url);
      expect(warnings.length).toBe(1);
    } finally {
      console.warn = origWarn;
    }
  });

  it("captureFromUrl parses scenario/seed/freezeAt/cameraPose", () => {
    const ctx = captureFromUrl(new URL("http://x/?scenario=s1&seed=42&freezeAt=1.5&cameraPose=hero"));
    expect(ctx).toEqual({
      mode: "scenario",
      scenario: "s1",
      seed: 42,
      freezeAt: 1.5,
      cameraPose: "hero"
    });
  });

  it("accessibility merges media defaults with persisted overrides", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
    const a = createAccessibility("test-game", { storage });
    expect(a.values.reducedMotion).toBe(false);
    a.set("reducedMotion", true);
    expect(a.values.reducedMotion).toBe(true);
    // a second session on the same storage sees the persisted override
    const b = createAccessibility("test-game", { storage });
    expect(b.values.reducedMotion).toBe(true);
    a.dispose();
    b.dispose();
  });

  it("beacon installs a frozen object replaced on refresh", () => {
    const win: { __AURA3D_GAME__?: GameBeacon } = {};
    let state = "booting" as const;
    const b = installGameBeacon({
      route: "/x",
      getState: () => state as never,
      getFrame: () => 0,
      getFirstFrameAt: () => null,
      win
    });
    const first = win.__AURA3D_GAME__!;
    expect(Object.isFrozen(first)).toBe(true);
    expect(first.state).toBe("booting");
    state = "playing" as never;
    b.refresh();
    const second = win.__AURA3D_GAME__!;
    expect(second).not.toBe(first);
    expect(second.state).toBe("playing");
    b.dispose();
  });
});
