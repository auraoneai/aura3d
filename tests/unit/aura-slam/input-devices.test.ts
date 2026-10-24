import { describe, expect, it } from "vitest";
import type { InputSample } from "../../../examples/aura-slam/contract/input";
import { createBindingsStore } from "../../../examples/aura-slam/input/bindings";
import { createGamepadPoller, type GamepadGates, type PadLike } from "../../../examples/aura-slam/input/gamepad";
import {
  createKeyboardTracker, describeKeyTarget, installKeyboardListeners, type KeyEventLike, type KeyboardContext, type KeyboardHost,
} from "../../../examples/aura-slam/input/keyboard";
import { createInputMapper, createTouchStick, TOUCH_DEAD_ZONE, TOUCH_RADIUS, TOUCH_TAP_MS } from "../../../examples/aura-slam/input/mapper";

const ctx = (patch: Partial<KeyboardContext> = {}): KeyboardContext => ({
  overlayOpen: false, touchPlayEnabled: true, mode: "playing", online: false, swipeActive: false,
  documentActive: true, fullscreen: false, selectedShot: "neutral", ...patch,
});
const ev = (code: string, patch: Partial<KeyEventLike> = {}): KeyEventLike => ({ code, key: code, target: { isBody: true, insideShell: true }, ...patch });

function tracker() {
  return createKeyboardTracker(createBindingsStore());
}

