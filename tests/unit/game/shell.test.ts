import { describe, expect, it } from "vitest";
import { createGameShell } from "../../../packages/game/src/shell/GameShell.js";
import { runTransition } from "../../../packages/game/src/shell/transition.js";
import { wireContextLoss } from "../../../packages/game/src/shell/contextLoss.js";
import { createMenu } from "../../../packages/game/src/shell/screens/menu.js";
import { mountTouchControls } from "../../../packages/game/src/touch/TouchControls.js";
import type { HudDocument, HudElement, HudRect } from "../../../packages/game/src/hud/dom.js";

// ---- fake DOM (shared shape with hud.test.ts) ------------------------------
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

const key = (k: string) => ({ key: k, preventDefault() {}, stopPropagation() {} });

function makeShell(overrides: Partial<Parameters<typeof createGameShell>[0]> = {}) {
  const doc = new FakeDoc();
  const root = doc.createElement("div");
  const timers: { cb: () => void; ms: number }[] = [];
  const setTimer = (cb: () => void, ms: number) => {
    timers.push({ cb, ms });
    return { cancel: () => {} };
  };
  const started: string[] = [];
  const shell = createGameShell({
    doc,
    root,
    gameId: "test-game",
    title: "Test Game",
    onStart: () => { started.push("start"); },
    options: { results: { fields: [{ id: "score", label: "Score" }], actions: ["retry", "title"] } },
    setTimer,
    ...overrides
  });
  return { doc, root: root as FakeEl, shell, timers, started, flushTimers: () => { const t = [...timers]; timers.length = 0; t.forEach((x) => x.cb()); } };
}

describe("GameShell (PRD-09 1761/1762/1763)", () => {
  it("runs booting → loading → title → playing with tracked progress", async () => {
    const { shell, root, flushTimers, started } = makeShell();
    expect(root.dataset.state).toBeUndefined();
    shell.beginLoading();
    expect(shell.state).toBe("loading");
    let resolve!: () => void;
    shell.track(new Promise<void>((r) => { resolve = r; }), 1);
    const finished = shell.finishLoading();
    flushTimers(); // minMs timer
    resolve();
    await finished;
    expect(shell.state).toBe("title");
    expect(root.dataset.state).toBe("title");
    // Title gesture doubles as the audio-unlock + start (§6.2/§6.3).
    shell.keydown(key("Enter"));
    expect(started).toEqual(["start"]);
    expect(shell.state).toBe("playing");
    expect(root.dataset.state).toBe("playing");
  });

  it("Escape opens pause while playing; pause resume closes back to playing", async () => {
    const { shell, flushTimers } = makeShell();
    shell.beginLoading();
    const done = shell.finishLoading();
    flushTimers(); // fire the minMs timer registered inside finishLoading
    await done;
    shell.keydown(key("Enter"));
    expect(shell.state).toBe("playing");
    expect(shell.keydown(key("Escape"))).toBe(true);
    expect(shell.state).toBe("paused");
    shell.closeMenus();
    expect(shell.state).toBe("playing");
  });

  it("menus: arrows move focus, Escape closes", () => {
    const doc = new FakeDoc();
    const menu = createMenu(doc, {
      id: "pause",
      title: "Paused",
      items: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
        { id: "c", label: "C" }
      ]
    });
    let closed = false;
    menu.onClose = () => { closed = true; };
    menu.show();
    expect(menu.focusIndex()).toBe(0);
    menu.keydown(key("ArrowDown"));
    expect(menu.focusIndex()).toBe(1);
    menu.keydown(key("ArrowUp"));
    expect(menu.focusIndex()).toBe(0);
    menu.keydown(key("End"));
    expect(menu.focusIndex()).toBe(2);
    menu.keydown(key("ArrowDown")); // wraps
    expect(menu.focusIndex()).toBe(0);
    expect(menu.keydown(key("Escape"))).toBe(true);
    expect(closed).toBe(true);
  });

  it("aria-modal + role=dialog on menus", () => {
    const doc = new FakeDoc();
    const menu = createMenu(doc, { id: "pause", title: "Paused", items: [{ id: "x", label: "X" }] });
    expect(menu.el.getAttribute("role")).toBe("dialog");
    expect(menu.el.getAttribute("aria-modal")).toBe("true");
    menu.dispose();
  });

  it("transition keeps the overlay opaque until the first presented frame", async () => {
    const log: string[] = [];
    let presentOpacity = -1;
    let opacity = 0;
    const driver = {
      setOverlay(o: number) { opacity = o; log.push(`opacity=${o}`); },
      firstPresentedFrame: () => {
        presentOpacity = opacity; // frame is presented while overlay is opaque
        log.push(`present@${opacity}`);
        return Promise.resolve();
      },
      sleep: () => Promise.resolve()
    };
    await runTransition(driver, () => { log.push("run"); return 7; });
    expect(presentOpacity).toBe(1);
    expect(log).toEqual(["opacity=1", "run", "present@1", "opacity=0"]);
  });

  it("context-loss wiring pauses, hides HUD, restores to paused with Reload after 3s", () => {
    const doc = new FakeDoc();
    const mount = doc.createElement("div");
    const calls: string[] = [];
    let lostCb: (() => void) | null = null;
    let restoredCb: (() => void) | null = null;
    const timers: { cb: () => void; ms: number }[] = [];
    const app = {
      onDeviceLost: (cb: () => void) => { lostCb = cb; return () => {}; },
      onDeviceRestored: (cb: () => void) => { restoredCb = cb; return () => {}; }
    };
    const ctl = wireContextLoss(app, doc, {
      mount: (el) => mount.appendChild(el as HudElement),
      pause: (r) => calls.push(`pause:${r}`),
      hideHud: () => calls.push("hideHud"),
      showHud: () => calls.push("showHud"),
      setTimer: (cb, ms) => { timers.push({ cb, ms }); return { cancel: () => {} }; }
    });
    lostCb!();
    expect(ctl.lost).toBe(true);
    expect(calls).toEqual(["pause:context-lost", "hideHud"]);
    // reload button appears after 3s
    timers.forEach((t) => t.cb());
    restoredCb!();
    expect(ctl.lost).toBe(false);
    expect(calls).toContain("showHud");
    ctl.dispose();
  });
});

