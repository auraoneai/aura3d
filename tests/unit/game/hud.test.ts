import { describe, expect, it } from "vitest";
import { mountHud } from "../../../packages/game/src/hud/HudKit.js";
import { screenFraction } from "../../../packages/game/src/hud/screenFraction.js";
import { HUD_THEMES } from "../../../packages/game/src/hud/themes.js";
import type {
  HudElement,
  HudDocument,
  HudRect,
  HudScheduler
} from "../../../packages/game/src/hud/dom.js";

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

  constructor(tag: string, public doc: FakeDoc) {
    this.tagName = tag.toUpperCase();
  }

  set classNameSet(v: string) {
    this._classes = new Set(v.split(/\s+/).filter(Boolean));
  }

  get classList() {
    const cs = this._classes;
    return {
      add: (...n: string[]) => n.forEach((c) => cs.add(c)),
      remove: (...n: string[]) => n.forEach((c) => cs.delete(c)),
      toggle: (n: string, force?: boolean) => {
        const on = force ?? !cs.has(n);
        if (on) cs.add(n); else cs.delete(n);
      },
      contains: (n: string) => cs.has(n)
    };
  }

  appendChild(c: HudElement): void {
    const f = c as FakeEl;
    if (f.parent) f.parent.removeChild(f);
    f.parent = this;
    this.children.push(f);
    // keep className <-> classList in sync for callers that only set one
    if (f.className) f.classNameSet = f.className;
    this.classNameSet = this.className;
  }

  removeChild(c: HudElement): void {
    const i = this.children.indexOf(c as FakeEl);
    if (i >= 0) this.children.splice(i, 1);
    (c as FakeEl).parent = null;
  }

  remove(): void {
    this.parent?.removeChild(this);
  }

  setAttribute(n: string, v: string): void { this.attrs.set(n, v); }
  getAttribute(n: string): string | null { return this.attrs.get(n) ?? null; }
  addEventListener(t: string, cb: (ev: unknown) => void): void {
    (this.listeners.get(t) ?? this.listeners.set(t, new Set()).get(t)!).add(cb);
  }
  removeEventListener(t: string, cb: (ev: unknown) => void): void { this.listeners.get(t)?.delete(cb); }
  getBoundingClientRect(): HudRect { return this.rect; }
}

class FakeDoc implements HudDocument {
  body = new FakeEl("body", this);
  createElement(tag: string): HudElement { return new FakeEl(tag, this); }
  createTextNode(text: string): HudElement {
    const e = new FakeEl("text", this);
    e.textContent = text;
    return e;
  }
}

/** Manual scheduler: each tick advances the flush loop once. */
function manualScheduler(now: () => number): { schedule: HudScheduler; pump: () => void } {
  let pending: (() => void) | null = null;
  const schedule: HudScheduler = (cb) => {
    pending = cb;
    return { cancel: () => { pending = null; } };
  };
  return { schedule, pump: () => { const cb = pending; pending = null; cb?.(); } };
}

function makeHud(opts?: Parameters<typeof mountHud>[1]) {
  const doc = new FakeDoc();
  const root = doc.createElement("div");
  let t = 0;
  const { schedule, pump } = manualScheduler(() => t);
  const warnings: string[] = [];
  const hud = mountHud(
    {
      root,
      doc,
      schedule,
      now: () => t,
      warn: (m) => warnings.push(m),
      devAssertions: false
    },
    opts ?? {
      theme: "arcade-neon",
      widgets: [
        { id: "score", kind: "score", anchor: "top-left", label: "SCORE" },
        { id: "hp", kind: "meter", anchor: "top", max: 100, ghost: true },
        { id: "obj", kind: "objective", anchor: "bottom-left" }
      ]
    }
  );
  return { doc, root, hud, pump, warnings, advance: (ms: number) => { t += ms; } };
}

