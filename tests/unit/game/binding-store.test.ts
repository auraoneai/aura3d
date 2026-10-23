import { describe, expect, it } from "vitest";
import { DEFAULT_CONTROLLER_BINDINGS, DEFAULT_KEYBOARD_BINDINGS } from "../../../examples/aura-slam/contract/input";
import { ACTION_DEFINITIONS, createBindingsStore } from "../../../examples/aura-slam/input/bindings";
import { createBindingStore, type BindingStorage, type BindingStoreOptions } from "../../../packages/game/src/input/bindingStore";

class FakeStorage implements BindingStorage {
  readonly data = new Map<string, string>();
  failWrites = false;
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { if (this.failWrites) throw new Error("quota"); this.data.set(key, value); }
}

const xbox = ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "View / Back", "Menu / Start", "Left stick click", "Right stick click", "D-pad up", "D-pad down", "D-pad left", "D-pad right", "Home"];
const playStation = ["Cross", "Circle", "Square", "Triangle", "L1", "R1", "L2", "R2", "Share", "Options", "L3", "R3", "D-pad up", "D-pad down", "D-pad left", "D-pad right", "PS"];

function tennisOptions(storage: BindingStorage): BindingStoreOptions {
  return {
    storageKey: "baseline.controls.v1", version: 1, storage,
    devices: {
      keyboard: {
        kind: "keys", actions: ACTION_DEFINITIONS.keyboard, defaults: DEFAULT_KEYBOARD_BINDINGS as never,
        reserved: { KeyP: "P is reserved for pause / options.", KeyF: "F is reserved for fullscreen." },
        namedKeys: { ArrowLeft: "Left arrow", ArrowRight: "Right arrow", ArrowUp: "Up arrow", ArrowDown: "Down arrow", Space: "Space", ShiftLeft: "Left Shift", ShiftRight: "Right Shift" },
      },
      controller: {
        kind: "buttons", actions: ACTION_DEFINITIONS.controller, defaults: DEFAULT_CONTROLLER_BINDINGS as never,
        allowedButton: (i) => (i >= 0 && i <= 7) || i === 10 || i === 11, buttonNames: { default: xbox, playStation },
      },
    },
  };
}

const kb = (patch: Record<string, unknown> = {}) => ({ ...JSON.parse(JSON.stringify(DEFAULT_KEYBOARD_BINDINGS)), ...patch });
const cb = (patch: Record<string, unknown> = {}) => ({ ...DEFAULT_CONTROLLER_BINDINGS, ...patch });

