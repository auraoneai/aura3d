import { describe, expect, it } from "vitest";
import { createMenuMachine, INTRO_SECONDS, INTRO_SECONDS_REDUCED } from "../../../examples/aura-slam/ui/menuMachine";
import { playerFrame } from "../../../examples/aura-slam/shell/inputFrame";
import { createInputMapper } from "../../../examples/aura-slam/input/mapper";
import { createMatchLoop } from "../../../examples/aura-slam/shell/loop";
import { createAdapterController } from "../../../examples/aura-slam/shell/controller";
import { COORDINATE_SYSTEM, renderGameToText } from "../../../examples/aura-slam/shell/qaText";
import { controlText, movementLabel } from "../../../examples/aura-slam/ui/format";
import type { HudState } from "../../../examples/aura-slam/ui/types";
import { originalControls, originalEngine, memoryStorage, playedEngine } from "./ui-original";

describe("menu state machine", () => {
  it("walks home to setup to court to intro to playing to result and back", () => {
    const m = createMenuMachine();
    expect(m.debug()).toMatchObject({ screen: "home", mode: "single", setupStep: null });
    m.setup("single");
    expect(m.debug()).toMatchObject({ screen: "setup", setupStep: "player" });
    expect(m.nextSingleStep()).toBe(true);
    expect(m.nextSingleStep()).toBe(false);
    expect(m.singleStep).toBe("court");
    m.backFromSetup();
    expect(m.singleStep).toBe("player");
    m.backFromSetup();
    expect(m.screen).toBe("home");
    m.setup("single", "court");
    m.introduce();
    expect(m).toMatchObject({ screen: "intro", introRemaining: INTRO_SECONDS });
    expect(m.play()).toBe(true);
    expect(m.screen).toBe("playing");
    expect(m.play()).toBe(false);
    m.complete();
    expect(m.screen).toBe("result");
  });
  it("counts the intro down in simulation time and starts the match once", () => {
    const m = createMenuMachine();
    m.setup("practice"); m.introduce();
    let starts = 0;
    for (let i = 0; i < 200; i++) if (m.tick(1 / 60)) starts++;
    expect(starts).toBe(1);
    expect(m.screen).toBe("playing");
  });
  it("pauses the intro while the tab is hidden and shortens it for reduced motion", () => {
    const m = createMenuMachine({ reducedMotion: () => true });
    m.setup("single"); m.introduce();
    expect(m.introDuration).toBe(INTRO_SECONDS_REDUCED);
    m.tick(0.5, true);
    expect(m.introRemaining).toBe(INTRO_SECONDS_REDUCED);
    m.tick(0.5, false);
    expect(m.introRemaining).toBeCloseTo(0.5, 6);
  });
  it("remembers settings per mode and never overwrites them from the home screen", () => {
    const m = createMenuMachine();
    m.setup("single"); m.remember({ venue: "clay", difficulty: "pro" });
    m.setup("practice"); m.remember({ venue: "moon", difficulty: "beginner" });
    expect(m.settingsFor("single")).toEqual({ venue: "clay", difficulty: "pro" });
    expect(m.settingsFor("practice")).toEqual({ venue: "moon", difficulty: "beginner" });
    m.home(); m.remember({ venue: "grass", difficulty: "club" });
    expect(m.settingsFor("practice").venue).toBe("moon");
  });
  it("keeps help state out of the screens", () => {
    const m = createMenuMachine();
    m.openHelp(); expect(m.helpOpen).toBe(true);
    m.setup("single"); expect(m.helpOpen).toBe(false);
  });
});

const keysOf = (...codes: string[]): Record<string, boolean> => Object.fromEntries(codes.map((c) => [c, true]));
type Ctx = Parameters<typeof playerFrame>[1];
function ctx(over: Partial<Ctx> = {}, keys: Record<string, boolean> = {}, selectedShot = "neutral", state: Record<string, unknown> = {}): Ctx {
  return {
    keys, stick: { x: 0, y: 0 }, inputBlocked: false, modernServe: true, strategic: false,
    state: { server: "ai", phase: "rally", practice: undefined, player: { selectedShot }, ...state } as never, ...over
  };
}
const mapper = () => createInputMapper({ storage: memoryStorage() });