describe("mountTouchControls (PRD-09 1766)", () => {
  function makeInput() {
    const actions = new Map<string, boolean>();
    return {
      actions,
      press: (b: string) => actions.set(b, true),
      release: (b: string) => actions.set(b, false),
      setAction: (a: string, held: boolean) => actions.set(a, held)
    };
  }

  it("renders bound controls and writes actions on touch", () => {
    const doc = new FakeDoc();
    const root = doc.createElement("div");
    doc.body.appendChild(root);
    const input = makeInput();
    const tc = mountTouchControls(
      input,
      { preset: "dpad-4btn", bindings: { light: "punch-light", heavy: "punch-heavy" }, show: true },
      { doc, root, viewport: { width: 390, height: 844 } }
    );
    expect(tc.visible).toBe(true);
    const ev = tc.evidence();
    expect(ev.genre).toBe("fight");
    expect(ev.bound).toContain("light");
    expect(ev.bound).toContain("heavy");
    const host = root.children.find((c) => String(c.className).includes("a3g-touch")) as FakeEl;
    const btn = host.children.find((c) => c.dataset.control === "light") as FakeEl;
    btn.emit("touchstart");
    expect(input.actions.get("punch-light")).toBe(true);
    btn.emit("touchend");
    expect(input.actions.get("punch-light")).toBe(false);
    tc.dispose();
    expect(root.children.length).toBe(0);
  });

  it("hidden by default with a fine pointer; first touchstart reveals", () => {
    const doc = new FakeDoc();
    const root = doc.createElement("div");
    doc.body.appendChild(root);
    const tc = mountTouchControls(
      makeInput(),
      { preset: "steer-pedals", bindings: { throttle: "throttle" } },
      { doc, root, viewport: { width: 1280, height: 720 }, coarsePointer: () => false }
    );
    expect(tc.visible).toBe(false);
    doc.body.emit("touchstart");
    expect(tc.visible).toBe(true);
  });

  it("shows at mount when (pointer: coarse)", () => {
    const doc = new FakeDoc();
    const root = doc.createElement("div");
    doc.body.appendChild(root);
    const tc = mountTouchControls(
      makeInput(),
      { preset: "aim-drag", bindings: {} },
      { doc, root, coarsePointer: () => true }
    );
    expect(tc.visible).toBe(true);
  });
});