describe("createBindingStore (game kit): equivalent to the Aura Slam controls store when configured for it", () => {
  const keyboardCandidates: unknown[] = [
    kb(), kb({ hit: ["Space", "KeyH"] }), kb({ hit: ["KeyP", null] }), kb({ hit: ["KeyF", null] }), kb({ hit: ["Digit1", "Numpad2"] }), kb({ hit: ["Space", "Space"] }),
    kb({ hit: ["", null] }), kb({ hit: [null, null] }), kb({ hit: ["Space"] }), kb({ hit: "Space" }), kb({ left: ["ArrowRight", null] }), kb({ extra: ["KeyZ", null] }),
    kb({ hit: ["Enter", null] }), kb({ hit: [5, null] }), kb({ hit: ["Keya", null] }), null, undefined, [], "x", {},
  ];
  const controllerCandidates: unknown[] = [cb(), cb({ hit: 1, deep: 0 }), cb({ hit: 8 }), cb({ hit: 9 }), cb({ hit: 10 }), cb({ hit: 3.5 }), cb({ hit: "0" }), cb({ hit: null }), { ...cb(), extra: 1 }, null, []];

  it("validates identically (valid flag and every error string)", () => {
    const lib = createBindingStore(tennisOptions(new FakeStorage()));
    const port = createBindingsStore({ storage: new FakeStorage() });
    for (const c of keyboardCandidates) expect(lib.validate("keyboard", c)).toEqual(port.validateBindings("keyboard", c));
    for (const c of controllerCandidates) expect(lib.validate("controller", c)).toEqual(port.validateBindings("controller", c));
    expect(lib.validate("nope", kb())).toEqual(port.validateBindings("nope", kb()));
  });

  it("defaults, actions, labels, lookups and button lookups agree", () => {
    const lib = createBindingStore(tennisOptions(new FakeStorage()));
    const port = createBindingsStore({ storage: new FakeStorage() });
    for (const device of ["keyboard", "controller", "other"]) {
      expect(lib.getBindings(device)).toEqual(port.getBindings(device));
      expect(lib.defaults(device)).toEqual(port.defaults(device));
      expect(lib.actions(device)).toEqual(port.actions(device));
    }
    const actions = ["left", "right", "up", "down", "hit", "power", "short", "deep", "lob", "placement", "nope"];
    for (const a of actions) {
      expect(lib.buttonFor(a)).toBe(port.buttonFor(a));
      expect(lib.labelFor(a)).toBe(port.labelFor(a));
      expect(lib.labelFor(a, "keyboard", { all: true })).toBe(port.labelFor(a, "keyboard", { all: true }));
      expect(lib.labelFor(a, "controller")).toBe(port.labelFor(a, "controller"));
      expect(lib.labelFor(a, "controller", { variant: "playStation" })).toBe(port.labelFor(a, "controller", { playStation: true }));
    }
    for (const code of ["ArrowLeft", "KeyA", "Space", "ShiftRight", "KeyR", "KeyZ", 5, null, undefined]) expect(lib.actionForKey(code)).toBe(port.actionForKey(code));
    const keys = { KeyA: true, ShiftRight: true, Space: false };
    for (const a of actions) expect(lib.isDown(a, keys)).toBe(port.isDown(a, keys));
    for (let i = -1; i <= 20; i++) expect(lib.labelInput(i, "controller")).toBe(port.labelInput(i, "controller"));
  });

  it("apply persists the same JSON, notifies the same events and restores per device on reload", () => {
    const s1 = new FakeStorage(), s2 = new FakeStorage();
    const lib = createBindingStore(tennisOptions(s1));
    const port = createBindingsStore({ storage: s2 });
    const e1: unknown[] = [], e2: unknown[] = [];
    lib.subscribe((e) => e1.push(e)); port.subscribe((e) => e2.push(e));
    for (const [device, profile] of [["keyboard", kb({ hit: ["KeyH", "KeyJ"] })], ["keyboard", kb({ hit: ["KeyP", null] })], ["controller", cb({ hit: 1, deep: 0 })], ["gamepad", cb()]] as const) {
      expect(lib.apply(device, profile)).toEqual(port.applyBindings(device, profile));
    }
    expect(e1).toEqual(e2);
    expect(s1.data.get("baseline.controls.v1")).toBe(s2.data.get("baseline.controls.v1"));
    const reloaded = createBindingStore(tennisOptions(s1));
    const reloadedPort = createBindingsStore({ storage: s2 });
    for (const d of ["keyboard", "controller"]) expect(reloaded.getBindings(d)).toEqual(reloadedPort.getBindings(d));
    for (const raw of ["junk", JSON.stringify({ version: 2, keyboard: kb(), controller: cb() }), JSON.stringify({ version: 1, keyboard: kb({ hit: ["KeyP", null] }), controller: cb({ hit: 1, deep: 0 }) })]) {
      const a = new FakeStorage(), b = new FakeStorage(); a.data.set("baseline.controls.v1", raw); b.data.set("baseline.controls.v1", raw);
      const l = createBindingStore(tennisOptions(a)), p = createBindingsStore({ storage: b });
      for (const d of ["keyboard", "controller"]) expect(l.getBindings(d)).toEqual(p.getBindings(d));
    }
  });

  it("storage failures never throw and report saved=false", () => {
    const failing = new FakeStorage(); failing.failWrites = true;
    expect(createBindingStore(tennisOptions(failing)).apply("controller", cb({ hit: 1, deep: 0 })).saved).toBe(false);
    expect(createBindingStore({ ...tennisOptions(new FakeStorage()), storage: null }).apply("controller", cb({ hit: 1, deep: 0 })).saved).toBe(false);
    const blocked = { getItem(): string | null { throw new Error("blocked"); } };
    expect(createBindingStore({ ...tennisOptions(blocked), storage: blocked }).getBindings("keyboard")).toEqual(createBindingsStore({ storage: blocked }).getBindings("keyboard"));
  });

  it("works for any other game: custom actions, single keyboard device, custom reserved keys and button rules", () => {
    const store = createBindingStore({
      storageKey: "my.game.v3", version: 3, storage: new FakeStorage(),
      devices: {
        keys: { kind: "keys", actions: [{ id: "jump", label: "Jump" }, { id: "dash", label: "Dash" }], defaults: { jump: ["Space", null], dash: ["KeyX", "ShiftLeft"] }, reserved: { Escape: "Esc is reserved." }, namedKeys: { Space: "Space", ShiftLeft: "Shift", Escape: "Esc" } },
        pad: { kind: "buttons", actions: [{ id: "jump", label: "Jump" }], defaults: { jump: 0 }, allowedButton: (i) => i < 4 },
      },
    });
    expect(store.devices()).toEqual(["keys", "pad"]);
    expect(store.actionForKey("ShiftLeft")).toBe("dash");
    expect(store.isDown("dash", { ShiftLeft: true })).toBe(true);
    expect(store.buttonFor("jump")).toBe(0);
    expect(store.labelFor("dash", "keys", { all: true })).toBe("X / Shift");
    expect(store.apply("keys", { jump: ["Escape", null], dash: ["KeyX", null] }).errors[0]?.message).toBe("Esc is reserved.");
    expect(store.apply("keys", { jump: ["KeyX", null], dash: ["KeyX", null] }).errors[0]?.message).toBe("X is already assigned to Jump.");
    expect(store.apply("pad", { jump: 7 }).ok).toBe(false);
    expect(store.apply("keys", { jump: ["KeyJ", null], dash: ["KeyK", "KeyL"] })).toMatchObject({ ok: true, saved: true });
    expect(store.actionForKey("KeyL")).toBe("dash");
    expect(store.getBindings("keys")).toEqual({ jump: ["KeyJ", null], dash: ["KeyK", "KeyL"] });
    expect(store.getBindings("missing")).toBeNull();
    expect(store.actionForKey("KeyJ", "missing")).toBeNull();
  });
});