describe("M-INPUT keyboard: game.js handleKeyDown branches", () => {
  it("maps bound keys to commands: hit swings, lob lobs, short/deep toggle against the selected preset", () => {
    const t = tracker();
    expect(t.handleKeyDown(ev("Space"), ctx()).command).toEqual({ type: "swing" });
    expect(t.handleKeyDown(ev("KeyR"), ctx()).command).toEqual({ type: "lobSwing" });
    expect(t.handleKeyDown(ev("KeyQ"), ctx()).command).toEqual({ type: "selectShot", shot: "short" });
    expect(t.handleKeyDown(ev("KeyE"), ctx({ selectedShot: "deep" })).command).toEqual({ type: "selectShot", shot: "neutral" });
    expect(t.handleKeyDown(ev("KeyQ"), ctx({ selectedShot: "short" })).command).toBeNull(); // held: no second press
  });

  it("first gameplay press unlocks audio, prevents default while touch-play is enabled, and ignores repeats", () => {
    const t = tracker();
    const first = t.handleKeyDown(ev("Space"), ctx());
    expect(first).toMatchObject({ unlockAudio: true, preventDefault: true });
    const repeat = t.handleKeyDown(ev("Space", { repeat: true }), ctx());
    expect(repeat.command).toBeNull();
    expect(repeat.unlockAudio).toBe(false);
    const held = t.handleKeyDown(ev("Space"), ctx());
    expect(held.command).toBeNull();
  });

  it("alternate keys are one logical button: release both before a second hit", () => {
    const bindings = createBindingsStore();
    bindings.applyBindings("keyboard", { ...(bindings.getBindings("keyboard") as object), hit: ["Space", "KeyH"] });
    const t = createKeyboardTracker(bindings);
    expect(t.handleKeyDown(ev("Space"), ctx()).command).toEqual({ type: "swing" });
    expect(t.handleKeyDown(ev("KeyH"), ctx()).command).toBeNull();
    t.handleKeyUp(ev("Space"));
    expect(t.handleKeyDown(ev("Space"), ctx()).command).toBeNull(); // KeyH still held
    t.handleKeyUp(ev("KeyH")); t.handleKeyUp(ev("Space"));
    expect(t.handleKeyDown(ev("Space"), ctx()).command).toEqual({ type: "swing" });
  });

  it("reserved keys: KeyP and Escape pause (Escape only outside fullscreen), KeyF toggles fullscreen", () => {
    const t = tracker();
    expect(t.handleKeyDown(ev("KeyP"), ctx()).command).toEqual({ type: "pause" });
    t.handleKeyUp(ev("KeyP"));
    expect(t.handleKeyDown(ev("Escape"), ctx()).command).toEqual({ type: "pause" });
    t.handleKeyUp(ev("Escape"));
    expect(t.handleKeyDown(ev("Escape"), ctx({ fullscreen: true })).command).toBeNull();
    expect(t.handleKeyDown(ev("KeyF"), ctx()).command).toEqual({ type: "fullscreen" });
  });

  it("menu and game-over modes: Space (and R on game over only) activates; other keys do nothing", () => {
    const t = tracker();
    expect(t.handleKeyDown(ev("Space"), ctx({ mode: "menu" })).command).toEqual({ type: "swing" });
    t.handleKeyUp(ev("Space"));
    expect(t.handleKeyDown(ev("KeyR"), ctx({ mode: "menu" })).command).toBeNull();
    t.handleKeyUp(ev("KeyR"));
    expect(t.handleKeyDown(ev("KeyR"), ctx({ mode: "gameover" })).command).toEqual({ type: "swing" });
    expect(t.handleKeyDown(ev("KeyQ"), ctx({ mode: "gameover" })).command).toBeNull();
  });

  it("modifier chords, overlays and composing block input; releasing keys is still observed", () => {
    const t = tracker();
    expect(t.handleKeyDown(ev("Space", { ctrlKey: true }), ctx()).command).toBeNull();
    expect(t.handleKeyDown(ev("Space", { altKey: true }), ctx()).command).toBeNull();
    expect(t.handleKeyDown(ev("Space", { metaKey: true }), ctx()).command).toBeNull();
    expect(t.handleKeyDown(ev("Space", { isComposing: true }), ctx()).command).toBeNull();
    expect(t.handleKeyDown(ev("KeyQ"), ctx({ overlayOpen: true })).command).toBeNull();
    // A chord blocks every held physical key until it is released.
    const u = tracker();
    u.trackKeyDown(ev("Space"));
    u.handleKeyDown(ev("KeyZ", { ctrlKey: true }), ctx());
    expect(u.isBlocked("Space")).toBe(true);
    expect(u.handleKeyDown(ev("Space"), ctx()).command).toBeNull();
    u.handleKeyUp(ev("Space"));
    expect(u.isBlocked("Space")).toBe(false);
    expect(u.handleKeyDown(ev("Space"), ctx()).command).toEqual({ type: "swing" });
  });

  it("blocked bound keys are still default-prevented while touch-play is on, except on native controls", () => {
    const t = tracker();
    t.trackKeyDown(ev("Space"));
    t.clear();
    expect(t.isBlocked("Space")).toBe(true);
    expect(t.handleKeyDown(ev("Space"), ctx())).toMatchObject({ preventDefault: true, command: null });
    expect(t.handleKeyDown(ev("Space", { target: { tagName: "BUTTON", isBody: false, insideShell: true } }), ctx()).preventDefault).toBe(false);
  });

  it("the backquote key has no game command (Busted Mode was removed)", () => {
    const t = tracker();
    expect(t.handleKeyDown(ev("Backquote"), ctx()).command).toBeNull();
  });

  it("targets outside the shell, text fields and activatable controls keep their own semantics", () => {
    const t = tracker();
    expect(t.handleKeyDown(ev("Space", { target: { tagName: "DIV", isBody: false, insideShell: false } }), ctx()).command).toBeNull();
    expect(t.handleKeyDown(ev("KeyQ", { target: { tagName: "INPUT", isBody: false, insideShell: true } }), ctx()).command).toBeNull();
    expect(t.handleKeyDown(ev("KeyR", { target: { isContentEditable: true, isBody: false, insideShell: true } }), ctx()).command).toBeNull();
    expect(t.handleKeyDown(ev("Space", { target: { tagName: "BUTTON", isBody: false, insideShell: true } }), ctx()).command).toBeNull();
    expect(t.handleKeyDown(ev("KeyQ", { target: { tagName: "BUTTON", isBody: false, insideShell: true } }), ctx()).command).toEqual({ type: "selectShot", shot: "short" });
  });

  it("the menu gets first refusal; hidden or unfocused documents and disabled touch-play issue no gameplay commands", () => {
    const t = tracker();
    expect(t.handleKeyDown(ev("Space"), ctx({ menuHandlesKey: () => true })).command).toEqual({ type: "menuKey" });
    t.handleKeyUp(ev("Space"));
    expect(t.handleKeyDown(ev("Space"), ctx({ documentActive: false })).command).toBeNull();
    expect(t.handleKeyDown(ev("Space"), ctx({ touchPlayEnabled: false })).command).toBeNull();
    expect(t.handleKeyDown(ev("KeyR"), ctx({ swipeActive: true })).command).toBeNull();
  });

  it("isDown follows bound keys (both slots) and clears on key up", () => {
    const t = tracker();
    t.handleKeyDown(ev("KeyA"), ctx());
    expect(t.isDown("left")).toBe(true);
    t.handleKeyUp(ev("KeyA"));
    expect(t.isDown("left")).toBe(false);
    t.handleKeyDown(ev("ShiftRight"), ctx());
    expect(t.isDown("power")).toBe(true);
  });

  it("installKeyboardListeners is window-bound, focus-independent, converts DOM events and disposes cleanly", () => {
    const handlers = new Map<string, Array<{ fn: (e: never) => void; capture: boolean }>>();
    const host: KeyboardHost = {
      addEventListener(type, fn, options) { const list = handlers.get(type) ?? []; list.push({ fn, capture: options === true || (typeof options === "object" && options.capture === true) }); handlers.set(type, list); },
      removeEventListener(type, fn) { handlers.set(type, (handlers.get(type) ?? []).filter((h) => h.fn !== fn)); },
    };
    const commands: string[] = [];
    let unlocked = 0;
    const t = tracker();
    const body = { tagName: "BODY" };
    const install = installKeyboardListeners({ host, body, tracker: t, getContext: () => ctx(), onCommand: (c) => commands.push(c.type), onUnlockAudio: () => { unlocked++; } });
    const fire = (type: string, event: Record<string, unknown>) => { for (const h of handlers.get(type) ?? []) h.fn(event as never); };
    let prevented = 0;
    // target = the body element: not "inside shell" check needed (body is always allowed)
    const domEvent = { code: "Space", key: " ", repeat: false, target: body, preventDefault: () => { prevented++; } };
    fire("keydown", domEvent);
    expect(commands).toEqual(["swing"]);
    expect(unlocked).toBe(1);
    expect(prevented).toBe(1);
    expect(handlers.get("keydown")?.some((h) => h.capture)).toBe(true);
    fire("blur", {});
    expect(t.isDown("hit")).toBe(false);
    install.dispose();
    fire("keydown", { ...domEvent, code: "KeyR" });
    expect(commands).toEqual(["swing"]);
  });

  it("describeKeyTarget reduces DOM targets to rule facts", () => {
    const body = {};
    expect(describeKeyTarget(null, body)).toEqual({ isBody: true, insideShell: true });
    expect(describeKeyTarget(body, body)).toMatchObject({ isBody: true });
    const outside = { tagName: "DIV", closest: () => null };
    expect(describeKeyTarget(outside, body)).toMatchObject({ isBody: false, insideShell: false, tagName: "DIV" });
    const inside = { tagName: "INPUT", isContentEditable: false, closest: () => ({}) };
    expect(describeKeyTarget(inside, body)).toMatchObject({ insideShell: true, tagName: "INPUT", isContentEditable: false });
  });
});