describe("mountHud (PRD-09 1758/1759)", () => {
  it("mounts a 3x3 slot grid with one element per widget, themed", () => {
    const { root, hud } = makeHud();
    const hudEl = root.children[0] as FakeEl;
    expect(hudEl.className).toContain("a3g-hud");
    expect(hudEl.className).toContain("a3g-theme-arcade-neon");
    expect(hudEl.style["--a3g-accent"]).toBe(HUD_THEMES["arcade-neon"]["--a3g-accent"]);
    const slots = hudEl.children.filter((c) => c.dataset.anchor !== undefined);
    expect(slots.length).toBe(9);
    expect(hud.snapshot().widgetCount).toBe(3);
  });

  it("batches set() writes into the frame flush", () => {
    const { hud, pump } = makeHud();
    hud.set("score", 1500);
    const s0 = hud.snapshot();
    expect(s0.values.score).toBeUndefined();
    pump();
    expect(hud.snapshot().values.score).toBe(1500);
  });

  it("score rolls toward the target over rollMs", () => {
    const { hud, pump, advance } = makeHud({
      theme: "plain",
      widgets: [{ id: "s", kind: "score", anchor: "top", rollMs: 400 }]
    });
    hud.set("s", 100);
    pump(); // apply -> rolling
    advance(100); pump();
    advance(5000); pump();
    expect(hud.snapshot().values.s).toBe(100);
  });

  it("banner, toast, and damageNumber create overlay nodes that expire", () => {
    const { root, hud, pump, advance } = makeHud();
    const hudEl = root.children[0] as FakeEl;
    const banner = hudEl.children.find((c) => String(c.className).includes("a3g-banner"))!;
    hud.banner("ROUND 1", { holdMs: 500, style: "fight" });
    expect(banner.className).toContain("a3g-banner-fight");
    advance(600); pump();
    expect(banner.classList.contains("a3g-hidden")).toBe(true);
    hud.toast("checkpoint", { ms: 100 });
    hud.damageNumber(42, { x: 10, y: 20, z: 0 });
    advance(200); pump();
    advance(2000); pump();
    const dmg = hudEl.children.find((c) => String(c.className).includes("a3g-damage"))!;
    expect(dmg.children.length).toBe(0);
  });

  it("publishes the §17 screen fraction in snapshot()", () => {
    const { root, hud, pump } = makeHud();
    pump();
    const hudEl = root.children[0] as FakeEl;
    hudEl.rect = { left: 0, top: 0, width: 1280, height: 720 };
    const slot = hudEl.children.find((c) => c.dataset.anchor === "top-left")!;
    const w = slot.children[0] as FakeEl;
    w.rect = { left: 0, top: 0, width: 320, height: 108 }; // 1/24 of canvas
    const frac = hud.snapshot().screenFraction;
    expect(frac).toBeGreaterThan(0);
    expect(frac).toBeCloseTo((320 * 108) / (1280 * 720), 3);
  });

  it("dev-warns when the measured fraction exceeds maxScreenFraction", () => {
    const { root, hud, pump, warnings } = makeHud({
      theme: "motorsport",
      maxScreenFraction: 0.1,
      widgets: [{ id: "big", kind: "meter", anchor: "top", max: 10 }]
    });
    const hudEl = root.children[0] as FakeEl;
    hudEl.rect = { left: 0, top: 0, width: 390, height: 844 };
    const slot = hudEl.children.find((c) => c.dataset.anchor === "top")!;
    (slot.children[0] as FakeEl).rect = { left: 0, top: 0, width: 390, height: 169 };
    pump();
    expect(warnings.some((w) => w.includes("screen fraction"))).toBe(true);
  });

  it("setVisible hides the root and dispose removes it", () => {
    const { root, hud } = makeHud();
    hud.setVisible(false);
    expect(hud.snapshot().visible).toBe(false);
    hud.setVisible(true);
    hud.dispose();
    expect(root.children.length).toBe(0);
  });

  it("rejects duplicate widget ids", () => {
    const doc = new FakeDoc();
    const root = doc.createElement("div");
    expect(() =>
      mountHud(
        { root, doc, devAssertions: false },
        { widgets: [{ id: "x", kind: "score", anchor: "top" }, { id: "x", kind: "timer", anchor: "bottom", mode: "countdown" }] }
      )
    ).toThrow(/duplicate widget id/);
  });

  it("#1086: unknown widget kinds fail fast with a named error", () => {
    const doc = new FakeDoc();
    const root = doc.createElement("div");
    expect(() =>
      mountHud(
        { root, doc, devAssertions: false, schedule: () => ({ cancel: () => {} }) },
        { widgets: [{ id: "p1-hp", kind: "healthbar", anchor: "top-left" } as never] }
      )
    ).toThrow('a3g-hud: unsupported widget kind "healthbar" for "p1-hp"');
  });

  it("#1086: meter without max defaults to full scale 1; score renders strings verbatim", () => {
    const { root, hud, pump } = makeHud({
      widgets: [
        { id: "m", kind: "meter", anchor: "top" } as never,
        { id: "s", kind: "score", anchor: "top-left", rollMs: 0 }
      ]
    });
    hud.set("m", 0.25);
    hud.set("s", "PAR 3");
    pump();
    const hudEl = root.children[0] as FakeEl;
    const all: FakeEl[] = [];
    const walk = (n: FakeEl) => { all.push(n); n.children.forEach(walk); };
    walk(hudEl);
    const fill = all.find((n) => String(n.className).includes("a3g-meter-fill"))!;
    expect(fill.style.width).toBe("25.00%");
    const scoreValue = all.find((n) => n.parent?.dataset.widgetId === "s" && String(n.className).includes("a3g-w-value"))!;
    expect(scoreValue.textContent).toBe("PAR 3");
  });

  it("#1086: a rolling score repaints when a string gives way to its current number", () => {
    const { root, hud, pump } = makeHud({ widgets: [{ id: "s", kind: "score", anchor: "top", rollMs: 300 }] });
    hud.set("s", "READY");
    pump();
    hud.set("s", 0);
    pump();
    const hudEl = root.children[0] as FakeEl;
    const slot = hudEl.children.find((c) => c.dataset.anchor === "top")!;
    const value = (slot.children[0] as FakeEl).children.find((n) => String(n.className).includes("a3g-w-value"))!;
    expect(value.textContent).toBe("0");
  });

  it("applies mobileAnchor only while the mobile layout query matches", () => {
    const doc = new FakeDoc();
    const root = doc.createElement("div");
    const listeners = new Set<() => void>();
    const query = {
      matches: false,
      addEventListener: (_t: "change", cb: () => void) => { listeners.add(cb); },
      removeEventListener: (_t: "change", cb: () => void) => { listeners.delete(cb); }
    };
    const hud = mountHud(
      { root, doc, devAssertions: false, mobileQuery: query, schedule: () => ({ cancel: () => {} }) },
      {
        widgets: [
          { id: "combo", kind: "combo", anchor: "top-right", mobileAnchor: "bottom-right" },
          { id: "speed", kind: "speedometer", anchor: "bottom-right", mobileAnchor: "hidden" }
        ]
      }
    );
    const hudEl = root.children[0] as FakeEl;
    const slotIds = (anchor: string) =>
      hudEl.children.find((c) => c.dataset.anchor === anchor)!.children.map((c) => c.dataset.widgetId);
    // Desktop: both widgets sit in their desktop anchors; "hidden" is a CSS
    // class that only the mobile media query turns into display:none.
    expect(slotIds("top-right")).toEqual(["combo"]);
    expect(slotIds("bottom-right")).toEqual(["speed"]);
    const speed = hudEl.children.find((c) => c.dataset.anchor === "bottom-right")!.children[0] as FakeEl;
    expect(speed.classList.contains("a3g-mobile-hidden")).toBe(true);

    query.matches = true;
    listeners.forEach((cb) => cb());
    expect(slotIds("top-right")).toEqual([]);
    expect(slotIds("bottom-right")).toEqual(["speed", "combo"]);

    query.matches = false;
    listeners.forEach((cb) => cb());
    expect(slotIds("top-right")).toEqual(["combo"]);

    hud.dispose();
    expect(listeners.size).toBe(0);
  });
});

describe("screenFraction", () => {
  const canvas = { left: 0, top: 0, width: 1280, height: 720 };
  it("is 0 for empty and off-canvas rects", () => {
    expect(screenFraction([], canvas)).toBe(0);
    expect(screenFraction([{ left: 2000, top: 0, width: 100, height: 100 }], canvas)).toBe(0);
  });
  it("clips rects to the canvas", () => {
    const r = { left: 1180, top: 0, width: 200, height: 100 }; // half clipped
    expect(screenFraction([r], canvas)).toBeCloseTo((100 * 100) / (1280 * 720), 5);
  });
  it("does not double-count overlapping rects", () => {
    const a = { left: 0, top: 0, width: 100, height: 100 };
    const b = { left: 50, top: 0, width: 100, height: 100 };
    expect(screenFraction([a, b], canvas)).toBeCloseTo((100 * 100 + 50 * 100) / (1280 * 720), 5);
  });
});
