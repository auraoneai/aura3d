/**
 * FC-06 (audit live-games-4.5.0, handoff g07 -> e4): `mountTouchControls`
 * looked up `preset.rects["stick"/"rstick"]`, but `createTouchLayoutPreset`
 * names those rects `leftStick`/`rightStick`, so no stick ever mounted
 * (`evidence().sticks` was `[]` in every Aura Hoops 3D run).
 */
import { describe, expect, it } from "vitest";
import { mountTouchControls } from "../../../packages/game/src/touch/TouchControls.js";
import type { HudDocument, HudElement, HudRect } from "../../../packages/game/src/hud/dom.js";

class FakeEl implements HudElement {
  tagName: string;
  className = "";
  textContent: string | null = "";
  innerHTML = "";
  readonly style: Record<string, string> = {};
  readonly dataset: Record<string, string> = {};
  children: FakeEl[] = [];
  listeners = new Map<string, Set<(ev: unknown) => void>>();
  attrs = new Map<string, string>();
  parent: FakeEl | null = null;
  rect: HudRect = { left: 0, top: 0, width: 0, height: 0 };
  private readonly classes = new Set<string>();
  constructor(tag: string) { this.tagName = tag.toUpperCase(); }
  get classList() {
    const cs = this.classes;
    return {
      add: (...n: string[]) => n.forEach((c) => cs.add(c)),
      remove: (...n: string[]) => n.forEach((c) => cs.delete(c)),
      toggle: (n: string, force?: boolean) => { (force ?? !cs.has(n)) ? cs.add(n) : cs.delete(n); },
      contains: (n: string) => cs.has(n)
    };
  }
  appendChild(c: HudElement): void { const f = c as FakeEl; f.parent = this; this.children.push(f); }
  removeChild(c: HudElement): void { const i = this.children.indexOf(c as FakeEl); if (i >= 0) this.children.splice(i, 1); }
  remove(): void { this.parent?.removeChild(this); }
  setAttribute(n: string, v: string): void { this.attrs.set(n, v); }
  getAttribute(n: string): string | null { return this.attrs.get(n) ?? null; }
  addEventListener(t: string, cb: (ev: unknown) => void): void {
    (this.listeners.get(t) ?? this.listeners.set(t, new Set()).get(t)!).add(cb);
  }
  removeEventListener(t: string, cb: (ev: unknown) => void): void { this.listeners.get(t)?.delete(cb); }
  getBoundingClientRect(): HudRect { return this.rect; }
  emit(t: string, ev: unknown = {}): void { this.listeners.get(t)?.forEach((cb) => cb(ev)); }
}
class FakeDoc implements HudDocument {
  body = new FakeEl("body");
  createElement(tag: string): HudElement { return new FakeEl(tag); }
  createTextNode(text: string): HudElement { const e = new FakeEl("text"); e.textContent = text; return e; }
}

function setup(preset: Parameters<typeof mountTouchControls>[1]["preset"], bindings: Record<string, string>) {
  const doc = new FakeDoc();
  const root = doc.createElement("div") as FakeEl;
  doc.body.appendChild(root);
  const actions = new Map<string, boolean>();
  const input = {
    press: () => {},
    release: () => {},
    setAction: (a: string, held: boolean) => { actions.set(a, held); }
  };
  const tc = mountTouchControls(input, { preset, bindings, show: true }, { doc, root, viewport: { width: 390, height: 844 } });
  const host = root.children[0]!;
  const control = (name: string) => host.children.find((c) => c.dataset.control === name);
  return { tc, actions, control };
}

// The Aura FC 3D / Aura Hoops 3D binding set (dpad-4btn = fight genre).
const FIGHT_BINDINGS = {
  "stick.left": "left", "stick.right": "right", "stick.up": "up", "stick.down": "down",
  left: "left", right: "right", light: "shoot"
};

