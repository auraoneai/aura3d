import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTROLS_STORAGE_KEY, DEFAULT_CONTROLLER_BINDINGS, DEFAULT_KEYBOARD_BINDINGS } from "../../../examples/aura-slam/contract/input";
import { createBindingsStore, labelInput, validateBindings, type StorageLike } from "../../../examples/aura-slam/input/bindings";

/** The original controls.js is loaded as DATA (UMD module.exports) so the port can be compared against it. */
function loadUmd(file: string): unknown {
  const mod: { exports: unknown } = { exports: {} };
  new Function("module", "exports", readFileSync(resolve(process.cwd(), file), "utf8"))(mod, mod.exports);
  return mod.exports;
}
interface OriginalControls {
  actions(device: string): unknown;
  defaults(device: string): unknown;
  getBindings(device: string): unknown;
  applyBindings(device: string, profile: unknown): unknown;
  actionForKey(code: unknown): unknown;
  isDown(action: string, keys: unknown): boolean;
  buttonFor(action: string): unknown;
  labelFor(action: string, device?: string, options?: unknown): string;
  subscribe(listener: (event: unknown) => void): () => void;
}
const original = loadUmd("apps/showcase-top-tennis/public/toptennis/controls.js") as {
  create(options: { storage?: StorageLike | null }): OriginalControls;
  validateBindings(device: string, profile: unknown): { valid: boolean; errors: unknown[] };
  labelInput(input: unknown, device?: string, options?: unknown): string;
};

class FakeStorage implements StorageLike {
  readonly data = new Map<string, string>();
  failWrites = false;
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { if (this.failWrites) throw new Error("quota"); this.data.set(key, value); }
}

const kb = (patch: Record<string, unknown> = {}) => ({ ...JSON.parse(JSON.stringify(DEFAULT_KEYBOARD_BINDINGS)), ...patch });
const cb = (patch: Record<string, unknown> = {}) => ({ ...DEFAULT_CONTROLLER_BINDINGS, ...patch });

const keyboardCandidates: unknown[] = [
  kb(), kb({ hit: ["Space", "KeyH"] }), kb({ hit: ["KeyP", null] }), kb({ hit: ["KeyF", null] }), kb({ hit: ["Digit1", "Numpad2"] }),
  kb({ hit: ["Space", "Space"] }), kb({ hit: ["", null] }), kb({ hit: [null, null] }), kb({ hit: ["Space"] }), kb({ hit: "Space" }),
  kb({ left: ["ArrowRight", null] }), kb({ extra: ["KeyZ", null] }), kb({ hit: ["Enter", null] }), kb({ hit: ["ShiftRight", "ShiftLeft"] }),
  kb({ hit: [undefined, null] }), kb({ hit: [5, null] }), kb({ hit: ["KeyA", null] }), kb({ hit: ["Escape", null] }), kb({ hit: ["Backquote", null] }),
  kb({ placement: ["KeyZ", "Digit0"], short: ["KeyX", "Numpad9"] }), kb({ hit: ["Keya", null] }), kb({ hit: ["Digit10", null] }),
  null, undefined, [], "x", 3, {}, (() => { const p = kb(); delete (p as Record<string, unknown>).deep; return p; })(),
];
const controllerCandidates: unknown[] = [
  cb(), cb({ hit: 1 }), cb({ hit: 8 }), cb({ hit: 9 }), cb({ hit: 10 }), cb({ hit: 11 }), cb({ hit: 12 }), cb({ hit: 3.5 }), cb({ hit: -1 }), cb({ hit: "0" }),
  cb({ hit: null }), cb({ hit: 2 }), { ...cb(), extra: 1 }, (() => { const p = cb(); delete (p as Record<string, unknown>).lob; return p; })(), cb({ power: 0, hit: 7, short: 1, deep: 2, lob: 3 }),
  null, undefined, [], 5,
];