describe("player input frame (shell + M-INPUT mapper)", () => {
  it("moves with arrows and WASD and clamps diagonals", () => {
    const m = mapper();
    expect(playerFrame(m, ctx({}, keysOf("ArrowRight")))).toMatchObject({ x: 1, y: 0, vertical: false, active: true, power: false });
    expect(playerFrame(m, ctx({}, keysOf("KeyA", "KeyW")))).toMatchObject({ x: -1, y: -1, vertical: true, active: true });
    expect(playerFrame(m, ctx({}, keysOf("ArrowLeft", "ArrowRight")))).toMatchObject({ x: 0, active: true });
    expect(playerFrame(m, ctx())).toMatchObject({ x: 0, y: 0, vertical: false, active: false });
  });
  it("adds the touch stick and caps at one", () => {
    expect(playerFrame(mapper(), ctx({ stick: { x: 1.6, y: 0.25 } }))).toMatchObject({ x: 1, y: 0.25, vertical: true, active: true });
  });
  it("is silent while overlays or swipe own the input", () => {
    expect(playerFrame(mapper(), ctx({ inputBlocked: true }, keysOf("ArrowRight", "ShiftLeft")))).toMatchObject({ x: 0, y: 0, active: false, power: false });
  });
  it("reports a normalised serve aim during the serve", () => {
    const frame = playerFrame(mapper(), ctx({}, keysOf("ArrowRight", "ArrowDown"), "neutral", { server: "player", phase: "serveToss" }));
    expect(frame.serveAimX).toBeCloseTo(Math.SQRT1_2, 6);
    expect(frame.serveAimY).toBeCloseTo(Math.SQRT1_2, 6);
  });
  it("gives Pro and Legend controlled placement only with C held and not on short balls or lobs", () => {
    const m = mapper();
    const strategic = { strategic: true };
    expect(playerFrame(m, ctx(strategic, keysOf("ArrowRight", "KeyC"))).aimX).toBeCloseTo(0.64 / 0.72, 9);
    expect(playerFrame(m, ctx(strategic, keysOf("ArrowRight"))).aimX).toBeUndefined();
    expect(playerFrame(m, ctx(strategic, keysOf("ArrowRight", "KeyC"), "lob")).aimX).toBeUndefined();
    expect(playerFrame(m, ctx(strategic, keysOf("ArrowRight", "ArrowDown", "KeyC"))).aimX).toBeUndefined();
    expect(playerFrame(m, ctx({}, keysOf("ArrowRight", "KeyC"))).aimX).toBeUndefined();
  });
  it("power follows Shift and honours rebinding", () => {
    const m = mapper();
    expect(playerFrame(m, ctx({}, keysOf("ShiftLeft")))).toMatchObject({ power: true });
    expect(playerFrame(m, ctx())).toMatchObject({ power: false });
    const profile = m.bindings.getBindings("keyboard") as Record<string, unknown>;
    profile.power = ["KeyV", null];
    expect(m.bindings.applyBindings("keyboard", profile).ok).toBe(true);
    expect(playerFrame(m, ctx({}, keysOf("KeyV")))).toMatchObject({ power: true });
    expect(playerFrame(m, ctx({}, keysOf("ShiftLeft")))).toMatchObject({ power: false });
  });
});

describe("controls text", () => {
  it("shows arrows/WASD by default and the bound keys after a rebind", () => {
    const controls = createInputMapper({ storage: memoryStorage() }).bindings as never as import("../../../examples/aura-slam/ui/controls").ControlsPort;
    expect(movementLabel(controls)).toBe("arrows/WASD");
    expect(controlText("Press Space to hit", controls)).toBe("Press Space to hit");
    const profile = controls.getBindings("keyboard") as Record<string, unknown>;
    profile.hit = ["KeyJ", null];
    expect(controls.applyBindings("keyboard", profile).ok).toBe(true);
    expect(controlText("Press Space to hit", controls)).toBe("Press J to hit");
    profile.up = ["KeyI", null];
    controls.applyBindings("keyboard", profile);
    expect(movementLabel(controls)).toContain("I");
  });
});

