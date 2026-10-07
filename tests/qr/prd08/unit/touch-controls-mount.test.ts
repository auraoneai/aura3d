/**
 * I-1..I-5: `mountTouchControls` DOM overlay + `createGameInput` touch device,
 * activeDevice tracking, prompt() labels, per-action bufferMs + consume.
 * Runs under node vitest with a minimal fake DOM (repo has no jsdom).
 */
import { describe, expect, it } from "vitest";
import { createGameInput, createGameTouchControlLayout } from "../../../../packages/engine/src/agent-api/GameRuntime.js";
import { mountTouchControls } from "../../../../packages/engine/src/agent-api/controls/TouchControls.js";

class FakeEl {
  readonly tagName = "div";
  readonly children: FakeEl[] = [];
  className = "";
  textContent = "";
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  private attrs: Record<string, string> = {};
  private listeners = new Map<string, ((e: unknown) => void)[]>();
  parentElement: FakeEl | null = null;
  setPointerCaptureCalls = 0;
  setAttribute(n: string, v: string) { this.attrs[n] = v; }
  getAttribute(n: string) { return this.attrs[n]; }
  addEventListener(t: string, cb: (e: unknown) => void) { this.listeners.set(t, [...(this.listeners.get(t) ?? []), cb]); }
  removeEventListener(t: string, cb: (e: unknown) => void) { this.listeners.set(t, (this.listeners.get(t) ?? []).filter((l) => l !== cb)); }
  dispatch(t: string, e: Record<string, unknown>) { for (const cb of this.listeners.get(t) ?? []) cb(e); }
  appendChild(c: FakeEl) { c.parentElement = this; this.children.push(c); return c; }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((c) => c !== this); }
  contains(n: unknown) { return this.children.includes(n as FakeEl); }
  setPointerCapture() { this.setPointerCaptureCalls += 1; }
}

class FakeDocument {
  readonly body = new FakeEl();
  createElement() { return new FakeEl(); }
}

const fakeDoc = () => new FakeDocument() as unknown as Document;

const layout = () =>
  createGameTouchControlLayout({
    width: 800,
    height: 400,
    buttons: [{ action: "jump", label: "Jump", binding: "TouchJump" }]
  });

describe("I-1 mountTouchControls", () => {
  it("creates one element per region with aria-label and >=48px size", () => {
    const input = createGameInput({ actions: { jump: ["TouchJump"] } });
    const mounted = mountTouchControls(undefined, input, layout(), { document: fakeDoc(), autoHide: false });
    const regions = (mounted.el as unknown as FakeEl).children;
    expect(regions.length).toBeGreaterThanOrEqual(2); // stick + jump
    for (const r of regions) {
      expect(r.getAttribute("aria-label")).toBeTruthy();
      expect(parseInt(r.style.width)).toBeGreaterThanOrEqual(48);
    }
    mounted.dispose();
  });

  it("button pointerdown/up presses and releases the binding (pointer capture)", () => {
    const input = createGameInput({ actions: { jump: ["TouchJump"] } });
    const mounted = mountTouchControls(undefined, input, layout(), { document: fakeDoc(), autoHide: false });
    const jump = (mounted.el as unknown as FakeEl).children.find((c) => c.dataset.touchBinding === "TouchJump")!;
    jump.dispatch("pointerdown", { pointerId: 7, clientX: 0, clientY: 0 });
    expect(input.held("jump")).toBe(true);
    expect(jump.setPointerCaptureCalls).toBe(1);
    jump.dispatch("pointerup", { pointerId: 7 });
    expect(input.held("jump")).toBe(false);
    mounted.dispose();
  });

  it("stick pointer drag publishes move axis values", () => {
    const input = createGameInput({ actions: {} });
    const mounted = mountTouchControls(undefined, input, layout(), { document: fakeDoc(), autoHide: false });
    const stick = (mounted.el as unknown as FakeEl).children.find((c) => c.dataset.touchBinding === "TouchStickMove")!;
    const cx = 76 * 1.02; // layout move stick center ≈ margin+radius (scale ≈ 400/720→0.72.. clamp)
    void cx;
    stick.dispatch("pointerdown", { pointerId: 1, clientX: 100, clientY: 300 });
    stick.dispatch("pointermove", { pointerId: 1, clientX: 140, clientY: 300 });
    expect(Math.abs(input.axis("move:x"))).toBeGreaterThan(0.05);
    stick.dispatch("pointerup", { pointerId: 1, clientX: 140, clientY: 300 });
    expect(Math.abs(input.axis("move:x"))).toBeLessThan(0.001);
    mounted.dispose();
  });

  it("I-4: autoHide shows on touchstart and hides on keydown (window)", () => {
    const win = globalThis.window;
    const had = win !== undefined;
    const listeners = new Map<string, ((e: unknown) => void)[]>();
    (globalThis as Record<string, unknown>).window = {
      addEventListener: (t: string, cb: (e: unknown) => void) => listeners.set(t, [...(listeners.get(t) ?? []), cb]),
      removeEventListener: () => {}
    } as unknown as Window;
    try {
      const input = createGameInput({ actions: { jump: ["TouchJump"] }, autoListen: false });
      const mounted = mountTouchControls(undefined, input, layout(), { document: fakeDoc() });
      expect(mounted.visible()).toBe(false);
      for (const cb of listeners.get("touchstart") ?? []) cb({ type: "touchstart", touches: [] });
      expect(mounted.visible()).toBe(true);
      for (const cb of listeners.get("keydown") ?? []) cb({ type: "keydown", target: {} });
      expect(mounted.visible()).toBe(false);
      mounted.dispose();
    } finally {
      if (!had) delete (globalThis as Record<string, unknown>).window;
      else (globalThis as Record<string, unknown>).window = win;
    }
  });
});

describe("I-2/I-3/I-5 createGameInput touch device + prompts", () => {
  it("touch port presses bindings and marks activeDevice touch", () => {
    const input = createGameInput({ actions: { jump: ["Space", "GamepadA", "touch:jump"] }, autoListen: false });
    input.touch.press("touch:jump");
    input.update(1 / 60);
    expect(input.held("jump")).toBe(true);
    expect(input.activeDevice()).toBe("touch");
    input.touch.release("touch:jump");
  });

  it("prompt() returns device-appropriate label (Space / A / Jump)", () => {
    const input = createGameInput({
      actions: { jump: ["Space", "GamepadA", "touch:jump"] },
      autoListen: false
    });
    input.touch.press("touch:jump");
    input.update(1 / 60);
    expect(input.prompt("jump")).toBe("Jump");
    expect(input.prompt("jump", "keyboard")).toBe("Space");
    expect(input.prompt("jump", "gamepad")).toBe("A");
  });

  it("I-5: per-action bufferMs; consume clears the buffered press", () => {
    const input = createGameInput({
      actions: { jump: ["TouchJump"], attack: ["TouchAttack"], other: ["TouchOther"] },
      bufferMs: { jump: 130, attack: 150 },
      autoListen: false
    });
    input.touch.press("TouchJump");
    input.update(1 / 60);
    input.touch.release("TouchJump");
    expect(input.buffered("jump")).toBe(true);
    expect(input.consume("jump")).toBe(true);
    expect(input.buffered("jump")).toBe(false);
    expect(input.buffered("attack", 150)).toBe(false);
    // record defaults fall back to 120 for unlisted actions
    input.touch.press("TouchOther");
    input.update(1 / 60);
    expect(input.buffered("other", 120)).toBe(true);
  });
});