describe("M-INPUT bindings: differential against controls.js", () => {
  it("validateBindings agrees on every keyboard candidate (valid flag and every error string)", () => {
    for (const candidate of keyboardCandidates) {
      expect(validateBindings("keyboard", candidate)).toEqual(original.validateBindings("keyboard", candidate));
    }
  });
  it("validateBindings agrees on every controller candidate", () => {
    for (const candidate of controllerCandidates) {
      expect(validateBindings("controller", candidate)).toEqual(original.validateBindings("controller", candidate));
    }
  });
  it("validateBindings agrees on unknown devices", () => {
    for (const device of ["gamepad", "", "toString", "constructor"]) {
      expect(validateBindings(device, kb())).toEqual(original.validateBindings(device, kb()));
    }
  });
  it("labelInput agrees over keyboard codes and controller buttons (xbox and playstation)", () => {
    const codes: unknown[] = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "ShiftLeft", "ShiftRight", "KeyQ", "Digit4", "Numpad7", "Enter", "", null, undefined, 4, "Bad"];
    for (const code of codes) expect(labelInput(code, "keyboard")).toBe(original.labelInput(code, "keyboard"));
    for (let button = -1; button <= 20; button++) {
      expect(labelInput(button, "controller")).toBe(original.labelInput(button, "controller"));
      expect(labelInput(button, "controller", { playStation: true })).toBe(original.labelInput(button, "controller", { playStation: true }));
    }
    expect(labelInput(null, "controller")).toBe(original.labelInput(null, "controller"));
  });

  it("a fresh store matches the original defaults, actions, labels, key lookups and button lookups", () => {
    const port = createBindingsStore({ storage: new FakeStorage() });
    const orig = original.create({ storage: new FakeStorage() });
    for (const device of ["keyboard", "controller", "other"]) {
      expect(port.getBindings(device)).toEqual(orig.getBindings(device));
      expect(port.defaults(device)).toEqual(orig.defaults(device));
      expect(port.actions(device)).toEqual(orig.actions(device));
    }
    const allActions = ["left", "right", "up", "down", "hit", "power", "short", "deep", "lob", "placement", "nope", "constructor"];
    for (const action of allActions) {
      expect(port.buttonFor(action)).toBe(orig.buttonFor(action));
      for (const device of ["keyboard", "controller", "other"] as const) {
        expect(port.labelFor(action, device as "keyboard")).toBe(orig.labelFor(action, device));
        expect(port.labelFor(action, device as "keyboard", { all: true })).toBe(orig.labelFor(action, device, { all: true }));
      }
    }
    const codes = ["ArrowLeft", "KeyA", "Space", "ShiftRight", "KeyR", "KeyC", "KeyZ", 5, null, undefined];
    for (const code of codes) expect(port.actionForKey(code)).toBe(orig.actionForKey(code));
    const keys = { KeyA: true, ShiftRight: true, Space: false };
    for (const action of allActions) expect(port.isDown(action, keys)).toBe(orig.isDown(action, keys));
    expect(port.isDown("left", undefined)).toBe(orig.isDown("left", undefined));
  });

  it("applyBindings: same results, same persisted JSON, same restore on the next load, same listener events", () => {
    const portStorage = new FakeStorage();
    const origStorage = new FakeStorage();
    const port = createBindingsStore({ storage: portStorage });
    const orig = original.create({ storage: origStorage });
    const portEvents: unknown[] = [];
    const origEvents: unknown[] = [];
    port.subscribe((e) => portEvents.push(e));
    orig.subscribe((e) => origEvents.push(e));
    const attempts: Array<[string, unknown]> = [
      ["keyboard", kb({ hit: ["KeyH", "KeyJ"], lob: ["KeyL", null] })],
      ["keyboard", kb({ hit: ["KeyP", null] })],
      ["controller", cb({ hit: 1, deep: 0 })],
      ["controller", cb({ hit: 9 })],
      ["gamepad", cb()],
    ];
    for (const [device, profile] of attempts) {
      expect(port.applyBindings(device, profile)).toEqual(orig.applyBindings(device, profile));
    }
    expect(portEvents).toEqual(origEvents);
    expect(portStorage.data.get(CONTROLS_STORAGE_KEY)).toBe(origStorage.data.get(CONTROLS_STORAGE_KEY));
    expect(port.getBindings("keyboard")).toEqual(orig.getBindings("keyboard"));
    const reloadedPort = createBindingsStore({ storage: portStorage });
    const reloadedOrig = original.create({ storage: origStorage });
    for (const device of ["keyboard", "controller"]) expect(reloadedPort.getBindings(device)).toEqual(reloadedOrig.getBindings(device));
  });

  it("corrupt, wrong-version and invalid stored profiles fall back per device exactly like the original", () => {
    const stored = [
      "not json", JSON.stringify({ version: 2, keyboard: kb(), controller: cb() }),
      JSON.stringify({ version: 1, keyboard: kb({ hit: ["KeyP", null] }), controller: cb({ hit: 1, deep: 0 }) }),
      JSON.stringify({ version: 1, keyboard: kb({ hit: ["KeyH", null] }) }), JSON.stringify(null), "", JSON.stringify([]),
    ];
    for (const raw of stored) {
      const s1 = new FakeStorage(); s1.data.set(CONTROLS_STORAGE_KEY, raw);
      const s2 = new FakeStorage(); s2.data.set(CONTROLS_STORAGE_KEY, raw);
      const port = createBindingsStore({ storage: s1 });
      const orig = original.create({ storage: s2 });
      for (const device of ["keyboard", "controller"]) expect(port.getBindings(device)).toEqual(orig.getBindings(device));
    }
  });

  it("storage failures never throw: unavailable storage and failing writes report saved=false like the original", () => {
    const failing = new FakeStorage(); failing.failWrites = true;
    const port = createBindingsStore({ storage: failing });
    const orig = original.create({ storage: (() => { const s = new FakeStorage(); s.failWrites = true; return s; })() });
    expect(port.applyBindings("keyboard", kb({ hit: ["KeyH", null] }))).toEqual(orig.applyBindings("keyboard", kb({ hit: ["KeyH", null] })));
    const none = createBindingsStore();
    expect(none.applyBindings("controller", cb({ hit: 1, deep: 0 })).saved).toBe(false);
    const readOnly = createBindingsStore({ storage: { getItem: () => null } });
    expect(readOnly.applyBindings("controller", cb({ hit: 1, deep: 0 })).saved).toBe(false);
    const blocked = { getItem(): string | null { throw new Error("blocked"); } };
    expect(createBindingsStore({ storage: blocked }).getBindings("keyboard")).toEqual(original.create({ storage: blocked }).getBindings("keyboard"));
  });

  it("bindings are defensively copied in and out, and a throwing listener does not break others", () => {
    const store = createBindingsStore({ storage: new FakeStorage() });
    const out = store.getBindings("keyboard") as unknown as Record<string, string[]>;
    (out.hit as string[])[0] = "KeyZ";
    expect((store.getBindings("keyboard") as unknown as Record<string, string[]>).hit?.[0]).toBe("Space");
    const seen: unknown[] = [];
    store.subscribe(() => { throw new Error("listener"); });
    const unsubscribe = store.subscribe((e) => seen.push(e));
    expect(store.applyBindings("controller", cb({ hit: 1, deep: 0 })).ok).toBe(true);
    expect(seen).toHaveLength(1);
    unsubscribe();
    store.applyBindings("controller", cb());
    expect(seen).toHaveLength(1);
    expect(store.subscribe(undefined as never)()).toBeUndefined();
  });
});
