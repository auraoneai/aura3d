import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderGameToText } from "../../../examples/aura-slam/shell/qaText";
import { installSlamQa, type SlamQaDeps } from "../../../examples/aura-slam/shell/qa";
import type { HudState } from "../../../examples/aura-slam/ui/types";
import { originalControls, memoryStorage, playedEngine } from "./ui-original";

/**
 * QA-hook compatibility (G1 item 4): the native shell must answer the original page's automation hooks in the original's
 * shapes: `render_game_to_text()` (JSON keys and their order, plus the single-line nested objects), `advanceTime(ms)`
 * (see ui-flow.test.ts for the step semantics) and `__TOP_TENNIS_CONTROL__` ({ getState, getEngine, startOffline, togglePause }).
 */
const GAME = readFileSync(join(process.cwd(), "tests/fixtures/aura-slam-original/toptennis/game.js"), "utf8");
const lines = GAME.split("\n");
const start = lines.findIndex((l) => l.includes("function renderGameToText()"));
const bodyStart = lines.findIndex((l, i) => i > start && l.includes("return JSON.stringify({"));
const bodyEnd = lines.findIndex((l, i) => i > bodyStart && /^ {4}\}\);/.test(l));
const body = lines.slice(bodyStart + 1, bodyEnd);

/** Keys of an object literal's first level on one line: `{ a: 1, b: f(x, y), c: { d: 1 } }` gives a, b, c. */
function lineKeys(text: string): string[] {
  const open = text.indexOf("{");
  const keys: string[] = [];
  let depth = 0, token = "", prev = "{";
  for (let i = open + 1; i < text.length; i++) {
    const c = text[i]!;
    if ("{[(".includes(c)) { depth++; token = ""; continue; }
    if ("}])".includes(c)) { if (depth === 0) break; depth--; continue; }
    if (depth > 0) continue;
    if (c === ":" && /^\w+$/.test(token) && (prev === "," || prev === "{")) { keys.push(token); token = ""; prev = ":"; continue; }
    if (c === ",") { prev = ","; token = ""; continue; }
    if (/\s/.test(c)) { if (token) token += ""; continue; }
    token += c;
  }
  return keys;
}
const topLevel = body.map((l) => /^ {6}(\w+):/.exec(l)?.[1]).filter((k): k is string => Boolean(k));
const nested = (key: string): string[] => { const l = body.find((x) => new RegExp(`^ {6}${key}: \\{`).test(x)); return l ? lineKeys(l) : []; };

function nativeJson(): Record<string, any> {
  const engine = playedEngine(40);
  const controls = originalControls.create({ storage: memoryStorage() });
  return JSON.parse(renderGameToText({
    state: engine.state as HudState, names: { player: "ALEX", ai: "CPU" }, menu: null, shownResults: null, selectedShot: "neutral", strategic: false, modernServe: true,
    swipeActive: false, mobileControls: {}, swipeState: {}, swipeGesture: undefined, swipeVisual: undefined,
    bindings: { keyboard: controls.getBindings("keyboard"), controller: controls.getBindings("controller"), settingsOpen: false },
    touch: { active: false, dragging: false, x: 0, y: 0 }, placementDown: false, smashAvailable: false, graphics: undefined,
    engine, serveFeedback: null, controlsHelp: "help"
  }));
}

describe("render_game_to_text shape against the original page", () => {
  it("parses the original's key list", () => {
    expect(topLevel.length).toBeGreaterThan(40);
    expect(topLevel).toEqual(expect.arrayContaining(["mode", "roster", "characters", "appearance", "score", "scoreboard", "player", "rival", "ball"]));
  });
  it("has exactly the original's top-level keys, in the original's order", () => {
    expect(Object.keys(nativeJson())).toEqual(topLevel);
  });
  it("matches the single-line nested objects (player, rival, ball)", () => {
    const engine = playedEngine(40);
    engine.state.ball.shotType = "serve";
    const controls = originalControls.create({ storage: memoryStorage() });
    const json = JSON.parse(renderGameToText({
      state: engine.state as HudState, names: { player: "ALEX", ai: "CPU" }, menu: null, shownResults: null, selectedShot: "neutral", strategic: false, modernServe: true,
      swipeActive: false, mobileControls: {}, swipeState: {}, swipeGesture: undefined, swipeVisual: undefined,
      bindings: { keyboard: controls.getBindings("keyboard"), controller: controls.getBindings("controller"), settingsOpen: false },
      touch: { active: false, dragging: false, x: 0, y: 0 }, placementDown: false, smashAvailable: false, graphics: undefined,
      engine, serveFeedback: null, controlsHelp: "help"
    }));
    for (const key of ["player", "rival", "ball"]) expect(Object.keys(json[key]), key).toEqual(nested(key));
  });
  it("reports the default roster, characters and appearance of the live page", () => {
    const json = nativeJson();
    expect(json.roster).toMatchObject({ enabled: true, selection: { player: "alcatraz", ai: "zinner" }, chooserOpen: false });
    expect(json.offlineBuild).toBeNull();
    expect(json.multiplayerBuild).toBeNull();
    expect(Object.keys(json.characters)).toEqual(["player", "rival"]);
    expect(Object.keys(json.appearance)).toEqual(["selection", "player", "rival", "chooserOpen"]);
  });
});

describe("window hooks installed by the native shell", () => {
  it("installs advanceTime, render_game_to_text and __TOP_TENNIS_CONTROL__ with the original's four members", () => {
    const target: Record<string, any> = {};
    const noop = () => undefined;
    const engine = playedEngine(1);
    installSlamQa({
      ready: () => true, state: () => engine.state as never, stepFrames: noop, reset: noop, begin: noop, app: () => null,
      renderText: () => "{}", advanceTime: noop, togglePause: noop, startOffline: noop, getEngine: () => engine as never, traceRow: () => [], target
    } as SlamQaDeps);
    expect(typeof target.advanceTime).toBe("function");
    expect(typeof target.render_game_to_text).toBe("function");
    expect(Object.keys(target.__TOP_TENNIS_CONTROL__).sort()).toEqual(["getEngine", "getState", "startOffline", "togglePause"]);
    expect(target.__TOP_TENNIS_CONTROL__.getState()).toBe(engine.state);
  });
});