/* ---- gamepad ---- */

const gates = (patch: Partial<GamepadGates> = {}): GamepadGates => ({
  documentActive: true, overlayOpen: false, editableFocused: false, touchPlayEnabled: true, swipeActive: false, ...patch,
});
function pad(patch: { pressed?: number[]; axes?: number[]; index?: number; id?: string; mapping?: string; connected?: boolean } = {}): PadLike {
  const pressed = new Set(patch.pressed ?? []);
  return {
    index: patch.index ?? 0, id: patch.id ?? "Xbox 360 Controller (STANDARD GAMEPAD)", connected: patch.connected ?? true, mapping: patch.mapping ?? "standard",
    axes: patch.axes ?? [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.has(i), value: pressed.has(i) ? 1 : 0 })),
  };
}
const poller = () => createGamepadPoller(createBindingsStore());

describe("M-INPUT gamepad: pollController semantics", () => {
  it("reports status text and labels for none / unrecognized / connected (xbox and playstation)", () => {
    const p = poller();
    expect(p.poll([], gates())).toMatchObject({ status: "none", statusText: "Connect your controller, then press a controller button." });
    expect(p.poll([pad({ mapping: "" })], gates())).toMatchObject({ status: "unrecognized", statusText: "Controller layout not recognized. Try a USB connection in Chrome or Edge." });
    const xbox = p.poll([pad()], gates());
    expect(xbox).toMatchObject({ status: "connected", playStation: false, hitLabel: "A" });
    const ps = poller().poll([pad({ id: "054c-0ce6-DualSense Wireless Controller" })], gates());
    expect(ps).toMatchObject({ playStation: true, hitLabel: "CROSS" });
    expect(ps.statusText).toBe("Controller connected. Cross: hit. Use the mouse to select a match.");
    const mixed = poller().poll([pad({ id: "Xbox Wireless Controller (Vendor: 045e)" })], gates());
    expect(mixed.playStation).toBe(false);
  });

  it("requires neutral input first: a held button or deflected stick keeps play blocked", () => {
    const p = poller();
    expect(p.poll([pad({ pressed: [0] })], gates())).toMatchObject({ blocked: true, pressed: { hit: false } });
    expect(p.poll([pad({ pressed: [0] })], gates()).blocked).toBe(true);
    expect(p.poll([pad({ axes: [0.5, 0] })], gates()).blocked).toBe(true);
    expect(p.poll([pad()], gates()).blocked).toBe(false);
    const live = p.poll([pad({ pressed: [0] })], gates());
    expect(live.pressed.hit).toBe(true);
    expect(p.poll([pad({ pressed: [0] })], gates()).pressed.hit).toBe(false); // edge only
  });

  it("dead zone .18 and D-pad override produce the movement vector; power follows the bound button", () => {
    const p = poller();
    p.poll([pad()], gates());
    expect(p.poll([pad({ axes: [0.1, -0.18] })], gates())).toMatchObject({ x: 0, y: 0 });
    const half = p.poll([pad({ axes: [0.59, -1] })], gates());
    expect(half.x).toBeCloseTo((0.59 - 0.18) / 0.82, 12);
    expect(half.y).toBe(-1);
    expect(p.poll([pad({ axes: [-1, 0], pressed: [15] })], gates()).x).toBe(1);
    expect(p.poll([pad({ axes: [1, 1], pressed: [14, 15, 12] })], gates())).toMatchObject({ x: 0, y: -1 });
    expect(p.poll([pad({ pressed: [7] })], gates()).power).toBe(true);
    expect(p.poll([pad()], gates()).power).toBe(false);
  });

  it("press edges for hit/short/deep/lob follow the controller bindings and Menu/Start pauses", () => {
    const p = poller();
    p.poll([pad()], gates());
    expect(p.poll([pad({ pressed: [2] })], gates()).pressed).toEqual({ hit: false, short: true, deep: false, lob: false });
    expect(p.poll([pad({ pressed: [1, 3] })], gates()).pressed).toEqual({ hit: false, short: false, deep: true, lob: true });
    expect(p.poll([pad({ pressed: [9] })], gates()).pause).toBe(true);
    expect(p.poll([pad({ pressed: [9] })], gates()).pause).toBe(false);
  });

  it("gates (hidden document, work mode, overlay, text field) re-block; swipe and disabled touch-play drop movement but keep neutral tracking", () => {
    const p = poller();
    p.poll([pad()], gates());
    for (const g of [gates({ documentActive: false }), gates({ overlayOpen: true }), gates({ editableFocused: true })]) {
      const r = p.poll([pad({ pressed: [0] })], g);
      expect(r).toMatchObject({ blocked: true, pressed: { hit: false } });
      p.poll([pad()], gates()); // neutral again
    }
    const swipe = p.poll([pad({ axes: [1, 0], pressed: [0] })], gates({ swipeActive: true }));
    expect(swipe).toMatchObject({ x: 0, y: 0, pressed: { hit: false }, blocked: false });
    expect(p.poll([pad({ axes: [1, 0] })], gates({ touchPlayEnabled: false })).x).toBe(0);
  });

  it("losing a pad reports lost once and re-blocks; a different pad also re-blocks", () => {
    const p = poller();
    p.poll([pad()], gates());
    expect(p.poll([], gates())).toMatchObject({ lost: true, blocked: true, status: "none" });
    expect(p.poll([], gates()).lost).toBe(false);
    p.poll([pad()], gates());
    expect(p.poll([pad({ index: 1, id: "Other (STANDARD GAMEPAD)" }), pad()], gates()).index).toBe(0);
    // A different pad re-blocks; neutral input unblocks within the same poll, a held button keeps it blocked.
    expect(p.poll([pad({ index: 3, id: "Other (STANDARD GAMEPAD)" })], gates()).blocked).toBe(false);
    expect(p.poll([pad({ index: 4, id: "Third (STANDARD GAMEPAD)", pressed: [0] })], gates())).toMatchObject({ blocked: true, pressed: { hit: false } });
    expect(p.poll([pad({ connected: false })], gates()).status).toBe("none");
  });
});