describe("match loop", () => {
  function harness(manual = false) {
    const frames: Array<(t: number) => void> = [];
    const steps: number[] = []; let renders = 0;
    const loop = createMatchLoop({ step: (dt) => steps.push(dt), render: () => { renders++; }, manual, now: () => 0, schedule: (cb) => frames.push(cb) && frames.length, cancel: () => {} });
    return { loop, frames, steps, renders: () => renders };
  }
  it("accumulates real time into 1/60 s steps, clamps long frames, renders once per frame", () => {
    const h = harness();
    h.loop.start();
    h.frames.shift()!(1000 / 30);               // two steps' worth
    expect(h.steps).toHaveLength(2);
    expect(h.renders()).toBe(1);
    h.frames.shift()!(1000 / 30 + 5000);        // a 5 s stall is clamped to 50 ms: three steps
    expect(h.steps).toHaveLength(5);
    expect(h.steps.every((dt) => Math.abs(dt - 1 / 60) < 1e-12)).toBe(true);
  });
  it("advanceTime switches to manual stepping and runs whole steps", () => {
    const h = harness();
    expect(h.loop.advanceTime(100)).toBe(6);
    expect(h.loop.manual).toBe(true);
    expect(h.steps).toHaveLength(6);
    h.loop.start();
    h.frames.shift()!(5000);
    expect(h.steps).toHaveLength(6);            // manual: the frame does not advance the sim
  });
  it("timestamps input inside the current frame like inputEventTime", () => {
    const h = harness();
    h.loop.start();
    h.frames.shift()!(1000);                    // the first frame sets lastFrame = 1000
    expect(h.loop.timeIntoFrame(1000 + 8, 2)).toBeCloseTo(2 + 0.008 + h.loop.loop.accumulator, 9);
    expect(h.loop.timeIntoFrame(undefined, 2)).toBe(2);
    expect(h.loop.timeIntoFrame(1000 + 500, 2)).toBeLessThanOrEqual(2 + 0.05 + 1e-9);
  });
});

