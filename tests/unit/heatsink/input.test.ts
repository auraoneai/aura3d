import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInputs, type InputCallbacks } from "../../../apps/showcase-heatsink/src/input";
import type { SimInput } from "../../../apps/showcase-heatsink/src/sim";

// Node has EventTarget but no DOM: a minimal window and document are enough for the keyboard and focus paths.
type KeyInit = { code: string; repeat?: boolean };
let win: EventTarget & { matchMedia?: (q: string) => { matches: boolean } };
let doc: EventTarget & { visibilityState: string };

function key(type: "keydown" | "keyup", init: KeyInit): Event {
  const ev = new Event(type, { cancelable: true });
  Object.assign(ev, { code: init.code, repeat: init.repeat ?? false, metaKey: false, ctrlKey: false, altKey: false });
  win.dispatchEvent(ev);
  return ev;
}

function callbacks(): InputCallbacks & Record<string, ReturnType<typeof vi.fn>> {
  return {
    stage: null,
    touchRoot: null,
    onAction: vi.fn(),
    onStart: vi.fn(),
    onConfirm: vi.fn(),
    onRestart: vi.fn(),
    onToggleAutopilot: vi.fn(),
    onToggleMute: vi.fn(),
    onDrone: vi.fn(),
    onGesture: vi.fn()
  } as InputCallbacks & Record<string, ReturnType<typeof vi.fn>>;
}

describe("heatsink input (C5, C14)", () => {
  beforeEach(() => {
    win = Object.assign(new EventTarget(), { matchMedia: () => ({ matches: false }) });
    doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
    vi.stubGlobal("window", win);
    vi.stubGlobal("document", doc);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("cancels the default action of Space, Enter and the arrows so a focused button is never re-clicked", () => {
    createInputs(callbacks());
    for (const code of ["Space", "Enter", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
      expect(key("keydown", { code }).defaultPrevented, code).toBe(true);
      key("keyup", { code });
    }
    expect(key("keydown", { code: "KeyQ" }).defaultPrevented).toBe(false);
  });

  it("clears held keys when the window loses focus", () => {
    const inputs = createInputs(callbacks());
    const out: SimInput = { steer: 0, pitch: 0, boost: false, fire: false };
    key("keydown", { code: "ArrowLeft" });
    key("keydown", { code: "ShiftLeft" });
    key("keydown", { code: "Space" });
    inputs.read(out);
    expect(out).toEqual({ steer: -1, pitch: 0, boost: true, fire: true });
    win.dispatchEvent(new Event("blur"));
    inputs.read(out);
    expect(out).toEqual({ steer: 0, pitch: 0, boost: false, fire: false });
  });

  it("clears held keys when the page is hidden", () => {
    const inputs = createInputs(callbacks());
    const out: SimInput = { steer: 0, pitch: 0, boost: false, fire: false };
    key("keydown", { code: "KeyD" });
    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    inputs.read(out);
    expect(out.steer).toBe(0);
  });

  it("restarts on N, which does not clash with R (barrel roll)", () => {
    const cb = callbacks();
    createInputs(cb);
    key("keydown", { code: "KeyR" });
    key("keydown", { code: "KeyN" });
    expect(cb.onAction).toHaveBeenCalledWith("roll");
    expect(cb.onRestart).toHaveBeenCalledTimes(1);
  });
});