describe("mountTouchControls sticks (FC-06)", () => {
  it("mounts the left stick from the layout's leftStick rect", () => {
    const { tc, control } = setup("dpad-4btn", FIGHT_BINDINGS);
    expect(tc.evidence().sticks).toEqual(["stick"]);
    expect(tc.evidence().bound).toContain("stick");
    const stick = control("stick")!;
    expect(stick).toBeDefined();
    expect(stick.className).toContain("a3g-tc-stick");
    // fight leftStick rect: { x: 0.04, y: 0.78, w: 0.21, h: 0.15 }
    expect(parseFloat(stick.style.left!)).toBeCloseTo(4, 5);
    expect(parseFloat(stick.style.top!)).toBeCloseTo(78, 5);
    expect(parseFloat(stick.style.width!)).toBeCloseTo(21, 5);
    tc.dispose();
  });

  it("drives the bound direction actions from a drag and releases them", () => {
    const { tc, actions, control } = setup("dpad-4btn", FIGHT_BINDINGS);
    const stick = control("stick")!;
    // Zone is 0.21*390 x 0.15*844 = 81.9 x 126.6 px at the origin.
    stick.emit("touchstart", { changedTouches: [{ clientX: 41, clientY: 63 }] });
    stick.emit("touchmove", { changedTouches: [{ clientX: 80, clientY: 63 }] });
    tc.update();
    expect(actions.get("right")).toBe(true);
    expect(actions.get("left")).toBeUndefined();
    stick.emit("touchmove", { changedTouches: [{ clientX: 41, clientY: 25 }] });
    tc.update();
    expect(actions.get("right")).toBe(false);
    expect(actions.get("up")).toBe(true);
    stick.emit("touchend", {});
    tc.update();
    expect(actions.get("up")).toBe(false);
    tc.dispose();
  });

  it("mounts the second stick only when an rstick direction is bound", () => {
    const withR = setup("twin-stick", { "stick.left": "left", "rstick.right": "aimRight" });
    expect(withR.tc.evidence().sticks).toEqual(["stick", "rstick"]);
    const withoutR = setup("twin-stick", { "stick.left": "left" });
    expect(withoutR.tc.evidence().sticks).toEqual(["stick"]);
    expect(withoutR.control("rstick")).toBeUndefined();
  });

  it("renders no stick when no stick direction is bound, or the layout has none", () => {
    expect(setup("dpad-4btn", { light: "shoot" }).tc.evidence().sticks).toEqual([]);
    expect(setup("lane-swipe", { "stick.left": "left", jump: "jump" }).tc.evidence().sticks).toEqual([]);
    expect(setup("flippers", { "stick.left": "left" }).tc.evidence().sticks).toEqual([]);
  });
});

describe("mountTouchControls base layout", () => {
  it("injects one zero-specificity base sheet that positions the controls", () => {
    const doc = new FakeDoc() as FakeDoc & { head: FakeEl & { querySelector(s: string): unknown } };
    const head = new FakeEl("head") as FakeEl & { querySelector(s: string): unknown };
    head.querySelector = (sel: string) => head.children.find((c) => sel === "[data-a3g-touch-base]" && c.getAttribute("data-a3g-touch-base") !== null) ?? null;
    doc.head = head;
    const root = doc.createElement("div");
    doc.body.appendChild(root);
    const sink = { press: () => {}, release: () => {}, setAction: () => {} };
    mountTouchControls(sink, { preset: "dpad-4btn", bindings: FIGHT_BINDINGS, show: true }, { doc, root });
    mountTouchControls(sink, { preset: "dpad-4btn", bindings: FIGHT_BINDINGS, show: true }, { doc, root });
    expect(head.children.length).toBe(1);
    const css = String(head.children[0]!.textContent);
    expect(css).toContain(":where(.a3g-tc) { position: absolute;");
    expect(css).toContain(":where(.a3g-touch) { position: absolute; inset: 0;");
    expect(css).toContain(".a3g-touch.a3g-hidden { display: none; }");
  });

  it("labels buttons with their action and moves the stick nub with the drag", () => {
    const { tc, control } = setup("dpad-4btn", FIGHT_BINDINGS);
    expect(control("light")!.getAttribute("aria-label")).toBe("shoot");
    const stick = control("stick")!;
    const nub = stick.children[0]!;
    stick.emit("touchstart", { changedTouches: [{ clientX: 41, clientY: 63 }] });
    stick.emit("touchmove", { changedTouches: [{ clientX: 80, clientY: 63 }] });
    tc.update();
    const m = /translate\(calc\(-50% \+ (-?[\d.]+)%\), calc\(-50% \+ (-?[\d.]+)%\)\)/.exec(nub.style.transform!);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThan(20);
    expect(Math.abs(Number(m![2]))).toBeLessThan(1);
  });
});