/* ---- touch stick ---- */

describe("M-INPUT touch stick: pointer handlers in game.js", () => {
  it("fixed-origin virtual stick: dead zone, radius scaling, reversal and release", () => {
    const s = createTouchStick();
    expect(s.pointerDown({ pointerId: 7, x: 100, y: 100, now: 0, target: "canvas" })).toBe("started");
    s.pointerMove({ pointerId: 7, x: 105, y: 100 });
    expect(s.vector()).toEqual({ x: 0, y: 0 });
    expect(s.state.dragged).toBe(false);
    s.pointerMove({ pointerId: 7, x: 100 + TOUCH_DEAD_ZONE + (TOUCH_RADIUS - TOUCH_DEAD_ZONE) / 2, y: 100 });
    expect(s.vector().x).toBeCloseTo(0.5, 12);
    expect(s.state.dragged).toBe(true);
    s.pointerMove({ pointerId: 7, x: 100 + 500, y: 100 });
    expect(s.vector()).toEqual({ x: 1, y: 0 });
    s.pointerMove({ pointerId: 7, x: 100 - 500, y: 100 });
    expect(s.vector()).toEqual({ x: -1, y: 0 });
    s.pointerMove({ pointerId: 99, x: 100, y: 100 });
    expect(s.vector()).toEqual({ x: -1, y: 0 });
    expect(s.pointerUp({ pointerId: 7, x: 0, y: 100, now: 100, touchPlayEnabled: true }).tap).toBe(false);
    expect(s.vector()).toEqual({ x: 0, y: 0 });
    expect(s.state.pointerId).toBeNull();
  });

  it("taps swing: short, undragged, single-finger canvas touches only; second finger swings immediately", () => {
    const s = createTouchStick();
    s.pointerDown({ pointerId: 1, x: 50, y: 50, now: 1000, target: "canvas" });
    expect(s.pointerUp({ pointerId: 1, x: 52, y: 50, now: 1000 + TOUCH_TAP_MS, touchPlayEnabled: true }).tap).toBe(true);
    s.pointerDown({ pointerId: 1, x: 50, y: 50, now: 1000, target: "canvas" });
    expect(s.pointerUp({ pointerId: 1, x: 50, y: 50, now: 1000 + TOUCH_TAP_MS + 1, touchPlayEnabled: true }).tap).toBe(false);
    s.pointerDown({ pointerId: 1, x: 50, y: 50, now: 0, target: "canvas" });
    expect(s.pointerUp({ pointerId: 1, x: 50, y: 50, now: 10, touchPlayEnabled: false }).tap).toBe(false);
    s.pointerDown({ pointerId: 1, x: 50, y: 50, now: 0, target: "canvas" });
    expect(s.pointerDown({ pointerId: 2, x: 200, y: 50, now: 5, target: "canvas" })).toBe("second-finger-swing");
    expect(s.pointerUp({ pointerId: 1, x: 50, y: 50, now: 10, touchPlayEnabled: true }).tap).toBe(false);
    s.pointerDown({ pointerId: 3, x: 50, y: 50, now: 0, target: "canvas" });
    s.pointerMove({ pointerId: 3, x: 90, y: 50 });
    expect(s.pointerUp({ pointerId: 3, x: 90, y: 50, now: 10, touchPlayEnabled: true }).tap).toBe(false);
  });

  it("the on-screen joystick only starts when idle, uses its own radius, and never taps", () => {
    const s = createTouchStick();
    expect(s.pointerDown({ pointerId: 4, x: 100, y: 100, now: 0, target: "joystick", radius: 30 })).toBe("started");
    expect(s.pointerDown({ pointerId: 5, x: 100, y: 100, now: 0, target: "joystick" })).toBe("ignored");
    s.pointerMove({ pointerId: 4, x: 100, y: 100 + 40 });
    expect(s.vector().y).toBe(1);
    expect(s.pointerUp({ pointerId: 4, x: 100, y: 100, now: 10, touchPlayEnabled: true }).tap).toBe(false);
    s.pointerDown({ pointerId: 6, x: 0, y: 0, now: 0, target: "canvas" });
    s.cancel(6);
    expect(s.state.pointerId).toBeNull();
  });
});