describe("adapter controller (live page autoplay, serve-phase movement and toss assist)", () => {
  const make = (autoplay: boolean, state: unknown, calls: unknown[][]) => {
    const engine = { requestSwing: (...args: unknown[]) => calls.push(["swing", ...args]), selectShot: (...args: unknown[]) => calls.push(["shot", ...args]) };
    return createAdapterController({ engine: () => engine, state: () => state as never, autoplay });
  };
  it("serves on a 0.45 s timer and moves toward the incoming ball with the live page's arithmetic", () => {
    const calls: unknown[][] = [];
    const serve = { mode: "playing", paused: false, phase: "serve", server: "player", time: 1, player: { x: 0, y: 1, vx: 0, vy: 0, swing: 0, swingCooldown: 0 }, ball: { x: 0, y: 0, z: 0, vz: 0, vy: 0, active: false, lastHit: null, bounceCount: 0 } } as never;
    const ap = make(true, serve, calls);
    for (let i = 0; i < 30; i++) ap.step(serve, 1 / 60);
    expect(calls.filter((c) => c[0] === "swing")).toHaveLength(1);
    const rally = { mode: "playing", paused: false, phase: "rally", server: "ai", time: 3, player: { x: 0, y: 0.9, vx: 0, vy: 0, swing: 0, swingCooldown: 0, moveBlend: 0, stride: 0 },
      ball: { active: true, lastHit: "ai", vy: 1, x: 0.01, y: 0.9, z: 0.2, vz: 0, targetX: 0.5, targetY: 0.8, isServe: false, bounceCount: 1 } } as never;
    ap.step(rally, 1 / 60);
    const dx = 0.5 - 0, dy = 0.88 - 0.9, dist = Math.hypot(dx, dy), spd = Math.min(1.32, dist * 6.5);
    expect((rally as { player: { x: number } }).player.x).toBeCloseTo((dx / dist) * spd / 60, 12);
    expect((rally as { player: { y: number } }).player.y).toBeCloseTo(0.9 + (dy / dist) * spd / 60, 12);
    expect(calls.some((c) => c[0] === "shot" && c[1] === "deep")).toBe(true);
    const far = { ...(rally as object), player: { x: -0.9, y: 0.9, vx: 0, vy: 0, swing: 0, swingCooldown: 0 } } as never;
    const before = calls.length;
    ap.step(far, 1 / 60);
    expect(calls).toHaveLength(before);
  });
  it("moves the server during serve setup from held keys and assists the toss-apex swing when Auto is off", () => {
    const calls: unknown[][] = [];
    const state = { mode: "playing", paused: false, phase: "serve", server: "player", time: 2, serveAttempt: null,
      player: { x: 0, y: 1.035, vx: 0, vy: 0, swing: 0, swingCooldown: 0 }, ball: { x: 0, y: 0, z: 0, vz: 0, vy: 0, active: false, lastHit: null, bounceCount: 0 } } as never;
    const ap = make(false, state, calls);
    ap.keyDown({ code: "KeyD" });
    ap.step(state, 1 / 60);
    const s = state as unknown as { player: { x: number; vx: number }; ball: { x: number } };
    expect(s.player.vx).toBeCloseTo(1.35, 12);
    expect(s.player.x).toBeCloseTo(1.35 / 60, 12);
    expect(s.ball.x).toBeCloseTo(s.player.x + 0.035, 12);
    ap.keyUp({ code: "KeyD" });
    const toss = { ...(state as object), phase: "serveToss", serveAttempt: { swingAt: null }, ball: { x: 0, y: 0, z: 0.9, vz: 0.1, vy: 0, active: true, lastHit: null, bounceCount: 0 } } as never;
    ap.step(toss, 1 / 60);
    expect(calls.filter((c) => c[0] === "swing")).toHaveLength(1);
  });
  it("J, K and L are no longer handled here: the shell routes them through the binding gates (top-tennis-C6, audit-fixes.test.ts)", () => {
    const calls: unknown[][] = [];
    const ap = make(false, { mode: "playing", paused: false, time: 4 } as never, calls);
    ap.keyDown({ code: "KeyJ" }); ap.keyDown({ code: "KeyK" }); ap.keyDown({ code: "KeyL" });
    expect(calls).toEqual([]);
    expect(ap.keysHeld.has("KeyK")).toBe(true);
  });
});

describe("render_game_to_text", () => {
  it("reports the original page's keys from a live original engine state", () => {
    const engine = playedEngine(40);
    const controls = originalControls.create({ storage: memoryStorage() });
    const state = engine.state as HudState;
    const json = JSON.parse(renderGameToText({
      state, names: { player: "ALEX", ai: "CPU" }, menu: null, shownResults: null, selectedShot: "neutral", strategic: false, modernServe: true,
      swipeActive: false, mobileControls: {}, swipeState: {}, swipeGesture: undefined, swipeVisual: undefined,
      bindings: { keyboard: controls.getBindings("keyboard"), controller: controls.getBindings("controller"), settingsOpen: false },
      touch: { active: false, dragging: false, x: 0, y: 0 }, placementDown: false, smashAvailable: false, graphics: undefined,
      engine, serveFeedback: null, controlsHelp: "help"
    }));
    expect(json.coordinateSystem).toBe(COORDINATE_SYSTEM);
    for (const key of ["netHeight", "mode", "paused", "phase", "difficulty", "score", "scoreboard", "player", "rival", "ball", "serve", "speedometer", "outFeedback", "shotControl", "power", "venue", "bindings"]) expect(json).toHaveProperty(key);
    expect(json.mode).toBe("playing");
    expect(json.venue).toMatchObject({ id: "hard", name: "New York", surface: "Hard court", destination: false, gravity: "Earth" });
    expect(json.power).toMatchObject({ max: 100, cost: 38, recoveryPerSecond: 6 });
    expect(json.shotControl.aimWindowMs).toBeCloseTo(180, 9);
    expect(json.scoreboard.names).toEqual({ player: "ALEX", ai: "CPU" });
    expect(json.serve.modern).toBe(true);
    expect(json.ball).toHaveProperty("motion");
    expect(originalEngine.capabilities.serveTargeting).toBeTruthy();
  });
});
