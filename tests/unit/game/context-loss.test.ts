import { describe, expect, it } from "vitest";
import { wireContextLoss } from "../../../packages/game/src/shell/contextLoss.js";
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
  private _classes = new Set<string>();
  constructor(tag: string, public doc: FakeDoc) { this.tagName = tag.toUpperCase(); }
  get classList() {
    const cs = this._classes;
    return {
      add: (...n: string[]) => n.forEach((c) => cs.add(c)),
      remove: (...n: string[]) => n.forEach((c) => cs.delete(c)),
      toggle: (n: string, force?: boolean) => { (force ?? !cs.has(n)) ? cs.add(n) : cs.delete(n); },
      contains: (n: string) => cs.has(n)
    };
  }
  appendChild(c: HudElement): void {
    const f = c as FakeEl;
    if (f.parent) f.parent.removeChild(f);
    f.parent = this;
    this.children.push(f);
    // seed classList from className
    (c as FakeEl).className.split(/\s+/).filter(Boolean).forEach((cls) => (c as FakeEl).classList.add(cls));
    this.className.split(/\s+/).filter(Boolean).forEach((cls) => this.classList.add(cls));
  }
  removeChild(c: HudElement): void {
    const i = this.children.indexOf(c as FakeEl);
    if (i >= 0) this.children.splice(i, 1);
  }
  remove(): void { this.parent?.removeChild(this); }
  setAttribute(n: string, v: string): void { this.attrs.set(n, v); }
  getAttribute(n: string): string | null { return this.attrs.get(n) ?? null; }
  addEventListener(t: string, cb: (ev: unknown) => void): void {
    (this.listeners.get(t) ?? this.listeners.set(t, new Set()).get(t)!).add(cb);
  }
  removeEventListener(t: string, cb: (ev: unknown) => void): void { this.listeners.get(t)?.delete(cb); }
  getBoundingClientRect(): HudRect { return this.rect; }
  emit(t: string, ev: unknown = {}): void { this.listeners.get(t)?.forEach((cb) => cb(ev)); }
  find(pred: (e: FakeEl) => boolean): FakeEl | null {
    if (pred(this)) return this;
    for (const c of this.children) { const r = c.find(pred); if (r) return r; }
    return null;
  }
}
class FakeDoc implements HudDocument {
  body = new FakeEl("body", this);
  createElement(tag: string): HudElement { return new FakeEl(tag, this); }
  createTextNode(text: string): HudElement { const e = new FakeEl("text", this); e.textContent = text; return e; }
}


describe("context-loss wiring (PRD-09 1763)", () => {
  function makeApp() {
    let lostCb: (() => void) | null = null;
    let restoredCb: (() => void) | null = null;
    const app = {
      onDeviceLost: (cb: () => void) => { lostCb = cb; return () => {}; },
      onDeviceRestored: (cb: () => void) => { restoredCb = cb; return () => {}; }
    };
    return { app, fireLost: () => lostCb!(), fireRestored: () => restoredCb!() };
  }

  it("fake app onDeviceLost pauses context-lost, hides HUD, shows Reload after 3s", () => {
    const doc = new FakeDoc();
    const mount = doc.createElement("div");
    const calls: string[] = [];
    const timers: { cb: () => void; ms: number }[] = [];
    const { app, fireLost, fireRestored } = makeApp();
    const ctl = wireContextLoss(app, doc, {
      mount: (el) => mount.appendChild(el as HudElement),
      pause: (r) => calls.push(`pause:${r}`),
      hideHud: () => calls.push("hideHud"),
      showHud: () => calls.push("showHud"),
      setTimer: (cb, ms) => { timers.push({ cb, ms }); return { cancel: () => {} }; }
    });
    fireLost();
    expect(ctl.lost).toBe(true);
    expect(calls).toEqual(["pause:context-lost", "hideHud"]);
    // ContextLost screen is mounted under .a3g-menus; reload shows after 3s.
    const screen = (mount as FakeEl).find((e) => typeof e.className === "string" && e.className.includes("a3g-context-lost"));
    expect(screen).toBeTruthy();
    timers.forEach((t) => t.cb());
    fireRestored();
    expect(ctl.lost).toBe(false);
    expect(calls).toContain("showHud");
    ctl.dispose();
  });

  it("stays paused after restore until the player resumes (no auto-resume)", () => {
    const doc = new FakeDoc();
    const calls: string[] = [];
    const { app, fireLost, fireRestored } = makeApp();
    wireContextLoss(app, doc, {
      mount: () => {},
      pause: (r) => calls.push(`pause:${r}`),
      hideHud: () => calls.push("hideHud"),
      showHud: () => calls.push("showHud"),
      setTimer: (cb) => ({ cancel: () => { void cb; } })
    });
    fireLost();
    fireRestored();
    // §6.2: restore only re-shows the HUD — no resume call exists on the sink.
    expect(calls).toEqual(["pause:context-lost", "hideHud", "showHud"]);
  });
});