/* ---- mapper ---- */

const sample = (patch: Partial<InputSample> & { down?: string[]; pressed?: string[] } = {}): InputSample => ({
  keysDown: new Set(patch.down ?? []), pressedThisFrame: new Set(patch.pressed ?? []), time: patch.time ?? 0,
  ...(patch.gamepad ? { gamepad: patch.gamepad } : {}), ...(patch.touchStick ? { touchStick: patch.touchStick } : {}), ...(patch.swipe !== undefined ? { swipe: patch.swipe } : {}),
});

describe("M-INPUT mapper: InputFrame production (game.js directionInput / readInput)", () => {
  it("keys produce axes, vertical aim and the power modifier; alternate keys count", () => {
    const m = createInputMapper();
    expect(m.frame(sample({ down: ["ArrowLeft"] }))).toMatchObject({ x: -1, y: 0, vertical: false, active: true, power: false });
    expect(m.frame(sample({ down: ["KeyD", "KeyW", "ShiftLeft"] }))).toMatchObject({ x: 1, y: -1, vertical: true, active: true, power: true });
    expect(m.frame(sample({ down: ["ArrowLeft", "ArrowRight"] }))).toMatchObject({ x: 0, active: true });
    expect(m.frame(sample())).toMatchObject({ x: 0, y: 0, vertical: false, active: false, power: false });
  });

  it("sums keyboard, touch stick and pad vectors with clamping; stick/pad |y| > .2 counts as vertical aim", () => {
    const m = createInputMapper();
    const f = m.frame(sample({ down: ["ArrowRight"], touchStick: { x: 0.8, y: 0.25 }, gamepad: { axes: [0.59, 0], buttons: [] } }));
    expect(f.x).toBe(1);
    expect(f).toMatchObject({ vertical: true, active: true });
    const small = m.frame(sample({ touchStick: { x: 0, y: 0.2 } }));
    expect(small.vertical).toBe(false);
    const padOnly = m.frame(sample({ gamepad: { axes: [0, 1], buttons: Array.from({ length: 17 }, (_, i) => i === 7) } }));
    expect(padOnly).toMatchObject({ y: 1, vertical: true, power: true });
  });

  it("swipe play, overlays and online-without-touch silence every device", () => {
    const m = createInputMapper();
    const s = sample({ down: ["ArrowLeft", "ShiftLeft"] });
    for (const ctx of [{ swipeActive: true }, { overlayOpen: true }, { online: true, touchPlayEnabled: false }]) {
      expect(m.frame(s, ctx)).toMatchObject({ x: 0, y: 0, vertical: false, active: false, power: false });
    }
    expect(m.frame(s, { online: true, touchPlayEnabled: true }).x).toBe(-1);
  });

  it("modern serve adds a unit-capped serve aim only when the player serves in the serve/toss phases", () => {
    const m = createInputMapper();
    const s = sample({ down: ["ArrowRight", "ArrowUp"] });
    const aim = m.frame(s, { modernServe: true, server: "player", phase: "serve" });
    expect(aim.serveAimX).toBeCloseTo(Math.SQRT1_2 * 1, 12);
    expect(aim.serveAimY).toBeCloseTo(-Math.SQRT1_2, 12);
    expect(m.frame(s, { modernServe: true, server: "player", phase: "serveToss" }).serveAimX).toBeDefined();
    expect(m.frame(s, { modernServe: false, server: "player", phase: "serve" }).serveAimX).toBeUndefined();
    expect(m.frame(s, { modernServe: true, server: "ai", phase: "serve" }).serveAimX).toBeUndefined();
    expect(m.frame(s, { modernServe: true, server: "player", phase: "rally" }).serveAimX).toBeUndefined();
    expect(m.frame(sample({ down: ["ArrowRight"] }), { modernServe: true, server: "player", phase: "serve" }).serveAimX).toBe(1);
  });

  it("strategic difficulties add placement aim (C) in rally for normal and deep shots only", () => {
    const m = createInputMapper();
    const base = { strategic: true, phase: "rally" };
    expect(m.frame(sample({ down: ["ArrowRight", "KeyC"] }), base).aimX).toBeCloseTo(0.64 / 0.72, 12);
    expect(m.frame(sample({ down: ["ArrowRight"] }), base).aimX).toBeUndefined();
    expect(m.frame(sample({ down: ["ArrowRight", "KeyC", "ArrowDown"] }), base).aimX).toBeUndefined(); // short
    expect(m.frame(sample({ down: ["ArrowRight", "KeyC", "ArrowUp"] }), base).aimX).toBeDefined(); // deep
    expect(m.frame(sample({ down: ["ArrowRight", "KeyC"] }), { ...base, playerSelectedShot: "lob" }).aimX).toBeUndefined();
    expect(m.frame(sample({ down: ["ArrowRight", "KeyC"] }), { ...base, playerSelectedShot: "short" }).aimX).toBeUndefined();
    expect(m.frame(sample({ down: ["KeyC"] }), base).aimX).toBeUndefined(); // needs left/right
    expect(m.frame(sample({ down: ["ArrowRight", "KeyC"] }), { ...base, strategic: false }).aimX).toBeUndefined();
    expect(m.frame(sample({ down: ["ArrowRight", "KeyC"] }), { ...base, practice: true }).aimX).toBeUndefined();
    expect(m.frame(sample({ down: ["ArrowRight", "KeyC"] }), { ...base, online: true }).aimX).toBeUndefined();
    m.touch.pointerDown({ pointerId: 1, x: 0, y: 0, now: 0, target: "canvas" });
    expect(m.frame(sample({ down: ["ArrowRight", "KeyC"] }), base).aimX).toBeUndefined(); // analog touch keeps usual range
  });

  it("rebinding changes the mapped keys and survives a reload through the injected storage", () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
    const m = createInputMapper({ storage });
    const next = { ...(m.getBindings("keyboard") as object), left: ["KeyJ", null], right: ["KeyL", null] };
    expect(m.applyBindings("keyboard", next as never)).toMatchObject({ ok: true, saved: true });
    expect(m.frame(sample({ down: ["KeyJ"] })).x).toBe(-1);
    expect(m.frame(sample({ down: ["ArrowLeft"] })).x).toBe(0);
    const reloaded = createInputMapper({ storage });
    expect(reloaded.frame(sample({ down: ["KeyL"] })).x).toBe(1);
    const bad = m.applyBindings("keyboard", { ...next, hit: ["KeyP", null] } as never);
    expect(bad.ok).toBe(false);
    expect(bad.errors[0]?.message).toBe("P is reserved for pause / options.");
  });

  it("commands() derives press-edge commands device-neutrally, honouring alternate keys and swipe", () => {
    const m = createInputMapper();
    const c = (patch: Parameters<typeof sample>[0], options?: Parameters<typeof m.commands>[1]) => m.commands(sample(patch), options);
    expect(c({ pressed: ["Space"], down: ["Space"] })).toEqual([{ type: "swing" }]);
    expect(c({ pressed: ["KeyR"], down: ["KeyR"] })).toEqual([{ type: "lobSwing" }]);
    expect(c({ pressed: ["KeyQ", "KeyE"], down: ["KeyQ", "KeyE"] })).toEqual([{ type: "selectShot", shot: "short" }, { type: "selectShot", shot: "deep" }]);
    expect(c({ pressed: ["KeyQ"], down: ["KeyQ"] }, { selectedShot: "short" })).toEqual([{ type: "selectShot", shot: "neutral" }]);
    expect(c({ pressed: ["KeyP"] })).toEqual([{ type: "pause" }]);
    expect(c({ pressed: ["Escape"] }, { fullscreen: true })).toEqual([]);
    expect(c({ pressed: ["KeyF"] })).toEqual([{ type: "fullscreen" }]);
    expect(c({ pressed: ["Space"], down: ["Space"] }, { touchPlayEnabled: false })).toEqual([]);
    expect(c({ pressed: ["Space"], down: ["Space"] }, { swipeActive: true })).toEqual([]);
    expect(c({ pressed: ["ShiftRight"], down: ["ShiftRight"] })).toEqual([]);
    const shot = { targetX: 0.1, targetDepth: 0.5, directionX: 0, directionY: 1, strength: 0.5 };
    expect(c({ swipe: shot }, { swipeActive: true })).toEqual([{ type: "swipeShot", shot }]);
    expect(c({ swipe: shot })).toEqual([]);
  });

  it("pollGamepad feeds the gated pad vector into frame() and returns ordered commands with sequential shot toggles", () => {
    const m = createInputMapper();
    m.pollGamepad([pad()], gates());
    const out = m.pollGamepad([pad({ axes: [0.59, -1], pressed: [2, 1, 3, 0, 7] })], gates(), { selectedShot: "neutral", intentionalLob: true });
    expect(out.commands).toEqual([
      { type: "selectShot", shot: "short" }, { type: "selectShot", shot: "deep" }, { type: "selectShot", shot: "lob" }, { type: "swing" },
    ]);
    const f = m.frame(sample());
    expect(f.x).toBeCloseTo((0.59 - 0.18) / 0.82, 12);
    expect(f).toMatchObject({ y: -1, power: true, vertical: true });
    const noLob = m.pollGamepad([pad({ pressed: [3] })], gates(), { intentionalLob: false });
    expect(noLob.commands).toEqual([]);
    const paused = m.pollGamepad([pad(), pad({ pressed: [9] })], gates());
    expect(paused.commands).toEqual([]);
    m.pollGamepad([pad()], gates());
    expect(m.pollGamepad([pad({ pressed: [9] })], gates()).commands).toEqual([{ type: "pause" }]);
    m.clearAll();
    expect(m.frame(sample())).toMatchObject({ x: 0, y: 0, power: false });
    expect(m.gamepad.state.blocked).toBe(true);
  });

  it("classifyGesture is exposed on the mapper and rebinding validation errors drop the input field", () => {
    const m = createInputMapper();
    expect(m.classifyGesture({ startX: 200, startY: 700, endX: 200, endY: 300, startTime: 0, endTime: 200, width: 400, height: 800 })).not.toBeNull();
    expect(m.classifyGesture({ startX: 200, startY: 700, endX: 200, endY: 705, startTime: 0, endTime: 200, width: 400, height: 800 })).toBeNull();
  });
});
